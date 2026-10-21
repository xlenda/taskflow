const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const paidAccess = require('../api/_paid-access');
const playIntegrity = require('../api/_play-integrity');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');

const ENV_KEYS = [
  'CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64',
  'ELEVENLABS_API_KEY',
  'CELESTE_SUPABASE_URL',
  'CELESTE_SUPABASE_ANON_KEY',
  'CELESTE_SUPABASE_SERVICE_ROLE_KEY',
  'CELESTE_ACTOR_HASH_SECRET',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'CELESTE_ALLOW_LOCAL_NATIVE_BYPASS',
  'VERCEL_ENV',
  'VERCEL',
  'NODE_ENV',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;

function configure() {
  process.env.CELESTE_SUPABASE_URL = 'https://celeste.supabase.co';
  process.env.CELESTE_SUPABASE_ANON_KEY = 'public-anon-key';
  process.env.CELESTE_SUPABASE_SERVICE_ROLE_KEY = 'server-service-role-key';
  process.env.CELESTE_ACTOR_HASH_SECRET = 'actor-hmac-secret-with-at-least-32-bytes';
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  process.env.CELESTE_ALLOW_LOCAL_NATIVE_BYPASS = '0';
  process.env.VERCEL_ENV = 'production';
  process.env.VERCEL = '1';
  process.env.NODE_ENV = 'production';
  delete process.env.CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64;
  delete process.env.ELEVENLABS_API_KEY;
  paidAccess.resetAuthorizerForTests();
  playIntegrity.resetForTests();
}

function restore() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
  paidAccess.resetAuthorizerForTests();
  playIntegrity.resetForTests();
}

function request(overrides = {}) {
  return {
    headers: {
      authorization: 'Bearer valid-session-token',
      origin: 'https://celeste.example',
      'x-celeste-client': 'web',
      'x-celeste-request-id': 'celeste-test-request-0001',
      'x-vercel-forwarded-for': '203.0.113.10',
      ...(overrides.headers || {}),
    },
  };
}

test('paid Gemini access is identity-bound and quota-bound', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);

  const trustedRequest = request({
    headers: {
      'x-forwarded-for': '198.51.100.77',
      'x-vercel-forwarded-for': '203.0.113.10',
    },
  });
  const unspoofedRequest = request({
    headers: { 'x-vercel-forwarded-for': '203.0.113.10' },
  });
  assert.strictEqual(
    paidAccess._internals.deriveActorHash(
      trustedRequest,
      process.env.CELESTE_ACTOR_HASH_SECRET
    ),
    paidAccess._internals.deriveActorHash(
      unspoofedRequest,
      process.env.CELESTE_ACTOR_HASH_SECRET
    ),
    'x-forwarded-for controlado pelo cliente nao pode alterar o ator'
  );
  assert.strictEqual(
    paidAccess._internals.normalizeActorOrigin('2001:db8:abcd:12::1'),
    paidAccess._internals.normalizeActorOrigin('2001:db8:abcd:12:ffff:eeee:dddd:cccc'),
    'enderecos IPv6 do mesmo /64 precisam compartilhar a cota'
  );

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
      json: async () => ({
        allowed: true,
        duplicate: false,
        reserved: true,
        actorQuota: true,
        operationQuota: true,
      }),
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
  assert.match(reservation.p_actor_hash, /^[0-9a-f]{64}$/);
  assert.ok(!calls[1].options.body.includes('203.0.113.10'), 'IP bruto nao pode sair da funcao');
  assert.ok(!calls[1].options.body.includes('valid-session-token'));
  assert.strictEqual(allowed.actorQuota, 'enforced');
  assert.strictEqual(allowed.operationQuota, 'enforced');
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
    return {
      ok: false,
      status: 404,
      json: async () => ({ code: 'PGRST202', message: 'function not found' }),
    };
  };
  const migrationMissing = await paidAccess.authorizePaidRequest(request(), {
    operation: 'scene',
    units: 4,
  });
  assert.deepStrictEqual(migrationMissing, { error: 'spend_guard_unavailable', status: 503 });
  assert.strictEqual(calls.length, 2, 'API nova nao pode fazer downgrade para o RPC de quatro argumentos');
  assert.match(JSON.parse(calls[1].options.body).p_actor_hash, /^[0-9a-f]{64}$/);

  calls.length = 0;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) {
      return {
        ok: true,
        json: async () => ({ id: '00000000-0000-4000-8000-000000000001' }),
      };
    }
    return {
      ok: true,
      json: async () => ({ allowed: true, duplicate: false, actorQuota: true }),
    };
  };
  const operationQuotaMissing = await paidAccess.authorizePaidRequest(request(), {
    operation: 'scene',
    units: 4,
  });
  assert.deepStrictEqual(operationQuotaMissing, {
    error: 'spend_guard_unavailable',
    status: 503,
  });

  delete process.env.CELESTE_SUPABASE_URL;
  delete process.env.CELESTE_SUPABASE_ANON_KEY;
  delete process.env.CELESTE_SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://celeste-marketplace.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_marketplace';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_marketplace';
  calls.length = 0;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) {
      return {
        ok: true,
        json: async () => ({ id: '00000000-0000-4000-8000-000000000001' }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        allowed: true,
        duplicate: false,
        actorQuota: true,
        operationQuota: true,
      }),
    };
  };
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
  const spoofOnly = await paidAccess.authorizePaidRequest(
    request({
      headers: {
        'x-vercel-forwarded-for': '',
        'x-forwarded-for': '203.0.113.99',
      },
    }),
    { operation: 'scene', units: 4 }
  );
  assert.deepStrictEqual(spoofOnly, { error: 'spend_guard_unavailable', status: 503 });
  assert.strictEqual(calls.length, 0, 'header IP comum nao pode chegar ao Supabase');

  delete process.env.CELESTE_ACTOR_HASH_SECRET;
  const missingActorSecret = await paidAccess.authorizePaidRequest(request(), {
    operation: 'scene',
    units: 4,
  });
  assert.deepStrictEqual(missingActorSecret, {
    error: 'spend_guard_not_configured',
    status: 503,
  });
  assert.strictEqual(calls.length, 0, 'segredo ausente deve falhar antes de qualquer rede');
  process.env.CELESTE_ACTOR_HASH_SECRET = 'actor-hmac-secret-with-at-least-32-bytes';

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

