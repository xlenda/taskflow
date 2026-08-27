package expo.modules.celesteaffirmationalarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Private metadata only. Sound bytes remain in filesDir and are never uploaded. */
class AffirmationAlarmStore(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun get(alarmId: String): AlarmRecord? = readAll().optJSONObject(alarmId)?.toRecord(alarmId)

  fun alarmIds(): List<String> {
    val all = readAll()
    return all.keys().asSequence().filter { id -> all.optJSONObject(id)?.toRecord(id) != null }.toList()
  }

  fun all(): List<AlarmRecord> {
    val all = readAll()
    return all.keys().asSequence().mapNotNull { id -> all.optJSONObject(id)?.toRecord(id) }.toList()
  }

  fun put(record: AlarmRecord): Boolean {
    val all = readAll()
    all.put(record.alarmId, record.toJson())
    return preferences.edit().putString(RECORDS, all.toString()).commit()
  }

  fun remove(alarmId: String): Boolean {
    val all = readAll()
    all.remove(alarmId)
    return preferences.edit().putString(RECORDS, all.toString()).commit()
  }

  private fun readAll(): JSONObject = try {
    JSONObject(preferences.getString(RECORDS, "{}") ?: "{}")
  } catch (_: Exception) {
    JSONObject()
  }

  private fun AlarmRecord.toJson(): JSONObject = JSONObject().apply {
    put("token", token)
    put("hour", hour)
    put("minute", minute)
    put("weekdays", JSONArray(weekdays))
    put("title", title)
    put("affirmation", affirmation)
    put("locale", locale)
    put("stopLabel", stopLabel)
    put("audioPath", audioPath)
    put("oneShot", oneShot)
  }

  private fun JSONObject.toRecord(alarmId: String): AlarmRecord? = try {
    val days = optJSONArray("weekdays") ?: JSONArray()
    AlarmRecord(
      alarmId = alarmId,
      token = getString("token"),
      hour = getInt("hour"),
      minute = getInt("minute"),
      weekdays = (0 until days.length()).map { days.getInt(it) },
      title = getString("title"),
      affirmation = getString("affirmation"),
      locale = getString("locale"),
      stopLabel = getString("stopLabel"),
      audioPath = optString("audioPath").takeIf { it.isNotBlank() },
      oneShot = optBoolean("oneShot", false)
    )
  } catch (_: Exception) {
    null
  }

  companion object {
    private const val PREFERENCES = "CelesteAffirmationAlarm"
    private const val RECORDS = "records.v1"
  }
}
