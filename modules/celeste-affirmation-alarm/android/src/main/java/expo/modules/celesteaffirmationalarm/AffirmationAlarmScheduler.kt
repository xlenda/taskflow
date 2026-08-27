package expo.modules.celesteaffirmationalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Base64
import java.io.File
import java.io.FileOutputStream
import java.util.Calendar
import java.util.UUID

class AffirmationAlarmScheduler(private val context: Context) {
  private val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
  private val store = AffirmationAlarmStore(context)

  fun schedule(draft: AlarmDraft): Map<String, Any> {
    if (!CelesteAffirmationAlarmModule.canScheduleExactAlarms(context)) {
      return failure("schedule", draft.alarmId, "exact_alarm_permission_required")
    }
    if (!CelesteAffirmationAlarmModule.notificationsAllowed(context)) {
      return failure("schedule", draft.alarmId, "notification_permission_required")
    }
    if (!validRecurringDraft(draft)) return failure("schedule", draft.alarmId, "invalid_schedule")
    return install(draft, oneShot = false, triggerAtMillis = nextOccurrence(draft.hour, draft.minute, draft.weekdays))
  }

  fun scheduleTest(draft: AlarmDraft): Map<String, Any> {
    if (!CelesteAffirmationAlarmModule.canScheduleExactAlarms(context)) {
      return failure("test", draft.alarmId, "exact_alarm_permission_required")
    }
    if (!CelesteAffirmationAlarmModule.notificationsAllowed(context)) {
      return failure("test", draft.alarmId, "notification_permission_required")
    }
    val delaySeconds = draft.delaySeconds ?: 0
    if (!validContent(draft) || delaySeconds !in 10..300) return failure("test", draft.alarmId, "invalid_test")
    return install(draft, oneShot = true, triggerAtMillis = System.currentTimeMillis() + delaySeconds * 1_000L)
  }

  fun cancel(alarmId: String): Map<String, Any> {
    val previous = store.get(alarmId)
    if (previous != null) {
      cancelSystemAlarm(previous)
      if (!store.remove(alarmId)) return failure("cancel", alarmId, "storage_update_failed")
      deleteSound(previous.audioPath)
    }
    return mapOf("ok" to true, "operation" to "cancel", "alarmId" to alarmId)
  }

  fun rescheduleAfterDelivery(record: AlarmRecord): Boolean {
    if (record.oneShot || !CelesteAffirmationAlarmModule.canScheduleExactAlarms(context)) return false
    return try {
      setExact(record, nextOccurrence(record.hour, record.minute, record.weekdays))
      true
    } catch (_: SecurityException) {
      false
    }
  }

  fun restoreAll() {
    if (!CelesteAffirmationAlarmModule.canScheduleExactAlarms(context) || !CelesteAffirmationAlarmModule.notificationsAllowed(context)) return
    store.all().filterNot { it.oneShot }.forEach { record ->
      try {
        setExact(record, nextOccurrence(record.hour, record.minute, record.weekdays))
      } catch (_: SecurityException) {
        // The user can revoke special access at any time. Keep the record so a
        // later in-app capability check can explain what must be re-enabled.
      }
    }
  }

