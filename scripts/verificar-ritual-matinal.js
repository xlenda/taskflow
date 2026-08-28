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
assert.strictEqual(inferDreamTheme('Eu corria no escuro com medo', ''), 'courage');
assert.strictEqual(inferDreamTheme('I found a quiet garden', ''), 'peace');
assert.strictEqual(inferDreamTheme('Qualquer símbolo', 'anxious'), 'courage');

const pt = createDreamAffirmation({
  dream: 'Eu estava em uma casa perto do mar.',
  feeling: 'calm',
  theme: 'auto',
  lang: 'pt',
  profile: { aboutYou: 'pro ativo bondoso' },
});
assert.strictEqual(pt.theme, 'peace');
assert.ok(pt.affirmation.startsWith('Eu '), 'afirmacao PT deve estar em primeira pessoa');
assert.ok(pt.reflection.includes('calma'), 'reflexao PT deve considerar o sentimento');
assert.strictEqual(pt.dreamAnchor, '', 'o relato original nao pode virar trecho exibivel');
assert.ok(!/casa perto do mar/i.test(`${pt.reflection} ${pt.affirmation}`), 'saida local recontou o sonho');
assert.ok(/proatividade/.test(pt.affirmation) && /bondade/.test(pt.affirmation), 'perfil seguro nao entrou com redacao natural');
assert.ok(!/pro ativo bondoso/i.test(pt.affirmation), 'rascunho cru do perfil foi copiado');
assert.deepStrictEqual(pt.usedDetails, ['dream_semantics', 'feeling', 'theme']);
assert.strictEqual(pt.generatorVersion, 'dream-local-v4');
assert.ok(/não uma previsão, diagnóstico ou verdade escondida/i.test(pt.reflection), 'sonho nao pode virar previsao ou diagnostico');

const en = createDreamAffirmation({
  dream: 'I opened a door and started flying.',
  feeling: 'curious',
  theme: 'renewal',
  lang: 'en',
});
assert.strictEqual(en.theme, 'renewal');
assert.ok(en.affirmation.startsWith('I '), 'English affirmation must be in first person');
assert.strictEqual(en.dreamAnchor, '');
assert.ok(!/opened a door|started flying/i.test(`${en.reflection} ${en.affirmation}`), 'English output retold the recall');

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
assert.ok(
  !/wooden bridge|under the moon/i.test(`${sameThemeDifferentDream.reflection} ${sameThemeDifferentDream.affirmation}`),
  'a second local result echoed its dream narrative'
);

const feelingKeepsDream = createDreamAffirmation({
  dream: 'Eu encontrei uma porta azul no jardim.',
  feeling: 'calm',
  theme: 'auto',
  lang: 'pt',
});
assert.ok(
  !/porta azul|jardim/i.test(`${feelingKeepsDream.reflection} ${feelingKeepsDream.affirmation}`),
  'sentimento e tema devem transformar o residuo emocional sem recontar a imagem'
);
assert.strictEqual(
  feelingKeepsDream.theme,
  'peace',
  'modo automatico deve combinar o sentido amplo do relato com o sentimento escolhido'
);

const sensitive = createDreamAffirmation({
  dream: 'Sonhei que fui cortada ao meio com uma serra elétrica.',
  feeling: 'anxious',
  lang: 'pt',
});
assert.strictEqual(sensitive.dreamAnchor, '', 'imagem sensivel nao deve ser repetida no audio');
assert.ok(!/serra|cortad|meio/i.test(`${sensitive.reflection} ${sensitive.affirmation}`), 'saida nao deve ecoar detalhe perturbador');
assert.ok(/não é uma previsão/i.test(sensitive.reflection), 'relato intenso precisa de aterramento');
assert.strictEqual(
  extractDreamAnchor('Uma motosserra cortava meu corpo.', 'pt').redacted,
  true,
  'a allowlist local de pesadelos nao reconheceu corte e serra'
);

