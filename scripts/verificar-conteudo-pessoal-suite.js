const assert = require('node:assert');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { transformSync } = require('@babel/core');

const {
  JOURNEY_CATEGORIES,
  JOURNEY_SUITE_VERSION,
  createPersonalContentSuite,
} = require('../utils/personalContentSuite');
const endpoint = require('../api/gerar-cena');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');

function loadExpoModule(relativePath) {
  const file = path.join(__dirname, '..', relativePath);
  const source = fs.readFileSync(file, 'utf8');
  const compiled = transformSync(source, {
    filename: file,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(compiled, file);
  return loaded.exports;
}

const sceneService = loadExpoModule('services/generatePersonalizedScene.js');
const personalJourney = loadExpoModule('utils/personalJourney.js');

const profile = {
  name: 'Ana',
  aboutYou: 'sou pro ativa, bondosa e persistente',
  whyMatters: 'ter liberdade para cuidar das pessoas importantes',
  obstacle: 'medo de comecar',
  city: 'Sao Paulo',
  dreamLocation: 'perto da praia',
  dreamHome: 'uma casa de fazenda',
  work: 'design de produto',
  workFeeling: 'construindo algo novo',
  relationshipStatus: 'solteira',
  partnerDesire: 'uma parceria leal, companheira e presente',
  pastInfluence: 'uma mudanca importante me ensinou a recomecar',
  cloudPersonalization: true,
  cloudAdultConfirmed: true,
  cloudConsentVersion: CLOUD_CONSENT_VERSION,
};

const local = createPersonalContentSuite({
  desire: 'viver com liberdade e construir uma familia',
  profile,
  lang: 'pt',
});
const localAgain = createPersonalContentSuite({
  desire: 'viver com liberdade e construir uma familia',
  profile: { ...profile },
  lang: 'pt',
});

const journeySuiteByLang = personalJourney.buildPersonalJourneySuites({
  desire: 'viver com liberdade e construir uma familia',
  profile,
  originLang: 'pt',
});
const stateFixture = {
  lang: 'pt',
  anchorSceneId: 'm-anchor',
  manifestations: [{
    id: 'm-anchor',
    origin: 'onboarding-anchor',
    title: 'Minha vida com liberdade',
    journeySuiteByLang,
    journeyVisuals: {
      'vision:Love': { cacheKey: 'visual-anchor-love-123456' },
      'affirmation:Love': { cacheKey: 'visual-anchor-affirmation-love-123456' },
    },
  }],
};
const stateVisions = personalJourney.personalJourneyItemsForState(stateFixture, 'vision', 'pt');
const stateAffirmations = personalJourney.personalJourneyItemsForState(
  stateFixture,
  'affirmation',
  'pt'
);
assert.strictEqual(stateVisions.length, 6, 'estado deve expor exatamente seis visoes da Ancora');
assert.strictEqual(stateAffirmations.length, 6, 'estado deve expor exatamente seis afirmacoes da Ancora');
assert.strictEqual(stateVisions[0].id, 'm-anchor:vision:Love');
assert.strictEqual(stateAffirmations[0].id, 'm-anchor:affirmation:Love');
assert.notStrictEqual(
  stateVisions[0].visualKey,
  stateAffirmations[0].visualKey,
  'Visao e Afirmacao de Amor nao podem reutilizar a mesma imagem'
);

const portugueseOrigin = personalJourney.buildPersonalJourneySuites({
  desire: 'morar numa fazenda com minha familia',
  profile: {
    ...profile,
    partnerDesire: ['leal', 'companheira'],
    dreamHome: 'uma fazenda perto da praia',
  },
  originLang: 'pt',
});
const portugueseLeak = /morar numa fazenda|minha familia|leal|companheira|uma fazenda perto/i;
assert.ok(
  portugueseOrigin.pt.visions.some((item) => /proatividade|bondade|persist[eê]ncia/i.test(item.story)),
  'fallback do idioma de origem deve continuar pessoal'
);
assert.doesNotMatch(
  portugueseOrigin.en.visions.map((item) => `${item.title} ${item.story}`).join(' '),
  portugueseLeak,
  'fallback PT->EN nao pode interpolar respostas em portugues'
);
assert.doesNotMatch(
  portugueseOrigin.en.affirmations.map((item) => item.text).join(' '),
  portugueseLeak,
  'afirmacoes PT->EN nao podem misturar idiomas'
);

const englishOrigin = personalJourney.buildPersonalJourneySuites({
  desire: 'living in a quiet farmhouse with my family',
  profile: {
    aboutYou: 'kind, proactive and persistent',
    partnerDesire: ['loyal', 'supportive'],
    dreamHome: 'a farmhouse near the sea',
    whyMatters: 'giving my children a peaceful life',
  },
  originLang: 'en',
});
const englishLeak = /quiet farmhouse|with my family|loyal|supportive|near the sea|my children/i;
assert.ok(
  englishOrigin.en.visions.some((item) => /kind|proactive|persistent/i.test(item.story)),
  'fallback do idioma de origem EN deve continuar pessoal'
);
assert.doesNotMatch(
  englishOrigin.pt.visions.map((item) => `${item.title} ${item.story}`).join(' '),
  englishLeak,
  'fallback EN->PT nao pode interpolar respostas em ingles'
);
assert.doesNotMatch(
  englishOrigin.pt.affirmations.map((item) => item.text).join(' '),
  englishLeak,
  'afirmacoes EN->PT nao podem misturar idiomas'
);

const remoteSentinel = {
  ...portugueseOrigin.en,
  source: 'remote',
  visions: portugueseOrigin.en.visions.map((item, index) =>
    index === 0 ? { ...item, title: 'REMOTE_SENTINEL' } : item
  ),
};
const repairedSuites = personalJourney.buildPersonalJourneySuites({
  desire: 'morar numa fazenda com minha familia',
  profile,
  originLang: 'pt',
  stored: {
    originLang: 'pt',
    pt: {
      ...portugueseOrigin.pt,
      source: 'local',
      visions: portugueseOrigin.pt.visions.map((item, index) =>
        index === 0 ? { ...item, title: 'STALE_LOCAL_SENTINEL' } : item
      ),
    },
    en: remoteSentinel,
  },
});
assert.strictEqual(
  repairedSuites.en.visions[0].title,
  'REMOTE_SENTINEL',
  'suite remota deve sobreviver ao reparo dos fallbacks locais'
);
assert.notStrictEqual(
  repairedSuites.pt.visions[0].title,
  'STALE_LOCAL_SENTINEL',
  'suite local deve ser reconstruida pelo contrato atual'
);

assert.deepStrictEqual(local, localAgain, 'fallback local precisa ser estavel para os mesmos dados');
assert.strictEqual(local.version, JOURNEY_SUITE_VERSION);
assert.deepStrictEqual(local.visions.map((item) => item.category), JOURNEY_CATEGORIES);
assert.deepStrictEqual(local.affirmations.map((item) => item.category), JOURNEY_CATEGORIES);
assert.strictEqual(new Set(local.visions.map((item) => item.key)).size, 6);
assert.strictEqual(new Set(local.affirmations.map((item) => item.key)).size, 6);
assert.strictEqual(new Set(local.visions.map((item) => item.story)).size, 6);
assert.strictEqual(new Set(local.affirmations.map((item) => item.text)).size, 6);
assert.strictEqual(
  new Set([...local.visions, ...local.affirmations].map((item) => item.visualBrief)).size,
  12,
  'cada unidade de conteudo precisa de uma direcao visual diferente'
);
local.visions.forEach((item) => {
  assert.match(item.story, /^Imagine uma possibilidade do seu futuro:/);
  assert.match(
    item.story,
    /Cena-Âncora|vida que você deseja|direção pessoal|direção que você escolheu/i,
    `${item.category}: a visao perdeu a direcao pessoal sem reescrever o rascunho`
  );
});
local.affirmations.forEach((item) => {
  assert.match(item.text, /\b(Eu|meu|minha|meus|minhas)\b/i);
  assert.doesNotMatch(item.text, /\b(eu vou|serei|terei|estarei|conseguirei)\b/i);
});

const english = createPersonalContentSuite({
  desire: 'a calmer and more creative life',
  profile: { ...profile, aboutYou: 'curious, kind and persistent' },
  lang: 'en',
});
english.visions.forEach((item) => assert.match(item.story, /^Imagine one possibility in your future:/));
english.affirmations.forEach((item) => {
  assert.match(item.text, /\b(I|my|mine)\b/i);
  assert.doesNotMatch(item.text, /\b(I will|I'll|I am going to|I'm going to)\b/i);
});

// "O máximo diferente possível, nada robótico" (21/10): the local suite (no consent or no verification: no AI)
// chooses openings, cores, facts and phrasings from per-area banks by her answers. Twenty people with different
// answers rarely share a skeleton (her own words masked out), and one person's six areas never repeat a sentence
// or an opening.
const VARIETY_PEOPLE = [
  ['Love', 'viver com liberdade e construir uma família', { aboutYou: 'sou pro ativa, bondosa e persistente', whyMatters: 'ter liberdade para cuidar das pessoas importantes', obstacle: 'medo ou insegurança', dreamLocation: 'Na praia ou no litoral', dreamHome: 'Farmhouse', work: 'design de produto', partnerDesire: 'uma parceria leal, companheira e presente', people: [{ name: 'Bia' }] }],
  ['Career', 'abrir minha confeitaria', { aboutYou: 'criativa e teimosa', whyMatters: 'provar para mim que consigo', obstacle: 'dinheiro ou recursos', city: 'Recife', work: 'a construção do meu próprio negócio', kids: [{ name: 'Leo' }, { name: 'Davi' }] }],
  ['Wealth', 'quitar as dívidas do cartão', { whyMatters: 'dormir sem ansiedade', obstacle: 'falta de constância', city: 'Belo Horizonte', work: 'um emprego em uma empresa', kids: [{ name: 'Maria' }] }],
  ['Love', 'encontrar um amor de verdade', { aboutYou: 'intensa, carinhosa e um pouco tímida', whyMatters: 'quero dividir a vida com alguém que me escolha também', obstacle: 'medo ou insegurança', partnerDesire: 'alguém gentil que goste de conversar até tarde' }],
  ['Health', 'emagrecer com saúde', { aboutYou: 'disciplinada quando tenho um plano', whyMatters: 'ter energia para brincar com meus filhos', obstacle: 'tempo ou energia', work: 'o cuidado da casa ou da família', kids: [{ name: 'Gabi' }, { name: 'Tom' }] }],
  ['Career', 'ser promovida a gerente', { aboutYou: 'organizada, exigente e leal', whyMatters: 'ser reconhecida pelo que eu já entrego', obstacle: 'opinião dos outros ou falta de apoio', city: 'São Paulo', work: 'gestão de projetos numa empresa de tecnologia' }],
  ['Peace', 'morar em Portugal', { whyMatters: 'dar um futuro mais seguro para minha filha', obstacle: 'circunstâncias externas', dreamLocation: 'Em outro país', dreamHome: 'Modern Loft', work: 'trabalho autônomo ou freelancer', kids: [{ name: 'Alice' }] }],
  ['Peace', 'ter paz dentro de mim', { aboutYou: 'calma por fora, agitada por dentro', whyMatters: 'parar de viver no automático', obstacle: 'falta de clareza', dreamLocation: 'No campo ou nas montanhas', dreamHome: 'Cabin' }],
  ['Career', 'voltar a estudar e me formar em enfermagem', { aboutYou: 'cuidadosa e muito curiosa', whyMatters: 'cuidar de gente é o que me faz sentido', obstacle: 'tempo ou energia', work: 'meus estudos' }],
  ['Wealth', 'ganhar dez mil por mês com meu ateliê', { aboutYou: 'artista, sensível e prática', whyMatters: 'viver do que eu amo fazer', obstacle: 'falta de constância', city: 'Curitiba', work: 'costura e bordado sob encomenda', dreamHome: 'Cozy Cottage' }],
  ['Confidence', 'ter coragem de falar em público', { aboutYou: 'tímida mas determinada', whyMatters: 'minhas ideias merecem ser ouvidas', obstacle: 'medo ou insegurança', work: 'professora de ciências' }],
  ['Wealth', 'uma casa de frente pro mar', { whyMatters: 'acordar ouvindo o mar depois de tanto trabalho', dreamLocation: 'Na praia ou no litoral', dreamHome: 'Beachfront Villa', work: 'a aposentadoria', people: [{ name: 'Carlos' }] }],
  ['Love', 'reconstruir a relação com minha mãe', { aboutYou: 'orgulhosa e amorosa', whyMatters: 'não quero perder mais tempo longe dela', obstacle: 'opinião dos outros ou falta de apoio', people: [{ name: 'Mãe' }] }],
  ['Health', 'dormir bem de novo', { aboutYou: 'ansiosa e perfeccionista', whyMatters: 'acordar descansada', obstacle: 'tempo ou energia', work: 'um emprego em uma empresa' }],
  ['Wealth', 'viajar pelo mundo trabalhando remoto', { aboutYou: 'aventureira, independente e otimista', whyMatters: 'conhecer outras culturas antes dos 40', obstacle: 'dinheiro ou recursos', dreamLocation: 'Viajando, sem lugar fixo', work: 'desenvolvimento de software' }],
  ['Love', 'casar com o Rafael', { aboutYou: 'romântica e leal', whyMatters: 'formar a família que eu sonho', partnerDesire: 'parceria, respeito e risadas', manifestingName: 'Rafael' }],
  ['Wealth', 'sair do aluguel', { whyMatters: 'ter um canto que seja nosso', obstacle: 'dinheiro ou recursos', city: 'Salvador', dreamHome: 'Tiny Home', work: 'atendimento em uma clínica', kids: [{ name: 'Pedro' }] }],
  ['Confidence', 'me amar do jeito que eu sou', { aboutYou: 'sensível, engraçada e crítica demais comigo', obstacle: 'medo ou insegurança' }],
  ['Career', 'lançar meu livro', { aboutYou: 'sonhadora e observadora', whyMatters: 'deixar algo meu no mundo', obstacle: 'falta de constância', work: 'redação publicitária', dreamLocation: 'Onde moro hoje, mas do meu jeito' }],
  ['Peace', 'ter mais tempo para mim', {}],
];
const { interpretSelfDescription } = require('../utils/selfDescription');
const fold = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const wordsFolded = (value) => fold(value).replace(/[^a-z0-9<>]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const FUTURE_FRAME = { pt: 'Imagine uma possibilidade do seu futuro:', en: 'Imagine one possibility in your future:' };
function skeleton(text, person, lang) {
  const [, desire, answers] = person;
  const values = [desire, ...Object.values(answers).filter((value) => typeof value === 'string')];
  const self = interpretSelfDescription(String(answers.aboutYou || ''), lang);
  if (self) values.push(self.affirmationFragment, self.storyFragment);
  let output = fold(text);
  values
    .map((value) => fold(value).trim().replace(/[.!?;,:\-\s]+$/g, ''))
    .filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length)
    .forEach((value) => {
      output = output.split(value).join(' <x> ');
    });
  return output.replace(/\s+/g, ' ').trim();
}
const sentencesOf = (text) =>
  text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.replace(/[^a-z0-9<> ]+/g, ' ').replace(/\s+/g, ' ').trim());
const pairRate = (values, same) => {
  let pairs = 0;
  let hits = 0;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      pairs += 1;
      if (same(values[i], values[j])) hits += 1;
    }
  }
  return hits / pairs;
};
const varietyReport = [];
for (const lang of ['pt', 'en']) {
  const suites = VARIETY_PEOPLE.map((person) =>
    createPersonalContentSuite({ desire: person[1], profile: person[2], lang, category: person[0] })
  );
  suites.forEach((suite, index) => {
    const person = VARIETY_PEOPLE[index];
    const label = `${lang} pessoa ${index + 1}`;
    // the server validator (also used for the AI suite) accepts every local suite, near-duplicate openings included
    assert.doesNotThrow(
      () => endpoint._internals.validateGeneratedJourneySuite(suite, { lang, availablePersonalization: new Set(['desire']) }),
      `${label}: a suite local passa nos validadores do servidor`
    );
    // the opener of an affirmation ("No meu ritmo, eu...") never echoes later in the same affirmation
    const openerWords = lang === 'pt' ? ['hoje', 'leveza', 'ritmo', 'certeza', 'dia'] : ['today', 'gently', 'pace', 'certainty', 'day'];
    suite.affirmations.forEach((item) => {
      const words = wordsFolded(item.text);
      for (const word of openerWords) {
        assert.ok(
          words.filter((candidate) => candidate === word).length <= 1,
          `${label}: "${word}" se repete na mesma afirmacao: ${item.text}`
        );
      }
    });
    const visionTexts = suite.visions.map((item) => skeleton(item.story.slice(FUTURE_FRAME[lang].length), person, lang));
    const affirmationTexts = suite.affirmations.map((item) => skeleton(item.text, person, lang));
    for (const [kind, texts] of [['visoes', visionTexts], ['afirmacoes', affirmationTexts]]) {
      const counts = new Map();
      texts.forEach((text) => new Set(sentencesOf(text)).forEach((sentence) => counts.set(sentence, (counts.get(sentence) || 0) + 1)));
      const repeated = [...counts].filter(([sentence, count]) => count > 1 && sentence.split(' ').length >= 3);
      assert.deepStrictEqual(repeated, [], `${label}: nenhuma frase se repete entre as seis ${kind}`);
      const openings = texts.map((text) => wordsFolded(text).slice(0, 3).join(' '));
      assert.strictEqual(new Set(openings).size, 6, `${label}: as seis ${kind} comecam diferente`);
    }
    // her desire (and her reason) sit in the area of the desire
    if (person[1]) {
      assert.ok(
        fold(suite.visions.find((item) => item.category === person[0]).story).includes(fold(person[1])),
        `${label}: o desejo dela aparece na visao da area dele (${person[0]})`
      );
    }
    // names of children and important people never enter these texts
    for (const listed of [...(person[2].kids || []), ...(person[2].people || [])]) {
      const all = [...suite.visions.map((item) => `${item.title} ${item.story}`), ...suite.affirmations.map((item) => item.text)].join(' ');
      assert.ok(!new RegExp(`\\b${listed.name}\\b`).test(all), `${label}: o nome ${listed.name} nao aparece`);
    }
  });
  const byArea = (pick) =>
    JOURNEY_CATEGORIES.map((category, areaIndex) => suites.map((suite, index) => pick(suite, areaIndex, VARIETY_PEOPLE[index])));
  const visionSkeletons = byArea((suite, i, person) => skeleton(suite.visions[i].story.slice(FUTURE_FRAME[lang].length), person, lang));
  const affirmationSkeletons = byArea((suite, i, person) => skeleton(suite.affirmations[i].text, person, lang));
  const titles = byArea((suite, i) => fold(suite.visions[i].title));
  const average = (groups, same) => groups.reduce((sum, group) => sum + pairRate(group, same), 0) / groups.length;
  const opener = (a, b) => wordsFolded(a).slice(0, 6).join(' ') === wordsFolded(b).slice(0, 6).join(' ');
  const whole = (a, b) => a === b;
  const metrics = {
    visionOpener: average(visionSkeletons, opener),
    visionWhole: average(visionSkeletons, whole),
    affirmationOpener: average(affirmationSkeletons, opener),
    affirmationWhole: average(affirmationSkeletons, whole),
    title: average(titles, whole),
  };
  varietyReport.push(`${lang}: ${Object.entries(metrics).map(([key, value]) => `${key} ${(value * 100).toFixed(1)}%`).join(', ')}`);
  // thresholds (21/10 baseline before the banks: 100% of pairs shared every opening; 43-86% shared whole texts)
  assert.ok(metrics.visionWhole <= 0.03, `${lang}: visoes inteiras iguais entre duas pessoas ${metrics.visionWhole}`);
  assert.ok(metrics.affirmationWhole <= 0.05, `${lang}: afirmacoes inteiras iguais entre duas pessoas ${metrics.affirmationWhole}`);
  assert.ok(metrics.visionOpener <= 0.25, `${lang}: visoes com a mesma abertura entre duas pessoas ${metrics.visionOpener}`);
  assert.ok(metrics.affirmationOpener <= 0.1, `${lang}: afirmacoes com a mesma abertura entre duas pessoas ${metrics.affirmationOpener}`);
  assert.ok(metrics.title <= 0.25, `${lang}: titulos iguais entre duas pessoas ${metrics.title}`);
}
// her place and home read naturally: the place chip loses its capital mid-sentence (a city keeps it) and the home
// chip, stored in canonical English, is said in her language
const firstPerson = createPersonalContentSuite({ desire: VARIETY_PEOPLE[0][1], profile: VARIETY_PEOPLE[0][2], lang: 'pt', category: 'Love' });
const recifePerson = createPersonalContentSuite({ desire: VARIETY_PEOPLE[1][1], profile: VARIETY_PEOPLE[1][2], lang: 'pt', category: 'Career' });
const storyOf = (suite, category) => suite.visions.find((item) => item.category === category).story;
assert.match(storyOf(firstPerson, 'Peace'), /“na praia ou no litoral”/, 'o lugar escolhido no chip entra em minuscula no meio da frase');
assert.match(storyOf(recifePerson, 'Peace'), /“Recife”/, 'a cidade mantem a maiuscula');
assert.match(storyOf(firstPerson, 'Wealth'), /uma casa de fazenda/, 'a casa do chip (Farmhouse) aparece em portugues');
assert.doesNotMatch(
  [...firstPerson.visions.map((item) => item.story), ...firstPerson.affirmations.map((item) => item.text)].join(' '),
  /Farmhouse/,
  'o valor canonico em ingles da casa nao vaza no texto em portugues'
);