test('rotating anonymous UUIDs shares one atomic actor quota', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);

  const actorUnits = new Map();
  const actorHashes = new Set();
  const receipts = new Set();
  const uuidFor = (index) =>
    `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;

  global.fetch = async (url, options) => {
    if (url.endsWith('/auth/v1/user')) {
      const token = options.headers.Authorization.replace(/^Bearer\s+/i, '');
      const index = Number(token.split('-').at(-1));
      return { ok: true, json: async () => ({ id: uuidFor(index) }) };
    }
    if (!url.endsWith('/rpc/celeste_reserve_generation_credit')) {
      throw new Error(`RPC inesperada no teste de ator: ${url}`);
    }
    const body = JSON.parse(options.body);
    assert.match(body.p_actor_hash, /^[0-9a-f]{64}$/);
    assert.ok(!options.body.includes('203.0.113.'), 'RPC nao pode conter IP bruto');
    actorHashes.add(body.p_actor_hash);

    // Force all promises to contend before the synchronous compare-and-update.
    await new Promise((resolve) => setImmediate(resolve));
    const receiptKey = `${body.p_user_id}:${body.p_request_id}`;
    if (receipts.has(receiptKey)) {
      return {
        ok: true,
        json: async () => ({ allowed: false, reason: 'duplicate', duplicate: true }),
      };
    }
    const current = actorUnits.get(body.p_actor_hash) || 0;
    if (current + body.p_units > 96) {
      return { ok: true, json: async () => ({ allowed: false, reason: 'actor_limit' }) };
    }
    actorUnits.set(body.p_actor_hash, current + body.p_units);
    receipts.add(receiptKey);
    return {
      ok: true,
      json: async () => ({
        allowed: true,
        duplicate: false,
        reserved: false,
        actorQuota: true,
        operationQuota: true,
      }),
    };
  };

  const attempts = Array.from({ length: 30 }, (_, index) =>
    paidAccess.authorizePaidRequest(
      request({
        headers: {
          authorization: `Bearer rotating-session-${index}`,
          'x-celeste-request-id': `celeste-rotation-${String(index).padStart(4, '0')}`,
          'x-forwarded-for': `198.51.100.${(index % 200) + 1}`,
          'x-vercel-forwarded-for': '203.0.113.45',
        },
      }),
      { operation: 'scene', units: 4 }
    )
  );
  const results = await Promise.all(attempts);
  assert.strictEqual(results.filter((result) => result.ok).length, 24);
  assert.strictEqual(
    results.filter(
      (result) => result.status === 429 && result.error === 'daily_generation_limit_reached'
    ).length,
    6
  );
  assert.strictEqual(actorHashes.size, 1, '30 UUIDs e headers forjados devem manter um ator');
  assert.deepStrictEqual([...actorUnits.values()], [96]);

  const boundaryIp = '203.0.113.46';
  const boundaryHash = paidAccess._internals.deriveActorHash(
    request({ headers: { 'x-vercel-forwarded-for': boundaryIp } }),
    process.env.CELESTE_ACTOR_HASH_SECRET
  );
  actorUnits.set(boundaryHash, 92);
  const boundary = await Promise.all([30, 31].map((index) =>
    paidAccess.authorizePaidRequest(
      request({
        headers: {
          authorization: `Bearer rotating-session-${index}`,
          'x-celeste-request-id': `celeste-boundary-${String(index).padStart(4, '0')}`,
          'x-vercel-forwarded-for': boundaryIp,
        },
      }),
      { operation: 'scene', units: 4 }
    )
  ));
  assert.strictEqual(boundary.filter((result) => result.ok).length, 1);
  assert.strictEqual(boundary.filter((result) => result.status === 429).length, 1);
  assert.strictEqual(actorUnits.get(boundaryHash), 96);
});

test('migrations 008-012 and paid routes keep operation accounting fail-closed', () => {
  const root = path.resolve(__dirname, '..');
  const migration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '008_generation_actor_quota.sql'),
    'utf8'
  );
  const contractMigration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '009_disable_legacy_generation_reserve.sql'),
    'utf8'
  );
  const operationMigration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '010_generation_operation_quotas.sql'),
    'utf8'
  );
  const visualCapacityMigration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '012_secondary_vision_visual_capacity.sql'),
    'utf8'
  );
  const paidSource = fs.readFileSync(path.join(root, 'api', '_paid-access.js'), 'utf8');

  assert.match(migration, /actor_daily_units\s+integer\s+not null\s+default 96/i);
  assert.match(migration, /actor_schema_version\s+integer\s+not null\s+default 8/i);
  assert.match(migration, /celeste_generation_actor_quota_version/i);
  assert.doesNotMatch(
    migration,
    /update\s+public\.celeste_generation_policy[\s\S]{0,160}actor_daily_units\s*=\s*96/i,
    'reaplicar 008 nao pode apagar um limite administrativo'
  );
  assert.match(migration, /primary key\s*\(usage_day, actor_hash\)/i);
  assert.match(migration, /celeste_generation_actor_usage enable row level security/i);
  assert.match(migration, /actor_hash is null or actor_hash ~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(migration, /p_actor_hash is null[\s\S]*p_actor_hash !~ '\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(
    migration,
    /celeste_reserve_generation_credit\s*\(\s*p_user_id uuid,\s*p_request_id text,\s*p_operation text,\s*p_units integer,\s*p_actor_hash text\s*\)/i
  );
  assert.match(
    migration,
    /revoke all on function public\.celeste_reserve_generation_credit\(uuid, text, text, integer, text\)[\s\S]*from public, anon, authenticated/i
  );
  assert.match(
    migration,
    /grant execute on function public\.celeste_reserve_generation_credit\(uuid, text, text, integer, text\)[\s\S]*to service_role/i
  );
  assert.match(migration, /celeste_generation_actor_usage[\s\S]*for update/i);
  assert.match(migration, /actorRemaining/i);
  assert.match(migration, /'actorQuota', true/i);
  assert.doesNotMatch(migration, /'reason', 'actor_required'/i);
  assert.match(contractMigration, /'reason', 'actor_required'/i);
  assert.match(contractMigration, /actor_schema_version\s*=\s*9/i);
  assert.match(contractMigration, /actor_legacy_reserve_disabled\s*=\s*true/i);
  assert.match(
    contractMigration,
    /celeste_reserve_generation_credit\s*\(\s*p_user_id uuid,\s*p_request_id text,\s*p_operation text,\s*p_units integer\s*\)/i
  );
  assert.ok(
    (migration.match(/greatest\(0, a\.units - v_receipt\.units\)/gi) || []).length >= 2,
    'release explicito e expirado devem devolver a cota do ator'
  );
  assert.match(migration, /notify pgrst, 'reload schema'/i);

  assert.match(operationMigration, /actor_schema_version\s+between 8 and 10/i);
  assert.match(operationMigration, /actor_schema_version\s*=\s*10/i);
  assert.match(
    operationMigration,
    /per_user_daily_units\s*=\s*greatest\(per_user_daily_units, 480\)/i
  );
  assert.match(
    operationMigration,
    /actor_daily_units\s*=\s*greatest\(actor_daily_units, 960\)/i
  );
  assert.doesNotMatch(
    operationMigration,
    /global_daily_units\s*=/i,
    'migration 010 deve preservar o teto global ponderado administrado'
  );
  assert.match(operationMigration, /celeste_generation_operation_policy/i);
  assert.match(
    operationMigration,
    /\('scene', 32, 64, array\[4, 12\]::smallint\[\]\)/i
  );
  assert.match(
    operationMigration,
    /\('visual', 128, 256, array\[8\]::smallint\[\]\)/i
  );
  assert.match(
    visualCapacityMigration,
    /\('visual', 176, 352, array\[8\]::smallint\[\], true\)/i
  );
  assert.match(
    operationMigration,
    /\('audio', 320, 640, array\[1, 4, 8, 12, 16, 20\]::smallint\[\]\)/i
  );
  assert.match(operationMigration, /primary key \(usage_day, user_id, operation\)/i);
  assert.match(operationMigration, /primary key \(usage_day, actor_hash, operation\)/i);
  assert.match(operationMigration, /operation_quota_counted boolean not null default false/i);
  assert.match(
    operationMigration,
    /where r\.status in \('reserved', 'committed'\)[\s\S]*group by r\.usage_day, r\.user_id, r\.operation/i
  );
  assert.match(
    operationMigration,
    /set operation_quota_counted = true[\s\S]*where status in \('reserved', 'committed'\)/i
  );
  assert.match(operationMigration, /p_units = any\(v_operation_policy\.allowed_units\)/i);
  assert.match(operationMigration, /'reason', 'user_operation_limit'/i);
  assert.match(operationMigration, /'reason', 'actor_operation_limit'/i);
  assert.match(operationMigration, /'operationQuota', true/i);
  assert.match(operationMigration, /'weightedGlobalQuota', true/i);
  assert.ok(
    (operationMigration.match(/celeste_generation_actor_operation_usage a[\s\S]{0,180}greatest\(0, a\.units - v_receipt\.units\)/gi) || []).length >= 2,
    'release expirado e explicito devem devolver a cota ator/operacao'
  );
  assert.ok(
    (operationMigration.match(/celeste_generation_user_operation_usage u[\s\S]{0,180}greatest\(0, u\.units - v_receipt\.units\)/gi) || []).length >= 2,
    'release expirado e explicito devem devolver a cota usuario/operacao'
  );
  assert.match(
    operationMigration,
    /revoke all on table public\.celeste_generation_operation_policy[\s\S]*from public, anon, authenticated/i
  );
  assert.match(operationMigration, /notify pgrst, 'reload schema'/i);
  assert.strictEqual(12 + (13 * 8), 116, '6+6 e visual ancora precisam de 116 unidades');
  assert.ok(
    480 - 116 >= (6 * 32) + (6 * 16),
    'jornada completa precisa cobrir seis visoes longas e seis afirmacoes maximas'
  );

  assert.match(paidSource, /TRUSTED_VERCEL_IP_HEADER\s*=\s*'x-vercel-forwarded-for'/);
  assert.doesNotMatch(paidSource, /headers\[['"]x-forwarded-for['"]\]/);
  assert.match(paidSource, /createHmac\('sha256', secret\)/);
  assert.doesNotMatch(paidSource, /PGRST202|legacy_schema/);
  assert.match(paidSource, /p_actor_hash:\s*input\.actorHash/);
  assert.match(paidSource, /result\.operationQuota\s*!==\s*true/);
  assert.match(paidSource, /operationQuota:\s*'enforced'/);

  const routeMarkers = [
    ['api/gerar-cena.js', 'providerSession.generate('],
    ['api/traduzir-cena.js', 'requestGemini(validated.value'],
    ['api/transformar-sonho.js', 'dream = await requestGemini('],
    ['api/gerar-audio.js', 'requestElevenLabs(validated.value'],
    ['api/gerar-visual.js', 'requestGemini(validated.value'],
  ];
  for (const [filename, providerMarker] of routeMarkers) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    const quotaIndex = source.indexOf('paidAccess.authorizePaidRequest(req');
    const providerIndex = source.indexOf(providerMarker, quotaIndex);
    assert.ok(quotaIndex >= 0 && providerIndex > quotaIndex, `${filename} chama provider antes da cota`);
    assert.doesNotMatch(source, /actor_?hash/i, `${filename} permite escolher actor_hash publicamente`);
    if (filename === 'api/gerar-cena.js' || filename === 'api/gerar-visual.js') {
      const commitIndex = source.indexOf('paidAccess.commitPaidRequest(access)', quotaIndex);
      const releaseIndex = source.indexOf('paidAccess.releasePaidRequest(access)', commitIndex);
      assert.ok(
        quotaIndex < commitIndex && commitIndex < releaseIndex && releaseIndex < providerIndex,
        `${filename} nao limita release ao trecho anterior ao provider`
      );
      assert.strictEqual(
        source.indexOf('paidAccess.releasePaidRequest(access)', releaseIndex + 1),
        -1,
        `${filename} devolve cota depois de chamar o provider`
      );
    }
  }
});

// Android voice: Play Integrity "standard request". Docs:
// developer.android.com/google/play/integrity/standard (decodeIntegrityToken) and
// developer.android.com/google/play/integrity/verdicts (payload fields).
const PLAY_PACKAGE = 'com.celesteapp.affirmations';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PLAY_DECODE_URL = `https://playintegrity.googleapis.com/v1/${PLAY_PACKAGE}:decodeIntegrityToken`;
const ACTOR_SECRET = 'actor-hmac-secret-with-at-least-32-bytes';
const SERVICE_EMAIL = 'play-integrity@celeste-test.iam.gserviceaccount.com';
const integrityKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SERVICE_ACCOUNT_B64 = Buffer.from(
  JSON.stringify({
    type: 'service_account',
    project_id: 'celeste-test',
    private_key_id: 'test-key-id',
    private_key: integrityKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    client_email: SERVICE_EMAIL,
  })
).toString('base64');
const INTEGRITY_TOKEN = 'play-integrity-token.0001-abcdefghijklmnop';
const VOICE_REQUEST_ID = 'celeste-android-voice-0001';
const voiceBody = Object.freeze({
  mode: 'personal',
  narratorId: 'serena',
  lang: 'pt',
  text: 'Eu escolho ouvir a minha voz com calma e coragem.',
  cloudConsent: true,
  cloudConsentVersion: CLOUD_CONSENT_VERSION,
  adultConfirmed: true,
});
const NATIVE_DENIED = Object.freeze({ error: 'native_attestation_required', status: 403 });

