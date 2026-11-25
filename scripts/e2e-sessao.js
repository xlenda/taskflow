// Sessão de 7 minutos de ponta a ponta no navegador (390x844), com estado semeado: cartão da Home ->
// sessão -> cartão final -> registrar -> Home em "feita hoje". Roda contra um export local:
//   npx expo export -p web --clear && node scripts/e2e-sessao.js    (sobe o servidor de dist/ sozinho)
//   TARGET_URL=http://127.0.0.1:4317 node scripts/e2e-sessao.js     (servidor já de pé)
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const STORAGE_KEY = '@stella_state_v2';
const SHOT_DIR = path.join(ROOT, 'output', 'sessao-e2e'); // fora do git
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 1 };
const NOTE = 'Vi um sinal no caminho.';
const CLOUD_CONSENT_VERSION = 'celeste-cloud-processors-v2'; // constants/cloudConsent.js (site)
const AUDIO_FIXTURE = fs.readFileSync(path.join(ROOT, 'assets', 'audio', 'previews', 'luma-pt.wav'));
const jwtPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
// Sessão anônima de mentira para a voz da Celeste (o pedido de áudio leva o token dela); nada sai para a rede.
const mockSession = () => ({
  access_token: `${jwtPart({ alg: 'none', typ: 'JWT' })}.${jwtPart({ aud: 'authenticated', role: 'authenticated', sub: '00000000-0000-4000-8000-000000000001', exp: 4102444800 })}.e2e`,
  token_type: 'bearer',
  expires_in: 2147483647,
  expires_at: 4102444800,
  refresh_token: 'celeste-sessao-e2e-refresh-token',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_anonymous: true,
  },
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const tid = (id) => `[data-testid="${id}"]`;

function fail(message) {
  throw new Error(message);
}

const localDay = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Usuária com Cena-Âncora (a carga do app monta as 6 afirmações dela) que praticou ontem.
const seedState = () => ({
  lang: 'pt',
  name: 'Teste',
  onboardingDone: true,
  profile: {},
  anchorSceneId: 'm-sessao',
  manifestations: [
    {
      id: 'm-sessao',
      origin: 'onboarding-anchor',
      title: 'Minha casa clara',
      category: 'Peace',
      lang: 'pt',
      story: 'Eu acordo na minha casa clara. A luz entra pela janela e eu respiro em paz.',
      affirmation: 'Eu escolho paz.',
      sessions: [localDay(-1)],
      evidence: [],
    },
  ],
  // O despertar comum dela toca a própria Cena-Âncora (passo 8).
  morningRitual: { wakeSequence: ['anchor:m-sessao'] },
  favoriteAffirmations: [],
  savedVisions: [],
  visionPlays: [],
  affirmationDates: [],
});

async function startServer() {
  const dir = path.join(ROOT, process.env.EXPORT_DIR || 'dist');
  // O cache do Metro guarda o EXPO_PUBLIC_ da prévia do paywall (e2e-paywall-previa): export sem --clear sai com o paywall.
  const jsDir = path.join(dir, '_expo', 'static', 'js', 'web');
  if (fs.existsSync(jsDir) && fs.readdirSync(jsDir).some((f) => fs.readFileSync(path.join(jsDir, f), 'utf8').includes('$rc_monthly'))) {
    fail(`o export em ${dir} saiu com a prévia do paywall ligada (cache do Metro): rode npx expo export -p web --clear`);
  }
  const port = 4300 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, [path.join(__dirname, 'serve-export.js'), dir, String(port)], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve);
    child.once('exit', () => reject(new Error(`export local ausente em ${dir}: rode npx expo export -p web`)));
  });
  return { url: `http://127.0.0.1:${port}`, stop: () => child.kill() };
}

// O mesmo testID pode existir numa tela escondida da pilha (o despertar atrás da sessão): vale o que está à vista.
const shown = (page, id) =>
  page.evaluate((sel) => [...document.querySelectorAll(sel)].some((node) => node.getClientRects().length > 0), tid(id));

