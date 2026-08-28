const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const endpoint = require('../api/gerar-cena');

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
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'generatePersonalizedScene.js'),
    'utf8'
  );
  const executable = source.replace(/\bexport\s+(?=(?:async\s+)?function|const)/g, '');
  return Function(
    `${executable}\nreturn { minimizeProfile, profileConfirmsAdult, generatePersonalizedScene };`
  )();
}

function restoreEnvironment() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
  endpoint._internals.resetSecurityForTests();
}

function configure() {
  process.env.GEMINI_API_KEY = 'test-secret-key-that-must-never-leak';
  process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = '1';
  process.env.GEMINI_MODEL = 'gemini-3.7-flash';
  process.env.CELESTE_ALLOWED_ORIGINS = 'https://celeste.example';
  delete process.env.GEMINI_TIMEOUT_MS;
  endpoint._internals.resetSecurityForTests();
  endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
  endpoint._internals.setPaidAccessAuthorizerForTests(async () => ({
    ok: true,
    userId: '00000000-0000-4000-8000-000000000001',
  }));
}

function validBody(overrides = {}) {
  return {
    desire: 'construir uma vida criativa e tranquila',
    category: 'Career',
    lang: 'pt',
    profile: {
      name: 'Ana',
      dreamLocation: 'Lisboa',
      dreamHome: 'Modern Loft',
      people: [{ name: 'Bia', relation: 'amiga', age: 'private-person-age-token' }],
      kids: [{ name: 'Leo', extra: 'private-child-age-token' }],
      work: 'designer de produto',
      workFeeling: 'Estou construindo algo em paralelo',
      relationshipStatus: 'Solteiro(a)',
      aboutYou: 'sou curiosa, criativa e gosto de aprender fazendo com Bia',
      partnerDesire: 'uma parceria leve, presente e honesta',
      pastInfluence: 'ter mudado de cidade me ensinou a recomecar',
      obstacle: 'medo de comecar',
      whyMatters: 'ter liberdade para estar com Bia e Leo',
      age: 'private-age-token',
      gender: 'private-gender-token',
      sexuality: 'private-sexuality-token',
      manifestingName: 'private-third-party-name-token',
      cloudPersonalization: true,
      cloudAdultConfirmed: true,
      ignoredPrivateField: 'must not be forwarded',
    },
    cloudConsent: true,
    adultConfirmed: true,
    ...overrides,
  };
}

function generatedPayload(overrides = {}) {
  const scene = {
    intention: 'Viver meu trabalho criativo com presenca e constancia.',
    affirmation: 'Eu construo uma vida criativa e tranquila enquanto meu trabalho como designer de produto cresce com constancia.',
    story: 'E fim de tarde em Lisboa. Voce fecha o computador depois de concluir uma tarefa que importa e percebe o loft moderno silencioso ao redor. A vida criativa e tranquila que deseja aparece no modo como o trabalho de designer de produto cabe no seu dia sem tomar todo o resto. O medo de comecar ainda pode aparecer, mas ja nao decide o proximo passo. Voce respira, olha o que terminou e reconhece a constancia que esta construindo. A liberdade para estar com a familia deixa de ser uma ideia abstrata e orienta escolhas pequenas, possiveis e reais.',
    anchorIdentity: 'Eu construo espaco para meu trabalho ser visto com constancia.',
    anchorStep: 'Se eu notar medo de comecar, entao vou dedicar dez minutos a tarefa mais concreta do meu projeto hoje.',
    affirmationFieldsUsed: ['desire', 'work'],
    storyFieldsUsed: ['desire', 'location', 'dreamHome', 'work', 'obstacle', 'whyMatters'],
    ...overrides,
  };
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text: JSON.stringify(scene) }] },
      },
    ],
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

