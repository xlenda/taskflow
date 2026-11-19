// E2E dos anúncios do site no servidor local (TARGET_URL), cada cenário com perfil limpo (usuária NOVA):
//  - iPhone 390x844 com user agent de iPhone, chegando de um anúncio (?fbclid): selo da App Store nas boas-vindas
//    e aviso de cookies (sem cobrir o "Continuar"); antes do aceite nenhuma requisição à Meta/Google; depois do
//    aceite o pixel carrega e o PageView leva o clique do anúncio (fbc); o toque no selo abre a ficha e manda
//    AppStoreClick; o cadastro inteiro termina com UM Lead; o selo aparece discreto no fim da Home; nenhum evento
//    leva o que a pessoa digitou.
//  - iPhone que já aceitou e volta por outro anúncio: sem aviso, PageView na abertura com o clique novo.
//  - Android 412x915: sem selo; Recusar fecha o aviso, nada da Meta/Google, e a recusa vale depois do F5.
//  - Android 320x480: o "Continuar" inteiro acima do aviso.
//  - Computador em inglês: sem selo e aviso em inglês.
// A CSP do vercel.json vai no documento, como na Vercel, e qualquer violação reprova. Os eventos para
// www.facebook.com são respondidos aqui (nunca chegam à Meta) e a App Store nunca é aberta de verdade.
// Uso: TARGET_URL=http://127.0.0.1:4181 node scripts/e2e-anuncios-site.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const TARGET = (process.env.TARGET_URL || 'http://127.0.0.1:4181').replace(/\/$/, '');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOTS = path.join(__dirname, 'e2e-shots');
const APP_STORE_URL = 'https://apps.apple.com/br/app/id6833663415?ct=site_celeste&mt=8';
const CSP = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'))
  .headers.find((entry) => entry.source === '/(.*)')
  .headers.find((entry) => entry.key === 'Content-Security-Policy').value;
const AD_HOST = /(^|\.)(facebook\.(com|net)|google\.com(\.br)?|googletagmanager\.com|googleadservices\.com|doubleclick\.net|googlesyndication\.com|google-analytics\.com)$/;
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
// O que a pessoa digita no cadastro: nenhum evento de anúncio pode levar isto.
const TYPED = ['Zuleica', 'Paranapiacaba', 'Cartografa de nuvens', 'Reciprocidade serena', 'Ondina'];

fs.mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = (message) => {
  throw new Error(message);
};

const visibleLeafFn = `
  (t) => [...document.querySelectorAll('div, span, button, a')].find((e) => {
    if (e.children.length !== 0 || e.textContent.trim() !== t || e.offsetParent === null) return false;
    let n = e;
    for (let i = 0; i < 8 && n; i++) {
      const st = getComputedStyle(n);
      if (st.visibility === 'hidden' || parseFloat(st.opacity) < 0.5) return false;
      n = n.parentElement;
    }
    return true;
  }) || null
`;

async function waitAndClick(page, text, timeout = 30000) {
  await page.waitForFunction(`(${visibleLeafFn})(${JSON.stringify(text)}) !== null`, { timeout, polling: 300 });
  await page.evaluate(`(${visibleLeafFn})(${JSON.stringify(text)}).scrollIntoView({ block: 'center' })`);
  await sleep(250);
  const box = await page.evaluate(
    `(() => { const r = (${visibleLeafFn})(${JSON.stringify(text)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`
  );
  await page.mouse.click(box.x, box.y);
  console.log(`  [click] ${text}`);
}

async function waitForText(page, fragment, timeout = 30000) {
  await page.waitForFunction(
    `[...document.querySelectorAll('div')].some((e) => e.offsetParent !== null && e.textContent.includes(${JSON.stringify(fragment)}))`,
    { timeout, polling: 300 }
  );
}

async function clickTestId(page, testId, timeout = 30000) {
  const selector = `[data-testid="${testId}"]`;
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.$eval(selector, (element) => element.scrollIntoView({ block: 'center' }));
  await sleep(180);
  await page.click(selector);
  console.log(`  [click] ${testId}`);
}

async function pressTestId(page, testId) {
  const selector = `[data-testid="${testId}"]`;
  await page.waitForSelector(selector, { visible: true, timeout: 30000 });
  await page.focus(selector);
  await page.keyboard.press('Enter');
  console.log(`  [enter] ${testId}`);
}

