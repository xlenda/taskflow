// Confirma que a marca aparece cedo, antes do bundle montar o app.
const puppeteer = require('puppeteer-core');
const path = require('path');
const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 780, isMobile: true });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 150,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  p.goto(URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
  for (const ms of [600, 1200, 2500]) {
    await new Promise((r) => setTimeout(r, ms === 600 ? 600 : 600));
    const info = await p.evaluate(() => {
      const s = document.getElementById('celeste-splash');
      const txt = (document.body.innerText || '').trim().slice(0, 40);
      return { splash: !!s, texto: txt };
    });
    await p.screenshot({ path: path.join(__dirname, 'e2e-shots', `splash-${ms}ms.png`) });
    console.log(`${ms}ms: splash=${info.splash} | tela="${info.texto.replace(/\n/g, ' ')}"`);
  }
  await b.close();
})().catch((e) => { console.error('ERRO:', String(e).slice(0, 200)); process.exit(1); });
