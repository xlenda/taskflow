const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

const featureSource = read('constants/releaseFeatures.js');
const executableFeatureSource = featureSource
  .replace(/^import \{ Platform \} from 'react-native';\r?\n/m, '')
  .replace('export function releaseFeaturesForPlatform', 'function releaseFeaturesForPlatform')
  .replace(/export const RELEASE_FEATURES[\s\S]*$/, '');
const releaseFeaturesForPlatform = new Function(
  'process',
  `${executableFeatureSource}\nreturn releaseFeaturesForPlatform;`
)({ env: {} });

assert.deepStrictEqual(releaseFeaturesForPlatform('android'), {
  androidStoreBoundary: true,
  publicCommunity: false,
  affirmationAlarm: false,
  practicePlan: true,
  onDevicePracticeSpeech: true,
  paidCloudProcessing: false,
});
assert.deepStrictEqual(releaseFeaturesForPlatform('android', '1'), {
  androidStoreBoundary: true,
  publicCommunity: false,
  affirmationAlarm: false,
  practicePlan: true,
  onDevicePracticeSpeech: true,
  paidCloudProcessing: false,
});
assert.deepStrictEqual(releaseFeaturesForPlatform('android', '0'), {
  androidStoreBoundary: false,
  publicCommunity: true,
  affirmationAlarm: false,
  practicePlan: true,
  onDevicePracticeSpeech: true,
  paidCloudProcessing: false,
});
for (const platformOS of ['ios', 'web']) {
  assert.deepStrictEqual(releaseFeaturesForPlatform(platformOS, '1'), {
    androidStoreBoundary: false,
    publicCommunity: true,
    affirmationAlarm: true,
    practicePlan: true,
    onDevicePracticeSpeech: platformOS === 'ios',
    paidCloudProcessing: platformOS === 'web',
  });
}

const app = read('App.js');
const home = read('screens/HomeScreen.js');
const morning = read('screens/MorningRitualScreen.js');
const alarmScreen = read('screens/AffirmationAlarmScreen.js');
const profile = read('screens/ProfileScreen.js');
const onboarding = read('screens/onboarding/ChatOnboardingScreen.js');
const onboardingFlow = read('screens/onboarding/flow.js');
const personalNarration = read('utils/usePersonalNarration.js');
const affirmations = read('screens/AffirmationsScreen.js');
const manifestation = read('screens/ManifestationScreen.js');
const dailyRitual = read('screens/DailyRitualScreen.js');
const visions = read('screens/VisionsScreen.js');
const visionPlayer = read('screens/VisionPlayerScreen.js');
const reveal = read('screens/onboarding/RevealScreen.js');
const practicePlanScreen = read('screens/PracticePlanScreen.js');
const practiceRitualScreen = read('screens/PracticeRitualScreen.js');
const practicePlanUtils = read('utils/practicePlan.js');
const practiceSpeech = read('services/practiceSpeech.js');
const context = read('context/AppContext.js');

