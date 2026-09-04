const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

function compile(file) {
  return transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
}

function load(file, mocks = {}) {
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const nativeRequire = Module.createRequire(file);
  loaded.require = (request) =>
    Object.prototype.hasOwnProperty.call(mocks, request) ? mocks[request] : nativeRequire(request);
  loaded._compile(compile(file), file);
  return loaded.exports;
}

const livingMirror = load(path.join(root, 'utils', 'livingMirror.js'));
const personalJourney = load(path.join(root, 'utils', 'personalJourney.js'));
const personalAffirmations = load(path.join(root, 'utils', 'personalAffirmations.js'), {
  './personalJourney': personalJourney,
});
const daily = load(path.join(root, 'utils', 'dailyRitual.js'), {
  './date': { todayISO: () => '2026-08-26' },
  './livingMirror': livingMirror,
  './personalAffirmations': personalAffirmations,
});

const manifestation = {
  id: 'm-1',
  title: 'Meu estudio',
  story: 'Eu abro meu estúdio e reconheço cada detalhe da vida que estou construindo.',
  affirmation: 'Eu construo meu estudio com constancia.',
  anchorIdentity: 'Eu sou consistente.',
  anchorStep: 'Abrir o caderno por dez minutos.',
  lang: 'pt',
  goalDays: 21,
  sessions: [],
  livingMirror: livingMirror.emptyLivingMirror(),
  journeySuiteByLang: {
    pt: {
      affirmations: [{ category: 'Peace', text: 'Eu cultivo serenidade agora.' }],
      visions: [{ category: 'Peace', title: 'Meu dia sereno', story: 'Eu vejo um dia sereno diante de mim.' }],
    },
  },
};
const dream = {
  id: 'd-1',
  affirmation: 'Eu acolho a clareza que senti.',
  lang: 'pt',
  createdAt: '2026-08-26T07:00:00.000Z',
  practiceCount: 0,
  lastPracticedAt: null,
};
const base = {
  lang: 'pt',
  anchorSceneId: 'm-1',
  manifestations: [manifestation],
  morningRitual: { entries: [dream], wakeAffirmationId: null, wakeAffirmationText: '' },
  affirmationDates: [],
};

const fallback = daily.selectDailyRitual(base, '2026-08-26');
assert.strictEqual(fallback.sourceType, 'manifestation');
assert.strictEqual(fallback.selection, 'practice');

const chosenDream = daily.selectDailyRitual({
  ...base,
  morningRitual: { ...base.morningRitual, wakeAffirmationId: 'ritual:d-1' },
}, '2026-08-26');
assert.strictEqual(chosenDream.sourceType, 'dream', 'frase escolhida no despertador tem prioridade');

for (const [wakeAffirmationId, expected] of [
  ['m-1:affirmation:Peace', 'Eu cultivo serenidade agora.'],
  ['m-1:vision:Peace', 'Eu vejo um dia sereno diante de mim.'],
  ['anchor:m-1', manifestation.story],
]) {
  const chosen = daily.selectDailyRitual({
    ...base,
    morningRitual: { ...base.morningRitual, wakeAffirmationId },
  }, '2026-08-26');
  assert.strictEqual(chosen.selection, 'alarm', `${wakeAffirmationId} deve manter prioridade`);
  assert.strictEqual(chosen.sourceType, 'manifestation');
  assert.strictEqual(chosen.sourceId, 'm-1');
  assert.strictEqual(chosen.affirmation, expected);
}

const stale = daily.selectDailyRitual({
  ...base,
  morningRitual: { ...base.morningRitual, wakeAffirmationId: 'manifestation:apagada' },
}, '2026-08-26');
assert.strictEqual(stale.sourceId, 'm-1', 'id antigo deve cair numa afirmacao pessoal existente');

const custom = daily.selectDailyRitual({
  ...base,
  morningRitual: {
    ...base.morningRitual,
    wakeAffirmationId: 'custom',
    wakeAffirmationText: 'Eu escolho um dia presente.',
    wakeAffirmationLang: 'pt',
  },
}, '2026-08-26');
assert.strictEqual(custom.sourceType, 'custom');
assert.strictEqual(custom.affirmation, 'Eu escolho um dia presente.');

const narration = daily.dailyRitualNarration(fallback, 'pt');
assert.ok(narration.includes(manifestation.affirmation), 'audio precisa usar a afirmacao pessoal');
assert.ok(!narration.includes(manifestation.anchorStep), 'a Ponte deve aparecer depois sem estourar o minuto narrado');

const longNarration = daily.dailyRitualNarration({
  ...fallback,
  affirmation: Array.from({ length: 100 }, (_, index) => `palavra${index}`).join(' '),
}, 'pt');
assert.ok(longNarration.length < 620, 'narracao longa precisa deixar tempo de silencio dentro do minuto');
assert.ok(longNarration.endsWith('palavras.'), 'o fechamento narrado precisa usar o idioma da afirmacao');

const englishNarration = daily.dailyRitualNarration({
  ...fallback,
  lang: 'en',
  affirmation: 'I move with clarity.',
}, 'pt');
assert.ok(englishNarration.startsWith('Take one slow breath.'), 'idioma da fonte deve vencer o idioma da interface');

for (const relative of ['screens/DailyRitualScreen.js', 'screens/HomeScreen.js', 'App.js']) {
  compile(path.join(root, relative));
}
const screen = fs.readFileSync(path.join(root, 'screens', 'DailyRitualScreen.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'screens', 'HomeScreen.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
assert.ok(screen.includes("setPhase('complete')"), 'o minuto precisa de um estado final estavel');
assert.ok(screen.includes('logSession(ritual.sourceId)'), 'manifestacao deve reutilizar a sessao atual');
assert.ok(screen.includes('markDreamRitualPracticed(ritual.sourceId)'), 'sonho deve reutilizar sua pratica atual');
assert.ok(screen.includes('markAffirmationRead()'), 'ritual deve alimentar a jornada sem nova lista paralela');
assert.ok(!screen.includes('generatePersonalizedScene'), 'abrir o ritual nunca pode gastar Gemini sozinho');
assert.ok(
  screen.includes('ritualLockedRef.current = true') &&
    screen.includes('!ritualLockedRef.current'),
  'conclusao deve manter o mesmo ritual mesmo quando a fila de manifestacoes mudar'
);
assert.ok(
  screen.includes("if (phase !== 'ready')"),
  'sair durante o preparo ou o minuto precisa reiniciar sem marcar conclusao'
);
assert.ok(screen.includes("AppState.addEventListener('change'"), 'segundo plano deve reiniciar um minuto incompleto');
assert.ok(!screen.includes('style={styles.actionArea} accessibilityLiveRegion="polite"'), 'cronometro nao pode anunciar cada segundo');
assert.ok(home.includes('testID="open-daily-ritual"'), 'Home precisa de uma entrada primaria unica');
assert.ok(!home.includes('openFirstPending'), 'cards antigos de pratica nao podem competir com o minuto');
assert.ok(app.includes('<Root.Screen name="DailyRitual"'), 'rota raiz do ritual ausente');
assert.ok(app.includes("DailyRitual: 'ritual'"), 'deep link celeste://ritual ausente');

process.stdout.write('Ritual de Um Minuto: selecao, voz e conclusao aprovadas\n');
