const path = require('path');
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const STORAGE_KEY = '@stella_state_v2';
const SHOT_DIR = path.join(__dirname, 'e2e-shots');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--lang=pt-BR'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((key) => {
    const storage = Storage.prototype;
    const originalGetItem = storage.getItem;
    const originalSetItem = storage.setItem;
    let blocked = true;
    window.__celesteStorageWrites = 0;
    window.__celesteReleaseStorageRead = () => {
      blocked = false;
    };
    storage.getItem = function guardedGetItem(itemKey) {
      if (blocked && itemKey === key) return new Promise(() => {});
      return originalGetItem.call(this, itemKey);
    };
    storage.setItem = function countedSetItem(itemKey, value) {
      if (itemKey === key) window.__celesteStorageWrites += 1;
      return originalSetItem.call(this, itemKey, value);
    };
  }, STORAGE_KEY);

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('[data-testid="celeste-storage-recovery"]', {
    visible: true,
    timeout: 12000,
  });
  const recoveryText = await page.$eval(
    '[data-testid="celeste-storage-recovery"]',
    (element) => element.innerText
  );
  if (!recoveryText.includes('Nada foi apagado')) {
    throw new Error(`Recuperacao nao protege os dados: ${recoveryText}`);
  }
  const writesBeforeRecovery = await page.evaluate(() => window.__celesteStorageWrites);
  if (writesBeforeRecovery !== 0) {
    throw new Error(`Leitura pendente provocou ${writesBeforeRecovery} gravacoes`);
  }

  await page.evaluate(() => window.__celesteReleaseStorageRead());
  await page.click('[data-testid="celeste-storage-retry"]');
  await page.waitForSelector('[data-testid="celeste-opening-video"]', {
    visible: true,
    timeout: 10000,
  });
  const recoveryStillVisible = await page.$('[data-testid="celeste-storage-recovery"]');
  if (recoveryStillVisible) throw new Error('Nova tentativa manteve a tela de recuperacao');
  if (errors.length) throw new Error(`Erro de pagina: ${errors[0]}`);

  await page.screenshot({ path: path.join(SHOT_DIR, 'recuperacao-storage.png') });

  const corruptPage = await browser.newPage();
  const corruptErrors = [];
  corruptPage.on('pageerror', (error) => corruptErrors.push(String(error)));
  await corruptPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await corruptPage.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await corruptPage.evaluate((key) => localStorage.setItem(key, '{broken-json'), STORAGE_KEY);
  await corruptPage.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await corruptPage.waitForSelector('[data-testid="celeste-storage-repair"]', {
    visible: true,
    timeout: 12000,
  });
  await corruptPage.click('[data-testid="celeste-storage-retry"]');
  await corruptPage.waitForSelector('[data-testid="celeste-storage-repair"]', {
    visible: true,
    timeout: 12000,
  });
  await corruptPage.click('[data-testid="celeste-storage-repair"]');
  await corruptPage.waitForSelector('[role="dialog"]', { visible: true, timeout: 5000 });
  const confirmButtons = await corruptPage.$$('[role="dialog"] button');
  if (confirmButtons.length !== 2) throw new Error('Confirmacao do reparo nao abriu corretamente');
  await confirmButtons[1].click();
  await corruptPage.waitForSelector('[data-testid="celeste-opening-video"]', {
    visible: true,
    timeout: 12000,
  });
  const corruptValue = await corruptPage.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  if (corruptValue !== null) throw new Error('Reparo nao removeu somente o arquivo corrompido');
  if (corruptErrors.length) throw new Error(`Erro ao reparar arquivo corrompido: ${corruptErrors[0]}`);
  await corruptPage.screenshot({ path: path.join(SHOT_DIR, 'recuperacao-corrompida.png') });
  await corruptPage.close();

  const malformedPage = await browser.newPage();
  const malformedErrors = [];
  malformedPage.on('pageerror', (error) => malformedErrors.push(String(error)));
  await malformedPage.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await malformedPage.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        onboardingDone: true,
        lang: 'pt',
        profile: {},
        manifestations: [],
        favoriteAffirmations: [null, 42, 'a-1'],
        affirmationDates: [null, 'invalida', '2026-08-25'],
        savedVisions: [null, {}, 'fy-1'],
        visionPlays: [null, {}, { visionId: 'vision-1', date: '2026-08-25' }],
      })
    );
  }, STORAGE_KEY);
  const journeyUrl = new globalThis.URL('/jornada', URL).toString();
  await malformedPage.goto(journeyUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await malformedPage.waitForSelector('[data-testid="journey-screen"]', {
    visible: true,
    timeout: 15000,
  });
  await malformedPage.waitForFunction(
    (key) => {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      return saved.favoriteAffirmations?.length === 0 &&
        saved.savedVisions?.length === 0 &&
        saved.visionPlays?.length === 0 &&
        saved.affirmationDates?.length === 1;
    },
    { timeout: 15000, polling: 200 },
    STORAGE_KEY
  );
  if (malformedErrors.length) {
    throw new Error(`Estado estruturalmente invalido derrubou a Jornada: ${malformedErrors[0]}`);
  }
  await malformedPage.screenshot({ path: path.join(SHOT_DIR, 'recuperacao-arrays.png') });
  await malformedPage.close();

  await browser.close();
  console.log('OK: leitura pendente, arquivo corrompido e arrays malformados recuperados com seguranca');
})().catch((error) => {
  console.error(`FALHOU: ${String(error).slice(0, 600)}`);
  process.exit(1);
});
