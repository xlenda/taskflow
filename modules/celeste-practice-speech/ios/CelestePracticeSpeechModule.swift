import AVFoundation
import ExpoModulesCore
import Foundation
import Speech

struct PracticeSpeechOptions: Record {
  @Field var locale: String = "pt-BR"
}

public final class CelestePracticeSpeechModule: Module {
  private var activeSession: RecognitionSession?

  public func definition() -> ModuleDefinition {
    Name("CelestePracticeSpeech")

    AsyncFunction("getCapability") { (options: PracticeSpeechOptions) -> [String: Any] in
      self.capability(locale: options.locale)
    }
    .runOnQueue(.main)

    AsyncFunction("requestPermission") { (options: PracticeSpeechOptions, promise: Promise) in
      self.requestPermission(locale: options.locale, promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("recognize") { (options: PracticeSpeechOptions, promise: Promise) in
      self.startRecognition(options: options, promise: promise)
    }
    .runOnQueue(.main)

    AsyncFunction("cancel") { (promise: Promise) in
      if let session = self.activeSession {
        self.failSession(session, code: "cancelled", cancelTask: true)
      }
      promise.resolve()
    }
    .runOnQueue(.main)

    OnDestroy {
      self.onMain {
        if let session = self.activeSession {
          self.failSession(session, code: "module_destroyed", cancelTask: true)
        }
      }
    }
  }

  private func requestPermission(locale: String, promise: Promise) {
    requestSpeechPermissionIfNeeded { [weak self] in
      guard let self else {
        promise.reject("module_destroyed", "Practice speech module was destroyed")
        return
      }
      guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
        promise.resolve(self.capability(locale: locale))
        return
      }
      self.requestMicrophonePermissionIfNeeded {
        promise.resolve(self.capability(locale: locale))
      }
    }
  }

  private func requestSpeechPermissionIfNeeded(completion: @escaping () -> Void) {
    guard SFSpeechRecognizer.authorizationStatus() == .notDetermined else {
      completion()
      return
    }
    SFSpeechRecognizer.requestAuthorization { _ in
      DispatchQueue.main.async(execute: completion)
    }
  }

  private func requestMicrophonePermissionIfNeeded(completion: @escaping () -> Void) {
    guard microphoneAuthorization() == "required" else {
      completion()
      return
    }
    if #available(iOS 17.0, *) {
      AVAudioApplication.requestRecordPermission { _ in
        DispatchQueue.main.async(execute: completion)
      }
    } else {
      AVAudioSession.sharedInstance().requestRecordPermission { _ in
        DispatchQueue.main.async(execute: completion)
      }
    }
  }

