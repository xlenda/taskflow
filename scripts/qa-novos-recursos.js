const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');

const URL = process.env.TARGET_URL || 'http://127.0.0.1:4181';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOTS = process.env.QA_SHOTS_DIR
  ? path.resolve(process.env.QA_SHOTS_DIR)
  : path.join(__dirname, 'e2e-shots');
const STORAGE_KEY = '@stella_state_v2';
fs.mkdirSync(SHOTS, { recursive: true });

const state = {
  onboardingDone: true,
  lang: 'pt',
  name: 'Teste',
  mood: 'cloud',
  profile: { cloudPersonalization: false },
  manifestations: [],
  favoriteAffirmations: [],
  savedVisions: [],
  visionPlays: [],
  affirmationDates: [],
  morningRitual: {
    reminderEnabled: false,
    reminderTime: '06:30',
    wakeAffirmationId: 'custom',
    wakeAffirmationText: 'Eu acordo confiante e pronta para viver um dia extraordinário.',
    wakeAffirmationLang: 'pt',
    entries: [],
  },
};

const routes = [
  { path: 'ritual', id: 'daily-ritual-screen', slug: 'ritual' },
  { path: 'despertar', id: 'affirmation-alarm-screen', slug: 'despertador' },
  { path: 'sonhos', id: 'morning-ritual-screen', slug: 'sonhos' },
  { path: 'perfil', id: 'profile-screen', slug: 'perfil' },
  { path: 'comunidade', id: 'community-screen', slug: 'comunidade' },
  { path: 'jornada', id: 'journey-screen', slug: 'jornada' },
];

async function wheelIntoView(page, selector, viewport, maxSteps = 16) {
  for (let step = 0; step < maxSteps; step += 1) {
    const position = await page.$eval(selector, (element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        bottom: rect.bottom,
        visible: rect.top >= 0 && rect.bottom <= innerHeight,
      };
    });
    if (position.visible) return position;
    await page.mouse.move(Math.floor(viewport.width / 2), Math.floor(viewport.height / 2));
    await page.mouse.wheel({ deltaY: position.bottom > viewport.height ? 320 : -320 });
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return page.$eval(selector, (element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, visible: rect.top >= 0 && rect.bottom <= innerHeight };
  });
}

async function clickRadioByLabel(page, label) {
  const radios = await page.$$('[role="radio"]');
  for (const radio of radios) {
    const text = await radio.evaluate((element) => element.textContent.trim());
    if (text !== label) continue;
    await radio.focus();
    await page.keyboard.press('Enter');
    return;
  }
  throw new Error(`opção acessível da Comunidade não encontrada: ${label}`);
}

async function openCommunityComposer(page) {
  const trigger = await page.$(
    '[aria-label="Compartilhar com um Círculo"], [aria-label="Contar o que aconteceu"]'
  );
  if (!trigger) throw new Error('botão de composição da Comunidade não encontrado');
  await trigger.click();
}

