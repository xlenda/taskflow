#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROJECT_ID = 'prj_MlPNJAFLd3AtJdafeqwcLzFs6xBA';
const TEAM_ID = 'team_cFfjLrJklzEd8k1IOcGcBjXv';
const RULE_NAME = 'Celeste Gemini API rate limit';
const EXPECTED_PATHS = [
  '/api/gerar-audio',
  '/api/gerar-cena',
  '/api/gerar-visual',
  '/api/traduzir-cena',
  '/api/transformar-sonho',
];

function resolveVercelCli() {
  const entries = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const entry of entries) {
    const candidate = path.join(entry, 'node_modules', 'vercel', 'dist', 'vc.js');
    if (fs.existsSync(candidate)) return candidate;
  }
  const knownInstall = 'D:\\DevTools\\npm-global\\node_modules\\vercel\\dist\\vc.js';
  if (fs.existsSync(knownInstall)) return knownInstall;
  throw new Error('CLI da Vercel nao encontrada para validar o WAF ativo');
}

function parseJsonOutput(output) {
  const text = String(output || '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Vercel nao retornou JSON do firewall');
  return JSON.parse(text.slice(start, end + 1));
}

function runVercelApi(cli, endpoint, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'api', '--method', 'GET', endpoint], {
      cwd: ROOT,
      env,
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Tempo esgotado ao consultar o WAF ativo da Vercel'));
    }, 45_000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (status) => {
      clearTimeout(timer);
      if (status !== 0) {
        reject(new Error(`Nao foi possivel ler o WAF ativo: ${stderr.trim().slice(0, 300)}`));
        return;
      }
      resolve(stdout);
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readWafWithRetry(cli, endpoint, env) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await runVercelApi(cli, endpoint, env);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(attempt * 1500);
    }
  }
  throw new Error(`Falha ao consultar o WAF ativo apÃ³s 3 tentativas: ${lastError?.message || 'erro desconhecido'}`);
}

async function main() {
  const cli = resolveVercelCli();
  const endpoint =
    `/v1/security/firewall/config?projectId=${PROJECT_ID}&teamId=${TEAM_ID}`;
  const currentNodeOptions = String(process.env.NODE_OPTIONS || '');
  const nodeOptions = /(^|\s)--use-system-ca(\s|$)/.test(currentNodeOptions)
    ? currentNodeOptions
    : [currentNodeOptions, '--use-system-ca'].filter(Boolean).join(' ');
  const output = await readWafWithRetry(cli, endpoint, {
    ...process.env,
    CI: '1',
    NO_COLOR: '1',
    NODE_OPTIONS: nodeOptions,
  });
  const config = parseJsonOutput(output);
  const rules = config && config.active && Array.isArray(config.active.rules)
    ? config.active.rules
    : [];
  const matches = rules.filter((rule) => rule && rule.name === RULE_NAME);
  assert.strictEqual(matches.length, 1, `Esperada uma regra ativa chamada ${RULE_NAME}`);
  const rule = matches[0];
  assert.strictEqual(rule.active, true, 'Regra Gemini esta desativada no WAF ativo');
  assert.strictEqual(rule.valid, true, 'Regra Gemini esta invalida no WAF ativo');
  assert.strictEqual(rule.validationErrors, null, 'Regra Gemini tem erros de validacao');

  const mitigate = rule.action && rule.action.mitigate;
  assert.ok(mitigate, 'Regra Gemini ativa nao possui mitigacao');
  const protectedPaths = (rule.conditionGroup || []).map((group) => {
    const conditions = Array.isArray(group && group.conditions) ? group.conditions : [];
    const values = Object.fromEntries(conditions.map((condition) => [condition.type, condition.value]));
    assert.strictEqual(values.method, 'POST');
    return values.path;
  }).sort();
  const expectedRateLimit = {
    limit: 12,
    action: 'deny',
    window: 60,
    algo: 'fixed_window',
    keys: ['ip', 'ja4'],
  };
  const differences = [];
  if (mitigate.action !== 'rate_limit') differences.push(`acao=${mitigate.action || 'ausente'}`);
  if (JSON.stringify(mitigate.rateLimit) !== JSON.stringify(expectedRateLimit)) {
    differences.push(`rateLimit=${JSON.stringify(mitigate.rateLimit || null)}`);
  }
  if (JSON.stringify(protectedPaths) !== JSON.stringify(EXPECTED_PATHS)) {
    differences.push(`rotas=${JSON.stringify(protectedPaths)}`);
  }
  assert.strictEqual(
    differences.length,
    0,
    `WAF ativo diverge do contrato: ${differences.join('; ')}`
  );
  process.stdout.write('WAF Vercel ativo: cinco APIs Gemini, 12/min, IP + JA4.\n');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