const sha256Hex = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
// Independent oracle of the canonical request hash (services/appIntegrity.js and
// api/_play-integrity.js must both produce exactly this value).
const expectedRequestHash = (operation, requestId, body) =>
  sha256Hex(
    ['celeste-play-integrity-v1', operation, requestId, sha256Hex(JSON.stringify(body))].join('\n')
  );
const nativePoolActor = crypto
  .createHmac('sha256', ACTOR_SECRET)
  .update('celeste-native-voice-pool-v1', 'utf8')
  .digest('hex');

function nativeVoiceRequest({ headers = {}, body = voiceBody } = {}) {
  return {
    method: 'POST',
    headers: {
      authorization: 'Bearer android-anonymous-session',
      'content-type': 'application/json',
      'x-celeste-client': 'android',
      'x-celeste-request-id': VOICE_REQUEST_ID,
      'x-celeste-integrity': INTEGRITY_TOKEN,
      'x-vercel-forwarded-for': '203.0.113.20',
      ...headers,
    },
    body,
  };
}

function validVerdict(mutate) {
  const payload = {
    requestDetails: {
      requestPackageName: PLAY_PACKAGE,
      requestHash: expectedRequestHash('audio', VOICE_REQUEST_ID, voiceBody),
      timestampMillis: String(Date.now() - 1000),
    },
    appIntegrity: {
      appRecognitionVerdict: 'PLAY_RECOGNIZED',
      packageName: PLAY_PACKAGE,
      certificateSha256Digest: ['test-certificate-digest'],
      versionCode: '7',
    },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
    accountDetails: { appLicensingVerdict: 'LICENSED' },
  };
  if (mutate) mutate(payload);
  return payload;
}