// the area of her desire travels with the suite from the app (AppContext → personalJourney → this builder)
for (const desireArea of ['Career', 'Peace', 'Love']) {
  const suites = personalJourney.buildPersonalJourneySuites({
    desire: 'abrir minha confeitaria',
    profile: { whyMatters: 'provar para mim que consigo' },
    originLang: 'pt',
    category: desireArea,
  });
  assert.match(
    suites.pt.visions.find((item) => item.category === desireArea).story,
    /abrir minha confeitaria/,
    `buildPersonalJourneySuites leva a area do desejo ate a suite (${desireArea})`
  );
}
const suiteCalls = [];
(function collectSuiteCalls(node) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'CallExpression' && node.callee && node.callee.name === 'buildPersonalJourneySuites') {
    suiteCalls.push(node);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(collectSuiteCalls);
    else if (value && typeof value.type === 'string') collectSuiteCalls(value);
  }
})(
  require('@babel/parser').parse(
    fs.readFileSync(path.join(__dirname, '..', 'context', 'AppContext.js'), 'utf8'),
    { sourceType: 'module', plugins: ['jsx'] }
  ).program
);
assert.ok(suiteCalls.length >= 4, 'o app monta a suite local nos quatro caminhos conhecidos');
assert.ok(
  suiteCalls.every((call) =>
    call.arguments[0].properties.some((property) => property.key && property.key.name === 'category')
  ),
  'toda suite local montada pelo app recebe a area do desejo'
);

