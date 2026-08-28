#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const {
  anonymousSignupHeaders,
  extractAnonymousAccessToken,
  parseDeploymentOutput,
  validateLocalBuildEnvironment,
  validateProductionEnvironmentOutput,
} = require('./deploy-celeste-guards');

const root = path.resolve(__dirname, '..');
const deploySource = fs.readFileSync(path.join(__dirname, 'deploy-celeste.js'), 'utf8');

function publicEnv(overrides = {}) {
  return {
    EXPO_PUBLIC_SUPABASE_URL: 'https://celeste-test.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(40)}`,
    ...overrides,
  };
}

function productionEnv(overrides = {}) {
  return JSON.stringify({
    envs: [
      {
        key: 'EXPO_PUBLIC_SUPABASE_URL',
        type: 'encrypted',
        target: ['production'],
      },
      {
        key: 'SUPABASE_PUBLISHABLE_KEY',
        type: 'encrypted',
        target: ['production'],
      },
      {
        key: 'SUPABASE_SECRET_KEY',
        type: 'sensitive',
        target: ['production'],
      },
      ...[
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_PAID_DATA_TERMS_ACCEPTED',
        'ANTHROPIC_TEXT_MODEL',
        'ANTHROPIC_TEXT_EFFORT',
        'CELESTE_TEXT_PRIMARY',
      ].map((key) => ({ key, type: 'sensitive', target: ['production'] })),
    ],
    ...overrides,
  });
}

test('deploy environment fails closed without exposing values', () => {
  assert.throws(
    () => validateLocalBuildEnvironment({}),
    /EXPO_PUBLIC_SUPABASE_URL.*EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ou EXPO_PUBLIC_SUPABASE_ANON_KEY/
  );
  assert.strictEqual(validateLocalBuildEnvironment(publicEnv()), true);
  assert.strictEqual(validateLocalBuildEnvironment({
    EXPO_PUBLIC_SUPABASE_URL: 'https://celeste-legacy.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: `legacy-anon-${'d'.repeat(40)}`,
  }), true);
  const publishableHeaders = anonymousSignupHeaders(`sb_publishable_${'e'.repeat(40)}`);
  assert.strictEqual(publishableHeaders.apikey, `sb_publishable_${'e'.repeat(40)}`);
  assert.strictEqual(
    publishableHeaders.Authorization,
    undefined,
    'publishable key opaca nao pode ser enviada como Bearer'
  );
  const legacyAnonKey = `eyJ.${'f'.repeat(40)}.${'a'.repeat(24)}`;
  assert.strictEqual(
    anonymousSignupHeaders(legacyAnonKey).Authorization,
    `Bearer ${legacyAnonKey}`,
    'anon JWT legado precisa continuar no Bearer'
  );
  assert.throws(
    () => validateLocalBuildEnvironment(publicEnv({
      EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: 'must-never-enter-the-bundle',
    })),
    /proibida no bundle/
  );
  assert.throws(
    () => validateLocalBuildEnvironment(publicEnv({
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: `sb_secret_${'b'.repeat(40)}`,
    })),
    /chave secreta/
  );

  assert.strictEqual(validateProductionEnvironmentOutput(productionEnv()), true);
  assert.strictEqual(validateProductionEnvironmentOutput(JSON.stringify({
    envs: [
      { key: 'CELESTE_SUPABASE_URL', type: 'encrypted', target: ['production'] },
      { key: 'CELESTE_SUPABASE_ANON_KEY', type: 'encrypted', target: ['production'] },
      { key: 'CELESTE_SUPABASE_SERVICE_ROLE_KEY', type: 'sensitive', target: ['production'] },
      ...[
        'ANTHROPIC_API_KEY',
        'ANTHROPIC_PAID_DATA_TERMS_ACCEPTED',
        'ANTHROPIC_TEXT_MODEL',
        'ANTHROPIC_TEXT_EFFORT',
        'CELESTE_TEXT_PRIMARY',
      ].map((key) => ({ key, type: 'sensitive', target: ['production'] })),
    ],
  })), true);
  assert.throws(
    () => validateProductionEnvironmentOutput(JSON.stringify({ envs: [] })),
    /CELESTE_SUPABASE_URL ou SUPABASE_URL ou EXPO_PUBLIC_SUPABASE_URL/
  );
  assert.throws(
    () => validateProductionEnvironmentOutput(JSON.stringify({
      envs: JSON.parse(productionEnv()).envs.filter((item) => item.key !== 'ANTHROPIC_API_KEY'),
    })),
    /Variaveis Anthropic.*ANTHROPIC_API_KEY/
  );
  assert.throws(
    () => validateProductionEnvironmentOutput(productionEnv({
      envs: JSON.parse(productionEnv()).envs.map((item) => (
        item.key === 'SUPABASE_SECRET_KEY'
          ? { ...item, type: 'encrypted' }
          : item
      )),
    })),
    /deve ser Sensitive/
  );
});

test('deployment and anonymous session parsers keep credentials out of logs', () => {
  assert.deepStrictEqual(
    parseDeploymentOutput(JSON.stringify({
      id: 'dpl_candidate123',
      url: 'celeste-candidate.vercel.app',
    })),
    {
      id: 'dpl_candidate123',
      url: 'https://celeste-candidate.vercel.app',
    }
  );
  assert.throws(
    () => parseDeploymentOutput(JSON.stringify({ url: 'http://celeste-candidate.vercel.app' })),
    /URL de deployment segura/
  );
  assert.throws(
    () => parseDeploymentOutput(JSON.stringify({ url: 'https://example.com' })),
    /URL de deployment segura/
  );
  const token = `eyJ.${'c'.repeat(80)}.signature`;
  assert.strictEqual(extractAnonymousAccessToken({ access_token: token }), token);
  assert.throws(() => extractAnonymousAccessToken({}), /sessao anonima valida/);
});

