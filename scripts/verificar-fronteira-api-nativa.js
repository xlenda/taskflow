const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { transformSync } = require('@babel/core');
const playIntegrity = require('../api/_play-integrity');
const appAttestServer = require('../api/_app-attest');

const root = path.resolve(__dirname, '..');
const PROJECT_NUMBER_ENV = 'EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER';
const originalProjectNumber = process.env[PROJECT_NUMBER_ENV];

// `globals`: free names the module uses (fetch), given to this module only instead of patching the global object.
function loadEsm(relativePath, mocks, globals = {}) {
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
  new Function('require', 'module', 'exports', 'process', ...Object.keys(globals), compiled)(
    localRequire,
    module,
    module.exports,
    process,
    ...Object.values(globals)
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

// The iPhone's App Attest: a fake of the iOS API of @expo/app-integrity (Secure Enclave key, Apple attestation,
// per-request assertion). Each queued error is thrown by the next call of that kind.
function fakeAppAttest({
  supported = true,
  prefix = 'chave',
  generateErrors = [],
  attestErrors = [],
  assertionErrors = [],
  events = [],
} = {}) {
  const calls = { generate: [], attest: [], assert: [] };
  const failNext = (queue) => {
    const error = queue.shift();
    if (error) throw error;
  };
  return {
    calls,
    module: {
      isSupported: supported,
      generateKeyAsync: async () => {
        events.push('generate');
        failNext(generateErrors);
        const keyId = `${prefix}-${calls.generate.length + 1}`;
        calls.generate.push(keyId);
        return keyId;
      },
      attestKeyAsync: async (keyId, challenge) => {
        events.push('attest');
        calls.attest.push([keyId, challenge]);
        failNext(attestErrors);
        return `atestacao-${keyId}`;
      },
      generateAssertionAsync: async (keyId, challenge) => {
        events.push('assert');
        calls.assert.push([keyId, challenge]);
        failNext(assertionErrors);
        return `assercao-${calls.assert.length}`;
      },
    },
  };
}

function fakeAsyncStorage(entries = []) {
  const map = new Map(entries);
  return {
    map,
    module: {
      __esModule: true,
      default: {
        getItem: async (key) => (map.has(key) ? map.get(key) : null),
        setItem: async (key, value) => void map.set(key, value),
        removeItem: async (key) => void map.delete(key),
      },
    },
  };
}

// POST /api/app-attest of the contract: {action:'challenge'} → {challenge}; {action:'register', ...} → {ok:true}.
// The challenges carry '-' and '_' (base64url): the app must hand them back untouched.
function fakeAttestServer({
  events = [],
  offline = false,
  challengeStatus = 200,
  challengeBody = null,
  registerStatus = 200,
  registerBody = { ok: true },
} = {}) {
  const requests = [];
  const challenges = [];
  const reply = (status, body) => ({ ok: status === 200, status, json: async () => body });
  return {
    requests,
    challenges,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      events.push(body.action);
      requests.push({ url: String(url), method: init.method, headers: init.headers, body });
      if (offline) throw new TypeError('Network request failed');
      if (body.action !== 'challenge') return reply(registerStatus, registerBody);
      const challenge = `desafio_${challenges.length + 1}-Zm9v`;
      challenges.push(challenge);
      return reply(challengeStatus, challengeBody || { challenge });
    },
  };
}

function loadClient(
  platform,
  {
    projectNumber = '',
    integrity = fakeAppIntegrity(),
    session = null,
    asyncStorage = fakeAsyncStorage(),
    // the order the app talks to Supabase ('session'), asks Google for the token ('token') and, on the iPhone, works
    // its App Attest key ('generate', 'challenge', 'attest', 'register', 'assert')
    events = [],
    fetch = async () => {
      throw new Error('rede inesperada no teste');
    },
  } = {}
) {
  if (projectNumber) process.env[PROJECT_NUMBER_ENV] = projectNumber;
  else delete process.env[PROJECT_NUMBER_ENV];
  const reactNative = { Platform: { OS: platform } };
  const storage = loadEsm('services/narrationAudioStorage.js', {
    'expo-file-system': { Directory: class TestDirectory {}, File: class TestFile {}, Paths: {} },
    'react-native': reactNative,
  });
  const appIntegrity = loadEsm(
    'services/appIntegrity.js',
    {
      '@expo/app-integrity': {
        ...integrity.module,
        requestIntegrityCheckAsync: (requestHash) => {
          events.push('token');
          return integrity.module.requestIntegrityCheckAsync(requestHash);
        },
      },
      '@react-native-async-storage/async-storage': asyncStorage.module,
      './narrationAudioStorage': storage,
      'react-native': reactNative,
    },
    { fetch }
  );
  const supabaseCalls = { count: 0 };
  const api = loadEsm('services/celesteApiSession.js', {
    './appIntegrity': appIntegrity,
    './celesteSupabase': {
      getCelesteSupabaseClient: () => ({
        auth: {
          getSession: async () => {
            supabaseCalls.count += 1;
            events.push('session');
            return { data: { session }, error: null };
          },
          signInAnonymously: async () => {
            supabaseCalls.count += 1;
            events.push('session');
            return {
              data: { session: { access_token: 'native-anonymous-session', user: { id: 'usuario-anonimo' } } },
              error: null,
            };
          },
        },
      }),
    },
    'react-native': reactNative,
  });
  return { api, appIntegrity, integrity, supabaseCalls, events, asyncStorage };
}

// An iPhone with App Attest, its key storage and the app-attest server of the contract, all recording in `events`.
const IOS_SESSION = { access_token: 'sessao-ios-a', user: { id: 'usuario-a' } };
function loadIos({ supported, prefix, generateErrors, attestErrors, assertionErrors, asyncStorage, session = IOS_SESSION, server } = {}) {
  const events = [];
  const attest = fakeAppAttest({ supported, prefix, generateErrors, attestErrors, assertionErrors, events });
  const attestServer = fakeAttestServer({ ...server, events });
  const client = loadClient('ios', { integrity: attest, session, asyncStorage, events, fetch: attestServer.fetch });
  return { ...client, attest, attestServer };
}

const sha256Hex = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
// Independent oracle of the canonical request hash checked by api/_play-integrity.js: the token is bound to the
// operation, the request id, the session (Bearer) that sends it and the exact body.
const oracleRequestHash = (operation, requestId, accessToken, body) =>
  sha256Hex(
    ['celeste-play-integrity-v2', operation, requestId, sha256Hex(accessToken), sha256Hex(body)].join('\n')
  );
// Independent oracle of the iPhone's assertion challenge (contract, 2026-11-19-ios-voz-app-attest.md, step 3): the
// assertion is bound to the operation, the request id, the session, the exact body and the X-Celeste-Attest-Time sent.
const oracleAttestChallenge = (operation, requestId, accessToken, body, attestTime) =>
  sha256Hex(
    ['celeste-app-attest-v1', operation, requestId, sha256Hex(accessToken), sha256Hex(body), attestTime].join('\n')
  );
const attestStorageKey = (userId) => `@celeste_app_attest_key_v1:${userId}`;
const integrityError = (code) => Object.assign(new Error(code), { code });
const attestationRequired = (error) =>
  error &&
  error.message === 'native_attestation_required' &&
  error.code === 'native_attestation_required';
const CLOSED = (client) => ({ available: false, client, reason: 'native_attestation_required' });
const OPEN = (client) => ({ available: true, client, reason: null });
const voiceBody = JSON.stringify({
  mode: 'personal',
  narratorId: 'serena',
  lang: 'pt',
  text: 'Você escolhe a própria voz ✨ e respira com calma.',
  cloudConsent: true,
  cloudConsentVersion: 'test-consent',
  adultConfirmed: true,
});
const sceneBody = JSON.stringify({
  desire: 'Viver perto do mar ✨ com calma',
  category: 'Peace',
  lang: 'pt',
  profile: { whyMatters: 'respirar sem pressa' },
  cloudConsent: true,
  cloudConsentVersion: 'test-consent',
  adultConfirmed: true,
  includeJourneySuite: true,
});
const translationBody = JSON.stringify({
  sourceLang: 'pt',
  targetLang: 'en',
  scene: { title: 'Mar', intention: 'Calma.', affirmation: 'Eu escolho a calma.', story: 'Você respira.', anchorIdentity: 'Eu respiro.', anchorStep: 'Respirar.' },
  cloudConsent: true,
  cloudConsentVersion: 'test-consent',
  adultConfirmed: true,
});

async function assertClosedBeforeCloud(client, label, call) {
  await assert.rejects(call, attestationRequired, label);
  assert.strictEqual(client.supabaseCalls.count, 0, `${label}: Supabase contatado sem atestacao`);
}

// The token binds to the session, so Google is asked only after the session exists; when no token comes, the call
// still refuses (the caller never sends the voice request).
async function assertRefusedAfterSession(client, label, call) {
  await assert.rejects(call, attestationRequired, label);
  assert.strictEqual(client.events[0], 'session', `${label}: a sessao vem antes do pedido do token`);
}

const iosDirectInput = (userId = 'usuario-a') => ({
  operation: 'audio',
  requestId: 'celeste-teste-1',
  sessionHash: sha256Hex('sessao-ios-a'),
  bodyHash: sha256Hex(voiceBody),
  accessToken: 'sessao-ios-a',
  userId,
});

// Simulator or a device without App Attest (isSupported false): nothing leaves the iPhone, the voice and the texts
// stay on the device as before.
async function verifyIosWithoutAppAttestStaysLocal() {
  const ios = loadIos({ supported: false });
  assert.deepStrictEqual(ios.api.celesteCloudAccessCapability(), CLOSED('ios'));
  for (const operation of ['audio', 'scene', 'translation']) {
    assert.deepStrictEqual(ios.api.celesteCloudAccessCapability('ios', operation), CLOSED('ios'), `iOS sem App Attest: ${operation} fechado`);
    await assertClosedBeforeCloud(ios, `iOS sem App Attest ${operation}`, () =>
      ios.api.celestePaidApiHeaders({ operation, body: voiceBody })
    );
  }
  await assertClosedBeforeCloud(ios, 'iOS sem App Attest, sessao', () => ios.api.getCelesteApiSession());
  assert.strictEqual(await ios.appIntegrity.integrityHeaderFor(iosDirectInput()), null, 'isSupported=false: sem cabecalho');
  assert.deepStrictEqual(ios.events, [], 'isSupported=false: nenhuma chamada nativa, nenhuma rede');
}

// The iPhone with App Attest: the same voice and texts as the verified Android, each request signed by the key that
// Apple attested and the server registered, and nothing else.
async function verifyIosAppAttest() {
  const ios = loadIos();
  for (const operation of SERVER_OPERATIONS) {
    assert.deepStrictEqual(
      ios.api.celesteCloudAccessCapability('ios', operation),
      playIntegrity.NATIVE_OPERATIONS.includes(operation) ? OPEN('ios') : CLOSED('ios'),
      `iOS ${operation}: o app abre exatamente a lista nativa do servidor (voz e textos)`
    );
  }
  for (const operation of ['audio', 'scene', 'translation']) {
    assert.deepStrictEqual(
      ios.api.celesteCloudAccessCapability('android', operation),
      CLOSED('android'),
      `${operation}: a prova do iPhone nao abre o Android`
    );
  }
  for (const operation of ['visual', 'dream']) {
    await assertClosedBeforeCloud(ios, `iOS ${operation}`, () => ios.api.celestePaidApiHeaders({ operation, body: voiceBody }));
  }
  await assertClosedBeforeCloud(ios, 'iOS sem operacao (chamadas antigas)', () => ios.api.celestePaidApiHeaders());
  await assertClosedBeforeCloud(ios, 'iOS voz sem corpo exato', () => ios.api.celestePaidApiHeaders({ operation: 'audio' }));
  await assertClosedBeforeCloud(ios, 'iOS sessao generica', () => ios.api.getCelesteApiSession());
  assert.deepStrictEqual(ios.events, [], 'nada disso chega ao App Attest');

  // first voice request of a fresh install: new key → challenge → Apple attestation → registration → assertion
  const before = Date.now();
  const headers = await ios.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  const requestId = headers['X-Celeste-Request-Id'];
  const attestTime = headers['X-Celeste-Attest-Time'];
  assert.match(requestId, /^celeste-[a-z0-9]+-[a-z0-9]+$/);
  assert.ok(
    /^\d{13}$/.test(attestTime) && Number(attestTime) >= before && Number(attestTime) <= Date.now(),
    `X-Celeste-Attest-Time e o instante da assercao em ms, 13 digitos (${attestTime})`
  );
  assert.deepStrictEqual(
    headers,
    {
      Authorization: 'Bearer sessao-ios-a',
      'X-Celeste-Client': 'ios',
      'X-Celeste-Request-Id': requestId,
      'X-Celeste-Attest-Key': 'chave-1',
      'X-Celeste-Attest-Time': attestTime,
      'X-Celeste-Attest-Assertion': 'assercao-1',
    },
    'iPhone: os 3 cabecalhos do contrato, sem o token do Google'
  );
  assert.deepStrictEqual(
    ios.events,
    ['session', 'generate', 'challenge', 'attest', 'register', 'assert'],
    'a sessao vem antes; a chave e atestada e registrada antes da primeira assercao'
  );
  const [challengeRequest, registerRequest] = ios.attestServer.requests;
  assert.ok(challengeRequest.url.endsWith('/api/app-attest') && registerRequest.url.endsWith('/api/app-attest'));
  assert.deepStrictEqual(
    [challengeRequest.method, challengeRequest.headers, challengeRequest.body],
    ['POST', { 'Content-Type': 'application/json', 'X-Celeste-Client': 'ios' }, { action: 'challenge' }],
    'desafio: so o cliente ios, sem sessao e sem Origin'
  );
  const challenge = ios.attestServer.challenges[0];
  assert.deepStrictEqual(ios.attest.calls.attest, [['chave-1', challenge]], 'a Apple atesta a chave com o desafio do servidor, intacto');
  assert.deepStrictEqual(
    [registerRequest.method, registerRequest.headers, registerRequest.body],
    [
      'POST',
      { 'Content-Type': 'application/json', 'X-Celeste-Client': 'ios', Authorization: 'Bearer sessao-ios-a' },
      { action: 'register', keyId: 'chave-1', attestation: 'atestacao-chave-1', challenge },
    ],
    'registro: chave, atestacao e o mesmo desafio, com a sessao e sem Origin'
  );
  const expected = oracleAttestChallenge('audio', requestId, 'sessao-ios-a', voiceBody, attestTime);
  assert.deepStrictEqual(ios.attest.calls.assert.map(([keyId]) => keyId), ['chave-1']);
  assert.ok(
    Buffer.from(ios.attest.calls.assert[0][1], 'utf8').equals(Buffer.from(expected, 'utf8')),
    'a assercao assina o challenge do contrato, byte a byte'
  );
  // the server recomputes the same challenge from the request it receives (api/_app-attest.js): one contract, two sides
  assert.strictEqual(
    ios.attest.calls.assert[0][1],
    appAttestServer.assertionChallenge({
      operation: 'audio',
      requestId,
      sessionHash: sha256Hex('sessao-ios-a'),
      bodyHash: playIntegrity.requestBodyHash(JSON.parse(voiceBody)),
      attestTime,
    }),
    'app e servidor precisam calcular o mesmo challenge da assercao do iPhone'
  );
  assert.strictEqual(
    ios.asyncStorage.map.get(attestStorageKey('usuario-a')),
    JSON.stringify({ keyId: 'chave-1', registered: true }),
    'a chave registrada fica guardada, por usuario'
  );

  // the next requests reuse the registered key: one assertion each, bound to its own operation and body
  for (const [operation, body] of [['scene', sceneBody], ['translation', translationBody]]) {
    const next = await ios.api.celestePaidApiHeaders({ operation, body });
    assert.strictEqual(next['X-Celeste-Attest-Key'], 'chave-1');
    assert.strictEqual(
      ios.attest.calls.assert.at(-1)[1],
      oracleAttestChallenge(operation, next['X-Celeste-Request-Id'], 'sessao-ios-a', body, next['X-Celeste-Attest-Time']),
      `${operation}: a assercao fica amarrada a operacao e ao corpo enviado`
    );
  }
  assert.deepStrictEqual(
    [ios.attest.calls.generate.length, ios.attest.calls.attest.length, ios.attestServer.requests.length],
    [1, 1, 2],
    'chave registrada: nada de chave nova, atestacao ou registro'
  );

  // the app reopens: the registered key comes back from storage, with no network
  const reopened = loadIos({ prefix: 'outra', asyncStorage: ios.asyncStorage });
  const again = await reopened.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.strictEqual(again['X-Celeste-Attest-Key'], 'chave-1');
  assert.deepStrictEqual(reopened.events, ['session', 'assert'], 'app reaberto: so a assercao');

  // another user on this device gets their own key (Apple: never share a key among users)
  const otherUser = loadIos({
    prefix: 'chave-b',
    asyncStorage: ios.asyncStorage,
    session: { access_token: 'sessao-ios-b', user: { id: 'usuario-b' } },
  });
  const other = await otherUser.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.strictEqual(other['X-Celeste-Attest-Key'], 'chave-b-1', 'outro usuario: outra chave');
  assert.strictEqual(otherUser.attestServer.requests[1].headers.Authorization, 'Bearer sessao-ios-b');
  assert.deepStrictEqual(
    [...ios.asyncStorage.map.keys()].sort(),
    [attestStorageKey('usuario-a'), attestStorageKey('usuario-b')],
    'uma chave guardada por usuario'
  );

  // a fresh install with no session: the anonymous session is created first and its user owns the key
  const anonymous = loadIos({ session: null });
  const anonymousHeaders = await anonymous.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.strictEqual(anonymousHeaders.Authorization, 'Bearer native-anonymous-session');
  assert.deepStrictEqual(anonymous.events.slice(0, 3), ['session', 'session', 'generate']);
  assert.ok(anonymous.asyncStorage.map.has(attestStorageKey('usuario-anonimo')), 'a chave fica com o usuario anonimo');

  // voice and texts together on a fresh install: one key, one attestation, one registration
  const together = loadIos();
  const pair = await Promise.all([
    together.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody }),
    together.api.celestePaidApiHeaders({ operation: 'scene', body: sceneBody }),
  ]);
  assert.deepStrictEqual(pair.map((item) => item['X-Celeste-Attest-Key']), ['chave-1', 'chave-1']);
  assert.deepStrictEqual(
    [together.attest.calls.generate.length, together.attest.calls.attest.length, together.attestServer.requests.length, together.attest.calls.assert.length],
    [1, 1, 2, 2],
    'pedidos juntos dividem o mesmo registro'
  );
}

