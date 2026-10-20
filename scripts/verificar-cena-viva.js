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
// measureText acompanha a fonte atual: 10 px por letra no tamanho base de um quadro de 320 (19 px).
const fontPx = (font) => Number((/(\d+(?:\.\d+)?)px/.exec(font || '') || [0, 19])[1]);
function fakeCanvas(width = 0, height = 0) {
  const calls = [];
  const ctx = new Proxy({}, {
    get(state, prop) {
      if (prop in state) return state[prop];
      if (prop === 'measureText') return (text) => ({ width: (String(text).length * 10 * fontPx(state.font)) / 19 });
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
    instance.where = (test) => nodes(instance.tree).find(test) || null;
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
// src vazio ou com "broken" = erro; com "flaky" falha só na 1ª vez (rede que voltou)
const flakyFailed = new Set();
class FakeImage {
  set src(value) {
    this.source = value;
    setImmediate(() => {
      let ok = !!value && !String(value).includes('broken');
      if (ok && String(value).includes('flaky') && !flakyFailed.has(value)) {
        flakyFailed.add(value);
        ok = false;
      }
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
  // narração em andamento (progress < 1): tamanho cheio e janela que rola nas últimas 3 linhas
  const story = Array.from({ length: 60 }, (_, i) => `p${i}`).join(' ');
  const rolled = words(render({}, 4000, [320, 400], { text: story, progress: 0.99 }));
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

  // frase PARADA (phrase sem legenda, ou legenda com progress 1 — inclusive a volta { text: phrase, progress: 1 })
  // cabe INTEIRA: a fonte encolhe até caber em até 5 linhas (no mínimo 60%); só então a 5ª linha termina em "…".
  // A janela que rola (últimas 3 linhas) é só para a legenda em andamento (karaokê da narração).
  const longPhrase =
    'Eu escolho viver com mais calma e propósito, em cada dia. Eu reconheço minha curiosidade, minha coragem e ' +
    'minha persistência, e deixo essas qualidades orientarem meus próximos passos.';
  assert.strictEqual(longPhrase.length, 183);
  const base720 = Math.round(720 * 0.058);
  const linesOf = (calls) => new Set(ops(calls, 'fillText').map((call) => Math.round(call.args[2]))).size;
  // tamanho da fonte em vigor em cada palavra desenhada
  const textFonts = (calls) => {
    let font = '';
    return calls.flatMap((call) => {
      if (call.op === '=font') font = call.args[0];
      return call.op === 'fillText' ? [fontPx(font)] : [];
    });
  };
  const fitted = render({ phrase: longPhrase }, 4000, [720, 900]);
  const fittedWords = words(fitted);
  assert.strictEqual(fittedWords.join(' '), longPhrase, 'frase longa parada: inteira, da primeira à última palavra');
  assert.ok(linesOf(fitted) <= 5, `frase longa parada: até 5 linhas (veio ${linesOf(fitted)})`);
  const fittedSize = Math.max(...textFonts(fitted));
  assert.ok(fittedSize < base720 && fittedSize >= base720 * 0.6, `a fonte encolheu sem passar de 60% (${fittedSize}px)`);
  assert.strictEqual(words(render({ mode: 'intro', phrase: longPhrase }, 4000, [720, 900])).join(' '), longPhrase, 'intro: inteira');
  assert.strictEqual(Math.max(...textFonts(render({ phrase: 'aa bb' }, 4000, [720, 900]))), base720, 'frase curta: tamanho cheio');
  // véu antes do texto cobrindo o bloco mais alto (5 linhas): sólido acima da 1ª linha, até o pé
  const tallVeil = veilBefore(fitted, 'Eu');
  assert.ok(tallVeil, 'véu de legibilidade antes do texto');
  const topBaseline = Math.min(...ops(fitted, 'fillText').map((call) => call.args[2]));
  assert.ok(tallVeil.gradient.args[3] <= topBaseline - fittedSize, 'véu já sólido acima da 1ª das linhas');
  assert.ok(tallVeil.rect[1] + tallVeil.rect[3] >= 900, 'véu vai até o pé');
  // a mesma frase em andamento (0,5): tamanho cheio, só as últimas 3 linhas (a 1ª linha já rolou)
  const rollingWords = render({}, 4000, [720, 900], { text: longPhrase, progress: 0.5 });
  assert.ok(linesOf(rollingWords) <= 3 && !words(rollingWords).includes('escolho'), 'em andamento: janela de 3 linhas que rola');
  assert.ok(words(rollingWords).includes('reconheço'), 'em andamento: mostra até onde a voz chegou');
  assert.strictEqual(Math.max(...textFonts(rollingWords)), base720, 'em andamento: tamanho cheio');
  // a mesma frase com progress 1 (fim da narração, ou a frase de volta): inteira e ajustada
  const finished = render({}, 4000, [720, 900], { text: longPhrase, progress: 1 });
  assert.ok(words(finished).join(' ') === longPhrase && linesOf(finished) <= 5, 'progress 1: a frase inteira, ajustada');
  // nem a 60% coube: 5 linhas, fonte em 60% e a última termina em "…" dentro da largura
  const endless = Array.from({ length: 12 }, () => longPhrase).join(' ');
  const cut = render({ phrase: endless }, 4000, [720, 900]);
  const cutWords = words(cut);
  assert.ok(linesOf(cut) === 5 && /…$/.test(cutWords[cutWords.length - 1]), 'texto enorme: 5 linhas e "…" no fim');
  assert.ok(Math.abs(Math.max(...textFonts(cut)) - base720 * 0.6) < 0.2, 'reticências só depois de chegar a 60%');
  const cutFonts = textFonts(cut);
  assert.strictEqual(new Set(cutFonts).size, 1, 'a linha com "…" no mesmo tamanho das outras (palavras saem, não encolhe)');
  // 5ª linha cheia (2 palavras de 22 letras = as 45 letras da coluna a 60%): o "…" só cabe se uma palavra sair
  const packed = render({ phrase: Array.from({ length: 30 }, () => 'abcdefghijklmnopqrstuv').join(' ') }, 4000, [720, 900]);
  assert.ok(
    words(packed).length === 9 && words(packed)[8] === 'abcdefghijklmnopqrstuv…' && new Set(textFonts(packed)).size === 1,
    'linha cheia: sai uma palavra para o "…" caber, sem encolher a linha'
  );
  assert.ok(
    ops(cut, 'fillText').every((call, i) => call.args[1] >= 57 && call.args[1] + (call.args[0].length * 10 * cutFonts[i]) / 19 <= 663),
    'nenhuma palavra sai da coluna de 84%'
  );

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
  const device = { reduce: false, listeners: new Set(), appListeners: new Set(), disk: new Map(), diskFull: false };
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
    AppState: {
      currentState: 'active',
      addEventListener: (event, listener) => {
        device.appListeners.add(listener);
        return { remove: () => device.appListeners.delete(listener) };
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
  const readyUris = [];
  const scene = app.mount(NativeScene, {
    imageUri: 'data:image/jpeg;base64,QUJD',
    phrase: sneaky,
    onReady: (uri) => readyUris.push(uri),
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
  assert.deepStrictEqual(readyUris, ['data:image/jpeg;base64,QUJD'], 'onReady(uri) quando a página desenhou');
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
  assert.strictEqual(readyUris.length, 2, 'onReady a cada cena nova pronta');
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
  // trocou a imagem antes de a página velha ficar pronta: o 'ready' atrasado dela não chama onReady; o da nova
  // chama com a imagem que a página pintou
  const nativeSwaps = [];
  const swapScene = app.mount(NativeScene, { imageUri: 'data:image/jpeg;base64,QUJD', onReady: (uri) => nativeSwaps.push(uri) });
  await tick();
  swapScene.flush();
  const oldPage = runPage(swapScene.find('WebView').props.source.html);
  swapScene.update({ imageUri: 'data:image/jpeg;base64,REVG' });
  await until(() => oldPage.posted.length, 'página velha pronta');
  swapScene.find('WebView').props.onMessage(message(oldPage.posted[0]));
  swapScene.flush();
  const newPage = runPage(swapScene.find('WebView').props.source.html);
  await until(() => newPage.posted.length, 'página nova pronta');
  swapScene.find('WebView').props.onMessage(message(newPage.posted[0]));
  swapScene.flush();
  assert.deepStrictEqual(nativeSwaps, ['data:image/jpeg;base64,REVG'], 'onReady só com a imagem que a página pintou');
  swapScene.unmount();
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
  // texto de reserva sem cortar: até 5 linhas, a fonte encolhe até 60%, ancorado dentro do card com respiro
  const fallbackText = brokenScene.find('Text').props;
  assert.ok(
    fallbackText.numberOfLines === 5 && fallbackText.adjustsFontSizeToFit === true && fallbackText.minimumFontScale === 0.6,
    'texto de reserva: 5 linhas, encolhe até 60%'
  );
  const fallbackBox = flat(brokenScene.where((node) => node.props.testID === 'cena-viva-reserva').props.style);
  assert.ok(
    fallbackBox.position === 'absolute' && fallbackBox.top === 0 && fallbackBox.bottom === 0 && fallbackBox.padding > 0,
    'texto de reserva ancorado no card inteiro, com respiro'
  );
  brokenScene.unmount();

  // A) teto de renascimentos: 3 mortes seguidas sem 'ready' = desiste (texto de reserva + onError('webview_gone')),
  //    sem 4ª WebView; um 'ready' no meio zera a conta; aviso atrasado de WebView que já saiu é ignorado
  const goneErrors = [];
  const fragile = app.mount(NativeScene, { imageUri: 'data:image/jpeg;base64,QUJD', phrase: 'aa bb', onError: (code) => goneErrors.push(code) });
  await tick();
  fragile.flush();
  const fragileView = () => fragile.find('WebView');
  const kill = (props = fragileView().props, event = 'onRenderProcessGone') => {
    props[event]({ nativeEvent: {} });
    fragile.flush();
  };
  kill(); // 1ª morte sem ready
  const readyPage = runPage(fragileView().props.source.html);
  await until(() => readyPage.posted.length, 'renascida pronta');
  fragileView().props.onMessage(message(readyPage.posted[0]));
  fragile.flush(); // o ready zera a conta
  const beforeKill = fragileView().props;
  kill(); // conta 1
  kill(beforeKill, 'onContentProcessDidTerminate'); // iOS: a WebView que já saiu avisa ao ser destruída — ignorar
  kill(); // conta 2
  assert.ok(fragileView() && goneErrors.length === 0, 'um ready no meio zera a conta; aviso atrasado não conta');
  const lastAlive = fragileView().props;
  kill(); // 3ª morte seguida sem ready
  assert.strictEqual(fragileView(), null, 'desistiu: sem 4ª WebView (a morta sai)');
  assert.deepStrictEqual(goneErrors, ['webview_gone'], "onError('webview_gone') para o pai cair no fallback");
  assert.strictEqual(fragile.find('Text').props.children, 'aa bb', 'desistiu: a frase em texto');
  kill(lastAlive, 'onContentProcessDidTerminate'); // a morta ainda avisa ao ser destruída
  assert.ok(fragileView() === null && goneErrors.length === 1, 'depois de desistir, aviso atrasado não faz nada');
  fragile.unmount();
  // morte com o app em segundo plano (o Android mata o processo): a WebView morta sai, espera o app voltar e não
  // conta para o teto
  const sleeperErrors = [];
  const sleeper = app.mount(NativeScene, { imageUri: 'data:image/jpeg;base64,QUJD', phrase: 'aa bb', onError: (code) => sleeperErrors.push(code) });
  await tick();
  sleeper.flush();
  const sleeperKey = sleeper.find('WebView').key;
  RN.AppState.currentState = 'background';
  sleeper.find('WebView').props.onRenderProcessGone({ nativeEvent: {} });
  sleeper.flush();
  assert.strictEqual(sleeper.find('WebView'), null, 'segundo plano: a WebView morta sai e a cena espera');
  RN.AppState.currentState = 'active';
  device.appListeners.forEach((listener) => listener('active'));
  sleeper.flush();
  assert.ok(sleeper.find('WebView') && sleeper.find('WebView').key !== sleeperKey, 'o app voltou: página nova');
  assert.strictEqual(device.appListeners.size, 0, 'acordou: solta o ouvinte do AppState');
  // corrida: o app voltou antes de o efeito se inscrever (nenhum 'change' virá) — acorda mesmo assim
  RN.AppState.currentState = 'background';
  sleeper.find('WebView').props.onRenderProcessGone({ nativeEvent: {} });
  RN.AppState.currentState = 'active';
  sleeper.flush();
  assert.ok(sleeper.find('WebView'), 'voltou antes do efeito: acorda sem esperar evento');
  for (let i = 0; i < 2; i++) {
    sleeper.find('WebView').props.onRenderProcessGone({ nativeEvent: {} });
    sleeper.flush();
  }
  assert.ok(sleeper.find('WebView') && sleeperErrors.length === 0, 'a morte em segundo plano não contou');
  sleeper.unmount();

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
    const webReady = [];
    const card = site.mount(WebScene, { imageUri: blobUri, phrase: 'aa bb', onReady: (uri) => webReady.push(uri) });
    const canvasNode = card.find('canvas');
    assert.ok(canvasNode.props.width === 720 && canvasNode.props.height === 900, '4:5 em 720×900');
    assert.strictEqual(card.tree.props.testID, 'cena-viva');
    assert.ok(card.tree.props.accessibilityRole === 'image' && card.tree.props.accessibilityLabel === 'aa bb', 'leitor de tela lê a frase');
    assert.strictEqual(flat(card.tree.props.style).aspectRatio, 4 / 5, 'sem style, o card tem altura própria (4:5)');
    assert.strictEqual(card.tree.props.dataSet.active, 'false', 'antes da imagem carregar, nada anima');
    await tick();
    card.flush();
    const paper = canvasNode.props.ref.current;
    assert.deepStrictEqual(webReady, [blobUri], 'onReady(uri) quando o primeiro quadro saiu');
    // troca de cena antes de a imagem velha carregar: o load atrasado da velha não chama onReady nem pinta
    const swaps = [];
    const swapping = site.mount(WebScene, { imageUri: 'blob:http://localhost/old', phrase: 'aa', active: false, onReady: (uri) => swaps.push(uri) });
    swapping.update({ imageUri: 'blob:http://localhost/new' });
    await tick();
    swapping.flush();
    assert.deepStrictEqual(swaps, ['blob:http://localhost/new'], 'onReady só com a imagem que pintou');
    swapping.unmount();
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
    // C) texto de reserva sem cortar: até 5 linhas, ancorado no card com respiro; frase longa encolhe como a da cena
    //    (5% por vez, até 60%) na largura do card; texto enorme fica em 60% e o numberOfLines corta com "…"
    assert.strictEqual(brokenCard.find('Text').props.numberOfLines, 5, 'texto de reserva: até 5 linhas');
    const webBox = flat(brokenCard.where((node) => node.props.testID === 'cena-viva-reserva').props.style);
    assert.ok(webBox.position === 'absolute' && webBox.top === 0 && webBox.bottom === 0 && webBox.padding > 0, 'ancorado com respiro');
    assert.strictEqual(flat(brokenCard.find('Text').props.style).fontSize, 18, 'frase curta: tamanho cheio');
    brokenCard.unmount();
    const fallbackSizeFor = async (text, uri) => {
      const broken = site.mount(WebScene, { imageUri: uri, phrase: text });
      broken.tree.props.onLayout({ nativeEvent: { layout: { width: 360, height: 450 } } });
      await tick();
      broken.flush();
      const size = flat(broken.find('Text').props.style).fontSize;
      broken.unmount();
      return size;
    };
    assert.strictEqual(await fallbackSizeFor('aa bb', 'blob:http://localhost/broken-short'), 18, 'frase curta medida: tamanho cheio');
    const longFallback = await fallbackSizeFor(longPhrase, 'blob:http://localhost/broken-long');
    assert.ok(longFallback < 18 && longFallback > 18 * 0.6, `frase longa: a fonte encolhe só até caber (${longFallback}px)`);
    assert.strictEqual(await fallbackSizeFor(endless, 'blob:http://localhost/broken-huge'), 10.8, 'texto enorme: para em 60%');
    // B) falhou uma vez e a mesma imagem carregou depois (a rede voltou): o texto de reserva sai de cima da cena
    const flaky = site.mount(WebScene, { imageUri: 'blob:http://localhost/flaky', phrase: 'aa bb' });
    await tick();
    flaky.flush();
    assert.ok(flaky.find('Text'), '1ª tentativa falhou: texto de reserva');
    flaky.update({ phrase: 'cc dd' }); // cena recriada com a mesma imagem
    await tick();
    flaky.flush();
    assert.strictEqual(flaky.find('Text'), null, 'carregou: sem texto de reserva por cima da cena viva');
    assert.strictEqual(flaky.tree.props.dataSet.active, 'true', 'carregou: a cena anima');
    flaky.unmount();
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

  // 19) cena viva nos cards (GradientCover live): sem imagem pessoal, a cena pronta das respostas (lugar dos sonhos ×
  //     categoria); com ela, a pessoal. A frase não vai para a cena (o texto do card é o único) e o véu fica por cima
  //     da cena; qualquer erro da cena → a imagem parada até o card sair. Sem live, nada muda.
  const sceneFiles = Object.fromEntries(
    ['home', 'city', 'beach', 'countryside', 'abroad', 'traveling', 'neutral'].flatMap((place) =>
      ['Love', 'Wealth', 'Career', 'Health', 'Confidence', 'Peace'].map((area) => [
        `../assets/scenes/${place}-${area}.jpg`,
        `${place}-${area}`,
      ])
    )
  );
  const appState = { profile: { dreamLocation: 'Na praia ou no litoral' } };
  const personalFiles = {}; // visualKey → arquivo da imagem pessoal no aparelho
  const esDefault = (value) => ({ __esModule: true, default: value });
  // como o de verdade: no render em que a chave muda ainda devolve a imagem anterior; depois null; depois a nova
  const personalVisualMock = {
    usePersonalVisual(key) {
      const [uri, setUri] = app.React.useState(null);
      app.React.useEffect(() => {
        let active = true;
        setUri(null);
        if (key && personalFiles[key]) Promise.resolve().then(() => active && setUri(personalFiles[key]));
        return () => {
          active = false;
        };
      }, [key]);
      return uri;
    },
  };
  // a cena pega a própria imagem pessoal (acquire por chave) e a libera quando sai; as chaves 'k-lenta*' só abrem
  // quando o teste mandar (openVisual)
  const releasedVisuals = [];
  const slowVisuals = {};
  const openVisual = (key) => slowVisuals[key]({ uri: `file:///document/${key}.jpg`, release: () => releasedVisuals.push(key) });
  const visualStorageMock = {
    acquirePersonalVisual: async (key) =>
      key.startsWith('k-lenta')
        ? new Promise((resolve) => {
            slowVisuals[key] = resolve;
          })
        : personalFiles[key]
        ? { uri: personalFiles[key], release: () => releasedVisuals.push(key) }
        : null,
  };
  const coverMocks = {
    ...mocks,
    ...sceneFiles,
    'expo-image': { Image: 'Image' },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '../ui/theme': { useTheme: () => ({ accents: ['#B85FC8', '#5F8BC8', '#C8A25F'], text: '#111', textMuted: '#555' }) },
    '../context/AppContext': { useApp: () => ({ state: appState }) },
    '../utils/usePersonalVisual': personalVisualMock,
    '../services/personalVisualStorage': visualStorageMock,
    './cenaViva/CenaViva': esDefault('CenaViva'),
    './NarratedScene': esDefault('NarratedScene'),
  };
  const { default: GradientCover } = loadWith('components/GradientCover.js', coverMocks);
  const coverOf = (props) => app.mount(GradientCover, { accent: 0, ...props });
  const typed = (type) => (cover) => cover.where((node) => node.type === type);
  const liveOf = typed('CenaViva');
  const settle = async (cover, check, label) =>
    until(() => {
      cover.flush();
      return check(cover);
    }, label);
  // camadas do card na ordem de pintura (a de baixo primeiro)
  const layers = (cover) => [].concat(cover.tree.props.children).flat(Infinity).filter(Boolean);
  const veilAt = (cover) =>
    layers(cover).findIndex((layer) =>
      [].concat(layer.props && layer.props.children).flat(Infinity).some((child) => {
        const style = child && child.props ? flat(child.props.style) : {};
        return style.backgroundColor === 'rgba(5,12,22,0.34)';
      })
    );

  // leituras da imagem para a WebView (no aparelho cada uma é um base64 de até ~3,4 MB)
  const sceneReads = [];
  const realBase64 = DeviceFile.prototype.base64;
  let finishSlowRead = null; // a leitura de 'leitura-lenta' só termina quando o teste mandar
  DeviceFile.prototype.base64 = function spiedBase64() {
    sceneReads.push(this.uri);
    if (this.uri.includes('leitura-lenta')) {
      return new Promise((resolve) => {
        finishSlowRead = () => resolve(`b64(${this.uri})`);
      });
    }
    return realBase64.call(this);
  };
  personalFiles['k-still'] = 'file:///document/still.jpg';
  const requestsBefore = assetRequests.length;
  const staticCover = coverOf({ visualKey: 'k-still', sceneCategory: 'Love' });
  await tick();
  staticCover.flush();
  assert.strictEqual(liveOf(staticCover), null, 'sem live: sem cena viva');
  assert.strictEqual(typed('Image')(staticCover).props.source.uri, 'file:///document/still.jpg', 'sem live: a imagem parada');
  assert.ok(assetRequests.length === requestsBefore && sceneReads.length === 0, 'sem live: a imagem da cena nem é preparada');
  staticCover.unmount();

  const readyCover = coverOf({ live: true, sceneCategory: 'Love', children: 'texto do card' });
  await settle(readyCover, liveOf, 'cena pronta no card');
  const readyLive = liveOf(readyCover);
  assert.strictEqual(
    readyLive.props.imageUri,
    'data:image/jpeg;base64,b64(file:///cache/scene-beach-Love.jpg)',
    'sem imagem pessoal: a cena pronta das respostas (praia × Amor), em data URI para a WebView'
  );
  assert.ok(readyLive.props.phrase == null && readyLive.props.caption == null, 'a frase não vai para a cena: o texto do card é o único');
  assert.ok(veilAt(readyCover) > layers(readyCover).indexOf(readyLive), 'o véu do card fica por cima da cena viva');
  const liveStyle = flat(readyLive.props.style);
  assert.ok(
    liveStyle.position === 'absolute' && liveStyle.width === '100%' && liveStyle.height === '100%',
    'a cena cobre o card inteiro (largura e altura explícitas: o 4:5 do CenaViva não vale aqui)'
  );
  assert.strictEqual(liveStyle.backgroundColor, 'transparent', 'até pintar, o card mostra o fundo de sempre');
  readyLive.props.onError('webview_gone');
  readyCover.flush();
  assert.strictEqual(liveOf(readyCover), null, 'erro da cena: volta à imagem parada');
  readyCover.update({ live: false });
  readyCover.update({ live: true });
  await tick();
  readyCover.flush();
  assert.strictEqual(liveOf(readyCover), null, 'depois do erro, o card não tenta de novo enquanto existir');
  readyCover.unmount();

  personalFiles['k-live'] = 'file:///document/live.jpg';
  const personalCover = coverOf({ live: true, visualKey: 'k-live', sceneCategory: 'Love' });
  await settle(personalCover, liveOf, 'cena pessoal no card');
  assert.strictEqual(
    liveOf(personalCover).props.imageUri,
    'data:image/jpeg;base64,b64(file:///document/live.jpg)',
    'com imagem pessoal: a cena viva usa a dela'
  );
  personalCover.update({ live: false });
  assert.strictEqual(liveOf(personalCover), null, 'o card perdeu o foco: a cena sai');
  assert.strictEqual(typed('Image')(personalCover).props.source.uri, 'file:///document/live.jpg', 'e fica a imagem parada');
  personalCover.unmount();
  // imagem pessoal ainda abrindo: espera por ela (sem piscar a cena pronta); quando abre, é ela
  const slowCover = coverOf({ live: true, visualKey: 'k-lenta', sceneCategory: 'Love' });
  for (let i = 0; i < 5; i++) await tick();
  slowCover.flush();
  assert.strictEqual(liveOf(slowCover), null, 'imagem pessoal abrindo: sem cena pronta por cima');
  openVisual('k-lenta');
  await settle(slowCover, liveOf, 'cena da imagem que abriu devagar');
  assert.strictEqual(liveOf(slowCover).props.imageUri, 'data:image/jpeg;base64,b64(file:///document/k-lenta.jpg)');
  slowCover.unmount();
  assert.ok(releasedVisuals.includes('k-lenta'), 'o card saiu: a imagem que a cena pegou é liberada');
  // a imagem da chave anterior chegou atrasada (o card já trocou): não toma o lugar da atual e é liberada
  personalFiles['k-nova'] = 'file:///document/nova.jpg';
  const lateCover = coverOf({ live: true, visualKey: 'k-lenta-velha', sceneCategory: 'Love' });
  await tick();
  lateCover.flush();
  lateCover.update({ visualKey: 'k-nova' });
  await settle(lateCover, liveOf, 'cena da chave nova');
  openVisual('k-lenta-velha');
  for (let i = 0; i < 5; i++) await tick();
  lateCover.flush();
  assert.strictEqual(liveOf(lateCover).props.imageUri, 'data:image/jpeg;base64,b64(file:///document/nova.jpg)', 'a atrasada não volta');
  assert.ok(releasedVisuals.includes('k-lenta-velha'), 'a imagem atrasada é liberada na hora');
  // a leitura da imagem anterior terminou depois da troca: também não volta
  personalFiles['k-leitura'] = 'file:///document/leitura-lenta.jpg';
  lateCover.update({ visualKey: 'k-leitura' });
  await until(() => !!finishSlowRead, 'leitura lenta começou');
  lateCover.update({ visualKey: 'k-nova' });
  await settle(lateCover, liveOf, 'cena da chave nova de novo');
  finishSlowRead();
  for (let i = 0; i < 5; i++) await tick();
  lateCover.flush();
  assert.strictEqual(liveOf(lateCover).props.imageUri, 'data:image/jpeg;base64,b64(file:///document/nova.jpg)', 'leitura atrasada não volta');
  lateCover.unmount();
  // a chave existe mas o arquivo sumiu (o navegador limpou o armazenamento): também é "sem imagem pessoal"
  const missingCover = coverOf({ live: true, visualKey: 'k-sumiu', sceneCategory: 'Love' });
  await settle(missingCover, liveOf, 'cena pronta no lugar da imagem que sumiu');
  assert.strictEqual(liveOf(missingCover).props.imageUri, 'data:image/jpeg;base64,b64(file:///cache/scene-beach-Love.jpg)');
  missingCover.unmount();
  // o card da vez trocou (chave e categoria juntas): só a imagem da chave atual vira cena; a anterior é liberada
  personalFiles['k-a'] = 'file:///document/a.jpg';
  personalFiles['k-b'] = 'file:///document/b.jpg';
  const swapCover = coverOf({ live: true, visualKey: 'k-a', sceneCategory: 'Love' });
  const showing = (name) => (cover) => liveOf(cover) && liveOf(cover).props.imageUri.includes(name);
  await settle(swapCover, showing('a.jpg'), 'cena da 1ª afirmação');
  sceneReads.length = 0;
  swapCover.update({ visualKey: 'k-b', sceneCategory: 'Wealth' });
  await settle(swapCover, showing('b.jpg'), 'cena da 2ª afirmação');
  assert.deepStrictEqual(sceneReads, ['file:///document/b.jpg'], 'só a imagem da afirmação atual vira cena');
  assert.ok(releasedVisuals.includes('k-a') && !releasedVisuals.includes('k-b'), 'a imagem anterior é liberada, a atual não');
  swapCover.unmount();
  DeviceFile.prototype.base64 = realBase64;

  // o card da afirmação: live sem imagem pessoal também vira capa (texto claro sobre a cena)
  const cardMocks = {
    ...coverMocks,
    'react-native': { ...RN, ActivityIndicator: 'ActivityIndicator', TouchableOpacity: 'TouchableOpacity' },
    '../ui/theme': coverMocks['../ui/theme'],
    '../utils/useT': { useT: () => ({ t: (entry) => entry.pt }) },
    './GradientCover': esDefault('GradientCover'),
  };
  const { default: AffirmationCard } = loadWith('components/AffirmationCard.js', cardMocks);
  const affirmationCard = app.mount(AffirmationCard, {
    affirmation: { text: 'Eu escolho a paz.' },
    live: true,
    sceneCategory: 'Peace',
  });
  const cardCover = affirmationCard.find('GradientCover');
  assert.ok(cardCover && cardCover.props.live === true, 'afirmação em foco: capa com cena viva mesmo sem imagem pessoal');
  assert.strictEqual(cardCover.props.sceneCategory, 'Peace', 'a categoria escolhe a cena pronta');
  assert.strictEqual(app.mount(AffirmationCard, { affirmation: { text: 'aa' } }).find('GradientCover'), null, 'sem live e sem imagem: card liso de sempre');

  // um card animado por vez: só o card em foco recebe live (no app cada cena é uma WebView de até ~3,4 MB)
  const screen = (name) => fs.readFileSync(path.join(root, 'screens', name), 'utf8');
  const liveProps = (source) => source.match(/\slive=\{[^}]*\}/g) || [];
  const cardScreens = {
    'AffirmationsScreen.js': /<AffirmationCard[^>]*?\slive=\{isFocused\}/,
    'VisionsScreen.js': /<GradientCover[^>]*?\slive=\{isFocused && vision\.id === liveVisionId\}/,
    'HomeScreen.js': /testID="open-anchor-scene"[\s\S]{0,700}<GradientCover[^>]*?\slive=\{isFocused\}/,
    'ManifestationScreen.js': /<GradientCover\s+testID="manifestation-personal-visual"[^>]*?\slive=\{isFocused\}/,
    'PracticeRitualScreen.js': /<GradientCover\s+testID="practice-vision-visual"[^>]*?\slive=\{isFocused\}/,
    'MorningRitualScreen.js': /<GradientCover\s+testID="dream-cena-viva"[^>]*?\slive=\{focused\}/,
  };
  for (const [name, pattern] of Object.entries(cardScreens)) {
    const source = screen(name);
    assert.match(source, pattern, `${name}: só o card em foco recebe live`);
    assert.strictEqual(liveProps(source).length, 1, `${name}: um único card com live`);
  }
  const visionsSource = screen('VisionsScreen.js');
  assert.match(
    visionsSource,
    /setTimeout\(\(\) => setLiveVisionId\(visibleVision\?\.id \|\| null\), \d+\)/,
    'Visões: a cena segue o card em foco só depois que o deslize assenta (sem abrir uma WebView por card que passa)'
  );
  const affirmationCardSource = fs.readFileSync(path.join(root, 'components', 'AffirmationCard.js'), 'utf8');
  assert.match(affirmationCardSource, /<GradientCover[^>]*?\slive=\{live\}/, 'AffirmationCard repassa live para a capa');

  // 20) narração com cena viva e palavras: a legenda segue a voz — nuvem: o progress da narração; aparelho: o
  //     onBoundary pelo FIM da palavra falada (o renderizador mostra a palavra assim que o progresso passa da 1ª
  //     letra dela); sem aviso do aparelho, 14 letras/s. Nunca à frente da voz.
  const {
    captionProgressFromNarration,
    captionProgressFromBoundary,
    captionProgressFromTime,
    wordLengthAt,
  } = load('utils/captionProgress.js');
  assert.strictEqual(captionProgressFromTime({ elapsedMs: 5000, text: 'a'.repeat(140) }), 0.5, '14 letras por segundo');
  assert.strictEqual(captionProgressFromBoundary({ charIndex: 70, textLength: 140 }), 0.5);
  assert.strictEqual(captionProgressFromBoundary({ charIndex: 70, charLength: 7, textLength: 140 }), 0.55, 'o fim da palavra');
  assert.strictEqual(captionProgressFromTime({ elapsedMs: 60000, text: 'aa' }), 1, 'tempo além do texto: 1');
  assert.strictEqual(captionProgressFromTime({ elapsedMs: -5, text: 'aa' }), 0, 'tempo negativo: 0');
  assert.strictEqual(captionProgressFromTime({ elapsedMs: 1000, text: '' }), 0, 'sem texto: 0');
  assert.strictEqual(captionProgressFromTime({ elapsedMs: Number.NaN, text: 'aa' }), 0, 'tempo inválido: 0');
  assert.strictEqual(captionProgressFromBoundary({ charIndex: 300, charLength: 5, textLength: 140 }), 1, 'além do fim: 1');
  assert.strictEqual(captionProgressFromBoundary({ charIndex: -9, textLength: 140 }), 0, 'antes do começo: 0');
  assert.strictEqual(captionProgressFromBoundary({ charIndex: 3, textLength: 0 }), 0, 'texto vazio: 0');
  assert.strictEqual(captionProgressFromBoundary({ charIndex: Number.NaN, textLength: 10 }), 0, 'aviso inválido: 0');
  assert.strictEqual(captionProgressFromNarration({ progress: 0.42 }), 0.42);
  assert.strictEqual(captionProgressFromNarration({ progress: 1.7 }), 1);
  assert.strictEqual(captionProgressFromNarration({ progress: -0.2 }), 0);
  assert.strictEqual(captionProgressFromNarration({ progress: Number.NaN }), 0);
  assert.strictEqual(captionProgressFromNarration({}), 0);
  // sem charLength (o Safari só diz onde a palavra começa): a palavra vai até o próximo espaço
  assert.strictEqual(wordLengthAt('Eu escolho a paz', 3), 7);
  assert.strictEqual(wordLengthAt('Eu escolho a paz', 13), 3);
  assert.strictEqual(wordLengthAt('Eu escolho', 99), 0);
  // no renderizador: o fim da palavra falada mostra ela inteira e ainda não a próxima
  const spoken = captionProgressFromBoundary({ charIndex: 3, charLength: 2, textLength: 11 });
  assert.deepStrictEqual(words(render({}, 4000, [320, 400], { text: 'aa bb cc dd', progress: spoken })), ['aa', 'bb']);

  // NarratedScene: o CenaViva com a legenda; a cena 4:5 entra INTEIRA no espaço que receber (a legenda mora no pé
  // do quadro — cortar o quadro cortaria as palavras); toques passam; erro da cena não esconde nada (o texto de
  // reserva do CenaViva fica à vista) e quem chama fica sabendo
  const { default: NarratedScene } = loadWith('components/NarratedScene.js', { ...mocks, './cenaViva/CenaViva': esDefault('CenaViva') });
  const narrated = app.mount(NarratedScene, { imageUri: 'data:image/jpeg;base64,QUJD', text: 'Eu escolho a paz', progress: 0.25 });
  assert.strictEqual(narrated.tree.props.testID, 'narrated-scene');
  assert.strictEqual(narrated.tree.props.dataSet.progress, '0.25', 'o site expõe o progresso da legenda');
  assert.strictEqual(flat(narrated.tree.props.style).pointerEvents, 'none', 'toques passam para o card de fora');
  assert.strictEqual(narrated.find('CenaViva'), null, 'antes de medir o espaço, nada');
  const layout = (width, height) => {
    narrated.tree.props.onLayout({ nativeEvent: { layout: { width, height } } });
    narrated.flush();
    return flat(narrated.find('CenaViva').props.style);
  };
  const wideBox = layout(400, 300);
  assert.ok(near(wideBox.width, 240) && near(wideBox.height, 300), 'espaço largo: a cena 4:5 inteira na altura, centrada');
  const tallBox = layout(300, 600);
  assert.ok(near(tallBox.width, 300) && near(tallBox.height, 375), 'espaço alto: a cena 4:5 inteira na largura');
  const narratedScene = () => narrated.find('CenaViva');
  assert.deepStrictEqual(narratedScene().props.caption, { text: 'Eu escolho a paz', progress: 0.25 }, 'a legenda vai para a cena');
  assert.ok(narratedScene().props.phrase == null, 'só a legenda: nada de frase parada por baixo');
  assert.ok(narratedScene().props.active === true, 'tocando: a cena anima');
  narrated.update({ progress: 0.75, active: false });
  assert.deepStrictEqual(narratedScene().props.caption, { text: 'Eu escolho a paz', progress: 0.75 }, 'a legenda acompanha a voz');
  assert.strictEqual(narratedScene().props.active, false, 'pausada: pôster parado com as palavras');
  const narratedErrors = [];
  narrated.update({ onError: (code) => narratedErrors.push(code) });
  narratedScene().props.onError('webview_gone');
  narrated.flush();
  assert.ok(narratedScene(), 'webview_gone: a cena continua montada e o texto de reserva dela fica à vista');
  assert.deepStrictEqual(narratedErrors, ['webview_gone'], 'quem chama fica sabendo do erro');
  narrated.unmount();

  // a narração no card: a cena com as palavras POR CIMA do véu (o véu escureceria a legenda); uma cena só
  const narratingCover = coverOf({
    live: true,
    sceneCategory: 'Love',
    narration: { text: 'Eu escolho a paz', progress: 0.5, active: true },
  });
  const narratedOf = typed('NarratedScene');
  await settle(narratingCover, narratedOf, 'narração no card');
  const narratedLayer = narratedOf(narratingCover);
  assert.strictEqual(liveOf(narratingCover), null, 'narrando: uma cena só, a da narração');
  assert.strictEqual(narratedLayer.props.imageUri, 'data:image/jpeg;base64,b64(file:///cache/scene-beach-Love.jpg)');
  assert.ok(
    narratedLayer.props.text === 'Eu escolho a paz' && narratedLayer.props.progress === 0.5 && narratedLayer.props.active === true,
    'texto, progresso e play/pausa chegam à cena'
  );
  assert.ok(layers(narratingCover).indexOf(narratedLayer) > veilAt(narratingCover), 'as palavras por cima do véu');
  narratingCover.update({ narration: null });
  assert.ok(liveOf(narratingCover) && !narratedOf(narratingCover), 'a voz parou: volta a cena do card');
  narratingCover.update({ live: false, narration: { text: 'aa', progress: 0, active: true } });
  await settle(narratingCover, narratedOf, 'narração com o card fora de foco');
  narratingCover.unmount();
  // o card da afirmação narrando: a frase sai da tela e do leitor de tela (a cena diz a frase), o layout fica
  const narratingCard = app.mount(AffirmationCard, {
    affirmation: { text: 'Eu escolho a paz.' },
    live: true,
    narration: { text: 'Eu escolho a paz.', progress: 0.3, active: true },
  });
  assert.deepStrictEqual(
    narratingCard.find('GradientCover').props.narration,
    { text: 'Eu escolho a paz.', progress: 0.3, active: true },
    'a narração chega à capa'
  );
  const cardPhrase = narratingCard.where((node) => node.type === 'Text' && node.props.children === 'Eu escolho a paz.');
  assert.ok(
    flat(cardPhrase.props.style).opacity === 0 && cardPhrase.props['aria-hidden'] === true,
    'narrando: a frase do card some da tela e do leitor (layout mantido)'
  );
  const quietCard = app.mount(AffirmationCard, { affirmation: { text: 'Eu escolho a paz.' }, live: true });
  const quietPhrase = quietCard.where((node) => node.type === 'Text' && node.props.children === 'Eu escolho a paz.');
  assert.ok(flat(quietPhrase.props.style).opacity !== 0 && !quietPhrase.props['aria-hidden'], 'sem voz: a frase à vista');
  const unfocusedNarration = app.mount(AffirmationCard, {
    affirmation: { text: 'aa' },
    narration: { text: 'aa', progress: 0, active: false },
  });
  assert.ok(unfocusedNarration.find('GradientCover'), 'narrando sem live: também vira capa (a cena precisa de onde aparecer)');

  // nas 5 telas a narração aparece como cena com palavras, e o texto parado da mesma fala sai enquanto ela toca
  const narrationScreens = {
    'VisionPlayerScreen.js': [/<NarratedScene\b/, /captionProgressFromNarration\(\{ progress: narrationProgress \}\)/],
    'ManifestationScreen.js': [/narration=\{\s*narrating\s*\?/, /captionProgressFromNarration\(\{ progress: narrationProgress \}\)/],
    'onboarding/RevealScreen.js': [/<NarratedScene\b/, /captionProgressFromNarration\(\{ progress: narration\.progress \}\)/],
    'AffirmationsScreen.js': [/narration=\{\s*ownsPlayback\s*\?/, /captionProgressFromNarration\(\{ progress: narrationProgress \}\)/],
    'WakeSequenceScreen.js': [/<NarratedScene\b/, /captionProgressFromBoundary\(/, /captionProgressFromTime\(/, /captionProgressFromNarration\(/],
  };
  for (const [name, patterns] of Object.entries(narrationScreens)) {
    const source = screen(name);
    patterns.forEach((pattern) => assert.match(source, pattern, `${name}: a narração com cena viva e palavras (${pattern})`));
  }
  const reveal = screen('onboarding/RevealScreen.js');
  assert.match(reveal, /narrating && scene \? null : <Text style=\{styles\.sceneText\}>\{m\.story\}<\/Text>/, 'Revelação: a história em texto sai enquanto a voz a conta');
  assert.match(reveal, /phrase=\{m\.affirmation\}\s+onReady=\{\(uri\) => setShown\(uri\)\}/, 'Revelação: rótulo pela imagem que pintou');
  const player = screen('VisionPlayerScreen.js');
  assert.match(player, /const narrated = narrating && !!narrationImage;/, 'Player: o texto parado só sai com a cena na tela');
  assert.match(player, /narrated \? null : \(\s*<Animated\.Text\s+testID="vision-player-caption"/, 'Player: a frase parada sai enquanto a voz toca');
  assert.match(player, /\{narrated \? null : \(\s*<View\s+style=\{\[\s*styles\.scriptWrap/, 'Player: o roteiro em texto sai enquanto a voz toca');
  assert.match(player, /live=\{isFocused && !narrating && !showsSecondaryVisual\}/, 'Player: a visão aberta anima parada; tocando, só a cena da voz');
  const manifestation = screen('ManifestationScreen.js');
  assert.match(manifestation, /\{narrating \? null : \(\s*<>\s*<SectionHeading title=\{t\(S\.storyTitle\)\}/, 'Manifestação: a história em texto sai enquanto a voz a conta');
  assert.match(manifestation, /style=\{\[styles\.heroInner, narrating && styles\.quiet\]\}\s+aria-hidden=\{narrating \|\| undefined\}/, 'Manifestação: o texto da capa sai da tela e do leitor enquanto a voz toca');
  assert.match(reveal, /onError=\{\(code\) => code === 'image_error' && dropScene\(scene\.source\)\}/, 'Revelação: webview_gone deixa as palavras do CenaViva');
  // a legenda é o trecho que a voz está dizendo (o player e a manifestação podem começar de uma frase do meio)
  for (const [name, source, pattern] of [
    ['Player', player, /text=\{lines\.slice\(spokenFrom\)\.join\(' '\)\}/],
    ['Manifestação', manifestation, /text: lines\.slice\(spokenFrom\)\.join\(' '\),/],
  ]) {
    assert.match(source, pattern, `${name}: a legenda é o trecho falado`);
    assert.match(source, /setSpokenFrom\(at\);[\s\S]{0,400}await playPersonal\(\{\s*text: lines\.slice\(at\)\.join\(' '\)/, `${name}: o trecho começa onde a voz começa`);
  }

  // 21) despertar: a voz do aparelho leva as palavras da cena. O tela de verdade com dublês: a 3ª estrela começa a
  //     voz; cada aviso de palavra mostra até o FIM dela; aviso de frase ('sentence') não adianta; sem charLength (Safari)
  //     a palavra vai até o espaço; sem aviso nenhum, 14 letras/s; fim do item = texto inteiro; a voz da Celeste usa o
  //     progresso da narração. Tocando, a história em texto sai; webview_gone não derruba a cena.
  const wakeStory = 'Eu escolho viver com calma. Cada dia é um passo.'; // 48 letras
  const wakeItems = [
    { kind: 'anchor', id: 'anchor:m1', title: 'Cena-Âncora', text: wakeStory, lang: 'pt', category: 'Peace', visualKey: null },
    { kind: 'vision', id: 'm1:vision:Love', title: 'Visão', text: wakeStory, lang: 'pt', category: 'Love', visualKey: null },
  ];
  const speeches = [];
  const narrationDouble = {
    personalNarrationAvailable: false,
    activePlaybackId: null,
    lastCompletedPlaybackId: null,
    phase: 'idle',
    progress: 0,
    played: [],
    playPersonal(request) {
      this.played.push(request);
      return new Promise(() => {}); // tocando: o fim chega pelo lastCompletedPlaybackId
    },
    stop() {},
    pause: () => false,
    resume: () => Promise.resolve(),
  };
  let cloudVoice = false;
  let wakeClock = 1000;
  const intervals = [];
  const wakeMocks = {
    ...mocks,
    ...sceneFiles,
    'react-native': {
      ...RN,
      Pressable: 'Pressable',
      ScrollView: 'ScrollView',
      useWindowDimensions: () => ({ width: 400, height: 800 }),
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@react-navigation/native': {
      useIsFocused: () => true,
      useNavigation: () => ({ canGoBack: () => true, goBack() {}, navigate() {} }),
    },
    'expo-speech': {
      speak: (text, options) => speeches.push({ text, options }),
      stop: () => Promise.resolve(),
    },
    '../components/CelestialTrace': esDefault('CelestialTrace'),
    '../components/PrimaryButton': esDefault('PrimaryButton'),
    '../components/NarratedScene': esDefault('NarratedScene'),
    '../context/AppContext': { useApp: () => ({ state: appState }) },
    '../ui/theme': coverMocks['../ui/theme'],
    '../utils/useCloudMediaConsent': { hasUnifiedCloudMediaConsent: () => cloudVoice },
    '../utils/usePersonalNarration': { usePersonalNarration: () => narrationDouble },
    '../utils/usePersonalVisual': { usePersonalVisual: () => null },
    '../utils/useT': { useT: () => ({ t: (entry) => (entry && entry.pt) || '', lang: 'pt' }) },
    '../utils/wakeSequence': { wakeSequenceItemsForState: () => wakeItems },
  };
  const { default: WakeSequenceScreen } = loadWith('screens/WakeSequenceScreen.js', wakeMocks);
  hosts.ScrollView = () => ({ scrollTo() {} }); // a tela volta ao topo a cada item
  const realNow = Date.now;
  const realSetInterval = global.setInterval;
  const realClearInterval = global.clearInterval;
  Date.now = () => wakeClock;
  global.setInterval = (fn, ms) => intervals.push({ fn, ms, live: true }) && intervals.length;
  global.clearInterval = (id) => {
    if (intervals[id - 1]) intervals[id - 1].live = false;
  };
  try {
    const wakeScreen = app.mount(WakeSequenceScreen, {});
    const narratedNow = () => wakeScreen.where((node) => node.type === 'NarratedScene');
    const storyShown = () => !!wakeScreen.where((node) => node.type === 'Text' && node.props.children === wakeStory);
    const tickIntervals = () => intervals.filter((entry) => entry.live).forEach((entry) => entry.fn());
    const trace = wakeScreen.find('CelestialTrace');
    trace.props.onFinalStar();
    trace.props.onComplete();
    wakeScreen.flush();
    await settle(wakeScreen, narratedNow, 'cena narrada do 1º item');
    assert.strictEqual(speeches.length, 1, 'a 3ª estrela começa a voz do aparelho');
    const first = speeches[0].options;
    assert.strictEqual(narratedNow().props.progress, 0, 'antes da 1ª palavra, nenhuma palavra');
    assert.strictEqual(narratedNow().props.text, wakeStory, 'a legenda é o texto que a voz diz');
    assert.ok(narratedNow().props.active === true && !storyShown(), 'tocando: a cena anima e a história em texto sai');
    first.onStart();
    first.onBoundary({ charIndex: 3, charLength: 7, name: 'word' }); // "escolho"
    wakeScreen.flush();
    assert.strictEqual(narratedNow().props.progress, 10 / 48, 'a palavra falada aparece até o fim dela');
    first.onBoundary({ charIndex: 28, charLength: 0, name: 'sentence' }); // aviso de frase: não diz a palavra
    wakeScreen.flush();
    assert.strictEqual(narratedNow().props.progress, 10 / 48, 'aviso de frase inteira não adianta a legenda');
    first.onBoundary({ charIndex: 11 }); // Safari: sem charLength
    wakeScreen.flush();
    assert.strictEqual(narratedNow().props.progress, 16 / 48, 'sem charLength: a palavra vai até o próximo espaço');
    wakeClock += 60000;
    tickIntervals();
    wakeScreen.flush();
    assert.strictEqual(narratedNow().props.progress, 16 / 48, 'com avisos de palavra, o relógio não empurra a legenda');
    // a cena não aguenta (webview_gone): continua montada com as palavras do CenaViva; só imagem quebrada troca
    narratedNow().props.onError('webview_gone');
    wakeScreen.flush();
    assert.ok(narratedNow(), 'webview_gone: a cena fica (o texto de reserva do CenaViva mostra as palavras)');
    first.onDone();
    wakeScreen.flush();
    assert.strictEqual(narratedNow().props.progress, 1, 'fim do item: o texto inteiro durante o respiro');
    // 2º item: começa do zero; a voz que nunca avisa palavra anda pelo tempo (14 letras/s)
    wakeScreen.where((node) => node.props.testID === 'wake-next').props.onPress();
    await settle(wakeScreen, () => speeches.length === 2 && narratedNow() && narratedNow().props.progress === 0, 'item 2');
    const second = speeches[1].options;
    second.onStart();
    wakeClock += 2000;
    tickIntervals();
    wakeScreen.flush();
    assert.strictEqual(narratedNow().props.progress, (2 * 14) / 48, 'sem aviso de palavra: 14 letras por segundo');
    // pausa (a voz do aparelho para): a legenda congela e a história volta a ficar em texto
    wakeScreen.where((node) => node.props.testID === 'wake-pause').props.onPress();
    wakeScreen.flush();
    wakeClock += 5000;
    tickIntervals();
    wakeScreen.flush();
    assert.ok(narratedNow().props.progress === (2 * 14) / 48 && narratedNow().props.active === false, 'pausado: congela');
    assert.ok(storyShown(), 'pausado: a história volta em texto');
    // voz da Celeste (nuvem): as palavras seguem o progresso da narração
    cloudVoice = true;
    narrationDouble.personalNarrationAvailable = true;
    wakeScreen.update({});
    wakeScreen.where((node) => node.props.testID === 'wake-resume').props.onPress();
    wakeScreen.flush();
    assert.strictEqual(narratedNow().props.progress, 0, 'voz da Celeste começando: nenhuma palavra antes dela');
    const cloudRequest = narrationDouble.played[narrationDouble.played.length - 1];
    Object.assign(narrationDouble, { activePlaybackId: cloudRequest.playbackId, phase: 'playing', progress: 0.5 });
    wakeScreen.update({});
    assert.strictEqual(narratedNow().props.progress, 0.5, 'voz da Celeste: o progresso da narração');
    Object.assign(narrationDouble, { progress: 1.4 });
    wakeScreen.update({});
    assert.strictEqual(narratedNow().props.progress, 1, 'progresso da narração limitado a 1');
    // a voz da Celeste quebrou no meio: a do aparelho assume o item do começo, e a legenda recomeça junto
    const speechesBeforeFallback = speeches.length;
    Object.assign(narrationDouble, { activePlaybackId: null, phase: 'error' });
    wakeScreen.update({});
    assert.ok(speeches.length === speechesBeforeFallback + 1, 'a voz do aparelho assumiu');
    assert.strictEqual(narratedNow().props.progress, 0, 'a reserva recomeça o item: a legenda também');
    // a cena pronta quebrou e não há outra imagem: sem cena, a história volta em texto com a voz tocando
    assert.ok(!storyShown(), 'tocando com a cena: a história fica na cena');
    narratedNow().props.onError('image_error');
    wakeScreen.flush();
    assert.ok(!narratedNow() && storyShown(), 'sem imagem nenhuma: as palavras ficam em texto');
    wakeScreen.unmount();
  } finally {
    Date.now = realNow;
    global.setInterval = realSetInterval;
    global.clearInterval = realClearInterval;
  }

  console.log(
    'Cena viva aprovada: mime, pedaços, intro estrelas → sol, partículas semeadas, legenda, 9:16, fonte da WebView, ' +
      'componentes do site e do app, gravador, imagem da cena, cena viva nos cards e narração com palavras'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
