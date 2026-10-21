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

// In the app a device voice may read what the Celeste voice could not (server refusal, network, spend cap), but
// never silently: the context marks it (voice: 'device') only off the website, and the global player says so.
// scripts/verificar-vozes-android.js proves the whole fallback by behavior.
function renderPlaybackControls(narration) {
  const filename = path.join(ROOT, 'components', 'NarrationPlaybackControls.js');
  const element = (type, props) => ({ type, props: props || {} });
  const hooks = { useState: (value) => [value, () => {}], useCallback: (fn) => fn };
  const mocks = {
    react: { __esModule: true, default: hooks, ...hooks },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator',
      Pressable: 'Pressable',
      StyleSheet: { create: (styles) => styles },
      Text: 'Text',
      View: 'View',
    },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../context/AppContext': { useApp: () => ({ state: { lang: 'pt' } }) },
    '../context/NarrationContext': { NARRATION_PLAYBACK_RATES: [1], useNarration: () => narration },
    '../ui/theme': { useTheme: () => ({}) },
  };
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalLoad = Module._load;
  Module._load = (request, parent, isMain) =>
    Object.prototype.hasOwnProperty.call(mocks, request) ? mocks[request] : originalLoad(request, parent, isMain);
  try {
    loaded._compile(compiled, filename);
  } finally {
    Module._load = originalLoad;
  }
  const nodes = (node) =>
    Array.isArray(node)
      ? node.flatMap(nodes)
      : node && typeof node === 'object'
        ? [node, ...nodes(node.props.children)]
        : [];
  return nodes(loaded.exports.default({}));
}
const playingNarration = {
  activePlaybackId: 'reveal:m1',
  isPlaying: true,
  progress: 0.2,
  elapsedTime: 3,
  totalDuration: 30,
  chunkCount: 1,
  playbackRate: 1,
};
const deviceVoiceNotice = renderPlaybackControls({ ...playingNarration, voice: 'device' }).find(
  (node) => node.props.testID === 'narration-device-voice-notice'
);
assert.ok(
  deviceVoiceNotice && /voz do aparelho/i.test(String(deviceVoiceNotice.props.children)),
  'Cloud narration silently falls back to a device voice'
);
assert.ok(
  !renderPlaybackControls({ ...playingNarration, voice: 'cloud' }).some(
    (node) => node.props.testID === 'narration-device-voice-notice'
  ),
  'The Celeste voice must not be announced as the device voice'
);
if (/expo-speech/.test(narrationContextSource)) {
  assert.match(
    narrationContextSource,
    /setVoice\('device'\)/,
    'Cloud narration silently falls back to a device voice'
  );
  assert.match(
    narrationContextSource,
    /Platform\.OS !== 'web' &&\s*sequence\.request\.mode === 'personal'/,
    'The website and narrator samples never fall back to a device voice'
  );
}

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