function googleAndSupabase(state) {
  state.calls = [];
  state.jwts = [];
  state.decodes = [];
  state.reservations = [];
  state.elevenLabs = 0;
  return async (url, options = {}) => {
    state.calls.push(url);
    if (url === GOOGLE_TOKEN_URL) {
      const form = new URLSearchParams(options.body);
      const [header, claims, signature] = String(form.get('assertion') || '').split('.');
      state.jwts.push({
        grantType: form.get('grant_type'),
        header: JSON.parse(Buffer.from(header, 'base64url').toString('utf8')),
        claims: JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')),
        signed: crypto.verify(
          'sha256',
          Buffer.from(`${header}.${claims}`),
          integrityKeys.publicKey,
          Buffer.from(signature, 'base64url')
        ),
      });
      if (state.tokenStatus) {
        return { ok: false, status: state.tokenStatus, json: async () => ({ error: 'unavailable' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'google-access-token', expires_in: 3599, token_type: 'Bearer' }),
      };
    }
    if (url === PLAY_DECODE_URL) {
      state.decodes.push({
        method: options.method,
        authorization: options.headers && options.headers.Authorization,
        body: JSON.parse(options.body),
      });
      if (state.decodeStatus) {
        return { ok: false, status: state.decodeStatus, json: async () => ({ error: { code: state.decodeStatus } }) };
      }
      return { ok: true, status: 200, json: async () => ({ tokenPayloadExternal: state.verdict }) };
    }
    if (url.endsWith('/auth/v1/user')) {
      return {
        ok: true,
        json: async () => ({ id: '00000000-0000-4000-8000-0000000000aa', is_anonymous: true }),
      };
    }
    if (url.endsWith('/rpc/celeste_reserve_generation_credit')) {
      state.reservations.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({
          allowed: true,
          duplicate: false,
          reserved: false,
          actorQuota: true,
          operationQuota: true,
        }),
      };
    }
    if (url.startsWith('https://api.elevenlabs.io/')) {
      state.elevenLabs += 1;
      const pcm = Buffer.from([0, 0, 1, 0, 255, 255, 2, 0]);
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'audio/pcm' : null) },
        arrayBuffer: async () => pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength),
      };
    }
    throw new Error(`URL inesperada no teste Play Integrity: ${url}`);
  };
}

