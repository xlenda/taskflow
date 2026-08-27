const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const api = require('../api/transformar-sonho');
const internals = api._internals;
const ROOT = path.resolve(__dirname, '..');

function loadClientModule(relativePath) {
  const filename = path.join(ROOT, relativePath);
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename] = loaded;
  loaded._compile(compiled, filename);
  return loaded.exports;
}

function loadDreamClient() {
  // Expo exposes this development-only virtual module as ESM. The verifier
  // compiles the client modules to CommonJS, so provide the same env shape.
  const virtualEnvPath = require.resolve('expo/virtual/env');
  const virtualEnv = new Module(virtualEnvPath, module);
  virtualEnv.filename = virtualEnvPath;
  virtualEnv.loaded = true;
  virtualEnv.exports = { env: process.env };
  require.cache[virtualEnvPath] = virtualEnv;
  const paidSessionPath = require.resolve('../services/celesteApiSession');
  const paidSession = new Module(paidSessionPath, module);
  paidSession.filename = paidSessionPath;
  paidSession.loaded = true;
  paidSession.exports = { celestePaidApiHeaders: async () => ({}) };
  require.cache[paidSessionPath] = paidSession;
  loadClientModule('services/generatePersonalizedScene.js');
  return loadClientModule('services/transformDream.js');
}

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    end() { return this; },
  };
}

function request(body, overrides = {}) {
  return {
    method: 'POST',
    headers: {
      origin: 'https://celeste-jet-two.vercel.app',
      'content-type': 'application/json',
    },
    body,
    ...overrides,
  };
}

const validBody = {
  dream: 'Eu caminhava perto do mar e acordei querendo mais calma.',
  feeling: 'curious',
  theme: 'clarity',
  lang: 'pt',
  profile: { aboutYou: 'Sou uma pessoa cuidadosa.', whyMatters: 'Quero estar presente.' },
  cloudConsent: true,
  adultConfirmed: true,
};

const validated = internals.validateInput(validBody);
assert.ok(validated.value, 'entrada valida do sonho foi recusada');
assert.strictEqual(internals.knowledgeVersion, 'celeste-knowledge-v2');
assert.deepStrictEqual(validated.value.profile, validBody.profile, 'perfil minimo foi alterado');
assert.strictEqual(
  internals.validateInput({ ...validBody, cloudConsent: false }).error,
  'cloud_consent_required'
);
assert.strictEqual(
  internals.validateInput({ ...validBody, adultConfirmed: false }).error,
  'adult_confirmation_required'
);
assert.strictEqual(
  internals.parseBody(request({ ...validBody, extra: 'nao permitido' })).error,
  'invalid_request',
  'campos extras no corpo precisam ser recusados antes da validacao'
);
const minimized = internals.validateInput({
  ...validBody,
  profile: {
    ...validBody.profile,
    history: 'nao enviar',
    deviceId: 'nao enviar',
    thirdPartyName: 'nao enviar',
  },
});
assert.deepStrictEqual(
  minimized.value.profile,
  validBody.profile,
  'perfil enviado ao Gemini deve manter somente a allowlist minima'
);

const geminiBody = internals.buildGeminiRequest(validated.value, 123);
const instructions = geminiBody.systemInstruction.parts[0].text;
assert.match(instructions, /never a decoding, prediction/i);
assert.match(instructions, /celeste-knowledge-v2/);
assert.match(instructions, /first person, believable/i);
assert.deepStrictEqual(
  internals.validateGeneratedDream({
    reflection: 'Uma possibilidade e que a calma desejada seja o ponto mais importante, sem prever nada sobre o futuro.',
    affirmation: 'Eu posso escolher um passo calmo e presente hoje.',
    basis: ['dream', 'feeling', 'theme'],
  }).basis,
  ['dream', 'feeling', 'theme']
);
assert.throws(
  () => internals.validateGeneratedDream({
    reflection: 'Esse sonho revela que voce vai enriquecer e isso e garantido.',
    affirmation: 'O universo vai entregar tudo.',
    basis: ['dream'],
  }),
  /invalid_generation/
);
assert.throws(
  () => internals.validateGeneratedDream({
    reflection: 'Esse sonho confirma um diagnostico de ansiedade e mostra o que voce tem.',
    affirmation: 'Eu aceito esse diagnostico como uma verdade sobre mim.',
    basis: ['dream'],
  }),
  /invalid_generation/,
  'uma conclusao clinica continua bloqueada mesmo quando a negacao segura e permitida'
);

