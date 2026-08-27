const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const STORE = path.join(ROOT, 'store-listing');
const RAW = path.join(STORE, 'assets', 'raw');
const OUTPUT = path.join(STORE, 'assets', 'final');
const ICON = path.join(ROOT, 'assets', 'icon-celeste-v2.png');
function resolveChromium() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const executable = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executable) throw new Error('Chrome or Edge not found. Set CHROME_PATH and try again.');
  return executable;
}

const CHROME = resolveChromium();
const screenshots = JSON.parse(fs.readFileSync(path.join(STORE, 'screenshots.json'), 'utf8'));

const PLATFORMS = {
  apple: { width: 430, height: 932, deviceScaleFactor: 3, extension: 'jpg', quality: 96 },
  'google-play': { width: 360, height: 640, deviceScaleFactor: 3, extension: 'jpg', quality: 95 },
};

const backgroundByOrder = {
  1: '#E9F1FB',
  2: '#F1EEFC',
  3: '#FAEEF3',
  4: '#EDF4FC',
  5: '#EAF6F3',
  6: '#FFF6E7',
  7: '#ECF3FC',
  8: '#EDF6F0',
};

const featureCopy = {
  'pt-BR': {
    eyebrow: 'CELESTE',
    headline: 'Uma cena feita das suas palavras',
    subline: 'Afirmação pessoal. Voz escolhida. Um passo possível para hoje.',
  },
  'en-US': {
    eyebrow: 'CELESTE',
    headline: 'A scene made from your words',
    subline: 'A personal affirmation. Your chosen voice. One possible step for today.',
  },
};

function dataUrl(file) {
  const extension = path.extname(file).slice(1).replace('jpg', 'jpeg');
  return `data:image/${extension};base64,${fs.readFileSync(file).toString('base64')}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function screenshotHtml({ platform, item, locale, source, icon }) {
  const compact = platform === 'google-play';
  const copy = item[locale];
  const background = backgroundByOrder[item.order] || '#E9F1FB';
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  body {
    background: ${background};
    color: #171B28;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  }
  .frame { position: relative; width: 100%; height: 100%; padding: ${compact ? '17px 20px' : '28px 28px'} 0; }
  .brand { display: flex; align-items: center; gap: ${compact ? '8px' : '10px'}; }
  .brand img {
    width: ${compact ? '28px' : '36px'};
    height: ${compact ? '28px' : '36px'};
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(29, 62, 111, 0.14);
  }
  .brand span { font-size: ${compact ? '12px' : '14px'}; font-weight: 800; color: #31557F; }
  .thread { width: ${compact ? '52px' : '66px'}; height: 2px; margin: ${compact ? '12px 0 8px' : '17px 0 10px'}; background: ${item.accent}; }
  h1 {
    margin: 0;
    width: 94%;
    max-width: ${compact ? '320px' : '385px'};
    font-size: ${compact ? '25px' : '34px'};
    line-height: ${compact ? '29px' : '39px'};
    font-weight: 850;
    letter-spacing: 0;
  }
  .app {
    position: absolute;
    left: ${compact ? '14px' : '18px'};
    right: ${compact ? '14px' : '18px'};
    top: ${compact ? '129px' : '188px'};
    bottom: ${compact ? '-30px' : '-62px'};
    overflow: hidden;
    border: 1px solid rgba(49, 85, 127, 0.16);
    border-radius: 8px;
    background: #F4F6FA;
    box-shadow: 0 18px 42px rgba(49, 85, 127, 0.18);
  }
  .app img { width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
  .accent-dot {
    position: absolute;
    right: ${compact ? '18px' : '28px'};
    top: ${compact ? '24px' : '36px'};
    width: ${compact ? '8px' : '10px'};
    height: ${compact ? '8px' : '10px'};
    border-radius: 50%;
    background: ${item.accent};
  }
</style>
</head>
<body>
  <main class="frame">
    <div class="brand"><img src="${icon}" alt=""><span>CELESTE</span></div>
    <div class="thread"></div>
    <h1>${escapeHtml(copy.headline)}</h1>
    <div class="accent-dot"></div>
    <div class="app"><img src="${source}" alt=""></div>
  </main>
</body>
</html>`;
}

