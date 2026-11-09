const assert = require('node:assert');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { transformSync } = require('@babel/core');

const provider = require('../api/_text-provider');
const sceneEndpoint = require('../api/gerar-cena');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');
const { JOURNEY_CATEGORIES, createPersonalContentSuite } = require('../utils/personalContentSuite');

function loadExpoModule(relativePath) {
  const file = path.join(__dirname, '..', relativePath);
  const compiled = transformSync(fs.readFileSync(file, 'utf8'), {
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

const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_PAID_DATA_TERMS_ACCEPTED',
  'ANTHROPIC_TEXT_EFFORT',
  'ANTHROPIC_TEXT_MODEL',
  'CELESTE_ALLOWED_ORIGINS',
  'CELESTE_TEXT_FALLBACK',
  'CELESTE_TEXT_FALLBACK_RESERVE_MS',
  'CELESTE_SUITE_TEXT_EFFORT',
  'CELESTE_TEXT_LOG_USAGE',
  'CELESTE_TEXT_PRIMARY',
  'CELESTE_TEXT_PROVIDER_TIMEOUT_MS',
  'GEMINI_API_KEY',
  'GEMINI_PAID_DATA_TERMS_ACCEPTED',
  'OPENAI_API_KEY',
  'OPENAI_PAID_DATA_TERMS_ACCEPTED',
  'OPENAI_TEXT_MODEL',
  'OPENAI_TEXT_REASONING_EFFORT',
];

const SPEC = {
  operation: 'scene',
  system: 'Return the requested structured value.',
  user: JSON.stringify({ value: 'ok' }),
  schemaName: 'celeste_test',
  schema: {
    type: 'object',
    properties: { value: { type: 'string' } },
    required: ['value'],
    additionalProperties: false,
  },
  maxOutputTokens: 256,
};

function anthropicPayload(value = 'anthropic') {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ value }) }],
    usage: {
      input_tokens: 10,
      cache_creation_input_tokens: 7,
      cache_read_input_tokens: 3,
      output_tokens: 4,
    },
  };
}

function openAiPayload(value = 'openai') {
  return {
    status: 'completed',
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify({ value }) }],
    }],
    usage: { input_tokens: 11, output_tokens: 5, total_tokens: 16 },
  };
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function configureBoth() {
  process.env.CELESTE_TEXT_PRIMARY = 'anthropic';
  process.env.CELESTE_TEXT_FALLBACK = 'openai';
  process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
  process.env.ANTHROPIC_PAID_DATA_TERMS_ACCEPTED = '1';
  process.env.ANTHROPIC_TEXT_MODEL = 'claude-sonnet-5';
  process.env.ANTHROPIC_TEXT_EFFORT = 'medium';
  process.env.OPENAI_API_KEY = 'openai-test-key';
  process.env.OPENAI_PAID_DATA_TERMS_ACCEPTED = '1';
  process.env.OPENAI_TEXT_MODEL = 'gpt-5.6-terra';
  process.env.OPENAI_TEXT_REASONING_EFFORT = 'medium';
  delete process.env.CELESTE_TEXT_PROVIDER_TIMEOUT_MS;
  delete process.env.CELESTE_TEXT_FALLBACK_RESERVE_MS;
}

function validBody() {
  return {
    desire: 'construir uma vida criativa e tranquila',
    category: 'Career',
    lang: 'pt',
    profile: {
      name: 'Ana',
      dreamLocation: 'Lisboa',
      dreamHome: 'Modern Loft',
      work: 'designer de produto',
      workFeeling: 'Estou construindo algo em paralelo',
      relationshipStatus: 'Solteiro(a)',
      aboutYou: 'sou curiosa, criativa e gosto de aprender fazendo',
      partnerDesire: 'uma parceria leve, presente e honesta',
      pastInfluence: 'ter mudado de cidade me ensinou a recomecar',
      obstacle: 'medo de comecar',
      whyMatters: 'ter liberdade para estar com pessoas importantes',
      cloudPersonalization: true,
      cloudAdultConfirmed: true,
      cloudConsentVersion: CLOUD_CONSENT_VERSION,
    },
    cloudConsent: true,
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    adultConfirmed: true,
  };
}

function validScene(overrides = {}) {
  return {
    intention: 'Viver meu trabalho criativo com presenca e constancia.',
    affirmation: 'Eu construo uma vida criativa e tranquila enquanto meu trabalho como designer de produto cresce com constancia.',
    story: 'E fim de tarde em Lisboa. Voce fecha o computador depois de concluir uma tarefa que importa e percebe o loft moderno silencioso ao redor. A vida criativa e tranquila que deseja aparece no modo como o trabalho de designer de produto cabe no seu dia sem tomar todo o resto. O medo de comecar ainda pode aparecer, mas ja nao decide o proximo passo. Voce respira, olha o que terminou e reconhece a constancia que esta construindo. A liberdade para estar com pessoas importantes deixa de ser uma ideia abstrata e orienta escolhas pequenas, possiveis e reais.',
    anchorIdentity: 'Eu construo espaco para meu trabalho ser visto com constancia.',
    anchorStep: 'Se eu notar medo de comecar, entao vou dedicar dez minutos a tarefa mais concreta do meu projeto hoje.',
    affirmationFieldsUsed: ['desire', 'work'],
    storyFieldsUsed: ['desire', 'location', 'dreamHome', 'work', 'obstacle', 'whyMatters'],
    ...overrides,
  };
}

function anthropicScenePayload(scene = validScene(), overrides = {}) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(scene) }],
    usage: { input_tokens: 100, cache_creation_input_tokens: 200, output_tokens: 80 },
    ...overrides,
  };
}

function openAiScenePayload(scene = validScene()) {
  return {
    status: 'completed',
    output: [{
      type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify(scene) }],
    }],
    usage: { input_tokens: 300, output_tokens: 80, total_tokens: 380 },
  };
}

function routeRequest() {
  return {
    method: 'POST',
    body: validBody(),
    headers: {
      origin: 'https://celeste.example',
      'x-is-human': 'unit-test-challenge',
    },
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function routeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
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
}

async function invokeScene(body = validBody()) {
  const res = routeResponse();
  await sceneEndpoint({ ...routeRequest(), body }, res);
  return res;
}

function suiteBody() {
  return { ...validBody(), includeJourneySuite: true };
}

function validSuite() {
  const body = validBody();
  return createPersonalContentSuite({ desire: body.desire, profile: body.profile, lang: 'pt', category: body.category });
}

function anthropicSuitePayload(suite) {
  return {
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify({ visions: suite.visions, affirmations: suite.affirmations }) }],
    usage: { input_tokens: 120, cache_creation_input_tokens: 300, output_tokens: 900 },
  };
}

