#!/usr/bin/env node

const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const { loadProjectEnv } = require('@expo/env');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');
const {
  anonymousSignupHeaders,
  extractAnonymousAccessToken,
  parseDeploymentOutput,
  validateActorQuotaBackend,
  validateLocalBuildEnvironment,
  validateProductionEnvironmentOutput,
} = require('./deploy-celeste-guards');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(ROOT, 'dist');
const PROD = 'https://celeste-jet-two.vercel.app';
const VERCEL_SCOPE = 'xlendas-projects';
const SERVER_CONSTANT_FILES = ['cloudConsent.js'];
const SERVER_UTIL_FILES = ['profileSemantics.js', 'selfDescription.js'];
const VERCEL_PROJECT = 'celeste';
const VERCEL_ORG_ID = 'team_cFfjLrJklzEd8k1IOcGcBjXv';
const VERCEL_PROJECT_ID = 'prj_MlPNJAFLd3AtJdafeqwcLzFs6xBA';
const NODE = process.execPath;
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EXPO_CLI = path.join(ROOT, 'node_modules', 'expo', 'bin', 'cli');
const UTF8 = 'utf8';
const VERCEL_CURL_STATUS_MARKER = '__CELESTE_VERCEL_CURL_STATUS__:';

const STATIC_GATES = [
  ['scripts/verificar-gemini-api.js', 'Teste local da API Gemini falhou'],
  ['scripts/verificar-provedores-texto.js', 'Providers Claude/OpenAI da Celeste falharam'],
  ['scripts/verificar-protecao-gemini.js', 'Protecao de custo Gemini falhou'],
  ['scripts/verificar-acesso-pago.js', 'Autorizacao e cota distribuida do Gemini falharam'],
  ['scripts/verificar-waf-vercel.js', 'WAF ativo da Vercel diverge da protecao versionada'],
  ['scripts/verificar-audio-gemini.js', 'Infraestrutura de voz Gemini falhou'],
  ['scripts/verificar-controles-reproducao-audio.js', 'Controles de progresso e velocidade do audio falharam'],
  ['scripts/verificar-visual-personalizado.js', 'Visual personalizado Gemini falhou'],
  ['scripts/verificar-sonho-gemini.js', 'Transformacao Gemini de sonho falhou'],
  ['scripts/verificar-base-conhecimento.js', 'Base de conhecimento da Celeste falhou'],
  ['scripts/verificar-supercerebro.js', 'Supercerebro e memoria cronologica da Celeste falharam'],
  ['scripts/verificar-proveniencia-cronologia.js', 'Proveniencia da memoria cronologica falhou'],
  ['scripts/verificar-esteira-deploy.js', 'Esteira segura de deploy falhou'],
  ['scripts/verificar-video-abertura.js', 'Teste do video de abertura falhou'],
  ['scripts/verificar-recuperacao-travamentos.js', 'Recuperacao de travamentos falhou'],
  ['scripts/verificar-privacidade-voz.js', 'Privacidade da voz pessoal falhou'],
  ['scripts/verificar-narradores.js', 'Selecao de narradores falhou'],
  ['scripts/verificar-haptica-digitacao.js', 'Teste de haptica/digitacao falhou'],
  ['scripts/verificar-perguntas-stella.js', 'Roteiro completo da Stella falhou'],
  ['scripts/verificar-cena-ancora.js', 'Personalizacao local da Cena-Ancora falhou'],
  ['scripts/verificar-espelho-vivo.js', 'Memoria local do Espelho Vivo falhou'],
  ['scripts/verificar-espelho-vivo-api.js', 'Contrato privado do Espelho Vivo falhou'],
  ['scripts/verificar-ritual-um-minuto.js', 'Ritual de Um Minuto falhou'],
  ['scripts/verificar-lembrete-ritual.js', 'Lembrete nativo do Ritual falhou'],
  ['scripts/verificar-ritual-matinal.js', 'Despertador e bonus de sonho falharam'],
  ['scripts/verificar-alarme-afirmacao.js', 'Contrato do alarme de afirmacao falhou'],
  ['scripts/verificar-tela-despertador.js', 'Tela e confirmacao do despertador falharam'],
  ['scripts/verificar-comunidade.js', 'Comunidade local e moderacao falharam'],
  ['scripts/verificar-experiencia-celeste.js', 'Integracao das novas telas falhou'],
  ['scripts/verificar-traducao-manifestacao.js', 'Traducao das manifestacoes pessoais falhou'],
  ['scripts/verificar-api-traducao.js', 'API privada de traducao das manifestacoes falhou'],
  ['scripts/verificar-rota-sugestao.js', 'Rota/reload das sugestoes falhou'],
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function run(command, args, { cwd = ROOT, env = process.env, failure = 'Comando falhou' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
    child.once('error', (error) => reject(new Error(`${failure}: ${error.message}`)));
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${failure} (${signal ? `sinal ${signal}` : `codigo ${code}`})`));
    });
  });
}

function runCapture(
  command,
  args,
  {
    cwd = ROOT,
    env = process.env,
    failure = 'Comando falhou',
    timeoutMs = 120_000,
    echoStderr = false,
  } = {}
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(() => reject(new Error(`${failure}: tempo esgotado`)));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > 2_000_000) child.kill('SIGTERM');
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (echoStderr) process.stderr.write(text);
      if (stderr.length > 2_000_000) child.kill('SIGTERM');
    });
    child.once('error', (error) => {
      finish(() => reject(new Error(`${failure}: ${error.message}`)));
    });
    child.once('exit', (code, signal) => {
      finish(() => {
        if (code === 0) resolve({ stdout, stderr });
        else {
          const reason = signal ? `sinal ${signal}` : `codigo ${code}`;
          reject(new Error(`${failure} (${reason}): ${stderr.trim().slice(0, 500)}`));
        }
      });
    });
  });
}

function resolveVercelCli() {
  const pathEntries = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, 'node_modules', 'vercel', 'dist', 'vc.js');
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('CLI da Vercel nao encontrada no PATH');
}

async function validateDeploymentEnvironment(vercelCli) {
  loadProjectEnv(ROOT, { mode: 'production', silent: true });
  validateLocalBuildEnvironment(process.env);
  const { stdout } = await runCapture(
    NODE,
    [
      vercelCli,
      'env',
      'ls',
      'production',
      '--format',
      'json',
      '--scope',
      VERCEL_SCOPE,
    ],
    {
      env: { ...process.env, CI: '1', NO_COLOR: '1' },
      failure: 'Nao foi possivel validar as variaveis de producao da Vercel',
      timeoutMs: 60_000,
    }
  );
  validateProductionEnvironmentOutput(stdout);
  const actorQuota = await validateActorQuotaBackend(
    process.env,
    (url, options) => fetchWithTimeout(url, options, 10000)
  );
  console.log(
    `Ambiente de deploy validado: backend separado e cota de ator schema ${actorQuota.schemaVersion}.`
  );
}

function runNode(script, options = {}) {
  return run(NODE, [script], options);
}

function validateVercelLink() {
  const linkPath = path.join(DIST, '.vercel', 'project.json');
  assert(fs.existsSync(linkPath), 'Vinculo local da Vercel nao foi criado');
  let link;
  try {
    link = JSON.parse(fs.readFileSync(linkPath, UTF8));
  } catch (error) {
    throw new Error(`Vinculo local da Vercel invalido: ${error.message}`);
  }
  assert(link.orgId === VERCEL_ORG_ID, `Equipe Vercel incorreta: ${link.orgId || 'ausente'}`);
  assert(link.projectId === VERCEL_PROJECT_ID, `Projeto Vercel incorreto: ${link.projectId || 'ausente'}`);
  assert(link.projectName === VERCEL_PROJECT, `Nome do projeto Vercel incorreto: ${link.projectName || 'ausente'}`);
}

function copyDeployInputs() {
  assert(fs.existsSync(DIST) && fs.statSync(DIST).isDirectory(), `Export ausente: ${DIST}`);
  fs.copyFileSync(path.join(ROOT, 'vercel.json'), path.join(DIST, 'vercel.json'));
  fs.copyFileSync(path.join(ROOT, '.vercelignore'), path.join(DIST, '.vercelignore'));

  const apiSource = path.join(ROOT, 'api');
  const apiTarget = path.join(DIST, 'api');
  fs.mkdirSync(apiTarget, { recursive: true });
  const apiFiles = fs.readdirSync(apiSource).filter((name) => name.endsWith('.js'));
  assert(apiFiles.length > 0, 'Nenhuma Vercel Function foi encontrada em api/');
  for (const name of apiFiles) fs.copyFileSync(path.join(apiSource, name), path.join(apiTarget, name));
  assert(fs.existsSync(path.join(apiTarget, 'gerar-cena.js')), 'Funcao Gemini ausente do pacote');
  assert(fs.existsSync(path.join(apiTarget, 'traduzir-cena.js')), 'Funcao de traducao ausente do pacote');
  assert(fs.existsSync(path.join(apiTarget, 'transformar-sonho.js')), 'Funcao de sonho ausente do pacote');
  assert(fs.existsSync(path.join(apiTarget, 'gerar-audio.js')), 'Funcao de voz Gemini ausente do pacote');
  assert(fs.existsSync(path.join(apiTarget, 'gerar-visual.js')), 'Funcao de visual Gemini ausente do pacote');

  const projectPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), UTF8));
  const botidVersion = projectPackage.dependencies && projectPackage.dependencies.botid;
  assert(typeof botidVersion === 'string' && botidVersion, 'Dependencia BotID ausente');
  fs.writeFileSync(
    path.join(DIST, 'package.json'),
    `${JSON.stringify({ private: true, dependencies: { botid: botidVersion } }, null, 2)}\n`,
    UTF8
  );

  const knowledgeSource = path.join(ROOT, 'knowledge', 'celeste-core-v2.json');
  const knowledgeTarget = path.join(DIST, 'knowledge');
  assert(fs.existsSync(knowledgeSource), 'Base de conhecimento versionada ausente');
  fs.mkdirSync(knowledgeTarget, { recursive: true });
  fs.copyFileSync(knowledgeSource, path.join(knowledgeTarget, 'celeste-core-v2.json'));

  const constantsSource = path.join(ROOT, 'constants');
  const constantsTarget = path.join(DIST, 'constants');
  fs.mkdirSync(constantsTarget, { recursive: true });
  for (const name of SERVER_CONSTANT_FILES) {
    const source = path.join(constantsSource, name);
    assert(fs.existsSync(source), `Constante do backend ausente: ${name}`);
    fs.copyFileSync(source, path.join(constantsTarget, name));
  }

  const utilsSource = path.join(ROOT, 'utils');
  const utilsTarget = path.join(DIST, 'utils');
  fs.mkdirSync(utilsTarget, { recursive: true });
  for (const name of SERVER_UTIL_FILES) {
    const source = path.join(utilsSource, name);
    assert(fs.existsSync(source), `Utilitario do backend ausente: ${name}`);
    fs.copyFileSync(source, path.join(utilsTarget, name));
  }
}

function patchExportHtml() {
  const indexPath = path.join(DIST, 'index.html');
  assert(fs.existsSync(indexPath), `index.html ausente em ${DIST}`);
  let html = fs.readFileSync(indexPath, UTF8);

  if (!html.includes('class="notranslate"')) {
    assert(html.includes('<html lang="en">'), 'Marcador <html lang="en"> ausente');
    html = html.replace('<html lang="en">', '<html lang="en" translate="no" class="notranslate">');
  }
  if (!html.includes('<meta name="google" content="notranslate" />')) {
    assert(html.includes('</title>'), 'Marcador </title> ausente');
    html = html.replace('</title>', '</title><meta name="google" content="notranslate" />');
  }
  if (!html.includes('viewport-fit=cover')) {
    const marker = 'initial-scale=1, shrink-to-fit=no';
    assert(html.includes(marker), 'Marcador de viewport do Expo ausente');
    html = html.replace(marker, `${marker}, viewport-fit=cover`);
  }
  if (!html.includes('id="celeste-dvh"')) {
    assert(html.includes('</head>'), 'Marcador </head> ausente para patch dvh');
    const dvh = '<style id="celeste-dvh">html,body,#root,#root>div{height:100dvh;max-height:100dvh;min-height:0;overflow:hidden}</style>';
    html = html.replace('</head>', `${dvh}</head>`);
  }
  if (!html.includes('id="celeste-splash"')) {
    const marker = '<div id="root">';
    assert(html.includes(marker), 'Marcador #root ausente para splash');
    const splash = '<div id="celeste-splash" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#759ACE;font-family:Georgia,serif;font-size:44px;color:#1C2E4F;letter-spacing:.01em">Celeste</div>';
    html = html.replace(marker, marker + splash);
  }
  if (!html.includes('property="og:title"')) {
    assert(html.includes('</head>'), 'Marcador </head> ausente para Open Graph');
    const tags = [
      '<meta property="og:title" content="Celeste &mdash; manifeste a vida que voc&#234; deseja" />',
      '<meta property="og:description" content="Afirma&#231;&#245;es e visualiza&#231;&#245;es guiadas, criadas a partir das suas pr&#243;prias respostas." />',
      '<meta property="og:type" content="website" />',
      `<meta property="og:url" content="${PROD}" />`,
      `<meta property="og:image" content="${PROD}/og.png" />`,
      '<meta name="twitter:card" content="summary_large_image" />',
      '<meta name="description" content="Afirma&#231;&#245;es e visualiza&#231;&#245;es guiadas, criadas a partir das suas pr&#243;prias respostas." />',
    ].join('');
    html = html.replace('</head>', `${tags}</head>`);
  }

  for (const marker of ['class="notranslate"', 'id="celeste-dvh"', 'viewport-fit=cover', 'id="celeste-splash"', 'property="og:title"']) {
    assert(html.includes(marker), `Patch HTML ausente: ${marker}`);
  }
  fs.writeFileSync(indexPath, html, UTF8);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseVercelCurlResponse(stdout, label) {
  const output = String(stdout || '');
  const markerIndex = output.lastIndexOf(VERCEL_CURL_STATUS_MARKER);
  assert(markerIndex >= 0, `${label} nao devolveu status HTTP`);
  const match = output
    .slice(markerIndex + VERCEL_CURL_STATUS_MARKER.length)
    .trim()
    .match(/^(\d{3})\b/);
  assert(match, `${label} devolveu status HTTP invalido`);
  return {
    status: Number(match[1]),
    body: output.slice(0, markerIndex).replace(/[\r\n]+$/, ''),
  };
}

async function vercelCurl(
  vercelCli,
  deployment,
  requestPath,
  env,
  { method = 'GET', headers = {}, body, discardBody = false } = {}
) {
  const deploymentRef = String(deployment.id || deployment.url || '').trim();
  assert(deploymentRef, 'Candidato sem ID ou URL para vercel curl');
  assert(
    typeof requestPath === 'string' && requestPath.startsWith('/') && !/[\r\n]/.test(requestPath),
    `Caminho invalido no candidato: ${requestPath}`
  );
  assert(/^[A-Z]+$/.test(method), `Metodo invalido no candidato: ${method}`);

  const curlArgs = [
    vercelCli,
    'curl',
    requestPath,
    '--deployment',
    deploymentRef,
    '--yes',
    '--scope',
    VERCEL_SCOPE,
    '--no-color',
    '--',
    '--silent',
    '--show-error',
    '--request',
    method,
  ];
  for (const [name, value] of Object.entries(headers)) {
    assert(/^[A-Za-z0-9-]+$/.test(name), `Header invalido no candidato: ${name}`);
    assert(typeof value === 'string' && !/[\r\n]/.test(value), `Valor de header invalido: ${name}`);
    curlArgs.push('--header', `${name}: ${value}`);
  }
  if (body !== undefined) {
    assert(typeof body === 'string', 'Corpo do candidato deve ser texto');
    curlArgs.push('--data-binary', body);
  }
  if (discardBody) {
    curlArgs.push('--output', process.platform === 'win32' ? 'NUL' : '/dev/null');
  }
  curlArgs.push('--write-out', `\n${VERCEL_CURL_STATUS_MARKER}%{http_code}\n`);

  const { stdout } = await runCapture(NODE, curlArgs, {
    cwd: DIST,
    env: { ...env, CI: '1', NO_COLOR: '1' },
    failure: `Vercel curl falhou em ${requestPath}`,
    timeoutMs: 45_000,
  });
  return parseVercelCurlResponse(stdout, `Vercel curl ${requestPath}`);
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, sleep(2500)]);
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
}

async function localPreflight() {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const server = spawn(NODE, [path.join(ROOT, 'scripts', 'serve-export.js'), DIST, String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
  });
  let serverOutput = '';
  let serverSpawnError = null;
  server.once('error', (error) => { serverSpawnError = error; });
  server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (serverSpawnError) throw new Error(`Servidor local nao iniciou: ${serverSpawnError.message}`);
      if (server.exitCode !== null) throw new Error(`Servidor local encerrou: ${serverOutput.slice(0, 800)}`);
      try {
        const response = await fetchWithTimeout(`${url}/__celeste_health`, {}, 1000);
        if (response.status === 200) { ready = true; break; }
      } catch (_error) {}
      await sleep(200);
    }
    assert(ready, 'Servidor do preflight local nao ficou pronto');
    const env = { ...process.env, TARGET_URL: url, E2E_GEMINI: '0' };
    await runNode('scripts/e2e-prod.js', { env, failure: 'E2E local bloqueou o deploy antes da publicacao' });
    await runNode('scripts/qa-novos-recursos.js', { env, failure: 'QA responsiva local bloqueou o deploy antes da publicacao' });
  } finally {
    await stopChild(server);
  }
}

function findFirst(root, predicate) {
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(full);
      else if (predicate(entry.name, full)) return full;
    }
  }
  return null;
}

async function waitForLiveBundle(baseUrl, localBundle) {
  let liveHtml = '';
  let lastError = null;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/?celeste_deploy=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      liveHtml = await response.text();
      const liveBundle = (liveHtml.match(/AppEntry-[a-f0-9]+\.js/) || [])[0] || '';
      if (response.status === 200 && liveBundle === localBundle) return { liveHtml, liveBundle };
    } catch (error) {
      lastError = error;
    }
    if (attempt < 12) await sleep(3000);
  }
  const liveBundle = (liveHtml.match(/AppEntry-[a-f0-9]+\.js/) || [])[0] || '';
  throw new Error(`Bundle ao vivo divergente: local=${localBundle} live=${liveBundle}; ${lastError ? lastError.message : 'sem erro de rede'}`);
}

async function liveAssetChecks(baseUrl = PROD) {
  const bundles = fs.readdirSync(path.join(DIST, '_expo', 'static', 'js', 'web'))
    .filter((name) => /^AppEntry-[a-f0-9]+\.js$/.test(name));
  assert(bundles.length === 1, `Esperado um bundle local; encontrados ${bundles.length}`);
  const localBundle = bundles[0];
  const [{ liveBundle }, deep] = await Promise.all([
    waitForLiveBundle(baseUrl, localBundle),
    fetchWithTimeout(`${baseUrl}/rota-interna-f5?celeste_deploy=${Date.now()}`, { cache: 'no-store' }),
  ]);
  assert(deep.status === 200, `Rota profunda em producao retornou ${deep.status}`);

  const font = findFirst(path.join(DIST, 'assets'), (name) => /^Ionicons\..*\.ttf$/i.test(name));
  assert(font, 'Fonte Ionicons ausente do pacote');
  const fontPath = path.relative(DIST, font).split(path.sep).join('/');
  const [fontResponse, videoResponse] = await Promise.all([
    fetchWithTimeout(`${baseUrl}/${fontPath}?verify=${Date.now()}`, { cache: 'no-store' }),
    fetchWithTimeout(`${baseUrl}/video/celeste-abertura.mp4`, {
      headers: { Range: 'bytes=0-1023' },
      cache: 'no-store',
    }),
  ]);
  const fontType = fontResponse.headers.get('content-type') || '';
  const videoType = videoResponse.headers.get('content-type') || '';
  assert(fontResponse.ok && !/html/i.test(fontType), `Fonte invalida em producao: ${fontType}`);
  const liveFont = Buffer.from(await fontResponse.arrayBuffer());
  const localFont = fs.readFileSync(font);
  assert(
    crypto.createHash('sha256').update(liveFont).digest('hex') ===
      crypto.createHash('sha256').update(localFont).digest('hex'),
    'Conteudo da fonte ao vivo diverge do subset validado'
  );
  assert(videoResponse.status === 206 && /^video\/mp4/i.test(videoType), `Video sem MP4/range: ${videoResponse.status} ${videoType}`);
  console.log(`Verificado ao vivo: bundle=${liveBundle}, fonte=${fontType}, video=${videoType}/206`);
}

async function createAnonymousSmokeAccessToken() {
  const supabaseUrl = String(process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const publicKey = String(
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
      ''
  ).trim();
  const response = await fetchWithTimeout(
    `${supabaseUrl}/auth/v1/signup`,
    {
      method: 'POST',
      headers: anonymousSignupHeaders(publicKey),
      body: JSON.stringify({
        data: {},
        gotrue_meta_security: { captcha_token: null },
      }),
    },
    15_000
  );
  if (!response.ok) {
    throw new Error(`Supabase nao criou sessao anonima para o smoke: HTTP ${response.status}`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    throw new Error('Supabase devolveu uma sessao anonima invalida');
  }
  return extractAnonymousAccessToken(payload);
}

async function liveGeminiChecks(
  baseUrl = PROD,
  { positive = true, requestOrigin = baseUrl } = {}
) {
  for (const pathname of [
    '/api/gerar-cena',
    '/api/traduzir-cena',
    '/api/transformar-sonho',
    '/api/gerar-audio',
    '/api/gerar-visual',
  ]) {
    const blocked = await fetchWithTimeout(`${baseUrl}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: requestOrigin },
      body: '{}',
    }, 25000);
    const blockedPayload = await blocked.json().catch(() => ({}));
    assert(
      blocked.status === 403 && blockedPayload.error === 'automated_request_blocked',
      `Cliente sem BotID passou em ${pathname}: HTTP ${blocked.status} ${JSON.stringify(blockedPayload)}`
    );
  }

  const forgedNative = await fetchWithTimeout(`${baseUrl}/api/gerar-cena`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer forged-native-session',
      'Content-Type': 'application/json',
      'X-Celeste-Client': 'ios',
      'X-Celeste-Request-Id': 'celeste-forged-native-live-0001',
    },
    body: '{}',
  }, 25000);
  const forgedNativePayload = await forgedNative.json().catch(() => ({}));
  assert(
    forgedNative.status === 403 && forgedNativePayload.error === 'origin_not_allowed',
    `Claim nativo sem atestacao passou: HTTP ${forgedNative.status} ${JSON.stringify(forgedNativePayload)}`
  );

  if (!positive) {
    console.log(`Protecoes BotID e nativa validadas no candidato ${baseUrl}`);
    return;
  }

  const accessToken = await createAnonymousSmokeAccessToken();

  const generationBody = {
    desire: 'uma rotina criativa com calma',
    category: 'Career',
    lang: 'pt',
    profile: {},
    cloudConsent: true,
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    adultConfirmed: true,
  };
  const translationBody = {
    sourceLang: 'pt',
    targetLang: 'en',
    scene: {
      title: 'A manha da caneca azul 27',
      intention: 'Viver uma manha calma preservando a caneca azul numero 27.',
      affirmation: 'Eu escolho cuidar da minha rotina com calma e presenca.',
      story: 'A caneca azul com o numero 27 fica ao lado da janela enquanto eu observo a luz da manha.',
      anchorIdentity: 'Eu protejo minha atencao e honro os detalhes importantes.',
      anchorStep: 'Quando eu acordar, entao vou respirar por dois minutos.',
      personalizedWith: ['caneca azul numero 27'],
    },
    cloudConsent: true,
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    adultConfirmed: true,
  };
  const visualBody = {
    desire: 'uma cabana tranquila perto da natureza',
    category: 'Peace',
    lang: 'pt',
    profile: {
      dreamLocation: 'um vale verde e silencioso',
      dreamHome: 'uma cabana de madeira com varanda',
      work: 'escrever com calma',
      whyMatters: 'ter presenca e liberdade para viver o que importa',
    },
    visualMood: 'grounded',
    cloudConsent: true,
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    adultConfirmed: true,
  };

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    // BotID deve reprovar navegadores headless. O smoke usa uma janela real,
    // posicionada fora da tela, para validar o mesmo caminho de uma pessoa.
    headless: false,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-position=-32000,-32000',
      '--window-size=420,900',
      '--lang=pt-BR',
    ],
    defaultViewport: { width: 420, height: 900 },
  });
  let results;
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      } catch (_error) {}
    });
    await page.goto(`${baseUrl}/?botid_check=${Date.now()}`, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    results = await page.evaluate(async ({
      accessToken: sessionToken,
      generationBody: generationInput,
      translationBody: translationInput,
      visualBody: visualInput,
    }) => {
      const requestId = () => {
        const random = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : Math.random().toString(36).slice(2);
        return `celeste-live-${Date.now().toString(36)}-${random}`.slice(0, 90);
      };
      const post = async (pathname, body) => {
        const response = await fetch(pathname, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
            'Content-Type': 'application/json',
            'X-Celeste-Client': 'web',
            'X-Celeste-Request-Id': requestId(),
          },
          cache: 'no-store',
          body: JSON.stringify(body),
        });
        const text = await response.text();
        let payload;
        try { payload = JSON.parse(text); } catch (_error) { payload = { invalidJson: text.slice(0, 180) }; }
        return { status: response.status, payload };
      };
      const postGeneration = async () => {
        let result;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          result = await post('/api/gerar-cena', generationInput);
          const transientInvalid =
            result.status === 502 &&
            ['invalid_generation', 'upstream_error'].includes(result.payload?.error);
          if (!transientInvalid) return result;
          await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        }
        return result;
      };
      const generation = await postGeneration();
      const translation = await post('/api/traduzir-cena', translationInput);
      const visualResult = await post('/api/gerar-visual', visualInput);
      const visualData = visualResult.payload?.image?.data;
      const visual = {
        status: visualResult.status,
        payload: {
          image: visualResult.payload?.image
            ? {
                mimeType: visualResult.payload.image.mimeType,
                aspectRatio: visualResult.payload.image.aspectRatio,
                imageSize: visualResult.payload.image.imageSize,
                bytes: visualResult.payload.image.bytes,
                dataLength: typeof visualData === 'string' ? visualData.length : 0,
                jpegPrefix: typeof visualData === 'string' ? visualData.slice(0, 4) : '',
              }
            : undefined,
          generation: visualResult.payload?.generation,
          error: visualResult.payload?.error,
        },
      };
      return { generation, translation, visual };
    }, { accessToken, generationBody, translationBody, visualBody });
  } finally {
    await browser.close();
  }

  assert(results.generation.status === 200, `Celeste AI/BotID ao vivo falhou: ${JSON.stringify(results.generation)}`);
  const generation = results.generation.payload;
  assert(
    generation.scene && generation.generation?.source === 'celeste-ai',
    'Celeste AI nao devolveu scene/source=celeste-ai'
  );
  assert(
    generation.generation?.provider === 'anthropic',
    `Celeste AI nao confirmou Anthropic como provider primario: ${generation.generation?.provider || 'ausente'}`
  );
  assert(generation.generation.promptVersion === 'celeste-scene-v7', 'Celeste AI nao confirmou o prompt de cena esperado');
  assert(generation.generation.knowledgeVersion === 'celeste-knowledge-v2', 'Celeste AI nao confirmou a base esperada');

  assert(results.translation.status === 200, `Traducao/BotID ao vivo falhou: ${JSON.stringify(results.translation)}`);
  const translation = results.translation.payload;
  const translatedText = Object.values(translation.scene || {}).flat().join(' ');
  assert(translation.generation?.source === 'gemini-translation', 'Traducao nao confirmou source=gemini-translation');
  assert(/blue mug/i.test(translatedText) && /27/.test(translatedText), 'Traducao perdeu o detalhe sentinela blue mug 27');
  assert(/\b(I|my|mine)\b/i.test(translation.scene.affirmation || ''), 'Afirmacao traduzida nao esta em primeira pessoa');
  assert(results.visual.status === 200, `Visual/BotID ao vivo falhou: ${JSON.stringify(results.visual)}`);
  const visual = results.visual.payload;
  assert(
    visual.image?.mimeType === 'image/jpeg' &&
      visual.image.aspectRatio === '4:5' &&
      visual.image.imageSize === '1K' &&
      visual.image.dataLength > 1000 &&
      visual.image.jpegPrefix === '/9j/',
    `Visual ao vivo nao devolveu JPEG 4:5 valido: ${JSON.stringify(visual)}`
  );
  assert(
    visual.generation?.source === 'gemini-image',
    'Visual ao vivo nao confirmou source=gemini-image'
  );
  console.log(`BotID bloqueou cliente nu; Celeste AI ${generation.generation.provider}/${generation.generation.model}, traducao ${translation.generation.model} e visual ${visual.generation.model} passaram no navegador real`);
}

