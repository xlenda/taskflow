// Portão da sessão de 7 minutos. `--logica`: só roteiro, tempos, afirmações do dia e registro (utils/guidedSession.js);
// sem ele entram também o motor (screens/WakeSequenceScreen.js) e o registro no contexto.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

// Babel nos arquivos do projeto, inclusive nos imports aninhados (utils em ESM).
function load(relative) {
  const originalJs = Module._extensions['.js'];
  Module._extensions['.js'] = (loaded, filename) => {
    if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
      originalJs(loaded, filename);
      return;
    }
    const code = transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      presets: ['babel-preset-expo'],
      sourceType: 'module',
    }).code;
    loaded._compile(code, filename);
  };
  try {
    return require(path.join(root, relative));
  } finally {
    Module._extensions['.js'] = originalJs;
  }
}

const {
  SESSION_TARGET_SECONDS,
  SESSION_PAUSE_MS,
  SCENE_PAUSE_RANGE_MS,
  SESSION_AFFIRMATIONS,
  SESSION_AFFIRMATION_POOL,
  pickDailyAffirmations,
  sessionItemsForState,
  sessionSeconds,
  applyGuidedSessionDone,
} = load('utils/guidedSession.js');
const { wakeSequenceOptionsForState } = load('utils/wakeSequence.js');
const { personalAffirmationsForState } = load('utils/personalAffirmations.js');
const { journeyForDay } = load('utils/weeklyJourney.js');
const { SESSION_GUIDE, SESSION_GUIDE_CLIPS } = load('constants/sessionGuide.js');
const { bridgeDoneOn } = load('utils/livingMirror.js');

// ---------- Lógica ----------
assert.strictEqual(SESSION_TARGET_SECONDS, 420, 'alvo da sessão precisa ser 420 s');
assert.deepStrictEqual(
  SESSION_PAUSE_MS,
  { breath: 60000, desire: 20000, affirmation: 20000, journey: 30000, bridge: 30000 },
  'pausas da sessão mudaram'
);
assert.deepStrictEqual(SCENE_PAUSE_RANGE_MS, [30000, 120000], 'faixa da pausa da cena mudou');
assert.strictEqual(SESSION_AFFIRMATIONS, 3, 'a sessão toca 3 afirmações');
assert.strictEqual(SESSION_AFFIRMATION_POOL, 12, 'as afirmações saem das 12 primeiras');

// Texto de tamanho exato, espaço simples e sem espaço nas pontas (a limpeza do app não muda o tamanho).
const sized = (seed, n) => `${seed.repeat(Math.ceil(n / seed.length) + 1).slice(0, n - 1).trimEnd()}.`.padStart(n, 'E');
const CATS = ['Love', 'Wealth', 'Career', 'Health', 'Confidence', 'Peace'];
const DAY = '2026-11-24';
const TITLE = sized('Minha casa clara perto do mar ', 40);
const stateWith = (storyLength, extra = {}) => ({
  lang: 'pt',
  anchorSceneId: 'm1',
  manifestations: [{
    id: 'm1',
    title: TITLE,
    category: 'Peace',
    story: sized('Eu entro na minha cena com calma e presença. ', storyLength),
    affirmation: 'Eu sigo com presença.',
    lang: 'pt',
    goalDays: 21,
    sessions: ['2026-11-20'],
    evidence: [{ id: 'e-antiga', text: 'Sinal antigo', createdAt: '2026-11-20T10:00:00.000Z' }],
    anchorStep: 'Arrumar a mesa da varanda.',
    visual: { cacheKey: 'anchor-visual' },
    journeySuiteByLang: {
      pt: {
        visions: [],
        affirmations: CATS.map((category, i) => ({
          category,
          text: sized(`Afirmação ${i}: eu sigo firme no meu caminho, todo dia. `, 60),
        })),
      },
    },
  }],
  morningRitual: { entries: [] },
  ...extra,
});
const reference = stateWith(700);
const anchorText = (state) => wakeSequenceOptionsForState(state, 'pt').find((o) => o.kind === 'anchor').text;
assert.strictEqual(anchorText(reference).length, 700, 'fixture: história de 700 caracteres');
assert.strictEqual(TITLE.length, 40, 'fixture: título de 40 caracteres');
const pool = personalAffirmationsForState(reference);
assert.strictEqual(pool.length, 6, 'fixture: 6 afirmações');
assert.ok(pool.every((item) => item.text.length === 60), 'fixture: afirmações de 60 caracteres');