const requestBody = {
  desire: 'viver com liberdade e construir uma familia',
  category: 'Love',
  lang: 'pt',
  profile,
  cloudConsent: true,
  cloudConsentVersion: CLOUD_CONSENT_VERSION,
  adultConfirmed: true,
  includeJourneySuite: true,
};
const validated = endpoint._internals.validateInput(requestBody);
assert.ok(!validated.error, `entrada 6+6 invalida: ${validated.error || ''}`);
assert.strictEqual(validated.value.includeJourneySuite, true);

const schema = endpoint._internals.responseSchema(validated.value);
assert.ok(schema.required.includes('journeySuite'));
assert.strictEqual(schema.properties.journeySuite.properties.visions.minItems, 6);
assert.strictEqual(schema.properties.journeySuite.properties.affirmations.maxItems, 6);
const providerRequest = endpoint._internals.buildGeminiRequest(validated.value, 123);
assert.strictEqual(providerRequest.generationConfig.maxOutputTokens, 4800);
assert.strictEqual(
  JSON.parse(providerRequest.contents[0].parts[0].text).task,
  'create_anchor_scene_with_journey_suite'
);
assert.match(providerRequest.systemInstruction.parts[0].text, /exactly six visions/i);

const rawScene = {
  intention: 'Viver com liberdade e construir uma familia com presenca.',
  affirmation: 'Eu cultivo uma vida com liberdade e construir uma familia enquanto reconheco minha proatividade e bondade.',
  story: 'E fim de tarde perto da praia. Voce volta para uma casa de fazenda e percebe que viver com liberdade e construir uma familia aparece na forma como organiza o trabalho em design de produto e protege tempo para pessoas importantes. O medo de comecar ainda pode surgir, mas agora funciona como um sinal para escolher um passo pequeno. A parceria leal, companheira e presente que voce valoriza orienta limites e conversas honestas. Nada aqui e garantia: e uma cena para reconhecer valores e ensaiar escolhas possiveis no presente.',
  anchorIdentity: 'Eu transformo liberdade em escolhas presentes, cuidadosas e constantes.',
  anchorStep: 'Se eu notar medo de comecar, entao vou dedicar dez minutos ao passo mais concreto de hoje.',
  affirmationFieldsUsed: ['desire', 'aboutYou'],
  storyFieldsUsed: ['desire', 'location', 'dreamHome', 'work', 'partnerDesire', 'obstacle'],
};
const output = endpoint._internals.validateGeneratedOutput(
  { ...rawScene, journeySuite: local },
  validated.value
);
assert.strictEqual(output.journeySuite.version, JOURNEY_SUITE_VERSION);
assert.strictEqual(output.journeySuite.visions.length, 6);
assert.strictEqual(output.journeySuite.affirmations.length, 6);

