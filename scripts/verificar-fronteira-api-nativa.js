const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { transformSync } = require('@babel/core');
const playIntegrity = require('../api/_play-integrity');

const root = path.resolve(__dirname, '..');
const PROJECT_NUMBER_ENV = 'EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER';
const originalProjectNumber = process.env[PROJECT_NUMBER_ENV];

function loadEsm(relativePath, mocks) {
  const filename = path.join(root, relativePath);
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    babelrc: false,
    configFile: false,
  }).code;
  const module = { exports: {} };
  const localRequire = (name) =>
    Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : require(name);
  new Function('require', 'module', 'exports', 'process', compiled)(
    localRequire,
    module,
    module.exports,
    process
  );
  return module.exports;
}

function fakeAppIntegrity({ prepareError = null, results = [] } = {}) {
  const calls = { prepare: [], request: [] };
  return {
    calls,
    module: {
      prepareIntegrityTokenProviderAsync: async (projectNumber) => {
        calls.prepare.push(projectNumber);
        if (prepareError) throw prepareError;
      },
      requestIntegrityCheckAsync: async (requestHash) => {
        calls.request.push(requestHash);
        const next = results.length ? results.shift() : 'device-integrity-token';
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

function loadClient(platform, { projectNumber = '', integrity = fakeAppIntegrity(), session = null } = {}) {
  if (projectNumber) process.env[PROJECT_NUMBER_ENV] = projectNumber;
  else delete process.env[PROJECT_NUMBER_ENV];
  const reactNative = { Platform: { OS: platform } };
  const storage = loadEsm('services/narrationAudioStorage.js', {
    'expo-file-system': { Directory: class TestDirectory {}, File: class TestFile {}, Paths: {} },
    'react-native': reactNative,
  });
  const appIntegrity = loadEsm('services/appIntegrity.js', {
    '@expo/app-integrity': integrity.module,
    './narrationAudioStorage': storage,
    'react-native': reactNative,
  });
  const supabaseCalls = { count: 0 };
  const api = loadEsm('services/celesteApiSession.js', {
    './appIntegrity': appIntegrity,
    './celesteSupabase': {
      getCelesteSupabaseClient: () => ({
        auth: {
          getSession: async () => {
            supabaseCalls.count += 1;
            return { data: { session }, error: null };
          },
          signInAnonymously: async () => {
            supabaseCalls.count += 1;
            return { data: { session: { access_token: 'native-anonymous-session' } }, error: null };
          },
        },
      }),
    },
    'react-native': reactNative,
  });
  return { api, appIntegrity, integrity, supabaseCalls };
}

const sha256Hex = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
// Independent oracle of the canonical request hash checked by api/_play-integrity.js.
const oracleRequestHash = (operation, requestId, body) =>
  sha256Hex(['celeste-play-integrity-v1', operation, requestId, sha256Hex(body)].join('\n'));
const attestationRequired = (error) =>
  error &&
  error.message === 'native_attestation_required' &&
  error.code === 'native_attestation_required';
const CLOSED = (client) => ({ available: false, client, reason: 'native_attestation_required' });
const voiceBody = JSON.stringify({
  mode: 'personal',
  narratorId: 'serena',
  lang: 'pt',
  text: 'Você escolhe a própria voz ✨ e respira com calma.',
  cloudConsent: true,
  cloudConsentVersion: 'test-consent',
  adultConfirmed: true,
});

async function assertClosedBeforeCloud(client, label, call) {
  await assert.rejects(call, attestationRequired, label);
  assert.strictEqual(client.supabaseCalls.count, 0, `${label}: Supabase contatado sem atestacao`);
}

async function verifyIosStaysLocal() {
  const ios = loadClient('ios', { projectNumber: '123456789012' });
  assert.deepStrictEqual(ios.api.celesteCloudAccessCapability(), CLOSED('ios'));
  assert.deepStrictEqual(ios.api.celesteCloudAccessCapability('ios', 'audio'), CLOSED('ios'));
  await assertClosedBeforeCloud(ios, 'iOS sem operacao', () => ios.api.celestePaidApiHeaders());
  await assertClosedBeforeCloud(ios, 'iOS voz', () =>
    ios.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  await assertClosedBeforeCloud(ios, 'iOS sessao', () => ios.api.getCelesteApiSession());
  assert.strictEqual(ios.integrity.calls.prepare.length + ios.integrity.calls.request.length, 0);
}

async function verifyAndroidOnlyOpensVerifiedVoice() {
  const unconfigured = loadClient('android');
  assert.deepStrictEqual(unconfigured.api.celesteCloudAccessCapability(), CLOSED('android'));
  assert.deepStrictEqual(
    unconfigured.api.celesteCloudAccessCapability('android', 'audio'),
    CLOSED('android'),
    'sem numero do projeto Google Cloud a voz nativa continua fechada'
  );
  await assertClosedBeforeCloud(unconfigured, 'Android voz sem projeto', () =>
    unconfigured.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  assert.strictEqual(unconfigured.integrity.calls.prepare.length, 0);

  const android = loadClient('android', { projectNumber: '123456789012' });
  assert.deepStrictEqual(android.api.celesteCloudAccessCapability('android', 'audio'), {
    available: true,
    client: 'android',
    reason: null,
  });
  assert.deepStrictEqual(
    android.api.celesteCloudAccessCapability('ios', 'audio'),
    CLOSED('ios'),
    'a voz verificada e so do Android'
  );
  for (const operation of ['scene', 'visual', 'dream', 'translation']) {
    assert.deepStrictEqual(android.api.celesteCloudAccessCapability('android', operation), CLOSED('android'));
    await assertClosedBeforeCloud(android, `Android ${operation}`, () =>
      android.api.celestePaidApiHeaders({ operation, body: voiceBody })
    );
  }
  await assertClosedBeforeCloud(android, 'Android sem operacao (chamadas antigas)', () =>
    android.api.celestePaidApiHeaders()
  );
  await assertClosedBeforeCloud(android, 'Android voz sem corpo exato', () =>
    android.api.celestePaidApiHeaders({ operation: 'audio' })
  );
  await assertClosedBeforeCloud(android, 'Android sessao generica', () => android.api.getCelesteApiSession());
  assert.strictEqual(android.integrity.calls.request.length, 0, 'so a voz pode pedir token de integridade');

  const headers = await android.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  const requestId = headers['X-Celeste-Request-Id'];
  assert.match(requestId, /^celeste-[a-z0-9]+-[a-z0-9]+$/);
  assert.deepStrictEqual(headers, {
    Authorization: 'Bearer native-anonymous-session',
    'X-Celeste-Client': 'android',
    'X-Celeste-Request-Id': requestId,
    'X-Celeste-Integrity': 'device-integrity-token',
  });
  assert.deepStrictEqual(android.integrity.calls.prepare, ['123456789012']);
  assert.deepStrictEqual(android.integrity.calls.request, [
    oracleRequestHash('audio', requestId, voiceBody),
  ]);
  assert.strictEqual(
    android.integrity.calls.request[0],
    playIntegrity.requestHashFor({
      operation: 'audio',
      requestId,
      bodyHash: playIntegrity.requestBodyHash(JSON.parse(voiceBody)),
    }),
    'app e servidor precisam calcular o mesmo hash do pedido'
  );
  await android.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.deepStrictEqual(android.integrity.calls.prepare, ['123456789012'], 'provedor preparado uma vez');
}

async function verifyAndroidIntegrityFailuresStayLocal() {
  const integrityError = (code) => Object.assign(new Error(code), { code });

  const failing = loadClient('android', {
    projectNumber: '123456789012',
    integrity: fakeAppIntegrity({ results: [integrityError('ERR_APP_INTEGRITY_NETWORK_ERROR')] }),
  });
  await assertClosedBeforeCloud(failing, 'Play Integrity falhou', () =>
    failing.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );

  const emptyToken = loadClient('android', {
    projectNumber: '123456789012',
    integrity: fakeAppIntegrity({ results: [''] }),
  });
  await assertClosedBeforeCloud(emptyToken, 'token vazio', () =>
    emptyToken.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );

  const expired = loadClient('android', {
    projectNumber: '123456789012',
    integrity: fakeAppIntegrity({
      results: [integrityError('ERR_APP_INTEGRITY_PROVIDER_INVALID'), 'fresh-integrity-token'],
    }),
  });
  const renewed = await expired.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.strictEqual(renewed['X-Celeste-Integrity'], 'fresh-integrity-token');
  assert.strictEqual(expired.integrity.calls.prepare.length, 2, 'provedor expirado e preparado de novo uma vez');

  const unprepared = loadClient('android', {
    projectNumber: '123456789012',
    integrity: fakeAppIntegrity({ prepareError: integrityError('ERR_APP_INTEGRITY_PLAY_STORE_NOT_FOUND') }),
  });
  await assertClosedBeforeCloud(unprepared, 'Play Store ausente', () =>
    unprepared.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  await assertClosedBeforeCloud(unprepared, 'Play Store ausente (repeticao)', () =>
    unprepared.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  assert.strictEqual(
    unprepared.integrity.calls.prepare.length,
    1,
    'a Play aceita 5 preparos por minuto: falha nao pode virar loop'
  );
  assert.strictEqual(
    await unprepared.appIntegrity.integrityHeaderFor({ operation: 'audio', requestId: 'x', bodyHash: 'y' }),
    null,
    'integrityHeaderFor nunca lanca para quem chama'
  );
}

async function verifyWebUnchanged() {
  const web = loadClient('web', {
    projectNumber: '123456789012',
    session: { access_token: 'verified-web-session' },
  });
  assert.deepStrictEqual(web.api.celesteCloudAccessCapability(), { available: true, client: 'web', reason: null });
  const headers = await web.api.celestePaidApiHeaders();
  assert.strictEqual(web.supabaseCalls.count, 1);
  assert.strictEqual(headers.Authorization, 'Bearer verified-web-session');
  assert.strictEqual(headers['X-Celeste-Client'], 'web');
  assert.match(headers['X-Celeste-Request-Id'], /^celeste-[a-z0-9]+-[a-z0-9]+$/);
  assert.ok(!('X-Celeste-Integrity' in headers), 'site nao usa Play Integrity');
  assert.strictEqual(web.integrity.calls.prepare.length + web.integrity.calls.request.length, 0);
}

function verifyServerBoundarySource() {
  const paidAccess = fs.readFileSync(path.join(root, 'api', '_paid-access.js'), 'utf8');
  assert.match(paidAccess, /X-Celeste-Client is attacker-controlled/);
  assert.match(paidAccess, /localNativeBypassEnabled\(\)/);
  assert.match(paidAccess, /CELESTE_ALLOW_LOCAL_NATIVE_BYPASS === '1'/);
  assert.match(paidAccess, /process\.env\.VERCEL_ENV === 'development'/);
  assert.match(paidAccess, /process\.env\.NODE_ENV !== 'production'/);
  assert.match(
    paidAccess,
    /clientKind\(req\) === 'android' && Boolean\(playIntegrity\.integrityToken\(req\)\)/,
    'so Android com token passa o pre-filtro nativo'
  );
  assert.match(
    paidAccess,
    /attestNative && operation !== playIntegrity\.NATIVE_OPERATION/,
    'Play Integrity abre so a voz'
  );
  const verifyIndex = paidAccess.indexOf('playIntegrity.verifyPlayIntegrity(req');
  const identityIndex = paidAccess.indexOf('await authenticatedUser(config, token)');
  assert.ok(verifyIndex > 0 && verifyIndex < identityIndex, 'Google valida antes de identidade e cota');
}

async function main() {
  try {
    await verifyIosStaysLocal();
    await verifyAndroidOnlyOpensVerifiedVoice();
    await verifyAndroidIntegrityFailuresStayLocal();
    await verifyWebUnchanged();
    verifyServerBoundarySource();
  } finally {
    if (originalProjectNumber === undefined) delete process.env[PROJECT_NUMBER_ENV];
    else process.env[PROJECT_NUMBER_ENV] = originalProjectNumber;
  }
  console.log(
    'Fronteira nativa OK: iOS local, Android so abre a voz com Play Integrity e o resto continua fail-closed.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