const ORDER = [
  'guide:breath', 'guide:desire', 'desire', 'guide:scene', 'anchor', 'guide:affirm',
  'affirmation', 'affirmation', 'affirmation', 'journey', 'guide:bridge', 'guide:close',
];
const shape = (items) => items.map((item) => (item.kind === 'guide' ? item.id : item.kind));
const journey = journeyForDay(DAY);
assert.ok(journey, `biblioteca real precisa ter jornada em ${DAY}`);

for (const lang of ['pt', 'en']) {
  const items = sessionItemsForState(reference, lang, DAY);
  const at = (key) => items.find((item) => (item.kind === 'guide' ? item.id : item.kind) === key);
  assert.deepStrictEqual(shape(items), ORDER, `ordem dos itens da sessão (${lang})`);

  for (const item of items.filter((i) => i.kind === 'guide' || i.kind === 'journey')) {
    assert.ok(item.clipId && typeof item.text === 'string' && item.text.trim(), `${item.id} precisa de clipId e texto (${lang})`);
  }
  assert.deepStrictEqual(
    items.filter((i) => i.kind === 'guide').map((i) => [i.clipId, i.text, i.lang]),
    SESSION_GUIDE_CLIPS.map((clip) => [clip, SESSION_GUIDE[clip][lang], lang]),
    `falas do guia fora da ordem ou do idioma (${lang})`
  );

  const option = wakeSequenceOptionsForState(reference, lang).find((o) => o.kind === 'anchor');
  const anchor = at('anchor');
  for (const field of ['id', 'title', 'text', 'lang', 'visualKey', 'category', 'manifestationId']) {
    assert.strictEqual(anchor[field], option[field], `cena da sessão precisa ser a mesma do despertar (${field}, ${lang})`);
  }
  assert.strictEqual(anchor.still && anchor.still.kind, 'scene', `pausa da cena mostra a cena (${lang})`);

  assert.strictEqual(at('desire').text, TITLE, `o desejo é o título da Cena-Âncora (${lang})`);
  assert.strictEqual(at('journey').clipId, journey.clipId, `clip da jornada do dia (${lang})`);
  assert.strictEqual(at('journey').text, journey.day.line[lang], `frase da jornada do dia (${lang})`);
  assert.strictEqual(at('journey').title, journey.theme.title[lang], `título do tema (${lang})`);
  assert.strictEqual(at('journey').still.text, journey.day.affirmation[lang], `pausa da jornada mostra a afirmação do tema (${lang})`);
  assert.strictEqual(at('guide:bridge').still.text, journey.day.action[lang], `pausa da ponte mostra a micro-ação do dia (${lang})`);
  for (const item of items.filter((i) => i.still)) {
    assert.ok(item.still.label && item.still.label.pt && item.still.label.en, `${item.id}: rótulo da pausa em pt e en`);
  }

  const pauses = Object.fromEntries(items.map((item) => [item.kind === 'affirmation' ? item.id : shape([item])[0], item.pauseMs]));
  assert.strictEqual(pauses['guide:breath'], 60000, `respiração: 60 s (${lang})`);
  assert.strictEqual(pauses.desire, 20000, `desejo: 20 s (${lang})`);
  assert.strictEqual(pauses.journey, 30000, `jornada: 30 s (${lang})`);
  assert.strictEqual(pauses['guide:bridge'], 30000, `ponte: 30 s (${lang})`);
  for (const key of ['guide:desire', 'guide:scene', 'guide:affirm', 'guide:close']) {
    assert.strictEqual(pauses[key], undefined, `${key} segue com o respiro normal (${lang})`);
  }
  for (const item of items.filter((i) => i.kind === 'affirmation')) {
    assert.strictEqual(item.pauseMs, 20000, `afirmação: 20 s (${lang})`);
  }
  // Afirmações do dia = as da roda, das afirmações dela.
  assert.deepStrictEqual(
    items.filter((i) => i.kind === 'affirmation').map((i) => [i.id, i.text]),
    [pool[3], pool[4], pool[5]].map((p) => [p.id, p.text]),
    `afirmações de ${DAY} (dia ímpar) são a 4a, 5a e 6a (${lang})`
  );

  const total = sessionSeconds(items);
  assert.ok(total >= 400 && total <= 440, `sessão com história de 700 dura ${total} s (${lang}), fora de 400-440`);
}