// Apple's rule for a failed attestation, a key that disappeared, and every other failure: null for the caller (the
// request never leaves the iPhone), never an exception.
async function verifyIosAppAttestFailures() {
  // Apple's server unavailable: the key stays (not registered) and the next request attests that same key
  const unavailable = loadIos({ attestErrors: [integrityError('ERR_APP_INTEGRITY_SERVER_UNAVAILABLE')] });
  await assertRefusedAfterSession(unavailable, 'Apple indisponivel', () =>
    unavailable.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  assert.strictEqual(
    unavailable.asyncStorage.map.get(attestStorageKey('usuario-a')),
    JSON.stringify({ keyId: 'chave-1', registered: false }),
    'Apple indisponivel: a chave fica para tentar depois'
  );
  assert.ok(!unavailable.events.includes('register'), 'sem atestacao, nada e registrado');
  const retried = await unavailable.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.strictEqual(retried['X-Celeste-Attest-Key'], 'chave-1');
  assert.deepStrictEqual(unavailable.attest.calls.generate, ['chave-1'], 'tentou de novo com a mesma chave');
  assert.deepStrictEqual(unavailable.attest.calls.attest.map(([keyId]) => keyId), ['chave-1', 'chave-1']);

  // any other attestation error: the key is discarded and the next request creates another
  for (const code of ['ERR_APP_INTEGRITY_INVALID_KEY', 'ERR_APP_INTEGRITY_UNKNOWN']) {
    const broken = loadIos({ attestErrors: [integrityError(code)] });
    await assertRefusedAfterSession(broken, code, () => broken.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody }));
    assert.strictEqual(broken.asyncStorage.map.size, 0, `${code}: a chave e descartada`);
    const fresh = await broken.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
    assert.strictEqual(fresh['X-Celeste-Attest-Key'], 'chave-2', `${code}: o pedido seguinte usa uma chave nova`);
    assert.deepStrictEqual(broken.attest.calls.attest.map(([keyId]) => keyId), ['chave-1', 'chave-2']);
  }

  // a registered key that no longer exists (reinstall, device migration, backup restore): the assertion fails, the
  // key is discarded and the next request registers a new one
  const restored = loadIos({
    asyncStorage: fakeAsyncStorage([[attestStorageKey('usuario-a'), JSON.stringify({ keyId: 'chave-do-backup', registered: true })]]),
    assertionErrors: [integrityError('ERR_APP_INTEGRITY_INVALID_KEY')],
  });
  await assertRefusedAfterSession(restored, 'chave perdida', () =>
    restored.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  assert.strictEqual(restored.asyncStorage.map.size, 0, 'chave perdida: descartada');
  const recovered = await restored.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.strictEqual(recovered['X-Celeste-Attest-Key'], 'chave-1', 'chave perdida: o pedido seguinte registra outra');
  assert.deepStrictEqual(restored.attest.calls.assert.map(([keyId]) => keyId), ['chave-do-backup', 'chave-1']);

  // integrityHeaderFor never throws; when our server fails, the key is kept (not registered) for the next request
  const unregistered = JSON.stringify({ keyId: 'chave-1', registered: false });
  const brokenDisk = {
    map: new Map(),
    module: { __esModule: true, default: { getItem: async () => { throw new Error('disco'); }, setItem: async () => {}, removeItem: async () => {} } },
  };
  for (const [label, options, kept, events] of [
    ['sem rede', { server: { offline: true } }, unregistered, ['generate', 'challenge']],
    ['desafio 500', { server: { challengeStatus: 500 } }, unregistered, ['generate', 'challenge']],
    ['desafio vazio', { server: { challengeBody: { challenge: '' } } }, unregistered, ['generate', 'challenge']],
    ['registro recusado', { server: { registerStatus: 403, registerBody: { error: 'native_attestation_required' } } }, unregistered, ['generate', 'challenge', 'attest', 'register']],
    ['registro sem ok', { server: { registerBody: { ok: false } } }, unregistered, ['generate', 'challenge', 'attest', 'register']],
    ['Apple recusou a atestacao', { attestErrors: [integrityError('ERR_APP_INTEGRITY_INVALID_INPUT')] }, undefined, ['generate', 'challenge', 'attest']],
    ['assercao falhou', { assertionErrors: [integrityError('ERR_APP_INTEGRITY_SYSTEM_FAILURE')] }, undefined, ['generate', 'challenge', 'attest', 'register', 'assert']],
    ['chave nao gerada', { generateErrors: [integrityError('ERR_APP_INTEGRITY_FEATURE_UNSUPPORTED')] }, undefined, ['generate']],
    ['armazenamento falhou', { asyncStorage: brokenDisk }, undefined, []],
  ]) {
    const client = loadIos(options);
    const result = await client.appIntegrity.integrityHeaderFor(iosDirectInput()).catch((error) => `lancou ${error}`);
    assert.strictEqual(result, null, `${label}: integrityHeaderFor nunca lanca, devolve null`);
    assert.strictEqual(client.asyncStorage.map.get(attestStorageKey('usuario-a')), kept, `${label}: estado da chave`);
    assert.deepStrictEqual(client.events, events, `${label}: passos feitos`);
  }
  const noUser = loadIos();
  assert.strictEqual(
    await noUser.appIntegrity.integrityHeaderFor({ ...iosDirectInput(), userId: undefined }),
    null,
    'sem usuario na sessao: sem cabecalho'
  );
  assert.deepStrictEqual(noUser.events, [], 'sem usuario na sessao: nenhuma chave');
}

