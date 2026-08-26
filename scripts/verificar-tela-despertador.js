const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function compile(relativePath) {
  const filename = path.join(root, relativePath);
  return transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
}

function loadPureModule(relativePath) {
  const filename = path.join(root, relativePath);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compile(relativePath), filename);
  return loaded.exports;
}

for (const file of [
  'screens/AffirmationAlarmScreen.js',
  'screens/MorningRitualScreen.js',
  'screens/HomeScreen.js',
  'context/AppContext.js',
  'utils/alarmSchedule.js',
  'utils/personalAffirmations.js',
]) {
  compile(file);
}

const schedule = loadPureModule('utils/alarmSchedule.js');
assert.deepStrictEqual(schedule.normalizeAlarmWeekdays([7, 1, 3, 1]), [1, 3, 7]);
assert.strictEqual(schedule.normalizeAlarmWeekdays([]), null);
assert.strictEqual(schedule.normalizeAlarmWeekdays([0, 1]), null);
assert.strictEqual(schedule.normalizeAlarmWeekdays([1, '2']), null);
assert.deepStrictEqual(schedule.alarmWeekdaysOrDefault(undefined), [1, 2, 3, 4, 5, 6, 7]);
assert.deepStrictEqual(schedule.alarmWeekdaysOrDefault([]), [1, 2, 3, 4, 5, 6, 7]);

const { alarmAffirmationText, personalAffirmationsForState } = loadPureModule('utils/personalAffirmations.js');
const longAlarmText = alarmAffirmationText(`Eu escolho ${'presença e coragem '.repeat(30)}`);
assert.ok(longAlarmText.length > 0 && longAlarmText.length <= 280, 'frase longa do alarme deve ser cortada com segurança');
const affirmations = personalAffirmationsForState({
  manifestations: [
    { id: 'm1', affirmation: '  Eu avanço com calma.  ', lang: 'pt' },
    { id: 'empty', affirmation: ' ' },
  ],
  morningRitual: {
    wakeAffirmationId: 'custom',
    wakeAffirmationText: ' Minha frase pessoal. ',
    wakeAffirmationLang: 'pt',
    entries: [{ id: 'd1', affirmation: 'I trust my next step.', lang: 'en' }],
  },
});
assert.deepStrictEqual(
  affirmations.map(({ id, text, lang, source }) => ({ id, text, lang, source })),
  [
    { id: 'manifestation:m1', text: 'Eu avanço com calma.', lang: 'pt', source: 'manifestation' },
    { id: 'ritual:d1', text: 'I trust my next step.', lang: 'en', source: 'dream' },
    { id: 'custom', text: 'Minha frase pessoal.', lang: 'pt', source: 'custom' },
  ],
  'o despertador deve listar apenas conteúdo pessoal válido'
);

const screen = read('screens/AffirmationAlarmScreen.js');
const activation = screen.slice(screen.indexOf('const activate = useCallback'), screen.indexOf('const deactivate = useCallback'));
const webSave = screen.slice(screen.indexOf('const saveWebChoice = useCallback'), screen.indexOf('const deactivate = useCallback'));
const cancellation = screen.slice(screen.indexOf('const deactivate = useCallback'), screen.indexOf('const goBack = useCallback'));
const selection = screen.slice(screen.indexOf('const choose = useCallback'), screen.indexOf('const chooseCustom = useCallback'));

assert.ok(screen.includes('personalAffirmationsForState(state)'), 'lista pessoal compartilhada ausente');
assert.ok(screen.includes('testID="alarm-time-input"'), 'horário editável ausente');
assert.ok(screen.includes('accessibilityRole="checkbox"'), 'dias devem ser checkboxes acessíveis');
for (let day = 1; day <= 7; day += 1) {
  assert.ok(screen.includes(`value: ${day}`), `dia ISO ${day} ausente`);
}
assert.ok(screen.includes('<FlatList'), 'seletor de afirmações deve continuar virtualizado');
assert.ok(screen.includes('requestAuthorization: true'), 'autorização precisa nascer do CTA explícito');
assert.ok(
  activation.indexOf('await scheduleAffirmationAlarm') < activation.indexOf('saveMorningRitualPreferences'),
  'o agendamento nativo precisa ser confirmado antes da persistência'
);
assert.ok(
  activation.includes('if (response.ok === true)') &&
    activation.includes('weekdays,') &&
    activation.includes('wakeAffirmationText: selected.text') &&
    activation.includes('wakeNarratorId: narration.narratorId') &&
    activation.includes('wakeSoundSource: response.soundSource'),
  'sucesso deve persistir exatamente frase, voz, horário e dias confirmados'
);
assert.ok(!selection.includes('saveMorningRitualPreferences'), 'escolher frase inativa deve alterar só o rascunho');
assert.ok(!selection.includes('scheduleAffirmationAlarm'), 'escolher frase não pode pedir permissão');
assert.ok(
  cancellation.indexOf('await cancelAffirmationAlarm') < cancellation.indexOf('reminderEnabled: false'),
  'cancelamento também precisa ser confirmado antes de esconder o alarme'
);
assert.ok(screen.includes('Linking.openSettings()'), 'permissão negada precisa oferecer Ajustes');
assert.ok(screen.includes('O iPhone não confirmou o agendamento. Nada foi salvo'), 'erro honesto ausente');
assert.ok(
  activation.includes('narration.preparePersonal') &&
    activation.includes('wavBytesToBase64(prepared.bytes)') &&
    activation.includes('audioBase64Wav,'),
  'o alarme real precisa receber a mesma voz neural escolhida na prévia'
);
assert.ok(
  activation.indexOf('narration.preparePersonal') < activation.indexOf('await scheduleAffirmationAlarm'),
  'a voz neural precisa estar pronta antes de tocar no agendamento nativo'
);
assert.ok(!/elevenlabs|voiceIdentifier|EXPO_PUBLIC_ELEVEN/i.test(screen), 'despertador não pode expor segredo de voz');

