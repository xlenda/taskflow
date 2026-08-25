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
const appFile = path.join(root, 'App.js');
compile(screenFile);
compile(appFile);
const screen = fs.readFileSync(screenFile, 'utf8');
const app = fs.readFileSync(appFile, 'utf8');
const alarmService = fs.readFileSync(path.join(root, 'services', 'affirmationAlarm.js'), 'utf8');
assert.ok(screen.includes('SpeechRecognition'), 'voice bonus must use browser capability detection');
assert.ok(screen.includes('No site você pode escolher'), 'web status must be honest about alarm support');
assert.ok(screen.includes('scheduleAffirmationAlarm'), 'real alarm must use the native adapter');
assert.ok(screen.includes('if (response.ok === true)'), 'alarm must only be active after native confirmation');
assert.ok(
  /if \(response\.ok === true\) \{[\s\S]*reminderEnabled: true[\s\S]*wakeAffirmationId: id[\s\S]*wakeAffirmationText: text/.test(screen),
  'native alarm success and exact content must survive a screen pop'
);
assert.ok(screen.includes('response.scheduledAlarmIds'), 'failed replacement must expose AlarmKit truth');
assert.ok(
  screen.includes('reminderEnabled: stillScheduled') &&
    screen.includes('alarmSyncError: stillScheduled'),
  'failed replacement must reconcile the active state instead of preserving a ghost alarm'
);
assert.ok(screen.includes('scheduledAlarmIds.includes(DEFAULT_AFFIRMATION_ALARM_ID)'), 'alarm state must reconcile with AlarmKit');
const languageSyncBlock = app.slice(
  app.indexOf('function NativeAlarmContentSync'),
  app.indexOf('function HomeStackNav')
);
const replacementBlock = languageSyncBlock.slice(
  languageSyncBlock.indexOf('void replaceScheduledAffirmationAlarm')
);
assert.ok(
  app.includes('<NativeAlarmContentSync />') &&
    languageSyncBlock.includes('ritual.wakeAffirmationText === desired.text') &&
    languageSyncBlock.includes('ritual.wakeAffirmationLang === desired.lang'),
  'trocar o idioma deve detectar globalmente que o audio nativo ficou desatualizado'
);
assert.ok(
  !languageSyncBlock.includes('queueRef.current') &&
    languageSyncBlock.includes('latestDesiredRef.current !== signature') &&
    languageSyncBlock.includes('pendingRef.current === 0') &&
    alarmService.includes('createSerializedAlarmController'),
  'sincronizacao global deve enviar intencoes imediatamente para a fila nativa unica'
);
assert.ok(
  languageSyncBlock.includes("AppState.addEventListener('change'") &&
    languageSyncBlock.includes('getAffirmationAlarmCapability') &&
    languageSyncBlock.includes('scheduledAlarmIds.includes(DEFAULT_AFFIRMATION_ALARM_ID)'),
  'boot e retorno ao app precisam revelar alarmes nativos orfaos ou ausentes'
);
assert.ok(
  languageSyncBlock.includes('response.scheduledAlarmIds') &&
    languageSyncBlock.includes('confirmedNativeRef.current') &&
    languageSyncBlock.includes('saveMorningRitualPreferences({ alarmSyncError: true })'),
  'falha ao trocar o audio deve reconciliar se o alarme anterior ainda existe'
);
assert.ok(
  languageSyncBlock.includes('const capability = await getAffirmationAlarmCapability') &&
    languageSyncBlock.includes('if (latestDesiredRef.current !== signature) return;') &&
    !replacementBlock.includes('cancelAffirmationAlarm('),
  'falha de sincronizacao nunca pode cancelar uma substituicao mais nova'
);
assert.ok(
  languageSyncBlock.includes('scheduled && !desired') &&
    languageSyncBlock.includes('cancelAffirmationAlarm()') &&
    languageSyncBlock.includes('scheduleAffirmationAlarm({') &&
    languageSyncBlock.includes('const latestDesired = alarmContentForState(stateRef.current)'),
  'alarme legado orfao deve ser cancelado e restaurar conteudo pessoal que surgir durante a operacao'
);
assert.ok(
  languageSyncBlock.includes('replaceScheduledAffirmationAlarm'),
  'audio traduzido deve substituir somente um alarme nativo que ainda existe'
);
assert.ok(
  /replaceScheduledAffirmationAlarm\(\{[\s\S]*if \(!response\.ok[\s\S]*saveMorningRitualPreferences\(\{/.test(
    languageSyncBlock
  ),
  'texto salvo nao pode mudar antes de o AlarmKit confirmar o novo audio'
);
assert.ok(
  !screen.includes('alarmSyncAttemptRef'),
  'sincronizacao antiga limitada a tela do ritual deve ser removida'
);
assert.ok(screen.includes("if (response.ok) {"), 'failed cancellation must not hide an active alarm');
const cancelBlock = screen.slice(screen.indexOf('const setAlarmEnabled'), screen.indexOf('const selectWake'));
assert.ok(
  cancelBlock.indexOf('saveMorningRitualPreferences({ reminderEnabled: false, alarmSyncError: false })') <
    cancelBlock.indexOf('if (mountedRef.current)'),
  'native cancellation must survive a screen pop'
);
assert.ok(
  screen.includes('alarmBusy || alarmOperationRef.current || (enabled && !selectedWake)'),
  'an existing alarm must remain cancellable without local phrase data'
);
assert.ok(
  screen.includes('alarmOperationRef.current') &&
    screen.includes('if (alarmOperationRef.current) return false'),
  'operacoes AlarmKit concorrentes precisam de mutex sincrono'
);
assert.ok(screen.includes('const stopRecognition = useCallback'), 'speech recognition needs explicit teardown');
assert.ok(screen.includes('recognition.onresult = null'), 'speech callbacks must be detached on teardown');
assert.ok(screen.includes('recognition.abort()'), 'speech recognition must stop when the screen closes');
assert.ok(screen.includes('custom-wake-affirmation'), 'user must be able to write any wake-up affirmation');
assert.ok(screen.includes('dream-personalized-affirmation'), 'personal dream result needs a stable E2E target');
assert.ok(
  screen.includes('if (bonusOpen && !result) scheduleDreamSettle(60)') &&
    screen.includes("document.querySelector('[data-testid=\"dream-result-panel\"]')"),
  'resultado do sonho precisa vencer o refoco do formulario e ficar visivel em tela pequena'
);
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
assert.ok(
  context.includes('lastDreamSaveRef') && context.includes('nowMs - previous.at < 1500'),
  'clique duplo nao pode criar duas copias do mesmo sonho'
);
assert.ok(context.includes('markDreamRitualPracticed'), 'practice action missing');
assert.ok(context.includes('dreamAnchor: shortText'), 'dream anchor must survive reload');
assert.ok(context.includes("generatorVersion: shortText(entry.generatorVersion"), 'generator version must survive reload');
assert.ok(
  context.includes('personalAffirmationIds.has(id) || ritualIds.has(id)'),
  'favorite dream affirmations must survive reload and import'
);
assert.ok(
  context.includes('const fallbackManifestation') &&
    context.includes('const fallbackDream') &&
    context.includes('st.morningRitual.alarmSyncError = st.morningRitual.reminderEnabled') &&
    context.includes('st.morningRitual.reminderEnabled = false'),
  'legacy catalog alarms must force native personal-content replacement or be disabled'
);

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

async function verifyStaleAlarmFailureCannotCancelNewIntent() {
  const componentStart = app.indexOf('function NativeAlarmContentSync()');
  const componentEnd = app.indexOf('\nfunction HomeStackNav', componentStart);
  assert.ok(componentStart >= 0 && componentEnd > componentStart, 'NativeAlarmContentSync must be extractable');

  const refs = [];
  const states = [];
  const effects = [];
  let hookCursor = 0;
  let effectCursor = 0;
  let currentState;
  const savedPatches = [];
  const replacements = [];
  const capabilityRequests = [];
  let cancelCalls = 0;

  const fakeReact = {
    useRef(initialValue) {
      const index = hookCursor++;
      if (!refs[index]) refs[index] = { current: initialValue };
      return refs[index];
    },
    useState(initialValue) {
      const index = hookCursor++;
      if (!states[index]) states[index] = { value: initialValue };
      return [states[index].value, (value) => {
        states[index].value = typeof value === 'function' ? value(states[index].value) : value;
      }];
    },
    useEffect(factory, dependencies) {
      effects[effectCursor++] = { factory, dependencies };
    },
  };

  const componentSource = app.slice(componentStart, componentEnd);
  const NativeAlarmContentSync = new Function(
    'React',
    'Platform',
    'useApp',
    'alarmContentForState',
    'replaceScheduledAffirmationAlarm',
    'scheduleAffirmationAlarm',
    'getAffirmationAlarmCapability',
    'cancelAffirmationAlarm',
    'DEFAULT_AFFIRMATION_ALARM_ID',
    'AppState',
    `${componentSource}\nreturn NativeAlarmContentSync;`
  )(
    fakeReact,
    { OS: 'ios' },
    () => ({
      state: currentState,
      saveMorningRitualPreferences: (patch) => savedPatches.push(patch),
    }),
    (state) => state.desired,
    (payload) => new Promise((resolve) => replacements.push({ payload, resolve })),
    async () => ({ ok: true }),
    () => new Promise((resolve) => capabilityRequests.push(resolve)),
    async () => {
      cancelCalls += 1;
      return { ok: true };
    },
    'c31e57e0-75ee-4de2-9526-0cc321f55a11',
    { addEventListener: () => ({ remove() {} }) }
  );

  const renderContentEffect = (state) => {
    currentState = state;
    hookCursor = 0;
    effectCursor = 0;
    NativeAlarmContentSync();
    assert.strictEqual(effects.length, 2, 'sync component must keep capability and content effects separate');
    effects[1].factory();
  };

  const ritual = {
    reminderEnabled: true,
    alarmSyncError: true,
    reminderTime: '07:00',
    wakeAffirmationId: 'old',
    wakeAffirmationText: 'Old affirmation',
    wakeAffirmationLang: 'pt',
  };
  renderContentEffect({
    morningRitual: ritual,
    desired: { id: 'manifestation:a', text: 'Affirmation A', lang: 'pt' },
  });
  assert.strictEqual(replacements.length, 1, 'intent A must start its replacement');

  replacements[0].resolve({ ok: false, reason: 'native_operation_failed' });
  await flushMicrotasks();
  assert.strictEqual(capabilityRequests.length, 1, 'A failure must reconcile native capability');

  renderContentEffect({
    morningRitual: ritual,
    desired: { id: 'manifestation:b', text: 'Affirmation B', lang: 'pt' },
  });
  assert.strictEqual(replacements.length, 2, 'intent B must enter while A awaits capability');

  capabilityRequests[0]({
    scheduledAlarmIds: ['c31e57e0-75ee-4de2-9526-0cc321f55a11'],
  });
  await flushMicrotasks();
  await flushMicrotasks();
  assert.strictEqual(cancelCalls, 0, 'stale failure A cannot cancel after intent B has entered');

  replacements[1].resolve({ ok: true });
  await flushMicrotasks();
  assert.ok(
    savedPatches.some((patch) => patch.wakeAffirmationId === 'manifestation:b'),
    'the newer successful intent must remain authoritative'
  );
}

verifyStaleAlarmFailureCannotCancelNewIntent()
  .then(() => {
    process.stdout.write('Ritual matinal: sonho pessoal, seguro, persistente e bilingue aprovado\n');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
