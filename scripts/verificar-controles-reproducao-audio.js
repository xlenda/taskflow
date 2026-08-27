const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const CONTROL_PATH = 'components/NarrationPlaybackControls.js';
const CONTEXT_PATH = 'context/NarrationContext.js';
const APP_PATH = 'App.js';
const REVEAL_PATH = 'screens/onboarding/RevealScreen.js';
const AFFIRMATIONS_PATH = 'screens/AffirmationsScreen.js';

function read(relativePath) {
  const filename = path.join(ROOT, relativePath);
  assert.ok(fs.existsSync(filename), `${relativePath} nao existe`);
  return fs.readFileSync(filename, 'utf8');
}

function compile(relativePath, source) {
  assert.doesNotThrow(
    () =>
      transformSync(source, {
        filename: path.join(ROOT, relativePath),
        presets: ['babel-preset-expo'],
        sourceType: 'module',
      }),
    `${relativePath} precisa compilar com o preset Expo`
  );
}

function occurrences(source, pattern) {
  return (source.match(pattern) || []).length;
}

function loadContextInternals(source) {
  const filename = path.join(ROOT, CONTEXT_PATH);
  const injected = `${source}\nexport const __AUDIO_PLAYBACK_TEST_INTERNALS__ = { supportedPlaybackRate, aggregatePlaybackMetrics, configureNarrationAudioMode, attemptWebPlayback, NARRATION_AUDIO_MODE };`;
  const compiled = transformSync(injected, {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const mocks = {
    'react-native': { Platform: { OS: 'web' } },
    'expo-file-system': { File: class TestFile {}, Paths: { cache: {} } },
    'expo-audio': {
      setAudioModeAsync: async () => {},
      useAudioPlayer: () => ({}),
      useAudioPlayerStatus: () => ({}),
    },
    '../services/generateNarrationAudio': {
      clearNarrationAudioMemoryCache: () => {},
      normalizeNarrationText: (value) => String(value || '').trim(),
      requestNarrationAudio: async () => new Uint8Array(),
      splitNarrationText: (value) => [String(value || '')],
    },
  };
  const originalLoad = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    loaded._compile(compiled, filename);
  } finally {
    Module._load = originalLoad;
  }
  return loaded.exports.__AUDIO_PLAYBACK_TEST_INTERNALS__;
}

async function assertAggregateMetrics(contextSource) {
  const internals = loadContextInternals(contextSource);
  assert.ok(internals, 'funcoes internas de progresso nao puderam ser carregadas');
  assert.strictEqual(internals.supportedPlaybackRate(0.75), 0.75);
  assert.strictEqual(internals.supportedPlaybackRate(1.5), 1.5);
  assert.strictEqual(internals.supportedPlaybackRate(3), 1, 'velocidade fora da lista deve voltar a 1x');

  const halfwayThroughSecondQuarter = internals.aggregatePlaybackMetrics(
    {
      completedWeight: 25,
      currentWeight: 25,
      totalWeight: 100,
    },
    5,
    10
  );
  assert.deepStrictEqual(halfwayThroughSecondQuarter, {
    progress: 0.375,
    elapsedTime: 15,
    totalDuration: 40,
  });

  const finished = internals.aggregatePlaybackMetrics(
    {
      completedWeight: 75,
      currentWeight: 25,
      totalWeight: 100,
    },
    10,
    10
  );
  assert.deepStrictEqual(finished, {
    progress: 1,
    elapsedTime: 40,
    totalDuration: 40,
  });

  assert.deepStrictEqual(internals.NARRATION_AUDIO_MODE, {
    playsInSilentMode: true,
    allowsRecording: false,
    interruptionMode: 'doNotMix',
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
  });

  let configurationCalls = 0;
  const configure = async (mode) => {
    configurationCalls += 1;
    assert.deepStrictEqual(mode, internals.NARRATION_AUDIO_MODE);
  };
  assert.strictEqual(await internals.configureNarrationAudioMode(configure, 'ios'), true);
  assert.strictEqual(await internals.configureNarrationAudioMode(configure, 'ios'), true);
  assert.strictEqual(configurationCalls, 1, 'sessao de audio nativa deve ser configurada uma vez');

  const retryInternals = loadContextInternals(contextSource);
  let retryCalls = 0;
  const failThenSucceed = async () => {
    retryCalls += 1;
    if (retryCalls === 1) throw new Error('native session unavailable');
  };
  assert.strictEqual(
    await retryInternals.configureNarrationAudioMode(failThenSucceed, 'ios'),
    false,
    'falha da sessao deve ser tratada sem rejeicao nao observada'
  );
  assert.strictEqual(await retryInternals.configureNarrationAudioMode(failThenSucceed, 'ios'), true);
  assert.strictEqual(retryCalls, 2, 'falha transitoria deve permitir nova tentativa');

  const allowed = await internals.attemptWebPlayback({
    paused: false,
    play: () => Promise.resolve(),
  });
  assert.deepStrictEqual(allowed, { ok: true, error: null, recoverable: false });

  const deniedError = Object.assign(new Error('gesture required'), { name: 'NotAllowedError' });
  const denied = await internals.attemptWebPlayback({
    paused: true,
    play: () => Promise.reject(deniedError),
  });
  assert.deepStrictEqual(denied, {
    ok: false,
    error: 'audio_autoplay_blocked',
    recoverable: true,
  });

  const stalled = await internals.attemptWebPlayback(
    { paused: true, play: () => new Promise(() => {}) },
    5
  );
  assert.deepStrictEqual(stalled, {
    ok: false,
    error: 'audio_playback_start_timeout',
    recoverable: true,
  });
}

function assertContextContract(source) {
  for (const field of [
    'activePlaybackId',
    'currentTime',
    'duration',
    'elapsedTime',
    'totalDuration',
    'progress',
    'pause',
    'resume',
    'isReady',
    'playbackRate',
    'setPlaybackRate',
    'stop',
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`), `NarrationContext nao expoe ${field}`);
  }

  assert.match(
    source,
    /(?:audio|webAudioRef\.current)\.playbackRate\s*=/,
    'velocidade precisa ser aplicada ao elemento Audio da web'
  );
  assert.match(
    source,
    /setAudioModeAsync/,
    'contexto deve configurar a sessao nativa do expo-audio'
  );
  assert.match(
    source,
    /await\s+configureNarrationAudioMode\s*\(/,
    'reproducao deve aguardar a configuracao da sessao nativa'
  );
  assert.match(
    source,
    /(?:player\.playbackRate\s*=|player\.setPlaybackRate\s*\()/,
    'velocidade precisa ser aplicada ao player nativo'
  );
  assert.doesNotMatch(
    source,
    /audio\.muted\s*=\s*true/,
    'unlock do Safari nao pode depender de audio muted'
  );
  assert.match(
    source,
    /webUnlockPromiseRef/,
    'resultado assincrono do unlock web precisa ser acompanhado'
  );
  assert.match(
    source,
    /setPhase\(['"]ready['"]\)/,
    'autoplay bloqueado precisa preservar a fonte em estado pronto'
  );

  const ratesMatch = source.match(
    /export\s+const\s+NARRATION_PLAYBACK_RATES\s*=\s*Object\.freeze\s*\(\s*\[([^\]]+)\]\s*\)/
  );
  assert.ok(ratesMatch, 'contexto precisa exportar uma fonte unica de velocidades');
  const rates = ratesMatch[1]
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  assert.deepStrictEqual(
    rates,
    [0.75, 1, 1.25, 1.5],
    'velocidades suportadas precisam ser 0.75x, 1x, 1.25x e 1.5x'
  );
}

function assertControlContract(source) {
  assert.match(source, /useNarration\s*\(\s*\)/, 'controle deve consumir o NarrationContext');
  for (const field of [
    'activePlaybackId',
    'elapsedTime',
    'totalDuration',
    'progress',
    'pause',
    'resume',
    'playbackRate',
    'setPlaybackRate',
    'stop',
  ]) {
    assert.match(source, new RegExp(`\\b${field}\\b`), `controle nao usa ${field}`);
  }

  for (const phase of ['loading', 'playing', 'paused', 'ready']) {
    assert.match(
      source,
      new RegExp(`(?:['\"]${phase}['\"]|is${phase[0].toUpperCase()}${phase.slice(1)})`),
      `controle global nao contempla o estado ${phase}`
    );
  }

  assert.match(
    source,
    /NARRATION_PLAYBACK_RATES\.map\s*\(/,
    'seletor precisa renderizar a fonte unica de velocidades do contexto'
  );

  assert.match(
    source,
    /accessibilityRole\s*=\s*(?:\{?['\"]progressbar['\"]\}?)/,
    'barra indicativa precisa usar o papel acessivel progressbar'
  );
  assert.match(
    source,
    /accessibilityValue\s*=/,
    'barra de progresso precisa anunciar minimo, maximo e valor atual'
  );
  assert.match(
    source,
    /\belapsedTime\b[\s\S]{0,800}\btotalDuration\b|\btotalDuration\b[\s\S]{0,800}\belapsedTime\b/,
    'controle precisa renderizar tempo atual e duracao total juntos'
  );
  assert.match(
    source,
    /format\w*(?:Time|Duration|Clock)\s*\(\s*(?:narration\.)?elapsedTime\s*\)/,
    'tempo decorrido precisa ser formatado para leitura'
  );
  assert.match(
    source,
    /format\w*(?:Time|Duration|Clock)\s*\(\s*(?:narration\.)?totalDuration\s*\)/,
    'duracao total precisa ser formatada para leitura'
  );
  assert.match(
    source,
    /(?:Boolean\s*\(\s*(?:narration\.)?activePlaybackId\s*\)|(?:narration\.)?activePlaybackId\s*&&|!(?:narration\.)?activePlaybackId)/,
    'visibilidade do controle precisa depender de um playback ativo'
  );
  assert.match(source, /\bpause\s*\(/, 'controle global precisa pausar o audio ativo');
  assert.match(source, /\bresume\s*\(/, 'controle global precisa retomar o audio pausado');
  assert.match(
    source,
    /\bsetPlaybackRate\s*\(/,
    'seletor de velocidade precisa alterar o playback ativo'
  );
  assert.match(
    source,
    /progress\s*\*\s*100|100\s*\*\s*progress|scaleX\s*:\s*progress/,
    'preenchimento visual da barra precisa acompanhar o progresso'
  );
  assert.match(
    source,
    /accessibilityRole\s*=\s*(?:\{?['\"]radio['\"]\}?|\{?['\"]button['\"]\}?)/,
    'seletor de velocidade precisa expor botoes ou radios acessiveis'
  );
  assert.match(
    source,
    /accessibilityState\s*=|aria-checked\s*=/,
    'velocidade selecionada precisa ser anunciada'
  );
  assert.match(
    source,
    /testID=["']narration-playback-stop["'][\s\S]{0,500}onPress=\{stopPlayback\}/,
    'player precisa oferecer uma acao visivel para parar e fechar'
  );
  assert.match(
    source,
    /accessibilityLabel=\{copy\.stop\}/,
    'acao de fechar precisa ter rotulo acessivel'
  );
  assert.match(
    source,
    /onHoverIn=\{\(\)\s*=>\s*setStopTooltipVisible\(true\)\}/,
    'acao de fechar precisa abrir um tooltip real no hover'
  );
  assert.match(
    source,
    /testID=["']narration-playback-stop-tooltip["'][\s\S]{0,500}\{copy\.stop\}/,
    'tooltip precisa nomear a acao de parar e fechar'
  );
  assert.doesNotMatch(
    source,
    /layer:\s*\{[\s\S]{0,300}position:\s*['"]absolute['"]/,
    'player global nao pode voltar a sobrepor o conteudo por position absolute'
  );
}

function assertRecoverySurfaceLabels(reveal, affirmations) {
  compile(REVEAL_PATH, reveal);
  compile(AFFIRMATIONS_PATH, affirmations);

  assert.match(reveal, /loadingAudio\s*\?\s*t\(S\.preparing\)/);
  assert.match(reveal, /playingAudio\s*\?\s*t\(S\.listening\)/);
  assert.match(reveal, /readyAudio/);
  assert.match(reveal, /await\s+narration\.resume\(\)/);
  assert.match(affirmations, /loadingAudio\s*\?\s*t\(S\.preparingAudio\)/);
  assert.match(affirmations, /readyAudio/);
  assert.match(affirmations, /await\s+resumeNarration\(\)/);
}

function assertGlobalIntegration(appSource) {
  assert.match(
    appSource,
    /import\s+NarrationPlaybackControls\s+from\s+['\"]\.\/components\/NarrationPlaybackControls['\"]/,
    'App precisa importar o controle global de reproducao'
  );
  assert.strictEqual(
    occurrences(appSource, /<NarrationPlaybackControls\b/g),
    1,
    'deve existir exatamente um controle global de reproducao'
  );

  const providerStart = appSource.indexOf('<NarrationProvider>');
  const controls = appSource.indexOf('<NarrationPlaybackControls', providerStart);
  const providerEnd = appSource.indexOf('</NarrationProvider>', providerStart);
  assert.ok(
    providerStart >= 0 && controls > providerStart && providerEnd > controls,
    'controle global precisa estar dentro de NarrationProvider'
  );
  assert.match(
    appSource,
    /<View\s+testID=["']celeste-navigation-frame["']\s+style=\{styles\.navigationFrame\}>[\s\S]*?<NavigationContainer[\s\S]*?<\/NavigationContainer>[\s\S]*?<\/View>[\s\S]*?<NarrationPlaybackControls\s*\/>/,
    'navegacao e player precisam participar do mesmo fluxo de layout global'
  );
}

function auditNarrationSurfaces() {
  const folders = ['components', 'screens'];
  const surfaces = [];
  for (const folder of folders) {
    const absoluteFolder = path.join(ROOT, folder);
    const queue = [absoluteFolder];
    while (queue.length) {
      const current = queue.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(absolute);
          continue;
        }
        if (!entry.name.endsWith('.js')) continue;
        const source = fs.readFileSync(absolute, 'utf8');
        if (/\b(?:playPersonal|playPreview)\s*\(/.test(source)) {
          surfaces.push(path.relative(ROOT, absolute).replace(/\\/g, '/'));
        }
      }
    }
  }

  const requiredSurfaces = [
    'components/NarratorSelector.js',
    'screens/AffirmationAlarmScreen.js',
    'screens/AffirmationsScreen.js',
    'screens/DailyRitualScreen.js',
    'screens/ManifestationScreen.js',
    'screens/MorningRitualScreen.js',
    'screens/VisionPlayerScreen.js',
    'screens/VisionsScreen.js',
    'screens/onboarding/RevealScreen.js',
  ];
  for (const required of requiredSurfaces) {
    assert.ok(surfaces.includes(required), `superficie de audio esperada nao encontrada: ${required}`);
  }
  return surfaces.sort();
}

async function main() {
  const control = read(CONTROL_PATH);
  const context = read(CONTEXT_PATH);
  const app = read(APP_PATH);
  const reveal = read(REVEAL_PATH);
  const affirmations = read(AFFIRMATIONS_PATH);

  compile(CONTROL_PATH, control);
  compile(CONTEXT_PATH, context);
  compile(APP_PATH, app);

  assertContextContract(context);
  await assertAggregateMetrics(context);
  assertControlContract(control);
  assertRecoverySurfaceLabels(reveal, affirmations);
  assertGlobalIntegration(app);
  const surfaces = auditNarrationSurfaces();

  process.stdout.write(
    `Controles de audio OK: progresso, tempo, play/pause e 4 velocidades em ${surfaces.length} superficies globais.\n`
  );
}

try {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
