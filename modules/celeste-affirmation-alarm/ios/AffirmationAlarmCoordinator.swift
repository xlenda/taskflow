#if canImport(AlarmKit)
import ActivityKit
import AlarmKit
import Foundation
import SwiftUI

@available(iOS 26.0, *)
struct CelesteAlarmMetadata: AlarmMetadata, Codable, Hashable, Sendable {
  let createdAt: Date
  let kind: String
}

@available(iOS 26.0, *)
private struct PreparedAffirmationSound {
  let fileName: String
  let url: URL
  let duration: TimeInterval
  let source: String
}

@available(iOS 26.0, *)
actor AffirmationAlarmCoordinator {
  static let shared = AffirmationAlarmCoordinator()

  private typealias AlarmConfiguration = AlarmManager.AlarmConfiguration<CelesteAlarmMetadata>

  private let alarmManager = AlarmManager.shared
  private let defaults = UserDefaults.standard
  private let legacySoundsDefaultsKey = "CelesteAffirmationAlarm.soundFiles.v1"
  private let soundsDefaultsKey = "CelesteAffirmationAlarm.soundFiles.v2"
  private let systemIdsDefaultsKey = "CelesteAffirmationAlarm.systemIds.v1"
  private let ownedFilesDefaultsKey = "CelesteAffirmationAlarm.ownedFiles.v1"
  private let isoFormatter = ISO8601DateFormatter()

  func capability() -> [String: Any] {
    switch alarmManager.authorizationState {
    case .authorized:
      return capabilityResult(authorization: "authorized")
    case .denied:
      return capabilityResult(authorization: "denied")
    case .notDetermined:
      return capabilityResult(authorization: "notDetermined")
    @unknown default:
      return capabilityResult(authorization: "unknown", reason: "authorization_unknown")
    }
  }

  func requestAuthorization() async -> [String: Any] {
    switch alarmManager.authorizationState {
    case .authorized:
      return capabilityResult(authorization: "authorized")
    case .denied:
      return capabilityResult(authorization: "denied")
    case .notDetermined:
      do {
        let state = try await alarmManager.requestAuthorization()
        switch state {
        case .authorized:
          return capabilityResult(authorization: "authorized")
        case .denied:
          return capabilityResult(authorization: "denied")
        case .notDetermined:
          return capabilityResult(authorization: "notDetermined")
        @unknown default:
          return capabilityResult(authorization: "unknown", reason: "authorization_unknown")
        }
      } catch {
        return capabilityResult(
          authorization: "unknown",
          reason: "authorization_request_failed",
          error: error
        )
      }
    @unknown default:
      return capabilityResult(authorization: "unknown", reason: "authorization_unknown")
    }
  }

  func schedule(_ payload: AffirmationSchedulePayload) async -> [String: Any] {
    guard let alarmId = UUID(uuidString: payload.alarmId) else {
      return failure(operation: "schedule", alarmId: payload.alarmId, reason: "invalid_alarm_id")
    }
    guard (0...23).contains(payload.hour), (0...59).contains(payload.minute) else {
      return failure(operation: "schedule", alarmId: payload.alarmId, reason: "invalid_time")
    }
    guard !payload.affirmation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return failure(operation: "schedule", alarmId: payload.alarmId, reason: "missing_affirmation")
    }

    let weekdays = payload.weekdays.compactMap(Self.weekday(fromISO:))
    guard weekdays.count == payload.weekdays.count, !weekdays.isEmpty else {
      return failure(operation: "schedule", alarmId: payload.alarmId, reason: "invalid_weekdays")
    }
    if let authorizationFailure = await requireAuthorization(
      operation: "schedule",
      alarmId: payload.alarmId,
      requestIfNeeded: payload.requestAuthorization
    ) {
      return authorizationFailure
    }

    let preparedSound: PreparedAffirmationSound
    do {
      preparedSound = try await prepareSound(
        alarmId: alarmId,
        affirmation: payload.affirmation,
        locale: payload.locale,
        voiceIdentifier: payload.voiceIdentifier,
        requestedFileName: payload.soundFileName,
        audioBase64Wav: payload.audioBase64Wav
      )
    } catch {
      return soundFailure(operation: "schedule", alarmId: payload.alarmId, error: error)
    }

    let time = Alarm.Schedule.Relative.Time(hour: payload.hour, minute: payload.minute)
    let schedule = Alarm.Schedule.relative(.init(time: time, repeats: .weekly(weekdays)))

    do {
      let alarm = try await install(
        logicalId: alarmId,
        preparedSound: preparedSound,
        configuration: configuration(
          schedule: schedule,
          title: payload.title,
          stopLabel: payload.stopLabel,
          soundFileName: preparedSound.fileName,
          kind: "weekly"
        )
      )

      var result: [String: Any] = [
        "ok": true,
        "operation": "schedule",
        "alarmId": alarmId.uuidString,
        "systemAlarmId": alarm.id.uuidString,
        "soundFileName": preparedSound.fileName,
        "soundDurationSeconds": preparedSound.duration,
        "soundSource": preparedSound.source
      ]
      if let nextDate = nextFireDate(
        hour: payload.hour,
        minute: payload.minute,
        isoWeekdays: payload.weekdays
      ) {
        result["scheduledFor"] = isoFormatter.string(from: nextDate)
      }
      return result
    } catch {
      discardPreparedSound(preparedSound)
      return failure(
        operation: "schedule",
        alarmId: payload.alarmId,
        reason: "alarm_schedule_failed",
        error: error
      )
    }
  }

  func test(_ payload: AffirmationTestPayload) async -> [String: Any] {
    guard let alarmId = UUID(uuidString: payload.alarmId) else {
      return failure(operation: "test", alarmId: payload.alarmId, reason: "invalid_alarm_id")
    }
    guard (10...300).contains(payload.delaySeconds) else {
      return failure(operation: "test", alarmId: payload.alarmId, reason: "invalid_test_delay")
    }
    guard !payload.affirmation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return failure(operation: "test", alarmId: payload.alarmId, reason: "missing_affirmation")
    }
    if let authorizationFailure = await requireAuthorization(
      operation: "test",
      alarmId: payload.alarmId,
      requestIfNeeded: payload.requestAuthorization
    ) {
      return authorizationFailure
    }

    let preparedSound: PreparedAffirmationSound
    do {
      preparedSound = try await prepareSound(
        alarmId: alarmId,
        affirmation: payload.affirmation,
        locale: payload.locale,
        voiceIdentifier: payload.voiceIdentifier,
        requestedFileName: payload.soundFileName,
        audioBase64Wav: payload.audioBase64Wav
      )
    } catch {
      return soundFailure(operation: "test", alarmId: payload.alarmId, error: error)
    }

    // The delay starts after TTS finishes, so a slower voice render cannot make the test date stale.
    let scheduledDate = Date.now.addingTimeInterval(TimeInterval(payload.delaySeconds))
    let schedule = Alarm.Schedule.fixed(scheduledDate)

    do {
      let alarm = try await install(
        logicalId: alarmId,
        preparedSound: preparedSound,
        configuration: configuration(
          schedule: schedule,
          title: payload.title,
          stopLabel: payload.stopLabel,
          soundFileName: preparedSound.fileName,
          kind: "test"
        )
      )
      return [
        "ok": true,
        "operation": "test",
        "alarmId": alarmId.uuidString,
        "systemAlarmId": alarm.id.uuidString,
        "scheduledFor": isoFormatter.string(from: scheduledDate),
        "soundFileName": preparedSound.fileName,
        "soundDurationSeconds": preparedSound.duration,
        "soundSource": preparedSound.source
      ]
    } catch {
      discardPreparedSound(preparedSound)
      return failure(
        operation: "test",
        alarmId: payload.alarmId,
        reason: "alarm_schedule_failed",
        error: error
      )
    }
  }

  func cancel(_ alarmIdString: String) -> [String: Any] {
    guard let logicalId = UUID(uuidString: alarmIdString) else {
      return failure(operation: "cancel", alarmId: alarmIdString, reason: "invalid_alarm_id")
    }

    do {
      try reconcileTrackedAlarms()
      var systemIds = loadSystemIds()
      let systemId = systemIds[logicalId.uuidString].flatMap { UUID(uuidString: $0) } ?? logicalId
      let exists = try alarmManager.alarms.contains { $0.id == systemId }
      if exists {
        try alarmManager.cancel(id: systemId)
      }
      systemIds.removeValue(forKey: logicalId.uuidString)
      saveSystemIds(systemIds)
      removeTrackedSound(forSystemId: systemId)
      _ = try? reconcileTrackedAlarms()
      return [
        "ok": true,
        "operation": "cancel",
        "alarmId": logicalId.uuidString,
        "cancelled": exists
      ]
    } catch {
      return failure(
        operation: "cancel",
        alarmId: alarmIdString,
        reason: "alarm_cancel_failed",
        error: error
      )
    }
  }

  private func configuration(
    schedule: Alarm.Schedule,
    title: String,
    stopLabel: String,
    soundFileName: String,
    kind: String
  ) -> AlarmConfiguration {
    let safeTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let localizedTitle = LocalizedStringResource(
      stringLiteral: safeTitle.isEmpty ? "Celeste" : safeTitle
    )
    let safeStopLabel = stopLabel.trimmingCharacters(in: .whitespacesAndNewlines)
    let localizedStopLabel = LocalizedStringResource(
      stringLiteral: safeStopLabel.isEmpty ? "Parar" : safeStopLabel
    )
    // The stop-button initializer keeps this source compatible with the first iOS 26 SDK.
    let stopButton = AlarmButton(
      text: localizedStopLabel,
      textColor: .white,
      systemImageName: "stop.circle.fill"
    )
    let alert = AlarmPresentation.Alert(title: localizedTitle, stopButton: stopButton)
    let presentation = AlarmPresentation(alert: alert)
    let metadata = CelesteAlarmMetadata(createdAt: .now, kind: kind)
    let attributes = AlarmAttributes<CelesteAlarmMetadata>(
      presentation: presentation,
      metadata: metadata,
      tintColor: Color(red: 0.36, green: 0.49, blue: 0.66)
    )

    return .alarm(
      schedule: schedule,
      attributes: attributes,
      sound: .named(soundFileName)
    )
  }

  private func prepareSound(
    alarmId: UUID,
    affirmation: String,
    locale: String,
    voiceIdentifier: String?,
    requestedFileName: String?,
    audioBase64Wav: String?
  ) async throws -> PreparedAffirmationSound {
    let directory = try soundsDirectory()
    let usesNeuralWav = audioBase64Wav != nil
    let fileName = makeSoundFileName(
      requestedFileName,
      alarmId: alarmId,
      fileExtension: usesNeuralWav ? "wav" : "caf"
    )
    let url = directory.appendingPathComponent(fileName, isDirectory: false)
    if let audioBase64Wav {
      let duration = try NeuralWavSoundWriter.write(
        base64Wav: audioBase64Wav,
        to: url
      )
      return PreparedAffirmationSound(
        fileName: fileName,
        url: url,
        duration: duration,
        source: "neural_wav"
      )
    }

    let duration = try await SpeechSoundWriter.render(
      text: affirmation,
      locale: locale,
      voiceIdentifier: voiceIdentifier,
      to: url
    )
    return PreparedAffirmationSound(
      fileName: fileName,
      url: url,
      duration: duration,
      source: "local_speech"
    )
  }

  private func requireAuthorization(
    operation: String,
    alarmId: String,
    requestIfNeeded: Bool
  ) async -> [String: Any]? {
    switch alarmManager.authorizationState {
    case .authorized:
      return nil
    case .denied:
      return failure(operation: operation, alarmId: alarmId, reason: "authorization_denied")
    case .notDetermined:
      guard requestIfNeeded else {
        return failure(operation: operation, alarmId: alarmId, reason: "authorization_required")
      }
      do {
        let state = try await alarmManager.requestAuthorization()
        guard state == .authorized else {
          return failure(operation: operation, alarmId: alarmId, reason: "authorization_denied")
        }
        return nil
      } catch {
        return failure(
          operation: operation,
          alarmId: alarmId,
          reason: "authorization_request_failed",
          error: error
        )
      }
    @unknown default:
      return failure(operation: operation, alarmId: alarmId, reason: "authorization_unknown")
    }
  }

  private func install(
    logicalId: UUID,
    preparedSound: PreparedAffirmationSound,
    configuration: AlarmConfiguration
  ) async throws -> Alarm {
    try reconcileTrackedAlarms(preserving: [preparedSound.fileName])
    var systemIds = loadSystemIds()
    let activeIds = Set(try alarmManager.alarms.map { $0.id })
    let mappedId = systemIds[logicalId.uuidString].flatMap { UUID(uuidString: $0) }
    let previousId = mappedId.flatMap { activeIds.contains($0) ? $0 : nil }
      ?? (activeIds.contains(logicalId) ? logicalId : nil)
    let nextId = previousId == nil ? logicalId : UUID()

    rememberSound(preparedSound.fileName, forSystemId: nextId)
    let alarm: Alarm
    do {
      alarm = try await alarmManager.schedule(id: nextId, configuration: configuration)
    } catch {
      removeTrackedSound(forSystemId: nextId)
      throw error
    }

    // Commit the replacement before removing the old physical alarm. If the
    // process is interrupted here, reconciliation keeps the new alarm and
    // removes the old duplicate on the next capability check.
    systemIds[logicalId.uuidString] = nextId.uuidString
    saveSystemIds(systemIds)

    if let previousId, previousId != nextId {
      do {
        try alarmManager.cancel(id: previousId)
        removeTrackedSound(forSystemId: previousId)
      } catch let previousCancelError {
        var candidateCancelled = false
        do {
          try alarmManager.cancel(id: nextId)
          candidateCancelled = true
        } catch {
          // Both alarms still exist. Keep the new one canonical; a later
          // reconciliation retries removal of the tracked old physical alarm.
        }
        if candidateCancelled {
          removeTrackedSound(forSystemId: nextId)
          systemIds[logicalId.uuidString] = previousId.uuidString
          saveSystemIds(systemIds)
          throw previousCancelError
        }
      }
    }

    return alarm
  }

  private func soundsDirectory() throws -> URL {
    guard let libraryDirectory = FileManager.default.urls(
      for: .libraryDirectory,
      in: .userDomainMask
    ).first else {
      throw CocoaError(.fileNoSuchFile)
    }
    let directory = libraryDirectory.appendingPathComponent("Sounds", isDirectory: true)
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true,
      attributes: nil
    )
    return directory
  }

  private func makeSoundFileName(
    _ requestedName: String?,
    alarmId: UUID,
    fileExtension: String
  ) -> String {
    let requestedStem = requestedName.map {
      URL(fileURLWithPath: $0).deletingPathExtension().lastPathComponent
    } ?? "celeste-affirmation"
    let allowed = CharacterSet(
      charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
    )
    let filtered = requestedStem.unicodeScalars.map {
      allowed.contains($0) ? String($0) : "-"
    }.joined()
    let trimmed = filtered.trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
    let stem = trimmed.isEmpty ? "celeste-affirmation" : String(trimmed.prefix(48))
    let revision = UUID().uuidString.prefix(8).lowercased()
    return "\(stem)-\(alarmId.uuidString.lowercased())-\(revision).\(fileExtension)"
  }

  private func loadSystemIds() -> [String: String] {
    defaults.dictionary(forKey: systemIdsDefaultsKey) as? [String: String] ?? [:]
  }

  private func saveSystemIds(_ systemIds: [String: String]) {
    defaults.set(systemIds, forKey: systemIdsDefaultsKey)
  }

  private func loadSounds() -> [String: String] {
    defaults.dictionary(forKey: soundsDefaultsKey) as? [String: String] ?? [:]
  }

  private func saveSounds(_ sounds: [String: String]) {
    defaults.set(sounds, forKey: soundsDefaultsKey)
  }

  private func rememberSound(_ fileName: String, forSystemId systemId: UUID) {
    var sounds = loadSounds()
    if let previous = sounds[systemId.uuidString], previous != fileName {
      _ = removeSoundFile(named: previous)
    }
    sounds[systemId.uuidString] = fileName
    saveSounds(sounds)
    trackOwnedFile(fileName)
  }

  private func removeTrackedSound(forSystemId systemId: UUID) {
    var sounds = loadSounds()
    if let fileName = sounds.removeValue(forKey: systemId.uuidString) {
      _ = removeSoundFile(named: fileName)
    }
    saveSounds(sounds)
  }

  private func discardPreparedSound(_ preparedSound: PreparedAffirmationSound) {
    _ = removeSoundFile(named: preparedSound.fileName)
  }

  private func trackOwnedFile(_ fileName: String) {
    var files = Set(defaults.stringArray(forKey: ownedFilesDefaultsKey) ?? [])
    files.insert(fileName)
    defaults.set(files.sorted(), forKey: ownedFilesDefaultsKey)
  }

  @discardableResult
  private func removeSoundFile(named fileName: String) -> Bool {
    guard URL(fileURLWithPath: fileName).lastPathComponent == fileName,
          let directory = try? soundsDirectory() else {
      return false
    }
    let url = directory.appendingPathComponent(fileName, isDirectory: false)
    do {
      if FileManager.default.fileExists(atPath: url.path) {
        try FileManager.default.removeItem(at: url)
      }
      var files = Set(defaults.stringArray(forKey: ownedFilesDefaultsKey) ?? [])
      files.remove(fileName)
      defaults.set(files.sorted(), forKey: ownedFilesDefaultsKey)
      return true
    } catch {
      trackOwnedFile(fileName)
      return false
    }
  }

  @discardableResult
  private func reconcileTrackedAlarms(preserving: Set<String> = []) throws -> [String] {
    let alarms = try alarmManager.alarms
    var activeIds = Set(alarms.map { $0.id.uuidString })
    var systemIds = loadSystemIds()
    var sounds = loadSounds()

    if let legacySounds = defaults.dictionary(forKey: legacySoundsDefaultsKey) as? [String: String] {
      for (logicalId, fileName) in legacySounds {
        let systemId = systemIds[logicalId] ?? logicalId
        if activeIds.contains(systemId) {
          systemIds[logicalId] = systemId
          sounds[systemId] = fileName
          trackOwnedFile(fileName)
        } else {
          _ = removeSoundFile(named: fileName)
        }
      }
      defaults.removeObject(forKey: legacySoundsDefaultsKey)
    }

    for (logicalId, systemId) in Array(systemIds) where !activeIds.contains(systemId) {
      systemIds.removeValue(forKey: logicalId)
    }

    let canonicalSystemIds = Set(systemIds.values)
    for (systemId, fileName) in Array(sounds) {
      guard activeIds.contains(systemId) else {
        sounds.removeValue(forKey: systemId)
        _ = removeSoundFile(named: fileName)
        continue
      }
      guard !canonicalSystemIds.contains(systemId), let orphanId = UUID(uuidString: systemId) else {
        continue
      }
      do {
        try alarmManager.cancel(id: orphanId)
        activeIds.remove(systemId)
        sounds.removeValue(forKey: systemId)
        _ = removeSoundFile(named: fileName)
      } catch {
        // Keep ownership metadata so a later foreground reconciliation retries.
      }
    }

    saveSystemIds(systemIds)
    saveSounds(sounds)
    let trackedSystemIds = Set(sounds.keys)
    let hasUntrackedActiveAlarm = activeIds.contains { !trackedSystemIds.contains($0) }
    try? cleanupUnreferencedSoundFiles(
      referenced: Set(sounds.values).union(preserving),
      preserveGeneratedFiles: hasUntrackedActiveAlarm
    )

    var logicalIds = systemIds.compactMap { logicalId, systemId in
      activeIds.contains(systemId) ? logicalId : nil
    }
    let mappedSystemIds = Set(systemIds.values)
    logicalIds.append(contentsOf: activeIds.filter { !mappedSystemIds.contains($0) })
    return Array(Set(logicalIds)).sorted()
  }

  private func cleanupUnreferencedSoundFiles(
    referenced: Set<String>,
    preserveGeneratedFiles: Bool = false
  ) throws {
    let directory = try soundsDirectory()
    let directoryFiles = try FileManager.default.contentsOfDirectory(
      at: directory,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    ).map(\.lastPathComponent)
    var candidates = Set(defaults.stringArray(forKey: ownedFilesDefaultsKey) ?? [])
    candidates.formUnion(directoryFiles.filter(isCelesteGeneratedSoundFile))

    var remaining = Set<String>()
    for fileName in candidates {
      if referenced.contains(fileName) || preserveGeneratedFiles {
        remaining.insert(fileName)
      } else if !removeSoundFile(named: fileName) {
        remaining.insert(fileName)
      }
    }
    defaults.set(remaining.sorted(), forKey: ownedFilesDefaultsKey)
  }

  private func isCelesteGeneratedSoundFile(_ fileName: String) -> Bool {
    guard fileName.hasPrefix("celeste-affirmation-"),
          fileName.hasSuffix(".wav") || fileName.hasSuffix(".caf") else {
      return false
    }
    let pattern = #"^celeste-affirmation-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{8}\.(wav|caf)$"#
    return fileName.range(of: pattern, options: .regularExpression) != nil
  }

  private func nextFireDate(hour: Int, minute: Int, isoWeekdays: [Int]) -> Date? {
    let calendar = Calendar.autoupdatingCurrent
    return isoWeekdays.compactMap { isoWeekday in
      let calendarWeekday = isoWeekday == 7 ? 1 : isoWeekday + 1
      var components = DateComponents()
      components.calendar = calendar
      components.timeZone = calendar.timeZone
      components.weekday = calendarWeekday
      components.hour = hour
      components.minute = minute
      components.second = 0
      return calendar.nextDate(
        after: .now,
        matching: components,
        matchingPolicy: .nextTime,
        repeatedTimePolicy: .first,
        direction: .forward
      )
    }.min()
  }

  private static func weekday(fromISO value: Int) -> Locale.Weekday? {
    switch value {
    case 1: return .monday
    case 2: return .tuesday
    case 3: return .wednesday
    case 4: return .thursday
    case 5: return .friday
    case 6: return .saturday
    case 7: return .sunday
    default: return nil
    }
  }

  private func capabilityResult(
    authorization: String,
    reason: String? = nil,
    error: Error? = nil
  ) -> [String: Any] {
    let scheduledAlarmIds: [String]
    do {
      scheduledAlarmIds = try reconcileTrackedAlarms()
    } catch {
      let activeIds = Set((try? alarmManager.alarms.map { $0.id.uuidString }) ?? [])
      let systemIds = loadSystemIds()
      scheduledAlarmIds = systemIds.compactMap { logicalId, systemId in
        activeIds.contains(systemId) ? logicalId : nil
      }
    }
    var result: [String: Any] = [
      "supported": true,
      "authorization": authorization,
      "apiVersion": "2",
      "scheduledAlarmIds": scheduledAlarmIds
    ]
    if let reason { result["reason"] = reason }
    if let error { result["nativeErrorCode"] = String(describing: type(of: error)) }
    return result
  }

  private func soundFailure(operation: String, alarmId: String, error: Error) -> [String: Any] {
    let reason: String
    switch error {
    case SpeechSoundWriterError.voiceUnavailable:
      reason = "voice_unavailable"
    case SpeechSoundWriterError.audioTooLong:
      reason = "affirmation_audio_too_long"
    case NeuralWavSoundWriterError.invalidBase64,
         NeuralWavSoundWriterError.invalidWav,
         NeuralWavSoundWriterError.unsupportedWav,
         NeuralWavSoundWriterError.emptyAudio:
      reason = "invalid_neural_wav"
    case NeuralWavSoundWriterError.audioTooLarge:
      reason = "neural_wav_too_large"
    case NeuralWavSoundWriterError.audioTooLong:
      reason = "affirmation_audio_too_long"
    default:
      reason = "sound_render_failed"
    }
    return failure(operation: operation, alarmId: alarmId, reason: reason, error: error)
  }

  private func failure(
    operation: String,
    alarmId: String,
    reason: String,
    error: Error? = nil
  ) -> [String: Any] {
    var result: [String: Any] = [
      "ok": false,
      "operation": operation,
      "alarmId": alarmId,
      "reason": reason
    ]
    result["scheduledAlarmIds"] = (try? reconcileTrackedAlarms()) ?? []
    if let error { result["nativeErrorCode"] = String(describing: type(of: error)) }
    return result
  }
}
#endif
