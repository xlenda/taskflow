const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function loadModule(relativePath) {
  const filename = path.join(ROOT, relativePath);
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

function audioPathFromUrl(url) {
  assert.match(url, /^\/audio\/narrators\/[a-z0-9/-]+\.mp3$/i, `URL de audio invalida: ${url}`);
  const filename = path.resolve(PUBLIC, url.slice(1).replaceAll('/', path.sep));
  assert.ok(filename.startsWith(`${PUBLIC}${path.sep}`), `Audio escapou de public/: ${url}`);
  return filename;
}

function assertMp3(url) {
  const filename = audioPathFromUrl(url);
  assert.ok(fs.existsSync(filename), `Audio ausente: ${url}`);
  const stat = fs.statSync(filename);
  assert.ok(stat.isFile() && stat.size > 4000, `Audio vazio ou invalido: ${url}`);
  const header = fs.readFileSync(filename).subarray(0, 3);
  const isId3 = header.toString('ascii') === 'ID3';
  const isMpeg = header[0] === 0xff && (header[1] & 0xe0) === 0xe0;
  assert.ok(isId3 || isMpeg, `Cabecalho MP3 invalido: ${url}`);
}

function walkJavaScript(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) files.push(absolute);
    }
  }
  return files;
}

const narrators = loadModule('constants/narrators.js');

assert.strictEqual(narrators.NARRATORS.length, 3, 'Celeste deve oferecer exatamente tres vozes curadas');
assert.ok(narrators.isNarratorId(narrators.DEFAULT_NARRATOR_ID), 'Narrador padrao invalido');
assert.deepStrictEqual(
  new Set(narrators.NARRATORS.map(({ id }) => id)).size,
  3,
  'IDs dos narradores precisam ser unicos'
);

let previewCount = 0;
for (const narrator of narrators.NARRATORS) {
  for (const lang of ['pt', 'en']) {
    assertMp3(narrators.narratorPreviewUrl(narrator.id, lang));
    previewCount += 1;
  }
}

const profile = read('screens/ProfileScreen.js');
const reveal = read('screens/onboarding/RevealScreen.js');
const context = read('context/AppContext.js');
const content = read('constants/content.js');
const speech = read('utils/speech.js');
const selector = read('components/NarratorSelector.js');
const packageJson = JSON.parse(read('package.json'));

assert.ok(profile.includes('<NarratorSelector'), 'Seletor de narrador ausente do Perfil');
assert.ok(reveal.includes('<NarratorSelector'), 'Seletor de narrador ausente da primeira cena pessoal');
assert.ok(profile.includes('setNarrator'), 'Perfil nao persiste a voz escolhida');
assert.ok(context.includes('isNarratorId') && context.includes('setNarrator'), 'Contexto nao protege a escolha de voz');
assert.ok(content.includes('narratorId: DEFAULT_NARRATOR_ID'), 'Estado inicial sem narrador padrao');
assert.doesNotMatch(speech, /audioBank|NARRATOR_AUDIO_BANK/, 'Player ainda depende de catalogo fixo');
assert.match(speech, /narratorId\s*=\s*DEFAULT_NARRATOR_ID/, 'Voz local nao recebe a preferencia do narrador');
assert.ok(selector.includes('accessibilityRole="radiogroup"'), 'Seletor sem radiogroup acessivel');
assert.ok(selector.includes('aria-checked={selected}'), 'Radio sem estado selecionado para a web');
assert.match(
  selector,
  /if \(activeIdRef\.current\) teardownPreview\(\);/,
  'Trocar de amostra precisa parar a voz anterior antes de iniciar outra'
);
assert.strictEqual(packageJson.dependencies['expo-audio'], '~1.1.1', 'Versao do expo-audio fora do SDK 54');
assert.strictEqual(packageJson.dependencies['expo-asset'], '~12.0.13', 'Peer expo-asset fora do SDK 54');

const runtimeRoots = ['components', 'constants', 'context', 'screens', 'services', 'utils'];
for (const filename of runtimeRoots.flatMap((folder) => walkJavaScript(path.join(ROOT, folder)))) {
  const source = fs.readFileSync(filename, 'utf8');
  assert.doesNotMatch(source, /\bsk_[a-z0-9_-]{20,}/i, `Possivel segredo exposto em ${path.relative(ROOT, filename)}`);
  assert.doesNotMatch(source, /api\.elevenlabs\.io/i, `Cliente acessa ElevenLabs diretamente em ${path.relative(ROOT, filename)}`);
  assert.doesNotMatch(source, /ELEVENLABS_API_KEY/, `Nome do segredo vazou no bundle em ${path.relative(ROOT, filename)}`);
}

assert.strictEqual(previewCount, 6, 'Quantidade inesperada de amostras');

const audioRoot = path.join(PUBLIC, 'audio');
const shippedMp3s = fs.existsSync(audioRoot)
  ? fs.readdirSync(audioRoot, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mp3'))
  : [];
assert.strictEqual(shippedMp3s.length, 6, 'Somente as seis amostras de voz podem ser empacotadas');
assert.ok(!fs.existsSync(path.join(ROOT, 'utils', 'narratorAudioBank.js')), 'Banco de narradores fixos ainda existe');
assert.ok(!fs.existsSync(path.join(ROOT, 'utils', 'audioBank.js')), 'Banco de conteudo fixo ainda existe');

console.log(`OK: ${narrators.NARRATORS.length} narradores, ${previewCount} amostras e nenhum catalogo fixo`);