async function fillCommunityStory(page, value) {
  await page.$eval('[data-testid="community-story-input"]', (input, story) => {
    const prototype = input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
    setter.call(input, story);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await page.waitForFunction((story) => {
    const input = document.querySelector('[data-testid="community-story-input"]');
    return input && input.value === story;
  }, { timeout: 10000 }, value);
}

let browser;

(async () => {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const seed = await browser.newPage();
  await seed.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await seed.evaluate((value) => localStorage.setItem('@stella_state_v2', JSON.stringify(value)), state);
  await seed.close();

  for (const viewport of [
    { width: 320, height: 480, label: '320x480' },
    { width: 390, height: 844, label: '390x844' },
    { width: 1280, height: 800, label: 'desktop' },
  ]) {
    for (const route of routes) {
      const page = await browser.newPage();
      await page.setViewport({ width: viewport.width, height: viewport.height });
      await page.goto(`${URL}/${route.path}`, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector(`[data-testid="${route.id}"]`, { visible: true, timeout: 30000 });
      const metrics = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      if (metrics.documentWidth > metrics.viewport + 1 || metrics.bodyWidth > metrics.viewport + 1) {
        throw new Error(`${route.path} transborda horizontalmente em ${viewport.label}: ${JSON.stringify(metrics)}`);
      }

      if (route.slug === 'jornada') {
        const navigationLayout = await page.evaluate(() => {
          const profile = document.querySelector('[data-testid="journey-open-profile"]');
          const tabs = [
            'tab-manifest',
            'tab-visions',
            'tab-affirmations',
            'tab-journey',
            'tab-community',
          ].map((id) => document.querySelector(`[data-testid="${id}"]`)).filter(Boolean);
          if (!profile) return { profileVisible: false, tabCount: tabs.length, tabsFit: false };
          const profileRect = profile.getBoundingClientRect();
          const visibleBottom = tabs.length
            ? Math.min(...tabs.map((tab) => tab.getBoundingClientRect().top))
            : innerHeight;
          return {
            profileVisible: profileRect.top >= 0 && profileRect.bottom <= visibleBottom,
            tabCount: tabs.length,
            tabsFit: tabs.every((tab) => {
              const rect = tab.getBoundingClientRect();
              return rect.left >= -1 && rect.right <= innerWidth + 1 && rect.width >= 44;
            }),
          };
        });
        if (!navigationLayout.profileVisible) {
          throw new Error(`Perfil continua escondido na Jornada em ${viewport.label}`);
        }
        if (navigationLayout.tabCount !== 5 || !navigationLayout.tabsFit) {
          throw new Error(`Cinco abas nao cabem em ${viewport.label}: ${JSON.stringify(navigationLayout)}`);
        }
      }

      if (route.slug === 'sonhos') {
        const dreamShortcutVisible = await page.$eval('[data-testid="open-dream-bonus"]', (element) => {
          const rect = element.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        });
        if (!dreamShortcutVisible) {
          throw new Error(`entrada para contar o sonho continua escondida em ${viewport.label}`);
        }
      }

      if (route.slug === 'ritual' && viewport.label === '320x480') {
        const startVisible = await page.$eval('[data-testid="start-daily-ritual"]', (element) => {
          const rect = element.getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        });
        if (!startVisible) {
          throw new Error('acao principal do Ritual ficou abaixo da primeira tela em 320x480');
        }
      }

      await page.screenshot({ path: path.join(SHOTS, `qa-${route.slug}-${viewport.label}-top.png`) });

      const scrollInfo = await page.evaluate(() => {
        const candidates = [...document.querySelectorAll('*')]
          .filter((element) => {
            const overflow = getComputedStyle(element).overflowY;
            return /^(auto|scroll)$/.test(overflow) && element.scrollHeight > element.clientHeight + 20;
          })
          .sort(
            (left, right) =>
              (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight)
          );
        const target = candidates[0] || null;
        if (!target) return null;
        target.dataset.qaScrollOwner = 'true';
        target.scrollTop = 0;
        return {
          clientHeight: target.clientHeight,
          scrollHeight: target.scrollHeight,
          overflowY: getComputedStyle(target).overflowY,
        };
      });

      const mustScroll =
        viewport.label !== 'desktop' &&
        ((route.slug === 'ritual' && viewport.label === '320x480') ||
          route.slug === 'despertador' ||
          route.slug === 'perfil' ||
          route.slug === 'jornada');
      if (mustScroll && !scrollInfo) {
        const diagnostics = await page.evaluate(() => ({
          innerHeight,
          body: { client: document.body.clientHeight, scroll: document.body.scrollHeight },
          root: {
            client: document.documentElement.clientHeight,
            scroll: document.documentElement.scrollHeight,
          },
          overflow: [...document.querySelectorAll('*')]
            .map((element) => ({
              tag: element.tagName,
              client: element.clientHeight,
              scroll: element.scrollHeight,
              overflowY: getComputedStyle(element).overflowY,
            }))
            .filter((item) => item.scroll > item.client)
            .slice(0, 8),
        }));
        throw new Error(
          `${route.path} não possui um contêiner rolável real em ${viewport.label}: ${JSON.stringify(diagnostics)}`
        );
      }
      if (scrollInfo) {
        await page.mouse.move(Math.floor(viewport.width / 2), Math.max(80, viewport.height - 90));
        await page.mouse.wheel({ deltaY: Math.max(700, scrollInfo.scrollHeight) });
        await new Promise((resolve) => setTimeout(resolve, 350));
        const gestureTop = await page.$eval('[data-qa-scroll-owner="true"]', (element) => element.scrollTop);
        if (mustScroll && gestureTop < 20) {
          throw new Error(`${route.path} não respondeu ao gesto de rolagem em ${viewport.label}`);
        }
        await page.$eval('[data-qa-scroll-owner="true"]', (element) => {
          element.scrollTop = element.scrollHeight;
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));

      if (route.slug === 'perfil' && viewport.label !== 'desktop') {
        const reachable = await page.evaluate(() => {
          const terms = document.querySelector('[data-testid="profile-terms-link"]');
          const footer = document.querySelector('[data-testid="profile-footer"]');
          if (!terms || !footer) return false;
          const termsRect = terms.getBoundingClientRect();
          const footerRect = footer.getBoundingClientRect();
          return termsRect.top < innerHeight && termsRect.bottom > 0 && footerRect.top < innerHeight && footerRect.bottom > 0;
        });
        if (!reachable) throw new Error(`rodapé do Perfil continua inacessível em ${viewport.label}`);
      }

      await page.screenshot({ path: path.join(SHOTS, `qa-${route.slug}-${viewport.label}-bottom.png`) });
      await page.close();
    }
  }

  // A Home deve levar ao campo de sonho em um unico toque. Antes, ela abria
  // uma tela intermediaria e o TextInput so existia depois de um segundo toque.
  for (const viewport of [
    { width: 320, height: 480, label: '320x480' },
    { width: 390, height: 844, label: '390x844' },
  ]) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('[data-testid="open-dream-journal"]', { visible: true, timeout: 30000 });
    const entryVisible = await page.$eval('[data-testid="open-dream-journal"]', (element) => {
      const rect = element.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight;
    });
    if (!entryVisible) throw new Error(`atalho de sonho da Home esta escondido em ${viewport.label}`);
    await page.click('[data-testid="open-dream-journal"]');
    await page.waitForFunction(() => {
      const input = document.querySelector('[data-testid="dream-report-input"]');
      if (!input) return false;
      const rect = input.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= innerHeight && document.activeElement === input;
    }, { timeout: 30000 });
    const route = await page.evaluate(() => location.pathname);
    if (!route.includes('/sonhos')) throw new Error(`atalho de sonho abriu rota errada: ${route}`);
    await page.type('[data-testid="dream-report-input"]', 'Luz sobre o mar');
    if (viewport.label === '320x480') {
      await page.click('[data-testid="dream-feeling-calm"]');
      await page.click('[data-testid="dream-theme-clarity"]');
      await page.click('[data-testid="transform-dream"]');
      await page.waitForSelector('[data-testid="dream-personalized-affirmation"]', {
        visible: true,
        timeout: 30000,
      });
      await page.waitForFunction(() => {
        const element = document.querySelector('[data-testid="dream-personalized-affirmation"]');
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= innerHeight;
      }, { timeout: 30000, polling: 100 });
      const resultPosition = await page.$eval('[data-testid="dream-personalized-affirmation"]', (element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, visible: rect.top >= 0 && rect.bottom <= innerHeight };
      });
      if (!resultPosition.visible) throw new Error('resultado do sonho nao e alcancavel em 320x480');
      await page.waitForFunction(() => {
        const saved = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}');
        const entry = saved.morningRitual?.entries?.[0];
        return entry?.dream === 'Luz sobre o mar' && typeof entry?.affirmation === 'string';
      }, { timeout: 30000, polling: 200 });
    }
    await page.screenshot({ path: path.join(SHOTS, `qa-home-sonho-um-toque-${viewport.label}.png`) });
    if (viewport.label === '320x480') {
      await page.click('[data-testid="morning-ritual-back"]');
      await page.waitForFunction(() => location.pathname === '/', { timeout: 30000 });
      const alarmPreserved = await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}');
        return saved.morningRitual?.wakeAffirmationId === 'custom' &&
          saved.morningRitual?.reminderTime === '06:30' &&
          saved.morningRitual?.reminderEnabled === false &&
          saved.morningRitual?.wakeAffirmationText === 'Eu acordo confiante e pronta para viver um dia extraordinário.' &&
          saved.morningRitual?.wakeAffirmationLang === 'pt';
      });
      if (!alarmPreserved) throw new Error('voltar do sonho alterou o despertador salvo');
    }
    await page.close();
  }

  const journeyPage = await browser.newPage();
  await journeyPage.setViewport({ width: 320, height: 480 });
  await journeyPage.goto(`${URL}/jornada`, { waitUntil: 'networkidle2', timeout: 60000 });
  await journeyPage.waitForSelector('[data-testid="journey-open-profile"]', { visible: true, timeout: 30000 });
  await journeyPage.click('[data-testid="journey-open-profile"]');
  await journeyPage.waitForSelector('[data-testid="profile-screen"]', { visible: true, timeout: 30000 });
  await journeyPage.close();

  const dreamPage = await browser.newPage();
  await dreamPage.setViewport({ width: 320, height: 480 });
  await dreamPage.goto(`${URL}/sonhos`, { waitUntil: 'networkidle2', timeout: 60000 });
  await dreamPage.waitForSelector('[data-testid="open-dream-bonus"]', { visible: true, timeout: 30000 });
  await dreamPage.click('[data-testid="open-dream-bonus"]');
  await dreamPage.waitForFunction(() => {
    const input = document.querySelector('[data-testid="dream-report-input"]');
    if (!input) return false;
    const rect = input.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight;
  }, { timeout: 30000 });
  await dreamPage.screenshot({ path: path.join(SHOTS, 'qa-sonhos-320x480.png') });
  await dreamPage.close();

  // Regressão: o compositor exige tipo e Círculo antes da prévia e informa,
  // antes da ação, se o relato será enviado ou ficará somente no aparelho.
  // A sequência completa precisa continuar rolável e sem overflow em todos os tamanhos.
  for (const communityViewport of [
    { width: 320, height: 480, label: '320x480' },
    { width: 390, height: 844, label: '390x844' },
    { width: 1280, height: 800, label: 'desktop' },
  ]) {
    const communityPage = await browser.newPage();
    await communityPage.setViewport(communityViewport);
    await communityPage.goto(`${URL}/comunidade`, { waitUntil: 'networkidle2', timeout: 60000 });
    await communityPage.waitForSelector('[data-testid="community-screen"]', { visible: true, timeout: 30000 });
    await openCommunityComposer(communityPage);
    await communityPage.waitForSelector('[data-testid="community-story-input"]', { visible: true, timeout: 30000 });
    await clickRadioByLabel(communityPage, 'Ação');
    await clickRadioByLabel(communityPage, 'Paz e presença');
    await fillCommunityStory(
      communityPage,
      'Passei a agir com mais calma e confiança durante esta semana.'
    );
    await communityPage.waitForSelector('[data-testid="community-submit-notice"]', { visible: true, timeout: 30000 });
    const hasPublicationConsent = !!(await communityPage.$('[data-testid="community-consent"]'));

    const layout = await communityPage.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    if (layout.documentWidth > layout.viewport + 1 || layout.bodyWidth > layout.viewport + 1) {
      throw new Error(`compositor da Comunidade transborda em ${communityViewport.label}: ${JSON.stringify(layout)}`);
    }

    const actionNoticePosition = await wheelIntoView(
      communityPage,
      hasPublicationConsent
        ? '[data-testid="community-consent"]'
        : '[data-testid="community-submit-notice"]',
      communityViewport
    );
    if (!actionNoticePosition.visible) {
      throw new Error(
        `aviso da ação da Comunidade continua inacessível em ${communityViewport.label}: ${JSON.stringify(actionNoticePosition)}`
      );
    }
    if (communityViewport.width === 320) {
      const communityScrollTop = await communityPage.$eval(
        '[data-testid="community-scroll"]',
        (element) => element.scrollTop
      );
      if (communityScrollTop < 20) {
        throw new Error('compositor da Comunidade não respondeu ao gesto de rolagem em 320x480');
      }
    }

    if (hasPublicationConsent) {
      await communityPage.click('[data-testid="community-consent"]');
    } else {
      const localNotice = await communityPage.$eval(
        '[data-testid="community-submit-notice"]',
        (element) => element.textContent
      );
      if (!/apenas neste aparelho|only on this device/i.test(localNotice)) {
        throw new Error(`modo local não explicou o destino do relato: ${localNotice}`);
      }
    }
    const submitPosition = await wheelIntoView(
      communityPage,
      '[data-testid="community-submit"]',
      communityViewport
    );
    if (!submitPosition.visible) {
      throw new Error(
        `envio da Comunidade continua inacessível em ${communityViewport.label}: ${JSON.stringify(submitPosition)}`
      );
    }
    await communityPage.click('[data-testid="community-submit"]');
    await communityPage.waitForFunction(
      () => document.body.innerText.includes('Rascunho salvo neste aparelho'),
      { timeout: 30000 }
    );
    await communityPage.screenshot({
      path: path.join(SHOTS, `qa-comunidade-${communityViewport.label}-compositor-enviado.png`),
    });
    await communityPage.close();
  }

  // Cada rota também precisa voltar ao app quando foi aberta diretamente e o
  // stack não possui histórico interno.
  for (const route of routes.filter((item) => item.slug !== 'jornada')) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    await page.goto(`${URL}/${route.path}`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector(`[data-testid="${route.id}"]`, { visible: true, timeout: 30000 });
    const backId =
      route.slug === 'despertador'
        ? 'affirmation-alarm-back'
        : route.slug === 'sonhos'
        ? 'morning-ritual-back'
        : null;
    if (route.slug === 'comunidade') {
      await page.evaluate(() => {
        const label = [...document.querySelectorAll('div, span')].find(
          (element) =>
            element.children.length === 0 &&
            element.textContent.trim() === 'Manifestar' &&
            element.offsetParent !== null
        );
        const target = label && (label.closest('[role="tab"]') || label.parentElement);
        if (!target) throw new Error('aba Manifestar nao encontrada');
        target.click();
      });
    } else if (backId) {
      await page.click(`[data-testid="${backId}"]`);
    } else {
      await page.click('[aria-label="Voltar"]');
    }
    await page.waitForFunction(() => document.body.innerText.includes('Manifestar'), { timeout: 20000 });
    await page.close();
  }

  // Manifestacoes pessoais antigas eram strings congeladas no idioma de criacao.
  // A troca PT -> EN -> PT precisa localizar a cena, sobreviver ao reload e
  // restaurar exatamente a versao original quando a pessoa volta ao idioma.
  const languagePage = await browser.newPage();
  await languagePage.setViewport({ width: 390, height: 844 });
  const translationRequests = [];
  const exactEnglishStory = 'The blue mug is beside the window while you watch the morning light over the sea.';
  const originalPtStory = 'A caneca azul fica ao lado da janela. Esta historia original em portugues precisa voltar exatamente como foi salva.';
  const languageState = {
    ...state,
    lang: 'pt',
    profile: {
      cloudConsentVersion: CLOUD_CONSENT_VERSION,
      cloudPersonalization: true,
      cloudAdultConfirmed: true,
      age: '25-34',
      name: 'Ana',
      aboutYou: 'criativa e persistente',
      obstacle: 'medo de comecar',
      whyMatters: 'ter liberdade para cuidar de mim',
      dreamLocation: 'Lisboa',
    },
    manifestations: [
      {
        id: 'm-language-qa',
        title: 'viver perto do mar',
        category: 'Peace',
        accent: 2,
        lang: 'pt',
        intention: 'Viver perto do mar como algo normal.',
        affirmation: 'Eu escolho construir uma vida perto do mar com calma.',
        story: originalPtStory,
        anchorIdentity: 'Eu protejo minha atencao e escolho o que merece entrar no meu dia.',
        anchorStep: 'Quando o medo aparecer, entao vou respirar por dois minutos.',
        personalizedWith: ['onde quer morar'],
        generation: { source: 'gemini', model: 'qa-source', promptVersion: 'celeste-scene-v7' },
        goalDays: 21,
        createdAt: '2026-08-25',
        sessions: [],
        evidence: [],
      },
    ],
  };
  await languagePage.evaluateOnNewDocument((key, value) => {
    const marker = '__celeste_language_qa_seeded';
    if (sessionStorage.getItem(marker) === '1') return;
    localStorage.setItem(key, JSON.stringify(value));
    sessionStorage.setItem(marker, '1');
  }, STORAGE_KEY, languageState);
  await languagePage.setRequestInterception(true);
  languagePage.on('request', (request) => {
    if (request.url().endsWith('/api/traduzir-cena')) {
      translationRequests.push(JSON.parse(request.postData() || '{}'));
      request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          scene: {
            title: 'living near the sea',
            intention: 'Live near the sea with calm and consistency.',
            affirmation: 'I choose a calm life near the sea while honoring my creative nature.',
            story: exactEnglishStory,
            anchorIdentity: 'I protect my attention and make room for what matters.',
            anchorStep: 'When fear appears, then I will breathe for two minutes.',
            personalizedWith: ['where you want to live'],
          },
          generation: {
            source: 'gemini-translation',
            model: 'qa-model',
            promptVersion: 'celeste-translation-v1',
            seed: 25,
          },
        }),
      }).catch(() => {});
      return;
    }
    request.continue().catch(() => {});
  });
  await languagePage.goto(`${URL}/perfil`, { waitUntil: 'networkidle2', timeout: 60000 });
  await languagePage.waitForSelector('[data-testid="profile-language-en"]', { visible: true, timeout: 30000 });
  await languagePage.click('[data-testid="profile-language-en"]');
  await languagePage.waitForFunction((expectedStory) => {
    const saved = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}');
    const item = saved.manifestations?.[0];
    const generated = item
      ? [item.intention, item.affirmation, item.story, item.anchorIdentity, item.anchorStep].join(' ')
      : '';
    const mixedPortuguese = /\b(viver|voce|você|eu|meu|minha|perto|medo|comecar|começar|liberdade|cuidar|criativa|persistente)\b/i;
    return saved.lang === 'en' &&
      item?.lang === 'en' &&
      item?.generation?.source === 'gemini-translation' &&
      item?.story === expectedStory &&
      !mixedPortuguese.test(generated);
  }, { timeout: 30000, polling: 200 }, exactEnglishStory);
  if (translationRequests.length !== 1) {
    throw new Error(`AppContext fez ${translationRequests.length} chamadas de traducao; esperado 1`);
  }
  if (
    translationRequests[0].scene?.story !== originalPtStory ||
    Object.prototype.hasOwnProperty.call(translationRequests[0], 'profile')
  ) {
    throw new Error('ligacao AppContext -> traducao perdeu a origem ou enviou o perfil inteiro');
  }
  await languagePage.goto(`${URL}/m/m-language-qa`, { waitUntil: 'networkidle2', timeout: 60000 });
  await languagePage.waitForFunction(
    (expectedStory) => document.body.innerText.includes(expectedStory) && !document.body.innerText.includes('Esta historia original em portugues'),
    { timeout: 30000, polling: 200 },
    exactEnglishStory
  );
  await languagePage.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await languagePage.waitForFunction(
    (expectedStory) => document.body.innerText.includes(expectedStory) && !document.body.innerText.includes('Esta historia original em portugues'),
    { timeout: 30000, polling: 200 },
    exactEnglishStory
  );
  await languagePage.goto(`${URL}/perfil`, { waitUntil: 'networkidle2', timeout: 60000 });
  await languagePage.waitForSelector('[data-testid="profile-language-pt"]', { visible: true, timeout: 30000 });
  await languagePage.click('[data-testid="profile-language-pt"]');
  await languagePage.waitForFunction((expectedStory) => {
    const saved = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}');
    const item = saved.manifestations?.[0];
    return saved.lang === 'pt' && item?.lang === 'pt' && item.story === expectedStory;
  }, { timeout: 30000, polling: 200 }, originalPtStory);
  await languagePage.goto(`${URL}/m/m-language-qa`, { waitUntil: 'networkidle2', timeout: 60000 });
  await languagePage.waitForFunction(
    (expectedStory) => document.body.innerText.includes(expectedStory),
    { timeout: 30000, polling: 200 },
    originalPtStory
  );
  await languagePage.screenshot({ path: path.join(SHOTS, 'qa-manifestacao-traducao-restaurada.png') });
  await languagePage.close();

  await browser.close();
  browser = null;
  console.log('OK: telas responsivas; sonho em um toque; manifestacao PT/EN persistente; Comunidade rolavel');
})().catch(async (error) => {
  console.error(error.stack || error);
  if (browser) await browser.close().catch(() => {});
  process.exit(1);
});
