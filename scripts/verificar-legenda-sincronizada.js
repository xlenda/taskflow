// Portão da legenda no ritmo da voz da Celeste ("Sua história", revelação, visões...): a palavra aparece quando a
// voz começa a dizê-la, não quando uma conta por letras acha que ela disse. Medido em 21/10: a conta por letras
// (tempo do trecho × letras) deixava as palavras 0,5 a 1 s atrás da voz numa história em português.
//  1) servidor (api/gerar-audio.js de verdade, ElevenLabs de mentira): pede a voz com o tempo de cada letra
//     (/with-timestamps) e devolve o WAV de sempre com esses tempos num pedaço 'ctim' depois do som (tamanho ímpar com
//     o byte de preenchimento); alinhamento de outro texto ou que não cabe no som não vira tempo; um 200 sem o rótulo
//     JSON é lido; se a rota com tempo recusar ou falhar sem cobrar (404/500/503), a voz vem pela rota de antes, sem
//     tempo; conta, limite e o que pode ter sido cobrado (401/429/502/504/tempo esgotado) nunca pedem de novo.
//  2) app (NarrationContext de verdade, no site e no Android): com os tempos, a legenda vai até o fim da palavra que a
//     voz começou (no 0 do áudio, nada) e ESPERA na pausa entre as frases (a conta por letras seguia andando); a
//     palavra nova entra no quadro seguinte, sem esperar o próximo timeupdate/status (no Android só se o status diz que
//     está tocando); fica abaixo de 1 até o som acabar; pausa e parada não deixam quadro agendado; áudio guardado antes
//     (sem o pedaço) segue por letras; com dois trechos, o espaço entre eles conta e a legenda cai na letra certa.
// Uso (cwd = C:\projetos\TaskFlow): node scripts/verificar-legenda-sincronizada.js
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');

// carrega um módulo do app com Babel trocando dependências por dublês (pelo texto do import)
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

// React de mentira (estado, refs, memo e efeitos na ordem do React) só para montar o NarrationProvider
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
  };
  React.default = React;
  const element = (type, props, key) => ({ type, props: props || {}, key });
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
    instance.flush = render;
    instance.unmount = () => {
      if (!mounted.delete(instance)) return;
      instance.slots.forEach((hook) => hook && hook.effect && hook.cleanup && hook.cleanup());
    };
    render();
    return instance;
  }
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

// a história de teste: "Respire com calma." (0,10 a 1,04 s), pausa, e o resto de 1,90 s a 5,80 s, num áudio de 6 s
const TEXT = 'Respire com calma. A vida que você está construindo começa no próximo passo possível.';
const PAUSE_AT = TEXT.indexOf(' A ') + 1; // o "A" depois da pausa
const STARTS = [...TEXT].map((_, i) => (i < PAUSE_AT ? 0.1 + i * 0.055 : 1.9 + (i - PAUSE_AT) * 0.06));
const SECONDS = 6;
const pcmOf = (seconds) => {
  const pcm = Buffer.alloc(Math.round(seconds * 24000) * 2);
  for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 9) * 800), i * 2);
  return pcm;
};
// a resposta documentada de /v1/text-to-speech/{voz}/with-timestamps (audio_base64 + alignment do texto enviado)
const timedReply = (pcm, text, starts) => ({
  audio_base64: pcm.toString('base64'),
  alignment: {
    characters: [...text],
    character_start_times_seconds: starts,
    character_end_times_seconds: starts.map((s) => s + 0.05),
  },
  normalized_alignment: null,
});
const upstream = (status, { json, pcm } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name) =>
      name.toLowerCase() === 'content-type' ? (pcm ? 'audio/pcm' : 'application/json') : null,
  },
  text: async () => JSON.stringify(json || {}),
  arrayBuffer: async () => Uint8Array.from(pcm || []).buffer,
});
// a voz começou a letra `index` (de uma palavra): a legenda vai até o fim dessa palavra
const wordEnd = (text, index) => {
  let end = index + 1;
  while (end < text.length && !/\s/.test(text[end])) end += 1;
  return end;
};

