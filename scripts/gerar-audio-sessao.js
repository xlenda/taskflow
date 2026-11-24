// Gera o audio embutido da sessao de 7 minutos (guia + falas da Jornada da semana): 6 narradores x pt/en x 62 clipes.
// `--dry-run`: sem rede, imprime os caracteres e `total: <N>` (so o que falta ou mudou).
// Gerar: ELEVENLABS_API_KEY no ambiente e `--confirm-chars <N>` igual ao total do --dry-run (custa dinheiro).
const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const AUDIO_DIR = path.join(root, 'assets', 'audio', 'sessao');
const MANIFEST = path.join(AUDIO_DIR, 'manifest.json');
const MAP_FILE = path.join(root, 'constants', 'sessionAudio.js');
const FORMAT = 'mp3-48k-mono-24000';
const FFMPEG = ['-i', 'pipe:0', '-ac', '1', '-ar', '24000', '-b:a', '48k', '-f', 'mp3', 'pipe:1'];
const LANGS = ['pt', 'en'];

// Babel nos arquivos do projeto (ESM); os .wav dos previews viram um valor qualquer.
function load(relative) {
  const originalJs = Module._extensions['.js'];
  Module._extensions['.wav'] = (loaded) => {
    loaded.exports = 0;
  };
  Module._extensions['.js'] = (loaded, filename) => {
    if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
      originalJs(loaded, filename);
      return;
    }
    const { transformSync } = require('@babel/core');
    const code = transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      presets: ['babel-preset-expo'],
      sourceType: 'module',
    }).code;
    loaded._compile(code, filename);
  };
  try {
    return require(path.join(root, relative));
  } finally {
    Module._extensions['.js'] = originalJs;
  }
}

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// [{ key: '<narrador>/<lang>/<clipe>', narratorId, lang, clipId, text }] - 744 itens
function expectedClips() {
  const { SESSION_GUIDE, SESSION_GUIDE_CLIPS } = load('constants/sessionGuide.js');
  const { WEEKLY_JOURNEYS } = load('constants/weeklyJourneys.js');
  const { journeyClipId } = load('utils/weeklyJourney.js');
  const { NARRATORS } = load('constants/narrators.js');
  const texts = SESSION_GUIDE_CLIPS.map((clip) => [clip, SESSION_GUIDE[clip]]);
  for (const theme of WEEKLY_JOURNEYS) {
    theme.days.forEach((day, index) => texts.push([journeyClipId(theme.id, index), day.line]));
  }
  const out = [];
  for (const { id: narratorId } of NARRATORS) {
    for (const lang of LANGS) {
      for (const [clipId, text] of texts) {
        out.push({ key: `${narratorId}/${lang}/${clipId}`, narratorId, lang, clipId, text: text[lang] });
      }
    }
  }
  return out;
}

