const paidAccess = require('./_paid-access');

const MAX_BODY_BYTES = 24 * 1024;
const ACTOR_HASH_PATTERN = /^[0-9a-f]{64}$/;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPORT_ID_PATTERN = USER_ID_PATTERN;
const REFERENCE_PATTERN = /^[A-Za-z0-9._:-]{1,180}$/;
const VISUAL_REFERENCE_PATTERN = /^[A-Za-z0-9._:-]{0,180}$/;
const CONTENT_TYPES = new Set(['scene', 'dream', 'vision', 'affirmation']);
const REASONS = new Set([
  'unsafe_harmful',
  'hate_harassment',
  'sexual',
  'violence_self_harm',
  'privacy',
  'misleading',
  'other',
]);
const PLATFORMS = new Set(['android', 'ios', 'web', 'native']);
const BODY_KEYS = new Set([
  'contentType',
  'contentRef',
  'reason',
  'content',
  'visualRef',
  'note',
  'lang',
  'generation',
  'platform',
  'appVersion',
]);
const GENERATION_KEYS = new Set(['source', 'model', 'promptVersion']);
const RATE_LIMIT_REASONS = new Set(['user_limit', 'actor_limit', 'global_limit']);
const DEFAULT_ALLOWED_ORIGINS = [
  'https://celeste-jet-two.vercel.app',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
];

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
    : '';
}

function rawTextIsTooLong(value, maxLength) {
  return typeof value === 'string' && value.length > maxLength;
}

function header(req, name, maxLength = 500) {
  const raw = req && req.headers && req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return cleanText(value, maxLength);
}

function parseBody(req) {
  const declaredLength = Number(req && req.headers && req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { error: 'payload_too_large', status: 413 };
  }

  let body = req && req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return { error: 'payload_too_large', status: 413 };
    }
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

function validateInput(body, expectedPlatform) {
  if (Object.keys(body).some((key) => !BODY_KEYS.has(key))) {
    return { error: 'ai_report_invalid', status: 400 };
  }
  if (!CONTENT_TYPES.has(body.contentType) || !REASONS.has(body.reason)) {
    return { error: 'ai_report_invalid', status: 400 };
  }

  const textLimits = {
    contentRef: 180,
    content: 4000,
    visualRef: 180,
    note: 500,
    appVersion: 40,
  };
  for (const [key, limit] of Object.entries(textLimits)) {
    if (
      body[key] !== undefined &&
      (typeof body[key] !== 'string' || rawTextIsTooLong(body[key], limit))
    ) {
      return { error: 'ai_report_invalid', status: 400 };
    }
  }

  if (body.lang !== 'pt' && body.lang !== 'en') {
    return { error: 'ai_report_invalid', status: 400 };
  }
  if (!PLATFORMS.has(body.platform) || (expectedPlatform && body.platform !== expectedPlatform)) {
    return { error: 'ai_report_invalid', status: 400 };
  }
  if (!isPlainObject(body.generation)) {
    return { error: 'ai_report_invalid', status: 400 };
  }
  if (Object.keys(body.generation).some((key) => !GENERATION_KEYS.has(key))) {
    return { error: 'ai_report_invalid', status: 400 };
  }
  const generationLimits = { source: 40, model: 100, promptVersion: 80 };
  for (const [key, limit] of Object.entries(generationLimits)) {
    const value = body.generation[key];
    if (value !== undefined && (typeof value !== 'string' || rawTextIsTooLong(value, limit))) {
      return { error: 'ai_report_invalid', status: 400 };
    }
  }

  const contentRef = cleanText(body.contentRef, 180);
  const visualRef = cleanText(body.visualRef, 180);
  const content = cleanText(body.content, 4000);
  const note = cleanText(body.note, 500);
  const generationSource = cleanText(body.generation.source, 40) || 'unknown';
  const generationModel = cleanText(body.generation.model, 100) || 'unknown';
  const promptVersion = cleanText(body.generation.promptVersion, 80) || 'unknown';
  const appVersion = cleanText(body.appVersion, 40) || 'unknown';

  if (
    !REFERENCE_PATTERN.test(contentRef) ||
    !VISUAL_REFERENCE_PATTERN.test(visualRef) ||
    (!content && !visualRef)
  ) {
    return { error: 'ai_report_invalid', status: 400 };
  }

  return {
    value: {
      contentType: body.contentType,
      contentRef,
      reason: body.reason,
      content,
      visualRef,
      note,
      lang: body.lang,
      generationSource,
      generationModel,
      promptVersion,
      platform: body.platform,
      appVersion,
    },
  };
}

