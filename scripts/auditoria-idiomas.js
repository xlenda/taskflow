// AUDITORIA BILÍNGUE COMPLETA — percorre o app inteiro nos DOIS idiomas e
// denuncia texto do idioma errado em qualquer tela.
//
// Por que existe: o caça-ingles.js só olhava o app em português. Se alguém
// abrir o Celeste em inglês e houver português vazando, nenhum portão via.
// Aqui cada idioma é auditado com o dicionário do OUTRO.
//
// Uso: node scripts/auditoria-idiomas.js
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SHOT = path.join(__dirname, 'e2e-shots');
fs.mkdirSync(SHOT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Palavras inglesas de UI (buscadas quando o app deveria estar em PT)
const PALAVRAS_EN = [
  'the','your','you','my','and','or','of','for','with','from','this','that',
  'is','are','was','have','has','will','would','can','could','should',
  'day','days','week','month','today','morning','night','minutes','seconds','left','remaining',
  'share','save','saved','delete','remove','edit','done','start','finish','finished','press',
  'settings','profile','account','home','back','next','close','open','continue','skip',
  'welcome','hello','affirmation','affirmations','vision','visions','journey','manifest','manifestation',
  'practice','practised','streak','favourites','favorites','favourite','listen','play','playing','pause','stop','reset','restore',
  'love','wealth','career','health','confidence','peace','trending','nothing','none','empty',
  'about','more','less','all','new','free','trial','price','subscribe','sign','yes','no',
  'name','age','city','gender','kids','work','partner','logged','complete','progress','goal','daily','story','stories',
  'mood','theme','sentence','tap','begin','here','there','been','into','step',
];

// Palavras portuguesas de UI (buscadas quando o app deveria estar em EN)
const PALAVRAS_PT = [
  'você','voce','sua','seu','suas','seus','para','com','não','nao','sim','mais','menos','muito',
  'dia','dias','semana','mês','mes','hoje','manhã','manha','noite','minutos','segundos','restantes',
  'compartilhar','salvar','salvo','apagar','remover','editar','pronto','começar','comecar','terminar','toque',
  'ajustes','perfil','conta','início','inicio','voltar','próximo','proximo','fechar','abrir','continuar','pular',
  'bem-vindo','olá','ola','afirmação','afirmacao','afirmações','visão','visao','visões','visoes','jornada','manifestar','manifestação',
  'prática','pratica','praticada','sequência','sequencia','favoritas','favorita','ouvir','tocando','pausar','parar','reiniciar','restaurar',
  'amor','prosperidade','carreira','saúde','saude','confiança','confianca','paz','alta','nada','vazio',
  'sobre','tudo','todas','novo','nova','grátis','gratis','teste','preço','preco','assinar','entrar',
  'nome','idade','cidade','gênero','genero','filhos','trabalho','parceiro','registrado','completo','progresso','meta','diário','diario','história','historia',
  'humor','tema','frase','aqui','sonho','desejo','vida','pessoa','coisa','onde','quando','porque','sempre','nunca','já','ja',
];

const IGNORAR = new Set([
  'celeste','no','a','e','o','da','do','de','me','em','ok','in','on','ai',
  'ritual','normal','total','natural','local','real','app','ana','lisboa','guarulhos',
]);

function regexDe(palavras) {
  const esc = palavras.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp('(^|[^\\p{L}])(' + esc.join('|') + ')(?![\\p{L}])', 'giu');
}

function achar(texto, palavras) {
  const re = regexDe(palavras);
  const out = new Map();
  let m;
  while ((m = re.exec(texto)) !== null) {
    const p = m[2].toLowerCase();
    if (IGNORAR.has(p)) continue;
    if (!out.has(p)) {
      const ini = Math.max(0, m.index - 25);
      out.set(p, texto.slice(ini, m.index + 40).replace(/\n/g, ' '));
    }
  }
  return out;
}

const SEED = (lang) => ({
  name: lang === 'pt' ? 'Ana' : 'Anna',
  lang,
  onboardingDone: true,
  profile: {
    name: lang === 'pt' ? 'Ana' : 'Anna',
    city: 'Lisboa',
    dreamLocation: 'Lisboa',
    dreamHome: 'Beachfront Villa',
    obstacle: lang === 'pt' ? 'medo' : 'fear',
    whyMatters: lang === 'pt' ? 'paz' : 'peace',
  },
  manifestations: [],
  favoriteAffirmations: [],
  affirmationDates: [],
  savedVisions: [],
  visionPlays: [],
});

const ABAS = {
  pt: ['Manifestar', 'Visões', 'Afirmações', 'Jornada'],
  en: ['Manifest', 'Visions', 'Affirmations', 'Journey'],
};
const DESEJO = { pt: 'um apartamento na praia', en: 'a beach apartment' };

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const relatorio = {};

  for (const lang of ['pt', 'en']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 780, isMobile: true, hasTouch: true });
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.evaluate((s) => localStorage.setItem('@stella_state_v2', JSON.stringify(s)), SEED(lang));
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3500);

    const tap = async (texto) => {
      const box = await page.evaluate((t) => {
        const el = [...document.querySelectorAll('div, span')].find(
          (e) => e.children.length === 0 && e.textContent.trim() === t && e.offsetParent !== null
        );
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }, texto);
      if (!box) return false;
      await page.mouse.click(box.x, box.y);
      await sleep(1800);
      return true;
    };

    const alvo = lang === 'pt' ? PALAVRAS_EN : PALAVRAS_PT;
    const res = {};

    for (const aba of ABAS[lang]) {
      const ok = await tap(aba);
      if (!ok) {
        res[aba] = { erro: 'aba não encontrada — rótulo não traduzido?' };
        continue;
      }
      const txt = await page.evaluate(() => document.body.innerText);
      res[aba] = { vazamentos: achar(txt, alvo) };
      await page.screenshot({ path: path.join(SHOT, `aud-${lang}-${aba.replace(/[^\w]/g, '')}.png`) });
    }

    // player de visão
    await tap(ABAS[lang][1]);
    const card = await page.evaluate(() => {
      const c = [...document.querySelectorAll('div')].filter(
        (e) => e.offsetParent !== null && e.getBoundingClientRect().height > 130 && e.getBoundingClientRect().width > 200
      );
      if (!c.length) return null;
      const r = c[Math.min(2, c.length - 1)].getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (card) {
      await page.mouse.click(card.x, card.y);
      await sleep(2400);
      const txt = await page.evaluate(() => document.body.innerText);
      res.player = { vazamentos: achar(txt, alvo) };
      await page.screenshot({ path: path.join(SHOT, `aud-${lang}-player.png`) });
    }

    // manifestação criada a partir do desejo
    await tap(ABAS[lang][0]);
    const input = await page.evaluate(() => {
      const el = [...document.querySelectorAll('input')].find((e) => e.offsetParent !== null);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (input) {
      await page.mouse.click(input.x, input.y);
      await page.keyboard.type(DESEJO[lang], { delay: 12 });
      await page.keyboard.press('Enter');
      await sleep(2800);
      const txt = await page.evaluate(() => document.body.innerText);
      res.manifestacao = { vazamentos: achar(txt, alvo) };
      await page.screenshot({ path: path.join(SHOT, `aud-${lang}-manifestacao.png`) });
    }

    relatorio[lang] = res;
    await page.close();
  }

  // onboarding nos dois idiomas (só a primeira tela + referral, que é onde o
  // seletor de idioma vive)
  await browser.close();

  let total = 0;
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   AUDITORIA BILÍNGUE — CELESTE           ║');
  console.log('╚══════════════════════════════════════════╝');
  for (const [lang, telas] of Object.entries(relatorio)) {
    const outro = lang === 'pt' ? 'inglês' : 'português';
    console.log(`\n### APP EM ${lang.toUpperCase()} (procurando ${outro})`);
    for (const [tela, r] of Object.entries(telas)) {
      if (r.erro) {
        console.log(`  ${tela}: ❌ ${r.erro}`);
        total += 1;
        continue;
      }
      const n = r.vazamentos.size;
      if (!n) {
        console.log(`  ${tela}: limpo`);
        continue;
      }
      total += n;
      console.log(`  ${tela}: ❌ ${n} vazamento(s)`);
      for (const [p, ctx] of r.vazamentos) console.log(`      "${p}" → …${ctx}…`);
    }
  }
  console.log(`\n${total === 0 ? '✅ NENHUM VAZAMENTO — os dois idiomas estão limpos' : `❌ TOTAL: ${total} vazamentos`}`);
  process.exit(total > 0 ? 1 : 0);
})().catch((e) => {
  console.error('ERRO:', String(e).slice(0, 300));
  process.exit(2);
});
