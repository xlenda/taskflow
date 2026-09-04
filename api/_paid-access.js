const crypto = require('crypto');
const net = require('net');

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{16,96}$/;
const ACTOR_HASH_PATTERN = /^[0-9a-f]{64}$/;
const NATIVE_CLIENTS = new Set(['ios', 'android']);
const OPERATIONS = new Set(['scene', 'translation', 'dream', 'audio', 'visual']);
const AUTH_TIMEOUT_MS = 5000;
const ACTOR_HASH_SECRET_MIN_BYTES = 32;
const TRUSTED_VERCEL_IP_HEADER = 'x-vercel-forwarded-for';

let authorizerOverride = null;
let finalizerOverride = null;

function cleanHeader(value, max = 2048) {
  const source = Array.isArray(value) ? value[0] : value;
  return typeof source === 'string' ? source.trim().slice(0, max) : '';
}

function serverConfig() {
  return {
    url: cleanHeader(
      process.env.CELESTE_SUPABASE_URL ||
        process.env.SUPABASE_URL ||
        process.env.EXPO_PUBLIC_SUPABASE_URL,
      500
    ).replace(/\/$/, ''),
    anonKey: cleanHeader(
      process.env.CELESTE_SUPABASE_ANON_KEY ||
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      2048
    ),
    serviceKey: cleanHeader(
      process.env.CELESTE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
      4096
    ),
    actorHashSecret: cleanHeader(process.env.CELESTE_ACTOR_HASH_SECRET, 4096),
  };
}

function normalizeIpv4(value) {
  if (net.isIP(value) !== 4) return '';
  return value.split('.').map((part) => String(Number(part))).join('.');
}

function expandIpv6(value) {
  let source = value.toLowerCase();
  const embeddedIpv4 = source.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (embeddedIpv4) {
    const ipv4 = normalizeIpv4(embeddedIpv4[1]);
    if (!ipv4) return [];
    const octets = ipv4.split('.').map(Number);
    const replacement = `${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
    source = `${source.slice(0, embeddedIpv4.index + (source[embeddedIpv4.index] === ':' ? 1 : 0))}${replacement}`;
  }

  const halves = source.split('::');
  if (halves.length > 2) return [];
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  if ([...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return [];
  if (halves.length === 1 && left.length !== 8) return [];
  const missing = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (missing < 1 && halves.length === 2) return [];
  const parts = [...left, ...Array(missing).fill('0'), ...right];
  return parts.length === 8 ? parts.map((part) => Number.parseInt(part, 16)) : [];
}

function normalizeActorOrigin(value) {
  const source = cleanHeader(value, 128).toLowerCase();
  if (!source || source.includes(',') || source.includes('%')) return '';
  const mapped = source.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return normalizeIpv4(mapped[1]);
  if (net.isIP(source) === 4) return normalizeIpv4(source);
  if (net.isIP(source) !== 6) return '';
  const parts = expandIpv6(source);
  if (parts.length !== 8) return '';
  // IPv6 privacy addresses rotate their lower half; a /64 remains one origin.
  return `${parts.slice(0, 4).map((part) => part.toString(16).padStart(4, '0')).join(':')}::/64`;
}

function hostedVercelRuntime() {
  return (
    process.env.VERCEL === '1' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL_ENV === 'preview'
  );
}

function trustedActorOrigin(req) {
  if (hostedVercelRuntime()) {
    // Vercel overwrites this system header at its edge. Never fall back to the
    // client-controlled X-Forwarded-For value.
    return normalizeActorOrigin(
      req && req.headers && req.headers[TRUSTED_VERCEL_IP_HEADER]
    );
  }
  if (process.env.NODE_ENV === 'production') return '';
  const socketAddress =
    req && req.socket && req.socket.remoteAddress
      ? req.socket.remoteAddress
      : req && req.connection && req.connection.remoteAddress
      ? req.connection.remoteAddress
      : '';
  return normalizeActorOrigin(socketAddress);
}

function validActorHashSecret(value) {
  return Buffer.byteLength(value || '', 'utf8') >= ACTOR_HASH_SECRET_MIN_BYTES;
}

function deriveActorHash(req, secret) {
  if (!validActorHashSecret(secret)) return '';
  const origin = trustedActorOrigin(req);
  if (!origin) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(`celeste-actor-v1\0${origin}`, 'utf8')
    .digest('hex');
}

function deriveReportActorHash(req, secret) {
  if (!validActorHashSecret(secret)) return '';
  const origin = trustedActorOrigin(req);
  if (!origin) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(`celeste-ai-report-actor-v1\0${origin}`, 'utf8')
    .digest('hex');
}

function bearerToken(req) {
  const authorization = cleanHeader(req && req.headers && req.headers.authorization, 4096);
  const match = authorization.match(/^Bearer\s+([^\s]+)$/i);
  return match ? match[1] : '';
}

function clientKind(req) {
  return cleanHeader(req && req.headers && req.headers['x-celeste-client'], 20).toLowerCase();
}

function requestId(req) {
  const value = cleanHeader(req && req.headers && req.headers['x-celeste-request-id'], 100);
  return REQUEST_ID_PATTERN.test(value) ? value : '';
}

function hasNativeClientClaim(req) {
  const origin = cleanHeader(req && req.headers && req.headers.origin, 500);
  return !origin && NATIVE_CLIENTS.has(clientKind(req));
}

function localNativeBypassEnabled() {
  return (
    process.env.CELESTE_ALLOW_LOCAL_NATIVE_BYPASS === '1' &&
    process.env.VERCEL_ENV === 'development' &&
    process.env.NODE_ENV !== 'production'
  );
}

function isNativeRequest(req) {
  // X-Celeste-Client is attacker-controlled. Native traffic stays closed until
  // App Attest / Play Integrity is verified server-side.
  return hasNativeClientClaim(req) && localNativeBypassEnabled();
}

async function fetchWithTimeout(url, options) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS) : null;
  try {
    return await fetch(url, {
      ...options,
      signal: controller ? controller.signal : undefined,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function authenticatedUser(config, token) {
  let response;
  try {
    response = await fetchWithTimeout(`${config.url}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
  } catch (_error) {
    return { error: 'identity_verification_unavailable', status: 503 };
  }
  if (!response || !response.ok) {
    return response && (response.status === 401 || response.status === 403)
      ? { error: 'identity_required', status: 401 }
      : { error: 'identity_verification_unavailable', status: 503 };
  }
  try {
    const user = await response.json();
    if (!user || !USER_ID_PATTERN.test(user.id || '')) {
      return { error: 'identity_required', status: 401 };
    }
    return { userId: user.id, isAnonymous: user.is_anonymous === true };
  } catch (_error) {
    return { error: 'identity_verification_unavailable', status: 503 };
  }
}

