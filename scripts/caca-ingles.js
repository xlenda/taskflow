// Caça-inglês: percorre o app EM PRODUÇÃO com idioma PT e captura TODO o texto
// visível de cada tela, apontando qualquer palavra que seja inglesa.
// Diferente do verify-app-pt (que checa uma lista fixa de frases), este script
// não sabe o que procurar — ele lê tudo e denuncia o que não é português.
// Uso: node scripts/caca-ingles.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT = path.join(__dirname, 'e2e-shots');
fs.mkdirSync(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Palavras inglesas comuns em UI. Só marcamos palavra INTEIRA, e ignoramos as
// que também existem/são aceitas em português (ex.: "app", "streak" não).
const INGLES = new RegExp(
  '\\b(' +
    [
      'the','your','you','my','me','and','or','of','for','with','from','this','that','these','those',
      'is','are','was','were','be','been','have','has','had','do','does','did','will','would','can','could',
      'day','days','week','weeks','month','today','yesterday','tomorrow','morning','night',
      'share','save','saved','saving','delete','remove','edit','done','start','started','finish','finished',
      'settings','profile','account','home','back','next','previous','close','open','continue','skip',
      'welcome','hello','affirmation','affirmations','vision','visions','journey','manifest','manifestation','manifestations',
      'practice','practised','practiced','streak','favourites','favorites','favourite','favorite',
      'listen','listening','play','playing','pause','paused','stop','reset','restore',
      'love','wealth','career','health','confidence','peace','trending','empty','nothing','none',
      'about','more','less','all','new','free','trial','price','week','year','subscribe','subscription',
      'sign','in','out','up','down','yes','no','name','age','city','gender','kids','work','partner',
      'logged','complete','completed','progress','goal','ritual','daily','narrative','story','stories',
      'mood','theme','light','dark','minutes','seconds','left','remaining','sentence','of',
    ].join('|') +
    ')\\b',
  'gi'
);

// Falsos positivos: aparecem no app mas são aceitáveis/nomes próprios.
// "ritual", "normal", "praia" etc. existem nas duas línguas — não são vazamento.
const PERMITIDO = new Set([
  'celeste', 'no', 'a', 'e', 'da', 'do', 'me', 'em', 'para', 'ok', 'in',
  'ritual', 'normal', 'total', 'natural', 'local', 'real',
]);

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem(
      '@stella_state_v2',
      JSON.stringify({
        name: 'Ana', lang: 'pt', onboardingDone: true,
        profile: { name: 'Ana', city: 'Guarulhos', dreamLocation: 'Lisboa', dreamHome: 'Beachfront Villa', obstacle: 'medo', whyMatters: 'paz' },
        manifestations: [], favoriteAffirmations: [], affirmationDates: [], savedVisions: [], visionPlays: [],
      })
    );
  });
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3500);

  const tap = async (texto) => {
    const box = await page.evaluate((t) => {
      const el = [...document.querySelectorAll('div, span')].find(
        (e) => e.children.length === 0 && e.textContent.trim() === t && e.offsetParent !== null
      );
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, texto);
    if (!box) return false;
    await page.mouse.click(box.x, box.y);
    await sleep(1800);
    return true;
  };

  const capturar = async (nome) => {
    const txt = await page.evaluate(() => document.body.innerText);
    const achados = new Map();
    let m;
    INGLES.lastIndex = 0;
    while ((m = INGLES.exec(txt)) !== null) {
      const p = m[0].toLowerCase();
      if (PERMITIDO.has(p)) continue;
      // contexto: 40 chars ao redor, ajuda a achar a frase no código
      const ini = Math.max(0, m.index - 30);
      const ctx = txt.slice(ini, m.index + 35).replace(/\n/g, ' ');
      if (!achados.has(p)) achados.set(p, ctx);
    }
    await page.screenshot({ path: path.join(SHOT, `ingles-${nome}.png`) });
    return achados;
  };

  const relatorio = {};
  const telas = [
    { nome: 'home', ir: async () => tap('Manifestar') },
    { nome: 'visoes', ir: async () => tap('Visões') },
    { nome: 'afirmacoes', ir: async () => tap('Afirmações') },
    { nome: 'jornada', ir: async () => tap('Jornada') },
  ];

  for (const t of telas) {
    await t.ir();
    relatorio[t.nome] = await capturar(t.nome);
  }

  // telas internas: abrir uma visão (player) e criar/abrir uma manifestação
  await tap('Visões');
  const abriuVisao = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div')].filter((e) => e.offsetParent !== null && e.getBoundingClientRect().height > 120 && e.getBoundingClientRect().width > 200);
    if (!cards.length) return false;
    const r = cards[Math.min(2, cards.length - 1)].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (abriuVisao && abriuVisao.x) {
    await page.mouse.click(abriuVisao.x, abriuVisao.y);
    await sleep(2200);
    relatorio.player = await capturar('player');
  }

  await tap('Manifestar');
  const input = await page.evaluate(() => {
    const el = [...document.querySelectorAll('input')].find((e) => e.offsetParent !== null);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (input) {
    await page.mouse.click(input.x, input.y);
    await page.keyboard.type('um apartamento na praia', { delay: 15 });
    await page.keyboard.press('Enter');
    await sleep(2600);
    relatorio.manifestacao = await capturar('manifestacao');
  }

  await browser.close();

  let total = 0;
  console.log('=== CAÇA-INGLÊS ===');
  for (const [tela, achados] of Object.entries(relatorio)) {
    if (!achados.size) {
      console.log(`${tela}: limpo`);
      continue;
    }
    total += achados.size;
    console.log(`\n${tela}: ${achados.size} suspeitas`);
    for (const [palavra, ctx] of achados) console.log(`  "${palavra}"  →  …${ctx}…`);
  }
  console.log(`\ntotal de suspeitas: ${total}`);
  process.exit(total > 0 ? 1 : 0);
})().catch((e) => {
  console.error('ERRO:', String(e).slice(0, 300));
  process.exit(2);
});