async function candidateChecks(vercelCli, candidate, env) {
  const bundles = fs.readdirSync(path.join(DIST, '_expo', 'static', 'js', 'web'))
    .filter((name) => /^AppEntry-[a-f0-9]+\.js$/.test(name));
  assert(bundles.length === 1, `Esperado um bundle local; encontrados ${bundles.length}`);
  const localBundle = bundles[0];
  const nonce = Date.now().toString(36);

  const root = await vercelCurl(
    vercelCli,
    candidate,
    `/?celeste_candidate=${nonce}`,
    env,
    { headers: { 'Cache-Control': 'no-cache' } }
  );
  assert(root.status === 200, `Raiz do candidato retornou HTTP ${root.status}`);
  const candidateBundle = (root.body.match(/AppEntry-[a-f0-9]+\.js/) || [])[0] || '';
  assert(
    candidateBundle === localBundle,
    `Bundle do candidato diverge: local=${localBundle} candidato=${candidateBundle}`
  );

  const deep = await vercelCurl(
    vercelCli,
    candidate,
    `/rota-interna-f5?celeste_candidate=${nonce}`,
    env,
    { headers: { 'Cache-Control': 'no-cache' } }
  );
  assert(deep.status === 200, `Rota profunda do candidato retornou HTTP ${deep.status}`);
  assert(deep.body.includes(localBundle), 'Rota profunda do candidato nao carregou o bundle validado');

  const bundleAsset = await vercelCurl(
    vercelCli,
    candidate,
    `/_expo/static/js/web/${localBundle}`,
    env,
    { discardBody: true }
  );
  assert(bundleAsset.status === 200, `Asset principal do candidato retornou HTTP ${bundleAsset.status}`);

  const candidateApiProbes = {
    '/api/gerar-cena': { status: 403, error: 'cloud_consent_required' },
    '/api/traduzir-cena': { status: 403, error: 'cloud_consent_required' },
    '/api/transformar-sonho': { status: 403, error: 'cloud_consent_required' },
    '/api/gerar-audio': { status: 400, error: 'mode_invalid' },
    '/api/gerar-visual': { status: 403, error: 'cloud_consent_required' },
  };
  for (const [pathname, expected] of Object.entries(candidateApiProbes)) {
    const blocked = await vercelCurl(vercelCli, candidate, pathname, env, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: PROD,
      },
      body: '{}',
    });
    let payload;
    try {
      payload = JSON.parse(blocked.body);
    } catch (_error) {
      throw new Error(`${pathname} no candidato devolveu JSON invalido`);
    }
    // `vercel curl` autentica o acesso ao deployment protegido e pode receber
    // o selo humano do BotID. Nesse caso a sonda ainda deve parar na validacao
    // anterior a cota/provedor. O fetch publico sem BotID e testado novamente
    // apos a promocao, com rollback automatico se nao fechar em 403.
    const botBlocked = blocked.status === 403 && payload.error === 'automated_request_blocked';
    const inputBlocked = blocked.status === expected.status && payload.error === expected.error;
    assert(
      botBlocked || inputBlocked,
      `API do candidato nao falhou fechada em ${pathname}: HTTP ${blocked.status} ${payload.error || 'sem_erro'}`
    );
  }

  console.log(`Candidato validado via Vercel CLI: bundle=${localBundle}, SPA e cinco APIs sem gasto`);
}