assert.ok(
  app.includes('RELEASE_FEATURES.publicCommunity ? (') &&
    app.includes("{ Community: 'comunidade' }"),
  'Android store build must omit the Community tab and deep-link route'
);
assert.ok(
  home.includes('RELEASE_FEATURES.publicCommunity ? (') &&
    home.includes('testID="open-community-home"'),
  'Android store build must omit the Community shortcut from Home'
);
assert.ok(
  app.includes('RELEASE_FEATURES.affirmationAlarm ? (') &&
    app.includes("{ AffirmationAlarm: 'despertar' }"),
  'Android store build must omit the alarm screen and deep-link route'
);
assert.ok(
  app.includes('RELEASE_FEATURES.affirmationAlarm ? <NativeAlarmContentSync /> : null'),
  'Android store build must not run native alarm synchronization'
);
assert.ok(
  home.includes('RELEASE_FEATURES.affirmationAlarm ? (') &&
    home.includes('testID="open-affirmation-alarm"'),
  'Android store build must omit the alarm shortcut from Home'
);
assert.ok(
  home.includes('if (!RELEASE_FEATURES.paidCloudProcessing)') &&
    profile.includes('RELEASE_FEATURES.paidCloudProcessing ? (') &&
    !onboardingFlow.includes("id: 'cloudPersonalization'") &&
    onboarding.includes('cloudConsentVersion: null') &&
    onboarding.includes('cloudPersonalization: false'),
  'Native store builds must not offer cloud processing that the API boundary rejects'
);
assert.ok(
  personalNarration.includes("error: 'personal_narration_unavailable'") &&
    personalNarration.includes('personalNarrationAvailable: RELEASE_FEATURES.paidCloudProcessing') &&
    affirmations.includes('personalNarrationAvailable && !!current') &&
    manifestation.includes('personalNarrationAvailable && lines.length > 0') &&
    dailyRitual.includes("error: 'personal_narration_unavailable'") &&
    dailyRitual.includes('RELEASE_FEATURES.paidCloudProcessing && mirrorStatus?.canEvolve') &&
    visions.includes('{personalNarrationAvailable ? (') &&
    visionPlayer.includes('personalNarrationAvailable && total > 0') &&
    reveal.includes('{narration.personalNarrationAvailable ? ('),
  'Native store builds must not show paid narration controls or request voice consent'
);
assert.ok(
  morning.includes("const alarmVisible = mode === 'combined' && RELEASE_FEATURES.affirmationAlarm") &&
    morning.includes('{RELEASE_FEATURES.affirmationAlarm ? ('),
  'Android store build must omit both legacy and dream-result alarm actions'
);
assert.ok(
  !alarmScreen.includes('iPhone ou Android') && !alarmScreen.includes('iPhone or Android'),
  'Web copy must not advertise the disabled Android alarm'
);
assert.ok(
  app.includes('RELEASE_FEATURES.practicePlan ? (') &&
    app.includes('<Root.Screen name="PracticePlan" component={PracticePlanScreen} />') &&
    app.includes('<Root.Screen name="PracticeRitual" component={PracticeRitualScreen} />') &&
    app.includes("{ PracticePlan: 'plano', PracticeRitual: 'pratica/:slotId' }"),
  'Plano Celeste routes and notification deep link must remain inside the enabled feature boundary'
);
assert.ok(
  home.includes('RELEASE_FEATURES.practicePlan ? (') &&
    home.includes('testID="open-practice-plan"') &&
    home.includes("navigation.navigate('PracticePlan')"),
  'Home must expose the Plano Celeste card when the feature is enabled'
);
assert.ok(
  practicePlanScreen.includes('testID="practice-plan-screen"') &&
    practicePlanScreen.includes('testID="try-practice-plan-now"') &&
    practicePlanScreen.includes('const firstEnabledSlot = draft.slots.find((slot) => slot.enabled) || null') &&
    practicePlanScreen.includes("navigation.navigate('PracticeRitual', { slotId: firstEnabledSlot.id })"),
  'The plan screen must expose configuration and an explicit try-now action'
);
assert.ok(
  practiceRitualScreen.includes('const REQUIRED_REPETITIONS = 2') &&
    practiceRitualScreen.includes('Math.min(REQUIRED_REPETITIONS, repetitions + 1)') &&
    practiceRitualScreen.includes('if (next >= REQUIRED_REPETITIONS)') &&
    practiceRitualScreen.includes('completePracticePlanSlot({ slotId: slot.id, method, score })'),
  'The ritual must require two confirmed repetitions before recording completion'
);
assert.ok(
  practiceRitualScreen.includes('<Text selectable') &&
    practiceRitualScreen.includes('{visionText}</Text>') &&
    practiceRitualScreen.includes('{affirmationText}') &&
    practiceRitualScreen.includes("affirmationLabel: { pt: '2. Repita esta afirmação duas vezes'"),
  'The chosen vision and full affirmation must remain visibly readable during both repetitions'
);
assert.ok(
  practiceRitualScreen.includes('const FALLBACK_AFTER_FAILURES = 2') &&
    practiceRitualScreen.includes("!RELEASE_FEATURES.onDevicePracticeSpeech || Platform.OS === 'web'") &&
    practiceRitualScreen.includes('testID="practice-accessible-confirm"') &&
    practiceRitualScreen.includes("acceptRepetition('accessibility', 0)") &&
    practiceRitualScreen.includes('getCapability({ locale })') &&
    practiceRitualScreen.includes('requestPermission({ locale })') &&
    practiceRitualScreen.includes('recognize({ locale })') &&
    practiceRitualScreen.includes("snooze: { pt: 'Adiar 10 min'") &&
    practiceRitualScreen.includes("notNow: { pt: 'Agora não'") &&
    practiceRitualScreen.includes('snoozePracticePlanReminder(slot.id, { lang })') &&
    (practiceRitualScreen.match(/if \(navigation\.canGoBack\(\)\) navigation\.goBack\(\);/g) || []).length >= 2 &&
    (practiceRitualScreen.match(/else navigation\.replace\('Main'\);/g) || []).length >= 2,
  'The ritual must keep accessible fallback, snooze and not-now exits available'
);

