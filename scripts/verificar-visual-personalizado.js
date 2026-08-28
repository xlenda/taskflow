const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const endpoint = require('../api/gerar-visual');

const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_PAID_DATA_TERMS_ACCEPTED',
  'GEMINI_IMAGE_TIMEOUT_MS',
  'CELESTE_ALLOWED_ORIGINS',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;
const JPEG_BASE64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');

function loadClientModule(paidHeadersImpl) {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'generatePersonalizedVisual.js'),
    'utf8'
  );
  const executable = source.replace(/\bexport\s+(?=(?:async\s+)?function|const)/g, '');
  const clientRequire = (request) => {
    if (request === './celesteApiSession' && typeof paidHeadersImpl === 'function') {
      return { celestePaidApiHeaders: paidHeadersImpl };
    }
    return require(request);
  };
  return Function(
    'require',
    `${executable}\nreturn { PersonalVisualError, PERSONALIZED_VISUAL_MOODS, minimizeVisualProfile, generatePersonalizedVisual, generatePersonalizedVisualInBackground };`
  )(clientRequire);
}

function restore() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
  endpoint._internals.resetSecurityForTests();
}

function configure() {
  process.env.GEMINI_API_KEY = 'visual-secret-key';
  process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = '1';
  process.env.CELESTE_ALLOWED_ORIGINS = 'https://celeste.example';
  delete process.env.GEMINI_IMAGE_TIMEOUT_MS;
  endpoint._internals.resetSecurityForTests();
  endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
}

function validBody(overrides = {}) {
  return {
    desire: 'morar em uma fazenda tranquila perto da natureza',
    category: 'Peace',
    lang: 'pt',
    visualMood: 'grounded',
    profile: {
      dreamLocation: 'uma fazenda entre montanhas',
      dreamHome: 'cabana de madeira com varanda',
      work: 'escrever livros com calma',
      whyMatters: 'ter liberdade e presenca para uma vida que importa',
    },
    cloudConsent: true,
    adultConfirmed: true,
    ...overrides,
  };
}