// Screens that read with their own device voice when the Celeste voice she allowed did not play (wake-up, practice)
// say so too; scripts/verificar-vozes-android.js proves it by behavior.
for (const filename of displayFiles) {
  const source = fs.readFileSync(filename, 'utf8');
  if (!/\bplayPersonal\s*\(/.test(source) || !/from\s+['"]expo-speech['"]/.test(source)) continue;
  assert.match(
    source,
    /testID="[a-z]+-device-voice-notice"/,
    `${relative(filename)} silently swaps the Celeste voice for the device voice`
  );
  assert.match(source, /Quem lê é a voz do aparelho/, `${relative(filename)} must say the device voice is reading`);
}

const affirmationsSource = read('screens/AffirmationsScreen.js');
const visionsSource = read('screens/VisionsScreen.js');
const visionPlayerSource = read('screens/VisionPlayerScreen.js');
const manifestationSource = read('screens/ManifestationScreen.js');
const personalNarrationSource = read('utils/usePersonalNarration.js');
const cloudMediaConsentSource = read('utils/useCloudMediaConsent.js');
const morningRitualSource = read('screens/MorningRitualScreen.js');
const dreamServiceSource = read('services/transformDream.js');
const onboardingFlowSource = read('screens/onboarding/flow.js');
const profileSource = read('screens/ProfileScreen.js');
const homeSource = read('screens/HomeScreen.js');
const journeySource = read('screens/JourneyScreen.js');
const legalSource = read('constants/legal.js');

assert.match(
  affirmationsSource,
  /personalJourneyItemsForState\(state,\s*['"]affirmation['"]/,
  'Affirmations must come from the personal 6+6 journey'
);
assert.match(affirmationsSource, /state\.morningRitual/, 'Dream affirmations must come from the personal ritual');
assert.match(
  visionsSource,
  /personalJourneyItemsForState\(state,\s*['"]vision['"]/,
  'Vision cards must come from the personal 6+6 journey'
);
assert.match(
  visionPlayerSource,
  /personalJourneyItemsForState\(state,\s*['"]vision['"]/,
  'Vision route must resolve a personal journey item'
);
assert.match(manifestationSource, /state\.manifestations\.find/, 'Manifestation screen must resolve saved personal content');
assert.match(
  personalNarrationSource,
  /useCloudMediaConsent[\s\S]*ensureCloudMediaConsent/,
  'Personal narration must use the shared explicit cloud-media consent'
);
assert.match(
  cloudMediaConsentSource,
  /cloudPersonalization:\s*true,[\s\S]*cloudAdultConfirmed:\s*true,[\s\S]*cloudNarrationConsent:\s*true,[\s\S]*cloudDreamConsent:\s*true/,
  'The single product control must persist every cloud consent alias together'
);
assert.match(cloudMediaConsentSource, /isUnder18Age\(profile\.age\)/, 'Known minors must stay blocked');
assert.doesNotMatch(
  cloudMediaConsentSource,
  /ageConfirmsAdult/,
  'Skipped age must be confirmable by the explicit 18+ cloud consent action'
);
assert.match(morningRitualSource, /cloudDreamConsent === true/, 'Dream upload needs its own consent');
assert.match(dreamServiceSource, /cloudDreamConsent !== true/, 'Dream service must fail closed without dream consent');

// Every consent and legal surface must name the processor used for each purpose.
assert.doesNotMatch(
  onboardingFlowSource,
  /cloudPersonalization/,
  'Onboarding must not request bundled cloud consent'
);
for (const [label, source] of [
  ['Profile confirmation', profileSource],
  ['privacy and terms', legalSource],
]) {
  for (const provider of ['Anthropic', 'OpenAI', 'Gemini', 'ElevenLabs']) {
    assert.match(source, new RegExp(provider), `${label} does not disclose ${provider}`);
  }
}
assert.match(homeSource, /Anthropic[\s\S]*OpenAI[\s\S]*Google Gemini/, 'Scene consent must disclose text failover and image processor');
assert.doesNotMatch(homeSource, /Create with Gemini|Criar com o Gemini/, 'Scene consent still attributes all processing to Gemini');
assert.match(cloudMediaConsentSource, /ElevenLabs/, 'Unified media consent must disclose ElevenLabs TTS');
assert.match(cloudMediaConsentSource, /Google Gemini/, 'Unified media consent must disclose Gemini images');
assert.match(
  cloudMediaConsentSource,
  /18 anos ou mais[\s\S]*18 or older/,
  'Unified media consent must explicitly confirm adulthood in both languages'
);
assert.match(morningRitualSource, /Google Gemini[\s\S]*interpret/, 'Dream notice must disclose Gemini interpretation');
assert.match(
  legalSource,
  /Anthropic[\s\S]*OpenAI[\s\S]*failover[\s\S]*Google Gemini[\s\S]*translations[\s\S]*images[\s\S]*dream interpretations[\s\S]*ElevenLabs[\s\S]*text-to-speech/,
  'Privacy copy must map scene text, failover, Gemini media/dreams and ElevenLabs TTS'
);
assert.doesNotMatch(journeySource, /Gemini is used only|Gemini só é usado/, 'Journey footer still hides the other cloud processors');

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
