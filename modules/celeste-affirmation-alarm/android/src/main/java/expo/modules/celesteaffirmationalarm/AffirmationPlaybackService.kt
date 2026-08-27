package expo.modules.celesteaffirmationalarm

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.speech.tts.TextToSpeech
import androidx.core.app.NotificationCompat
import java.io.File
import java.util.Locale

class AffirmationPlaybackService : Service(), TextToSpeech.OnInitListener {
  private var player: MediaPlayer? = null
  private var textToSpeech: TextToSpeech? = null
  private var pendingAffirmation: String? = null
  private var pendingLocale: String? = null
  private var deleteAudioAfter: String? = null
  private val timeoutHandler = Handler(Looper.getMainLooper())
  private val stopAfterMaximumDuration = Runnable { stopPlayback() }
  private var playbackWakeLock: PowerManager.WakeLock? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopPlayback()
      return START_NOT_STICKY
    }
    if (intent?.action != ACTION_PLAY) return START_NOT_STICKY

    stopPlayback(keepService = true)
    val title = intent.getStringExtra(EXTRA_TITLE).orEmpty().ifBlank { "Celeste" }
    val stopLabel = intent.getStringExtra(EXTRA_STOP_LABEL).orEmpty().ifBlank { "Parar" }
    val locale = intent.getStringExtra(EXTRA_LOCALE).orEmpty()
    startForeground(NOTIFICATION_ID, buildNotification(title, locale, stopLabel))
    acquirePlaybackWakeLock()
    timeoutHandler.removeCallbacks(stopAfterMaximumDuration)
    timeoutHandler.postDelayed(stopAfterMaximumDuration, MAX_PLAYBACK_MILLIS)

    val audioPath = intent.getStringExtra(EXTRA_AUDIO_PATH)
    deleteAudioAfter = audioPath?.takeIf { intent.getBooleanExtra(EXTRA_DELETE_AUDIO_AFTER, false) }
    if (!audioPath.isNullOrBlank() && File(audioPath).isFile) {
      playWav(audioPath)
    } else {
      pendingAffirmation = intent.getStringExtra(EXTRA_AFFIRMATION)
      pendingLocale = intent.getStringExtra(EXTRA_LOCALE)
      textToSpeech = TextToSpeech(this, this)
    }
    return START_NOT_STICKY
  }

  override fun onInit(status: Int) {
    val tts = textToSpeech ?: return
    val phrase = pendingAffirmation.orEmpty()
    if (status != TextToSpeech.SUCCESS || phrase.isBlank()) {
      stopPlayback()
      return
    }
    pendingLocale?.takeIf { it.isNotBlank() }?.let { tts.language = Locale.forLanguageTag(it) }
    tts.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
      override fun onStart(utteranceId: String) = Unit
      override fun onDone(utteranceId: String) = stopPlayback()
      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String) = stopPlayback()
    })
    tts.speak(phrase, TextToSpeech.QUEUE_FLUSH, null, "celeste-affirmation")
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    stopPlayback(keepService = true)
    super.onDestroy()
  }

  private fun playWav(path: String) {
    try {
      player = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        setDataSource(path)
        setOnCompletionListener { stopPlayback() }
        setOnErrorListener { _, _, _ -> stopPlayback(); true }
        prepare()
        start()
      }
    } catch (_: Exception) {
      stopPlayback()
    }
  }

  private fun buildNotification(title: String, locale: String, stopLabel: String): android.app.Notification {
    createChannel()
    val stopIntent = PendingIntent.getService(
      this,
      0,
      Intent(this, AffirmationPlaybackService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(title)
      .setContentText(
        if (locale.startsWith("en", ignoreCase = true))
          getString(R.string.celeste_alarm_playing_en)
        else
          getString(R.string.celeste_alarm_playing)
      )
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .addAction(0, stopLabel, stopIntent)
      .build()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      getString(R.string.celeste_alarm_channel_name),
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      setSound(null, null)
      description = getString(R.string.celeste_alarm_channel_description)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  private fun stopPlayback(keepService: Boolean = false) {
    timeoutHandler.removeCallbacks(stopAfterMaximumDuration)
    player?.run {
      setOnCompletionListener(null)
      setOnErrorListener(null)
      if (isPlaying) stop()
      release()
    }
    player = null
    textToSpeech?.run { stop(); shutdown() }
    textToSpeech = null
    pendingAffirmation = null
    pendingLocale = null
    deleteAudioAfter?.let { File(it).delete() }
    deleteAudioAfter = null
    playbackWakeLock?.takeIf { it.isHeld }?.release()
    playbackWakeLock = null
    if (!keepService) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        stopForeground(STOP_FOREGROUND_REMOVE)
      } else {
        @Suppress("DEPRECATION")
        stopForeground(true)
      }
      stopSelf()
    }
  }

  private fun acquirePlaybackWakeLock() {
    val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
    playbackWakeLock = powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "$packageName:celeste-affirmation-playback"
    ).apply {
      setReferenceCounted(false)
      acquire(MAX_PLAYBACK_MILLIS + 5_000L)
    }
  }

  companion object {
    const val ACTION_PLAY = "expo.modules.celesteaffirmationalarm.PLAY"
    const val ACTION_STOP = "expo.modules.celesteaffirmationalarm.STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_AFFIRMATION = "affirmation"
    const val EXTRA_LOCALE = "locale"
    const val EXTRA_STOP_LABEL = "stopLabel"
    const val EXTRA_AUDIO_PATH = "audioPath"
    const val EXTRA_DELETE_AUDIO_AFTER = "deleteAudioAfter"
    private const val CHANNEL_ID = "celeste_affirmation_alarm"
    private const val NOTIFICATION_ID = 48319
    private const val MAX_PLAYBACK_MILLIS = 35_000L
  }
}
