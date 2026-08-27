const assert = require('node:assert');
const test = require('node:test');

const provider = require('../api/_text-provider');
const sceneEndpoint = require('../api/gerar-cena');

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
    },
    cloudConsent: true,
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

async function invokeScene() {
  const res = routeResponse();
  await sceneEndpoint(routeRequest(), res);
  return res;
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
    const session = provider.createSession({ deadlineAt: Date.now() + 20_000 });
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
    const session = provider.createSession({ deadlineAt: Date.now() + 20_000 });
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
      const session = provider.createSession({ deadlineAt: Date.now() + 20_000 });
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
    const session = provider.createSession({ deadlineAt: Date.now() + 20_000 });
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
});
