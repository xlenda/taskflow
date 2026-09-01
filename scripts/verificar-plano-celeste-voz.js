const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const serviceFile = path.join(root, 'services', 'practiceSpeech.js');
const ritualScreenFile = path.join(root, 'screens', 'PracticeRitualScreen.js');
const appContextFile = path.join(root, 'context', 'AppContext.js');
const practicePlanFile = path.join(root, 'utils', 'practicePlan.js');
const moduleRoot = path.join(root, 'modules', 'celeste-practice-speech');
const moduleConfigFile = path.join(moduleRoot, 'expo-module.config.json');
const manifestFile = path.join(moduleRoot, 'android', 'src', 'main', 'AndroidManifest.xml');
const podspecFile = path.join(moduleRoot, 'ios', 'CelestePracticeSpeech.podspec');
const swiftFile = path.join(moduleRoot, 'ios', 'CelestePracticeSpeechModule.swift');
const kotlinFile = path.join(
  moduleRoot,
  'android',
  'src',
  'main',
  'java',
  'expo',
  'modules',
  'celestepracticespeech',
  'CelestePracticeSpeechModule.kt'
);

function compileService() {
  const source = fs.readFileSync(serviceFile, 'utf8');
  return {
    source,
    compiled: transformSync(source, {
      filename: serviceFile,
      presets: ['babel-preset-expo'],
      sourceType: 'module',
    }).code,
  };
}

function loadService(compiled, { platform, nativeModule = null, webGlobals = {} }) {
  const loaded = new Module(serviceFile, module);
  loaded.filename = serviceFile;
  loaded.paths = Module._nodeModulePaths(path.dirname(serviceFile));
  const originalLoad = Module._load;
  const originalGlobals = new Map();

  Object.entries(webGlobals).forEach(([key, value]) => {
    originalGlobals.set(key, globalThis[key]);
    globalThis[key] = value;
  });

  Module._load = (request, parent, isMain) => {
    if (request === 'react-native') {
      return {
        NativeModules: nativeModule ? { CelestePracticeSpeech: nativeModule } : {},
        Platform: { OS: platform, Version: platform === 'android' ? 35 : undefined },
      };
    }
    if (request === 'expo-modules-core') {
      return { requireOptionalNativeModule: () => nativeModule };
    }
    return originalLoad(request, parent, isMain);
  };

  try {
    loaded._compile(compiled, serviceFile);
    return loaded.exports;
  } finally {
    Module._load = originalLoad;
    originalGlobals.forEach((value, key) => {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    });
  }
}

