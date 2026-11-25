// Paywall do iPhone visto no navegador (prévia D.7): export local do site com
// EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW=1, planos de mentira, sem loja e sem cobrança.
// Uso: node scripts/e2e-paywall-previa.js
//   PAYWALL_PREVIEW_DIST=<pasta> reaproveita um export já feito com a prévia ligada.
// Capturas em output/ (390x844 e 320x480): com teste, sem teste, folha de informação, erro, bloqueado e
// compra recebida sem a permissão.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PAYWALL_PREVIEW_PORT) || 4197;
const BASE = `http://127.0.0.1:${PORT}`;
const STORAGE_KEY = '@stella_state_v2';
const SHOTS = path.join(ROOT, 'output');
const SIZES = [
  { width: 390, height: 844 },
  { width: 320, height: 480 },
];
const id = (testId) => `[data-testid="${testId}"]`;
const ANNUAL = 'paywall-plan-$rc_annual';
const MONTHLY = 'paywall-plan-$rc_monthly';
const SUPPORT_EMAIL = fs.readFileSync(path.join(ROOT, 'constants', 'legal.js'), 'utf8').match(/SUPPORT_EMAIL = '([^']+)'/)[1];
// A compra de mentira no pacote exportado: `<ativa>=!0,{ok:!0,active:!0}}`.
const BOUGHT = '=!0,{ok:!0,active:!0}}';

function exportedSite() {
  if (process.env.PAYWALL_PREVIEW_DIST) return path.resolve(process.env.PAYWALL_PREVIEW_DIST);
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'celeste-paywall-previa-'));
  console.log('exportando o site com a prévia ligada (alguns minutos)...');
  const done = spawnSync(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'expo', 'bin', 'cli'), 'export', '--platform', 'web', '--output-dir', dist, '--clear'],
    { cwd: ROOT, env: { ...process.env, EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW: '1' }, stdio: ['ignore', 'ignore', 'inherit'] }
  );
  if (done.status !== 0) throw new Error('o export do site com a prévia falhou');
  return dist;
}

const seed = (onboardingDone) => ({
  lang: 'pt',
  name: 'Teste',
  onboardingDone,
  profile: {},
  anchorSceneId: 'm-paywall',
  manifestations: [
    {
      id: 'm-paywall',
      origin: 'onboarding-anchor',
      anchorOpenedAt: '2026-11-24T10:00:00.000Z',
      title: 'Minha casa perto do mar',
      category: 'Peace',
      lang: 'pt',
      story: 'Uma cena pessoal pronta para continuar.',
      affirmation: 'Eu escolho paz.',
      sessions: [],
      evidence: [],
    },
  ],
  favoriteAffirmations: [],
  savedVisions: [],
  visionPlays: [],
  affirmationDates: [],
});