const safeNightmareResponses = [
  {
    lang: 'pt',
    reflection: 'O sonho trouxe uma imagem dificil e voce acordou ansiosa. Isso nao e uma previsao; agora voce pode voltar ao que e seguro e real.',
    affirmation: 'Eu acolho o que senti e escolho um passo calmo e cuidadoso no presente.',
  },
  {
    lang: 'en',
    reflection: 'The dream brought difficult imagery and you woke up anxious. It is not a prediction; you can return to what is safe and real now.',
    affirmation: 'I can welcome what I felt and choose one calm, careful step in the present.',
  },
];

for (const response of safeNightmareResponses) {
  assert.doesNotThrow(
    () => internals.validateGeneratedDream({ ...response, basis: ['dream', 'feeling'] }),
    `a grounded ${response.lang} nightmare response should be accepted`
  );
}

assert.doesNotThrow(() => internals.validateGeneratedDream({
  reflection: 'What you saw may have felt unsettling. It is not a prediction, and you can return to what feels safe and real now.',
  affirmation: 'I can meet this moment with care and choose one grounded next step.',
  basis: ['dream', 'feeling'],
}));

const graphicNightmareEchoes = [
  {
    lang: 'pt',
    reflection: 'A serra eletrica me cortava ao meio, mas isso revela a minha forca.',
    affirmation: 'Eu celebro ter sido cortada ao meio e sobrevivo a tudo.',
  },
  {
    lang: 'en',
    reflection: 'The electric saw cut me in half, and it reveals my strength.',
    affirmation: 'I celebrate being cut in half and survive anything.',
  },
];

for (const response of graphicNightmareEchoes) {
  assert.throws(
    () => internals.validateGeneratedDream({ ...response, basis: ['dream', 'feeling'] }),
    /invalid_generation/,
    `a graphic ${response.lang} nightmare echo must be rejected`
  );
}