async function productionChecks(
  baseUrl = PROD,
  { positiveGemini = true } = {}
) {
  await liveAssetChecks(baseUrl);
  await liveGeminiChecks(baseUrl, {
    positive: positiveGemini,
    requestOrigin: positiveGemini ? baseUrl : PROD,
  });

  const prodEnv = { ...process.env, TARGET_URL: baseUrl };
  await runNode('scripts/verificar-paywall.js', { env: prodEnv, failure: 'Entrada do app falhou em tela pequena' });
  await runNode('scripts/verificar-mascote.js', { env: prodEnv, failure: 'Mascote ausente ou quebrado' });
  await runNode('scripts/verificar-recuperacao-browser.js', { env: prodEnv, failure: 'Recuperacao de armazenamento falhou no navegador' });
  await runNode('scripts/e2e-prod.js', {
    env: { ...prodEnv, E2E_GEMINI: positiveGemini ? '1' : '0' },
    failure: 'Portao E2E/Gemini falhou',
  });
  await runNode('scripts/verify-app-pt.js', { env: prodEnv, failure: 'Portao do app interno falhou' });
  await runNode('scripts/auditoria-idiomas.js', { env: prodEnv, failure: 'Vazamento de idioma detectado' });
  await runNode('scripts/qa-novos-recursos.js', { env: prodEnv, failure: 'Telas novas falharam em producao' });
  await runNode('scripts/medir-performance.js', { env: prodEnv, failure: 'Performance 4G ficou abaixo do portao' });
}

