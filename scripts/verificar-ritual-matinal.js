const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

function compile(file) {
  const source = fs.readFileSync(file, 'utf8');
  return transformSync(source, {
    filename: file,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
}

const utilityFile = path.join(root, 'utils', 'morningRitual.js');
const compiledUtility = compile(utilityFile);
const loaded = new Module(utilityFile, module);
loaded.filename = utilityFile;
loaded.paths = Module._nodeModulePaths(path.dirname(utilityFile));
loaded._compile(compiledUtility, utilityFile);

const { createDreamAffirmation, extractDreamAnchor, inferDreamTheme } = loaded.exports;
assert.strictEqual(typeof createDreamAffirmation, 'function');
assert.strictEqual(typeof extractDreamAnchor, 'function');
assert.strictEqual(inferDreamTheme('Eu corria no escuro com medo', ''), 'clarity');
assert.strictEqual(inferDreamTheme('I found a quiet garden', ''), 'clarity');
assert.strictEqual(inferDreamTheme('Qualquer símbolo', 'anxious'), 'courage');

const pt = createDreamAffirmation({
  dream: 'Eu estava em uma casa perto do mar.',
  feeling: 'calm',
  theme: 'auto',
  lang: 'pt',
});
assert.strictEqual(pt.theme, 'peace');
assert.ok(pt.affirmation.startsWith('Eu '), 'afirmacao PT deve estar em primeira pessoa');
assert.ok(pt.reflection.includes('calma'), 'reflexao PT deve considerar o sentimento');
assert.ok(pt.dreamAnchor.includes('casa perto do mar'), 'detalhe real do sonho deve virar ancora');
assert.ok(pt.affirmation.includes(pt.dreamAnchor), 'afirmacao deve usar a ancora do proprio relato');
assert.deepStrictEqual(pt.usedDetails, ['dream_anchor', 'feeling', 'theme']);
assert.strictEqual(pt.generatorVersion, 'dream-local-v3');
assert.ok(/não é previsão nem diagnóstico/i.test(pt.reflection), 'sonho nao pode virar previsao ou diagnostico');

const en = createDreamAffirmation({
  dream: 'I opened a door and started flying.',
  feeling: 'curious',
  theme: 'renewal',
  lang: 'en',
});
assert.strictEqual(en.theme, 'renewal');
assert.ok(en.affirmation.startsWith('I '), 'English affirmation must be in first person');
assert.ok(en.affirmation.includes(en.dreamAnchor), 'English affirmation must preserve a dream detail');

const repeated = createDreamAffirmation({
  dream: 'I opened a door and started flying.',
  feeling: 'curious',
  theme: 'renewal',
  lang: 'en',
});
assert.deepStrictEqual(en, repeated, 'local transformation must be deterministic');

const sameThemeDifferentDream = createDreamAffirmation({
  dream: 'I crossed a wooden bridge under the moon.',
  feeling: 'curious',
  theme: 'renewal',
  lang: 'en',
});
assert.notStrictEqual(
  en.affirmation,
  sameThemeDifferentDream.affirmation,
  'different dreams in the same theme must not collapse into one catalog phrase'
);

const feelingKeepsDream = createDreamAffirmation({
  dream: 'Eu encontrei uma porta azul no jardim.',
  feeling: 'calm',
  theme: 'auto',
  lang: 'pt',
});
assert.ok(feelingKeepsDream.affirmation.includes('porta azul'), 'sentimento nao pode apagar a imagem do sonho');
assert.strictEqual(
  feelingKeepsDream.theme,
  'peace',
  'modo automatico deve usar o sentimento escolhido, nao interpretar porta ou jardim'
);

const sensitive = createDreamAffirmation({
  dream: 'Eu vi sangue e uma arma perto de casa.',
  feeling: 'anxious',
  lang: 'pt',
});
assert.strictEqual(sensitive.dreamAnchor, '', 'imagem sensivel nao deve ser repetida no audio');
assert.ok(!/sangue|arma/i.test(sensitive.affirmation), 'afirmacao nao deve ecoar detalhe perturbador');
assert.ok(/não é uma previsão/i.test(sensitive.reflection), 'relato intenso precisa de aterramento');

for (const result of [pt, en, sameThemeDifferentDream, feelingKeepsDream, sensitive]) {
  assert.ok(!/100\s*%|garantid|vai acontecer|will happen|guaranteed/i.test(result.affirmation));
}

const oversized = createDreamAffirmation({ dream: `inicio ${'x'.repeat(2000)}`, lang: 'pt' });
assert.ok(oversized.dream.length <= 1600, 'dream must be bounded before persistence');

const screenFile = path.join(root, 'screens', 'MorningRitualScreen.js');
compile(screenFile);
const screen = fs.readFileSync(screenFile, 'utf8');
assert.ok(screen.includes('SpeechRecognition'), 'voice bonus must use browser capability detection');
assert.ok(screen.includes('No site você pode escolher'), 'web status must be honest about alarm support');
assert.ok(screen.includes('scheduleAffirmationAlarm'), 'real alarm must use the native adapter');
assert.ok(screen.includes('if (response.ok === true)'), 'alarm must only be active after native confirmation');
assert.ok(
  screen.includes('saveMorningRitualPreferences({ reminderEnabled: true })'),
  'native alarm success must survive a screen pop'
);
assert.ok(screen.includes('response.scheduledAlarmIds'), 'failed replacement must expose AlarmKit truth');
assert.ok(
  screen.includes('saveMorningRitualPreferences({ reminderEnabled: stillScheduled })'),
  'failed replacement must reconcile the active state instead of preserving a ghost alarm'
);
assert.ok(screen.includes('scheduledAlarmIds.includes(DEFAULT_AFFIRMATION_ALARM_ID)'), 'alarm state must reconcile with AlarmKit');
assert.ok(screen.includes("if (response.ok) {"), 'failed cancellation must not hide an active alarm');
const cancelBlock = screen.slice(screen.indexOf('const setAlarmEnabled'), screen.indexOf('const selectWake'));
assert.ok(
  cancelBlock.indexOf('saveMorningRitualPreferences({ reminderEnabled: false })') <
    cancelBlock.indexOf('if (mountedRef.current)'),
  'native cancellation must survive a screen pop'
);
assert.ok(screen.includes('alarmBusy || (enabled && !selectedWake)'), 'an existing alarm must remain cancellable without local phrase data');
assert.ok(screen.includes('const stopRecognition = useCallback'), 'speech recognition needs explicit teardown');
assert.ok(screen.includes('recognition.onresult = null'), 'speech callbacks must be detached on teardown');
assert.ok(screen.includes('recognition.abort()'), 'speech recognition must stop when the screen closes');
assert.ok(screen.includes('custom-wake-affirmation'), 'user must be able to write any wake-up affirmation');
assert.ok(screen.includes('dream-personalized-affirmation'), 'personal dream result needs a stable E2E target');
assert.ok(screen.includes('open-dream-shortcut'), 'dream entry must be visible before alarm configuration');
assert.ok(screen.includes('FlatList'), 'affirmation picker must remain virtualized');

const selectWakeBlock = screen.slice(screen.indexOf('const selectWake'), screen.indexOf('const selectAlarmTime'));
const selectTimeBlock = screen.slice(screen.indexOf('const selectAlarmTime'), screen.indexOf('const saveCustomWake'));
const resultWakeBlock = screen.slice(screen.indexOf('const useResultAsWake'), screen.indexOf('const deleteCurrentDream'));
const deleteDreamBlock = screen.slice(screen.indexOf('const deleteCurrentDream'), screen.indexOf('const renderOption'));
assert.ok(
  deleteDreamBlock.indexOf('await cancelAffirmationAlarm()') < deleteDreamBlock.indexOf('removeDreamRitual(entryId)'),
  'o alarme nativo deve ser cancelado antes de remover o sonho usado por ele'
);
assert.ok(
  deleteDreamBlock.indexOf('removeDreamRitual(entryId)') <
    deleteDreamBlock.indexOf('if (!mountedRef.current) return', deleteDreamBlock.indexOf('removeDreamRitual(entryId)')),
  'remover o sonho e reconciliar o provider deve sobreviver a um pop durante o cancelamento nativo'
);
for (const [name, block] of [
  ['wake phrase', selectWakeBlock],
  ['alarm time', selectTimeBlock],
  ['dream affirmation', resultWakeBlock],
]) {
  assert.ok(block.includes('await scheduleRealAlarm'), `${name} must reschedule an active native alarm`);
  assert.ok(
    block.indexOf('await scheduleRealAlarm') < block.indexOf('saveMorningRitualPreferences'),
    `${name} cannot update the UI before native rescheduling succeeds`
  );
  assert.ok(block.includes('if (!scheduled) return'), `${name} must preserve the old selection after native failure`);
}

const context = fs.readFileSync(path.join(root, 'context', 'AppContext.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'constants', 'content.js'), 'utf8');
assert.ok(content.includes('morningRitual'), 'initial state must include morning ritual');
assert.ok(content.includes("alarmStatus: 'native_integration_required'"), 'alarm capability must remain explicit');
assert.ok(context.includes('saveMorningRitualPreferences'), 'preferences action missing');
assert.ok(context.includes('saveDreamRitual'), 'dream persistence action missing');
assert.ok(context.includes('markDreamRitualPracticed'), 'practice action missing');
assert.ok(context.includes('dreamAnchor: shortText'), 'dream anchor must survive reload');
assert.ok(context.includes("generatorVersion: shortText(entry.generatorVersion"), 'generator version must survive reload');

process.stdout.write('Ritual matinal: sonho pessoal, seguro, persistente e bilingue aprovado\n');