const missingVision = {
  ...local,
  visions: local.visions.slice(0, 5),
};
assert.throws(
  () => endpoint._internals.validateGeneratedJourneySuite(missingVision, validated.value),
  /invalid_generation/
);
const futureAffirmation = {
  ...local,
  affirmations: local.affirmations.map((item, index) =>
    index === 0 ? { ...item, text: 'Eu vou conseguir tudo o que desejo no amor.' } : item
  ),
};
assert.throws(
  () => endpoint._internals.validateGeneratedJourneySuite(futureAffirmation, validated.value),
  /invalid_generation/
);

// "O máximo diferente possível, nada robótico" (21/10): the prompt asks for her concrete details in every area,
// different openings and structures (visions vs affirmations too), no stock phrases and a natural human voice.
const suiteSystem = providerRequest.systemInstruction.parts[0].text;
for (const [label, pattern] of [
  ['um detalhe concreto dela em cada area', /every vision in at least one concrete detail drawn from her own answers/i],
  [
    'aberturas diferentes nas visoes e nas afirmacoes',
    /Never begin two visions \(after the future framing\) or two affirmations with the same three words/,
  ],
  ['no maximo tres afirmacoes comecando com Eu', /at most three of the six affirmations may begin with Eu or I/],
  ['visao e afirmacao da mesma area diferentes', /must not repeat the opening words or the main image of the vision of the same area/i],
  ['a visao e um momento vivido, nao uma foto', /not a description of a photograph/i],
  ['sem cliches de autoajuda', /avoid stock self-help phrases and cliches/i],
  ['voz natural de pessoa', /natural spoken language/i],
  ['sem promessa de resultado', /Do not promise results/i],
]) {
  assert.match(suiteSystem.normalize('NFD').replace(/[̀-ͯ]/g, ''), pattern, `prompt da suite: ${label}`);
}
assert.doesNotMatch(
  suiteSystem,
  /Prefer I choose\/I can\/I cultivate\/I practice/,
  'o prompt nao empurra as seis afirmacoes para o mesmo "Eu escolho/Eu posso"'
);
assert.match(
  suiteSystem,
  /contain a first-person word \(eu, meu, minha, meus, minhas, mim, me or comigo in Portuguese; I, my, mine, me or myself in English\)/,
  'afirmacoes variadas continuam em primeira pessoa (o validador exige uma palavra de primeira pessoa)'
);