async function click(page, id, timeout = 20000) {
  const handle = await page.waitForFunction(
    (sel) => [...document.querySelectorAll(sel)].find((node) => node.getClientRects().length > 0) || false,
    { timeout, polling: 100 },
    tid(id)
  ).catch(() => fail(`"${id}" não apareceu na tela`));
  await handle.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await sleep(150);
  await handle.click();
}

// Três estrelas e "Próximo" até o cartão final (`end`).
async function playToEnd(page, end) {
  for (const star of [1, 2, 3]) await click(page, `trace-star-${star}`);
  for (let step = 0; step < 40 && !(await shown(page, end)); step += 1) {
    if (await shown(page, 'wake-next')) await click(page, 'wake-next');
    await sleep(200);
  }
  if (!(await shown(page, end))) fail(`"${end}" não apareceu depois de tocar tudo`);
}

// Começou do começo: estrelas na tela e nenhum cartão final à vista.
async function assertFreshStart(page, where) {
  await page.waitForFunction(
    (sel) => [...document.querySelectorAll(sel)].some((node) => node.getClientRects().length > 0),
    { timeout: 10000 },
    tid('trace-star-1')
  ).catch(() => fail(`${where}: não começou pelas estrelas`));
  for (const card of ['session-complete', 'wake-complete']) {
    if (await shown(page, card)) fail(`${where}: abriu direto no cartão final (${card}), sem nada tocado`);
  }
}

// Medida, não calculada: a largura que o documento realmente ocupa.
async function assertWidth(page, where, expected = VIEWPORT.width) {
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  if (width !== expected) fail(`${where}: largura do documento ${width}, esperado ${expected}`);
}

const screenText = (page) =>
  page.evaluate(() => {
    const screen = [...document.querySelectorAll('[data-testid="wake-sequence-screen"]')].find((node) => node.getClientRects().length > 0);
    return screen ? screen.innerText : '';
  });