for (const result of [pt, en, sameThemeDifferentDream, feelingKeepsDream, sensitive]) {
  assert.ok(!/100\s*%|garantid|vai acontecer|will happen|guaranteed/i.test(result.affirmation));
}

const oversized = createDreamAffirmation({ dream: `inicio ${'x'.repeat(2000)}`, lang: 'pt' });
assert.ok(oversized.dream.length <= 1600, 'dream must be bounded before persistence');

const screenFile = path.join(root, 'screens', 'MorningRitualScreen.js');
const appFile = path.join(root, 'App.js');
const manifestationFile = path.join(root, 'screens', 'ManifestationScreen.js');
const journeyFile = path.join(root, 'screens', 'JourneyScreen.js');
compile(screenFile);
compile(appFile);
compile(manifestationFile);
compile(journeyFile);
const screen = fs.readFileSync(screenFile, 'utf8');
const app = fs.readFileSync(appFile, 'utf8');
const manifestation = fs.readFileSync(manifestationFile, 'utf8');
const journey = fs.readFileSync(journeyFile, 'utf8');
const alarmService = fs.readFileSync(path.join(root, 'services', 'affirmationAlarm.js'), 'utf8');
assert.ok(screen.includes('SpeechRecognition'), 'voice bonus must use browser capability detection');
assert.ok(screen.includes('No site você pode escolher'), 'web status must be honest about alarm support');
assert.ok(screen.includes('scheduleAffirmationAlarm'), 'real alarm must use the native adapter');
assert.ok(screen.includes('if (response.ok === true)'), 'alarm must only be active after native confirmation');
assert.ok(
  /if \(response\.ok === true\) \{[\s\S]*reminderEnabled: true[\s\S]*wakeAffirmationId: id[\s\S]*wakeAffirmationText: text/.test(screen),
  'native alarm success and exact content must survive a screen pop'
);
assert.ok(
  screen.includes("wakeSoundSource: response.soundSource || 'local_speech'") &&
    screen.includes('wakeNarratorId: narration.narratorId || null'),
  'fala local confirmada precisa persistir sua fonte sem virar falso erro de sincronizacao'
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
    languageSyncBlock.indexOf('return replaceScheduledAffirmationAlarm')
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
    languageSyncBlock.includes('prepareNeuralAlarm') &&
      languageSyncBlock.includes('audioBase64Wav: neuralAudio.audioBase64Wav') &&
      languageSyncBlock.includes("['neural_wav', 'local_speech'].includes(response.soundSource)"),
    'sincronizacao deve aceitar a fonte que o AlarmKit confirmou'
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
assert.ok(screen.includes('testID="open-dream-bonus"'), 'dream entry must remain visible in its own section');
assert.ok(
  screen.includes('testID={`saved-dream-${savedEntry.id}`}') &&
    screen.includes('safeReflection = clean(savedEntry.reflection)') &&
    screen.includes("setDream('')") &&
    !screen.includes('setDream(savedEntry.dream)'),
  'historico deve reabrir qualquer reflexao segura sem exibir o relato bruto'
);
assert.ok(
  screen.includes('testID="dream-cloud-fallback"') &&
    screen.includes('testID="retry-dream-cloud"') &&
    screen.includes('replaceId: entryId'),
  'fallback local precisa ser explicado e permitir retry sem duplicar o sonho'
);
assert.ok(screen.includes('FlatList'), 'affirmation picker must remain virtualized');

const selectWakeBlock = screen.slice(screen.indexOf('const selectWake'), screen.indexOf('const selectAlarmTime'));
const selectTimeBlock = screen.slice(screen.indexOf('const selectAlarmTime'), screen.indexOf('const saveCustomWake'));
const resultWakeBlock = screen.slice(screen.indexOf('const useResultAsWake'), screen.indexOf('const deleteCurrentDream'));
const deleteDreamBlock = screen.slice(screen.indexOf('const deleteCurrentDream'), screen.indexOf('const renderOption'));
const deleteManifestationBlock = manifestation.slice(
  manifestation.indexOf('const confirmDelete'),
  manifestation.indexOf('const playPct')
);
const resetJourneyBlock = journey.slice(
  journey.indexOf('const confirmReset'),
  journey.indexOf('// Web-only')
);
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
  ['sonho', deleteDreamBlock],
  ['manifestacao', deleteManifestationBlock],
  ['jornada', resetJourneyBlock],
]) {
  assert.ok(
    block.includes("Platform.OS === 'android'") && block.includes('cancelAffirmationAlarm'),
    `${name} precisa cancelar o alarme nativo tambem no Android`
  );
}
assert.ok(
  languageSyncBlock.includes("Platform.OS !== 'android'") &&
    app.slice(app.indexOf('const repairStorageAndAlarm'), app.indexOf('// O <html lang>')).includes(
      "Platform.OS === 'android'"
    ),
  'reconciliacao global e reparo de armazenamento precisam cobrir alarmes Android'
);
for (const [name, block] of [
  ['wake phrase', selectWakeBlock],
  ['alarm time', selectTimeBlock],
]) {
  assert.ok(block.includes('await scheduleRealAlarm'), `${name} must reschedule an active native alarm`);
  assert.ok(
    block.indexOf('await scheduleRealAlarm') < block.indexOf('saveMorningRitualPreferences'),
    `${name} cannot update the UI before native rescheduling succeeds`
  );
  assert.ok(block.includes('if (!scheduled) return'), `${name} must preserve the old selection after native failure`);
}
assert.ok(
  resultWakeBlock.includes("navigation.navigate('AffirmationAlarm'") &&
    resultWakeBlock.includes('preselectId: `ritual:${entryId}`') &&
    !resultWakeBlock.includes('scheduleRealAlarm') &&
    !resultWakeBlock.includes('saveMorningRitualPreferences'),
  'a frase do sonho deve abrir a tela própria; permissão e persistência ficam no CTA do despertador'
);

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
assert.ok(
  context.includes('requestedReplacementId') &&
    context.includes('entry.id === requestedReplacementId') &&
    context.includes('entries.map((entry) => (entry.id === id ? item : entry))'),
  'retry em nuvem deve atualizar a reflexao existente sem duplicar o historico'
);
assert.ok(context.includes('markDreamRitualPracticed'), 'practice action missing');
assert.ok(context.includes('dreamAnchor: shortText'), 'dream anchor must survive reload');
assert.ok(context.includes("generatorVersion: shortText(entry.generatorVersion"), 'generator version must survive reload');
assert.ok(
  context.includes('personalAffirmationIds.has(id) || ritualIds.has(id)'),
  'favorite dream affirmations must survive reload and import'
);
assert.ok(
  context.includes('const fallbackAffirmation') &&
    context.includes('const fallbackDream') &&
    context.includes('st.morningRitual.alarmSyncError = st.morningRitual.reminderEnabled') &&
    context.includes('st.morningRitual.reminderEnabled = false'),
  'legacy catalog alarms must force native personal-content replacement or be disabled'
);

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