// The paid operations the server knows (api/_paid-access.js OPERATIONS): Android may open exactly the server's
// NATIVE_OPERATIONS — the voice and the AI texts (scene with the 6+6 suite, translation) — and nothing else.
const SERVER_OPERATIONS = ['scene', 'translation', 'dream', 'audio', 'visual'];

async function verifyAndroidOpensOnlyVerifiedVoiceAndTexts() {
  const unconfigured = loadClient('android');
  assert.deepStrictEqual(unconfigured.api.celesteCloudAccessCapability(), CLOSED('android'));
  for (const operation of ['audio', 'scene', 'translation']) {
    assert.deepStrictEqual(
      unconfigured.api.celesteCloudAccessCapability('android', operation),
      CLOSED('android'),
      `sem numero do projeto Google Cloud o Android continua fechado (${operation})`
    );
    await assertClosedBeforeCloud(unconfigured, `Android ${operation} sem projeto`, () =>
      unconfigured.api.celestePaidApiHeaders({ operation, body: voiceBody })
    );
  }
  assert.strictEqual(unconfigured.integrity.calls.prepare.length, 0);

  const android = loadClient('android', { projectNumber: '123456789012' });
  for (const operation of SERVER_OPERATIONS) {
    const allowed = playIntegrity.NATIVE_OPERATIONS.includes(operation);
    assert.deepStrictEqual(
      android.api.celesteCloudAccessCapability('android', operation),
      allowed ? { available: true, client: 'android', reason: null } : CLOSED('android'),
      `Android ${operation}: o app abre exatamente o que o servidor aceita do Android verificado`
    );
  }
  assert.deepStrictEqual(
    [...playIntegrity.NATIVE_OPERATIONS].sort(),
    ['audio', 'scene', 'translation'],
    'Android verificado: voz, cena (com a suite 6+6) e traducao; imagem e sonho nunca'
  );
  for (const operation of ['audio', 'scene', 'translation']) {
    assert.deepStrictEqual(
      android.api.celesteCloudAccessCapability('ios', operation),
      CLOSED('ios'),
      `${operation}: a prova do Android nao abre o iPhone`
    );
  }
  for (const operation of ['visual', 'dream']) {
    await assertClosedBeforeCloud(android, `Android ${operation}`, () =>
      android.api.celestePaidApiHeaders({ operation, body: voiceBody })
    );
  }
  await assertClosedBeforeCloud(android, 'Android sem operacao (chamadas antigas)', () =>
    android.api.celestePaidApiHeaders()
  );
  for (const operation of ['audio', 'scene', 'translation']) {
    await assertClosedBeforeCloud(android, `Android ${operation} sem corpo exato`, () =>
      android.api.celestePaidApiHeaders({ operation })
    );
  }
  await assertClosedBeforeCloud(android, 'Android sessao generica', () => android.api.getCelesteApiSession());
  assert.strictEqual(android.integrity.calls.request.length, 0, 'so voz e textos com o corpo exato pedem token');

  const headers = await android.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  const requestId = headers['X-Celeste-Request-Id'];
  assert.match(requestId, /^celeste-[a-z0-9]+-[a-z0-9]+$/);
  assert.deepStrictEqual(headers, {
    Authorization: 'Bearer native-anonymous-session',
    'X-Celeste-Client': 'android',
    'X-Celeste-Request-Id': requestId,
    'X-Celeste-Integrity': 'device-integrity-token',
  });
  assert.deepStrictEqual(
    android.events,
    ['session', 'session', 'token'],
    'a sessao anonima e criada antes do token: o token fica amarrado a ela'
  );
  assert.deepStrictEqual(android.integrity.calls.prepare, ['123456789012']);
  assert.deepStrictEqual(android.integrity.calls.request, [
    oracleRequestHash('audio', requestId, 'native-anonymous-session', voiceBody),
  ]);
  assert.strictEqual(
    android.integrity.calls.request[0],
    playIntegrity.requestHashFor({
      operation: 'audio',
      requestId,
      sessionHash: sha256Hex('native-anonymous-session'),
      bodyHash: playIntegrity.requestBodyHash(JSON.parse(voiceBody)),
    }),
    'app e servidor precisam calcular o mesmo hash do pedido'
  );
  await android.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.deepStrictEqual(android.integrity.calls.prepare, ['123456789012'], 'provedor preparado uma vez');
  assert.strictEqual(android.asyncStorage.map.size, 0, 'o Android nao guarda chave do App Attest');

  // The session already on the device is the one the token binds: another session gives another hash.
  const signedIn = loadClient('android', {
    projectNumber: '123456789012',
    session: { access_token: 'sessao-anonima-ja-guardada' },
  });
  const reused = await signedIn.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.strictEqual(reused.Authorization, 'Bearer sessao-anonima-ja-guardada');
  assert.deepStrictEqual(signedIn.integrity.calls.request, [
    oracleRequestHash('audio', reused['X-Celeste-Request-Id'], 'sessao-anonima-ja-guardada', voiceBody),
  ]);

  // The AI texts bind the token the same way, to their own operation: a scene token never serves the voice.
  for (const [operation, body] of [['scene', sceneBody], ['translation', translationBody]]) {
    const texts = loadClient('android', { projectNumber: '123456789012' });
    const textHeaders = await texts.api.celestePaidApiHeaders({ operation, body });
    const textRequestId = textHeaders['X-Celeste-Request-Id'];
    assert.deepStrictEqual(textHeaders, {
      Authorization: 'Bearer native-anonymous-session',
      'X-Celeste-Client': 'android',
      'X-Celeste-Request-Id': textRequestId,
      'X-Celeste-Integrity': 'device-integrity-token',
    });
    assert.deepStrictEqual(texts.events, ['session', 'session', 'token'], `${operation}: a sessao vem antes do token`);
    assert.deepStrictEqual(texts.integrity.calls.request, [
      playIntegrity.requestHashFor({
        operation,
        requestId: textRequestId,
        sessionHash: sha256Hex('native-anonymous-session'),
        bodyHash: playIntegrity.requestBodyHash(JSON.parse(body)),
      }),
    ], `${operation}: app e servidor calculam o mesmo hash, amarrado a operacao`);
    assert.notStrictEqual(
      texts.integrity.calls.request[0],
      oracleRequestHash('audio', textRequestId, 'native-anonymous-session', body),
      `${operation}: o token do texto nao vale para a voz`
    );
  }
}

