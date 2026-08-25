// Prova o fluxo da abertura em tela inteira e a Celi da Home sem esconder o CTA.
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT_DIR = path.join(__dirname, 'e2e-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const seed = {
  lang: 'pt',
  name: 'Ana',
  onboardingDone: true,
  profile: { name: 'Ana' },
  manifestations: [],
  favoriteAffirmations: [],
  savedVisions: [],
  visionPlays: [],
  affirmationDates: [],
};

async function seedPage(page, value) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(
    (state) => localStorage.setItem('@stella_state_v2', JSON.stringify(state)),
    value
  );
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
}

async function assertImage(page, testID) {
  const selector = `[data-testid="${testID}"]`;
  await page.waitForSelector(selector, { visible: true, timeout: 30000 });
  await page.waitForFunction(
    (target) => {
      let element = document.querySelector(target);
      let effectiveOpacity = 1;
      while (element) {
        effectiveOpacity *= Number.parseFloat(getComputedStyle(element).opacity || '1');
        element = element.parentElement;
      }
      return effectiveOpacity > 0.95;
    },
    { timeout: 5000 },
    selector
  );
  const image = await page.$eval(selector, async (element) => {
    const nativeImage = element.tagName === 'IMG' ? element : element.querySelector('img');
    if (nativeImage?.decode) await nativeImage.decode().catch(() => {});
    const rect = element.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (nativeImage && context) context.drawImage(nativeImage, 0, 0, 64, 64);
    const pixels = context?.getImageData(0, 0, 64, 64).data || [];
    let visiblePixels = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 24) visiblePixels += 1;
    }
    let ancestor = element;
    let effectiveOpacity = 1;
    while (ancestor) {
      effectiveOpacity *= Number.parseFloat(getComputedStyle(ancestor).opacity || '1');
      ancestor = ancestor.parentElement;
    }
    return {
      naturalWidth: nativeImage?.naturalWidth || 0,
      naturalHeight: nativeImage?.naturalHeight || 0,
      src: nativeImage?.currentSrc || nativeImage?.src || '',
      visiblePixels,
      effectiveOpacity,
      rect: {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  const outsideViewport =
    image.rect.top < 0 ||
    image.rect.left < 0 ||
    image.rect.bottom > image.viewport.height ||
    image.rect.right > image.viewport.width;
  if (
    image.naturalWidth < 512 ||
    image.naturalHeight < 512 ||
    image.visiblePixels < 64 ||
    image.effectiveOpacity <= 0.95 ||
    !image.src ||
    outsideViewport
  ) {
    throw new Error(`Mascote sem imagem valida em ${testID}: ${JSON.stringify(image)}`);
  }
  return image;
}

async function assertWelcome(page, width, height, fileName) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await seedPage(page, { ...seed, onboardingDone: false });

  const opening = await assertImage(page, 'celeste-opening-video');
  const selector = '[data-testid="celeste-opening-video"]';
  await page.waitForFunction(
    (target) => {
      const video = document.querySelector(target)?.querySelector('video');
      return video && video.readyState >= 2 && video.currentTime > 0.05;
    },
    { timeout: 30000 },
    selector
  );
  const playback = await page.$eval(selector, (container) => {
    const video = container.querySelector('video');
    const frame = container.getBoundingClientRect();
    const media = video.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    let darkest = 255;
    let lightest = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const luminance = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
      darkest = Math.min(darkest, luminance);
      lightest = Math.max(lightest, luminance);
    }
    return {
      frame: { width: frame.width, height: frame.height },
      media: { width: media.width, height: media.height },
      readyState: video.readyState,
      currentTime: video.currentTime,
      paused: video.paused,
      muted: video.muted,
      source: video.currentSrc,
      contrast: lightest - darkest,
    };
  });
  const wrongMediaSize =
    Math.abs(playback.frame.width - playback.media.width) > 1 ||
    Math.abs(playback.frame.height - playback.media.height) > 1;
  const openingIsNotFullViewport =
    Math.abs(opening.rect.top) > 1 ||
    Math.abs(opening.rect.left) > 1 ||
    Math.abs(opening.rect.right - opening.viewport.width) > 1 ||
    Math.abs(opening.rect.bottom - opening.viewport.height) > 1 ||
    Math.abs(opening.rect.width - opening.viewport.width) > 1 ||
    Math.abs(opening.rect.height - opening.viewport.height) > 1;
  if (
    wrongMediaSize ||
    openingIsNotFullViewport ||
    playback.readyState < 2 ||
    playback.paused ||
    !playback.muted ||
    !playback.source.includes('celeste-abertura.mp4') ||
    playback.contrast < 8
  ) {
    throw new Error(`Video de abertura invalido em ${width}x${height}: ${JSON.stringify(playback)}`);
  }

  await page.screenshot({ path: path.join(SHOT_DIR, `opening-${fileName}`) });

  // O primeiro toque mantem a abertura e libera o audio por gesto do usuario.
  await page.click(selector);
  await page.waitForFunction(
    (target) => {
      const video = document.querySelector(target)?.querySelector('video');
      const soundControl = document.querySelector('[data-testid="celeste-opening-sound"]');
      return video && !video.muted && !video.paused && video.currentTime > 0.05 && soundControl;
    },
    { timeout: 10000 },
    selector
  );
  const soundEnabled = await page.$eval(selector, (container) => {
    const video = container.querySelector('video');
    return {
      muted: video.muted,
      paused: video.paused,
      currentTime: video.currentTime,
      openingStillVisible: container.offsetParent !== null,
    };
  });
  if (soundEnabled.muted || soundEnabled.paused || !soundEnabled.openingStillVisible) {
    throw new Error(
      `Toque nao ativou o som da abertura em ${width}x${height}: ${JSON.stringify(soundEnabled)}`
    );
  }

  await page.click('[data-testid="celeste-opening-skip"]');
  await page.waitForFunction(
    () => {
      const openingVideo = document.querySelector('[data-testid="celeste-opening-video"]');
      const button = [...document.querySelectorAll('button, [role="button"]')].find(
        (element) => element.innerText.includes('Continuar') && element.offsetParent !== null
      );
      if (openingVideo || !button) return false;
      let element = button;
      let effectiveOpacity = 1;
      while (element) {
        effectiveOpacity *= Number.parseFloat(getComputedStyle(element).opacity || '1');
        element = element.parentElement;
      }
      return effectiveOpacity > 0.95;
    },
    { timeout: 10000 }
  );
  const layout = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button, [role="button"]')].find((element) =>
      element.innerText.includes('Continuar')
    );
    const title = [...document.querySelectorAll('div, span')].find(
      (element) =>
        element.textContent.trim() === 'Celeste' &&
        ![...element.children].some((child) => child.textContent.trim() === 'Celeste')
    );
    const rectOf = (element) => {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    };
    return {
      button: rectOf(button),
      title: rectOf(title),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  const invalidButton =
    !layout.button || layout.button.top < 0 || layout.button.bottom > layout.viewport.height;
  const contentCollision = !layout.title || layout.title.bottom + 8 > layout.button.top;
  if (invalidButton || contentCollision || layout.scrollWidth > layout.viewport.width + 1) {
    throw new Error(
      `Layout da abertura falhou em ${width}x${height}: ${JSON.stringify({ opening, layout })}`
    );
  }
  await page.screenshot({ path: path.join(SHOT_DIR, fileName) });
}

