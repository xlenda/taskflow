const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const relevantJavaScript = [
  'constants/releaseFeatures.js',
  'utils/practicePlan.js',
  'utils/speechMatch.js',
  'services/practicePlanReminders.js',
  'services/practiceSpeech.js',
  'screens/PracticePlanScreen.js',
  'screens/PracticeRitualScreen.js',
  'screens/HomeScreen.js',
  'context/AppContext.js',
  'App.js',
];

for (const relative of relevantJavaScript) {
  const file = path.join(root, relative);
  const result = transformSync(read(relative), {
    filename: file,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  });
  assert.ok(result && typeof result.code === 'string' && result.code.length > 0, `${relative} nao compilou`);
}

const featureSource = read('constants/releaseFeatures.js');
const app = read('App.js');
const home = read('screens/HomeScreen.js');
const planScreen = read('screens/PracticePlanScreen.js');
const ritualScreen = read('screens/PracticeRitualScreen.js');
const context = read('context/AppContext.js');
const practiceUtils = read('utils/practicePlan.js');
const appConfig = JSON.parse(read('app.json'));

assert.ok(
  featureSource.includes('practicePlan: true') &&
    featureSource.includes("onDevicePracticeSpeech: platformOS === 'android' || platformOS === 'ios'"),
  'fronteira de release perdeu o plano ou o reconhecimento local nativo'
);
assert.ok(
  app.includes('<Root.Screen name="PracticePlan" component={PracticePlanScreen} />') &&
    app.includes('<Root.Screen name="PracticeRitual" component={PracticeRitualScreen} />') &&
    app.includes("PracticeRitual: 'pratica/:slotId'"),
  'rotas do plano e da notificacao nao estao ligadas'
);
assert.ok(
  home.includes('testID="open-practice-plan"') &&
    home.includes("navigation.navigate('PracticePlan')"),
  'card do Plano Celeste nao abre a configuracao'
);
assert.ok(
  planScreen.includes('testID="practice-plan-screen"') &&
    planScreen.includes('testID="activate-practice-plan"') &&
    planScreen.includes('testID="try-practice-plan-now"') &&
    planScreen.includes('appendSuggestedPracticeSlot(current.slots, current, options)') &&
    planScreen.includes('current.slots.length || 3') &&
    planScreen.includes('const firstEnabledSlot = draft.slots.find((slot) => slot.enabled) || null') &&
    planScreen.includes("navigation.navigate('PracticeRitual', { slotId: firstEnabledSlot.id })") &&
    planScreen.includes('audio and transcript are not stored'),
  'tela do plano perdeu configuracao, teste imediato ou aviso de privacidade'
);
assert.ok(
  ritualScreen.includes('const REQUIRED_REPETITIONS = 2') &&
    ritualScreen.includes('if (next >= REQUIRED_REPETITIONS)') &&
    ritualScreen.includes('{visionText}</Text>') &&
    ritualScreen.includes('{affirmationText}') &&
    ritualScreen.includes('testID="practice-accessible-confirm"') &&
    ritualScreen.includes("snooze: { pt: 'Adiar 10 min'") &&
    ritualScreen.includes("notNow: { pt: 'Agora não'"),
  'pratica perdeu texto visivel, duas repeticoes ou as saidas seguras'
);
assert.ok(
  ritualScreen.includes('capability?.onDevice !== true') &&
    ritualScreen.includes('getCapability({ locale })') &&
    ritualScreen.includes('requestPermission({ locale })') &&
    ritualScreen.includes('recognize({ locale })') &&
    ritualScreen.includes("AppState.addEventListener('change'") &&
    ritualScreen.includes("if (nextState === 'active' || !mountedRef.current) return") &&
    ritualScreen.includes("acceptRepetition('accessibility', 0)") &&
    ritualScreen.includes("acceptRepetition('speech', match.score)") &&
    (ritualScreen.match(/if \(navigation\.canGoBack\(\)\) navigation\.goBack\(\);/g) || []).length >= 2 &&
    (ritualScreen.match(/else navigation\.replace\('Main'\);/g) || []).length >= 2,
  'pratica deve recusar voz remota e manter conclusao acessivel'
);

const completionBlock = context.slice(
  context.indexOf('const completePracticePlanSlot'),
  context.indexOf('const saveMorningRitualPreferences')
);
const receiptBlock = practiceUtils.slice(
  practiceUtils.indexOf('export function sanitizePracticeReceipt'),
  practiceUtils.indexOf('export function sanitizePracticeReceipts')
);
assert.ok(
  completionBlock.includes('createPracticeReceipt(') &&
    completionBlock.includes('contentFingerprint: practiceContentFingerprint({') &&
    receiptBlock.includes('contentFingerprint,') &&
    !/transcript|candidate|audio(?:Data|Uri|Path|Base64)?\s*:/i.test(completionBlock) &&
    !/source\.(?:transcript|normalizedTranscript|audio|candidates)/.test(receiptBlock),
  'persistencia da pratica nao pode receber audio ou transcricao'
);

const allowedPermissions = new Set(appConfig.expo?.android?.permissions || []);
const blockedPermissions = new Set(appConfig.expo?.android?.blockedPermissions || []);
assert.ok(
  allowedPermissions.has('android.permission.RECORD_AUDIO') &&
    !blockedPermissions.has('android.permission.RECORD_AUDIO'),
  'RECORD_AUDIO precisa estar explicitamente permitido para a pratica'
);
for (const permission of [
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.USE_EXACT_ALARM',
]) {
  assert.ok(blockedPermissions.has(permission), `${permission} precisa continuar bloqueada`);
  assert.ok(!allowedPermissions.has(permission), `${permission} nao pode ser permitida`);
}

const checks = [
  'scripts/verificar-plano-celeste-utils.js',
  'scripts/verificar-plano-celeste-lembretes.js',
  'scripts/verificar-plano-celeste-voz.js',
];

for (const relative of checks) {
  const result = spawnSync(process.execPath, [path.join(root, relative)], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  assert.strictEqual(result.status, 0, `${relative} falhou com status ${result.status}`);
}

console.log('Plano Celeste integrado: compilacao, telas, privacidade, lembretes e voz aprovados.');