const sceneOf = (items) => items.find((item) => item.kind === 'anchor');
const long = sessionItemsForState(stateWith(1500), 'pt', DAY);
const longTotal = sessionSeconds(long);
assert.ok(longTotal >= 400 && longTotal <= 440, `história de 1.500 dura ${longTotal} s, fora de 400-440`);
const short = sessionItemsForState(stateWith(200), 'pt', DAY);
assert.strictEqual(sceneOf(short).pauseMs, 120000, 'história curta: pausa da cena no teto de 120 s');
const shortTotal = sessionSeconds(short);
assert.ok(shortTotal >= 330 && shortTotal <= 440, `história de 200 dura ${shortTotal} s, fora de 330-440`);
const referencePause = sceneOf(sessionItemsForState(reference, 'pt', DAY)).pauseMs;
assert.ok(referencePause > sceneOf(long).pauseMs, 'história maior precisa de pausa menor');
assert.ok(sceneOf(long).pauseMs >= 30000, 'pausa da cena nunca abaixo de 30 s');

// sessionSeconds: falas a 14 letras/s + pausas + 0,9 s de respiro por item sem pausa (o último não conta).
const sample = sessionSeconds([{ text: 'a'.repeat(140), pauseMs: 5000 }, { text: 'b'.repeat(14) }, { text: 'c'.repeat(28) }]);
assert.ok(Math.abs(sample - (10 + 5 + 1 + 0.9 + 2)) < 1e-9, `conta de sessionSeconds (veio ${sample})`);
assert.strictEqual(sessionSeconds([]), 0, 'sessão vazia dura 0');

// Afirmações do dia: roda pela data, nada de sorteio.
const six = ['a0', 'a1', 'a2', 'a3', 'a4', 'a5'];
assert.deepStrictEqual(pickDailyAffirmations(six, '2026-11-23'), ['a0', 'a1', 'a2'], '23/11/2026 (dia 20780, par) toca 1-3');
assert.deepStrictEqual(pickDailyAffirmations(six, '2026-11-24'), ['a3', 'a4', 'a5'], '24/11/2026 (ímpar) toca 4-6');
assert.deepStrictEqual(pickDailyAffirmations(six, '2026-11-24'), pickDailyAffirmations(six, '2026-11-24'), 'mesmo dia, mesmas três');
assert.deepStrictEqual(pickDailyAffirmations(['x', 'y'], DAY), ['x', 'y'], 'com 2 afirmações, as 2');
const fromSeven = pickDailyAffirmations(['s0', 's1', 's2', 's3', 's4', 's5', 's6'], DAY);
assert.strictEqual(new Set(fromSeven).size, 3, `com 7 afirmações, 3 distintas (veio ${fromSeven})`);
assert.deepStrictEqual(
  pickDailyAffirmations(['s0', 's1', 's2', 's3', 's4', 's5', 's6'], '2026-11-28'),
  ['s6', 's0', 's1'],
  'a roda volta ao começo da lista (28/11/2026, 7 afirmações)'
);
assert.deepStrictEqual(pickDailyAffirmations([], DAY), [], 'sem afirmações, nenhuma');

