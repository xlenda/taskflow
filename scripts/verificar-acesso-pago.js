const assert = require('assert');
const test = require('node:test');

const paidAccess = require('../api/_paid-access');

const ENV_KEYS = [
  'CELESTE_SUPABASE_URL',
  'CELESTE_SUPABASE_ANON_KEY',
  'CELESTE_SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'CELESTE_ALLOW_LOCAL_NATIVE_BYPASS',
  'VERCEL_ENV',
  'NODE_ENV',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;

function configure() {
  process.env.CELESTE_SUPABASE_URL = 'https://celeste.supabase.co';
  process.env.CELESTE_SUPABASE_ANON_KEY = 'public-anon-key';
  process.env.CELESTE_SUPABASE_SERVICE_ROLE_KEY = 'server-service-role-key';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  process.env.CELESTE_ALLOW_LOCAL_NATIVE_BYPASS = '0';
  process.env.VERCEL_ENV = 'production';
  process.env.NODE_ENV = 'production';
  paidAccess.resetAuthorizerForTests();
}

function restore() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
  paidAccess.resetAuthorizerForTests();
}

function request(overrides = {}) {
  return {
    headers: {
      authorization: 'Bearer valid-session-token',
      origin: 'https://celeste.example',
      'x-celeste-client': 'web',
      'x-celeste-request-id': 'celeste-test-request-0001',
      ...(overrides.headers || {}),
    },
  };
}

