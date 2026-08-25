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
}

@available(iOS 26.0, *)
actor AffirmationAlarmCoordinator {
  static let shared = AffirmationAlarmCoordinator()

  private typealias AlarmConfiguration = AlarmManager.AlarmConfiguration<CelesteAlarmMetadata>

  private let alarmManager = AlarmManager.shared
  private let defaults = UserDefaults.standard
  private let soundsDefaultsKey = "CelesteAffirmationAlarm.soundFiles.v1"
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
        requestedFileName: payload.soundFileName
      )
    } catch {
      return soundFailure(operation: "schedule", alarmId: payload.alarmId, error: error)
    }

    let time = Alarm.Schedule.Relative.Time(hour: payload.hour, minute: payload.minute)
    let schedule = Alarm.Schedule.relative(.init(time: time, repeats: .weekly(weekdays)))

    do {
      try cancelExistingAlarm(id: alarmId)
      let alarm = try await alarmManager.schedule(
        id: alarmId,
        configuration: configuration(
          schedule: schedule,
          title: payload.title,
          soundFileName: preparedSound.fileName,
          kind: "weekly"
        )
      )
      rememberSound(preparedSound.fileName, for: alarmId)

      var result: [String: Any] = [
        "ok": true,
        "operation": "schedule",
        "alarmId": alarm.id.uuidString,
        "soundFileName": preparedSound.fileName,
        "soundDurationSeconds": preparedSound.duration
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
      try? FileManager.default.removeItem(at: preparedSound.url)
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
        requestedFileName: payload.soundFileName
      )
    } catch {
      return soundFailure(operation: "test", alarmId: payload.alarmId, error: error)
    }

    // The delay starts after TTS finishes, so a slower voice render cannot make the test date stale.
    let scheduledDate = Date.now.addingTimeInterval(TimeInterval(payload.delaySeconds))
    let schedule = Alarm.Schedule.fixed(scheduledDate)

    do {
      try cancelExistingAlarm(id: alarmId)
      let alarm = try await alarmManager.schedule(
        id: alarmId,
        configuration: configuration(
          schedule: schedule,
          title: payload.title,
          soundFileName: preparedSound.fileName,
          kind: "test"
        )
      )
      rememberSound(preparedSound.fileName, for: alarmId)
      return [
        "ok": true,
        "operation": "test",
        "alarmId": alarm.id.uuidString,
        "scheduledFor": isoFormatter.string(from: scheduledDate),
        "soundFileName": preparedSound.fileName,
        "soundDurationSeconds": preparedSound.duration
      ]
    } catch {
      try? FileManager.default.removeItem(at: preparedSound.url)
      return failure(
        operation: "test",
        alarmId: payload.alarmId,
        reason: "alarm_schedule_failed",
        error: error
      )
    }
  }

  func cancel(_ alarmIdString: String) -> [String: Any] {
    guard let alarmId = UUID(uuidString: alarmIdString) else {
      return failure(operation: "cancel", alarmId: alarmIdString, reason: "invalid_alarm_id")
    }

    do {
      let exists = try alarmManager.alarms.contains { $0.id == alarmId }
      if exists {
        try alarmManager.cancel(id: alarmId)
      }
      removeTrackedSound(for: alarmId)
      return [
        "ok": true,
        "operation": "cancel",
        "alarmId": alarmId.uuidString,
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
    soundFileName: String,
    kind: String
  ) -> AlarmConfiguration {
    let safeTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
    let localizedTitle = LocalizedStringResource(
      stringLiteral: safeTitle.isEmpty ? "Celeste" : safeTitle
    )
    // The stop-button initializer keeps this source compatible with the first iOS 26 SDK.
    let stopButton = AlarmButton(
      text: "Parar",
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
    requestedFileName: String?
  ) async throws -> PreparedAffirmationSound {
    let directory = try soundsDirectory()
    let fileName = makeSoundFileName(requestedFileName, alarmId: alarmId)
    let url = directory.appendingPathComponent(fileName, isDirectory: false)
    let duration = try await SpeechSoundWriter.render(
      text: affirmation,
      locale: locale,
      voiceIdentifier: voiceIdentifier,
      to: url
    )
    return PreparedAffirmationSound(fileName: fileName, url: url, duration: duration)
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

  private func cancelExistingAlarm(id: UUID) throws {
    let exists = try alarmManager.alarms.contains { $0.id == id }
    guard exists else { return }
    try alarmManager.cancel(id: id)
    removeTrackedSound(for: id)
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

  private func makeSoundFileName(_ requestedName: String?, alarmId: UUID) -> String {
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
    return "\(stem)-\(alarmId.uuidString.lowercased())-\(revision).caf"
  }

  private func rememberSound(_ fileName: String, for alarmId: UUID) {
    var sounds = defaults.dictionary(forKey: soundsDefaultsKey) as? [String: String] ?? [:]
    if let previous = sounds[alarmId.uuidString], previous != fileName {
      removeSoundFile(named: previous)
    }
    sounds[alarmId.uuidString] = fileName
    defaults.set(sounds, forKey: soundsDefaultsKey)
  }

  private func removeTrackedSound(for alarmId: UUID) {
    var sounds = defaults.dictionary(forKey: soundsDefaultsKey) as? [String: String] ?? [:]
    if let fileName = sounds.removeValue(forKey: alarmId.uuidString) {
      removeSoundFile(named: fileName)
    }
    defaults.set(sounds, forKey: soundsDefaultsKey)
  }

  private func removeSoundFile(named fileName: String) {
    guard URL(fileURLWithPath: fileName).lastPathComponent == fileName,
          let directory = try? soundsDirectory() else {
      return
    }
    try? FileManager.default.removeItem(
      at: directory.appendingPathComponent(fileName, isDirectory: false)
    )
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
    var result: [String: Any] = [
      "supported": true,
      "authorization": authorization,
      "apiVersion": "1",
      "scheduledAlarmIds": (try? alarmManager.alarms.map { $0.id.uuidString }) ?? []
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
    // A replacement may have removed the previous alarm before a later step
    // failed. Report the post-operation truth so JavaScript never displays a
    // wake-up alarm that AlarmKit no longer owns.
    if let alarms = try? alarmManager.alarms {
      result["scheduledAlarmIds"] = alarms.map { $0.id.uuidString }
    }
    if let error { result["nativeErrorCode"] = String(describing: type(of: error)) }
    return result
  }
}
#endif
