// Prova isolada do ultimo passo: CTA visivel sem rolagem, entrada persistida
// depois de F5 e compatibilidade com estados antigos.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const STORAGE_KEY = '@stella_state_v2';
const SHOT_DIR = path.join(__dirname, 'e2e-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const seedState = (onboardingDone) => ({
  lang: 'pt',
  name: 'Teste',
  onboardingDone,
  profile: {},
  manifestations: [
    {
      id: 'm-paywall',
      title: 'Paz',
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

async function openWithState(
  browser,
  state,
  pathname = '/oferta',
  viewport = { width: 320, height: 480 },
  errors = []
) {
  const page = await browser.newPage();
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(
    (key, value) => localStorage.setItem(key, JSON.stringify(value)),
    STORAGE_KEY,
    state
  );
  await page.goto(new globalThis.URL(pathname, BASE_URL).toString(), {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  return page;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--lang=pt-BR'],
  });

  const errors = [];
  const page = await openWithState(browser, seedState(false), '/oferta', { width: 320, height: 480 }, errors);
  const selector = '[aria-label="Entrar no Celeste"]';
  await page.waitForSelector(selector, { visible: true, timeout: 30000 });

  const cta = await page.$eval(selector, (button) => {
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.visualViewport ? window.visualViewport.height : window.innerHeight,
      clickable: !!hit && button.contains(hit),
    };
  });

  if (cta.left < 0 || cta.right > cta.viewportWidth || cta.top < 0 || cta.bottom > cta.viewportHeight) {
    throw new Error(`CTA fora da primeira tela em 320x480: ${JSON.stringify(cta)}`);
  }
  if (!cta.clickable) throw new Error(`CTA coberto por outro elemento: ${JSON.stringify(cta)}`);

  await page.screenshot({ path: path.join(SHOT_DIR, 'paywall-small.png') });
  await page.mouse.click((cta.left + cta.right) / 2, (cta.top + cta.bottom) / 2);
  // Recarrega sem aguardar Home nem observar o storage primeiro. Se o CTA
  // liberar apenas em memoria ou gravar tarde demais, este F5 volta ao inicio.
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Manifestar'), {
    timeout: 30000,
  });
  const persisted = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{}').onboardingDone,
    STORAGE_KEY
  );
  if (persisted !== true) throw new Error('onboardingDone nao persistiu depois do F5');
  await page.close();

  const legacyFalse = await openWithState(browser, seedState('false'), '/oferta', { width: 320, height: 480 }, errors);
  await legacyFalse.waitForSelector(selector, { visible: true, timeout: 30000 });
  await legacyFalse.close();

  const withoutFlagState = seedState(false);
  delete withoutFlagState.onboardingDone;
  const withoutFlag = await openWithState(browser, withoutFlagState, '/oferta', { width: 320, height: 480 }, errors);
  await withoutFlag.waitForSelector(selector, { visible: true, timeout: 30000 });
  await withoutFlag.close();

  // Se o aparelho negar a gravacao, o paywall permanece aberto e oferece nova
  // tentativa. Ele nao pode fingir sucesso para depois voltar ao onboarding.
  const blockedStorage = await openWithState(browser, seedState(false), '/oferta', { width: 320, height: 480 }, errors);
  await blockedStorage.waitForSelector(selector, { visible: true, timeout: 30000 });
  await blockedStorage.evaluate(() => {
    const storageProto = Object.getPrototypeOf(window.localStorage);
    window.__celesteOriginalSetItem = storageProto.setItem;
    storageProto.setItem = () => {
      throw new Error('storage-blocked-on-paywall');
    };
  });
  await blockedStorage.click(selector);
  await blockedStorage.waitForFunction(
    () => document.body.innerText.includes('Não conseguimos guardar suas últimas mudanças'),
    { timeout: 15000 }
  );
  await blockedStorage.waitForSelector(selector, { visible: true, timeout: 15000 });
  const stayedOutside = await blockedStorage.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{}').onboardingDone !== true,
    STORAGE_KEY
  );
  if (!stayedOutside) throw new Error('Falha de storage liberou o app sem persistir o acesso');
  await blockedStorage.evaluate(() => {
    Object.getPrototypeOf(window.localStorage).setItem = window.__celesteOriginalSetItem;
    delete window.__celesteOriginalSetItem;
  });
  await blockedStorage.waitForFunction(
    () =>
      [...document.querySelectorAll('button, [role="button"]')].some((button) =>
        button.innerText.includes('Tentar novamente')
      ),
    { timeout: 15000 }
  );
  await blockedStorage.evaluate(() => {
    const retry = [...document.querySelectorAll('button, [role="button"]')].find((button) =>
      button.innerText.includes('Tentar novamente')
    );
    retry.click();
  });
  await blockedStorage.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await blockedStorage.waitForFunction(() => document.body.innerText.includes('Manifestar'), {
    timeout: 30000,
  });
  const recovered = await blockedStorage.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || '{}').onboardingDone,
    STORAGE_KEY
  );
  if (recovered !== true) throw new Error('Nova tentativa entrou sem persistir o acesso');
  await blockedStorage.close();

  const doubleClick = await openWithState(browser, seedState(false), '/oferta', { width: 320, height: 480 }, errors);
  await doubleClick.waitForSelector(selector, { visible: true, timeout: 30000 });
  await doubleClick.evaluate(() => {
    const storageProto = Object.getPrototypeOf(window.localStorage);
    window.__celesteWriteCount = 0;
    window.__celesteCountedSetItem = storageProto.setItem;
    storageProto.setItem = function countedSetItem(...args) {
      window.__celesteWriteCount += 1;
      return window.__celesteCountedSetItem.apply(this, args);
    };
    const button = document.querySelector('[aria-label="Entrar no Celeste"]');
    button.click();
    button.click();
  });
  await doubleClick.waitForFunction(() => document.body.innerText.includes('Manifestar'), {
    timeout: 30000,
  });
  await new Promise((resolve) => setTimeout(resolve, 500));
  const writeCount = await doubleClick.evaluate(() => window.__celesteWriteCount);
  if (writeCount > 2) throw new Error(`Clique duplo iniciou ${writeCount} gravacoes`);
  await doubleClick.close();

  const legacyTrue = await openWithState(browser, seedState('true'), '/', { width: 320, height: 480 }, errors);
  await legacyTrue.waitForFunction(() => document.body.innerText.includes('Manifestar'), {
    timeout: 30000,
  });
  await legacyTrue.close();

  const desktop = await openWithState(
    browser,
    seedState(false),
    '/oferta',
    { width: 1440, height: 900 },
    errors
  );
  await desktop.waitForSelector(selector, { visible: true, timeout: 30000 });
  const desktopCta = await desktop.$eval(selector, (button) => ({
    width: button.getBoundingClientRect().width,
    label: button.innerText.trim(),
  }));
  if (desktopCta.width < 280 || !desktopCta.label.includes('Entrar no Celeste')) {
    throw new Error(`CTA encolhido ou sem rotulo no desktop: ${JSON.stringify(desktopCta)}`);
  }
  await desktop.screenshot({ path: path.join(SHOT_DIR, 'paywall-desktop.png') });
  await desktop.close();

  if (errors.length) throw new Error(`Erro de pagina: ${errors[0]}`);
  await browser.close();
  console.log('OK: CTA visivel, entrada persistente, falha de storage e estado legado protegidos');
})().catch(async (error) => {
  console.error(`FALHOU: ${String(error).slice(0, 500)}`);
  process.exit(1);
});