async function typeAnswer(page, text) {
  await page.waitForFunction(`[...document.querySelectorAll('input, textarea')].some((e) => e.offsetParent !== null)`, {
    timeout: 20000,
    polling: 200,
  });
  await sleep(300);
  const box = await page.evaluate(() => {
    const r = [...document.querySelectorAll('input, textarea')].find((e) => e.offsetParent !== null).getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.keyboard.type(text, { delay: 20 });
  await page.keyboard.press('Enter');
  console.log(`  [type] ${text}`);
}

// Abre um navegador limpo, aplica a CSP de produção no documento e anota cada requisição de anúncio.
async function openScenario({ lang, viewport, userAgent }) {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', `--lang=${lang}`, '--host-resolver-rules=MAP apps.apple.com ~NOTFOUND'],
  });
  const page = await browser.newPage();
  if (userAgent) await page.setUserAgent(userAgent);
  await page.setViewport(viewport);
  const ctx = { browser, page, phase: 'antes-do-aceite', ads: [], errors: [], popups: [] };
  browser.on('targetcreated', (target) => {
    if (target.opener() && target.url() !== 'about:blank') ctx.popups.push(target.url());
    else if (target.opener()) target.page().then((popup) => popup && popup.on('framenavigated', (frame) => ctx.popups.push(frame.url())));
  });
  await page.evaluateOnNewDocument(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__csp.push(`${event.violatedDirective} ${event.blockedURI}`)
    );
  });
  page.on('pageerror', (error) => ctx.errors.push(String(error)));
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) ctx.errors.push(`CSP: ${message.text()}`);
  });
  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    const url = new URL(request.url());
    if (AD_HOST.test(url.hostname)) {
      ctx.ads.push({ url: request.url(), body: request.postData() || '', phase: ctx.phase, host: url.hostname });
    }
    try {
      if (url.hostname === 'www.facebook.com') {
        await request.respond({ status: 200, contentType: 'image/gif', body: GIF });
      } else if (request.isNavigationRequest() && url.origin === TARGET && request.frame() === page.mainFrame()) {
        const response = await fetch(request.url());
        const headers = Object.fromEntries(response.headers.entries());
        headers['content-security-policy'] = CSP;
        await request.respond({ status: response.status, headers, body: Buffer.from(await response.arrayBuffer()) });
      } else {
        await request.continue();
      }
    } catch (_error) {}
  });
  return ctx;
}

const events = (ctx, name) =>
  ctx.ads.filter((entry) => entry.host === 'www.facebook.com' && new URL(entry.url).searchParams.get('ev') === name);

async function cspViolations(ctx) {
  const inPage = await ctx.page.evaluate(() => window.__csp || []).catch(() => []);
  return [...inPage, ...ctx.errors.filter((error) => error.startsWith('CSP:'))];
}

async function skipOpening(page) {
  const skip = await page.waitForSelector('[data-testid="celeste-opening-skip"]', { visible: true, timeout: 8000 }).catch(() => null);
  if (skip) await clickTestId(page, 'celeste-opening-skip');
  await page.waitForSelector('[data-testid="ad-consent-banner"]', { visible: true, timeout: 30000 });
}

// O aviso fica no rodapé sem cobrir nada: o "Continuar" das boas-vindas precisa estar inteiro acima dele.
async function assertNotCovered(page, text) {
  const layout = await page.evaluate(
    `(() => {
      const button = (${visibleLeafFn})(${JSON.stringify(text)});
      const banner = document.querySelector('[data-testid="ad-consent-banner"]');
      if (!button || !banner) return null;
      const b = button.getBoundingClientRect();
      const top = banner.getBoundingClientRect().top;
      const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return { bottom: b.bottom, bannerTop: top, clickable: !!hit && !banner.contains(hit) };
    })()`
  );
  if (!layout || layout.bottom > layout.bannerTop + 1 || !layout.clickable) {
    fail(`o aviso cobre "${text}": ${JSON.stringify(layout)}`);
  }
}

async function badgeHref(page, testId) {
  return page.$eval(`[data-testid="${testId}"]`, (element) => ({
    tag: element.tagName,
    href: element.getAttribute('href'),
    target: element.getAttribute('target'),
    label: element.getAttribute('aria-label'),
    height: element.querySelector('img') ? element.querySelector('img').getBoundingClientRect().height : 0,
    visible: element.getBoundingClientRect().height > 0,
  }));
}

