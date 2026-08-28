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
  const secret = production.get(selected.secretKey);
  if (secret.type !== 'sensitive') {
    throw new Error(`${selected.secretKey} deve ser Sensitive na Vercel`);
  }
  if (production.get('ANTHROPIC_API_KEY').type !== 'sensitive') {
    throw new Error('ANTHROPIC_API_KEY deve ser Sensitive na Vercel');
  }
  return true;
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
  LOCAL_PUBLIC_KEY_ALIASES,
  PRODUCTION_BACKEND_ALIASES,
  PRODUCTION_TEXT_REQUIRED,
  anonymousSignupHeaders,
  extractAnonymousAccessToken,
  parseDeploymentOutput,
  validateLocalBuildEnvironment,
  validateProductionEnvironmentOutput,
};
