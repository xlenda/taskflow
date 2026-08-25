import ExpoModulesCore
import Foundation

struct AffirmationSchedulePayload: Record {
  @Field var alarmId: String = ""
  @Field var time: String = ""
  @Field var hour: Int = -1
  @Field var minute: Int = -1
  @Field var weekdays: [Int] = []
  @Field var title: String = "Celeste"
  @Field var affirmation: String = ""
  @Field var locale: String = "pt-BR"
  @Field var stopLabel: String = "Parar"
  @Field var voiceIdentifier: String?
  @Field var soundFileName: String?
  @Field var requestAuthorization: Bool = true
}

struct AffirmationTestPayload: Record {
  @Field var alarmId: String = ""
  @Field var title: String = "Celeste"
  @Field var affirmation: String = ""
  @Field var locale: String = "pt-BR"
  @Field var stopLabel: String = "Parar"
  @Field var voiceIdentifier: String?
  @Field var soundFileName: String?
  @Field var delaySeconds: Int = 60
  @Field var requestAuthorization: Bool = true
}

struct AffirmationCancelPayload: Record {
  @Field var alarmId: String = ""
}

public final class CelesteAffirmationAlarmModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CelesteAffirmationAlarm")

    AsyncFunction("getCapability") { () async -> [String: Any] in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return await AffirmationAlarmCoordinator.shared.capability()
      }
      return Self.unsupportedCapability(reason: "ios_version_unsupported")
      #else
      return Self.unsupportedCapability(reason: "alarmkit_sdk_unavailable")
      #endif
    }

    AsyncFunction("requestAuthorization") { () async -> [String: Any] in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return await AffirmationAlarmCoordinator.shared.requestAuthorization()
      }
      return Self.unsupportedCapability(reason: "ios_version_unsupported")
      #else
      return Self.unsupportedCapability(reason: "alarmkit_sdk_unavailable")
      #endif
    }

    AsyncFunction("schedule") { (payload: AffirmationSchedulePayload) async -> [String: Any] in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return await AffirmationAlarmCoordinator.shared.schedule(payload)
      }
      return Self.unsupportedResult(
        operation: "schedule",
        alarmId: payload.alarmId,
        reason: "ios_version_unsupported"
      )
      #else
      return Self.unsupportedResult(
        operation: "schedule",
        alarmId: payload.alarmId,
        reason: "alarmkit_sdk_unavailable"
      )
      #endif
    }

    AsyncFunction("cancel") { (payload: AffirmationCancelPayload) async -> [String: Any] in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return await AffirmationAlarmCoordinator.shared.cancel(payload.alarmId)
      }
      return Self.unsupportedResult(
        operation: "cancel",
        alarmId: payload.alarmId,
        reason: "ios_version_unsupported"
      )
      #else
      return Self.unsupportedResult(
        operation: "cancel",
        alarmId: payload.alarmId,
        reason: "alarmkit_sdk_unavailable"
      )
      #endif
    }

    AsyncFunction("test") { (payload: AffirmationTestPayload) async -> [String: Any] in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return await AffirmationAlarmCoordinator.shared.test(payload)
      }
      return Self.unsupportedResult(
        operation: "test",
        alarmId: payload.alarmId,
        reason: "ios_version_unsupported"
      )
      #else
      return Self.unsupportedResult(
        operation: "test",
        alarmId: payload.alarmId,
        reason: "alarmkit_sdk_unavailable"
      )
      #endif
    }
  }

  private static func unsupportedCapability(reason: String) -> [String: Any] {
    [
      "supported": false,
      "authorization": "unavailable",
      "apiVersion": "1",
      "reason": reason
    ]
  }

  private static func unsupportedResult(
    operation: String,
    alarmId: String,
    reason: String
  ) -> [String: Any] {
    [
      "ok": false,
      "operation": operation,
      "alarmId": alarmId,
      "reason": reason
    ]
  }
}