// An affirmation that does not open with Eu still speaks in the first person ("Reconheço em mim...", "Me permito...",
// "Trust lives in me..."): the server and the app accept the same first-person words, so neither drops the other's suite.
const firstPersonVariants = {
  pt: ['Reconheço em mim a calma de seguir.', 'Me permito descansar sem culpa hoje.', 'Levo comigo a coragem de começar.'],
  en: ['Calm lives in me when I slow down.', 'Today I give myself room to rest.'],
};
for (const [lang, texts] of Object.entries(firstPersonVariants)) {
  const base = lang === 'pt' ? local : english;
  const input = lang === 'pt' ? validated.value : { ...validated.value, lang: 'en' };
  for (const text of texts) {
    const suite = {
      ...base,
      affirmations: base.affirmations.map((item, index) => (index === 5 ? { ...item, text } : item)),
    };
    assert.doesNotThrow(
      () => endpoint._internals.validateGeneratedJourneySuite(suite, input),
      `servidor: "${text}" e primeira pessoa`
    );
    assert.doesNotThrow(
      () => sceneService.validatePersonalContentSuitePayload(suite, lang),
      `app: "${text}" e primeira pessoa`
    );
  }
  const thirdPerson = {
    ...base,
    affirmations: base.affirmations.map((item, index) =>
      index === 5 ? { ...item, text: lang === 'pt' ? 'Ela descansa sem culpa hoje.' : 'She rests without guilt today.' } : item
    ),
  };
  assert.throws(() => endpoint._internals.validateGeneratedJourneySuite(thirdPerson, input), /invalid_generation/);
  assert.throws(() => sceneService.validatePersonalContentSuitePayload(thirdPerson, lang), /present_affirmation/);
}

