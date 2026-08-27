package expo.modules.celesteaffirmationalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class AffirmationAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_FIRE) return
    val alarmId = intent.getStringExtra(EXTRA_ALARM_ID) ?: return
    val token = intent.getStringExtra(EXTRA_TOKEN) ?: return
    val record = AffirmationAlarmStore(context).get(alarmId) ?: return

    // PendingIntent identity includes this token. It prevents an obsolete alarm
    // from playing after the user replaces the phrase or weekday selection.
    if (record.token != token) return

    val scheduler = AffirmationAlarmScheduler(context)
    if (record.oneShot) {
      AffirmationAlarmStore(context).remove(record.alarmId)
    } else {
      scheduler.rescheduleAfterDelivery(record)
    }

    val service = Intent(context, AffirmationPlaybackService::class.java)
      .setAction(AffirmationPlaybackService.ACTION_PLAY)
      .putExtra(AffirmationPlaybackService.EXTRA_TITLE, record.title)
      .putExtra(AffirmationPlaybackService.EXTRA_AFFIRMATION, record.affirmation)
      .putExtra(AffirmationPlaybackService.EXTRA_LOCALE, record.locale)
      .putExtra(AffirmationPlaybackService.EXTRA_STOP_LABEL, record.stopLabel)
      .putExtra(AffirmationPlaybackService.EXTRA_AUDIO_PATH, record.audioPath)
      .putExtra(AffirmationPlaybackService.EXTRA_DELETE_AUDIO_AFTER, record.oneShot)
    try {
      ContextCompat.startForegroundService(context, service)
    } catch (_: IllegalStateException) {
      // Android may reject a foreground-service start after the person revokes
      // notifications or exact-alarm access. The recurring record remains so the
      // app can report that state on its next capability check.
    }
  }

  companion object {
    const val ACTION_FIRE = "expo.modules.celesteaffirmationalarm.FIRE"
    const val EXTRA_ALARM_ID = "alarmId"
    const val EXTRA_TOKEN = "token"
  }
}
