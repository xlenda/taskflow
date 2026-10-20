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

  console.log('Cena viva aprovada: mime, pedaços, intro estrelas → sol, partículas semeadas, legenda, 9:16 e fonte da WebView');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