function featureHtml(locale, icon) {
  const copy = featureCopy[locale];
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  body {
    position: relative;
    background: #AFC8E7;
    color: #171B28;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
  }
  .copy { position: absolute; z-index: 2; left: 64px; top: 58px; width: 590px; }
  .eyebrow { color: #31557F; font-size: 20px; font-weight: 850; letter-spacing: 0; }
  .line { width: 76px; height: 4px; margin: 18px 0 17px; background: #EBAE43; }
  h1 { margin: 0; font-size: 56px; line-height: 61px; font-weight: 850; letter-spacing: 0; }
  p { margin: 22px 0 0; width: 560px; font-size: 23px; line-height: 31px; color: #31557F; font-weight: 600; letter-spacing: 0; }
  .mascot { position: absolute; right: -15px; bottom: -92px; width: 475px; height: 475px; object-fit: cover; border-radius: 8px; }
  .gold { position: absolute; right: 405px; top: 76px; width: 9px; height: 9px; border-radius: 50%; background: #EBAE43; }
</style>
</head>
<body>
  <div class="copy">
    <div class="eyebrow">${copy.eyebrow}</div>
    <div class="line"></div>
    <h1>${escapeHtml(copy.headline)}</h1>
    <p>${escapeHtml(copy.subline)}</p>
  </div>
  <div class="gold"></div>
  <img class="mascot" src="${icon}" alt="">
</body>
</html>`;
}

async function renderPage(browser, spec, html, destination, type = 'jpeg', quality = 95) {
  const page = await browser.newPage();
  await page.setViewport(spec);
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => Promise.all([...document.images].map((image) => image.decode())));
  await page.screenshot({ path: destination, type, quality: type === 'jpeg' ? quality : undefined });
  await page.close();
}

async function renderIcon(browser, size, destination, transparent) {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  const icon = dataUrl(ICON);
  const content = transparent
    ? `<canvas id="icon" width="${size}" height="${size}"></canvas><script>
        const source = new Image();
        source.onload = () => {
          const context = document.getElementById('icon').getContext('2d');
          context.drawImage(source, 0, 0, ${size}, ${size});
          context.clearRect(${size - 1}, ${size - 1}, 1, 1);
          document.body.dataset.ready = 'true';
        };
        source.src = ${JSON.stringify(icon)};
      </script>`
    : `<img src="${icon}" alt="">`;
  await page.setContent(`<!doctype html><style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;${transparent ? 'background:transparent;' : 'background:#AFC8E7;'}}
    img,canvas{display:block;width:100%;height:100%;object-fit:cover}
  </style>${content}`, { waitUntil: 'load' });
  if (transparent) {
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
  } else {
    await page.evaluate(() => document.images[0].decode());
  }
  await page.screenshot({ path: destination, type: 'png', omitBackground: transparent });
  await page.close();
}

(async () => {
  if (!fs.existsSync(ICON)) throw new Error(`Missing icon master: ${ICON}`);
  fs.mkdirSync(OUTPUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const icon = dataUrl(ICON);
  try {
    for (const [platform, spec] of Object.entries(PLATFORMS)) {
      for (const locale of ['pt-BR', 'en-US']) {
        const target = path.join(OUTPUT, platform, locale);
        fs.mkdirSync(target, { recursive: true });
        for (const item of screenshots.items) {
          const sourceName = (item.sources && item.sources[platform]) || item.source;
          const sourceFile = path.join(RAW, platform, locale, `${sourceName}.png`);
          if (!fs.existsSync(sourceFile)) throw new Error(`Missing raw screenshot: ${sourceFile}`);
          const filename = `${String(item.order).padStart(2, '0')}-${item.id}.${spec.extension}`;
          await renderPage(
            browser,
            spec,
            screenshotHtml({ platform, item, locale, source: dataUrl(sourceFile), icon }),
            path.join(target, filename),
            'jpeg',
            spec.quality
          );
          process.stdout.write(`${platform}/${locale}/${filename}\n`);
        }
      }
    }

    const featureDirectory = path.join(OUTPUT, 'google-play', 'feature-graphic');
    fs.mkdirSync(featureDirectory, { recursive: true });
    for (const locale of ['pt-BR', 'en-US']) {
      await renderPage(
        browser,
        { width: 1024, height: 500, deviceScaleFactor: 1 },
        featureHtml(locale, icon),
        path.join(featureDirectory, `${locale}.jpg`),
        'jpeg',
        96
      );
    }

    const iconDirectory = path.join(OUTPUT, 'icons');
    fs.mkdirSync(iconDirectory, { recursive: true });
    await renderIcon(browser, 1024, path.join(iconDirectory, 'apple-icon-1024.png'), false);
    await renderIcon(browser, 512, path.join(iconDirectory, 'google-play-icon-512.png'), true);
  } finally {
    await browser.close();
  }
  process.stdout.write(`Store assets written to ${OUTPUT}\n`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
