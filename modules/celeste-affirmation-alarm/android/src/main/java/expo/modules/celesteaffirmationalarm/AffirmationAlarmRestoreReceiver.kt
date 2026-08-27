package expo.modules.celesteaffirmationalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restores only alarms the user previously chose, after reboot, update, or clock changes. */
class AffirmationAlarmRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action !in RESTORE_ACTIONS) return
    val pendingResult = goAsync()
    Thread {
      try {
        AffirmationAlarmScheduler(context.applicationContext).restoreAll()
      } finally {
        pendingResult.finish()
      }
    }.start()
  }

  companion object {
    private val RESTORE_ACTIONS = setOf(
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_TIME_CHANGED
    )
  }
}
