const crypto = require('crypto');
const { requestBodyHash } = require('./_play-integrity');

// App Attest (Apple) for the iPhone app: the server side of the contract in
// docs/superpowers/plans/2026-11-19-ios-voz-app-attest.md, following Apple's
// "Validating apps that connect to your server" (attestation and assertion
// steps). Node's crypto only: the deploy packages no npm module besides botid.
//
// Known limits:
// - authData extensions apple_validation_category_01 and apple_bundle_version_01
//   are only read and logged at registration, never required: older iOS versions
//   do not send them and Apple does not publish the expected values. Assertions
//   ignore them (an accepted paid request writes no log, as on Android).
// - The receipt is stored with the key, but there is no server-to-server call to
//   Apple for the fraud metric yet.
// - The challenge is stateless (HMAC + 5 minutes), so it can be reused inside its
//   window. A key attests once and binds to one user, and every assertion must
//   raise the stored counter (atomic RPC), so a replay never spends twice.
const APP_ID = '68VRL5BCA7.com.celesteapp.affirmations';
const RP_ID_HASH = sha256(Buffer.from(APP_ID, 'utf8'));
const AAGUID_PRODUCTION = Buffer.concat([Buffer.from('appattest', 'ascii'), Buffer.alloc(7)]);
const AAGUID_DEVELOPMENT = Buffer.from('appattestdevelop', 'ascii');
// DER body of OID 1.2.840.113635.100.8.2: the credCert extension holding the nonce.
const NONCE_EXTENSION_OID = Buffer.from('2a864886f763640802', 'hex');
const CHALLENGE_LABEL = Buffer.from('celeste-app-attest-challenge-v1\0', 'utf8');
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CLOCK_SKEW_MS = 30 * 1000;
const ASSERTION_WINDOW_MS = 5 * 60 * 1000;
const ASSERTION_VERSION = 'celeste-app-attest-v1';
const KEY_ID_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
const ATTEST_TIME_PATTERN = /^\d{13}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const MAX_ASSERTION_CHARS = 4096;
const MAX_ATTESTATION_CHARS = 32 * 1024;
const MAX_CBOR_DEPTH = 8;
// The one log line a refusal writes carries only one of these.
const REJECTION_REASONS = new Set([
  'challenge_invalid',
  'challenge_expired',
  'attestation_malformed',
  'format_invalid',
  'root_invalid',
  'chain_invalid',
  'nonce_mismatch',
  'key_id_mismatch',
  'rp_id_mismatch',
  'counter_not_zero',
  'aaguid_invalid',
  'credential_id_mismatch',
  'key_other_user',
  'operation_not_allowed',
  'stale',
  'unknown_key',
  'development_key',
  'assertion_malformed',
  'signature_invalid',
  'counter_replay',
  'store_unavailable',
]);