// Near-duplicate openings read as a template: two visions (after the fixed future framing) or two affirmations that
// begin with the same three words are refused, with a targeted repair for the retry.
const futureFrame = 'Imagine uma possibilidade do seu futuro:';
const wordsOf = (text) => text.trim().split(/\s+/);
const afterFrame = (story) => story.slice(futureFrame.length).trim();
const openingOf = (text) => wordsOf(text).slice(0, 3).join(' ');
const repeatedVisionOpening = {
  ...local,
  visions: local.visions.map((item, index) =>
    index === 3
      ? {
          ...item,
          story: `${futureFrame} ${openingOf(afterFrame(local.visions[0].story)).toUpperCase()} ${wordsOf(afterFrame(item.story)).slice(3).join(' ')}`,
        }
      : item
  ),
};
const repeatedAffirmationOpening = {
  ...local,
  affirmations: local.affirmations.map((item, index) =>
    index === 4
      ? { ...item, text: `${openingOf(local.affirmations[1].text)} ${wordsOf(item.text).slice(3).join(' ')}` }
      : item
  ),
};
for (const [label, suite] of [
  ['duas visoes com a mesma abertura', repeatedVisionOpening],
  ['duas afirmacoes com a mesma abertura', repeatedAffirmationOpening],
]) {
  assert.throws(
    () => endpoint._internals.validateGeneratedJourneySuite(suite, validated.value),
    (error) =>
      error.code === 'invalid_generation' &&
      error.evaluation &&
      error.evaluation.issues[0].code === 'journey_repeated_openings',
    label
  );
}
const openingRepair = (() => {
  try {
    endpoint._internals.validateGeneratedJourneySuite(repeatedAffirmationOpening, validated.value);
  } catch (error) {
    return require('../api/_celeste-brain').buildRepairInstruction(error.evaluation);
  }
  return '';
})();
assert.match(openingRepair, /journey_repeated_openings/, 'a nova tentativa recebe o conserto especifico');
assert.match(openingRepair, /same three words/, 'o conserto diz o que mudar');