const reachedSupabase = (state) => state.calls.some((url) => url.includes('supabase.co'));

test('Android voice passes only with a Play Integrity verdict bound to the request', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  process.env.CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64 = SERVICE_ACCOUNT_B64;
  const state = { verdict: validVerdict() };
  global.fetch = googleAndSupabase(state);

  const allowed = await paidAccess.authorizePaidRequest(nativeVoiceRequest(), {
    operation: 'audio',
    units: 4,
  });
  assert.strictEqual(allowed.ok, true, JSON.stringify(allowed));
  assert.strictEqual(allowed.native, true);
  assert.deepStrictEqual(
    state.calls,
    [
      GOOGLE_TOKEN_URL,
      PLAY_DECODE_URL,
      'https://celeste.supabase.co/auth/v1/user',
      'https://celeste.supabase.co/rest/v1/rpc/celeste_reserve_generation_credit',
    ],
    'Google precisa validar antes de identidade e cota'
  );
  assert.strictEqual(state.jwts.length, 1);
  const [jwt] = state.jwts;
  assert.strictEqual(jwt.signed, true, 'JWT da conta de servico precisa ser RS256 valido');
  assert.strictEqual(jwt.grantType, 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  assert.deepStrictEqual(jwt.header, { alg: 'RS256', typ: 'JWT', kid: 'test-key-id' });
  assert.strictEqual(jwt.claims.iss, SERVICE_EMAIL);
  assert.strictEqual(jwt.claims.scope, 'https://www.googleapis.com/auth/playintegrity');
  assert.strictEqual(jwt.claims.aud, GOOGLE_TOKEN_URL);
  assert.ok(jwt.claims.exp > jwt.claims.iat && jwt.claims.exp - jwt.claims.iat <= 3600);
  assert.deepStrictEqual(state.decodes, [
    {
      method: 'POST',
      authorization: 'Bearer google-access-token',
      body: { integrityToken: INTEGRITY_TOKEN },
    },
  ]);
  assert.strictEqual(state.reservations.length, 1);
  assert.strictEqual(state.reservations[0].p_operation, 'audio');
  assert.strictEqual(state.reservations[0].p_units, 4);
  assert.strictEqual(
    state.reservations[0].p_actor_hash,
    nativePoolActor,
    'toda voz nativa verificada divide um ator: a cota de ator do audio vira o teto diario do Android'
  );
  assert.notStrictEqual(
    nativePoolActor,
    paidAccess._internals.deriveActorHash(nativeVoiceRequest(), ACTOR_SECRET),
    'voz nativa nao pode cair na cota por IP do site'
  );

  const secondId = 'celeste-android-voice-0002';
  state.verdict = validVerdict((payload) => {
    payload.requestDetails.requestHash = expectedRequestHash('audio', secondId, voiceBody);
  });
  const second = await paidAccess.authorizePaidRequest(
    nativeVoiceRequest({
      headers: { 'x-celeste-request-id': secondId, 'x-vercel-forwarded-for': '198.51.100.30' },
    }),
    { operation: 'audio', units: 4 }
  );
  assert.strictEqual(second.ok, true, JSON.stringify(second));
  assert.strictEqual(state.jwts.length, 1, 'token de acesso do Google deve ser reutilizado ate expirar');
  assert.strictEqual(state.reservations[1].p_actor_hash, nativePoolActor, 'outra rede, mesmo teto nativo');
});