(async () => {
  const dreamClient = loadDreamClient();
  internals.setPaidAccessAuthorizerForTests(async () => ({
    ok: true,
    userId: '00000000-0000-4000-8000-000000000001',
  }));
  let outboundDream;
  const originalDream = 'Sonhei que caminhava com Bia e Leo perto do mar.';
  const transformed = await dreamClient.transformDreamWithKnowledge({
    dream: originalDream,
    feeling: 'curious',
    theme: 'clarity',
    lang: 'pt',
    profile: {
      name: 'Ana',
      people: [{ name: 'Bia' }],
      kids: [{ name: 'Leo' }],
      cloudDreamConsent: true,
      cloudAdultConfirmed: true,
    },
    fetchImpl: async (_url, options) => {
      outboundDream = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          dream: {
            reflection: 'Uma possibilidade segura para refletir.',
            affirmation: 'Eu acolho o que senti e escolho um passo presente.',
            basis: ['dream', 'feeling', 'theme'],
          },
          generation: {},
        }),
      };
    },
  });
  assert.strictEqual(
    outboundDream.dream,
    'Sonhei que caminhava com uma pessoa próxima e uma pessoa próxima perto do mar.'
  );
  assert.ok(!JSON.stringify(outboundDream).includes('Bia'));
  assert.ok(!JSON.stringify(outboundDream).includes('Leo'));
  assert.strictEqual(transformed.dream, originalDream, 'o relato privado local deve preservar o texto original');

  let res = responseMock();
  await api(request(validBody, { headers: {} }), res);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.payload.error, 'origin_not_allowed');

  internals.setBotVerifierForTests(async () => ({ isHuman: false, isBot: true }));
  res = responseMock();
  await api(request(validBody), res);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.payload.error, 'automated_request_blocked');

  internals.setBotVerifierForTests(async () => { throw new Error('verificador indisponivel'); });
  res = responseMock();
  await api(request(validBody), res);
  assert.strictEqual(res.statusCode, 503);
  assert.strictEqual(res.payload.error, 'bot_verification_unavailable');

  internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
  const previousFetch = global.fetch;
  const previousKey = process.env.GEMINI_API_KEY;
  const previousTerms = process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED;
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = '1';
  let fetchCalls = 0;
  let sent;
  global.fetch = async (url, options) => {
    fetchCalls += 1;
    sent = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                reflection: 'Uma possibilidade e que a curiosidade ao acordar convide a olhar para a clareza que voce escolheu. Isso nao e uma previsao.',
                affirmation: 'Eu posso agir como uma pessoa cuidadosa e escolher estar presente em um passo calmo que depende de mim hoje.',
                basis: ['dream', 'feeling', 'theme'],
              }),
            }],
          },
        }],
      }),
    };
  };
  try {
    res = responseMock();
    await api(request({
      ...validBody,
      profile: {
        ...validBody.profile,
        history: 'historico privado que nao pertence a esta tarefa',
        deviceId: 'identificador que nao deve sair do aparelho',
      },
    }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['cache-control'], 'no-store, max-age=0');
    assert.strictEqual(res.headers['cdn-cache-control'], 'no-store');
    assert.strictEqual(res.headers['vercel-cdn-cache-control'], 'no-store');
    assert.strictEqual(res.headers['surrogate-control'], 'no-store');
    assert.strictEqual(res.headers['referrer-policy'], 'no-referrer');
    assert.strictEqual(res.headers.vary, 'Origin');
    assert.strictEqual(res.payload.generation.source, 'gemini-dream');
    assert.strictEqual(res.payload.generation.promptVersion, 'celeste-dream-v2');
    assert.strictEqual(res.payload.generation.knowledgeVersion, 'celeste-knowledge-v2');
    assert.match(res.payload.dream.affirmation, /depende de mim/);
    assert.strictEqual(fetchCalls, 1);
    assert.match(sent.url, /\/v1beta\/models\/gemini-[^/]+:generateContent$/);
    assert.strictEqual(sent.options.headers['x-goog-api-key'], process.env.GEMINI_API_KEY);
    assert.ok(!sent.options.body.includes(process.env.GEMINI_API_KEY));
    const personalPayload = JSON.parse(sent.body.contents[0].parts[0].text);
    assert.deepStrictEqual(Object.keys(personalPayload).sort(), [
      'exactRecall',
      'knowledgeCardIds',
      'language',
      'personalMap',
      'safeProfileContext',
      'task',
      'userChosenTheme',
      'wakingFeeling',
    ]);
    assert.deepStrictEqual(personalPayload.safeProfileContext, validBody.profile);
    assert.ok(Array.isArray(personalPayload.knowledgeCardIds));
    assert.ok(personalPayload.knowledgeCardIds.length >= 4 && personalPayload.knowledgeCardIds.length <= 8);
    assert.deepStrictEqual(
      personalPayload.personalMap.factKeys.sort(),
      ['dreamRecall', 'selfDescription', 'userChosenTheme', 'wakingFeeling', 'whyItMatters'].sort()
    );
    assert.ok(!sent.options.body.includes('historico privado'));
    assert.ok(!sent.options.body.includes('identificador que nao deve'));
    assert.ok(!JSON.stringify(res.payload).includes(process.env.GEMINI_API_KEY));

    const validDreamPayload = () => ({
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              reflection: 'Uma possibilidade e que a curiosidade ao acordar convide a olhar para a clareza que voce escolheu. Isso nao e uma previsao.',
              affirmation: 'Eu posso agir como uma pessoa cuidadosa e escolher estar presente em um passo calmo que depende de mim hoje.',
              basis: ['dream', 'feeling', 'theme'],
            }),
          }],
        },
      }],
    });
    const invalidDreamResponse = () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] }),
    });

    let now = 1_000;
    let deadlineCalls = 0;
    internals.setGenerationClockForTests(() => now);
    global.fetch = async () => {
      deadlineCalls += 1;
      now += internals.generationDeadlineMs() - internals.minimumRepairBudgetMs() + 1;
      return invalidDreamResponse();
    };
    res = responseMock();
    await api(request(validBody), res);
    assert.strictEqual(res.statusCode, 504);
    assert.strictEqual(res.payload.error, 'generation_timeout');
    assert.strictEqual(
      deadlineCalls,
      1,
      'a late invalid dream must not start a repair without enough budget'
    );

    now = 2_000;
    const repairRequests = [];
    internals.setGenerationClockForTests(() => now);
    global.fetch = async (_url, options) => {
      repairRequests.push(JSON.parse(options.body));
      now += 100;
      return repairRequests.length === 1
        ? invalidDreamResponse()
        : { ok: true, json: async () => validDreamPayload() };
    };
    res = responseMock();
    await api(request(validBody), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(repairRequests.length, 2);
    assert.match(
      repairRequests[1].systemInstruction.parts[0].text,
      /QUALITY REPAIR FOR THIS RETRY/,
      'a fast invalid dream must receive one repaired attempt'
    );

    now = 3_000;
    deadlineCalls = 0;
    internals.setGenerationClockForTests(() => now);
    global.fetch = async () => {
      deadlineCalls += 1;
      return {
        ok: true,
        json: async () => {
          now += internals.generationDeadlineMs() + 1;
          return validDreamPayload();
        },
      };
    };
    res = responseMock();
    await api(request(validBody), res);
    assert.strictEqual(res.statusCode, 504);
    assert.strictEqual(res.payload.error, 'generation_timeout');
    assert.strictEqual(deadlineCalls, 1);
    internals.setGenerationClockForTests();

    const graphicNightmareApiCases = [
      {
        lang: 'pt',
        dream: 'Sonhei que uma serra eletrica me cortava ao meio.',
        output: {
          reflection: 'A serra eletrica me cortava ao meio, mas isso revela a minha forca.',
          affirmation: 'Eu celebro ter sido cortada ao meio e sobrevivo a tudo.',
          basis: ['dream', 'feeling'],
        },
      },
      {
        lang: 'en',
        dream: 'I dreamed that an electric saw cut me in half.',
        output: {
          reflection: 'The electric saw cut me in half, and it reveals my strength.',
          affirmation: 'I celebrate being cut in half and survive anything.',
          basis: ['dream', 'feeling'],
        },
      },
    ];
    for (const nightmare of graphicNightmareApiCases) {
      global.fetch = async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify(nightmare.output) }] } }],
        }),
      });
      res = responseMock();
      await api(request({ ...validBody, dream: nightmare.dream, lang: nightmare.lang }), res);
      assert.strictEqual(res.statusCode, 502, `graphic ${nightmare.lang} output must not be returned`);
      assert.strictEqual(res.payload.error, 'invalid_generation');
      assert.ok(!JSON.stringify(res.payload).includes('serra'));
      assert.ok(!JSON.stringify(res.payload).includes('saw'));
    }

    res = responseMock();
    await api(request(validBody, { headers: {
      origin: 'https://celeste-jet-two.vercel.app',
      'content-length': String(13 * 1024),
    } }), res);
    assert.strictEqual(res.statusCode, 413);
    assert.strictEqual(res.payload.error, 'payload_too_large');
    assert.strictEqual(fetchCalls, 1, 'payload grande nao pode chegar ao Gemini');
  } finally {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
    if (previousTerms === undefined) delete process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED;
    else process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = previousTerms;
    internals.resetSecurityForTests();
  }
  console.log('Sonhos Gemini OK: consentimento, payload minimo, no-store, BotID e base controlada.');
})().catch((error) => {
  internals.resetSecurityForTests();
  console.error(error.stack || error);
  process.exitCode = 1;
});