// Apple App Attestation Root CA, downloaded on 19/11/2026 from
// https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
// SHA-256 of the certificate (DER):
// 1C:B9:82:3B:A2:8B:A6:AD:2D:33:A0:06:94:1D:E2:AE:4F:51:3E:F1:D4:E8:31:B9:F7:E0:FA:7B:62:42:C9:32
// trustedRoot() checks that fingerprint before the first use.
const APPLE_ROOT_PEM = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----
`;
const APPLE_ROOT_SHA256 =
  '1C:B9:82:3B:A2:8B:A6:AD:2D:33:A0:06:94:1D:E2:AE:4F:51:3E:F1:D4:E8:31:B9:F7:E0:FA:7B:62:42:C9:32';

let appleRoot; // undefined: not parsed yet; null: the embedded PEM failed its fingerprint
let testRoot = null;

function sha256(...parts) {
  const hash = crypto.createHash('sha256');
  for (const part of parts) hash.update(part);
  return hash.digest();
}

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function refusal(reason) {
  return { ok: false, reason };
}

function developmentAllowed() {
  return process.env.CELESTE_APP_ATTEST_ALLOW_DEVELOPMENT === '1';
}

function trustedRoot() {
  if (testRoot) return testRoot;
  if (appleRoot === undefined) {
    try {
      const root = new crypto.X509Certificate(APPLE_ROOT_PEM);
      appleRoot = root.fingerprint256 === APPLE_ROOT_SHA256 ? root : null;
    } catch (_error) {
      appleRoot = null;
    }
  }
  return appleRoot;
}

// The refusal the app sees is always the same 403; the log gets one structured
// line with a fixed reason. Never keys, assertions, hashes, users or secrets.
function logRejection(reason) {
  const safeReason = REJECTION_REASONS.has(reason) ? reason : 'unknown';
  console.warn(JSON.stringify({ event: 'app_attest_rejected', reason: safeReason }));
}

// One line per registered key (once per device): the environment and the new
// authData extensions when the device sends them (null otherwise).
function logRegistration(environment, extensions) {
  console.info(
    JSON.stringify({
      event: 'app_attest_registered',
      environment: environment === 'development' ? 'development' : 'production',
      validationCategory: extensions ? extensions.validationCategory : null,
      bundleVersion: extensions ? extensions.bundleVersion : null,
    })
  );
}

// Minimal CBOR (RFC 8949) for Apple's objects: unsigned/negative integers, byte
// and text strings, arrays, maps (as Map) and false/true/null, definite lengths
// only. Returns [value, offset after the item]; throws on anything else.
function cborItem(buffer, offset, depth) {
  if (depth > MAX_CBOR_DEPTH || offset >= buffer.length) throw new Error('cbor_invalid');
  const major = buffer[offset] >> 5;
  const info = buffer[offset] & 0x1f;
  let position = offset + 1;
  let argument = info;
  if (info >= 24) {
    const size = { 24: 1, 25: 2, 26: 4, 27: 8 }[info];
    if (!size || position + size > buffer.length) throw new Error('cbor_invalid');
    argument = size === 8 ? Number(buffer.readBigUInt64BE(position)) : buffer.readUIntBE(position, size);
    if (!Number.isSafeInteger(argument)) throw new Error('cbor_invalid');
    position += size;
  }
  if (major === 0) return [argument, position];
  if (major === 1) return [-1 - argument, position];
  if (major === 2 || major === 3) {
    if (position + argument > buffer.length) throw new Error('cbor_invalid');
    const bytes = buffer.subarray(position, position + argument);
    return [major === 2 ? bytes : bytes.toString('utf8'), position + argument];
  }
  if (major === 4 || major === 5) {
    if (argument > buffer.length - position) throw new Error('cbor_invalid');
    const items = major === 4 ? [] : new Map();
    for (let index = 0; index < argument; index += 1) {
      let value;
      [value, position] = cborItem(buffer, position, depth + 1);
      if (major === 4) {
        items.push(value);
        continue;
      }
      let entry;
      [entry, position] = cborItem(buffer, position, depth + 1);
      if (items.has(value)) throw new Error('cbor_invalid');
      items.set(value, entry);
    }
    return [items, position];
  }
  if (major === 7 && info >= 20 && info <= 22) return [[false, true, null][info - 20], position];
  throw new Error('cbor_invalid');
}

function decodeCbor(buffer) {
  const [value, end] = cborItem(buffer, 0, 0);
  if (end !== buffer.length) throw new Error('cbor_invalid');
  return value;
}

// Minimal DER: one TLV with a single-byte tag and a definite length.
function derNode(buffer, offset) {
  if (offset + 2 > buffer.length || (buffer[offset] & 0x1f) === 0x1f) throw new Error('der_invalid');
  let length = buffer[offset + 1];
  let start = offset + 2;
  if (length & 0x80) {
    const size = length & 0x7f;
    if (size < 1 || size > 4 || start + size > buffer.length) throw new Error('der_invalid');
    length = buffer.readUIntBE(start, size);
    start += size;
  }
  if (start + length > buffer.length) throw new Error('der_invalid');
  return { tag: buffer[offset], start, end: start + length };
}

function derChildren(buffer, node) {
  const children = [];
  for (let position = node.start; position < node.end; ) {
    const child = derNode(buffer, position);
    if (child.end > node.end) throw new Error('der_invalid');
    children.push(child);
    position = child.end;
  }
  return children;
}

// Descends through constructed nodes holding exactly one element down to the
// single OCTET STRING (Apple: SEQUENCE { [1] { OCTET STRING nonce } }).
function singleOctetString(buffer, node, depth = 0) {
  if (node.tag === 0x04) return buffer.subarray(node.start, node.end);
  if (!(node.tag & 0x20) || depth > 4) return null;
  const children = derChildren(buffer, node);
  return children.length === 1 ? singleOctetString(buffer, children[0], depth + 1) : null;
}

// The octet string inside extension 1.2.840.113635.100.8.2 of the credCert.
function certificateNonce(der) {
  try {
    const [tbs] = derChildren(der, derNode(der, 0));
    const extensions = derChildren(der, tbs).find((node) => node.tag === 0xa3);
    if (!extensions) return null;
    const [list] = derChildren(der, extensions);
    for (const extension of derChildren(der, list)) {
      const parts = derChildren(der, extension);
      if (parts[0].tag !== 0x06 || !der.subarray(parts[0].start, parts[0].end).equals(NONCE_EXTENSION_OID)) {
        continue;
      }
      const value = parts[parts.length - 1];
      if (value.tag !== 0x04) return null;
      const inner = derNode(der, value.start);
      return inner.end === value.end ? singleOctetString(der, inner) : null;
    }
    return null;
  } catch (_error) {
    return null;
  }
}

// x5c = [credCert, intermediates...]: each certificate in its validity window,
// issued and signed by the next one, the last one by the trusted root.
function verifiedCredCert(x5c, root, now) {
  if (!Array.isArray(x5c) || x5c.length < 2 || x5c.length > 4 || !x5c.every(Buffer.isBuffer)) return null;
  try {
    const chain = [...x5c.map((der) => new crypto.X509Certificate(der)), root];
    for (let index = 0; index < chain.length; index += 1) {
      const certificate = chain[index];
      if (!(Date.parse(certificate.validFrom) <= now && now <= Date.parse(certificate.validTo))) return null;
      const issuer = chain[index + 1];
      if (
        issuer &&
        !(issuer.ca && certificate.checkIssued(issuer) && certificate.verify(issuer.publicKey))
      ) {
        return null;
      }
    }
    return chain[0];
  } catch (_error) {
    return null;
  }
}

// X9.62 uncompressed point (0x04 || x || y) of a P-256 public key.
function uncompressedPoint(publicKey) {
  try {
    if (publicKey.asymmetricKeyType !== 'ec' || publicKey.asymmetricKeyDetails.namedCurve !== 'prime256v1') {
      return null;
    }
    const { x, y } = publicKey.export({ format: 'jwk' });
    const point = Buffer.concat([Buffer.from([4]), Buffer.from(x, 'base64url'), Buffer.from(y, 'base64url')]);
    return point.length === 65 ? point : null;
  } catch (_error) {
    return null;
  }
}

function keyIdBytes(keyId) {
  if (typeof keyId !== 'string' || !KEY_ID_PATTERN.test(keyId)) return null;
  const bytes = Buffer.from(keyId, 'base64');
  return bytes.length === 32 && bytes.toString('base64') === keyId ? bytes : null;
}

function base64Value(value, maxChars) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxChars && BASE64_PATTERN.test(value);
}

// Read-only, never a reason to refuse (see the limits above). Apple appends the
// extensions map after the COSE key without setting the ED flag (its published
// sample has flags 0x40), so whatever follows the key is read. The category is a
// 4-byte little-endian UInt32 byte string; the bundle version, a text string.
function authDataExtensions(authData, offset) {
  try {
    const [, keyEnd] = cborItem(authData, offset, 0);
    if (keyEnd >= authData.length) return null;
    const [map] = cborItem(authData, keyEnd, 0);
    if (!(map instanceof Map)) return null;
    const category = map.get('apple_validation_category_01');
    const version = map.get('apple_bundle_version_01');
    return {
      validationCategory: Buffer.isBuffer(category) && category.length === 4 ? category.readUInt32LE(0) : null,
      bundleVersion: typeof version === 'string' && /^[0-9A-Za-z._-]{1,32}$/.test(version) ? version : null,
    };
  } catch (_error) {
    return null;
  }
}

// rpIdHash 32 | flags 1 | counter 4 | aaguid 16 | credentialId length 2 |
// credentialId | COSE key | extensions. The AT flag must be set.
function attestedAuthData(authData) {
  if (authData.length < 55 || !(authData[32] & 0x40)) return null;
  const credentialEnd = 55 + authData.readUInt16BE(53);
  if (credentialEnd > authData.length) return null;
  return {
    rpIdHash: authData.subarray(0, 32),
    counter: authData.readUInt32BE(33),
    aaguid: authData.subarray(37, 53),
    credentialId: authData.subarray(55, credentialEnd),
    extensions: authDataExtensions(authData, credentialEnd),
  };
}

function challengeMac(secret, payload) {
  return crypto.createHmac('sha256', secret).update(CHALLENGE_LABEL).update(payload).digest().subarray(0, 16);
}

// payload = 16 random bytes || timestamp ms (8 bytes BE);
// challenge = base64url(payload || HMAC-SHA256(secret, label || payload)[0..16]).
function issueChallenge(secret, now = Date.now()) {
  const payload = Buffer.alloc(24);
  crypto.randomFillSync(payload, 0, 16);
  payload.writeBigUInt64BE(BigInt(now), 16);
  return Buffer.concat([payload, challengeMac(secret, payload)]).toString('base64url');
}

// Returns null for a challenge this server issued in the last 5 minutes, or the reason.
function checkChallenge(secret, challenge, now = Date.now()) {
  if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{54}$/.test(challenge)) return 'challenge_invalid';
  const raw = Buffer.from(challenge, 'base64url');
  if (raw.length !== 40 || raw.toString('base64url') !== challenge) return 'challenge_invalid';
  const payload = raw.subarray(0, 24);
  if (!crypto.timingSafeEqual(raw.subarray(24), challengeMac(secret, payload))) return 'challenge_invalid';
  const age = now - Number(payload.readBigUInt64BE(16));
  return age <= CHALLENGE_TTL_MS && age >= -CLOCK_SKEW_MS ? null : 'challenge_expired';
}

// {keyId, attestation} sent by the app after attestKeyAsync(keyId, challenge):
// our challenge, then Apple's steps with clientDataHash = SHA256(challenge) and our
// App ID. Returns what to store, or the refusal reason.
function verifyAttestation({ keyId, attestation, challenge, secret, now = Date.now() }) {
  const challengeProblem = checkChallenge(secret, challenge, now);
  if (challengeProblem) return refusal(challengeProblem);
  return checkAttestationObject({
    keyId,
    attestation,
    clientDataHash: sha256(Buffer.from(challenge, 'utf8')),
    rpIdHash: RP_ID_HASH,
    now,
  });
}

// Apple's attestation steps 1-9. clientDataHash and rpIdHash are parameters so
// scripts/verificar-app-attest.js can also run Apple's published sample through them.
function checkAttestationObject({ keyId, attestation, clientDataHash, rpIdHash, now }) {
  const keyIdValue = keyIdBytes(keyId);
  if (!keyIdValue || !base64Value(attestation, MAX_ATTESTATION_CHARS)) return refusal('attestation_malformed');
  let object;
  try {
    object = decodeCbor(Buffer.from(attestation, 'base64'));
  } catch (_error) {
    return refusal('attestation_malformed');
  }
  const statement = object instanceof Map ? object.get('attStmt') : null;
  const authData = object instanceof Map ? object.get('authData') : null;
  const receipt = statement instanceof Map ? statement.get('receipt') : null;
  if (!Buffer.isBuffer(authData) || !Buffer.isBuffer(receipt) || !receipt.length) {
    return refusal('attestation_malformed');
  }
  if (object.get('fmt') !== 'apple-appattest') return refusal('format_invalid');

  // 1. x5c chains up to the Apple App Attestation Root CA.
  const root = trustedRoot();
  if (!root) return refusal('root_invalid');
  const credCert = verifiedCredCert(statement.get('x5c'), root, now);
  if (!credCert) return refusal('chain_invalid');

  // 2-4. nonce = SHA256(authData || clientDataHash) is the credCert extension's octet string.
  const nonce = sha256(authData, clientDataHash);
  const certNonce = certificateNonce(credCert.raw);
  if (!certNonce || !certNonce.equals(nonce)) return refusal('nonce_mismatch');

  // 5. SHA256 of the credCert public key (X9.62 uncompressed point) is the keyId.
  const point = uncompressedPoint(credCert.publicKey);
  if (!point || !sha256(point).equals(keyIdValue)) return refusal('key_id_mismatch');

  // 6-9. RP ID hash, counter 0, environment (aaguid) and credentialId.
  const data = attestedAuthData(authData);
  if (!data) return refusal('attestation_malformed');
  if (!data.rpIdHash.equals(rpIdHash)) return refusal('rp_id_mismatch');
  if (data.counter !== 0) return refusal('counter_not_zero');
  let environment = '';
  if (data.aaguid.equals(AAGUID_PRODUCTION)) environment = 'production';
  else if (data.aaguid.equals(AAGUID_DEVELOPMENT) && developmentAllowed()) environment = 'development';
  if (!environment) return refusal('aaguid_invalid');
  if (!data.credentialId.equals(keyIdValue)) return refusal('credential_id_mismatch');

  return {
    ok: true,
    publicKey: credCert.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    receipt: receipt.toString('base64'),
    environment,
    extensions: data.extensions,
  };
}

function headerValue(headers, name) {
  const value = headers[name];
  return typeof value === 'string' ? value.trim() : '';
}

// The three headers of a paid iPhone request, format-checked, or null.
function assertionHeaders(req) {
  const headers = (req && req.headers) || {};
  const keyId = headerValue(headers, 'x-celeste-attest-key');
  const time = headerValue(headers, 'x-celeste-attest-time');
  const assertion = headerValue(headers, 'x-celeste-attest-assertion');
  if (!keyIdBytes(keyId) || !ATTEST_TIME_PATTERN.test(time) || !base64Value(assertion, MAX_ASSERTION_CHARS)) {
    return null;
  }
  return { keyId, time, assertion };
}

// What the app passes to generateAssertionAsync(keyId, challenge): the request
// it protects (sessionHash and bodyHash are the Play Integrity ones).
function assertionChallenge({ operation, requestId, sessionHash, bodyHash, attestTime }) {
  return sha256Hex([ASSERTION_VERSION, operation, requestId, sessionHash, bodyHash, attestTime].join('\n'));
}

// Assertion steps 1-4: nonce, ECDSA-SHA256 signature over it with the stored key
// (SPKI DER base64), RP ID. The counter (step 5) is the store's:
// celeste_advance_app_attest_counter.
function checkAssertion({ assertion, clientDataHash, publicKey, rpIdHash }) {
  let decoded;
  try {
    decoded = decodeCbor(Buffer.from(assertion, 'base64'));
  } catch (_error) {
    return refusal('assertion_malformed');
  }
  const signature = decoded instanceof Map ? decoded.get('signature') : null;
  const authData = decoded instanceof Map ? decoded.get('authenticatorData') : null;
  if (!Buffer.isBuffer(signature) || !Buffer.isBuffer(authData) || authData.length < 37) {
    return refusal('assertion_malformed');
  }
  const nonce = sha256(authData, clientDataHash);
  let valid = false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKey, 'base64'), format: 'der', type: 'spki' });
    valid = crypto.verify('sha256', nonce, key, signature);
  } catch (_error) {
    valid = false;
  }
  if (!valid) return refusal('signature_invalid');
  if (!authData.subarray(0, 32).equals(rpIdHash)) return refusal('rp_id_mismatch');
  return { ok: true, counter: authData.readUInt32BE(33) };
}

// Callers (api/_paid-access.js) already limit this to iOS requests for
// NATIVE_OPERATIONS with the three headers, a request id and the Bearer session
// whose user (`userId`) was authenticated. `rpc(name, body)` calls a service-role
// RPC and throws when the call fails. Returns { ok } or { ok: false, reason }.
async function verifyAssertionRequest(req, { operation, requestId, accessToken, userId, rpc, now = Date.now() }) {
  const headers = assertionHeaders(req);
  if (!headers) return refusal('assertion_malformed');
  if (!(Math.abs(now - Number(headers.time)) <= ASSERTION_WINDOW_MS)) return refusal('stale');
  let key;
  try {
    key = await rpc('celeste_app_attest_key', { p_key_id: headers.keyId, p_user_id: userId });
  } catch (_error) {
    return refusal('store_unavailable');
  }
  if (!key || key.found !== true || typeof key.publicKey !== 'string') return refusal('unknown_key');
  if (key.environment !== 'production' && !(key.environment === 'development' && developmentAllowed())) {
    return refusal('development_key');
  }
  const challenge = assertionChallenge({
    operation,
    requestId,
    sessionHash: sha256Hex(String(accessToken || '')),
    bodyHash: requestBodyHash(req && req.body),
    attestTime: headers.time,
  });
  const checked = checkAssertion({
    assertion: headers.assertion,
    clientDataHash: sha256(Buffer.from(challenge, 'utf8')),
    publicKey: key.publicKey,
    rpIdHash: RP_ID_HASH,
  });
  if (!checked.ok) return checked;
  let advanced;
  try {
    advanced = await rpc('celeste_advance_app_attest_counter', {
      p_key_id: headers.keyId,
      p_user_id: userId,
      p_counter: checked.counter,
    });
  } catch (_error) {
    return refusal('store_unavailable');
  }
  return advanced && advanced.advanced === true ? { ok: true } : refusal('counter_replay');
}

// Tests only: a synthetic root replaces Apple's. Production code never calls it.
function setRootForTests(pem) {
  testRoot = pem ? new crypto.X509Certificate(pem) : null;
}

function resetForTests() {
  testRoot = null;
}

module.exports = {
  _internals: { checkAssertion, checkAttestationObject },
  APPLE_ROOT_PEM,
  APPLE_ROOT_SHA256,
  APP_ID,
  REJECTION_REASONS,
  assertionChallenge,
  assertionHeaders,
  checkChallenge,
  issueChallenge,
  logRegistration,
  logRejection,
  resetForTests,
  setRootForTests,
  verifyAssertionRequest,
  verifyAttestation,
};
