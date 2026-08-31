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
  paidCloudProcessing: false,
});
assert.deepStrictEqual(releaseFeaturesForPlatform('android', '1'), {
  androidStoreBoundary: true,
  publicCommunity: false,
  affirmationAlarm: false,
  paidCloudProcessing: false,
});
assert.deepStrictEqual(releaseFeaturesForPlatform('android', '0'), {
  androidStoreBoundary: false,
  publicCommunity: true,
  affirmationAlarm: false,
  paidCloudProcessing: false,
});
for (const platformOS of ['ios', 'web']) {
  assert.deepStrictEqual(releaseFeaturesForPlatform(platformOS, '1'), {
    androidStoreBoundary: false,
    publicCommunity: true,
    affirmationAlarm: true,
    paidCloudProcessing: platformOS === 'web',
  });
}

const app = read('App.js');
const home = read('screens/HomeScreen.js');
const morning = read('screens/MorningRitualScreen.js');
const alarmScreen = read('screens/AffirmationAlarmScreen.js');
const profile = read('screens/ProfileScreen.js');
const onboarding = read('screens/onboarding/ChatOnboardingScreen.js');
const personalNarration = read('utils/usePersonalNarration.js');
const affirmations = read('screens/AffirmationsScreen.js');
const manifestation = read('screens/ManifestationScreen.js');
const dailyRitual = read('screens/DailyRitualScreen.js');
const visions = read('screens/VisionsScreen.js');
const visionPlayer = read('screens/VisionPlayerScreen.js');
const reveal = read('screens/onboarding/RevealScreen.js');

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
    onboarding.includes("FLOW.filter((entry) => entry.key !== 'cloudPersonalization')"),
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

const moduleConfig = readJson('modules/celeste-affirmation-alarm/expo-module.config.json');
assert.deepStrictEqual(moduleConfig.platforms, ['apple']);
assert.strictEqual(moduleConfig.android, undefined, 'Android alarm module must not autolink');

const appConfig = readJson('app.json');
const blocked = new Set(appConfig.expo.android.blockedPermissions || []);
for (const permission of [
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
]) {
  assert.ok(blocked.has(permission), `Android store build must block ${permission}`);
}
assert.ok(
  !blocked.has('android.permission.POST_NOTIFICATIONS'),
  'Ordinary daily ritual notifications must remain available on Android'
);
for (const sharedFeaturePermission of [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
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

console.log('Fronteira Android v1 verificada: Comunidade e despertador ocultos; permissões de alarme bloqueadas.');
