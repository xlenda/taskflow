// Cena viva da Celeste: o MESMO desenho em canvas 2D para EXIBIR a cena (web: <canvas>; app: WebView) e para
// GRAVAR o vídeo de 8 s que ela compartilha — o que ela vê é o que sai.
// Sem import e sem sintaxe nova demais (nada de ?. ou ??): scripts/gerar-cena-viva-webview.js tira o `export`,
// acrescenta installCenaViva(window) e a WebView roda este texto cru, sem Babel.
// Visual aprovado: Downloads\CELESTE-ANCORA-CINEMATOGRAFICO.mp4 — hora azul → luz dourada; as 3 estrelas do
// Traço Celeste se ligam, voam e viram o sol com clarão; câmera lenta, raios, poeira de luz, grão e vinheta.
export function installCenaViva(root) {
  const TAU = Math.PI * 2;
  const MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const TRACE = [[46, 112], [160, 45], [274, 112]]; // CelestialTrace.js:59-66 num céu de 320×168
  const IGNITE = 2100; // as estrelas chegam e o sol acende (a intro cabe em 0–2400 ms)
  const SERIF = "Georgia, 'Times New Roman', serif";
  const END_HOLD_MS = 1200; // cartão final do vídeo: frase inteira + assinatura + link parados no fim (85% de 8 s)
  const SETTLE_MS = 300; // no cartão final, a janela que rola se dissolve na frase inteira ajustada

  const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);
  const hasText = (v) => !!v && String(v).trim() !== ''; // só espaços (ou false/0/NaN) não é legenda
  const span = (t, start, duration) => clamp01((t - start) / duration);
  const smooth = (p) => p * p * (3 - 2 * p);
  const inOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const wrap = (v, size, pad) => {
    const total = size + 2 * pad;
    return ((((v + pad) % total) + total) % total) - pad;
  };
  const now = () => (root.performance && root.performance.now ? root.performance.now() : Date.now());

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(width, height) {
    const doc = root.document;
    const canvas = doc && doc.createElement ? doc.createElement('canvas') : null;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
    return canvas;
  }

  // imagem cobrindo o retângulo (corta o excesso), com zoom em volta do centro e deslocamento horizontal
  function drawCover(ctx, image, x, y, w, h, zoom, dx) {
    const iw = image ? image.naturalWidth || image.width : 0;
    const ih = image ? image.naturalHeight || image.height : 0;
    if (!iw || !ih) return false;
    const scale = Math.max(w / iw, h / ih) * zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(image, 0, 0, iw, ih, x + (w - dw) / 2 + dx, y + (h - dh) / 2, dw, dh);
    return true;
  }

  function radial(ctx, x, y, radius, stops) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    stops.forEach((stop) => gradient.addColorStop(stop[0], stop[1]));
    return gradient;
  }

  function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // câmera: escala 1.00→1.08 com travelling horizontal de até 2% em 8 s; exibindo sem parar, vai e volta sem salto
  function camera(t) {
    const u = (t % 16000) / 8000;
    const c = 0.5 - 0.5 * Math.cos(Math.PI * (u <= 1 ? u : 2 - u));
    return { zoom: 1 + 0.08 * c, pan: 0.02 * c };
  }

  // grão de filme: ruído 128×128 gerado uma vez (semeado), repetido como padrão
  function makeGrain(rand) {
    const canvas = makeCanvas(128, 128);
    const g = canvas && canvas.getContext('2d');
    if (!g) return null;
    const noise = g.createImageData(128, 128);
    for (let i = 0; i < noise.data.length; i += 4) {
      const v = Math.floor(rand() * 256);
      noise.data[i] = v;
      noise.data[i + 1] = v;
      noise.data[i + 2] = v;
      noise.data[i + 3] = 255;
    }
    g.putImageData(noise, 0, 0);
    return canvas;
  }

  // 9:16: a mesma imagem borrada cobrindo o quadro. blur(24px) no quadro cheio = blur(3px) a 1/8 + ampliação
  // suave: continua borrada onde ctx.filter não existe (Safari < 18) e custa um drawImage por quadro
  function makeBackdrop(image, width, height) {
    const w = Math.max(1, Math.round(width / 8));
    const h = Math.max(1, Math.round(height / 8));
    const canvas = makeCanvas(w, h);
    const g = canvas && canvas.getContext('2d');
    if (!g) return null;
    g.filter = 'blur(3px)';
    const drawn = drawCover(g, image, 0, 0, w, h, 1.1, 0);
    g.filter = 'none';
    if (!drawn) return null;
    g.fillStyle = 'rgba(28,46,79,0.4)';
    g.fillRect(0, 0, w, h);
    return canvas;
  }

  function createRenderer(canvas, options) {
    return buildRenderer(canvas, options).api;
  }

  function buildRenderer(canvas, options) {
    const o = options || {};
    const ctx = canvas.getContext('2d');
    const image = o.image;
    const tall = o.format === '9:16';
    const intro = o.mode === 'intro';
    const still = !!o.reducedMotion;
    const rand = mulberry32(o.seed == null ? 1 : o.seed);
    // poeira de luz: posição, profundidade (0 = longe e nítida, 1 = perto da lente, grande e suave), deriva, fase, cor
    const motes = [];
    for (let i = 0; i < 60; i++) {
      motes.push({ x: rand(), y: rand(), z: rand(), vx: rand() - 0.5, vy: 0.3 + rand(), phase: rand() * TAU, warm: rand() < 0.55 });
    }
    let grain = still ? null : makeGrain(rand);
    let grainPattern = null;
    let rayLayer = null;
    let backdrop = null;
    let backdropKey = '';
    let caption = hasText(o.phrase) ? { text: String(o.phrase), progress: 1, phrase: true, settle: 1 } : null;
    let layouts = {}; // legenda quebrada por modo (em andamento / parada): o cartão final do vídeo desenha os dois
    let playing = false;
    let destroyed = false; // a tela saiu: callbacks atrasados (legenda, imagem, mensagem) não pintam mais
    let raf = 0;
    let elapsed = 0;
    let startedAt = 0;
    let shown = 0; // t do último quadro pintado

    // estrela i: no arco do Traço Celeste até partir; depois voa em curva (meio puxado para cima) até o sol
    function starAt(i, t, r, k, sun) {
      const hx = r.x + TRACE[i][0] * k;
      const hy = r.y + r.h * 0.06 + TRACE[i][1] * k;
      const p = inOut(span(t, 1150 + 110 * i, 850 - 60 * i));
      const cx = (hx + sun.x) / 2 + (i - 1) * 0.04 * r.w;
      const cy = Math.min(hy, sun.y) - (0.1 + 0.03 * (2 - i)) * r.h;
      const a = 1 - p;
      return {
        hx,
        hy,
        p,
        x: a * a * hx + 2 * a * p * cx + p * p * sun.x,
        y: a * a * hy + 2 * a * p * cy + p * p * sun.y,
        b: (0.9 + 0.1 * Math.sin((t / 1000) * 3 + i * 1.7)) * (1 + 0.35 * Math.sin(Math.PI * p)) * (1 - smooth(span(p, 0.86, 0.14))),
      };
    }

    function drawStars(t, r, k, sun) {
      const stars = [0, 1, 2].map((i) => starAt(i, t, r, k, sun));
      // o traço: as linhas se ligam como no CelestialTrace e somem quando as estrelas partem
      const fade = 1 - smooth(span(t, 1050, 350));
      ctx.lineCap = 'round';
      for (let i = 0; i < 2 && fade > 0; i++) {
        const grow = smooth(span(t, 100 + 350 * i, 350));
        if (grow <= 0) continue;
        const from = stars[i];
        const to = stars[i + 1];
        const ex = from.hx + (to.hx - from.hx) * grow;
        const ey = from.hy + (to.hy - from.hy) * grow;
        ctx.globalAlpha = 0.25 * fade;
        ctx.strokeStyle = '#F2B25C';
        ctx.lineWidth = 6 * k;
        line(ctx, from.hx, from.hy, ex, ey);
        ctx.globalAlpha = 0.95 * fade;
        ctx.strokeStyle = '#FFD696';
        ctx.lineWidth = 1.4 * k;
        line(ctx, from.hx, from.hy, ex, ey);
      }
      stars.forEach((star, i) => {
        if (star.b <= 0.01) return;
        const glow = Math.min(1, star.b);
        ctx.globalAlpha = 1;
        if (star.p > 0 && star.p < 1) {
          const prev = starAt(i, t - 70, r, k, sun);
          const trail = ctx.createLinearGradient(prev.x, prev.y, star.x, star.y);
          trail.addColorStop(0, 'rgba(255,214,150,0)');
          trail.addColorStop(1, `rgba(255,236,200,${0.9 * glow})`);
          ctx.strokeStyle = trail;
          ctx.lineWidth = 2.6 * k;
          line(ctx, prev.x, prev.y, star.x, star.y);
        }
        ctx.fillStyle = radial(ctx, star.x, star.y, 18 * k * star.b, [
          [0, `rgba(255,226,170,${0.55 * glow})`],
          [1, 'rgba(242,178,92,0)'],
        ]);
        ctx.beginPath();
        ctx.arc(star.x, star.y, 18 * k * star.b, 0, TAU);
        ctx.fill();
        ctx.fillStyle = `rgba(255,248,235,${glow})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, 2.3 * k, 0, TAU);
        ctx.fill();
        // cruz de difração girando devagar
        const angle = 0.7 + 0.2 * (t / 1000) + i * 1.1;
        const len = 24 * k * (0.6 + 0.4 * glow);
        ctx.lineWidth = Math.max(1, 1.1 * k);
        for (let j = 0; j < 2; j++) {
          const dx = Math.cos(angle + (j * Math.PI) / 2) * len;
          const dy = Math.sin(angle + (j * Math.PI) / 2) * len;
          const spike = ctx.createLinearGradient(star.x - dx, star.y - dy, star.x + dx, star.y + dy);
          spike.addColorStop(0, 'rgba(255,236,200,0)');
          spike.addColorStop(0.5, `rgba(255,240,215,${0.75 * glow})`);
          spike.addColorStop(1, 'rgba(255,236,200,0)');
          ctx.strokeStyle = spike;
          line(ctx, star.x - dx, star.y - dy, star.x + dx, star.y + dy);
        }
      });
      ctx.globalAlpha = 1;
    }

    // luz: o dourado que invade a cena, raios, o sol, o flare anamórfico e o clarão/anel quando as estrelas chegam
    function drawLight(t, W, H, r, k, sun, lit) {
      const reach = Math.hypot(r.w, r.h);
      const s = t / 1000;
      ctx.globalAlpha = lit;
      ctx.fillStyle = radial(ctx, sun.x, sun.y, reach * 0.9, [
        [0, 'rgba(255,214,150,0.34)'],
        [0.4, 'rgba(242,178,92,0.1)'],
        [1, 'rgba(242,178,92,0)'],
      ]);
      ctx.fillRect(0, 0, W, H);

      const rays = intro ? smooth(span(t, IGNITE + 100, 1500)) : 1;
      if (rays > 0) drawRays(s, r, sun, rays);

      const R = r.w * 0.13;
      ctx.globalAlpha = lit;
      ctx.fillStyle = radial(ctx, sun.x, sun.y, R, [
        [0, 'rgba(255,255,248,1)'],
        [0.16, 'rgba(255,246,226,0.95)'],
        [0.42, 'rgba(242,178,92,0.32)'],
        [1, 'rgba(242,178,92,0)'],
      ]);
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, R, 0, TAU);
      ctx.fill();

      const flash = intro ? (t < IGNITE + 20 ? smooth(span(t, IGNITE - 60, 80)) : 1 - smooth(span(t, IGNITE + 20, 900))) : 0;
      // flare anamórfico: faixa horizontal azulada atravessando o sol
      const band = Math.max(1.5, r.h * 0.004);
      const streak = ctx.createLinearGradient(sun.x - r.w * 0.75, 0, sun.x + r.w * 0.75, 0);
      streak.addColorStop(0, 'rgba(160,200,255,0)');
      streak.addColorStop(0.5, 'rgba(210,228,255,0.9)');
      streak.addColorStop(1, 'rgba(160,200,255,0)');
      ctx.globalAlpha = Math.min(1, 0.22 * lit + 0.85 * flash);
      ctx.fillStyle = streak;
      ctx.fillRect(sun.x - r.w * 0.75, sun.y - band / 2, r.w * 1.5, band);
      if (flash > 0) {
        ctx.globalAlpha = flash;
        ctx.fillStyle = radial(ctx, sun.x, sun.y, reach * 0.55, [
          [0, 'rgba(255,250,240,0.95)'],
          [0.22, 'rgba(255,226,180,0.45)'],
          [1, 'rgba(242,178,92,0)'],
        ]);
        ctx.fillRect(0, 0, W, H);
      }
      const ring = intro ? span(t, IGNITE, 700) : 1;
      if (ring > 0 && ring < 1) {
        ctx.globalAlpha = 0.35 * (1 - ring);
        ctx.strokeStyle = '#FFECD2';
        ctx.lineWidth = Math.max(1, 2.5 * k);
        ctx.beginPath();
        ctx.arc(sun.x, sun.y, r.w * (0.03 + 0.55 * (1 - Math.pow(1 - ring, 3))), 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // raios dourados desenhados a 1/8 e ampliados dentro da imagem: a ampliação suave os deixa macios como luz
    // na névoa (funciona sem ctx.filter) e no 9:16 eles não invadem a faixa da assinatura
    function drawRays(s, r, sun, amount) {
      const w = Math.max(1, Math.round(r.w / 8));
      const h = Math.max(1, Math.round(r.h / 8));
      if (!rayLayer || rayLayer.width !== w || rayLayer.height !== h) rayLayer = makeCanvas(w, h);
      const g = rayLayer && rayLayer.getContext('2d');
      if (!g) return;
      const sx = (sun.x - r.x) / 8;
      const sy = (sun.y - r.y) / 8;
      const reach = Math.hypot(w, h);
      g.clearRect(0, 0, w, h);
      g.fillStyle = radial(g, sx, sy, reach, [
        [0, 'rgba(255,222,165,0.5)'],
        [0.5, 'rgba(255,214,150,0.18)'],
        [1, 'rgba(255,214,150,0)'],
      ]);
      for (let i = 0; i < 9; i++) {
        const angle = Math.PI * (0.18 + 0.09 * i) + 0.05 * Math.sin(s / 2.6 + i * 1.9);
        const half = 0.02 + 0.03 * (0.5 + 0.5 * Math.sin(i * 2.3 + s / 3.4));
        g.globalAlpha = (0.92 + 0.08 * Math.sin(s * 0.9)) * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s / 1.9 + i * 2.7)));
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(sx + Math.cos(angle - half) * reach, sy + Math.sin(angle - half) * reach);
        g.lineTo(sx + Math.cos(angle + half) * reach, sy + Math.sin(angle + half) * reach);
        g.closePath();
        g.fill();
      }
      ctx.globalAlpha = amount;
      ctx.drawImage(rayLayer, r.x, r.y, r.w, r.h);
    }

    function drawDust(t, W, H, amount, warm) {
      const s = t / 1000;
      const u = W / 720;
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        const radius = u * (0.8 + 4.5 * m.z * m.z * m.z);
        const speed = 0.3 + m.z;
        const x = wrap(m.x * W + m.vx * 0.008 * W * s * speed + 0.006 * W * Math.sin(s * 0.35 * (1 + m.z) + m.phase), W, radius);
        const y = wrap(m.y * H - m.vy * 0.006 * H * s * speed + 0.004 * H * Math.sin(s * 0.5 + m.phase * 2.3), H, radius);
        ctx.globalAlpha =
          amount * (0.45 + 0.55 * warm) * (0.85 - 0.6 * m.z) * (0.7 + 0.3 * Math.sin(s * (1.3 + 2 * m.z) + m.phase * 6));
        ctx.fillStyle = m.warm ? '#FFD9A0' : '#E1ECFF';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawGrain(t, W, H) {
      if (!grain) return;
      if (!grainPattern) grainPattern = ctx.createPattern(grain, 'repeat');
      if (!grainPattern) return;
      const f = Math.floor(t / 42); // o grão muda a 24 quadros por segundo
      const ox = (f * 37) % 128;
      const oy = (f * 71) % 128;
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = grainPattern;
      ctx.translate(-ox, -oy);
      ctx.fillRect(ox, oy, W, H);
      ctx.restore();
    }

    const captionFont = (size) => `italic 500 ${size}px ${SERIF}`;

    // quebra o texto em linhas num tamanho de fonte; cada palavra guarda onde começa (o progresso a revela)
    function wrapCaption(text, W, size) {
      ctx.font = captionFont(size);
      const space = ctx.measureText(' ').width;
      const lines = [];
      let current = { words: [], width: 0 };
      const re = /\S+/g;
      let match = re.exec(text);
      while (match) {
        const width = ctx.measureText(match[0]).width;
        if (current.words.length && current.width + space + width > W * 0.84) {
          lines.push(current);
          current = { words: [], width: 0 };
        }
        current.width += (current.words.length ? space : 0) + width;
        current.words.push({ text: match[0], start: match.index, width });
        match = re.exec(text);
      }
      if (current.words.length) lines.push(current);
      return { lines, size, space };
    }

    // nem a 60% coube em 5 linhas: a 5ª perde palavras do fim até caber com "…"
    function ellipsize(fit, W) {
      const lines = fit.lines.slice(0, 5);
      const tail = lines[4];
      ctx.font = captionFont(fit.size);
      const dots = ctx.measureText('…').width;
      while (tail.words.length > 1 && tail.width + dots > W * 0.84) tail.width -= tail.words.pop().width + fit.space;
      const end = tail.words[tail.words.length - 1];
      end.text += '…';
      end.width += dots;
      tail.width += dots;
      return { lines, size: fit.size, space: fit.space };
    }

    // legenda em andamento: tamanho cheio, quebrada uma vez (as palavras surgem sem a linha mudar de lugar).
    // Parada (phrase, ou progress 1): INTEIRA — a fonte desce 5% por vez até caber em 5 linhas (no mínimo 60%);
    // se nem assim, a 5ª linha termina em "…"
    function captionLayout(text, W, base, whole) {
      const key = `${text}|${W}|${base}`;
      const cached = layouts[whole];
      if (cached && cached.key === key) return cached.fit;
      let fit = wrapCaption(text, W, base);
      for (let step = 1; whole && fit.lines.length > 5 && step <= 8; step++) {
        fit = wrapCaption(text, W, Math.round(base * (1 - 0.05 * step) * 10) / 10);
      }
      if (whole && fit.lines.length > 5) fit = ellipsize(fit, W);
      fit.lines.forEach((ln) => {
        ln.scale = Math.min(1, (W * 0.84) / ln.width); // palavra sozinha mais larga que a caixa: encolhe, não corta
        let x = (W - ln.width * ln.scale) / 2;
        ln.words.forEach((word) => {
          word.x = x;
          x += (word.width + fit.space) * ln.scale;
        });
      });
      layouts[whole] = { key, fit };
      return fit;
    }

    // legenda: só as palavras cujo começo o progresso já passou. Em andamento, narração longa mostra só as últimas
    // 3 linhas (karaokê); parada, a frase inteira no tamanho que coube. Cartão final do vídeo (settle < 1): a janela
    // que rola se dissolve na frase inteira ajustada
    function drawCaption(t, W, H, r, current) {
      const base = Math.round(r.w * 0.058);
      const whole = current.phrase || current.progress >= 1;
      const fit = captionLayout(current.text, W, base, whole);
      if (!fit.lines.length) return;
      const blend = whole && current.settle < 1 ? smooth(current.settle) : 1;
      const bottom = r.y + r.h * 0.93 - (o.signature && !tall ? 96 * (W / 720) : 0);
      const fade = current.phrase && intro && !still ? smooth(span(t, 2400, 900)) : 1;
      // bloco: quantas linhas a janela mostra e onde o véu fica sólido (acima da 1ª linha)
      const block = (layout, all) => {
        const slots = all ? layout.lines.length : Math.min(3, layout.lines.length);
        const lineHeight = layout.size * 1.32;
        return { layout, slots, lineHeight, solid: bottom - (slots - 1) * lineHeight - layout.size * 1.1 };
      };
      const to = block(fit, whole);
      const from = blend < 1 ? block(captionLayout(current.text, W, base, false), false) : null;
      ctx.save();
      // véu de legibilidade: transparente no meio, rgba(8,16,28,0.62) a partir do topo do bloco até embaixo, para o
      // texto claro passar de 4,5:1 até nas cenas prontas de centro claro; fica parado enquanto as palavras surgem
      // (no dissolve, desliza da janela para o bloco inteiro)
      const solid = from ? from.solid + (to.solid - from.solid) * blend : to.solid;
      const top = solid - r.h * 0.16;
      const veil = ctx.createLinearGradient(0, top, 0, solid);
      veil.addColorStop(0, 'rgba(8,16,28,0)');
      veil.addColorStop(1, 'rgba(8,16,28,0.62)');
      ctx.globalAlpha = fade;
      ctx.fillStyle = veil;
      ctx.fillRect(0, top, W, H - top);
      const reached = current.progress * current.text.length;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = 'rgba(8,16,30,0.6)';
      ctx.shadowBlur = fit.size * 0.45;
      ctx.fillStyle = '#FFF9F0';
      // linhas que o progresso alcançou, na janela do bloco; lineAmount(i) = opacidade da linha i
      const drawLines = (b, amount, lineAmount) => {
        const lines = b.layout.lines;
        let last = -1;
        lines.forEach((ln, i) => {
          if (ln.words[0].start < reached) last = i;
        });
        const first = Math.max(0, last - b.slots + 1);
        for (let i = first; i <= last; i++) {
          const y = bottom - (b.slots - 1 - (i - first)) * b.lineHeight;
          const lineAlpha = amount * lineAmount(i);
          ctx.font = captionFont(Math.round(b.layout.size * lines[i].scale * 10) / 10);
          for (const word of lines[i].words) {
            const alpha = lineAlpha * clamp01((reached - word.start) / Math.min(3, word.text.length));
            if (alpha <= 0) break;
            ctx.globalAlpha = alpha;
            ctx.fillText(word.text, word.x, y);
          }
        }
      };
      if (from && from.layout.size !== fit.size) {
        // a frase inteira precisou de fonte menor: as duas se cruzam (opacidades somam 1)
        drawLines(from, fade * (1 - blend), () => 1);
        drawLines(to, fade * blend, () => 1);
      } else {
        // mesmo tamanho = mesmas quebras: as linhas da janela ficam onde estão e só as de cima aparecem
        const kept = from ? fit.lines.length - from.slots : 0;
        drawLines(to, fade, (i) => (i >= kept ? 1 : blend));
      }
      ctx.restore();
    }

    // assinatura: as 3 estrelas do Traço Celeste em miniatura + "Celeste" + link, no rodapé
    function drawSignature(W, H, r) {
      const u = W / 720;
      const y = tall ? (r.y + r.h + H) / 2 : H - 52 * u;
      const mark = 64 * u;
      const s = mark / 320;
      ctx.save();
      ctx.font = `500 ${Math.round(34 * u)}px ${SERIF}`;
      const x = (W - (mark + 14 * u + ctx.measureText('Celeste').width)) / 2;
      const points = TRACE.map((p) => [x + p[0] * s, y - 11 * u + (p[1] - 112) * s]);
      ctx.strokeStyle = 'rgba(242,178,92,0.85)';
      ctx.lineWidth = Math.max(1, 1.4 * u);
      ctx.beginPath();
      ctx.moveTo(points[0][0], points[0][1]);
      ctx.lineTo(points[1][0], points[1][1]);
      ctx.lineTo(points[2][0], points[2][1]);
      ctx.stroke();
      const q = 7 * u;
      ctx.fillStyle = '#F2B25C';
      ctx.beginPath();
      points.forEach((p) => {
        ctx.moveTo(p[0], p[1] - q);
        ctx.quadraticCurveTo(p[0], p[1], p[0] + q, p[1]);
        ctx.quadraticCurveTo(p[0], p[1], p[0], p[1] + q);
        ctx.quadraticCurveTo(p[0], p[1], p[0] - q, p[1]);
        ctx.quadraticCurveTo(p[0], p[1], p[0], p[1] - q);
      });
      ctx.fill();
      ctx.fillStyle = '#FFF9F0';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('Celeste', x + mark + 14 * u, y);
      if (o.linkText) {
        ctx.font = `${Math.round(19 * u)}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(String(o.linkText), W / 2, y + 40 * u);
      }
      ctx.restore();
    }

    function drawFrame(tMs) {
      const W = canvas.width;
      const H = canvas.height;
      if (destroyed || !ctx || !W || !H) return;
      const t = still ? 0 : Math.max(0, Number(tMs) || 0);
      shown = t;
      // r = onde a imagem 4:5 fica nítida (no 9:16, centralizada); estrelas, sol e legenda se medem por ela
      const r = tall ? { x: 0, y: (H - W * 1.25) / 2, w: W, h: W * 1.25 } : { x: 0, y: 0, w: W, h: H };
      const k = r.w / 320; // escala do céu do CelestialTrace
      const sun = { x: r.x + r.w * 0.7, y: r.y + r.h * 0.3 }; // canto superior direito, nos terços
      const cam = still ? { zoom: 1, pan: 0 } : camera(t);
      const lit = intro && !still ? smooth(span(t, IGNITE - 60, 600)) : 1;
      const warm = intro && !still ? smooth(span(t, IGNITE - 60, 1500)) : 1;

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#1C2E4F';
      ctx.fillRect(0, 0, W, H);
      if (tall && !still) {
        const key = `${W}x${H}`;
        if (key !== backdropKey) {
          backdrop = makeBackdrop(image, W, H);
          backdropKey = backdrop ? key : '';
        }
        if (backdrop) ctx.drawImage(backdrop, 0, 0, W, H);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.clip();
      ctx.imageSmoothingQuality = 'high';
      drawCover(ctx, image, r.x, r.y, r.w, r.h, cam.zoom, cam.pan * r.w);
      ctx.restore();

      // hora azul (multiplica um azul de crepúsculo) → luz dourada (soft-light no dourado da marca)
      if (warm < 1) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.62 * (1 - warm);
        ctx.fillStyle = '#3A5A8C';
        ctx.fillRect(0, 0, W, H);
      }
      if (warm > 0) {
        ctx.globalCompositeOperation = 'soft-light';
        ctx.globalAlpha = 0.3 * warm;
        ctx.fillStyle = '#F2B25C';
        ctx.fillRect(0, 0, W, H);
      }
      if (!still) {
        ctx.globalCompositeOperation = 'lighter';
        if (lit > 0) drawLight(t, W, H, r, k, sun, lit);
        const dust = intro ? smooth(span(t, 200, 1600)) : 1;
        if (dust > 0) drawDust(t, W, H, dust, warm);
        if (intro && t < IGNITE + 100) drawStars(t, r, k, sun);
        drawGrain(t, W, H);
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      const d = Math.hypot(W, H) / 2;
      ctx.fillStyle = radial(ctx, W / 2, H / 2, d, [
        [0.45, 'rgba(10,18,34,0)'],
        [1, 'rgba(10,18,34,0.5)'],
      ]);
      ctx.fillRect(0, 0, W, H);
      if (caption && hasText(caption.text)) {
        drawCaption(t, W, H, r, caption); // o véu da legenda também cobre a assinatura
      } else if (o.signature) {
        const top = r.y + r.h * 0.55;
        const scrim = ctx.createLinearGradient(0, top, 0, H);
        scrim.addColorStop(0, 'rgba(10,20,38,0)');
        scrim.addColorStop(1, 'rgba(10,20,38,0.5)');
        ctx.fillStyle = scrim;
        ctx.fillRect(0, top, W, H - top);
      }
      if (o.signature) drawSignature(W, H, r);
      ctx.restore();
    }

    function tick() {
      if (!playing) return;
      drawFrame(elapsed + now() - startedAt);
      raf = root.requestAnimationFrame(tick);
    }

    function start() {
      if (playing || destroyed) return;
      if (still) {
        drawFrame(0); // reduzir movimento: imagem parada, sem laço
        return;
      }
      playing = true;
      startedAt = now();
      tick();
    }

    function stop() {
      if (!playing) return;
      playing = false;
      elapsed += now() - startedAt;
      if (raf) root.cancelAnimationFrame(raf);
      raf = 0;
    }

    // settle: só o cartão final do vídeo passa (< 1 durante o dissolve); exibindo, a legenda completa já vem parada
    function assignCaption(next, settle) {
      caption =
        next && hasText(next.text)
          ? {
              text: String(next.text),
              progress: next.progress == null ? 1 : clamp01(Number(next.progress)),
              phrase: false,
              settle: settle == null ? 1 : clamp01(settle),
            }
          : null;
    }

    function setCaption(next) {
      assignCaption(next); // destruído, o drawFrame abaixo não pinta
      // parado (antes do start, depois do stop, reduzir movimento) ninguém repinta: a legenda nova aparece já, no
      // mesmo quadro que está na tela (o relógio pode ter andado depois dele)
      if (!playing) drawFrame(shown);
    }

    function destroy() {
      stop();
      destroyed = true;
      grain = null;
      grainPattern = null;
      rayLayer = null;
      backdrop = null;
      backdropKey = '';
      layouts = {};
    }

    return {
      api: { start, stop, drawFrame, setCaption, destroy },
      // gravação: troca a legenda e pinta o quadro t numa passada só (setCaption parado repintaria antes: custo dobrado)
      paintWithCaption: (t, next, settle) => {
        assignCaption(next, settle);
        drawFrame(t);
      },
    };
  }

  // grava o vídeo compartilhável: 9:16 com a intro, legenda progressiva e assinatura. Cartão final: a legenda completa
  // em 85% (6,8 s de 8 s), a janela se dissolve na frase inteira ajustada e ela fica parada com o Traço Celeste e o
  // link até o fim; clipe curto demais para isso (até 2,4 s) não tem cartão final (progress = t / duração).
  // signal (AbortSignal, opcional): a folha fechou — o laço para na hora, a câmera do canvas é solta e a promessa
  // rejeita com recorder_cancelled (reabrir não empilha gravações escondidas)
  function recordVideo(params) {
    const { image, phrase, linkText, signal, durationMs = 8000, width = 720, height = 1280, fps = 30 } = params || {};
    const failure = (code) => {
      const error = new Error(code);
      error.code = code;
      return error;
    };
    if (signal && signal.aborted) return Promise.reject(failure('recorder_cancelled'));
    const Recorder = root.MediaRecorder;
    const canvas = makeCanvas(width, height);
    const mimeType =
      Recorder && Recorder.isTypeSupported && canvas && canvas.captureStream
        ? pickRecorderMime((mime) => Recorder.isTypeSupported(mime))
        : null;
    if (!mimeType) return Promise.reject(failure('recorder_unsupported'));
    // fora da tela, mas no documento: canvas solto pode não gerar quadros em alguns navegadores
    const host = root.document.body;
    if (host) {
      canvas.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none';
      host.appendChild(canvas);
    }
    const scene = buildRenderer(canvas, { image, format: '9:16', mode: 'intro', reducedMotion: false, signature: true, linkText });
    const renderer = scene.api;
    const reveal = durationMs > 2 * END_HOLD_MS ? durationMs - END_HOLD_MS : durationMs;
    const paint = (t) =>
      scene.paintWithCaption(t, { text: phrase || '', progress: t / reveal }, reveal < durationMs ? span(t, reveal, SETTLE_MS) : 1);
    return new Promise((resolve, reject) => {
      const chunks = [];
      let stream = null;
      let recorder = null;
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        if (signal && signal.removeEventListener) signal.removeEventListener('abort', cancel);
        if (stream) stream.getTracks().forEach((track) => track.stop());
        renderer.destroy();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (error) reject(error);
        else resolve({ blob: new root.Blob(chunks, { type: mimeType }), mimeType });
      };
      const cancel = () => finish(failure('recorder_cancelled'));
      if (signal && signal.addEventListener) signal.addEventListener('abort', cancel);
      try {
        paint(0); // o 1º quadro já está pronto quando o gravador liga
        // sem teto: o laço abaixo já pinta a `fps`; captureStream(30) com o jitter do relógio descartava ~7% dos
        // quadros no Chrome (medido: 201 vs 217 em 8 s)
        stream = canvas.captureStream();
        recorder = new Recorder(stream, { mimeType, videoBitsPerSecond: 3000000 });
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size) chunks.push(event.data);
        };
        recorder.onerror = (event) => finish((event && event.error) || new Error('recorder_error'));
        recorder.onstop = () => finish(null);
        recorder.start();
      } catch (error) {
        finish(error);
        return;
      }
      const startedAt = now();
      let frames = 0;
      const tick = () => {
        if (done) return;
        const t = Math.min(durationMs, now() - startedAt);
        paint(t);
        frames += 1;
        // agenda pelo relógio do vídeo (não 33 ms depois do desenho): sem isso cai para ~27 fps
        if (t < durationMs) root.setTimeout(tick, Math.max(0, startedAt + ((frames + 1) * 1000) / fps - now()));
        else if (recorder.state !== 'inactive') recorder.stop();
      };
      root.setTimeout(tick, 1000 / fps);
    });
  }

  // mime do vídeo: mp4 H.264 primeiro (o WhatsApp abre); webm só por último; nenhum → null
  function pickRecorderMime(isTypeSupported) {
    for (let i = 0; i < MIMES.length; i++) {
      if (isTypeSupported(MIMES[i])) return MIMES[i];
    }
    return null;
  }

  // o vídeo volta da WebView em base64 pelo postMessage: em pedaços, remontados igual
  function splitChunks(base64, size = 512 * 1024) {
    const step = Math.max(1, Math.floor(size) || 1);
    const parts = [];
    for (let i = 0; i < base64.length; i += step) parts.push(base64.slice(i, i + step));
    return parts;
  }

  function joinChunks(parts) {
    return parts.join('');
  }

  root.CenaViva = { createRenderer, recordVideo, pickRecorderMime, splitChunks, joinChunks };
  return root.CenaViva;
}