test('paid Gemini access is identity-bound and quota-bound', async (t) => {
  configure();
  t.after(restore);

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) {
      return {
        ok: true,
        json: async () => ({ id: '00000000-0000-4000-8000-000000000001' }),
      };
    }
    if (url.endsWith('/rpc/celeste_finalize_generation_credit')) {
      const body = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          finalized: true,
          state: body.p_commit ? 'committed' : 'released',
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({ allowed: true, duplicate: false, reserved: true }),
    };
  };

  const allowed = await paidAccess.authorizePaidRequest(request(), {
    operation: 'scene',
    units: 4,
  });
  assert.strictEqual(allowed.ok, true);
  assert.strictEqual(allowed.native, false);
  assert.strictEqual(calls.length, 2);
  assert.match(calls[0].url, /\/auth\/v1\/user$/);
  assert.match(calls[1].url, /\/rpc\/celeste_reserve_generation_credit$/);
  const reservation = JSON.parse(calls[1].options.body);
  assert.strictEqual(reservation.p_operation, 'scene');
  assert.strictEqual(reservation.p_units, 4);
  assert.ok(!calls[1].options.body.includes('valid-session-token'));
  assert.strictEqual(
    calls[1].options.headers.Authorization,
    'Bearer server-service-role-key',
    'service-role JWT legado precisa continuar no Bearer'
  );
  const committed = await paidAccess.commitPaidRequest(allowed);
  assert.deepStrictEqual(committed, { ok: true, state: 'committed' });
  assert.strictEqual(calls.length, 3);
  assert.match(calls[2].url, /\/rpc\/celeste_finalize_generation_credit$/);
  assert.deepStrictEqual(JSON.parse(calls[2].options.body), {
    p_user_id: '00000000-0000-4000-8000-000000000001',
    p_request_id: 'celeste-test-request-0001',
    p_commit: true,
  });

  calls.length = 0;
  const visualAllowed = await paidAccess.authorizePaidRequest(request(), {
    operation: 'visual',
    units: 8,
  });
  assert.strictEqual(visualAllowed.ok, true);
  assert.strictEqual(calls.length, 2);
  const visualReservation = JSON.parse(calls[1].options.body);
  assert.strictEqual(visualReservation.p_operation, 'visual');
  assert.strictEqual(visualReservation.p_units, 8);
  const released = await paidAccess.releasePaidRequest(visualAllowed);
  assert.deepStrictEqual(released, { ok: true, state: 'released' });
  assert.strictEqual(JSON.parse(calls[2].options.body).p_commit, false);

  calls.length = 0;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) {
      return {
        ok: true,
        json: async () => ({ id: '00000000-0000-4000-8000-000000000001' }),
      };
    }
    // Migration 004/005 response: charged immediately and no finalizer RPC.
    return { ok: true, json: async () => ({ allowed: true, duplicate: false }) };
  };
  const legacyAllowed = await paidAccess.authorizePaidRequest(request(), {
    operation: 'scene',
    units: 4,
  });
  assert.strictEqual(legacyAllowed.reserved, false);
  assert.deepStrictEqual(await paidAccess.commitPaidRequest(legacyAllowed), {
    ok: true,
    state: 'committed',
    legacyOnePhase: true,
  });
  assert.strictEqual(calls.length, 2, 'schema antigo nao pode chamar RPC de finalizacao ausente');

  delete process.env.CELESTE_SUPABASE_URL;
  delete process.env.CELESTE_SUPABASE_ANON_KEY;
  delete process.env.CELESTE_SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://celeste-marketplace.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_marketplace';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_marketplace';
  calls.length = 0;
  const marketplaceAllowed = await paidAccess.authorizePaidRequest(request(), {
    operation: 'scene',
    units: 4,
  });
  assert.strictEqual(marketplaceAllowed.ok, true);
  assert.strictEqual(calls.length, 2);
  assert.ok(calls[0].url.startsWith('https://celeste-marketplace.supabase.co/'));
  assert.strictEqual(calls[0].options.headers.apikey, 'sb_publishable_marketplace');
  assert.strictEqual(calls[1].options.headers.apikey, 'sb_secret_marketplace');
  assert.strictEqual(
    calls[1].options.headers.Authorization,
    undefined,
    'sb_secret nao e JWT e nao pode ser enviada como Bearer'
  );

  configure();

  const missingIdentity = await paidAccess.authorizePaidRequest(
    request({ headers: { authorization: '' } }),
    { operation: 'scene', units: 4 }
  );
  assert.strictEqual(missingIdentity.status, 401);
  assert.strictEqual(missingIdentity.error, 'identity_required');

  calls.length = 0;
  global.fetch = async (url) => {
    if (url.endsWith('/auth/v1/user')) {
      return {
        ok: true,
        json: async () => ({ id: '00000000-0000-4000-8000-000000000001' }),
      };
    }
    return { ok: true, json: async () => ({ allowed: false, reason: 'global_limit' }) };
  };
  const limited = await paidAccess.authorizePaidRequest(request(), {
    operation: 'audio',
    units: 4,
  });
  assert.strictEqual(limited.status, 429);
  assert.strictEqual(limited.error, 'daily_generation_limit_reached');

  global.fetch = async (url) => {
    if (url.endsWith('/auth/v1/user')) {
      return {
        ok: true,
        json: async () => ({ id: '00000000-0000-4000-8000-000000000001' }),
      };
    }
    return {
      ok: true,
      json: async () => ({ allowed: false, reason: 'duplicate', duplicate: true }),
    };
  };
  const replayed = await paidAccess.authorizePaidRequest(request(), {
    operation: 'audio',
    units: 4,
  });
  assert.strictEqual(replayed.status, 409);
  assert.strictEqual(replayed.error, 'duplicate_request');

  calls.length = 0;
  const forgedNative = request({
    headers: {
      origin: '',
      'x-celeste-client': 'ios',
      'x-celeste-request-id': 'celeste-forged-native-0001',
    },
  });
  const nativeBlocked = await paidAccess.authorizePaidRequest(forgedNative, {
    operation: 'scene',
    units: 4,
  });
  assert.strictEqual(nativeBlocked.status, 403);
  assert.strictEqual(nativeBlocked.error, 'native_attestation_required');
  assert.strictEqual(calls.length, 0, 'native claim must be rejected before Supabase or Gemini');

  process.env.CELESTE_ALLOW_LOCAL_NATIVE_BYPASS = '1';
  assert.strictEqual(paidAccess.isNativeRequest(forgedNative), false, 'production cannot bypass');

  process.env.VERCEL_ENV = 'preview';
  process.env.NODE_ENV = 'development';
  assert.strictEqual(paidAccess.isNativeRequest(forgedNative), false, 'preview cannot bypass');

  process.env.VERCEL_ENV = '';
  assert.strictEqual(paidAccess.isNativeRequest(forgedNative), false, 'unknown env cannot bypass');

  process.env.VERCEL_ENV = 'development';
  assert.strictEqual(paidAccess.isNativeRequest(forgedNative), true, 'explicit local dev may bypass');

  process.env.NODE_ENV = 'production';
  assert.strictEqual(paidAccess.isNativeRequest(forgedNative), false, 'production Node mode cannot bypass');

  for (const pathname of [
    '../api/gerar-cena',
    '../api/traduzir-cena',
    '../api/transformar-sonho',
    '../api/gerar-audio',
    '../api/gerar-visual',
  ]) {
    const endpoint = require(pathname);
    const response = { statusCode: 200, body: null };
    const res = {
      setHeader() {},
      status(statusCode) {
        response.statusCode = statusCode;
        return this;
      },
      json(body) {
        response.body = body;
        return this;
      },
    };
    await endpoint(
      {
        method: 'POST',
        headers: {
          authorization: 'Bearer attacker-created-anonymous-session',
          'content-type': 'application/json',
          'x-celeste-client': 'ios',
          'x-celeste-request-id': 'celeste-forged-native-route-0001',
        },
        body: {},
      },
      res
    );
    assert.strictEqual(response.statusCode, 403, `${pathname} accepted a forged native claim`);
    assert.deepStrictEqual(response.body, { error: 'origin_not_allowed' });
  }
});
