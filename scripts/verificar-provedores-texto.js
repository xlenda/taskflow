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
    const sceneCall = minimumCallMs({ maxOutputTokens: 1_800 });
    const suiteCall = minimumCallMs({ maxOutputTokens: 4_800 });
    const largestCall = minimumCallMs({ maxOutputTokens: 6_000 });
    // connection + first token, then max_tokens (output + 1,536) at 60 tokens/s
    assert.strictEqual(suiteCall, 5_000 + Math.ceil(((4_800 + 1_536) * 1_000) / 60));
    assert.ok(sceneCall < suiteCall && suiteCall < largestCall, 'a bigger answer needs more time');
    assert.ok(providerTimeoutMs({}) >= largestCall, 'every call that may start can finish inside its own timeout');
    assert.strictEqual(providerTimeoutMs({ CELESTE_TEXT_PROVIDER_TIMEOUT_MS: '999999' }), providerTimeoutMs({}), 'the env only lowers it');
    assert.strictEqual(providerTimeoutMs({ CELESTE_TEXT_PROVIDER_TIMEOUT_MS: '1000' }), 1_000);

    const deadline = sceneEndpoint._internals.generationDeadlineMs();
    assert.strictEqual(defaultSessionDeadlineMs(), deadline, 'a session without a deadline gets the same one');
    assert.ok(deadline >= 10_000 + 2 * suiteCall, 'identity + quota, the suite and one repair of it fit in the deadline');

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
    assert.strictEqual(res.body.generation.promptVersion, 'celeste-journey-suite-v4');
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
    assert.strictEqual(scenePrompt.max_tokens, 1_800 + 1_536);
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
    assert.strictEqual(suitePrompt.max_tokens, 4_800 + 1_536);
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
  });

  await t.test('a suite repair that cannot finish before the deadline is never started', async () => {
    const suite = validSuite();
    const suiteCall = provider._internals.minimumCallMs({ maxOutputTokens: 4_800 });
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
});
