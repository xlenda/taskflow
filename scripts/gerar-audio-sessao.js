// Gera o audio embutido da sessao de 7 minutos (guia + falas da Jornada da semana): 6 narradores x pt/en x 62 clipes.
// `--dry-run`: sem rede, imprime os caracteres e `total: <N>` (so o que falta ou mudou).
// Gerar: ELEVENLABS_API_KEY no ambiente e `--confirm-chars <N>` igual ao total do --dry-run (custa dinheiro).
// Retomada: cada MP3 so entra no lugar depois do seu sidecar (assets/audio/sessao-pendente/<clipe>.json, pasta que o
// mapa nunca requer); quem caiu entre o MP3 e o manifesto e adotado na volta sem pagar de novo. MP3 sem manifesto e
// sem sidecar, ou manifesto de outro modelo/formato, PARA tudo antes de contar.
const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
// so o teste de retomada (verificar-audio-sessao.js --retomada) troca a pasta de saida
const out = process.env.SESSAO_AUDIO_SAIDA_TESTE || root;
const AUDIO_DIR = path.join(out, 'assets', 'audio', 'sessao');
const PENDING_DIR = path.join(out, 'assets', 'audio', 'sessao-pendente');
const MANIFEST = path.join(AUDIO_DIR, 'manifest.json');
const MAP_FILE = path.join(out, 'constants', 'sessionAudio.js');
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
const sidecarOf = (key) => path.join(PENDING_DIR, ...key.split('/')) + '.json';
const sizeOf = (file) => (fs.existsSync(file) ? fs.statSync(file).size : -1);

function readSidecar(key) {
  try {
    return JSON.parse(fs.readFileSync(sidecarOf(key), 'utf8'));
  } catch (_error) {
    return null;
  }
}

// Antes de contar: modelo/formato do manifesto e adocao do que caiu entre o MP3 e o manifesto. Nao grava nada.
// adopted: MP3 no lugar + sidecar do mesmo modelo/formato e mesmos bytes. stale: sidecar cujo MP3 nao entrou no lugar.
function reconcile(clips, manifest, model) {
  const entries = { ...((manifest && manifest.entries) || {}) };
  if (Object.keys(entries).length && (manifest.model !== model || manifest.format !== FORMAT)) {
    throw new Error(
      `manifest.json e de ${manifest.model}/${manifest.format} e o atual e ${model}/${FORMAT}: os clipes nao combinam. ` +
        'Nada gerado. Volte ELEVENLABS_TTS_MODEL ao modelo do manifesto ou apague assets/audio/sessao (paga tudo de novo).'
    );
  }
  const adopted = [];
  const stale = [];
  const orphans = [];
  for (const { key } of clips) {
    const size = sizeOf(fileOf(key));
    const sidecar = readSidecar(key);
    const adoptable =
      sidecar && sidecar.model === model && sidecar.format === FORMAT && sidecar.bytes === size && isMp3(fs.readFileSync(fileOf(key)));
    if (adoptable) {
      entries[key] = { textSha256: sidecar.textSha256, chars: sidecar.chars, bytes: sidecar.bytes };
      adopted.push(key);
      continue;
    }
    if (fs.existsSync(sidecarOf(key))) stale.push(key);
    if (size >= 0 && (!entries[key] || entries[key].bytes !== size)) orphans.push(key);
  }
  if (orphans.length) {
    throw new Error(
      `${orphans.length} MP3 sem entrada no manifesto e sem sidecar valido; nada gerado (nunca refeito calado). ` +
        `Confira e apague a mao os que nao servem: ${orphans.slice(0, 10).join(', ')}`
    );
  }
  return { entries, adopted, stale };
}

// o que falta: sem arquivo, sem entrada no manifesto ou com texto diferente
function pending(clips, entries) {
  return clips.filter((clip) => {
    const entry = entries[clip.key];
    return !entry || entry.textSha256 !== sha256(clip.text) || sizeOf(fileOf(clip.key)) !== entry.bytes;
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
    const errors = [];
    proc.stdout.on('data', (chunk) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => errors.push(chunk));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(new Error(`ffmpeg saiu com ${code}: ${Buffer.concat(errors).toString().trim().slice(0, 300)}`))
    );
    proc.stdin.on('error', () => {});
    proc.stdin.end(wav);
  });
}