function serviceRoleHeaders(config) {
  const headers = {
    apikey: config.serviceKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  // Opaque Supabase secret keys are API keys, not JWTs. Legacy service-role
  // JWTs still use Authorization, while sb_secret_* must stay in `apikey`.
  if (!/^sb_secret_/i.test(config.serviceKey)) {
    headers.Authorization = `Bearer ${config.serviceKey}`;
  }
  return headers;
}

async function reservationRpc(config, input) {
  const body = {
    p_user_id: input.userId,
    p_request_id: input.requestId,
    p_operation: input.operation,
    p_units: input.units,
    p_actor_hash: input.actorHash,
  };
  return fetchWithTimeout(
    `${config.url}/rest/v1/rpc/celeste_reserve_generation_credit`,
    {
      method: 'POST',
      headers: serviceRoleHeaders(config),
      body: JSON.stringify(body),
    }
  );
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function reservationResult(result) {
  if (result && result.duplicate === true) {
    return { error: 'duplicate_request', status: 409 };
  }
  if (!result || result.allowed !== true) {
    return {
      error: result && result.reason === 'disabled'
        ? 'generation_paused'
        : result && result.reason === 'duplicate'
        ? 'duplicate_request'
        : result && result.reason === 'actor_required'
        ? 'spend_guard_unavailable'
        : 'daily_generation_limit_reached',
      status: result && result.reason === 'disabled'
        ? 503
        : result && result.reason === 'duplicate'
        ? 409
        : result && result.reason === 'actor_required'
        ? 503
        : 429,
    };
  }
  if (result.actorQuota !== true || result.operationQuota !== true) {
    return { error: 'spend_guard_unavailable', status: 503 };
  }
  // Scene and visual reserve before dispatch; the other operations commit in
  // the atomic reservation. Only explicit true requires the finalizer RPC.
  return {
    ok: true,
    duplicate: false,
    reserved: result.reserved === true,
    actorQuota: 'enforced',
    operationQuota: 'enforced',
  };
}

async function reserveCredit(config, input) {
  let response;
  try {
    response = await reservationRpc(config, input);
  } catch (_error) {
    return { error: 'spend_guard_unavailable', status: 503 };
  }
  if (!response || !response.ok) return { error: 'spend_guard_unavailable', status: 503 };
  return reservationResult(await responseJson(response));
}

async function authorizePaidRequest(req, { operation, units = 1 } = {}) {
  if (authorizerOverride) {
    const overridden = await authorizerOverride(req, { operation, units });
    return overridden && overridden.ok ? { ...overridden, testOverride: true } : overridden;
  }
  if (!OPERATIONS.has(operation) || !Number.isInteger(units) || units < 1 || units > 20) {
    return { error: 'spend_guard_invalid', status: 500 };
  }

  if (hasNativeClientClaim(req) && !isNativeRequest(req)) {
    return { error: 'native_attestation_required', status: 403 };
  }

  const config = serverConfig();
  if (
    !config.url ||
    !config.anonKey ||
    !config.serviceKey ||
    !validActorHashSecret(config.actorHashSecret)
  ) {
    return { error: 'spend_guard_not_configured', status: 503 };
  }
  const actorHash = deriveActorHash(req, config.actorHashSecret);
  if (!ACTOR_HASH_PATTERN.test(actorHash)) {
    return { error: 'spend_guard_unavailable', status: 503 };
  }
  const token = bearerToken(req);
  const id = requestId(req);
  if (!token || !id) return { error: 'identity_required', status: 401 };

  const identity = await authenticatedUser(config, token);
  if (identity.error) return identity;
  const reservation = await reserveCredit(config, {
    userId: identity.userId,
    requestId: id,
    operation,
    units,
    actorHash,
  });
  if (!reservation.ok) return reservation;
  return {
    ok: true,
    userId: identity.userId,
    requestId: id,
    operation,
    units,
    native: isNativeRequest(req),
    duplicate: reservation.duplicate,
    reserved: reservation.reserved,
    actorQuota: reservation.actorQuota,
    operationQuota: reservation.operationQuota,
  };
}

async function finalizeCredit(config, access, commit) {
  let response;
  try {
    response = await fetchWithTimeout(
      `${config.url}/rest/v1/rpc/celeste_finalize_generation_credit`,
      {
        method: 'POST',
        headers: serviceRoleHeaders(config),
        body: JSON.stringify({
          p_user_id: access.userId,
          p_request_id: access.requestId,
          p_commit: commit,
        }),
      }
    );
  } catch (_error) {
    return { error: 'spend_guard_unavailable', status: 503 };
  }
  if (!response || !response.ok) return { error: 'spend_guard_unavailable', status: 503 };
  try {
    const result = await response.json();
    if (!result || result.finalized !== true) {
      return {
        error: result && result.reason === 'released'
          ? 'generation_reservation_released'
          : 'spend_guard_unavailable',
        status: result && result.reason === 'released' ? 409 : 503,
      };
    }
    return { ok: true, state: result.state || (commit ? 'committed' : 'released') };
  } catch (_error) {
    return { error: 'spend_guard_unavailable', status: 503 };
  }
}

async function settlePaidRequest(access, commit) {
  if (!access || access.ok !== true) return { error: 'spend_guard_invalid', status: 500 };
  if (access.testOverride) {
    if (finalizerOverride) return finalizerOverride(access, { commit });
    return { ok: true, state: commit ? 'committed' : 'released' };
  }
  if (access.reserved !== true) {
    return { ok: true, state: 'committed', legacyOnePhase: true };
  }
  if (
    !USER_ID_PATTERN.test(access.userId || '') ||
    !REQUEST_ID_PATTERN.test(access.requestId || '')
  ) {
    return { error: 'spend_guard_invalid', status: 500 };
  }
  const config = serverConfig();
  if (!config.url || !config.serviceKey) {
    return { error: 'spend_guard_not_configured', status: 503 };
  }
  return finalizeCredit(config, access, commit);
}

function commitPaidRequest(access) {
  return settlePaidRequest(access, true);
}

function releasePaidRequest(access) {
  return settlePaidRequest(access, false);
}

function setAuthorizerForTests(authorizer) {
  authorizerOverride = typeof authorizer === 'function' ? authorizer : null;
}

function setFinalizerForTests(finalizer) {
  finalizerOverride = typeof finalizer === 'function' ? finalizer : null;
}

function resetAuthorizerForTests() {
  authorizerOverride = null;
  finalizerOverride = null;
}

module.exports = {
  _internals: {
    ACTOR_HASH_PATTERN,
    ACTOR_HASH_SECRET_MIN_BYTES,
    TRUSTED_VERCEL_IP_HEADER,
    deriveActorHash,
    deriveReportActorHash,
    normalizeActorOrigin,
    trustedActorOrigin,
  },
  authenticatedUser,
  authorizePaidRequest,
  bearerToken,
  commitPaidRequest,
  deriveReportActorHash,
  fetchWithTimeout,
  isNativeRequest,
  releasePaidRequest,
  resetAuthorizerForTests,
  serverConfig,
  serviceRoleHeaders,
  setAuthorizerForTests,
  setFinalizerForTests,
  validActorHashSecret,
};