function allowedOrigins() {
  const configured = String(process.env.CELESTE_ALLOWED_ORIGINS || '').trim();
  const values = configured
    ? configured.split(',').map((value) => value.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  return new Set(values.filter((value) => /^https?:\/\/[^\s/]+(?::\d+)?$/.test(value)));
}

function setResponseHeaders(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  const origin = header(req, 'origin');
  const allowed = !origin || allowedOrigins().has(origin);
  if (origin && allowed) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Celeste-Client');
  return allowed;
}

function requestClient(req) {
  const origin = header(req, 'origin');
  const client = header(req, 'x-celeste-client', 20).toLowerCase();
  if (origin) {
    return client === 'web'
      ? { client: 'web' }
      : { error: 'client_platform_invalid', status: 400 };
  }
  return client === 'android' || client === 'ios'
    ? { client }
    : { error: 'client_platform_invalid', status: 400 };
}

function sendJson(res, status, error) {
  return res.status(status).json({ error });
}

function reportConfig(method) {
  const config = paidAccess.serverConfig();
  const baseReady = Boolean(config.url && config.anonKey && config.serviceKey);
  const postReady = method !== 'POST' || paidAccess.validActorHashSecret(config.actorHashSecret);
  return baseReady && postReady ? { config } : { error: 'ai_report_not_configured', status: 503 };
}

async function verifyIdentity(req, config) {
  const token = paidAccess.bearerToken(req);
  if (!token) return { error: 'ai_report_identity_required', status: 401 };
  const identity = await paidAccess.authenticatedUser(config, token);
  if (identity.error) {
    return {
      error: identity.status === 401
        ? 'ai_report_identity_required'
        : 'ai_report_identity_verification_unavailable',
      status: identity.status === 401 ? 401 : 503,
    };
  }
  if (!USER_ID_PATTERN.test(identity.userId || '')) {
    return { error: 'ai_report_identity_required', status: 401 };
  }
  return identity;
}

async function callRpc(config, name, body) {
  let response;
  try {
    response = await paidAccess.fetchWithTimeout(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: paidAccess.serviceRoleHeaders(config),
      body: JSON.stringify(body),
    });
  } catch (_error) {
    return { error: 'ai_report_unavailable', status: 503 };
  }
  if (!response || !response.ok) {
    return { error: 'ai_report_unavailable', status: 503 };
  }
  try {
    return { value: await response.json() };
  } catch (_error) {
    return { error: 'ai_report_unavailable', status: 503 };
  }
}

function submissionResult(result) {
  if (!isPlainObject(result)) return { error: 'ai_report_unavailable', status: 503 };
  if (result.accepted !== true) {
    if (RATE_LIMIT_REASONS.has(result.reason)) {
      return { error: 'ai_report_rate_limited', status: 429 };
    }
    if (result.reason === 'invalid') return { error: 'ai_report_invalid', status: 400 };
    return { error: 'ai_report_unavailable', status: 503 };
  }
  if (
    result.userQuota !== true ||
    result.actorQuota !== true ||
    result.globalQuota !== true ||
    typeof result.duplicate !== 'boolean' ||
    !REPORT_ID_PATTERN.test(result.reportId || '')
  ) {
    return { error: 'ai_report_unavailable', status: 503 };
  }
  return {
    ok: true,
    duplicate: result.duplicate,
    reportId: result.reportId.toLowerCase(),
  };
}

async function submitReport(req, res, config, identity, client) {
  if (identity.isAnonymous !== true) {
    return sendJson(res, 403, 'ai_report_anonymous_identity_required');
  }
  const parsed = parseBody(req);
  if (parsed.error) return sendJson(res, parsed.status, parsed.error);
  const validated = validateInput(parsed.body, client);
  if (validated.error) return sendJson(res, validated.status, validated.error);

  const actorHash = paidAccess.deriveReportActorHash(req, config.actorHashSecret);
  if (!ACTOR_HASH_PATTERN.test(actorHash)) {
    return sendJson(res, 503, 'ai_report_actor_guard_unavailable');
  }
  const report = validated.value;
  const rpc = await callRpc(config, 'celeste_submit_ai_content_report_server', {
    p_reporter_id: identity.userId,
    p_actor_hash: actorHash,
    p_content_type: report.contentType,
    p_content_ref: report.contentRef,
    p_reason: report.reason,
    p_content_text: report.content,
    p_visual_ref: report.visualRef,
    p_user_note: report.note,
    p_locale: report.lang,
    p_generation_source: report.generationSource,
    p_generation_model: report.generationModel,
    p_prompt_version: report.promptVersion,
    p_platform: report.platform,
    p_app_version: report.appVersion,
  });
  if (rpc.error) return sendJson(res, rpc.status, rpc.error);
  const result = submissionResult(rpc.value);
  if (!result.ok) return sendJson(res, result.status, result.error);
  return res.status(result.duplicate ? 200 : 201).json({
    ok: true,
    reportId: result.reportId,
    duplicate: result.duplicate,
  });
}

async function deleteReports(res, config, identity) {
  const rpc = await callRpc(config, 'celeste_delete_all_ai_content_reports_server', {
    p_reporter_id: identity.userId,
  });
  if (rpc.error) return sendJson(res, rpc.status, rpc.error);
  if (!isPlainObject(rpc.value) || rpc.value.deleted !== true) {
    return sendJson(res, 503, 'ai_report_unavailable');
  }
  return res.status(204).end();
}

async function handler(req, res) {
  if (!setResponseHeaders(req, res)) return sendJson(res, 403, 'origin_not_allowed');
  const method = String((req && req.method) || 'GET').toUpperCase();
  if (method === 'OPTIONS') return res.status(204).end();
  if (method !== 'POST' && method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE, OPTIONS');
    return sendJson(res, 405, 'method_not_allowed');
  }
  const client = requestClient(req);
  if (client.error) return sendJson(res, client.status, client.error);

  const configured = reportConfig(method);
  if (configured.error) return sendJson(res, configured.status, configured.error);
  const identity = await verifyIdentity(req, configured.config);
  if (identity.error) return sendJson(res, identity.status, identity.error);
  if (method === 'DELETE') return deleteReports(res, configured.config, identity);
  return submitReport(req, res, configured.config, identity, client.client);
}

module.exports = handler;
module.exports.default = handler;
module.exports.handler = handler;
module.exports._internals = {
  MAX_BODY_BYTES,
  parseBody,
  requestClient,
  submissionResult,
  validateInput,
};