// Só as 12 primeiras entram na roda.
const fourteen = stateWith(700, {
  morningRitual: { entries: Array.from({ length: 8 }, (_, i) => ({ id: `d${i}`, affirmation: `Sonho ${i} que eu sigo.`, lang: 'pt' })) },
});
const allFourteen = personalAffirmationsForState(fourteen);
assert.strictEqual(allFourteen.length, 14, 'fixture: 14 afirmações');
assert.deepStrictEqual(
  sessionItemsForState(fourteen, 'pt', DAY).filter((i) => i.kind === 'affirmation').map((i) => i.id),
  pickDailyAffirmations(allFourteen.slice(0, 12), DAY).map((p) => p.id),
  'a roda usa só as 12 primeiras afirmações'
);

// Sem Cena-Âncora: nada. Sem jornada: sem item da jornada e a ponte sem o que mostrar.
assert.deepStrictEqual(sessionItemsForState({ ...reference, manifestations: [] }, 'pt', DAY), [], 'sem Cena-Âncora, sessão vazia');
const noJourney = sessionItemsForState(reference, 'pt', DAY, []);
assert.ok(!noJourney.some((i) => i.kind === 'journey'), 'biblioteca vazia: sem item da jornada');
assert.strictEqual(noJourney.find((i) => i.id === 'guide:bridge').still, undefined, 'biblioteca vazia: ponte sem still');
assert.ok(sessionSeconds(noJourney) <= 440, 'biblioteca vazia: sessão continua cabendo');

// ---------- Registro do dia ----------
const NOW = '2026-11-24T08:30:00.000Z';
const before = JSON.stringify(reference);
const once = applyGuidedSessionDone(reference, { day: DAY, note: '  Vi um sinal no caminho.  ', bridge: true, now: NOW });
assert.strictEqual(JSON.stringify(reference), before, 'applyGuidedSessionDone não pode mudar o estado recebido');
const twice = applyGuidedSessionDone(once, { day: DAY, note: '', bridge: true, now: NOW });
const anchorOf = (state) => state.manifestations.find((m) => m.id === 'm1');

assert.deepStrictEqual(anchorOf(twice).sessions, ['2026-11-20', DAY], 'duas vezes no mesmo dia: uma entrada só em sessions');
const bridges = anchorOf(twice).livingMirror.bridgeCompletions.filter((entry) => entry.date === DAY);
assert.strictEqual(bridges.length, 1, 'duas vezes no mesmo dia: uma ponte só');
assert.deepStrictEqual(
  bridges[0],
  { id: `bridge-m1-1-${DAY}`, date: DAY, step: journey.day.action.pt, chapter: 1, completedAt: NOW },
  'ponte no mesmo formato de toggleBridgeCompletion, com a micro-ação do dia'
);
assert.ok(bridgeDoneOn(anchorOf(twice), DAY), 'a ponte registrada precisa valer para bridgeDoneOn');
assert.notStrictEqual(journey.day.action.en, journey.day.action.pt, 'fixture: micro-ação do dia difere entre pt e en');
assert.strictEqual(
  anchorOf(applyGuidedSessionDone({ ...reference, lang: 'en' }, { day: DAY, bridge: true, now: NOW })).livingMirror
    .bridgeCompletions[0].step,
  journey.day.action.en,
  'em inglês a ponte registra a micro-ação em inglês'
);
assert.strictEqual(twice.guidedSession.lastDoneOn, DAY, 'guidedSession.lastDoneOn = dia');
assert.deepStrictEqual(
  anchorOf(once).evidence,
  [{ id: `e-${Date.parse(NOW)}`, text: 'Vi um sinal no caminho.', createdAt: NOW }, reference.manifestations[0].evidence[0]],
  'nota vira evidência no início, como addEvidence'
);
assert.strictEqual(anchorOf(twice).evidence.length, 2, 'nota vazia não cria evidência');

const blank = applyGuidedSessionDone(reference, { day: DAY, note: '   ', bridge: false, now: NOW });
assert.strictEqual(anchorOf(blank).evidence.length, 1, 'nota só com espaços não cria evidência');
assert.ok(!bridgeDoneOn(anchorOf(blank), DAY), 'bridge: false não cria ponte');
assert.deepStrictEqual(anchorOf(blank).sessions, ['2026-11-20', DAY], 'registrar sem ponte ainda marca o dia');
assert.strictEqual(blank.guidedSession.lastDoneOn, DAY, 'registrar sem ponte grava lastDoneOn');

