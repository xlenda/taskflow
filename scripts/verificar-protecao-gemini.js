const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const generation = read('api/gerar-cena.js');
const translation = read('api/traduzir-cena.js');
const dream = read('api/transformar-sonho.js');
const audio = read('api/gerar-audio.js');
const visual = read('api/gerar-visual.js');
const paidAccess = read('api/_paid-access.js');
const actorQuotaMigration = read('supabase/migrations/008_generation_actor_quota.sql');
const actorQuotaContract = read('supabase/migrations/009_disable_legacy_generation_reserve.sql');
const client = read('utils/botProtection.web.js');
const deploy = read('scripts/deploy-celeste.js');
const vercel = JSON.parse(read('vercel.json'));
const firewall = JSON.parse(read('ops/vercel-firewall-gemini-rate-limit.json'));
const packageJson = JSON.parse(read('package.json'));

function walkJavaScript(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJavaScript(full);
    return entry.isFile() && /\.[cm]?jsx?$/.test(entry.name) ? [full] : [];
  });
}

for (const [name, source] of [
  ['gerar-cena', generation],
  ['traduzir-cena', translation],
  ['transformar-sonho', dream],
  ['gerar-audio', audio],
  ['gerar-visual', visual],
]) {
  assert.match(source, /Boolean\(origin\)\s*&&\s*allowedOrigins\(\)\.has\(origin\)/, `${name} aceita Origin ausente`);
  assert.doesNotMatch(source, /!origin\s*\|\|/, `${name} reintroduziu bypass sem Origin`);
  assert.doesNotMatch(source, /new Map\s*\(/, `${name} voltou a depender de limite em memoria`);
  assert.match(source, /require\('botid\/server'\)/, `${name} nao carrega BotID`);
  assert.match(source, /checkLevel:\s*'basic'/, `${name} nao fixa BotID Basic`);
  assert.match(
    source,
    /CELESTE_ALLOW_LOCAL_BOT_BYPASS\s*===\s*'1'[\s\S]*?VERCEL_ENV\s*!==\s*'preview'/,
    `${name} pode liberar BotID automaticamente em preview`
  );
  assert.doesNotMatch(
    source,
    /isDevelopment:\s*process\.env\.VERCEL_ENV\s*!==\s*'production'/,
    `${name} reintroduziu bypass em todo deploy nao produtivo`
  );
  assert.match(source, /bot_verification_unavailable/, `${name} nao fecha em falha do BotID`);
  assert.match(source, /paidAccess\.isNativeRequest\(req\)/, `${name} nao usa a politica nativa fechada`);
  assert.match(source, /Cache-Control',\s*'no-store, max-age=0'/, `${name} permite cache de resposta pessoal`);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)/, `${name} pode registrar conteudo pessoal`);
}

for (const [name, source] of [['transformar-sonho', dream], ['gerar-audio', audio], ['gerar-visual', visual]]) {
  assert.match(source, /CDN-Cache-Control',\s*'no-store'/, `${name} nao fecha o cache do CDN`);
  assert.match(source, /Vercel-CDN-Cache-Control',\s*'no-store'/, `${name} nao fecha o cache da Vercel`);
  assert.match(source, /Surrogate-Control',\s*'no-store'/, `${name} nao fecha caches intermediarios`);
  assert.match(source, /Referrer-Policy',\s*'no-referrer'/, `${name} nao fecha referrer`);
}
assert.match(audio, /api\.elevenlabs\.io/, 'TTS nao usa ElevenLabs no servidor');
assert.match(audio, /enable_logging:\s*'false'/, 'TTS nao desativa armazenamento na requisicao ElevenLabs');
assert.match(audio, /ELEVENLABS_API_KEY/, 'TTS nao le a chave ElevenLabs no servidor');
assert.doesNotMatch(audio, /EXPO_PUBLIC_ELEVENLABS/, 'TTS usa uma chave ElevenLabs publica');
assert.match(visual, /store:\s*false/, 'visual nao desativa armazenamento na requisicao Gemini');
assert.match(visual, /ALLOWED_BODY_KEYS/, 'visual nao usa allowlist de payload');
assert.match(visual, /sanitizeProfile/, 'visual nao minimiza o perfil');
assert.match(visual, /cloud_consent_required/, 'visual nao exige consentimento');
assert.match(visual, /adult_confirmation_required/, 'visual nao exige confirmacao adulta');
assert.match(audio, /cloudConsent[^\]]*adultConfirmed/s, 'TTS pessoal nao exige consentimento e idade');
assert.match(dream, /ALLOWED_BODY_KEYS/, 'sonho nao usa allowlist de payload');
assert.match(dream, /sanitizeProfile/, 'sonho nao minimiza o perfil');
assert.match(dream, /cloud_consent_required/, 'sonho nao exige consentimento');
assert.match(dream, /adult_confirmation_required/, 'sonho nao exige confirmacao adulta');
assert.match(paidAccess, /native_attestation_required/, 'cliente nativo sem atestacao nao fecha antes da cota');
assert.match(
  paidAccess,
  /CELESTE_ALLOW_LOCAL_NATIVE_BYPASS\s*===\s*'1'[\s\S]*?VERCEL_ENV\s*===\s*'development'[\s\S]*?NODE_ENV\s*!==\s*'production'/,
  'bypass nativo nao esta restrito ao desenvolvimento local'
);
assert.match(
  paidAccess,
  /hasNativeClientClaim\(req\)\s*&&\s*!isNativeRequest\(req\)/,
  'claim nativo autodeclarado ainda pode chegar a reserva de credito'
);
assert.match(paidAccess, /TRUSTED_VERCEL_IP_HEADER\s*=\s*'x-vercel-forwarded-for'/);
assert.match(paidAccess, /createHmac\('sha256', secret\)/);
assert.match(paidAccess, /CELESTE_ACTOR_HASH_SECRET/);
assert.match(paidAccess, /p_actor_hash:\s*input\.actorHash/);
assert.doesNotMatch(paidAccess, /PGRST202|legacy_schema/);
assert.doesNotMatch(paidAccess, /headers\[['"]x-forwarded-for['"]\]/);
assert.match(actorQuotaMigration, /actor_daily_units\s+integer\s+not null\s+default 96/i);
assert.match(actorQuotaMigration, /primary key\s*\(usage_day, actor_hash\)/i);
assert.match(actorQuotaMigration, /for update/i);
assert.match(actorQuotaMigration, /actorRemaining/i);
assert.match(actorQuotaContract, /'reason', 'actor_required'/i);

const clientFiles = [path.join(root, 'App.js')].concat(
  ['components', 'constants', 'context', 'screens', 'services', 'utils']
    .flatMap((directory) => walkJavaScript(path.join(root, directory)))
);
for (const filename of clientFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  assert.doesNotMatch(source, /EXPO_PUBLIC_(?:GEMINI|ELEVEN)/i, `segredo cloud nomeado no cliente: ${path.relative(root, filename)}`);
  assert.doesNotMatch(source, /\b(?:GEMINI|ELEVENLABS)(?:_API)?_KEY\b/, `segredo cloud referenciado no cliente: ${path.relative(root, filename)}`);
  assert.doesNotMatch(source, /\bsk_[a-z0-9_-]{20,}/i, `chave privada encontrada no cliente: ${path.relative(root, filename)}`);
}

for (const pathname of [
  '/api/gerar-cena',
  '/api/traduzir-cena',
  '/api/transformar-sonho',
  '/api/gerar-audio',
  '/api/gerar-visual',
]) {
  assert.ok(client.includes(`path: '${pathname}'`), `cliente BotID nao protege ${pathname}`);
}
assert.match(client, /hostname === 'localhost'/, 'BotID deve ignorar o servidor local de desenvolvimento');
assert.match(client, /hostname === '127\.0\.0\.1'/, 'BotID deve ignorar o servidor local de QA');

const challengePrefix = '/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3';
assert.strictEqual(vercel.rewrites[0].source, `${challengePrefix}/a-4-a/c.js`);
assert.strictEqual(vercel.rewrites[1].source, `${challengePrefix}/:path*`);
assert.match(vercel.rewrites[0].destination, /bot-protection\/v1\/challenge$/);
assert.match(vercel.rewrites[1].destination, /bot-protection\/v1\/proxy\/:path\*$/);

assert.strictEqual(firewall.action, 'rules.update');
assert.strictEqual(firewall.id, 'rule_celeste_gemini_api_rate_limit_o1N0Tn');
assert.strictEqual(firewall.value.active, true);
const mitigate = firewall.value.action.mitigate;
assert.strictEqual(mitigate.action, 'rate_limit');
assert.deepStrictEqual(mitigate.rateLimit, {
  limit: 12,
  action: 'deny',
  window: 60,
  algo: 'fixed_window',
  keys: ['ip', 'ja4'],
});
const protectedPaths = firewall.value.conditionGroup.map((group) => {
  const values = Object.fromEntries(group.conditions.map((condition) => [condition.type, condition.value]));
  assert.strictEqual(values.method, 'POST');
  return values.path;
}).sort();
assert.deepStrictEqual(protectedPaths, [
  '/api/gerar-audio',
  '/api/gerar-cena',
  '/api/gerar-visual',
  '/api/traduzir-cena',
  '/api/transformar-sonho',
]);

assert.ok(packageJson.dependencies && packageJson.dependencies.botid, 'botid ausente das dependencias');
assert.match(deploy, /dependencies:\s*\{\s*botid:\s*botidVersion\s*\}/, 'deploy nao empacota BotID');
assert.match(deploy, /apiTarget, 'transformar-sonho\.js'/, 'deploy nao valida a funcao de sonho');
assert.match(deploy, /apiTarget, 'gerar-audio\.js'/, 'deploy nao valida a funcao de audio');
assert.match(deploy, /apiTarget, 'gerar-visual\.js'/, 'deploy nao valida a funcao visual');
assert.match(deploy, /automated_request_blocked/, 'deploy nao testa bloqueio de cliente nu');
assert.match(deploy, /verificar-waf-vercel\.js/, 'deploy nao confere o WAF ativo antes da publicacao');
assert.strictEqual(
  packageJson.scripts['verify:gemini-waf-live'],
  'node scripts/verificar-waf-vercel.js',
  'verificador do WAF ativo nao esta exposto no package.json'
);
assert.strictEqual(
  packageJson.scripts['verify:paid-access'],
  'node scripts/verificar-acesso-pago.js',
  'verificador da cota por ator nao esta exposto no package.json'
);

console.log('Protecao Gemini OK: Origin/BotID/no-store, payload minimo e WAF 12/min em cinco rotas.');