  private fun install(draft: AlarmDraft, oneShot: Boolean, triggerAtMillis: Long): Map<String, Any> {
    val previous = store.get(draft.alarmId)
    val token = UUID.randomUUID().toString()
    val installedSound = try {
      draft.audioBase64Wav?.let { installWav(draft.alarmId, token, it) }
    } catch (error: WavValidationException) {
      return failure("schedule", draft.alarmId, error.reason)
    } catch (_: Exception) {
      return failure("schedule", draft.alarmId, "sound_render_failed")
    }
    val record = AlarmRecord(
      alarmId = draft.alarmId,
      token = token,
      hour = draft.hour,
      minute = draft.minute,
      weekdays = draft.weekdays.distinct().sorted(),
      title = draft.title,
      affirmation = draft.affirmation,
      locale = draft.locale,
      stopLabel = draft.stopLabel,
      audioPath = installedSound?.absolutePath,
      oneShot = oneShot
    )

    try {
      setExact(record, triggerAtMillis)
    } catch (_: SecurityException) {
      deleteSound(record.audioPath)
      return failure(if (oneShot) "test" else "schedule", draft.alarmId, "exact_alarm_permission_required")
    } catch (_: Exception) {
      deleteSound(record.audioPath)
      return failure(if (oneShot) "test" else "schedule", draft.alarmId, "alarm_schedule_failed")
    }

    // Persist before retiring the old alarm. A receiver also validates the token,
    // so an old PendingIntent cannot play the newly selected affirmation.
    if (!store.put(record)) {
      cancelSystemAlarm(record)
      deleteSound(record.audioPath)
      return failure(if (oneShot) "test" else "schedule", draft.alarmId, "storage_update_failed")
    }
    previous?.let {
      cancelSystemAlarm(it)
      deleteSound(it.audioPath)
    }
    return linkedMapOf<String, Any>(
      "ok" to true,
      "operation" to if (oneShot) "test" else "schedule",
      "alarmId" to draft.alarmId,
      "scheduledFor" to triggerAtMillis.toString(),
      "soundSource" to if (record.audioPath != null) "neural_wav" else "local_speech"
    ).apply {
      if (record.audioPath != null) put("soundFileName", File(record.audioPath).name)
    }
  }

  private fun setExact(record: AlarmRecord, triggerAtMillis: Long) {
    val showIntent = PendingIntent.getActivity(
      context,
      record.token.hashCode(),
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
      } ?: Intent(),
      PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag()
    )
    alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAtMillis, showIntent), pendingIntent(record))
  }

  private fun pendingIntent(record: AlarmRecord): PendingIntent {
    val intent = Intent(context, AffirmationAlarmReceiver::class.java)
      .setAction(AffirmationAlarmReceiver.ACTION_FIRE)
      .setData(Uri.parse("celeste://affirmation-alarm/${record.alarmId}/${record.token}"))
      .putExtra(AffirmationAlarmReceiver.EXTRA_ALARM_ID, record.alarmId)
      .putExtra(AffirmationAlarmReceiver.EXTRA_TOKEN, record.token)
    return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or immutableFlag())
  }

  private fun cancelSystemAlarm(record: AlarmRecord) {
    alarmManager.cancel(pendingIntent(record))
  }

  private fun nextOccurrence(hour: Int, minute: Int, weekdays: List<Int>): Long {
    val now = Calendar.getInstance()
    return (0..7).firstNotNullOfOrNull { offset ->
      val candidate = now.clone() as Calendar
      candidate.add(Calendar.DAY_OF_YEAR, offset)
      candidate.set(Calendar.HOUR_OF_DAY, hour)
      candidate.set(Calendar.MINUTE, minute)
      candidate.set(Calendar.SECOND, 0)
      candidate.set(Calendar.MILLISECOND, 0)
      val isoDay = if (candidate.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY) 7 else candidate.get(Calendar.DAY_OF_WEEK) - 1
      candidate.takeIf { isoDay in weekdays && it.timeInMillis > now.timeInMillis }?.timeInMillis
    } ?: throw IllegalArgumentException("No weekday occurrence")
  }

  private fun validRecurringDraft(draft: AlarmDraft): Boolean =
    validContent(draft) && draft.hour in 0..23 && draft.minute in 0..59 &&
      draft.weekdays.isNotEmpty() && draft.weekdays.all { it in 1..7 }

  private fun validContent(draft: AlarmDraft): Boolean =
    draft.alarmId.matches(UUID_PATTERN) && draft.affirmation.isNotBlank() && draft.affirmation.length <= 800 &&
      draft.title.isNotBlank() && draft.title.length <= 120

  private fun installWav(alarmId: String, token: String, base64: String): File {
    val bytes = WavValidator.decodeAndValidate(base64)
    val directory = File(context.filesDir, "affirmation-alarms")
    if (!directory.exists() && !directory.mkdirs()) throw IllegalStateException("Cannot create private sound directory")
    val destination = File(directory, "celeste-affirmation-$alarmId-$token.wav")
    val temporary = File(directory, "${destination.name}.tmp")
    try {
      FileOutputStream(temporary).use { it.write(bytes); it.fd.sync() }
      if (destination.exists() && !destination.delete()) throw IllegalStateException("Cannot replace private sound")
      if (!temporary.renameTo(destination)) throw IllegalStateException("Cannot install private sound")
      return destination
    } finally {
      if (temporary.exists()) temporary.delete()
    }
  }

  private fun deleteSound(path: String?) {
    path?.let { File(it).takeIf { file -> file.parentFile == File(context.filesDir, "affirmation-alarms") }?.delete() }
  }

  private fun failure(operation: String, alarmId: String, reason: String): Map<String, Any> = mapOf(
    "ok" to false,
    "operation" to operation,
    "alarmId" to alarmId,
    "reason" to reason,
    "scheduledAlarmIds" to store.alarmIds()
  )

  private fun immutableFlag(): Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0

  companion object {
    private val UUID_PATTERN = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
  }
}