async function inspectDeployment(vercelCli, reference, env) {
  const { stdout } = await runCapture(
    NODE,
    [vercelCli, 'inspect', reference, '--format', 'json', '--scope', VERCEL_SCOPE],
    {
      cwd: DIST,
      env,
      failure: `Nao foi possivel inspecionar o deployment ${reference}`,
      timeoutMs: 90_000,
    }
  );
  return parseDeploymentOutput(stdout, 'Vercel inspect');
}

async function createProductionCandidate(vercelCli, env) {
  const { stdout } = await runCapture(
    NODE,
    [
      vercelCli,
      'deploy',
      '--prod',
      '--skip-domain',
      '--yes',
      '--format',
      'json',
      '--scope',
      VERCEL_SCOPE,
    ],
    {
      cwd: DIST,
      env,
      failure: 'Vercel nao criou o candidato de producao',
      timeoutMs: 10 * 60_000,
      echoStderr: true,
    }
  );
  return parseDeploymentOutput(stdout, 'Vercel deploy');
}

async function promoteDeployment(vercelCli, deployment, env, failure) {
  await run(
    NODE,
    [
      vercelCli,
      'promote',
      deployment.url,
      '--yes',
      '--timeout',
      '5m',
      '--scope',
      VERCEL_SCOPE,
    ],
    { cwd: DIST, env, failure }
  );
}