const longNote = applyGuidedSessionDone(reference, { day: DAY, note: 'x'.repeat(400), bridge: false, now: NOW });
assert.strictEqual(anchorOf(longNote).evidence[0].text.length, 280, 'nota cortada em 280');

const goal = applyGuidedSessionDone(stateWith(700, {}), { day: DAY, bridge: false, now: NOW });
assert.strictEqual(anchorOf(goal).completedAt, undefined, 'meta longe: sem completedAt');
const nearGoal = stateWith(700);
nearGoal.manifestations[0].goalDays = 2;
assert.strictEqual(anchorOf(applyGuidedSessionDone(nearGoal, { day: DAY, now: NOW })).completedAt, DAY, 'cruzar a meta grava completedAt, como logSession');

const empty = { ...reference, manifestations: [] };
assert.strictEqual(applyGuidedSessionDone(empty, { day: DAY, note: 'x', bridge: true, now: NOW }), empty, 'sem âncora devolve o mesmo state');
for (const bad of [undefined, '', '2026-02-30']) {
  assert.strictEqual(
    applyGuidedSessionDone(reference, { day: bad, note: 'x', bridge: true, now: NOW }),
    reference,
    `dia inválido ${JSON.stringify(bad)} devolve o mesmo state`
  );
}

process.stdout.write('sessao de 7 minutos (logica): ok\n');
if (process.argv.includes('--logica')) process.exit(0);