(async () => {
  const dist = exportedSite();
  const bundles = fs.readdirSync(path.join(dist, '_expo', 'static', 'js', 'web')).filter((name) => name.endsWith('.js'));
  const bundleText = bundles.map((name) => fs.readFileSync(path.join(dist, '_expo', 'static', 'js', 'web', name), 'utf8')).join('\n');
  if (!bundleText.includes('$rc_monthly')) throw new Error(`o export em ${dist} não foi feito com a prévia ligada`);

  fs.mkdirSync(SHOTS, { recursive: true });
  const server = spawn(process.execPath, [path.join(__dirname, 'serve-export.js'), dist, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (chunk) => String(chunk).includes('ready') && resolve());
    server.on('exit', () => reject(new Error('o servidor do export não subiu')));
  });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--lang=pt-BR'] });
  const errors = [];
  const checks = [];
  const check = (ok, what, detail) => {
    if (!ok) throw new Error(`${what}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
    checks.push(what);
  };

  // `rewrite` troca um trecho do pacote antes de o navegador recebê-lo: é como se vê o plano sem teste e a
  // loja fora do ar sem iPhone. Sem `rewrite`, o pacote chega como foi exportado.
  async function openPage(size, state, pathname, rewrite) {
    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.setViewport({ ...size, deviceScaleFactor: 2 });
    if (rewrite) {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const file = path.join(dist, decodeURIComponent(new URL(request.url()).pathname));
        if (!/\/_expo\/static\/js\/web\/[^/]+\.js$/.test(request.url())) return request.continue();
        const original = fs.readFileSync(file, 'utf8');
        const changed = original.split(rewrite[0]).join(rewrite[1]);
        if (changed === original) errors.push(`a troca "${rewrite[0]}" não aplicou no pacote`);
        return request.respond({ status: 200, contentType: 'text/javascript; charset=utf-8', body: changed });
      });
    }
    await page.goto(`${BASE}/__celeste_health`, { waitUntil: 'load' });
    await page.evaluate(
      (key, value) => {
        localStorage.setItem(key, JSON.stringify(value));
        // o aviso de cookies é só do site; o iPhone não tem
        localStorage.setItem('@celeste_ad_consent_v1', 'denied');
      },
      STORAGE_KEY,
      state
    );
    await page.goto(`${BASE}${pathname}`, { waitUntil: 'networkidle2', timeout: 60000 });
    return page;
  }

  const textOf = (page, testId) => page.$eval(id(testId), (node) => node.innerText.replace(/\s+/g, ' ').trim());
  const count = (page, selector) => page.$$eval(selector, (nodes) => nodes.length);
  // Medido no navegador: dentro da primeira tela, sem rolar, e não coberto por outra coisa.
  const onFirstScreen = (page, testId) =>
    page.$eval(id(testId), (node) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return (
        rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.top >= 0 &&
        rect.right <= window.innerWidth && rect.bottom <= window.innerHeight && !!hit && (node.contains(hit) || hit.contains(node))
      );
    });
  const widths = (page) =>
    page.evaluate(() => ({ html: document.documentElement.scrollWidth, body: document.body.scrollWidth, window: window.innerWidth }));
  const assertFits = async (page, size, state, always) => {
    const measured = await widths(page);
    check(measured.html === size.width && measured.body === size.width && measured.window === size.width,
      `${state} ${size.width}x${size.height}: largura do documento = ${size.width}`, measured);
    for (const testId of always) {
      check(await onFirstScreen(page, testId), `${state} ${size.width}x${size.height}: ${testId} visível sem rolar`);
    }
  };
  const shot = (page, name, size) => page.screenshot({ path: path.join(SHOTS, `paywall-${name}-${size.width}x${size.height}.png`) });
  const LINKS = ['paywall-restore', 'paywall-terms', 'paywall-privacy'];
  const FOOTER = ['paywall-cta', 'paywall-disclosure', ...LINKS];

  try {
    for (const size of SIZES) {
      // ── usuária nova: revelação → paywall ───────────────────────────────────────────────────────
      const page = await openPage(size, seed(false), '/revelacao/m-paywall');
      await page.waitForSelector(id('anchor-bridge-input'), { visible: true, timeout: 30000 });
      await page.type(id('anchor-bridge-input'), 'Abrir a janela e respirar');
      await page.evaluate(() => {
        [...document.querySelectorAll('[role="button"]')].find((node) => node.innerText.includes('Guardar minha Cena-Âncora')).click();
      });
      await page.waitForSelector(`${id('paywall-cta')}:not([aria-disabled="true"])`, { visible: true, timeout: 30000 });
      check(true, `${size.width}: depois da revelação aparece o paywall`);
      await assertFits(page, size, 'com teste', [...FOOTER, ANNUAL, MONTHLY]);

      check((await page.evaluate(() => document.body.innerText)).includes('PRÉVIA'), `${size.width}: marca PRÉVIA visível`);
      check((await page.evaluate(() => document.body.innerText)).includes('Minha casa perto do mar'), `${size.width}: título da Cena-Âncora dela no topo`);
      check((await count(page, id('paywall-locked'))) === 0, `${size.width}: sem a linha de bloqueio na entrada`);
      check((await textOf(page, 'paywall-cta')) === 'Começar 7 dias grátis', `${size.width}: botão do teste`, await textOf(page, 'paywall-cta'));
      check((await textOf(page, 'paywall-trial-$rc_annual')) === '7 dias grátis', `${size.width}: selo do teste`);
      check((await page.$eval(id(ANNUAL), (node) => node.getAttribute('aria-checked'))) === 'true', `${size.width}: o primeiro plano vem selecionado`);

      const price = await page.$eval(id(ANNUAL), (node) => node.innerText.split('\n')[1].trim());
      const yearly = await textOf(page, 'paywall-disclosure');
      check(yearly.startsWith(`7 dias grátis, depois ${price} por ano. Renova automaticamente até você cancelar. Cancele quando quiser em Ajustes`),
        `${size.width}: linha legal com teste, preço e período do plano selecionado`, yearly);
      await page.click(id(MONTHLY));
      const monthlyPrice = await page.$eval(id(MONTHLY), (node) => node.innerText.split('\n')[1].trim());
      const monthly = await textOf(page, 'paywall-disclosure');
      check(monthly !== yearly && monthly.startsWith(`7 dias grátis, depois ${monthlyPrice} por mês.`), `${size.width}: a linha legal muda ao trocar de plano`, monthly);
      await shot(page, 'com-teste', size);

      await page.click(id('paywall-info'));
      await page.waitForSelector(id('paywall-info-sheet'), { visible: true, timeout: 5000 });
      const sheet = await textOf(page, 'paywall-info-sheet');
      check(sheet.includes('Como funciona o teste') && sheet.includes(`Em 7 dias: ${monthlyPrice} por mês`) && sheet.includes('Nada é cobrado'),
        `${size.width}: folha "Como funciona o teste" com os números do plano`, sheet);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await shot(page, 'info', size);
      await page.click(id('paywall-info-close'));
      await page.waitForSelector(id('paywall-info-sheet'), { hidden: true, timeout: 5000 });

      // ── comprar leva ao app ─────────────────────────────────────────────────────────────────────
      await page.click(id('paywall-cta'));
      await page.waitForSelector(id('celeste-mascot-home'), { visible: true, timeout: 30000 });
      // a tela antiga sai da árvore quando a transição termina
      await page.waitForFunction((selector) => !document.querySelector(selector), { timeout: 10000 }, id('paywall-cta'));
      check((await count(page, id('paywall-cta'))) === 0, `${size.width}: comprar leva ao app e o paywall sai da árvore`);
      check((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).onboardingDone, STORAGE_KEY)) === true,
        `${size.width}: a entrada ficou gravada`);

      // ── recarregar com a entrada concluída e sem permissão: paywall bloqueado ───────────────────
      await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector(`${id('paywall-cta')}:not([aria-disabled="true"])`, { visible: true, timeout: 30000 });
      check((await textOf(page, 'paywall-locked')) === 'Seu conteúdo continua guardado neste iPhone.', `${size.width}: recarregar sem permissão cai no paywall bloqueado`);
      check((await count(page, id('celeste-mascot-home'))) === 0, `${size.width}: bloqueado não mostra o app`);
      await assertFits(page, size, 'bloqueado', [...FOOTER, ANNUAL, MONTHLY]);
      await shot(page, 'bloqueado', size);
      await page.click(id('paywall-restore'));
      await page.waitForSelector(id('celeste-mascot-home'), { visible: true, timeout: 30000 });
      check(true, `${size.width}: restaurar com assinatura ativa libera o app`);
      await page.close();

      // ── sem direito ao teste: some o selo, o botão diz o preço e a linha legal começa no preço ──
      const paid = await openPage(size, seed(true), '/', ['trialDays:7', 'trialDays:0']);
      await paid.waitForSelector(`${id('paywall-cta')}:not([aria-disabled="true"])`, { visible: true, timeout: 30000 });
      check((await count(paid, '[data-testid^="paywall-trial-"]')) === 0, `${size.width}: sem teste, sem selo`);
      check((await textOf(paid, 'paywall-cta')) === `Assinar por ${price}/ano`, `${size.width}: sem teste, o botão diz o preço`, await textOf(paid, 'paywall-cta'));
      check((await textOf(paid, 'paywall-disclosure')).startsWith(`${price} por ano. Renova automaticamente`), `${size.width}: sem teste, a linha legal começa no preço`);
      check(!(await paid.evaluate(() => document.body.innerText)).includes('grátis'), `${size.width}: sem teste, nada na tela fala em grátis`);
      await paid.click(id('paywall-info'));
      await paid.waitForSelector(id('paywall-info-sheet'), { visible: true, timeout: 5000 });
      const paidSheet = await textOf(paid, 'paywall-info-sheet');
      check(paidSheet.includes('Como funciona a assinatura') && paidSheet.includes(`Hoje: ${price} por ano`), `${size.width}: folha de informação sem teste`, paidSheet);
      await paid.click(id('paywall-info-close'));
      await paid.waitForSelector(id('paywall-info-sheet'), { hidden: true, timeout: 5000 });
      await assertFits(paid, size, 'sem teste', FOOTER);
      await shot(paid, 'sem-teste', size);
      await paid.close();

      // ── cobrou e a entrada não gravou: aviso, botão "Entrar", sem oferta na tela; depois entra ──
      // (a) comprando com os planos na tela; (b) restaurando com a loja fora do ar (sem planos)
      for (const [how, rewrite] of [['paywall-cta', undefined], ['paywall-restore', ['return{ok:!0,plans:', 'return{ok:!1,reason:"unavailable",plans:']]]) {
        const stuck = await openPage(size, seed(false), '/oferta', rewrite);
        await stuck.waitForSelector(rewrite ? id('paywall-retry') : `${id('paywall-cta')}:not([aria-disabled="true"])`, { visible: true, timeout: 30000 });
        await stuck.evaluate(() => {
          const proto = Object.getPrototypeOf(window.localStorage);
          window.__celesteSetItem = proto.setItem;
          proto.setItem = () => {
            throw new Error('storage-blocked-on-paywall');
          };
        });
        await stuck.click(id(how));
        await stuck.waitForSelector(id('paywall-notice'), { visible: true, timeout: 30000 });
        const label = `${size.width} (${rewrite ? 'restaurar sem planos' : 'comprar'})`;
        check((await textOf(stuck, 'paywall-notice')) === 'Compra confirmada. Toque para entrar.', `${label}: aviso de compra confirmada`, await textOf(stuck, 'paywall-notice'));
        check((await textOf(stuck, 'paywall-cta')) === 'Entrar no Celeste', `${label}: o botão vira Entrar`);
        check((await stuck.$eval(id('paywall-cta'), (node) => node.getAttribute('aria-disabled'))) !== 'true', `${label}: o botão voltou a responder`);
        check((await count(stuck, '[data-testid^="paywall-plan-"]')) === 0 && (await count(stuck, id('paywall-retry'))) === 0 &&
          (await count(stuck, id('paywall-error'))) === 0, `${label}: com a permissão não há planos, erro nem Tentar de novo`);
        check((await textOf(stuck, 'paywall-disclosure')) === '', `${label}: sem linha de oferta debaixo de Entrar`);
        check(!(await stuck.evaluate(() => document.body.innerText)).includes('grátis'), `${label}: nada fala em teste grátis`);
        await assertFits(stuck, size, label, ['paywall-cta', ...LINKS]);
        if (!rewrite) await shot(stuck, 'confirmada', size);
        await stuck.evaluate(() => {
          Object.getPrototypeOf(window.localStorage).setItem = window.__celesteSetItem;
        });
        await stuck.click(id('paywall-cta'));
        await stuck.waitForSelector(id('celeste-mascot-home'), { visible: true, timeout: 30000 });
        check(true, `${label}: o segundo toque entra, sem comprar de novo`);
        await stuck.close();
      }

      // ── cobrou e a permissão chegou atrasada: a tela confirma sozinha e entra, sem outro toque ───
      const late = await openPage(size, seed(false), '/oferta', [BOUGHT, '=!0,{ok:!0,active:!1}}']);
      await late.waitForSelector(`${id('paywall-cta')}:not([aria-disabled="true"])`, { visible: true, timeout: 30000 });
      await late.click(id('paywall-cta'));
      await late.waitForSelector(id('paywall-notice'), { visible: true, timeout: 10000 });
      check((await textOf(late, 'paywall-notice')) === 'Confirmando sua compra…', `${size.width}: permissão atrasada, a tela avisa que está confirmando`);
      check((await late.$eval(id('paywall-cta'), (node) => node.getAttribute('aria-disabled'))) === 'true', `${size.width}: confirmando, o botão não compra de novo`);
      await late.waitForSelector(id('celeste-mascot-home'), { visible: true, timeout: 30000 });
      check((await late.evaluate((key) => JSON.parse(localStorage.getItem(key)).onboardingDone, STORAGE_KEY)) === true,
        `${size.width}: permissão atrasada libera sozinha e grava a entrada`);
      await late.close();

      // ── cobrou e a permissão nunca veio: 2 s + 4 s + 8 s de confirmação, depois Restaurar, Gerenciar e suporte ──
      const never = await openPage(size, seed(false), '/oferta', [BOUGHT, '=!1,{ok:!0,active:!1}}']);
      await never.waitForSelector(`${id('paywall-cta')}:not([aria-disabled="true"])`, { visible: true, timeout: 30000 });
      const boughtAt = Date.now();
      await never.click(id('paywall-cta'));
      await never.waitForSelector(id('paywall-notice'), { visible: true, timeout: 10000 });
      check((await textOf(never, 'paywall-notice')) === 'Confirmando sua compra…', `${size.width}: sem permissão, a tela avisa que está confirmando`);
      check((await never.$eval(id('paywall-cta'), (node) => node.getAttribute('aria-disabled'))) === 'true', `${size.width}: sem permissão, confirmando, o botão fica travado`);
      check((await count(never, id('paywall-manage'))) === 0 && (await count(never, id('paywall-support'))) === 0, `${size.width}: confirmando, ainda sem Gerenciar e suporte`);
      await never.waitForFunction((selector) => document.querySelector(selector)?.innerText.startsWith('Compra recebida'), { timeout: 40000 }, id('paywall-notice'));
      const waited = Date.now() - boughtAt;
      check(waited >= 13500, `${size.width}: a confirmação esperou as três consultas (2 s, 4 s, 8 s)`, waited);
      check((await textOf(never, 'paywall-notice')) === 'Compra recebida. Toque em Restaurar compras para liberar.', `${size.width}: sem permissão, aviso de compra recebida`);
      check((await textOf(never, 'paywall-cta')) === 'Restaurar compras', `${size.width}: compra recebida, o botão principal restaura`, await textOf(never, 'paywall-cta'));
      check((await never.$eval(id('paywall-cta'), (node) => node.getAttribute('aria-disabled'))) !== 'true', `${size.width}: compra recebida, o botão voltou a responder`);
      check((await textOf(never, 'paywall-manage')) === 'Gerenciar assinatura', `${size.width}: compra recebida, Gerenciar assinatura na tela`);
      check((await textOf(never, 'paywall-support')) === `Ajuda: ${SUPPORT_EMAIL}`, `${size.width}: compra recebida, linha de suporte com o e-mail`, await textOf(never, 'paywall-support'));
      check((await count(never, id('celeste-mascot-home'))) === 0, `${size.width}: compra recebida sem permissão não abre o app`);
      await assertFits(never, size, 'compra recebida', [...FOOTER, 'paywall-manage', 'paywall-support']);
      await shot(never, 'recebida', size);
      await never.click(id('paywall-cta'));
      await never.waitForFunction((selector) => document.querySelector(selector)?.innerText === 'Compra recebida. Tente de novo em instantes.', { timeout: 10000 }, id('paywall-notice'));
      check((await textOf(never, 'paywall-cta')) === 'Restaurar compras' && (await count(never, id('paywall-manage'))) === 1,
        `${size.width}: o botão principal restaurou (não comprou de novo) e a ajuda continua na tela`);
      await never.close();

      // ── loja fora do ar: erro tratado, Tentar de novo, e os três links continuam ────────────────
      const down = await openPage(size, seed(true), '/', ['return{ok:!0,plans:', 'return{ok:!1,reason:"unavailable",plans:']);
      await down.waitForSelector(id('paywall-retry'), { visible: true, timeout: 30000 });
      check((await textOf(down, 'paywall-error')) === 'Não foi possível carregar os planos.', `${size.width}: erro ao carregar os planos`);
      check((await count(down, id('paywall-cta'))) === 0 && (await count(down, '[data-testid^="paywall-plan-"]')) === 0, `${size.width}: no erro não há plano nem botão de compra`);
      check((await textOf(down, 'paywall-disclosure')) === '', `${size.width}: no erro a linha legal não inventa preço`);
      await assertFits(down, size, 'erro', ['paywall-retry', ...LINKS]);
      await shot(down, 'erro', size);
      await down.click(id('paywall-retry'));
      await down.waitForSelector(id('paywall-retry'), { visible: true, timeout: 30000 });
      check(true, `${size.width}: Tentar de novo consulta outra vez e a tela continua de pé`);
      await down.close();
    }
    if (errors.length) throw new Error(`erros na página: ${errors.join(' | ')}`);
    console.log(`paywall (prévia): ok, ${checks.length} checagens. Capturas em ${SHOTS}`);
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
