// Portão do compartilhar: link sem dado pessoal, cartão final do vídeo, arquivo compartilhado no MESMO toque (site),
// vídeo temporário apagado do cache (app), cartão 9:16 com a cena pronta e a folha com prévia antes de enviar.
// Uso (cwd = C:\projetos\TaskFlow): node scripts/verificar-compartilhar.js
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

function compileInto(loaded, file) {
  const code = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  loaded._compile(code, file);
}

// carrega um módulo do app com Babel trocando dependências por dublês (pelo texto do import); imports relativos
// sem dublê também passam pelo Babel
function loadWith(relative, mocks) {
  const cache = new Map();
  const compile = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    const loaded = new Module(file, module);
    loaded.filename = file;
    loaded.paths = Module._nodeModulePaths(path.dirname(file));
    cache.set(file, loaded);
    compileInto(loaded, file);
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

// React de mentira (estado, refs, memo e efeitos na ordem do React), renderização rasa: componentes filhos ficam
// como elementos. `hosts` cria a instância de cada elemento com ref (canvas, gravador, cartão)
function fakeReact(hosts) {
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
          if (instance.gone) return; // desmontado: o React ignora (e a tela não pode depender disso)
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
    useImperativeHandle(ref, make, deps) {
      React.useEffect(() => {
        if (ref) ref.current = make();
      }, deps);
    },
    forwardRef: (render) => render,
  };
  const element = (type, props, key) => ({ type, props: props || {}, key });
  const nodes = (node) =>
    Array.isArray(node)
      ? node.flatMap(nodes)
      : node && typeof node === 'object'
        ? [node, ...nodes(node.props.children)]
        : [];
  function mount(Component, props, ref = null) {
    const instance = { slots: [], cursor: 0, queue: [], dirty: false, props, attached: new Map(), gone: false };
    const render = () => {
      for (let pass = 0; pass < 30; pass++) {
        instance.dirty = false;
        instance.cursor = 0;
        current = instance;
        try {
          instance.tree = Component(instance.props, ref);
        } finally {
          current = null;
        }
        const live = new Set();
        for (const node of nodes(instance.tree)) {
          const target = node.props.ref;
          if (!target || typeof target !== 'object' || typeof hosts[node.type] !== 'function') continue;
          live.add(target);
          if (!instance.attached.has(target) || instance.attached.get(target) !== node.key) {
            target.current = hosts[node.type](node.props);
            instance.attached.set(target, node.key);
          }
        }
        for (const target of instance.attached.keys()) {
          if (live.has(target)) continue;
          target.current = null;
          instance.attached.delete(target);
        }
        instance.queue.splice(0).forEach((run) => run());
        if (!instance.dirty) return instance;
      }
      throw new Error('renderização em laço');
    };
    instance.find = (type) => nodes(instance.tree).find((node) => node.type === type) || null;
    instance.all = (type) => nodes(instance.tree).filter((node) => node.type === type);
    instance.byId = (testID) => nodes(instance.tree).find((node) => node.props.testID === testID) || null;
    instance.update = (next) => {
      instance.props = { ...instance.props, ...next };
      return render();
    };
    instance.flush = render;
    instance.unmount = () => {
      instance.gone = true;
      instance.slots.forEach((hook) => hook && hook.effect && hook.cleanup && hook.cleanup());
    };
    render();
    return instance;
  }
  return { React, jsxRuntime: { jsx: element, jsxs: element, Fragment: 'Fragment' }, mount };
}

// elemento e todos os elementos dentro dele
const descendants = (node) =>
  Array.isArray(node)
    ? node.flatMap(descendants)
    : node && typeof node === 'object'
      ? [node, ...descendants(node.props.children)]
      : [];
