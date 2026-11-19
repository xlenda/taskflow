const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const appAttest = require('../api/_app-attest');
const paidAccess = require('../api/_paid-access');
const { VOICE_AND_TEXT_CONSENT_VERSIONS } = require('../constants/cloudConsent');

// App Attest (iPhone) server side: docs/superpowers/plans/2026-11-19-ios-voz-app-attest.md and Apple's
// "Validating apps that connect to your server". Every certificate here is SYNTHETIC, made at test time with
// Node's crypto (root P-384 -> intermediate P-384 -> credCert P-256 with extension 1.2.840.113635.100.8.2); the
// test root reaches the module only through setRootForTests().

const ROOT = path.resolve(__dirname, '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
// App ID = Team ID + bundle id, from the files EAS builds and submits the iPhone app with.
const APP_ID = `${readJson('eas.json').submit.production.ios.appleTeamId}.${readJson('app.json').expo.ios.bundleIdentifier}`;
// Published SHA-256 of Apple's App Attestation Root CA (checked against the PEM embedded in api/_app-attest.js).
const APPLE_ROOT_SHA256 =
  '1C:B9:82:3B:A2:8B:A6:AD:2D:33:A0:06:94:1D:E2:AE:4F:51:3E:F1:D4:E8:31:B9:F7:E0:FA:7B:62:42:C9:32';
const ACTOR_SECRET = 'actor-hmac-secret-with-at-least-32-bytes';
const SUPABASE = 'https://celeste.supabase.co';
const USER_A = '00000000-0000-4000-8000-0000000000a1';
const USER_B = '00000000-0000-4000-8000-0000000000b2';
const USERS = Object.freeze({
  'ios-session-a': USER_A,
  'ios-session-a-refreshed': USER_A,
  'ios-session-b': USER_B,
});
const AAGUID_PRODUCTION = Buffer.concat([Buffer.from('appattest'), Buffer.alloc(7)]);
const AAGUID_DEVELOPMENT = Buffer.from('appattestdevelop');
const RECEIPT = Buffer.from('synthetic-app-attest-receipt-for-tests');
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const NATIVE_DENIED = Object.freeze({ error: 'native_attestation_required', status: 403 });
const REATTEST = Object.freeze({ error: 'app_attest_reattest_required', status: 403 });
const consent = { cloudConsent: true, cloudConsentVersion: VOICE_AND_TEXT_CONSENT_VERSIONS[0], adultConfirmed: true };
const voiceBody = Object.freeze({
  mode: 'personal',
  narratorId: 'serena',
  lang: 'pt',
  text: 'Eu escolho ouvir a minha voz com calma e coragem.',
  ...consent,
});
const sceneBody = Object.freeze({ desire: 'viver perto do mar com calma', category: 'Peace', lang: 'pt', profile: {}, ...consent });
const translationBody = Object.freeze({
  sourceLang: 'pt',
  targetLang: 'en',
  scene: {
    title: 'Viver perto do mar',
    intention: 'Viver perto do mar com calma.',
    affirmation: 'Eu escolho viver perto do mar com calma.',
    story: 'E fim de tarde perto do mar e eu volto para casa com calma.',
    anchorIdentity: 'Eu pratico a calma.',
    anchorStep: 'Se eu sentir pressa, entao vou respirar por um minuto.',
    personalizedWith: ['o que voce quer viver'],
  },
  ...consent,
});

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();
const sha256Hex = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

// ---------- minimal DER writer (test only) ----------
function der(tag, ...contents) {
  const body = Buffer.concat(contents);
  let length = Buffer.from([body.length]);
  if (body.length >= 0x80) {
    const bytes = [];
    for (let n = body.length; n > 0; n = Math.floor(n / 256)) bytes.unshift(n % 256);
    length = Buffer.from([0x80 | bytes.length, ...bytes]);
  }
  return Buffer.concat([Buffer.from([tag]), length, body]);
}
const seq = (...items) => der(0x30, ...items);
const set = (...items) => der(0x31, ...items);
const octets = (bytes) => der(0x04, bytes);
const bool = (value) => der(0x01, Buffer.from([value ? 0xff : 0]));
const integer = (value) => {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let bytes = Buffer.from(hex, 'hex');
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return der(0x02, bytes);
};
const oid = (dotted) => {
  const parts = dotted.split('.').map(Number);
  const bytes = [40 * parts[0] + parts[1]];
  for (const part of parts.slice(2)) {
    const chunk = [part & 0x7f];
    for (let n = Math.floor(part / 128); n > 0; n = Math.floor(n / 128)) chunk.unshift(0x80 | (n & 0x7f));
    bytes.push(...chunk);
  }
  return der(0x06, Buffer.from(bytes));
};
const utcTime = (ms) => {
  const iso = new Date(ms).toISOString();
  const text = `${iso.slice(2, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
  return der(0x17, Buffer.from(text, 'ascii'));
};
const commonName = (name) => seq(set(seq(oid('2.5.4.3'), der(0x0c, Buffer.from(name, 'utf8')))));

let serial = 1;
function certificate({ subject, issuer, publicKey, signingKey, notBefore, notAfter, ca = false, extensions = [] }) {
  const hash = signingKey.asymmetricKeyDetails.namedCurve === 'secp384r1' ? 'sha384' : 'sha256';
  const algorithm = seq(oid(hash === 'sha384' ? '1.2.840.10045.4.3.3' : '1.2.840.10045.4.3.2'));
  const allExtensions = ca
    ? [
        seq(oid('2.5.29.19'), bool(true), octets(seq(bool(true)))), // basicConstraints: CA
        seq(oid('2.5.29.15'), bool(true), octets(der(0x03, Buffer.from([0x01, 0x06])))), // keyCertSign, cRLSign
        ...extensions,
      ]
    : extensions;
  const tbs = seq(
    der(0xa0, integer(2)),
    integer(serial++),
    algorithm,
    commonName(issuer),
    seq(utcTime(notBefore), utcTime(notAfter)),
    commonName(subject),
    publicKey.export({ type: 'spki', format: 'der' }),
    der(0xa3, seq(...allExtensions))
  );
  const signature = crypto.sign(hash, tbs, signingKey);
  return seq(tbs, algorithm, der(0x03, Buffer.concat([Buffer.from([0]), signature])));
}
const pem = (derBytes) =>
  `-----BEGIN CERTIFICATE-----\n${derBytes.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;

// ---------- minimal CBOR writer (test only) ----------
function cbor(value) {
  const head = (major, n) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 0x100) return Buffer.from([(major << 5) | 24, n]);
    const bytes = Buffer.alloc(n < 0x10000 ? 3 : 5);
    bytes[0] = (major << 5) | (n < 0x10000 ? 25 : 26);
    if (n < 0x10000) bytes.writeUInt16BE(n, 1);
    else bytes.writeUInt32BE(n, 1);
    return bytes;
  };
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8');
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (Number.isInteger(value)) return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(cbor)]);
  if (value instanceof Map) {
    return Buffer.concat([head(5, value.size), ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)])]);
  }
  throw new Error(`cbor de teste nao sabe codificar ${typeof value}`);
}

// ---------- synthetic PKI ----------
const ec = (namedCurve) => crypto.generateKeyPairSync('ec', { namedCurve });
const pki = { root: ec('secp384r1'), intermediate: ec('secp384r1'), rogueRoot: ec('secp384r1'), rogueIntermediate: ec('secp384r1') };
const ROOT_NAME = 'Celeste Test App Attestation Root CA';
const INTERMEDIATE_NAME = 'Celeste Test App Attestation CA 1';
const rootDer = certificate({
  subject: ROOT_NAME,
  issuer: ROOT_NAME,
  publicKey: pki.root.publicKey,
  signingKey: pki.root.privateKey,
  notBefore: NOW - 365 * DAY,
  notAfter: NOW + 3650 * DAY,
  ca: true,
});
const intermediateDer = certificate({
  subject: INTERMEDIATE_NAME,
  issuer: ROOT_NAME,
  publicKey: pki.intermediate.publicKey,
  signingKey: pki.root.privateKey,
  notBefore: NOW - 365 * DAY,
  notAfter: NOW + 3650 * DAY,
  ca: true,
});
// Same names as the real chain, other keys: only signatures tell them apart.
const rogueIntermediateDer = certificate({
  subject: INTERMEDIATE_NAME,
  issuer: ROOT_NAME,
  publicKey: pki.rogueIntermediate.publicKey,
  signingKey: pki.rogueRoot.privateKey,
  notBefore: NOW - 365 * DAY,
  notAfter: NOW + 3650 * DAY,
  ca: true,
});

const device = ec('prime256v1');
const otherDevice = ec('prime256v1');
function uncompressedPoint(publicKey) {
  const { x, y } = publicKey.export({ format: 'jwk' });
  return Buffer.concat([Buffer.from([4]), Buffer.from(x, 'base64url'), Buffer.from(y, 'base64url')]);
}
const keyIdOf = (keyPair) => sha256(uncompressedPoint(keyPair.publicKey)).toString('base64');
const KEY_ID = keyIdOf(device);
const SPKI_B64 = device.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function authData({ rpId = APP_ID, counter = 0, aaguid = AAGUID_PRODUCTION, credentialId, publicKey, extensions }) {
  const head = Buffer.alloc(37);
  sha256(Buffer.from(rpId, 'utf8')).copy(head, 0);
  head[32] = 0x40; // AT; like Apple's sample, the extensions follow the COSE key without the ED flag
  head.writeUInt32BE(counter, 33);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(credentialId.length);
  const { x, y } = publicKey.export({ format: 'jwk' });
  const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(x, 'base64url')], [-3, Buffer.from(y, 'base64url')]]));
  return Buffer.concat([head, aaguid, length, credentialId, cose, extensions ? cbor(extensions) : Buffer.alloc(0)]);
}

// A non-CA certificate under the real intermediate, whose key the test holds (to try it as an issuer).
const notCaKey = ec('prime256v1');
const NOT_CA_NAME = 'celeste-test-not-a-ca';
const notCaDer = certificate({
  subject: NOT_CA_NAME,
  issuer: INTERMEDIATE_NAME,
  publicKey: notCaKey.publicKey,
  signingKey: pki.intermediate.privateKey,
  notBefore: NOW - DAY,
  notAfter: NOW + 30 * DAY,
});

function credCert({
  nonce,
  publicKey,
  signingKey = pki.intermediate.privateKey,
  issuer = INTERMEDIATE_NAME,
  notBefore = NOW - DAY,
  notAfter = NOW + 3 * DAY,
}) {
  return certificate({
    subject: 'celeste-test-attested-key',
    issuer,
    publicKey,
    signingKey,
    notBefore,
    notAfter,
    extensions: [seq(oid('1.2.840.113635.100.8.2'), octets(seq(der(0xa1, octets(nonce)))))],
  });
}

