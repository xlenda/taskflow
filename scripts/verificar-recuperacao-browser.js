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
  await browser.close();
  console.log('OK: leitura pendente mostra recuperacao, preserva dados e retoma sem recarregar');
})().catch((error) => {
  console.error(`FALHOU: ${String(error).slice(0, 600)}`);
  process.exit(1);
});
