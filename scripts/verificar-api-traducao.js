const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const test = require('node:test');
const { transformSync } = require('@babel/core');

const endpoint = require('../api/traduzir-cena');
const root = path.join(__dirname, '..');
const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GEMINI_PAID_DATA_TERMS_ACCEPTED',
  'GEMINI_TIMEOUT_MS',
  'CELESTE_ALLOWED_ORIGINS',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;

function loadClientModule() {
  const originalLoader = Module._extensions['.js'];
  Module._extensions['.js'] = function compileProjectModule(mod, filename) {
    if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
      return originalLoader(mod, filename);
    }
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = transformSync(source, {
      filename,
      presets: ['babel-preset-expo'],
      sourceType: 'module',
    }).code;
    mod._compile(compiled, filename);
  };
  try {
    delete require.cache[require.resolve('../services/translateManifestationScene')];
    return require('../services/translateManifestationScene');
  } finally {
    Module._extensions['.js'] = originalLoader;
  }
}

function configure() {
  process.env.GEMINI_API_KEY = 'translation-test-secret';
  process.env.GEMINI_MODEL = 'gemini-3.7-flash';
  process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = '1';
  process.env.CELESTE_ALLOWED_ORIGINS = 'https://celeste.example';
  delete process.env.GEMINI_TIMEOUT_MS;
  endpoint._internals.resetSecurityForTests();
  endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
}

function restore() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
  endpoint._internals.resetSecurityForTests();
}

function sourceScene() {
  return {
    title: 'morar perto do mar',
    intention: 'Viver perto do mar com calma e constancia.',
    affirmation: 'Eu escolho uma vida calma perto do mar, honrando meu jeito criativo.',
    story: 'A caneca azul esta ao lado da janela. Voce sente o cha ainda quente enquanto observa a luz da manha sobre o mar.',
    anchorIdentity: 'Eu protejo minha atencao e abro espaco para o que importa.',
    anchorStep: 'Quando o medo de comecar aparecer, entao vou respirar por dois minutos.',
    personalizedWith: ['onde quer morar', 'como voce se descreve'],
  };
}

function translatedScene(overrides = {}) {
  return {
    title: 'living near the sea',
    intention: 'Live near the sea with calm and consistency.',
    affirmation: 'I choose a calm life near the sea while honoring my creative nature.',
    story: 'The blue mug is beside the window. You feel the tea is still warm while watching the morning light over the sea.',
    anchorIdentity: 'I protect my attention and make room for what matters.',
    anchorStep: 'When fear of starting appears, then I will breathe for two minutes.',
    personalizedWith: ['where you want to live', 'how you describe yourself'],
    ...overrides,
  };
}

function validBody(overrides = {}) {
  return {
    sourceLang: 'pt',
    targetLang: 'en',
    scene: sourceScene(),
    cloudConsent: true,
    adultConfirmed: true,
    ...overrides,
  };
}

function geminiPayload(scene = translatedScene()) {
  return {
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(scene) }] } }],
  };
}

