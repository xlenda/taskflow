// Portão das vozes da Celeste no Android: comportamento com a plataforma 'android' e um servidor de mentira.
//  1) bandeiras: a voz na nuvem existe no site e no Android; o resto da nuvem paga (imagens, sonho, Espelho Vivo) só
//     no site; o iPhone segue sem nuvem.
//  2) NarrationContext + generateNarrationAudio de verdade no Android: servidor ok → a voz escolhida toca do WAV
//     gravado no cache pelo expo-audio; recusa (403 native_attestation_required), rede ou teto de gasto → a voz do
//     aparelho lê com aviso honesto no player global; ela termina, pausa, continua e para como a da Celeste. No site e
//     na amostra de narrador nunca existe essa reserva.
//  3) usePersonalNarration no Android: disponível, o aceite fala só da voz (sem imagem), toca a voz escolhida.
//  4) telas no Android: revelação (escolha da voz, "Ouvir minha cena", denúncia), Perfil (voz e controle só da voz),
//     despertar (voz da Celeste com o aceite, denúncia) e toda tela que toca voz gerada tem a denúncia de IA.
//  5) imagens, cena, tradução e Espelho Vivo em nuvem continuam fora do Android (AppContext de verdade).
// Uso (cwd = C:\projetos\TaskFlow): node scripts/verificar-vozes-android.js
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// carrega um módulo do app com Babel trocando dependências por dublês (pelo texto do import); imports relativos que
// não têm dublê também passam pelo Babel
function loadWith(relative, mocks) {
  const cache = new Map();
  const compile = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    const code = transformSync(fs.readFileSync(file, 'utf8'), {
      filename: file,
      presets: ['babel-preset-expo'],
      sourceType: 'module',
    }).code;
    const loaded = new Module(file, module);
    loaded.filename = file;
    loaded.paths = Module._nodeModulePaths(path.dirname(file));
    cache.set(file, loaded);
    loaded._compile(code, file);
    return loaded.exports;
  };
  const original = Module._load;
  Module._load = (request, parent, isMain) => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    if (request.startsWith('.') && !/[\\/]node_modules[\\/]/.test(parent.filename)) {
      return compile(require.resolve(path.resolve(path.dirname(parent.filename), request)));
    }
    return original(request, parent, isMain);
  };
  try {
    return compile(path.join(root, relative));
  } finally {
    Module._load = original;
  }
}

// React de mentira: estado, refs, memo e efeitos na ordem do React; só o componente montado roda (os filhos ficam
// como elementos para o teste procurar pelas props)
function fakeReact() {
  let current = null;
  const changed = (prev, next) =>
    !prev || !next || prev.length !== next.length || next.some((value, i) => !Object.is(value, prev[i]));
  const slot = (make) => {
    const i = current.cursor++;
    if (!current.slots[i]) current.slots[i] = make();
    return current.slots[i];
  };
  const React = {
    useState(initial) {
      const instance = current;
      const state = slot(() => ({ value: typeof initial === 'function' ? initial() : initial }));
      state.set =
        state.set ||
        ((next) => {
          const value = typeof next === 'function' ? next(state.value) : next;
          if (Object.is(value, state.value)) return;
          state.value = value;
          instance.dirty = true;
        });
      return [state.value, state.set];
    },
    useRef: (initial) => slot(() => ({ current: initial })),
    useMemo(make, deps) {
      const memo = slot(() => ({}));
      if (!('value' in memo) || changed(memo.deps, deps)) Object.assign(memo, { value: make(), deps });
      return memo.value;
    },
    useCallback: (fn, deps) => React.useMemo(() => fn, deps),
    useEffect(effect, deps) {
      const instance = current;
      const hook = slot(() => ({ effect: true }));
      if (hook.ran && deps && !changed(hook.deps, deps)) return;
      Object.assign(hook, { ran: true, deps });
      instance.queue.push(() => {
        if (hook.cleanup) hook.cleanup();
        hook.cleanup = effect();
      });
    },
    createContext: () => ({ Provider: 'ContextProvider', Consumer: 'ContextConsumer' }),
    useContext: () => null,
    forwardRef: (render) => render,
    memo: (component) => component,
  };
  React.useLayoutEffect = React.useEffect;
  React.default = React;
  const element = (type, props, key) => ({ type, props: props || {}, key });
  const nodes = (node) =>
    Array.isArray(node)
      ? node.flatMap(nodes)
      : node && typeof node === 'object'
        ? [node, ...nodes(node.props.children)]
        : [];
  const mounted = new Set();
  function mount(Component, props) {
    const instance = { slots: [], cursor: 0, queue: [], dirty: false, props };
    mounted.add(instance);
    const render = () => {
      for (let pass = 0; pass < 40; pass++) {
        instance.dirty = false;
        instance.cursor = 0;
        current = instance;
        try {
          instance.tree = Component(instance.props);
        } finally {
          current = null;
        }
        instance.queue.splice(0).forEach((run) => run());
        if (!instance.dirty) return instance;
      }
      throw new Error('renderização em laço');
    };
    instance.all = (test) => nodes(instance.tree).filter(test);
    instance.where = (test) => nodes(instance.tree).find(test) || null;
    instance.byTestID = (testID) => instance.where((node) => node.props.testID === testID);
    instance.update = (next) => {
      instance.props = { ...instance.props, ...next };
      return render();
    };
    instance.flush = render;
    instance.unmount = () => {
      if (!mounted.delete(instance)) return;
      instance.slots.forEach((hook) => hook && hook.effect && hook.cleanup && hook.cleanup());
    };
    render();
    return instance;
  }
  // uma seção que falhou no meio não deixa efeito vivo (relógio da voz, timers) prendendo o processo
  const unmountAll = () => [...mounted].forEach((instance) => instance.unmount());
  return { React, jsxRuntime: { jsx: element, jsxs: element, Fragment: 'Fragment' }, mount, unmountAll };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(check, label, flush) {
  for (let i = 0; i < 300; i++) {
    if (flush) flush();
    if (check()) return;
    await tick();
  }
  throw new Error(`esperando: ${label}`);
}
const esDefault = (value) => ({ __esModule: true, default: value });
const textOf = (node) =>
  !node
    ? ''
    : typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : Array.isArray(node)
        ? node.map(textOf).join('')
        : node.props
          ? textOf(node.props.children)
          : '';
const ptOnly = (entry, vars = {}) =>
  String((entry && entry.pt) || '').replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));

// WAV de verdade (RIFF/WAVE, PCM 16 bits, 24 kHz): o que a rota /api/gerar-audio devolve
function waveBytes(samples = 2400) {
  const bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(36 + samples * 2, 4);
  bytes.write('WAVE', 8, 'ascii');
  bytes.write('fmt ', 12, 'ascii');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(24000, 24);
  bytes.writeUInt32LE(48000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'ascii');
  bytes.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i / 7) * 900), 44 + i * 2);
  return new Uint8Array(bytes);
}

function response(status, { body, json, contentType } = {}) {
  const bytes = body || Buffer.from(JSON.stringify(json || {}));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) =>
        name.toLowerCase() === 'content-type'
          ? contentType || (body ? 'audio/wav' : 'application/json')
          : name.toLowerCase() === 'content-length'
            ? String(bytes.length)
            : null,
    },
    text: async () => Buffer.from(bytes).toString('utf8'),
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}