function buildAttestation({
  challenge,
  keyPair = device,
  keyId = keyIdOf(keyPair),
  rpId = APP_ID,
  counter = 0,
  aaguid = AAGUID_PRODUCTION,
  credentialId = Buffer.from(keyId, 'base64'),
  nonceChallenge = challenge,
  chain = 'valid',
  leaf = {},
  fmt = 'apple-appattest',
  extensions,
} = {}) {
  const data = authData({ rpId, counter, aaguid, credentialId, publicKey: keyPair.publicKey, extensions });
  const nonce = sha256(Buffer.concat([data, sha256(Buffer.from(nonceChallenge, 'utf8'))]));
  const x5c = {
    valid: () => [credCert({ nonce, publicKey: keyPair.publicKey, ...leaf }), intermediateDer],
    'rogue-root': () => [
      credCert({ nonce, publicKey: keyPair.publicKey, signingKey: pki.rogueIntermediate.privateKey }),
      rogueIntermediateDer,
    ],
    'rogue-intermediate-key': () => [
      credCert({ nonce, publicKey: keyPair.publicKey, signingKey: pki.rogueIntermediate.privateKey }),
      intermediateDer,
    ],
    'leaf-only': () => [credCert({ nonce, publicKey: keyPair.publicKey })],
    'non-ca-issuer': () => [
      credCert({ nonce, publicKey: keyPair.publicKey, signingKey: notCaKey.privateKey, issuer: NOT_CA_NAME }),
      notCaDer,
      intermediateDer,
    ],
    'wrong-issuer-name': () => [
      credCert({ nonce, publicKey: keyPair.publicKey, issuer: 'Celeste Test Some Other CA' }),
      intermediateDer,
    ],
  }[chain]();
  const statement = new Map([['x5c', x5c], ['receipt', RECEIPT]]);
  return cbor(new Map([['fmt', fmt], ['attStmt', statement], ['authData', data]])).toString('base64');
}

function buildAssertion({ challenge, counter, rpId = APP_ID, signer = device.privateKey }) {
  const data = Buffer.alloc(37);
  sha256(Buffer.from(rpId, 'utf8')).copy(data, 0);
  data.writeUInt32BE(counter, 33);
  const nonce = sha256(Buffer.concat([data, sha256(Buffer.from(challenge, 'utf8'))]));
  const signature = crypto.sign('sha256', nonce, signer);
  return cbor(new Map([['signature', signature], ['authenticatorData', data]])).toString('base64');
}

// Independent oracle of the contract's assertion challenge (services/appIntegrity.js signs exactly this).
const oracleChallenge = (operation, requestId, session, body, time) =>
  sha256Hex(
    ['celeste-app-attest-v1', operation, requestId, sha256Hex(session), sha256Hex(JSON.stringify(body)), String(time)].join('\n')
  );

