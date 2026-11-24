// Portão da Jornada da semana: giro por data (lógica) e biblioteca + falas do guia (conteúdo).
// `--logica` roda só a primeira parte, com uma biblioteca de teste de 8 temas feita aqui.
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

const onlyLogic = process.argv.includes('--logica');

const {
  JOURNEY_LIMITS,
  daysSinceEpoch,
  weekSerial,
  weekdayIndex,
  journeyClipId,
  journeyForDay,
} = load('utils/weeklyJourney.js');
const { WEEKLY_JOURNEYS } = load('constants/weeklyJourneys.js');

// ---------- Lógica ----------
const text = (value) => ({ pt: `${value} pt`, en: `${value} en` });
const testJourneys = Array.from({ length: 8 }, (_, t) => ({
  id: `tema_${t}`,
  icon: 'star',
  title: text(`tema ${t}`),
  days: Array.from({ length: 7 }, (__, d) => ({
    line: text(`frase ${t}.${d}`),
    affirmation: text(`afirmacao ${t}.${d}`),
    action: text(`acao ${t}.${d}`),
  })),
}));
const themeOf = (dayISO) => {
  const picked = journeyForDay(dayISO, testJourneys);
  return picked && testJourneys.indexOf(picked.theme);
};

assert.deepStrictEqual(JOURNEY_LIMITS, { line: 80, affirmation: 70, action: 90 }, 'limites da jornada mudaram');

assert.strictEqual(daysSinceEpoch('1970-01-01'), 0, '1970-01-01 precisa ser o dia 0');
assert.strictEqual(daysSinceEpoch('2026-11-23'), 20780, 'contagem de dias desde 1970 errada');
assert.strictEqual(weekSerial('2026-11-23'), 2968, 'semana de 23/11/2026 precisa ser a 2968');

assert.strictEqual(weekdayIndex('2026-11-23'), 0, 'segunda 23/11/2026 precisa ser o dia 0');
assert.strictEqual(weekdayIndex('2026-11-24'), 1, 'terça 24/11/2026 precisa ser o dia 1');
assert.strictEqual(weekdayIndex('2026-11-29'), 6, 'domingo 29/11/2026 precisa ser o dia 6');
assert.strictEqual(weekdayIndex('1970-01-01'), 3, 'quinta 01/01/1970 precisa ser o dia 3');

assert.strictEqual(journeyClipId('amor', 0), 'j_amor_1', 'clip do 1o dia precisa terminar em _1');
assert.strictEqual(journeyClipId('amor', 6), 'j_amor_7', 'clip do 7o dia precisa terminar em _7');

const monday = journeyForDay('2026-11-23', testJourneys);
assert.ok(monday, '23/11/2026 precisa ter jornada');
assert.strictEqual(monday.theme, testJourneys[0], '23/11/2026 precisa cair no tema 0');
assert.strictEqual(monday.dayIndex, 0, '23/11/2026 precisa ser o dia 0 da jornada');
assert.strictEqual(monday.day, testJourneys[0].days[0], '23/11/2026 precisa trazer o 1o dia do tema');
assert.strictEqual(monday.clipId, 'j_tema_0_1', 'clip de 23/11/2026 errado');

const sunday = journeyForDay('2026-11-29', testJourneys);
assert.strictEqual(sunday.theme, testJourneys[0], 'domingo 29/11 precisa continuar no tema da semana');
assert.strictEqual(sunday.dayIndex, 6, 'domingo 29/11 precisa ser o dia 6');
assert.strictEqual(sunday.day, testJourneys[0].days[6], 'domingo 29/11 precisa trazer o 7o dia do tema');
assert.strictEqual(sunday.clipId, 'j_tema_0_7', 'clip de 29/11/2026 errado');

assert.strictEqual(themeOf('2026-11-30'), 1, 'segunda 30/11 precisa virar para o tema 1');
// Virada de ano: conta contínua, a semana 28/12/2026 a 03/01/2027 é uma só.
assert.strictEqual(themeOf('2026-12-28'), 5, '28/12/2026 precisa cair no tema 5');
assert.strictEqual(themeOf('2027-01-03'), 5, '03/01/2027 precisa continuar no tema 5 (virada de ano)');
assert.strictEqual(themeOf('2027-01-04'), 6, '04/01/2027 precisa virar para o tema 6');
// Ciclo inteiro: o último tema e a volta ao primeiro depois de 8 semanas.
assert.strictEqual(themeOf('2027-01-11'), 7, '11/01/2027 precisa cair no tema 7');
assert.strictEqual(themeOf('2027-01-18'), 0, '18/01/2027 precisa voltar ao tema 0');

for (const bad of ['2026-13-40', '2026-02-30', '23/11/2026', '', null, undefined, 20780]) {
  assert.strictEqual(daysSinceEpoch(bad), null, `dia inválido ${JSON.stringify(bad)} precisa dar null`);
  assert.strictEqual(weekSerial(bad), null, `semana de dia inválido ${JSON.stringify(bad)} precisa dar null`);
  assert.strictEqual(weekdayIndex(bad), null, `dia da semana inválido ${JSON.stringify(bad)} precisa dar null`);
  assert.strictEqual(journeyForDay(bad, testJourneys), null, `jornada de dia inválido ${JSON.stringify(bad)} precisa dar null`);
}
assert.strictEqual(journeyForDay('1970-01-04', testJourneys), null, 'antes da 1a segunda (05/01/1970) não há jornada');
assert.strictEqual(journeyForDay('2026-11-23', []), null, 'biblioteca vazia precisa dar null');
assert.deepStrictEqual(
  journeyForDay('2026-11-23'),
  journeyForDay('2026-11-23', WEEKLY_JOURNEYS),
  'sem biblioteca, journeyForDay precisa usar WEEKLY_JOURNEYS'
);

