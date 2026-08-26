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

assert.strictEqual(narrators.NARRATORS.length, 6, 'Celeste deve oferecer exatamente seis vozes curadas');
assert.ok(narrators.isNarratorId(narrators.DEFAULT_NARRATOR_ID), 'Narrador padrao invalido');
assert.deepStrictEqual(
  new Set(narrators.NARRATORS.map(({ id }) => id)).size,
  6,
  'IDs dos narradores precisam ser unicos'
);

for (const narrator of narrators.NARRATORS) {
  assert.strictEqual(narrator.tts?.provider, 'gemini', `Provider invalido para ${narrator.id}`);
  assert.match(narrator.tts?.voice || '', /^[A-Za-z]+$/, `Voz Gemini invalida para ${narrator.id}`);
  for (const lang of ['pt', 'en']) {
    assert.strictEqual(narrators.narratorPreviewUrl(narrator.id, lang), null);
    assert.ok(narrator.tts.style[lang], `Estilo ${lang} ausente para ${narrator.id}`);
  }
}
assert.strictEqual(new Set(narrators.NARRATORS.map(({ tts }) => tts.voice)).size, 6);

const profile = read('screens/ProfileScreen.js');
const reveal = read('screens/onboarding/RevealScreen.js');
const context = read('context/AppContext.js');
const content = read('constants/content.js');
const selector = read('components/NarratorSelector.js');
const packageJson = JSON.parse(read('package.json'));

assert.ok(profile.includes('<NarratorSelector'), 'Seletor de narrador ausente do Perfil');
assert.ok(reveal.includes('<NarratorSelector'), 'Seletor de narrador ausente da primeira cena pessoal');
assert.ok(profile.includes('setNarrator'), 'Perfil nao persiste a voz escolhida');
assert.ok(context.includes('isNarratorId') && context.includes('setNarrator'), 'Contexto nao protege a escolha de voz');
assert.ok(content.includes('narratorId: DEFAULT_NARRATOR_ID'), 'Estado inicial sem narrador padrao');
assert.ok(selector.includes('accessibilityRole="radiogroup"'), 'Seletor sem radiogroup acessivel');
assert.ok(selector.includes('aria-checked={selected}'), 'Radio sem estado selecionado para a web');
assert.match(selector, /useNarration/, 'Seletor nao usa o player neural compartilhado');
assert.match(selector, /playPreview/, 'Seletor nao solicita a previa neural');
assert.doesNotMatch(selector, /narratorPreviewUrl|expo-audio|new\s+Audio\s*\(/, 'Seletor ainda toca amostra local');
assert.strictEqual(packageJson.dependencies['expo-audio'], '~1.1.1', 'Versao do expo-audio fora do SDK 54');
assert.strictEqual(packageJson.dependencies['expo-asset'], '~12.0.13', 'Peer expo-asset fora do SDK 54');
assert.strictEqual(packageJson.dependencies['expo-file-system'], '~19.0.24', 'FileSystem fora do SDK 54');

const runtimeRoots = ['components', 'constants', 'context', 'screens', 'services', 'utils'];
for (const filename of runtimeRoots.flatMap((folder) => walkJavaScript(path.join(ROOT, folder)))) {
  const source = fs.readFileSync(filename, 'utf8');
  assert.doesNotMatch(source, /\bsk_[a-z0-9_-]{20,}/i, `Possivel segredo exposto em ${path.relative(ROOT, filename)}`);
  assert.doesNotMatch(source, /api\.elevenlabs\.io/i, `Cliente acessa ElevenLabs diretamente em ${path.relative(ROOT, filename)}`);
  assert.doesNotMatch(source, /ELEVENLABS_API_KEY/, `Nome do segredo vazou no bundle em ${path.relative(ROOT, filename)}`);
}

assert.doesNotMatch(read('constants/narrators.js'), /\/audio\/narrators\//, 'Catalogo ainda aponta para MP3 antigo');
assert.ok(!fs.existsSync(path.join(ROOT, 'utils', 'narratorAudioBank.js')), 'Banco de narradores fixos ainda existe');
assert.ok(!fs.existsSync(path.join(ROOT, 'utils', 'audioBank.js')), 'Banco de conteudo fixo ainda existe');

console.log(`OK: ${narrators.NARRATORS.length} narradores Gemini e nenhum catalogo fixo`);