function request(body, overrides = {}) {
  const { headers: extraHeaders, ...rest } = overrides;
  return {
    method: 'POST',
    body,
    headers: {
      origin: 'https://celeste.example',
      'x-is-human': 'unit-test-human',
      ...(extraHeaders || {}),
    },
    ...rest,
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

async function invoke(req) {
  const res = response();
  await endpoint(req, res);
  return res;
}

function upstreamImage(overrides = {}) {
  const payload = {
    status: 'completed',
    output_image: {
      mime_type: 'image/jpeg',
      data: JPEG_BASE64,
      ...overrides,
    },
  };
  return {
    ok: true,
    headers: { get: () => null },
    text: async () => JSON.stringify(payload),
  };
}

test('personalized visual is private, bounded, paid, and non-blocking', async (t) => {
  configure();
  t.after(restore);

  await t.test('request uses official Interactions image contract and overlay-safe prompt', () => {
    const input = endpoint._internals.validateInput(validBody()).value;
    const gemini = endpoint._internals.buildGeminiRequest(input);
    assert.strictEqual(gemini.model, 'gemini-3.1-flash-image');
    assert.strictEqual(gemini.store, false);
    assert.deepStrictEqual(gemini.response_format, {
      type: 'image',
      mime_type: 'image/jpeg',
      aspect_ratio: '4:5',
      image_size: '1K',
    });
    assert.ok(Array.isArray(gemini.input));
    const prompt = gemini.input[0].text;
    assert.match(prompt, /editorial lifestyle photograph/i);
    assert.match(prompt, /central 55 percent/i);
    assert.match(prompt, /crisp white affirmation text/i);
    assert.match(prompt, /no people, faces, hands/i);
    assert.match(prompt, /logos, trademarks, watermarks/i);
    assert.match(prompt, /Do not invent a city, landmark, relationship/i);
    assert.match(prompt, /fazenda entre montanhas/i);
    assert.match(prompt, /cabana de madeira/i);
  });

  await t.test('server rejects unknown context and invalid moods before spending', async () => {
    let paidCalls = 0;
    endpoint._internals.setPaidAccessAuthorizerForTests(async () => {
      paidCalls += 1;
      return { ok: true };
    });
    const privateProfile = await invoke(request(validBody({
      profile: { ...validBody().profile, name: 'must-not-leave-device' },
    })));
    assert.strictEqual(privateProfile.statusCode, 400);
    assert.strictEqual(privateProfile.body.error, 'profile_invalid');

    const invalidMood = await invoke(request(validBody({ visualMood: 'expensive-luxury' })));
    assert.strictEqual(invalidMood.statusCode, 400);
    assert.strictEqual(invalidMood.body.error, 'visual_mood_invalid');

    delete process.env.GEMINI_API_KEY;
    const notConfigured = await invoke(request(validBody()));
    assert.strictEqual(notConfigured.statusCode, 503);
    assert.deepStrictEqual(notConfigured.body, {
      error: 'visual_not_configured',
      stage: 'configuration',
    });
    process.env.GEMINI_API_KEY = 'visual-secret-key';
    assert.strictEqual(paidCalls, 0);
  });

  await t.test('browser request uses BotID, paid visual units, and never caches output', async () => {
    const paidCalls = [];
    endpoint._internals.setPaidAccessAuthorizerForTests(async (_req, options) => {
      paidCalls.push(options);
      return { ok: true, userId: '00000000-0000-4000-8000-000000000001' };
    });
    const upstreamCalls = [];
    global.fetch = async (url, options) => {
      upstreamCalls.push({ url, options });
      return upstreamImage();
    };

    const result = await invoke(request(validBody()));
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(result.headers['cache-control'], 'no-store, max-age=0');
    assert.strictEqual(result.headers['cdn-cache-control'], 'no-store');
    assert.strictEqual(result.headers['vercel-cdn-cache-control'], 'no-store');
    assert.deepStrictEqual(paidCalls, [{ operation: 'visual', units: 8 }]);
    assert.strictEqual(upstreamCalls.length, 1);
    assert.strictEqual(
      upstreamCalls[0].url,
      'https://generativelanguage.googleapis.com/v1beta/interactions'
    );
    assert.strictEqual(upstreamCalls[0].options.headers['x-goog-api-key'], 'visual-secret-key');
    const sent = JSON.parse(upstreamCalls[0].options.body);
    assert.strictEqual(sent.model, 'gemini-3.1-flash-image');
    assert.strictEqual(sent.store, false);
    assert.strictEqual(result.body.image.data, JPEG_BASE64);
    assert.strictEqual(result.body.image.mimeType, 'image/jpeg');
    assert.strictEqual(result.body.image.aspectRatio, '4:5');
    assert.strictEqual(result.body.image.imageSize, '1K');
    assert.strictEqual(result.body.overlay.textColor, '#FFFFFF');
    assert.ok(!JSON.stringify(result.body).includes('visual-secret-key'));
  });

  await t.test('origin and BotID fail closed', async () => {
    endpoint._internals.setPaidAccessAuthorizerForTests(async () => ({ ok: true }));
    const foreign = await invoke(request(validBody(), {
      headers: { origin: 'https://attacker.example' },
    }));
    assert.strictEqual(foreign.statusCode, 403);
    assert.strictEqual(foreign.body.error, 'origin_not_allowed');

    endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: false, isBot: true }));
    const bot = await invoke(request(validBody()));
    assert.strictEqual(bot.statusCode, 403);
    assert.strictEqual(bot.body.error, 'automated_request_blocked');
  });

  await t.test('base64 and MIME output are strictly bounded', () => {
    assert.throws(
      () => endpoint._internals.canonicalBase64('A'.repeat(endpoint._internals.MAX_BASE64_CHARS + 1)),
      /invalid_visual/
    );
    assert.throws(
      () => endpoint._internals.extractImage({
        status: 'completed',
        output_image: { mime_type: 'image/png', data: JPEG_BASE64 },
      }),
      /invalid_visual/
    );
    assert.throws(
      () => endpoint._internals.extractImage({
        status: 'completed',
        output_image: { mime_type: 'image/jpeg', data: Buffer.from('not-jpeg').toString('base64') },
      }),
      /invalid_visual/
    );
  });

  await t.test('client sends only the visual allowlist and offers background failure isolation', async () => {
    const client = loadClientModule();
    assert.deepStrictEqual([...client.PERSONALIZED_VISUAL_MOODS], [
      'serene', 'luminous', 'grounded', 'romantic', 'abundant', 'focused',
    ]);
    const requests = [];
    const fetchImpl = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        headers: { get: () => null },
        text: async () => JSON.stringify({
          image: {
            mimeType: 'image/jpeg',
            data: JPEG_BASE64,
            bytes: 4,
            aspectRatio: '4:5',
            imageSize: '1K',
          },
          generation: {},
        }),
      };
    };
    const profile = {
      ...validBody().profile,
      name: 'Ana',
      manifestingName: 'Carlos',
      people: [{ name: 'Bia', privateValue: 'secret-person' }],
      kids: [{ name: 'Leo', privateValue: 'secret-child' }],
      obstacle: 'must-stay-local',
      aboutYou: 'must-stay-local-too',
      cloudPersonalization: true,
      cloudAdultConfirmed: true,
    };
    const visual = await client.generatePersonalizedVisual({
      desire: 'viver em paz com Bia e Leo',
      category: 'Peace',
      lang: 'pt',
      profile,
      visualMood: 'grounded',
      fetchImpl,
    });
    assert.strictEqual(visual.image.data, JPEG_BASE64);
    assert.strictEqual(
      Object.prototype.hasOwnProperty.call(visual.image, 'uri'),
      false,
      'cliente nao deve duplicar a imagem em uma data URI gigante na memoria'
    );
    assert.strictEqual(requests.length, 1);
    assert.deepStrictEqual(Object.keys(requests[0]).sort(), [
      'adultConfirmed',
      'category',
      'cloudConsent',
      'desire',
      'lang',
      'profile',
      'visualMood',
    ]);
    assert.deepStrictEqual(Object.keys(requests[0].profile).sort(), [
      'dreamHome', 'dreamLocation', 'whyMatters', 'work',
    ]);
    const serialized = JSON.stringify(requests[0]);
    for (const privateValue of [
      'Bia', 'Leo', 'Carlos', 'secret-person', 'secret-child',
      'must-stay-local', 'must-stay-local-too',
    ]) {
      assert.ok(!serialized.includes(privateValue), `${privateValue} left the device`);
    }

    let backgroundError;
    const background = await client.generatePersonalizedVisualInBackground({
      desire: 'uma casa perto do mar',
      category: 'Peace',
      lang: 'pt',
      profile,
      visualMood: 'serene',
      fetchImpl: async () => { throw new Error('offline'); },
    }, {
      onError: (error) => { backgroundError = error; },
    });
    assert.strictEqual(background, null);
    assert.strictEqual(backgroundError.code, 'personalized_visual_network_error');
    assert.strictEqual(backgroundError.stage, 'network');

    await assert.rejects(
      () => client.generatePersonalizedVisual({
        desire: 'uma casa perto do mar',
        category: 'Peace',
        lang: 'pt',
        profile,
        visualMood: 'serene',
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          text: async () => JSON.stringify({
            error: 'daily_generation_limit_reached',
            stage: 'access',
          }),
        }),
      }),
      (error) =>
        error instanceof client.PersonalVisualError &&
        error.code === 'daily_generation_limit_reached' &&
        error.stage === 'access' &&
        error.status === 429
    );
  });

  await t.test('client timeout also covers a stalled paid session', async () => {
    let authorizationSignal;
    let resolveAuthorization;
    let fetchCalls = 0;
    const client = loadClientModule(({ signal } = {}) => {
      authorizationSignal = signal;
      return new Promise((resolve) => {
        resolveAuthorization = resolve;
      });
    });
    global.fetch = async () => {
      fetchCalls += 1;
      return upstreamImage();
    };
    const startedAt = Date.now();
    await assert.rejects(
      () => client.generatePersonalizedVisual({
        desire: 'uma casa perto do mar',
        category: 'Peace',
        lang: 'pt',
        profile: {
          ...validBody().profile,
          cloudPersonalization: true,
          cloudAdultConfirmed: true,
        },
        visualMood: 'serene',
        timeoutMs: 20,
      }),
      /personalized_visual_timeout/
    );
    assert.ok(Date.now() - startedAt < 1000, 'sessao travada nao pode manter a imagem carregando');
    assert.strictEqual(authorizationSignal?.aborted, true);
    resolveAuthorization({ Authorization: 'Bearer late-test-token' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(fetchCalls, 0, 'autenticacao tardia nao pode iniciar uma geracao paga');
  });

  await t.test('app repairs missing assets with one coordinated request and visible retry', () => {
    const context = fs.readFileSync(
      path.join(__dirname, '..', 'context', 'AppContext.js'),
      'utf8'
    );
    const affirmations = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'AffirmationsScreen.js'),
      'utf8'
    );
    const affirmationCard = fs.readFileSync(
      path.join(__dirname, '..', 'components', 'AffirmationCard.js'),
      'utf8'
    );
    const reveal = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'onboarding', 'RevealScreen.js'),
      'utf8'
    );

    assert.match(context, /const ensurePersonalVisual = useCallback/);
    assert.match(context, /personalVisualRequestsRef = useRef\(new Map\(\)\)/);
    assert.match(context, /if \(running\)[\s\S]*return running\.promise/);
    assert.match(context, /personalVisualRetryDelay\(attempt\)/);
    assert.match(context, /await acquirePersonalVisual\(existingKey\)/);
    assert.match(context, /visual: null/);
    assert.match(context, /phase: 'pending'/);
    assert.match(context, /phase: 'error'/);
    assert.match(context, /personalVisualErrorStage/);
    assert.match(affirmations, /ensurePersonalVisual\(current\.manifestationId\)/);
    assert.match(affirmations, /ensurePersonalVisual\(current\.manifestationId, \{ force: true \}\)/);
    assert.match(affirmationCard, /testID="personal-visual-pending"/);
    assert.match(affirmationCard, /testID="personal-visual-retry"/);
    assert.match(reveal, /testID="reveal-personal-visual"/);
    assert.match(reveal, /visualKey=\{m\.visual\.cacheKey\}/);

    const dreamStart = affirmations.indexOf('const dreamAffirmations');
    const dreamEnd = affirmations.indexOf('const allAffirmations', dreamStart);
    assert.ok(dreamStart >= 0 && dreamEnd > dreamStart);
    assert.ok(
      !affirmations.slice(dreamStart, dreamEnd).includes('visualKey'),
      'dream affirmations must not generate personal visuals yet'
    );
  });

  await t.test('successful visuals commit credits and provider failures release them', async () => {
    endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
    endpoint._internals.setPaidAccessAuthorizerForTests(async () => ({
      ok: true,
      userId: '00000000-0000-4000-8000-000000000001',
    }));
    const settlements = [];
    endpoint._internals.setPaidAccessFinalizerForTests(async (_access, { commit }) => {
      settlements.push(commit);
      return { ok: true, state: commit ? 'committed' : 'released' };
    });

    global.fetch = async () => upstreamImage();
    const success = await invoke(request(validBody()));
    assert.strictEqual(success.statusCode, 200);
    assert.deepStrictEqual(settlements, [true]);

    global.fetch = async () => { throw new Error('provider offline'); };
    const failed = await invoke(request(validBody()));
    assert.strictEqual(failed.statusCode, 503);
    assert.deepStrictEqual(failed.body, { error: 'visual_unavailable', stage: 'provider' });
    assert.deepStrictEqual(settlements, [true, false]);
  });

  await t.test('migration and deploy gates include visual generation', () => {
    const migration004 = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '004_generation_budget.sql'),
      'utf8'
    );
    const migration005 = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '005_visual_generation_budget.sql'),
      'utf8'
    );
    const migration006 = fs.readFileSync(
      path.join(__dirname, '..', 'supabase', 'migrations', '006_generation_reservations.sql'),
      'utf8'
    );
    const deploy = fs.readFileSync(path.join(__dirname, 'deploy-celeste.js'), 'utf8');
    const paidAccess = fs.readFileSync(path.join(__dirname, '..', 'api', '_paid-access.js'), 'utf8');
    const storage = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'personalVisualStorage.js'),
      'utf8'
    );
    assert.match(migration004, /'visual'/);
    assert.match(migration005, /'visual'/);
    assert.match(migration006, /celeste_finalize_generation_credit/);
    assert.match(migration006, /celeste_release_stale_generation_reservations/);
    assert.match(migration006, /per_user_daily_units = 64/);
    assert.match(migration006, /global_daily_units = 1200/);
    assert.match(migration006, /p_operation in \('scene', 'visual'\)/);
    assert.match(paidAccess, /'visual'/);
    assert.match(paidAccess, /commitPaidRequest/);
    assert.match(paidAccess, /releasePaidRequest/);
    assert.match(storage, /bytes: buffer/);
    assert.match(storage, /record && record\.blob instanceof Blob/);
    assert.match(deploy, /verificar-visual-personalizado\.js/);
    assert.match(deploy, /gerar-visual\.js/);
  });
});