// ffmpeg testado com o mesmo WAV que requestElevenLabs(..., false) devolve (pcmToWav: 24 kHz, mono, 16 bits), 0,1 s
// de silencio. Sem MP3 aqui, nenhum pedido pago sai.
async function preflightFfmpeg(api) {
  const mp3 = await toMp3(api.pcmToWav(Buffer.alloc(4800))).catch((error) => {
    throw new Error(`ffmpeg indisponivel ou falhou (${error.message}): nada gerado`);
  });
  if (!isMp3(mp3)) throw new Error('ffmpeg nao devolveu MP3 no teste: nada gerado');
  return mp3;
}

// Ordem que protege o que ja foi pago: MP3 temporario -> sidecar -> MP3 no lugar -> manifesto -> some o sidecar.
// ponytail: queda entre o sidecar e o rename do MP3 (um rename) devolve esse clipe a fila; adotar o .tmp se doer.
function save(clip, mp3, model, entries) {
  const file = fileOf(clip.key);
  const sidecar = sidecarOf(clip.key);
  const entry = { textSha256: sha256(clip.text), chars: clip.text.length, bytes: mp3.length };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(path.dirname(sidecar), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, mp3);
  writeAtomic(sidecar, JSON.stringify({ ...entry, model, format: FORMAT }) + '\n');
  fs.renameSync(`${file}.tmp`, file);
  entries[clip.key] = entry;
  writeManifest(model, entries);
  fs.rmSync(sidecar, { force: true });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generate(todo, entries, api, model) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const { VOICE_AND_TEXT_CONSENT_VERSIONS } = load('constants/cloudConsent.js');
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
  await preflightFfmpeg(api);

  async function one(clip) {
    const input = inputs.get(clip.key);
    for (let attempt = 0; ; attempt += 1) {
      try {
        const wav = await api.requestElevenLabs(input, model, apiKey, false);
        const mp3 = await toMp3(wav);
        if (!isMp3(mp3)) throw new Error(`saida do ffmpeg nao e MP3: ${clip.key}`);
        save(clip, mp3, model, entries); // retoma de onde parou se cair
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

// `api` = _internals de api/gerar-audio.js (o teste de retomada passa uma voz de mentira). Devolve o resumo da conta.
async function main(args = process.argv.slice(2), api = load('api/gerar-audio.js')._internals) {
  const clips = expectedClips();
  const model = api.configuredModel();
  const { entries, adopted, stale } = reconcile(clips, readManifest(), model);
  const todo = pending(clips, entries);
  const total = todo.reduce((sum, clip) => sum + clip.text.length, 0);

  const perGroup = {};
  for (const clip of todo) {
    const group = `${clip.narratorId}/${clip.lang}`;
    perGroup[group] = (perGroup[group] || 0) + clip.text.length;
  }
  console.log(`clipes esperados: ${clips.length}; a gerar: ${todo.length}; adotados sem pagar: ${adopted.length}`);
  if (stale.length) console.log(`sidecars sem MP3 no lugar (somem ao gerar; o clipe volta a fila): ${stale.join(', ')}`);
  for (const group of Object.keys(perGroup)) console.log(`${group}: ${perGroup[group]} chars`);
  console.log(`total: ${total}`);
  const summary = { total, todo: todo.map((clip) => clip.key), adopted, stale };
  if (args.includes('--dry-run')) return summary;

  const at = args.indexOf('--confirm-chars');
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('sem ELEVENLABS_API_KEY no ambiente: nada gerado (use --dry-run para so contar).');
  }
  if (at < 0 || Number(args[at + 1]) !== total) {
    throw new Error(`--confirm-chars precisa ser igual ao total (${total}): nada gerado, nenhuma chamada de rede.`);
  }
  // adotados e sidecars velhos vao para o disco antes de qualquer pedido pago (sem nada a gerar: so reescreve o mapa)
  writeManifest(model, entries);
  for (const key of [...adopted, ...stale]) fs.rmSync(sidecarOf(key), { force: true });
  if (total) await generate(todo, entries, api, model);
  console.log('pronto: manifesto e constants/sessionAudio.js reescritos');
  return summary;
}

module.exports = {
  load,
  sha256,
  expectedClips,
  fileOf,
  sidecarOf,
  preflightFfmpeg,
  main,
  AUDIO_DIR,
  PENDING_DIR,
  MANIFEST,
  MAP_FILE,
  FORMAT,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`falhou: ${error && error.message ? error.message : error}`);
    process.exit(1);
  });
}
