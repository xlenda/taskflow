const LOCAL_PUBLIC_KEY_ALIASES = Object.freeze([
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
]);

const PRODUCTION_BACKEND_ALIASES = Object.freeze({
  url: Object.freeze([
    'CELESTE_SUPABASE_URL',
    'SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_URL',
  ]),
  publicKey: Object.freeze([
    'CELESTE_SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ]),
  secretKey: Object.freeze([
    'CELESTE_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY',
  ]),
});
const PRODUCTION_TEXT_REQUIRED = Object.freeze([
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_PAID_DATA_TERMS_ACCEPTED',
  'ANTHROPIC_TEXT_MODEL',
  'ANTHROPIC_TEXT_EFFORT',
  'CELESTE_TEXT_PRIMARY',
]);
const PRODUCTION_SECURITY_REQUIRED = Object.freeze([
  'CELESTE_ACTOR_HASH_SECRET',
]);
const GENERATION_QUOTA_SCHEMA_VERSION = 10;
const JOURNEY_VISUAL_COUNT = 13;
const JOURNEY_VISION_AUDIO_UNITS = 6 * 32;
const JOURNEY_AFFIRMATION_AUDIO_UNITS = 6 * 16;
const COMPLETE_JOURNEY_AUDIO_UNITS =
  JOURNEY_VISION_AUDIO_UNITS + JOURNEY_AFFIRMATION_AUDIO_UNITS;
const OPERATION_QUOTA_REQUIREMENTS = Object.freeze({
  scene: Object.freeze({
    userDailyUnits: 12,
    actorDailyUnits: 12,
    allowedUnits: Object.freeze([4, 12]),
  }),
  visual: Object.freeze({
    userDailyUnits: JOURNEY_VISUAL_COUNT * 8,
    actorDailyUnits: JOURNEY_VISUAL_COUNT * 8,
    allowedUnits: Object.freeze([8]),
  }),
  audio: Object.freeze({
    userDailyUnits: COMPLETE_JOURNEY_AUDIO_UNITS,
    actorDailyUnits: COMPLETE_JOURNEY_AUDIO_UNITS,
    allowedUnits: Object.freeze([1, 4, 8, 12, 16, 20]),
  }),
  dream: Object.freeze({
    userDailyUnits: 3,
    actorDailyUnits: 3,
    allowedUnits: Object.freeze([3]),
  }),
  translation: Object.freeze({
    userDailyUnits: 3,
    actorDailyUnits: 3,
    allowedUnits: Object.freeze([3]),
  }),
});
const COMPLETE_JOURNEY_DAILY_UNITS =
  OPERATION_QUOTA_REQUIREMENTS.scene.userDailyUnits +
  OPERATION_QUOTA_REQUIREMENTS.visual.userDailyUnits +
  OPERATION_QUOTA_REQUIREMENTS.audio.userDailyUnits;

function requireText(value, name) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(`Variavel obrigatoria ausente: ${name}`);
  return text;
}

function validatePublicKey(value, name) {
  const key = requireText(value, name);
  if (key.length < 20 || key.length > 4096 || /\s/.test(key)) {
    throw new Error(`${name} invalida`);
  }
  if (/^(?:sb_)?secret_/i.test(key) || /service[_-]?role/i.test(key)) {
    throw new Error(`${name} nao pode conter uma chave secreta`);
  }
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload && payload.role && payload.role !== 'anon') {
        throw new Error(`${name} deve ter role anon`);
      }
    } catch (error) {
      if (/role anon/.test(error && error.message)) throw error;
    }
  }
  return key;
}

function anonymousSignupHeaders(publicKey) {
  const key = validatePublicKey(publicKey, 'Supabase public key');
  const headers = {
    apikey: key,
    'Content-Type': 'application/json',
  };
  // New opaque publishable keys are not JWTs. Legacy anon JWTs keep the
  // Authorization header for backwards compatibility.
  if (!/^sb_publishable_/i.test(key)) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

function validateLocalBuildEnvironment(env = {}) {
  const missing = [];
  if (!String(env.EXPO_PUBLIC_SUPABASE_URL || '').trim()) {
    missing.push('EXPO_PUBLIC_SUPABASE_URL');
  }
  const selectedPublicKey = LOCAL_PUBLIC_KEY_ALIASES.find((name) => String(env[name] || '').trim());
  if (!selectedPublicKey) {
    missing.push(LOCAL_PUBLIC_KEY_ALIASES.join(' ou '));
  }
  if (missing.length) {
    throw new Error(`Variaveis publicas do build ausentes: ${missing.join(', ')}`);
  }
  if (String(env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || '').trim()) {
    throw new Error('EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY e proibida no bundle');
  }
  let url;
  try {
    url = new URL(requireText(env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL'));
  } catch (_error) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL invalida');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL deve usar HTTPS sem credenciais');
  }
  for (const name of LOCAL_PUBLIC_KEY_ALIASES) {
    if (String(env[name] || '').trim()) validatePublicKey(env[name], name);
  }
  return true;
}

function parseJsonObject(output, label) {
  const text = String(output || '').trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`${label} nao retornou JSON`);
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_error) {
    throw new Error(`${label} retornou JSON invalido`);
  }
}