const legacy = endpoint._internals.validateInput({ ...requestBody, includeJourneySuite: undefined });
assert.ok(!legacy.error);
assert.strictEqual(legacy.value.includeJourneySuite, false);
assert.ok(!endpoint._internals.responseSchema(legacy.value).required.includes('journeySuite'));
const legacyOutput = endpoint._internals.validateGeneratedOutput(rawScene, legacy.value);
assert.ok(legacyOutput.scene);
assert.strictEqual(legacyOutput.journeySuite, undefined);
// a scene without the suite (new manifestation, Living Mirror) keeps the same human voice and the cliche ban
const plainSystem = endpoint._internals
  .buildGeminiRequest(legacy.value, 123)
  .systemInstruction.parts[0].text.normalize('NFD')
  .replace(/[̀-ͯ]/g, '');
assert.match(plainSystem, /avoid stock self-help phrases and cliches/i, 'cena sem suite: sem cliches');
assert.match(plainSystem, /natural spoken language/i, 'cena sem suite: voz natural');

const normalizedRemoteSuite = output.journeySuite;
let sentBody;
const fetchImpl = async (_url, options) => {
  sentBody = JSON.parse(options.body);
  return {
    ok: true,
    status: 200,
    json: async () => ({
      scene: output.scene,
      journeySuite: normalizedRemoteSuite,
      generation: {
        source: 'celeste-ai',
        model: 'claude-sonnet-5',
        provider: 'anthropic',
        promptVersion: JOURNEY_SUITE_VERSION,
        knowledgeVersion: 'celeste-core-v2',
        brainVersion: 'celeste-brain-v1',
        knowledgeCardIds: ['woop-mental-contrasting'],
      },
    }),
  };
};