async function assertHome(page, width, height, fileName) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await seedPage(page, seed);
  await assertImage(page, 'celeste-mascot-home');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1
  );
  if (overflow) throw new Error(`Home criou overflow horizontal em ${width}x${height}`);
  await page.screenshot({ path: path.join(SHOT_DIR, fileName) });
}

async function assertReducedMotion(page) {
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await seedPage(page, { ...seed, onboardingDone: false });
    // Sem gesto: a preferencia deve encerrar a abertura antes do fallback de 13 s.
    await page.waitForFunction(
      () => {
        const openingVideo = document.querySelector('[data-testid="celeste-opening-video"]');
        const button = [...document.querySelectorAll('button, [role="button"]')].find(
          (element) => element.innerText.includes('Continuar') && element.offsetParent !== null
        );
        return !openingVideo && !!button;
      },
      { timeout: 5000 }
    );
    const continueVisible = await page.evaluate(() =>
      [...document.querySelectorAll('button, [role="button"]')].some(
        (element) => element.innerText.includes('Continuar') && element.offsetParent !== null
      )
    );
    if (!continueVisible) throw new Error('Reduzir movimento nao avancou para o botao Continuar');
    await page.screenshot({ path: path.join(SHOT_DIR, 'mascot-welcome-reduced-motion.png') });
  } finally {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  }
}

