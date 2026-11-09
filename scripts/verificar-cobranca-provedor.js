// 08/11: Gemini answered 402 "Your prepayment credits are depleted" and translation, dream and images failed in
// production for everyone. The three Gemini routes now tell billing apart (503 provider_billing + one log line with
// no key or body); the apps keep treating it as any 503; the deploy smoke skips it with a warning, never a rollback.
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { transformSync } = require('@babel/core');

const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');
const billing = require('../api/_provider-billing');

const KEY = 'gemini-billing-test-secret';
const ENV_KEYS = ['GEMINI_API_KEY', 'GEMINI_PAID_DATA_TERMS_ACCEPTED', 'CELESTE_ALLOWED_ORIGINS', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'];
const DEPLETED = '{"error":{"code":402,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}';
const RATE_LIMIT = '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}';

const ROUTES = [
  {
    route: 'traduzir-cena',
    module: '../api/traduzir-cena',
    generic: 'translation_unavailable',
    body: {
      sourceLang: 'pt',
      targetLang: 'en',
      scene: {
        title: 'A manha da caneca azul 27',
        intention: 'Viver uma manha calma preservando a caneca azul numero 27.',
        affirmation: 'Eu escolho cuidar da minha rotina com calma e presenca.',
        story: 'A caneca azul com o numero 27 fica ao lado da janela enquanto eu observo a luz da manha.',
        anchorIdentity: 'Eu protejo minha atencao e honro os detalhes importantes.',
        anchorStep: 'Quando eu acordar, entao vou respirar por dois minutos.',
        personalizedWith: ['caneca azul numero 27'],
      },
    },
  },
  {
    route: 'transformar-sonho',
    module: '../api/transformar-sonho',
    generic: 'generation_unavailable',
    body: {
      dream: 'Eu caminhava por um jardim silencioso ao amanhecer e acordei calma.',
      feeling: 'calm',
      theme: 'peace',
      lang: 'pt',
      profile: { name: 'Clara', desire: 'viver com mais serenidade e confiança', whyMatters: 'estar presente nas escolhas importantes da minha vida' },
    },
  },
  {
    route: 'gerar-visual',
    module: '../api/gerar-visual',
    generic: 'visual_unavailable',
    stage: 'provider',
    body: {
      desire: 'uma cabana tranquila perto da natureza',
      category: 'Peace',
      lang: 'pt',
      profile: { dreamLocation: 'um vale verde e silencioso', dreamHome: 'uma cabana de madeira com varanda', work: 'escrever com calma', whyMatters: 'ter presenca e liberdade para viver o que importa' },
      visualMood: 'grounded',
    },
  },
];

function upstream(status, text) {
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
}

function routeResponse() {
  return {
    statusCode: 200,
    body: undefined,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

async function invoke(spec, upstreamResponse) {
  const endpoint = require(spec.module);
  endpoint._internals.resetSecurityForTests();
  endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
  endpoint._internals.setPaidAccessAuthorizerForTests(async () => ({ ok: true, userId: '00000000-0000-4000-8000-000000000001' }));
  global.fetch = async () => upstreamResponse;
  const lines = [];
  const realInfo = console.info;
  console.info = (line) => lines.push(String(line));
  const res = routeResponse();
  try {
    await endpoint({
      method: 'POST',
      headers: { origin: 'https://celeste.example' },
      body: { ...spec.body, cloudConsent: true, cloudConsentVersion: CLOUD_CONSENT_VERSION, adultConfirmed: true },
      socket: { remoteAddress: '127.0.0.1' },
    }, res);
  } finally {
    console.info = realInfo;
    endpoint._internals.resetSecurityForTests();
  }
  return { res, lines };
}

function loadEsm(relativePath, mocks) {
  const filename = path.join(__dirname, '..', relativePath);
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    babelrc: false,
    configFile: false,
  }).code;
  const loaded = { exports: {} };
  const localRequire = (name) => {
    if (Object.prototype.hasOwnProperty.call(mocks, name)) return mocks[name];
    return require(name.startsWith('.') ? path.join(path.dirname(filename), name) : name);
  };
  new Function('require', 'module', 'exports', 'process', compiled)(localRequire, loaded, loaded.exports, process);
  return loaded.exports;
}

test('Gemini billing refusals are told apart, logged without secrets, and the apps treat them as any 503', async (t) => {
  const originalFetch = global.fetch;
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  t.after(() => {
    global.fetch = originalFetch;
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });
  process.env.GEMINI_API_KEY = KEY;
  process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = '1';
  process.env.CELESTE_ALLOWED_ORIGINS = 'https://celeste.example';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;

  await t.test('which refusals are billing', async () => {
    assert.strictEqual(await billing.isBillingRefusal(upstream(402, DEPLETED)), true, '402 is billing');
    assert.strictEqual(await billing.isBillingRefusal(upstream(402, '')), true, '402 with no body is billing');
    assert.strictEqual(await billing.isBillingRefusal(upstream(429, DEPLETED)), true, '429 naming prepaid credits');
    assert.strictEqual(await billing.isBillingRefusal(upstream(429, RATE_LIMIT)), false, 'a plain rate limit is not billing');
    for (const status of [400, 403, 500, 503]) {
      assert.strictEqual(await billing.isBillingRefusal(upstream(status, DEPLETED)), false, `${status} is not billing`);
    }
    assert.strictEqual(await billing.isBillingRefusal(upstream(200, DEPLETED)), false, 'a success is not billing');
    assert.strictEqual(await billing.isBillingRefusal(null), false);
  });

  for (const spec of ROUTES) {
    await t.test(`${spec.route}: 503 provider_billing on a depleted account, the old code otherwise`, async () => {
      for (const [label, response] of [['402 depleted', upstream(402, DEPLETED)], ['429 depleted', upstream(429, DEPLETED)]]) {
        const { res, lines } = await invoke(spec, response);
        assert.strictEqual(res.statusCode, 503, `${spec.route} ${label}: ${JSON.stringify(res.body)}`);
        assert.deepStrictEqual(res.body, { error: 'provider_billing', ...(spec.stage ? { stage: spec.stage } : {}) });
        const billingLines = lines.filter((line) => line.includes('celeste_provider_billing'));
        assert.deepStrictEqual(
          billingLines.map((line) => JSON.parse(line)),
          [{ event: 'celeste_provider_billing', provider: 'gemini', route: spec.route }],
          `${spec.route} ${label}: one structured line`
        );
        assert.ok(lines.every((line) => !line.includes(KEY) && !line.includes('prepayment')), 'no key and no upstream body in the logs');
        assert.ok(!JSON.stringify(res.body).includes('prepayment'), 'the upstream text never reaches the client');
      }
      for (const [label, response] of [['plain 429', upstream(429, RATE_LIMIT)], ['500', upstream(500, '{}')]]) {
        const { res, lines } = await invoke(spec, response);
        assert.strictEqual(res.statusCode, 503, `${spec.route} ${label}`);
        assert.strictEqual(res.body.error, spec.generic, `${spec.route} ${label}: the usual outage code`);
        assert.ok(lines.every((line) => !line.includes('celeste_provider_billing')), `${spec.route} ${label}: no billing line`);
      }
    });
  }

  await t.test('the apps treat provider_billing like any other 503', async () => {
    const consent = require('../constants/cloudConsent');
    const mocks = {
      './celesteApiSession': { celestePaidApiHeaders: async () => ({}) },
      '../constants/cloudConsent': consent,
    };
    const scene = loadEsm('services/generatePersonalizedScene.js', { '../constants/cloudConsent': consent });
    const translation = loadEsm('services/translateManifestationScene.js', { ...mocks, './generatePersonalizedScene': scene });
    const dream = loadEsm('services/transformDream.js', { ...mocks, './generatePersonalizedScene': scene });
    const profile = { cloudConsentVersion: consent.CLOUD_CONSENT_VERSION, cloudPersonalization: true, cloudAdultConfirmed: true, cloudDreamConsent: true, age: '25–34' };
    const answer = (error) => async () => ({ ok: false, status: 503, json: async () => ({ error }), text: async () => JSON.stringify({ error }) });
    const messages = async (call) => {
      const seen = [];
      for (const error of ['provider_billing', ROUTES[0].generic]) {
        try {
          await call(answer(error));
          seen.push('resolved');
        } catch (failure) {
          seen.push(failure.message);
        }
      }
      return seen;
    };
    const translated = await messages((fetchImpl) => translation.translateManifestationScene({
      sourceLang: 'pt', targetLang: 'en', scene: ROUTES[0].body.scene, profile, fetchImpl,
    }));
    assert.deepStrictEqual(translated, ['translation_api_503', 'translation_api_503'], 'translation: same failure, same honest fallback');
    const dreamt = await messages((fetchImpl) => dream.transformDreamWithKnowledge({
      dream: ROUTES[1].body.dream, feeling: 'calm', theme: 'peace', lang: 'pt', profile, fetchImpl,
    }));
    assert.deepStrictEqual(dreamt, ['dream_api_503', 'dream_api_503'], 'dream: same failure, same honest fallback');
  });
});
