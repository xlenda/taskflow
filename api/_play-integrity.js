const crypto = require('crypto');

// Play Integrity "standard request" verification for the Android app.
// Docs: developer.android.com/google/play/integrity/standard (decode on Google's
// server with a service account) and .../integrity/verdicts (payload fields).
// The app binds every token to the request it protects and to the session that
// sends it; services/appIntegrity.js builds the same canonical string hashed in
// requestHashFor().
const PACKAGE_NAME = 'com.celesteapp.affirmations';
// The only operations a verified Android request may spend: the voice and the AI
// texts (the Anchor Scene with the 6+6 suite, and its translation). Images and
// dreams stay closed (api/_paid-access.js refuses them before any network call).
const NATIVE_OPERATIONS = Object.freeze(['audio', 'scene', 'translation']);
const SERVICE_ACCOUNT_ENV = 'CELESTE_PLAY_INTEGRITY_SERVICE_ACCOUNT_B64';
const REQUEST_HASH_VERSION = 'celeste-play-integrity-v2';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PLAY_INTEGRITY_SCOPE = 'https://www.googleapis.com/auth/playintegrity';
const DECODE_URL = `https://playintegrity.googleapis.com/v1/${PACKAGE_NAME}:decodeIntegrityToken`;
const GOOGLE_TIMEOUT_MS = 5000;
// The app requests the token right before sending the request: two minutes
// absorb a slow network and server clock drift without letting a captured
// token live long. Google also blanks the verdict of a token decoded twice.
const MAX_TOKEN_AGE_MS = 2 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 30 * 1000;
const TOKEN_PATTERN = /^[\x21-\x7e]{16,16384}$/;
// Why a native request was refused: the one log line each refusal writes carries
// only one of these (docs/PLAY-INTEGRITY-PASSO-A-PASSO.md, passo 9, explains
// each) plus Google's HTTP status, which also rides in `<stage>_http_<status>`.
const REJECTION_REASONS = new Set([
  'no_token',
  'client_not_supported',
  'operation_not_allowed',
  'no_credentials',
  'timeout',
  'network_error',
  'auth_invalid_response',
  'decode_invalid_response',
  'package_mismatch',
  'hash_mismatch',
  'stale',
  'future',
  'not_play_recognized',
  'app_package_mismatch',
  'device_integrity_missing',
]);
const HTTP_REJECTION = /^(?:auth|decode)_http_\d{3}$/;

let parsedAccount = { raw: null, value: null };
let cachedAccessToken = null;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function requestHashFor({ operation, requestId, sessionHash, bodyHash }) {
  return sha256Hex([REQUEST_HASH_VERSION, operation, requestId, sessionHash, bodyHash].join('\n'));
}

// The refusal the app sees is always the same 403; the Vercel log gets one
// structured line saying why. Never the token, hashes, user, body or secrets:
// anything outside the fixed reasons becomes 'unknown'.
function logNativeRejection(reason, googleStatus = null) {
  const safeReason = REJECTION_REASONS.has(reason) || HTTP_REJECTION.test(reason) ? reason : 'unknown';
  const safeStatus =
    Number.isInteger(googleStatus) && googleStatus >= 100 && googleStatus <= 599 ? googleStatus : null;
  console.warn(JSON.stringify({ event: 'play_integrity_rejected', reason: safeReason, googleStatus: safeStatus }));
}

// The app hashes the exact JSON string it sends; JSON.parse + JSON.stringify
// gives the same string back for that object, whether Vercel already parsed
// the body or not.
function requestBodyHash(body) {
  try {
    let value = Buffer.isBuffer(body) ? body.toString('utf8') : body;
    if (typeof value === 'string') value = JSON.parse(value);
    if (!value || typeof value !== 'object') return '';
    return sha256Hex(JSON.stringify(value));
  } catch (_error) {
    return '';
  }
}

function integrityToken(req) {
  const value = req && req.headers ? req.headers['x-celeste-integrity'] : '';
  return typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : '';
}

function parseServiceAccount(raw) {
  if (!raw) return null;
  try {
    const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    const email = typeof json.client_email === 'string' ? json.client_email.trim() : '';
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return null;
    return {
      raw,
      email,
      keyId: typeof json.private_key_id === 'string' ? json.private_key_id : '',
      privateKey: crypto.createPrivateKey(json.private_key),
    };
  } catch (_error) {
    return null;
  }
}

function serviceAccount() {
  const raw = String(process.env[SERVICE_ACCOUNT_ENV] || '').trim();
  if (parsedAccount.raw !== raw) parsedAccount = { raw, value: parseServiceAccount(raw) };
  return parsedAccount.value;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function googleFailure(reason, googleStatus = null) {
  return Object.assign(new Error(reason), { reason, googleStatus });
}

// `stage` names the call in the refusal reason: 'auth' (service-account token) or 'decode'.
async function postToGoogle(stage, url, options) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      method: 'POST',
      signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    });
  } catch (error) {
    throw googleFailure(error && error.name === 'TimeoutError' ? 'timeout' : 'network_error');
  }
  if (!response || !response.ok) {
    const status = response ? response.status : 0;
    throw googleFailure(`${stage}_http_${status}`, status);
  }
  try {
    return await response.json();
  } catch (error) {
    throw googleFailure(error && error.name === 'TimeoutError' ? 'timeout' : `${stage}_invalid_response`);
  }
}