const completionBlock = context.slice(
  context.indexOf('const completePracticePlanSlot'),
  context.indexOf('const saveMorningRitualPreferences')
);
const receiptBlock = practicePlanUtils.slice(
  practicePlanUtils.indexOf('export function sanitizePracticeReceipt'),
  practicePlanUtils.indexOf('export function sanitizePracticeReceipts')
);
assert.ok(
  completionBlock.includes('createPracticeReceipt(') &&
    completionBlock.includes('slotId: slot.id') &&
    completionBlock.includes('method,') &&
    completionBlock.includes('score,') &&
    completionBlock.includes('contentFingerprint: practiceContentFingerprint({') &&
    !/transcript|candidate|audio(?:Data|Uri|Path|Base64)?\s*:/i.test(completionBlock),
  'Completion persistence must receive metrics and identifiers, never recognized text or audio'
);
assert.ok(
  receiptBlock.includes('slotId,') &&
    receiptBlock.includes('affirmationId:') &&
    receiptBlock.includes('visionId:') &&
    receiptBlock.includes('completedAt,') &&
    receiptBlock.includes('method,') &&
    receiptBlock.includes('score,') &&
    receiptBlock.includes('contentFingerprint,') &&
    !/source\.(?:transcript|normalizedTranscript|audio|candidates)/.test(receiptBlock),
  'Practice receipts must whitelist metadata without audio or transcription fields'
);
assert.ok(
  practicePlanUtils.includes('fallbackSelections: !requestedEnabled') &&
    practicePlanUtils.includes('const invalidActiveSelection = requestedEnabled') &&
    practicePlanUtils.includes('enabled: requestedEnabled && !invalidActiveSelection') &&
    practicePlanUtils.includes('syncError: asBoolean(source.syncError, false) || invalidActiveSelection'),
  'An active plan with deleted content must disable and surface syncError without retargeting'
);
assert.ok(
  !/AsyncStorage|FileSystem|MediaRecorder|AudioRecord|fetch\s*\(/.test(practiceSpeech),
  'Speech adapter must not store or upload captured speech'
);

const moduleConfig = readJson('modules/celeste-affirmation-alarm/expo-module.config.json');
assert.deepStrictEqual(moduleConfig.platforms, ['apple']);
assert.strictEqual(moduleConfig.android, undefined, 'Android alarm module must not autolink');

const appConfig = readJson('app.json');
const blocked = new Set(appConfig.expo.android.blockedPermissions || []);
const allowed = new Set(appConfig.expo.android.permissions || []);
const audioPlugin = appConfig.expo.plugins?.find(
  (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-audio'
);
assert.ok(audioPlugin, 'expo-audio config plugin must stay explicitly configured');
assert.strictEqual(
  audioPlugin[1]?.enableBackgroundPlayback,
  false,
  'Android v1 must not package background/lockscreen audio playback'
);
assert.ok(
  allowed.has('android.permission.RECORD_AUDIO') &&
    !blocked.has('android.permission.RECORD_AUDIO'),
  'Plano Celeste must explicitly allow RECORD_AUDIO for its foreground, user-triggered practice'
);
for (const permission of [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
]) {
  assert.ok(blocked.has(permission), `Android store build must block ${permission}`);
  assert.ok(!allowed.has(permission), `Android store build must not allow ${permission}`);
}
assert.ok(
  !blocked.has('android.permission.POST_NOTIFICATIONS'),
  'Ordinary daily ritual notifications must remain available on Android'
);
for (const sharedFeaturePermission of [
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
]) {
  assert.ok(
    !blocked.has(sharedFeaturePermission),
    `${sharedFeaturePermission} must not be removed when another enabled feature uses it`
  );
}

const eas = readJson('eas.json');
for (const profile of ['preview', 'production']) {
  assert.strictEqual(
    eas.build[profile].env.EXPO_PUBLIC_CELESTE_ANDROID_STORE_RELEASE,
    '1',
    `${profile} must exercise the same Android store boundary`
  );
}

console.log('Fronteira Android v1 verificada: pratica local ativa; audio em segundo plano e alarmes exatos bloqueados.');
