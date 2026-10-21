// Contraste do texto do cartão do compartilhar (components/ShareCard.js, 9:16) sobre o fundo de verdade, renderizado no
// Chrome: as 42 cenas prontas e, sem imagem (a cena que falhou), o gradiente da marca de cada tema — sempre com o véu
// e as cores de texto do cartão (SHARE_CARD_VEIL e styles, lidos do próprio ShareCard.js). O texto é desenhado
// transparente (só o fundo conta) e a caixa de cada linha vem do layout do navegador (Range.getClientRects), com o
// cartão em 1080×1920 como a captura. Pior caso = os 10% de pixels com menos contraste (p90 da luz) sob a frase —
// curta, longa (a de 165 letras do E2E) e a mais longa que o cartão aceita (teto, informativo) — e sob o rótulo, o
// nome e o link. No fim compara a réplica com o cartão real que o E2E salvou (faixas sem texto).
// Não é portão do deploy: rodar ao mexer no véu, nas cenas ou no layout do cartão. Sai com 1 se algum texto (fora o
// teto) ficar abaixo de 4,5:1 em alguma cena ou tema.
// Uso (cwd = C:\projetos\TaskFlow): node scripts/contraste-cartao-compartilhar.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const root = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIN = 4.5;

// o literal (objeto ou lista) logo depois de `marker` no código-fonte (context: os nomes que ele usa)
function literalAfter(source, marker, context = {}) {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`não achei ${marker}`);
  let i = source.slice(at + marker.length).search(/[[{]/) + at + marker.length;
  const start = i;
  let depth = 0;
  let quote = null;
  for (; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'" || c === '`') quote = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (!depth) return vm.runInNewContext(`(${source.slice(start, i + 1)})`, context);
    }
  }
  throw new Error(`literal aberto depois de ${marker}`);
}

const card = fs.readFileSync(path.join(root, 'components', 'ShareCard.js'), 'utf8');
const VEIL = literalAfter(card, 'export const SHARE_CARD_VEIL = Object.freeze(');
const PHRASE_BOX = literalAfter(card, 'const PHRASE_BOX = ');
const PHRASE_TIERS = literalAfter(card, 'const PHRASE_TIERS = ');
const STYLES = literalAfter(card, 'const styles = StyleSheet.create(', {
  SHARE_CARD_LAYOUT_SIZE: { width: 360, height: 640 },
  SHARE_CARD_VEIL: VEIL,
  SERIF: 'serif',
});
// cor do texto como [r, g, b] e opacidade: '#FFF', '#FFF9F0' ou 'rgba(r,g,b,a)'
const textColor = (value) => {
  const rgba = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgba) {
    const [r, g, b, a = 1] = rgba[1].split(',').map(Number);
    return { rgb: [r, g, b], alpha: a };
  }
  const hex = value.replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  return { rgb: [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16)), alpha: 1 };
};
const TEXT = {
  phrase: textColor(STYLES.phrase.color),
  kind: textColor(STYLES.kind.color),
  brand: textColor(STYLES.brand.color),
  url: textColor(STYLES.url.color),
};
// o mesmo encaixe do ShareCard.js (fonte que cabe nas linhas acima da assinatura)
const linesIn = (tier) => Math.floor(PHRASE_BOX.height / tier.lineHeight);
const capacity = (tier) => linesIn(tier) * (PHRASE_BOX.width / (0.64 * tier.fontSize)) * 0.85;
const phraseFit = (length) => {
  const tier = PHRASE_TIERS.find((candidate) => capacity(candidate) >= length) || PHRASE_TIERS[PHRASE_TIERS.length - 1];
  return { fontSize: tier.fontSize, lineHeight: tier.lineHeight, lines: linesIn(tier) };
};

const LONG =
  'Eu escolho viver com mais calma e propósito em cada dia. Eu reconheço minha coragem e a minha persistência e ' +
  'deixo que elas guiem os meus próximos passos.';
const PHRASES = {
  curta: 'Eu escolho viver com calma e propósito.',
  longa: LONG.slice(0, 165),
  teto: 'palavra '.repeat(80).trim(),
};

const accents = [...fs.readFileSync(path.join(root, 'ui', 'theme.js'), 'utf8').matchAll(/^\s*(\w+):\s*\{[^\n]*accents: \[([^\]]*)\]/gm)].map(
  ([, name, list]) => ({ name, colors: list.split(',').map((c) => c.trim().replace(/'/g, '')) })
);
const rgba = (hex, a) => {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${a})`;
};
// gradientPair(tema, 0) do cartão: accents[0] e accents[2]
const themeGradient = (colors) => [rgba(colors[0], 0.95), rgba(colors[2], 0.82), rgba(colors[2], 0.62)];
// expo-linear-gradient na web: 90 + atan2 dos pontos na caixa (start 0.05,0 → end 0.95,1 em 360×640)
const coverAngle = 90 + (Math.atan2(640, 0.9 * 360) * 180) / Math.PI;
const stops = (colors, locations) => colors.map((c, i) => (locations && locations[i] ? `${c} ${locations[i] * 100}%` : c)).join(', ');

// o cartão como o react-native-web desenha: View = flex coluna; % de padding sobre a largura; texto transparente
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #000; }
  .v { display: flex; flex-direction: column; position: relative; min-width: 0; min-height: 0; flex-shrink: 0; }
  .fill { position: absolute; left: 0; top: 0; right: 0; bottom: 0; }
  .t { white-space: pre-wrap; overflow-wrap: break-word; color: transparent; text-shadow: none; }
  #card { width: 360px; height: 640px; overflow: hidden; background: #759ACE; }
  #cover { flex: 1; }
  #img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: cover; }
  #safe { flex: 1; padding: 12% 9% 8% 9%; }
  #center { flex: 1; align-items: center; justify-content: center; padding: 7% 0; }
  #kind { min-height: 18px; font: 800 11px/16px system-ui, sans-serif; letter-spacing: 2px; text-align: center; margin-bottom: 24px; }
  #phrase { width: 100%; font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-weight: 600; text-align: center;
    display: -webkit-box; -webkit-box-orient: vertical; overflow: hidden; }
  #footer { align-items: center; }
  #row { flex-direction: row; align-items: center; margin-bottom: 8px; }
  #mark { width: 46px; height: 22px; margin-right: 9px; }
  #brand { font: 500 22px/28px Georgia, 'Times New Roman', serif; }
  #url { font: 700 11px/16px system-ui, sans-serif; letter-spacing: 0.35px; text-align: center; }
</style></head><body>
<div id="card" class="v"><div id="cover" class="v">
  <img id="img" alt="">
  <div id="veil" class="fill"></div>
  <div id="shade" class="fill"></div>
  <div id="safe" class="v">
    <div id="center" class="v"><div id="kind" class="t">CENA-ÂNCORA</div><div id="phrase" class="t"></div></div>
    <div id="footer" class="v"><div id="row" class="v"><div id="mark" class="v"></div><div id="brand" class="t">Celeste</div></div>
    <div id="url" class="t">https://celeste-jet-two.vercel.app</div></div>
  </div>
</div></div>
<script>
  const lin = (v) => (v <= 0.04045 * 255 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  let pixels = null;
  window.setBackground = async ({ src, cover, veil, shade }) => {
    const img = document.getElementById('img');
    if (src) {
      img.style.display = '';
      img.src = src;
      await img.decode();
    } else img.style.display = 'none';
    document.getElementById('cover').style.backgroundImage = cover;
    document.getElementById('veil').style.background = veil;
    document.getElementById('shade').style.backgroundImage = shade || 'none';
  };
  window.loadShot = async (dataUrl) => {
    const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  };
  // texto (cor + opacidade) sobre cada pixel das linhas do elemento: o contraste dos 10% piores
  window.worst = (id, color, alpha, scale) => {
    const el = document.getElementById(id);
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const ratios = [];
    for (const r of range.getClientRects()) {
      const top = Math.max(r.top, box.top);
      const bottom = Math.min(r.bottom, box.bottom);
      if (bottom - top < 2) continue; // linha escondida pelo limite de linhas
      for (let y = Math.round(top * scale); y < Math.round(bottom * scale); y++) {
        for (let x = Math.round(r.left * scale); x < Math.round(r.right * scale); x++) {
          const i = (y * pixels.width + x) * 4;
          const bg = [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]];
          const text = color.map((c, k) => c * alpha + bg[k] * (1 - alpha));
          const Lt = lum(...text);
          const Lb = lum(...bg);
          ratios.push((Math.max(Lt, Lb) + 0.05) / (Math.min(Lt, Lb) + 0.05));
        }
      }
    }
    ratios.sort((a, b) => a - b);
    return ratios.length ? ratios[Math.floor(ratios.length * 0.1)] : null;
  };
  window.setPhrase = (text, fit) => {
    const el = document.getElementById('phrase');
    el.textContent = '\\u201c' + text + '\\u201d';
    el.style.fontSize = fit.fontSize + 'px';
    el.style.lineHeight = fit.lineHeight + 'px';
    el.style.webkitLineClamp = String(fit.lines);
  };
</script></body></html>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 640, deviceScaleFactor: 3 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const shade = `linear-gradient(180deg, ${stops(VEIL.gradient.colors, VEIL.gradient.locations)})`;
  const backgrounds = [];
  const sceneDir = path.join(root, 'assets', 'scenes');
  for (const file of fs.readdirSync(sceneDir).filter((f) => f.endsWith('.jpg')).sort()) {
    backgrounds.push({
      id: file.replace('.jpg', ''),
      src: `data:image/jpeg;base64,${fs.readFileSync(path.join(sceneDir, file)).toString('base64')}`,
      cover: `linear-gradient(${coverAngle}deg, ${themeGradient(accents[0].colors).join(', ')})`,
      veil: VEIL.image,
      shade,
    });
  }
  // sem imagem (a cena que falhou): o gradiente da marca do tema, com o mesmo véu
  for (const theme of accents) {
    backgrounds.push({
      id: `gradiente ${theme.name}`,
      src: null,
      cover: `linear-gradient(${coverAngle}deg, ${themeGradient(theme.colors).join(', ')})`,
      veil: VEIL.image,
      shade,
    });
  }
  const rows = [];
  for (const background of backgrounds) {
    await page.evaluate((b) => window.setBackground(b), background);
    const shot = await page.screenshot({ encoding: 'base64', type: 'png', clip: { x: 0, y: 0, width: 360, height: 640 } });
    await page.evaluate((data) => window.loadShot(data), `data:image/png;base64,${shot}`);
    const row = { id: background.id };
    for (const [name, text] of Object.entries(PHRASES)) {
      const result = await page.evaluate(
        (t, fit, colors) => {
          window.setPhrase(t, fit);
          const at = (id) => window.worst(id, colors[id].rgb, colors[id].alpha, 3);
          return { phrase: at('phrase'), kind: at('kind'), brand: at('brand'), url: at('url') };
        },
        text,
        phraseFit(text.length + 2),
        TEXT
      );
      row[name] = result.phrase;
      // o rótulo vai junto da frase (logo acima dela): conta nas frases de verdade, não no teto
      if (name !== 'teto') row.kind = Math.min(row.kind ?? Infinity, result.kind);
      row.brand = result.brand;
      row.url = result.url;
    }
    rows.push(row);
  }
  // o cartão real que o E2E salvou (cena pronta da praia × Paz): o mesmo fundo nas faixas sem texto valida a réplica
  const real = path.join(root, 'scripts', 'e2e-shots', 'share-card-ancora.jpg');
  let check = null;
  if (fs.existsSync(real)) {
    const replica = backgrounds.find((b) => b.id === 'beach-Peace');
    await page.evaluate((b) => window.setBackground(b), replica);
    const shot = await page.screenshot({ encoding: 'base64', type: 'png', clip: { x: 0, y: 0, width: 360, height: 640 } });
    check = await page.evaluate(
      async (mine, theirs) => {
        const read = async (url) => {
          const bitmap = await createImageBitmap(await (await fetch(url)).blob());
          const canvas = document.createElement('canvas');
          canvas.width = 1080;
          canvas.height = 1920;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(bitmap, 0, 0, 1080, 1920);
          return ctx.getImageData(0, 0, 1080, 1920).data;
        };
        const a = await read(mine);
        const b = await read(theirs);
        // margens laterais (o texto nunca passa dos 9% de padding) e o alto do cartão
        const bands = [[12, 84, 300, 1600], [996, 1068, 300, 1600], [12, 1068, 12, 120]];
        let sum = 0;
        let n = 0;
        for (const [x0, x1, y0, y1] of bands) {
          for (let y = y0; y < y1; y += 2) {
            for (let x = x0; x < x1; x += 2) {
              const i = (y * 1080 + x) * 4;
              sum += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3;
              n++;
            }
          }
        }
        return sum / n;
      },
      `data:image/png;base64,${shot}`,
      `data:image/jpeg;base64,${fs.readFileSync(real).toString('base64')}`
    );
  }
  await browser.close();

  rows.sort((a, b) => Math.min(a.curta, a.longa) - Math.min(b.curta, b.longa));
  const f = (v) => (v == null ? '  -  ' : v.toFixed(2).padStart(5));
  console.log(`véu: ${JSON.stringify(VEIL)}`);
  console.log('fundo                   frase curta  longa  teto | rótulo  nome  link   (pior 10%, :1)');
  for (const r of rows) {
    const mark = Math.min(r.curta, r.longa, r.kind, r.brand, r.url) < MIN ? '  <4,5' : '';
    console.log(`${r.id.padEnd(24)}${f(r.curta)}  ${f(r.longa)} ${f(r.teto)} | ${f(r.kind)} ${f(r.brand)} ${f(r.url)}${mark}`);
  }
  const below = (key) => rows.filter((r) => r[key] < MIN).length;
  console.log(
    `\n${rows.length} fundos; abaixo de 4,5:1 → frase curta ${below('curta')}, longa ${below('longa')}, teto ${below('teto')}, ` +
      `rótulo ${below('kind')}, nome ${below('brand')}, link ${below('url')}`
  );
  if (check != null) console.log(`réplica × cartão real do E2E (praia × Paz, faixas sem texto): diferença média ${check.toFixed(1)}/255`);
  process.exitCode = ['curta', 'longa', 'kind', 'brand', 'url'].some(below) ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