function sameIntegerSet(actual, expected) {
  if (!Array.isArray(actual) || actual.some((value) => !Number.isInteger(value))) return false;
  const normalized = [...new Set(actual)].sort((left, right) => left - right);
  return (
    normalized.length === expected.length &&
    normalized.every((value, index) => value === expected[index])
  );
}

function validateOperationQuotaPayload(payload) {
  if (
    !payload ||
    payload.schemaVersion !== GENERATION_QUOTA_SCHEMA_VERSION ||
    payload.reserveSignature !== true ||
    payload.legacyReserveDisabled !== true ||
    payload.operationQuota !== true ||
    payload.operationQuotaVersion !== 1 ||
    payload.weightedGlobalQuota !== true ||
    !Number.isInteger(payload.perUserDailyUnits) ||
    payload.perUserDailyUnits < COMPLETE_JOURNEY_DAILY_UNITS ||
    !Number.isInteger(payload.actorDailyUnits) ||
    payload.actorDailyUnits < COMPLETE_JOURNEY_DAILY_UNITS ||
    !Number.isInteger(payload.globalDailyUnits) ||
    payload.globalDailyUnits < COMPLETE_JOURNEY_DAILY_UNITS ||
    !payload.operationPolicies ||
    typeof payload.operationPolicies !== 'object' ||
    Array.isArray(payload.operationPolicies)
  ) {
    return false;
  }

  return Object.entries(OPERATION_QUOTA_REQUIREMENTS).every(([operation, required]) => {
    const policy = payload.operationPolicies[operation];
    return (
      policy &&
      policy.enabled === true &&
      Number.isInteger(policy.userDailyUnits) &&
      policy.userDailyUnits >= required.userDailyUnits &&
      Number.isInteger(policy.actorDailyUnits) &&
      policy.actorDailyUnits >= required.actorDailyUnits &&
      sameIntegerSet(policy.allowedUnits, required.allowedUnits)
    );
  });
}

function validateProductionEnvironmentOutput(output) {
  const payload = parseJsonObject(output, 'Vercel env ls');
  const envs = Array.isArray(payload.envs) ? payload.envs : [];
  const production = new Map();
  for (const item of envs) {
    if (!item || typeof item.key !== 'string') continue;
    const targets = Array.isArray(item.target) ? item.target : [];
    if (targets.includes('production')) production.set(item.key, item);
  }
  const selected = {};
  const missing = [];
  for (const [kind, aliases] of Object.entries(PRODUCTION_BACKEND_ALIASES)) {
    selected[kind] = aliases.find((name) => production.has(name)) || '';
    if (!selected[kind]) missing.push(aliases.join(' ou '));
  }
  if (missing.length) {
    throw new Error(`Variaveis Supabase do backend ausentes na Vercel: ${missing.join(', ')}`);
  }
  const missingText = PRODUCTION_TEXT_REQUIRED.filter((name) => !production.has(name));
  if (missingText.length) {
    throw new Error(`Variaveis Anthropic do backend ausentes na Vercel: ${missingText.join(', ')}`);
  }
  const missingSecurity = PRODUCTION_SECURITY_REQUIRED.filter((name) => !production.has(name));
  if (missingSecurity.length) {
    throw new Error(`Variaveis de seguranca do backend ausentes na Vercel: ${missingSecurity.join(', ')}`);
  }
  const secret = production.get(selected.secretKey);
  if (secret.type !== 'sensitive') {
    throw new Error(`${selected.secretKey} deve ser Sensitive na Vercel`);
  }
  if (production.get('ANTHROPIC_API_KEY').type !== 'sensitive') {
    throw new Error('ANTHROPIC_API_KEY deve ser Sensitive na Vercel');
  }
  if (production.get('CELESTE_ACTOR_HASH_SECRET').type !== 'sensitive') {
    throw new Error('CELESTE_ACTOR_HASH_SECRET deve ser Sensitive na Vercel');
  }
  return true;
}