// null so quando nao existe; manifesto ilegivel PARA (senao a geracao refaria e cobraria tudo de novo)
function readManifest() {
  let raw;
  try {
    raw = fs.readFileSync(MANIFEST, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const manifest = JSON.parse(raw);
    if (!manifest || typeof manifest.entries !== 'object' || manifest.entries === null) throw new Error('sem entries');
    return manifest;
  } catch (error) {
    throw new Error(`manifest.json ilegivel (${error.message}): conserte ou restaure antes de gerar`);
  }
}

// grava por arquivo temporario + rename: queda no meio nao deixa arquivo pela metade
function writeAtomic(file, content) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

const isMp3 = (buf) =>
  Buffer.isBuffer(buf) &&
  buf.length > 3 &&
  (buf.toString('latin1', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));

const fileOf = (key) => path.join(AUDIO_DIR, ...key.split('/')) + '.mp3';

// o que falta: sem arquivo, sem entrada no manifesto ou com texto diferente
function pending(clips, manifest) {
  const entries = (manifest && manifest.entries) || {};
  return clips.filter((clip) => {
    const entry = entries[clip.key];
    if (!entry || entry.textSha256 !== sha256(clip.text)) return true;
    try {
      return fs.statSync(fileOf(clip.key)).size !== entry.bytes;
    } catch (_error) {
      return true;
    }
  });
}

function writeMap(entries) {
  const lines = Object.keys(entries)
    .filter((key) => fs.existsSync(fileOf(key)))
    .sort()
    .map((key) => `  '${key}': require('../assets/audio/sessao/${key}.mp3'),`);
  writeAtomic(
    MAP_FILE,
    '// GERADO por scripts/gerar-audio-sessao.js - nao editar. Um require() literal por MP3 existente.\n' +
      `const CLIPS = {\n${lines.join('\n')}${lines.length ? '\n' : ''}};\n\n` +
      '// modulo do require() do clipe, ou null (o app cai na voz do aparelho)\n' +
      'export function sessionClipModule(narratorId, lang, clipId) {\n' +
      '  return CLIPS[`${narratorId}/${lang}/${clipId}`] || null;\n}\n'
  );
}

function writeManifest(model, entries) {
  const sorted = {};
  for (const key of Object.keys(entries).sort()) sorted[key] = entries[key];
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  writeAtomic(MANIFEST, JSON.stringify({ model, format: FORMAT, entries: sorted }, null, 2) + '\n');
  writeMap(sorted);
}

function toMp3(wav) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', ['-v', 'error', ...FFMPEG]);
    const chunks = [];
    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`ffmpeg saiu com ${code}`))
    );
    proc.stdin.on('error', () => {});
    proc.stdin.end(wav);
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generate(todo, manifest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const { VOICE_AND_TEXT_CONSENT_VERSIONS } = load('constants/cloudConsent.js');
  const api = load('api/gerar-audio.js')._internals;
  const model = api.configuredModel();
  const entries = { ...((manifest && manifest.entries) || {}) };
  const queue = [...todo];
  let done = 0;
  let stopped = null;

  // tudo validado e o ffmpeg testado ANTES do primeiro pedido pago
  const inputs = new Map();
  for (const clip of todo) {
    const checked = api.validateInput({
      mode: 'personal',
      text: clip.text,
      lang: clip.lang,
      narratorId: clip.narratorId,
      cloudConsent: true,
      cloudConsentVersion: VOICE_AND_TEXT_CONSENT_VERSIONS[0],
      adultConfirmed: true,
    });
    if (!checked.value) throw new Error(`entrada recusada (${checked.error}): ${clip.key}`);
    inputs.set(clip.key, checked.value);
  }
  const probe = await toMp3(Buffer.alloc(4800)).catch((error) => {
    throw new Error(`ffmpeg indisponivel ou falhou (${error.message}): nada gerado`);
  });
  if (!isMp3(probe)) throw new Error('ffmpeg nao devolveu MP3 no teste: nada gerado');

  async function one(clip) {
    const input = inputs.get(clip.key);
    for (let attempt = 0; ; attempt += 1) {
      try {
        const wav = await api.requestElevenLabs(input, model, apiKey, false);
        const mp3 = await toMp3(wav);
        if (!isMp3(mp3)) throw new Error(`saida do ffmpeg nao e MP3: ${clip.key}`);
        const file = fileOf(clip.key);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        writeAtomic(file, mp3);
        entries[clip.key] = { textSha256: sha256(clip.text), chars: clip.text.length, bytes: mp3.length };
        writeManifest(model, entries); // retoma de onde parou se cair
        done += 1;
        console.log(`[${done}/${todo.length}] ${clip.key}`);
        return;
      } catch (error) {
        if (error && error.code === 'audio_rate_limited' && attempt < 8) {
          await sleep(5000 * (attempt + 1));
          continue;
        }
        throw error;
      }
    }
  }

  // erro que nao e 429: nao pega clipe novo, mas o pedido em andamento termina e e salvo
  async function worker() {
    while (queue.length && !stopped) {
      try {
        await one(queue.shift());
      } catch (error) {
        stopped = stopped || error;
      }
    }
  }
  await Promise.all([worker(), worker()]); // dois pedidos por vez
  writeManifest(model, entries);
  if (stopped) throw stopped;
}

async function main() {
  const args = process.argv.slice(2);
  const clips = expectedClips();
  const manifest = readManifest();
  const todo = pending(clips, manifest);
  const total = todo.reduce((sum, clip) => sum + clip.text.length, 0);

  const perGroup = {};
  for (const clip of todo) {
    const group = `${clip.narratorId}/${clip.lang}`;
    perGroup[group] = (perGroup[group] || 0) + clip.text.length;
  }
  console.log(`clipes esperados: ${clips.length}; a gerar: ${todo.length}`);
  for (const group of Object.keys(perGroup)) console.log(`${group}: ${perGroup[group]} chars`);
  console.log(`total: ${total}`);
  if (args.includes('--dry-run')) return;

  const at = args.indexOf('--confirm-chars');
  if (!process.env.ELEVENLABS_API_KEY) {
    console.error('sem ELEVENLABS_API_KEY no ambiente: nada gerado (use --dry-run para so contar).');
    process.exit(1);
  }
  if (at < 0 || Number(args[at + 1]) !== total) {
    console.error(`--confirm-chars precisa ser igual ao total (${total}): nada gerado, nenhuma chamada de rede.`);
    process.exit(1);
  }
  if (!total) {
    // nada a gerar: so reescreve o mapa (um require por MP3 existente)
    const model = (manifest && manifest.model) || load('api/gerar-audio.js')._internals.configuredModel();
    writeManifest(model, (manifest && manifest.entries) || {});
    return;
  }
  await generate(todo, manifest);
  console.log('pronto: manifesto e constants/sessionAudio.js reescritos');
}

module.exports = { load, sha256, expectedClips, fileOf, AUDIO_DIR, MANIFEST, MAP_FILE, FORMAT };

if (require.main === module) {
  main().catch((error) => {
    console.error(`falhou: ${error && error.message ? error.message : error}`);
    process.exit(1);
  });
}
