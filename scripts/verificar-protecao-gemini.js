const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const generation = read('api/gerar-cena.js');
const translation = read('api/traduzir-cena.js');
const client = read('utils/botProtection.web.js');
const deploy = read('scripts/deploy-celeste.js');
const vercel = JSON.parse(read('vercel.json'));
const firewall = JSON.parse(read('ops/vercel-firewall-gemini-rate-limit.json'));
const packageJson = JSON.parse(read('package.json'));

for (const [name, source] of [
  ['gerar-cena', generation],
  ['traduzir-cena', translation],
]) {
  assert.match(source, /Boolean\(origin\)\s*&&\s*allowedOrigins\(\)\.has\(origin\)/, `${name} aceita Origin ausente`);
  assert.doesNotMatch(source, /!origin\s*\|\|/, `${name} reintroduziu bypass sem Origin`);
  assert.doesNotMatch(source, /new Map\s*\(/, `${name} voltou a depender de limite em memoria`);
  assert.match(source, /require\('botid\/server'\)/, `${name} nao carrega BotID`);
  assert.match(source, /checkLevel:\s*'basic'/, `${name} nao fixa BotID Basic`);
  assert.match(source, /bot_verification_unavailable/, `${name} nao fecha em falha do BotID`);
}

for (const pathname of ['/api/gerar-cena', '/api/traduzir-cena']) {
  assert.ok(client.includes(`path: '${pathname}'`), `cliente BotID nao protege ${pathname}`);
}
assert.match(client, /hostname === 'localhost'/, 'BotID deve ignorar o servidor local de desenvolvimento');
assert.match(client, /hostname === '127\.0\.0\.1'/, 'BotID deve ignorar o servidor local de QA');

const challengePrefix = '/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3';
assert.strictEqual(vercel.rewrites[0].source, `${challengePrefix}/a-4-a/c.js`);
assert.strictEqual(vercel.rewrites[1].source, `${challengePrefix}/:path*`);
assert.match(vercel.rewrites[0].destination, /bot-protection\/v1\/challenge$/);
assert.match(vercel.rewrites[1].destination, /bot-protection\/v1\/proxy\/:path\*$/);

assert.strictEqual(firewall.action, 'rules.insert');
assert.strictEqual(firewall.value.active, true);
const mitigate = firewall.value.action.mitigate;
assert.strictEqual(mitigate.action, 'rate_limit');
assert.deepStrictEqual(mitigate.rateLimit, {
  limit: 5,
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
assert.deepStrictEqual(protectedPaths, ['/api/gerar-cena', '/api/traduzir-cena']);

assert.ok(packageJson.dependencies && packageJson.dependencies.botid, 'botid ausente das dependencias');
assert.match(deploy, /dependencies:\s*\{\s*botid:\s*botidVersion\s*\}/, 'deploy nao empacota BotID');
assert.match(deploy, /automated_request_blocked/, 'deploy nao testa bloqueio de cliente nu');

console.log('Protecao Gemini OK: Origin fechado, BotID Basic e WAF distribuido para as duas rotas.');
