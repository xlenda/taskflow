// Mede o carregamento real do app num celular em 4G. Números, não sensação.
// Uso: node scripts/medir-performance.js
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });

  // Chrome recem-lancado pode segurar a primeira requisicao por varios segundos
  // antes de requestStart (inicializacao local de rede/proxy). Aquecemos apenas a
  // conexao com um favicon pequeno para esse custo nao virar um falso FCP do app.
  const target = new globalThis.URL(URL);
  const warmPage = await browser.newPage();
  const warmStartedAt = Date.now();
  await warmPage.goto(`${target.origin}/favicon.ico?celeste_perf_warmup=${Date.now()}`, {
    waitUntil: 'load',
    timeout: 60000,
  });
  const warmup = Date.now() - warmStartedAt;
  await warmPage.close();

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });

  // 4G comum no Brasil: ~1.6 Mbps de descida e 150ms de latência
  const cdp = await page.target().createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // celular mediano

  const t0 = Date.now();
  target.searchParams.set('celeste_perf', String(Date.now()));
  await page.goto(target.href, { waitUntil: 'networkidle2', timeout: 120000 });
  const total = Date.now() - t0;

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paint = performance.getEntriesByType('paint');
    const res = performance.getEntriesByType('resource');
    const fcp = paint.find((x) => x.name === 'first-contentful-paint');
    const js = res.filter((r) => r.name.endsWith('.js'));
    const fontes = res.filter((r) => /\.(ttf|otf|woff2?)$/.test(r.name));
    const kb = (arr) => Math.round(arr.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024);
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      ttfb: Math.round(nav.responseStart || 0),
      dcl: Math.round(nav.domContentLoadedEventEnd || 0),
      jsKB: kb(js),
      fontesKB: kb(fontes),
      totalKB: kb(res) + Math.round((nav.transferSize || 0) / 1024),
      recursos: res.length,
    };
  });

  console.log('— 4G + CPU 4x mais lenta (celular mediano) —');
  console.log(`aquecimento ...... ${warmup} ms (Chrome, fora da medicao)`);
  console.log(`carregou em ...... ${total} ms`);
  console.log(`primeiro pixel ... ${m.fcp == null ? 'ausente' : `${m.fcp} ms`}`);
  console.log(`primeiro byte .... ${m.ttfb} ms`);
  console.log(`DOM pronto ....... ${m.dcl} ms`);
  console.log(`JS ............... ${m.jsKB} KB`);
  console.log(`fontes de ícone .. ${m.fontesKB} KB`);
  console.log(`total baixado .... ${m.totalKB} KB em ${m.recursos} arquivos`);

  await browser.close();
  // Portão: acima disso o app "demora" de verdade no celular do usuário.
  if (m.fcp == null || !Number.isFinite(m.fcp)) {
    console.error('❌ navegador nao registrou first-contentful-paint');
    process.exit(1);
  }
  if (m.fcp > 6000) {
    console.error('❌ primeiro pixel acima de 6s no 4G');
    process.exit(1);
  }
  console.log('✅ dentro do aceitável para 4G');
})().catch((e) => {
  console.error('ERRO:', String(e).slice(0, 300));
  process.exit(2);
});
