import { NativeModules, Platform } from 'react-native';

const MODULE_NAME = 'CelestePracticeSpeech';
const DEFAULT_LOCALE = 'pt-BR';
const WEB_TIMEOUT_MS = 20_000;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const ERROR_CODES = new Set([
  'android_version_unsupported',
  'audio_error',
  'cancelled',
  'client_error',
  'invalid_locale',
  'language_not_supported',
  'language_unavailable',
  'module_destroyed',
  'native_module_error',
  'native_module_missing',
  'no_match',
  'on_device_recognizer_error',
  'on_device_unavailable',
  'permission_denied',
  'permission_required',
  'platform_unsupported',
  'rate_limited',
  'recognition_error',
  'recognition_timeout',
  'recognizer_busy',
  'recognizer_unavailable',
  'speech_timeout',
  'web_speech_unavailable',
]);

let activeWebSession = null;

function cleanCode(value, fallback = 'recognition_error') {
  const code = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    : '';
  return ERROR_CODES.has(code) ? code : fallback;
}

function speechError(code, fallback = 'recognition_error') {
  const normalized = cleanCode(code, fallback);
  const error = new Error(normalized);
  error.code = normalized;
  return error;
}

function normalizeLocale(options) {
  const locale = typeof options?.locale === 'string' ? options.locale.trim() : DEFAULT_LOCALE;
  if (!LOCALE_PATTERN.test(locale)) throw speechError('invalid_locale');
  return locale;
}

function resolveNativeModule() {
  if (!['android', 'ios'].includes(Platform.OS)) return null;
  try {
    const { requireOptionalNativeModule } = require('expo-modules-core');
    const expoModule = typeof requireOptionalNativeModule === 'function'
      ? requireOptionalNativeModule(MODULE_NAME)
      : null;
    return expoModule || NativeModules?.[MODULE_NAME] || null;
  } catch (_error) {
    return NativeModules?.[MODULE_NAME] || null;
  }
}

function unsupportedCapability(platform, reason) {
  return {
    platform,
    supported: false,
    onDevice: false,
    authorization: 'unavailable',
    canRecognize: false,
    canRequestPermission: false,
    reason,
  };
}

function webSpeechConstructor() {
  if (Platform.OS !== 'web' || typeof globalThis === 'undefined') return null;
  return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
}

async function webPermissionState() {
  if (Platform.OS !== 'web') return 'unavailable';
  const permissions = globalThis.navigator?.permissions;
  if (!permissions || typeof permissions.query !== 'function') return 'prompt';
  try {
    const status = await permissions.query({ name: 'microphone' });
    return ['granted', 'denied', 'prompt'].includes(status?.state) ? status.state : 'prompt';
  } catch (_error) {
    return 'prompt';
  }
}

async function webCapability() {
  const available = Boolean(webSpeechConstructor());
  if (!available) return unsupportedCapability('web', 'web_speech_unavailable');
  const authorization = await webPermissionState();
  return {
    platform: 'web',
    supported: true,
    onDevice: false,
    authorization,
    canRecognize: authorization !== 'denied',
    canRequestPermission: authorization === 'prompt',
    reason: authorization === 'denied' ? 'permission_denied' : null,
  };
}

function normalizeCapability(reported, platform) {
  if (!reported || reported.supported !== true || reported.onDevice !== true) {
    return {
      ...unsupportedCapability(platform, cleanCode(reported?.reason, 'on_device_unavailable')),
      onDevice: true,
      nativeModuleAvailable: true,
    };
  }
  const authorization = ['authorized', 'required', 'denied'].includes(reported.authorization)
    ? reported.authorization
    : 'required';
  return {
    platform,
    supported: true,
    onDevice: true,
    nativeModuleAvailable: true,
    authorization,
    canRecognize: reported.canRecognize === true && authorization === 'authorized',
    canRequestPermission: reported.canRequestPermission === true,
    reason: reported.reason == null ? null : cleanCode(reported.reason, 'recognition_error'),
    apiVersion: typeof reported.apiVersion === 'string' ? reported.apiVersion : null,
  };
}

function normalizeRecognitionResult(result) {
  const sourceCandidates = Array.isArray(result?.candidates) ? result.candidates : [];
  const sourceConfidence = Array.isArray(result?.confidence) ? result.confidence : [];
  const candidates = [];
  const confidence = [];
  const seen = new Set();

  sourceCandidates.slice(0, 5).forEach((value, index) => {
    const candidate = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
    const score = Number(sourceConfidence[index]);
    confidence.push(Number.isFinite(score) && score >= 0 ? Math.min(score, 1) : null);
  });

  if (candidates.length === 0) throw speechError('no_match');
  return { candidates, confidence };
}

async function nativeCapability(platform, nativeModule = resolveNativeModule(), locale = DEFAULT_LOCALE) {
  if (!nativeModule || typeof nativeModule.getCapability !== 'function') {
    return {
      ...unsupportedCapability(platform, 'native_module_missing'),
      onDevice: true,
      nativeModuleAvailable: false,
    };
  }
  try {
    return normalizeCapability(await nativeModule.getCapability({ locale }), platform);
  } catch (_error) {
    return {
      ...unsupportedCapability(platform, 'native_module_error'),
      onDevice: true,
      nativeModuleAvailable: true,
    };
  }
}

