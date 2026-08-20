// Gera a locução do conteúdo fixo do Celeste com vozes neurais da Microsoft,
// LOCALMENTE: sem chave de API, sem cadastro e sem cota diária. Refazer um
// texto é de graça — foi por isso que largamos o serviço pago.
//
//   node scripts/gerar-audios.js            → gera só o que falta
//   node scripts/gerar-audios.js --forcar   → regrava tudo
//   node scripts/gerar-audios.js --reindexar→ só reescreve utils/audioBank.js
//
// Requer: pip install edge-tts   (já instalado nesta máquina)
//
// O app nunca depende disto: id sem arquivo cai na voz do aparelho.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public', 'audio');

// Vozes escolhidas pelo dono em 10/08/2026 (masculinas, firmes).
// Afirmação é âncora → um pouco mais direta. Visualização é imersão → pausada.
const VOZ = {
  pt: 'pt-BR-AntonioNeural',
  en: 'en-US-AndrewNeural',
};
const RITMO = {
  afirmacao: '-8%',
  visao: '-14%',
};

function carregarConteudo() {
  let src = fs.readFileSync(path.join(ROOT, 'constants', 'content.js'), 'utf8');
  src = src.replace(/import[^;]+;/g, '').replace(/export function/g, 'function').replace(/export const/g, 'const');
  src += '\nmodule.exports={AFFIRMATIONS,VISIONS,FOR_YOU};';
  const tmp = path.join(ROOT, '.content.tmp.js');
  fs.writeFileSync(tmp, src);
  delete require.cache[require.resolve(tmp)];
  const mod = require(tmp);
  fs.unlinkSync(tmp);
  return mod;
}

function gerar(texto, voz, ritmo, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  execFileSync(
    'python',
    ['-m', 'edge_tts', '--voice', voz, `--rate=${ritmo}`, '--text', texto, '--write-media', destino],
    { stdio: 'pipe', timeout: 120000 }
  );
  return Math.round(fs.statSync(destino).size / 1024);
}

// Duração REAL do arquivo. O app anunciava "2:51 de narração" para áudios de
// 28 segundos porque o número vinha escrito à mão no content.js — mentira que
// contaminava o player, o selo do card e os "minutos" da Jornada.
function duracaoSegundos(arquivo) {
  try {
    const s = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', arquivo],
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 20000 }
    );
    const n = parseFloat(String(s).trim());
    return Number.isFinite(n) ? Math.round(n) : null;
  } catch (e) {
    return null;
  }
}

function escreverBanco() {
  const banco = { pt: {}, en: {} };
  for (const lang of ['pt', 'en']) {
    const dir = path.join(PUB, lang);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (!f.endsWith('.mp3')) continue;
      const id = f.replace(/\.mp3$/, '');
      const dur = duracaoSegundos(path.join(dir, f));
      banco[lang][id] = { url: `/audio/${lang}/${f}`, dur };
    }
  }
  const arquivo = path.join(ROOT, 'utils', 'audioBank.js');
  const atual = fs.readFileSync(arquivo, 'utf8');
  const novo = atual.replace(
    /export const AUDIO_BANK = \{[\s\S]*?\n\};/,
    `export const AUDIO_BANK = ${JSON.stringify(banco, null, 2)};`
  );
  fs.writeFileSync(arquivo, novo);
  console.log(`\n✅ audioBank.js: ${Object.keys(banco.pt).length} pt + ${Object.keys(banco.en).length} en`);
  return banco;
}

if (process.argv[2] === '--reindexar') {
  escreverBanco();
  process.exit(0);
}

const forcar = process.argv.includes('--forcar');
const { AFFIRMATIONS, VISIONS, FOR_YOU } = carregarConteudo();

const fila = [];
for (const lang of ['pt', 'en']) {
  AFFIRMATIONS.forEach((a) => fila.push({ id: a.id, lang, texto: a.text[lang], ritmo: RITMO.afirmacao }));
  VISIONS.forEach((v) => fila.push({ id: v.id, lang, texto: v.script[lang], ritmo: RITMO.visao }));
  // Histórias das manifestações sugeridas: a tela de Manifestação é a mais
  // importante do app e era a única sem locução — narrava com voz de robô.
  FOR_YOU.forEach((f) => fila.push({ id: f.id, lang, texto: f.story[lang], ritmo: RITMO.visao }));
}

let feitos = 0;
let pulados = 0;
let erros = 0;
let kb = 0;
console.log(`${fila.length} áudios · pt=${VOZ.pt} · en=${VOZ.en}\n`);

for (const item of fila) {
  const destino = path.join(PUB, item.lang, `${item.id}.mp3`);
  if (!forcar && fs.existsSync(destino)) {
    pulados += 1;
    continue;
  }
  if (!item.texto) {
    console.log(`  ⚠ ${item.lang}/${item.id}: sem texto neste idioma`);
    erros += 1;
    continue;
  }
  try {
    const tam = gerar(item.texto, VOZ[item.lang], item.ritmo, destino);
    kb += tam;
    feitos += 1;
    process.stdout.write(`  ${item.lang}/${item.id} (${tam}KB)   \r`);
  } catch (e) {
    console.log(`\n  ❌ ${item.lang}/${item.id}: ${String(e.message).slice(0, 90)}`);
    erros += 1;
  }
}

console.log(`\ngerados ${feitos} · já existiam ${pulados} · falhas ${erros} · ${kb}KB`);
escreverBanco();
if (erros) process.exit(1);