  private func startRecognition(options: PracticeSpeechOptions, promise: Promise) {
    guard activeSession == nil else {
      reject(promise, code: "recognizer_busy")
      return
    }

    let localeIdentifier = options.locale.trimmingCharacters(in: .whitespacesAndNewlines)
    guard Self.localePattern.firstMatch(
      in: localeIdentifier,
      range: NSRange(localeIdentifier.startIndex..., in: localeIdentifier)
    ) != nil else {
      reject(promise, code: "invalid_locale")
      return
    }
    guard SFSpeechRecognizer.authorizationStatus() == .authorized else {
      reject(promise, code: speechAuthorization() == "required" ? "permission_required" : "permission_denied")
      return
    }
    guard microphoneAuthorization() == "authorized" else {
      reject(promise, code: microphoneAuthorization() == "required" ? "permission_required" : "permission_denied")
      return
    }
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier)),
      recognizer.supportsOnDeviceRecognition else {
      reject(promise, code: "on_device_unavailable")
      return
    }
    guard recognizer.isAvailable else {
      reject(promise, code: "recognizer_unavailable")
      return
    }

    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = false
    request.requiresOnDeviceRecognition = true
    request.taskHint = .dictation
    if #available(iOS 16.0, *) {
      request.addsPunctuation = true
    }

    let audioEngine = AVAudioEngine()
    let session = RecognitionSession(
      recognizer: recognizer,
      request: request,
      audioEngine: audioEngine,
      promise: promise
    )
    activeSession = session

    do {
      let audioSession = AVAudioSession.sharedInstance()
      try audioSession.setCategory(.record, mode: .measurement, options: [])
      try audioSession.setActive(true)

      let inputNode = audioEngine.inputNode
      let recordingFormat = inputNode.outputFormat(forBus: 0)
      guard recordingFormat.sampleRate > 0, recordingFormat.channelCount > 0 else {
        failSession(session, code: "audio_error", cancelTask: true)
        return
      }
      inputNode.installTap(
        onBus: 0,
        bufferSize: Self.audioBufferSize,
        format: recordingFormat
      ) { [weak request] buffer, _ in
        request?.append(buffer)
      }
      session.tapInstalled = true

      session.task = recognizer.recognitionTask(with: request) { [weak self, weak session] result, error in
        guard let self, let session else { return }
        self.onMain {
          self.handleRecognitionCallback(session: session, result: result, error: error)
        }
      }

      let timeout = DispatchWorkItem { [weak self, weak session] in
        guard let self, let session else { return }
        self.failSession(session, code: "recognition_timeout", cancelTask: true)
      }
      session.timeout = timeout
      DispatchQueue.main.asyncAfter(deadline: .now() + Self.recognitionTimeout, execute: timeout)

      audioEngine.prepare()
      try audioEngine.start()
    } catch {
      failSession(session, code: "audio_error", cancelTask: true)
    }
  }

  private func handleRecognitionCallback(
    session: RecognitionSession,
    result: SFSpeechRecognitionResult?,
    error: Error?
  ) {
    guard activeSession === session, !session.settled else { return }
    if let result, result.isFinal {
      let normalized = candidates(from: result)
      guard !normalized.candidates.isEmpty else {
        failSession(session, code: "no_match", cancelTask: false)
        return
      }
      completeSession(
        session,
        result: [
          "candidates": normalized.candidates,
          "confidence": normalized.confidence
        ]
      )
      return
    }
    if let error {
      failSession(session, code: normalizeRecognitionError(error), cancelTask: false)
    }
  }

  private func candidates(from result: SFSpeechRecognitionResult) -> (
    candidates: [String],
    confidence: [Any]
  ) {
    var candidates: [String] = []
    var confidence: [Any] = []
    var seen = Set<String>()

    for transcription in result.transcriptions {
      if candidates.count >= Self.maxResults { break }
      let candidate = transcription.formattedString
        .components(separatedBy: .whitespacesAndNewlines)
        .filter { !$0.isEmpty }
        .joined(separator: " ")
      guard !candidate.isEmpty, seen.insert(candidate).inserted else { continue }
      candidates.append(candidate)

      let segments = transcription.segments
      guard !segments.isEmpty else {
        confidence.append(NSNull())
        continue
      }
      let total = segments.reduce(Float.zero) { $0 + $1.confidence }
      confidence.append(Double(max(0, min(1, total / Float(segments.count)))))
    }

    return (candidates, confidence)
  }

  private func completeSession(_ session: RecognitionSession, result: [String: Any]) {
    guard activeSession === session, !session.settled else { return }
    session.settled = true
    activeSession = nil
    cleanup(session, cancelTask: false)
    session.promise.resolve(result)
  }

  private func failSession(
    _ session: RecognitionSession,
    code: String,
    cancelTask: Bool
  ) {
    guard activeSession === session, !session.settled else { return }
    session.settled = true
    activeSession = nil
    cleanup(session, cancelTask: cancelTask)
    reject(session.promise, code: code)
  }

  private func cleanup(_ session: RecognitionSession, cancelTask: Bool) {
    session.timeout?.cancel()
    session.timeout = nil
    if session.audioEngine.isRunning {
      session.audioEngine.stop()
    }
    if session.tapInstalled {
      session.audioEngine.inputNode.removeTap(onBus: 0)
      session.tapInstalled = false
    }
    session.request.endAudio()
    if cancelTask {
      session.task?.cancel()
    }
    session.task = nil
    try? AVAudioSession.sharedInstance().setActive(
      false,
      options: .notifyOthersOnDeactivation
    )
  }

  private func capability(locale: String) -> [String: Any] {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)),
      recognizer.supportsOnDeviceRecognition else {
      return [
        "supported": false,
        "onDevice": true,
        "authorization": "unavailable",
        "canRecognize": false,
        "canRequestPermission": false,
        "reason": "on_device_unavailable",
        "apiVersion": Self.apiVersion
      ]
    }

    let speech = speechAuthorization()
    let microphone = microphoneAuthorization()
    let authorization: String
    if speech == "authorized", microphone == "authorized" {
      authorization = "authorized"
    } else if speech == "denied" || microphone == "denied" {
      authorization = "denied"
    } else {
      authorization = "required"
    }
    let available = recognizer.isAvailable
    let canRecognize = authorization == "authorized" && available
    let reason: Any
    if canRecognize {
      reason = NSNull()
    } else if authorization == "denied" {
      reason = "permission_denied"
    } else if authorization == "required" {
      reason = "permission_required"
    } else {
      reason = "recognizer_unavailable"
    }

    return [
      "supported": true,
      "onDevice": true,
      "authorization": authorization,
      "canRecognize": canRecognize,
      "canRequestPermission": speech == "required" || microphone == "required",
      "reason": reason,
      "available": available,
      "apiVersion": Self.apiVersion
    ]
  }

  private func speechAuthorization() -> String {
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized:
      return "authorized"
    case .notDetermined:
      return "required"
    case .denied, .restricted:
      return "denied"
    @unknown default:
      return "denied"
    }
  }

  private func microphoneAuthorization() -> String {
    if #available(iOS 17.0, *) {
      switch AVAudioApplication.shared.recordPermission {
      case .granted:
        return "authorized"
      case .undetermined:
        return "required"
      case .denied:
        return "denied"
      @unknown default:
        return "denied"
      }
    } else {
      switch AVAudioSession.sharedInstance().recordPermission {
      case .granted:
        return "authorized"
      case .undetermined:
        return "required"
      case .denied:
        return "denied"
      @unknown default:
        return "denied"
      }
    }
  }

  private func normalizeRecognitionError(_ error: Error) -> String {
    let nativeError = error as NSError
    if nativeError.domain == "kAFAssistantErrorDomain" {
      switch nativeError.code {
      case 1110:
        return "no_match"
      case 1101:
        return "recognizer_unavailable"
      default:
        return "recognition_error"
      }
    }
    if nativeError.domain == NSURLErrorDomain {
      return "on_device_recognizer_error"
    }
    if nativeError.domain == "AVFoundationErrorDomain" {
      return "audio_error"
    }
    return "recognition_error"
  }

  private func reject(_ promise: Promise, code: String) {
    promise.reject(code, "Practice speech recognition failed: \(code)")
  }

  private func onMain(_ block: @escaping () -> Void) {
    if Thread.isMainThread {
      block()
    } else {
      DispatchQueue.main.async(execute: block)
    }
  }

  private final class RecognitionSession {
    let recognizer: SFSpeechRecognizer
    let request: SFSpeechAudioBufferRecognitionRequest
    let audioEngine: AVAudioEngine
    let promise: Promise
    var task: SFSpeechRecognitionTask?
    var timeout: DispatchWorkItem?
    var tapInstalled = false
    var settled = false

    init(
      recognizer: SFSpeechRecognizer,
      request: SFSpeechAudioBufferRecognitionRequest,
      audioEngine: AVAudioEngine,
      promise: Promise
    ) {
      self.recognizer = recognizer
      self.request = request
      self.audioEngine = audioEngine
      self.promise = promise
    }
  }

  private static let apiVersion = "1"
  private static let maxResults = 5
  private static let audioBufferSize: AVAudioFrameCount = 1_024
  private static let recognitionTimeout: TimeInterval = 20
  private static let localePattern = try! NSRegularExpression(
    pattern: "^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$"
  )
}
