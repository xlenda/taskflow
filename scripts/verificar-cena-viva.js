// Portão da cena viva: o renderizador canvas 2D que EXIBE a Cena-Âncora viva e GRAVA o vídeo compartilhado.
// Uso (cwd = C:\projetos\TaskFlow): node scripts/verificar-cena-viva.js
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

function load(relative) {
  const file = path.join(root, relative);
  const code = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(code, file);
  return loaded.exports;
}

// Canvas falso: o contexto 2D grava cada chamada ({ op, args }) e cada propriedade atribuída ({ op: '=font' }).
function fakeCanvas(width = 0, height = 0) {
  const calls = [];
  const ctx = new Proxy({}, {
    get(state, prop) {
      if (prop in state) return state[prop];
      if (prop === 'measureText') return (text) => ({ width: String(text).length * 10 });
      if (prop === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      // o registro da chamada também serve de gradiente/padrão: guarda as paradas de cor
      return (...args) => {
        const made = { op: prop, args, stops: [], addColorStop: (offset, color) => made.stops.push([offset, color]) };
        calls.push(made);
        return made;
      };
    },
    set(state, prop, value) {
      state[prop] = value;
      calls.push({ op: `=${String(prop)}`, args: [value] });
      return true;
    },
  });
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  return {
    width,
    height,
    calls,
    tracks,
    getContext: (type) => (type === '2d' ? ctx : null),
    captureStream: (fps) => ({ fps, getTracks: () => tracks }),
  };
}

function fakeWindow(extra = {}) {
  const win = {
    made: [],
    frames: [],
    cancelled: [],
    document: {
      createElement(tag) {
        assert.strictEqual(tag, 'canvas');
        const canvas = fakeCanvas();
        win.made.push(canvas);
        return canvas;
      },
    },
    performance: { now: () => 0 },
    requestAnimationFrame(fn) {
      win.frames.push(fn);
      return win.frames.length;
    },
    cancelAnimationFrame(id) {
      win.cancelled.push(id);
    },
  };
  return Object.assign(win, extra);
}

const image = { width: 720, height: 900, naturalWidth: 720, naturalHeight: 900 };
const ops = (calls, op) => calls.filter((call) => call.op === op);
const near = (a, b) => Math.abs(a - b) < 0.5;
// discos pintados: arc cujo próximo traço é fill (o anel do clarão é stroke e não conta como sol)
const discs = (calls) =>
  calls.flatMap((call, i) => {
    if (call.op !== 'arc') return [];
    const paint = calls.slice(i + 1).find((next) => next.op === 'fill' || next.op === 'stroke');
    return paint && paint.op === 'fill' ? [call.args] : [];
  });
const discAt = (calls, x, y, minRadius = 0) =>
  discs(calls).some(([dx, dy, radius]) => near(dx, x) && near(dy, y) && radius >= minRadius);
const lineTo = (calls, x, y) => ops(calls, 'lineTo').some(({ args }) => near(args[0], x) && near(args[1], y));
const words = (calls) => ops(calls, 'fillText').map((call) => call.args[0]);
const count = (list, item) => list.filter((entry) => entry === item).length;
const VEIL = 'rgba(8,16,28,0.62)'; // véu da legenda
const SCRIM = 'rgba(10,20,38,0.5)'; // véu da assinatura sozinha
const hasStop = (style, color) => !!style && (style.stops || []).some(([, stop]) => stop === color);
const usesColor = (calls, color) => calls.some((call) => call.op === '=fillStyle' && hasStop(call.args[0], color));
// véu de legibilidade: entre a imagem e a palavra, um fillRect com gradiente que chega à cor do véu
function veilBefore(calls, word, color = VEIL) {
  const at = calls.findIndex((call) => call.op === 'fillText' && call.args[0] === word);
  let from = at;
  while (from > 0 && !(calls[from].op === 'drawImage' && calls[from].args[0] === image)) from -= 1;
  let style = null;
  for (let i = Math.max(0, from); i < at; i++) {
    if (calls[i].op === '=fillStyle') style = calls[i].args[0];
    if (calls[i].op === 'fillRect' && hasStop(style, color)) return { gradient: style, rect: calls[i].args, at, calls };
  }
  return null;
}

// carrega um módulo do app com Babel trocando dependências por dublês; imports relativos também passam pelo Babel
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

// React de mentira (estado, refs, memo e efeitos na ordem do React) para exercitar a fiação dos componentes sem
// navegador nem aparelho; `hosts` cria a instância de cada elemento com ref (canvas, WebView)
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
    const instance = { slots: [], cursor: 0, queue: [], dirty: false, props, attached: new Map() };
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
        // como o React: o elemento que aparece (ou troca de key) ganha instância nova na ref; o que some a solta
        const live = new Set();
        for (const node of nodes(instance.tree)) {
          const target = node.props.ref;
          if (!target || typeof target !== 'object') continue;
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
    instance.update = (next) => {
      instance.props = { ...instance.props, ...next };
      return render();
    };
    instance.flush = render; // depois de evento assíncrono (imagem carregou, mensagem da WebView)
    instance.unmount = () => instance.slots.forEach((hook) => hook && hook.effect && hook.cleanup && hook.cleanup());
    render();
    return instance;
  }
  return { React, jsxRuntime: { jsx: element, jsxs: element, Fragment: 'Fragment' }, mount };
}

// <img> de mentira: carrega no próximo giro do laço, como no navegador (antes disso não tem medidas);
// src vazio ou com "broken" = erro
class FakeImage {
  set src(value) {
    this.source = value;
    setImmediate(() => {
      const ok = !!value && !String(value).includes('broken');
      if (ok) Object.assign(this, { width: 720, height: 900, naturalWidth: 720, naturalHeight: 900 });
      const done = ok ? this.onload : this.onerror;
      if (done) done();
    });
  }
  get src() {
    return this.source;
  }
}
const drewImage = (calls) =>
  ops(calls, 'drawImage').some((call) => call.args[0] instanceof FakeImage && call.args[0].naturalWidth > 0);
// 1º quadro de uma gravação: do começo até o fundo de tinta do 2º quadro
const firstFrame = (calls) => {
  const starts = calls.flatMap((call, i) => (call.op === '=fillStyle' && call.args[0] === '#1C2E4F' ? [i] : []));
  return calls.slice(0, starts[1]);
};

// FileReader de mentira: data URL com o tipo do blob (com codecs, como no Chrome)
class FakeFileReader {
  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
      this.onload();
    });
  }
}

// MediaRecorder de mentira: `support` decide os mimes; ao parar entrega `payload` num blob só
function recorderClass(support, payload = 'abc') {
  return class FakeRecorder {
    static isTypeSupported(mime) {
      return support(mime);
    }
    constructor(stream, options) {
      Object.assign(this, { stream, options, state: 'inactive' });
    }
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: new Blob([payload]) });
      this.onstop();
    }
  };
}

