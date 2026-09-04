const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'store-listing');
const FINAL = path.join(STORE, 'assets', 'final');
const failures = [];
const warnings = [];
const submissionMode = process.argv.includes('--submission');

function fail(message) {
  failures.push(message);
}

function read(relative) {
  const file = path.join(STORE, relative);
  if (!fs.existsSync(file)) {
    fail(`missing file: ${relative}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8').trim();
}

function readRoot(relative) {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) {
    fail(`missing project evidence: ${relative}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8').trim();
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function assertMax(label, value, max) {
  if (!String(value).trim()) fail(`${label}: must not be empty`);
  if (value.length > max) fail(`${label}: ${value.length}/${max} characters`);
}

function assertBytes(label, value, max) {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (bytes > max) fail(`${label}: ${bytes}/${max} bytes`);
}

function normalizedWords(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1);
}

function imageSize(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    const colorType = buffer[25];
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      type: 'png',
      hasAlpha: colorType === 4 || colorType === 6,
    };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9) {
        offset += 2;
        continue;
      }
      const length = buffer.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
          type: 'jpeg',
        };
      }
      if (!Number.isFinite(length) || length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

function assertImage(relative, width, height, { maxBytes, alpha } = {}) {
  const file = path.join(FINAL, relative);
  if (!fs.existsSync(file)) {
    fail(`missing asset: ${relative}`);
    return;
  }
  const size = imageSize(file);
  if (!size) {
    fail(`unreadable image: ${relative}`);
    return;
  }
  if (size.width !== width || size.height !== height) {
    fail(`${relative}: ${size.width}x${size.height}, expected ${width}x${height}`);
  }
  const expectedType = path.extname(relative).toLowerCase() === '.jpg' ? 'jpeg' : 'png';
  if (size.type !== expectedType) fail(`${relative}: encoded as ${size.type}, expected ${expectedType}`);
  if (alpha === true && size.hasAlpha !== true) fail(`${relative}: PNG must include an alpha channel`);
  if (alpha === false && size.hasAlpha === true) fail(`${relative}: PNG must not include transparency`);
  if (maxBytes && fs.statSync(file).size > maxBytes) {
    fail(`${relative}: ${fs.statSync(file).size} bytes, max ${maxBytes}`);
  }
}

const forbidden = [
  /(?:^|\s)#1\b/i,
  /\b(best|melhor|top)\b/i,
  /\b(guaranteed results?|resultados? garantidos?|guarantees? manifestation|garante manifesta[cç][aã]o)\b/i,
  /\b(cures?|cura) (anxiety|depression|ansiedade|depress[aã]o)\b/i,
  /\b(stella|thinkup|co-star|nebula)\b/i,
];

for (const locale of ['pt-BR', 'en-US']) {
  const appleBase = `${locale}/apple`;
  const googleBase = `${locale}/google-play`;
  const apple = {
    name: read(`${appleBase}/name.txt`),
    subtitle: read(`${appleBase}/subtitle.txt`),
    keywords: read(`${appleBase}/keywords.txt`),
    promotional: read(`${appleBase}/promotional_text.txt`),
    description: read(`${appleBase}/description.txt`),
  };
  const google = {
    title: read(`${googleBase}/title.txt`),
    short: read(`${googleBase}/short_description.txt`),
    description: read(`${googleBase}/full_description.txt`),
  };
  const release = {
    apple: read(`${appleBase}/whats_new.txt`),
    google: read(`${googleBase}/release_notes.txt`),
  };

  assertMax(`${locale} Apple name`, apple.name, 30);
  assertMax(`${locale} Apple subtitle`, apple.subtitle, 30);
  assertBytes(`${locale} Apple keywords`, apple.keywords, 100);
  assertMax(`${locale} Apple promotional text`, apple.promotional, 170);
  assertMax(`${locale} Apple description`, apple.description, 4000);
  assertMax(`${locale} Google title`, google.title, 30);
  assertMax(`${locale} Google short description`, google.short, 80);
  assertMax(`${locale} Google full description`, google.description, 4000);
  assertMax(`${locale} Apple what's new`, release.apple, 4000);
  assertMax(`${locale} Google release notes`, release.google, 500);

  if (apple.name !== google.title) warnings.push(`${locale}: Apple and Google titles differ intentionally`);
  const occupied = new Set(normalizedWords(`${apple.name} ${apple.subtitle}`));
  const repeated = normalizedWords(apple.keywords).filter((word) => occupied.has(word));
  if (repeated.length) fail(`${locale} Apple keywords repeat name/subtitle: ${[...new Set(repeated)].join(', ')}`);

  const publicCopy = [apple.name, apple.subtitle, apple.promotional, apple.description, google.short, google.description].join('\n');
  for (const pattern of forbidden) {
    if (pattern.test(publicCopy)) fail(`${locale}: forbidden or unsupported claim matched ${pattern}`);
  }

  process.stdout.write(
    `${locale}: title ${apple.name.length}/30, subtitle ${apple.subtitle.length}/30, ` +
      `keywords ${Buffer.byteLength(apple.keywords, 'utf8')}/100 bytes, short ${google.short.length}/80\n`
  );
}

const screenshotFile = path.join(STORE, 'screenshots.json');
let screenshotSpec = null;
try {
  screenshotSpec = JSON.parse(fs.readFileSync(screenshotFile, 'utf8'));
} catch (error) {
  fail(`screenshots.json is invalid: ${error.message}`);
}

function screenshotItemsForPlatform(platform) {
  if (!screenshotSpec || !Array.isArray(screenshotSpec.items)) return [];
  if (platform !== 'google-play') return screenshotSpec.items;
  const overrides = new Map(
    (screenshotSpec.googlePlayV1?.itemOverrides || []).map((item) => [item.order, item])
  );
  return screenshotSpec.items.map((item) => {
    const override = overrides.get(item.order);
    if (!override) return item;
    return {
      ...item,
      ...override,
      'pt-BR': { ...item['pt-BR'], ...override['pt-BR'] },
      'en-US': { ...item['en-US'], ...override['en-US'] },
    };
  });
}

if (screenshotSpec) {
  if (!Array.isArray(screenshotSpec.items) || screenshotSpec.items.length !== 8) {
    fail('screenshots.json must contain exactly 8 primary screenshots');
  } else {
    const ids = new Set();
    screenshotSpec.items.forEach((item, index) => {
      if (item.order !== index + 1) fail(`screenshot order mismatch at ${item.id || index}`);
      if (!item.id || ids.has(item.id)) fail(`duplicate or empty screenshot id: ${item.id}`);
      if (!item.source) fail(`screenshot ${item.order}: source must not be empty`);
      if (!/^#[0-9A-F]{6}$/i.test(item.accent || '')) fail(`screenshot ${item.order}: invalid accent color`);
      ids.add(item.id);
      for (const locale of ['pt-BR', 'en-US']) {
        const localized = item[locale] || {};
        assertMax(`${locale} screenshot ${item.order} headline`, localized.headline || '', 48);
        assertMax(`${locale} screenshot ${item.order} alt`, localized.alt || '', 140);
      }
    });
  }

  if (
    screenshotSpec.googlePlayV1?.status !== 'native_capture_required' ||
    screenshotSpec.googlePlayV1?.artifactStatus !== 'controlled_web_draft_not_for_submission'
  ) {
    fail('Google Play web renders must remain explicitly marked as non-submission drafts');
  }

  const googleBoundaryTerms =
    /(?<![\p{L}\p{N}_])(?:voice|voices|narration|narrator|listen|audio|alarm|voz|vozes|narra[cç][aã]o|narrador|ou[cç]a|ouvir|[aá]udio|alarme|despertador)(?![\p{L}\p{N}_])/iu;
  for (const item of screenshotItemsForPlatform('google-play')) {
    for (const locale of ['pt-BR', 'en-US']) {
      const localized = item[locale] || {};
      assertMax(`${locale} Google screenshot ${item.order} headline`, localized.headline || '', 48);
      assertMax(`${locale} Google screenshot ${item.order} alt`, localized.alt || '', 140);
      if (googleBoundaryTerms.test(`${localized.headline || ''} ${localized.alt || ''}`)) {
        fail(`${locale} Google screenshot ${item.order} advertises a feature outside the Android v1 boundary`);
      }
    }
  }
  for (const locale of ['pt-BR', 'en-US']) {
    const feature = screenshotSpec.googlePlayV1?.featureGraphic?.[locale] || {};
    assertMax(`${locale} Google feature headline`, feature.headline || '', 60);
    assertMax(`${locale} Google feature subline`, feature.subline || '', 120);
    if (googleBoundaryTerms.test(`${feature.headline || ''} ${feature.subline || ''}`)) {
      fail(`${locale} Google feature graphic advertises a feature outside the Android v1 boundary`);
    }
  }
}

if (screenshotSpec && Array.isArray(screenshotSpec.items)) {
  for (const platform of ['apple', 'google-play']) {
    const dimensions = platform === 'apple' ? [1290, 2796] : [1080, 1920];
    const items = screenshotItemsForPlatform(platform);
    for (const locale of ['pt-BR', 'en-US']) {
      const directory = path.join(FINAL, platform, locale);
      const expectedFiles = new Set(
        items.map((item) => `${String(item.order).padStart(2, '0')}-${item.id}.jpg`)
      );
      const actualFiles = fs.existsSync(directory)
        ? fs.readdirSync(directory).filter((file) => /^\d{2}-.*\.jpg$/i.test(file))
        : [];
      for (const extra of actualFiles.filter((file) => !expectedFiles.has(file))) {
        fail(`stale ${platform}/${locale} screenshot outside the current plan: ${extra}`);
      }
      for (const item of items) {
        assertImage(
          path.join(platform, locale, `${String(item.order).padStart(2, '0')}-${item.id}.jpg`),
          dimensions[0],
          dimensions[1]
        );
      }
    }
  }
}

for (const locale of ['pt-BR', 'en-US']) {
  assertImage(path.join('google-play', 'feature-graphic', `${locale}.jpg`), 1024, 500);
}
assertImage(path.join('icons', 'apple-icon-1024.png'), 1024, 1024, { alpha: false });
assertImage(path.join('icons', 'google-play-icon-512.png'), 512, 512, {
  maxBytes: 1024 * 1024,
  alpha: true,
});

try {
  const urls = JSON.parse(fs.readFileSync(path.join(STORE, 'urls.json'), 'utf8'));
  for (const key of ['privacy', 'support']) {
    if (!urls[key]) warnings.push(`${key} URL still needs a public owner-approved page`);
    else if (!/^https:\/\//i.test(urls[key])) fail(`${key} URL must use HTTPS`);
    if (submissionMode && !urls[key]) fail(`${key} URL is required for store submission`);
  }
} catch (error) {
  fail(`urls.json is invalid: ${error.message}`);
}

let consoleFields = null;
try {
  consoleFields = JSON.parse(fs.readFileSync(path.join(STORE, 'console-fields.json'), 'utf8'));
} catch (error) {
  fail(`console-fields.json is invalid: ${error.message}`);
}

const appConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (appConfig.expo.icon !== './assets/icon-celeste-v2.png') {
  fail('app.json is not using icon-celeste-v2.png');
}
if (appConfig.expo.android?.adaptiveIcon?.foregroundImage !== './assets/mascot/celi.png') {
  fail('Android adaptive icon is not using the transparent Celeste mascot foreground');
} else {
  const foreground = path.join(ROOT, appConfig.expo.android.adaptiveIcon.foregroundImage);
  const foregroundSize = fs.existsSync(foreground) ? imageSize(foreground) : null;
  if (!foregroundSize || foregroundSize.type !== 'png' || foregroundSize.hasAlpha !== true) {
    fail('Android adaptive foreground must be a readable PNG with an alpha channel');
  }
}

if (!/^~57\./.test(packageJson.dependencies?.expo || '')) {
  fail('package.json must use the supported Expo SDK 57 release line');
}
if (
  packageJson.dependencies?.react !== '19.2.3' ||
  packageJson.dependencies?.['react-native'] !== '0.86.3'
) {
  fail('React and React Native must match the Expo SDK 57 compatibility matrix');
}
if (!/^\d+(?:\.\d+){0,2}$/.test(appConfig.expo.ios?.buildNumber || '')) {
  fail('iOS buildNumber must use a valid numeric version');
}
if (!Number.isInteger(appConfig.expo.android?.versionCode) || appConfig.expo.android.versionCode < 1) {
  fail('Android versionCode must be a positive integer');
}
if (appConfig.expo.android?.allowBackup !== false) {
  fail('Android backups must be disabled for local private app data');
}
const blockedAndroidPermissions = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.USE_EXACT_ALARM',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];
for (const permission of blockedAndroidPermissions) {
  if (!appConfig.expo.android?.blockedPermissions?.includes(permission)) {
    fail(`unused Android permission must be blocked: ${permission}`);
  }
}
const allowedAndroidPermissions = appConfig.expo.android?.permissions;
if (
  !Array.isArray(allowedAndroidPermissions) ||
  allowedAndroidPermissions.length !== 1 ||
  allowedAndroidPermissions[0] !== 'android.permission.RECORD_AUDIO'
) {
  fail('Android explicit permission allowlist must contain only RECORD_AUDIO for Plano Celeste');
}
if (appConfig.expo.android?.blockedPermissions?.includes('android.permission.RECORD_AUDIO')) {
  fail('RECORD_AUDIO cannot be both explicitly allowed and blocked');
}
if (appConfig.expo.ios?.config?.usesNonExemptEncryption !== false) {
  fail('iOS export compliance must declare that the app does not use non-exempt encryption');
}
const audioPlugin = appConfig.expo.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-audio'
);
const microphoneDisclosure = audioPlugin?.[1]?.microphonePermission;
const normalizedMicrophoneDisclosure = normalizedText(microphoneDisclosure);
const requiredDisclosureIdeas = [
  'celeste',
  'microfone',
  'somente',
  'toca',
  'duas repeticoes',
  'afirmacao exibida',
  'audio nao e armazenado',
];
if (
  !audioPlugin ||
  typeof microphoneDisclosure !== 'string' ||
  microphoneDisclosure.length < 80 ||
  microphoneDisclosure.length > 320 ||
  requiredDisclosureIdeas.some((idea) => !normalizedMicrophoneDisclosure.includes(idea)) ||
  audioPlugin[1]?.recordAudioAndroid !== false ||
  audioPlugin[1]?.enableBackgroundPlayback !== false
) {
  fail('expo-audio must describe the tap-triggered two-repeat practice and disable recording/background playback outside that foreground flow');
}
if (microphoneDisclosure !== appConfig.expo.ios?.infoPlist?.NSMicrophoneUsageDescription) {
  fail('expo-audio and iOS microphone disclosures must describe the same restricted practice');
}
const normalizedSpeechDisclosure = normalizedText(
  appConfig.expo.ios?.infoPlist?.NSSpeechRecognitionUsageDescription
);
for (const idea of [
  'reconhecimento de fala no aparelho',
  'duas repeticoes',
  'transcricao nao e armazenada',
]) {
  if (!normalizedSpeechDisclosure.includes(idea)) {
    fail(`iOS speech recognition disclosure is incomplete: ${idea}`);
  }
}
for (const broadUse of [
  'sempre ativo',
  'em segundo plano',
  'gravar suas conversas',
  'gravar audio para uso futuro',
  'usar o microfone a qualquer momento',
]) {
  if (normalizedMicrophoneDisclosure.includes(broadUse)) {
    fail(`microphone disclosure permits overly broad use: ${broadUse}`);
  }
}
if (!appConfig.expo.plugins?.includes('expo-notifications')) {
  fail('expo-notifications config plugin is required for daily reminders');
}
try {
  const alarmModule = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'modules', 'celeste-affirmation-alarm', 'expo-module.config.json'),
      'utf8'
    )
  );
  if (
    !Array.isArray(alarmModule.platforms) ||
    alarmModule.platforms.length !== 1 ||
    alarmModule.platforms[0] !== 'apple' ||
    alarmModule.android !== undefined
  ) {
    fail('Android store v1 must not autolink the affirmation alarm module');
  }
} catch (error) {
  fail(`affirmation alarm module config is invalid: ${error.message}`);
}