private class WavValidationException(val reason: String) : Exception(reason)

private object WavValidator {
  private const val MAX_ENCODED_CHARACTERS = 2_000_000
  private const val MAX_DECODED_BYTES = 1_500_000
  private const val MAX_DURATION_SECONDS = 29.0
  private val BASE64 = Regex("^[A-Za-z0-9+/]*={0,2}$")

  fun decodeAndValidate(base64: String): ByteArray {
    if (base64.isEmpty() || base64.length > MAX_ENCODED_CHARACTERS || base64.length % 4 != 0 || !BASE64.matches(base64)) {
      throw WavValidationException("invalid_neural_wav")
    }
    val bytes = try { Base64.decode(base64, Base64.DEFAULT) } catch (_: IllegalArgumentException) {
      throw WavValidationException("invalid_neural_wav")
    }
    if (bytes.size > MAX_DECODED_BYTES) throw WavValidationException("neural_wav_too_large")
    if (bytes.size < 44 || ascii(bytes, 0) != "RIFF" || ascii(bytes, 8) != "WAVE") {
      throw WavValidationException("invalid_neural_wav")
    }
    validatePcm16(bytes)
    return bytes
  }

  private fun validatePcm16(bytes: ByteArray) {
    val riffEnd = uint32(bytes, 4) + 8
    if (riffEnd !in 44..bytes.size) throw WavValidationException("invalid_neural_wav")
    var offset = 12
    var channels = 0
    var byteRate = 0
    var blockAlign = 0
    var dataLength = -1
    while (offset + 8 <= riffEnd) {
      val size = uint32(bytes, offset + 4)
      val start = offset + 8
      if (size < 0 || size > riffEnd - start) throw WavValidationException("invalid_neural_wav")
      when (ascii(bytes, offset)) {
        "fmt " -> {
          if (size < 16 || channels != 0 || uint16(bytes, start) != 1 || uint16(bytes, start + 14) != 16) {
            throw WavValidationException("invalid_neural_wav")
          }
          channels = uint16(bytes, start + 2)
          val sampleRate = uint32(bytes, start + 4)
          byteRate = uint32(bytes, start + 8)
          blockAlign = uint16(bytes, start + 12)
          if (channels !in 1..2 || sampleRate !in 8_000..48_000 || blockAlign != channels * 2 || byteRate != sampleRate * blockAlign) {
            throw WavValidationException("invalid_neural_wav")
          }
        }
        "data" -> if (dataLength >= 0) throw WavValidationException("invalid_neural_wav") else dataLength = size
      }
      offset = start + size + (size and 1)
    }
    if (offset != riffEnd || channels == 0 || dataLength <= 0 || dataLength % blockAlign != 0) {
      throw WavValidationException("invalid_neural_wav")
    }
    if (dataLength.toDouble() / byteRate > MAX_DURATION_SECONDS) throw WavValidationException("affirmation_audio_too_long")
  }

  private fun ascii(bytes: ByteArray, offset: Int): String = String(bytes, offset, 4, Charsets.US_ASCII)
  private fun uint16(bytes: ByteArray, offset: Int): Int = (bytes[offset].toInt() and 0xff) or ((bytes[offset + 1].toInt() and 0xff) shl 8)
  private fun uint32(bytes: ByteArray, offset: Int): Int = uint16(bytes, offset) or (uint16(bytes, offset + 2) shl 16)
}