if (onlyLogic) {
  process.stdout.write('jornada semanal (logica): ok\n');
} else {
  // ---------- Conteúdo (biblioteca real e falas do guia) ----------
  // Junta todos os problemas antes de cair: um erro não esconde os outros.
  const { SESSION_GUIDE_CLIPS, SESSION_GUIDE, SESSION_GUIDE_MAX_CHARS } = load('constants/sessionGuide.js');
  const ionicons = JSON.parse(
    fs.readFileSync(
      path.join(root, 'node_modules', '@expo', 'vector-icons', 'build', 'vendor', 'react-native-vector-icons', 'glyphmaps', 'Ionicons.json'),
      'utf8'
    )
  );
  const FORBIDDEN = /\bcur[ae]r?\b|doença|emagre|renda garantida|garantid|guarantee|\bcure\b|\bheal|R\$|US\$|\$\d/i;
  const LANGS = ['pt', 'en'];
  const problems = [];
  const filled = (value) => typeof value === 'string' && value.trim().length > 0;
  const checkWords = (where, value) => {
    if (filled(value) && FORBIDDEN.test(value)) problems.push(`${where}: palavra proibida em "${value}"`);
  };

  if (!Array.isArray(WEEKLY_JOURNEYS) || WEEKLY_JOURNEYS.length < 8 || WEEKLY_JOURNEYS.length > 12) {
    problems.push(`biblioteca precisa de 8 a 12 temas (tem ${Array.isArray(WEEKLY_JOURNEYS) ? WEEKLY_JOURNEYS.length : 'nada'})`);
  }
  const ids = new Set();
  const phrases = new Map();
  (Array.isArray(WEEKLY_JOURNEYS) ? WEEKLY_JOURNEYS : []).forEach((theme, t) => {
    const where = `tema ${t} (${theme && theme.id})`;
    if (!theme || typeof theme.id !== 'string' || !/^[a-z0-9_]+$/.test(theme.id)) problems.push(`${where}: id fora de /^[a-z0-9_]+$/`);
    else if (ids.has(theme.id)) problems.push(`${where}: id repetido`);
    else ids.add(theme.id);
    if (!theme || !Object.prototype.hasOwnProperty.call(ionicons, theme.icon)) problems.push(`${where}: ícone "${theme && theme.icon}" não existe no Ionicons`);
    for (const lang of LANGS) {
      const title = theme && theme.title && theme.title[lang];
      if (!filled(title)) problems.push(`${where}: título ${lang} vazio`);
      checkWords(`${where} título ${lang}`, title);
    }
    const days = theme && Array.isArray(theme.days) ? theme.days : [];
    if (days.length !== 7) problems.push(`${where}: precisa de 7 dias (tem ${days.length})`);
    days.forEach((day, d) => {
      for (const field of Object.keys(JOURNEY_LIMITS)) {
        for (const lang of LANGS) {
          const at = `${where} dia ${d + 1} ${field} ${lang}`;
          const value = day && day[field] && day[field][lang];
          if (!filled(value)) {
            problems.push(`${at}: vazio`);
            continue;
          }
          if (value.length > JOURNEY_LIMITS[field]) problems.push(`${at}: ${value.length} > ${JOURNEY_LIMITS[field]} caracteres`);
          checkWords(at, value);
          const key = value.trim().toLowerCase().replace(/\s+/g, ' ');
          if (phrases.has(key)) problems.push(`${at}: frase repetida (já está em ${phrases.get(key)})`);
          else phrases.set(key, at);
        }
      }
    });
  });

  const CLIPS = ['breath', 'desire', 'scene', 'affirm', 'bridge', 'close'];
  if (JSON.stringify(SESSION_GUIDE_CLIPS) !== JSON.stringify(CLIPS)) problems.push(`guia: SESSION_GUIDE_CLIPS precisa ser ${CLIPS.join(', ')}`);
  if (SESSION_GUIDE_MAX_CHARS !== 450) problems.push(`guia: SESSION_GUIDE_MAX_CHARS precisa ser 450 (é ${SESSION_GUIDE_MAX_CHARS})`);
  for (const lang of LANGS) {
    let total = 0;
    for (const clip of CLIPS) {
      const value = SESSION_GUIDE && SESSION_GUIDE[clip] && SESSION_GUIDE[clip][lang];
      if (!filled(value)) {
        problems.push(`guia ${clip} ${lang}: vazio`);
        continue;
      }
      total += value.length;
      if (value.length > 160) problems.push(`guia ${clip} ${lang}: ${value.length} > 160 caracteres`);
      checkWords(`guia ${clip} ${lang}`, value);
    }
    if (total > 450) problems.push(`guia ${lang}: soma ${total} > 450 caracteres`);
  }

  if (problems.length) {
    console.error(`jornada semanal: ${problems.length} problema(s) no conteúdo`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`jornada semanal: ok (${WEEKLY_JOURNEYS.length} temas, guia em pt e en)\n`);
  }
}
