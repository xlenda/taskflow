const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function walkFiles(directory, test = () => true) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile() && test(absolute)) files.push(absolute);
    }
  }
  return files;
}

function relative(filename) {
  return path.relative(ROOT, filename).replaceAll(path.sep, '/');
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

function parseModule(source, filename) {
  return parse(source, {
    sourceType: 'module',
    sourceFilename: filename,
    plugins: ['jsx'],
  });
}

const runtimeRoots = ['api', 'components', 'constants', 'context', 'screens', 'services', 'ui', 'utils'];
const runtimeFiles = [path.join(ROOT, 'App.js')].concat(
  runtimeRoots.flatMap((folder) =>
    walkFiles(path.join(ROOT, folder), (filename) => /\.[cm]?[jt]sx?$/.test(filename))
  )
);

// Secrets and the ElevenLabs client must never ship in either browser or API runtime code.
for (const filename of runtimeFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  const label = relative(filename);
  assert.doesNotMatch(source, /\bsk_[a-z0-9_-]{20,}/i, `Possible API secret exposed in ${label}`);
  assert.doesNotMatch(source, /api\.elevenlabs\.io/i, `ElevenLabs client found in ${label}`);
  assert.doesNotMatch(source, /ELEVENLABS(?:_API)?_KEY/i, `ElevenLabs secret name found in ${label}`);
  assert.doesNotMatch(source, /['"]xi-api-key['"]/i, `ElevenLabs authorization header found in ${label}`);
}

assert.ok(!fs.existsSync(path.join(ROOT, 'utils', 'audioBank.js')), 'Fixed audio bank still exists');
assert.ok(
  !fs.existsSync(path.join(ROOT, 'utils', 'narratorAudioBank.js')),
  'Fixed narrator content bank still exists'
);
assert.ok(!fs.existsSync(path.join(ROOT, 'utils', 'speech.js')), 'Robotic speech facade still exists');
assert.ok(!fs.existsSync(path.join(ROOT, 'utils', 'voicePicker.js')), 'Legacy device voice picker still exists');

// Gemini previews are requested on demand; the old provider samples are not named in the catalog.
const narrators = loadModule('constants/narrators.js');
const previewUrls = narrators.NARRATORS.flatMap((narrator) =>
  ['pt', 'en'].map((lang) => narrators.narratorPreviewUrl(narrator.id, lang))
).filter(Boolean).sort();
assert.deepStrictEqual(previewUrls, [], 'Catalog still exposes legacy narrator samples');

const audioRoot = path.join(PUBLIC, 'audio');
const shippedAudio = walkFiles(audioRoot).map(
  (filename) => `/${path.relative(PUBLIC, filename).replaceAll(path.sep, '/')}`
).sort();
assert.ok(Array.isArray(shippedAudio));

const selectorPath = path.join(ROOT, 'components', 'NarratorSelector.js');
const narrationContextPath = path.join(ROOT, 'context', 'NarrationContext.js');
for (const filename of runtimeFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  if (filename !== selectorPath && filename !== narrationContextPath) {
    assert.doesNotMatch(source, /\bnew\s+Audio\s*\(/, `Non-preview audio playback found in ${relative(filename)}`);
    assert.doesNotMatch(source, /from\s+['"]expo-audio['"]/, `Non-preview expo-audio use found in ${relative(filename)}`);
  }
  if (filename !== path.join(ROOT, 'constants', 'narrators.js')) {
    assert.doesNotMatch(source, /['"]\/audio\/[^'"]+['"]/, `Bundled content audio found in ${relative(filename)}`);
  }
}
const selectorSource = fs.readFileSync(selectorPath, 'utf8');
assert.match(selectorSource, /useNarration/, 'Narrator selector must use the shared neural player');
assert.match(selectorSource, /playPreview/, 'Narrator selector must request a fixed-text preview');
assert.doesNotMatch(selectorSource, /narratorPreviewUrl|new\s+Audio\s*\(|expo-audio/, 'Narrator selector still owns local audio');
assert.doesNotMatch(
  selectorSource,
  /\b(?:affirmation|manifestation|story|vision)Text\b/i,
  'Narrator preview must not receive personal content'
);
const narrationContextSource = fs.readFileSync(narrationContextPath, 'utf8');
assert.match(narrationContextSource, /requestNarrationAudio/, 'Cloud narration must use the private server facade');
assert.match(narrationContextSource, /playPreview/, 'Shared player lacks remote preview support');
assert.match(narrationContextSource, /playPersonal/, 'Shared player lacks personal narration support');
assert.doesNotMatch(narrationContextSource, /expo-speech/, 'Cloud narration silently falls back to a device voice');

// No screen may import one of the old generic content decks.
const forbiddenDecks = new Set(['AFFIRMATIONS', 'VISIONS', 'FOR_YOU', 'TRENDING']);
const displayFiles = runtimeFiles.filter((filename) =>
  /[\\/](?:components|screens)[\\/]/.test(filename)
);
for (const filename of displayFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  const ast = parseModule(source, filename);
  traverse(ast, {
    ImportDeclaration(importPath) {
      if (!/constants\/content$/.test(String(importPath.node.source.value).replaceAll('\\', '/'))) return;
      for (const specifier of importPath.node.specifiers) {
        if (specifier.type !== 'ImportSpecifier') continue;
        const imported = specifier.imported.name || specifier.imported.value;
        assert.ok(
          !forbiddenDecks.has(imported),
          `${relative(filename)} still imports the generic ${imported} deck`
        );
      }
    },
  });
}

const affirmationsSource = read('screens/AffirmationsScreen.js');
const visionsSource = read('screens/VisionsScreen.js');
const visionPlayerSource = read('screens/VisionPlayerScreen.js');
const manifestationSource = read('screens/ManifestationScreen.js');

assert.match(affirmationsSource, /state\.manifestations/, 'Affirmations must come from personal manifestations');
assert.match(affirmationsSource, /state\.morningRitual/, 'Dream affirmations must come from the personal ritual');
assert.match(visionsSource, /state\.manifestations/, 'Vision cards must come from personal manifestations');
assert.match(visionPlayerSource, /state\.manifestations\.find/, 'Vision route must resolve a personal manifestation');
assert.match(manifestationSource, /state\.manifestations\.find/, 'Manifestation screen must resolve saved personal content');

// Personal playback surfaces must use the consent-aware shared neural hook.
let personalNarrationSurfaces = 0;
for (const filename of displayFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  const ast = parseModule(source, filename);

  traverse(ast, {
    ImportDeclaration(importPath) {
      const moduleName = String(importPath.node.source.value).replaceAll('\\', '/');
      assert.ok(
        !moduleName.endsWith('/utils/speech'),
        `${relative(filename)} still imports the local robotic speech facade`
      );
      if (moduleName.endsWith('/utils/usePersonalNarration')) {
        personalNarrationSurfaces += 1;
      }
    },
  });
}

assert.ok(personalNarrationSurfaces >= 6, 'Privacy gate did not find every personal neural playback surface');

process.stdout.write(
  `Voice privacy: ${personalNarrationSurfaces} consent-aware neural surfaces; secrets stay server-side\n`
);