test('Play Integrity failures keep native voice closed before identity and quota', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  process.env.CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64 = SERVICE_ACCOUNT_B64;
  assert.strictEqual(playIntegrity.MAX_TOKEN_AGE_MS, 2 * 60 * 1000, 'janela documentada do token: 2 minutos');
  const otherBody = { ...voiceBody, text: 'Outro texto pago por quem roubou o token.' };
  const cases = [
    ['pacote errado', { verdict: validVerdict((p) => { p.requestDetails.requestPackageName = 'com.attacker.clone'; }) }],
    ['app fora da Play', { verdict: validVerdict((p) => { p.appIntegrity.appRecognitionVerdict = 'UNRECOGNIZED_VERSION'; }) }],
    ['token reaproveitado (Google apaga o veredito)', {
      verdict: validVerdict((p) => {
        p.appIntegrity = { appRecognitionVerdict: 'UNEVALUATED' };
        p.deviceIntegrity = {};
      }),
    }],
    ['aparelho so com integridade basica', { verdict: validVerdict((p) => { p.deviceIntegrity.deviceRecognitionVerdict = ['MEETS_BASIC_INTEGRITY']; }) }],
    ['aparelho sem veredito', { verdict: validVerdict((p) => { delete p.deviceIntegrity.deviceRecognitionVerdict; }) }],
    ['hash de outro corpo', { verdict: validVerdict((p) => { p.requestDetails.requestHash = expectedRequestHash('audio', VOICE_REQUEST_ID, otherBody); }) }],
    ['hash de outro pedido', { verdict: validVerdict((p) => { p.requestDetails.requestHash = expectedRequestHash('audio', 'celeste-android-voice-9999', voiceBody); }) }],
    ['hash de outra operacao', { verdict: validVerdict((p) => { p.requestDetails.requestHash = expectedRequestHash('visual', VOICE_REQUEST_ID, voiceBody); }) }],
    ['token velho', { verdict: validVerdict((p) => { p.requestDetails.timestampMillis = String(Date.now() - (2 * 60 * 1000) - 5000); }) }],
    ['token do futuro', { verdict: validVerdict((p) => { p.requestDetails.timestampMillis = String(Date.now() + (5 * 60 * 1000)); }) }],
    ['Google recusa o token', { verdict: validVerdict(), decodeStatus: 400 }],
    ['Google sem resposta', { verdict: validVerdict(), tokenStatus: 503 }],
  ];
  for (const [label, scenario] of cases) {
    playIntegrity.resetForTests();
    const state = { ...scenario };
    global.fetch = googleAndSupabase(state);
    const result = await paidAccess.authorizePaidRequest(nativeVoiceRequest(), {
      operation: 'audio',
      units: 4,
    });
    assert.deepStrictEqual(result, NATIVE_DENIED, label);
    assert.ok(!reachedSupabase(state), `${label}: Supabase nao pode ser chamado sem veredito valido`);
  }
});

