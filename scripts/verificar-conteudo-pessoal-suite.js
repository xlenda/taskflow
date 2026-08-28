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

const legacy = endpoint._internals.validateInput({ ...requestBody, includeJourneySuite: undefined });
assert.ok(!legacy.error);
assert.strictEqual(legacy.value.includeJourneySuite, false);
assert.ok(!endpoint._internals.responseSchema(legacy.value).required.includes('journeySuite'));
const legacyOutput = endpoint._internals.validateGeneratedOutput(rawScene, legacy.value);
assert.ok(legacyOutput.scene);
assert.strictEqual(legacyOutput.journeySuite, undefined);

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
  console.log('OK: suite pessoal 6+6 local, Claude, validacao e compatibilidade legada');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