async function main() {
  const { source: serviceSource, compiled } = compileService();
  const ritualScreen = fs.readFileSync(ritualScreenFile, 'utf8');
  const appContext = fs.readFileSync(appContextFile, 'utf8');
  const practicePlan = fs.readFileSync(practicePlanFile, 'utf8');
  const moduleConfig = JSON.parse(fs.readFileSync(moduleConfigFile, 'utf8'));
  const manifest = fs.readFileSync(manifestFile, 'utf8');
  const kotlin = fs.readFileSync(kotlinFile, 'utf8');
  const podspec = fs.readFileSync(podspecFile, 'utf8');
  const swift = fs.readFileSync(swiftFile, 'utf8');

  assert.deepStrictEqual(moduleConfig.platforms, ['apple', 'android']);
  assert.deepStrictEqual(moduleConfig.apple, {
    modules: ['CelestePracticeSpeechModule'],
    podspecPath: './ios/CelestePracticeSpeech.podspec',
    swiftModuleName: 'CelestePracticeSpeech',
  });
  assert.deepStrictEqual(moduleConfig.android.modules, [
    'expo.modules.celestepracticespeech.CelestePracticeSpeechModule',
  ]);

  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.match(manifest, /<queries>[\s\S]*android\.speech\.RecognitionService[\s\S]*<\/queries>/);
  assert.doesNotMatch(
    manifest,
    /WRITE_EXTERNAL_STORAGE|READ_EXTERNAL_STORAGE|READ_MEDIA_AUDIO|MANAGE_EXTERNAL_STORAGE|android\.permission\.INTERNET/
  );

  assert.match(kotlin, /SpeechRecognizer\.createOnDeviceSpeechRecognizer\s*\(/);
  assert.match(kotlin, /SpeechRecognizer\.isOnDeviceRecognitionAvailable\s*\(/);
  assert.match(kotlin, /Build\.VERSION_CODES\.S/);
  assert.match(kotlin, /Handler\(Looper\.getMainLooper\(\)\)/);
  assert.match(kotlin, /RECOGNITION_TIMEOUT_MS/);
  assert.match(kotlin, /recognizer\.destroy\(\)/);
  assert.match(kotlin, /RecognizerIntent\.EXTRA_PREFER_OFFLINE/);
  assert.doesNotMatch(kotlin, /SpeechRecognizer\.createSpeechRecognizer\s*\(/);
  assert.doesNotMatch(
    kotlin,
    /FileOutputStream|FileInputStream|MediaRecorder|AudioRecord|SharedPreferences|okhttp|HttpURLConnection|ACTION_WEB_SEARCH/
  );
  assert.match(kotlin, /"candidates" to candidates[\s\S]*"confidence" to confidence/);
  assert.match(
    kotlin,
    /AsyncFunction\("getCapability"\)\s*\{\s*_options:\s*PracticeSpeechOptions,\s*promise:\s*Promise/
  );
  assert.match(
    kotlin,
    /AsyncFunction\("requestPermission"\)\s*\{\s*_options:\s*PracticeSpeechOptions,\s*promise:\s*Promise/
  );
  assert.doesNotMatch(kotlin, /RESULTS_AUDIO|EXTRA_AUDIO_SOURCE|onPartialResults\([^)]*\)\s*\{[^}]+\}/);

  assert.match(podspec, /s\.dependency\s+'ExpoModulesCore'/);
  assert.match(podspec, /s\.frameworks\s*=\s*'AVFoundation',\s*'Speech'/);
  assert.match(podspec, /:ios\s*=>\s*'15\.1'/);
  assert.match(swift, /import AVFoundation/);
  assert.match(swift, /import Speech/);
  assert.match(swift, /Name\("CelestePracticeSpeech"\)/);
  assert.match(swift, /SFSpeechRecognizer\(locale:/);
  assert.match(swift, /recognizer\.supportsOnDeviceRecognition/);
  assert.match(swift, /request\.requiresOnDeviceRecognition\s*=\s*true/);
  assert.match(swift, /SFSpeechAudioBufferRecognitionRequest\(\)/);
  assert.match(swift, /AVAudioEngine\(\)/);
  assert.match(swift, /SFSpeechRecognizer\.requestAuthorization/);
  assert.match(swift, /requestRecordPermission/);
  assert.match(swift, /recognitionTimeout/);
  assert.match(swift, /audioEngine\.stop\(\)/);
  assert.match(swift, /removeTap\(onBus:\s*0\)/);
  assert.match(swift, /request\.endAudio\(\)/);
  assert.match(swift, /session\.task\?\.cancel\(\)/);
  assert.match(swift, /"candidates": normalized\.candidates[\s\S]*"confidence": normalized\.confidence/);
  assert.match(
    swift,
    /AsyncFunction\("getCapability"\)\s*\{\s*\(options:\s*PracticeSpeechOptions\)[\s\S]*?capability\(locale:\s*options\.locale\)/
  );
  assert.match(
    swift,
    /AsyncFunction\("requestPermission"\)\s*\{\s*\(options:\s*PracticeSpeechOptions,\s*promise:\s*Promise\)[\s\S]*?requestPermission\(locale:\s*options\.locale,\s*promise:\s*promise\)/
  );
  assert.doesNotMatch(swift, /requiresOnDeviceRecognition\s*=\s*false/);
  assert.doesNotMatch(
    swift,
    /SFSpeechURLRecognitionRequest|FileManager|Data\(contentsOf:|URLSession|MediaRecorder|print\s*\(|os_log/
  );
  const recognizeSection = swift.slice(swift.indexOf('private func startRecognition'));
  assert.doesNotMatch(recognizeSection, /SFSpeechRecognizer\.requestAuthorization|requestRecordPermission/);

  assert.match(serviceSource, /require\('expo-modules-core'\)/);
  assert.match(serviceSource, /\['android', 'ios'\]\.includes\(Platform\.OS\)/);
  assert.match(serviceSource, /Platform\.OS === 'web'/);
  assert.doesNotMatch(serviceSource, /ios_unsupported/);
  assert.doesNotMatch(serviceSource, /console\.|MediaRecorder|FileSystem|AsyncStorage|fetch\s*\(/);

  assert.match(ritualScreen, /getCapability\(\{\s*locale\s*\}\)/);
  assert.match(ritualScreen, /requestPermission\(\{\s*locale\s*\}\)/);
  assert.match(ritualScreen, /recognize\(\{\s*locale\s*\}\)/);
  assert.match(ritualScreen, /import\s*\{[\s\S]*?\bAppState\b[\s\S]*?\}\s*from 'react-native';/);
  assert.match(ritualScreen, /AppState\.addEventListener\(\s*['"]change['"]/);
  assert.match(
    ritualScreen,
    /if \(nextState === 'active' \|\| !mountedRef\.current\) return;[\s\S]*sessionRef\.current \+= 1;[\s\S]*cancelPracticeSpeech\(\)\.catch[\s\S]*setPhase\(\(current\) => current === 'complete' \? current : 'ready'\)/
  );
  assert.match(
    ritualScreen,
    /const match = bestSpeechMatch\(affirmationText,\s*result\?\.candidates,\s*speechLang\);/
  );
  assert.match(
    ritualScreen,
    /completePracticePlanSlot\(\{\s*slotId:\s*slot\.id,\s*method,\s*score\s*\}\)/
  );
  assert.doesNotMatch(
    ritualScreen,
    /\.\s*(?:rawTranscription|transcription)\b|(?:rawTranscription|transcription|candidates|audioUri|audioPath|audioData)\s*:/i
  );
  assert.doesNotMatch(ritualScreen, /AsyncStorage|SecureStore|FileSystem/);

  const completionSection = appContext.slice(
    appContext.indexOf('const completePracticePlanSlot'),
    appContext.indexOf('const saveMorningRitualPreferences')
  );
  assert.ok(completionSection.length > 0, 'completePracticePlanSlot must exist');
  assert.match(
    completionSection,
    /completePracticePlanSlot = useCallback\(\(\{\s*slotId,\s*method = 'speech',\s*score = 0\s*\} = \{\}\)/
  );
  assert.doesNotMatch(
    completionSection,
    /\b(?:candidates?|rawTranscription|transcription|audioUri|audioPath|audioData|audioFile)\b/i
  );

  const receiptSection = practicePlan.slice(
    practicePlan.indexOf('export function sanitizePracticeReceipt'),
    practicePlan.indexOf('export function sanitizePracticeReceipts')
  );
  assert.ok(receiptSection.length > 0, 'sanitizePracticeReceipt must exist');
  assert.doesNotMatch(
    receiptSection,
    /\b(?:candidates?|rawTranscription|transcription|audioUri|audioPath|audioData|audioFile)\b/i
  );

  const nativeCalls = [];
  const nativeModule = {
    getCapability: async (options) => {
      nativeCalls.push(['getCapability', options]);
      return {
        supported: true,
        onDevice: true,
        authorization: 'required',
        canRecognize: false,
        canRequestPermission: true,
        apiVersion: '1',
      };
    },
    requestPermission: async (options) => {
      nativeCalls.push(['requestPermission', options]);
      return {
        supported: true,
        onDevice: true,
        authorization: 'authorized',
        canRecognize: true,
        canRequestPermission: false,
        apiVersion: '1',
      };
    },
    recognize: async (options) => {
      nativeCalls.push(['recognize', options]);
      return {
        candidates: options?.locale === 'en-US'
          ? [' I move forward today. ', 'I move forward today.', 'I act now.']
          : [' Eu consigo hoje. ', 'Eu consigo hoje.', 'Eu consigo agora.'],
        confidence: options?.locale === 'en-US' ? [0.93, 0.82, 0.79] : [0.91, 0.8, -1],
        ignoredRawField: 'must not cross the adapter',
        transcript: 'must not cross the adapter',
        transcription: 'must not cross the adapter',
        rawTranscription: 'must not cross the adapter',
        audioData: 'must not cross the adapter',
      };
    },
    cancel: async () => nativeCalls.push(['cancel']),
  };
  const android = loadService(compiled, { platform: 'android', nativeModule });
  assert.strictEqual(typeof android.getCapability, 'function');
  assert.strictEqual(typeof android.requestPermission, 'function');
  assert.strictEqual(typeof android.recognize, 'function');
  assert.strictEqual(typeof android.cancel, 'function');
  const androidCapability = await android.getCapability();
  assert.strictEqual(androidCapability.supported, true);
  assert.strictEqual(androidCapability.onDevice, true);
  assert.strictEqual(androidCapability.authorization, 'required');
  const androidAuthorized = await android.requestPermission({ locale: 'pt-BR' });
  assert.strictEqual(androidAuthorized.authorization, 'authorized');
  const nativeResult = await android.recognize({ locale: 'pt-BR' });
  assert.deepStrictEqual(Object.keys(nativeResult).sort(), ['candidates', 'confidence']);
  assert.deepStrictEqual(nativeResult, {
    candidates: ['Eu consigo hoje.', 'Eu consigo agora.'],
    confidence: [0.91, null],
  });

  const androidEnglishCapability = await android.getCapability({ locale: 'en-US' });
  assert.strictEqual(androidEnglishCapability.authorization, 'required');
  const androidEnglishAuthorized = await android.requestPermission({ locale: 'en-US' });
  assert.strictEqual(androidEnglishAuthorized.authorization, 'authorized');
  const androidEnglishResult = await android.recognize({ locale: 'en-US' });
  assert.deepStrictEqual(Object.keys(androidEnglishResult).sort(), ['candidates', 'confidence']);
  assert.deepStrictEqual(androidEnglishResult, {
    candidates: ['I move forward today.', 'I act now.'],
    confidence: [0.93, 0.79],
  });
  await android.cancel();
  assert.deepStrictEqual(nativeCalls, [
    ['getCapability', { locale: 'pt-BR' }],
    ['getCapability', { locale: 'pt-BR' }],
    ['requestPermission', { locale: 'pt-BR' }],
    ['recognize', { locale: 'pt-BR' }],
    ['getCapability', { locale: 'en-US' }],
    ['getCapability', { locale: 'en-US' }],
    ['requestPermission', { locale: 'en-US' }],
    ['recognize', { locale: 'en-US' }],
    ['cancel'],
  ]);

  const iosCalls = [];
  const iosNativeModule = {
    getCapability: async (options) => {
      iosCalls.push(['getCapability', options]);
      return {
        supported: true,
        onDevice: true,
        authorization: 'required',
        canRecognize: false,
        canRequestPermission: true,
        apiVersion: '1',
      };
    },
    requestPermission: async (options) => {
      iosCalls.push(['requestPermission', options]);
      return {
        supported: true,
        onDevice: true,
        authorization: 'authorized',
        canRecognize: true,
        canRequestPermission: false,
        apiVersion: '1',
      };
    },
    recognize: async (options) => {
      iosCalls.push(['recognize', options]);
      return {
        candidates: options?.locale === 'en-US'
          ? [' My vision moves forward today. ', 'I act now.']
          : [' Minha visao avanca hoje. ', 'Eu ajo agora.'],
        confidence: options?.locale === 'en-US' ? [0.96, 0.84] : [0.94, 0.81],
        transcript: 'must not cross the adapter',
        transcription: 'must not cross the adapter',
        rawTranscription: 'must not cross the adapter',
        audioData: 'must not cross the adapter',
      };
    },
    cancel: async () => iosCalls.push(['cancel']),
  };
  const ios = loadService(compiled, { platform: 'ios', nativeModule: iosNativeModule });
  const iosCapability = await ios.getCapability();
  assert.strictEqual(iosCapability.platform, 'ios');
  assert.strictEqual(iosCapability.supported, true);
  assert.strictEqual(iosCapability.onDevice, true);
  assert.strictEqual(iosCapability.authorization, 'required');
  const iosAuthorized = await ios.requestPermission({ locale: 'pt-BR' });
  assert.strictEqual(iosAuthorized.authorization, 'authorized');
  const iosResult = await ios.recognize({ locale: 'pt-BR' });
  assert.deepStrictEqual(Object.keys(iosResult).sort(), ['candidates', 'confidence']);
  assert.deepStrictEqual(iosResult, {
    candidates: ['Minha visao avanca hoje.', 'Eu ajo agora.'],
    confidence: [0.94, 0.81],
  });

  const iosEnglishCapability = await ios.getCapability({ locale: 'en-US' });
  assert.strictEqual(iosEnglishCapability.authorization, 'required');
  const iosEnglishAuthorized = await ios.requestPermission({ locale: 'en-US' });
  assert.strictEqual(iosEnglishAuthorized.authorization, 'authorized');
  const iosEnglishResult = await ios.recognize({ locale: 'en-US' });
  assert.deepStrictEqual(Object.keys(iosEnglishResult).sort(), ['candidates', 'confidence']);
  assert.deepStrictEqual(iosEnglishResult, {
    candidates: ['My vision moves forward today.', 'I act now.'],
    confidence: [0.96, 0.84],
  });
  await ios.cancel();
  assert.deepStrictEqual(iosCalls, [
    ['getCapability', { locale: 'pt-BR' }],
    ['getCapability', { locale: 'pt-BR' }],
    ['requestPermission', { locale: 'pt-BR' }],
    ['recognize', { locale: 'pt-BR' }],
    ['getCapability', { locale: 'en-US' }],
    ['getCapability', { locale: 'en-US' }],
    ['requestPermission', { locale: 'en-US' }],
    ['recognize', { locale: 'en-US' }],
    ['cancel'],
  ]);

  class FakeSpeechRecognition {
    constructor() {
      this.abort = () => {};
    }

    start() {
      Promise.resolve().then(() => {
        const alternatives = [
          { transcript: ' Minha visão já está em movimento. ', confidence: 0.88 },
          { transcript: 'Eu avanço hoje.', confidence: 0.72 },
        ];
        this.onresult?.({ resultIndex: 0, results: [alternatives] });
      });
    }
  }
  const web = loadService(compiled, {
    platform: 'web',
    webGlobals: {
      SpeechRecognition: FakeSpeechRecognition,
      navigator: { permissions: { query: async () => ({ state: 'granted' }) } },
    },
  });
  globalThis.SpeechRecognition = FakeSpeechRecognition;
  globalThis.navigator = { permissions: { query: async () => ({ state: 'granted' }) } };
  try {
    const webCapabilityResult = await web.getCapability();
    assert.strictEqual(webCapabilityResult.supported, true);
    assert.strictEqual(webCapabilityResult.onDevice, false);
    const webResult = await web.recognize({ locale: 'pt-BR' });
    assert.deepStrictEqual(Object.keys(webResult).sort(), ['candidates', 'confidence']);
    assert.deepStrictEqual(webResult.candidates, [
      'Minha visão já está em movimento.',
      'Eu avanço hoje.',
    ]);
  } finally {
    delete globalThis.SpeechRecognition;
    delete globalThis.navigator;
  }

  console.log('Plano Celeste voz: JS compilado; Android/iOS on-device e privacidade verificados.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