(async () => {
  const remote = await sceneService.generatePersonalizedScene({
    desire: requestBody.desire,
    category: 'Love',
    lang: 'pt',
    profile,
    includeJourneySuite: true,
    fetchImpl,
  });
  assert.strictEqual(sentBody.includeJourneySuite, true);
  assert.strictEqual(sentBody.profile.work, profile.work, 'suite precisa receber contexto de Carreira');
  assert.strictEqual(
    sentBody.profile.partnerDesire,
    profile.partnerDesire,
    'suite precisa receber contexto de Amor'
  );
  assert.strictEqual(remote.journeySuite.visions.length, 6);
  assert.strictEqual(remote.journeySuite.affirmations.length, 6);

  const legacyRemote = await sceneService.generatePersonalizedScene({
    desire: requestBody.desire,
    category: 'Love',
    lang: 'pt',
    profile,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.strictEqual(body.includeJourneySuite, undefined);
      return {
        ok: true,
        status: 200,
        json: async () => ({ scene: output.scene, generation: {} }),
      };
    },
  });
  assert.ok(legacyRemote.scene);
  assert.strictEqual(legacyRemote.journeySuite, undefined);

  // The real handler: a suite whose affirmations open alike is refused and the one retry carries the targeted
  // repair; the second answer (all openings different) is served.
  const gemini = [];
  const previousEnv = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_PAID_DATA_TERMS_ACCEPTED: process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED,
    CELESTE_ALLOWED_ORIGINS: process.env.CELESTE_ALLOWED_ORIGINS,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  const previousFetch = global.fetch;
  process.env.GEMINI_API_KEY = 'suite-variety-test-key';
  process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = '1';
  process.env.CELESTE_ALLOWED_ORIGINS = 'https://celeste.example';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
  endpoint._internals.setPaidAccessAuthorizerForTests(async () => ({
    ok: true,
    userId: '00000000-0000-4000-8000-000000000001',
  }));
  const answers = [repeatedAffirmationOpening, local];
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    gemini.push(request.systemInstruction.parts[0].text);
    const journeySuite = answers[Math.min(gemini.length - 1, answers.length - 1)];
    return {
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ ...rawScene, journeySuite }) }] } }],
      }),
    };
  };
  const served = {
    statusCode: 200,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
  try {
    await endpoint({ method: 'POST', headers: { origin: 'https://celeste.example' }, body: requestBody }, served);
  } finally {
    global.fetch = previousFetch;
    endpoint._internals.resetSecurityForTests();
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  assert.strictEqual(served.statusCode, 200, JSON.stringify(served.body));
  assert.strictEqual(gemini.length, 2, 'aberturas repetidas: uma nova tentativa');
  assert.doesNotMatch(gemini[0], /journey_repeated_openings/);
  assert.match(gemini[1], /QUALITY REPAIR FOR THIS RETRY:[\s\S]*journey_repeated_openings/, 'a nova tentativa leva o conserto');
  assert.deepStrictEqual(
    served.body.journeySuite.affirmations.map((item) => item.text),
    local.affirmations.map((item) => item.text),
    'serve a suite com aberturas diferentes'
  );
  console.log(
    'OK: suite pessoal 6+6 local, Claude, validacao e compatibilidade legada; variedade (pares de pessoas com o ' +
      `mesmo esqueleto, palavras dela fora): ${varietyReport.join(' | ')}`
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