test('native claims without a usable attestation never reach Google, identity or quota', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  process.env.CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64 = SERVICE_ACCOUNT_B64;
  const state = { verdict: validVerdict() };
  global.fetch = googleAndSupabase(state);

  const scenarios = [
    ['Android sem token', nativeVoiceRequest({ headers: { 'x-celeste-integrity': '' } }), 'audio'],
    ['token com espaco', nativeVoiceRequest({ headers: { 'x-celeste-integrity': 'token forjado com espaco' } }), 'audio'],
    ['iOS com token', nativeVoiceRequest({ headers: { 'x-celeste-client': 'ios' } }), 'audio'],
    ['cena pelo Android', nativeVoiceRequest(), 'scene'],
    ['imagem pelo Android', nativeVoiceRequest(), 'visual'],
    ['sonho pelo Android', nativeVoiceRequest(), 'dream'],
    ['traducao pelo Android', nativeVoiceRequest(), 'translation'],
  ];
  for (const [label, req, operation] of scenarios) {
    const result = await paidAccess.authorizePaidRequest(req, {
      operation,
      units: operation === 'visual' ? 8 : operation === 'audio' ? 4 : 3,
    });
    assert.deepStrictEqual(result, NATIVE_DENIED, label);
    assert.deepStrictEqual(state.calls, [], `${label}: nada pode sair da funcao`);
  }

  for (const [label, value] of [
    ['sem credencial do Google', undefined],
    ['credencial sem chave privada', Buffer.from(JSON.stringify({ type: 'authorized_user', client_email: SERVICE_EMAIL })).toString('base64')],
    ['credencial sem e-mail da conta', Buffer.from(JSON.stringify({ type: 'service_account', private_key: integrityKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }) })).toString('base64')],
    ['credencial ilegivel', 'isto-nao-e-json-em-base64'],
  ]) {
    playIntegrity.resetForTests();
    if (value === undefined) delete process.env.CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64;
    else process.env.CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64 = value;
    const result = await paidAccess.authorizePaidRequest(nativeVoiceRequest(), {
      operation: 'audio',
      units: 4,
    });
    assert.deepStrictEqual(result, NATIVE_DENIED, label);
    assert.deepStrictEqual(state.calls, [], `${label}: fechado sem chamar Google nem Supabase`);
  }

  assert.strictEqual(paidAccess.isNativeRequest(nativeVoiceRequest()), true, 'Android com token passa so o pre-filtro');
  assert.strictEqual(paidAccess.isNativeRequest(nativeVoiceRequest({ headers: { 'x-celeste-integrity': '' } })), false);
  assert.strictEqual(paidAccess.isNativeRequest(nativeVoiceRequest({ headers: { 'x-celeste-client': 'ios' } })), false);
  assert.strictEqual(
    paidAccess.isNativeRequest(nativeVoiceRequest({ headers: { origin: 'https://celeste.example' } })),
    false,
    'navegador nunca vira cliente nativo'
  );

  // The explicit local development bypass keeps its old behaviour: no Google
  // call and the per-origin actor, never the native pool.
  process.env.CELESTE_ALLOW_LOCAL_NATIVE_BYPASS = '1';
  process.env.VERCEL_ENV = 'development';
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL;
  const bypassed = await paidAccess.authorizePaidRequest(
    {
      ...nativeVoiceRequest({ headers: { 'x-celeste-integrity': '' } }),
      socket: { remoteAddress: '127.0.0.1' },
    },
    { operation: 'scene', units: 4 }
  );
  assert.strictEqual(bypassed.ok, true, JSON.stringify(bypassed));
  assert.ok(!state.calls.some((url) => url.includes('googleapis.com')), 'bypass local nao chama o Google');
  assert.notStrictEqual(state.reservations.at(-1).p_actor_hash, nativePoolActor);
});