async function main() {
  const currentNodeOptions = String(process.env.NODE_OPTIONS || '');
  if (process.platform === 'win32' && !/(^|\s)--use-system-ca(\s|$)/.test(currentNodeOptions)) {
    await run(NODE, [__filename, ...process.argv.slice(2)], {
      env: {
        ...process.env,
        NODE_OPTIONS: [currentNodeOptions, '--use-system-ca'].filter(Boolean).join(' '),
      },
      failure: 'Nao foi possivel reiniciar o deploy com os certificados do Windows',
    });
    return;
  }
  assert(path.dirname(DIST) === ROOT && path.basename(DIST) === 'dist', `Caminho dist inseguro: ${DIST}`);
  process.chdir(ROOT);

  const vercelCli = resolveVercelCli();
  await validateDeploymentEnvironment(vercelCli);

  if (process.argv.includes('--validate-configuration')) {
    console.log('Configuracao local e backend Supabase prontas para o deploy.');
    return;
  }

  if (process.argv.includes('--validate-production')) {
    await productionChecks(PROD);
    console.log(`Producao revalidada sem nova publicacao: ${PROD}`);
    return;
  }

  for (const [script, failure] of STATIC_GATES) await runNode(script, { failure });
  await run(NODE, [EXPO_CLI, 'export', '--platform', 'web', '--output-dir', DIST, '--clear'], {
    failure: 'Export web do Expo falhou',
  });
  await runNode('scripts/enxugar-fontes.js', { failure: 'Subset das fontes falhou' });
  await runNode('scripts/verificar-icones.js', { failure: 'Subset de icones quebrou glifos usados pelo app' });
  copyDeployInputs();
  patchExportHtml();
  await runNode('scripts/i18n-parity.js', { failure: 'Paridade EN/PT reprovou o deploy' });
  await localPreflight();

  const deployEnv = {
    ...process.env,
    NODE_OPTIONS: currentNodeOptions,
  };
  await run(NODE, [vercelCli, 'link', '--yes', '--project', VERCEL_PROJECT, '--scope', VERCEL_SCOPE], { cwd: DIST, env: deployEnv, failure: 'Vercel link falhou' });
  validateVercelLink();
  const previousProduction = await inspectDeployment(vercelCli, PROD, deployEnv);
  const candidate = await createProductionCandidate(vercelCli, deployEnv);
  assert(candidate.id !== previousProduction.id, 'Vercel nao criou um novo candidato de producao');
  await candidateChecks(vercelCli, candidate, deployEnv);
  await promoteDeployment(
    vercelCli,
    candidate,
    deployEnv,
    'Promocao do candidato validado falhou'
  );
  productionPublished = true;
  try {
    await productionChecks(PROD);
  } catch (error) {
    try {
      await promoteDeployment(
        vercelCli,
        previousProduction,
        deployEnv,
        'Rollback automatico para o deployment anterior falhou'
      );
      productionPublished = false;
      productionRolledBack = true;
    } catch (rollbackError) {
      throw new Error(
        `Validacao pos-promocao falhou: ${error.message}. ROLLBACK TAMBEM FALHOU: ${rollbackError.message}`
      );
    }
    throw new Error(`Validacao pos-promocao falhou e o rollback foi concluido: ${error.message}`);
  }
  console.log(`Deploy concluido e todos os portoes foram aprovados: ${PROD}`);
}

let productionPublished = false;
let productionRolledBack = false;
main().catch((error) => {
  const status = productionRolledBack
    ? 'CANDIDATO REPROVADO APOS PROMOCAO; PRODUCAO ANTERIOR RESTAURADA'
    : productionPublished
    ? 'PUBLICACAO CONCLUIDA, MAS A VALIDACAO POS-DEPLOY FALHOU'
    : 'DEPLOY BLOQUEADO';
  console.error(`${status}: ${error.stack || error.message || error}`);
  process.exitCode = 1;
});
