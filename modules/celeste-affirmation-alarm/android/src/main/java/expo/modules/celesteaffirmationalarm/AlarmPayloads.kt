package expo.modules.celesteaffirmationalarm

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class AndroidAffirmationSchedulePayload : Record {
  @Field var alarmId: String = ""
  @Field var time: String = ""
  @Field var hour: Int = -1
  @Field var minute: Int = -1
  @Field var weekdays: List<Int> = emptyList()
  @Field var title: String = "Celeste"
  @Field var affirmation: String = ""
  @Field var locale: String = "pt-BR"
  @Field var stopLabel: String = "Parar"
  @Field var voiceIdentifier: String? = null
  @Field var soundFileName: String? = null
  @Field var audioBase64Wav: String? = null
  @Field var requestAuthorization: Boolean = true

  fun toRecord(): AlarmDraft = AlarmDraft(
    alarmId = alarmId,
    hour = hour,
    minute = minute,
    weekdays = weekdays,
    title = title,
    affirmation = affirmation,
    locale = locale,
    stopLabel = stopLabel,
    audioBase64Wav = audioBase64Wav
  )
}

class AndroidAffirmationTestPayload : Record {
  @Field var alarmId: String = ""
  @Field var title: String = "Celeste"
  @Field var affirmation: String = ""
  @Field var locale: String = "pt-BR"
  @Field var stopLabel: String = "Parar"
  @Field var voiceIdentifier: String? = null
  @Field var soundFileName: String? = null
  @Field var audioBase64Wav: String? = null
  @Field var delaySeconds: Int = 60
  @Field var requestAuthorization: Boolean = true

  fun toRecord(): AlarmDraft = AlarmDraft(
    alarmId = alarmId,
    hour = 0,
    minute = 0,
    weekdays = emptyList(),
    title = title,
    affirmation = affirmation,
    locale = locale,
    stopLabel = stopLabel,
    audioBase64Wav = audioBase64Wav,
    delaySeconds = delaySeconds
  )
}

class AndroidAffirmationCancelPayload : Record {
  @Field var alarmId: String = ""
}

data class AlarmDraft(
  val alarmId: String,
  val hour: Int,
  val minute: Int,
  val weekdays: List<Int>,
  val title: String,
  val affirmation: String,
  val locale: String,
  val stopLabel: String,
  val audioBase64Wav: String?,
  val delaySeconds: Int? = null
)

data class AlarmRecord(
  val alarmId: String,
  val token: String,
  val hour: Int,
  val minute: Int,
  val weekdays: List<Int>,
  val title: String,
  val affirmation: String,
  val locale: String,
  val stopLabel: String,
  val audioPath: String?,
  val oneShot: Boolean
)
