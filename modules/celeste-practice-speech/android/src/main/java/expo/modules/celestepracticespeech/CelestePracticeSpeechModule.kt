package expo.modules.celestepracticespeech

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.interfaces.permissions.PermissionsResponse
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class PracticeSpeechOptions : Record {
  @Field
  var locale: String = DEFAULT_LOCALE

  companion object {
    const val DEFAULT_LOCALE = "pt-BR"
  }
}

class CelestePracticeSpeechModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var activeSession: RecognitionSession? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is unavailable" }

  private val permissions: Permissions
    get() = requireNotNull(appContext.permissions) { "Permissions service is unavailable" }

  override fun definition() = ModuleDefinition {
    Name(MODULE_NAME)

    AsyncFunction("getCapability") { _options: PracticeSpeechOptions, promise: Promise ->
      onMain {
        promise.resolve(capability())
      }
    }

    AsyncFunction("requestPermission") { _options: PracticeSpeechOptions, promise: Promise ->
      onMain {
        if (!onDeviceRecognitionAvailable()) {
          promise.resolve(capability())
          return@onMain
        }

        if (hasRecordAudioPermission()) {
          promise.resolve(capability())
          return@onMain
        }

        permissions.askForPermissions(
          { responses: Map<String, PermissionsResponse> ->
            val response = responses[Manifest.permission.RECORD_AUDIO]
            onMain {
              promise.resolve(capability(response))
            }
          },
          Manifest.permission.RECORD_AUDIO
        )
      }
    }

    AsyncFunction("recognize") { options: PracticeSpeechOptions, promise: Promise ->
      onMain {
        startRecognition(options, promise)
      }
    }

    AsyncFunction("cancel") { promise: Promise ->
      onMain {
        activeSession?.let { failSession(it, "cancelled", cancelFirst = true) }
        promise.resolve()
      }
    }

    OnDestroy {
      onMain {
        activeSession?.let { failSession(it, "module_destroyed", cancelFirst = true) }
      }
    }
  }

  private fun startRecognition(options: PracticeSpeechOptions, promise: Promise) {
    if (activeSession != null) {
      reject(promise, "recognizer_busy")
      return
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !onDeviceRecognitionAvailable()) {
      reject(promise, "on_device_unavailable")
      return
    }
    if (!hasRecordAudioPermission()) {
      reject(promise, "permission_required")
      return
    }

    val locale = options.locale.trim()
    if (!LOCALE_PATTERN.matches(locale)) {
      reject(promise, "invalid_locale")
      return
    }

    val recognizer = try {
      SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
    } catch (_error: Throwable) {
      reject(promise, "on_device_unavailable")
      return
    }

    val session = RecognitionSession(recognizer, promise)
    activeSession = session
    session.timeout = Runnable {
      failSession(session, "recognition_timeout", cancelFirst = true)
    }

    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, MAX_RESULTS)
      putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
      putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
    }

    try {
      recognizer.setRecognitionListener(listenerFor(session))
      mainHandler.postDelayed(session.timeout, RECOGNITION_TIMEOUT_MS)
      recognizer.startListening(intent)
    } catch (_error: Throwable) {
      failSession(session, "recognizer_unavailable")
    }
  }

  private fun listenerFor(session: RecognitionSession): RecognitionListener =
    object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) = Unit

      override fun onBeginningOfSpeech() = Unit

      override fun onRmsChanged(rmsdB: Float) = Unit

      override fun onBufferReceived(buffer: ByteArray?) = Unit

      override fun onEndOfSpeech() = Unit

      override fun onError(error: Int) {
        failSession(session, normalizeRecognizerError(error))
      }

      override fun onResults(results: Bundle?) {
        val rawCandidates = results
          ?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
          .orEmpty()
        val rawConfidence = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
        val candidates = mutableListOf<String>()
        val confidence = mutableListOf<Double?>()
        val seen = mutableSetOf<String>()

        rawCandidates.forEachIndexed { index, rawCandidate ->
          if (candidates.size >= MAX_RESULTS) return@forEachIndexed
          val candidate = rawCandidate.trim().replace(WHITESPACE_PATTERN, " ")
          if (candidate.isEmpty() || !seen.add(candidate)) return@forEachIndexed
          candidates.add(candidate)
          val score = rawConfidence
            ?.getOrNull(index)
            ?.takeIf { it.isFinite() && it >= 0f }
            ?.coerceIn(0f, 1f)
            ?.toDouble()
          confidence.add(score)
        }

        if (candidates.isEmpty()) {
          failSession(session, "no_match")
          return
        }

        completeSession(
          session,
          mapOf(
            "candidates" to candidates,
            "confidence" to confidence
          )
        )
      }

      override fun onPartialResults(partialResults: Bundle?) = Unit

      override fun onEvent(eventType: Int, params: Bundle?) = Unit
    }

  private fun completeSession(session: RecognitionSession, result: Map<String, Any?>) {
    if (activeSession !== session || session.settled) return
    session.settled = true
    activeSession = null
    mainHandler.removeCallbacks(session.timeout)
    destroyRecognizer(session.recognizer, cancelFirst = false)
    session.promise.resolve(result)
  }

  private fun failSession(
    session: RecognitionSession,
    code: String,
    cancelFirst: Boolean = false
  ) {
    if (activeSession !== session || session.settled) return
    session.settled = true
    activeSession = null
    mainHandler.removeCallbacks(session.timeout)
    destroyRecognizer(session.recognizer, cancelFirst)
    reject(session.promise, code)
  }

  private fun destroyRecognizer(recognizer: SpeechRecognizer, cancelFirst: Boolean) {
    if (cancelFirst) {
      try {
        recognizer.cancel()
      } catch (_error: Throwable) {
        // The recognizer can already be disconnected; destruction still follows.
      }
    }
    try {
      recognizer.destroy()
    } catch (_error: Throwable) {
      // No audio or recognizer reference is retained after this point.
    }
  }

  private fun capability(permissionResponse: PermissionsResponse? = null): Map<String, Any?> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return mapOf(
        "supported" to false,
        "onDevice" to true,
        "authorization" to "unavailable",
        "canRecognize" to false,
        "canRequestPermission" to false,
        "reason" to "android_version_unsupported",
        "apiVersion" to API_VERSION
      )
    }
    if (!onDeviceRecognitionAvailable()) {
      return mapOf(
        "supported" to false,
        "onDevice" to true,
        "authorization" to "unavailable",
        "canRecognize" to false,
        "canRequestPermission" to false,
        "reason" to "on_device_unavailable",
        "apiVersion" to API_VERSION
      )
    }

    val granted = permissionResponse?.status == PermissionsStatus.GRANTED || hasRecordAudioPermission()
    val canAskAgain = !granted && permissionResponse?.canAskAgain != false
    return mapOf(
      "supported" to true,
      "onDevice" to true,
      "authorization" to if (granted) "authorized" else if (canAskAgain) "required" else "denied",
      "canRecognize" to granted,
      "canRequestPermission" to canAskAgain,
      "reason" to if (granted) null else if (canAskAgain) "permission_required" else "permission_denied",
      "apiVersion" to API_VERSION
    )
  }

  private fun onDeviceRecognitionAvailable(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && try {
      SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
    } catch (_error: Throwable) {
      false
    }

  private fun hasRecordAudioPermission(): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED

  private fun normalizeRecognizerError(error: Int): String = when (error) {
    SpeechRecognizer.ERROR_AUDIO -> "audio_error"
    SpeechRecognizer.ERROR_CLIENT -> "client_error"
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission_denied"
    SpeechRecognizer.ERROR_NO_MATCH -> "no_match"
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "recognizer_busy"
    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "speech_timeout"
    SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> "rate_limited"
    SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "recognizer_unavailable"
    SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> "language_not_supported"
    SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "language_unavailable"
    SpeechRecognizer.ERROR_NETWORK,
    SpeechRecognizer.ERROR_NETWORK_TIMEOUT,
    SpeechRecognizer.ERROR_SERVER -> "on_device_recognizer_error"
    else -> "recognition_error"
  }

  private fun reject(promise: Promise, code: String) {
    promise.reject(code, "Practice speech recognition failed: $code", null)
  }

  private fun onMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) {
      block()
    } else {
      mainHandler.post(block)
    }
  }

  private class RecognitionSession(
    val recognizer: SpeechRecognizer,
    val promise: Promise
  ) {
    lateinit var timeout: Runnable
    var settled = false
  }

  companion object {
    private const val MODULE_NAME = "CelestePracticeSpeech"
    private const val API_VERSION = "1"
    private const val MAX_RESULTS = 5
    private const val RECOGNITION_TIMEOUT_MS = 20_000L
    private val LOCALE_PATTERN = Regex("^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$")
    private val WHITESPACE_PATTERN = Regex("\\s+")
  }
}