test('Gemini scene API contract', async (t) => {
  t.after(restoreEnvironment);

  await t.test('client sends only category-relevant context and removes private fields', () => {
    const { minimizeProfile } = loadClientModule();
    const profile = validBody().profile;
    const career = minimizeProfile(profile, 'Career', 'pt');
    const peace = minimizeProfile(profile, 'Peace', 'pt');
    const love = minimizeProfile(profile, 'Love', 'pt');

    assert.strictEqual(career.name, 'Ana');
    assert.strictEqual(career.work, 'designer de produto');
    assert.strictEqual(career.workFeeling, 'Estou construindo algo em paralelo');
    assert.strictEqual(career.dreamLocation, 'Lisboa');
    assert.strictEqual(career.relationshipStatus, undefined);
    assert.strictEqual(career.dreamHome, undefined);
    assert.strictEqual(
      career.aboutYou,
      'sou curiosa, criativa e gosto de aprender fazendo com uma pessoa próxima'
    );
    assert.strictEqual(career.whyMatters, 'ter liberdade para estar com uma pessoa próxima e uma pessoa próxima');

    assert.strictEqual(peace.name, 'Ana');
    assert.strictEqual(peace.aboutYou, career.aboutYou);
    assert.strictEqual(peace.obstacle, 'medo de comecar');
    assert.strictEqual(peace.whyMatters, career.whyMatters);
    for (const field of ['relationshipStatus', 'partnerDesire', 'pastInfluence', 'work', 'workFeeling', 'dreamHome', 'dreamLocation']) {
      assert.strictEqual(peace[field], undefined, `${field} must not be sent for Peace`);
    }

    assert.strictEqual(love.name, 'Ana');
    assert.strictEqual(love.relationshipStatus, 'Solteiro(a)');
    assert.strictEqual(love.partnerDesire, 'uma parceria leve, presente e honesta');
    assert.strictEqual(love.pastInfluence, 'ter mudado de cidade me ensinou a recomecar');
    for (const field of ['work', 'workFeeling', 'dreamHome', 'dreamLocation']) {
      assert.strictEqual(love[field], undefined, `${field} must not be sent for Love`);
    }

    const serialized = JSON.stringify({ career, peace, love });
    for (const field of ['age', 'gender', 'sexuality', 'manifestingName', 'kids', 'people']) {
      assert.strictEqual(career[field], undefined, `${field} must not leave the device`);
      assert.strictEqual(peace[field], undefined, `${field} must not leave the device`);
      assert.strictEqual(love[field], undefined, `${field} must not leave the device`);
    }
    for (const privateToken of [
      'private-age-token',
      'private-gender-token',
      'private-sexuality-token',
      'private-third-party-name-token',
      'private-person-age-token',
      'private-child-age-token',
      'Bia',
      'Leo',
    ]) {
      assert.ok(!serialized.includes(privateToken), `${privateToken} left the device`);
    }
  });

  await t.test('scene request applies category minimization at the network boundary', async () => {
    const { generatePersonalizedScene } = loadClientModule();
    const requests = [];
    const fetchImpl = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({
          scene: {
            intention: 'Uma intenção concreta.',
            affirmation: 'Eu avanço com presença.',
            story: 'Uma cena pessoal e segura.',
            anchorIdentity: 'Eu pratico presença.',
            anchorStep: 'Reservar dez minutos hoje.',
          },
          generation: {},
        }),
      };
    };
    const profile = validBody().profile;

    await generatePersonalizedScene({
      desire: 'viver com mais serenidade ao lado de Bia e Leo',
      category: 'Peace',
      lang: 'pt',
      profile,
      fetchImpl,
    });
    await generatePersonalizedScene({
      desire: 'construir uma relação leve',
      category: 'Love',
      lang: 'pt',
      profile,
      fetchImpl,
    });

    assert.strictEqual(requests[0].category, 'Peace');
    assert.strictEqual(
      requests[0].desire,
      'viver com mais serenidade ao lado de uma pessoa próxima e uma pessoa próxima'
    );
    assert.ok(!JSON.stringify(requests[0]).includes('Bia'));
    assert.ok(!JSON.stringify(requests[0]).includes('Leo'));
    assert.strictEqual(requests[0].profile.name, 'Ana');
    assert.strictEqual(requests[0].profile.work, undefined);
    assert.strictEqual(requests[0].profile.relationshipStatus, undefined);
    assert.strictEqual(requests[0].profile.dreamHome, undefined);
    assert.strictEqual(requests[1].category, 'Love');
    assert.strictEqual(requests[1].profile.relationshipStatus, 'Solteiro(a)');
    assert.strictEqual(requests[1].profile.partnerDesire, 'uma parceria leve, presente e honesta');
    assert.strictEqual(requests[1].profile.work, undefined);
    assert.strictEqual(requests[1].profile.dreamHome, undefined);
  });

  await t.test('client never calls the API without saved adult confirmation', async () => {
    const { generatePersonalizedScene, profileConfirmsAdult } = loadClientModule();
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      throw new Error('must not run');
    };
    const base = validBody().profile;

    assert.strictEqual(profileConfirmsAdult({ ...base, age: 'Under 18' }), false);
    assert.strictEqual(profileConfirmsAdult({ ...base, age: 'Menos de 18' }), false);
    assert.strictEqual(profileConfirmsAdult(base), true);
    await assert.rejects(
      generatePersonalizedScene({
        desire: 'uma vida tranquila',
        category: 'Peace',
        lang: 'pt',
        profile: { ...base, age: 'Under 18' },
        fetchImpl,
      }),
      /adult_confirmation_required/
    );
    await assert.rejects(
      generatePersonalizedScene({
        desire: 'uma vida tranquila',
        category: 'Peace',
        lang: 'pt',
        profile: { ...base, cloudAdultConfirmed: false },
        fetchImpl,
      }),
      /adult_confirmation_required/
    );
    assert.strictEqual(calls, 0);
  });

  await t.test('onboarding and Profile persist the same explicit adult-consent field', () => {
    const flowSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'onboarding', 'flow.js'),
      'utf8'
    );
    const chatSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'onboarding', 'ChatOnboardingScreen.js'),
      'utf8'
    );
    const profileSource = fs.readFileSync(
      path.join(__dirname, '..', 'screens', 'ProfileScreen.js'),
      'utf8'
    );
    assert.match(flowSource, /when:\s*\(answers\)\s*=>\s*ageConfirmsAdult\(answers\.age\)/);
    assert.match(chatSource, /cloudAdultConfirmed:\s*allowed/);
    assert.match(profileSource, /cloudPersonalization:\s*true[\s\S]*cloudAdultConfirmed:\s*true[\s\S]*cloudDreamConsent:\s*true/);
    assert.match(profileSource, /cloudPersonalization:\s*false[\s\S]*cloudAdultConfirmed:\s*false[\s\S]*cloudDreamConsent:\s*false/);
    assert.match(profileSource, /isUnder18Age\(state\.profile/);
  });

  await t.test('rejects methods other than POST and supports CORS preflight', async () => {
    configure();
    let res = await invoke(request(undefined, { method: 'GET' }));
    assert.strictEqual(res.statusCode, 405);
    assert.deepStrictEqual(res.body, { error: 'method_not_allowed' });
    assert.strictEqual(res.headers.allow, 'POST, OPTIONS');

    res = await invoke(request(undefined, {
      method: 'OPTIONS',
      headers: { origin: 'https://celeste.example' },
    }));
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.headers['access-control-allow-origin'], 'https://celeste.example');
  });

  await t.test('fails closed before Gemini when Origin is absent from POST and OPTIONS', async () => {
    configure();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => generatedPayload() };
    };

    let res = await invoke(requestWithoutOrigin(validBody(), {
      headers: { 'x-forwarded-for': '10.0.0.200' },
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

  await t.test('blocks bots and verification failures before calling Gemini', async () => {
    configure();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => generatedPayload() };
    };

    endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: false, isBot: true }));
    let res = await invoke(request(validBody()));
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { error: 'automated_request_blocked' });

    endpoint._internals.setBotVerifierForTests(async () => { throw new Error('provider unavailable'); });
    res = await invoke(request(validBody()));
    assert.strictEqual(res.statusCode, 503);
    assert.deepStrictEqual(res.body, { error: 'bot_verification_unavailable' });
    assert.strictEqual(calls, 0, 'failed BotID checks must never spend a Gemini request');
  });

  await t.test('provides separate and transparent English receipts', () => {
    const base = validBody();
    const validated = endpoint._internals.validateInput(validBody({
      lang: 'en',
      desire: 'build a creative and peaceful life',
      profile: {
        ...base.profile,
        dreamLocation: 'Lisbon',
        dreamHome: 'Modern Loft',
        work: 'creative design work',
        obstacle: 'fear of starting',
        whyMatters: 'freedom to be with family',
      },
    }));
    assert.ok(validated.value);
    const raw = JSON.parse(generatedPayload({
      affirmation: 'I build a creative and peaceful life where my design work grows with consistency.',
      story: 'It is late afternoon in Lisbon. You finish a meaningful piece of creative design work and notice the quiet Modern Loft around you. The peaceful life you want feels present in this practical moment. Fear of starting can still appear, but it no longer chooses the next step. You breathe, recognize the freedom you are building for your family, and return to one grounded action.',
      anchorStep: 'If I notice fear of starting, then I will give ten minutes to the most concrete part of my project.',
    }).candidates[0].content.parts[0].text);
    const scene = endpoint._internals.validateGeneratedScene(raw, validated.value);
    assert.deepStrictEqual(scene.affirmationPersonalizedWith, [
      'what you want to experience',
      'your work',
    ]);
    assert.deepStrictEqual(scene.storyPersonalizedWith, [
      'what you want to experience',
      'where you want to live',
      'your dream home',
      'your work',
      'what was holding you back',
      'why this matters',
    ]);
    assert.deepStrictEqual(scene.personalizedWith, [
      'what you want to experience',
      'your work',
      'where you want to live',
      'your dream home',
      'what was holding you back',
      'why this matters',
    ]);
  });

  await t.test('requires a JSON object, consent, adult confirmation, and valid fields', async () => {
    configure();
    let res = await invoke(request(null));
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'invalid_request');

    res = await invoke(request(validBody({ cloudConsent: false })));
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'cloud_consent_required');

    res = await invoke(request(validBody({ adultConfirmed: false })));
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'adult_confirmation_required');

    res = await invoke(request(validBody({
      profile: { ...validBody().profile, age: 'Under 18' },
      adultConfirmed: true,
    })));
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'adult_confirmation_required');

    res = await invoke(request(validBody({ category: 'Crypto' })));
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'category_invalid');

    res = await invoke(request(validBody({ profile: [] })));
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'profile_invalid');
  });

  await t.test('rejects false personalization receipts and unanchored affirmations', () => {
    const validated = endpoint._internals.validateInput(validBody());
    assert.ok(validated.value);
    const raw = JSON.parse(generatedPayload().candidates[0].content.parts[0].text);

    assert.throws(
      () => endpoint._internals.validateGeneratedScene({
        ...raw,
        affirmationFieldsUsed: ['work'],
      }, validated.value),
      /invalid_generation/
    );

    assert.throws(
      () => endpoint._internals.validateGeneratedScene({
        ...raw,
        affirmation: 'Eu já sou a pessoa que tem uma vida criativa e tranquila; isso está vindo na minha direção.',
      }, validated.value),
      /invalid_generation/
    );

    assert.throws(
      () => endpoint._internals.validateGeneratedScene({
        ...raw,
        anchorStep: 'Dedique dez minutos a tarefa mais concreta do projeto hoje.',
      }, validated.value),
      /invalid_generation/
    );
    assert.throws(
      () => endpoint._internals.validateGeneratedScene({
        ...raw,
        affirmationFieldsUsed: ['desire', 'dreamHome'],
      }, validated.value),
      /invalid_generation/
    );
    assert.throws(
      () => endpoint._internals.validateGeneratedScene({
        ...raw,
        affirmationFieldsUsed: ['desire'],
      }, validated.value),
      /invalid_generation/,
      'an available questionnaire anchor must personalize the affirmation'
    );
    assert.throws(
      () => endpoint._internals.validateGeneratedScene({
        ...raw,
        affirmationFieldsUsed: ['desire', 'obstacle'],
      }, validated.value),
      /invalid_generation/,
      'sensitive story context must not be used as the affirmation anchor'
    );
    assert.throws(
      () => endpoint._internals.validateGeneratedScene({
        ...raw,
        storyFieldsUsed: [...raw.storyFieldsUsed, 'workFeeling'],
      }, validated.value),
      /invalid_generation/
    );

    const roughProfile = endpoint._internals.validateInput(validBody({
      profile: { ...validBody().profile, aboutYou: 'pro ativo bondoso' },
    }));
    assert.strictEqual(
      roughProfile.value.profile.aboutYou,
      'Qualidades reconhecidas pela pessoa: proatividade e bondade.',
      'API precisa interpretar a lista de tracos antes de chamar o provedor'
    );
    assert.throws(
      () => endpoint._internals.validateGeneratedScene({
        ...raw,
        affirmation: 'Eu construo uma vida criativa e tranquila. Eu honro o que sei sobre mim: pro ativo bondoso.',
        affirmationFieldsUsed: ['desire', 'aboutYou'],
      }, roughProfile.value),
      /invalid_generation/,
      'resposta remota nao pode repetir o despejo cru que apareceu em producao'
    );
    const noObstacle = endpoint._internals.validateInput(validBody({
      profile: { ...validBody().profile, obstacle: 'nada específico' },
    }));
    assert.ok(noObstacle.value, 'Nada especifico nao pode invalidar a requisicao');
    assert.strictEqual(
      noObstacle.value.profile.obstacle,
      undefined,
      'Nada especifico nao pode acionar plano se-entao nem consumir contexto remoto'
    );
  });

  await t.test('does not call Gemini until both server-only configuration guards exist', async () => {
    configure();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      throw new Error('must not run');
    };
    delete process.env.GEMINI_API_KEY;
    let res = await invoke(request(validBody()));
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.error, 'generation_not_configured');

    process.env.GEMINI_API_KEY = 'configured-but-paid-terms-not-confirmed';
    delete process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED;
    res = await invoke(request(validBody()));
    assert.strictEqual(res.statusCode, 503);
    assert.strictEqual(res.body.error, 'generation_not_configured');
    assert.strictEqual(calls, 0);
  });

  await t.test('generates a validated scene with deterministic metadata and minimized input', async () => {
    configure();
    const settlements = [];
    endpoint._internals.setPaidAccessFinalizerForTests(async (_access, { commit }) => {
      settlements.push(commit);
      return { ok: true, state: commit ? 'committed' : 'released' };
    });
    const seen = [];
    global.fetch = async (url, options) => {
      seen.push({ url, options, body: JSON.parse(options.body) });
      return { ok: true, status: 200, json: async () => generatedPayload() };
    };

    const first = await invoke(request(validBody(), {
      headers: { origin: 'https://celeste.example', 'x-forwarded-for': '10.0.0.2' },
    }));
    const second = await invoke(request(validBody(), {
      headers: { origin: 'https://celeste.example', 'x-forwarded-for': '10.0.0.3' },
    }));

    assert.strictEqual(first.statusCode, 200);
    assert.deepStrictEqual(settlements, [true, true], 'cenas validas precisam confirmar as reservas');
    assert.strictEqual(first.body.generation.source, 'celeste-ai');
    assert.strictEqual(first.body.generation.provider, 'gemini');
    assert.strictEqual(first.body.generation.fallbackUsed, false);
    assert.strictEqual(first.body.generation.model, 'gemini-3.7-flash');
    assert.strictEqual(first.body.generation.promptVersion, 'celeste-scene-v7');
    assert.strictEqual(first.body.generation.knowledgeVersion, 'celeste-knowledge-v2');
    assert.strictEqual(first.body.generation.seed, second.body.generation.seed);
    assert.deepStrictEqual(first.body.scene.affirmationPersonalizedWith, [
      'o que você quer viver',
      'seu trabalho',
    ]);
    assert.deepStrictEqual(first.body.scene.storyPersonalizedWith, [
      'o que você quer viver',
      'onde quer morar',
      'casa dos sonhos',
      'seu trabalho',
      'o que travava você',
      'por que isso importa',
    ]);
    assert.deepStrictEqual(first.body.scene.personalizedWith, [
      'o que você quer viver',
      'seu trabalho',
      'onde quer morar',
      'casa dos sonhos',
      'o que travava você',
      'por que isso importa',
    ]);
    assert.ok(!Object.prototype.hasOwnProperty.call(first.body.scene, 'personalizedFieldsUsed'));

    const sent = seen[0];
    assert.ok(sent.options.body.includes('values-based reflection'));
    assert.ok(sent.options.body.includes('explicit if-then plan'));
    assert.ok(sent.options.body.includes('celeste-knowledge-v2'));
    assert.ok(sent.options.body.includes('[mental_contrasting]'));
    assert.match(sent.url, /gemini-3\.7-flash:generateContent$/);
    assert.strictEqual(sent.options.headers['x-goog-api-key'], process.env.GEMINI_API_KEY);
    assert.strictEqual(sent.body.generationConfig.responseMimeType, 'application/json');
    assert.ok(sent.body.generationConfig.responseSchema.required.includes('affirmationFieldsUsed'));
    assert.ok(sent.body.generationConfig.responseSchema.required.includes('storyFieldsUsed'));
    assert.ok(!sent.body.generationConfig.responseSchema.required.includes('personalizedFieldsUsed'));
    assert.strictEqual(sent.body.generationConfig.seed, first.body.generation.seed);
    assert.strictEqual(sent.body.safetySettings.length, 4);
    const userJson = JSON.parse(sent.body.contents[0].parts[0].text);
    assert.strictEqual(userJson.profile.ignoredPrivateField, undefined);
    assert.strictEqual(userJson.profile.importantPeople, undefined);
    assert.strictEqual(userJson.profile.kids, undefined);
    assert.strictEqual(userJson.profile.people, undefined);
    assert.strictEqual(userJson.profile.work, 'designer de produto');
    assert.strictEqual(userJson.profile.workFeeling, 'Estou construindo algo em paralelo');
    assert.strictEqual(userJson.profile.relationshipStatus, 'Solteiro(a)');
    assert.strictEqual(
      userJson.profile.aboutYou,
      'Qualidades reconhecidas pela pessoa: curiosidade, criatividade e interesse por aprender fazendo com uma pessoa próxima.'
    );
    assert.ok(
      sent.options.body.includes('Never paste a raw trait list after a colon'),
      'prompt remoto precisa proibir copia crua da resposta pessoal'
    );
    assert.strictEqual(userJson.profile.partnerDesire, 'uma parceria leve, presente e honesta');
    assert.strictEqual(userJson.profile.pastInfluence, 'ter mudado de cidade me ensinou a recomecar');
    for (const field of ['age', 'gender', 'sexuality', 'manifestingName']) {
      assert.strictEqual(userJson.profile[field], undefined, `${field} must not reach Gemini`);
    }
    for (const privateToken of [
      'private-age-token',
      'private-gender-token',
      'private-sexuality-token',
      'private-third-party-name-token',
      'private-person-age-token',
      'private-child-age-token',
      'Bia',
      'Leo',
    ]) {
      assert.ok(!sent.options.body.includes(privateToken), `${privateToken} leaked to Gemini`);
    }
    assert.ok(!sent.options.body.includes(process.env.GEMINI_API_KEY));

    assert.strictEqual(first.headers['cache-control'], 'no-store, max-age=0');
    assert.strictEqual(first.headers.vary, 'Origin');
    assert.strictEqual(first.headers['access-control-allow-origin'], 'https://celeste.example');
    assert.ok(!JSON.stringify(first.body).includes(process.env.GEMINI_API_KEY));
  });

  await t.test('rejects an origin outside the allowlist before calling Gemini', async () => {
    configure();
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return { ok: true, json: async () => generatedPayload() };
    };
    const res = await invoke(request(validBody(), { headers: { origin: 'https://attacker.example' } }));
    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.error, 'origin_not_allowed');
    assert.strictEqual(res.headers['access-control-allow-origin'], undefined);
    assert.strictEqual(calls, 0);
  });

  await t.test('rejects malformed Gemini JSON and safety-blocked candidates', async () => {
    configure();
    const settlements = [];
    endpoint._internals.setPaidAccessFinalizerForTests(async (_access, { commit }) => {
      settlements.push(commit);
      return { ok: true, state: commit ? 'committed' : 'released' };
    });
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] }),
    });
    let res = await invoke(request(validBody(), { headers: { 'x-forwarded-for': '10.0.0.4' } }));
    assert.strictEqual(res.statusCode, 502);
    assert.deepStrictEqual(res.body, { error: 'invalid_generation' });
    assert.deepStrictEqual(settlements, [false], 'resposta invalida precisa liberar a reserva');

    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ promptFeedback: { blockReason: 'SAFETY' } }),
    });
    res = await invoke(request(validBody(), { headers: { 'x-forwarded-for': '10.0.0.5' } }));
    assert.strictEqual(res.statusCode, 422);
    assert.deepStrictEqual(res.body, { error: 'generation_blocked' });
    assert.deepStrictEqual(settlements, [false, false], 'bloqueio de seguranca nao pode consumir cota');
  });

  await t.test('does not start a repair when a slow invalid first attempt leaves too little budget', async () => {
    configure();
    let now = 1_000;
    let calls = 0;
    endpoint._internals.setGenerationClockForTests(() => now);
    global.fetch = async () => {
      calls += 1;
      now += endpoint._internals.generationDeadlineMs() -
        endpoint._internals.minimumRepairBudgetMs() + 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] }),
      };
    };

    try {
      const res = await invoke(request(validBody()));
      assert.strictEqual(res.statusCode, 504);
      assert.deepStrictEqual(res.body, { error: 'generation_timeout' });
      assert.strictEqual(calls, 1, 'a late invalid response must not start a doomed repair');
    } finally {
      endpoint._internals.setGenerationClockForTests();
    }
  });

  await t.test('repairs a fast invalid first attempt inside the shared deadline', async () => {
    configure();
    let now = 2_000;
    const seen = [];
    endpoint._internals.setGenerationClockForTests(() => now);
    global.fetch = async (_url, options) => {
      seen.push(JSON.parse(options.body));
      now += 100;
      return seen.length === 1
        ? {
            ok: true,
            status: 200,
            json: async () => ({ candidates: [{ content: { parts: [{ text: 'not-json' }] } }] }),
          }
        : { ok: true, status: 200, json: async () => generatedPayload() };
    };

    try {
      const res = await invoke(request(validBody()));
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(seen.length, 2);
      assert.match(
        seen[1].systemInstruction.parts[0].text,
        /QUALITY REPAIR FOR THIS RETRY/,
        'the second attempt must carry the repair instruction'
      );
    } finally {
      endpoint._internals.setGenerationClockForTests();
    }
  });

  await t.test('rejects a response whose body completes after the total generation deadline', async () => {
    configure();
    let now = 3_000;
    let calls = 0;
    endpoint._internals.setGenerationClockForTests(() => now);
    global.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        json: async () => {
          now += endpoint._internals.generationDeadlineMs() + 1;
          return generatedPayload();
        },
      };
    };

    try {
      const res = await invoke(request(validBody()));
      assert.strictEqual(res.statusCode, 504);
      assert.deepStrictEqual(res.body, { error: 'generation_timeout' });
      assert.strictEqual(calls, 1);
    } finally {
      endpoint._internals.setGenerationClockForTests();
    }
  });

  await t.test('times out cleanly and never echoes network errors or secrets', async () => {
    configure();
    const settlements = [];
    endpoint._internals.setPaidAccessFinalizerForTests(async (_access, { commit }) => {
      settlements.push(commit);
      return { ok: true, state: commit ? 'committed' : 'released' };
    });
    process.env.GEMINI_TIMEOUT_MS = '20';
    global.fetch = (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error(`provider timeout: ${process.env.GEMINI_API_KEY}`);
        error.name = 'AbortError';
        reject(error);
      });
    });
    let res = await invoke(request(validBody(), { headers: { 'x-forwarded-for': '10.0.0.6' } }));
    assert.strictEqual(res.statusCode, 504);
    assert.deepStrictEqual(res.body, { error: 'generation_timeout' });
    assert.deepStrictEqual(settlements, [false], 'timeout do provedor precisa liberar a reserva');
    assert.ok(!JSON.stringify(res.body).includes(process.env.GEMINI_API_KEY));

    delete process.env.GEMINI_TIMEOUT_MS;
    global.fetch = async () => {
      throw new Error(`provider failure: ${process.env.GEMINI_API_KEY}`);
    };
    res = await invoke(request(validBody(), { headers: { 'x-forwarded-for': '10.0.0.7' } }));
    assert.strictEqual(res.statusCode, 503);
    assert.deepStrictEqual(res.body, { error: 'generation_unavailable' });
    assert.deepStrictEqual(
      settlements,
      [false, false],
      'falha de rede do provedor precisa liberar a reserva'
    );
    assert.ok(!JSON.stringify(res.body).includes(process.env.GEMINI_API_KEY));
  });
});