test('authoritative deploy pipeline gates, authenticates, validates and promotes', () => {
  for (const script of [
    'verificar-controles-reproducao-audio.js',
    'verificar-proveniencia-cronologia.js',
    'verificar-esteira-deploy.js',
  ]) {
    assert.ok(deploySource.includes(script), `gate obrigatorio ausente: ${script}`);
  }

  const main = deploySource.slice(deploySource.indexOf('async function main()'));
  assert.ok(
    main.indexOf('await validateDeploymentEnvironment(vercelCli)') <
      main.indexOf('for (const [script, failure] of STATIC_GATES)'),
    'variaveis devem falhar antes dos gates e do export'
  );
  assert.ok(
    main.indexOf('for (const [script, failure] of STATIC_GATES)') <
      main.indexOf("'export', '--platform', 'web'"),
    'gates devem rodar antes do export'
  );
  assert.match(
    deploySource,
    /scripts\/verificar-provedores-texto\.js/,
    'providers de texto devem bloquear o deploy quando o contrato falhar'
  );
  assert.match(deploySource, /env',\s*'ls',\s*'production',\s*'--format',\s*'json'/);
  assert.match(deploySource, /\/auth\/v1\/signup/);
  assert.match(deploySource, /headers: anonymousSignupHeaders\(publicKey\)/);
  assert.match(
    deploySource,
    /process\.env\.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY \|\|\s*process\.env\.EXPO_PUBLIC_SUPABASE_ANON_KEY/
  );
  assert.match(deploySource, /Authorization:\s*`Bearer \$\{sessionToken\}`/);
  assert.match(
    deploySource,
    /generation\.generation\?\.provider === 'anthropic'/,
    'smoke de producao precisa confirmar Claude como escritor principal'
  );
  assert.match(deploySource, /'X-Celeste-Request-Id': requestId\(\)/);
  assert.ok(!/console\.(?:log|error)\([^\n]*accessToken/.test(deploySource));
  assert.match(
    deploySource,
    /SERVER_UTIL_FILES = \['profileSemantics\.js', 'selfDescription\.js'\]/,
    'utilitarios usados pelas funcoes precisam entrar no pacote da Vercel'
  );
  assert.match(deploySource, /fs\.copyFileSync\(source, path\.join\(utilsTarget, name\)\)/);

  const candidateIndex = main.indexOf('const candidate = await createProductionCandidate');
  const candidateCheckIndex = main.indexOf('await candidateChecks(vercelCli, candidate, deployEnv)');
  const promoteIndex = main.indexOf('await promoteDeployment(', candidateCheckIndex);
  const liveCheckIndex = main.indexOf('await productionChecks(PROD)', promoteIndex);
  const localPreflightIndex = main.indexOf('await localPreflight()');
  assert.ok(localPreflightIndex >= 0 && localPreflightIndex < candidateIndex);
  assert.ok(candidateIndex >= 0 && candidateIndex < candidateCheckIndex);
  assert.ok(candidateCheckIndex < promoteIndex && promoteIndex < liveCheckIndex);
  assert.doesNotMatch(
    main,
    /productionChecks\(candidate\.url/,
    'deployment protegido nao pode usar fetch/Puppeteer cru antes da promocao'
  );

  const vercelCurlSource = deploySource.slice(
    deploySource.indexOf('async function vercelCurl('),
    deploySource.indexOf('async function stopChild(')
  );
  assert.match(vercelCurlSource, /'curl'/);
  assert.match(vercelCurlSource, /'--deployment'/);
  assert.match(vercelCurlSource, /runCapture\(NODE, curlArgs/);
  assert.doesNotMatch(vercelCurlSource, /fetch(?:WithTimeout)?\s*\(|puppeteer/);

  const candidateSource = deploySource.slice(
    deploySource.indexOf('async function candidateChecks('),
    deploySource.indexOf('async function productionChecks(')
  );
  assert.match(candidateSource, /await vercelCurl\(/);
  assert.match(candidateSource, /\/rota-interna-f5/);
  assert.match(candidateSource, /\/_expo\/static\/js\/web\//);
  for (const pathname of [
    '/api/gerar-cena',
    '/api/traduzir-cena',
    '/api/transformar-sonho',
    '/api/gerar-audio',
    '/api/gerar-visual',
  ]) {
    assert.ok(candidateSource.includes(`'${pathname}'`), `API ausente do candidato: ${pathname}`);
  }
  assert.match(candidateSource, /const candidateApiProbes = \{/);
  assert.match(
    candidateSource,
    /for \(const \[pathname, expected\] of Object\.entries\(candidateApiProbes\)\)/
  );
  assert.match(candidateSource, /blocked\.status === expected\.status/);
  assert.match(candidateSource, /automated_request_blocked/);
  assert.doesNotMatch(
    candidateSource,
    /fetch(?:WithTimeout)?\s*\(|puppeteer|productionChecks\s*\(|liveAssetChecks\s*\(|liveGeminiChecks\s*\(/
  );
  assert.match(deploySource, /'--prod',\s*'--skip-domain'/);
  assert.match(deploySource, /Rollback automatico para o deployment anterior falhou/);
});

test.after(() => {
  process.stdout.write(`Esteira Celeste segura: env, sessao anonima, candidato e rollback validados em ${root}.\n`);
});