let requestSequence = 0;
function iosRequest({
  operation = 'audio',
  body = voiceBody,
  session = 'ios-session-a',
  requestId = `celeste-ios-request-${String(++requestSequence).padStart(4, '0')}`,
  time = Date.now(),
  counter = 1,
  keyId = KEY_ID,
  signer,
  rpId,
  signed = {},
  headers = {},
} = {}) {
  const challenge = oracleChallenge(
    signed.operation || operation,
    signed.requestId || requestId,
    signed.session || session,
    signed.body || body,
    time
  );
  return {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session}`,
      'content-type': 'application/json',
      'x-celeste-client': 'ios',
      'x-celeste-request-id': requestId,
      'x-celeste-attest-key': keyId,
      'x-celeste-attest-time': String(time),
      'x-celeste-attest-assertion': buildAssertion({ challenge, counter, rpId, signer }),
      'x-vercel-forwarded-for': '203.0.113.30',
      ...headers,
    },
    body,
  };
}

// ---------- fake Supabase + ElevenLabs ----------
function fakeBackend(state) {
  state.calls = [];
  state.reservations = [];
  state.registrations = [];
  state.elevenLabs = 0;
  state.keys = state.keys || new Map();
  const reply = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
  return async (url, options = {}) => {
    const route = url.startsWith(SUPABASE) ? url.slice(SUPABASE.length) : url;
    state.calls.push(route);
    const body = options.body ? JSON.parse(options.body) : null;
    if (route === '/auth/v1/user') {
      const bearer = String(options.headers.Authorization || '').replace(/^Bearer\s+/i, '');
      return USERS[bearer] ? reply({ id: USERS[bearer], is_anonymous: true }) : reply({ msg: 'invalid' }, 401);
    }
    if (route.startsWith('/rest/v1/rpc/') && state.storeDown) return reply({ message: 'down' }, 503);
    if (route === '/rest/v1/rpc/celeste_app_attest_key') {
      const key = state.keys.get(body.p_key_id);
      return reply(
        key && key.userId === body.p_user_id
          ? { found: true, publicKey: key.publicKey, environment: key.environment }
          : { found: false }
      );
    }
    if (route === '/rest/v1/rpc/celeste_advance_app_attest_counter') {
      // Concurrent requests reach this point first (with storeDelay, in another order), then each counter is decided
      // in one step, like migration 015's locked row. Its window (highest counter + the 63 below it, each accepted
      // once) is modelled here as a set of used counters, with the RPC's reasons. The bitmap SQL itself does not run
      // in this verifier (no Postgres here): it was checked on PGlite (Postgres 18 in WASM) against this same model.
      await new Promise((resolve) =>
        state.storeDelay ? setTimeout(resolve, state.storeDelay(body.p_counter)) : setImmediate(resolve)
      );
      if (state.dropKeyBeforeAdvance) state.keys.delete(body.p_key_id); // its user deleted between the two calls
      const key = state.keys.get(body.p_key_id);
      const counter = body.p_counter;
      if (!(counter >= 1 && counter <= 0xffffffff)) return reply({ advanced: false, reason: 'invalid' });
      if (!key || key.userId !== body.p_user_id) return reply({ advanced: false, reason: 'unknown_key' });
      if (counter <= key.signCount - 64) return reply({ advanced: false, reason: 'too_old' });
      if (counter === key.signCount || key.used.has(counter)) return reply({ advanced: false, reason: 'replay' });
      key.used.add(counter);
      key.signCount = Math.max(key.signCount, counter);
      return reply({ advanced: true });
    }
    if (route === '/rest/v1/rpc/celeste_register_app_attest_key') {
      state.registrations.push(body);
      if (!state.keys.has(body.p_key_id)) {
        state.keys.set(body.p_key_id, {
          userId: body.p_user_id,
          publicKey: body.p_public_key,
          environment: body.p_environment,
          signCount: 0,
          used: new Set(),
        });
      }
      return reply(
        state.keys.get(body.p_key_id).userId === body.p_user_id
          ? { registered: true }
          : { registered: false, reason: 'other_user' }
      );
    }
    if (route === '/rest/v1/rpc/celeste_reserve_generation_credit') {
      state.reservations.push(body);
      return reply({ allowed: true, duplicate: false, reserved: false, actorQuota: true, operationQuota: true });
    }
    if (url.startsWith('https://api.elevenlabs.io/')) {
      state.elevenLabs += 1;
      const audio = JSON.stringify({ audio_base64: Buffer.from([0, 0, 1, 0, 255, 255, 2, 0]).toString('base64'), alignment: null });
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
        text: async () => audio,
      };
    }
    throw new Error(`URL inesperada no teste App Attest: ${url}`);
  };
}

const registeredKey = (overrides = {}) =>
  new Map([
    [KEY_ID, { userId: USER_A, publicKey: SPKI_B64, environment: 'production', signCount: 0, used: new Set(), ...overrides }],
  ]);

async function withLogs(run) {
  const lines = [];
  const original = {};
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    original[method] = console[method];
    console[method] = (...args) => lines.push({ method, args });
  }
  try {
    return { result: await run(), lines };
  } finally {
    Object.assign(console, original);
  }
}
const rejected = (reason) => [{ method: 'warn', args: [JSON.stringify({ event: 'app_attest_rejected', reason })] }];
const legacyRejected = (reason) => [
  { method: 'warn', args: [JSON.stringify({ event: 'play_integrity_rejected', reason, googleStatus: null })] },
];
const nativeUserActor = (userId) =>
  crypto.createHmac('sha256', ACTOR_SECRET).update(`celeste-native-user-actor-v1\0${userId}`, 'utf8').digest('hex');

function routeResponse() {
  return {
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
  };
}

// ---------- environment ----------
const ENV_KEYS = [
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
  'CELESTE_APP_ATTEST_ALLOW_DEVELOPMENT',
  'CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64',
  'ELEVENLABS_API_KEY',
  'GEMINI_API_KEY',
  'GEMINI_PAID_DATA_TERMS_ACCEPTED',
  'VERCEL_ENV',
  'VERCEL',
  'NODE_ENV',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;

function configure() {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.CELESTE_SUPABASE_URL = SUPABASE;
  process.env.CELESTE_SUPABASE_ANON_KEY = 'public-anon-key';
  process.env.CELESTE_SUPABASE_SERVICE_ROLE_KEY = 'server-service-role-key';
  process.env.CELESTE_ACTOR_HASH_SECRET = ACTOR_SECRET;
  process.env.CELESTE_ALLOW_LOCAL_NATIVE_BYPASS = '0';
  process.env.VERCEL_ENV = 'production';
  process.env.VERCEL = '1';
  process.env.NODE_ENV = 'production';
  paidAccess.resetAuthorizerForTests();
  appAttest.setRootForTests(pem(rootDer));
}

function restore() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
  paidAccess.resetAuthorizerForTests();
  appAttest.resetForTests();
}

const freshChallenge = (now = Date.now()) => appAttest.issueChallenge(ACTOR_SECRET, now);
const attest = (input) => appAttest.verifyAttestation({ secret: ACTOR_SECRET, ...input });

// ================= tests =================

test('a raiz embutida e a Apple App Attestation Root CA publicada', () => {
  const root = new crypto.X509Certificate(appAttest.APPLE_ROOT_PEM);
  assert.strictEqual(root.fingerprint256, APPLE_ROOT_SHA256, 'PEM embutido diverge do SHA-256 publicado');
  assert.strictEqual(appAttest.APPLE_ROOT_SHA256, APPLE_ROOT_SHA256);
  assert.match(root.subject, /CN=Apple App Attestation Root CA/);
  assert.strictEqual(root.ca, true);
  assert.ok(root.verify(root.publicKey), 'a raiz da Apple e autoassinada');
  assert.strictEqual(root.publicKey.asymmetricKeyDetails.namedCurve, 'secp384r1');
  const source = fs.readFileSync(path.join(ROOT, 'api', '_app-attest.js'), 'utf8');
  assert.ok(source.includes(APPLE_ROOT_SHA256), 'o SHA-256 fica registrado no comentario e na constante');
  assert.match(
    source,
    /appleRoot = root\.fingerprint256 === APPLE_ROOT_SHA256 \? root : null;/,
    'a raiz so vale depois de conferir o SHA-256 em tempo de execucao'
  );
  assert.deepStrictEqual(
    [...source.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]),
    ['CELESTE_APP_ATTEST_ALLOW_DEVELOPMENT', 'VERCEL_ENV'],
    'nenhuma variavel de ambiente troca a raiz; so a de desenvolvimento (fora da producao da Vercel) existe'
  );
});

test('App ID do servidor = appleTeamId do eas.json + bundleIdentifier do app.json', () => {
  assert.match(APP_ID, /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/, `App ID montado da configuracao: ${APP_ID}`);
  assert.strictEqual(appAttest.APP_ID, APP_ID, 'o rpIdHash conferido pelo servidor e o do app que o EAS assina');
});

// Real Apple data, checked with the REAL embedded root (no synthetic root here):
// - attestation: the attestationObject of Apple's App Attest validation guide, as published in the tests of the Go
//   module github.com/takimoto3/app-attest v1.5.0 (apple_guide_test.go): App ID 1234567890.com.example.myapp,
//   keyId zgSY9YSD..., checked at 2026-04-23T18:13:12Z (its credCert lives 3 days). That sample uses the raw
//   challenge "example_server_challenge" as clientDataHash (noted there).
// - assertion: a device assertion from the tests of the Go module github.com/bas-d/appattest v0.1.0
//   (assertion/assertion_test.go): App ID 35MFYY2JY5.co.chiff.attestation-test, clientData {"challenge":"assertion-test"}.
const APPLE_GUIDE_ATTESTATION = [
  'o2NmbXRvYXBwbGUtYXBwYXR0ZXN0Z2F0dFN0bXSiY3g1Y4JZBCEwggQdMIIDo6ADAgECAgYBnbE/C04wCgYIKoZIzj0EAwIw',
  'TzEjMCEGA1UEAwwaQXBwbGUgQXBwIEF0dGVzdGF0aW9uIENBIDExEzARBgNVBAoMCkFwcGxlIEluYy4xEzARBgNVBAgMCkNh',
  'bGlmb3JuaWEwHhcNMjYwNDIwMTgxMzEyWhcNMjYwNDIzMTgxMzEyWjCBkTFJMEcGA1UEAwxAY2UwNDk4ZjU4NDgzZmJiNGRh',
  'MGQ3YjJjNjNhNWE1MzhmNTUyZDRhZGNiOWE0ZmE5MTYxOTVjNDk2MTNlNjU1ZDEaMBgGA1UECwwRQUFBIENlcnRpZmljYXRp',
  'b24xEzARBgNVBAoMCkFwcGxlIEluYy4xEzARBgNVBAgMCkNhbGlmb3JuaWEwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAARD',
  'MlRKzzI9t3REPKrzOfVufpXHJPrCwUJZ82XiRFZQsrX7KFvPVJvLYFlEEudoKiQn7q2p+1Lf7QsasX7Qn6m9o4ICJjCCAiIw',
  'DAYDVR0TAQH/BAIwADAOBgNVHQ8BAf8EBAMCBPAwFAYDVR0lBA0wCwYJKoZIhvdjZAQYMHoGCSqGSIb3Y2QIBQRtMGukAwIB',
  'Cr+JMAMCAQC/iTEDAgEAv4kyAwIBAL+JMwMCAQC/iTQeBBwxMjM0NTY3ODkwLmNvbS5leGFtcGxlLm15YXBwv4k2AwIBBL+J',
  'NwMCAQC/iTkDAgEAv4k6AwIBAL+JOwMCAQCqAwIBADCB4AYJKoZIhvdjZAgHBIHSMIHPv4p4BgQEMjcuML+IUAMCAQK/inkJ',
  'BAcxLjAuMjE2v4p7CQQHMjRBMzI1Yr+KfAYEBDI3LjC/in0GBAQyNy4wv4p+AwIBAL+KfwMCAQC/iwADAgEAv4sBAwIBAL+L',
  'AgMCAQC/iwMDAgEAv4sEAwIBAb+LBQMCAQC/iwoQBA4yNC4xLjMyNS4wLjIsML+LCxAEDjI0LjEuMzI1LjAuMiwwv4sMEAQO',
  'MjQuMS4zMjUuMC4yLDC/iAIKBAhpcGhvbmVvc7+IBQoECEludGVybmFsMDMGCSqGSIb3Y2QIAgQmMCShIgQgh7fQbZOkKU5G',
  '8BHma2zEAPC6sgcpl2xhlYC0KuYL/24wWAYJKoZIhvdjZAgGBEswSaNHBEUwQwwCMTEwPTAKDANva2ShAwEB/zAJDAJvYaED',
  'AQH/MAsMBG9zZ26hAwEB/zALDARvZGVsoQMBAf8wCgwDb2NroQMBAf8wCgYIKoZIzj0EAwIDaAAwZQIwIbzHaPbRKcm2sa4J',
  'vDWyTX40yz9U2byxFxTho+HIM0HeYwF3HLyA3Nrqv3WDy/UdAjEApOoxL7zeQV0yhvasPe31+c1ZYuEDxEU6rDrheFcVMRZe',
  'pvV10+hFxgIWVMSpQu09WQJHMIICQzCCAcigAwIBAgIQCbrF4bxAGtnUU5W8OBoIVDAKBggqhkjOPQQDAzBSMSYwJAYDVQQD',
  'DB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwKQXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5p',
  'YTAeFw0yMDAzMTgxODM5NTVaFw0zMDAzMTMwMDAwMDBaME8xIzAhBgNVBAMMGkFwcGxlIEFwcCBBdHRlc3RhdGlvbiBDQSAx',
  'MRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAErls3oHdN',
  'ebI1j0Dn0fImJvHCX+8XgC3qs4JqWYdP+NKtFSV4mqJmBBkSSLY8uWcGnpjTY71eNw+/oI4ynoBzqYXndG6jWaL2bynbMq9F',
  'XiEWWNVnr54mfrJhTcIaZs6Zo2YwZDASBgNVHRMBAf8ECDAGAQH/AgEAMB8GA1UdIwQYMBaAFKyREFMzvb5oQf+nDKnl+url',
  '5YqhMB0GA1UdDgQWBBQ+410cBBmpybQx+IR01uHhV3LjmzAOBgNVHQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwMDaQAwZgIxALu+',
  'iI1zjQUCz7z9Zm0JV1A1vNaHLD+EMEkmKe3R+RToeZkcmui1rvjTqFQz97YNBgIxAKs47dDMge0ApFLDukT5k2NlU/7MKX8u',
  'tN+fXr5aSsq2mVxLgg35BDhveAe7WJQ5t2dyZWNlaXB0WQ+JMIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEF',
  'ADCABgkqhkiG9w0BBwGggCSABIID6DGCBUEwJAIBAgIBAQQcMTIzNDU2Nzg5MC5jb20uZXhhbXBsZS5teWFwcDCCBCsCAQMC',
  'AQEEggQhMIIEHTCCA6OgAwIBAgIGAZ2xPwtOMAoGCCqGSM49BAMCME8xIzAhBgNVBAMMGkFwcGxlIEFwcCBBdHRlc3RhdGlv',
  'biBDQSAxMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9ybmlhMB4XDTI2MDQyMDE4MTMxMloXDTI2MDQy',
  'MzE4MTMxMlowgZExSTBHBgNVBAMMQGNlMDQ5OGY1ODQ4M2ZiYjRkYTBkN2IyYzYzYTVhNTM4ZjU1MmQ0YWRjYjlhNGZhOTE2',
  'MTk1YzQ5NjEzZTY1NWQxGjAYBgNVBAsMEUFBQSBDZXJ0aWZpY2F0aW9uMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQI',
  'DApDYWxpZm9ybmlhMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEQzJUSs8yPbd0RDyq8zn1bn6VxyT6wsFCWfNl4kRWULK1',
  '+yhbz1Sby2BZRBLnaCokJ+6tqftS3+0LGrF+0J+pvaOCAiYwggIiMAwGA1UdEwEB/wQCMAAwDgYDVR0PAQH/BAQDAgTwMBQG',
  'A1UdJQQNMAsGCSqGSIb3Y2QEGDB6BgkqhkiG92NkCAUEbTBrpAMCAQq/iTADAgEAv4kxAwIBAL+JMgMCAQC/iTMDAgEAv4k0',
  'HgQcMTIzNDU2Nzg5MC5jb20uZXhhbXBsZS5teWFwcL+JNgMCAQS/iTcDAgEAv4k5AwIBAL+JOgMCAQC/iTsDAgEAqgMCAQAw',
  'geAGCSqGSIb3Y2QIBwSB0jCBz7+KeAYEBDI3LjC/iFADAgECv4p5CQQHMS4wLjIxNr+KewkEBzI0QTMyNWK/inwGBAQyNy4w',
  'v4p9BgQEMjcuML+KfgMCAQC/in8DAgEAv4sAAwIBAL+LAQMCAQC/iwIDAgEAv4sDAwIBAL+LBAMCAQG/iwUDAgEAv4sKEAQO',
  'MjQuMS4zMjUuMC4yLDC/iwsQBA4yNC4xLjMyNS4wLjIsML+LDBAEDjI0LjEuMzI1LjAuMiwwv4gCCgQIaXBob25lb3O/iAUK',
  'BAhJbnRlcm5hbDAzBgkqhkiG92NkCAIEJjAkoSIEIIe30G2TpClORvAR5mtsxADwurIHKZdsYZWAtCrmC/9uMFgGCSqGSIb3',
  'Y2QIBgRLMEmjRwRFMEMMAjExMD0wCgwDb2tkoQMBAf8wCQwCb2GhAwEB/zALDARvc2duoQMBAf8wCwwEb2RlbKEDAQH/MAoM',
  'A29ja6EDAQH/MAoGCCoEggFdhkjOPQQDAgNoADBlAjAhvMdo9tEpybaxrgm8NbJNfjTLP1TZvLEXFOGj4cgzQd5jAXccvIDc',
  '2uq/dYPL9R0CMQCk6jEvvN5BXTKG9qw97fX5zVli4QPERTqsOuF4VxUxFl6m9XXT6EXGAhZUxKlC7T0wIAIBBAIBAQQYZXhh',
  'bXBsZV9zZXJ2ZXJfY2hhbGxlbmdlMGACAQUCAQEEWHJia3RNcTg5bXZEcFJDSy84bGNQaGRMNGRXUXo5T1hJd0hHZGU1eFFm',
  'U3VJS3NOM09qT1dGOHUrdjBVQTRxOHZqQ1JnRUVKVGxjOUJ3aUl6TlNOT0hRPT0wDgIBBgIBAQQGQVRURVNUMBICAQcCAQEE',
  'CnByb2R1Y3Rpb24wIAIBDAIBAQQYMjAyNi0wNC0yMVQxODoxMzoxMi4xNTNaMCACARUCAQEEGDIwMjYtMDctMjBUMTg6MTM6',
  'MTIuMTUzWgAAAAAAAKCAMIIDrjCCA1SgAwIBAgIQZgI4gAAUJvddiw4VLF9uQzAKBggqhkjOPQQDAjB8MTAwLgYDVQQDDCdB',
  'cHBsZSBBcHBsaWNhdGlvbiBJbnRlZ3JhdGlvbiBDQSA1IC0gRzExJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0',
  'aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzAeFw0yNjAxMjAyMDIxMDlaFw0yNzAyMTgxODU4Mzla',
  'MFoxNjA0BgNVBAMMLUFwcGxpY2F0aW9uIEF0dGVzdGF0aW9uIEZyYXVkIFJlY2VpcHQgU2lnbmluZzETMBEGA1UECgwKQXBw',
  'bGUgSW5jLjELMAkGA1UEBhMCVVMwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAQ7GK7OxRmtilNRtEBEtKMDmVe0zb1bhR/g',
  'Gm/t4o3vsPqww2oCpB9EbgBtWA5WimeAiQfzSICRQ4sgzqpMndxWo4IB2DCCAdQwDAYDVR0TAQH/BAIwADAfBgNVHSMEGDAW',
  'gBTZF/5LZ5A4S5L0287VV4AUC489yTBDBggrBgEFBQcBAQQ3MDUwMwYIKwYBBQUHMAGGJ2h0dHA6Ly9vY3NwLmFwcGxlLmNv',
  'bS9vY3NwMDMtYWFpY2E1ZzEwMTCCARwGA1UdIASCARMwggEPMIIBCwYJKoZIhvdjZAUBMIH9MIHDBggrBgEFBQcCAjCBtgyB',
  's1JlbGlhbmNlIG9uIHRoaXMgY2VydGlmaWNhdGUgYnkgYW55IHBhcnR5IGFzc3VtZXMgYWNjZXB0YW5jZSBvZiB0aGUgdGhl',
  'biBhcHBsaWNhYmxlIHN0YW5kYXJkIHRlcm1zIGFuZCBjb25kaXRpb25zIG9mIHVzZSwgY2VydGlmaWNhdGUgcG9saWN5IGFu',
  'ZCBjZXJ0aWZpY2F0aW9uIHByYWN0aWNlIHN0YXRlbWVudHMuMDUGCCsGAQUFBwIBFilodHRwOi8vd3d3LmFwcGxlLmNvbS9j',
  'ZXJ0aWZpY2F0ZWF1dGhvcml0eTAdBgNVHQ4EFgQUNFWJcHRgDiLSumfPpVtpwiPxyigwDgYDVR0PAQH/BAQDAgeAMA8GCSqG',
  'SIb3Y2QMDwQCBQAwCgYIKoZIzj0EAwIDSAAwRQIgHGeXuYJF0dbccgS3mwI8r/h78u/4k33XIMReiuRlwusCIQD8yFmEzsmh',
  'LMKGqdSSdv3w0vYl3HX8fPiHRWl75h6qtDCCAvkwggJ/oAMCAQICEFb7g9Qr/43DN5kjtVqubr0wCgYIKoZIzj0EAwMwZzEb',
  'MBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEG',
  'A1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTkwMzIyMTc1MzMzWhcNMzQwMzIyMDAwMDAwWjB8MTAwLgYDVQQD',
  'DCdBcHBsZSBBcHBsaWNhdGlvbiBJbnRlZ3JhdGlvbiBDQSA1IC0gRzExJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24g',
  'QXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJLO',
  'Y719hrGrKAo7HOGv+wSUgJGs9jHfpssoNW9ES+Eh5VfdEo2NuoJ8lb5J+r4zyq7NBBnxL0Ml+vS+s8uDfrqjgfcwgfQwDwYD',
  'VR0TAQH/BAUwAwEB/zAfBgNVHSMEGDAWgBS7sN6hWDOImqSKmd6+veuv2sskqzBGBggrBgEFBQcBAQQ6MDgwNgYIKwYBBQUH',
  'MAGGKmh0dHA6Ly9vY3NwLmFwcGxlLmNvbS9vY3NwMDMtYXBwbGVyb290Y2FnMzA3BgNVHR8EMDAuMCygKqAohiZodHRwOi8v',
  'Y3JsLmFwcGxlLmNvbS9hcHBsZXJvb3RjYWczLmNybDAdBgNVHQ4EFgQU2Rf+S2eQOEuS9NvO1VeAFAuPPckwDgYDVR0PAQH/',
  'BAQDAgEGMBAGCiqGSIb3Y2QGAgMEAgUAMAoGCCqGSM49BAMDA2gAMGUCMQCNb6afoeDk7FtOc4qSfz14U5iP9NofWB7DdUr+',
  'OKhMKoMaGqoNpmRt4bmT6NFVTO0CMGc7LLTh6DcHd8vV7HaoGjpVOz81asjF5pKw4WG+gElp5F8rqWzhEQKqzGHZOLdzSjCC',
  'AkMwggHJoAMCAQICCC3F/IjSxUuVMAoGCCqGSM49BAMDMGcxGzAZBgNVBAMMEkFwcGxlIFJvb3QgQ0EgLSBHMzEmMCQGA1UE',
  'CwwdQXBwbGUgQ2VydGlmaWNhdGlvbiBBdXRob3JpdHkxEzARBgNVBAoMCkFwcGxlIEluYy4xCzAJBgNVBAYTAlVTMB4XDTE0',
  'MDQzMDE4MTkwNloXDTM5MDQzMDE4MTkwNlowZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBs',
  'ZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwdjAQBgcqhkjOPQIB',
  'BgUrgQQAIgNiAASY6S89QHKk7ZMicoETHN0QlfHFo05x3BQW2Q7lpgUqd2R7X04407scRLV/9R+2MmJdyemEW08wTxFaAP1Y',
  'WAyl9Q8sTQdHE3Xal5eXbzFc7SudeyA72LlU2V6ZpDpRCjGjQjBAMB0GA1UdDgQWBBS7sN6hWDOImqSKmd6+veuv2sskqzAP',
  'BgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB/wQEAwIBBjAKBggqhkjOPQQDAwNoADBlAjEAg+nBxBZeGl00GNnt7/RsDgBGS7jf',
  'skYRxQ/95nqMoaZrzsID1Jz1k8Z0uGrfqiMVAjBtZooQytQN1E/NjUM+tIpjpTNu423aF7dkH8hTJvmIYnQ5Cxdby1GoDOgY',
  'A+eisigAADGB/TCB+gIBATCBkDB8MTAwLgYDVQQDDCdBcHBsZSBBcHBsaWNhdGlvbiBJbnRlZ3JhdGlvbiBDQSA1IC0gRzEx',
  'JjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJV',
  'UwIQZgI4gAAUJvddiw4VLF9uQzANBglghkgBZQMEAgEFADAKBggqhkjOPQQDAgRHMEUCIFp+GIuJm5vqJhLtDX40gGP90KJt',
  'LoPyzcLEuKHYMr9zAiEAgPafgwU16p2N6GvCC3Gj4BAb66R38+IP+Arn3QYbD9QAAAAAAABoYXV0aERhdGFY4vRGbWj5HrbB',
  'BiDLfmPHKDJEaF7h1kZ7VBYOdTFyBX8DQAAAAABhcHBhdHRlc3QAAAAAAAAAACDOBJj1hIP7tNoNeyxjpaU49VLUrcuaT6kW',
  'GVxJYT5lXaUBAgMmIAEhWCBDMlRKzzI9t3REPKrzOfVufpXHJPrCwUJZ82XiRFZQsiJYILX7KFvPVJvLYFlEEudoKiQn7q2p',
  '+1Lf7QsasX7Qn6m9ondhcHBsZV9idW5kbGVfdmVyc2lvbl8wMWExeBxhcHBsZV92YWxpZGF0aW9uX2NhdGVnb3J5XzAxRAEA',
  'AAA=',
].join('');
const APPLE_GUIDE_ATTESTATION_SHA256 = 'ef2b7c2279d46a2a32365ea80361740b7379aa67774777102a7251a517eaa938';
const DEVICE_ASSERTION =
  'omlzaWduYXR1cmVYRzBFAiEAyC5S3pcvtSpmTfNSd8aJRJCQ6PbN7Dnv_oPkZNMLeIwCIBmxCHXKYyGswzp_LwOxoL18puHooxudXWqDgtTvRomdcWF1dGhlbnRpY2F0b3JEYXRhWCV87ytV2nJBCLqRJ5b2df8AvnHVLa4mj6aI00ym0n9wdEAAAAAD';
const DEVICE_ASSERTION_POINT =
  '0437c404fa2bbf8fbcf4ee7080573d5fa80c4f6cc3a22f7db43af92c394e7cd1c880c95ab422972625e8e673af1bda2b096654e9b602895601f925bb5941c53082';

test('dados reais da Apple passam pelos mesmos passos, com a raiz embutida', () => {
  appAttest.resetForTests();
  assert.strictEqual(sha256Hex(APPLE_GUIDE_ATTESTATION), APPLE_GUIDE_ATTESTATION_SHA256, 'amostra da Apple intacta');
  const sample = {
    keyId: 'zgSY9YSD+7TaDXssY6WlOPVS1K3Lmk+pFhlcSWE+ZV0=',
    attestation: APPLE_GUIDE_ATTESTATION,
    clientDataHash: Buffer.from('example_server_challenge', 'utf8'),
    rpIdHash: sha256(Buffer.from('1234567890.com.example.myapp', 'utf8')),
    now: Date.UTC(2026, 3, 23, 18, 13, 12),
  };
  const verified = appAttest._internals.checkAttestationObject(sample);
  assert.strictEqual(verified.ok, true, `atestacao real da Apple: ${JSON.stringify(verified)}`);
  assert.strictEqual(verified.environment, 'production');
  assert.deepStrictEqual(
    verified.extensions,
    { validationCategory: 1, bundleVersion: '1' },
    'extensoes reais (sem o flag ED): categoria em 4 bytes LE e versao em texto'
  );
  const attestedKey = crypto.createPublicKey({ key: Buffer.from(verified.publicKey, 'base64'), format: 'der', type: 'spki' });
  assert.strictEqual(sha256(uncompressedPoint(attestedKey)).toString('base64'), sample.keyId);
  for (const [label, change, reason] of [
    ['hoje (o credCert de 3 dias venceu)', { now: Date.now() }, 'chain_invalid'],
    ['clientDataHash de outro desafio', { clientDataHash: sha256(Buffer.from('example_server_challenge')) }, 'nonce_mismatch'],
    ['App ID da Celeste', { rpIdHash: sha256(Buffer.from(APP_ID)) }, 'rp_id_mismatch'],
    ['outro keyId', { keyId: KEY_ID }, 'key_id_mismatch'],
  ]) {
    assert.deepStrictEqual(appAttest._internals.checkAttestationObject({ ...sample, ...change }), { ok: false, reason }, label);
  }

  const point = Buffer.from(DEVICE_ASSERTION_POINT, 'hex');
  const deviceKey = crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') },
    format: 'jwk',
  });
  const assertion = {
    assertion: Buffer.from(DEVICE_ASSERTION, 'base64url').toString('base64'),
    clientDataHash: sha256(Buffer.from('{"challenge":"assertion-test"}', 'utf8')),
    publicKey: deviceKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    rpIdHash: sha256(Buffer.from('35MFYY2JY5.co.chiff.attestation-test', 'utf8')),
  };
  const checked = appAttest._internals.checkAssertion(assertion);
  assert.strictEqual(checked.ok, true, `assinatura real de aparelho: ${JSON.stringify(checked)}`);
  assert.ok(checked.counter > 0, 'contador real maior que zero');
  assert.deepStrictEqual(
    appAttest._internals.checkAssertion({ ...assertion, clientDataHash: sha256(Buffer.from('{"challenge":"outro"}')) }),
    { ok: false, reason: 'signature_invalid' }
  );
  assert.deepStrictEqual(
    appAttest._internals.checkAssertion({ ...assertion, rpIdHash: sha256(Buffer.from(APP_ID)) }),
    { ok: false, reason: 'rp_id_mismatch' }
  );
});

test('desafio sem estado: HMAC do segredo, 5 minutos, formato do contrato', () => {
  const now = Date.now();
  const challenge = freshChallenge(now);
  assert.match(challenge, /^[A-Za-z0-9_-]{54}$/, 'base64url de 40 bytes');
  const raw = Buffer.from(challenge, 'base64url');
  const payload = raw.subarray(0, 24);
  assert.strictEqual(Number(payload.readBigUInt64BE(16)), now, '16 aleatorios || timestamp ms (8 bytes BE)');
  const mac = crypto
    .createHmac('sha256', ACTOR_SECRET)
    .update(Buffer.concat([Buffer.from('celeste-app-attest-challenge-v1\0', 'utf8'), payload]))
    .digest()
    .subarray(0, 16);
  assert.ok(raw.subarray(24).equals(mac), 'primeiros 16 bytes do HMAC-SHA256 do contrato');
  assert.notStrictEqual(freshChallenge(now), challenge, 'cada desafio tem 16 bytes aleatorios');

  assert.strictEqual(appAttest.checkChallenge(ACTOR_SECRET, challenge, now), null);
  assert.strictEqual(appAttest.checkChallenge(ACTOR_SECRET, challenge, now + 5 * 60 * 1000), null, 'vale 5 minutos');
  assert.strictEqual(appAttest.checkChallenge(ACTOR_SECRET, challenge, now + 5 * 60 * 1000 + 1), 'challenge_expired');
  assert.strictEqual(appAttest.checkChallenge(ACTOR_SECRET, challenge, now - 31 * 1000), 'challenge_expired', 'do futuro');
  const tampered = Buffer.from(raw);
  tampered.writeBigUInt64BE(BigInt(now + 60 * 60 * 1000), 16);
  assert.strictEqual(appAttest.checkChallenge(ACTOR_SECRET, tampered.toString('base64url'), now), 'challenge_invalid');
  assert.strictEqual(
    appAttest.checkChallenge('outro-segredo-com-pelo-menos-32-bytes!!', challenge, now),
    'challenge_invalid'
  );
  for (const forged of ['', 'curto', `${challenge}A`, challenge.replace(/.$/, '='), null]) {
    assert.strictEqual(appAttest.checkChallenge(ACTOR_SECRET, forged, now), 'challenge_invalid', String(forged));
  }
});

test('atestacao valida devolve a chave SPKI, o receipt e o ambiente', (t) => {
  configure();
  t.after(restore);
  const challenge = freshChallenge();
  const verified = attest({ keyId: KEY_ID, challenge, attestation: buildAttestation({ challenge }) });
  assert.deepStrictEqual(verified, {
    ok: true,
    publicKey: SPKI_B64,
    receipt: RECEIPT.toString('base64'),
    environment: 'production',
    extensions: null,
  });
  // Without the test root the synthetic chain is not Apple's.
  appAttest.resetForTests();
  assert.deepStrictEqual(
    attest({ keyId: KEY_ID, challenge, attestation: buildAttestation({ challenge }) }),
    { ok: false, reason: 'chain_invalid' },
    'em producao so a raiz da Apple vale'
  );
});

test('cada passo da atestacao recusa sozinho', (t) => {
  configure();
  t.after(restore);
  const challenge = freshChallenge();
  const wrongKeyId = sha256(Buffer.from('outra chave')).toString('base64');
  const cases = [
    ['nonce de outro desafio', { attestation: buildAttestation({ challenge, nonceChallenge: freshChallenge() }) }, 'nonce_mismatch'],
    ['rpIdHash de outro app', { attestation: buildAttestation({ challenge, rpId: 'ABCDE12345.com.celesteapp.affirmations' }) }, 'rp_id_mismatch'],
    ['aaguid de desenvolvimento sem a variavel', { attestation: buildAttestation({ challenge, aaguid: AAGUID_DEVELOPMENT }) }, 'aaguid_invalid'],
    ['aaguid desconhecido', { attestation: buildAttestation({ challenge, aaguid: Buffer.from('notappattest0000') }) }, 'aaguid_invalid'],
    ['contador diferente de 0', { attestation: buildAttestation({ challenge, counter: 1 }) }, 'counter_not_zero'],
    ['keyId nao e o hash da chave do credCert', { keyId: wrongKeyId, attestation: buildAttestation({ challenge, keyId: wrongKeyId }) }, 'key_id_mismatch'],
    ['credentialId diferente do keyId', { attestation: buildAttestation({ challenge, credentialId: sha256(Buffer.from('outro id')) }) }, 'credential_id_mismatch'],
    ['cadeia de outra raiz com os mesmos nomes', { attestation: buildAttestation({ challenge, chain: 'rogue-root' }) }, 'chain_invalid'],
    ['folha assinada por outra chave', { attestation: buildAttestation({ challenge, chain: 'rogue-intermediate-key' }) }, 'chain_invalid'],
    ['sem o intermediario', { attestation: buildAttestation({ challenge, chain: 'leaf-only' }) }, 'chain_invalid'],
    ['folha comum usada como intermediario', { attestation: buildAttestation({ challenge, chain: 'non-ca-issuer' }) }, 'chain_invalid'],
    ['assinatura certa, nome do emissor errado', { attestation: buildAttestation({ challenge, chain: 'wrong-issuer-name' }) }, 'chain_invalid'],
    ['credCert vencido', { attestation: buildAttestation({ challenge, leaf: { notBefore: NOW - 10 * DAY, notAfter: NOW - DAY } }) }, 'chain_invalid'],
    ['credCert ainda nao valido', { attestation: buildAttestation({ challenge, leaf: { notBefore: NOW + DAY, notAfter: NOW + 3 * DAY } }) }, 'chain_invalid'],
    ['formato que nao e apple-appattest', { attestation: buildAttestation({ challenge, fmt: 'packed' }) }, 'format_invalid'],
    ['atestacao que nao e CBOR', { attestation: Buffer.from('nao e cbor').toString('base64') }, 'attestation_malformed'],
    ['keyId fora do formato', { keyId: 'abc', attestation: buildAttestation({ challenge }) }, 'attestation_malformed'],
  ];
  for (const [label, input, reason] of cases) {
    assert.deepStrictEqual(attest({ keyId: KEY_ID, challenge, ...input }), { ok: false, reason }, label);
  }
  const tampered = Buffer.from(challenge, 'base64url');
  tampered[3] ^= 0xff;
  const tamperedChallenge = tampered.toString('base64url');
  assert.deepStrictEqual(
    attest({ keyId: KEY_ID, challenge: tamperedChallenge, attestation: buildAttestation({ challenge: tamperedChallenge }) }),
    { ok: false, reason: 'challenge_invalid' },
    'desafio adulterado'
  );
  const oldChallenge = freshChallenge(Date.now() - 5 * 60 * 1000 - 1000);
  assert.deepStrictEqual(
    attest({ keyId: KEY_ID, challenge: oldChallenge, attestation: buildAttestation({ challenge: oldChallenge }) }),
    { ok: false, reason: 'challenge_expired' },
    'desafio vencido'
  );
});

test('chave de desenvolvimento so com CELESTE_APP_ATTEST_ALLOW_DEVELOPMENT=1 e fora da producao da Vercel', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  const challenge = freshChallenge();
  const attestation = buildAttestation({ challenge, aaguid: AAGUID_DEVELOPMENT });
  const setEnvironment = (flag, vercelEnv) => {
    process.env.CELESTE_APP_ATTEST_ALLOW_DEVELOPMENT = flag;
    if (vercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = vercelEnv;
  };
  for (const [label, flag, vercelEnv] of [
    ['variavel "true" no preview', 'true', 'preview'],
    ['variavel 1 na producao da Vercel', '1', 'production'],
  ]) {
    setEnvironment(flag, vercelEnv);
    assert.deepStrictEqual(attest({ keyId: KEY_ID, challenge, attestation }), { ok: false, reason: 'aaguid_invalid' }, `registro: ${label}`);
  }
  for (const [label, vercelEnv] of [['preview', 'preview'], ['local, sem VERCEL_ENV', undefined]]) {
    setEnvironment('1', vercelEnv);
    const verified = attest({ keyId: KEY_ID, challenge, attestation });
    assert.strictEqual(verified.ok, true, `registro com a variavel (${label}): ${JSON.stringify(verified)}`);
    assert.strictEqual(verified.environment, 'development');
  }

  // a key registered as development, used later
  const assertWith = async (vercelEnv) => {
    setEnvironment('1', vercelEnv);
    const state = { keys: registeredKey({ environment: 'development' }) };
    global.fetch = fakeBackend(state);
    return withLogs(() => paidAccess.authorizePaidRequest(iosRequest(), { operation: 'audio', units: 4 }));
  };
  const production = await assertWith('production');
  assert.deepStrictEqual(production.result, REATTEST, 'producao da Vercel: a chave de desenvolvimento nunca vale');
  assert.deepStrictEqual(production.lines, rejected('development_key'));
  const preview = await assertWith('preview');
  assert.strictEqual(preview.result.ok, true, `preview com a variavel: ${JSON.stringify(preview.result)}`);
});

test('rota /api/app-attest: desafio e registro so do iPhone, ligado ao usuario da sessao', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  const route = require('../api/app-attest');
  const state = {};
  global.fetch = fakeBackend(state);
  const call = async (body, headers = {}, method = 'POST') => {
    const res = routeResponse();
    const { lines } = await withLogs(() =>
      route(
        {
          method,
          headers: { authorization: 'Bearer ios-session-a', 'content-type': 'application/json', 'x-celeste-client': 'ios', ...headers },
          body,
        },
        res
      )
    );
    return { res, lines };
  };

  const issued = await call({ action: 'challenge' });
  assert.strictEqual(issued.res.statusCode, 200);
  assert.strictEqual(appAttest.checkChallenge(ACTOR_SECRET, issued.res.body.challenge), null);
  assert.strictEqual(issued.res.headers['cache-control'], 'no-store, max-age=0');
  assert.deepStrictEqual(state.calls, [], 'o desafio nao consulta nada');

  const challenge = issued.res.body.challenge;
  // Apple's encoding (see the real sample below): category = 4-byte little-endian UInt32, version = text.
  const extensions = new Map([['apple_validation_category_01', Buffer.from([1, 0, 0, 0])], ['apple_bundle_version_01', '1.0.2']]);
  const attestation = buildAttestation({ challenge, extensions });
  const registered = await call({ action: 'register', keyId: KEY_ID, attestation, challenge });
  assert.strictEqual(registered.res.statusCode, 200, JSON.stringify(registered.res.body));
  assert.deepStrictEqual(registered.res.body, { ok: true });
  assert.deepStrictEqual(state.calls, ['/auth/v1/user', '/rest/v1/rpc/celeste_register_app_attest_key']);
  assert.deepStrictEqual(state.registrations, [
    {
      p_key_id: KEY_ID,
      p_user_id: USER_A,
      p_public_key: SPKI_B64,
      p_environment: 'production',
      p_receipt: RECEIPT.toString('base64'),
    },
  ]);
  assert.deepStrictEqual(
    registered.lines,
    [
      {
        method: 'info',
        args: [JSON.stringify({ event: 'app_attest_registered', environment: 'production', validationCategory: 1, bundleVersion: '1.0.2' })],
      },
    ],
    'extensoes novas do authData: lidas e registradas no log, sem exigir'
  );

  const retried = await call({ action: 'register', keyId: KEY_ID, attestation, challenge });
  assert.strictEqual(retried.res.statusCode, 200, 'o mesmo usuario pode repetir o registro (resposta perdida)');

  const stolen = await call({ action: 'register', keyId: KEY_ID, attestation, challenge }, { authorization: 'Bearer ios-session-b' });
  assert.strictEqual(stolen.res.statusCode, 403);
  assert.deepStrictEqual(stolen.res.body, { error: 'native_attestation_required' });
  assert.deepStrictEqual(stolen.lines, rejected('key_other_user'), 'chave ja ligada a outro usuario = recusa');
  assert.strictEqual(state.keys.get(KEY_ID).userId, USER_A);

  state.calls.length = 0;
  const forged = await call({ action: 'register', keyId: KEY_ID, attestation: buildAttestation({ challenge, counter: 7 }), challenge });
  assert.strictEqual(forged.res.statusCode, 403);
  assert.deepStrictEqual(forged.lines, rejected('counter_not_zero'));
  assert.deepStrictEqual(state.calls, [], 'atestacao invalida nao chega ao Supabase');

  const tampered = `${challenge.slice(0, 10)}${challenge[10] === 'A' ? 'B' : 'A'}${challenge.slice(11)}`;
  const tamperedCall = await call({ action: 'register', keyId: KEY_ID, attestation: buildAttestation({ challenge: tampered }), challenge: tampered });
  assert.strictEqual(tamperedCall.res.statusCode, 403);
  assert.deepStrictEqual(tamperedCall.lines, rejected('challenge_invalid'));

  for (const [label, body, headers, method, status, error] of [
    ['navegador (com Origin)', { action: 'challenge' }, { origin: 'https://celeste-jet-two.vercel.app' }, 'POST', 403, 'origin_not_allowed'],
    ['cliente Android', { action: 'challenge' }, { 'x-celeste-client': 'android' }, 'POST', 403, 'origin_not_allowed'],
    ['sem X-Celeste-Client', { action: 'challenge' }, { 'x-celeste-client': '' }, 'POST', 403, 'origin_not_allowed'],
    ['GET', { action: 'challenge' }, {}, 'GET', 405, 'method_not_allowed'],
    ['acao desconhecida', { action: 'delete' }, {}, 'POST', 400, 'invalid_request'],
    ['campo a mais', { action: 'challenge', userId: USER_B }, {}, 'POST', 400, 'invalid_request'],
    ['registro sem sessao', { action: 'register', keyId: KEY_ID, attestation, challenge }, { authorization: '' }, 'POST', 401, 'identity_required'],
  ]) {
    state.calls.length = 0;
    const { res } = await call(body, headers, method);
    assert.strictEqual(res.statusCode, status, label);
    assert.deepStrictEqual(res.body, { error }, label);
    assert.deepStrictEqual(state.calls, [], `${label}: nada sai da funcao`);
  }

  delete process.env.CELESTE_ACTOR_HASH_SECRET;
  const unconfigured = await call({ action: 'challenge' });
  assert.strictEqual(unconfigured.res.statusCode, 503, 'sem segredo nao ha desafio');
});

test('pedido pago do iPhone passa so com a assercao verificada, antes da cota', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  const state = { keys: registeredKey() };
  global.fetch = fakeBackend(state);
  const req = iosRequest({ counter: 1 });
  assert.strictEqual(paidAccess.isNativeRequest(req), true, 'os 3 cabecalhos passam o pre-filtro da rota');
  const { result, lines } = await withLogs(() => paidAccess.authorizePaidRequest(req, { operation: 'audio', units: 4 }));
  assert.strictEqual(result.ok, true, JSON.stringify(result));
  assert.strictEqual(result.native, true);
  assert.deepStrictEqual(lines, [], 'pedido aceito nao escreve log');
  assert.deepStrictEqual(state.calls, [
    '/auth/v1/user',
    '/rest/v1/rpc/celeste_app_attest_key',
    '/rest/v1/rpc/celeste_advance_app_attest_counter',
    '/rest/v1/rpc/celeste_reserve_generation_credit',
  ]);
  assert.strictEqual(state.keys.get(KEY_ID).signCount, 1, 'o contador guardado sobe');
  assert.strictEqual(state.reservations[0].p_user_id, USER_A);
  assert.strictEqual(state.reservations[0].p_actor_hash, nativeUserActor(USER_A), 'cota de ator da pessoa verificada');

  for (const [operation, units, body] of [
    ['scene', 12, { desire: 'viver perto do mar', lang: 'pt' }],
    ['translation', 3, { sourceLang: 'pt', targetLang: 'en' }],
  ]) {
    const counter = state.keys.get(KEY_ID).signCount + 1;
    const text = await paidAccess.authorizePaidRequest(iosRequest({ operation, body, counter }), { operation, units });
    assert.strictEqual(text.ok, true, `${operation}: ${JSON.stringify(text)}`);
  }
});

test('replay, falsificacao e tempo fora recusam antes da cota', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  const run = async (state, req, operation = 'audio') => {
    global.fetch = fakeBackend(state);
    return withLogs(() => paidAccess.authorizePaidRequest(req, { operation, units: operation === 'audio' ? 4 : 3 }));
  };
  const expectRefused = async (label, state, req, reason, operation, expected = NATIVE_DENIED) => {
    const { result, lines } = await run(state, req, operation);
    assert.deepStrictEqual(result, expected, label);
    assert.deepStrictEqual(lines, rejected(reason), `${label}: uma linha de log com o motivo`);
    assert.deepStrictEqual(state.reservations, [], `${label}: nao chega a cota`);
    return state;
  };

  // the same assertion twice: the stored counter already has it
  const shared = { keys: registeredKey() };
  const replayed = iosRequest({ counter: 1 });
  assert.strictEqual((await run(shared, replayed)).result.ok, true);
  await expectRefused('assercao repetida (mesmo contador)', shared, replayed, 'counter_replay');
  await expectRefused('contador menor ja usado', { keys: registeredKey({ signCount: 5, used: new Set([3, 5]) }) }, iosRequest({ counter: 3 }), 'counter_replay');
  await expectRefused('contador igual ao guardado', { keys: registeredKey({ signCount: 5 }) }, iosRequest({ counter: 5 }), 'counter_replay');
  await expectRefused('contador mais antigo que a janela (63)', { keys: registeredKey({ signCount: 100 }) }, iosRequest({ counter: 36 }), 'counter_too_old');

  // two requests with the same counter at the same time: the atomic RPC lets only one through
  const race = { keys: registeredKey({ signCount: 2 }) };
  global.fetch = fakeBackend(race);
  const raced = await withLogs(() =>
    Promise.all([
      paidAccess.authorizePaidRequest(iosRequest({ counter: 3 }), { operation: 'audio', units: 4 }),
      paidAccess.authorizePaidRequest(iosRequest({ counter: 3 }), { operation: 'audio', units: 4 }),
    ])
  );
  assert.strictEqual(raced.result.filter((item) => item.ok).length, 1, 'mesmo contador em paralelo: so um passa');
  assert.deepStrictEqual(raced.result.find((item) => !item.ok), NATIVE_DENIED);
  assert.deepStrictEqual(raced.lines, rejected('counter_replay'));
  assert.strictEqual(race.reservations.length, 1);

  await expectRefused('assinatura de outra chave', { keys: registeredKey() }, iosRequest({ signer: otherDevice.privateKey }), 'signature_invalid');
  await expectRefused('corpo trocado depois da assercao', { keys: registeredKey() }, iosRequest({ signed: { body: { ...voiceBody, text: 'Outro texto.' } } }), 'signature_invalid');
  await expectRefused('assercao de outra operacao', { keys: registeredKey() }, iosRequest({ operation: 'scene', body: voiceBody, signed: { operation: 'audio' } }), 'signature_invalid', 'scene');
  await expectRefused('assercao de outro pedido', { keys: registeredKey() }, iosRequest({ signed: { requestId: 'celeste-ios-request-9999' } }), 'signature_invalid');
  await expectRefused('assercao de outra sessao do mesmo usuario', { keys: registeredKey() }, iosRequest({ session: 'ios-session-a-refreshed', signed: { session: 'ios-session-a' } }), 'signature_invalid');
  await expectRefused('rpIdHash de outro app', { keys: registeredKey() }, iosRequest({ rpId: 'ABCDE12345.com.celesteapp.affirmations' }), 'rp_id_mismatch');
  // the three refusals the app fixes by attesting a new key
  await expectRefused('chave de outro usuario', { keys: registeredKey() }, iosRequest({ session: 'ios-session-b' }), 'unknown_key', 'audio', REATTEST);
  await expectRefused('chave nunca registrada', { keys: new Map() }, iosRequest(), 'unknown_key', 'audio', REATTEST);
  await expectRefused('chave de desenvolvimento sem a variavel', { keys: registeredKey({ environment: 'development' }) }, iosRequest(), 'development_key', 'audio', REATTEST);
  await expectRefused('chave apagada entre a consulta e o contador', { keys: registeredKey(), dropKeyBeforeAdvance: true }, iosRequest(), 'unknown_key', 'audio', REATTEST);
  await expectRefused('banco das chaves fora do ar', { keys: registeredKey(), storeDown: true }, iosRequest(), 'store_unavailable');
  await expectRefused(
    'assercao que nao e CBOR',
    { keys: registeredKey() },
    iosRequest({ headers: { 'x-celeste-attest-assertion': Buffer.from('nao e cbor').toString('base64') } }),
    'assertion_malformed'
  );
  // X-Celeste-Attest-Time is the phone's clock: +-24 h, so a phone with the wrong time is not locked out
  for (const [label, offset] of [['24 h e 5 s atras', -(DAY + 5000)], ['24 h e 5 s no futuro', DAY + 5000]]) {
    const state = await expectRefused(`tempo fora da janela (${label})`, { keys: registeredKey() }, iosRequest({ time: Date.now() + offset }), 'stale');
    assert.ok(!state.calls.includes('/rest/v1/rpc/celeste_app_attest_key'), `${label}: nem consulta a chave`);
  }
  for (const [label, offset] of [
    ['6 min atras', -6 * 60 * 1000],
    ['6 min no futuro', 6 * 60 * 1000],
    ['23 h 59 min atras', -(DAY - 60 * 1000)],
    ['23 h 59 min no futuro', DAY - 60 * 1000],
  ]) {
    const outcome = await run({ keys: registeredKey() }, iosRequest({ time: Date.now() + offset }));
    assert.strictEqual(outcome.result.ok, true, `relogio do aparelho ${label}: ${JSON.stringify(outcome.result)}`);
  }
});

test('ate 8 pedidos simultaneos do iPhone, com os contadores fora de ordem, passam uma vez cada', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  // counters 101..108, one per translation, reaching the store from 108 down to 101 (the worst case for "only up")
  const state = { keys: registeredKey({ signCount: 100, used: new Set([100]) }), storeDelay: (counter) => (109 - counter) * 3 };
  global.fetch = fakeBackend(state);
  const requests = [101, 102, 103, 104, 105, 106, 107, 108].map((counter) =>
    iosRequest({ operation: 'translation', body: translationBody, counter })
  );
  const send = () =>
    withLogs(() => Promise.all(requests.map((req) => paidAccess.authorizePaidRequest(req, { operation: 'translation', units: 3 }))));
  const first = await send();
  assert.deepStrictEqual(first.result.map((item) => item.ok), Array(8).fill(true), JSON.stringify(first.result));
  assert.deepStrictEqual(first.lines, [], 'nenhuma recusa');
  assert.strictEqual(state.reservations.length, 8, 'as 8 chegam a cota');
  assert.strictEqual(state.keys.get(KEY_ID).signCount, 108);

  state.storeDelay = null;
  const again = await send();
  assert.deepStrictEqual(again.result, Array(8).fill(NATIVE_DENIED), 'as mesmas 8 assercoes de novo: todas recusadas');
  assert.deepStrictEqual(again.lines, Array(8).fill(rejected('counter_replay')[0]));
  assert.strictEqual(state.reservations.length, 8, 'replay nao chega a cota');

  // the window edge: 63 counters below the highest one
  const edge = await paidAccess.authorizePaidRequest(iosRequest({ counter: 108 - 63 }), { operation: 'audio', units: 4 });
  assert.strictEqual(edge.ok, true, `maior - 63, nunca usado: ${JSON.stringify(edge)}`);
  const old = await withLogs(() => paidAccess.authorizePaidRequest(iosRequest({ counter: 108 - 64 }), { operation: 'audio', units: 4 }));
  assert.deepStrictEqual(old.result, NATIVE_DENIED, 'maior - 64: fora da janela');
  assert.deepStrictEqual(old.lines, rejected('counter_too_old'), 'o log separa o antigo demais do replay');
});

test('rotas pagas: chave desconhecida ou de desenvolvimento pedem um novo registro, o resto segue generico', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  process.env.ELEVENLABS_API_KEY = 'elevenlabs-route-test-secret';
  process.env.GEMINI_API_KEY = 'gemini-route-test-secret';
  process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = '1';
  for (const [name, route, operation, body] of [
    ['gerar-audio', require('../api/gerar-audio'), 'audio', voiceBody],
    ['gerar-cena', require('../api/gerar-cena'), 'scene', sceneBody],
    ['traduzir-cena', require('../api/traduzir-cena'), 'translation', translationBody],
  ]) {
    for (const [label, keys, request, reason, error] of [
      ['chave nunca registrada', new Map(), {}, 'unknown_key', 'app_attest_reattest_required'],
      ['chave de outro usuario', registeredKey(), { session: 'ios-session-b' }, 'unknown_key', 'app_attest_reattest_required'],
      ['chave de desenvolvimento recusada', registeredKey({ environment: 'development' }), {}, 'development_key', 'app_attest_reattest_required'],
      ['assinatura de outra chave', registeredKey(), { signer: otherDevice.privateKey }, 'signature_invalid', 'native_attestation_required'],
      ['assercao repetida', registeredKey({ signCount: 1, used: new Set([1]) }), { counter: 1 }, 'counter_replay', 'native_attestation_required'],
    ]) {
      const state = { keys };
      global.fetch = fakeBackend(state);
      const res = routeResponse();
      const { lines } = await withLogs(() => route(iosRequest({ operation, body, ...request }), res));
      assert.strictEqual(res.statusCode, 403, `${name}, ${label}: ${JSON.stringify(res.body)}`);
      assert.deepStrictEqual(res.body, { error }, `${name}, ${label}`);
      assert.deepStrictEqual(lines, rejected(reason), `${name}, ${label}: o log guarda o motivo`);
      assert.deepStrictEqual(state.reservations, [], `${name}, ${label}: nao chega a cota`);
      assert.strictEqual(state.elevenLabs, 0, `${name}, ${label}: nenhum provedor`);
    }
  }
});

test('pre-filtro: sem os 3 cabecalhos validos o iPhone nao passa de nada', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  const state = { keys: registeredKey() };
  global.fetch = fakeBackend(state);
  const valid = iosRequest();
  const without = (header) => {
    const req = iosRequest();
    delete req.headers[header];
    return req;
  };
  for (const [label, req] of [
    ['sem chave', without('x-celeste-attest-key')],
    ['sem tempo', without('x-celeste-attest-time')],
    ['sem assercao', without('x-celeste-attest-assertion')],
    ['tempo com 12 digitos', iosRequest({ headers: { 'x-celeste-attest-time': '170000000000' } })],
    ['chave de 31 bytes', iosRequest({ headers: { 'x-celeste-attest-key': Buffer.alloc(31, 1).toString('base64') } })],
    // fixed bytes (0xfb...): base64 '+/v7...', base64url '-_v7...' (no padding)
    ['chave em base64url', iosRequest({ headers: { 'x-celeste-attest-key': Buffer.alloc(32, 0xfb).toString('base64url') } })],
    ['assercao com espaco', iosRequest({ headers: { 'x-celeste-attest-assertion': 'abc def' } })],
    ['assercao gigante', iosRequest({ headers: { 'x-celeste-attest-assertion': 'A'.repeat(4100) } })],
    ['navegador', iosRequest({ headers: { origin: 'https://celeste-jet-two.vercel.app' } })],
  ]) {
    assert.strictEqual(paidAccess.isNativeRequest(req), false, label);
  }
  assert.strictEqual(paidAccess.isNativeRequest(valid), true);

  for (const [label, req, operation, lines] of [
    ['iPhone sem os cabecalhos do App Attest', without('x-celeste-attest-assertion'), 'audio', legacyRejected('client_not_supported')],
    ['imagem pelo iPhone verificado', iosRequest(), 'visual', rejected('operation_not_allowed')],
    ['sonho pelo iPhone verificado', iosRequest(), 'dream', rejected('operation_not_allowed')],
    [
      'Android com os cabecalhos do iPhone e sem token',
      iosRequest({ headers: { 'x-celeste-client': 'android' } }),
      'audio',
      legacyRejected('no_token'),
    ],
  ]) {
    state.calls.length = 0;
    const outcome = await withLogs(() => paidAccess.authorizePaidRequest(req, { operation, units: operation === 'visual' ? 8 : 4 }));
    assert.deepStrictEqual(outcome.result, NATIVE_DENIED, label);
    assert.deepStrictEqual(outcome.lines, lines, `${label}: linha de log`);
    assert.deepStrictEqual(state.calls, [], `${label}: nada sai da funcao`);
  }
});

test('gerar-audio entrega a voz ao iPhone verificado e recusa corpo trocado', { concurrency: false }, async (t) => {
  configure();
  t.after(restore);
  process.env.ELEVENLABS_API_KEY = 'elevenlabs-route-test-secret';
  const audioRoute = require('../api/gerar-audio');
  const state = { keys: registeredKey() };
  global.fetch = fakeBackend(state);
  const served = routeResponse();
  await audioRoute(iosRequest({ counter: 1 }), served);
  assert.strictEqual(served.statusCode, 200, JSON.stringify(served.body));
  assert.strictEqual(served.headers['content-type'], 'audio/wav');
  assert.strictEqual(state.elevenLabs, 1);

  const tamperedState = { keys: registeredKey({ signCount: 1 }) };
  global.fetch = fakeBackend(tamperedState);
  const tampered = routeResponse();
  const { lines } = await withLogs(() =>
    audioRoute(iosRequest({ counter: 2, body: { ...voiceBody, text: 'Texto trocado depois da assercao.' }, signed: { body: voiceBody } }), tampered)
  );
  assert.strictEqual(tampered.statusCode, 403);
  assert.deepStrictEqual(tampered.body, { error: 'native_attestation_required' });
  assert.deepStrictEqual(lines, rejected('signature_invalid'));
  assert.strictEqual(tamperedState.elevenLabs, 0, 'ElevenLabs nao e chamado com corpo adulterado');
  assert.deepStrictEqual(tamperedState.reservations, []);
});

test('log de recusa so com motivo conhecido', async () => {
  for (const [input, reason] of [
    ['signature_invalid', 'signature_invalid'],
    ['Bearer ios-session-a', 'unknown'],
    [KEY_ID, 'unknown'],
    [undefined, 'unknown'],
  ]) {
    const { lines } = await withLogs(() => appAttest.logRejection(input));
    assert.deepStrictEqual(lines, rejected(reason));
  }
});

test('migracao 015, script de aplicacao e portao', () => {
  const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
  const sql = read('supabase/migrations/015_app_attest_keys.sql').replace(/\r\n/g, '\n');
  assert.match(sql, /create table if not exists public\.celeste_app_attest_keys/);
  assert.match(sql, /user_id uuid not null references auth\.users\(id\) on delete cascade/);
  assert.match(sql, /alter table public\.celeste_app_attest_keys enable row level security;/);
  assert.match(sql, /revoke all on table public\.celeste_app_attest_keys from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy/i, 'RLS sem politicas: so o service_role chega a tabela');
  assert.doesNotMatch(sql, /grant [^;]* to (?:public|anon|authenticated)\b/i);
  const signatures = [
    'celeste_register_app_attest_key(text, uuid, text, text, text)',
    'celeste_app_attest_key(text, uuid)',
    'celeste_advance_app_attest_counter(text, uuid, bigint)',
  ];
  for (const signature of signatures) {
    const escaped = signature.replace(/[()]/g, '\\$&');
    assert.match(sql, new RegExp(`revoke all on function public\\.${escaped}\\s+from public, anon, authenticated;`), signature);
    assert.match(sql, new RegExp(`grant execute on function public\\.${escaped}\\s+to service_role;`), signature);
  }
  for (const name of ['celeste_register_app_attest_key', 'celeste_app_attest_key', 'celeste_advance_app_attest_counter']) {
    const body = sql.slice(sql.indexOf(`create or replace function public.${name}(`));
    const header = body.slice(0, body.indexOf('$$'));
    assert.match(header, /security definer\s+set search_path = ''/, `${name}: security definer com search_path vazio`);
  }
  const register = sql.slice(sql.indexOf('function public.celeste_register_app_attest_key('), sql.indexOf('function public.celeste_app_attest_key('));
  assert.match(register, /on conflict \(key_id\) do nothing;/, 'registro repetido nao zera o contador');
  assert.match(register, /if v_owner is distinct from p_user_id then\s+return jsonb_build_object\('registered', false, 'reason', 'other_user'\)/);
  const load = sql.slice(sql.indexOf('function public.celeste_app_attest_key('), sql.indexOf('function public.celeste_advance_app_attest_counter('));
  assert.match(load, /where keys\.key_id = p_key_id\s+and keys\.user_id = p_user_id/, 'a chave so volta para o proprio usuario');
  // Anti-replay window. No Postgres runs here, so this pins the parts that make the SQL correct; its behaviour was
  // checked on PGlite (Postgres 18 in WASM: scenarios, a differential fuzz, mutants). Change it? Check it there again.
  assert.match(sql, /sign_window bigint not null default 0 check \(sign_window >= 0\),/, 'bitmap dos 63 contadores abaixo do maior');
  const advance = sql.slice(sql.indexOf('function public.celeste_advance_app_attest_counter('));
  assert.match(
    advance,
    /if p_counter is null or p_counter < 1 or p_counter > 4294967295 then\s+return jsonb_build_object\('advanced', false, 'reason', 'invalid'\);/,
    'zero e acima de UInt32: recusados'
  );
  assert.match(
    advance,
    /select keys\.sign_count, keys\.sign_window\s+into v_count, v_window\s+from public\.celeste_app_attest_keys as keys\s+where keys\.key_id = p_key_id\s+and keys\.user_id = p_user_id\s+for update;/,
    'linha travada (FOR UPDATE) e so a chave do proprio usuario: uma assercao por vez'
  );
  assert.match(
    advance,
    /when v_offset >= 64 then 0\s+else \(\(v_window << v_offset::integer\) \| \(1::bigint << \(v_offset - 1\)::integer\)\)\s+& 9223372036854775807/,
    'desliza: 64 ou mais esvazia a janela (deslocamento indefinido em C), o maximo antigo vira usado, o bit de sinal fica limpo'
  );
  assert.match(advance, /if v_offset < 0 then\s+return jsonb_build_object\('advanced', false, 'reason', 'replay'\);/, 'o maior contador ja foi usado');
  assert.match(advance, /if v_offset >= 63 then\s+return jsonb_build_object\('advanced', false, 'reason', 'too_old'\);/, 'mais antigo que a janela');
  assert.match(
    advance,
    /if \(\(v_window >> v_offset::integer\) & 1\) = 1 then\s+return jsonb_build_object\('advanced', false, 'reason', 'replay'\);/,
    'dentro da janela, ja usado'
  );
  assert.match(advance, /set sign_window = v_window \| \(1::bigint << v_offset::integer\),/, 'dentro da janela, sem uso: marca o bit');
  assert.ok(
    advance.indexOf('if v_offset >= 63 then') < advance.indexOf('if ((v_window >> v_offset::integer) & 1) = 1 then'),
    'a idade e conferida antes do bit (deslocar 63 leria o bit de sinal)'
  );
  assert.match(sql, /notify pgrst, 'reload schema';\s+commit;\s*$/);

  // core.autocrlf=true (worktrees and clones) checks the .ps1 out with CRLF: same checks on the file and on a CRLF copy.
  const scriptBytes = fs.readFileSync(path.join(ROOT, 'scripts', 'apply-supabase-migrations-from-vercel.ps1'));
  const crlfCopy = Buffer.from(scriptBytes.toString('latin1').replace(/\r?\n/g, '\r\n'), 'latin1');
  for (const [label, bytes] of [['arquivo', scriptBytes], ['copia com CRLF', crlfCopy]]) {
    assert.ok(bytes.every((byte) => byte < 0x80), `${label}: o .ps1 precisa ser so ASCII`);
    const script = bytes.toString('ascii').replace(/\r\n/g, '\n');
    assert.match(script, /ValidateSet\([^)]*'app-attest-keys'[^)]*\)/, label);
    const branch = script.slice(script.indexOf("elseif ($Action -eq 'app-attest-keys')"), script.indexOf("elseif ($Action -eq 'push')"));
    assert.match(branch, /1\.\.14/, label);
    assert.match(branch, /1\.\.15/, label);
    assert.match(branch, /supabase@3 db push/, label);
    assert.match(branch, /--yes/, label);
    assert.match(branch, /Invoke-AppAttestContractCheck/, label);
    assert.doesNotMatch(branch, /supabase@latest|--db-url/, `${label}: a acao nova trava a versao maior do CLI`);
    const helpers = script.slice(script.indexOf('function Invoke-ReadOnlySql'), script.indexOf('try {\n  & $npxExecutable --yes vercel@latest'));
    assert.match(helpers, /supabase@3 db query/, label);
    assert.match(helpers, /--read-only/, label);
    assert.doesNotMatch(helpers, /supabase@latest|--db-url/, label);
    // after applying 015 the script checks the very boolean the deploy checks (no second copy of the SQL)
    assert.match(
      helpers,
      /function Invoke-AppAttestContractCheck \{\s+\$guards = Join-Path \$PSScriptRoot 'deploy-celeste-guards\.js'\s+\$contractExpression = & \$nodeExecutable -p 'require\(process\.argv\[1\]\)\.APP_ATTEST_CONTRACT_SQL' \$guards\s+if \(\$LASTEXITCODE -ne 0 -or -not \$contractExpression\) \{\s+throw '[^']+'\s+\}\s+\$contractRow = Invoke-ReadOnlySql "select \$contractExpression as valid;" '[^']+'\s+if \(\$contractRow\.valid -ne \$true\) \{ throw '[^']+' \}/,
      `${label}: o .ps1 usa APP_ATTEST_CONTRACT_SQL`
    );
    assert.doesNotMatch(script, /has_(?:table|function)_privilege/, `${label}: nenhuma copia do SQL do contrato no .ps1`);
  }

  // The read-only contract of 015, checked by the deploy before publishing (and by the .ps1 above).
  const { APP_ATTEST_CONTRACT_SQL } = require('./deploy-celeste-guards');
  const contract = APP_ATTEST_CONTRACT_SQL.replace(/\s+/g, ' ');
  assert.match(contract, /^coalesce\( .* , false\)$/, 'banco sem a 015: false, nao erro');
  assert.doesNotMatch(contract, /"/, 'sem aspas duplas: passa inteiro pelo PowerShell 5.1 e pelo npx');
  const table = "to_regclass('public.celeste_app_attest_keys')";
  assert.ok(contract.includes(`(select c.relrowsecurity from pg_class c where c.oid = ${table})`), 'RLS ligado');
  assert.ok(
    contract.includes(
      `and exists (select 1 from pg_attribute a where a.attrelid = ${table} and a.attname = 'sign_window' and not a.attisdropped)`
    ),
    'a coluna da janela: uma 015 antiga (sem ela) nao passa'
  );
  for (const role of ['anon', 'authenticated']) {
    assert.ok(contract.includes(`and not has_table_privilege('${role}', ${table}, 'select,insert,update,delete')`), `${role}: sem a tabela`);
  }
  for (const signature of signatures) {
    const rpc = `to_regprocedure('public.${signature.replace(/\s+/g, '')}')`;
    assert.ok(contract.includes(`and has_function_privilege('service_role', ${rpc}, 'execute')`), `service_role executa ${signature}`);
    for (const role of ['anon', 'authenticated']) {
      assert.ok(contract.includes(`and not has_function_privilege('${role}', ${rpc}, 'execute')`), `${role} nao executa ${signature}`);
    }
  }
  assert.strictEqual((contract.match(/has_(?:table|function)_privilege\(/g) || []).length, 11, 'so as 11 conferencias acima');
  const deploySource = read('scripts/deploy-celeste.js').replace(/\r\n/g, '\n');
  assert.match(deploySource, /const \{\s+APP_ATTEST_CONTRACT_SQL,[^}]*\} = require\('\.\/deploy-celeste-guards'\);/);
  const contractQuery = deploySource.slice(
    deploySource.indexOf('async function validateBackendContractsThroughDatabase()'),
    deploySource.indexOf('async function validateDeploymentEnvironment(')
  );
  assert.ok(contractQuery.includes('`  ${APP_ATTEST_CONTRACT_SQL} as "appAttest";`'), 'a coluna da 015 entra na consulta do deploy');
  assert.match(
    contractQuery,
    /if \(row\.appAttest !== true\) \{\s+throw new Error\('Migration 015 [^']*deploy bloqueado'\);\s+\}/,
    'sem a 015 o deploy para antes de publicar'
  );

  const packageJson = JSON.parse(read('package.json'));
  assert.match(packageJson.scripts['verify:store'], /node scripts\/verificar-app-attest\.js/);
});

test('modulo sem dependencia nova e com so duas linhas de log', () => {
  const source = fs.readFileSync(path.join(ROOT, 'api', '_app-attest.js'), 'utf8');
  assert.deepStrictEqual(
    [...source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]),
    ['crypto', './_play-integrity'],
    'o deploy empacota so o botid: nada de pacote npm'
  );
  assert.deepStrictEqual(
    [...source.matchAll(/\bconsole\.(\w+)/g)].map((match) => match[1]),
    ['warn', 'info'],
    'so a linha da recusa e a do registro'
  );
  const route = fs.readFileSync(path.join(ROOT, 'api', 'app-attest.js'), 'utf8');
  assert.doesNotMatch(route, /\bconsole\b/, 'a rota loga so pelo modulo');
  assert.deepStrictEqual(
    [...route.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]),
    ['./_app-attest', './_paid-access']
  );
});
