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

function hasTrueProperty(node, name) {
  if (!node || node.type !== 'ObjectExpression') return false;
  return node.properties.some(
    (property) =>
      property.type === 'ObjectProperty' &&
      !property.computed &&
      ((property.key.type === 'Identifier' && property.key.name === name) ||
        (property.key.type === 'StringLiteral' && property.key.value === name)) &&
      property.value.type === 'BooleanLiteral' &&
      property.value.value === true
  );
}

const voicePicker = loadModule('utils/voicePicker.js');
const remote = {
  name: 'Microsoft Antonio Online (Natural) - Portuguese (Brazil)',
  lang: 'pt-BR',
  voiceURI: 'remote-antonio',
  localService: false,
};
const local = {
  name: 'Ricardo',
  lang: 'pt-BR',
  voiceURI: 'local-ricardo',
  localService: true,
};

global.window = {
  speechSynthesis: {
    getVoices: () => [remote, local],
  },
};

assert.strictEqual(
  voicePicker.pickVoice('pt', { localOnly: true }).voiceURI,
  local.voiceURI,
  'Personal text must skip remote voices'
);
assert.strictEqual(
  voicePicker.pickVoiceURI('pt', { localOnly: true }),
  local.voiceURI,
  'Personal text must keep the verified local voice URI'
);

window.speechSynthesis.getVoices = () => [remote];
assert.strictEqual(
  voicePicker.pickVoice('pt', { localOnly: true }),
  null,
  'Remote-only devices must fall back to private text'
);
assert.strictEqual(voicePicker.pickVoiceURI('pt', { localOnly: true }), null);
delete global.window;

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

// The only bundled audio files are the six narrator samples declared in constants/narrators.js.
const narrators = loadModule('constants/narrators.js');
const previewUrls = narrators.NARRATORS.flatMap((narrator) =>
  ['pt', 'en'].map((lang) => narrators.narratorPreviewUrl(narrator.id, lang))
).sort();
assert.strictEqual(new Set(previewUrls).size, 6, 'Expected six unique narrator previews');
previewUrls.forEach((url) =>
  assert.match(url, /^\/audio\/narrators\/[a-z0-9-]+\.mp3$/i, `Invalid preview URL: ${url}`)
);

const audioRoot = path.join(PUBLIC, 'audio');
const shippedAudio = walkFiles(audioRoot).map(
  (filename) => `/${path.relative(PUBLIC, filename).replaceAll(path.sep, '/')}`
).sort();
assert.deepStrictEqual(
  shippedAudio,
  previewUrls,
  'Only the declared narrator previews may be bundled under public/audio'
);

const selectorPath = path.join(ROOT, 'components', 'NarratorSelector.js');
for (const filename of runtimeFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  if (filename !== selectorPath) {
    assert.doesNotMatch(source, /\bnew\s+Audio\s*\(/, `Non-preview audio playback found in ${relative(filename)}`);
    assert.doesNotMatch(source, /from\s+['"]expo-audio['"]/, `Non-preview expo-audio use found in ${relative(filename)}`);
  }
  if (filename !== path.join(ROOT, 'constants', 'narrators.js')) {
    assert.doesNotMatch(source, /['"]\/audio\/[^'"]+['"]/, `Bundled content audio found in ${relative(filename)}`);
  }
}
const selectorSource = fs.readFileSync(selectorPath, 'utf8');
assert.match(selectorSource, /narratorPreviewUrl/, 'Narrator selector must use the curated sample URL');
assert.doesNotMatch(
  selectorSource,
  /\b(?:affirmation|manifestation|story|vision)Text\b/i,
  'Narrator preview must not receive personal content'
);

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

// Every screen call into the speech facade must explicitly require a local voice.
let playbackCalls = 0;
let warmupCalls = 0;
for (const filename of displayFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  const ast = parseModule(source, filename);
  const speechBindings = new Map();

  traverse(ast, {
    ImportDeclaration(importPath) {
      const moduleName = String(importPath.node.source.value).replaceAll('\\', '/');
      if (!moduleName.endsWith('/utils/speech')) return;
      for (const specifier of importPath.node.specifiers) {
        if (specifier.type !== 'ImportSpecifier') continue;
        const imported = specifier.imported.name || specifier.imported.value;
        if (['speak', 'narrate', 'warmUpVoices'].includes(imported)) {
          speechBindings.set(specifier.local.name, imported);
        }
      }
    },
  });

  traverse(ast, {
    CallExpression(callPath) {
      const callee = callPath.node.callee;
      if (callee.type !== 'Identifier' || !speechBindings.has(callee.name)) return;
      const imported = speechBindings.get(callee.name);
      const optionsIndex = imported === 'narrate' ? 2 : 1;
      const options = callPath.node.arguments[optionsIndex];
      assert.ok(
        hasTrueProperty(options, 'localOnly'),
        `${relative(filename)} calls ${imported} without localOnly: true`
      );
      if (imported === 'narrate') {
        assert.strictEqual(
          callPath.node.arguments[0] && callPath.node.arguments[0].type,
          'NullLiteral',
          `${relative(filename)} must not pass a fixed audio id to narrate`
        );
        playbackCalls += 1;
      } else if (imported === 'speak') {
        playbackCalls += 1;
      } else {
        warmupCalls += 1;
      }
    },
  });
}

assert.ok(playbackCalls >= 5, 'Privacy gate did not find every personal playback surface');
assert.ok(warmupCalls >= 1, 'Local narrator voices are not warmed up anywhere');

const speechSource = read('utils/speech.js');
assert.doesNotMatch(speechSource, /audioBank|audioUrl|NARRATOR_AUDIO_BANK/, 'Speech facade still knows a fixed audio bank');
assert.doesNotMatch(
  speechSource,
  /\b(?:playId|hasNeuralAudio)\b/,
  'Legacy fixed-audio compatibility code still exists'
);

process.stdout.write(
  `Voice privacy: ${playbackCalls} personal playback calls, ${previewUrls.length} narrator-only samples, no cloud client\n`
);
