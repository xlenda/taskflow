package expo.modules.celesteaffirmationalarm

import android.Manifest
import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CelesteAffirmationAlarmModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is unavailable" }

  private val permissions: Permissions
    get() = requireNotNull(appContext.permissions) { "Permissions service is unavailable" }

  override fun definition() = ModuleDefinition {
    Name("CelesteAffirmationAlarm")

    AsyncFunction("getCapability") { promise: Promise ->
      resolveCapability(promise)
    }

    AsyncFunction("requestAuthorization") { promise: Promise ->
      requestAuthorization(promise)
    }

    AsyncFunction("schedule") { payload: AndroidAffirmationSchedulePayload ->
      val scheduler = AffirmationAlarmScheduler(context)
      scheduler.schedule(payload.toRecord())
    }

    AsyncFunction("cancel") { payload: AndroidAffirmationCancelPayload ->
      AffirmationAlarmScheduler(context).cancel(payload.alarmId)
    }

    AsyncFunction("test") { payload: AndroidAffirmationTestPayload ->
      AffirmationAlarmScheduler(context).scheduleTest(payload.toRecord())
    }
  }

  private fun resolveCapability(promise: Promise) {
    if (!isSupported()) {
      promise.resolve(unsupportedCapability())
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      promise.resolve(capability(context))
      return
    }
    permissions.getPermissions(
      { responses: Map<String, PermissionsResponse> ->
        promise.resolve(capability(context, responses[Manifest.permission.POST_NOTIFICATIONS]))
      },
      Manifest.permission.POST_NOTIFICATIONS
    )
  }

  private fun requestAuthorization(promise: Promise) {
    if (!isSupported()) {
      promise.resolve(unsupportedCapability())
      return
    }

    // POST_NOTIFICATIONS has a normal runtime prompt. Exact-alarm access is a
    // special App access page; Android does not give an app a grant callback.
    if (needsNotificationPermission(context)) {
      permissions.askForPermissions(
        { responses: Map<String, PermissionsResponse> ->
          val notificationPermission = responses[Manifest.permission.POST_NOTIFICATIONS]
          if (notificationPermission?.status == PermissionsStatus.GRANTED) {
            openExactAlarmSettingsIfNeeded()
          }
          promise.resolve(capability(context, notificationPermission))
        },
        Manifest.permission.POST_NOTIFICATIONS
      )
    } else {
      openExactAlarmSettingsIfNeeded()
      resolveCapability(promise)
    }
  }

  private fun openExactAlarmSettingsIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || canScheduleExactAlarms(context)) return
    val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
      .setData(Uri.parse("package:${context.packageName}"))
    val activity = appContext.currentActivity
    if (activity != null) {
      activity.startActivity(intent)
    } else {
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  companion object {
    private const val API_VERSION = "3"

    fun isSupported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M

    fun capability(
      context: Context,
      notificationPermission: PermissionsResponse? = null
    ): Map<String, Any> {
      if (!isSupported()) return unsupportedCapability()
      val notificationAllowed = notificationsAllowed(context)
      val exactAllowed = canScheduleExactAlarms(context)
      val notificationNeedsSettings = !notificationAllowed && (
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
          notificationPermission?.status == PermissionsStatus.GRANTED ||
          (notificationPermission?.status == PermissionsStatus.DENIED &&
            notificationPermission.canAskAgain == false)
        )
      val authorization = when {
        notificationAllowed && exactAllowed -> "authorized"
        notificationNeedsSettings -> "denied"
        else -> "not_determined"
      }
      val reason = when {
        notificationNeedsSettings -> "authorization_denied"
        !notificationAllowed -> "notification_permission_required"
        !exactAllowed -> "exact_alarm_permission_required"
        else -> null
      }
      return linkedMapOf<String, Any>(
        "supported" to true,
        "authorization" to authorization,
        "apiVersion" to API_VERSION,
        "scheduledAlarmIds" to AffirmationAlarmStore(context).alarmIds()
      ).apply {
        if (reason != null) put("reason", reason)
      }
    }

    fun unsupportedCapability(): Map<String, Any> = mapOf(
      "supported" to false,
      "authorization" to "unavailable",
      "apiVersion" to API_VERSION,
      "reason" to "android_version_unsupported"
    )

    fun canScheduleExactAlarms(context: Context): Boolean {
      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarmManager.canScheduleExactAlarms()
    }

    fun notificationsAllowed(context: Context): Boolean {
      if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
      return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }

    private fun needsNotificationPermission(context: Context): Boolean =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
  }
}
