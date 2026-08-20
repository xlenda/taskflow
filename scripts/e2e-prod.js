// Portão E2E do Celeste: percorre o onboarding INTEIRO em produção (ou TARGET_URL),
// verifica cada tela de chips, o paywall e a entrada no app principal.
// Nasceu de um bug real (08/2026): chips não apareciam porque o navegador
// estrangulava os timers do efeito de digitação em aba de fundo.
// Uso: node scripts/e2e-prod.js   (CHROME_PATH pra sobrescrever o Chrome)
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
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

async function assertChips(page, labels, screen) {
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
    args: ['--no-sandbox', '--window-size=420,900'],
    defaultViewport: { width: 420, height: 900 },
  });
  const page = await browser.newPage();
  global.__page = page;
  const fontErrors = [];
  page.on('console', (m) => {
    if (/OTS parsing|Failed to decode downloaded font/.test(m.text())) fontErrors.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

  await waitAndClick(page, 'Continuar', 30000);
  await waitForText(page, 'código de indicação');
  await waitAndClick(page, 'Pular');
  await waitForText(page, 'funciona melhor');
  await waitAndClick(page, 'Continuar');
  await waitForText(page, 'crescer');
  await sleep(600);
  await waitAndClick(page, 'Continuar');
  await waitForText(page, 'totalmente confidencial', 40000);
  await sleep(600);
  await waitAndClick(page, 'Continuar');

  await waitForText(page, 'como devo te chamar');
  await typeAnswer(page, 'Teste');
  await waitForText(page, 'Onde você mora', 30000);
  await typeAnswer(page, 'Guarulhos');
  await waitForText(page, 'Quantos anos');
  await typeAnswer(page, '28');

  await waitForText(page, 'seu gênero');
  await sleep(1200);
  await assertChips(page, ['Feminino', 'Masculino'], 'gênero');
  await waitAndClick(page, 'Feminino');
  await waitForText(page, 'sexualidade');
  await typeAnswer(page, 'Hetero');
  await waitForText(page, 'filhos');
  await sleep(800);
  await waitAndClick(page, 'Não');
  await waitForText(page, 'pessoas mais importantes', 30000);
  await sleep(800);
  await waitAndClick(page, 'Continuar');
  await waitForText(page, 'faz da vida');
  await typeAnswer(page, 'Empresario');

  await waitForText(page, 'Como você se sente', 30000);
  await sleep(1500);
  await assertChips(page, ['Amo', 'Está bom por enquanto'], 'trabalho');
  await waitAndClick(page, 'Amo');
  await waitForText(page, 'estado civil');
  await sleep(800);
  await assertChips(page, ['Solteiro(a)', 'Casado(a)'], 'estado civil');
  await waitAndClick(page, 'Solteiro(a)');
  await waitForText(page, 'que mude na sua vida');
  await typeAnswer(page, 'Paz');
  await waitForText(page, 'importa tanto');
  await typeAnswer(page, 'Tudo');
  await waitForText(page, 'maior obstáculo');
  await typeAnswer(page, 'Tempo');
  await waitForText(page, 'seu passado');
  await typeAnswer(page, 'Nada');
  await waitForText(page, 'te entender melhor');
  await typeAnswer(page, 'Sonhador');
  await waitForText(page, 'Visualizações personalizadas', 30000); // intro de valor 1
  await sleep(500);
  await waitAndClick(page, 'Continuar');
  await waitForText(page, 'onde você está morando', 40000);
  await typeAnswer(page, 'Praia');
  await waitForText(page, 'tipo de casa');
  await sleep(1200);
  await assertChips(page, ['Vila à Beira-Mar', 'Cabana'], 'casa dos sonhos');
  await waitAndClick(page, 'Vila à Beira-Mar');
  await waitAndClick(page, 'Continuar');
  await waitForText(page, 'futuro eu', 30000); // intro de valor 2
  await sleep(500);
  await waitAndClick(page, 'Continuar');
  await waitForText(page, 'quer atrair');
  await typeAnswer(page, 'Gentil');
  await waitForText(page, 'pessoa específica');
  await sleep(800);
  await waitAndClick(page, 'Não');

  await waitForText(page, 'Recado da equipe', 40000);
  await page.screenshot({ path: path.join(SHOT_DIR, 'paywall.png') });
  await waitAndClick(page, 'Testar o Celeste grátis');
  await waitForText(page, 'manifest', 20000);
  await sleep(2000);
  await page.screenshot({ path: path.join(SHOT_DIR, 'app.png') });

  if (fontErrors.length) {
    throw new Error(`FONTE DOS ÍCONES quebrada em produção: ${fontErrors[0]}`);
  }

  console.log('✅ E2E COMPLETO PASSOU: onboarding + chips + paywall + app principal');
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
