// Verifica AO VIVO o app interno: idioma PT em todas as abas, botão de áudio
// presente e altura dinâmica (dvh) aplicada. Simula um iPhone real.
// Uso: node scripts/verify-app-pt.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(URL);
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT = path.join(__dirname, 'e2e-shots');
fs.mkdirSync(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Estado já onboardado + idioma PT, injetado direto para pular o funil.
const TODAY = new Date().toISOString().slice(0, 10);
const SEED = {
  name: 'Ana',
  lang: 'pt',
  onboardingDone: true,
  profile: { name: 'Ana', city: 'Guarulhos' },
  manifestations: [
    {
      id: 'm-qa-active',
      title: 'Meu caminho',
      category: 'Career',
      accent: 2,
      lang: 'pt',
      intention: 'Dar espaço ao trabalho que importa',
      affirmation: 'Eu abro espaço para o meu trabalho ser visto.',
      story: 'Eu começo o dia com clareza e escolho a ação que depende de mim.',
      anchorIdentity: 'Eu construo espaço para o meu trabalho ser visto.',
      anchorStep: 'Enviar uma mensagem profissional que depende apenas de mim.',
      goalDays: 21,
      createdAt: TODAY,
      sessions: [TODAY],
      evidence: [
        null,
        { id: 'e-invalid-without-text' },
        {
          id: 'e-qa-existing',
          text: 'Percebi onde eu estava adiando uma conversa importante.',
          createdAt: `${TODAY}T12:00:00.000Z`,
        },
      ],
    },
    {
      id: 'm-qa-complete',
      title: 'Ciclo fechado',
      category: 'Peace',
      accent: 0,
      lang: 'pt',
      intention: 'Proteger minha atenção',
      affirmation: 'Eu escolho o que merece entrar no meu dia.',
      story: 'A prática foi concluída.',
      anchorIdentity: 'Eu protejo minha atenção.',
      anchorStep: 'Ficar dois minutos sem tela.',
      goalDays: 1,
      createdAt: TODAY,
      completedAt: TODAY,
      sessions: [TODAY],
      evidence: [],
    },
  ],
  favoriteAffirmations: [],
  affirmationDates: [],
  savedVisions: [],
  visionPlays: [],
};

const ENGLISH_LEAKS = [
  'Affirmations', 'Come back once daily', 'Share this affirmation', 'Favourites',
  'From your dreams', 'From your dream',
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
  const runtimeErrors = [];
  const audioRequests = [];
  page.on('pageerror', (error) => runtimeErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  page.on('request', (request) => {
    if (/\/audio\//.test(request.url())) audioRequests.push(request.url());
  });
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
  // O patch de dvh/viewport entra no export de deploy, não no servidor Metro.
  if (!IS_LOCAL && !dvh.styleTag) failures.push('style celeste-dvh AUSENTE no HTML servido');
  if (!IS_LOCAL && !/viewport-fit=cover/.test(dvh.viewportFit)) failures.push('viewport-fit=cover ausente');
  console.log(`altura: root=${dvh.rootHeight} viewport=${dvh.viewport}px | ${dvh.viewportFit}`);

  const tabs = [
    { label: 'Manifestar', file: 'pt-1-home' },
    { label: 'Visões', file: 'pt-2-visoes' },
    { label: 'Afirmações', file: 'pt-3-afirmacoes' },
    { label: 'Jornada', file: 'pt-4-jornada' },
  ];

  // React Native Web ouve pointer events — dispatchEvent sintético não navega.
  const tapText = async (label) => {
    await page.evaluate((l) => {
      const el = [...document.querySelectorAll('div, span')].find(
        (e) => e.children.length === 0 && e.textContent.trim() === l && e.offsetParent !== null
      );
      if (el) el.scrollIntoView({ block: 'center', inline: 'center' });
    }, label);
    await sleep(200);
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
  const personalDeck = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      chip: text.includes('Dos seus sonhos'),
      personalText:
        text.includes('Eu abro espaço para o meu trabalho ser visto.') ||
        text.includes('Eu escolho o que merece entrar no meu dia.'),
      counter: /\b[12]\s*\/\s*2\b/.test(text),
      objectLeak: text.includes('[object Object]'),
    };
  });
  if (!personalDeck.chip) failures.push('chip "Dos seus sonhos" ausente');
  if (!personalDeck.personalText) failures.push('aba não abriu com uma afirmação derivada dos sonhos');
  if (!personalDeck.counter) failures.push('deck pessoal não contém as 2 afirmações do estado');
  if (personalDeck.objectLeak) failures.push('deck pessoal renderizou [object Object]');

  await tapText('Todas');
  await sleep(350);
  const allCounter = await page.evaluate(() => /\b\d+\s*\/\s*14\b/.test(document.body.innerText));
  if (!allCounter) failures.push('filtro Todas não reuniu 2 pessoais + 12 do catálogo');
  await tapText('Dos seus sonhos');
  await sleep(350);

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
  const audioBefore = audioRequests.length;
  if (await tapText('Ouvir esta afirmação')) {
    await sleep(700);
    if (audioRequests.length > audioBefore) {
      failures.push('afirmação pessoal tentou buscar MP3 em /audio/');
    }
  }

  // ---- Ponte + Rastros: fluxo novo com uma manifestação real ----
  await tapText('Manifestar');
  await sleep(1200);
  if (!(await tapText('Meu caminho'))) failures.push('manifestação ativa não apareceu na Home');
  await sleep(1200);
  const manifestationText = await page.evaluate(() => document.body.innerText);
  if (!manifestationText.includes('Sua ponte para hoje')) failures.push('Ponte de Hoje ausente na manifestação');
  if (!manifestationText.includes('Rastros de mudança')) failures.push('formulário de Rastros ausente na manifestação');
  const traceInput = await page.$('[aria-label="O que aconteceu, não aconteceu ou você quer ajustar?"]');
  if (!traceInput) {
    failures.push('campo de Rastro sem label acessível');
  } else {
    await traceInput.type('Hoje enviei a mensagem que eu vinha adiando.');
    await tapText('Guardar este rastro');
    await sleep(600);
    const savedText = await page.evaluate(() => document.body.innerText);
    if (!savedText.includes('Guardado na sua jornada privada.')) failures.push('recibo de Rastro salvo não apareceu');
  }
  await page.screenshot({ path: path.join(SHOT, 'pt-6-manifestacao-rastros.png') });

  await tapText('Jornada');
  await sleep(1200);
  const journeyText = await page.evaluate(() => document.body.innerText);
  if (!journeyText.includes('Hoje enviei a mensagem')) failures.push('Rastro salvo não chegou à Jornada');
  if (!journeyText.includes('Meu caminho')) failures.push('manifestação ativa ausente da Jornada');
  if (journeyText.includes('Ciclo fechado')) failures.push('ciclo concluído apareceu em Manifestações ativas');
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('div, span')].find(
      (el) => el.children.length === 0 && el.textContent.trim() === 'Rastros de mudança' && el.offsetParent !== null
    );
    if (heading) heading.scrollIntoView({ block: 'start' });
  });
  await page.mouse.move(195, 360);
  await page.mouse.wheel({ deltaY: 1500 });
  await sleep(300);
  await page.screenshot({ path: path.join(SHOT, 'pt-7-jornada-rastros.png') });

  // As duas telas densas também precisam respirar em desktop.
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  await sleep(500);
  await page.evaluate(() => {
    const heading = [...document.querySelectorAll('div, span')].find(
      (el) => el.children.length === 0 && el.textContent.trim() === 'Rastros de mudança' && el.offsetParent !== null
    );
    if (heading) heading.scrollIntoView({ block: 'start' });
  });
  await page.mouse.move(720, 420);
  await page.mouse.wheel({ deltaY: 1500 });
  await sleep(300);
  const desktopJourneyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (desktopJourneyOverflow) failures.push('Jornada tem rolagem horizontal no desktop');
  await page.screenshot({ path: path.join(SHOT, 'qa-desktop-jornada.png') });
  await tapText('Afirmações');
  await sleep(500);
  const desktopAffirmationsOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  if (desktopAffirmationsOverflow) failures.push('Afirmações tem rolagem horizontal no desktop');
  const desktopAffirmationsText = await page.evaluate(() => document.body.innerText);
  if (!desktopAffirmationsText.includes('Dos seus sonhos')) {
    failures.push('deck pessoal sumiu em Afirmações no desktop');
  }
  await page.screenshot({ path: path.join(SHOT, 'qa-desktop-afirmacoes.png') });
  await tapText('Manifestar');
  await sleep(500);
  await tapText('Meu caminho');
  await sleep(700);
  const desktopManifestOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (desktopManifestOverflow) failures.push('Manifestação tem rolagem horizontal no desktop');
  await page.screenshot({ path: path.join(SHOT, 'qa-desktop-manifestacao.png') });

  if (runtimeErrors.length) failures.push(`erros no navegador: ${runtimeErrors.slice(0, 2).join(' | ')}`);

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
