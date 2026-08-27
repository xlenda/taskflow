const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW_ROOT = path.join(ROOT, 'assets', 'audio', 'previews');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function loadModule(relativePath) {
  const filename = path.join(ROOT, relativePath);
  const originalWavLoader = Module._extensions['.wav'];
  Module._extensions['.wav'] = (assetModule, assetFilename) => {
    // Metro turns this into an asset id at runtime. In Node, retain only its path.
    assetModule.exports = assetFilename;
  };
  try {
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
  } finally {
    Module._extensions['.wav'] = originalWavLoader;
  }
}

function assertWave(filename) {
  assert.ok(fs.existsSync(filename), `Preview ausente: ${filename}`);
  const bytes = fs.readFileSync(filename);
  assert.ok(bytes.length > 4096, `Preview vazio ou pequeno demais: ${path.basename(filename)}`);
  assert.strictEqual(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `RIFF ausente: ${path.basename(filename)}`);
  assert.strictEqual(bytes.subarray(8, 12).toString('ascii'), 'WAVE', `WAVE ausente: ${path.basename(filename)}`);
  assert.strictEqual(bytes.readUInt32LE(4) + 8, bytes.length, `Tamanho RIFF invalido: ${path.basename(filename)}`);

  let offset = 12;
  let hasFormat = false;
  let hasData = false;
  while (offset + 8 <= bytes.length) {
    const id = bytes.subarray(offset, offset + 4).toString('ascii');
    const size = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + size;
    assert.ok(end <= bytes.length, `Chunk WAV truncado: ${path.basename(filename)}`);
    if (id === 'fmt ') {
      assert.ok(size >= 16, `Chunk fmt invalido: ${path.basename(filename)}`);
      hasFormat = true;
    }
    if (id === 'data') {
      assert.ok(size > 0, `Chunk data vazio: ${path.basename(filename)}`);
      hasData = true;
    }
    offset = end + (size % 2);
  }
  assert.ok(hasFormat && hasData, `Chunks fmt/data ausentes: ${path.basename(filename)}`);
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
  assert.strictEqual(narrator.tts?.provider, 'elevenlabs', `Provider invalido para ${narrator.id}`);
  assert.match(
    narrator.tts?.voice || '',
    /^[A-Za-z0-9_-]{20}$/,
    `Voice ID ElevenLabs invalido para ${narrator.id}`
  );
  for (const lang of ['pt', 'en']) {
    const preview = narrators.narratorPreviewUrl(narrator.id, lang);
    assert.ok(preview, `Preview ${lang} ausente para ${narrator.id}`);
    assert.strictEqual(path.dirname(preview), PREVIEW_ROOT, `Preview fora de assets/audio/previews: ${narrator.id}`);
    assert.strictEqual(path.basename(preview), `${narrator.id}-${lang}.wav`);
    assertWave(preview);
    assert.ok(narrator.tts.style[lang], `Estilo ${lang} ausente para ${narrator.id}`);
  }
}
assert.strictEqual(new Set(narrators.NARRATORS.map(({ tts }) => tts.voice)).size, 6);
const previewFiles = fs.readdirSync(PREVIEW_ROOT).sort();
const expectedPreviewFiles = narrators.NARRATORS.flatMap(({ id }) => [`${id}-en.wav`, `${id}-pt.wav`]).sort();
assert.deepStrictEqual(previewFiles, expectedPreviewFiles, 'Devem existir exatamente 12 previews WAV PT/EN empacotados');

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
assert.ok(
  selector.includes("if (narratorId !== selectedId && typeof onChange === 'function')") &&
    selector.indexOf('onChange(narratorId)') <
      selector.indexOf('narration.playPreview(narratorId, locale, playbackId)'),
  'ouvir uma amostra deve selecionar a mesma voz antes da reproducao'
);
assert.match(
  selector,
  /activePlaybackId\s*===\s*previewPlaybackId\(narrator\.id, locale\)/,
  'audio pessoal nao pode aparecer como previa ativa no seletor'
);
assert.ok(
  reveal.includes('narratorId: selectedNarratorId') &&
    reveal.includes('value={selectedNarratorId}'),
  'a primeira cena deve enviar explicitamente a voz escolhida'
);
assert.doesNotMatch(selector, /narratorPreviewUrl|expo-audio|new\s+Audio\s*\(/, 'Seletor ainda toca amostra local');
assert.match(packageJson.dependencies['expo-audio'] || '', /^~57\./, 'expo-audio deve acompanhar o SDK 57');
assert.match(packageJson.dependencies['expo-asset'] || '', /^~57\./, 'expo-asset deve acompanhar o SDK 57');
assert.match(packageJson.dependencies['expo-file-system'] || '', /^~57\./, 'expo-file-system deve acompanhar o SDK 57');

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

console.log(`OK: ${narrators.NARRATORS.length} narradores, 12 previews WAV empacotados e player compartilhado`);