export async function getCapability(options = {}) {
  const locale = normalizeLocale(options);
  if (Platform.OS === 'web') return webCapability();
  if (!['android', 'ios'].includes(Platform.OS)) {
    return unsupportedCapability(Platform.OS, 'platform_unsupported');
  }
  return nativeCapability(Platform.OS, undefined, locale);
}

export async function requestPermission(options = {}) {
  const locale = normalizeLocale(options);
  if (Platform.OS === 'web') {
    const capability = await webCapability();
    if (!capability.supported || capability.authorization !== 'prompt') return capability;
    const getUserMedia = globalThis.navigator?.mediaDevices?.getUserMedia;
    if (typeof getUserMedia !== 'function') return capability;
    try {
      const stream = await getUserMedia.call(globalThis.navigator.mediaDevices, { audio: true });
      stream?.getTracks?.().forEach((track) => track.stop());
      return webCapability();
    } catch (_error) {
      return { ...capability, authorization: 'denied', canRecognize: false, reason: 'permission_denied' };
    }
  }
  if (!['android', 'ios'].includes(Platform.OS)) {
    return unsupportedCapability(Platform.OS, 'platform_unsupported');
  }

  const nativeModule = resolveNativeModule();
  const capability = await nativeCapability(Platform.OS, nativeModule, locale);
  if (!nativeModule || !capability.supported || capability.authorization === 'authorized') {
    return capability;
  }
  if (typeof nativeModule.requestPermission !== 'function') {
    return { ...capability, canRequestPermission: false, reason: 'native_module_missing' };
  }
  try {
    return normalizeCapability(await nativeModule.requestPermission({ locale }), Platform.OS);
  } catch (error) {
    throw speechError(error?.code, 'permission_denied');
  }
}

function recognizeOnWeb(locale) {
  const SpeechRecognition = webSpeechConstructor();
  if (!SpeechRecognition) return Promise.reject(speechError('web_speech_unavailable'));
  if (activeWebSession) return Promise.reject(speechError('recognizer_busy'));

  return new Promise((resolve, reject) => {
    const recognizer = new SpeechRecognition();
    const session = { recognizer, reject, settled: false, timeout: null };
    activeWebSession = session;

    const finish = (result, errorCode) => {
      if (session.settled) return;
      session.settled = true;
      if (activeWebSession === session) activeWebSession = null;
      clearTimeout(session.timeout);
      recognizer.onresult = null;
      recognizer.onerror = null;
      recognizer.onend = null;
      try {
        recognizer.abort();
      } catch (_error) {
        // The browser may already have closed the recognition session.
      }
      if (errorCode) {
        reject(speechError(errorCode));
        return;
      }
      try {
        resolve(normalizeRecognitionResult(result));
      } catch (error) {
        reject(speechError(error?.code, 'no_match'));
      }
    };

    recognizer.lang = locale;
    recognizer.continuous = false;
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 5;
    recognizer.onresult = (event) => {
      const alternatives = event?.results?.[event.resultIndex || 0];
      const candidates = [];
      const confidence = [];
      for (let index = 0; alternatives && index < alternatives.length && index < 5; index += 1) {
        candidates.push(alternatives[index]?.transcript);
        confidence.push(alternatives[index]?.confidence);
      }
      finish({ candidates, confidence });
    };
    recognizer.onerror = (event) => {
      const code = {
        'audio-capture': 'audio_error',
        'bad-grammar': 'recognition_error',
        'language-not-supported': 'language_not_supported',
        'network': 'recognition_error',
        'no-speech': 'speech_timeout',
        'not-allowed': 'permission_denied',
        'service-not-allowed': 'permission_denied',
      }[event?.error] || 'recognition_error';
      finish(null, code);
    };
    recognizer.onend = () => finish(null, 'no_match');
    session.timeout = setTimeout(() => finish(null, 'recognition_timeout'), WEB_TIMEOUT_MS);

    try {
      recognizer.start();
    } catch (_error) {
      finish(null, 'recognizer_unavailable');
    }
  });
}

export async function recognize(options = {}) {
  const locale = normalizeLocale(options);
  if (Platform.OS === 'web') return recognizeOnWeb(locale);
  if (!['android', 'ios'].includes(Platform.OS)) throw speechError('on_device_unavailable');

  const nativeModule = resolveNativeModule();
  if (!nativeModule || typeof nativeModule.recognize !== 'function') {
    throw speechError('native_module_missing');
  }
  try {
    return normalizeRecognitionResult(await nativeModule.recognize({ locale }));
  } catch (error) {
    throw speechError(error?.code, 'recognition_error');
  }
}

export async function cancel() {
  if (Platform.OS === 'web') {
    const session = activeWebSession;
    if (!session || session.settled) return;
    session.settled = true;
    activeWebSession = null;
    clearTimeout(session.timeout);
    session.recognizer.onresult = null;
    session.recognizer.onerror = null;
    session.recognizer.onend = null;
    try {
      session.recognizer.abort();
    } catch (_error) {
      // The browser may already have closed the recognition session.
    }
    session.reject(speechError('cancelled'));
    return;
  }
  if (!['android', 'ios'].includes(Platform.OS)) return;
  const nativeModule = resolveNativeModule();
  if (nativeModule && typeof nativeModule.cancel === 'function') {
    try {
      await nativeModule.cancel();
    } catch (error) {
      throw speechError(error?.code, 'recognition_error');
    }
  }
}

export default { getCapability, requestPermission, recognize, cancel };
