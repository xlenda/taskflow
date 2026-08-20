// Prova que o app toca o MP3 neural (e não a voz robótica do aparelho) quando
// o usuário aperta "Ouvir". Espiona as requisições de rede: se um /audio/*.mp3
// for pedido ao tocar, a locução está sendo usada de verdade.
// Uso: node scripts/verificar-audio-neural.js
const path = require('path');
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });

  const audiosPedidos = [];
  p.on('request', (r) => {
    if (/\/audio\/.+\.mp3/.test(r.url())) audiosPedidos.push(r.url().split('/').slice(-2).join('/'));
  });

  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.evaluate(() =>
    localStorage.setItem(
      '@stella_state_v2',
      JSON.stringify({
        name: 'Ana', lang: 'pt', onboardingDone: true, profile: {},
        manifestations: [], favoriteAffirmations: [], affirmationDates: [], savedVisions: [], visionPlays: [],
      })
    )
  );
  await p.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3500);

  const tap = async (texto) => {
    const box = await p.evaluate((t) => {
      const el = [...document.querySelectorAll('div, span')].find(
        (e) => e.children.length === 0 && e.textContent.trim() === t && e.offsetParent !== null
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, texto);
    if (!box) return false;
    await p.mouse.click(box.x, box.y);
    await sleep(1600);
    return true;
  };

  // ── Afirmações: botão "Ouvir esta afirmação" ──────────────────────────────
  await tap('Afirmações');
  const btn = await p.evaluate(() => {
    const el = [...document.querySelectorAll('[aria-label]')].find(
      (e) => /ouvir|listen/i.test(e.getAttribute('aria-label') || '') && e.offsetParent !== null
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!btn) {
    console.error('❌ botão de ouvir não encontrado na tela de Afirmações');
    await b.close();
    process.exit(1);
  }
  await p.mouse.click(btn.x, btn.y);
  await sleep(2500);
  const afirmacaoOk = audiosPedidos.length > 0;
  console.log(`afirmação: ${afirmacaoOk ? '✅ tocou ' + audiosPedidos[0] : '❌ nenhum mp3 pedido (caiu na voz do aparelho)'}`);

  // ── Visões: abrir uma e dar play ──────────────────────────────────────────
  const antes = audiosPedidos.length;
  await tap('Visões');
  const card = await p.evaluate(() => {
    const c = [...document.querySelectorAll('div')].filter(
      (e) => e.offsetParent !== null && e.getBoundingClientRect().height > 130 && e.getBoundingClientRect().width > 200
    );
    if (!c.length) return null;
    const r = c[Math.min(2, c.length - 1)].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  let visaoOk = false;
  if (card) {
    await p.mouse.click(card.x, card.y);
    await sleep(2400);
    const play = await p.evaluate(() => {
      const el = [...document.querySelectorAll('[aria-label]')].find(
        (e) => /tocar|play|ouvir|pausar/i.test(e.getAttribute('aria-label') || '') && e.offsetParent !== null
      );
      if (el) { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
      // fallback: maior botão redondo da tela (o play grande)
      const c = [...document.querySelectorAll('div')].filter((e) => {
        const r = e.getBoundingClientRect();
        return e.offsetParent !== null && r.width > 55 && r.width < 90 && Math.abs(r.width - r.height) < 6;
      });
      if (!c.length) return null;
      const r = c[c.length - 1].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (play) {
      await p.mouse.click(play.x, play.y);
      await sleep(3000);
      visaoOk = audiosPedidos.length > antes;
    }
  }
  console.log(`visão:     ${visaoOk ? '✅ tocou ' + audiosPedidos[audiosPedidos.length - 1] : '⚠ não confirmado (o play pode não ter sido alcançado)'}`);

  await p.screenshot({ path: path.join(__dirname, 'e2e-shots', 'audio-neural.png') });
  await b.close();

  if (!afirmacaoOk) {
    console.error('❌ a locução neural NÃO está sendo usada nas afirmações');
    process.exit(1);
  }
  console.log(`\n✅ locução neural em uso (${audiosPedidos.length} arquivo(s) pedidos)`);
})().catch((e) => { console.error('ERRO:', String(e).slice(0, 250)); process.exit(2); });