function request(body, overrides = {}) {
  const { headers: overrideHeaders, ...requestOverrides } = overrides;
  return {
    method: 'POST',
    body,
    headers: {
      origin: 'https://celeste.example',
      'x-is-human': 'unit-test-challenge',
      ...(overrideHeaders || {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
    ...requestOverrides,
  };
}

function requestWithoutOrigin(body, overrides = {}) {
  const req = request(body, overrides);
  delete req.headers.origin;
  return req;
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

async function invoke(req) {
  const res = response();
  await endpoint(req, res);
  return res;
}

test('manifestation translation API contract', async (t) => {
  t.after(restore);

  await t.test('client sends only the saved scene after explicit adult cloud consent', async () => {
    const { translateManifestationScene } = loadClientModule();
    let sent;
    const result = await translateManifestationScene({
      sourceLang: 'pt',
      targetLang: 'en',
      scene: {
        ...sourceScene(),
        story: `${sourceScene().story} Bia conversa comigo e Leo chega depois.`,
        evidence: ['private history'],
        sessions: ['2026-08-25'],
      },
      profile: {
        name: 'Ana',
        people: [{ name: 'Bia' }],
        kids: [{ name: 'Leo' }],
        cloudPersonalization: true,
        cloudAdultConfirmed: true,
        privateAnswer: 'must stay local',
      },
      fetchImpl: async (_url, options) => {
        sent = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            scene: translatedScene(),
            generation: { model: 'test-model', promptVersion: 'celeste-translation-v1', seed: 7 },
          }),
        };
      },
    });
    assert.deepStrictEqual(Object.keys(sent).sort(), [
      'adultConfirmed', 'cloudConsent', 'scene', 'sourceLang', 'targetLang',
    ]);
    assert.strictEqual(sent.scene.evidence, undefined);
    assert.strictEqual(sent.scene.sessions, undefined);
    assert.ok(!JSON.stringify(sent).includes('must stay local'));
    assert.ok(!JSON.stringify(sent).includes('Bia'));
    assert.ok(!JSON.stringify(sent).includes('Leo'));
    assert.match(sent.scene.story, /uma pessoa pr/i);
    assert.match(result.scene.story, /blue mug/i);
    assert.strictEqual(result.generation.source, 'gemini-translation');

    let calls = 0;
    await assert.rejects(
      translateManifestationScene({
        sourceLang: 'pt',
        targetLang: 'en',
        scene: sourceScene(),
        profile: { cloudPersonalization: false, cloudAdultConfirmed: true },
        fetchImpl: async () => { calls += 1; },
      }),
      /cloud_consent_required/
    );
    assert.strictEqual(calls, 0);
  });

  await t.test('server rejects missing consent, minors and invalid language pairs before Gemini', async () => {
    configure();
    let calls = 0;
    global.fetch = async () => { calls += 1; return { ok: true, json: async () => geminiPayload() }; };
    let res = await invoke(request(validBody({ cloudConsent: false })));
    assert.strictEqual(res.statusCode, 403);
    res = await invoke(request(validBody({ adultConfirmed: false })));
    assert.strictEqual(res.statusCode, 403);
    res = await invoke(request(validBody({ targetLang: 'pt' })));
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(calls, 0);
  });

  await t.test('fails closed before Gemini when Origin is absent from POST and OPTIONS', async () => {
    configure();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => geminiPayload() };
    };

    let res = await invoke(requestWithoutOrigin(validBody(), {
      headers: { 'x-forwarded-for': '10.0.0.220' },
    }));
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'origin_not_allowed' });
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
    assert.strictEqual(calls, 0, 'a POST without Origin must never spend a Gemini request');

    res = await invoke(requestWithoutOrigin(undefined, { method: 'OPTIONS' }));
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'origin_not_allowed' });
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
    assert.strictEqual(calls, 0, 'an OPTIONS request without Origin must never reach Gemini');
  });

  await t.test('blocks bots and verification failures before translating with Gemini', async () => {
    configure();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => geminiPayload() };
    };

    endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: false, isBot: true }));
    let res = await invoke(request(validBody()));
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'automated_request_blocked' });

    endpoint._internals.setBotVerifierForTests(async () => { throw new Error('provider unavailable'); });
    res = await invoke(request(validBody()));
    assert.strictEqual(res.statusCode, 503);
    assert.deepStrictEqual(res.body, { error: 'bot_verification_unavailable' });
    assert.strictEqual(calls, 0, 'failed BotID checks must never spend a Gemini translation');
  });

  await t.test('translates the exact scene with deterministic metadata and no cache', async () => {
    configure();
    const seen = [];
    global.fetch = async (url, options) => {
      seen.push({ url, options, body: JSON.parse(options.body) });
      return { ok: true, status: 200, json: async () => geminiPayload() };
    };
    const first = await invoke(request(validBody(), {
      headers: { origin: 'https://celeste.example', 'x-forwarded-for': '10.0.0.20' },
    }));
    const second = await invoke(request(validBody(), {
      headers: { origin: 'https://celeste.example', 'x-forwarded-for': '10.0.0.21' },
    }));
    assert.strictEqual(first.statusCode, 200);
    assert.match(first.body.scene.story, /blue mug/i);
    assert.doesNotMatch(first.body.scene.story, /caneca azul/i);
    assert.strictEqual(first.body.generation.source, 'gemini-translation');
    assert.strictEqual(first.body.generation.promptVersion, 'celeste-translation-v1');
    assert.strictEqual(first.body.generation.seed, second.body.generation.seed);
    assert.strictEqual(first.headers['cache-control'], 'no-store, max-age=0');
    assert.strictEqual(first.headers['access-control-allow-origin'], 'https://celeste.example');

    const sent = seen[0];
    assert.match(sent.url, /gemini-3\.7-flash:generateContent$/);
    assert.ok(sent.options.body.includes('Do not summarize, embellish, omit'));
    assert.strictEqual(sent.body.generationConfig.temperature, 0.1);
    const userJson = JSON.parse(sent.body.contents[0].parts[0].text);
    assert.strictEqual(userJson.task, 'translate_scene');
    assert.match(userJson.scene.story, /caneca azul/i);
    assert.ok(!sent.options.body.includes(process.env.GEMINI_API_KEY));
  });

  await t.test('fails closed without configuration and never returns malformed translation', async () => {
    configure();
    let calls = 0;
    global.fetch = async () => { calls += 1; return { ok: true, json: async () => geminiPayload() }; };
    delete process.env.GEMINI_API_KEY;
    let res = await invoke(request(validBody()));
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.error, 'translation_not_configured');
    assert.strictEqual(calls, 0);

    configure();
    global.fetch = async () => ({
      ok: true,
      json: async () => geminiPayload(translatedScene({ affirmation: 'A translated sentence without first person.' })),
    });
    res = await invoke(request(validBody(), { headers: { 'x-forwarded-for': '10.0.0.22' } }));
    assert.strictEqual(res.statusCode, 502);
    assert.deepStrictEqual(res.body, { error: 'invalid_translation' });
    assert.ok(!JSON.stringify(res.body).includes(sourceScene().story));
  });

  await t.test('times out without exposing the source scene', async () => {
    configure();
    process.env.GEMINI_TIMEOUT_MS = '20';
    global.fetch = (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error(`private: ${sourceScene().story}`);
        error.name = 'AbortError';
        reject(error);
      });
    });
    const res = await invoke(request(validBody(), { headers: { 'x-forwarded-for': '10.0.0.23' } }));
    assert.strictEqual(res.statusCode, 504);
    assert.deepStrictEqual(res.body, { error: 'translation_timeout' });
    assert.ok(!JSON.stringify(res.body).includes('caneca azul'));
  });
});
