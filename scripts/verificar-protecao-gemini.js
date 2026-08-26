const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const generation = read('api/gerar-cena.js');
const translation = read('api/traduzir-cena.js');
const dream = read('api/transformar-sonho.js');
const audio = read('api/gerar-audio.js');
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
]) {
  assert.match(source, /Boolean\(origin\)\s*&&\s*allowedOrigins\(\)\.has\(origin\)/, `${name} aceita Origin ausente`);
  assert.doesNotMatch(source, /!origin\s*\|\|/, `${name} reintroduziu bypass sem Origin`);
  assert.doesNotMatch(source, /new Map\s*\(/, `${name} voltou a depender de limite em memoria`);
  assert.match(source, /require\('botid\/server'\)/, `${name} nao carrega BotID`);
  assert.match(source, /checkLevel:\s*'basic'/, `${name} nao fixa BotID Basic`);
  assert.match(source, /bot_verification_unavailable/, `${name} nao fecha em falha do BotID`);
  assert.match(source, /Cache-Control',\s*'no-store, max-age=0'/, `${name} permite cache de resposta pessoal`);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)/, `${name} pode registrar conteudo pessoal`);
}

for (const [name, source] of [['transformar-sonho', dream], ['gerar-audio', audio]]) {
  assert.match(source, /CDN-Cache-Control',\s*'no-store'/, `${name} nao fecha o cache do CDN`);
  assert.match(source, /Vercel-CDN-Cache-Control',\s*'no-store'/, `${name} nao fecha o cache da Vercel`);
  assert.match(source, /Surrogate-Control',\s*'no-store'/, `${name} nao fecha caches intermediarios`);
  assert.match(source, /Referrer-Policy',\s*'no-referrer'/, `${name} nao fecha referrer`);
}
assert.match(audio, /store:\s*false/, 'TTS nao desativa armazenamento na requisicao Gemini');
assert.match(audio, /cloudConsent[^\]]*adultConfirmed/s, 'TTS pessoal nao exige consentimento e idade');
assert.match(dream, /ALLOWED_BODY_KEYS/, 'sonho nao usa allowlist de payload');
assert.match(dream, /sanitizeProfile/, 'sonho nao minimiza o perfil');
assert.match(dream, /cloud_consent_required/, 'sonho nao exige consentimento');
assert.match(dream, /adult_confirmation_required/, 'sonho nao exige confirmacao adulta');

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
  '/api/traduzir-cena',
  '/api/transformar-sonho',
]);

assert.ok(packageJson.dependencies && packageJson.dependencies.botid, 'botid ausente das dependencias');
assert.match(deploy, /dependencies:\s*\{\s*botid:\s*botidVersion\s*\}/, 'deploy nao empacota BotID');
assert.match(deploy, /apiTarget, 'transformar-sonho\.js'/, 'deploy nao valida a funcao de sonho');
assert.match(deploy, /apiTarget, 'gerar-audio\.js'/, 'deploy nao valida a funcao de audio');
assert.match(deploy, /automated_request_blocked/, 'deploy nao testa bloqueio de cliente nu');
assert.match(deploy, /verificar-waf-vercel\.js/, 'deploy nao confere o WAF ativo antes da publicacao');
assert.strictEqual(
  packageJson.scripts['verify:gemini-waf-live'],
  'node scripts/verificar-waf-vercel.js',
  'verificador do WAF ativo nao esta exposto no package.json'
);

console.log('Protecao Gemini OK: Origin/BotID/no-store, payload minimo e WAF 12/min em quatro rotas.');
