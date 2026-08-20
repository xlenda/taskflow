// Verifica AO VIVO o app interno: idioma PT em todas as abas, botão de áudio
// presente e altura dinâmica (dvh) aplicada. Simula um iPhone real.
// Uso: node scripts/verify-app-pt.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT = path.join(__dirname, 'e2e-shots');
fs.mkdirSync(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Estado já onboardado + idioma PT, injetado direto para pular o funil.
const SEED = {
  name: 'Ana',
  lang: 'pt',
  onboardingDone: true,
  profile: { name: 'Ana', city: 'Guarulhos' },
  manifestations: [],
  favoriteAffirmations: [],
  affirmationDates: [],
  savedVisions: [],
  visionPlays: [],
};

const ENGLISH_LEAKS = [
  'Affirmations', 'Come back once daily', 'Share this affirmation', 'Favourites',
  'Trending manifestations', 'For you', 'Your manifestations', 'day streak',
  'Journey', 'Reset my journey', 'longest focus', 'Practices', 'Visions',
  'what do you want to manifest', 'Nothing in motion yet', 'No favourites yet',
  'days with a practice logged', 'Mood of the app', 'practised today',
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  // iPhone 13 real: viewport pequeno é onde o bug da barra do Safari aparece
  await page.setViewport({ width: 390, height: 664, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  );

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate((seed) => {
    localStorage.setItem('@stella_state_v2', JSON.stringify(seed));
  }, SEED);
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);

  const failures = [];

  // ---- altura dinâmica servida ----
  const dvh = await page.evaluate(() => {
    const el = document.getElementById('celeste-dvh');
    const root = document.getElementById('root');
    return {
      styleTag: !!el,
      rootHeight: root ? getComputedStyle(root).height : null,
      viewport: window.innerHeight,
      viewportFit: (document.querySelector('meta[name=viewport]') || {}).content || '',
    };
  });
  if (!dvh.styleTag) failures.push('style celeste-dvh AUSENTE no HTML servido');
  if (!/viewport-fit=cover/.test(dvh.viewportFit)) failures.push('viewport-fit=cover ausente');
  console.log(`altura: root=${dvh.rootHeight} viewport=${dvh.viewport}px | ${dvh.viewportFit}`);

  const tabs = [
    { label: 'Manifestar', file: 'pt-1-home' },
    { label: 'Visões', file: 'pt-2-visoes' },
    { label: 'Afirmações', file: 'pt-3-afirmacoes' },
    { label: 'Jornada', file: 'pt-4-jornada' },
  ];

  // React Native Web ouve pointer events — dispatchEvent sintético não navega.
  const tapText = async (label) => {
    const box = await page.evaluate((l) => {
      const el = [...document.querySelectorAll('div, span')].find(
        (e) => e.children.length === 0 && e.textContent.trim() === l && e.offsetParent !== null
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, label);
    if (!box) return false;
    await page.mouse.click(box.x, box.y);
    return true;
  };

  for (const tab of tabs) {
    const clicked = await tapText(tab.label);
    if (!clicked) {
      failures.push(`aba "${tab.label}" não encontrada (rótulo não traduzido?)`);
      continue;
    }
    await sleep(2200);
    await page.screenshot({ path: path.join(SHOT, `${tab.file}.png`) });
    const text = await page.evaluate(() => document.body.innerText);
    const leaks = ENGLISH_LEAKS.filter((w) => text.includes(w));
    if (leaks.length) failures.push(`aba "${tab.label}" com inglês: ${leaks.join(' | ')}`);
    console.log(`aba ${tab.label}: ${leaks.length ? '❌ ' + leaks.join(' | ') : 'PT ok'}`);
  }

  // ---- botão de ouvir: precisa estar NA tela de Afirmações e VISÍVEL ----
  await tapText('Afirmações');
  await sleep(2500);
  const audio = await page.evaluate(() => {
    const visible = [...document.querySelectorAll('[aria-label]')].filter((e) => e.offsetParent !== null);
    const labels = visible.map((e) => e.getAttribute('aria-label')).filter(Boolean);
    return {
      temOuvir: labels.some((l) => /ouvir|escutar|listen|parar|narra/i.test(l)),
      labels: labels.slice(0, 12),
      speechAPI: 'speechSynthesis' in window,
    };
  });
  await page.screenshot({ path: path.join(SHOT, 'pt-5-audio.png') });
  console.log(`áudio: API=${audio.speechAPI} botãoOuvir=${audio.temOuvir}`);
  console.log('  labels:', audio.labels.join(' / '));
  if (!audio.temOuvir) failures.push('botão de ouvir NÃO encontrado na tela de Afirmações');

  await browser.close();

  if (failures.length) {
    console.error(`\n❌ VERIFICAÇÃO FALHOU (${failures.length}):`);
    failures.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('\n✅ App interno em PT, áudio disponível e altura dinâmica aplicada');
})().catch((e) => {
  console.error('ERRO:', String(e).slice(0, 300));
  process.exit(1);
});