async function iphone() {
  console.log('\n[iPhone 390x844 · chegando de um anúncio]');
  const ctx = await openScenario({
    lang: 'pt-BR',
    userAgent: UA_IPHONE,
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const { page } = ctx;
  try {
    await page.goto(`${TARGET}/?fbclid=E2ECLIQUE123&utm_source=instagram`, { waitUntil: 'networkidle2', timeout: 60000 });
    await skipOpening(page);
    await waitForText(page, 'Crie a vida que você deseja');
    const badge = await badgeHref(page, 'app-store-badge-welcome');
    if (badge.tag !== 'A' || badge.href !== APP_STORE_URL || badge.target !== '_blank') fail(`selo das boas-vindas errado: ${JSON.stringify(badge)}`);
    if (badge.label !== 'Baixar na App Store' || badge.height < 40) fail(`selo pequeno ou sem rótulo: ${JSON.stringify(badge)}`);
    await sleep(1500);
    await assertNotCovered(page, 'Continuar');
    if (ctx.ads.length) fail(`requisição de anúncio ANTES do aceite: ${ctx.ads.map((entry) => entry.url).join(', ')}`);
    if (/fbclid/.test(page.url())) console.log('  (a URL ainda tem o fbclid)');
    else console.log(`  a navegação trocou a URL para ${new URL(page.url()).pathname} e tirou o fbclid`);
    await page.screenshot({ path: path.join(SHOTS, 'anuncios-iphone-boas-vindas.png') });

    ctx.phase = 'depois-do-aceite';
    await clickTestId(page, 'ad-consent-accept');
    await page.waitForFunction(() => !document.querySelector('[data-testid="ad-consent-banner"]'), { timeout: 5000 });
    for (let i = 0; i < 40 && !events(ctx, 'PageView').length; i += 1) await sleep(250);
    const pageView = events(ctx, 'PageView');
    if (pageView.length !== 1) fail(`esperava 1 PageView depois do aceite, vieram ${pageView.length}`);
    if (!ctx.ads.some((entry) => entry.url.startsWith('https://connect.facebook.net/en_US/fbevents.js'))) fail('fbevents.js não carregou');
    const pageViewUrl = new URL(pageView[0].url);
    if (pageViewUrl.searchParams.get('id') !== '1822816372332275') fail('PageView com pixel errado');
    if (!/\.E2ECLIQUE123$/.test(pageViewUrl.searchParams.get('fbc') || '')) fail(`o PageView perdeu o clique do anúncio (fbc=${pageViewUrl.searchParams.get('fbc')})`);
    const fbc = (await page.cookies()).find((cookie) => cookie.name === '_fbc');
    if (!fbc || !fbc.value.endsWith('.E2ECLIQUE123')) fail(`cookie _fbc sem o clique do anúncio: ${fbc && fbc.value}`);
    console.log(`  PageView ok (pixel 1822816372332275) com o clique do anúncio: fbc=${pageViewUrl.searchParams.get('fbc')}`);
    await page.screenshot({ path: path.join(SHOTS, 'anuncios-iphone-aceito.png') });

    await clickTestId(page, 'app-store-badge-welcome');
    for (let i = 0; i < 20 && !events(ctx, 'AppStoreClick').length; i += 1) await sleep(250);
    if (events(ctx, 'AppStoreClick').length !== 1) fail('o toque no selo não mandou AppStoreClick');
    for (let i = 0; i < 20 && !ctx.popups.length; i += 1) await sleep(250);
    if (!ctx.popups.includes(APP_STORE_URL)) fail(`o selo não abriu a ficha da App Store: ${ctx.popups.join(', ')}`);
    for (const opened of await ctx.browser.pages()) if (opened !== page) await opened.close();
    console.log('  AppStoreClick ok e a ficha abriu numa aba nova');

    // O cadastro inteiro, como o E2E de produção (scripts/e2e-prod.js).
    await waitAndClick(page, 'Continuar');
    await waitForText(page, 'funciona melhor com Notificações');
    await waitAndClick(page, 'Continuar');
    await page.waitForSelector('[data-testid="onboarding-question-area"]', { visible: true, timeout: 30000 });
    await page.click('[data-testid="onboarding-question-area"]');
    await waitForText(page, 'que mude na sua vida');
    await waitAndClick(page, 'Ter mais paz e equilíbrio');
    await waitAndClick(page, 'Continuar');
    await waitForText(page, 'importa tanto');
    await waitAndClick(page, 'Pular');
    await waitForText(page, 'parece estar no seu caminho');
    await waitAndClick(page, 'Outra resposta');
    await typeAnswer(page, TYPED[2]);
    await waitAndClick(page, 'Continuar');
    await waitForText(page, 'como devo te chamar');
    await typeAnswer(page, TYPED[0]);
    await waitForText(page, 'Onde você mora', 30000);
    await typeAnswer(page, TYPED[1]);
    await waitForText(page, 'Quantos anos você tem');
    await waitAndClick(page, '25–34');
    await waitForText(page, 'Qual é o seu gênero');
    await sleep(800);
    await waitAndClick(page, 'Feminino');
    await waitForText(page, 'Qual é a sua sexualidade');
    await waitAndClick(page, 'Bissexual');
    await waitForText(page, 'filhos');
    await sleep(800);
    await waitAndClick(page, 'Não');
    await waitForText(page, 'pessoas mais importantes', 30000);
    await sleep(800);
    await waitAndClick(page, 'Continuar');
    await waitForText(page, 'O que você faz da vida');
    await waitAndClick(page, 'Sou autônomo(a) ou freelancer');
    await waitForText(page, 'Como você se sente em relação ao seu trabalho');
    await sleep(800);
    await waitAndClick(page, 'Estou pronto para algo novo');
    await waitForText(page, 'Qual é o seu estado civil');
    await sleep(800);
    await waitAndClick(page, 'Solteiro(a)');
    await waitForText(page, 'algo do seu passado');
    await waitAndClick(page, 'Pular');
    await waitForText(page, 'o que eu deveria saber para te entender melhor');
    await typeAnswer(page, 'Sou criativa e persistente');
    await waitForText(page, 'Visualizações personalizadas', 30000);
    await sleep(500);
    await waitAndClick(page, 'Continuar');
    await waitForText(page, 'onde você está morando', 40000);
    await waitAndClick(page, 'Na praia ou no litoral');
    await waitForText(page, 'tipo de casa');
    await sleep(1200);
    await waitAndClick(page, 'Vila à Beira-Mar');
    await waitAndClick(page, 'Continuar');
    await waitForText(page, 'Conheça o seu futuro eu', 30000);
    await waitAndClick(page, 'Continuar');
    await waitForText(page, 'que tipo de parceiro(a) você quer atrair', 30000);
    await waitAndClick(page, 'Outra resposta');
    await typeAnswer(page, TYPED[3]);
    await waitAndClick(page, 'Continuar');
    await waitForText(page, 'Existe uma pessoa específica', 30000);
    await sleep(800);
    await waitAndClick(page, 'Sim');
    await waitForText(page, 'nome da pessoa que você está manifestando', 30000);
    await typeAnswer(page, TYPED[4]);
    await waitForText(page, 'SEU TRAÇO CELESTE', 40000);
    await pressTestId(page, 'trace-star-1');
    await waitForText(page, '1 de 3 estrelas acesas');
    await clickTestId(page, 'trace-star-2');
    await waitForText(page, '2 de 3 estrelas acesas');
    await clickTestId(page, 'trace-star-3');
    await waitForText(page, 'Sua Cena-Âncora está aberta');
    await sleep(1000);
    await waitAndClick(page, 'Guardar minha Cena-Âncora');
    await waitForText(page, 'Um começo transparente', 40000);
    if (events(ctx, 'Lead').length) fail('Lead antes do fim do cadastro');
    await waitAndClick(page, 'Entrar no Celeste');
    await page.waitForSelector('[data-testid="celeste-mascot-home"]', { visible: true, timeout: 20000 });
    await sleep(2500);
    const leads = events(ctx, 'Lead');
    if (leads.length !== 1) fail(`esperava 1 Lead no "Entrar no Celeste", vieram ${leads.length}`);
    console.log('  Lead ok: um só, no "Entrar no Celeste"');

    const home = await badgeHref(page, 'app-store-badge-home');
    if (home.href !== APP_STORE_URL || home.height < 40) fail(`selo da Home errado: ${JSON.stringify(home)}`);
    await page.$eval('[data-testid="app-store-badge-home"]', (element) => element.scrollIntoView({ block: 'end' }));
    await sleep(600);
    await page.screenshot({ path: path.join(SHOTS, 'anuncios-iphone-home.png') });

    const allEvents = ctx.ads.filter((entry) => entry.host === 'www.facebook.com').map((entry) => new URL(entry.url).searchParams.get('ev'));
    for (const entry of ctx.ads) {
      const haystack = decodeURIComponent(`${entry.url} ${entry.body}`).toLowerCase();
      for (const word of TYPED) if (haystack.includes(word.toLowerCase())) fail(`evento de anúncio levou o que a pessoa digitou (${word}): ${entry.url.slice(0, 160)}`);
      if (/[?&]ud\[/.test(entry.url) || /ud\[/.test(entry.body)) fail(`evento com dado de pessoa (ud[...]): ${entry.url.slice(0, 160)}`);
      if (/cd\[buttonText\]|cd\[buttonFeatures\]|SubscribedButtonClick/.test(decodeURIComponent(entry.url))) fail('clique de botão automático do pixel vazou');
    }
    if (ctx.ads.some((entry) => /google|doubleclick|googletagmanager/.test(entry.host))) fail('a tag do Google carregou com o ID vazio');
    const violations = await cspViolations(ctx);
    if (violations.length) fail(`violação de CSP: ${violations.join(' | ')}`);
    if (ctx.errors.length) fail(`erro na página: ${ctx.errors[0]}`);
    console.log(`  eventos enviados à Meta: ${allEvents.join(', ')} · ${ctx.ads.length} requisições de anúncio, 0 antes do aceite, nada digitado nelas, 0 violações de CSP`);
  } finally {
    await ctx.browser.close();
  }
}

async function android() {
  console.log('\n[Android 412x915 · recusa]');
  const ctx = await openScenario({
    lang: 'pt-BR',
    userAgent: UA_ANDROID,
    viewport: { width: 412, height: 915, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const { page } = ctx;
  try {
    await page.goto(`${TARGET}/?fbclid=E2EANDROID`, { waitUntil: 'networkidle2', timeout: 60000 });
    await skipOpening(page);
    await waitForText(page, 'Crie a vida que você deseja');
    if (await page.$('[data-testid="app-store-badge-welcome"]')) fail('o Android não pode ver o selo da App Store');
    const banner = await page.$eval('[data-testid="ad-consent-banner"]', (element) => element.innerText);
    if (!/cookies de anúncio da Meta e do Google/.test(banner) || !/Recusar/.test(banner) || !/Aceitar/.test(banner)) fail(`aviso em PT errado: ${banner}`);
    const policy = await page.$eval('[data-testid="ad-consent-policy"]', (element) => element.getAttribute('href'));
    if (policy !== '/privacidade#cookies') fail(`link da política errado: ${policy}`);
    await sleep(800);
    await assertNotCovered(page, 'Continuar');
    await page.screenshot({ path: path.join(SHOTS, 'anuncios-android-boas-vindas.png') });
    await clickTestId(page, 'ad-consent-decline');
    await page.waitForFunction(() => !document.querySelector('[data-testid="ad-consent-banner"]'), { timeout: 5000 });
    const saved = await page.evaluate(() => localStorage.getItem('@celeste_ad_consent_v1'));
    if (saved !== 'denied') fail(`recusa não ficou guardada: ${saved}`);
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    const skip = await page.waitForSelector('[data-testid="celeste-opening-skip"]', { visible: true, timeout: 8000 }).catch(() => null);
    if (skip) await clickTestId(page, 'celeste-opening-skip');
    await waitForText(page, 'Crie a vida que você deseja');
    await sleep(1500);
    if (await page.$('[data-testid="ad-consent-banner"]')) fail('o aviso voltou depois de recusar');
    if (ctx.ads.length) fail(`requisição de anúncio com recusa: ${ctx.ads.map((entry) => entry.url).join(', ')}`);
    await page.screenshot({ path: path.join(SHOTS, 'anuncios-android-recusado.png') });
    const violations = await cspViolations(ctx);
    if (violations.length) fail(`violação de CSP: ${violations.join(' | ')}`);
    console.log('  sem selo, aviso em PT, recusa guardada e nenhuma requisição à Meta/Google (antes e depois do F5)');
  } finally {
    await ctx.browser.close();
  }
}

// Quem aceitou numa visita anterior e volta por outro anúncio: o pixel carrega na abertura e o PageView leva o
// clique novo, mesmo com o app trocando a URL antes de o script baixar.
async function returningFromAd() {
  console.log('\n[iPhone · já aceitou antes e volta por outro anúncio]');
  const ctx = await openScenario({
    lang: 'pt-BR',
    userAgent: UA_IPHONE,
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const { page } = ctx;
  try {
    await page.evaluateOnNewDocument(() => localStorage.setItem('@celeste_ad_consent_v1', 'granted'));
    ctx.phase = 'aceite-anterior';
    await page.goto(`${TARGET}/?fbclid=E2EVOLTA456`, { waitUntil: 'networkidle2', timeout: 60000 });
    for (let i = 0; i < 40 && !events(ctx, 'PageView').length; i += 1) await sleep(250);
    const pageView = events(ctx, 'PageView');
    if (pageView.length !== 1) fail(`esperava 1 PageView na abertura, vieram ${pageView.length}`);
    const fbc = new URL(pageView[0].url).searchParams.get('fbc') || '';
    if (!fbc.endsWith('.E2EVOLTA456')) fail(`o retorno por anúncio perdeu o clique (fbc=${fbc}, URL agora ${page.url()})`);
    if (await page.$('[data-testid="ad-consent-banner"]')) fail('quem já aceitou não vê o aviso de novo');
    const violations = await cspViolations(ctx);
    if (violations.length) fail(`violação de CSP: ${violations.join(' | ')}`);
    console.log(`  sem aviso, PageView na abertura com o clique novo (fbc=${fbc}); URL agora ${new URL(page.url()).pathname}`);
  } finally {
    await ctx.browser.close();
  }
}

// Celular pequeno: o aviso ocupa mais da tela, e o "Continuar" precisa continuar inteiro acima dele.
async function smallAndroid() {
  console.log('\n[Android pequeno 320x480]');
  const ctx = await openScenario({
    lang: 'pt-BR',
    userAgent: UA_ANDROID,
    viewport: { width: 320, height: 480, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const { page } = ctx;
  try {
    await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 60000 });
    await skipOpening(page);
    await waitForText(page, 'Crie a vida que você deseja');
    await sleep(800);
    await assertNotCovered(page, 'Continuar');
    await page.screenshot({ path: path.join(SHOTS, 'anuncios-android-320x480.png') });
    if (ctx.ads.length) fail('requisição de anúncio antes do aceite no celular pequeno');
    console.log('  "Continuar" inteiro e clicável acima do aviso');
  } finally {
    await ctx.browser.close();
  }
}

async function desktopEnglish() {
  console.log('\n[Computador em inglês]');
  const ctx = await openScenario({ lang: 'en-US', viewport: { width: 1280, height: 800 } });
  const { page } = ctx;
  try {
    await page.goto(TARGET, { waitUntil: 'networkidle2', timeout: 60000 });
    await skipOpening(page);
    await waitForText(page, 'Create the life you desire');
    if (await page.$('[data-testid="app-store-badge-welcome"]')) fail('o computador não pode ver o selo da App Store');
    const banner = await page.$eval('[data-testid="ad-consent-banner"]', (element) => element.innerText);
    if (!/Meta and Google ad cookies/.test(banner) || !/Decline/.test(banner) || !/Accept/.test(banner)) fail(`aviso em EN errado: ${banner}`);
    const policy = await page.$eval('[data-testid="ad-consent-policy"]', (element) => element.getAttribute('href'));
    if (policy !== '/privacy#cookies') fail(`link da política em inglês errado: ${policy}`);
    await sleep(1000);
    if (ctx.ads.length) fail('requisição de anúncio antes do aceite no computador');
    await page.screenshot({ path: path.join(SHOTS, 'anuncios-desktop-en.png') });
    await page.goto(`${TARGET}/privacidade#cookies`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.$eval('#cookies', (element) => element.scrollIntoView({ block: 'start' }));
    await sleep(300);
    await page.screenshot({ path: path.join(SHOTS, 'anuncios-politica-cookies.png') });
    const violations = await cspViolations(ctx);
    if (violations.length) fail(`violação de CSP: ${violations.join(' | ')}`);
    console.log('  sem selo, aviso em inglês com link para /privacy#cookies e nada carregado');
  } finally {
    await ctx.browser.close();
  }
}

(async () => {
  const health = await fetch(`${TARGET}/`).catch(() => null);
  if (!health || !health.ok) fail(`servidor local fora do ar em ${TARGET} (suba com scripts/serve-export.js)`);
  await android();
  await smallAndroid();
  await desktopEnglish();
  await iphone();
  await returningFromAd();
  console.log('\n✅ E2E dos anúncios do site passou (iPhone, retorno por anúncio, Android, celular pequeno e computador).');
})().catch((error) => {
  console.error(`❌ E2E dos anúncios FALHOU: ${String(error && error.message ? error.message : error).slice(0, 600)}`);
  process.exit(1);
});