// texto de um elemento (filhos string/número, recursivo)
const textOf = (node) =>
  node == null || typeof node === 'boolean'
    ? ''
    : typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : Array.isArray(node)
        ? node.map(textOf).join('')
        : textOf(node.props.children);

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function settle(instance, check, label) {
  for (let i = 0; i < 200; i++) {
    instance.flush();
    if (check()) return;
    await tick();
  }
  throw new Error(`esperou demais: ${label}`);
}
const deferred = () => {
  const d = {};
  d.promise = new Promise((resolve, reject) => Object.assign(d, { resolve, reject }));
  return d;
};
// globais do navegador trocados só durante um trecho (navigator é getter no Node 21+)
function withGlobals(values, run) {
  const saved = Object.keys(values).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  const restore = () =>
    saved.forEach(([key, descriptor]) => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  let result;
  try {
    result = run();
  } catch (error) {
    restore();
    throw error;
  }
  return Promise.resolve(result).finally(restore);
}

// Canvas falso: grava cada chamada ({ op, args }) e cada propriedade atribuída ({ op: '=font' }), com o relógio
// do quadro (stamp); measureText: 10 px por letra a 19 px
const fontPx = (font) => Number((/(\d+(?:\.\d+)?)px/.exec(font || '') || [0, 19])[1]);
function fakeCanvas(width, height, stamp) {
  const calls = [];
  const ctx = new Proxy({}, {
    get(state, prop) {
      if (prop in state) return state[prop];
      if (prop === 'measureText') return (text) => ({ width: (String(text).length * 10 * fontPx(state.font)) / 19 });
      if (prop === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      return (...args) => {
        const made = { op: prop, args, time: stamp(), stops: [], addColorStop: (o, c) => made.stops.push([o, c]) };
        calls.push(made);
        return made;
      };
    },
    set(state, prop, value) {
      state[prop] = value;
      calls.push({ op: `=${String(prop)}`, args: [value], time: stamp() });
      return true;
    },
  });
  const tracks = [{ stop() {} }];
  return {
    width,
    height,
    calls,
    getContext: (type) => (type === '2d' ? ctx : null),
    captureStream: () => ({ getTracks: () => tracks }),
  };
}

// quadros de uma gravação: cada um começa no fundo de tinta (#1C2E4F) e guarda o relógio; por quadro, as palavras
// com a fonte e a opacidade em vigor (legenda = fonte itálica; assinatura e link não são itálicos)
function framesOf(calls) {
  const frames = [];
  let font = '';
  let opacity = 1;
  for (const call of calls) {
    if (call.op === '=fillStyle' && call.args[0] === '#1C2E4F') frames.push({ t: call.time, words: [] });
    if (call.op === '=font') font = call.args[0];
    if (call.op === '=globalAlpha') opacity = call.args[0];
    if (call.op === 'fillText' && frames.length) {
      frames[frames.length - 1].words.push({
        text: call.args[0],
        y: call.args[2],
        size: fontPx(font),
        alpha: opacity,
        caption: /^italic/.test(font),
      });
    }
  }
  return frames;
}

const image = { width: 720, height: 900, naturalWidth: 720, naturalHeight: 900 };
const LONG_PHRASE =
  'Eu escolho viver com mais calma e propósito, em cada dia. Eu reconheço minha curiosidade, minha coragem e ' +
  'minha persistência, e deixo essas qualidades orientarem meus próximos passos.';
const LINK_TEXT = 'https://celeste-jet-two.vercel.app';
const CAMPAIGNS = ['afirmacao', 'visao', 'ancora', 'pratica', 'sonho'];

async function main() {
  // dublês do app: react-native, expo-sharing e o cache do expo-file-system em memória
  const RN = {
    Platform: { OS: 'android', select: (choices) => choices.default },
    PixelRatio: { get: () => 2 },
    StyleSheet: { create: (styles) => styles, absoluteFillObject: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
    View: 'View',
    Text: 'Text',
    ScrollView: 'ScrollView',
    TouchableOpacity: 'TouchableOpacity',
    ActivityIndicator: 'ActivityIndicator',
    Modal: 'Modal',
    Share: { share: () => Promise.resolve({ action: 'sharedAction' }) },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
  const disk = new Map();
  class DeviceFile {
    constructor(...parts) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists() {
      return disk.has(this.uri);
    }
    create() {
      disk.set(this.uri, '');
    }
    write(content) {
      disk.set(this.uri, content);
    }
    delete() {
      if (!disk.has(this.uri)) throw new Error('arquivo inexistente');
      disk.delete(this.uri);
    }
    base64() {
      return Promise.resolve(`b64(${this.uri})`);
    }
  }
  const cacheDir = {
    uri: 'file:///cache',
    broken: false,
    list() {
      if (this.broken) throw new Error('cache ilegível');
      return [...disk.keys()].filter((uri) => uri.startsWith('file:///cache/')).map((uri) => new DeviceFile(uri));
    },
  };
  const sharing = { available: true, calls: [], outcome: () => Promise.resolve() };
  const expoSharing = {
    isAvailableAsync: () => Promise.resolve(sharing.available),
    shareAsync: (uri, options) => {
      sharing.calls.push([uri, options]);
      return sharing.outcome();
    },
  };
  const captures = [];
  const viewShot = {
    __esModule: true,
    default: 'ViewShot',
    captureRef: (ref, options) => {
      captures.push({ ref, options });
      return Promise.resolve(options.result === 'tmpfile' ? '/tmp/celeste-afirmacao.jpg' : 'data:image/jpeg;base64,/9j/2Q==');
    },
    releaseCapture: () => {},
  };
  const baseMocks = {
    'react-native': RN,
    'expo-sharing': expoSharing,
    'expo-file-system': { File: DeviceFile, Paths: { cache: cacheDir } },
    'react-native-view-shot': viewShot,
  };

  // 1) link compartilhado: exatamente o das Global Constraints, só utm (nenhum dado pessoal cabe nele)
  const { shareUrl, shareVideoFile, sweepShareCache, discardShareFile } = loadWith('utils/shareContent.js', baseMocks);
  assert.strictEqual(
    shareUrl('video', 'visao'),
    'https://celeste-jet-two.vercel.app/?utm_source=compartilhar&utm_medium=video&utm_campaign=visao'
  );
  for (const medium of ['imagem', 'video']) {
    for (const campaign of CAMPAIGNS) {
      assert.strictEqual(
        shareUrl(medium, campaign),
        `https://celeste-jet-two.vercel.app/?utm_source=compartilhar&utm_medium=${medium}&utm_campaign=${campaign}`,
        `link de ${medium}/${campaign}`
      );
    }
  }
  for (const [medium, campaign] of [['texto', 'visao'], ['video', 'Eu escolho a paz'], ['imagem', undefined], [null, 'sonho']]) {
    assert.throws(() => shareUrl(medium, campaign), `${medium}/${campaign} não vira link (só os valores combinados)`);
  }

  // 2) cartão final do vídeo (8 s, 30 fps): a legenda completa em 85% (6,8 s); a janela que rola se dissolve em
  //    0,3 s na frase inteira ajustada, que fica parada com a assinatura e o link até o fim
  const { installCenaViva } = loadWith('components/cenaViva/renderer.js', {});
  async function recordVideo(phrase) {
    let clock = 0;
    const made = [];
    class Recorder {
      static isTypeSupported(mime) {
        return mime === 'video/mp4';
      }
      constructor() {
        this.state = 'inactive';
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.ondataavailable({ data: new Blob(['mp4']) });
        this.onstop();
      }
    }
    const studio = {
      document: {
        createElement() {
          const canvas = fakeCanvas(0, 0, () => clock);
          made.push(canvas);
          return canvas;
        },
      },
      MediaRecorder: Recorder,
      Blob,
      performance: { now: () => clock },
      setTimeout(fn, ms) {
        clock += ms; // relógio exato: cada quadro sai 1/30 s depois do anterior
        setImmediate(fn);
      },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
    };
    installCenaViva(studio);
    const video = await studio.CenaViva.recordVideo({ image, phrase, linkText: LINK_TEXT });
    return { video, frames: framesOf(made[0].calls) };
  }
  const base = Math.round(720 * 0.058); // tamanho cheio da legenda no 720
  const captionOf = (frame) => frame.words.filter((word) => word.caption);
  const lines = (words) => new Set(words.map((word) => Math.round(word.y))).size;
  const { video, frames } = await recordVideo(LONG_PHRASE);
  assert.strictEqual(video.mimeType, 'video/mp4');
  assert.ok(frames.length >= 240 && frames[frames.length - 1].t === 8000, `8 s a 30 fps (${frames.length} quadros)`);
  assert.ok(
    frames.every((frame) => frame.words.some((w) => w.text === 'Celeste') && frame.words.some((w) => w.text === LINK_TEXT)),
    'Traço Celeste + "Celeste" + link em todos os quadros'
  );
  for (const frame of frames.filter((f) => f.t <= 6800)) {
    const words = captionOf(frame);
    assert.ok(words.every((w) => w.size === base), `t=${frame.t}: antes de 85% só a janela que rola, no tamanho cheio`);
    assert.ok(lines(words) <= 3, `t=${frame.t}: janela de até 3 linhas`);
  }
  const lastWord = (frame) => captionOf(frame).filter((w) => w.text === 'passos.');
  const at75 = frames.find((f) => Math.abs(f.t - 6000) < 1);
  const at85 = frames.find((f) => Math.abs(f.t - 6800) < 1);
  assert.ok(at75 && !lastWord(at75).length, 'em 75% a legenda ainda não chegou à última palavra');
  assert.ok(
    at85 && lastWord(at85).some((w) => w.alpha === 1 && w.size === base),
    'em 85% (6,8 s) a legenda está completa'
  );
  const fading = frames.filter((f) => f.t > 6800 && f.t < 7100);
  assert.ok(fading.length >= 7, `dissolve de ~0,3 s em vários quadros (${fading.length})`);
  let previous = 0;
  for (const frame of fading) {
    const big = lastWord(frame).find((w) => w.size === base);
    const small = lastWord(frame).find((w) => w.size < base);
    assert.ok(big && small, `t=${frame.t}: janela e frase ajustada convivem no dissolve`);
    assert.ok(Math.abs(big.alpha + small.alpha - 1) < 1e-9, `t=${frame.t}: opacidades somam 1 (dissolve, não piscada)`);
    assert.ok(small.alpha > previous, `t=${frame.t}: a frase ajustada só ganha opacidade`);
    previous = small.alpha;
  }
  const held = frames.filter((f) => f.t >= 7100);
  assert.ok(held.length >= 27, `frase inteira parada por ~0,9 s depois do dissolve (${held.length} quadros)`);
  for (const frame of held) {
    const words = captionOf(frame);
    assert.strictEqual(words.map((w) => w.text).join(' '), LONG_PHRASE, `t=${frame.t}: a frase inteira`);
    assert.ok(words.every((w) => w.size < base && w.alpha === 1), `t=${frame.t}: ajustada e opaca`);
    assert.ok(lines(words) <= 5, `t=${frame.t}: até 5 linhas`);
  }
  // frase curta (cabe na janela): o dissolve não desenha nada duas vezes e ela fica inteira nos últimos 1,2 s
  const short = await recordVideo('Eu escolho a paz');
  for (const frame of short.frames) {
    const texts = captionOf(frame).map((w) => w.text);
    assert.strictEqual(new Set(texts).size, texts.length, `t=${frame.t}: frase curta sem palavra repetida`);
  }
  assert.ok(
    short.frames
      .filter((f) => f.t >= 6800)
      .every((f) => captionOf(f).map((w) => w.text).join(' ') === 'Eu escolho a paz' && captionOf(f).every((w) => w.alpha === 1)),
    'frase curta inteira e opaca no cartão final'
  );

  // 3) site: navigator.share chamado JÁ (antes de shareVideoFile devolver: nenhum await entre o toque e o share),
  //    com o arquivo e o link no texto; cancelar = cancelled; sem compartilhar arquivo = baixa e copia o link
  RN.Platform.OS = 'web';
  const videoLink = shareUrl('video', 'visao');
  const message = `Celeste — ${videoLink}`;
  const mp4 = new File([new Uint8Array(64)], 'celeste-share-1.mp4', { type: 'video/mp4' });
  function browser({ canShare = true, share = () => Promise.resolve(), clipboard = () => Promise.resolve() } = {}) {
    const seen = { shared: [], copied: [], downloads: [], revoked: [] };
    const nav = {
      canShare: (data) => canShare && Array.isArray(data.files) && data.files.length === 1,
      share: (data) => {
        seen.shared.push(data);
        return share(data);
      },
      clipboard: {
        writeText: (text) => {
          seen.copied.push(text);
          return clipboard(text);
        },
      },
    };
    const doc = {
      body: { appendChild: (node) => (node.attached = true) },
      createElement: (tag) => {
        const anchor = { tag, style: {}, attached: false, setAttribute() {}, remove() { this.attached = false; } };
        anchor.click = () => seen.downloads.push({ href: anchor.href, download: anchor.download, attached: anchor.attached });
        return anchor;
      },
    };
    const url = {
      createObjectURL: (blob) => `blob:test/${blob.name}`,
      revokeObjectURL: (href) => seen.revoked.push(href),
    };
    return { seen, globals: { navigator: nav, document: doc, URL: Object.assign(Object.create(URL), url) } };
  }
  {
    const { seen, globals } = browser();
    await withGlobals(globals, async () => {
      const pending = shareVideoFile({ file: mp4, mimeType: 'video/mp4', title: 'Compartilhar', text: message });
      assert.strictEqual(seen.shared.length, 1, 'site: navigator.share sai no próprio toque (sem await antes)');
      assert.deepStrictEqual(seen.shared[0], { files: [mp4], title: 'Compartilhar', text: message }, 'arquivo + link no texto');
      assert.deepStrictEqual(await pending, { status: 'shared' });
      assert.strictEqual(seen.downloads.length, 0, 'compartilhado: nada baixado');
    });
  }
  {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    const { seen, globals } = browser({ share: () => Promise.reject(abort) });
    await withGlobals(globals, async () => {
      assert.deepStrictEqual(await shareVideoFile({ file: mp4, mimeType: 'video/mp4', title: 'x', text: message }), { status: 'cancelled' });
      assert.ok(!seen.downloads.length && !seen.copied.length, 'desistir é desistir: nem baixa nem copia');
    });
  }
  {
    const { seen, globals } = browser({ canShare: false });
    const originalTimeout = global.setTimeout;
    const timers = [];
    global.setTimeout = (fn, ms) => timers.push({ fn, ms });
    try {
      await withGlobals(globals, async () => {
        const result = await shareVideoFile({ file: mp4, mimeType: 'video/mp4', title: 'x', text: message });
        assert.deepStrictEqual(result, { status: 'downloaded', linkCopied: true }, 'sem compartilhar arquivo: baixa e copia o link');
        assert.deepStrictEqual(seen.shared, [], 'sem suporte a arquivo: navigator.share nem é chamado');
        assert.deepStrictEqual(seen.downloads, [{ href: 'blob:test/celeste-share-1.mp4', download: 'celeste-share-1.mp4', attached: true }]);
        assert.deepStrictEqual(seen.copied, [message], 'o link copiado é o do texto (utm do vídeo)');
        timers.forEach((timer) => timer.fn());
        assert.deepStrictEqual(seen.revoked, ['blob:test/celeste-share-1.mp4'], 'a URL do download é liberada');
      });
    } finally {
      global.setTimeout = originalTimeout;
    }
  }
  {
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    const { seen, globals } = browser({ share: () => Promise.reject(denied), clipboard: () => Promise.reject(new Error('sem foco')) });
    await withGlobals(globals, async () => {
      const result = await shareVideoFile({ file: mp4, mimeType: 'video/mp4', title: 'x', text: message });
      assert.deepStrictEqual(result, { status: 'downloaded', linkCopied: false }, 'share recusado: baixa; cópia falhou = não diz que copiou');
      assert.strictEqual(seen.downloads.length, 1);
    });
  }

  // 4) app: expo-sharing com o mime do vídeo (o expo-sharing só leva o arquivo); o vídeo é temporário e sai do cache
  //    depois do compartilhar — Android 90 s depois (o app de destino lê depois que o seletor fecha), iPhone na hora
  const shareUri = 'file:///cache/celeste-share-1700000000000.mp4';
  const originalTimeout = global.setTimeout;
  const timers = [];
  global.setTimeout = (fn, ms) => (ms === 90000 ? timers.push({ fn, ms }) : originalTimeout(fn, ms));
  try {
    RN.Platform.OS = 'android';
    disk.set(shareUri, 'video');
    const shared = await shareVideoFile({ uri: shareUri, mimeType: 'video/mp4', title: 'Compartilhar', text: message });
    assert.deepStrictEqual(shared, { status: 'shared' });
    assert.deepStrictEqual(sharing.calls, [[shareUri, { mimeType: 'video/mp4', dialogTitle: 'Compartilhar' }]]);
    assert.ok(disk.has(shareUri), 'Android: o arquivo fica enquanto o app de destino lê');
    assert.strictEqual(timers.length, 1, 'Android: limpeza agendada para 90 s');
    timers.pop().fn();
    assert.ok(!disk.has(shareUri), 'Android: o vídeo sai do cache 90 s depois');
    RN.Platform.OS = 'ios';
    disk.set(shareUri, 'video');
    await shareVideoFile({ uri: shareUri, mimeType: 'video/mp4', title: 'Compartilhar', text: message });
    assert.ok(!disk.has(shareUri) && !timers.length, 'iPhone: o vídeo sai do cache assim que o compartilhar fecha');
    disk.set(shareUri, 'video');
    sharing.outcome = () => Promise.reject(Object.assign(new Error('User cancelled'), { code: 'ERR_CANCELLED' }));
    assert.deepStrictEqual(await shareVideoFile({ uri: shareUri, mimeType: 'video/mp4', title: 'x' }), { status: 'cancelled' });
    assert.ok(!disk.has(shareUri), 'cancelou: o vídeo sai do cache do mesmo jeito');
    disk.set(shareUri, 'video');
    sharing.outcome = () => Promise.reject(new Error('Activity not found'));
    await assert.rejects(shareVideoFile({ uri: shareUri, mimeType: 'video/mp4', title: 'x' }), /Activity not found/);
    assert.ok(!disk.has(shareUri), 'falhou: o vídeo sai do cache do mesmo jeito');
    sharing.outcome = () => Promise.resolve();
    // nunca apaga o que não é vídeo do compartilhar
    const foreign = 'file:///document/visual-anchor.jpg';
    disk.set(foreign, 'imagem pessoal');
    discardShareFile(foreign);
    discardShareFile('file:///cache/xceleste-share-1.mp4');
    discardShareFile(undefined);
    assert.ok(disk.has(foreign), 'apagar só toca em celeste-share-<ts>.mp4|webm');
    disk.delete(foreign);
  } finally {
    global.setTimeout = originalTimeout;
  }

  // 5) ao abrir de novo: vídeos que ficaram para trás (o app morreu no meio) saem; os de menos de 90 s ficam (o app
  //    de destino pode estar lendo); nada que não seja vídeo do compartilhar é tocado
  const now = 1_800_000_000_000;
  const stale = `file:///cache/celeste-share-${now - 91000}.mp4`;
  const staleWebm = `file:///cache/celeste-share-${now - 3600000}.webm`;
  const fresh = `file:///cache/celeste-share-${now - 1000}.mp4`;
  const other = 'file:///cache/scene-7.jpg';
  [stale, staleWebm, fresh, other, 'file:///cache/xceleste-share-1.mp4'].forEach((uri) => disk.set(uri, 'x'));
  sweepShareCache(now);
  assert.ok(!disk.has(stale) && !disk.has(staleWebm), 'vídeos velhos saem do cache');
  assert.ok(disk.has(fresh) && disk.has(other) && disk.has('file:///cache/xceleste-share-1.mp4'), 'o resto fica');
  cacheDir.broken = true;
  sweepShareCache(now); // cache ilegível não derruba a folha
  cacheDir.broken = false;
  disk.clear();

  // 6) cartão 9:16: a imagem pessoal; sem ela, a cena pronta das respostas (a mesma do vídeo); sem as duas, o
  //    gradiente. Enquanto a pessoal abre, nenhuma imagem (a captura não pode sair com a cena pronta por engano).
  //    Assinatura: Traço Celeste (3 estrelas ligadas) + "Celeste" + link; texto sem escala de fonte do sistema
  const lookups = new Map();
  const released = [];
  const acquirePersonalVisual = (key) => {
    const lookup = deferred();
    lookups.set(key, lookup);
    return lookup.promise;
  };
  const theme = { accents: ['#5B8CFF', '#9D7BFF', '#3DD6C3'], surface: '#FFFFFF', text: '#171B26', textMuted: '#6C7688', border: '#E1E6EF' };
  const recorders = [];
  const app = fakeReact({
    ViewShot: () => ({ snapshot: true }),
    ShareCard: (props) => ({ card: props.testID || 'share-card' }),
    CenaVivaRecorder: () => {
      const recorder = { jobs: [] };
      recorder.record = (params) => {
        const job = deferred();
        recorder.jobs.push({ params, ...job });
        return job.promise;
      };
      recorders.push(recorder);
      return recorder;
    },
  });
  const uiMocks = {
    ...baseMocks,
    react: app.React,
    'react/jsx-runtime': app.jsxRuntime,
    'expo-image': { Image: 'Image' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../services/personalVisualStorage': { acquirePersonalVisual },
    '../ui/theme': { useTheme: () => theme },
  };
  const cardModule = loadWith('components/ShareCard.js', uiMocks);
  const ShareCard = cardModule.default;
  assert.deepStrictEqual({ ...cardModule.SHARE_CARD_LAYOUT_SIZE }, { width: 360, height: 640 }, 'cartão em 360×640 (captura 1080×1920)');
  assert.strictEqual(cardModule.SHARE_CARD_ASPECT_RATIO, 9 / 16);
  const readyScene = { id: 'beach-Peace', source: 7, place: 'beach', category: 'Peace' };
  const cardProps = { phrase: 'Eu vivo com calma', kindLabel: 'Visão', readyScene };
  const imageOf = (card) => card.find('Image');
  const plain = app.mount(ShareCard, cardProps, { current: null });
  assert.ok(imageOf(plain) && imageOf(plain).props.source === 7, 'sem imagem pessoal: a cena pronta das respostas');
  assert.ok(imageOf(plain).props.transition === 0 && imageOf(plain).props.contentFit === 'cover', 'sem transição (captura nítida)');
  assert.strictEqual(plain.find('ViewShot').props.style[0].width, 360);
  assert.strictEqual(plain.byId('share-card').type, 'LinearGradient', 'gradiente da marca por baixo');
  assert.strictEqual(textOf(plain.byId('share-card-category')), 'VISÃO');
  assert.strictEqual(textOf(plain.byId('share-card-affirmation')), '“Eu vivo com calma”');
  assert.strictEqual(textOf(plain.byId('share-card-brand')), 'Celeste');
  assert.strictEqual(textOf(plain.byId('share-card-url')), LINK_TEXT, 'link no cartão');
  const stars = plain.all('Ionicons').filter((icon) => icon.props.name === 'star');
  assert.ok(stars.length === 3 && stars.every((star) => star.props.color === '#F2B25C'), 'Traço Celeste: 3 estrelas douradas');
  assert.strictEqual(plain.byId('share-card-signature').props.children.length >= 2, true, 'assinatura: traço + nome');
  assert.ok(plain.all('Text').every((node) => node.props.maxFontSizeMultiplier === 1), 'fonte do sistema não estoura o cartão');
  const onVisualReady = () => {};
  const onVisualError = () => {};
  const wired = app.mount(ShareCard, { ...cardProps, onVisualReady, onVisualError });
  assert.ok(imageOf(wired).props.onLoad === onVisualReady && imageOf(wired).props.onError === onVisualError, 'avisa quando a imagem pinta');

  const personalCard = app.mount(ShareCard, { ...cardProps, visualKey: 'visual-1' });
  assert.strictEqual(imageOf(personalCard), null, 'enquanto a pessoal abre: nenhuma imagem, nem a cena pronta');
  lookups.get('visual-1').resolve({ uri: 'blob:personal', release: () => released.push('visual-1') });
  await settle(personalCard, () => imageOf(personalCard), 'imagem pessoal');
  assert.deepStrictEqual(imageOf(personalCard).props.source, { uri: 'blob:personal' }, 'a imagem pessoal');
  personalCard.unmount();
  assert.deepStrictEqual(released, ['visual-1'], 'fechou: a imagem pessoal é solta');
  const missingCard = app.mount(ShareCard, { ...cardProps, visualKey: 'visual-gone' });
  lookups.get('visual-gone').resolve(null);
  await settle(missingCard, () => imageOf(missingCard), 'cena pronta no lugar da pessoal');
  assert.strictEqual(imageOf(missingCard).props.source, 7, 'imagem pessoal sumiu: a cena pronta');
  const brokenCard = app.mount(ShareCard, { ...cardProps, visualKey: 'visual-broken' });
  lookups.get('visual-broken').reject(new Error('IndexedDB fechado'));
  await settle(brokenCard, () => imageOf(brokenCard), 'cena pronta quando a busca falha');
  assert.strictEqual(imageOf(brokenCard).props.source, 7, 'busca falhou: a cena pronta');
  const lateCard = app.mount(ShareCard, { ...cardProps, visualKey: 'visual-late' });
  lateCard.unmount();
  lookups.get('visual-late').resolve({ uri: 'blob:late', release: () => released.push('late') });
  await tick();
  assert.ok(released.includes('late'), 'chegou depois de fechar: a imagem é solta');
  assert.strictEqual(imageOf(app.mount(ShareCard, { phrase: 'aa', kindLabel: 'bb' })), null, 'sem as duas: o gradiente');

  // o cartão de afirmação é o ShareCard (mesmas exportações, constantes e testIDs: a tela de Afirmações não muda)
  const affirmationModule = loadWith('components/AffirmationShareCard.js', uiMocks);
  assert.deepStrictEqual({ ...affirmationModule.AFFIRMATION_SHARE_LAYOUT_SIZE }, { width: 360, height: 640 });
  assert.strictEqual(affirmationModule.AFFIRMATION_SHARE_ASPECT_RATIO, 9 / 16);
  const affirmationRef = { current: null };
  const onLayout = () => {};
  const affirmationCard = app.mount(
    affirmationModule.default,
    { affirmation: { text: '  Eu sigo com presença  ' }, categoryLabel: 'Da sua intenção', accent: 2, visualKey: 'v-1', onLayout, onVisualReady, onVisualError, style: { opacity: 1 } },
    affirmationRef
  );
  const inner = affirmationCard.tree;
  assert.strictEqual(inner.type.name, 'ShareCard', 'AffirmationShareCard embrulha o ShareCard');
  assert.strictEqual(inner.props.ref, affirmationRef, 'a ref da captura chega ao cartão');
  assert.deepStrictEqual(
    { ...inner.props, ref: undefined },
    { phrase: 'Eu sigo com presença', kindLabel: 'Da sua intenção', accent: 2, visualKey: 'v-1', testID: 'affirmation-share-card', onLayout, onVisualReady, onVisualError, style: { opacity: 1 }, ref: undefined },
    'frase, rótulo, cor, imagem, testID e avisos passam inteiros'
  );
  assert.strictEqual(app.mount(affirmationModule.default, { affirmation: 'aa', testID: 'affirmation-share-capture-card' }).tree.props.testID, 'affirmation-share-capture-card');
  const innerCard = app.mount(inner.type, { ...inner.props, ref: undefined });
  for (const id of ['affirmation-share-card', 'affirmation-share-card-brand', 'affirmation-share-card-category', 'affirmation-share-card-affirmation', 'affirmation-share-card-url']) {
    assert.ok(innerCard.byId(id), `testID ${id} continua no cartão de afirmação`);
  }

  // 7) folha no site: a prévia do cartão aparece antes de qualquer envio; o vídeo começa a gravar ao abrir (com a
  //    cena pronta quando não há imagem pessoal); tocar antes de ele ficar pronto só mostra o andamento; pronto, o
  //    toque chama navigator.share no mesmo instante com o arquivo e o link do formato; webm = aviso + cartão
  const assetModule = {
    Asset: {
      fromModule: (source) => ({
        downloadAsync: () =>
          Promise.resolve({
            uri: `/assets/scene-${source}.jpg`,
            localUri: RN.Platform.OS === 'web' ? `/assets/scene-${source}.jpg` : `file:///cache/scene-${source}.jpg`,
          }),
      }),
    },
  };
  const sheetMocks = {
    ...uiMocks,
    'expo-asset': assetModule,
    './ShareCard': { __esModule: true, default: 'ShareCard', SHARE_CARD_LAYOUT_SIZE: cardModule.SHARE_CARD_LAYOUT_SIZE },
    './PrimaryButton': { __esModule: true, default: 'PrimaryButton' },
    './cenaViva/CenaVivaRecorder': { __esModule: true, default: 'CenaVivaRecorder' },
  };
  const { default: ShareSheet } = loadWith('components/ShareSheet.js', sheetMocks);
  const content = { campaign: 'visao', phrase: 'Eu vivo com calma', kindLabel: 'Visão', visualKey: null, readyScene, lang: 'pt' };
  const closes = [];
  assert.strictEqual(app.mount(ShareSheet, { visible: false, onClose() {}, content }).tree, null, 'fechada: nada montado');
  const openSheet = (sheetContent) => {
    const outer = app.mount(ShareSheet, { visible: true, onClose: () => closes.push(sheetContent.campaign), content: sheetContent });
    return app.mount(outer.tree.type, outer.tree.props);
  };
  const lastRecorder = () => recorders[recorders.length - 1];
  const recordingStarted = (sheet) => settle(sheet, () => recorders.length && lastRecorder().jobs.length, 'gravação iniciada');
  const cardIn = (node) => descendants(node).find((child) => child.type === 'ShareCard');
  const linkShares = [];
  sharing.calls.length = 0;
  RN.Share.share = (payload) => {
    linkShares.push(payload);
    return Promise.resolve({ action: 'sharedAction' });
  };
  RN.Platform.OS = 'web';
  {
    const { seen, globals } = browser();
    await withGlobals(globals, async () => {
      const sheet = openSheet(content);
      assert.ok(sheet.find('Modal') && sheet.byId('share-sheet'), 'folha aberta');
      const previewCard = cardIn(sheet.byId('share-sheet-preview'));
      assert.ok(previewCard, 'prévia do cartão 9:16 antes de enviar');
      assert.deepStrictEqual(
        { phrase: previewCard.props.phrase, kindLabel: previewCard.props.kindLabel, visualKey: previewCard.props.visualKey, readyScene: previewCard.props.readyScene },
        { phrase: 'Eu vivo com calma', kindLabel: 'Visão', visualKey: null, readyScene },
        'a prévia mostra o que vai: frase curta, rótulo e a cena pronta'
      );
      await recordingStarted(sheet);
      assert.deepStrictEqual(
        lastRecorder().jobs[0].params,
        { imageUri: '/assets/scene-7.jpg', phrase: 'Eu vivo com calma', linkText: LINK_TEXT },
        'vídeo gravado ao abrir, com a cena pronta das respostas (sem imagem pessoal)'
      );
      assert.ok(!seen.shared.length && !sharing.calls.length, 'abrir não envia nada: a prévia vem antes');
      const videoButton = () => sheet.byId('share-video');
      assert.match(videoButton().props.label, /Preparando o vídeo/);
      videoButton().props.onPress();
      sheet.flush();
      assert.ok(sheet.byId('share-video-progress'), 'tocar antes de o vídeo ficar pronto mostra o andamento');
      assert.strictEqual(seen.shared.length, 0, '…e não compartilha nada (o próximo toque compartilha)');
      const recorded = new File([new Uint8Array(80000)], 'celeste-share-2.mp4', { type: 'video/mp4' });
      lastRecorder().jobs[0].resolve({ file: recorded, mimeType: 'video/mp4' });
      await settle(sheet, () => /Compartilhar vídeo$/.test(videoButton().props.label), 'vídeo pronto');
      assert.ok(!sheet.byId('share-video-progress') && !sheet.byId('share-video-webm-warning'), 'mp4: sem aviso');
      videoButton().props.onPress();
      assert.strictEqual(seen.shared.length, 1, 'o toque chama navigator.share no mesmo instante (nenhum await antes)');
      assert.deepStrictEqual(
        seen.shared[0],
        { files: [recorded], title: 'Compartilhar', text: `Celeste — ${shareUrl('video', 'visao')}` },
        'vídeo + link de vídeo da campanha'
      );
      await settle(sheet, () => !videoButton().props.disabled, 'compartilhado');
      // imagem: o JPEG do cartão em tamanho real é capturado antes do toque (fora da tela) e vai no mesmo toque
      const imageButton = () => sheet.byId('share-image');
      assert.ok(imageButton().props.disabled, 'imagem espera o cartão ficar pronto');
      const captureCard = sheet.byId('share-capture-card');
      assert.ok(captureCard && captureCard.type === 'ShareCard', 'site: cartão em 360×640 fora da tela para a captura');
      captureCard.props.onLayout();
      captureCard.props.onVisualReady();
      await settle(sheet, () => !imageButton().props.disabled, 'cartão capturado');
      assert.strictEqual(captures[captures.length - 1].options.result, 'data-uri');
      assert.strictEqual(captures[captures.length - 1].ref, captureCard.props.ref, 'captura o cartão em tamanho real, não a miniatura');
      imageButton().props.onPress();
      assert.strictEqual(seen.shared.length, 2, 'imagem: navigator.share no mesmo toque');
      assert.ok(seen.shared[1].files[0].type === 'image/jpeg' && /\.jpg$/.test(seen.shared[1].files[0].name), 'JPEG do cartão');
      assert.strictEqual(seen.shared[1].text, `Celeste — ${shareUrl('imagem', 'visao')}`, 'link de imagem da campanha');
      await settle(sheet, () => !imageButton().props.disabled, 'imagem compartilhada');
      await sheet.byId('share-link').props.onPress();
      assert.deepStrictEqual(
        linkShares.pop(),
        { message: `“Eu vivo com calma” — Celeste\n${shareUrl('imagem', 'visao')}` },
        'link: a frase e o link do último formato enviado'
      );
      sheet.byId('share-sheet-close').props.onPress();
      assert.deepStrictEqual(closes.splice(0), ['visao'], 'fechar avisa a tela');
      sheet.unmount();
    });
  }
  {
    // navegador que só grava webm: aviso, o vídeo vai rotulado como WebM e o cartão é o oferecido
    const { globals } = browser();
    await withGlobals(globals, async () => {
      const sheet = openSheet({ ...content, campaign: 'ancora' });
      await recordingStarted(sheet);
      const webm = new File([new Uint8Array(90000)], 'celeste-share-3.webm', { type: 'video/webm' });
      lastRecorder().jobs[0].resolve({ file: webm, mimeType: 'video/webm' });
      await settle(sheet, () => sheet.byId('share-video-webm-warning'), 'aviso de webm');
      assert.match(textOf(sheet.byId('share-video-webm-warning')), /WhatsApp/, 'avisa que o WhatsApp não abre');
      assert.match(sheet.byId('share-video').props.label, /WebM/, 'webm nunca vai calado como se fosse mp4');
      assert.strictEqual(sheet.byId('share-video').props.variant, 'soft', 'o vídeo webm sai do destaque');
      sheet.byId('share-capture-card').props.onLayout();
      sheet.byId('share-capture-card').props.onVisualReady();
      await settle(sheet, () => !sheet.byId('share-image').props.disabled, 'cartão pronto');
      assert.ok(sheet.byId('share-image').props.variant !== 'soft', 'o cartão é oferecido em destaque');
      sheet.unmount();
    });
  }
  {
    // sem gravador (navegador antigo): mensagem e cartão; falha passageira: gravar de novo
    const { globals } = browser();
    await withGlobals(globals, async () => {
      const sheet = openSheet({ ...content, campaign: 'pratica' });
      await recordingStarted(sheet);
      lastRecorder().jobs[0].reject(Object.assign(new Error('recorder_unsupported'), { code: 'recorder_unsupported' }));
      await settle(sheet, () => sheet.byId('share-video-unavailable'), 'sem gravador');
      assert.ok(sheet.byId('share-video').props.disabled, 'sem gravador: vídeo indisponível');
      assert.match(textOf(sheet.byId('share-video-unavailable')), /imagem/, 'oferece a imagem');
      sheet.unmount();
      const flaky = openSheet({ ...content, campaign: 'sonho' });
      await recordingStarted(flaky);
      lastRecorder().jobs[0].reject(Object.assign(new Error('recorder_timeout'), { code: 'recorder_timeout' }));
      await settle(flaky, () => flaky.byId('share-video-unavailable'), 'falha na gravação');
      assert.match(flaky.byId('share-video').props.label, /de novo/);
      flaky.byId('share-video').props.onPress();
      await settle(flaky, () => lastRecorder().jobs.length === 2, 'grava de novo');
      flaky.unmount();
      lastRecorder().jobs[1].reject(Object.assign(new Error('recorder_cancelled'), { code: 'recorder_cancelled' }));
      await tick(); // fechou no meio: a promessa cancelada não derruba nada
    });
  }
  {
    // imagem pessoal: vai para o vídeo e para o cartão; fechou, a imagem é solta
    const { globals } = browser();
    await withGlobals(globals, async () => {
      const sheet = openSheet({ ...content, visualKey: 'visual-anchor' });
      assert.strictEqual(cardIn(sheet.byId('share-sheet-preview')).props.visualKey, 'visual-anchor');
      lookups.get('visual-anchor').resolve({ uri: 'blob:anchor', release: () => released.push('anchor') });
      await recordingStarted(sheet);
      assert.strictEqual(lastRecorder().jobs[0].params.imageUri, 'blob:anchor', 'com imagem pessoal, o vídeo usa ela');
      sheet.unmount();
      assert.ok(released.includes('anchor'), 'fechou: a imagem pessoal é solta');
    });
  }

  // 8) folha no app: limpa vídeos velhos ao abrir; a cena vai como data URI; o vídeo vai pelo expo-sharing com o
  //    mime e sai do cache depois (Android: 90 s); fechou sem compartilhar = sai do cache na hora; a imagem é
  //    capturada na hora e vai como image/jpeg
  RN.Platform.OS = 'android';
  const appTimers = [];
  global.setTimeout = (fn, ms) => (ms === 90000 ? appTimers.push(fn) : originalTimeout(fn, ms));
  try {
    const nowMs = Date.now();
    const old = `file:///cache/celeste-share-${nowMs - 120000}.mp4`;
    const recent = `file:///cache/celeste-share-${nowMs - 5000}.mp4`;
    disk.set(old, 'x');
    disk.set(recent, 'x');
    const sheet = openSheet({ ...content, campaign: 'sonho' });
    assert.ok(!disk.has(old) && disk.has(recent), 'ao abrir: vídeos velhos do compartilhar saem do cache');
    await recordingStarted(sheet);
    assert.strictEqual(lastRecorder().jobs[0].params.imageUri, 'data:image/jpeg;base64,b64(file:///cache/scene-7.jpg)', 'app: a cena pronta vai como data URI');
    const videoUri = `file:///cache/celeste-share-${nowMs}.mp4`;
    disk.set(videoUri, 'mp4');
    lastRecorder().jobs[0].resolve({ uri: videoUri, mimeType: 'video/mp4' });
    await settle(sheet, () => /Compartilhar vídeo$/.test(sheet.byId('share-video').props.label), 'vídeo pronto no app');
    sharing.calls.length = 0;
    sheet.byId('share-video').props.onPress();
    await settle(sheet, () => sharing.calls.length === 1 && appTimers.length === 1, 'expo-sharing');
    assert.deepStrictEqual(sharing.calls[0], [videoUri, { mimeType: 'video/mp4', dialogTitle: 'Compartilhar' }], 'expo-sharing com o mime do vídeo');
    assert.ok(disk.has(videoUri), 'Android: o arquivo fica enquanto o app de destino lê');
    appTimers.pop()();
    assert.ok(!disk.has(videoUri), '…e sai do cache 90 s depois');
    sheet.unmount();
    // fechou sem compartilhar: o vídeo gravado sai do cache na hora
    const quitting = openSheet({ ...content, campaign: 'afirmacao' });
    await recordingStarted(quitting);
    const unsent = `file:///cache/celeste-share-${nowMs + 1}.mp4`;
    disk.set(unsent, 'mp4');
    lastRecorder().jobs[0].resolve({ uri: unsent, mimeType: 'video/mp4' });
    await settle(quitting, () => /Compartilhar vídeo$/.test(quitting.byId('share-video').props.label), 'vídeo não enviado');
    quitting.unmount();
    assert.ok(!disk.has(unsent), 'fechou sem compartilhar: o vídeo sai do cache na hora');
    // imagem no app: a própria prévia é capturada na hora (1080×1920) e vai como image/jpeg
    const imageSheet = openSheet({ ...content, campaign: 'afirmacao' });
    const appCard = cardIn(imageSheet.byId('share-sheet-preview'));
    assert.ok(!imageSheet.byId('share-capture-card'), 'app: sem cartão escondido (a prévia é a captura)');
    appCard.props.onLayout();
    appCard.props.onVisualReady();
    await settle(imageSheet, () => !imageSheet.byId('share-image').props.disabled, 'cartão pronto no app');
    sharing.calls.length = 0;
    imageSheet.byId('share-image').props.onPress();
    await settle(imageSheet, () => sharing.calls.length === 1, 'imagem no app');
    assert.deepStrictEqual(sharing.calls[0][0], 'file:///tmp/celeste-afirmacao.jpg');
    assert.strictEqual(sharing.calls[0][1].mimeType, 'image/jpeg');
    assert.strictEqual(captures[captures.length - 1].ref, appCard.props.ref, 'captura a prévia');
    imageSheet.unmount();
  } finally {
    global.setTimeout = originalTimeout;
  }

  // player da visão: narrando, o texto inteiro da reserva (sem cena) rola — o palco por cima deixa toque e rolagem
  // passarem (box-none) e o selo da categoria sai, para não cobrir a 1ª linha
  const playerSource = fs.readFileSync(path.join(root, 'screens/VisionPlayerScreen.js'), 'utf8');
  assert.ok(/stageContent: \{[^}]*pointerEvents: 'box-none'/.test(playerSource), 'player: o palco deixa a rolagem passar');
  assert.ok(
    /\{narrating \? null : \(\s*<View style=\{\[styles\.pill,/.test(playerSource),
    'player: narrando, o selo da categoria sai de cima do texto'
  );

  console.log(
    'Compartilhar aprovado: link só com utm, cartão final do vídeo, arquivo no mesmo toque, vídeo temporário fora do ' +
      'cache, cartão 9:16 com a cena pronta e folha com prévia, aviso de webm e cartão oferecido'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
