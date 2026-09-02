const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const api = require('../api/transformar-sonho');
const internals = api._internals;
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');
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
  profile: {
    aboutYou: 'Sou uma pessoa cuidadosa.',
    whyMatters: 'Quero estar presente.',
    desire: 'Construir uma rotina com mais liberdade.',
    desiredFeeling: 'Calma e confiança.',
    work: 'Designer de produto.',
    partnerDesire: 'Reciprocidade e parceria.',
    dreamLocation: 'Uma cidade perto do mar.',
    dreamHome: 'Uma casa clara e tranquila.',
  },
  cloudConsent: true,
  cloudConsentVersion: CLOUD_CONSENT_VERSION,
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
  internals.validateInput({ ...validBody, cloudConsentVersion: undefined }).error,
  'cloud_consent_required'
);
assert.strictEqual(
  internals.validateInput({ ...validBody, cloudConsentVersion: 'legacy-version' }).error,
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
  geminiBody.generationConfig.thinkingConfig,
  { thinkingLevel: 'low' },
  'a reflexao curta deve usar thinking baixo para preservar latencia e tokens da resposta'
);
assert.strictEqual(
  geminiBody.generationConfig.maxOutputTokens,
  1800,
  'o limite deve reservar espaco para thinking e para o JSON completo'
);
assert.strictEqual(
  Object.hasOwn(geminiBody.generationConfig, 'temperature'),
  false,
  'Gemini 3 deve usar a temperatura padrao do modelo'
);
const nonGeminiThreeBody = internals.buildGeminiRequest(
  validated.value,
  123,
  '',
  'gemini-2.5-flash'
);
assert.strictEqual(
  Object.hasOwn(nonGeminiThreeBody.generationConfig, 'thinkingConfig'),
  false,
  'modelos anteriores ao Gemini 3 nao devem receber thinkingLevel incompatível'
);
assert.match(instructions, /Never quote, restate, summarize, paraphrase, retell/i);
assert.match(instructions, /The dream itself is the primary source of meaning/i);
assert.match(instructions, /broad emotional dynamic/i);
assert.match(instructions, /The Anchor supports the interpretation; it never replaces the dream/i);
assert.deepStrictEqual(
  internals.validateGeneratedDream({
    reflection: 'Uma possibilidade e que a calma desejada seja o ponto mais importante, sem prever nada sobre o futuro.',
    affirmation: 'Eu posso escolher um passo calmo e presente hoje.',
    theme: 'clarity',
    basis: ['dream', 'feeling', 'theme'],
  }, validated.value).basis,
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
const echoedBenignDream = {
  reflection: 'Uma possibilidade e que eu caminhava perto do mar e isso esteja pedindo calma, sem ser uma previsao.',
  affirmation: 'Eu caminhava perto do mar e escolho seguir com calma.',
  basis: ['dream', 'feeling', 'theme'],
};
assert.throws(
  () => internals.validateGeneratedDream(echoedBenignDream, validated.value),
  /invalid_generation/,
  'uma recontagem benigna do relato precisa ser reparada antes de chegar ao app'
);
const echoEvaluation = internals.evaluateDream(echoedBenignDream, validated.value);
assert.ok(echoEvaluation.issues.some((issue) => issue.code === 'dream_recall_echo'));

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
  assert.strictEqual(
    dreamClient._dreamServiceInternals.hasDreamRecallEcho(
      validBody.dream,
      `${echoedBenignDream.reflection} ${echoedBenignDream.affirmation}`
    ),
    true,
    'o cliente nao reconheceu a recontagem devolvida pelo servidor'
  );
  assert.throws(
    () => dreamClient._dreamServiceInternals.validateResponse(
      { dream: echoedBenignDream, generation: {} },
      { dream: validBody.dream, feeling: validBody.feeling, theme: validBody.theme }
    ),
    /invalid_dream_echo/,
    'uma resposta remota com eco chegou ao contrato normalizado do app'
  );
  let paidAccessCalls = 0;
  internals.setPaidAccessAuthorizerForTests(async () => {
    paidAccessCalls += 1;
    return {
      ok: true,
      userId: '00000000-0000-4000-8000-000000000001',
    };
  });
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
      aboutYou: 'Sou cuidadosa e curiosa.',
      whyMatters: 'Estar presente para Bia e Leo.',
      hopedChange: 'Construir uma rotina tranquila perto de Bia.',
      work: 'Designer de produto.',
      partnerDesire: 'Uma parceria recíproca.',
      dreamLocation: 'Perto do mar.',
      dreamHome: 'Uma casa clara.',
      cloudDreamConsent: true,
      cloudAdultConfirmed: true,
      cloudConsentVersion: CLOUD_CONSENT_VERSION,
    },
    fetchImpl: async (_url, options) => {
      outboundDream = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          dream: {
            reflection: 'Uma possibilidade segura para refletir.',
            affirmation: 'Eu acolho o que senti e escolho um passo presente.',
            theme: 'clarity',
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
  assert.strictEqual(outboundDream.profile.desire, 'Construir uma rotina tranquila perto de uma pessoa próxima.');
  assert.strictEqual(outboundDream.profile.work, 'Designer de produto.');
  assert.strictEqual(outboundDream.profile.dreamLocation, 'Perto do mar.');
  assert.ok(!Object.hasOwn(outboundDream.profile, 'hopedChange'));
  assert.strictEqual(transformed.dream, originalDream, 'o relato privado local deve preservar o texto original');
  assert.strictEqual(transformed.theme, 'clarity', 'o app precisa preservar o tema usado na reflexao');
  assert.strictEqual(transformed.dreamAnchor, '', 'o contrato remoto nao pode recriar uma ancora literal');
  assert.deepStrictEqual(transformed.usedDetails, ['dream_semantics', 'feeling', 'theme']);

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
  const generationMetadataLogs = [];
  internals.setGenerationMetadataLoggerForTests((metadata) => {
    generationMetadataLogs.push(metadata);
  });
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
    await api(request({ ...validBody, cloudConsentVersion: undefined }), res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.payload.error, 'cloud_consent_required');

    res = responseMock();
    await api(request({ ...validBody, cloudConsentVersion: 'legacy-version' }), res);
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.payload.error, 'cloud_consent_required');
    assert.strictEqual(fetchCalls, 0, 'invalid consent version must fail before Gemini');
    assert.strictEqual(paidAccessCalls, 0, 'invalid consent version must fail before quota');

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
    assert.strictEqual(res.payload.generation.promptVersion, 'celeste-dream-v3');
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
      [
        'desire', 'desiredFeeling', 'dreamHome', 'dreamRecall', 'partnerDesire',
        'place', 'selfDescription', 'userChosenTheme', 'wakingFeeling', 'whyItMatters', 'work',
      ].sort()
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
    const echoedDreamResponse = () => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify(echoedBenignDream) }] } }],
      }),
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
        ? echoedDreamResponse()
        : { ok: true, json: async () => validDreamPayload() };
    };
    res = responseMock();
    await api(request(validBody), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(repairRequests.length, 2);
    assert.match(
      repairRequests[1].systemInstruction.parts[0].text,
      /QUALITY REPAIR FOR THIS RETRY[\s\S]*dream_recall_echo[\s\S]*Discard the wording and narrative of the recall/,
      'a recontagem deve receber uma tentativa de reparo especifica'
    );

    now = 2_500;
    const truncationRequests = [];
    const truncationLogStart = generationMetadataLogs.length;
    const privateDreamSentinel = 'SEGREDO_RELATO_NAO_LOGAR em um caminho tranquilo.';
    const privateOutputSentinel = 'SEGREDO_SAIDA_NAO_LOGAR';
    const maxTokensPayload = validDreamPayload();
    maxTokensPayload.candidates[0].finishReason = 'MAX_TOKENS';
    const otherwiseValidTruncatedDream = JSON.parse(
      maxTokensPayload.candidates[0].content.parts[0].text
    );
    otherwiseValidTruncatedDream.reflection += ` ${privateOutputSentinel}.`;
    maxTokensPayload.candidates[0].content.parts[0].text = JSON.stringify(
      otherwiseValidTruncatedDream
    );
    internals.setGenerationClockForTests(() => now);
    global.fetch = async (_url, options) => {
      truncationRequests.push(JSON.parse(options.body));
      now += 100;
      return truncationRequests.length === 1
        ? { ok: true, json: async () => maxTokensPayload }
        : { ok: true, json: async () => validDreamPayload() };
    };
    res = responseMock();
    await api(request({ ...validBody, dream: privateDreamSentinel }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(truncationRequests.length, 2, 'MAX_TOKENS deve consumir somente o retry existente');
    assert.match(
      truncationRequests[1].systemInstruction.parts[0].text,
      /QUALITY REPAIR FOR THIS RETRY[\s\S]*output-token limit[\s\S]*complete JSON object concisely/,
      'o retry truncado deve pedir JSON completo e conciso'
    );
    const repairMarker = 'QUALITY REPAIR FOR THIS RETRY:\n';
    const truncationRepairText = truncationRequests[1].systemInstruction.parts[0].text
      .split(repairMarker)[1]
      .trim();
    assert.ok(
      truncationRepairText.length <= 200,
      `instrucao de reparo truncado ficou longa: ${truncationRepairText.length}`
    );
    const truncationLogs = generationMetadataLogs.slice(truncationLogStart);
    assert.deepStrictEqual(truncationLogs, [{
      event: 'retry',
      attempt: 1,
      code: 'generation_truncated',
      finishReason: 'MAX_TOKENS',
    }]);
    const serializedTruncationLogs = JSON.stringify(truncationLogs);
    assert.ok(!serializedTruncationLogs.includes(privateDreamSentinel));
    assert.ok(!serializedTruncationLogs.includes(privateOutputSentinel));
    assert.ok(!serializedTruncationLogs.includes(process.env.GEMINI_API_KEY));

    let exhaustedTruncationCalls = 0;
    const exhaustedTruncationLogStart = generationMetadataLogs.length;
    global.fetch = async () => {
      exhaustedTruncationCalls += 1;
      now += 100;
      return {
        ok: true,
        json: async () => ({
          candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [] } }],
        }),
      };
    };
    res = responseMock();
    await api(request({ ...validBody, dream: privateDreamSentinel }), res);
    assert.strictEqual(res.statusCode, 502);
    assert.deepStrictEqual(res.payload, { error: 'invalid_generation' });
    assert.strictEqual(exhaustedTruncationCalls, 2, 'truncamento persistente nao pode exceder duas tentativas');
    const exhaustedTruncationLogs = generationMetadataLogs.slice(exhaustedTruncationLogStart);
    assert.deepStrictEqual(exhaustedTruncationLogs, [
      {
        event: 'retry',
        attempt: 1,
        code: 'generation_truncated',
        finishReason: 'MAX_TOKENS',
      },
      {
        event: 'failed',
        attempt: 2,
        code: 'generation_truncated',
        finishReason: 'MAX_TOKENS',
      },
    ]);
    const serializedExhaustedLogs = JSON.stringify(exhaustedTruncationLogs);
    assert.ok(!serializedExhaustedLogs.includes(privateDreamSentinel));
    assert.ok(!serializedExhaustedLogs.includes(privateOutputSentinel));
    assert.ok(!serializedExhaustedLogs.includes(process.env.GEMINI_API_KEY));

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
    const allowedMetadataKeys = new Set(['event', 'attempt', 'code', 'finishReason', 'issueCodes']);
    assert.ok(
      generationMetadataLogs.every((metadata) =>
        Object.keys(metadata).every((key) => allowedMetadataKeys.has(key))
      ),
      'logs de geracao devem conter somente metadados explicitamente permitidos'
    );
    assert.ok(
      generationMetadataLogs.every((metadata) =>
        (metadata.event === 'retry' || metadata.event === 'failed') &&
        Number.isInteger(metadata.attempt) &&
        metadata.attempt >= 1 &&
        metadata.attempt <= 2 &&
        /^[a-z0-9_]+$/.test(metadata.code) &&
        (!metadata.finishReason || metadata.finishReason === 'MAX_TOKENS') &&
        (!metadata.issueCodes || metadata.issueCodes.every((code) => /^[a-z0-9_]+$/.test(code)))
      ),
      'valores dos metadados de geracao devem permanecer limitados a codigos seguros'
    );
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