async function validateActorQuotaBackend(env = {}, fetchImpl = global.fetch) {
  const urlValue = PRODUCTION_BACKEND_ALIASES.url
    .map((name) => String(env[name] || '').trim())
    .find(Boolean);
  const serviceKey = PRODUCTION_BACKEND_ALIASES.secretKey
    .map((name) => String(env[name] || '').trim())
    .find(Boolean);
  if (!urlValue || !serviceKey) {
    throw new Error(
      'Credenciais locais do backend ausentes para verificar migration 010; deploy bloqueado'
    );
  }
  if (typeof fetchImpl !== 'function') {
    throw new Error('Verificacao da migration 010 indisponivel; deploy bloqueado');
  }
  let url;
  try {
    url = new URL(urlValue);
  } catch (_error) {
    throw new Error('URL local do backend invalida para verificar migration 010');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('URL local do backend insegura para verificar migration 010');
  }
  const headers = {
    apikey: serviceKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (!/^sb_secret_/i.test(serviceKey)) {
    headers.Authorization = `Bearer ${serviceKey}`;
  }
  let response;
  try {
    response = await fetchImpl(
      `${url.toString().replace(/\/$/, '')}/rest/v1/rpc/celeste_generation_actor_quota_version`,
      { method: 'POST', headers, body: '{}' }
    );
  } catch (_error) {
    throw new Error('Supabase indisponivel ao verificar migration 010; deploy bloqueado');
  }
  if (!response || !response.ok) {
    throw new Error('Migration 010 ausente ou inacessivel no Supabase; deploy bloqueado');
  }
  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    throw new Error('Migration 010 devolveu contrato invalido; deploy bloqueado');
  }
  if (!validateOperationQuotaPayload(payload)) {
    throw new Error('Migration 010 devolveu contrato de cota invalido; deploy bloqueado');
  }
  return {
    schemaVersion: payload.schemaVersion,
    actorDailyUnits: payload.actorDailyUnits,
    perUserDailyUnits: payload.perUserDailyUnits,
    globalDailyUnits: payload.globalDailyUnits,
    legacyReserveDisabled: true,
    operationQuota: true,
  };
}

function parseDeploymentOutput(output, label = 'Vercel') {
  const payload = parseJsonObject(output, label);
  const rawUrl = typeof payload.url === 'string'
    ? payload.url
    : payload.deployment && typeof payload.deployment.url === 'string'
    ? payload.deployment.url
    : '';
  if (!rawUrl) {
    throw new Error(`${label} nao retornou URL de deployment valida`);
  }
  let url;
  try {
    url = new URL(/^https?:\/\//.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch (_error) {
    throw new Error(`${label} nao retornou URL de deployment valida`);
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.endsWith('.vercel.app')
  ) {
    throw new Error(`${label} nao retornou URL de deployment segura`);
  }
  return {
    id: typeof payload.id === 'string' ? payload.id : '',
    url: url.origin,
  };
}

function extractAnonymousAccessToken(payload) {
  const token = payload && typeof payload.access_token === 'string'
    ? payload.access_token
    : payload && payload.session && typeof payload.session.access_token === 'string'
    ? payload.session.access_token
    : '';
  if (token.length < 20 || token.length > 4096 || /\s/.test(token)) {
    throw new Error('Supabase nao devolveu uma sessao anonima valida');
  }
  return token;
}

module.exports = {
  COMPLETE_JOURNEY_DAILY_UNITS,
  GENERATION_QUOTA_SCHEMA_VERSION,
  LOCAL_PUBLIC_KEY_ALIASES,
  OPERATION_QUOTA_REQUIREMENTS,
  PRODUCTION_BACKEND_ALIASES,
  PRODUCTION_SECURITY_REQUIRED,
  PRODUCTION_TEXT_REQUIRED,
  anonymousSignupHeaders,
  extractAnonymousAccessToken,
  parseDeploymentOutput,
  validateLocalBuildEnvironment,
  validateActorQuotaBackend,
  validateOperationQuotaPayload,
  validateProductionEnvironmentOutput,
};