// developers.google.com/identity/protocols/oauth2/service-account#httprest
async function requestAccessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', ...(account.keyId ? { kid: account.keyId } : {}) };
  const claims = {
    iss: account.email,
    scope: PLAY_INTEGRITY_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), account.privateKey);
  const json = await postToGoogle('auth', GOOGLE_TOKEN_URL, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature.toString('base64url')}`,
    }).toString(),
  });
  if (!json || typeof json.access_token !== 'string' || !json.access_token) {
    throw googleFailure('auth_invalid_response');
  }
  return { token: json.access_token, expiresInSeconds: Number(json.expires_in) || 0 };
}

// One access token per warm instance until a minute before it expires;
// concurrent requests share the pending fetch.
function googleAccessToken(account) {
  if (
    cachedAccessToken &&
    cachedAccessToken.raw === account.raw &&
    Date.now() < cachedAccessToken.expiresAt
  ) {
    return cachedAccessToken.promise;
  }
  const entry = { raw: account.raw, expiresAt: Infinity, promise: null };
  entry.promise = requestAccessToken(account).then(
    ({ token, expiresInSeconds }) => {
      entry.expiresAt = Date.now() + Math.max(0, expiresInSeconds - 60) * 1000;
      return token;
    },
    (error) => {
      if (cachedAccessToken === entry) cachedAccessToken = null;
      throw error;
    }
  );
  cachedAccessToken = entry;
  return entry.promise;
}

async function decodeIntegrityToken(account, token) {
  const accessToken = await googleAccessToken(account);
  try {
    const json = await postToGoogle('decode', DECODE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ integrityToken: token }),
    });
    return json && json.tokenPayloadExternal;
  } catch (error) {
    if (error && error.googleStatus === 401) cachedAccessToken = null;
    throw error;
  }
}

function verdictProblem(payload, expectedHash, now) {
  if (!payload || typeof payload !== 'object') return 'decode_invalid_response';
  const request = payload.requestDetails || {};
  const app = payload.appIntegrity || {};
  const device = payload.deviceIntegrity || {};
  if (request.requestPackageName !== PACKAGE_NAME) return 'package_mismatch';
  if (request.requestHash !== expectedHash) return 'hash_mismatch';
  const age = now - Number(request.timestampMillis);
  if (!(age <= MAX_TOKEN_AGE_MS)) return 'stale';
  if (age < -MAX_CLOCK_SKEW_MS) return 'future';
  if (app.appRecognitionVerdict !== 'PLAY_RECOGNIZED') return 'not_play_recognized';
  if (app.packageName !== PACKAGE_NAME) return 'app_package_mismatch';
  const labels = Array.isArray(device.deviceRecognitionVerdict) ? device.deviceRecognitionVerdict : [];
  if (!labels.includes('MEETS_DEVICE_INTEGRITY')) return 'device_integrity_missing';
  return null;
}

// Callers (api/_paid-access.js) already limit this to Android requests for
// NATIVE_OPERATIONS that carry a token, a valid request id and the Bearer session (`accessToken`)
// the token must be bound to: a token issued for one session fails for another.
// Returns { ok } or { ok: false, reason, googleStatus } for logNativeRejection().
async function verifyPlayIntegrity(req, { operation, requestId, accessToken }) {
  const account = serviceAccount();
  if (!account) return { ok: false, reason: 'no_credentials' };
  let payload;
  try {
    payload = await decodeIntegrityToken(account, integrityToken(req));
  } catch (error) {
    return {
      ok: false,
      reason: (error && error.reason) || 'unknown',
      googleStatus: error && error.googleStatus,
    };
  }
  const expectedHash = requestHashFor({
    operation,
    requestId,
    sessionHash: sha256Hex(String(accessToken || '')),
    bodyHash: requestBodyHash(req && req.body),
  });
  const problem = verdictProblem(payload, expectedHash, Date.now());
  return problem ? { ok: false, reason: problem } : { ok: true };
}

function resetForTests() {
  parsedAccount = { raw: null, value: null };
  cachedAccessToken = null;
}

module.exports = {
  MAX_TOKEN_AGE_MS,
  NATIVE_OPERATIONS,
  PACKAGE_NAME,
  REJECTION_REASONS,
  SERVICE_ACCOUNT_ENV,
  integrityToken,
  logNativeRejection,
  requestBodyHash,
  requestHashFor,
  resetForTests,
  verifyPlayIntegrity,
};