// The text services sign exactly the bytes they send: generatePersonalizedScene asks for a 'scene' token and
// translateManifestationScene for a 'translation' token, each over the JSON string that goes in the request body.
async function verifyTextServicesSignTheExactBody() {
  const consent = require('../constants/cloudConsent.native.js');
  const headerCalls = [];
  const sent = [];
  const session = {
    celestePaidApiHeaders: async (options) => {
      headerCalls.push(options);
      return { Authorization: 'Bearer s', 'X-Celeste-Client': 'android', 'X-Celeste-Integrity': 'token' };
    },
  };
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    sent.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => (String(url).endsWith('/api/traduzir-cena')
        ? { scene: { title: 'T', intention: 'I', affirmation: 'Eu escolho.', story: 'S', anchorIdentity: 'A', anchorStep: 'P', personalizedWith: [] }, generation: {} }
        : { scene: { intention: 'I', affirmation: 'Eu escolho.', story: 'S', anchorIdentity: 'A', anchorStep: 'P' }, generation: {} }),
    };
  };
  try {
    const sceneService = loadEsm('services/generatePersonalizedScene.js', {
      '../constants/cloudConsent': consent,
      './celesteApiSession': session,
    });
    const translation = loadEsm('services/translateManifestationScene.js', {
      '../constants/cloudConsent': consent,
      './celesteApiSession': session,
      './generatePersonalizedScene': sceneService,
    });
    const profile = {
      age: '25–34',
      cloudConsentVersion: consent.CLOUD_CONSENT_VERSION,
      cloudPersonalization: true,
      cloudAdultConfirmed: true,
      cloudNarrationConsent: true,
      cloudDreamConsent: true,
    };
    await sceneService.generatePersonalizedScene({
      desire: 'viver perto do mar',
      category: 'Peace',
      lang: 'pt',
      profile,
      includeJourneySuite: false,
    });
    await translation.translateManifestationScene({
      sourceLang: 'pt',
      targetLang: 'en',
      scene: { title: 'T', intention: 'I', affirmation: 'Eu escolho.', story: 'S', anchorIdentity: 'A', anchorStep: 'P' },
      profile,
    });
  } finally {
    global.fetch = originalFetch;
  }
  assert.deepStrictEqual(headerCalls.map((call) => call.operation), ['scene', 'translation']);
  assert.strictEqual(headerCalls[0].body, sent[0].init.body, 'cena: o token cobre exatamente o corpo enviado');
  assert.strictEqual(headerCalls[1].body, sent[1].init.body, 'traducao: o token cobre exatamente o corpo enviado');
  assert.ok(String(sent[0].url).endsWith('/api/gerar-cena') && String(sent[1].url).endsWith('/api/traduzir-cena'));
  assert.strictEqual(
    JSON.parse(sent[0].init.body).cloudConsentVersion,
    consent.ANDROID_CLOUD_CONSENT_VERSION,
    'nos apps vai a versao do aceite que o app mostrou'
  );
  assert.strictEqual(sent[0].init.headers['X-Celeste-Integrity'], 'token');
}

