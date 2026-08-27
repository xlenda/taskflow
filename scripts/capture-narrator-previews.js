const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const TARGET_URL = (process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'audio', 'previews');
const NARRATORS = ['aurora', 'rio', 'atlas', 'serena', 'luma', 'nilo'];
const LANGUAGES = ['pt', 'en'];

function loadEnvFile(filename) {
  if (!filename) return false;
  const content = fs.readFileSync(path.resolve(filename), 'utf8');
  for (const line of content.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch (_error) {
        value = value.slice(1, -1);
      }
    }
    process.env[match[1]] = value;
  }
  return true;
}

function isWave(buffer) {
  return buffer.length >= 44 && buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE';
}

async function capture(page, narratorId, lang) {
  const result = await page.evaluate(async ({ narratorId: id, lang: locale }) => {
    const response = await fetch('/api/gerar-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ mode: 'preview', narratorId: id, lang: locale }),
    });
    if (!response.ok) {
      let error = `http_${response.status}`;
      try {
        const payload = await response.json();
        if (payload && payload.error) error = payload.error;
      } catch (_error) {}
      return { ok: false, error };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    const size = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += size) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + size));
    }
    return { ok: true, base64: btoa(binary) };
  }, { narratorId, lang });
  if (!result.ok) throw new Error(`${narratorId}-${lang}: ${result.error}`);
  return Buffer.from(result.base64, 'base64');
}

async function captureLocally(endpoint, narratorId, lang) {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    end() { return this; },
  };
  await endpoint({
    method: 'POST',
    headers: { origin: 'https://celeste-jet-two.vercel.app' },
    body: { mode: 'preview', narratorId, lang },
  }, response);
  if (response.statusCode !== 200 || !Buffer.isBuffer(response.body)) {
    throw new Error(`${narratorId}-${lang}: ${response.body?.error || `http_${response.statusCode}`}`);
  }
  return response.body;
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const force = process.argv.includes('--force');
  const usesLocalHandler =
    loadEnvFile(process.env.CELESTE_ENV_FILE) || Boolean(process.env.ELEVENLABS_API_KEY);
  if (usesLocalHandler) {
    process.env.CELESTE_ALLOW_PREVIEW_CAPTURE = '1';
    process.env.VERCEL_ENV = 'development';
    const endpoint = require('../api/gerar-audio');
    endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
    endpoint._internals.setPaidAccessAuthorizerForTests(async () => ({
      ok: true,
      userId: '00000000-0000-4000-8000-000000000001',
    }));
    try {
      for (const narratorId of NARRATORS) {
        for (const lang of LANGUAGES) {
          const filename = path.join(OUTPUT_DIR, `${narratorId}-${lang}.wav`);
          if (!force && fs.existsSync(filename) && isWave(fs.readFileSync(filename))) {
            process.stdout.write(`reuse ${path.basename(filename)}\n`);
            continue;
          }
          const buffer = await captureLocally(endpoint, narratorId, lang);
          if (!isWave(buffer)) throw new Error(`${narratorId}-${lang}: invalid_wav`);
          fs.writeFileSync(filename, buffer);
          process.stdout.write(`saved ${path.basename(filename)} (${buffer.length} bytes)\n`);
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    } finally {
      endpoint._internals.resetSecurityForTests();
    }
    return;
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 2500));

    for (const narratorId of NARRATORS) {
      for (const lang of LANGUAGES) {
        const filename = path.join(OUTPUT_DIR, `${narratorId}-${lang}.wav`);
        if (!force && fs.existsSync(filename) && isWave(fs.readFileSync(filename))) {
          process.stdout.write(`reuse ${path.basename(filename)}\n`);
          continue;
        }
        const buffer = await capture(page, narratorId, lang);
        if (!isWave(buffer)) throw new Error(`${narratorId}-${lang}: invalid_wav`);
        fs.writeFileSync(filename, buffer);
        process.stdout.write(`saved ${path.basename(filename)} (${buffer.length} bytes)\n`);
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