test('gerar-audio serves verified Android voice and refuses a body changed after the token', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  process.env.CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64 = SERVICE_ACCOUNT_B64;
  process.env.ELEVENLABS_API_KEY = 'elevenlabs-route-test-secret';
  const audioRoute = require('../api/gerar-audio');
  const response = () => ({
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  });

  for (const body of [voiceBody, JSON.stringify(voiceBody)]) {
    playIntegrity.resetForTests();
    const state = { verdict: validVerdict() };
    global.fetch = googleAndSupabase(state);
    const served = response();
    await audioRoute(nativeVoiceRequest({ body }), served);
    assert.strictEqual(served.statusCode, 200, JSON.stringify(served.body));
    assert.strictEqual(served.headers['content-type'], 'audio/wav');
    assert.strictEqual(state.elevenLabs, 1);
  }

  playIntegrity.resetForTests();
  const tamperedState = { verdict: validVerdict() };
  global.fetch = googleAndSupabase(tamperedState);
  const tampered = response();
  await audioRoute(
    nativeVoiceRequest({ body: { ...voiceBody, text: 'Texto trocado depois do token ser emitido.' } }),
    tampered
  );
  assert.strictEqual(tampered.statusCode, 403);
  assert.deepStrictEqual(tampered.body, { error: 'native_attestation_required' });
  assert.strictEqual(tamperedState.elevenLabs, 0, 'ElevenLabs nao pode ser chamado com corpo adulterado');
  assert.ok(!reachedSupabase(tamperedState));
});

test('Play Integrity module stays dependency-free, silent and pinned to the documented checks', () => {
  const root = path.resolve(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'api', '_play-integrity.js'), 'utf8');
  const paidSource = fs.readFileSync(path.join(root, 'api', '_paid-access.js'), 'utf8');
  assert.deepStrictEqual(
    [...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]),
    ['crypto'],
    'o deploy empacota so o botid: _play-integrity.js nao pode depender de pacote npm'
  );
  assert.doesNotMatch(
    `${source}\n${paidSource}`,
    /console\.(?:log|info|warn|error|debug)/,
    'credencial do Google e token de integridade nunca podem ir para log'
  );
  assert.strictEqual(playIntegrity.PACKAGE_NAME, PLAY_PACKAGE);
  assert.strictEqual(playIntegrity.NATIVE_OPERATION, 'audio');
  assert.match(paidSource, /require\('\.\/_play-integrity'\)/);
  assert.match(source, /CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64/);
});