assert.ok(
  activation.indexOf('await confirmAsync') < activation.indexOf('narration.preparePersonal'),
  'ativacao nativa deve pedir confirmacao antes de gerar audio ou solicitar permissao'
);
assert.ok(
  webSave.includes('saveMorningRitualPreferences') &&
    webSave.includes('wakeAffirmationText: selected.text') &&
    webSave.includes("setFeedback('saved_draft')"),
  'o site deve salvar e confirmar o rascunho do despertador'
);
assert.ok(
  !webSave.includes('reminderEnabled: true') && !webSave.includes('scheduleAffirmationAlarm'),
  'salvar no site nao pode fingir que um alarme nativo foi ativado'
);
assert.ok(
  screen.includes("Platform.OS === 'web' ? saveWebChoice : activate") &&
    screen.includes('Salvar minha escolha'),
  'o CTA web precisa confirmar a escolha em vez de parecer inerte'
);

const morning = read('screens/MorningRitualScreen.js');
assert.ok(morning.includes("mode = 'dreams'"), 'ritual deve abrir em modo somente sonhos');
assert.ok(morning.includes("const alarmVisible = mode === 'combined'"), 'modo legado precisa ficar explicitamente isolado');
assert.ok(morning.includes('{alarmVisible ? ('), 'configuração antiga do alarme não foi escondida');
assert.ok(
  morning.includes("navigation.navigate('AffirmationAlarm', { preselectId: `ritual:${entryId}` })"),
  'frase do sonho deve abrir o despertador sem agendar silenciosamente'
);
assert.ok(
  morning.includes('cloudAdultConfirmed === true') &&
    morning.includes('cloudDreamConsent === true') &&
    morning.includes('transformDreamWithKnowledge'),
  'sonho só pode ir ao Gemini com consentimentos explícitos e confirmação adulta'
);
assert.ok(!morning.includes('console.log('), 'conteúdo do sonho não pode ir para logs');

const home = read('screens/HomeScreen.js');
assert.ok(home.includes('testID="open-dream-journal"'), 'atalho de sonhos ausente da Home');
assert.ok(home.includes('testID="open-affirmation-alarm"'), 'atalho separado do despertador ausente da Home');
assert.ok(home.includes("navigation.navigate('AffirmationAlarm')"), 'Home não abre a nova tela');

assert.ok(home.includes('testID="open-community-home"'), 'comunidade continua escondida fora da Home');

const content = read('constants/content.js');
const context = read('context/AppContext.js');
const app = read('App.js');
assert.ok(content.includes('weekdays: [1, 2, 3, 4, 5, 6, 7]'), 'estado inicial deve repetir todos os dias');
assert.ok(context.includes('weekdays: alarmWeekdaysOrDefault(savedRitual.weekdays)'), 'estado legado não migra os dias');
assert.ok(context.includes('normalizeAlarmWeekdays(patch.weekdays)'), 'patch de dias não é validado');
assert.ok(content.includes('wakeNarratorId: null'), 'estado inicial não acompanha a voz do despertador');
assert.ok(context.includes('isNarratorId(savedRitual.wakeNarratorId)'), 'voz salva do alarme não é validada');
assert.ok(
  app.includes("import { alarmAffirmationText } from './utils/personalAffirmations'") &&
    app.includes('alarmAffirmationText(manifestation && manifestation.affirmation)'),
  'sincronização nativa deve usar exatamente o mesmo corte mostrado na tela'
);

process.stdout.write('Tela de despertador separada, transacional e recorrente aprovada\n');
