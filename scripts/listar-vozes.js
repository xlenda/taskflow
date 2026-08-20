// Mostra TODAS as vozes instaladas e qual o app escolhe em PT e EN.
// Serve para provar (em vez de supor) que a voz masculina está sendo pega.
// Uso: node scripts/listar-vozes.js
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const URL = process.env.TARGET_URL || 'https://celeste-jet-two.vercel.app';
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// mesma lógica do utils/voicePicker.js, injetada na página
const LOGICA = fs.readFileSync(path.join(__dirname, '..', 'utils', 'voicePicker.js'), 'utf8')
  .replace(/export const /g, 'const ')
  .replace(/export function /g, 'function ');

(async () => {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  const info = await p.evaluate((src) => {
    // eslint-disable-next-line no-eval
    eval(src);
    const todas = (window.speechSynthesis.getVoices() || []).map((v) => ({
      name: v.name, lang: v.lang, uri: v.voiceURI, remota: v.localService === false,
    }));
    // eslint-disable-next-line no-undef
    const pt = typeof pickVoice === 'function' ? pickVoice('pt') : null;
    // eslint-disable-next-line no-undef
    const en = typeof pickVoice === 'function' ? pickVoice('en') : null;
    return {
      total: todas.length,
      todas,
      pt: pt ? { name: pt.name, lang: pt.lang, uri: pt.voiceURI } : null,
      en: en ? { name: en.name, lang: en.lang, uri: en.voiceURI } : null,
    };
  }, LOGICA);

  console.log(`vozes instaladas neste navegador: ${info.total}`);
  const pts = info.todas.filter((v) => (v.lang || '').toLowerCase().startsWith('pt'));
  const ens = info.todas.filter((v) => (v.lang || '').toLowerCase().startsWith('en'));
  console.log(`\n— PT (${pts.length}) —`);
  pts.forEach((v) => console.log(`   ${v.name}  [${v.lang}]${v.remota ? ' (remota/neural)' : ''}`));
  console.log(`\n— EN (${ens.length}) — mostrando 8`);
  ens.slice(0, 8).forEach((v) => console.log(`   ${v.name}  [${v.lang}]${v.remota ? ' (remota/neural)' : ''}`));

  console.log('\n=== ESCOLHIDAS PELO APP ===');
  console.log(`  PT → ${info.pt ? info.pt.name + ' [' + info.pt.lang + ']' : 'NENHUMA'}`);
  console.log(`  EN → ${info.en ? info.en.name + ' [' + info.en.lang + ']' : 'NENHUMA'}`);

  await b.close();
})().catch((e) => { console.error('ERRO:', String(e).slice(0, 250)); process.exit(1); });