const pathOf = (page) => new URL(page.url()).pathname;
// Semeia o estado com o app parado (numa página estática do mesmo endereço): com o app de pé, uma gravação dele
// ainda na fila poderia passar por cima da semente.
async function seed(page, base, value) {
  await page.goto(`${base}/legal.css`, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate((key, state) => localStorage.setItem(key, JSON.stringify(state)), STORAGE_KEY, value);
}
const savedState = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{}'), STORAGE_KEY);

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const server = process.env.TARGET_URL ? { url: process.env.TARGET_URL, stop() {} } : await startServer();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--lang=pt-BR', '--autoplay-policy=no-user-gesture-required'],
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.setViewport(VIEWPORT);
    await page.goto(server.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate((key, value) => localStorage.setItem(key, JSON.stringify(value)), STORAGE_KEY, seedState());
    // Quem já usa o app já respondeu o aviso de cookies do site (ele tem portão próprio e cobriria as capturas).
    await page.evaluate(() => localStorage.setItem('@celeste_ad_consent_v1', 'denied'));
    await page.goto(`${server.url}/`, { waitUntil: 'networkidle2', timeout: 60000 });

    // 1. Home: o cartão da sessão está na primeira tela, sem rolar, e vem antes do da Cena-Âncora.
    await page.waitForSelector(tid('open-session'), { visible: true, timeout: 30000 });
    await page.waitForSelector(tid('open-anchor-scene'), { visible: true, timeout: 30000 });
    const home = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="open-session"]');
      const anchor = document.querySelector('[data-testid="open-anchor-scene"]');
      const rect = card.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        height: window.innerHeight,
        anchorTop: anchor.getBoundingClientRect().top,
        before: !!(card.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING),
        reachable: !!hit && card.contains(hit),
        text: card.innerText,
        label: card.getAttribute('aria-label') || '',
      };
    });
    if (home.top < 0 || home.bottom > home.height || home.left < 0 || home.right > VIEWPORT.width || !home.reachable) {
      fail(`cartão da sessão fora da primeira tela: ${JSON.stringify(home)}`);
    }
    if (!home.before || home.bottom > home.anchorTop) fail(`cartão da sessão não vem antes do da Cena-Âncora: ${JSON.stringify(home)}`);
    if (!/7 min/.test(home.text)) fail(`cartão sem "7 min": ${home.text}`);
    if (!/dia [1-7] de 7/i.test(home.text)) fail(`cartão sem o dia da jornada: ${home.text}`);
    if (!/(^|\n)1(\n|$)/.test(home.text)) fail(`cartão sem a ofensiva em número (1): ${JSON.stringify(home.text)}`);
    if (/Feita hoje/.test(home.text)) fail('cartão já diz "Feita hoje" antes da sessão');
    await assertWidth(page, 'Home');
    await page.screenshot({ path: path.join(SHOT_DIR, '01-home.png') });

    // 2. ⓘ abre a explicação e não abre a sessão.
    await click(page, 'session-info');
    await page.waitForSelector(tid('session-info-sheet'), { visible: true, timeout: 10000 });
    const info = await page.$eval(tid('session-info-sheet'), (el) => el.innerText);
    if (!/fone/i.test(info) || !/7 minutos/.test(info)) fail(`explicação incompleta: ${info}`);
    if (pathOf(page) !== '/') fail(`ⓘ navegou para ${pathOf(page)}`);
    await assertWidth(page, 'explicação');
    await sleep(400); // a explicação entra em fade
    const closeReachable = await page.$eval(tid('session-info-close'), (button) => {
      const rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return rect.bottom <= window.innerHeight && !!hit && button.contains(hit);
    });
    if (!closeReachable) fail('o botão de fechar a explicação está coberto ou fora da tela');
    await page.screenshot({ path: path.join(SHOT_DIR, '02-info.png') });
    // Tocar dentro da folha (num texto) não fecha; tocar no fundo fecha; o botão também.
    const inside = await page.$eval(tid('session-info-sheet'), (el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + 30 };
    });
    await page.mouse.click(inside.x, inside.y);
    await sleep(500);
    if (!(await shown(page, 'session-info-sheet'))) fail('tocar dentro da explicação fechou a explicação');
    const sheetLabel = await page.$eval(tid('session-info-sheet'), (el) => {
      const button = el.closest('[role="button"]');
      return button ? button.getAttribute('aria-label') || 'botão' : '';
    });
    if (sheetLabel) fail(`a explicação está dentro de um botão ("${sheetLabel}"): o leitor de tela só lê o botão`);
    await page.mouse.click(6, 6);
    await page.waitForSelector(tid('session-info-sheet'), { hidden: true, timeout: 10000 })
      .catch(() => fail('tocar no fundo não fechou a explicação'));
    await click(page, 'session-info');
    await page.waitForSelector(tid('session-info-sheet'), { visible: true, timeout: 10000 });
    await sleep(400);
    await click(page, 'session-info-close');
    await page.waitForSelector(tid('session-info-sheet'), { hidden: true, timeout: 10000 });

    // 3. Um toque abre a sessão (no endereço da sessão, não no despertar comum).
    await click(page, 'open-session');
    await page.waitForSelector(tid('wake-sequence-screen'), { visible: true, timeout: 20000 });
    if (pathOf(page) !== '/despertar/ouvir/session') fail(`o cartão abriu ${pathOf(page)}, esperado /despertar/ouvir/session`);
    await page.waitForFunction(() => document.body.innerText.includes('Sua sessão de 7 minutos'), { timeout: 10000 });

    // 4. Três estrelas, depois "Próximo" até o cartão final.
    for (const star of [1, 2, 3]) await click(page, `trace-star-${star}`);
    await page.waitForSelector(tid('wake-player'), { visible: true, timeout: 15000 });
    await assertWidth(page, 'sessão tocando');
    await page.screenshot({ path: path.join(SHOT_DIR, '03-sessao.png') });
    for (let step = 0; step < 30 && !(await page.$(tid('session-complete'))); step += 1) {
      await page.click(tid('wake-next')).catch(() => {});
      await sleep(250);
    }
    await page.waitForSelector(tid('session-complete'), { visible: true, timeout: 10000 });

    // 5. Uma linha e um toque registram o dia.
    await page.type(tid('session-note'), NOTE);
    await page.screenshot({ path: path.join(SHOT_DIR, '04-cartao-final.png') });
    await click(page, 'session-register');
    await click(page, 'wake-close');

    // 6. De volta à Home: cartão em "feita hoje" e o dia gravado.
    await page.waitForFunction(
      () => {
        const card = [...document.querySelectorAll('[data-testid="open-session"]')].find((node) => node.getClientRects().length);
        return !!card && card.innerText.includes('Feita hoje');
      },
      { timeout: 15000 }
    ).catch(() => fail('a Home não mostrou o cartão em "Feita hoje" depois do registro'));
    if (pathOf(page) !== '/') fail(`fechar a sessão levou a ${pathOf(page)}, esperado a Home`);
    await assertWidth(page, 'Home depois da sessão');
    await page.screenshot({ path: path.join(SHOT_DIR, '05-home-feita.png') });
    const today = localDay();
    const saved = await savedState(page);
    const anchor = (saved.manifestations || []).find((item) => item.id === 'm-sessao') || {};
    if (!(anchor.sessions || []).includes(today)) fail(`sessions sem ${today}: ${JSON.stringify(anchor.sessions)}`);
    if (!(anchor.evidence || []).some((item) => item.text === NOTE)) fail(`evidence sem a linha: ${JSON.stringify(anchor.evidence)}`);
    if (!saved.guidedSession || saved.guidedSession.lastDoneOn !== today) {
      fail(`guidedSession.lastDoneOn = ${JSON.stringify(saved.guidedSession)}, esperado ${today}`);
    }

    // 7. Feita hoje, o toque continua abrindo; o link direto e o caminho antigo do despertar seguem valendo.
    await click(page, 'open-session');
    await page.waitForFunction(() => location.pathname === '/despertar/ouvir/session', { timeout: 10000 });
    await page.goto(`${server.url}/despertar/ouvir/session`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes('Sua sessão de 7 minutos'), { timeout: 20000 })
      .catch(() => fail('/despertar/ouvir/session não abriu a sessão'));
    await page.goto(`${server.url}/despertar/ouvir`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes('Ouvir meu despertar'), { timeout: 20000 })
      .catch(() => fail('/despertar/ouvir deixou de abrir o despertar comum'));

    // 8. O cartão final do despertar comum oferece a sessão, e ela começa do começo: estrelas e primeiro item,
    // nunca o cartão de registrar sem sessão tocada.
    for (const star of [1, 2, 3]) await click(page, `trace-star-${star}`);
    await page.waitForSelector(tid('wake-player'), { visible: true, timeout: 15000 });
    for (let step = 0; step < 30 && !(await page.$(tid('wake-complete'))); step += 1) {
      await page.click(tid('wake-next')).catch(() => {});
      await sleep(250);
    }
    await page.screenshot({ path: path.join(SHOT_DIR, '06-despertar-fim.png') });
    await click(page, 'wake-open-session');
    await page.waitForFunction(() => location.pathname === '/despertar/ouvir/session', { timeout: 10000 });
    await page.waitForSelector(tid('trace-star-1'), { visible: true, timeout: 10000 })
      .catch(() => fail('a sessão aberta pelo fim do despertar não começou pelas estrelas'));
    if (await page.$(tid('session-complete'))) fail('a sessão aberta pelo fim do despertar já mostrou o cartão de registrar');
    for (const star of [1, 2, 3]) await click(page, `trace-star-${star}`);
    await page.waitForSelector(tid('wake-player'), { visible: true, timeout: 15000 });
    const position = await page.$eval(tid('wake-position'), (el) => el.innerText);
    if (!/^1 de 12/i.test(position)) fail(`a sessão aberta pelo fim do despertar começou em "${position}"`);
    if (await page.$(tid('session-complete'))) fail('cartão de registrar apareceu com a sessão no primeiro item');

    // 9. Despertar aberto a frio (lembrete, link, F5): a pilha só tem ele. Fechar no fim volta à Home e o cartão
    // abre a sessão do começo, nunca a tela velha do despertar virada em "sessão completa".
    await page.goto(`${server.url}/despertar/ouvir`, { waitUntil: 'networkidle2', timeout: 60000 });
    await playToEnd(page, 'wake-complete');
    await click(page, 'wake-close');
    await page.waitForFunction(() => location.pathname === '/', { timeout: 10000 })
      .catch(() => fail('fechar o despertar aberto a frio não voltou à Home'));
    await click(page, 'open-session');
    await page.waitForFunction(() => location.pathname === '/despertar/ouvir/session', { timeout: 10000 });
    await assertFreshStart(page, 'sessão depois de um despertar aberto a frio');
    if (!(await screenText(page)).includes('Sua sessão de 7 minutos')) fail('o cartão abriu a tela do despertar, não a da sessão');

    // 10. O caminho inverso: sessão aberta a frio, sair no fim, Meu despertar -> ouvir abre o despertar do começo.
    await page.goto(`${server.url}/despertar/ouvir/session`, { waitUntil: 'networkidle2', timeout: 60000 });
    await playToEnd(page, 'session-complete');
    await click(page, 'wake-back');
    await page.waitForFunction(() => location.pathname === '/', { timeout: 10000 })
      .catch(() => fail('sair da sessão aberta a frio não voltou à Home'));
    await click(page, 'open-affirmation-alarm');
    await click(page, 'wake-listen-now');
    await page.waitForFunction(() => location.pathname === '/despertar/ouvir', { timeout: 10000 });
    await assertFreshStart(page, 'despertar depois de uma sessão aberta a frio');
    if (!(await screenText(page)).includes('Ouvir meu despertar')) fail('"Ouvir agora" abriu a tela da sessão, não a do despertar');

    // 10b. O mesmo link aberto de novo com a sessão parada no cartão final (ela saiu do app ali e tocou no lembrete
    // ou no link outra vez): começa de novo pelas estrelas, sem recarregar a página. O endereço chega pelo linking
    // (popstate numa entrada à frente), o mesmo caminho do toque no lembrete: lê o endereço e despacha a navegação.
    await page.goto(`${server.url}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await click(page, 'open-session');
    await page.waitForFunction(() => location.pathname === '/despertar/ouvir/session', { timeout: 10000 });
    await playToEnd(page, 'session-complete');
    await page.evaluate(() => {
      window.__sameDocument = true; // some se a página recarregar
      history.pushState(history.state, '', '/despertar/ouvir/session?utm_source=lembrete');
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await assertFreshStart(page, 'o mesmo link aberto de novo com a sessão no cartão final');
    if (!(await page.evaluate(() => window.__sameDocument === true))) fail('abrir o link de novo recarregou a página');
    if (!(await screenText(page)).includes('Sua sessão de 7 minutos')) fail('o link aberto de novo não ficou na sessão');
    await sleep(300);
    if (/run=/.test(page.url())) fail(`o run da abertura apareceu no endereço: ${page.url()}`);
    // E de novo, já na tela recomeçada e tocando: outra abertura, outro começo.
    for (const star of [1, 2, 3]) await click(page, `trace-star-${star}`);
    await page.waitForSelector(tid('wake-player'), { visible: true, timeout: 15000 });
    await page.evaluate(() => {
      history.pushState(history.state, '', '/despertar/ouvir/session?utm_source=lembrete2');
      window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    });
    await assertFreshStart(page, 'o mesmo link aberto de novo com a sessão tocando');
    // Aberto a frio, o endereço fica limpo (o run é só da navegação).
    await page.goto(`${server.url}/despertar/ouvir/session`, { waitUntil: 'networkidle2', timeout: 60000 });
    await assertFreshStart(page, 'sessão aberta a frio');
    await sleep(300);
    if (new URL(page.url()).pathname !== '/despertar/ouvir/session' || new URL(page.url()).search) {
      fail(`sessão aberta a frio ficou em ${page.url()}, esperado /despertar/ouvir/session sem parâmetros`);
    }

    // 10c. Meia-noite no meio da sessão: ela começa hoje e termina "amanhã". O registro vale para o dia em que
    // começou, e o cartão final segue o mesmo dia.
    const realToday = localDay();
    await seed(page, server.url, seedState());
    await page.goto(`${server.url}/despertar/ouvir/session`, { waitUntil: 'networkidle2', timeout: 60000 });
    await assertFreshStart(page, 'sessão antes da meia-noite');
    await page.evaluate(() => {
      const Real = Date;
      const DAY_MS = 24 * 60 * 60 * 1000;
      window.Date = class extends Real {
        constructor(...args) {
          if (args.length) super(...args);
          else super(Real.now() + DAY_MS);
        }
        static now() {
          return Real.now() + DAY_MS;
        }
      };
    });
    await playToEnd(page, 'session-complete');
    if (await shown(page, 'session-streak')) fail('virou o dia e o cartão final já veio como registrado');
    await click(page, 'session-register');
    await page.waitForFunction(
      (key) => !!(JSON.parse(localStorage.getItem(key) || '{}').guidedSession || {}).lastDoneOn,
      { timeout: 10000 },
      STORAGE_KEY
    ).catch(() => fail('o registro depois da meia-noite não foi gravado'));
    const midnight = await savedState(page);
    const midnightAnchor = (midnight.manifestations || []).find((item) => item.id === 'm-sessao') || {};
    if (midnight.guidedSession.lastDoneOn !== realToday) {
      fail(`sessão que cruzou a meia-noite registrou ${midnight.guidedSession.lastDoneOn}, esperado o dia em que começou (${realToday})`);
    }
    if (JSON.stringify(midnightAnchor.sessions) !== JSON.stringify([localDay(-1), realToday])) {
      fail(`sessions depois da meia-noite: ${JSON.stringify(midnightAnchor.sessions)}, esperado ontem e ${realToday}`);
    }
    if (!(await shown(page, 'session-streak'))) fail('depois de registrar, o cartão final não mostrou o dia registrado');

    // 10d. Clipe da guia que falta (ou falha) com a voz da Celeste ligada: quem lê aquela fala é a voz da Celeste,
    // pelo texto, e a sessão não cai para a voz do aparelho.
    const audioBodies = [];
    const onRequest = (request) => {
      const url = new URL(request.url());
      if (/\.mp3$/.test(url.pathname)) return void request.abort().catch(() => {});
      if (url.pathname.endsWith('/auth/v1/signup')) {
        // outro endereço (Supabase): a resposta de mentira precisa liberar a origem, senão o navegador a recusa
        const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
        return void request
          .respond(
            request.method() === 'POST'
              ? { status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(mockSession()) }
              : { status: 204, headers: cors }
          )
          .catch(() => {});
      }
      if (request.method() === 'POST' && url.pathname === '/api/gerar-audio') {
        audioBodies.push(JSON.parse(request.postData() || '{}'));
        return void request.respond({ status: 200, contentType: 'audio/wav', body: AUDIO_FIXTURE }).catch(() => {});
      }
      return void request.continue().catch(() => {});
    };
    await page.setRequestInterception(true);
    page.on('request', onRequest);
    await seed(page, server.url, {
      ...seedState(),
      profile: {
        cloudConsentVersion: CLOUD_CONSENT_VERSION,
        cloudAdultConfirmed: true,
        cloudPersonalization: true,
        cloudNarrationConsent: true,
        cloudDreamConsent: true,
      },
    });
    await page.goto(`${server.url}/despertar/ouvir/session`, { waitUntil: 'networkidle2', timeout: 60000 });
    for (const star of [1, 2, 3]) await click(page, `trace-star-${star}`);
    await page.waitForSelector(tid('wake-player'), { visible: true, timeout: 15000 });
    const guideLine = 'Feche os olhos. Inspire devagar';
    for (let waited = 0; waited < 15000 && !audioBodies.length; waited += 200) await sleep(200);
    const firstAudio = audioBodies[0];
    if (!firstAudio) fail('clipe da guia ausente: a voz da Celeste não foi pedida para ler a fala');
    if (firstAudio.mode !== 'personal' || !String(firstAudio.text || '').startsWith(guideLine)) {
      fail(`clipe da guia ausente: o pedido de voz não levou o texto da fala: ${JSON.stringify(firstAudio).slice(0, 200)}`);
    }
    await sleep(1200);
    if (await shown(page, 'wake-device-voice-notice')) fail('clipe da guia ausente: a sessão caiu para a voz do aparelho');
    if (!/^1 de 12/i.test(await page.$eval(tid('wake-position'), (el) => el.innerText))) {
      fail('clipe da guia ausente: a sessão não ficou na primeira fala');
    }
    await page.screenshot({ path: path.join(SHOT_DIR, '09-clipe-ausente-voz-celeste.png') });
    page.off('request', onRequest);
    await page.setRequestInterception(false);
    await seed(page, server.url, midnight);

    // 11. Tela estreita (320x480), no estado mais largo ("Feita hoje"): o dia da jornada aparece inteiro e nada
    // sai do cartão. Medido nos elementos, não lido do texto.
    await page.setViewport({ width: 320, height: 480, deviceScaleFactor: 1 });
    await page.goto(`${server.url}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector(tid('open-session'), { visible: true, timeout: 30000 });
    const narrow = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="open-session"]');
      const day = card.querySelector('[data-testid="session-day"]');
      const box = card.getBoundingClientRect();
      const outside = [...card.querySelectorAll('*')].filter((node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && (rect.left < box.left - 0.5 || rect.right > box.right + 0.5 || rect.bottom > box.bottom + 0.5);
      }).length;
      return {
        left: box.left,
        right: box.right,
        outside,
        dayCut: day.scrollWidth > day.clientWidth + 1 || day.scrollHeight > day.clientHeight + 1,
        done: card.innerText.includes('Feita hoje'),
      };
    });
    if (!narrow.done) fail('320x480: o cartão deveria estar em "Feita hoje"');
    if (narrow.left < 0 || narrow.right > 320 || narrow.outside || narrow.dayCut) {
      fail(`320x480: cartão cortado ou vazando: ${JSON.stringify(narrow)}`);
    }
    await assertWidth(page, 'Home 320x480', 320);
    await page.screenshot({ path: path.join(SHOT_DIR, '07-home-320x480.png') });
    await page.setViewport(VIEWPORT);

    // 12. Sem Cena-Âncora não há sessão: o cartão não aparece e o link direto mostra o estado vazio.
    await page.evaluate(
      (key, value) => localStorage.setItem(key, JSON.stringify(value)),
      STORAGE_KEY,
      { ...seedState(), anchorSceneId: null, manifestations: [], morningRitual: {} }
    );
    await page.goto(`${server.url}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector(tid('open-profile'), { visible: true, timeout: 30000 });
    await sleep(800);
    if (await page.$(tid('open-session'))) fail('sem Cena-Âncora o cartão da sessão apareceu');
    await page.screenshot({ path: path.join(SHOT_DIR, '08-home-sem-ancora.png') });
    await page.goto(`${server.url}/despertar/ouvir/session`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector(tid('wake-empty'), { visible: true, timeout: 20000 })
      .catch(() => fail('sem Cena-Âncora o link direto não mostrou o estado vazio'));

    if (errors.length) fail(`erro de página: ${errors[0]}`);
    console.log('e2e sessao: ok');
  } finally {
    await browser.close();
    server.stop();
  }
})().catch((error) => {
  console.error(`e2e sessao: FALHOU - ${String(error.message || error).slice(0, 600)}`);
  process.exit(1);
});
