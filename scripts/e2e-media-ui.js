// Focused browser coverage for the two personal media surfaces.
// Gemini and ElevenLabs are never contacted: both paid routes are intercepted
// with deterministic fixtures before the application is opened.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');
const { buildPersonalJourneySuites } = require('../utils/personalJourney');

const URL = (process.env.TARGET_URL || 'http://127.0.0.1:4181').replace(/\/$/, '');
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const STORAGE_KEY = '@stella_state_v2';
const AUDIO_FIXTURE = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'audio', 'previews', 'luma-pt.wav')
);

// Valid 1x1 JPEG. Its content is deliberately plain: this test covers the
// personalized-image pipeline and rendering, not generative image quality.
const JPEG_FIXTURE =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAFAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCvRRRX1J4R/9k=';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const jwtPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const MOCK_ACCESS_TOKEN = `${jwtPart({ alg: 'none', typ: 'JWT' })}.${jwtPart({
  aud: 'authenticated',
  role: 'authenticated',
  sub: '00000000-0000-4000-8000-000000000001',
  exp: 4102444800,
})}.e2e`;

function publicConfigValue(name) {
  if (process.env[name]) return String(process.env[name]).replace(/^['"]|['"]$/g, '');
  const envPath = path.join(__dirname, '..', '.env.production.local');
  if (!fs.existsSync(envPath)) return '';
  const prefix = `${name}=`;
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(prefix));
  return line ? line.trim().slice(prefix.length).trim().replace(/^['"]|['"]$/g, '') : '';
}

function supabaseStorageKey() {
  try {
    const projectRef = new URL(publicConfigValue('EXPO_PUBLIC_SUPABASE_URL')).hostname.split('.')[0];
    return projectRef ? `sb-${projectRef}-auth-token` : '';
  } catch (_error) {
    return '';
  }
}

function mockSession() {
  const now = new Date().toISOString();
  return {
    access_token: MOCK_ACCESS_TOKEN,
    token_type: 'bearer',
    expires_in: 2147483647,
    expires_at: 4102444800,
    refresh_token: 'celeste-media-e2e-refresh-token',
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: '',
      phone: '',
      app_metadata: { provider: 'anonymous', providers: ['anonymous'] },
      user_metadata: {},
      identities: [],
      created_at: now,
      updated_at: now,
      is_anonymous: true,
    },
  };
}

function compactFingerprint(value) {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function audioCacheKey(text) {
  const identity = JSON.stringify(['narration-v1', 'luma', 'pt', text]);
  return `narration-v1-${crypto.createHash('sha256').update(identity).digest('hex')}`;
}

function dayIndex(length) {
  const value = new Date().toISOString().slice(0, 10);
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100003;
  }
  return length ? hash % length : 0;
}

function buildSeed() {
  const runId = `media-ui-${Date.now()}`;
  const profile = {
    name: 'Ana',
    age: '25–34',
    city: 'Guarulhos',
    dreamLocation: 'uma casa perto do mar',
    dreamHome: 'uma casa clara e acolhedora',
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    cloudAdultConfirmed: true,
    cloudPersonalization: true,
    cloudNarrationConsent: true,
    cloudDreamConsent: true,
  };
  const journeySuiteByLang = buildPersonalJourneySuites({
    desire: `Viver com calma e presenca ${runId}`,
    profile,
    originLang: 'pt',
  });

  const vision = journeySuiteByLang.pt.visions[0];
  const affirmation =
    journeySuiteByLang.pt.affirmations[dayIndex(journeySuiteByLang.pt.affirmations.length)];
  const visualEntries = [vision, affirmation].map((item) => {
    const cacheKey = `visual-${runId}-${item.key.replace(':', '-')}`.toLowerCase();
    return {
      key: item.key,
      cacheKey,
      contentFingerprint: compactFingerprint({
        manifestationId: runId,
        journeyKey: item.key,
        visualBrief: item.visualBrief,
        lang: 'pt',
      }),
    };
  });
  const journeyVisuals = Object.fromEntries(
    visualEntries.map((entry) => [
      entry.key,
      {
        cacheKey: entry.cacheKey,
        mimeType: 'image/jpeg',
        aspectRatio: '4:5',
        model: 'e2e-fixture',
        promptVersion: 'celeste-visual-v1',
        visualMood: 'luminous',
        contentFingerprint: entry.contentFingerprint,
        sourceFields: ['desire'],
        createdAt: new Date().toISOString(),
      },
    ])
  );
  const audioEntries = [vision.story, affirmation.text].map((text) => ({
    key: audioCacheKey(text),
  }));

  const today = new Date().toISOString().slice(0, 10);
  return {
    runId,
    seed: {
      name: 'Ana',
      lang: 'pt',
      mood: 'cloud',
      onboardingDone: true,
      profile,
      narration: { narratorId: 'luma' },
      anchorSceneId: runId,
      manifestations: [
        {
          id: runId,
          origin: 'onboarding-anchor',
          title: `Viver com calma e presenca ${runId}`,
          category: 'Peace',
          accent: 5,
          lang: 'pt',
          intention: 'Criar uma vida com calma e presenca.',
          affirmation: 'Eu escolho a vida que estou construindo.',
          story: 'Eu reconheco o que ja mudou e escolho o proximo passo.',
          anchorIdentity: 'Eu ajo com presenca.',
          anchorStep: 'Separar cinco minutos para o que importa.',
          anchorAnswers: profile,
          createdAt: today,
          goalDays: 21,
          sessions: [],
          evidence: [],
          journeySuiteByLang,
          journeyVisuals,
        },
      ],
      favoriteAffirmations: [],
      affirmationDates: [],
      savedVisions: [],
      visionPlays: [],
      morningRitual: {
        reminderEnabled: false,
        reminderTime: '06:30',
        wakeAffirmationId: null,
        wakeAffirmationText: '',
        wakeAffirmationLang: 'pt',
        entries: [],
      },
    },
    fixtures: { visualEntries, audioEntries },
  };
}

function paidPath(url) {
  try {
    const pathname = new URL(url).pathname;
    return /^\/api\/(?:gerar|traduzir|transformar)-/.test(pathname) ? pathname : '';
  } catch (_error) {
    return '';
  }
}

async function clickVisibleLabel(page, label, timeout = 15000) {
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll('[aria-label]')].some(
        (element) =>
          element.offsetParent !== null && element.getAttribute('aria-label') === expected
      ),
    { timeout, polling: 100 },
    label
  );
  const clicked = await page.evaluate((expected) => {
    const element = [...document.querySelectorAll('[aria-label]')].find(
      (candidate) =>
        candidate.offsetParent !== null && candidate.getAttribute('aria-label') === expected
    );
    if (!element) return false;
    element.scrollIntoView({ block: 'center', inline: 'center' });
    element.click();
    return true;
  }, label);
  if (!clicked) throw new Error(`Controle nao encontrado: ${label}`);
}

async function waitForPlayer(page, label, timeout = 15000) {
  await page.waitForFunction(
    (expected) => {
      const player = document.querySelector('[data-testid="narration-playback-controls"]');
      return (
        player &&
        player.offsetParent !== null &&
        player.getAttribute('aria-label') === expected
      );
    },
    { timeout, polling: 80 },
    label
  );
}

async function waitForVisiblePersonalImage(page, timeout = 20000) {
  await page.waitForFunction(
    () =>
      [...document.images].some(
        (image) =>
          image.offsetParent !== null &&
          image.src.startsWith('blob:') &&
          image.complete &&
          image.naturalWidth > 0 &&
          image.naturalHeight > 0
      ),
    { timeout, polling: 100 }
  );
  return page.evaluate(() => {
    const image = [...document.images].find(
      (candidate) =>
        candidate.offsetParent !== null &&
        candidate.src.startsWith('blob:') &&
        candidate.complete &&
        candidate.naturalWidth > 0 &&
        candidate.naturalHeight > 0
    );
    return image
      ? { src: image.src, width: image.naturalWidth, height: image.naturalHeight }
      : null;
  });
}

async function assertVisualReceipt(page, runId, prefix) {
  await page.waitForFunction(
    (storageKey, manifestationId, expectedPrefix) => {
      const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const manifestation = (state.manifestations || []).find(
        (item) => item && item.id === manifestationId
      );
      return Object.entries(manifestation?.journeyVisuals || {}).some(
        ([key, receipt]) =>
          key.startsWith(expectedPrefix) &&
          typeof receipt?.cacheKey === 'string' &&
          receipt.cacheKey.startsWith('visual-')
      );
    },
    { timeout: 20000, polling: 100 },
    STORAGE_KEY,
    runId,
    prefix
  );
}

async function seedPrivateMedia(page, fixtures) {
  const visualBytes = Array.from(Buffer.from(JPEG_FIXTURE, 'base64'));
  const audioBytes = Array.from(AUDIO_FIXTURE);
  await page.evaluate(
    async ({ visuals, audios, image, audio }) => {
      const openDatabase = (name, version, upgrade) =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open(name, version);
          request.onupgradeneeded = () => upgrade(request.result);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error || new Error(`indexeddb_open:${name}`));
        });
      const complete = (transaction) =>
        new Promise((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error || new Error('indexeddb_write'));
          transaction.onabort = () => reject(transaction.error || new Error('indexeddb_abort'));
        });

      const visualDatabase = await openDatabase('celeste-private-assets', 1, (database) => {
        if (!database.objectStoreNames.contains('personal-visuals')) {
          database.createObjectStore('personal-visuals');
        }
      });
      const visualTransaction = visualDatabase.transaction('personal-visuals', 'readwrite');
      const visualStore = visualTransaction.objectStore('personal-visuals');
      for (const entry of visuals) {
        const bytes = Uint8Array.from(image);
        visualStore.put(
          {
            bytes: bytes.buffer,
            mimeType: 'image/jpeg',
            createdAt: new Date().toISOString(),
          },
          entry.cacheKey
        );
      }
      await complete(visualTransaction);
      visualDatabase.close();

      const audioDatabase = await openDatabase(
        'celeste-private-narration-audio',
        2,
        (database) => {
          if (!database.objectStoreNames.contains('personal-audio')) {
            database.createObjectStore('personal-audio', { keyPath: 'key' });
          }
          if (!database.objectStoreNames.contains('cache-meta')) {
            database.createObjectStore('cache-meta', { keyPath: 'key' });
          }
        }
      );
      const audioTransaction = audioDatabase.transaction('personal-audio', 'readwrite');
      const audioStore = audioTransaction.objectStore('personal-audio');
      const now = Date.now();
      for (const entry of audios) {
        const bytes = Uint8Array.from(audio);
        audioStore.put({
          key: entry.key,
          bytes: bytes.buffer,
          size: bytes.byteLength,
          createdAt: now,
          lastAccessedAt: now,
        });
      }
      await complete(audioTransaction);
      audioDatabase.close();
    },
    {
      visuals: fixtures.visualEntries,
      audios: fixtures.audioEntries,
      image: visualBytes,
      audio: audioBytes,
    }
  );
}

async function pauseWithGlobalPlayer(page) {
  await page.click('[data-testid="narration-playback-toggle"]');
  await waitForPlayer(page, 'Áudio pausado');
}

async function stopGlobalPlayer(page) {
  const stop = await page.$('[data-testid="narration-playback-stop"]');
  if (stop) await stop.click();
  await page.waitForSelector('[data-testid="narration-playback-controls"]', {
    hidden: true,
    timeout: 10000,
  });
}

let browser;
let stage = 'boot';
let activePage;
let observedRequests;

(async () => {
  const { runId, seed, fixtures } = buildSeed();
  const visualRequests = [];
  const audioRequests = [];
  const authRequests = [];
  const unexpectedPaidRequests = [];
  const runtimeErrors = [];
  observedRequests = { visualRequests, audioRequests, authRequests, unexpectedPaidRequests };

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  activePage = page;
  page.on('pageerror', (error) => runtimeErrors.push(String(error)));

  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let requestPath = '';
    try {
      requestPath = new URL(request.url()).pathname;
    } catch (_error) {}

    if (request.method() === 'POST' && requestPath.endsWith('/auth/v1/signup')) {
      authRequests.push(requestPath);
      void request
        .respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'no-store' },
          body: JSON.stringify(mockSession()),
        })
        .catch(() => {});
      return;
    }

    const pathname = paidPath(request.url());
    if (!pathname || request.method() !== 'POST') {
      void request.continue().catch(() => {});
      return;
    }

    let body = {};
    try {
      body = JSON.parse(request.postData() || '{}');
    } catch (_error) {}

    if (pathname === '/api/gerar-visual') {
      visualRequests.push(body);
      void request
        .respond({
          status: 200,
          contentType: 'application/json',
          headers: { 'Cache-Control': 'no-store' },
          body: JSON.stringify({
            image: {
              mimeType: 'image/jpeg',
              data: JPEG_FIXTURE,
              bytes: Buffer.byteLength(JPEG_FIXTURE, 'base64'),
              aspectRatio: '4:5',
              imageSize: '1K',
            },
            generation: {
              source: 'e2e-fixture',
              model: 'e2e-fixture',
              promptVersion: 'celeste-visual-v1',
            },
          }),
        })
        .catch(() => {});
      return;
    }

    if (pathname === '/api/gerar-audio') {
      audioRequests.push(body);
      void request
        .respond({
          status: 200,
          contentType: 'audio/wav',
          headers: {
            'Cache-Control': 'no-store',
            'Content-Length': String(AUDIO_FIXTURE.byteLength),
          },
          body: AUDIO_FIXTURE,
        })
        .catch(() => {});
      return;
    }

    unexpectedPaidRequests.push(pathname);
    void request
      .respond({
        status: 418,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'unexpected_paid_request_in_media_e2e' }),
      })
      .catch(() => {});
  });

  // First navigation establishes the origin. The second one starts the app
  // with the deterministic onboarded state already in local storage.
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  stage = 'seed-state';
  await page.evaluate(
    ({ key, value, authKey, authSession }) => {
      localStorage.setItem(key, JSON.stringify(value));
      if (authKey) localStorage.setItem(authKey, JSON.stringify(authSession));
    },
    {
      key: STORAGE_KEY,
      value: seed,
      authKey: supabaseStorageKey(),
      authSession: mockSession(),
    }
  );
  await seedPrivateMedia(page, fixtures);
  // Metro keeps a development socket open, so networkidle would never be a
  // reliable readiness signal here. The visible screen below is the signal.
  stage = 'open-visions';
  await page.goto(`${URL}/visoes`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  stage = 'wait-visions-screen';
  await page.waitForFunction(() => document.body.innerText.includes('Visões'), {
    timeout: 30000,
  });
  stage = 'wait-vision-image';
  const visionImage = await waitForVisiblePersonalImage(page);
  stage = 'wait-vision-receipt';
  await assertVisualReceipt(page, runId, 'vision:');

  stage = 'start-vision-audio';
  await clickVisibleLabel(page, 'Tocar esta visão agora');
  await waitForPlayer(page, 'Narração pessoal');
  await pauseWithGlobalPlayer(page);
  await clickVisibleLabel(page, 'Continuar a narração');
  await waitForPlayer(page, 'Narração pessoal');
  const visionImageAfterResume = await waitForVisiblePersonalImage(page);
  if (visionImageAfterResume.src !== visionImage.src) {
    throw new Error('A imagem da visao foi trocada ao retomar o audio');
  }
  await stopGlobalPlayer(page);
  console.log('  [ok] Visoes: imagem pessoal + iniciar, pausar e retomar audio');

  stage = 'open-affirmations';
  await page.click('[data-testid="tab-affirmations"]');
  await page.waitForFunction(() => document.body.innerText.includes('Afirmações'), {
    timeout: 20000,
  });
  stage = 'wait-affirmation-image';
  const affirmationImage = await waitForVisiblePersonalImage(page);
  stage = 'wait-affirmation-receipt';
  await assertVisualReceipt(page, runId, 'affirmation:');

  stage = 'start-affirmation-audio';
  await clickVisibleLabel(page, 'Ouvir esta afirmação');
  await waitForPlayer(page, 'Narração pessoal');
  await pauseWithGlobalPlayer(page);
  await clickVisibleLabel(page, 'Continuar o áudio');
  await waitForPlayer(page, 'Narração pessoal');
  const affirmationImageAfterResume = await waitForVisiblePersonalImage(page);
  if (affirmationImageAfterResume.src !== affirmationImage.src) {
    throw new Error('A imagem da afirmacao foi trocada ao retomar o audio');
  }
  await stopGlobalPlayer(page);
  console.log('  [ok] Afirmacoes: imagem pessoal + iniciar, pausar e retomar audio');

  if (
    audioRequests.some(
      (request) =>
        request.mode !== 'personal' ||
        request.cloudConsent !== true ||
        request.cloudConsentVersion !== CLOUD_CONSENT_VERSION ||
        request.adultConfirmed !== true
    )
  ) {
    throw new Error('Contrato de audio pessoal divergente');
  }
  if (unexpectedPaidRequests.length) {
    throw new Error(`Rota paga inesperada: ${unexpectedPaidRequests.join(', ')}`);
  }
  if (runtimeErrors.length) {
    throw new Error(`Erro JavaScript no navegador: ${runtimeErrors[0]}`);
  }

  await sleep(100);
  await browser.close();
  browser = null;
  console.log(
    `\nOK E2E DE MIDIA: imagens e audios privados simulados; ${visualRequests.length + audioRequests.length} chamada(s) paga(s)`
  );
})().catch(async (error) => {
  console.error(`E2E DE MIDIA FALHOU [${stage}]:`, String(error).slice(0, 500));
  if (observedRequests) {
    console.error(
      '  requests:',
      JSON.stringify({
        visuals: observedRequests.visualRequests.map((item) => item.purpose),
        audios: observedRequests.audioRequests.length,
        auth: observedRequests.authRequests.length,
        unexpected: observedRequests.unexpectedPaidRequests,
      })
    );
  }
  if (activePage) {
    const stateDump = await activePage
      .evaluate((storageKey) => {
        const state = JSON.parse(localStorage.getItem(storageKey) || '{}');
        return {
          text: document.body.innerText.slice(0, 600),
          tail: document.body.innerText.slice(-600),
          hasVisualPending: !!document.querySelector('[data-testid="visions-personal-visual-pending"]'),
          hasVisualRetry: !!document.querySelector('[data-testid="visions-personal-visual-retry"]'),
          images: [...document.images].map((image) => ({
            src: image.src.slice(0, 80),
            visible: image.offsetParent !== null,
            complete: image.complete,
            width: image.naturalWidth,
            height: image.naturalHeight,
          })),
          profile: state.profile,
          journeyVisuals: state.manifestations?.[0]?.journeyVisuals || {},
        };
      }, STORAGE_KEY)
      .catch(() => null);
    if (stateDump) console.error('  browser:', JSON.stringify(stateDump));
  }
  if (browser) await browser.close().catch(() => {});
  process.exit(1);
});
