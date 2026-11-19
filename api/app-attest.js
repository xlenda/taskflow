const appAttest = require('./_app-attest');
const paidAccess = require('./_paid-access');

// App Attest for the iPhone app (contract: docs/superpowers/plans/2026-11-19-ios-voz-app-attest.md).
// POST {"action":"challenge"} hands out a stateless 5-minute challenge;
// POST {"action":"register","keyId","attestation","challenge"} with the Bearer
// session verifies Apple's attestation and binds the key to that user through a
// service-role RPC. Native iOS only: a request with Origin (a browser) or another
// client never gets past the first line, so there is no CORS and no BotID here.
const MAX_BODY_BYTES = 40 * 1024;
const CHALLENGE_KEYS = ['action'];
const REGISTER_KEYS = ['action', 'keyId', 'attestation', 'challenge'];

function header(req, name) {
  const raw = req && req.headers && req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim() : '';
}

function setResponseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseBody(req) {
  const declaredLength = Number(req.headers && req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { error: 'payload_too_large', status: 413 };
  }
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) return { error: 'payload_too_large', status: 413 };
    try {
      body = JSON.parse(body);
    } catch (_error) {
      return { error: 'invalid_json', status: 400 };
    }
  }
  if (!isPlainObject(body)) return { error: 'invalid_request', status: 400 };
  try {
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
      return { error: 'payload_too_large', status: 413 };
    }
  } catch (_error) {
    return { error: 'invalid_request', status: 400 };
  }
  return { body };
}

function sendJson(res, status, error) {
  return res.status(status).json({ error });
}

// Same 403 as every native refusal, one log line with the reason.
function refuse(res, reason) {
  appAttest.logRejection(reason);
  return sendJson(res, 403, 'native_attestation_required');
}

async function register(req, res, body, config) {
  if (!config.url || !config.anonKey || !config.serviceKey) {
    return sendJson(res, 503, 'app_attest_not_configured');
  }
  const token = paidAccess.bearerToken(req);
  if (!token) return sendJson(res, 401, 'identity_required');
  // Challenge and attestation first: a forged attestation never reaches Supabase.
  const verified = appAttest.verifyAttestation({
    keyId: body.keyId,
    attestation: body.attestation,
    challenge: body.challenge,
    secret: config.actorHashSecret,
  });
  if (!verified.ok) return refuse(res, verified.reason);
  const identity = await paidAccess.authenticatedUser(config, token);
  if (identity.error) return sendJson(res, identity.status, identity.error);
  let stored;
  try {
    stored = await paidAccess.serviceRpc(config, 'celeste_register_app_attest_key', {
      p_key_id: body.keyId,
      p_user_id: identity.userId,
      p_public_key: verified.publicKey,
      p_environment: verified.environment,
      p_receipt: verified.receipt,
    });
  } catch (_error) {
    return refuse(res, 'store_unavailable');
  }
  if (!stored || stored.registered !== true) {
    return refuse(res, stored && stored.reason === 'other_user' ? 'key_other_user' : 'store_unavailable');
  }
  appAttest.logRegistration(verified.environment, verified.extensions);
  return res.status(200).json({ ok: true });
}

async function handler(req, res) {
  setResponseHeaders(res);
  if (header(req, 'origin') || header(req, 'x-celeste-client').toLowerCase() !== 'ios') {
    return sendJson(res, 403, 'origin_not_allowed');
  }
  if (String(req.method || 'GET').toUpperCase() !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, 'method_not_allowed');
  }
  const parsed = parseBody(req);
  if (parsed.error) return sendJson(res, parsed.status, parsed.error);
  const { body } = parsed;
  const allowedKeys =
    body.action === 'challenge' ? CHALLENGE_KEYS : body.action === 'register' ? REGISTER_KEYS : null;
  if (!allowedKeys || Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    return sendJson(res, 400, 'invalid_request');
  }
  const config = paidAccess.serverConfig();
  if (!paidAccess.validActorHashSecret(config.actorHashSecret)) {
    return sendJson(res, 503, 'app_attest_not_configured');
  }
  if (body.action === 'challenge') {
    return res.status(200).json({ challenge: appAttest.issueChallenge(config.actorHashSecret) });
  }
  return register(req, res, body, config);
}

module.exports = handler;
module.exports.default = handler;
module.exports.handler = handler;
