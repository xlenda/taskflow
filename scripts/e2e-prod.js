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
    args: ['--no-sandbox', '--window-size=420,900', '--lang=pt-BR'],
    defaultViewport: { width: 420, height: 900 },
  });
  const page = await browser.newPage();
  global.__page = page;
  const fontErrors = [];
  page.on('console', (m) => {
    if (/OTS parsing|Failed to decode downloaded font/.test(m.text())) fontErrors.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

  // Fluxo enxuto de 20/08: Welcome vai DIRETO pro chat (sem Referral /
  // Notifications / Grow) e o desejo é a PRIMEIRA pergunta. Nada aqui asserta
  // URL — o linking do navegador muda o path por tela.
  await waitAndClick(page, 'Continuar', 30000);
  await waitForText(page, 'espaço para manifestar', 40000); // intro do chat, sem telas ornamentais antes

  await waitForText(page, 'que mude na sua vida', 30000); // pergunta 1 = o desejo
  await waitForText(page, '2 de 15'); // contador ao lado da barra (15 passos no roteiro)
  await typeAnswer(page, 'Paz');
  await waitForText(page, 'importa tanto');
  await waitAndClick(page, 'Pular'); // pergunta não essencial tem "Pular" no canto
  await waitForText(page, 'maior obstáculo');
  await typeAnswer(page, 'Tempo');
  await waitForText(page, 'como devo te chamar');
  await typeAnswer(page, 'Teste');
  await waitForText(page, 'Onde você mora', 30000); // welcome-name auto-avança antes
  await typeAnswer(page, 'Guarulhos');

  await waitForText(page, 'filhos');
  await sleep(800);
  await assertChips(page, ['Sim', 'Não'], 'filhos');
  await waitAndClick(page, 'Não');
  await waitForText(page, 'pessoas mais importantes', 30000);
  await sleep(800);
  await waitAndClick(page, 'Continuar');

  await waitForText(page, 'Visualizações personalizadas', 30000); // tela de valor
  await sleep(500);
  await waitAndClick(page, 'Continuar');
  await waitForText(page, 'onde você está morando', 40000); // statement "sonhe maior" auto-avança antes
  await typeAnswer(page, 'Praia');
  await waitForText(page, 'tipo de casa');
  await sleep(1200);
  await assertChips(page, ['Vila à Beira-Mar', 'Cabana'], 'casa dos sonhos');
  await waitAndClick(page, 'Vila à Beira-Mar');
  await waitAndClick(page, 'Continuar');

  // Reveal: a recompensa vem ANTES do paywall — afirmação criada do desejo real
  await waitForText(page, 'primeira manifestação está pronta', 40000);
  await waitForText(page, 'Paz'); // a afirmação embute o desejo digitado
  await page.screenshot({ path: path.join(SHOT_DIR, 'reveal.png') });
  await waitAndClick(page, 'Continuar');

  await waitForText(page, 'Recado da equipe', 40000);
  await waitForText(page, 'R$ 49,90'); // preço legível colado no CTA
  await page.screenshot({ path: path.join(SHOT_DIR, 'paywall.png') });
  // Restaurar NÃO pode destravar o app: só avisa que assinatura entra em breve
  await waitAndClick(page, 'Restaurar');
  await waitForText(page, 'entra em breve');
  await waitForText(page, 'Recado da equipe'); // continua no paywall
  await waitAndClick(page, 'Testar o Celeste grátis');
  await waitForText(page, 'manifest', 20000);
  await waitForText(page, 'Paz', 20000); // Home abre COM a manifestação criada, não vazia
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
