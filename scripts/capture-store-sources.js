const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'store-listing', 'assets', 'raw');
const URL = (process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app').replace(/\/$/, '');
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
const STORAGE_KEY = '@stella_state_v2';
const REQUESTED_PLATFORM = String(process.env.STORE_PLATFORM || '').trim();

const DEVICES = {
  apple: {
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  },
  'google-play': {
    width: 360,
    height: 640,
    deviceScaleFactor: 3,
    userAgent:
      'Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0 Mobile Safari/537.36',
  },
};

const copy = {
  'pt-BR': {
    lang: 'pt',
    name: 'Ana',
    title: 'Trabalho e liberdade',
    intention: 'Construir uma rotina em que meu trabalho tenha espaço e liberdade.',
    affirmation: 'Eu abro espaço para meu trabalho ser visto e avanço com clareza, cuidado e constância.',
    generatedAffirmation:
      'Eu torno meu trabalho mais visível por meio de passos consistentes. Eu reconheço o valor do que aprendo e termino.',
    story:
      'É de manhã e a luz entra pela janela da casa perto do mar. Você abre sua agenda sem pressa e encontra espaço para o trabalho que escolheu construir. Uma mensagem confirma a conversa profissional que você decidiu iniciar. A liberdade que deseja não parece distante: ela aparece nas decisões pequenas que você já consegue tomar hoje.',
    identity: 'Eu trato meu trabalho com clareza, cuidado e constância.',
    step: 'Enviar uma mensagem profissional que depende apenas de mim e leva menos de dez minutos.',
    trace: 'Enviei a mensagem que eu vinha adiando e marquei a primeira conversa.',
    dream: 'Uma casa clara perto do mar, com todas as janelas abertas.',
    dreamAffirmation: 'Eu abro espaço para clareza e escolho o próximo passo com calma.',
    dreamReflection:
      'A casa clara e as janelas abertas podem servir como uma imagem pessoal de espaço e renovação, sem transformar o sonho em previsão.',
    listenAffirmation: 'Ouvir esta afirmação',
    listenResult: 'Ouvir',
    useTomorrow: 'Usar no próximo despertar',
    audioTitle: 'Sua narrativa em áudio',
    community: 'Comunidade',
    cloudProcessing: 'Processamento em nuvem',
    privacyAndData: 'Privacidade e dados',
    journeyPracticeHint:
      'Prática é uma sessão de manifestação, uma visão ouvida até o fim ou uma afirmação recebida.',
  },
  'en-US': {
    lang: 'en',
    name: 'Ana',
    title: 'Work and freedom',
    intention: 'Build a routine where my work has room to grow with freedom.',
    affirmation: 'I make room for my work to be seen and move forward with clarity, care, and consistency.',
    generatedAffirmation:
      'I make my work more visible through consistent steps toward work and freedom. I recognize the value of what I learn and finish.',
    story:
      'Morning light enters the house near the sea. You open your calendar without rushing and find room for the work you chose to build. A message confirms the professional conversation you decided to begin. The freedom you want no longer feels distant: it is present in the small decisions you can make today.',
    identity: 'I treat my work with clarity, care, and consistency.',
    step: 'Send one professional message that depends only on me and takes less than ten minutes.',
    trace: 'I sent the message I had been postponing and scheduled the first conversation.',
    dream: 'A bright house near the sea, with every window open.',
    dreamAffirmation: 'I make room for clarity and choose my next step calmly.',
    dreamReflection:
      'The bright house and open windows can be a personal image of space and renewal without turning the dream into a prediction.',
    listenAffirmation: 'Listen to this affirmation',
    listenResult: 'Listen',
    useTomorrow: 'Use for my next wake-up',
    audioTitle: 'Your audio narrative',
    community: 'Community',
    cloudProcessing: 'Cloud processing',
    privacyAndData: 'Privacy and data',
    journeyPracticeHint:
      'A practice is a manifestation session, a vision heard to the end or an affirmation received.',
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function dayOffset(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function buildState(locale) {
  const c = copy[locale];
  const sessions = [-6, -5, -4, -2, -1, 0].map(dayOffset);
  const createdAt = `${sessions[0]}T12:00:00.000Z`;
  const dreamId = 'dream-store';
  return {
    name: c.name,
    lang: c.lang,
    onboardingDone: true,
    mood: 'cloud',
    narration: { narratorId: 'rio' },
    profile: {
      name: c.name,
      city: c.lang === 'pt' ? 'Florianópolis' : 'San Diego',
      age: '25-34',
      cloudAdultConfirmed: false,
      cloudPersonalization: false,
      cloudNarrationConsent: false,
      cloudDreamConsent: false,
    },
    manifestations: [
      {
        id: 'm-store',
        title: c.title,
        category: 'Career',
        accent: 3,
        lang: c.lang,
        intention: c.intention,
        affirmation: c.affirmation,
        story: c.story,
        anchorIdentity: c.identity,
        anchorStep: c.step,
        anchorOpenedAt: createdAt,
        personalizedWith:
          c.lang === 'pt'
            ? ['seu desejo', 'seu trabalho', 'casa perto do mar', 'clareza']
            : ['your wish', 'your work', 'house near the sea', 'clarity'],
        goalDays: 21,
        createdAt,
        sessions,
        evidence: [
          {
            id: 'trace-store',
            text: c.trace,
            createdAt: `${dayOffset(-1)}T18:30:00.000Z`,
          },
        ],
        livingMirror: {
          version: 1,
          chapter: 2,
          lastEvolvedOn: dayOffset(-2),
          lastMemorySignature: 'store-demo-previous',
          bridgeCompletions: [
            {
              id: 'bridge-store',
              date: dayOffset(-1),
              step: c.step,
              chapter: 2,
              completedAt: `${dayOffset(-1)}T16:00:00.000Z`,
            },
          ],
          chapters: [],
        },
        generation: { source: 'local', promptVersion: 'store-demo-v1' },
      },
    ],
    favoriteAffirmations: ['manifestation:m-store', `ritual:${dreamId}`],
    savedVisions: ['m-store'],
    visionPlays: [{ visionId: 'm-store', date: dayOffset(-1) }],
    affirmationDates: sessions,
    dailyRitual: {
      reminderEnabled: false,
      reminderTime: '20:30',
      notificationId: null,
      permission: 'unknown',
    },
    morningRitual: {
      alarmStatus: 'native_integration_required',
      reminderEnabled: false,
      alarmSyncError: false,
      reminderTime: '07:00',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      wakeAffirmationId: 'manifestation:m-store',
      wakeAffirmationText: c.affirmation,
      wakeAffirmationLang: c.lang,
      wakeNarratorId: 'rio',
      wakeSoundSource: null,
      entries: [
        {
          id: dreamId,
          dream: c.dream,
          feeling: 'calm',
          theme: 'clarity',
          affirmation: c.dreamAffirmation,
          reflection: c.dreamReflection,
          dreamAnchor: c.lang === 'pt' ? 'janelas abertas' : 'open windows',
          usedDetails: ['dream_anchor', 'feeling', 'theme'],
          generatorVersion: 'dream-local-v3',
          lang: c.lang,
          createdAt: `${dayOffset(-1)}T07:10:00.000Z`,
          practiceCount: 1,
          lastPracticedAt: `${dayOffset(-1)}T07:20:00.000Z`,
          useInLivingMirror: true,
        },
      ],
    },
  };
}

async function waitForText(page, text) {
  await page.waitForFunction(
    (value) => document.body && document.body.innerText.includes(value),
    { timeout: 30000 },
    text
  );
}

async function resetAndOpen(page, state, route, ready) {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: STORAGE_KEY, value: state }
  );
  await page.goto(`${URL}${route}`, { waitUntil: 'networkidle2', timeout: 60000 });
  if (ready.startsWith('[')) {
    await page.waitForSelector(ready, { visible: true, timeout: 30000 });
  } else {
    await waitForText(page, ready);
  }
  await sleep(900);
}

async function scrollTo(page, selector, block = 'center') {
  await page.$eval(selector, (element, position) => {
    element.scrollIntoView({ block: position, inline: 'nearest' });
  }, block);
  await sleep(500);
}

async function scrollToText(page, text, block = 'start') {
  await page.evaluate(
    ({ value, position }) => {
      const element = [...document.querySelectorAll('*')].find(
        (candidate) => candidate.children.length === 0 && candidate.textContent.trim() === value
      );
      if (!element) throw new Error(`Could not find text to scroll to: ${value}`);
      element.scrollIntoView({ block: position, inline: 'nearest' });
    },
    { value: text, position: block }
  );
  await sleep(500);
}

async function scrollToTextWithTopPadding(page, text, padding = 36) {
  await page.evaluate(
    ({ value, offset }) => {
      const element = [...document.querySelectorAll('*')].find(
        (candidate) => candidate.children.length === 0 && candidate.textContent.trim() === value
      );
      if (!element) throw new Error(`Could not find text to scroll to: ${value}`);
      element.scrollIntoView({ block: 'start', inline: 'nearest' });
      let scroller = element.parentElement;
      while (scroller && scroller !== document.body) {
        const style = window.getComputedStyle(scroller);
        if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) {
          scroller.scrollTop = Math.max(0, scroller.scrollTop - offset);
          return;
        }
        scroller = scroller.parentElement;
      }
      window.scrollBy(0, -offset);
    },
    { value: text, offset: padding }
  );
  await sleep(500);
}

async function hideButtonWithText(page, text) {
  await page.evaluate((value) => {
    const label = [...document.querySelectorAll('*')].find(
      (candidate) => candidate.children.length === 0 && candidate.textContent.trim() === value
    );
    const button = label && (
      label.closest('[role="button"], [role="link"], [role="tab"], [role="switch"]') ||
      label.parentElement
    );
    if (button) button.style.display = 'none';
  }, text);
  await sleep(150);
}

async function hideExactText(page, text) {
  await page.evaluate((value) => {
    for (const label of [...document.querySelectorAll('*')].filter(
      (candidate) => candidate.children.length === 0 && candidate.textContent.trim() === value
    )) {
      label.style.display = 'none';
    }
  }, text);
  await sleep(100);
}

async function applyGooglePlayBoundaryDraft(page, localizedCopy) {
  await hideButtonWithText(page, localizedCopy.community);
  await hideButtonWithText(page, localizedCopy.cloudProcessing);
  await hideButtonWithText(page, localizedCopy.listenAffirmation);
  await hideButtonWithText(page, localizedCopy.listenResult);
  await hideButtonWithText(page, localizedCopy.useTomorrow);
}

async function focusPrivacySection(page) {
  await page.evaluate(() => {
    const privacyLink = document.querySelector('[data-testid="profile-privacy-link"]');
    const termsLink = document.querySelector('[data-testid="profile-terms-link"]');
    if (!privacyLink || !termsLink) throw new Error('Privacy controls are unavailable');

    let group = privacyLink;
    while (group && !group.contains(termsLink)) group = group.parentElement;
    if (!group || !group.parentElement) throw new Error('Privacy group could not be isolated');

    const column = group.parentElement;
    const sectionTitle = group.previousElementSibling;
    const pageHeading = column.firstElementChild;
    const keep = new Set([pageHeading, sectionTitle, group]);
    for (const child of [...column.children]) {
      if (!keep.has(child) && !child.contains(group)) child.style.display = 'none';
    }

    for (let scroller = group.parentElement; scroller; scroller = scroller.parentElement) {
      if (scroller.scrollHeight > scroller.clientHeight) scroller.scrollTop = 0;
    }
  });
  await sleep(250);
}

async function hideSectionStartingWithText(page, text) {
  await page.evaluate((value) => {
    const label = [...document.querySelectorAll('*')].find(
      (candidate) => candidate.children.length === 0 && candidate.textContent.trim() === value
    );
    if (!label) return;

    let heading = label;
    while (heading.parentElement && heading.parentElement.children.length === 1) {
      heading = heading.parentElement;
    }
    const parent = heading.parentElement;
    if (!parent) return;
    const siblings = [...parent.children];
    const index = siblings.indexOf(heading);
    heading.style.display = 'none';
    if (index >= 0 && siblings[index + 1]) siblings[index + 1].style.display = 'none';
  }, text);
  await sleep(150);
}

async function shot(page, directory, name) {
  const file = path.join(directory, `${name}.png`);
  await page.screenshot({ path: file, type: 'png', fullPage: false });
  if (fs.statSync(file).size < 10000) throw new Error(`Screenshot looks empty: ${file}`);
  process.stdout.write(`  ${name}.png\n`);
}

async function captureSet(browser, platform, locale) {
  const device = DEVICES[platform];
  const state = buildState(locale);
  const c = copy[locale];
  const directory = path.join(OUTPUT, platform, locale);
  fs.mkdirSync(directory, { recursive: true });

  const page = await browser.newPage();
  await page.setViewport({
    width: device.width,
    height: device.height,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  });
  await page.setUserAgent(device.userAgent);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const saveShot = async (name) => {
    if (platform === 'google-play') await applyGooglePlayBoundaryDraft(page, c);
    await shot(page, directory, name);
  };

  process.stdout.write(`${platform}/${locale}\n`);

  if (platform === 'google-play') {
    for (const obsolete of ['narrators.png', 'affirmations.png']) {
      const file = path.join(directory, obsolete);
      if (fs.existsSync(file)) fs.rmSync(file);
    }
  }

  await resetAndOpen(page, state, '/m/m-store', c.title);
  await saveShot('manifestation-top');

  if (platform === 'apple') {
    await resetAndOpen(page, state, '/perfil', '[data-testid="narrator-selector"]');
    await scrollTo(page, '[data-testid="narrator-selector"]', 'start');
    await saveShot('narrators');
  } else {
    await resetAndOpen(page, state, '/perfil', '[data-testid="profile-privacy-link"]');
    await applyGooglePlayBoundaryDraft(page, c);
    await focusPrivacySection(page);
    await saveShot('profile-privacy');
  }

  await resetAndOpen(page, state, '/afirmacoes', '[data-testid="affirmation-filter-Career"]');
  await page.click('[data-testid="affirmation-filter-Career"]');
  await sleep(500);
  if (platform === 'google-play') {
    await hideButtonWithText(page, c.listenAffirmation);
    await scrollToTextWithTopPadding(page, c.generatedAffirmation, 96);
    await saveShot('affirmations-text-card');
  } else {
    await saveShot('affirmations');
  }

  await resetAndOpen(page, state, '/m/m-store', '[data-testid="toggle-bridge-completion"]');
  await scrollToTextWithTopPadding(page, locale === 'pt-BR' ? 'Sua ponte para hoje' : 'Your bridge to today');
  if (platform === 'google-play') await hideSectionStartingWithText(page, c.audioTitle);
  await saveShot('manifestation-bridge');

  await resetAndOpen(page, state, '/ritual', '[data-testid="daily-ritual-screen"]');
  await saveShot('daily-ritual');

  await resetAndOpen(page, state, '/sonhos', '[data-testid="open-dream-bonus"]');
  await page.click('[data-testid="open-dream-bonus"]');
  await page.waitForSelector('[data-testid="dream-report-input"]', { visible: true, timeout: 15000 });
  await page.type('[data-testid="dream-report-input"]', c.dream, { delay: 1 });
  await page.click('[data-testid="dream-feeling-calm"]');
  await page.click('[data-testid="dream-theme-clarity"]');
  await page.click('[data-testid="transform-dream"]');
  await page.waitForSelector('[data-testid="dream-personalized-affirmation"]', {
    visible: true,
    timeout: 30000,
  });
  await scrollTo(page, '[data-testid="dream-result-panel"]', 'start');
  await page.$eval('[data-testid="morning-ritual-scroll"]', (element) => {
    element.scrollTop = Math.max(0, element.scrollTop - 118);
  });
  await sleep(400);
  await saveShot('dream-result');

  await resetAndOpen(page, state, '/', '[data-testid="open-daily-ritual"]');
  await scrollToText(page, locale === 'pt-BR' ? 'Suas manifestações' : 'Your manifestations');
  await saveShot('home');

  await resetAndOpen(page, state, '/m/m-store', locale === 'pt-BR' ? 'Sua constância' : 'Practice progress');
  await scrollToText(page, locale === 'pt-BR' ? 'Sua constância' : 'Practice progress');
  await saveShot('manifestation-progress');

  await resetAndOpen(page, state, '/jornada', '[data-testid="journey-screen"]');
  await scrollToTextWithTopPadding(page, c.title, 88);
  if (platform === 'google-play') await hideExactText(page, c.journeyPracticeHint);
  await saveShot('journey');

  await page.close();
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox'],
  });
  try {
    const platforms = REQUESTED_PLATFORM ? [REQUESTED_PLATFORM] : Object.keys(DEVICES);
    if (platforms.some((platform) => !DEVICES[platform])) {
      throw new Error(`Unsupported STORE_PLATFORM: ${REQUESTED_PLATFORM}`);
    }
    for (const platform of platforms) {
      for (const locale of Object.keys(copy)) {
        await captureSet(browser, platform, locale);
      }
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(`Store source screenshots written to ${OUTPUT}\n`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