async function verifyStaleAlarmFailureCannotCancelNewIntent(platformOS) {
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
    'useNarration',
    'alarmContentForState',
    'alarmSyncSignature',
    'prepareNeuralAlarm',
    'replaceScheduledAffirmationAlarm',
    'scheduleAffirmationAlarm',
    'getAffirmationAlarmCapability',
    'cancelAffirmationAlarm',
    'DEFAULT_AFFIRMATION_ALARM_ID',
    'AppState',
    `${componentSource}\nreturn NativeAlarmContentSync;`
  )(
    fakeReact,
    { OS: platformOS },
    () => ({
      state: currentState,
      saveMorningRitualPreferences: (patch) => savedPatches.push(patch),
    }),
    () => ({ preparePersonal: async () => ({ ok: true }) }),
    (state) => state.desired,
    (desired, alarmRitual, narratorId) =>
      JSON.stringify([
        desired.id,
        desired.text,
        desired.lang,
        alarmRitual && alarmRitual.reminderTime,
        alarmRitual && alarmRitual.weekdays,
        narratorId,
      ]),
    async () => ({ ok: true, audioBase64Wav: 'UklGRgAAAABXQVZF' }),
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

  const renderContentEffect = async (state) => {
    currentState = state;
    hookCursor = 0;
    effectCursor = 0;
    NativeAlarmContentSync();
    assert.strictEqual(effects.length, 2, 'sync component must keep capability and content effects separate');
    effects[1].factory();
    await flushMicrotasks();
  };

  const ritual = {
    reminderEnabled: true,
    alarmSyncError: true,
    reminderTime: '07:00',
    wakeAffirmationId: 'old',
    wakeAffirmationText: 'Old affirmation',
    wakeAffirmationLang: 'pt',
    wakeNarratorId: 'aurora',
    wakeSoundSource: 'neural_wav',
  };
  await renderContentEffect({
    morningRitual: ritual,
    desired: { id: 'manifestation:a', text: 'Affirmation A', lang: 'pt' },
    narration: { narratorId: 'aurora' },
  });
  assert.strictEqual(replacements.length, 1, 'intent A must start its replacement');

  replacements[0].resolve({ ok: false, reason: 'native_operation_failed' });
  await flushMicrotasks();
  assert.strictEqual(capabilityRequests.length, 1, 'A failure must reconcile native capability');

  await renderContentEffect({
    morningRitual: ritual,
    desired: { id: 'manifestation:b', text: 'Affirmation B', lang: 'pt' },
    narration: { narratorId: 'aurora' },
  });
  assert.strictEqual(replacements.length, 2, 'intent B must enter while A awaits capability');

  capabilityRequests[0]({
    scheduledAlarmIds: ['c31e57e0-75ee-4de2-9526-0cc321f55a11'],
  });
  await flushMicrotasks();
  await flushMicrotasks();
  assert.strictEqual(cancelCalls, 0, 'stale failure A cannot cancel after intent B has entered');

  replacements[1].resolve({ ok: true, soundSource: 'neural_wav' });
  await flushMicrotasks();
  assert.ok(
    savedPatches.some((patch) => patch.wakeAffirmationId === 'manifestation:b'),
    'the newer successful intent must remain authoritative'
  );

  const replacementsBeforeLocalSpeech = replacements.length;
  const patchesBeforeLocalSpeech = savedPatches.length;
  await renderContentEffect({
    morningRitual: {
      ...ritual,
      alarmSyncError: true,
      wakeAffirmationId: 'manifestation:local',
      wakeAffirmationText: 'Local speech remains valid',
      wakeAffirmationLang: 'en',
      wakeNarratorId: 'aurora',
      wakeSoundSource: 'local_speech',
    },
    desired: {
      id: 'manifestation:local',
      text: 'Local speech remains valid',
      lang: 'en',
    },
    narration: { narratorId: 'serena' },
  });
  assert.strictEqual(
    replacements.length,
    replacementsBeforeLocalSpeech,
    'fala local ja confirmada nao pode exigir uma nova geracao neural'
  );
  assert.ok(
    savedPatches.slice(patchesBeforeLocalSpeech).some((patch) => patch.alarmSyncError === false),
    'estado antigo de fala local precisa remover o falso alarmSyncError'
  );
}

Promise.all([
  verifyStaleAlarmFailureCannotCancelNewIntent('ios'),
  verifyStaleAlarmFailureCannotCancelNewIntent('android'),
])
  .then(() => {
    process.stdout.write('Ritual matinal: sonho pessoal, seguro, persistente e bilingue aprovado\n');
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
