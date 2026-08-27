const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const ROOT = path.resolve(__dirname, '..');
const PREVIEW_ROOT = path.join(ROOT, 'assets', 'audio', 'previews');

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
  const originalWavLoader = Module._extensions['.wav'];
  Module._extensions['.wav'] = (assetModule, assetFilename) => {
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
const audioApiPath = path.join(ROOT, 'api', 'gerar-audio.js');

// Secrets must never be literal. ElevenLabs credentials and calls belong only to the server route.
for (const filename of runtimeFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  const label = relative(filename);
  assert.doesNotMatch(source, /\bsk_[a-z0-9_-]{20,}/i, `Possible API secret exposed in ${label}`);
  if (filename !== audioApiPath) {
    assert.doesNotMatch(source, /api\.elevenlabs\.io/i, `ElevenLabs client found in ${label}`);
    assert.doesNotMatch(source, /ELEVENLABS(?:_API)?_KEY/i, `ElevenLabs secret name found in ${label}`);
    assert.doesNotMatch(source, /['"]xi-api-key['"]/i, `ElevenLabs authorization header found in ${label}`);
  }
}
const audioApiSource = fs.readFileSync(audioApiPath, 'utf8');
assert.match(audioApiSource, /api\.elevenlabs\.io/i, 'Audio API must call ElevenLabs server-side');
assert.match(audioApiSource, /ELEVENLABS_API_KEY/, 'Audio API must read the server-side secret');
assert.match(audioApiSource, /['"]xi-api-key['"]/i, 'Audio API must authenticate server-side');
assert.match(audioApiSource, /enable_logging:\s*'false'/, 'Audio API must disable provider request logging');
assert.doesNotMatch(audioApiSource, /EXPO_PUBLIC_ELEVENLABS/i, 'Audio API must not use a public secret');

assert.ok(!fs.existsSync(path.join(ROOT, 'utils', 'audioBank.js')), 'Fixed audio bank still exists');
assert.ok(
  !fs.existsSync(path.join(ROOT, 'utils', 'narratorAudioBank.js')),
  'Fixed narrator content bank still exists'
);
assert.ok(!fs.existsSync(path.join(ROOT, 'utils', 'speech.js')), 'Robotic speech facade still exists');
assert.ok(!fs.existsSync(path.join(ROOT, 'utils', 'voicePicker.js')), 'Legacy device voice picker still exists');

// Narrator samples are bundled assets. They must not contain personal content or cloud requests.
const narrators = loadModule('constants/narrators.js');
const previewAssets = narrators.NARRATORS.flatMap((narrator) =>
  ['pt', 'en'].map((lang) => narrators.narratorPreviewUrl(narrator.id, lang))
).filter(Boolean).sort();
assert.strictEqual(previewAssets.length, 12, 'Catalog must expose 12 bundled narrator previews');
for (const preview of previewAssets) {
  assert.strictEqual(path.dirname(preview), PREVIEW_ROOT, 'Narrator preview must stay in the bundled preview directory');
  const bytes = fs.readFileSync(preview);
  assert.ok(bytes.length > 4096, `Narrator preview is too small: ${path.basename(preview)}`);
  assert.strictEqual(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.strictEqual(bytes.subarray(8, 12).toString('ascii'), 'WAVE');
}

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
assert.match(selectorSource, /playPreview/, 'Narrator selector must request the shared preview player');
assert.doesNotMatch(selectorSource, /narratorPreviewUrl|new\s+Audio\s*\(|expo-audio/, 'Narrator selector still owns local audio');
assert.doesNotMatch(
  selectorSource,
  /\b(?:affirmation|manifestation|story|vision)Text\b/i,
  'Narrator preview must not receive personal content'
);
const narrationContextSource = fs.readFileSync(narrationContextPath, 'utf8');
assert.match(narrationContextSource, /requestNarrationAudio/, 'Cloud narration must use the private server facade');
assert.match(narrationContextSource, /playPreview/, 'Shared player lacks bundled preview support');
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
const personalNarrationSource = read('utils/usePersonalNarration.js');
const morningRitualSource = read('screens/MorningRitualScreen.js');
const dreamServiceSource = read('services/transformDream.js');

assert.match(affirmationsSource, /state\.manifestations/, 'Affirmations must come from personal manifestations');
assert.match(affirmationsSource, /state\.morningRitual/, 'Dream affirmations must come from the personal ritual');
assert.match(visionsSource, /state\.manifestations/, 'Vision cards must come from personal manifestations');
assert.match(visionPlayerSource, /state\.manifestations\.find/, 'Vision route must resolve a personal manifestation');
assert.match(manifestationSource, /state\.manifestations\.find/, 'Manifestation screen must resolve saved personal content');
assert.doesNotMatch(
  personalNarrationSource,
  /cloudPersonalization|cloudDreamConsent/,
  'Voice consent must not silently enable scene or dream uploads'
);
assert.match(
  personalNarrationSource,
  /cloudAdultConfirmed:\s*true,[\s\S]*cloudNarrationConsent:\s*true/,
  'Voice consent must enable only adult-confirmed narration'
);
assert.match(morningRitualSource, /cloudDreamConsent === true/, 'Dream upload needs its own consent');
assert.match(dreamServiceSource, /cloudDreamConsent !== true/, 'Dream service must fail closed without dream consent');

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