const narratorsMock = {
  DEFAULT_NARRATOR_ID: 'aurora',
  NARRATORS: [{ id: 'aurora' }, { id: 'rio' }],
  isNarratorId: (id) => ['aurora', 'rio', 'atlas', 'serena', 'luma', 'nilo'].includes(id),
  narratorText: (value) => (value && value.pt) || '',
  narratorPreviewUrl: (id, lang) => `preview-${id}-${lang}`,
};

async function main() {
  const app = fakeReact();
  const base = { react: app.React, 'react/jsx-runtime': app.jsxRuntime };
  const platform = { OS: 'android', select: (choices) => choices[platform.OS] ?? choices.default };
  const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');
  let reportSurfaces = 0;
  // cada seção roda mesmo se outra falhar: o relatório mostra tudo o que quebrou
  const failures = [];
  const section = async (name, run) => {
    try {
      await run();
    } catch (error) {
      failures.push(`${name}: ${error && error.message ? error.message.split('\n')[0] : error}`);
      console.error(`✗ ${name}\n${error && error.stack ? error.stack : error}`);
    } finally {
      app.unmountAll();
      platform.OS = 'android';
    }
  };

  // ---------------------------------------------------------------------------------------------------------------
  // 1) bandeiras
  const flagsFor = (OS) => {
    platform.OS = OS;
    const { RELEASE_FEATURES } = loadWith('constants/releaseFeatures.js', { ...base, 'react-native': { Platform: platform } });
    return RELEASE_FEATURES;
  };
  const androidFlags = flagsFor('android');
  const webFlags = flagsFor('web');
  const iosFlags = flagsFor('ios');
  platform.OS = 'android';
  await section('1) bandeiras', () => {
    assert.strictEqual(androidFlags.cloudNarration, true, 'Android: a voz da Celeste na nuvem existe');
    assert.strictEqual(androidFlags.paidCloudProcessing, false, 'Android: imagens e o resto da nuvem paga seguem fora');
    assert.strictEqual(webFlags.cloudNarration, true, 'site: a voz da Celeste continua');
    assert.strictEqual(webFlags.paidCloudProcessing, true, 'site: o resto da nuvem continua');
    assert.strictEqual(iosFlags.cloudNarration, false, 'iPhone: sem voz na nuvem nesta versão');
    assert.strictEqual(iosFlags.paidCloudProcessing, false, 'iPhone: sem nuvem paga');
  });

  // ---------------------------------------------------------------------------------------------------------------
  // 2) NarrationContext + generateNarrationAudio de verdade
  await section('2) voz da Celeste e voz do aparelho', async () => {
    const disk = new Map(); // uri → bytes gravados no cache do aparelho
    class DeviceFile {
      constructor(dir, name) {
        this.uri = name === undefined ? String(dir) : `file:///${dir}/${name}`;
      }
      create() {}
      write(bytes) {
        disk.set(this.uri, Uint8Array.from(bytes));
      }
      get exists() {
        return disk.has(this.uri);
      }
      delete() {
        disk.delete(this.uri);
      }
      async bytes() {
        if (!disk.has(this.uri)) throw new Error('arquivo ausente');
        return disk.get(this.uri);
      }
    }
    const player = {
      calls: [],
      replace(source) {
        this.calls.push(['replace', source]);
      },
      play() {
        this.calls.push(['play']);
      },
      pause() {
        this.calls.push(['pause']);
      },
      setPlaybackRate(rate) {
        this.calls.push(['rate', rate]);
      },
      seekTo: async () => {},
    };
    const playerStatus = { playing: false, didJustFinish: false, playbackState: 'idle', currentTime: 0, duration: 0 };
    const speeches = [];
    const speechStops = [];
    const speechMock = {
      speak: (text, options) => speeches.push({ text, options }),
      stop: () => {
        speechStops.push(speeches.length);
        return Promise.resolve();
      },
    };
    const requests = [];
    const headerCalls = [];
    let attestation = 'issued';
    let server = async () => response(200, { body: waveBytes() });
    global.fetch = async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return server(url, init);
    };
    const narrationMocks = {
      ...base,
      'react-native': { Platform: platform },
      'expo-file-system': { File: DeviceFile, Paths: { cache: 'cache' } },
      'expo-audio': {
        setAudioModeAsync: async () => {},
        useAudioPlayer: () => player,
        useAudioPlayerStatus: () => playerStatus,
      },
      'expo-speech': speechMock,
      'expo-asset': {
        Asset: {
          fromModule: (id) => ({
            downloadAsync: async () => {
              if (String(id).includes('broken')) throw new Error('sem amostra');
              disk.set(`file:///bundle/${id}.wav`, waveBytes(120));
              return { localUri: `file:///bundle/${id}.wav`, uri: `file:///bundle/${id}.wav` };
            },
          }),
        },
      },
      // services/celesteApiSession (Task V2): no Android o token do Google é amarrado ao corpo exato do pedido; sem token
      // ele recusa antes de qualquer envio
      './celesteApiSession': {
        celestePaidApiHeaders: async (options) => {
          headerCalls.push(options);
          if (attestation === 'refused') {
            throw Object.assign(new Error('native_attestation_required'), { code: 'native_attestation_required' });
          }
          return { Authorization: 'Bearer sessao', 'X-Celeste-Client': 'android', 'X-Celeste-Integrity': 'token' };
        },
      },
      '../constants/narrators': { ...narratorsMock, narratorPreviewUrl: (id, lang) => (id === 'luma' ? 'broken' : `preview-${id}-${lang}`) },
      './narrationAudioStorage': {
        acquireNarrationAudio: async () => null,
        clearNarrationAudioStorage: async () => true,
        createNarrationAudioCacheKey: ({ text, narratorId, lang }) => `k:${narratorId}:${lang}:${text}`,
        NARRATION_AUDIO_MAX_IDLE_MS: 1e12,
        narrationAudioStorageEpoch: () => 0,
        narrationAudioStorageToken: async () => '0',
        saveNarrationAudio: async () => true,
      },
    };
    const { NarrationProvider } = loadWith('context/NarrationContext.js', narrationMocks);
    const voiceApp = app.mount(NarrationProvider, { children: null });
    const voice = () => voiceApp.where((node) => node.type === 'ContextProvider').props.value;
    const flushVoice = () => voiceApp.flush();
    const personal = (text, playbackId, narratorId = 'rio') =>
      voice().playPersonal({
        text,
        narratorId,
        lang: 'pt',
        cloudConsent: true,
        cloudConsentVersion: CLOUD_CONSENT_VERSION,
        adultConfirmed: true,
        playbackId,
      });

    // o player global, com o estado da narração de verdade
    const { default: PlaybackControls } = loadWith('components/NarrationPlaybackControls.js', {
      ...base,
      'react-native': {
        ActivityIndicator: 'ActivityIndicator',
        Pressable: 'Pressable',
        StyleSheet: { create: (styles) => styles },
        Text: 'Text',
        View: 'View',
        Platform: platform,
      },
      '@expo/vector-icons': { Ionicons: 'Ionicons' },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
      '../context/AppContext': { useApp: () => ({ state: { lang: 'pt' } }) },
      '../context/NarrationContext': { NARRATION_PLAYBACK_RATES: [0.75, 1, 1.25, 1.5], useNarration: () => voice() },
      '../ui/theme': { useTheme: () => new Proxy({}, { get: () => '#123456' }) },
    });
    const playerBar = () => app.mount(PlaybackControls, {});
    const deviceNotice = 'A voz escolhida não está disponível agora. Quem lê é a voz do aparelho.';

    // a) servidor ok: a voz escolhida toca do arquivo gravado no cache, pelo expo-audio (o mesmo caminho das amostras)
    const okText = 'Eu acordo com calma e escolho o próximo passo possível.';
    const okResult = await personal(okText, 'reveal:m1');
    flushVoice();
    assert.strictEqual(okResult.ok, true, 'servidor ok: a narração começa');
    assert.strictEqual(requests.length, 1, 'um pedido à rota da voz');
    assert.ok(String(requests[0].url).endsWith('/api/gerar-audio'), 'a rota da voz da Celeste');
    assert.deepStrictEqual(
      {
        mode: requests[0].body.mode,
        narratorId: requests[0].body.narratorId,
        text: requests[0].body.text,
        cloudConsent: requests[0].body.cloudConsent,
      },
      { mode: 'personal', narratorId: 'rio', text: okText, cloudConsent: true },
      'o pedido leva o texto e a voz que ela escolheu'
    );
    assert.strictEqual(headerCalls.length, 1, 'um pedido de cabeçalhos (sessão + verificação do Google)');
    assert.strictEqual(headerCalls[0].operation, 'audio', 'a verificação é pedida para a voz');
    assert.strictEqual(
      headerCalls[0].body,
      requests[0].init.body,
      'o token do Google é amarrado exatamente ao corpo que vai na rede'
    );
    const replaced = player.calls.find(([name, source]) => name === 'replace' && source);
    assert.ok(replaced && /^file:\/\/\/cache\/celeste-narration-.*\.wav$/.test(replaced[1].uri), 'o WAV vira arquivo no cache');
    assert.deepStrictEqual(Array.from(disk.get(replaced[1].uri)), Array.from(waveBytes()), 'o arquivo é o WAV da resposta');
    assert.ok(player.calls.some(([name]) => name === 'play'), 'o expo-audio toca o arquivo');
    assert.strictEqual(speeches.length, 0, 'com a voz da Celeste a voz do aparelho fica calada');
    assert.strictEqual(voice().voice, 'cloud', 'o contexto diz que é a voz da Celeste');
    playerStatus.playing = true;
    playerStatus.playbackState = 'playing';
    flushVoice();
    assert.strictEqual(voice().phase, 'playing');
    const cloudBar = playerBar();
    assert.ok(!cloudBar.byTestID('narration-device-voice-notice'), 'voz da Celeste: nenhum aviso de voz do aparelho');
    assert.ok(cloudBar.byTestID('narration-speed-1'), 'voz da Celeste: as velocidades ficam');
    voice().stop();
    playerStatus.playing = false;
    playerStatus.playbackState = 'idle';
    flushVoice();

    // b) recusa do servidor (sem verificação do Google), app sem token, rede fora, teto de gasto: a voz do aparelho lê,
    //    com aviso
    const refusals = [
      ['403 native_attestation_required', async () => response(403, { json: { error: 'native_attestation_required' } })],
      ['app sem o token do Google', async () => {
        throw new Error('o pedido não pode sair sem o token');
      }, 'refused'],
      ['rede fora', async () => {
        throw new TypeError('Network request failed');
      }],
      ['teto diário de gasto', async () => response(429, { json: { error: 'daily_generation_limit_reached' } })],
      ['guarda de gasto fora', async () => response(503, { json: { error: 'spend_guard_unavailable' } })],
    ];
    for (const [label, refusal, integrity = 'issued'] of refusals) {
      server = refusal;
      attestation = integrity;
      const text = `Eu respiro fundo (${label}) e sigo em paz.`;
      const before = speeches.length;
      const requestsBefore = requests.length;
      const pending = personal(text, `wake:${label}`);
      await until(() => speeches.length === before + 1, `${label}: a voz do aparelho começa`);
      const speech = speeches[before];
      assert.strictEqual(speech.text, text, `${label}: a voz do aparelho lê o mesmo texto`);
      assert.strictEqual(speech.options.language, 'pt-BR', `${label}: no idioma do texto`);
      speech.options.onStart();
      const result = await pending;
      flushVoice();
      assert.deepStrictEqual(
        { ok: result.ok, voice: result.voice },
        { ok: true, voice: 'device' },
        `${label}: o toque não fica sem voz`
      );
      assert.strictEqual(voice().voice, 'device', `${label}: o contexto diz que é a voz do aparelho`);
      if (integrity === 'refused') {
        assert.strictEqual(requests.length, requestsBefore, `${label}: sem o token do Google nada sai do aparelho`);
        assert.strictEqual(voice().error, null);
      }
      assert.strictEqual(voice().activePlaybackId, `wake:${label}`, `${label}: a mesma narração segue dona do play`);
      assert.strictEqual(voice().phase, 'playing', `${label}: tocando`);
      const bar = playerBar();
      assert.strictEqual(textOf(bar.byTestID('narration-device-voice-notice')), deviceNotice, `${label}: o player avisa`);
      assert.ok(!bar.byTestID('narration-speed-1'), `${label}: sem velocidades que a voz do aparelho não segue`);
      // termina como a da Celeste: o fim chega pelo lastCompletedPlaybackId (as telas marcam a prática por ele)
      speech.options.onDone();
      flushVoice();
      assert.strictEqual(voice().lastCompletedPlaybackId, `wake:${label}`, `${label}: o fim conta`);
      assert.strictEqual(voice().phase, 'idle');
      assert.strictEqual(voice().voice, null, `${label}: acabou, nenhuma voz`);
    }

    // o app sem o token do Google recusa com o mesmo código do servidor (e não um "áudio indisponível" genérico)
    const service = loadWith('services/generateNarrationAudio.js', narrationMocks);
    attestation = 'refused';
    await assert.rejects(
      service.requestNarrationAudio({
        mode: 'personal',
        narratorId: 'rio',
        lang: 'pt',
        text: 'Recusa do aparelho sem token.',
        cloudConsent: true,
        cloudConsentVersion: CLOUD_CONSENT_VERSION,
        adultConfirmed: true,
      }),
      (error) => error.code === 'native_attestation_required' && error.status === 403,
      'sem o token do Google: native_attestation_required (403)'
    );
    attestation = 'issued';

    // c) pausar e continuar a voz do aparelho (o Android não pausa a fala: para e retoma da última palavra dita)
    server = async () => response(403, { json: { error: 'native_attestation_required' } });
    const pauseText = 'Primeira frase calma. Segunda frase com coragem.';
    let before = speeches.length;
    let pending = personal(pauseText, 'vision:pausa');
    await until(() => speeches.length === before + 1, 'voz do aparelho para pausar');
    speeches[before].options.onStart();
    await pending;
    speeches[before].options.onBoundary({ charIndex: 22, charLength: 7 }); // "Segunda"
    flushVoice();
    assert.ok(voice().progress > 0.5 && voice().progress < 0.7, `a legenda segue a palavra dita (${voice().progress})`);
    const stopsBeforePause = speechStops.length;
    assert.strictEqual(voice().pause(), true, 'pausar a voz do aparelho funciona');
    flushVoice();
    assert.strictEqual(speechStops.length, stopsBeforePause + 1, 'pausar cala a voz do aparelho');
    assert.strictEqual(voice().phase, 'paused');
    assert.strictEqual(voice().activePlaybackId, 'vision:pausa', 'pausada, continua dona do play');
    before = speeches.length;
    assert.strictEqual(await voice().resume(), true, 'continuar funciona');
    assert.strictEqual(speeches.length, before + 1, 'continuar volta a falar');
    assert.strictEqual(speeches[before].text, 'Segunda frase com coragem.', 'continua da última palavra dita');
    speeches[before].options.onStart();
    flushVoice();
    assert.strictEqual(voice().phase, 'playing');
    const stopsBeforeStop = speechStops.length;
    voice().stop();
    flushVoice();
    assert.strictEqual(speechStops.length, stopsBeforeStop + 1, 'parar cala a voz do aparelho');
    assert.deepStrictEqual([voice().phase, voice().activePlaybackId, voice().voice], ['idle', null, null], 'parou de vez');

    // c2) motor que não avisa palavras (comum no Android): a legenda anda pelo relógio, no ritmo da voz do aparelho
    const realSetInterval = global.setInterval;
    const realClearInterval = global.clearInterval;
    const realNow = Date.now;
    const timers = [];
    let clock = 1_000_000;
    global.setInterval = (fn, ms) => timers.push({ fn, ms, live: true });
    global.clearInterval = (id) => {
      if (timers[id - 1]) timers[id - 1].live = false;
    };
    Date.now = () => clock;
    try {
      const clockText = 'Uma frase longa o bastante para a legenda andar pelo relógio da voz do aparelho.';
      before = speeches.length;
      pending = personal(clockText, 'daily-ritual:relogio');
      await until(() => speeches.length === before + 1, 'voz do aparelho sem avisos de palavra');
      speeches[before].options.onStart();
      await pending;
      flushVoice();
      clock += 2000;
      timers.filter((timer) => timer.live).forEach((timer) => timer.fn());
      flushVoice();
      const byClock = (2 * 14 * speeches[before].options.rate) / clockText.length;
      assert.ok(
        Math.abs(voice().progress - byClock) < 1e-9,
        `sem aviso de palavra: 14 letras/s no ritmo da voz (${voice().progress} ≠ ${byClock})`
      );
      voice().stop();
      flushVoice();
      assert.ok(timers.every((timer) => !timer.live), 'parou: o relógio da voz do aparelho para junto');
    } finally {
      global.setInterval = realSetInterval;
      global.clearInterval = realClearInterval;
      Date.now = realNow;
    }

    // c3) texto longo (dois trechos) recusado desde o começo: a voz do aparelho lê os dois e o fim conta
    const deviceFirst = 'Eu respiro devagar e escolho a calma de hoje. '.repeat(17).trim();
    const deviceSecond = 'E guardo um detalhe bonito para amanhã.';
    before = speeches.length;
    pending = personal(`${deviceFirst} ${deviceSecond}`, 'vision:longa');
    await until(() => speeches.length === before + 1, 'voz do aparelho no 1º trecho');
    assert.strictEqual(speeches[before].text, deviceFirst, 'o 1º trecho primeiro');
    speeches[before].options.onStart();
    assert.strictEqual((await pending).voice, 'device');
    speeches[before].options.onDone();
    flushVoice();
    assert.strictEqual(speeches.length, before + 2, 'o fim do 1º trecho começa o 2º');
    assert.strictEqual(speeches[before + 1].text, deviceSecond);
    assert.strictEqual(voice().lastCompletedPlaybackId, null, 'no meio, a narração ainda não terminou');
    speeches[before + 1].options.onStart();
    speeches[before + 1].options.onDone();
    flushVoice();
    assert.strictEqual(voice().lastCompletedPlaybackId, 'vision:longa', 'o fim do último trecho conta');

    // d) a voz do aparelho também falhou: o resultado diz (a tela mostra o aviso de ler o texto de sempre)
    before = speeches.length;
    pending = personal('Eu escolho a leveza hoje.', 'affirmations:a1');
    await until(() => speeches.length === before + 1, 'voz do aparelho que vai falhar');
    speeches[before].options.onError(new Error('sem voz no aparelho'));
    const failed = await pending;
    flushVoice();
    assert.strictEqual(failed.ok, false, 'nenhuma voz tocou: o resultado não finge');
    assert.strictEqual(voice().phase, 'error');

    // e) a voz da Celeste quebrou no meio (2º trecho recusado): a do aparelho lê o resto
    server = async () => response(200, { body: waveBytes() });
    // mais de 800 letras: dois trechos (o servidor gera até 800 por pedido)
    const firstChunk = 'Eu caminho devagar pela praia ao amanhecer. '.repeat(18).trim();
    const secondChunk = 'No fim do dia eu agradeço o que mudou em mim.';
    const longText = `${firstChunk} ${secondChunk}`;
    let served = 0;
    server = async () => {
      served += 1;
      return served === 1 ? response(200, { body: waveBytes() }) : response(403, { json: { error: 'native_attestation_required' } });
    };
    before = speeches.length;
    const longResult = await personal(longText, 'manifestation:m1');
    flushVoice();
    assert.strictEqual(longResult.voice, 'cloud', 'o 1º trecho toca com a voz da Celeste');
    playerStatus.playing = true;
    playerStatus.playbackState = 'playing';
    flushVoice();
    playerStatus.playing = false;
    playerStatus.didJustFinish = true;
    playerStatus.playbackState = 'ended';
    flushVoice();
    await until(() => speeches.length === before + 1, 'a voz do aparelho assume o 2º trecho', flushVoice);
    assert.strictEqual(speeches[before].text, secondChunk, 'a voz do aparelho lê só o que faltava');
    playerStatus.didJustFinish = false;
    playerStatus.playbackState = 'idle';
    speeches[before].options.onStart();
    flushVoice();
    assert.strictEqual(voice().voice, 'device');
    speeches[before].options.onDone();
    flushVoice();
    assert.strictEqual(voice().lastCompletedPlaybackId, 'manifestation:m1', 'a história inteira conta como ouvida');

    // f) amostra de narrador que falha nunca vira voz do aparelho (a amostra é a voz da Celeste ou nada)
    before = speeches.length;
    const preview = await voice().playPreview('luma', 'pt', 'narrator-preview:luma:pt');
    flushVoice();
    assert.strictEqual(preview.ok, false, 'amostra quebrada: o erro de sempre');
    assert.strictEqual(speeches.length, before, 'amostra nunca cai na voz do aparelho');

    // g) no site a reserva não existe: a falha continua sendo o aviso honesto de ler o texto
    platform.OS = 'web';
    server = async () => response(503, { json: { error: 'spend_guard_unavailable' } });
    before = speeches.length;
    const web = await personal('Texto do site que não vira voz do aparelho.', 'reveal:web');
    flushVoice();
    assert.strictEqual(web.ok, false, 'site: a falha aparece');
    assert.strictEqual(speeches.length, before, 'site: nenhuma voz do aparelho');
    assert.strictEqual(voice().voice, null);
    platform.OS = 'android';
    voiceApp.unmount();
  });

  // ---------------------------------------------------------------------------------------------------------------
  // 3) usePersonalNarration + aceite no Android
  const confirmations = [];
  const savedProfiles = [];
  let answer = true;
  const voiceRequests = [];
  const narrationDouble = {
    phase: 'idle',
    activePlaybackId: null,
    prime() {},
    stop() {},
    playPersonal: async (request) => {
      voiceRequests.push(request);
      return { ok: true, playbackId: request.playbackId, voice: 'cloud' };
    },
  };
  const appState = {
    lang: 'pt',
    narration: { narratorId: 'rio' },
    profile: { name: 'Ana', age: '25-34' },
    manifestations: [],
  };
  const hookMocks = (flags) => ({
    ...base,
    'react-native': { Platform: platform },
    '../context/AppContext': { useApp: () => ({ state: appState, saveProfile: (patch) => savedProfiles.push(patch) }) },
    '../context/NarrationContext': { useNarration: () => narrationDouble },
    '../constants/narrators': narratorsMock,
    '../constants/releaseFeatures': { RELEASE_FEATURES: flags },
    '../services/generatePersonalizedScene': { redactThirdPartyNames: (text) => text, thirdPartyNames: () => [] },
    '../screens/onboarding/flow': { isUnder18Age: (age) => age === 'under18' },
    './confirm': {
      confirmAsync: async (request) => {
        confirmations.push(request);
        return answer;
      },
    },
  });
  const hookFor = (flags) => {
    const { usePersonalNarration } = loadWith('utils/usePersonalNarration.js', hookMocks(flags));
    let hook = null;
    app.mount(() => {
      hook = usePersonalNarration();
      return null;
    }, {});
    return hook;
  };
  await section('3) narração pessoal e aceite', async () => {
    const androidVoice = hookFor(androidFlags);
    assert.strictEqual(androidVoice.personalNarrationAvailable, true, 'Android: a narração pessoal existe');
    const heard = await androidVoice.playPersonal({ text: 'Minha cena de hoje.', lang: 'pt', playbackId: 'reveal:m9' });
    assert.strictEqual(heard.ok, true, 'Android: ouvir funciona depois do aceite');
    assert.strictEqual(confirmations.length, 1, 'o aceite é pedido uma vez, no toque');
    const consentMessage = confirmations[0].message;
    assert.match(consentMessage, /ElevenLabs/, 'o aceite nomeia quem cria a voz');
    assert.match(consentMessage, /18 anos ou mais/, 'o aceite confirma 18+');
    assert.doesNotMatch(consentMessage, /Gemini|imagens pessoais|imagem pessoal/i, 'Android: o aceite fala só da voz');
    assert.doesNotMatch(confirmations[0].title, /imagens/i, 'Android: o título fala só da voz');
    assert.ok(savedProfiles.length === 1 && savedProfiles[0].cloudNarrationConsent === true, 'o aceite fica guardado');
    assert.strictEqual(voiceRequests[0].narratorId, 'rio', 'toca a voz que ela escolheu');
    assert.strictEqual(voiceRequests[0].cloudConsentVersion, CLOUD_CONSENT_VERSION);
    // no site o aceite continua o mesmo (voz e imagens)
    confirmations.length = 0;
    await hookFor(webFlags).playPersonal({ text: 'Cena do site.', lang: 'pt', playbackId: 'reveal:w1' });
    assert.match(confirmations[0].message, /Google Gemini/, 'site: o aceite continua falando das imagens');
    // iPhone: sem voz na nuvem, sem pedido de aceite
    confirmations.length = 0;
    const iosVoice = hookFor(iosFlags);
    assert.strictEqual(iosVoice.personalNarrationAvailable, false, 'iPhone: sem narração pessoal');
    const iosResult = await iosVoice.playPersonal({ text: 'x y', lang: 'pt', playbackId: 'reveal:i1' });
    assert.deepStrictEqual([iosResult.ok, confirmations.length], [false, 0], 'iPhone: nada de aceite nem nuvem');
  });

  // ---------------------------------------------------------------------------------------------------------------
  // 4) telas no Android
  const story = 'Eu acordo perto do mar. O café passa sem pressa e eu escolho a calma.';
  const consentedProfile = {
    age: '25-34',
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    cloudPersonalization: true,
    cloudAdultConfirmed: true,
    cloudNarrationConsent: true,
    cloudDreamConsent: true,
  };
  await section('4) telas', async () => {
    const RN = {
      View: 'View',
      Text: 'Text',
      TextInput: 'TextInput',
      Pressable: 'Pressable',
      ScrollView: 'ScrollView',
      Switch: 'Switch',
      ActivityIndicator: 'ActivityIndicator',
      KeyboardAvoidingView: 'KeyboardAvoidingView',
      Linking: { openURL: async () => {} },
      StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
      Platform: platform,
      AppState: { addEventListener: () => ({ remove() {} }) },
      AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false) },
      useWindowDimensions: () => ({ width: 400, height: 800 }),
      Animated: {
        Value: class {
          setValue() {}
          interpolate() {
            return 0;
          }
        },
        View: 'AnimatedView',
        spring: () => ({ start() {} }),
        timing: () => ({ start() {} }),
      },
    };
    const theme = new Proxy({ dark: false, spacing: {} }, { get: (target, key) => (key in target ? target[key] : '#123456') });
    const screenBase = {
      ...base,
      'react-native': RN,
      '@expo/vector-icons': { Ionicons: 'Ionicons' },
      'expo-haptics': {
        impactAsync: () => Promise.resolve(),
        notificationAsync: () => Promise.resolve(),
        selectionAsync: () => Promise.resolve(),
        ImpactFeedbackStyle: {},
        NotificationFeedbackType: {},
      },
      'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 0 }) },
    };
    // o hook de verdade (bandeiras do Android) por cima de uma narração dublê: a tela mostra o que o Android oferece
    const realHook = (prefix) => ({
      [`${prefix}utils/usePersonalNarration`]: loadWith('utils/usePersonalNarration.js', {
        ...hookMocks(androidFlags),
        './useCloudMediaConsent': {
          useCloudMediaConsent: () => ({ ensureCloudMediaConsent: async () => ({ ok: true, profile: appState.profile }) }),
        },
      }),
    });

    // 4a) revelação: escolher a voz, "Ouvir minha cena" com a voz escolhida, denúncia de IA da cena
    const revealState = {
      ...appState,
      manifestations: [
        {
          id: 'm1',
          title: 'Viver perto do mar',
          story,
          affirmation: 'Eu escolho a paz.',
          anchorIdentity: 'Uma pessoa calma',
          anchorStep: 'Caminhar 5 minutos',
          anchorOpenedAt: '2026-10-01T10:00:00.000Z',
          category: 'Peace',
          lang: 'pt',
          visual: null,
          generation: { source: 'remote', model: 'm', promptVersion: 'v' },
          personalizedWith: [],
        },
      ],
    };
    voiceRequests.length = 0;
    const { default: RevealScreen } = loadWith('screens/onboarding/RevealScreen.js', {
      ...screenBase,
      ...realHook('../../'),
      './onboardingUI': { OnbScreen: 'OnbScreen', ContinueButton: 'ContinueButton', serifStyle: () => ({}) },
      '../../constants/brand': { ONB: new Proxy({}, { get: () => '#123456' }), SERIF: 'serif' },
      '../../utils/useT': { useT: () => ({ t: ptOnly, lang: 'pt' }) },
      '../../context/AppContext': {
        useApp: () => ({
          state: revealState,
          personalVisualStatus: {},
          ensurePersonalVisual: async () => ({ ok: false }),
          setNarrator() {},
          updateManifestation() {},
          markStoreReviewRequested() {},
        }),
      },
      '../../utils/useCloudMediaConsent': { useCloudMediaConsent: () => ({ withCloudMediaConsent: async () => ({}) }) },
      '../../components/CelestialTrace': esDefault('CelestialTrace'),
      '../../components/cenaViva/CenaViva': esDefault('CenaViva'),
      '../../components/cenaViva/imageSource': { imageUriForCenaViva: async () => 'scene.jpg' },
      '../../components/NarratorSelector': esDefault('NarratorSelector'),
      '../../components/AiContentReportAction': esDefault('AiContentReportAction'),
      '../../components/ShareSheet': { useShareSheet: () => ({ isOpen: false, sheet: null, open() {} }) },
      '../../constants/narrators': narratorsMock,
      '../../utils/storeReview': { maybeRequestStoreReview: async () => {} },
      '../../utils/readyScene': { pickReadyScene: () => ({ id: 'beach-Peace' }) },
      '../../utils/usePersonalVisual': { usePersonalVisual: () => null },
    });
    const reveal = app.mount(RevealScreen, { navigation: { replace() {}, reset() {} }, route: { params: { id: 'm1' } } });
    await until(() => reveal.where((node) => node.type === 'CenaViva'), 'cena da revelação', () => reveal.flush());
    assert.ok(reveal.where((node) => node.type === 'NarratorSelector'), 'Android: a revelação oferece a escolha da voz');
    const listen = reveal.where((node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Ouvir minha cena');
    assert.ok(listen, 'Android: "Ouvir minha cena" aparece');
    const revealReport = reveal.where((node) => node.type === 'AiContentReportAction');
    assert.ok(revealReport, 'a revelação tem a denúncia de conteúdo de IA');
    assert.deepStrictEqual(
      {
        contentType: revealReport.props.contentType,
        contentRef: revealReport.props.contentRef,
        content: revealReport.props.content,
        lang: revealReport.props.lang,
      },
      { contentType: 'scene', contentRef: 'manifestation:m1:pt', content: story, lang: 'pt' },
      'a denúncia leva a história gerada que a voz conta'
    );
    await listen.props.onPress();
    assert.strictEqual(voiceRequests.length, 1, 'o toque pede a voz');
    assert.deepStrictEqual(
      [voiceRequests[0].narratorId, voiceRequests[0].playbackId],
      ['rio', 'reveal:m1'],
      'a cena toca na voz escolhida'
    );
    reveal.unmount();

    // 4b) Perfil no Android: a escolha da voz e um controle só da voz (o aceite dela não é apagado)
    const profileSaves = [];
    const consentAsks = [];
    let profileState = { lang: 'pt', name: 'Ana', mood: 'blossom', narration: { narratorId: 'rio' }, profile: consentedProfile };
    const profileMocks = (flags) => ({
      ...screenBase,
      '../context/AppContext': {
        useApp: () => ({
          state: profileState,
          loading: false,
          setName() {},
          setLang() {},
          setMood() {},
          setNarrator() {},
          saveProfile: (patch) => profileSaves.push(patch),
        }),
      },
      '../ui/theme': { useTheme: () => theme, useSetTheme: () => () => {} },
      '../utils/useT': { useT: () => ({ t: ptOnly, lang: 'pt' }) },
      '../utils/colors': { accentAt: () => '#123456', alpha: () => '#123456' },
      '../utils/confirm': { confirmAsync: async () => false },
      '../utils/useCloudMediaConsent': {
        useCloudMediaConsent: () => ({
          ensureCloudMediaConsent: async () => {
            consentAsks.push(true);
            return { ok: true };
          },
        }),
      },
      '../constants/brand': { APP_NAME: 'Celeste', APP_URL: 'https://celeste.example' },
      '../constants/releaseFeatures': { RELEASE_FEATURES: flags },
      '../constants/legal': { LEGAL_UPDATED: { pt: '', en: '' }, PRIVACY_SECTIONS: [], SUPPORT_EMAIL: 'a@b.c', TERMS_SECTIONS: [] },
      '../services/aiContentReports': { deleteAllAiContentReports: async () => ({ ok: true }) },
      '../components/NarratorSelector': esDefault('NarratorSelector'),
      './onboarding/flow': { isUnder18Age: (age) => age === 'under18' },
    });
    const { default: AndroidProfile } = loadWith('screens/ProfileScreen.js', profileMocks(androidFlags));
    const profile = app.mount(AndroidProfile, { navigation: { addListener: () => () => {}, canGoBack: () => true } });
    assert.ok(profile.where((node) => node.type === 'NarratorSelector'), 'Android: o Perfil oferece a escolha da voz');
    const cloudSwitch = profile.byTestID('profile-gemini-switch');
    assert.ok(cloudSwitch, 'Android: o Perfil tem o controle da voz na nuvem (para desligar o que ela aceitou)');
    const switchCopy = `${cloudSwitch.props.accessibilityLabel} ${cloudSwitch.props.accessibilityHint}`;
    assert.match(switchCopy, /ElevenLabs/, 'o controle diz quem cria a voz');
    assert.doesNotMatch(switchCopy, /Gemini|Anthropic|OpenAI|imagens/i, 'Android: o controle fala só da voz');
    assert.strictEqual(cloudSwitch.props.accessibilityState.checked, true, 'o aceite dado aparece ligado');
    assert.ok(
      !profileSaves.some((patch) => patch.cloudNarrationConsent === false),
      'Android: abrir o Perfil não apaga o aceite da voz'
    );
    profileState = { ...profileState, profile: { age: '25-34' } };
    profile.update({});
    await profile.byTestID('profile-gemini-switch').props.onPress();
    assert.strictEqual(consentAsks.length, 1, 'ligar no Android pede o mesmo aceite da voz do "Ouvir"');
    profile.unmount();
    // iPhone: nada de voz na nuvem no Perfil, e um aceite antigo é apagado como antes
    profileState = { ...profileState, profile: consentedProfile };
    profileSaves.length = 0;
    const { default: IosProfile } = loadWith('screens/ProfileScreen.js', profileMocks(iosFlags));
    const iosProfile = app.mount(IosProfile, { navigation: { addListener: () => () => {}, canGoBack: () => true } });
    assert.ok(!iosProfile.where((node) => node.type === 'NarratorSelector'), 'iPhone: sem escolha de voz');
    assert.ok(!iosProfile.byTestID('profile-gemini-switch'), 'iPhone: sem controle de nuvem');
    assert.ok(profileSaves.some((patch) => patch.cloudNarrationConsent === false), 'iPhone: aceite antigo sai');
    iosProfile.unmount();

    // 4c) despertar no Android: com o aceite, a voz da Celeste; a denúncia de IA do item que toca
    const wakeItem = {
      kind: 'anchor',
      id: 'anchor:m1',
      title: 'Cena-Âncora',
      text: story,
      lang: 'pt',
      category: 'Peace',
      visualKey: null,
      manifestationId: 'm1',
    };
    voiceRequests.length = 0;
    const { default: WakeSequenceScreen } = loadWith('screens/WakeSequenceScreen.js', {
      ...screenBase,
      ...realHook('../'),
      'expo-speech': { speak() {}, stop: () => Promise.resolve() },
      'expo-keep-awake': { activateKeepAwakeAsync: () => Promise.resolve(), deactivateKeepAwake() {} },
      '@react-navigation/native': {
        useIsFocused: () => true,
        useNavigation: () => ({ canGoBack: () => true, goBack() {}, navigate() {} }),
      },
      '../components/CelestialTrace': esDefault('CelestialTrace'),
      '../components/PrimaryButton': esDefault('PrimaryButton'),
      '../components/NarratedScene': esDefault('NarratedScene'),
      '../components/AiContentReportAction': esDefault('AiContentReportAction'),
      '../components/cenaViva/imageSource': { imageUriForCenaViva: async () => 'scene.jpg' },
      '../constants/brand': { SERIF: 'serif' },
      '../context/AppContext': { useApp: () => ({ state: { ...appState, profile: consentedProfile } }) },
      '../ui/theme': { useTheme: () => theme },
      '../utils/colors': { accentAt: () => '#123456', alpha: () => '#123456' },
      '../utils/readyScene': { pickReadyScene: () => ({ id: 'beach-Peace' }) },
      '../utils/useCloudMediaConsent': { hasUnifiedCloudMediaConsent: (profileValue) => profileValue?.cloudNarrationConsent === true },
      '../utils/usePersonalVisual': { usePersonalVisual: () => null },
      '../utils/useT': { useT: () => ({ t: ptOnly, lang: 'pt' }) },
      '../utils/wakeSequence': { wakeSequenceItemsForState: () => [wakeItem] },
    });
    const wake = app.mount(WakeSequenceScreen, {});
    const trace = wake.where((node) => node.type === 'CelestialTrace');
    trace.props.onFinalStar();
    trace.props.onComplete();
    wake.flush();
    await until(() => voiceRequests.length === 1, 'Android com o aceite: o despertar usa a voz da Celeste', () => wake.flush());
    const wakeReport = wake.where((node) => node.type === 'AiContentReportAction');
    assert.ok(wakeReport, 'o despertar tem a denúncia de conteúdo de IA');
    assert.deepStrictEqual(
      [wakeReport.props.contentType, wakeReport.props.content, wakeReport.props.contentRef],
      ['scene', story, 'manifestation:m1:pt'],
      'a denúncia leva o que a voz está dizendo'
    );
    wake.unmount();

    // 4e) criar uma manifestação no Android: a cena nasce no aparelho e o aceite da voz continua (no iPhone, sem nuvem
    //     nenhuma, o que sobrou sai como antes)
    async function createManifestationOn(flags) {
      const saves = [];
      const created = [];
      const { default: HomeScreen } = loadWith('screens/HomeScreen.js', {
        ...screenBase,
        'react-native': { ...RN, TouchableOpacity: 'TouchableOpacity', Keyboard: { dismiss() {} } },
        '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async () => null } },
        '@react-navigation/native': { useIsFocused: () => true, useNavigation: () => ({ navigate() {} }) },
        '../ui/kit': { Screen: 'Screen', Header: 'Header', Card: 'Card', EmptyState: 'EmptyState', Button: 'Button' },
        '../ui/theme': { useTheme: () => theme },
        '../context/AppContext': {
          useApp: () => ({
            state: { lang: 'pt', name: 'Ana', manifestations: [], profile: consentedProfile, morningRitual: {}, practicePlan: {} },
            loading: false,
            derived: { streak: 0 },
            addManifestation: async (data) => {
              created.push(data);
              return null;
            },
            togglePractice() {},
            saveProfile: (patch) => saves.push(patch),
          }),
        },
        '../constants/content': { CATEGORIES: [], categoryMeta: () => ({ accent: 0, icon: 'leaf' }) },
        '../constants/brand': { APP_NAME: 'Celeste' },
        '../constants/releaseFeatures': { RELEASE_FEATURES: flags },
        '../constants/i18n': { txt: (value) => (value && value.pt) || value, tr: (value) => value.pt, detectLang: () => 'pt' },
        '../utils/colors': { accentAt: () => '#123456', alpha: () => '#123456' },
        '../utils/date': { todayISO: () => '2026-10-21' },
        '../utils/confirm': { confirmAsync: async () => true },
        '../utils/useT': { useT: () => ({ t: ptOnly, lang: 'pt' }) },
        './onboarding/flow': { isUnder18Age: () => false },
        '../utils/dailyRitual': { selectDailyRitual: () => null },
        '../utils/practicePlan': { currentPracticeSlot: () => null, practiceSlotsInDayOrder: () => [] },
        '../utils/wakeSequence': { wakeSequenceItemsForState: () => [] },
        '../components/GradientCover': esDefault('GradientCover'),
        '../components/CelesteMascot': esDefault('CelesteMascot'),
        '../components/ManifestCard': esDefault('ManifestCard'),
        '../components/SectionHeading': esDefault('SectionHeading'),
      });
      const home = app.mount(HomeScreen, {});
      const field = () => home.where((node) => node.type === 'TextInput' && node.props.onSubmitEditing);
      field().props.onChangeText('Viver perto do mar');
      home.flush();
      await field().props.onSubmitEditing();
      home.unmount();
      return { saves, created };
    }
    const androidHome = await createManifestationOn(androidFlags);
    assert.strictEqual(androidHome.created.length, 1, 'a manifestação é criada');
    assert.strictEqual(androidHome.created[0].profile.cloudPersonalization, false, 'Android: a cena nasce no aparelho');
    assert.ok(
      !androidHome.saves.some((patch) => patch.cloudNarrationConsent === false),
      'Android: criar uma manifestação não apaga o aceite da voz'
    );
    const iosHome = await createManifestationOn(iosFlags);
    assert.ok(iosHome.saves.some((patch) => patch.cloudNarrationConsent === false), 'iPhone: o aceite antigo sai');

    // 4d) toda tela que toca a voz gerada (playPersonal) oferece a denúncia de IA, com um tipo aceito pelo servidor
    const allowedTypes = new Set(['scene', 'dream', 'vision', 'affirmation']);
    const screenFiles = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(relative);
        else if (entry.name.endsWith('.js')) screenFiles.push(relative);
      }
    };
    walk('screens');
    const narrationSurfaces = screenFiles.filter((file) => /\bplayPersonal\s*\(/.test(read(file)));
    reportSurfaces = narrationSurfaces.length;
    for (const required of [
      'screens/AffirmationsScreen.js',
      'screens/DailyRitualScreen.js',
      'screens/ManifestationScreen.js',
      'screens/MorningRitualScreen.js',
      'screens/PracticeRitualScreen.js',
      'screens/VisionPlayerScreen.js',
      'screens/VisionsScreen.js',
      'screens/WakeSequenceScreen.js',
      'screens/onboarding/RevealScreen.js',
    ]) {
      assert.ok(narrationSurfaces.includes(required), `tela com voz não encontrada: ${required}`);
    }
    for (const file of narrationSurfaces) {
      const source = read(file);
      assert.match(source, /import AiContentReportAction from '(?:\.\.\/)+components\/AiContentReportAction'/, `${file}: importa a denúncia`);
      const uses = [...source.matchAll(/<AiContentReportAction\b[\s\S]*?\/>/g)].map((match) => match[0]);
      assert.ok(uses.length > 0, `${file}: a voz gerada toca aqui e falta a denúncia de IA`);
      for (const use of uses) {
        const expression = (/contentType=(\{[^}]*\}|"[^"]*")/.exec(use) || [])[1] || '';
        const types = [...expression.matchAll(/["']([a-z-]+)["']/g)].map((match) => match[1]);
        assert.ok(types.some((type) => allowedTypes.has(type)), `${file}: contentType aceito pelo servidor`);
      }
    }
  });

  // ---------------------------------------------------------------------------------------------------------------
  // 5) imagens, cena, tradução e Espelho Vivo em nuvem continuam fora do Android (AppContext de verdade)
  await section('5) nuvem paga fora do Android', async () => {
    async function cloudCallsFor(flags) {
      const calls = { scene: 0, visual: 0, translate: 0 };
      const stored = {
        lang: 'pt',
        onboarded: true,
        anchorSceneId: 'm1',
        profile: { name: 'Ana', ...consentedProfile },
        manifestations: [
          {
            id: 'm1',
            title: 'Viver perto do mar',
            story,
            affirmation: 'Eu escolho a paz.',
            category: 'Peace',
            lang: 'pt',
            origin: 'onboarding-anchor',
            createdAt: '2026-10-01',
            sessions: [],
            evidence: [],
            goalDays: 21,
          },
        ],
      };
      const storage = new Map([['@stella_state_v2', JSON.stringify(stored)]]);
      const asyncStorage = {
        getItem: async (key) => (storage.has(key) ? storage.get(key) : null),
        setItem: async (key, value) => storage.set(key, value),
        removeItem: async (key) => storage.delete(key),
        multiRemove: async (keys) => keys.forEach((key) => storage.delete(key)),
      };
      const never = () => new Promise(() => {});
      const { AppProvider } = loadWith('context/AppContext.js', {
        ...base,
        'react-native': { Platform: platform, AppState: { addEventListener: () => ({ remove() {} }) } },
        '@react-native-async-storage/async-storage': { __esModule: true, default: asyncStorage },
        '../constants/narrators': narratorsMock,
        './narrators': narratorsMock,
        '../constants/releaseFeatures': { RELEASE_FEATURES: flags },
        '../services/generatePersonalizedScene': {
          generatePersonalizedScene: () => {
            calls.scene += 1;
            return never();
          },
        },
        '../services/generatePersonalizedVisual': {
          generatePersonalizedVisual: () => {
            calls.visual += 1;
            return never();
          },
        },
        '../services/translateManifestationScene': {
          translateManifestationScene: () => {
            calls.translate += 1;
            return never();
          },
        },
        '../services/personalVisualStorage': {
          acquirePersonalVisual: async () => null,
          clearPersonalVisuals: async () => {},
          createPersonalVisualCacheKey: () => 'k',
          deletePersonalVisual: async () => {},
          isPersonalVisualCacheKey: () => false,
          savePersonalVisual: async () => {},
        },
        '../services/communityStories': {
          beginCommunityDataReset: async () => {},
          cancelCommunityDataReset: async () => {},
          exportLocalCommunityStoriesForBackup: async () => [],
          finishCommunityDataReset: async () => {},
          restoreLocalCommunityStoriesFromBackup: async () => {},
          validateLocalCommunityStoriesBackup: () => true,
        },
        '../services/dailyRitualReminder': {
          cancelDailyRitualReminder: async () => {},
          cancelOrphanedDailyRitualReminders: async () => {},
        },
        '../services/practicePlanReminders': { cancelPracticePlanReminders: async () => ({ ok: true }) },
        '../services/affirmationAlarm': {
          cancelAffirmationAlarm: async () => ({ ok: true }),
          getAffirmationAlarmCapability: async () => null,
        },
      });
      const provider = app.mount(AppProvider, { children: null });
      const context = () => provider.where((node) => node.type === 'ContextProvider').props.value;
      await until(() => context().state, 'estado carregado', () => provider.flush());
      for (let i = 0; i < 10; i++) {
        await tick();
        provider.flush();
      }
      void context().ensurePersonalVisual('m1', { force: true });
      for (let i = 0; i < 10; i++) {
        await tick();
        provider.flush();
      }
      const visualStatus = context().personalVisualStatus.m1 || null;
      // trocar o idioma traduz as cenas na nuvem só onde ela existe (a tradução começa 350 ms depois)
      context().setLang('en');
      provider.flush();
      await new Promise((resolve) => setTimeout(resolve, 500));
      provider.flush();
      provider.unmount();
      return { calls, visualStatus };
    }
    const androidCloud = await cloudCallsFor(androidFlags);
    assert.deepStrictEqual(
      androidCloud.calls,
      { scene: 0, visual: 0, translate: 0 },
      'Android com o aceite da voz: nenhuma cena, imagem ou tradução em nuvem'
    );
    assert.strictEqual(androidCloud.visualStatus, null, 'Android: nada de "Ativar minha imagem" para o que o app não faz');
    const webCloud = await cloudCallsFor(webFlags);
    assert.ok(
      webCloud.calls.scene > 0 && webCloud.calls.visual > 0 && webCloud.calls.translate > 0,
      `site com o aceite: cena, imagem e tradução em nuvem seguem (${JSON.stringify(webCloud.calls)})`
    );
  });

  if (failures.length) {
    throw new Error(`Vozes da Celeste no Android falharam (${failures.length}):\n  - ${failures.join('\n  - ')}`);
  }
  console.log(
    'Vozes da Celeste no Android OK: voz escolhida pelo arquivo no cache, voz do aparelho com aviso (recusa, rede, teto), ' +
      `escolha de voz, denúncia em ${reportSurfaces} telas com voz e imagens fora do Android.`
  );
}

// Uma promessa que nunca se resolve (a voz esperando um início que não vem) esvazia o laço do Node e ele sai com 0:
// aqui isso é falha, nunca aprovação.
let finished = false;
process.on('exit', () => {
  if (finished) return;
  console.error('Vozes da Celeste no Android: o portão não terminou (alguma espera ficou pendurada).');
  process.exitCode = 1;
});
main()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(() => {
    finished = true;
  });