// the 6+6 call is the one whose structured output asks for visions (Anthropic or OpenAI request shape)
function isSuiteCall(body) {
  const schema = (body.output_config && body.output_config.format.schema) || (body.text && body.text.format.schema);
  return Boolean(schema && schema.properties && schema.properties.visions);
}

function hangUntilAborted(signal) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });
}

function configureSceneRoute() {
  configureBoth();
  process.env.CELESTE_ALLOWED_ORIGINS = 'https://celeste.example';
  delete process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED;
  sceneEndpoint._internals.resetSecurityForTests();
  sceneEndpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
  sceneEndpoint._internals.setPaidAccessAuthorizerForTests(async () => ({
    ok: true,
    userId: '00000000-0000-4000-8000-000000000001',
  }));
}

test('Celeste text providers are bounded, structured, and fail over only when safe', async (t) => {
  const originalFetch = global.fetch;
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  t.after(() => {
    global.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    sceneEndpoint._internals.resetSecurityForTests();
  });

  await t.test('Anthropic is primary and secrets never enter the request body', async () => {
    configureBoth();
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return response(200, anthropicPayload());
    };
    const session = provider.createSession({ deadlineAt: Date.now() + 120_000 });
    const result = await session.generate(SPEC);
    assert.strictEqual(result.provider, 'anthropic');
    assert.strictEqual(result.fallbackUsed, false);
    assert.deepStrictEqual(result.data, { value: 'anthropic' });
    assert.strictEqual(result.usage.inputTokens, 20);
    assert.strictEqual(result.usage.uncachedInputTokens, 10);
    assert.strictEqual(result.usage.cacheCreationInputTokens, 7);
    assert.strictEqual(result.usage.cachedInputTokens, 3);
    assert.strictEqual(result.usage.totalTokens, 24);
    assert.strictEqual(calls.length, 1);
    assert.match(calls[0].url, /api\.anthropic\.com\/v1\/messages$/);
    assert.strictEqual(calls[0].options.headers['x-api-key'], 'anthropic-test-key');
    assert.ok(!calls[0].options.body.includes('anthropic-test-key'));
  });

  await t.test('retryable upstream failure uses OpenAI once', async () => {
    configureBoth();
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? response(429, {})
        : response(200, openAiPayload());
    };
    const session = provider.createSession({ deadlineAt: Date.now() + 120_000 });
    const result = await session.generate(SPEC);
    assert.strictEqual(result.provider, 'openai');
    assert.strictEqual(result.fallbackUsed, true);
    assert.deepStrictEqual(result.data, { value: 'openai' });
    assert.strictEqual(calls.length, 2);
    assert.match(calls[1].url, /api\.openai\.com\/v1\/responses$/);
    const body = JSON.parse(calls[1].options.body);
    assert.strictEqual(body.model, 'gpt-5.6-terra');
    assert.strictEqual(body.store, false);
    assert.strictEqual(body.text.format.type, 'json_schema');
  });

  await t.test('HTTP 400 and authentication failures never cross providers', async () => {
    for (const status of [400, 401]) {
      configureBoth();
      let calls = 0;
      global.fetch = async () => {
        calls += 1;
        return response(status, {});
      };
      const session = provider.createSession({ deadlineAt: Date.now() + 120_000 });
      await assert.rejects(
        session.generate(SPEC),
        (error) => error.code === 'text_provider_unavailable' && error.retryable === false
      );
      assert.strictEqual(calls, 1);
    }
  });

  await t.test('one request session can never spend more than two model calls', async () => {
    configureBoth();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(200, anthropicPayload(`call-${calls}`));
    };
    const session = provider.createSession({ deadlineAt: Date.now() + 120_000 });
    await session.generate(SPEC, { provider: 'anthropic' });
    await session.generate(SPEC, { provider: 'anthropic' });
    await assert.rejects(
      session.generate(SPEC, { provider: 'anthropic' }),
      (error) => error.code === 'text_provider_attempt_limit'
    );
    assert.strictEqual(calls, 2);

    // a caller may allow three (answer, truncation retry, quality repair), never more
    for (const [maxCalls, allowed] of [[3, 3], [9, 3]]) {
      calls = 0;
      const wider = provider.createSession({ deadlineAt: Date.now() + 120_000, maxCalls });
      for (let index = 0; index < allowed; index += 1) await wider.generate(SPEC, { provider: 'anthropic' });
      await assert.rejects(wider.generate(SPEC, { provider: 'anthropic' }), (error) => error.code === 'text_provider_attempt_limit');
      assert.strictEqual(calls, allowed, `maxCalls ${maxCalls} sends at most ${allowed}`);
    }
  });

  await t.test('a session without an explicit deadline gets a bounded default', async () => {
    configureBoth();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(200, anthropicPayload());
    };
    const session = provider.createSession();
    const result = await session.generate(SPEC);
    assert.strictEqual(result.provider, 'anthropic');
    assert.strictEqual(calls, 1);
    assert.throws(
      () => provider.createSession({ deadlineAt: Number.NaN }),
      (error) => error.code === 'invalid_text_provider_deadline'
    );
  });

  await t.test('scene route returns stable source and Anthropic provenance', async () => {
    configureSceneRoute();
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return response(200, anthropicScenePayload());
    };
    const res = await invokeScene();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.generation.source, 'celeste-ai');
    assert.strictEqual(res.body.generation.provider, 'anthropic');
    assert.strictEqual(res.body.generation.fallbackUsed, false);
    assert.strictEqual(calls.length, 1);
  });

  await t.test('scene route uses OpenAI once after a retryable Anthropic failure', async () => {
    configureSceneRoute();
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return calls.length === 1
        ? response(429, {})
        : response(200, openAiScenePayload());
    };
    const res = await invokeScene();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.generation.source, 'celeste-ai');
    assert.strictEqual(res.body.generation.provider, 'openai');
    assert.strictEqual(res.body.generation.fallbackUsed, true);
    assert.strictEqual(calls.length, 2);
    assert.match(calls[0].url, /api\.anthropic\.com/);
    assert.match(calls[1].url, /api\.openai\.com/);
  });

  await t.test('scene route repairs local quality once on the same provider', async () => {
    configureSceneRoute();
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return response(
        200,
        calls.length === 1
          ? anthropicScenePayload(validScene({ affirmation: 'Eu sigo.' }))
          : anthropicScenePayload()
      );
    };
    const res = await invokeScene();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every((call) => /api\.anthropic\.com/.test(call.url)));
    assert.match(calls[1].body.system[0].text, /QUALITY REPAIR FOR THIS RETRY/);
  });

  await t.test('scene route retries truncation once with a larger budget on the same provider', async () => {
    configureSceneRoute();
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return response(
        200,
        calls.length === 1
          ? anthropicScenePayload(validScene(), { stop_reason: 'max_tokens', content: [] })
          : anthropicScenePayload()
      );
    };
    const res = await invokeScene();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every((call) => /api\.anthropic\.com/.test(call.url)));
    assert.ok(calls[1].body.max_tokens > calls[0].body.max_tokens);
  });

  await t.test('scene route retries OpenAI truncation once without crossing providers', async () => {
    configureSceneRoute();
    process.env.CELESTE_TEXT_PRIMARY = 'openai';
    process.env.CELESTE_TEXT_FALLBACK = 'anthropic';
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return response(
        200,
        calls.length === 1
          ? { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }
          : openAiScenePayload()
      );
    };
    const res = await invokeScene();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.generation.provider, 'openai');
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every((call) => /api\.openai\.com/.test(call.url)));
    assert.ok(calls[1].body.max_output_tokens > calls[0].body.max_output_tokens);
  });

  await t.test('scene route never crosses providers for a refusal', async () => {
    configureSceneRoute();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(200, {
        stop_reason: 'refusal',
        content: [{ type: 'text', text: 'I cannot help with that.' }],
        usage: { input_tokens: 20, output_tokens: 5 },
      });
    };
    const res = await invokeScene();
    assert.strictEqual(res.statusCode, 422);
    assert.deepStrictEqual(res.body, { error: 'generation_blocked' });
    assert.strictEqual(calls, 1);
  });

  // 22/10: every scene + 6+6 request died at the 30 s abort in production. The scene and the suite are now two calls
  // in parallel, each with room to finish, inside one deadline that the function, the app and the deploy smoke outlive.
  await t.test('timeouts line up: a call can finish, the deadline holds a repair, the function and the app outlive it', async () => {
    const { minimumCallMs, providerTimeoutMs, defaultSessionDeadlineMs } = provider._internals;
    const allowance = provider._internals.thinkingAllowanceTokens();
    const rate = provider._internals.slowOutputTokensPerSecond();
    const budgets = sceneEndpoint._internals.providerBudgets();
    const callMs = (budget) => minimumCallMs({ maxOutputTokens: budget });
    const sceneCall = callMs(budgets.scene);
    const sceneRetryCall = callMs(budgets.sceneRetry);
    const suiteCall = callMs(budgets.suite);
    const suiteRetryCall = callMs(budgets.suiteRetry);
    const largestCall = callMs(provider._internals.maxOutputTokens());
    // connection + first token, then max_tokens (answer budget + allowance) at the slow rate, below every production
    // sample (94-101 tokens/s per call)
    assert.ok(rate < 94, 'the floor stays under the slowest measured rate');
    assert.strictEqual(suiteCall, 5_000 + Math.ceil(((budgets.suite + allowance) * 1_000) / rate));
    assert.ok(sceneCall < sceneRetryCall && sceneRetryCall < suiteCall && suiteCall < suiteRetryCall, 'a bigger answer needs more time');
    assert.strictEqual(suiteRetryCall, largestCall, 'the suite retry is the largest answer the provider accepts');
    // deploy #3 (production): the scene used up to 2,879 tokens; the suite 8,980 (6,033 thinking), cut twice at 9,536
    for (const [label, budget, used, factor] of [
      ['scene', budgets.scene, 2_879, 2], ['scene retry', budgets.sceneRetry, 2_879, 2.8],
      ['suite', budgets.suite, 8_980, 1.35], ['suite retry', budgets.suiteRetry, 8_980, 1.8],
    ]) {
      assert.ok(budget + allowance >= used * factor, `${label}: max_tokens ${budget + allowance} has room over the ${used} tokens seen`);
    }
    // the per-call cap holds the largest call and stays under Node fetch's 300 s headers timeout (a non-streaming
    // answer only sends headers when complete)
    assert.ok(providerTimeoutMs({}) >= largestCall, 'every call that may start can finish inside its own timeout');
    assert.ok(providerTimeoutMs({}) < 300_000, 'under undici\'s 300 s headers timeout');
    assert.strictEqual(providerTimeoutMs({ CELESTE_TEXT_PROVIDER_TIMEOUT_MS: '999999' }), providerTimeoutMs({}), 'the env only lowers it');
    assert.strictEqual(providerTimeoutMs({ CELESTE_TEXT_PROVIDER_TIMEOUT_MS: '1000' }), 1_000);

    const deadline = sceneEndpoint._internals.generationDeadlineMs();
    assert.strictEqual(defaultSessionDeadlineMs(), deadline, 'a session without a deadline gets the same one');
    assert.ok(
      deadline >= 10_000 + Math.max(sceneCall + sceneRetryCall, suiteCall + suiteRetryCall),
      'identity + quota, then each part\'s answer and its truncation retry (in parallel), fit the deadline'
    );

    const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const maxDurationMs = vercel.functions['api/gerar-cena.js'].maxDuration * 1_000;
    assert.ok(maxDurationMs >= deadline + 20_000, 'the function outlives the deadline, so its clean error always gets out');
    assert.ok(maxDurationMs <= 800_000, 'inside the Pro + Fluid compute maximum (800 s)');

    const client = loadExpoModule('services/generatePersonalizedScene.js');
    assert.ok(client.API_TIMEOUT_MS > maxDurationMs, 'the app waits longer than the function can live');
    const delays = [];
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (callback, ms, ...args) => {
      delays.push(ms);
      return realSetTimeout(callback, ms, ...args);
    };
    try {
      await client.generatePersonalizedScene({
        desire: 'construir uma vida criativa e tranquila',
        category: 'Career',
        lang: 'pt',
        profile: validBody().profile,
        fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ scene: validScene(), generation: {} }) }),
      });
    } finally {
      global.setTimeout = realSetTimeout;
    }
    assert.ok(delays.includes(client.API_TIMEOUT_MS), 'the app aborts its request after API_TIMEOUT_MS, not sooner');
  });

  await t.test('a call starts only when it can finish before the deadline (no tokens for a certain timeout)', async () => {
    configureBoth();
    process.env.CELESTE_TEXT_FALLBACK = 'none';
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(200, anthropicPayload());
    };
    const needed = provider._internals.minimumCallMs(SPEC);
    const now = 1_000_000;
    const short = provider.createSession({ deadlineAt: now + needed - 1, clock: () => now });
    await assert.rejects(short.generate(SPEC), (error) => error.code === 'text_provider_timeout');
    assert.strictEqual(calls, 0, 'nothing is sent when the answer cannot finish in time');
    assert.strictEqual(short.remainingCalls(), 2, 'a call that was not sent is not counted');
    const enough = provider.createSession({ deadlineAt: now + needed, clock: () => now });
    await enough.generate(SPEC);
    assert.strictEqual(calls, 1);

    // fix round 1: an env that lowers the per-call cap below what the answer needs sends nothing, even with a long
    // deadline (the suite needs 110.6 s; a 30 s cap would pay for an answer the timer cuts)
    calls = 0;
    process.env.CELESTE_TEXT_PROVIDER_TIMEOUT_MS = '30000';
    const suiteSpec = { ...SPEC, operation: 'journey_suite', maxOutputTokens: 4_800 };
    const capped = provider.createSession({ deadlineAt: now + 240_000, clock: () => now });
    await assert.rejects(capped.generate(suiteSpec), (error) => error.code === 'text_provider_timeout');
    assert.strictEqual(calls, 0, 'a 30 s cap never sends a suite call that needs 110.6 s');
    delete process.env.CELESTE_TEXT_PROVIDER_TIMEOUT_MS;
    await provider.createSession({ deadlineAt: now + 240_000, clock: () => now }).generate(suiteSpec);
    assert.strictEqual(calls, 1, 'with the default cap the same call goes out');
  });

  await t.test('scene + 6+6 suite: two calls in parallel, merged in order, the suite prompt on its own', async () => {
    configureSceneRoute();
    const suite = validSuite();
    const arrivals = [];
    let bothInFlight;
    const barrier = new Promise((resolve) => { bothInFlight = resolve; });
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      const kind = isSuiteCall(body) ? 'suite' : 'scene';
      arrivals.push({ kind, body });
      if (arrivals.length === 2) bothInFlight();
      // no answer leaves before BOTH calls are out: one call after the other never gets past this line
      await Promise.race([
        barrier,
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('calls_not_parallel')), 2_000)),
      ]);
      // the suite answers first: the merge does not depend on which answer arrives first
      if (kind === 'scene') await new Promise((resolve) => setTimeout(resolve, 20));
      return response(200, kind === 'suite' ? anthropicSuitePayload(suite) : anthropicScenePayload());
    };
    const res = await invokeScene(suiteBody());
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(arrivals.map((call) => call.kind).sort(), ['scene', 'suite']);
    assert.strictEqual(res.body.generation.source, 'celeste-ai');
    assert.strictEqual(res.body.generation.provider, 'anthropic');
    assert.strictEqual(res.body.generation.promptVersion, 'celeste-journey-suite-v5');
    assert.strictEqual(res.body.scene.story, validScene().story, 'the scene comes from the scene call');
    const { visions, affirmations } = res.body.journeySuite;
    assert.deepStrictEqual(visions.map((item) => item.category), JOURNEY_CATEGORIES, 'six visions, in area order');
    assert.deepStrictEqual(affirmations.map((item) => item.category), JOURNEY_CATEGORIES, 'six affirmations, in area order');
    assert.deepStrictEqual(visions.map((item) => item.story), suite.visions.map((item) => item.story));
    assert.deepStrictEqual(affirmations.map((item) => item.text), suite.affirmations.map((item) => item.text));
    assert.strictEqual(new Set([...visions, ...affirmations].map((item) => item.visualBrief)).size, 12, 'twelve different briefs');

    const scenePrompt = arrivals.find((call) => call.kind === 'scene').body;
    const suitePrompt = arrivals.find((call) => call.kind === 'suite').body;
    assert.match(scenePrompt.system[0].text, /^You write one personalized Celeste Anchor Scene/);
    assert.doesNotMatch(scenePrompt.system[0].text, /Scene hints for this person|exactly six visions/, 'the scene call writes only the scene');
    assert.strictEqual(scenePrompt.max_tokens, sceneEndpoint._internals.providerBudgets().scene + 1_536);
    assert.match(suitePrompt.system[0].text, /^You write the personalized Celeste journey suite/);
    for (const rule of [
      /Scene hints for this person/,
      /Never begin two visions/,
      /at most three of the six affirmations/,
      /natural spoken language/,
      // fix round 1: alone, the suite still gets the scene's two affirmation guides
      /values-based reflection, not a magical positive statement/,
      /never state that an unachieved outcome already exists/,
    ]) {
      assert.match(suitePrompt.system[0].text, rule, `the suite keeps its variety rules: ${rule}`);
    }
    assert.doesNotMatch(suitePrompt.system[0].text, /Required contract:|anchorStep|affirmationFieldsUsed/, 'no scene contract in the suite call');
    assert.strictEqual(suitePrompt.max_tokens, sceneEndpoint._internals.providerBudgets().suite + 1_536);
    assert.strictEqual(JSON.parse(suitePrompt.messages[0].content[0].text).task, 'create_journey_suite');
  });

  await t.test('a refused suite is repaired alone; refused twice, the request fails whole', async () => {
    configureSceneRoute();
    const suite = validSuite();
    const fiveVisions = { ...suite, visions: suite.visions.slice(0, 5) };
    for (const [label, answers, expected] of [
      ['repaired', [fiveVisions, suite], { status: 200, suiteCalls: 2 }],
      ['refused twice', [fiveVisions, fiveVisions], { status: 502, suiteCalls: 2 }],
    ]) {
      const calls = [];
      global.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        const kind = isSuiteCall(body) ? 'suite' : 'scene';
        calls.push({ kind, system: body.system[0].text });
        if (kind === 'scene') return response(200, anthropicScenePayload());
        return response(200, anthropicSuitePayload(answers[calls.filter((call) => call.kind === 'suite').length - 1]));
      };
      const res = await invokeScene(suiteBody());
      const suiteCalls = calls.filter((call) => call.kind === 'suite');
      assert.strictEqual(res.statusCode, expected.status, `${label}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(calls.filter((call) => call.kind === 'scene').length, 1, `${label}: the valid scene is not written again`);
      assert.strictEqual(suiteCalls.length, expected.suiteCalls, label);
      assert.doesNotMatch(suiteCalls[0].system, /QUALITY REPAIR FOR THIS RETRY/);
      assert.match(suiteCalls[1].system, /QUALITY REPAIR FOR THIS RETRY/, `${label}: the second suite call carries the repair`);
      if (expected.status === 200) {
        assert.strictEqual(res.body.journeySuite.visions.length, 6);
      } else {
        assert.deepStrictEqual(res.body, { error: 'invalid_generation' }, 'no scene without its suite, no partial suite');
      }
    }

    // fix round 1: the suite's own repair speaks of the visions and affirmations, not of a scene or of journeySuite
    const sameOpening = {
      ...suite,
      affirmations: suite.affirmations.map((item, index) => (index === 1
        ? { ...item, text: `${suite.affirmations[0].text.split(' ').slice(0, 3).join(' ')} ${item.text.split(' ').slice(3).join(' ')}` }
        : item)),
    };
    const calls = [];
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (!isSuiteCall(body)) return response(200, anthropicScenePayload());
      calls.push(body.system[0].text);
      return response(200, anthropicSuitePayload(calls.length === 1 ? sameOpening : suite));
    };
    const repaired = await invokeScene(suiteBody());
    assert.strictEqual(repaired.statusCode, 200, JSON.stringify(repaired.body));
    const repair = calls[1].slice(calls[1].indexOf('QUALITY REPAIR FOR THIS RETRY:'));
    assert.match(repair, /Rewrite the six visions and six affirmations in Brazilian Portuguese\./);
    assert.match(repair, /\[journey_repeated_openings\] Rewrite the visions and affirmations so that/);
    assert.doesNotMatch(repair, /Celeste scene|journeySuite/, 'no scene wording in the suite repair');
  });

  await t.test('one part failing stops the other and fails the request cleanly', async () => {
    configureSceneRoute();
    process.env.CELESTE_TEXT_FALLBACK = 'none';
    let suiteSignal = null;
    global.fetch = (url, options) => {
      const body = JSON.parse(options.body);
      if (isSuiteCall(body)) {
        suiteSignal = options.signal;
        return hangUntilAborted(options.signal);
      }
      return Promise.resolve(response(200, {
        stop_reason: 'refusal',
        content: [],
        usage: { input_tokens: 20, output_tokens: 1 },
      }));
    };
    let res = await invokeScene(suiteBody());
    assert.strictEqual(res.statusCode, 422);
    assert.deepStrictEqual(res.body, { error: 'generation_blocked' }, 'a refused scene: no suite goes out alone');
    assert.ok(suiteSignal && suiteSignal.aborted, 'the suite call still being written was stopped');

    // a per-call cap (40 ms) too short for the answers: nothing goes out, 504, nothing partial
    configureSceneRoute();
    process.env.CELESTE_TEXT_FALLBACK = 'none';
    process.env.CELESTE_TEXT_PROVIDER_TIMEOUT_MS = '40';
    let sent = 0;
    global.fetch = (url, options) => {
      sent += 1;
      const body = JSON.parse(options.body);
      if (isSuiteCall(body)) return hangUntilAborted(options.signal);
      return Promise.resolve(response(200, anthropicScenePayload()));
    };
    res = await invokeScene(suiteBody());
    delete process.env.CELESTE_TEXT_PROVIDER_TIMEOUT_MS;
    assert.strictEqual(res.statusCode, 504);
    assert.deepStrictEqual(res.body, { error: 'generation_timeout' }, 'no scene goes out without its suite');
    assert.strictEqual(sent, 0, 'no paid call that the 40 ms cap would cut');
  });

  // fix round 1: once the request gave up, no part sends anything more — neither its repair nor a fallback
  await t.test('after one part fails, the other part sends no repair', async () => {
    configureSceneRoute();
    process.env.CELESTE_TEXT_FALLBACK = 'none';
    const suite = validSuite();
    let sceneRefused;
    const refusalSent = new Promise((resolve) => { sceneRefused = resolve; });
    let suiteCalls = 0;
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (!isSuiteCall(body)) {
        sceneRefused();
        return response(200, { stop_reason: 'refusal', content: [], usage: { input_tokens: 20, output_tokens: 1 } });
      }
      suiteCalls += 1;
      // the invalid suite answer lands right as the scene is refused: its repair must not go out
      await refusalSent;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return response(200, anthropicSuitePayload({ ...suite, visions: suite.visions.slice(0, 5) }));
    };
    const res = await invokeScene(suiteBody());
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(res.statusCode, 422);
    assert.deepStrictEqual(res.body, { error: 'generation_blocked' });
    assert.strictEqual(suiteCalls, 1, 'the invalid suite is not repaired after the request was refused');
  });

  await t.test('an aborted part never falls back to the other provider, and is logged as cancelled', async () => {
    configureSceneRoute(); // Anthropic primary with OpenAI as the operational fallback
    assert.strictEqual(process.env.CELESTE_TEXT_FALLBACK, 'openai');
    process.env.CELESTE_TEXT_LOG_USAGE = '1';
    const urls = [];
    global.fetch = (url, options) => {
      urls.push(String(url));
      const body = JSON.parse(options.body);
      if (isSuiteCall(body)) return hangUntilAborted(options.signal);
      return Promise.resolve(response(200, { stop_reason: 'refusal', content: [], usage: { input_tokens: 20, output_tokens: 1 } }));
    };
    const lines = [];
    const realInfo = console.info;
    console.info = (line) => lines.push(String(line));
    let res;
    try {
      res = await invokeScene(suiteBody());
      await new Promise((resolve) => setTimeout(resolve, 50));
    } finally {
      console.info = realInfo;
      delete process.env.CELESTE_TEXT_LOG_USAGE;
    }
    assert.strictEqual(res.statusCode, 422);
    assert.ok(urls.every((url) => /api\.anthropic\.com/.test(url)), `no OpenAI call: ${urls.join(', ')}`);
    assert.strictEqual(urls.length, 2, 'the scene and the suite, once each');
    const suiteFailure = lines.map((line) => JSON.parse(line)).find((event) => event.operation === 'journey_suite');
    assert.ok(suiteFailure, 'the stopped suite call is logged');
    assert.strictEqual(suiteFailure.event, 'celeste_text_failure');
    assert.strictEqual(suiteFailure.code, 'text_provider_cancelled', 'a call the request stopped is not a timeout');

    // a signal that is already aborted never fires 'abort': the call itself starts aborted (a real fetch then sends nothing)
    const stopped = new AbortController();
    stopped.abort();
    const seen = [];
    global.fetch = (url, options) => {
      seen.push(options.signal.aborted);
      return options.signal.aborted
        ? Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        : Promise.resolve(response(200, anthropicPayload()));
    };
    const config = { name: 'anthropic', key: 'k', model: 'claude-sonnet-5', effort: 'medium' };
    await assert.rejects(
      provider._internals.fetchProvider(config, SPEC, 60_000, stopped.signal),
      (error) => error.code === 'text_provider_cancelled'
    );
    assert.deepStrictEqual(seen, [true], 'the call went out already aborted');
  });

  await t.test('a suite repair that cannot finish before the deadline is never started', async () => {
    const suite = validSuite();
    const suiteCall = provider._internals.minimumCallMs({ maxOutputTokens: sceneEndpoint._internals.providerBudgets().suite });
    const deadline = sceneEndpoint._internals.generationDeadlineMs();
    for (const [label, leftAfterFirstAnswer, expected] of [
      ['too little time for the repair', suiteCall - 1, { status: 504, suiteCalls: 1 }],
      ['time for the repair', suiteCall + 1_000, { status: 200, suiteCalls: 2 }],
    ]) {
      configureSceneRoute();
      process.env.CELESTE_TEXT_FALLBACK = 'none';
      const start = 50_000;
      let now = start;
      sceneEndpoint._internals.setGenerationClockForTests(() => now);
      let suiteCalls = 0;
      global.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        if (!isSuiteCall(body)) return response(200, anthropicScenePayload());
        suiteCalls += 1;
        if (suiteCalls > 1) return response(200, anthropicSuitePayload(suite));
        now = start + deadline - leftAfterFirstAnswer; // a slow first answer, and an invalid one
        return response(200, anthropicSuitePayload({ ...suite, visions: suite.visions.slice(0, 5) }));
      };
      const res = await invokeScene(suiteBody());
      assert.strictEqual(res.statusCode, expected.status, `${label}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(suiteCalls, expected.suiteCalls, label);
      if (expected.status === 504) assert.deepStrictEqual(res.body, { error: 'generation_timeout' });
    }
  });

  // 22/10 deploy smoke (c7a67af), both attempts: scene call 1 -> max_tokens; scene call 2 -> an answer the validator
  // refused (logged as a provider success) -> the suite, still being written, cancelled at that very moment -> 502.
  // Replayed: the truncation retry used the part's only second call, so the refusal was final and stopped the suite.
  await t.test('replay of the 22/10 smoke: a cut scene answer is retried, then repaired, and the suite is never cancelled', async () => {
    const suite = validSuite();
    const noIfThenStep = validScene({ anchorStep: 'Dedicar dez minutos ao projeto mais concreto hoje.' });
    for (const [label, sceneAnswers, expected] of [
      ['cut, then a valid answer', ['cut', validScene()], { status: 200, sceneCalls: 2 }],
      ['cut, refused (no if-then step on her obstacle), then repaired', ['cut', noIfThenStep, validScene()], { status: 200, sceneCalls: 3 }],
      ['cut, refused, refused again: the part stops at three calls', ['cut', noIfThenStep, noIfThenStep, validScene()], { status: 502, sceneCalls: 3 }],
    ]) {
      configureSceneRoute();
      process.env.CELESTE_TEXT_FALLBACK = 'none';
      process.env.CELESTE_TEXT_LOG_USAGE = '1';
      const sceneCalls = [];
      let suiteSignal = null;
      let suiteAnswered = false;
      global.fetch = (url, options) => {
        const body = JSON.parse(options.body);
        if (isSuiteCall(body)) {
          suiteSignal = options.signal;
          // the suite answers only after the scene part is done (production: it was still writing at 52-54 s)
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              suiteAnswered = true;
              resolve(response(200, anthropicSuitePayload(suite)));
            }, 80);
            options.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            });
          });
        }
        sceneCalls.push(body);
        const answer = sceneAnswers[sceneCalls.length - 1];
        return Promise.resolve(response(200, answer === 'cut'
          ? anthropicScenePayload(validScene(), { stop_reason: 'max_tokens', content: [] })
          : anthropicScenePayload(answer)));
      };
      const lines = [];
      const realInfo = console.info;
      console.info = (line) => lines.push(JSON.parse(String(line)));
      let res;
      try {
        res = await invokeScene(suiteBody());
      } finally {
        console.info = realInfo;
        delete process.env.CELESTE_TEXT_LOG_USAGE;
      }
      assert.strictEqual(res.statusCode, expected.status, `${label}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(sceneCalls.length, expected.sceneCalls, `${label}: scene calls`);
      assert.ok(sceneCalls[1].max_tokens > sceneCalls[0].max_tokens, `${label}: the retry after a cut gets more room`);
      assert.doesNotMatch(sceneCalls[1].system[0].text, /concisely/, 'the retry never asks to shorten what the validator needs');
      assert.match(sceneCalls[1].system[0].text, /keep your private reasoning brief/);
      if (expected.status === 200) {
        assert.ok(suiteAnswered && !suiteSignal.aborted, `${label}: the suite was never cancelled`);
        assert.strictEqual(res.body.journeySuite.visions.length, 6);
      } else {
        assert.deepStrictEqual(res.body, { error: 'invalid_generation' }, 'no scene and no partial suite');
      }
      const refusals = lines.filter((event) => event.code === 'invalid_generation');
      if (sceneCalls.length === 3) {
        assert.strictEqual(refusals[0].operation, 'scene');
        assert.strictEqual(refusals[0].reason, 'scene:anchor_step_if_then', 'the log names the rule that refused the answer');
        const repair = sceneCalls[2].system[0].text;
        assert.match(repair, /QUALITY REPAIR FOR THIS RETRY:[\s\S]*keep your private reasoning brief[\s\S]*failed the check "scene:anchor_step_if_then"/);
      } else {
        assert.deepStrictEqual(refusals, [], 'a valid retry is never refused');
      }
    }
  });

  await t.test('a part that succeeds never cancels the other one', async () => {
    configureSceneRoute();
    process.env.CELESTE_TEXT_FALLBACK = 'none';
    const suite = validSuite();
    let suiteSignal = null;
    global.fetch = (url, options) => {
      const body = JSON.parse(options.body);
      if (!isSuiteCall(body)) return Promise.resolve(response(200, anthropicScenePayload()));
      suiteSignal = options.signal;
      return new Promise((resolve) => setTimeout(() => resolve(response(200, anthropicSuitePayload(suite))), 60));
    };
    const res = await invokeScene(suiteBody());
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(suiteSignal.aborted, false, 'the slower suite was left to finish');
  });

  // deploy #3 (production): the suite's first call was cut at 9,536 and its retry fit with 8,980 tokens (6,033 of them
  // thinking). Replayed with the new budgets: a cut first suite answer is retried with the largest budget, and every
  // call's log line tells the margin (max_tokens sent, why it stopped, the effort used).
  await t.test('replay of deploy #3: a cut suite is retried with 16,384 tokens and the logs show the margin', async () => {
    configureSceneRoute();
    process.env.CELESTE_TEXT_FALLBACK = 'none';
    process.env.CELESTE_TEXT_LOG_USAGE = '1';
    const suite = validSuite();
    const suiteCalls = [];
    let sceneMaxTokens = 0;
    global.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (!isSuiteCall(body)) {
        sceneMaxTokens = body.max_tokens;
        return response(200, anthropicScenePayload());
      }
      suiteCalls.push(body.max_tokens);
      return response(200, suiteCalls.length === 1
        ? { stop_reason: 'max_tokens', content: [], usage: { input_tokens: 10, output_tokens: body.max_tokens } }
        : { ...anthropicSuitePayload(suite), usage: { input_tokens: 10, output_tokens: 8_980, output_tokens_details: { thinking_tokens: 6_033 } } });
    };
    const lines = [];
    const realInfo = console.info;
    console.info = (line) => lines.push(JSON.parse(String(line)));
    let res;
    try {
      res = await invokeScene(suiteBody());
    } finally {
      console.info = realInfo;
      delete process.env.CELESTE_TEXT_LOG_USAGE;
    }
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(suiteCalls, [12_288, 16_384], 'suite: 12,288 first, 16,384 after a cut');
    assert.strictEqual(sceneMaxTokens, 6_036);
    const suiteEvents = lines.filter((event) => event.operation === 'journey_suite');
    assert.deepStrictEqual(
      suiteEvents.map((event) => [event.event, event.code, event.maxTokens, event.stopReason, event.effort]),
      [
        ['celeste_text_failure', 'text_provider_truncated', 12_288, 'max_tokens', 'medium'],
        ['celeste_text_success', '', 16_384, 'end_turn', 'medium'],
      ]
    );
    assert.strictEqual(suiteEvents[1].usage.reasoningTokens, 6_033, 'the thinking share is in the log');
    assert.ok(lines.every((event) => !JSON.stringify(event).includes('anthropic-test-key')), 'no key in any log line');
  });

  await t.test('CELESTE_SUITE_TEXT_EFFORT changes only the suite\'s effort, never the model; unset keeps today\'s', async () => {
    for (const [label, value, expectedSuiteEffort] of [
      ['unset', undefined, 'medium'],
      ['low for the suite', 'low', 'low'],
      ['HIGH (case-insensitive)', 'HIGH', 'high'],
      ['invalid value', 'turbo', 'medium'],
    ]) {
      configureSceneRoute();
      process.env.CELESTE_TEXT_FALLBACK = 'none';
      if (value === undefined) delete process.env.CELESTE_SUITE_TEXT_EFFORT;
      else process.env.CELESTE_SUITE_TEXT_EFFORT = value;
      const sent = {};
      const suite = validSuite();
      global.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        const kind = isSuiteCall(body) ? 'suite' : 'scene';
        sent[kind] = { effort: body.output_config.effort, model: body.model };
        return response(200, kind === 'suite' ? anthropicSuitePayload(suite) : anthropicScenePayload());
      };
      const res = await invokeScene(suiteBody());
      delete process.env.CELESTE_SUITE_TEXT_EFFORT;
      assert.strictEqual(res.statusCode, 200, `${label}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(sent.scene.effort, 'medium', `${label}: the scene keeps ANTHROPIC_TEXT_EFFORT`);
      assert.strictEqual(sent.suite.effort, expectedSuiteEffort, `${label}: suite effort`);
      assert.strictEqual(sent.suite.model, sent.scene.model, `${label}: same model for both parts`);
    }
  });

  // deploy #4 (production smoke, the deploy's own profile): the scene was refused twice per attempt because a receipt
  // field was paraphrased instead of echoed (2 words of the answer required). Attempt 1: storyFieldsUsed:partnerDesire,
  // then affirmationFieldsUsed:aboutYou; attempt 2: storyFieldsUsed:aboutYou, then storyFieldsUsed:location -> 502.
  const claraBody = () => ({
    desire: 'ter uma rotina mais calma e tempo para minha familia',
    category: 'Peace',
    lang: 'pt',
    profile: {
      name: 'Clara',
      city: 'Belo Horizonte',
      work: 'professora',
      whyMatters: 'estar presente com minha familia',
      obstacle: 'tempo ou energia',
      aboutYou: 'organizada, carinhosa e um pouco ansiosa',
      dreamHome: 'Cozy Cottage',
      partnerDesire: 'companheirismo e amizade',
      cloudPersonalization: true,
      cloudAdultConfirmed: true,
      cloudConsentVersion: CLOUD_CONSENT_VERSION,
    },
    cloudConsent: true,
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    adultConfirmed: true,
    includeJourneySuite: true,
  });
  const claraScene = (overrides = {}) => ({
    intention: 'Viver dias mais calmos, com tempo de verdade para quem eu amo.',
    affirmation: 'Eu escolho uma rotina mais calma para estar presente com a minha familia todos os dias.',
    story: 'O sinal da ultima aula toca e voce, professora, junta os cadernos sem pressa. Em Belo Horizonte o fim de tarde chega dourado pela janela da sala. A rotina mais calma que voce quer aparece num gesto pequeno: voce deixa o celular na bolsa e pensa no jantar com a familia. Ao seu lado, alguem que divide a vida com voce como um bom amigo pergunta como foi o dia, e voce responde inteira. O cansaco ainda pode voltar amanha, e tudo bem; hoje voce escolhe estar presente.',
    anchorIdentity: 'Eu protejo o meu tempo para estar presente com quem importa.',
    anchorStep: 'Quando eu sentir que o cansaco apertou, entao vou respirar por dois minutos antes de abrir as mensagens.',
    affirmationFieldsUsed: ['desire', 'whyMatters'],
    storyFieldsUsed: ['desire', 'work', 'location', 'partnerDesire', 'whyMatters'],
    ...overrides,
  });

  await t.test('replay of deploy #4: paraphrased receipts are accepted (both logged attempts now 200 on the first call)', async () => {
    const suite = createPersonalContentSuite({ desire: claraBody().desire, profile: claraBody().profile, lang: 'pt', category: 'Peace' });
    // each answer is one that master 81b0e84 refused with exactly the logged reason (the old rule, kept here as
    // fieldIsGrounded, finds fewer than two of her words), and the new rule only notes
    const attempts = [
      // attempt 1: the partner wish as "alguem que divide a vida como um bom amigo"; the repair paraphrased aboutYou
      ['attempt 1', ['storyFieldsUsed', 'partnerDesire'], ['affirmationFieldsUsed', 'aboutYou'], [claraScene(), claraScene({
        affirmation: 'Eu escolho uma rotina mais calma e tempo para minha familia, com o cuidado sereno que me define.',
        affirmationFieldsUsed: ['desire', 'aboutYou'],
      })]],
      // attempt 2: herself as "atenta e afetuosa"; the repair named her city as "a capital mineira"
      ['attempt 2', ['storyFieldsUsed', 'aboutYou'], ['storyFieldsUsed', 'location'], [
        claraScene({ storyFieldsUsed: ['desire', 'work', 'aboutYou'], story: claraScene().story.replace('Ao seu lado,', 'Atenta e afetuosa como sempre, voce sorri; ao seu lado,') }),
        claraScene({ storyFieldsUsed: ['desire', 'work', 'location'], story: claraScene().story.replace('Em Belo Horizonte', 'Na capital mineira') }),
      ]],
    ];
    const replayInput = sceneEndpoint._internals.validateInput(claraBody()).value;
    for (const [label, firstRefusal, repairRefusal, answers] of attempts) {
      for (const [[property, field], answer] of [[firstRefusal, answers[0]], [repairRefusal, answers[1]]]) {
        const text = property === 'storyFieldsUsed' ? answer.story : answer.affirmation;
        assert.strictEqual(sceneEndpoint._internals.fieldIsGrounded(field, text, replayInput), false, `${label}: ${property}:${field} was not echoed`);
      }
    }
    for (const [label, firstRefusal, , answers] of attempts) {
      configureSceneRoute();
      process.env.CELESTE_TEXT_FALLBACK = 'none';
      process.env.CELESTE_TEXT_LOG_USAGE = '1';
      let sceneCalls = 0;
      global.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        if (isSuiteCall(body)) return response(200, anthropicSuitePayload(suite));
        sceneCalls += 1;
        return response(200, anthropicScenePayload(answers[Math.min(sceneCalls, answers.length) - 1]));
      };
      const lines = [];
      const realInfo = console.info;
      console.info = (line) => lines.push(JSON.parse(String(line)));
      let res;
      try {
        res = await invokeScene(claraBody());
      } finally {
        console.info = realInfo;
        delete process.env.CELESTE_TEXT_LOG_USAGE;
      }
      assert.strictEqual(res.statusCode, 200, `${label}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(sceneCalls, 1, `${label}: the first answer is served, no repair`);
      assert.deepStrictEqual(lines.filter((event) => event.code === 'invalid_generation'), [], `${label}: nothing refused`);
      const notes = lines.filter((event) => event.event === 'celeste_text_note').map((event) => event.reason);
      assert.ok(notes.includes(`receipt_unverified:${firstRefusal.join(':')}`), `${label}: the paraphrase is noted (${notes.join(', ')})`);
      assert.ok(res.body.scene.personalizedWith.length >= 2, `${label}: the receipt still lists what she shared`);
    }
    // the repairs of both attempts pass the validator too
    for (const [, , , answers] of attempts) {
      for (const answer of answers) assert.doesNotThrow(() => sceneEndpoint._internals.validateGeneratedScene(answer, replayInput));
    }
  });

  await t.test('receipts stay truthful: an unanswered field or an invented person or place is refused', () => {
    const input = sceneEndpoint._internals.validateInput(claraBody()).value;
    const reasonOf = (scene, value = input) => {
      try {
        sceneEndpoint._internals.validateGeneratedScene(scene, value);
        return 'accepted';
      } catch (error) {
        return error.reason;
      }
    };
    // a field she never answered
    assert.strictEqual(reasonOf(claraScene({ storyFieldsUsed: ['desire', 'pastInfluence'] })), 'scene:storyFieldsUsed:pastInfluence:not_answered');
    assert.strictEqual(reasonOf(claraScene({ affirmationFieldsUsed: ['desire', 'partner'] })), 'scene:affirmationFieldsUsed:unknown_key:not_answered');
    // a place or a person she never mentioned, written as part of her life (case and accents do not matter)
    assert.strictEqual(reasonOf(claraScene({ story: claraScene().story.replace('Em Belo Horizonte', 'No apartamento em Curitiba') })), 'scene:invented_proper_noun');
    assert.strictEqual(reasonOf(claraScene({ story: claraScene().story.replace('alguem que divide', 'o Joaquim, que divide') })), 'scene:invented_proper_noun');
    assert.strictEqual(reasonOf(claraScene({ intention: 'Viver dias calmos com a Júlia e com tempo para quem eu amo.' })), 'scene:invented_proper_noun');
    // her own place, with or without accents, and the app's words are not inventions
    const accented = sceneEndpoint._internals.validateInput({ ...claraBody(), profile: { ...claraBody().profile, city: 'Sao Paulo' } }).value;
    assert.strictEqual(reasonOf(claraScene({ story: claraScene().story.replace('Em Belo Horizonte', 'Em São Paulo') }), accented), 'accepted');
    assert.strictEqual(reasonOf(claraScene({ story: claraScene().story.replace('Em Belo Horizonte', 'Na sua Cena Âncora') })), 'accepted');
    // honesty rules stay strict
    assert.strictEqual(reasonOf(claraScene({ affirmation: 'Eu já sou a pessoa que tem uma rotina calma; isso está vindo na minha direção.' })), 'scene:affirmation_unbelievable');
    assert.strictEqual(reasonOf(claraScene({ story: `${claraScene().story} Isso vai acontecer em 3 meses, garantido.` })), 'scene:unsafe_claim');
    assert.strictEqual(reasonOf(claraScene({ anchorStep: 'Respirar por dois minutos antes de abrir as mensagens.' })), 'scene:anchor_step_if_then');
    // the suite: an invented place in a vision is refused too
    const suite = createPersonalContentSuite({ desire: input.desire, profile: claraBody().profile, lang: 'pt', category: 'Peace' });
    const invented = { ...suite, visions: suite.visions.map((item, index) => (index === 2 ? { ...item, story: `${item.story} Depois, voce caminha pela orla de Copacabana.` } : item)) };
    assert.throws(() => sceneEndpoint._internals.validateGeneratedJourneySuite(invented, input), (error) => error.reason === 'suite:invented_proper_noun');
    assert.doesNotThrow(() => sceneEndpoint._internals.validateGeneratedJourneySuite(suite, input));
  });
});