try {
  const speechModule = JSON.parse(
    readRoot('modules/celeste-practice-speech/expo-module.config.json')
  );
  const speechManifest = readRoot(
    'modules/celeste-practice-speech/android/src/main/AndroidManifest.xml'
  );
  const speechKotlin = readRoot(
    'modules/celeste-practice-speech/android/src/main/java/expo/modules/celestepracticespeech/CelestePracticeSpeechModule.kt'
  );
  const declaredPermissions = [...speechManifest.matchAll(/<uses-permission\s+android:name="([^"]+)"/g)]
    .map((match) => match[1]);
  if (
    !Array.isArray(speechModule.platforms) ||
    !speechModule.platforms.includes('android') ||
    !Array.isArray(speechModule.android?.modules) ||
    speechModule.android.modules.length !== 1
  ) {
    fail('CelestePracticeSpeech must be the explicit Android module that justifies RECORD_AUDIO');
  }
  if (
    declaredPermissions.length !== 1 ||
    declaredPermissions[0] !== 'android.permission.RECORD_AUDIO'
  ) {
    fail('CelestePracticeSpeech Android manifest must request only RECORD_AUDIO');
  }
  if (
    !speechKotlin.includes('SpeechRecognizer.createOnDeviceSpeechRecognizer(') ||
    !speechKotlin.includes('SpeechRecognizer.isOnDeviceRecognitionAvailable(') ||
    !speechKotlin.includes('Manifest.permission.RECORD_AUDIO') ||
    /SpeechRecognizer\.createSpeechRecognizer\s*\(|FileOutputStream|FileInputStream|MediaRecorder|AudioRecord|SharedPreferences|HttpURLConnection|okhttp/i.test(speechKotlin)
  ) {
    fail('CelestePracticeSpeech must use on-device recognition without recording, storage or network clients');
  }
} catch (error) {
  fail(`practice speech module evidence is invalid: ${error.message}`);
}

const practiceSpeechSource = readRoot('services/practiceSpeech.js');
const practiceRitualSource = readRoot('screens/PracticeRitualScreen.js');
const practiceUtilsSource = readRoot('utils/practicePlan.js');
const appContextSource = readRoot('context/AppContext.js');
const releaseFeatureSource = readRoot('constants/releaseFeatures.js');
const listeningBlock = practiceRitualSource.slice(
  practiceRitualSource.indexOf('const startListening'),
  practiceRitualSource.indexOf('const confirmAccessibleReading')
);
const completionBlock = appContextSource.slice(
  appContextSource.indexOf('const completePracticePlanSlot'),
  appContextSource.indexOf('const saveMorningRitualPreferences')
);
const receiptBlock = practiceUtilsSource.slice(
  practiceUtilsSource.indexOf('export function sanitizePracticeReceipt'),
  practiceUtilsSource.indexOf('export function sanitizePracticeReceipts')
);
if (
  !releaseFeatureSource.includes("onDevicePracticeSpeech: platformOS === 'android' || platformOS === 'ios'") ||
  !listeningBlock.includes('capability?.onDevice !== true') ||
  !listeningBlock.includes('getCapability({ locale })') ||
  !listeningBlock.includes('capability = await requestPermission({ locale })') ||
  !listeningBlock.includes('recognize({ locale })') ||
  !practiceRitualSource.includes('onPress={startListening}')
) {
  fail('microphone permission must be requested from a tap and accepted only for on-device practice speech');
}
if (
  /AsyncStorage|FileSystem|MediaRecorder|AudioRecord|fetch\s*\(/.test(practiceSpeechSource) ||
  /transcript|candidate|audio(?:Data|Uri|Path|Base64)?\s*:/i.test(completionBlock) ||
  /source\.(?:transcript|normalizedTranscript|audio|candidates)/.test(receiptBlock) ||
  !completionBlock.includes('contentFingerprint: practiceContentFingerprint({') ||
  !receiptBlock.includes('contentFingerprint,')
) {
  fail('Plano Celeste must not persist or upload microphone audio or recognized transcription');
}
const normalizedRitualSource = normalizedText(practiceRitualSource);
for (const disclosureIdea of [
  'microfone so comeca quando voce tocar',
  'nao salva o audio nem a transcricao',
  'reconhecimento no aparelho',
]) {
  if (!normalizedRitualSource.includes(disclosureIdea)) {
    fail(`practice screen is missing restricted microphone disclosure: ${disclosureIdea}`);
  }
}
const splashPlugin = appConfig.expo.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
);
if (!splashPlugin || splashPlugin[1]?.backgroundColor !== '#E6EFF8') {
  fail('expo-splash-screen must preserve the Celeste launch background');
}

try {
  const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
  if (eas.cli?.appVersionSource !== 'remote') fail('EAS appVersionSource must be remote');
  if (eas.build?.preview?.distribution !== 'internal') {
    fail('EAS preview build must use internal distribution');
  }
  if (eas.build?.preview?.environment !== 'production') {
    fail('EAS preview build must load the same production environment as the store build');
  }
  if (eas.build?.production?.autoIncrement !== true) fail('EAS production build must auto-increment');
  if (eas.build?.production?.distribution !== 'store') {
    fail('EAS production build must use store distribution');
  }
  if (eas.build?.production?.environment !== 'production') {
    fail('EAS production build must load the production environment');
  }
  for (const profile of ['preview', 'production']) {
    if (eas.build?.[profile]?.env?.EXPO_PUBLIC_CELESTE_ANDROID_STORE_RELEASE !== '1') {
      fail(`EAS ${profile} must enable the Android store release boundary`);
    }
  }
  if (!eas.submit?.production || typeof eas.submit.production !== 'object') {
    fail('EAS production submit profile is missing');
  }
  if (eas.submit?.production?.android?.track !== 'internal') {
    fail('The first Android submission must target the internal testing track');
  }
} catch (error) {
  fail(`eas.json is invalid: ${error.message}`);
}

if (consoleFields) {
  if (consoleFields.app?.version !== appConfig.expo.version) {
    fail('console-fields app version differs from app.json');
  }
  if (consoleFields.apple?.bundleId !== appConfig.expo.ios?.bundleIdentifier) {
    fail('console-fields Apple bundle ID differs from app.json');
  }
  if (consoleFields.googlePlay?.packageName !== appConfig.expo.android?.package) {
    fail('console-fields Google package name differs from app.json');
  }

  const dataSafety = consoleFields.googlePlay?.dataSafety;
  const declaredDataTypes = Array.isArray(dataSafety?.dataTypes) ? dataSafety.dataTypes : [];
  if (dataSafety?.collectsRequiredDataTypes !== true || declaredDataTypes.length === 0) {
    fail('Data Safety must not claim that the app collects no data; optional AI reports leave the device');
  }
  if (declaredDataTypes.some((entry) => /audio|voice|microphone/i.test(String(entry?.type || '')))) {
    fail('Plano Celeste local speech must not be declared as collected Audio Data without contrary AAB evidence');
  }
}

const googlePlayPrefill = normalizedText(read('google-play-console-prefill.md'));
const privacyReview = normalizedText(read('privacy-review.md'));
const reviewNotes = normalizedText(read('review-notes.md'));
const consoleDeclarations = normalizedText(read('console-declarations.md'));
const publicPrivacyPt = normalizedText(readRoot('public/privacidade/index.html'));
const publicPrivacyEn = normalizedText(readRoot('public/privacy/index.html'));

for (const [label, document] of [
  ['Google Play prefill', googlePlayPrefill],
  ['review notes', reviewNotes],
  ['console declarations', consoleDeclarations],
]) {
  if (
    document.includes('criar no aparelho') ||
    document.includes('choose on-device creation') ||
    document.includes('usar a opcao local')
  ) {
    fail(`${label} still tells the reviewer to choose a cloud-consent option removed from onboarding`);
  }
}

if (
  !googlePlayPrefill.includes('visao ou cena-ancora e afirmacao') &&
  !googlePlayPrefill.includes('vision or anchor scene and an affirmation')
) {
  fail('Google Play review path must cover a vision or Anchor Scene plus the repeated affirmation');
}
if (!reviewNotes.includes('afirmacao, visao, cena-ancora, frase de sonho ou frase propria')) {
  fail('Review notes must describe every personal-content alarm choice');
}
if (!privacyReview.includes('visao ou cena-ancora e afirmacao escolhidas')) {
  fail('Privacy review must describe the Anchor Scene option stored by Celeste Plan');
}

for (const [label, document, requiredIdeas] of [
  ['Google Play prefill', googlePlayPrefill, [
    'record_audio',
    'nao transmite audio ou transcricao para fora do aparelho',
    'reconhecimento local',
    'nao acrescenta `audio files`',
    'aab final',
  ]],
  ['privacy review', privacyReview, [
    'record_audio` nao significa coleta',
    'audio e transcricao permanecem efemeros e locais',
    'nao ha fallback de rede, log, backup ou sdk',
  ]],
  ['review notes', reviewNotes, [
    'microfone comeca somente apos toque',
    'reconhecimento no dispositivo',
    'audio e transcricao nao sao retidos nem enviados',
  ]],
  ['public privacy pt-BR', publicPrivacyPt, [
    'microfone so comeca apos um toque',
    'aceita apenas reconhecimento no dispositivo',
    'nao sao guardados, enviados ao backend, incluidos em backup nem escritos em logs',
  ]],
  ['public privacy en-US', publicPrivacyEn, [
    'microphone starts only after a tap',
    'accepts only on-device recognition',
    'not stored, sent to the backend, included in backups or written to logs',
  ]],
]) {
  for (const idea of requiredIdeas) {
    if (!document.includes(idea)) fail(`${label} is missing restricted microphone evidence: ${idea}`);
  }
}

try {
  const readiness = JSON.parse(fs.readFileSync(path.join(STORE, 'submission-readiness.json'), 'utf8'));
  const checks = readiness && readiness.checks;
  if (!checks || typeof checks !== 'object' || Array.isArray(checks)) {
    fail('submission-readiness.json must contain a checks object');
  } else {
    for (const [key, check] of Object.entries(checks)) {
      if (!check || typeof check !== 'object' || !String(check.note || '').trim()) {
        fail(`submission readiness check is incomplete: ${key}`);
        continue;
      }
      if (check.ready !== true) {
        warnings.push(`submission evidence pending: ${key}`);
        if (submissionMode) fail(`submission evidence is required: ${key}`);
      } else if (!String(check.evidence || '').trim()) {
        fail(`submission readiness check has no evidence: ${key}`);
      }
    }
  }
} catch (error) {
  fail(`submission-readiness.json is invalid: ${error.message}`);
}

warnings.forEach((message) => console.warn(`WARN: ${message}`));
if (failures.length) {
  console.error(`\nStore listing verification failed (${failures.length}):`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
console.log(
  submissionMode
    ? '\nStore listing package is ready for submission.'
    : warnings.length
    ? '\nStore listing draft passed; resolve the warnings before submission.'
    : '\nStore listing metadata and assets are valid.'
);