async function verifyAndroidIntegrityFailuresStayLocal() {
  const integrityError = (code) => Object.assign(new Error(code), { code });

  const failing = loadClient('android', {
    projectNumber: '123456789012',
    integrity: fakeAppIntegrity({ results: [integrityError('ERR_APP_INTEGRITY_NETWORK_ERROR')] }),
  });
  await assertRefusedAfterSession(failing, 'Play Integrity falhou', () =>
    failing.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );

  const emptyToken = loadClient('android', {
    projectNumber: '123456789012',
    integrity: fakeAppIntegrity({ results: [''] }),
  });
  await assertRefusedAfterSession(emptyToken, 'token vazio', () =>
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
  await assertRefusedAfterSession(unprepared, 'Play Store ausente', () =>
    unprepared.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  await assertRefusedAfterSession(unprepared, 'Play Store ausente (repeticao)', () =>
    unprepared.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  assert.strictEqual(
    unprepared.integrity.calls.prepare.length,
    1,
    'a Play aceita 5 preparos por minuto: falha nao pode virar loop'
  );
  assert.strictEqual(
    await unprepared.appIntegrity.integrityHeaderFor({ operation: 'audio', requestId: 'x', sessionHash: 'z', bodyHash: 'y' }),
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
    /attestNative && !playIntegrity\.NATIVE_OPERATIONS\.includes\(operation\)/,
    'Play Integrity abre so a lista nativa (voz e textos)'
  );
  const integritySource = fs.readFileSync(path.join(root, 'api', '_play-integrity.js'), 'utf8');
  assert.match(
    integritySource,
    /const NATIVE_OPERATIONS = Object\.freeze\(\['audio', 'scene', 'translation'\]\);/,
    'lista nativa explicita e congelada: voz, cena e traducao'
  );
  const sceneRoute = fs.readFileSync(path.join(root, 'api', 'gerar-cena.js'), 'utf8');
  assert.match(
    sceneRoute,
    /if \(nativeRequest && validated\.value\.continuity\) \{\s*const refusal = paidAccess\.nativeRefusal\('operation_not_allowed'\);/,
    'Espelho Vivo (cena com continuidade) fica fora do Android'
  );
  const verifyIndex = paidAccess.indexOf('playIntegrity.verifyPlayIntegrity(req');
  const identityIndex = paidAccess.indexOf('await authenticatedUser(config, token)');
  assert.ok(verifyIndex > 0 && verifyIndex < identityIndex, 'Google valida antes de identidade e cota');
}

// An AAB built without the Cloud project number never opens the Celeste voice on Android (the app refuses before the
// network): the publish script says so out loud, without blocking and without printing any value.
function verifyAabScriptWarnsWithoutProjectNumber() {
  const script = fs.readFileSync(path.join(root, 'scripts', 'publicar-google-play.ps1'), 'utf8');
  assert.match(
    script,
    /if \(-not \$scopes\.ContainsKey\('EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER'\)\) \{\s*Write-Warning '[^'\r\n]*EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER[^'\r\n]*'\s*\}/,
    'publicar-google-play.ps1 avisa (sem bloquear) quando falta o numero do projeto no EAS production'
  );
}

async function main() {
  try {
    await verifyIosWithoutAppAttestStaysLocal();
    await verifyIosAppAttest();
    await verifyIosAppAttestFailures();
    await verifyAndroidOpensOnlyVerifiedVoiceAndTexts();
    await verifyAndroidIntegrityFailuresStayLocal();
    await verifyTextServicesSignTheExactBody();
    await verifyWebUnchanged();
    verifyServerBoundarySource();
    verifyAabScriptWarnsWithoutProjectNumber();
  } finally {
    if (originalProjectNumber === undefined) delete process.env[PROJECT_NUMBER_ENV];
    else process.env[PROJECT_NUMBER_ENV] = originalProjectNumber;
  }
  console.log(
    'Fronteira nativa OK: Android (Play Integrity) e iPhone (App Attest) so abrem voz e textos (cena, traducao) com a prova de cada pedido; sem prova nada sai do aparelho e o resto continua fail-closed.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
