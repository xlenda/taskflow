// Portão E2E do Celeste: percorre o onboarding INTEIRO em produção (ou TARGET_URL),
// verifica cada tela de chips, o paywall e a entrada no app principal.
// Nasceu de um bug real (08/2026): chips não apareciam porque o navegador
// estrangulava os timers do efeito de digitação em aba de fundo.
// Uso: node scripts/e2e-prod.js   (CHROME_PATH pra sobrescrever o Chrome)
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const USE_GEMINI = process.env.E2E_GEMINI === '1';
const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT_DIR = path.join(__dirname, 'e2e-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const visibleLeafFn = `
  (t) => {
    const els = [...document.querySelectorAll('div, span, button')];
    return els.find(e => {
      if (e.children.length !== 0 || e.textContent.trim() !== t || e.offsetParent === null) return false;
      let n = e;
      for (let i = 0; i < 8 && n; i++) {
        const st = getComputedStyle(n);
        if (st.visibility === 'hidden' || parseFloat(st.opacity) < 0.5) return false;
        n = n.parentElement;
      }
      return true;
    }) || null;
  }
`;

async function waitAndClick(page, text, timeout = 30000) {
  await page.waitForFunction(`(${visibleLeafFn})(${JSON.stringify(text)}) !== null`, {
    timeout,
    polling: 300,
  });
  await page.evaluate(
    `(() => { const el = (${visibleLeafFn})(${JSON.stringify(text)}); el.scrollIntoView({ block: 'center', inline: 'center' }); })()`
  );
  await sleep(250);
  const box = await page.evaluate(
    `(() => { const el = (${visibleLeafFn})(${JSON.stringify(text)}); const r = el.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`
  );
  await page.mouse.click(box.x, box.y);
  console.log(`  [click] ${text}`);
}

async function waitForText(page, fragment, timeout = 30000) {
  await page.waitForFunction(
    `[...document.querySelectorAll('div')].some(e => e.offsetParent !== null && e.textContent.includes(${JSON.stringify(fragment)}))`,
    { timeout, polling: 300 }
  );
}

async function waitForAffirmationInDeck(page, fragment, maxCards = 12) {
  for (let index = 0; index < maxCards; index += 1) {
    const visible = await page.evaluate(
      (text) => [...document.querySelectorAll('div')].some(
        (element) => element.offsetParent !== null && element.textContent.includes(text)
      ),
      fragment
    );
    if (visible) return;

    const advanced = await page.evaluate(() => {
      const counter = [...document.querySelectorAll('div, span')].find(
        (element) =>
          element.offsetParent !== null &&
          element.children.length === 0 &&
          /^\d+\s*\/\s*\d+$/.test(element.textContent.trim())
      );
      if (!counter || !counter.parentElement) return false;
      const siblings = [...counter.parentElement.children]
        .filter((element) => element !== counter && element.offsetParent !== null);
      const nextButton = siblings[siblings.length - 1];
      if (!nextButton) return false;
      nextButton.click();
      return true;
    });
    if (!advanced) break;
    await sleep(250);
  }
  throw new Error(`Afirmacao pessoal nao apareceu no deck: ${fragment.slice(0, 80)}`);
}

async function clickTestId(page, testId, timeout = 30000) {
  const selector = `[data-testid="${testId}"]`;
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.$eval(selector, (el) => el.scrollIntoView({ block: 'center', inline: 'center' }));
  await sleep(180);
  await page.click(selector);
  console.log(`  [click] ${testId}`);
}

async function pressTestId(page, testId, timeout = 30000) {
  const selector = `[data-testid="${testId}"]`;
  await page.waitForSelector(selector, { visible: true, timeout });
  await page.focus(selector);
  await page.keyboard.press('Enter');
  console.log(`  [enter] ${testId}`);
}

async function typeAnswer(page, text) {
  await page.waitForFunction(
    `[...document.querySelectorAll('input, textarea')].some(e => e.offsetParent !== null)`,
    { timeout: 20000, polling: 200 }
  );
  await sleep(300);
  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll('input, textarea')].find((e) => e.offsetParent !== null);
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.keyboard.type(text, { delay: 20 });
  await page.keyboard.press('Enter');
  console.log(`  [type] ${text}`);
}

async function assertChips(page, labels, screen, timeout = 30000) {
  await page
    .waitForFunction(
      `${JSON.stringify(labels)}.every(t => (${visibleLeafFn})(t) !== null)`,
      { timeout, polling: 200 }
    )
    .catch(() => null);
  const found = await page.evaluate(
    `${JSON.stringify(labels)}.map(t => (${visibleLeafFn})(t) !== null)`
  );
  if (found.some((f) => !f)) {
    throw new Error(`CHIPS AUSENTES em ${screen}: ${JSON.stringify(labels)} -> ${JSON.stringify(found)}`);
  }
  console.log(`  [chips ok] ${screen}`);
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=420,900', '--lang=pt-BR'],
    defaultViewport: { width: 420, height: 900 },
  });
  const page = await browser.newPage();
  global.__page = page;
  await page.evaluateOnNewDocument(() => {
    window.__celesteVibrationCalls = [];
    const vibrationSpy = (pattern) => {
      window.__celesteVibrationCalls.push(pattern);
      return true;
    };
    try {
      Object.defineProperty(window.navigator, 'vibrate', {
        configurable: true,
        value: vibrationSpy,
      });
    } catch (_) {
      Object.defineProperty(Navigator.prototype, 'vibrate', {
        configurable: true,
        value: vibrationSpy,
      });
    }
  });
  const fontErrors = [];
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(String(error)));
  page.on('console', (m) => {
    if (/OTS parsing|Failed to decode downloaded font/.test(m.text())) fontErrors.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

  const openingSkip = await page
    .waitForSelector('[data-testid="celeste-opening-skip"]', { visible: true, timeout: 3000 })
    .catch(() => null);
  if (openingSkip) {
    await clickTestId(page, 'celeste-opening-skip');
  }

  // A abertura completa preserva os intersticiais documentados antes do chat.
  // Nada aqui asserta URL: o linking do navegador muda o path por tela.
  await waitAndClick(page, 'Continuar', 30000);
  await waitForText(page, 'código de indicação', 30000);
  await waitAndClick(page, 'Pular');
  await waitForText(page, 'funciona melhor com Notificações', 30000);
  await waitAndClick(page, 'Continuar');
  await waitForText(page, 'Ajude a gente a crescer', 30000);
  await waitAndClick(page, 'Continuar');

  // Prova comportamental da digitação: o toque termina só a frase atual. A
  // pergunta seguinte precisa voltar a animar a última letra e emitir pulsos
  // de 8 ms, cobrindo a regressão em que `instant` persistia pelo fluxo inteiro.
  await page.waitForSelector('[data-testid="onboarding-question-area"]', {
    visible: true,
    timeout: 30000,
  });
  await page.waitForFunction(
    () =>
      Array.isArray(window.__celesteVibrationCalls) &&
      window.__celesteVibrationCalls.filter((duration) => duration === 8).length >= 3,
    { timeout: 15000, polling: 50 }
  );
  await page.waitForSelector('[data-testid="typing-character-pulse"]', {
    visible: true,
    timeout: 5000,
  });
  await page.click('[data-testid="onboarding-question-area"]');
  console.log('  [click] onboarding-question-area (concluir introdução)');
  await sleep(100);
  const pulsesAfterIntroSkip = await page.evaluate(() => window.__celesteVibrationCalls.length);
  await page.waitForFunction(
    (previousCount) =>
      Array.isArray(window.__celesteVibrationCalls) &&
      window.__celesteVibrationCalls.length >= previousCount + 3,
    { timeout: 15000, polling: 50 },
    pulsesAfterIntroSkip
  );
  await page.waitForSelector('[data-testid="typing-character-pulse"]', {
    visible: true,
    timeout: 5000,
  });
  const typingPulseDurations = await page.evaluate(
    (from) => window.__celesteVibrationCalls.slice(from),
    pulsesAfterIntroSkip
  );
  if (!typingPulseDurations.length || typingPulseDurations.some((duration) => duration !== 8)) {
    throw new Error(`Pulso da digitação divergente: ${JSON.stringify(typingPulseDurations)}`);
  }
  console.log('  [haptics ok] movimento visual + pulsos de 8 ms continuaram na pergunta seguinte');

  await waitForText(page, 'que mude na sua vida', 30000); // pergunta 1 = o desejo
  await waitForText(page, '2 de 28'); // contador ao lado da barra (28 passos no roteiro)
  await assertChips(page, ['Ter mais paz e equilíbrio', 'Outra resposta'], 'desejo');
  await waitAndClick(page, 'Ter mais paz e equilíbrio');
  await waitForText(page, 'importa tanto');
  await waitAndClick(page, 'Pular'); // pergunta não essencial tem "Pular" no canto
  await waitForText(page, 'maior obstáculo');
  await assertChips(page, ['Tempo ou energia', 'Outra resposta'], 'obstáculo');
  await waitAndClick(page, 'Outra resposta');
  await typeAnswer(page, 'Tempo');
  await waitForText(page, 'como devo te chamar');
  await typeAnswer(page, 'Teste');
  await waitForText(page, 'Onde você mora', 30000); // welcome-name auto-avança antes
  await typeAnswer(page, 'Guarulhos');

  await waitForText(page, 'Quantos anos você tem');
  await assertChips(page, ['25–34', 'Prefiro não responder'], 'faixa etária');
  await waitAndClick(page, '25–34');
  await waitForText(page, 'Qual é o seu gênero');
  await sleep(800);
  await assertChips(page, ['Feminino', 'Masculino', 'Não-binário', 'Prefiro não dizer'], 'gênero');
  await waitAndClick(page, 'Prefiro não dizer');
  await waitForText(page, 'Qual é a sua sexualidade');
  await assertChips(page, ['Heterossexual', 'Bissexual', 'Outra resposta'], 'sexualidade');
  await waitAndClick(page, 'Bissexual');

  await waitForText(page, 'filhos');
  await sleep(800);
  await assertChips(page, ['Sim', 'Não'], 'filhos');
  await waitAndClick(page, 'Não');
  await waitForText(page, 'pessoas mais importantes', 30000);
  await sleep(800);
  await waitAndClick(page, 'Continuar');

  await waitForText(page, 'O que você faz da vida');
  await assertChips(page, ['Sou autônomo(a) ou freelancer', 'Estou empreendendo', 'Outra resposta'], 'trabalho');
  await waitAndClick(page, 'Sou autônomo(a) ou freelancer');
  await waitForText(page, 'Como você se sente em relação ao seu trabalho');
  await sleep(800);
  await assertChips(
    page,
    ['Amo', 'Está bom por enquanto', 'Estou pronto para algo novo', 'Estou construindo algo em paralelo'],
    'relação com o trabalho'
  );
  await waitAndClick(page, 'Estou pronto para algo novo');
  await waitForText(page, 'Qual é o seu estado civil');
  await sleep(800);
  await assertChips(page, ['Solteiro(a)', 'Em um relacionamento', 'Casado(a)', 'É complicado'], 'estado civil');
  await waitAndClick(page, 'Solteiro(a)');
  await waitForText(page, 'algo do seu passado');
  await waitAndClick(page, 'Pular');
  await waitForText(page, 'o que eu deveria saber para te entender melhor');
  await typeAnswer(page, 'Sou criativo e persistente');

  await waitForText(page, 'Visualizações personalizadas', 30000); // tela de valor
  await sleep(500);
  await waitAndClick(page, 'Continuar');
  await waitForText(page, 'onde você está morando', 40000); // statement "sonhe maior" auto-avança antes
  await assertChips(page, ['Na praia ou no litoral', 'Em outro país', 'Outra resposta'], 'lugar dos sonhos');
  await waitAndClick(page, 'Na praia ou no litoral');
  await waitForText(page, 'tipo de casa');
  await sleep(1200);
  await assertChips(page, ['Vila à Beira-Mar', 'Cabana'], 'casa dos sonhos');
  await waitAndClick(page, 'Vila à Beira-Mar');
  await waitAndClick(page, 'Continuar');

  await waitForText(page, 'Conheça o seu futuro eu', 30000);
  await waitAndClick(page, 'Continuar');
  await waitForText(page, 'que tipo de parceiro(a) você quer atrair', 30000);
  await assertChips(page, ['Emocionalmente maduro(a)', 'Outra resposta'], 'parceiro');
  await waitAndClick(page, 'Outra resposta');
  await typeAnswer(page, 'Reciprocidade e calma');
  await waitForText(page, 'Existe uma pessoa específica', 30000);
  await sleep(800);
  await assertChips(page, ['Sim', 'Não'], 'pessoa específica');
  await waitAndClick(page, 'Sim');
  await waitForText(page, 'nome da pessoa que você está manifestando', 30000);
  await typeAnswer(page, 'Alex');

  await page.setViewport({ width: 320, height: 480 });
  await waitForText(page, 'envie ao Gemini somente o necessário', 30000);
  await sleep(1000);
  await assertChips(page, ['Permitir', 'Criar no aparelho'], 'consentimento Gemini');
  const compactConsent = await page.evaluate(() => {
    const visibleLeaf = (text) =>
      [...document.querySelectorAll('div, span')].find(
        (el) => el.children.length === 0 && el.textContent.trim() === text && el.offsetParent !== null
      );
    const buttons = ['Permitir', 'Criar no aparelho'].map(visibleLeaf).filter(Boolean);
    const bottom = buttons.length ? Math.max(...buttons.map((el) => el.getBoundingClientRect().bottom)) : Infinity;
    return {
      buttons: buttons.length,
      fits: bottom <= window.innerHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
  if (compactConsent.buttons !== 2 || !compactConsent.fits || compactConsent.horizontalOverflow) {
    throw new Error(`Consentimento Gemini não cabe em 320x480: ${JSON.stringify(compactConsent)}`);
  }
  await page.setViewport({ width: 420, height: 900 });
  await waitAndClick(page, USE_GEMINI ? 'Permitir' : 'Criar no aparelho');

  // O Traço Celeste é o gatilho proprietário: a história pessoal não aparece
  // antes das três estrelas e se revela depois do gesto completo.
  await waitForText(page, 'SUA PRIMEIRA CENA-ÂNCORA', 40000);
  const generationSourceHandle = await page.waitForFunction(
    (allowGemini) => {
      const saved = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}');
      const source = saved.manifestations?.[0]?.generation?.source;
      if (source === 'local') return source;
      if (allowGemini && source === 'gemini') return source;
      return false;
    },
    { timeout: 30000, polling: 300 },
    USE_GEMINI
  );
  const generationSource = await generationSourceHandle.jsonValue();
  // A chamada direta feita pelo deploy comprova o Gemini e sua base ao vivo.
  // No fluxo da pessoa, demora/indisponibilidade deve aceitar o fallback local
  // testado em vez de transformar resiliência em uma falsa falha de produto.
  console.log(`  [scene] origem=${generationSource}`);
  await waitForText(page, 'SEU TRAÇO CELESTE');
  const leakedBeforeTrace = await page.$('[data-testid="anchor-scene-content"]');
  if (leakedBeforeTrace) throw new Error('Cena-Âncora apareceu antes de completar o Traço Celeste');
  await page.screenshot({ path: path.join(SHOT_DIR, 'trace-before.png') });
  await pressTestId(page, 'trace-star-1');
  await waitForText(page, '1 de 3 estrelas acesas');
  await clickTestId(page, 'trace-star-2');
  await waitForText(page, '2 de 3 estrelas acesas');
  await clickTestId(page, 'trace-star-3');
  await waitForText(page, 'Sua Cena-Âncora está aberta');
  await waitForText(page, 'Ter mais paz e equilíbrio');
  await waitForText(page, 'Sua ponte para hoje');
  // A URL carrega o id e anchorOpenedAt persiste: F5 retoma a cena aberta sem
  // pedir o ritual de novo nem adivinhar outra história.
  await sleep(700);
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await waitForText(page, 'Sua Cena-Âncora está aberta', 40000);
  await waitForText(page, '3 de 3 estrelas acesas');
  await waitForText(page, 'Sua ponte para hoje');
  await page.setViewport({ width: 390, height: 664 });
  const bridgeLayout = await page.$eval('[data-testid="anchor-bridge-input"]', (element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  if (bridgeLayout.scrollHeight > bridgeLayout.clientHeight + 2) {
    throw new Error(`Ponte para hoje ficou cortada no iPhone: ${JSON.stringify(bridgeLayout)}`);
  }
  await page.screenshot({ path: path.join(SHOT_DIR, 'reveal.png') });
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (mobileOverflow) throw new Error('Reveal tem rolagem horizontal no celular');

  await page.setViewport({ width: 1440, height: 900 });
  await sleep(500);
  const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (desktopOverflow) throw new Error('Reveal tem rolagem horizontal no desktop');
  await page.screenshot({ path: path.join(SHOT_DIR, 'reveal-desktop.png') });
  await page.setViewport({ width: 420, height: 900 });
  await waitAndClick(page, 'Guardar minha Cena-Âncora');

  await waitForText(page, 'Um começo transparente', 40000);
  await waitForText(page, 'Acesso aberto nesta versão');
  await waitForText(page, 'Nenhum teste começa');
  await page.screenshot({ path: path.join(SHOT_DIR, 'paywall.png') });
  // Restaurar não destrava nem cobra: só explica que ainda não há assinatura.
  await waitAndClick(page, 'Restaurar');
  await waitForText(page, 'entra em breve');
  await waitForText(page, 'Um começo transparente');
  await waitAndClick(page, 'Entrar no Celeste');
  await waitForText(page, 'manifest', 20000);
  await waitForText(page, 'Ter mais paz e equilíbrio', 20000); // Home abre COM a manifestação criada, não vazia
  await page.waitForFunction(
    `JSON.parse(localStorage.getItem('@stella_state_v2') || '{}').onboardingDone === true`,
    { timeout: 15000, polling: 200 }
  );
  // A entrada precisa sobreviver a um F5 imediato, não apenas funcionar em memória.
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await waitForText(page, 'Manifestar', 30000);
  await waitForText(page, 'Ter mais paz e equilíbrio', 20000);
  await sleep(2000);
  await page.screenshot({ path: path.join(SHOT_DIR, 'app.png') });

  // A afirmação é o próprio despertador, não uma rotina depois de acordar.
  // No web a pessoa configura e ouve a prévia, mas o switch permanece incapaz
  // de fingir que um alarme do sistema foi criado.
  await clickTestId(page, 'open-affirmation-alarm');
  await waitForText(page, 'Meu despertador', 20000);
  await waitForText(page, 'No site você pode preparar e ouvir', 20000);
  await clickTestId(page, 'open-alarm-affirmation-picker');
  const customWake = 'Eu acordo confiante e pronta para viver um dia extraordinário.';
  await page.waitForSelector('[data-testid="custom-alarm-affirmation"]', { visible: true });
  await page.type('[data-testid="custom-alarm-affirmation"]', customWake, { delay: 12 });
  await clickTestId(page, 'save-custom-alarm-affirmation');
  await page.waitForSelector('[data-testid="custom-alarm-affirmation"]', { hidden: true, timeout: 15000 });
  await page.waitForFunction((text) => document.body.innerText.includes(text), { timeout: 15000 }, customWake);
  await page.$eval('[data-testid="alarm-time-input"]', (input) => {
    input.focus();
    input.select();
  });
  await page.keyboard.press('Backspace');
  await sleep(150);
  await page.keyboard.type('0630', { delay: 12 });
  await sleep(500);
  const alarmDraftValue = await page.$eval('[data-testid="alarm-time-input"]', (input) => input.value);
  if (alarmDraftValue !== '06:30') {
    throw new Error(`HorÃ¡rio do despertador nÃ£o aceitou 06:30: ${JSON.stringify(alarmDraftValue)}`);
  }
  const webAlarmState = await page.evaluate(() => {
    const ritual = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}').morningRitual || {};
    const control = document.querySelector('[data-testid="activate-affirmation-alarm"]');
    const switchParts = control ? [control, ...control.querySelectorAll('*')] : [];
    return {
      enabled: ritual.reminderEnabled === true,
      disabled: switchParts.some(
        (part) => part.disabled === true || part.getAttribute('aria-disabled') === 'true'
      ),
    };
  });
  if (webAlarmState.enabled || !webAlarmState.disabled) {
    throw new Error(`Web fingiu ativar despertador nativo: ${JSON.stringify(webAlarmState)}`);
  }

  // O bonus usa uma imagem do relato real; nao basta escolher uma frase pronta
  // pelo tema. A transformacao permanece local e persiste seu recibo tecnico.
  await clickTestId(page, 'affirmation-alarm-back');
  await waitForText(page, 'Manifestar', 20000);
  await clickTestId(page, 'open-dream-journal');
  await waitForText(page, 'Meus sonhos', 20000);
  await clickTestId(page, 'open-dream-shortcut');
  const dreamReport = 'Eu estava em uma casa perto do mar.';
  await page.type('[data-testid="dream-report-input"]', dreamReport, { delay: 12 });
  await clickTestId(page, 'dream-feeling-calm');
  await clickTestId(page, 'transform-dream');
  await page.click('[data-testid="transform-dream"]');
  await page.waitForFunction(
    () =>
      (document.querySelector('[data-testid="dream-personalized-affirmation"]')?.innerText || '')
        .toLowerCase()
        .includes('casa perto do mar'),
    { timeout: 15000, polling: 200 }
  );
  await page.waitForFunction(
    () => {
      const entries = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}').morningRitual?.entries || [];
      return entries[0]?.dreamAnchor?.includes('casa perto do mar') &&
        entries[0]?.generatorVersion === 'dream-local-v3';
    },
    { timeout: 15000, polling: 200 }
  );
  await sleep(900);
  const matchingDreams = await page.evaluate((report) => {
    const entries = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}').morningRitual?.entries || [];
    return entries.filter((entry) => entry.dream === report).length;
  }, dreamReport);
  if (matchingDreams !== 1) {
    throw new Error(`Clique duplo criou ${matchingDreams} copias do mesmo sonho`);
  }
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    [...document.querySelectorAll('*')]
      .filter((element) => element.scrollHeight > element.clientHeight + 20)
      .forEach((element) => { element.scrollTop = 0; });
  });
  await page.setViewport({ width: 320, height: 480 });
  await sleep(400);
  const dreamOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (dreamOverflow) throw new Error('Sonhos tem rolagem horizontal em 320x480');
  await page.screenshot({ path: path.join(SHOT_DIR, 'sonhos-320x480.png') });
  await page.setViewport({ width: 420, height: 900 });
  await clickTestId(page, 'morning-ritual-back');
  await waitForText(page, 'Manifestar', 20000);

  // A preferência do Gemini é reversível: desligar não pede confirmação;
  // religar exige uma confirmação nova de 18+ e de envio ao provedor.
  await clickTestId(page, 'open-profile');
  await waitForText(page, 'Personalização e voz neural', 20000);
  const geminiInitiallyOn = await page.evaluate(
    () => {
      const profile = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}').profile || {};
      return profile.cloudPersonalization === true && profile.cloudAdultConfirmed === true;
    }
  );
  if (geminiInitiallyOn) {
    await clickTestId(page, 'profile-gemini-switch');
    await page.waitForFunction(
      `(() => { const p = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}').profile || {}; return p.cloudPersonalization === false && p.cloudAdultConfirmed === false; })()`,
      { timeout: 15000, polling: 200 }
    );
  }
  await clickTestId(page, 'profile-gemini-switch');
  await waitForText(page, 'Confirme que você tem 18 anos ou mais', 15000);
  await waitAndClick(page, 'Tenho 18+ · Permitir');
  await page.waitForFunction(
    `(() => { const p = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}').profile || {}; return p.cloudPersonalization === true && p.cloudAdultConfirmed === true; })()`,
    { timeout: 15000, polling: 200 }
  );
  await clickTestId(page, 'profile-gemini-switch');
  await page.waitForFunction(
    `(() => { const p = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}').profile || {}; return p.cloudPersonalization === false && p.cloudAdultConfirmed === false; })()`,
    { timeout: 15000, polling: 200 }
  );
  const staleConsentDialog = await page.evaluate(() =>
    document.body.innerText.includes('Permitir personalização com Gemini?')
  );
  if (staleConsentDialog) throw new Error('Desligar a personalização Gemini abriu confirmação indevida');
  await page.goBack({ waitUntil: 'networkidle2', timeout: 60000 });
  await waitForText(page, 'Manifestar', 20000);

  // Comunidade começa vazia e nunca inventa depoimentos. Sem conta/backend, o
  // envio vira rascunho local e a autora consegue apagá-lo imediatamente.
  await waitAndClick(page, 'Comunidade');
  await waitForText(page, 'Ainda não há relatos publicados', 20000);
  await waitAndClick(page, 'Contar o que aconteceu');
  const story = 'Percebi que comecei a agir com mais confiança durante esta semana.';
  const storyInput = await page.waitForSelector('textarea', { visible: true, timeout: 15000 });
  await storyInput.type(story, { delay: 10 });
  await waitAndClick(
    page,
    'Confirmo que tenho 18 anos ou mais e autorizo o Celeste a publicar este relato se ele passar pela análise.'
  );
  await waitAndClick(page, 'Enviar para análise');
  await waitForText(page, 'Rascunho salvo neste aparelho', 20000);
  await waitForText(page, story, 20000);
  await waitAndClick(page, 'Apagar este relato');
  await waitForText(page, 'Um rascunho local é apagado deste aparelho', 15000);
  await waitAndClick(page, 'Apagar');
  await waitForText(page, 'Seu relato pode começar aqui', 20000);
  await waitAndClick(page, 'Manifestar');
  await waitForText(page, 'manifest', 20000);

  // O desejo respondido no onboarding precisa chegar à prática diária: a aba
  // abre no deck pessoal e mostra exatamente a afirmação salva, não um card
  // genérico do catálogo.
  const personalAffirmation = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}');
    return saved.manifestations && saved.manifestations[0] && saved.manifestations[0].affirmation;
  });
  if (!personalAffirmation) throw new Error('Onboarding não salvou a afirmação derivada do sonho');
  await waitAndClick(page, 'Afirmações');
  await waitForText(page, 'Dos seus sonhos');
  await waitForAffirmationInDeck(page, personalAffirmation);
  await waitAndClick(page, 'Manifestar');
  await waitForText(page, 'manifest', 20000);

  // Falha de armazenamento não pode parecer sucesso. Força quota/permissão
  // negada, confirma o aviso global e depois prova que o botão tenta novamente.
  await page.evaluate(() => {
    const storageProto = Object.getPrototypeOf(window.localStorage);
    window.__celesteOriginalSetItem = storageProto.setItem;
    storageProto.setItem = () => {
      throw new Error('storage-blocked-for-e2e');
    };
  });
  await waitAndClick(page, 'Praticar');
  await waitForText(page, 'Sua narrativa em áudio', 30000);
  await waitAndClick(page, 'Marcar a prática de hoje');
  await waitForText(page, 'Não conseguimos guardar suas últimas mudanças', 30000);
  await page.evaluate(() => {
    Object.getPrototypeOf(window.localStorage).setItem = window.__celesteOriginalSetItem;
    delete window.__celesteOriginalSetItem;
    localStorage.setItem('__celeste_retry_probe', 'ok');
    localStorage.removeItem('__celeste_retry_probe');
  });
  await clickTestId(page, 'celeste-storage-persist-retry');
  try {
    await page.waitForSelector('[data-testid="celeste-storage-persist-retry"]', {
      hidden: true,
      timeout: 15000,
    });
  } catch (_error) {
    const retryState = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="celeste-storage-persist-retry"]');
      const saved = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}');
      return {
        buttonText: button?.innerText || button?.textContent || null,
        buttonDisabled: button?.getAttribute('aria-disabled') || button?.disabled || false,
        sessions: saved.manifestations?.map((item) => item.sessions) || [],
      };
    });
    throw new Error(`Nova tentativa de persistencia nao concluiu: ${JSON.stringify(retryState)}`);
  }
  const retriedPracticePersisted = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}');
    return saved.manifestations?.some((item) => Array.isArray(item.sessions) && item.sessions.length > 0);
  });
  if (!retriedPracticePersisted) throw new Error('A nova tentativa sumiu com a pratica pendente');

  if (fontErrors.length) {
    throw new Error(`FONTE DOS ÍCONES quebrada em produção: ${fontErrors[0]}`);
  }
  if (runtimeErrors.length) {
    throw new Error(`Erro JavaScript durante o fluxo principal: ${runtimeErrors[0]}`);
  }

  // Backup antigo ou adulterado não pode derrubar a revelação. Este era um bug
  // real: `personalizedWith` como string passava pela importação e quebrava no
  // `.map()`. O load defensivo deve normalizar o campo para uma lista vazia.
  const imported = await browser.newPage();
  const importedErrors = [];
  imported.on('pageerror', (error) => importedErrors.push(String(error)));
  await imported.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await imported.evaluate(() => {
    localStorage.setItem(
      '@stella_state_v2',
      JSON.stringify({
        lang: 'pt',
        onboardingDone: false,
        profile: {},
        manifestations: [
          {
            id: 'm-imported',
            title: 'Cena importada',
            category: 'Peace',
            lang: 'pt',
            story: 'Uma história legível continua protegida.',
            affirmation: 'Eu escolho clareza.',
            anchorIdentity: ['valor inválido de backup'],
            anchorStep: { bad: true },
            anchorOpenedAt: new Date().toISOString(),
            personalizedWith: 'onde quer morar',
            sessions: [],
            evidence: [],
          },
        ],
        favoriteAffirmations: [],
        affirmationDates: [],
        savedVisions: [],
        visionPlays: [],
      })
    );
  });
  const revealUrl = new globalThis.URL('/revelacao/m-imported', URL).toString();
  await imported.goto(revealUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await imported.waitForFunction(
    `document.body.innerText.includes('Uma história legível continua protegida.')`,
    { timeout: 30000 }
  );
  if (importedErrors.length) throw new Error(`Reveal de backup corrompido falhou: ${importedErrors[0]}`);
  await imported.close();

  const missingReveal = await browser.newPage();
  const missingRevealErrors = [];
  missingReveal.on('pageerror', (error) => missingRevealErrors.push(String(error)));
  await missingReveal.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await missingReveal.evaluate(() => {
    localStorage.setItem(
      '@stella_state_v2',
      JSON.stringify({
        lang: 'pt',
        onboardingDone: false,
        profile: {},
        manifestations: [],
        favoriteAffirmations: [],
        affirmationDates: [],
        savedVisions: [],
        visionPlays: [],
      })
    );
  });
  const missingRevealUrl = new globalThis.URL('/revelacao/nao-existe', URL).toString();
  await missingReveal.goto(missingRevealUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await missingReveal.waitForSelector('[data-testid="missing-anchor-scene"]', {
    visible: true,
    timeout: 15000,
  });
  await waitAndClick(missingReveal, 'Voltar ao início', 15000);
  await missingReveal.waitForFunction(
    () => location.pathname === '/bem-vindo',
    { timeout: 15000, polling: 100 }
  );
  if (missingRevealErrors.length) {
    throw new Error(`Deep link de cena inexistente falhou: ${missingRevealErrors[0]}`);
  }
  await missingReveal.close();

  const duplicateTemplate = await browser.newPage();
  const duplicateTemplateErrors = [];
  duplicateTemplate.on('pageerror', (error) => duplicateTemplateErrors.push(String(error)));
  await duplicateTemplate.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await duplicateTemplate.evaluate(() => {
    localStorage.setItem(
      '@stella_state_v2',
      JSON.stringify({
        lang: 'pt',
        onboardingDone: true,
        profile: {},
        manifestations: [],
        favoriteAffirmations: [],
        affirmationDates: [],
        savedVisions: [],
        visionPlays: [],
      })
    );
  });
  const templateUrl = new globalThis.URL('/m?templateId=fy-1', URL).toString();
  await duplicateTemplate.goto(templateUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await waitForText(duplicateTemplate, 'Esta manifestação não está mais aqui.', 15000);
  const stateAtMissingTemplate = await duplicateTemplate.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}');
    return {
      manifestations: Array.isArray(saved.manifestations) ? saved.manifestations.length : -1,
      leakedStartButton: !!document.querySelector('[data-testid="start-manifestation"]'),
    };
  });
  if (stateAtMissingTemplate.manifestations !== 0 || stateAtMissingTemplate.leakedStartButton) {
    throw new Error('Deep link legado materializou uma sugestao generica');
  }

  await waitAndClick(duplicateTemplate, 'Voltar', 15000);
  await duplicateTemplate.waitForSelector('[data-testid="celeste-mascot-home"]', {
    visible: true,
    timeout: 15000,
  });
  await duplicateTemplate.waitForFunction(
    () => location.pathname === '/' || location.pathname === '',
    { timeout: 15000, polling: 100 }
  );
  const legacyTemplateResult = await duplicateTemplate.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('@stella_state_v2') || '{}');
    const manifestationCards = [...document.querySelectorAll('[role="button"], button')].filter((element) =>
      /ainda não praticada hoje/i.test(element.getAttribute('aria-label') || '')
    ).length;
    return {
      manifestations: Array.isArray(saved.manifestations) ? saved.manifestations.length : -1,
      manifestationCards,
      leakedTemplateId: document.body.innerText.includes('fy-1'),
    };
  });
  if (
    legacyTemplateResult.manifestations !== 0 ||
    legacyTemplateResult.manifestationCards !== 0 ||
    legacyTemplateResult.leakedTemplateId
  ) {
    throw new Error(
      `Template legado vazou: ${JSON.stringify(legacyTemplateResult)}`
    );
  }
  if (duplicateTemplateErrors.length) {
    throw new Error(`Erro no bloqueio do template legado: ${duplicateTemplateErrors[0]}`);
  }
  await duplicateTemplate.close();

  console.log('✅ E2E COMPLETO PASSOU: onboarding + persistência + idempotência + links órfãos + app principal');
  await browser.close();
})().catch(async (e) => {
  console.error('❌ E2E FALHOU:', String(e).slice(0, 400));
  try {
    if (global.__page) {
      const dump = await global.__page.evaluate(() =>
        document.body.innerText.replace(/\n+/g, ' | ').slice(0, 400)
      );
      console.log('TELA NO MOMENTO DO ERRO:', dump);
      await global.__page.screenshot({ path: path.join(SHOT_DIR, 'falha.png') });
    }
  } catch (_) {}
  process.exit(1);
});