async function main() {
  const failures = [];
  const app = fakeReact();
  const section = async (name, run) => {
    try {
      await run();
    } catch (error) {
      failures.push(`${name}: ${error && error.message ? error.message.split('\n')[0] : error}`);
      console.error(`✗ ${name}\n${error && error.stack ? error.stack : error}`);
    } finally {
      app.unmountAll();
    }
  };

  const audioEndpoint = require('../api/gerar-audio.js');
  const { pcmToWav, requestElevenLabs, buildElevenLabsRequest, NARRATOR_VOICES } = audioEndpoint._internals;
  const captions = loadWith('utils/captionProgress.js', {});
  const pcm = pcmOf(SECONDS);
  const input = { mode: 'personal', narratorId: 'aurora', lang: 'pt', text: TEXT };

  // ---------------------------------------------------------------------------------------------------------------
  // 1) servidor
  await section('1) servidor: a voz com o tempo de cada letra no WAV', async () => {
    const sent = [];
    global.fetch = async (url, options) => {
      sent.push({ url: new URL(url), options, body: JSON.parse(options.body) });
      return upstream(200, { json: timedReply(pcm, TEXT, STARTS) });
    };
    const wav = await requestElevenLabs(input, 'eleven_multilingual_v2', 'chave-de-teste');
    assert.strictEqual(sent.length, 1, 'um pedido à ElevenLabs');
    const [{ url, options, body }] = sent;
    assert.strictEqual(url.pathname, `/v1/text-to-speech/${NARRATOR_VOICES.aurora.voiceId}/with-timestamps`, 'a rota com o tempo das letras');
    assert.strictEqual(url.searchParams.get('output_format'), 'pcm_24000', 'o mesmo som de sempre (PCM 24 kHz)');
    assert.strictEqual(url.searchParams.get('enable_logging'), 'false');
    assert.strictEqual(options.headers.Accept, 'application/json');
    assert.deepStrictEqual(body, buildElevenLabsRequest(input, 'eleven_multilingual_v2'), 'a mesma voz, o mesmo texto');

    // o WAV de sempre: cabeçalho de 44 bytes, o som inteiro, e depois dele o pedaço com os tempos
    assert.strictEqual(wav.toString('ascii', 0, 4), 'RIFF');
    assert.strictEqual(wav.toString('ascii', 8, 12), 'WAVE');
    assert.strictEqual(wav.readUInt32LE(4), wav.length - 8, 'o tamanho RIFF cobre o pedaço novo');
    assert.strictEqual(wav.toString('ascii', 36, 40), 'data');
    assert.strictEqual(wav.readUInt32LE(40), pcm.length, 'o som não muda de tamanho');
    assert.ok(wav.subarray(44, 44 + pcm.length).equals(pcm), 'o som não muda');
    assert.ok(wav.length > 44 + pcm.length, 'há um pedaço depois do som');
    assert.deepStrictEqual(
      captions.letterTimesFromWav(new Uint8Array(wav), TEXT.length),
      STARTS.map((s) => Math.round(s * 1000)),
      'o app lê o ms em que a voz começa cada letra'
    );
    assert.strictEqual(captions.letterTimesFromWav(new Uint8Array(wav), TEXT.length - 1), null, 'tempos de outro texto não valem');

    // alinhamento que não é do texto pedido: o som segue, sem tempos
    global.fetch = async () => upstream(200, { json: timedReply(pcm, TEXT.replace('calma', 'calmo'), STARTS) });
    const other = await requestElevenLabs(input, 'eleven_multilingual_v2', 'chave-de-teste');
    assert.strictEqual(other.length, 44 + pcm.length, 'sem tempos o WAV é o de antes');
    assert.strictEqual(captions.letterTimesFromWav(new Uint8Array(other), TEXT.length), null);
    assert.strictEqual(captions.letterTimesFromWav(new Uint8Array(pcmToWav(pcm)), TEXT.length), null, 'WAV antigo, sem tempos');

    // um 200 cobrado sem o rótulo application/json: lido do mesmo jeito
    global.fetch = async () => ({ ...upstream(200, { json: timedReply(pcm, TEXT, STARTS) }), headers: { get: () => 'text/plain' } });
    const unlabelled = await requestElevenLabs(input, 'eleven_multilingual_v2', 'chave-de-teste');
    assert.ok(captions.letterTimesFromWav(new Uint8Array(unlabelled), TEXT.length), '200 sem rótulo JSON: a voz e os tempos chegam');

    // alinhamento que não cabe no som de 6 s: o som segue, sem tempos
    const ms = STARTS.map((s) => Math.round(s * 1000));
    const insane = [
      ['letra sem número', STARTS.map((s, i) => (i === 30 ? 'x' : s))],
      ['letra antes do 0', STARTS.map((s, i) => (i === 0 ? -0.2 : s))],
      ['letra que recua 0,4 s', STARTS.map((s, i) => (i === 40 ? s - 0.46 : s))],
      ['tudo em 0', STARTS.map(() => 0)],
      ['última letra depois do fim + 250 ms', STARTS.map((s) => s * 1.12)],
      ['última letra antes da metade do som', STARTS.map((s) => s * 0.4)],
    ];
    for (const [label, starts] of insane) {
      global.fetch = async () => upstream(200, { json: timedReply(pcm, TEXT, starts) });
      const wavOf = await requestElevenLabs(input, 'eleven_multilingual_v2', 'chave-de-teste');
      assert.strictEqual(wavOf.length, 44 + pcm.length, `${label}: sem tempos`);
    }
    // um recuo pequeno (até 250 ms) é ruído do alinhamento: fica no maior tempo já visto
    global.fetch = async () => upstream(200, { json: timedReply(pcm, TEXT, STARTS.map((s, i) => (i === 40 ? s - 0.1 : s))) });
    const nudged = captions.letterTimesFromWav(
      new Uint8Array(await requestElevenLabs(input, 'eleven_multilingual_v2', 'chave-de-teste')),
      TEXT.length
    );
    assert.ok(nudged && nudged[40] === ms[39] && nudged[41] === ms[41], 'recuo de 100 ms: o tempo da letra anterior');

    // pedaço de tamanho ímpar: um byte de preenchimento, coberto pelo tamanho RIFF, e o app lê
    const odd = pcmToWav(Buffer.from([0, 0, 1, 0]), [0, 100, 200]); // "[0,100,200]" = 11 bytes
    assert.strictEqual(odd.length, 44 + 4 + 8 + 11 + 1, 'pedaço ímpar com 1 byte de preenchimento');
    assert.strictEqual(odd.readUInt32LE(4), odd.length - 8);
    assert.strictEqual(odd.readUInt32LE(44 + 4 + 4), 11, 'o tamanho do pedaço não conta o preenchimento');
    assert.strictEqual(odd[odd.length - 1], 0);
    assert.deepStrictEqual(captions.letterTimesFromWav(new Uint8Array(odd), 3), [0, 100, 200]);

    // a rota com tempo recusou ou falhou sem cobrar: a voz vem pela rota de antes (sem tempos)
    for (const refused of [404, 500, 503]) {
      const calls = [];
      global.fetch = async (url, options) => {
        calls.push({ url: new URL(url), options });
        return calls.length === 1 ? upstream(refused) : upstream(200, { pcm });
      };
      const plain = await requestElevenLabs(input, 'eleven_multilingual_v2', 'chave-de-teste');
      assert.strictEqual(calls.length, 2, `${refused}: um pedido pela rota de antes`);
      assert.strictEqual(calls[1].url.pathname, `/v1/text-to-speech/${NARRATOR_VOICES.aurora.voiceId}`);
      assert.strictEqual(calls[1].options.headers.Accept, 'audio/pcm');
      assert.ok(plain.subarray(44).equals(pcm) && plain.length === 44 + pcm.length, `${refused}: a voz chega, sem tempos`);
    }
    // conta, limite e o que pode ter sido cobrado (502, 504, tempo esgotado) nunca pedem de novo
    const abort = () => {
      throw Object.assign(new Error('tempo esgotado'), { name: 'AbortError' });
    };
    for (const [answer, code] of [
      [() => upstream(401), 'audio_not_configured'],
      [() => upstream(429), 'audio_rate_limited'],
      [() => upstream(502), 'audio_unavailable'],
      [() => upstream(504), 'audio_unavailable'],
      [abort, 'audio_timeout'],
    ]) {
      let count = 0;
      global.fetch = async () => {
        count += 1;
        return answer();
      };
      await assert.rejects(() => requestElevenLabs(input, 'eleven_multilingual_v2', 'chave-de-teste'), (error) => error.code === code);
      assert.strictEqual(count, 1, `${code}: nenhum pedido a mais`);
    }

    // no 0 do áudio (o alinhamento começa em 0,000) nenhuma palavra foi dita ainda
    assert.strictEqual(captions.lettersSpoken({ letters: [0, 0, 60, 120], text: 'Eu é', seconds: 0 }), 0, 'no 0, nada dito');
    assert.strictEqual(captions.lettersSpoken({ letters: [0, 0, 60, 120], text: 'Eu é', seconds: 0.01 }), 2, 'logo depois, "Eu"');
  });

  // ---------------------------------------------------------------------------------------------------------------
  // 2) app: NarrationContext de verdade
  const frames = new Map();
  let frameSeq = 0;
  global.requestAnimationFrame = (fn) => {
    frameSeq += 1;
    frames.set(frameSeq, fn);
    return frameSeq;
  };
  global.cancelAnimationFrame = (id) => frames.delete(id);
  // um quadro no instante `at` (ms do relógio de quadros, como o do requestAnimationFrame)
  const runFrame = (at = 0) => {
    const due = [...frames.values()];
    frames.clear();
    due.forEach((fn) => fn(at));
  };
  class FakeAudio {
    constructor() {
      FakeAudio.last = this;
      Object.assign(this, { currentTime: 0, duration: NaN, paused: true, src: '', playbackRate: 1, loop: false, muted: false });
    }
    play() {
      this.paused = false;
      if (this.onplaying) this.onplaying();
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
    load() {}
    removeAttribute(name) {
      if (name === 'src') this.src = '';
    }
  }
  global.Audio = FakeAudio;

  const mountNarration = (OS, served) => {
    const platform = { OS, select: (choices) => choices[OS] ?? choices.default };
    const disk = new Map();
    class DeviceFile {
      constructor(dir, name) {
        this.uri = `file:///${dir}/${name}`;
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
    }
    const player = {
      currentTime: 0,
      replace() {},
      play() {},
      pause() {},
      setPlaybackRate() {},
      seekTo: async () => {},
    };
    const status = { playing: false, didJustFinish: false, playbackState: 'idle', currentTime: 0, duration: 0 };
    const requests = [];
    global.fetch = async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body.text);
      const bytes = served(body.text);
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'audio/wav' : null) },
        arrayBuffer: async () => Uint8Array.from(bytes).buffer,
      };
    };
    const { NarrationProvider } = loadWith('context/NarrationContext.js', {
      react: app.React,
      'react/jsx-runtime': app.jsxRuntime,
      'react-native': { Platform: platform },
      'expo-file-system': { File: DeviceFile, Paths: { cache: 'cache' } },
      'expo-audio': {
        setAudioModeAsync: async () => {},
        useAudioPlayer: () => player,
        useAudioPlayerStatus: () => status,
      },
      'expo-speech': { speak: () => {}, stop: () => Promise.resolve() },
      'expo-asset': { Asset: { fromModule: () => ({ downloadAsync: async () => ({}) }) } },
      './celesteApiSession': { celestePaidApiHeaders: async () => ({ Authorization: 'Bearer sessao' }) },
      '../constants/narrators': { narratorPreviewUrl: () => null },
      './narrationAudioStorage': {
        acquireNarrationAudio: async () => null,
        clearNarrationAudioStorage: async () => true,
        createNarrationAudioCacheKey: ({ text, narratorId, lang }) => `k:${narratorId}:${lang}:${text}`,
        NARRATION_AUDIO_MAX_IDLE_MS: 1e12,
        narrationAudioStorageEpoch: () => 0,
        narrationAudioStorageToken: async () => '0',
        saveNarrationAudio: async () => true,
      },
    });
    const mounted = app.mount(NarrationProvider, { children: null });
    const value = () => mounted.tree.props.value;
    const play = (text) =>
      value().playPersonal({
        text,
        narratorId: 'aurora',
        lang: 'pt',
        cloudConsent: true,
        cloudConsentVersion: CLOUD_CONSENT_VERSION,
        adultConfirmed: true,
        playbackId: 'manifestation:m1',
      });
    // onde está o áudio do trecho: no site o elemento <audio> (o timeupdate avisa a cada ~250 ms; notify: false = ele
    // ainda não avisou); no Android o status do player (chega a cada 200 ms)
    const at = (seconds, { notify = true } = {}) => {
      if (OS === 'web') {
        const audio = FakeAudio.last;
        audio.currentTime = seconds;
        audio.duration = SECONDS;
        if (notify) audio.ontimeupdate();
      } else {
        Object.assign(status, { playing: true, playbackState: 'playing', currentTime: seconds, duration: SECONDS });
      }
      mounted.flush();
    };
    return { value, play, at, flush: mounted.flush, requests, player, status };
  };

  for (const OS of ['web', 'android']) {
    await section(`2) ${OS}: a legenda segue o tempo das letras`, async () => {
      const timed = new Uint8Array(pcmToWav(pcm, STARTS.map((s) => Math.round(s * 1000))));
      const voice = mountNarration(OS, () => timed);
      const result = await voice.play(TEXT);
      assert.strictEqual(result.ok, true, 'a voz começa');
      const letters = () => voice.value().progress * TEXT.length;
      voice.at(0.55);
      await until(() => voice.value().isPlaying, 'tocando', voice.flush);
      // 0,55 s: a voz começou "com" (letra 8) → a legenda vai até o fim de "com"
      assert.ok(Math.abs(letters() - wordEnd(TEXT, 8)) < 1e-9, `no meio de "com": ${letters()} letras`);
      // 1,5 s, na pausa depois de "calma.": a legenda espera no espaço depois da frase, o "A" ainda não (por letras
      // ela já mostraria "A vida")
      voice.at(1.5);
      assert.ok(Math.abs(letters() - PAUSE_AT) < 1e-9, `na pausa: ${letters()} letras, até o espaço depois de "calma." são ${PAUSE_AT}`);
      // 1,95 s: a voz disse "A" e o relógio do áudio ainda não avisou: a palavra entra no quadro seguinte
      if (OS === 'web') {
        voice.at(1.95, { notify: false }); // o <audio> já está em 1,95 s; o timeupdate ainda não veio
        runFrame(1000);
      } else {
        voice.at(1.75); // um status no meio da pausa (ainda sem "A")
        assert.ok(Math.abs(letters() - PAUSE_AT) < 1e-9, `status na pausa: ${letters()} letras`);
        runFrame(1000); // esse status visto neste quadro
        runFrame(1200); // 200 ms depois, antes do status seguinte: 1,95 s
      }
      voice.flush();
      assert.ok(Math.abs(letters() - wordEnd(TEXT, PAUSE_AT)) < 1e-9, `"A" no quadro seguinte: ${letters()} letras`);
      if (OS !== 'web') {
        // status novo: o relógio por quadro recomeça dele (2,0 s: "A " dito, "vida" em 2,02 s ainda não)
        voice.at(2);
        runFrame(2000);
        voice.flush();
        const upToA = TEXT.indexOf(' vida') + 1;
        assert.ok(Math.abs(letters() - upToA) < 1e-9, `status novo: ${letters()} letras, esperado ${upToA}`);
        // os status pararam (o áudio travou): o relógio por quadro anda no máximo 0,3 s além do último
        runFrame(7000);
        voice.flush();
        // 2,3 s: "A vida " dito, "que" (2,32 s) ainda não
        const upToVida = TEXT.indexOf(' que') + 1;
        assert.ok(Math.abs(letters() - upToVida) < 1e-9, `status parados: ${letters()} letras, esperado ${upToVida} (até 2,3 s)`);
        // status que diz que não está tocando (carregando): o relógio por quadro não anda além dele
        Object.assign(voice.status, { playing: false, currentTime: 2.4 });
        voice.flush();
        runFrame(8000);
        runFrame(8250);
        voice.flush();
        const upToQue = TEXT.indexOf(' que') + 4; // 2,4 s: "que" começou (2,32 s), "você" (2,56 s) ainda não
        assert.ok(Math.abs(letters() - upToQue) < 1e-9, `status parado em 2,4 s: ${letters()} letras, esperado ${upToQue}`);
        Object.assign(voice.status, { playing: true });
      }
      // a última palavra começa antes de o som acabar: a legenda fica abaixo de 1 (a frase inteira só no fim de verdade)
      voice.at(5.9);
      assert.ok(voice.value().progress < 1 && letters() > TEXT.length - 0.05, `perto do fim: ${voice.value().progress}`);
      // pausar e parar não deixam quadro agendado; continuar volta a conferir a cada quadro
      assert.ok(frames.size > 0, 'tocando com os tempos: há um quadro agendado');
      voice.value().pause();
      voice.flush();
      assert.strictEqual(frames.size, 0, 'pausa: nenhum quadro agendado');
      await voice.value().resume();
      voice.flush();
      assert.strictEqual(frames.size, 1, 'continuar: um quadro agendado');
      voice.value().stop();
      voice.flush();
      assert.strictEqual(frames.size, 0, 'parar: nenhum quadro agendado');
    });
  }

  await section('2) áudio guardado antes (sem os tempos): por letras, como antes', async () => {
    const voice = mountNarration('web', () => new Uint8Array(pcmToWav(pcm)));
    await voice.play(TEXT);
    voice.at(1.5);
    await until(() => voice.value().isPlaying, 'tocando', voice.flush);
    assert.ok(Math.abs(voice.value().progress - 1.5 / SECONDS) < 1e-9, `por letras: ${voice.value().progress}`);
  });

  await section('2) dois trechos: o espaço entre eles conta', async () => {
    const first = 'Eu respiro fundo e escolho a calma. '.repeat(22).trim(); // 791 letras: o 1º trecho (até 800)
    const second = 'Depois volto para a varanda e sorrio.';
    const story = `${first} ${second}`;
    const timedFor = (text) =>
      new Uint8Array(pcmToWav(pcm, [...text].map((_, i) => Math.round(i * 60))));
    const voice = mountNarration('web', timedFor);
    await voice.play(story);
    await until(() => voice.requests.length === 2, 'os dois trechos pedidos', voice.flush);
    assert.deepStrictEqual(voice.requests, [first, second], 'o texto vai em dois trechos');
    voice.at(1);
    await until(() => voice.value().isPlaying, 'tocando o 1º', voice.flush);
    voice.at(5, { notify: false }); // um quadro lido no fim do 1º trecho não vale para o 2º
    runFrame();
    voice.flush();
    FakeAudio.last.onended();
    await until(() => voice.value().chunkIndex === 1 && voice.value().isPlaying, 'tocando o 2º', voice.flush);
    voice.at(0.6); // letra 10 do 2º trecho
    const expected = first.length + 1 + wordEnd(second, 10);
    assert.ok(
      Math.abs(voice.value().progress * story.length - expected) < 1e-9,
      `no 2º trecho: ${voice.value().progress * story.length} letras, esperado ${expected}`
    );
  });

  if (failures.length) {
    throw new Error(`Legenda no ritmo da voz falhou (${failures.length}):\n  - ${failures.join('\n  - ')}`);
  }
  console.log(
    'Legenda no ritmo da voz OK: o servidor manda o tempo de cada letra com a voz (e volta à rota de antes se recusado); ' +
      'a legenda vai ao fim da palavra dita, espera nas pausas, entra no quadro seguinte (site e Android) e o áudio antigo segue por letras.'
  );
}

// uma espera pendurada esvazia o laço do Node e ele sairia com 0: aqui isso é falha
let finished = false;
process.on('exit', () => {
  if (finished) return;
  console.error('Legenda no ritmo da voz: o portão não terminou (alguma espera ficou pendurada).');
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
