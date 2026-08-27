import { requireOptionalNativeModule } from 'expo-modules-core';
import { NativeModules, Platform } from 'react-native';

const AFFIRMATION_ALARM_NATIVE_MODULE = 'CelesteAffirmationAlarm';
const AFFIRMATION_ALARM_MIN_IOS_VERSION = 26;
const AFFIRMATION_ALARM_MIN_ANDROID_VERSION = 23;
export const DEFAULT_AFFIRMATION_ALARM_ID = 'c31e57e0-75ee-4de2-9526-0cc321f55a11';
export const AFFIRMATION_ALARM_MAX_WAV_BYTES = 1_500_000;
export const AFFIRMATION_ALARM_MAX_WAV_BASE64_CHARS = 2_000_000;

const DEFAULT_TEST_ALARM_ID = '81d83a39-af98-4879-9aad-22f08ffdb2d7';
const REQUIRED_NATIVE_METHODS = ['getCapability', 'schedule', 'cancel', 'test'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/;

function cleanText(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function cleanCode(value, fallback) {
  const code = cleanText(value, 80).toLowerCase().replace(/[^a-z0-9_:-]/g, '_');
  return code || fallback;
}

function iosMajor(version) {
  const parsed = Number.parseInt(String(version == null ? '' : version), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function androidApiLevel(version) {
  const parsed = Number.parseInt(String(version == null ? '' : version), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function nativeApiMajor(version) {
  const parsed = Number.parseInt(String(version == null ? '' : version), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveNativeModule() {
  let expoModule = null;
  try {
    expoModule = requireOptionalNativeModule(AFFIRMATION_ALARM_NATIVE_MODULE);
  } catch (_error) {
    // A missing optional module is an expected capability state (for example, Expo Go or web).
  }
  return expoModule || (NativeModules && NativeModules[AFFIRMATION_ALARM_NATIVE_MODULE]) || null;
}

function baseCapability(platform) {
  return {
    platform: platform.OS,
    minimumIOSVersion: AFFIRMATION_ALARM_MIN_IOS_VERSION,
    minimumAndroidVersion: AFFIRMATION_ALARM_MIN_ANDROID_VERSION,
    nativeModuleAvailable: false,
    supported: false,
    canSchedule: false,
    canCancel: false,
    canTest: false,
    canRequestAuthorization: false,
    authorization: 'unavailable',
    status: 'unsupported',
    reason: 'platform_unsupported',
  };
}

function platformCapability(platform, nativeModule) {
  const capability = baseCapability(platform);
  if (platform.OS === 'web') return { ...capability, reason: 'web_unsupported' };
  if (platform.OS === 'ios') {
    const major = iosMajor(platform.Version);
    if (major == null || major < AFFIRMATION_ALARM_MIN_IOS_VERSION) {
      return { ...capability, reason: 'ios_version_unsupported' };
    }
  } else if (platform.OS === 'android') {
    const apiLevel = androidApiLevel(platform.Version);
    if (apiLevel == null || apiLevel < AFFIRMATION_ALARM_MIN_ANDROID_VERSION) {
      return { ...capability, reason: 'android_version_unsupported' };
    }
  } else {
    return capability;
  }
  if (!nativeModule) {
    return {
      ...capability,
      status: 'native_module_missing',
      reason: 'native_module_missing',
    };
  }

  const missingMethods = REQUIRED_NATIVE_METHODS.filter(
    (method) => typeof nativeModule[method] !== 'function'
  );
  if (missingMethods.length) {
    return {
      ...capability,
      nativeModuleAvailable: true,
      status: 'native_module_incomplete',
      reason: 'native_module_incomplete',
      missingMethods,
    };
  }

  return {
    ...capability,
    nativeModuleAvailable: true,
    authorization: 'unknown',
    status: 'checking',
    reason: null,
  };
}

function normalizeAuthorization(value) {
  const compact = cleanCode(value, 'unknown').replace(/[-:]/g, '_');
  if (compact === 'notdetermined') return 'not_determined';
  if (compact === 'restricted') return 'denied';
  return ['authorized', 'denied', 'not_determined'].includes(compact) ? compact : 'unknown';
}

function normalizeNativeCapability(base, reported, nativeModule) {
  if (!reported || reported.supported !== true) {
    return {
      ...base,
      status: 'unsupported',
      reason: cleanCode(reported && reported.reason, 'native_reported_unsupported'),
    };
  }

  const authorization = normalizeAuthorization(reported.authorization);
  const scheduledAlarmIds = Array.isArray(reported.scheduledAlarmIds)
    ? reported.scheduledAlarmIds
        .map((alarmId) => cleanText(alarmId, 80))
        .filter((alarmId) => UUID_PATTERN.test(alarmId))
    : null;
  const authorized = authorization === 'authorized';
  const needsAuthorization = authorization === 'not_determined';
  const denied = authorization === 'denied';
  return {
    ...base,
    supported: true,
    canSchedule: authorized,
    canCancel: true,
    canTest: authorized,
    canRequestAuthorization:
      needsAuthorization && typeof nativeModule.requestAuthorization === 'function',
    authorization,
    status: authorized
      ? 'available'
      : needsAuthorization
      ? 'authorization_required'
      : denied
      ? 'authorization_denied'
      : 'authorization_unknown',
    reason: authorized
      ? null
      : needsAuthorization
      ? cleanCode(reported.reason, 'authorization_required')
      : denied
      ? cleanCode(reported.reason, 'authorization_denied')
      : cleanCode(reported.reason, 'authorization_unknown'),
    nativeApiVersion: cleanText(reported.apiVersion, 20) || null,
    scheduledAlarmIds,
  };
}

function failure(operation, reason, capability, extra = {}) {
  return {
    ok: false,
    operation,
    scheduled: false,
    reason,
    capability,
    ...extra,
  };
}

function normalizeWeekdays(value) {
  const source = value == null ? [1, 2, 3, 4, 5, 6, 7] : value;
  if (!Array.isArray(source) || source.length === 0) return null;
  const weekdays = [...new Set(source)];
  if (weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return null;
  return weekdays.sort((left, right) => left - right);
}

function decodeBase64Prefix(value, byteCount) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes = [];
  let buffer = 0;
  let bufferedBits = 0;

  for (let index = 0; index < value.length && bytes.length < byteCount; index += 1) {
    const character = value[index];
    if (character === '=') break;
    const digit = alphabet.indexOf(character);
    if (digit < 0) return null;
    buffer = (buffer << 6) | digit;
    bufferedBits += 6;
    while (bufferedBits >= 8 && bytes.length < byteCount) {
      bufferedBits -= 8;
      bytes.push((buffer >> bufferedBits) & 0xff);
      buffer &= bufferedBits === 0 ? 0 : (1 << bufferedBits) - 1;
    }
  }

  return bytes;
}

function isStrictBase64(value) {
  let paddingCount = 0;
  let reachedPadding = false;

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x3d) {
      reachedPadding = true;
      paddingCount += 1;
      if (paddingCount > 2) return false;
      continue;
    }
    if (reachedPadding) return false;
    const isLetter = (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
    const isNumber = code >= 0x30 && code <= 0x39;
    if (!isLetter && !isNumber && code !== 0x2b && code !== 0x2f) return false;
  }

  return true;
}

function normalizeNeuralWav(value) {
  if (value == null) return { value: null };
  if (typeof value !== 'string' || value.length === 0) {
    return { error: 'invalid_audio_base64_wav' };
  }
  if (value.length > AFFIRMATION_ALARM_MAX_WAV_BASE64_CHARS) {
    return { error: 'audio_base64_wav_too_large' };
  }
  if (value.length % 4 !== 0 || !isStrictBase64(value)) {
    return { error: 'invalid_audio_base64_wav' };
  }

  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const decodedBytes = (value.length / 4) * 3 - padding;
  if (decodedBytes < 12) return { error: 'invalid_audio_base64_wav' };
  if (decodedBytes > AFFIRMATION_ALARM_MAX_WAV_BYTES) {
    return { error: 'audio_base64_wav_too_large' };
  }

  const header = decodeBase64Prefix(value, 12);
  const isWav =
    header &&
    header.length === 12 &&
    header[0] === 0x52 &&
    header[1] === 0x49 &&
    header[2] === 0x46 &&
    header[3] === 0x46 &&
    header[8] === 0x57 &&
    header[9] === 0x41 &&
    header[10] === 0x56 &&
    header[11] === 0x45;
  if (!isWav) return { error: 'invalid_audio_base64_wav' };

  return { value };
}

function normalizeAlarmContent(input, fallbackId) {
  if (!input || typeof input !== 'object') return { error: 'invalid_input' };
  const alarmId = cleanText(input.alarmId || fallbackId, 80);
  const affirmation = cleanText(input.affirmation, 800);
  const title = cleanText(input.title, 120) || 'Celeste';
  const locale = cleanText(input.locale, 32) || 'pt-BR';
  const stopLabel = cleanText(input.stopLabel, 32) || (/^en(?:-|$)/i.test(locale) ? 'Stop' : 'Parar');
  const voiceIdentifier = cleanText(input.voiceIdentifier, 160) || null;
  const soundFileName = cleanText(input.soundFileName, 120) || null;
  const neuralWav = normalizeNeuralWav(input.audioBase64Wav);

  if (!UUID_PATTERN.test(alarmId)) return { error: 'invalid_alarm_id' };
  if (!affirmation) return { error: 'missing_affirmation' };
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) return { error: 'invalid_locale' };
  if (soundFileName && !FILE_NAME_PATTERN.test(soundFileName)) {
    return { error: 'invalid_sound_file_name' };
  }
  if (neuralWav.error) return neuralWav;

  const value = {
    alarmId,
    affirmation,
    title,
    locale,
    stopLabel,
    voiceIdentifier,
    soundFileName,
  };
  if (neuralWav.value) value.audioBase64Wav = neuralWav.value;

  return { value };
}

function normalizeScheduleInput(input) {
  const content = normalizeAlarmContent(input, DEFAULT_AFFIRMATION_ALARM_ID);
  if (content.error) return content;
  const match = TIME_PATTERN.exec(cleanText(input.time, 5));
  const weekdays = normalizeWeekdays(input.weekdays);
  if (!match) return { error: 'invalid_time' };
  if (!weekdays) return { error: 'invalid_weekdays' };
  return {
    value: {
      ...content.value,
      time: `${match[1]}:${match[2]}`,
      hour: Number(match[1]),
      minute: Number(match[2]),
      weekdays,
      requestAuthorization: input.requestAuthorization !== false,
    },
  };
}

function normalizeTestInput(input) {
  const content = normalizeAlarmContent(input, DEFAULT_TEST_ALARM_ID);
  if (content.error) return content;
  const delaySeconds = input.delaySeconds == null ? 60 : Number(input.delaySeconds);
  if (!Number.isInteger(delaySeconds) || delaySeconds < 10 || delaySeconds > 300) {
    return { error: 'invalid_test_delay' };
  }
  return {
    value: {
      ...content.value,
      delaySeconds,
      requestAuthorization: input.requestAuthorization !== false,
    },
  };
}

function normalizeNativeResult(operation, response, capability, alarmId) {
  if (!response || response.ok !== true) {
    const scheduledAlarmIds = Array.isArray(response && response.scheduledAlarmIds)
      ? response.scheduledAlarmIds
          .map((id) => cleanText(id, 80))
          .filter((id) => UUID_PATTERN.test(id))
      : null;
    const extra = alarmId ? { alarmId } : {};
    if (scheduledAlarmIds) extra.scheduledAlarmIds = scheduledAlarmIds;
    return failure(
      operation,
      cleanCode(response && response.reason, 'native_result_unconfirmed'),
      capability,
      extra
    );
  }

  const result = {
    ok: true,
    operation,
    reason: null,
    capability,
  };
  if (alarmId) result.alarmId = cleanText(response.alarmId, 80) || alarmId;
  if (operation === 'cancel') result.cancelled = true;
  if (operation === 'schedule' || operation === 'test') result.scheduled = true;
  if (operation === 'test') result.test = true;
  const scheduledFor = cleanText(response.scheduledFor, 80);
  const soundFileName = cleanText(response.soundFileName, 120);
  const soundSource = cleanCode(response.soundSource, '');
  if (scheduledFor) result.scheduledFor = scheduledFor;
  if (soundFileName) result.soundFileName = soundFileName;
  if (['neural_wav', 'local_speech'].includes(soundSource)) result.soundSource = soundSource;
  return result;
}

/**
 * Adapter for an optional native bridge named `CelesteAffirmationAlarm`.
 *
 * Native contract (all methods async):
 * - getCapability() -> { supported, authorization, apiVersion? }
 * - requestAuthorization() -> { authorization }
 * - schedule(payload) -> { ok, alarmId, scheduledFor?, soundFileName?, reason? }
 * - cancel({ alarmId }) -> { ok, alarmId?, reason? }
 * - test(payload) -> { ok, alarmId, scheduledFor?, soundFileName?, reason? }
 *
 * `schedule` receives a local weekly schedule (`time`, ISO weekdays 1...7) and
 * affirmation text. `audioBase64Wav` may carry a pre-generated neural WAV; when
 * omitted, the native side renders local speech. The native side owns its
 * private sound file, authorization and lifecycle. The web adapter never
 * creates a timer or claims that a browser can wake the user.
 */
export function createAffirmationAlarmAdapter({
  platform = Platform,
  getNativeModule = resolveNativeModule,
} = {}) {
  async function inspect() {
    const nativeModule = getNativeModule();
    const base = platformCapability(platform, nativeModule);
    if (base.status !== 'checking') return { capability: base, nativeModule };
    try {
      const reported = await nativeModule.getCapability();
      return {
        capability: normalizeNativeCapability(base, reported, nativeModule),
        nativeModule,
      };
    } catch (error) {
      return {
        capability: {
          ...base,
          status: 'unavailable',
          reason: 'native_capability_error',
          nativeErrorCode: cleanCode(error && error.code, 'unknown'),
        },
        nativeModule,
      };
    }
  }

  async function authorizeIfNeeded(nativeModule, capability, shouldRequest) {
    if (capability.authorization !== 'not_determined' || !shouldRequest) return capability;
    if (typeof nativeModule.requestAuthorization !== 'function') return capability;
    try {
      const response = await nativeModule.requestAuthorization();
      return normalizeNativeCapability(
        capability,
        {
          supported: true,
          authorization: response && response.authorization,
          reason: response && response.reason,
          apiVersion: capability.nativeApiVersion,
          scheduledAlarmIds: capability.scheduledAlarmIds,
        },
        nativeModule
      );
    } catch (error) {
      return {
        ...capability,
        canSchedule: false,
        canTest: false,
        status: 'unavailable',
        reason: 'authorization_request_failed',
        nativeErrorCode: cleanCode(error && error.code, 'unknown'),
      };
    }
  }

  async function invoke(operation, payload) {
    const inspected = await inspect();
    let capability = inspected.capability;
    const { nativeModule } = inspected;
    if (!capability.supported) {
      return failure(operation, capability.reason, capability, { alarmId: payload.alarmId });
    }
    if (payload.audioBase64Wav && nativeApiMajor(capability.nativeApiVersion) < 2) {
      return failure(operation, 'neural_audio_unsupported', capability, {
        alarmId: payload.alarmId,
      });
    }
    if (capability.authorization === 'denied') {
      return failure(operation, 'authorization_denied', capability, { alarmId: payload.alarmId });
    }
    if (capability.authorization === 'not_determined' && payload.requestAuthorization === false) {
      return failure(operation, 'authorization_required', capability, { alarmId: payload.alarmId });
    }

    capability = await authorizeIfNeeded(
      nativeModule,
      capability,
      payload.requestAuthorization !== false
    );
    if (capability.authorization === 'denied' || capability.status === 'unavailable') {
      return failure(operation, capability.reason, capability, { alarmId: payload.alarmId });
    }

    try {
      const response = await nativeModule[operation](payload);
      return normalizeNativeResult(operation, response, capability, payload.alarmId);
    } catch (error) {
      return failure(operation, 'native_operation_failed', capability, {
        alarmId: payload.alarmId,
        nativeErrorCode: cleanCode(error && error.code, 'unknown'),
      });
    }
  }

  async function getCapability() {
    return (await inspect()).capability;
  }

  async function requestAuthorization() {
    const inspected = await inspect();
    if (!inspected.capability.supported) {
      return failure('authorize', inspected.capability.reason, inspected.capability);
    }
    if (inspected.capability.authorization === 'authorized') {
      return { ok: true, operation: 'authorize', capability: inspected.capability };
    }
    const capability = await authorizeIfNeeded(
      inspected.nativeModule,
      inspected.capability,
      true
    );
    if (capability.authorization !== 'authorized') {
      return failure('authorize', capability.reason || 'authorization_required', capability);
    }
    return { ok: true, operation: 'authorize', capability };
  }

  async function schedule(input) {
    const normalized = normalizeScheduleInput(input);
    if (normalized.error) {
      return failure('schedule', normalized.error, await getCapability());
    }
    return invoke('schedule', normalized.value);
  }

  async function cancel(alarmId = DEFAULT_AFFIRMATION_ALARM_ID) {
    const id = cleanText(alarmId, 80);
    const inspected = await inspect();
    if (!UUID_PATTERN.test(id)) {
      return failure('cancel', 'invalid_alarm_id', inspected.capability);
    }
    if (!inspected.nativeModule || typeof inspected.nativeModule.cancel !== 'function') {
      return failure('cancel', inspected.capability.reason, inspected.capability, { alarmId: id });
    }
    const isSupportedIOS =
      platform.OS === 'ios' && iosMajor(platform.Version) >= AFFIRMATION_ALARM_MIN_IOS_VERSION;
    const isSupportedAndroid =
      platform.OS === 'android' && androidApiLevel(platform.Version) >= AFFIRMATION_ALARM_MIN_ANDROID_VERSION;
    if (!isSupportedIOS && !isSupportedAndroid) {
      return failure('cancel', inspected.capability.reason, inspected.capability, { alarmId: id });
    }
    try {
      const response = await inspected.nativeModule.cancel({ alarmId: id });
      return normalizeNativeResult('cancel', response, inspected.capability, id);
    } catch (error) {
      return failure('cancel', 'native_operation_failed', inspected.capability, {
        alarmId: id,
        nativeErrorCode: cleanCode(error && error.code, 'unknown'),
      });
    }
  }

  async function test(input) {
    const normalized = normalizeTestInput(input);
    if (normalized.error) return failure('test', normalized.error, await getCapability());
    return invoke('test', normalized.value);
  }

  return { getCapability, requestAuthorization, schedule, cancel, test };
}

const affirmationAlarm = createAffirmationAlarmAdapter();

export function createSerializedAlarmController(adapter) {
  let tail = Promise.resolve();
  const enqueue = (operation) => {
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
  return {
    getCapability: () => enqueue(() => adapter.getCapability()),
    requestAuthorization: () => enqueue(() =>
      typeof adapter.requestAuthorization === 'function'
        ? adapter.requestAuthorization()
        : failure('authorize', 'authorization_unavailable', null)
    ),
    schedule: (input) => enqueue(() => adapter.schedule(input)),
    replaceScheduled: (input) => enqueue(async () => {
      const capability = await adapter.getCapability();
      const alarmId = cleanText(input && input.alarmId, 80) || DEFAULT_AFFIRMATION_ALARM_ID;
      const scheduledAlarmIds = capability && capability.scheduledAlarmIds;
      if (!Array.isArray(scheduledAlarmIds) || !scheduledAlarmIds.includes(alarmId)) {
        return failure('schedule', 'alarm_not_scheduled', capability, {
          alarmId,
          scheduledAlarmIds: Array.isArray(scheduledAlarmIds) ? scheduledAlarmIds : [],
        });
      }
      return adapter.schedule(input);
    }),
    cancel: (alarmId) => enqueue(() => adapter.cancel(alarmId)),
    test: (input) => enqueue(() => adapter.test(input)),
  };
}

const serializedAlarm = createSerializedAlarmController(affirmationAlarm);

export const getAffirmationAlarmCapability = serializedAlarm.getCapability;
export const requestAffirmationAlarmAuthorization = serializedAlarm.requestAuthorization;
export const scheduleAffirmationAlarm = serializedAlarm.schedule;
export const replaceScheduledAffirmationAlarm = serializedAlarm.replaceScheduled;
export const cancelAffirmationAlarm = serializedAlarm.cancel;
