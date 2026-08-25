const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'http://localhost:8090';
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUTPUT = path.join(__dirname, '..', 'public', 'og.png');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--lang=pt-BR'],
    defaultViewport: { width: 1200, height: 630, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => localStorage.removeItem('@stella_state_v2'));
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 1800));
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  await page.screenshot({ path: OUTPUT, type: 'png' });
  await browser.close();
  process.stdout.write(`Open Graph image: ${OUTPUT}\n`);
})().catch((error) => {
  console.error(String(error));
  process.exit(1);
});