// relógio que anda 100 ms a cada setTimeout: os 8 s de gravação passam em milissegundos
function fastClock() {
  let clock = 0;
  return {
    performance: { now: () => clock },
    setTimeout(fn) {
      clock += 100;
      setImmediate(fn);
    },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(check, label) {
  for (let i = 0; i < 5000; i++) {
    if (check()) return;
    await tick();
  }
  throw new Error(`esperou demais: ${label}`);
}

// roda o HTML da WebView num sandbox: cada <script> em ordem, com window = o próprio global da página e
// window.ReactNativeWebView.postMessage gravando o que a página manda para o app
function runPage(html, extra = {}) {
  const posted = [];
  const size = /<canvas id="c" width="(\d+)" height="(\d+)"/.exec(html);
  const canvas = size ? fakeCanvas(Number(size[1]), Number(size[2])) : null;
  const page = fakeWindow({
    Image: FakeImage,
    FileReader: FakeFileReader,
    Blob,
    ReactNativeWebView: { postMessage: (text) => posted.push(JSON.parse(text)) },
    ...extra,
  });
  page.window = page;
  page.document.getElementById = (id) => (id === 'c' ? canvas : null);
  const context = vm.createContext(page);
  for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) vm.runInContext(code, context);
  return { page, posted, canvas, run: (code) => vm.runInContext(code, context) };
}

async function main() {
  const { installCenaViva } = load('components/cenaViva/renderer.js');
  const win = fakeWindow();
  installCenaViva(win);
  const CV = win.CenaViva;
  assert.deepStrictEqual(
    Object.keys(CV).sort(),
    ['createRenderer', 'joinChunks', 'pickRecorderMime', 'recordVideo', 'splitChunks'],
    'installCenaViva expõe só a interface combinada'
  );

  // 1) mime: mp4 H.264 primeiro (o WhatsApp abre), webm só por último; nada → null (a tela avisa e oferece o cartão)
  assert.strictEqual(CV.pickRecorderMime((m) => m === 'video/webm'), 'video/webm');
  assert.strictEqual(CV.pickRecorderMime(() => true), 'video/mp4;codecs=avc1.42E01E');
  assert.strictEqual(CV.pickRecorderMime((m) => m === 'video/mp4' || m.startsWith('video/webm')), 'video/mp4');
  assert.strictEqual(CV.pickRecorderMime((m) => m.startsWith('video/webm')), 'video/webm;codecs=vp9');
  assert.strictEqual(CV.pickRecorderMime(() => false), null);

  // 2) vídeo em base64 pela ponte da WebView: pedaços remontam igual
  const big = 'QUJD'.repeat(262144); // 1 MB
  const parts = CV.splitChunks(big, 10);
  assert.ok(parts.length === 104858 && parts.every((part) => part.length <= 10), 'pedaços de no máximo 10');
  assert.strictEqual(CV.joinChunks(parts), big, 'remontagem igual ao original');
  assert.strictEqual(CV.splitChunks(big).length, 2, 'padrão: pedaços de 512 KB');
  assert.deepStrictEqual(CV.splitChunks('', 10), []);

  function render(options, t, [width, height] = [320, 400], caption) {
    const canvas = fakeCanvas(width, height);
    const renderer = CV.createRenderer(canvas, {
      image,
      format: '4:5',
      mode: 'loop',
      reducedMotion: false,
      signature: false,
      ...options,
    });
    if (caption) renderer.setCaption(caption);
    canvas.calls.length = 0;
    renderer.drawFrame(t);
    return canvas.calls;
  }

  // 3) desenha em qualquer formato/modo, com frase e assinatura, sem lançar
  for (const format of ['4:5', '9:16']) {
    for (const mode of ['intro', 'loop']) {
      for (const t of [0, 4000]) {
        const size = format === '9:16' ? [720, 1280] : [720, 900];
        const calls = render({ format, mode, phrase: 'Eu escolho a paz', signature: true, linkText: 'x' }, t, size);
        assert.ok(ops(calls, 'drawImage').length >= 1, `${format} ${mode} t=${t} precisa desenhar a imagem`);
      }
    }
  }

  // 4) intro: as 3 estrelas no arco do CelestialTrace ({46,112}, {w/2,45}, {w-46,112} sobre 320×168, escalado)
  //    em t=0; em t=2400 elas já viraram o sol (canto superior direito, nos terços)
  for (const [width, height] of [[320, 400], [640, 800]]) {
    const k = width / 320;
    const start = render({ mode: 'intro' }, 0, [width, height]);
    const left = discs(start).find(([x]) => near(x, 46 * k));
    assert.ok(left, `estrela da esquerda em x=${46 * k} (${width}px)`);
    const y = left[1];
    assert.ok(y > 0 && y < height / 2, 'o arco das estrelas fica no céu');
    assert.ok(discAt(start, width / 2, y - 67 * k), 'estrela do meio 67 (escalado) acima, no centro');
    assert.ok(discAt(start, width - 46 * k, y), 'estrela da direita na altura da esquerda');
    assert.ok(!lineTo(start, width / 2, y - 67 * k), 'em t=0 as linhas ainda não se ligaram');
    const linked = render({ mode: 'intro' }, 900, [width, height]);
    assert.ok(lineTo(linked, width / 2, y - 67 * k) && lineTo(linked, width - 46 * k, y), 'linhas ligam as 3 estrelas');
    const sun = [width * 0.7, height * 0.3];
    assert.ok(!discAt(start, sun[0], sun[1], 0.03 * width), 'em t=0 o sol ainda não acendeu');
    const flying = render({ mode: 'intro' }, 1600, [width, height]);
    assert.ok(
      [[46 * k, y], [width / 2, y - 67 * k], [width - 46 * k, y]].every(([x, yy]) => !discAt(flying, x, yy)),
      'em t=1600 as 3 estrelas já saíram do arco (voando)'
    );
    assert.ok(!discAt(flying, sun[0], sun[1], 0.03 * width), 'o sol só acende quando elas chegam');
    const lit = render({ mode: 'intro' }, 2400, [width, height]);
    assert.ok(discAt(lit, sun[0], sun[1], 0.03 * width), 'em t=2400 o sol está desenhado');
    assert.ok(!discAt(lit, 46 * k, y) && !discAt(lit, width / 2, y - 67 * k), 'as estrelas saíram do arco');
  }

  // 5) poeira de luz: 60 partículas semeadas (mesma semente = mesmo quadro)
  const dust = (calls) => discs(calls).filter(([, , radius]) => radius < 0.05 * 320);
  assert.strictEqual(dust(render({}, 4000)).length, 60, '60 partículas');
  const motes = (seed) => JSON.stringify(dust(render({ seed }, 4000)));
  assert.strictEqual(motes(7), motes(7), 'mesma semente, mesmo quadro');
  assert.notStrictEqual(motes(7), motes(8), 'semente diferente, partículas diferentes');

  // 6) reduzir movimento: um único drawImage, nada de partícula/estrela/sol; a frase continua
  const still = render({ reducedMotion: true, mode: 'intro', phrase: 'aa bb' }, 4000);
  assert.strictEqual(ops(still, 'drawImage').length, 1, 'reduzir movimento = um único drawImage');
  assert.strictEqual(ops(still, 'arc').length, 0, 'reduzir movimento = sem partículas');
  assert.deepStrictEqual(words(still), ['aa', 'bb'], 'reduzir movimento mantém a frase');

  // 7) legenda: só as palavras até o progresso, serifada (Georgia), no terço inferior
  const caption = (progress, options = {}) => render(options, 4000, [320, 400], { text: 'aa bb cc dd', progress });
  assert.deepStrictEqual(words(caption(0)), []);
  assert.deepStrictEqual(words(caption(0.5)), ['aa', 'bb']);
  assert.deepStrictEqual(words(caption(1)), ['aa', 'bb', 'cc', 'dd']);
  assert.ok(ops(caption(1), 'fillText').every((call) => call.args[2] >= (400 * 2) / 3), 'legenda no terço inferior');
  assert.ok(ops(caption(1), '=font').some((call) => /italic.*Georgia/.test(call.args[0])), 'legenda em Georgia');
  // legibilidade nas cenas prontas de centro claro: véu escuro ANTES do texto, sólido acima da 1ª linha, até o pé
  const legible = veilBefore(caption(1), 'aa');
  assert.ok(legible, 'véu de legibilidade (até rgba(8,16,28,0.62)) pintado entre a imagem e o texto');
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(ops(legible.calls, '=font').pop().args[0])[1]);
  const baseline = ops(legible.calls, 'fillText')[0].args[2];
  assert.ok(legible.gradient.args[3] <= baseline - size, 'véu já sólido acima do topo da 1ª linha');
  assert.ok(legible.rect[1] + legible.rect[3] >= 400, 'véu vai até o pé do quadro');
  assert.ok(
    legible.calls.slice(0, legible.at).some((call) => call.op === '=shadowBlur' && call.args[0] > 0),
    'sombra suave no texto'
  );
  const story = Array.from({ length: 60 }, (_, i) => `p${i}`).join(' ');
  const rolled = words(render({}, 4000, [320, 400], { text: story, progress: 1 }));
  assert.ok(rolled.length < 60 && rolled[rolled.length - 1] === 'p59', 'narração longa rola: últimas linhas');
  assert.deepStrictEqual(words(caption(-0.5)), [], 'progress < 0 vira 0');
  assert.deepStrictEqual(words(caption(1.7)), ['aa', 'bb', 'cc', 'dd'], 'progress > 1 vira 1');
  assert.deepStrictEqual(words(caption(Number.NaN)), [], 'progress NaN vira 0');
  for (const text of ['', '   ']) {
    const blank = render({}, 4000, [320, 400], { text, progress: 1 });
    assert.ok(!ops(blank, 'fillText').length && !usesColor(blank, VEIL), `texto ${JSON.stringify(text)} não vira legenda`);
  }
  // palavra sozinha mais larga que a caixa (84%): a linha encolhe e cabe, nada cortado
  const wide = render({}, 4000, [320, 400], { text: 'x'.repeat(40), progress: 1 });
  const lineSize = Number(/(\d+(?:\.\d+)?)px/.exec(ops(wide, '=font').pop().args[0])[1]);
  const [longWord] = ops(wide, 'fillText');
  const scaledWidth = 400 * (lineSize / Math.round(320 * 0.058)); // canvas falso: 10 px por letra no tamanho base
  assert.ok(longWord.args[1] >= 0 && longWord.args[1] + scaledWidth <= 320, 'palavra longa encolhe e cabe');
  assert.deepStrictEqual(words(render({ mode: 'intro', phrase: 'aa bb' }, 0)), [], 'intro: frase espera o sol');
  assert.deepStrictEqual(words(render({ mode: 'intro', phrase: 'aa bb' }, 4000)), ['aa', 'bb']);

  // 8) assinatura: 3 estrelas + "Celeste" + link no rodapé, só quando pedida
  const signed = words(render({ format: '9:16', signature: true, linkText: 'celeste.app' }, 4000, [720, 1280]));
  assert.ok(signed.includes('Celeste') && signed.includes('celeste.app'), 'assinatura com Celeste e link');
  assert.ok(!words(render({}, 4000)).includes('Celeste'), 'sem assinatura quando signature=false');
  const spaces = render({ format: '9:16', signature: true, linkText: 'celeste.app' }, 4000, [720, 1280], { text: '  ' });
  assert.ok(!usesColor(spaces, VEIL), 'legenda só de espaços não conta como legenda');
  assert.ok(veilBefore(spaces, 'Celeste', SCRIM), 'assinatura nunca aparece sem o seu véu');

  // 9) 9:16: imagem 4:5 nítida centralizada sobre a mesma imagem borrada cobrindo o quadro
  const tall = ops(render({ format: '9:16' }, 0, [720, 1280]), 'drawImage').map(({ args }) => ({
    source: args[0],
    dest: args.slice(-4).map(Math.round).join(','),
  }));
  assert.ok(tall.some((d) => d.source !== image && d.dest === '0,0,720,1280'), 'fundo borrado cobre o quadro');
  assert.ok(tall.some((d) => d.source === image && d.dest === '0,190,720,900'), 'imagem 4:5 nítida centralizada');
  assert.strictEqual(tall.filter((d) => d.dest === '0,0,720,1280').length, 1, 'só o fundo cobre o quadro inteiro');
  assert.ok(
    tall.some((d) => d.source !== image && d.dest === '0,190,720,900'),
    'raios macios dentro da imagem (não invadem a faixa da assinatura)'
  );
  assert.ok(
    win.made.some((c) => c.calls.some((call) => call.op === '=filter' && /blur\(/.test(call.args[0]))),
    'fundo do 9:16 é borrado'
  );

  // 10) start/stop: laço por requestAnimationFrame; reduzir movimento desenha uma vez e não anima
  const playing = fakeCanvas(320, 400);
  const options = { image, format: '4:5', mode: 'loop', reducedMotion: false, signature: false };
  const live = CV.createRenderer(playing, options);
  const scheduled = win.frames.length;
  live.start();
  assert.strictEqual(win.frames.length, scheduled + 1, 'start agenda o próximo quadro');
  assert.ok(ops(playing.calls, 'drawImage').length >= 1, 'start já desenha o primeiro quadro');
  live.stop();
  assert.ok(win.cancelled.includes(scheduled + 1), 'stop cancela o quadro agendado');
  live.destroy();
  const quiet = CV.createRenderer(fakeCanvas(320, 400), { ...options, reducedMotion: true });
  quiet.start();
  assert.strictEqual(win.frames.length, scheduled + 1, 'reduzir movimento não anima');
  quiet.destroy();
  // setCaption parado (antes do start, depois do stop, reduzir movimento) repinta já; tocando, quem pinta é o laço
  const idle = fakeCanvas(320, 400);
  const idleRenderer = CV.createRenderer(idle, options);
  idleRenderer.setCaption({ text: 'aa bb', progress: 1 });
  assert.deepStrictEqual(words(idle.calls), ['aa', 'bb'], 'antes do start: a legenda nova aparece já');
  idleRenderer.start();
  idle.calls.length = 0;
  idleRenderer.setCaption({ text: 'cc dd', progress: 1 });
  assert.deepStrictEqual(words(idle.calls), [], 'tocando: sem quadro extra, o laço pinta');
  idleRenderer.stop();
  idle.calls.length = 0;
  idleRenderer.setCaption({ text: 'ee ff', progress: 1 });
  assert.deepStrictEqual(words(idle.calls), ['ee', 'ff'], 'depois do stop: a legenda nova aparece já');
  idleRenderer.destroy();
  const calm = fakeCanvas(320, 400);
  CV.createRenderer(calm, { ...options, reducedMotion: true }).setCaption({ text: 'gg hh', progress: 1 });
  assert.deepStrictEqual(words(calm.calls), ['gg', 'hh'], 'reduzir movimento: a legenda nova aparece já');
  // parado, a legenda nova repinta o ÚLTIMO quadro mostrado: o relógio já andou e a cena não pode pular
  let wall = 0;
  const timed = fakeWindow({ performance: { now: () => wall } });
  installCenaViva(timed);
  const held = fakeCanvas(320, 400);
  const holding = timed.CenaViva.createRenderer(held, options);
  holding.start(); // quadro t=0
  wall = 1000;
  timed.frames[timed.frames.length - 1](); // quadro t=1000
  wall = 1500;
  holding.stop();
  held.calls.length = 0;
  holding.setCaption({ text: 'aa', progress: 1 });
  const zoomAt = (calls) => ops(calls, 'drawImage').find((call) => call.args[0] === image).args[7];
  assert.ok(!near(zoomAt(render({}, 1000)), zoomAt(render({}, 1500))), 'a câmera denuncia o tempo do quadro');
  assert.strictEqual(zoomAt(held.calls), zoomAt(render({}, 1000)), 'parado: repinta o último quadro mostrado');
  holding.destroy();
  // destruído (a tela saiu): legenda, quadro e start viram nada — callbacks atrasados não pintam nem agendam
  const gone = fakeCanvas(320, 400);
  const dead = CV.createRenderer(gone, options);
  dead.destroy();
  gone.calls.length = 0;
  const pending = win.frames.length;
  dead.setCaption({ text: 'aa', progress: 1 });
  dead.drawFrame(100);
  dead.start();
  assert.strictEqual(gone.calls.length, 0, 'destruído: não pinta');
  assert.strictEqual(win.frames.length, pending, 'destruído: não agenda quadro');
  // valores falsos não viram legenda (false/0/NaN viravam "false"/"0"/"NaN" na tela)
  for (const phrase of [false, 0, Number.NaN]) {
    assert.deepStrictEqual(words(render({ phrase }, 4000)), [], `frase ${String(phrase)} não vira legenda`);
  }
  for (const text of [false, 0]) {
    const falsy = render({}, 4000, [320, 400], { text, progress: 1 });
    assert.ok(!ops(falsy, 'fillText').length && !usesColor(falsy, VEIL), `legenda ${String(text)} não vira legenda`);
  }

  // 11) recordVideo: sem gravador compatível rejeita com recorder_unsupported (a tela oferece o cartão)
  await assert.rejects(CV.recordVideo({ image, phrase: 'aa' }), (error) => error.code === 'recorder_unsupported');
  const none = fakeWindow({ MediaRecorder: { isTypeSupported: () => false } });
  installCenaViva(none);
  await assert.rejects(none.CenaViva.recordVideo({ image }), (error) => error.code === 'recorder_unsupported');

  // gravador falso; a cada setTimeout o relógio anda advance(ms)
  async function fakeRecording(advance) {
    let clock = 0;
    const delays = [];
    const recorders = [];
    class FakeRecorder {
      static isTypeSupported(mime) {
        return mime.startsWith('video/webm');
      }
      constructor(stream, recorderOptions) {
        Object.assign(this, { stream, recorderOptions, state: 'inactive' });
        recorders.push(this);
      }
      start() {
        this.state = 'recording';
      }
      stop() {
        this.state = 'inactive';
        this.ondataavailable({ data: new Blob(['abc']) });
        this.onstop();
      }
    }
    const studio = fakeWindow({
      MediaRecorder: FakeRecorder,
      Blob,
      performance: { now: () => clock },
      setTimeout(fn, ms) {
        delays.push(ms);
        clock += advance(ms);
        setImmediate(fn);
      },
    });
    installCenaViva(studio);
    const video = await studio.CenaViva.recordVideo({ image, phrase: 'aa bb', linkText: 'celeste.app', durationMs: 1000 });
    return { video, delays, recorders, recording: studio.made[0], clock };
  }

  // relógio de 100 ms por quadro: 9:16 720×1280, legenda progressiva, para no fim, devolve o blob
  const { video, delays, recorders, recording, clock } = await fakeRecording(() => 100);
  assert.strictEqual(video.mimeType, 'video/webm;codecs=vp9');
  assert.ok(video.blob.size === 3 && video.blob.type === 'video/webm;codecs=vp9', 'blob com o mime escolhido');
  assert.ok(recording.width === 720 && recording.height === 1280, 'grava em 720×1280');
  assert.strictEqual(recorders.length, 1);
  assert.strictEqual(recorders[0].stream.fps, undefined, 'captureStream sem teto: o laço de pintura é o relógio');
  assert.ok(near(delays[0], 1000 / 30), 'pinta a 30 fps');
  assert.strictEqual(recorders[0].recorderOptions.mimeType, 'video/webm;codecs=vp9');
  assert.ok(clock >= 1000, 'grava a duração inteira');
  assert.ok(recording.tracks.every((track) => track.stopped), 'solta a câmera do canvas no fim');
  const recorded = words(recording.calls);
  assert.strictEqual(count(recorded, 'Celeste'), 11, 'assinatura em cada quadro (t = 0, 100 … 1000)');
  assert.strictEqual(count(recorded, 'celeste.app'), 11, 'link em cada quadro');
  assert.strictEqual(count(recorded, 'aa'), 10, 'legenda começa vazia em t=0 (progress = t / duração)');
  assert.strictEqual(count(recorded, 'bb'), 4, '"bb" só depois que o progresso passa do seu começo');
  assert.ok(veilBefore(recording.calls, 'aa'), 'vídeo 9:16: véu de legibilidade antes da legenda');
  // ritmo: com pintura instantânea, cada quadro sai 1/30 s depois do anterior (sem quadro repetido no começo)
  const paced = await fakeRecording((ms) => ms);
  assert.ok(paced.delays.length >= 30 && paced.delays.every((ms) => near(ms, 1000 / 30)), 'um quadro a cada 1/30 s');

  // 12) a WebView roda a MESMA fonte: arquivo gerado sincronizado e executável sem módulo
  const check = spawnSync(process.execPath, [path.join('scripts', 'gerar-cena-viva-webview.js'), '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.strictEqual(check.status, 0, `fonte da WebView velha: ${check.stderr || check.stdout}`);
  const { CENA_VIVA_RENDERER_SOURCE: source } = load('components/cenaViva/rendererSource.generated.js');
  assert.ok(source.trimEnd().endsWith('installCenaViva(window);'), 'fonte termina instalando no window');
  assert.ok(!/^\s*(export|import)\s/m.test(source), 'fonte da WebView sem export/import');
  const sandbox = { window: fakeWindow() };
  vm.runInNewContext(source, sandbox);
  assert.strictEqual(sandbox.window.CenaViva.pickRecorderMime(() => true), 'video/mp4;codecs=avc1.42E01E');
  const webview = fakeCanvas(720, 1280);
  sandbox.window.CenaViva.createRenderer(webview, { image, format: '9:16', mode: 'intro', signature: true }).drawFrame(2400);
  assert.ok(ops(webview.calls, 'drawImage').length >= 2, 'a cópia da WebView desenha');

  // 13) fronteiras: o site importa o renderizador como módulo (CSP script-src 'self': nada de eval) e não usa
  //     WebView; o app usa react-native-webview com a MESMA fonte gerada
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
  assert.ok(JSON.parse(read('package.json')).dependencies['react-native-webview'], 'react-native-webview instalado');
  for (const file of ['CenaViva.web.js', 'CenaVivaRecorder.web.js']) {
    const code = read(`components/cenaViva/${file}`);
    assert.ok(!/react-native-webview|WebView/.test(code), `${file} não usa WebView`);
    assert.ok(/from '\.\/renderer'/.test(code), `${file} importa o renderizador como módulo`);
    assert.ok(!/CENA_VIVA_RENDERER_SOURCE|new Function|\beval\(/.test(code), `${file} sem eval (CSP script-src 'self')`);
  }
  for (const file of ['CenaViva.js', 'CenaVivaRecorder.js']) {
    assert.ok(/from 'react-native-webview'/.test(read(`components/cenaViva/${file}`)), `${file} usa react-native-webview`);
  }
  assert.ok(/CENA_VIVA_RENDERER_SOURCE/.test(read('components/cenaViva/CenaViva.js')), 'CenaViva.js injeta a fonte gerada');

  // dublês do app: React de mentira, react-native, WebView, expo-file-system (grava em memória) e expo-asset
  const hosts = {
    canvas: (props) => fakeCanvas(props.width, props.height),
    WebView: () => ({
      injected: [],
      injectJavaScript(code) {
        this.injected.push(code);
      },
    }),
  };
  const device = { reduce: false, listeners: new Set(), disk: new Map(), diskFull: false };
  const RN = {
    View: 'View',
    Text: 'Text',
    StyleSheet: { create: (styles) => styles },
    Platform: { OS: 'android', select: (choices) => choices.default },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(device.reduce),
      addEventListener: (event, listener) => {
        device.listeners.add(listener);
        return { remove: () => device.listeners.delete(listener) };
      },
    },
  };
  const written = [];
  class DeviceFile {
    constructor(...parts) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() {
      return device.disk.has(this.uri);
    }
    create() {
      device.disk.set(this.uri, '');
    }
    write(content, writeOptions) {
      if (device.diskFull) throw new Error('ENOSPC: disco cheio');
      device.disk.set(this.uri, content);
      written.push({ uri: this.uri, content, options: writeOptions });
    }
    delete() {
      device.disk.delete(this.uri);
    }
    base64() {
      return Promise.resolve(`b64(${this.uri})`);
    }
  }
  // estilo achatado como o StyleSheet.flatten: o último vence
  const flat = (style) => Object.assign({}, ...[].concat(style).filter(Boolean));
  const shareFiles = () => [...device.disk.keys()].filter((uri) => uri.includes('celeste-share-'));
  const assetRequests = [];
  const assetModule = {
    Asset: {
      fromModule: (source) => {
        assetRequests.push(source);
        const uri = `/assets/scene-${source}.jpg`;
        const asset = { uri, localUri: RN.Platform.OS === 'web' ? uri : `file:///cache/scene-${source}.jpg` };
        return { downloadAsync: () => Promise.resolve(asset) };
      },
    },
  };
  const app = fakeReact(hosts);
  const mocks = {
    react: app.React,
    'react/jsx-runtime': app.jsxRuntime,
    'react-native': RN,
    'react-native-webview': { WebView: 'WebView' },
    'expo-file-system': { File: DeviceFile, Paths: { cache: { uri: 'file:///cache' } } },
    'expo-asset': assetModule,
  };
  const message = (data) => ({ nativeEvent: { data: JSON.stringify(data) } });

  // 14) imagem da cena: pessoal (blob: no site, file:// no app) ou cena pronta; no app vira data URI para a WebView
  const { imageUriForCenaViva } = loadWith('components/cenaViva/imageSource.js', mocks);
  const readyScene = { id: 'beach-Love', source: 7, place: 'beach', category: 'Love' };
  assert.strictEqual(
    await imageUriForCenaViva({ personalUri: 'file:///document/v.jpg', readyScene }),
    'data:image/jpeg;base64,b64(file:///document/v.jpg)',
    'app: imagem pessoal vira data URI'
  );
  assert.deepStrictEqual(assetRequests, [], 'com imagem pessoal a cena pronta nem carrega');
  assert.strictEqual(
    await imageUriForCenaViva({ personalUri: null, readyScene }),
    'data:image/jpeg;base64,b64(file:///cache/scene-7.jpg)',
    'app: cena pronta baixada do pacote (localUri) e lida em base64'
  );
  RN.Platform.OS = 'ios';
  assert.strictEqual(
    await imageUriForCenaViva({ personalUri: 'file:///document/v.jpg', readyScene }),
    'data:image/jpeg;base64,b64(file:///document/v.jpg)',
    'iPhone também: data URI para a WebView'
  );
  RN.Platform.OS = 'web';
  const blobUri = 'blob:http://localhost/abc';
  assert.strictEqual(await imageUriForCenaViva({ personalUri: blobUri, readyScene }), blobUri, 'site: blob: direto');
  assert.strictEqual(await imageUriForCenaViva({ personalUri: null, readyScene }), '/assets/scene-7.jpg', 'site: URL do asset');
  RN.Platform.OS = 'android';

  // 15) app: WebView com HTML inline (MESMA fonte), pôster parado até ficar ativa, comandos sem recarregar
  const { default: NativeScene } = loadWith('components/cenaViva/CenaViva.js', mocks);
  const sneaky = 'aa </script><b>bb';
  let readyCalls = 0;
  const scene = app.mount(NativeScene, {
    imageUri: 'data:image/jpeg;base64,QUJD',
    phrase: sneaky,
    onReady: () => (readyCalls += 1),
  });
  assert.strictEqual(scene.tree.props.testID, 'cena-viva');
  assert.ok(scene.tree.props.accessibilityRole === 'image' && scene.tree.props.accessibilityLabel === sneaky, 'leitor de tela lê a frase');
  assert.strictEqual(scene.tree.props.pointerEvents, 'none', 'o toque passa para o card de fora (a WebView não engole)');
  assert.strictEqual(flat(scene.tree.props.style).aspectRatio, 4 / 5, 'sem style, o card tem altura própria (4:5)');
  assert.strictEqual(device.listeners.size, 1, 'ouve o reduzir movimento do aparelho');
  assert.strictEqual(scene.find('WebView'), null, 'antes de saber se o aparelho pede menos movimento, nada de WebView');
  await tick();
  scene.flush();
  const shownView = scene.find('WebView');
  assert.ok(shownView, 'WebView aberta');
  assert.deepStrictEqual(shownView.props.originWhitelist, ['*']);
  assert.ok(shownView.props.javaScriptEnabled && shownView.props.allowsInlineMediaPlayback, 'JS e mídia inline ligados');
  const sceneHtml = shownView.props.source.html;
  assert.ok(sceneHtml.includes(source), 'a página roda a MESMA fonte gerada');
  assert.strictEqual(sceneHtml.split('</script>').length - 1, 2, 'a frase não fecha a tag <script>');
  const shown = runPage(sceneHtml);
  assert.ok(shown.canvas.width === 720 && shown.canvas.height === 900, '4:5 em 720×900, como o vídeo');
  await until(() => shown.posted.length, 'cena pronta');
  assert.deepStrictEqual(shown.posted.map((sent) => sent.type), ['ready']);
  assert.ok(drewImage(shown.canvas.calls), 'pôster: primeiro quadro com a imagem carregada');
  assert.ok(words(shown.canvas.calls).includes('</script><b>bb'), 'a frase chega inteira na página');
  assert.strictEqual(shown.page.frames.length, 0, 'sem o app mandar, não anima');
  shownView.props.onMessage(message(shown.posted[0]));
  scene.flush();
  assert.strictEqual(readyCalls, 1, 'onReady quando a página desenhou');
  const webHost = scene.find('WebView').props.ref.current;
  const deliver = () => webHost.injected.splice(0).forEach((code) => shown.run(code));
  deliver();
  assert.strictEqual(shown.page.frames.length, 1, 'ativa (padrão): anima');
  scene.update({ active: false });
  deliver();
  assert.deepStrictEqual(shown.page.cancelled, [1], 'active=false: para no quadro');
  shown.canvas.calls.length = 0;
  scene.update({ caption: { text: 'cc dd', progress: 1 } });
  deliver();
  assert.deepStrictEqual(words(shown.canvas.calls), ['cc', 'dd'], 'legenda chega sem recarregar e aparece parada');
  assert.strictEqual(scene.tree.props.accessibilityLabel, 'cc dd', 'leitor de tela lê a legenda');
  assert.strictEqual(scene.find('WebView').props.source.html, sceneHtml, 'active/legenda não recarregam a WebView');
  // legenda vazia (ou retirada) depois de mostrada: a frase volta, na tela e no leitor de tela
  shown.canvas.calls.length = 0;
  scene.update({ caption: { text: '  ', progress: 1 } });
  deliver();
  assert.deepStrictEqual(words(shown.canvas.calls), ['aa', '</script><b>bb'], 'legenda vazia: a frase volta à tela');
  assert.strictEqual(scene.tree.props.accessibilityLabel, sneaky, 'legenda vazia: o rótulo volta a ser a frase');
  scene.update({ caption: { text: 'cc dd', progress: 1 } });
  deliver();
  scene.update({ format: '9:16' });
  assert.notStrictEqual(scene.find('WebView').props.source.html, sceneHtml, 'formato novo = cena nova');
  assert.strictEqual(flat(scene.tree.props.style).aspectRatio, 9 / 16, '9:16 tem altura própria de 9:16');
  const tallPage = runPage(scene.find('WebView').props.source.html);
  assert.ok(tallPage.canvas.height === 1280, '9:16 em 720×1280');
  // o 'ready' atrasado da página velha não vale para a nova (comandos iriam antes de o renderizador existir)
  scene.find('WebView').props.onMessage(message(shown.posted[0]));
  scene.flush();
  assert.deepStrictEqual(webHost.injected, [], 'ready da página velha: nenhum comando para a nova');
  await until(() => tallPage.posted.length, 'cena 9:16 pronta');
  scene.find('WebView').props.onMessage(message(tallPage.posted[0]));
  scene.flush();
  webHost.injected.splice(0).forEach((code) => tallPage.run(code));
  assert.deepStrictEqual(words(tallPage.canvas.calls).slice(-2), ['cc', 'dd'], 'página nova recebe a legenda atual');
  assert.strictEqual(tallPage.page.frames.length, 0, 'página nova recebe o estado atual (parada)');
  assert.strictEqual(readyCalls, 2, 'onReady a cada cena nova pronta');
  scene.update({ active: true });
  webHost.injected.splice(0).forEach((code) => tallPage.run(code));
  assert.strictEqual(tallPage.page.frames.length, 1, 'e anima quando o app manda');
  // a WebView perdeu o processo (app em segundo plano): a WebView morta sai (key nova), entra página nova e o
  // 'ready' dela reenvia active e legenda — sem isso o card fica azul-marinho vazio
  const lost = scene.find('WebView');
  const lostHost = lost.props.ref.current;
  lost.props.onRenderProcessGone({ nativeEvent: { didCrash: false } });
  scene.flush();
  const reborn = scene.find('WebView');
  assert.ok(reborn.key !== lost.key && reborn.props.ref.current !== lostHost, 'Android: a WebView morta sai (key nova)');
  assert.notStrictEqual(reborn.props.source.html, lost.props.source.html, 'página nova (id novo)');
  const rebornPage = runPage(reborn.props.source.html);
  await until(() => rebornPage.posted.length, 'cena renascida pronta');
  reborn.props.onMessage(message(rebornPage.posted[0]));
  scene.flush();
  const rebornHost = scene.find('WebView').props.ref.current;
  assert.deepStrictEqual(
    rebornHost.injected,
    ['window.cenaVivaCommand({"active":true});true;', 'window.cenaVivaCommand({"caption":{"text":"cc dd","progress":1}});true;'],
    'o ready da página nova reenvia active e legenda'
  );
  rebornHost.injected.splice(0).forEach((code) => rebornPage.run(code));
  assert.strictEqual(rebornPage.page.frames.length, 1, 'renasceu animando');
  scene.find('WebView').props.onContentProcessDidTerminate({ nativeEvent: {} });
  scene.flush();
  assert.notStrictEqual(scene.find('WebView').key, reborn.key, 'iOS: processo encerrado = página nova também');
  // legenda retirada enquanto a página nova carrega: ela já nasce com a frase (nada de legenda por cima)
  scene.update({ caption: undefined });
  const lastPage = runPage(scene.find('WebView').props.source.html);
  await until(() => lastPage.posted.length, 'cena sem legenda pronta');
  scene.find('WebView').props.onMessage(message(lastPage.posted[0]));
  scene.flush();
  assert.deepStrictEqual(
    scene.find('WebView').props.ref.current.injected.splice(0),
    ['window.cenaVivaCommand({"active":true});true;'],
    'página nova sem legenda: só o active'
  );
  // ligou "reduzir movimento" no aparelho com a cena aberta: a página renasce parada
  device.listeners.forEach((listener) => listener(true));
  scene.flush();
  assert.ok(scene.find('WebView').props.source.html.includes('"reducedMotion":true'), 'reduzir movimento ligado: página parada');
  scene.unmount();
  assert.strictEqual(device.listeners.size, 0, 'saiu da tela: solta o ouvinte de reduzir movimento');
  const square = app.mount(NativeScene, { imageUri: 'data:image/jpeg;base64,QUJD', style: { aspectRatio: 1 } });
  assert.strictEqual(flat(square.tree.props.style).aspectRatio, 1, 'o style de quem chama vence');
  square.unmount();
  // reduzir movimento no aparelho: a página nasce parada e o app nunca manda animar
  device.reduce = true;
  const calmScene = app.mount(NativeScene, { imageUri: 'data:image/jpeg;base64,QUJD' });
  await tick();
  calmScene.flush();
  const stillPage = runPage(calmScene.find('WebView').props.source.html);
  await until(() => stillPage.posted.length, 'cena parada pronta');
  calmScene.find('WebView').props.onMessage(message(stillPage.posted[0]));
  calmScene.flush();
  calmScene.find('WebView').props.ref.current.injected.splice(0).forEach((code) => stillPage.run(code));
  assert.strictEqual(stillPage.page.frames.length, 0, 'reduzir movimento: imagem parada');
  assert.strictEqual(ops(stillPage.canvas.calls, 'drawImage').length, 1, 'reduzir movimento: um único drawImage');
  calmScene.unmount();
  device.reduce = false;
  assert.strictEqual(app.mount(NativeScene, {}).find('WebView'), null, 'sem imagem ainda: só o fundo');
  // imagem que não carrega: avisa quem chama (onError) e a frase continua visível, em texto sobre o fundo
  const nativeFailures = [];
  const brokenScene = app.mount(NativeScene, {
    imageUri: 'data:image/jpeg;base64,broken',
    phrase: 'aa bb',
    onError: (code) => nativeFailures.push(code),
  });
  await tick();
  brokenScene.flush();
  assert.strictEqual(brokenScene.find('Text'), null, 'antes do erro, nada de texto por cima');
  const brokenPage = runPage(brokenScene.find('WebView').props.source.html);
  await until(() => brokenPage.posted.length, 'erro da imagem');
  assert.deepStrictEqual(brokenPage.posted.map((sent) => [sent.type, sent.code]), [['error', 'image_error']]);
  brokenScene.find('WebView').props.onMessage(message(brokenPage.posted[0]));
  brokenScene.flush();
  assert.deepStrictEqual(nativeFailures, ['image_error'], "onError('image_error')");
  assert.strictEqual(brokenScene.find('Text').props.children, 'aa bb', 'a frase aparece em texto (não some)');
  brokenScene.unmount();

  // 16) app: gravador numa WebView oculta; o vídeo volta em pedaços { type: 'chunk', index, total, data } e
  //     { type: 'done', mimeType }, é remontado igual e gravado em Paths.cache/celeste-share-<ts>.mp4|webm
  const { default: NativeRecorder, collectVideo } = loadWith('components/cenaViva/CenaVivaRecorder.js', mocks);
  const recorderRef = { current: null };
  const recorder = app.mount(NativeRecorder, {}, recorderRef);
  assert.strictEqual(recorder.find('WebView'), null, 'sem gravação, sem WebView');
  const job = { imageUri: 'data:image/jpeg;base64,QUJD', phrase: 'aa bb', linkText: 'celeste.app' };
  const payload = require('crypto').randomBytes(1300000); // ~1,7 MB em base64 = 4 pedaços de 512 KB
  async function recordOnPage(pageExtra) {
    const pending = recorderRef.current.record(job);
    recorder.flush();
    const hidden = recorder.find('WebView');
    assert.ok(hidden, 'gravando: WebView oculta montada');
    const studio = runPage(hidden.props.source.html, { ...fastClock(), ...pageExtra });
    await until(() => studio.posted.some((sent) => sent.type === 'done' || sent.type === 'error'), 'gravação');
    studio.posted.forEach((sent) => hidden.props.onMessage(message(sent)));
    recorder.flush();
    return { pending, studio, hidden };
  }
  const mp4 = await recordOnPage({ MediaRecorder: recorderClass((mime) => mime.startsWith('video/mp4'), payload) });
  const chunks = mp4.studio.posted.filter((sent) => sent.type === 'chunk');
  assert.ok(chunks.length === 4, `4 pedaços (veio ${chunks.length})`);
  chunks.forEach((sent, i) => {
    assert.deepStrictEqual(Object.keys(sent).sort(), ['data', 'index', 'total', 'type'], 'pedaço { type, index, total, data }');
    assert.ok(sent.index === i && sent.total === 4 && sent.data.length <= 512 * 1024, 'pedaços em ordem, até 512 KB');
  });
  assert.deepStrictEqual(mp4.studio.posted[mp4.studio.posted.length - 1], { type: 'done', mimeType: 'video/mp4;codecs=avc1.42E01E' });
  const filmed = words(mp4.studio.page.made[0].calls);
  assert.ok(filmed.includes('bb') && filmed.includes('Celeste') && filmed.includes('celeste.app'), 'frase, assinatura e link no vídeo');
  assert.ok(drewImage(firstFrame(mp4.studio.page.made[0].calls)), 'o vídeo já começa com a imagem (gravou depois de carregar)');
  const mp4Video = await mp4.pending;
  assert.match(mp4Video.uri, /^file:\/\/\/cache\/celeste-share-\d+\.mp4$/, 'mp4 no cache do app');
  assert.strictEqual(mp4Video.mimeType, 'video/mp4', 'mime sem codecs (o filtro do Android casa video/mp4)');
  const saved = written.find((file) => file.uri === mp4Video.uri);
  assert.strictEqual(saved.content, payload.toString('base64'), 'vídeo remontado igual ao gravado');
  assert.deepStrictEqual(saved.options, { encoding: 'base64' });
  assert.strictEqual(recorder.find('WebView'), null, 'terminou: a WebView oculta sai');
  const webm = await recordOnPage({ MediaRecorder: recorderClass((mime) => mime.startsWith('video/webm')) });
  const webmVideo = await webm.pending;
  assert.ok(/\.webm$/.test(webmVideo.uri) && webmVideo.mimeType === 'video/webm', 'só webm: .webm e video/webm');
  const unsupported = await recordOnPage({});
  assert.deepStrictEqual(unsupported.studio.posted, [{ type: 'error', code: 'recorder_unsupported' }]);
  await assert.rejects(unsupported.pending, (error) => error.code === 'recorder_unsupported', 'sem gravador: a tela oferece o cartão');
  // ocupado: uma gravação por vez
  const first = recorderRef.current.record(job);
  await assert.rejects(recorderRef.current.record(job), (error) => error.code === 'recorder_busy');
  recorder.unmount(); // fechou a tela no meio: a promessa não fica pendurada
  await assert.rejects(first, (error) => error.code === 'recorder_cancelled');
  // a WebView travou: desiste com recorder_timeout e solta a WebView
  const stuckRef = { current: null };
  const stuckRecorder = app.mount(NativeRecorder, {}, stuckRef);
  const realSetTimeout = global.setTimeout;
  const timers = [];
  global.setTimeout = (fn, ms) => timers.push({ fn, ms }) && {};
  let stuck;
  try {
    stuck = stuckRef.current.record(job);
  } finally {
    global.setTimeout = realSetTimeout;
  }
  stuckRecorder.flush();
  assert.ok(stuckRecorder.find('WebView') && timers.length === 1 && timers[0].ms >= 20000, 'prazo para a WebView responder');
  timers[0].fn();
  await assert.rejects(stuck, (error) => error.code === 'recorder_timeout');
  stuckRecorder.flush();
  assert.strictEqual(stuckRecorder.find('WebView'), null, 'prazo vencido: a WebView sai');
  const crashed = stuckRef.current.record(job); // a WebView não carregou a página
  stuckRecorder.flush();
  stuckRecorder.find('WebView').props.onError();
  await assert.rejects(crashed, (error) => error.code === 'recorder_error', 'WebView com erro: rejeita');
  stuckRecorder.flush();
  assert.strictEqual(stuckRecorder.find('WebView'), null, 'WebView com erro: sai');
  // o processo da WebView morreu no meio: rejeita na hora (sem esperar os 30 s) e solta a WebView
  for (const gone of ['onRenderProcessGone', 'onContentProcessDidTerminate']) {
    const dying = stuckRef.current.record(job);
    stuckRecorder.flush();
    stuckRecorder.find('WebView').props[gone]({ nativeEvent: {} });
    await assert.rejects(dying, (error) => error.code === 'recorder_error', `${gone}: rejeita na hora`);
    stuckRecorder.flush();
    assert.strictEqual(stuckRecorder.find('WebView'), null, `${gone}: a WebView sai`);
  }
  // pedaço faltando ou mime estranho = erro, nunca um arquivo corrompido
  for (const done of [{ type: 'done', mimeType: 'video/mp4' }, { type: 'done', mimeType: 'image/png' }]) {
    const broken = { parts: [], total: 0 };
    collectVideo(broken, { type: 'chunk', index: 1, total: 2, data: 'QUJD' });
    if (done.mimeType === 'image/png') collectVideo(broken, { type: 'chunk', index: 0, total: 2, data: 'QUJD' });
    assert.throws(() => collectVideo(broken, done), (error) => error.code === 'recorder_error', `rejeita ${done.mimeType}`);
  }
  // disco cheio ao gravar: o celeste-share-* pela metade é apagado antes de o erro subir
  const filesBefore = shareFiles().length;
  device.diskFull = true;
  assert.throws(() => collectVideo({ parts: ['QUJD'], total: 1 }, { type: 'done', mimeType: 'video/mp4' }), /ENOSPC/);
  device.diskFull = false;
  assert.strictEqual(shareFiles().length, filesBefore, 'disco cheio: nenhum arquivo pela metade no cache');

  // 17) site: <canvas> real (720×900 ou 720×1280, o CSS só escala); data-active marca a única cena animada
  const site = fakeReact(hosts);
  const webRN = { ...RN, Platform: { ...RN.Platform, OS: 'web' } };
  const webMocks = { ...mocks, react: site.React, 'react/jsx-runtime': site.jsxRuntime, 'react-native': webRN };
  const { default: WebScene } = loadWith('components/cenaViva/CenaViva.web.js', webMocks);
  const media = new Set(); // ouvintes de prefers-reduced-motion
  const browser = fakeWindow({
    Image: FakeImage,
    matchMedia: () => ({
      matches: !!browser.reduce,
      addEventListener: (type, listener) => media.add(listener),
      removeEventListener: (type, listener) => media.delete(listener),
    }),
  });
  global.window = browser;
  try {
    let webReady = 0;
    const card = site.mount(WebScene, { imageUri: blobUri, phrase: 'aa bb', onReady: () => (webReady += 1) });
    const canvasNode = card.find('canvas');
    assert.ok(canvasNode.props.width === 720 && canvasNode.props.height === 900, '4:5 em 720×900');
    assert.strictEqual(card.tree.props.testID, 'cena-viva');
    assert.ok(card.tree.props.accessibilityRole === 'image' && card.tree.props.accessibilityLabel === 'aa bb', 'leitor de tela lê a frase');
    assert.strictEqual(flat(card.tree.props.style).aspectRatio, 4 / 5, 'sem style, o card tem altura própria (4:5)');
    assert.strictEqual(card.tree.props.dataSet.active, 'false', 'antes da imagem carregar, nada anima');
    await tick();
    card.flush();
    const paper = canvasNode.props.ref.current;
    assert.strictEqual(webReady, 1, 'onReady quando o primeiro quadro saiu');
    assert.ok(drewImage(paper.calls), 'desenha a imagem carregada no canvas');
    assert.strictEqual(card.tree.props.dataSet.active, 'true', 'ativa (padrão): data-active=true');
    assert.strictEqual(browser.frames.length, 1, 'ativa: laço de requestAnimationFrame');
    card.update({ active: false });
    assert.strictEqual(card.tree.props.dataSet.active, 'false', 'pôster: data-active=false');
    assert.deepStrictEqual(browser.cancelled, [1], 'pôster: o laço para');
    paper.calls.length = 0;
    card.update({ caption: { text: 'cc dd', progress: 1 } });
    assert.deepStrictEqual(words(paper.calls), ['cc', 'dd'], 'legenda nova aparece já, parada');
    assert.strictEqual(card.tree.props.accessibilityLabel, 'cc dd', 'leitor de tela lê a legenda');
    paper.calls.length = 0;
    card.update({ caption: undefined });
    assert.deepStrictEqual(words(paper.calls), ['aa', 'bb'], 'legenda retirada: a frase volta à tela');
    assert.strictEqual(card.tree.props.accessibilityLabel, 'aa bb', 'legenda retirada: o rótulo volta a ser a frase');
    paper.calls.length = 0;
    card.update({ caption: { text: '  ', progress: 1 } });
    assert.ok(words(paper.calls).length === 0 && card.tree.props.accessibilityLabel === 'aa bb', 'legenda só de espaços não apaga a frase');
    // legenda retirada enquanto a cena nova carrega: a cena nova nasce com a frase dela (na intro, a frase espera
    // o sol; uma legenda por cima a mostraria antes)
    const intro = site.mount(WebScene, { imageUri: blobUri, phrase: 'aa bb', mode: 'intro', active: false, caption: { text: 'cc dd', progress: 1 } });
    await tick();
    intro.flush();
    intro.update({ phrase: 'ee ff' }); // cena nova carregando
    intro.update({ caption: undefined });
    const introPaper = intro.find('canvas').props.ref.current;
    introPaper.calls.length = 0;
    await tick();
    intro.flush();
    assert.ok(drewImage(introPaper.calls), 'cena nova desenhada');
    assert.deepStrictEqual(words(introPaper.calls), [], 'intro em t=0: a frase nova ainda espera o sol');
    intro.unmount();
    card.update({ active: true });
    assert.strictEqual(browser.frames.length, 2, 'volta a animar');
    // ligou "reduzir movimento" no sistema com a cena tocando: para na hora e volta como imagem parada
    assert.strictEqual(media.size, 1, 'um ouvinte de reduzir movimento por card');
    browser.reduce = true;
    media.forEach((listener) => listener({ matches: true }));
    card.flush();
    assert.strictEqual(card.tree.props.dataSet.active, 'false', 'reduzir movimento ligado: nada anima');
    assert.deepStrictEqual(browser.cancelled, [1, 2], 'reduzir movimento ligado: o laço para');
    await tick();
    card.flush();
    assert.strictEqual(browser.frames.length, 2, 'reduzir movimento ligado: não volta a animar');
    browser.reduce = false;
    card.unmount();
    assert.strictEqual(media.size, 0, 'saiu da tela: solta o ouvinte');
    // saiu da tela tocando: o laço para e quadro atrasado não pinta
    const tallCard = site.mount(WebScene, { imageUri: blobUri, format: '9:16' });
    assert.ok(tallCard.find('canvas').props.height === 1280, '9:16 em 720×1280');
    assert.strictEqual(flat(tallCard.tree.props.style).aspectRatio, 9 / 16, '9:16 tem altura própria de 9:16');
    await tick();
    tallCard.flush();
    const tallPaper = tallCard.find('canvas').props.ref.current;
    const scheduled = browser.frames.length;
    tallCard.unmount();
    assert.ok(scheduled === 3 && browser.cancelled.includes(scheduled), 'saiu da tela: o laço para');
    tallPaper.calls.length = 0;
    browser.frames.forEach((frame) => frame());
    assert.strictEqual(tallPaper.calls.length, 0, 'saiu da tela: quadro atrasado não pinta');
    // reduzir movimento (prefers-reduced-motion): imagem parada e nenhuma cena ativa
    browser.reduce = true;
    const calmCard = site.mount(WebScene, { imageUri: blobUri, phrase: 'aa' });
    await tick();
    calmCard.flush();
    assert.strictEqual(calmCard.tree.props.dataSet.active, 'false', 'reduzir movimento: nenhuma cena ativa');
    assert.strictEqual(browser.frames.length, 3, 'reduzir movimento: não anima');
    assert.strictEqual(ops(calmCard.find('canvas').props.ref.current.calls, 'drawImage').length, 1, 'um único drawImage');
    browser.reduce = false;
    calmCard.unmount();
    const squareCard = site.mount(WebScene, { imageUri: blobUri, style: { aspectRatio: 1 } });
    assert.strictEqual(flat(squareCard.tree.props.style).aspectRatio, 1, 'o style de quem chama vence');
    squareCard.unmount();
    // imagem que não carrega: avisa quem chama (onError) e a frase continua visível, em texto sobre o fundo
    const webFailures = [];
    const brokenCard = site.mount(WebScene, {
      imageUri: 'blob:http://localhost/broken',
      phrase: 'aa bb',
      onError: (code) => webFailures.push(code),
    });
    assert.strictEqual(brokenCard.find('Text'), null, 'antes do erro, nada de texto por cima');
    await tick();
    brokenCard.flush();
    assert.deepStrictEqual(webFailures, ['image_error'], "onError('image_error')");
    assert.strictEqual(brokenCard.find('Text').props.children, 'aa bb', 'a frase aparece em texto (não some)');
    assert.strictEqual(brokenCard.tree.props.dataSet.active, 'false', 'imagem com erro: nada anima');
    brokenCard.unmount();
    // Safari ≤ 13: MediaQueryList só com addListener/removeListener
    const legacy = new Set();
    global.window = fakeWindow({
      Image: FakeImage,
      matchMedia: () => ({
        matches: false,
        addListener: (listener) => legacy.add(listener),
        removeListener: (listener) => legacy.delete(listener),
      }),
    });
    const oldSafari = site.mount(WebScene, { imageUri: blobUri });
    assert.strictEqual(legacy.size, 1, 'Safari antigo: ouve pelo addListener');
    await tick();
    oldSafari.flush();
    assert.strictEqual(oldSafari.tree.props.dataSet.active, 'true');
    legacy.forEach((listener) => listener({ matches: true }));
    oldSafari.flush();
    assert.strictEqual(oldSafari.tree.props.dataSet.active, 'false', 'Safari antigo: reduzir movimento ligado para');
    oldSafari.unmount();
    assert.strictEqual(legacy.size, 0, 'Safari antigo: solta pelo removeListener');

    // 18) site: gravador no próprio navegador devolve um File (mime sem codecs) para o navigator.share
    const { default: WebRecorder } = loadWith('components/cenaViva/CenaVivaRecorder.web.js', webMocks);
    class BrowserFile {
      constructor(parts, name, fileOptions) {
        Object.assign(this, { parts, name, type: fileOptions.type });
      }
    }
    const studioRef = { current: null };
    site.mount(WebRecorder, {}, studioRef);
    const record = async (support) => {
      global.window = fakeWindow({ Image: FakeImage, File: BrowserFile, Blob, MediaRecorder: support && recorderClass(support), ...fastClock() });
      return studioRef.current.record({ imageUri: blobUri, phrase: 'aa', linkText: 'celeste.app' });
    };
    const shared = await record((mime) => mime.startsWith('video/mp4'));
    assert.strictEqual(shared.mimeType, 'video/mp4', 'mime sem codecs');
    assert.match(shared.file.name, /^celeste-share-\d+\.mp4$/);
    assert.ok(shared.file.type === 'video/mp4' && shared.file.parts[0].size === 3, 'File com o vídeo gravado');
    assert.ok(drewImage(firstFrame(global.window.made[0].calls)), 'o vídeo já começa com a imagem (gravou depois de carregar)');
    const sharedWebm = await record((mime) => mime.startsWith('video/webm'));
    assert.ok(/\.webm$/.test(sharedWebm.file.name) && sharedWebm.mimeType === 'video/webm', 'só webm: .webm');
    await assert.rejects(record(null), (error) => error.code === 'recorder_unsupported', 'sem gravador: recorder_unsupported');
    global.window = fakeWindow({ Image: FakeImage });
    await assert.rejects(
      studioRef.current.record({ imageUri: '', phrase: 'aa' }),
      (error) => error.code === 'image_error',
      'imagem que não carrega: image_error'
    );
    // como no app: uma gravação por vez, e erro sem código de texto (DOMException do MediaRecorder) = recorder_error
    const studioWindow = (MediaRecorder) => fakeWindow({ Image: FakeImage, File: BrowserFile, Blob, MediaRecorder, ...fastClock() });
    global.window = studioWindow(recorderClass((mime) => mime.startsWith('video/mp4')));
    const firstShare = studioRef.current.record({ imageUri: blobUri, phrase: 'aa' });
    await assert.rejects(studioRef.current.record({ imageUri: blobUri, phrase: 'aa' }), (error) => error.code === 'recorder_busy');
    await firstShare;
    class BrokenRecorder {
      static isTypeSupported() {
        return true;
      }
      constructor() {
        throw Object.assign(new Error('NotSupportedError'), { code: 9 });
      }
    }
    global.window = studioWindow(BrokenRecorder);
    await assert.rejects(
      studioRef.current.record({ imageUri: blobUri, phrase: 'aa' }),
      (error) => error.code === 'recorder_error',
      'erro sem código de texto vira recorder_error'
    );
    // fechou a tela no meio da gravação: a promessa não fica pendurada
    const leavingRef = { current: null };
    const leaving = site.mount(WebRecorder, {}, leavingRef);
    global.window = studioWindow(recorderClass(() => true));
    const abandoned = leavingRef.current.record({ imageUri: blobUri, phrase: 'aa' });
    leaving.unmount();
    await assert.rejects(abandoned, (error) => error.code === 'recorder_cancelled', 'site: fechou a tela, recorder_cancelled');
  } finally {
    delete global.window;
  }

  console.log(
    'Cena viva aprovada: mime, pedaços, intro estrelas → sol, partículas semeadas, legenda, 9:16, fonte da WebView, ' +
      'componentes do site e do app, gravador e imagem da cena'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