async function assertAutoplayWithoutGesture(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
  );
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await seedPage(page, { ...seed, onboardingDone: false });
  const selector = '[data-testid="celeste-opening-video"] video';
  await page.waitForSelector(selector, { visible: true, timeout: 15000 });
  await page.waitForFunction(
    (target) => {
      const video = document.querySelector(target);
      return (
        video &&
        !video.paused &&
        video.muted &&
        video.currentTime > 0.15 &&
        Number.parseFloat(getComputedStyle(video).opacity) === 1
      );
    },
    { timeout: 15000 },
    selector
  );
  await page.close();
}

async function assertAutomaticFinish(browser) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await seedPage(page, { ...seed, onboardingDone: false });
    const videoSelector = '[data-testid="celeste-opening-video"] video';
    await page.waitForSelector(videoSelector, { visible: true, timeout: 15000 });
    await page.$eval(videoSelector, (video) => {
      window.__celesteOpeningEnded = false;
      video.addEventListener(
        'ended',
        () => {
          window.__celesteOpeningEnded = true;
        },
        { capture: true, once: true }
      );
    });
    await page.waitForFunction(
      () => {
        const openingVideo = document.querySelector('[data-testid="celeste-opening-video"]');
        const button = [...document.querySelectorAll('button, [role="button"]')].find(
          (element) => element.innerText.includes('Continuar') && element.offsetParent !== null
        );
        return window.__celesteOpeningEnded === true && !openingVideo && !!button;
      },
      { timeout: 15000 }
    );
  } finally {
    await page.close();
  }
}

async function assertBlockedAutoplayRecovery(browser) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    HTMLMediaElement.prototype.play = () =>
      Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError'));
  });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await seedPage(page, { ...seed, onboardingDone: false });
  await page.waitForFunction(
    () => {
      const opening = document.querySelector('[data-testid="celeste-opening-video"]');
      const button = [...document.querySelectorAll('button, [role="button"]')].find(
        (element) => element.innerText.includes('Continuar') && element.offsetParent !== null
      );
      return !opening && !!button;
    },
    { timeout: 6000 }
  );
  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--lang=pt-BR'],
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || '';
    const navigationCancelledVideo =
      failure === 'net::ERR_ABORTED' && request.url().includes('/video/celeste-abertura.mp4');
    if (!navigationCancelledVideo) errors.push(`request: ${failure} ${request.url()}`);
  });
  await assertWelcome(page, 320, 480, 'mascot-welcome-small.png');
  await assertWelcome(page, 568, 320, 'mascot-welcome-landscape.png');
  await assertWelcome(page, 390, 844, 'mascot-welcome-portrait.png');
  await assertReducedMotion(page);
  await assertAutoplayWithoutGesture(browser);
  await assertAutomaticFinish(browser);
  await assertBlockedAutoplayRecovery(browser);
  await assertHome(page, 320, 480, 'mascot-home-small.png');
  await assertHome(page, 1440, 900, 'mascot-home-desktop.png');

  if (errors.length) throw new Error(errors[0]);
  await browser.close();
  console.log(
    'OK: abertura full screen, autoplay mudo, som por toque, transicoes e mascote validados'
  );
})().catch((error) => {
  console.error(`FALHOU: ${String(error).slice(0, 500)}`);
  process.exit(1);
});