// ---------- Motor: o modo sessão é o motor do despertar, não uma tela nova ----------
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
const screen = read('screens/WakeSequenceScreen.js');
// Sem comentários: um comentário não pode passar por código.
const code = transformSync(screen, {
  babelrc: false,
  configFile: false,
  comments: false,
  parserOpts: { plugins: ['jsx'] },
}).code;
const block = (marker) => {
  const start = code.indexOf(marker);
  assert.ok(start >= 0, `WakeSequenceScreen sem ${marker}`);
  const rest = code.slice(start + marker.length);
  const end = rest.search(/\n {2}(?:function |const |let |useEffect\(|return \()/);
  return marker + (end >= 0 ? rest.slice(0, end) : rest);
};

assert.ok(!fs.existsSync(path.join(root, 'screens/SessionScreen.js')), 'a sessão não pode ter tela própria');
const speakers = ['screens', 'components']
  .flatMap((dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js')).map((f) => `${dir}/${f}`))
  .filter((file) => read(file).includes('Speech.speak(item.text'));
assert.deepStrictEqual(speakers, ['screens/WakeSequenceScreen.js'], 'o motor que fala os itens é um só');
assert.strictEqual(screen.split('Speech.speak(item.text').length, 2, 'uma fala de item só, dentro do motor');

assert.ok(
  /import \{[^}]*\bsessionItemsForState\b[^}]*\} from '\.\.\/utils\/guidedSession';/.test(code) &&
    /export default function WakeSequenceScreen\(\{\s*route\s*\}\)/.test(code) &&
    code.includes("const session = route?.params?.mode === 'session';") &&
    code.includes('session ? sessionItemsForState(state, lang, todayISO()) : wakeSequenceItemsForState(state, lang)'),
  'modo sessão: itens de sessionItemsForState; fora dele, os do despertar'
);

// Clipe embutido: só com a voz da Celeste liberada e sem quebra anterior; a queda é a mesma do playPersonal.
const playItemBlock = block('function playItem(');
const cloudAt = playItemBlock.indexOf('if (latest.current.cloudVoice && !cloudBrokenRef.current) {');
const cloudBranch = playItemBlock.slice(cloudAt);
assert.ok(
  cloudAt >= 0 &&
    /item\.clipId\s*\?\s*voice\.playBundled\(\{\s*clipId: item\.clipId,\s*narratorId: voice\.narratorId,\s*lang: item\.lang,\s*playbackId\s*\}\)\s*:\s*voice\.playPersonal\(\{/.test(cloudBranch) &&
    !/playBundled/.test(playItemBlock.slice(0, cloudAt)),
  'item com clipId toca o clipe embutido (playBundled) só no ramo da voz da Celeste; sem clipId, playPersonal'
);
assert.ok(
  /\.then\([\s\S]*deviceFallback\(playbackId, epoch\)[\s\S]*\.catch\(\(\) => deviceFallback\(playbackId, epoch\)\)/.test(cloudBranch) &&
    /speakWithDevice\(item, epoch\);\s*\}\s*$/.test(playItemBlock),
  'clipe que falta ou falha cai na voz do aparelho; sem a voz da Celeste, o aparelho lê tudo'
);
// Uma voz só: a queda vale dali em diante e a tela avisa.
const fallbackBlock = block('function deviceFallback(');
assert.ok(
  fallbackBlock.includes('cloudBrokenRef.current = true') &&
    fallbackBlock.includes('setDeviceInsteadOfCeleste(true)') &&
    playItemBlock.includes('setDeviceInsteadOfCeleste(Boolean(latest.current.cloudVoice && cloudBrokenRef.current))') &&
    screen.includes('testID="wake-device-voice-notice"'),
  'depois de uma queda a voz do aparelho segue até o fim, com o aviso na tela'
);

// Pausa do item no lugar do respiro fixo.
const finishedBlock = block('function itemFinished(');
assert.ok(
  finishedBlock.includes('const pauseMs = latest.current.items[positionRef.current]?.pauseMs ?? GAP_MS;') &&
    /setTimeout\(\(\) => \{[\s\S]*?playItem\(next\);?\s*\}, pauseMs\)/.test(finishedBlock) &&
    !/\}, GAP_MS\)/.test(finishedBlock) &&
    /setRest\(\{\s*until: Date\.now\(\) \+ pauseMs,\s*total: pauseMs\s*\}\)/.test(finishedBlock),
  'o respiro depois do item é item.pauseMs ?? GAP_MS, com o estado da pausa para o anel'
);
assert.ok(block('function silence(').includes('setRest(null)'), 'Próximo, Pausar e Parar encerram a pausa');

for (const testID of [
  'session-complete', 'session-register', 'session-bridge', 'session-note', 'session-streak',
  'session-remaining', 'session-rest-ring', 'session-still', 'session-stage', 'session-step', 'session-carry',
  'session-bridge-carry',
]) {
  assert.ok(screen.includes(`testID="${testID}"`) || code.includes(`'${testID}'`), `modo sessão sem ${testID}`);
}
// Decisões do coordenador: botão do registro, afirmação do tema na ponte e no cartão final, um toque só.
assert.ok(
  screen.includes("register: { pt: 'Registrar meu dia', en: 'Mark my day' }") &&
    screen.includes("carry: { pt: 'Leve com você', en: 'Take with you' }") &&
    screen.includes("sessionTitle: { pt: 'Sua sessão de 7 minutos', en: 'Your 7-minute session' }") &&
    screen.includes("sessionEmptyTitle: { pt: 'Crie sua Cena-Âncora', en: 'Create your Anchor Scene' }") &&
    screen.includes("bridgeDone: { pt: 'Fiz a ponte', en: 'Bridge done' }"),
  'textos do modo sessão'
);
assert.ok(
  /const carry = testID =>[\s\S]{0,400}\{t\(S\.carry\)\}[\s\S]{0,200}\{t\(journey\.day\.affirmation\)\}/.test(code) &&
    code.includes("{current.clipId === 'bridge' ? carry('session-bridge-carry') : null}") &&
    /testID="session-complete"[\s\S]*\{carry\('session-carry'\)\}[\s\S]*testID="session-register"/.test(code) &&
    /testID="session-step"[^>]*>\s*\{t\(journey\.day\.action\)\}/.test(code),
  'a afirmação do tema aparece na ponte e no cartão final, ao lado do passo do dia'
);
const registerBlock = block('function registerDay(');
assert.ok(
  /if \(registered\.current\) return;\s*registered\.current = true;/.test(registerBlock) &&
    registerBlock.includes('registerGuidedSession({') &&
    /testID="session-register"[\s\S]{0,200}disabled=\{registeredNow\}/.test(code),
  'registrar o dia vale uma vez: o segundo toque não registra e o botão fica desligado'
);
assert.ok(/testID="session-note"[\s\S]{0,300}maxLength=\{280\}/.test(code), 'nota de uma linha, até 280');
// Com o teclado da nota aberto, o primeiro toque em "Registrar meu dia" vale e o botão não fica atrás dele no iPhone.
assert.ok(
  /<ScrollView[^>]*keyboardShouldPersistTaps="handled"[^>]*automaticallyAdjustKeyboardInsets[\s>]/.test(code),
  'a rolagem da tela precisa deixar o toque passar com o teclado aberto e subir acima dele'
);
// Uma voz só também no aparelho nativo: item pessoal recusado pelo servidor é lido pela voz do aparelho
// ({ ok: true, voice: 'device' }); dali em diante os clipes da guia não voltam para a voz da Celeste.
assert.ok(
  /\.then\(result => \{\s*if \(session && result && result\.voice === 'device'\) \{\s*cloudBrokenRef\.current = true;\s*setDeviceInsteadOfCeleste\(true\);\s*\}\s*if \(result && result\.ok && !result\.ready\) return;/.test(cloudBranch),
  'na sessão, a voz do aparelho que leu um item recusado segue até o fim, com o aviso'
);

// Contexto: uma ação nova, uma gravação só, e o dia salvo é um dia de verdade.
const context = read('context/AppContext.js');
assert.ok(
  /const registerGuidedSession = useCallback\(\s*\(\{ note, bridge \} = \{\}\) =>\s*setState\(\(s\) =>\s*applyGuidedSessionDone\(s, \{ day: todayISO\(\), note, bridge, now: new Date\(\)\.toISOString\(\) \}\)\s*\),\s*\[\]\s*\);/.test(context),
  'registerGuidedSession grava pelo applyGuidedSessionDone numa transformação só'
);
assert.ok(context.split('      registerGuidedSession,').length >= 3, 'registerGuidedSession exposto no valor do contexto');
const validDaySource = /const validDay = [\s\S]*?;\n/.exec(context);
const normalizeSource = /\n {2}st\.guidedSession = [^\n]*;\n/.exec(context);
assert.ok(validDaySource && normalizeSource, 'AppContext precisa normalizar guidedSession ao carregar');
// eslint-disable-next-line no-new-func
const loadGuided = new Function('st', `${validDaySource[0]}${normalizeSource[0]}return st.guidedSession;`);
assert.deepStrictEqual(loadGuided({ guidedSession: { lastDoneOn: 'x' } }), { lastDoneOn: null }, 'lastDoneOn inválido carrega como null');
assert.deepStrictEqual(loadGuided({ guidedSession: { lastDoneOn: 20261124 } }), { lastDoneOn: null }, 'lastDoneOn que não é texto carrega como null');
assert.deepStrictEqual(loadGuided({}), { lastDoneOn: null }, 'estado antigo, sem guidedSession, carrega com null');
assert.deepStrictEqual(loadGuided({ guidedSession: 'x' }), { lastDoneOn: null }, 'guidedSession corrompido carrega com null');
assert.deepStrictEqual(loadGuided({ guidedSession: { lastDoneOn: DAY } }), { lastDoneOn: DAY }, 'dia válido é mantido');

// Lembretes recriados depois de reinstalar ou restaurar: a escolha salva ("abrir com a sessão") chega ao serviço
// antes da sincronização do App, senão eles voltam como o despertar comum.
const app = read('App.js');
const choiceAt = app.indexOf('if (loaded) setWakeOpensSession(opensSession);');
assert.ok(
  app.includes('const opensSession = ritual?.wakeOpensSession === true;') &&
    choiceAt >= 0 &&
    choiceAt < app.indexOf('const sync = () => void syncWakeReminders(') &&
    app.includes('}, [loaded, opensSession]);'),
  'App: a escolha salva de abrir com a sessão precisa chegar aos lembretes antes de syncWakeReminders'
);

process.stdout.write('sessao de 7 minutos: ok\n');
