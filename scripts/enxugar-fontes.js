// Enxuga as fontes de ícones do build antes do deploy.
//
// Duas gorduras que o export do Expo cria:
//   1. Ele copia as 19 famílias de ícone do @expo/vector-icons (4 MB) mesmo que
//      o app use uma só. As 18 não usadas viram peso morto no deploy.
//   2. O Ionicons inteiro tem ~390 KB e é baixado pelo usuário assim que o
//      primeiro ícone aparece — mas o app usa só algumas dezenas de glifos.
//      O subset corta isso para poucos KB, mantendo os mesmos ícones.
//
// Regra de segurança: só remove/enxuga o que PROVOU não ser usado, lendo o
// código fonte. Se aparecer uma família nova amanhã, o script detecta e mantém.
//
// Uso: node scripts/enxugar-fontes.js  (roda dentro do deploy, depois do export)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FONT_DIR = path.join(
  ROOT, 'dist', 'assets', 'node_modules', '@expo', 'vector-icons', 'build',
  'vendor', 'react-native-vector-icons', 'Fonts'
);
const FONTES_SRC = [
  path.join(ROOT, 'screens'),
  path.join(ROOT, 'components'),
  path.join(ROOT, 'ui'),
  path.join(ROOT, 'constants'),
  path.join(ROOT, 'App.js'),
];

function contentHash(file) {
  return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

function textFiles(root, out = []) {
  if (!fs.existsSync(root)) return out;
  for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name);
    if (fs.statSync(file).isDirectory()) textFiles(file, out);
    else if (/\.(?:html|js|css|json|map)$/i.test(name)) out.push(file);
  }
  return out;
}

function replaceInTextFiles(oldValue, newValue) {
  const changed = [];
  for (const file of textFiles(path.join(ROOT, 'dist'))) {
    const source = fs.readFileSync(file, 'utf8');
    if (!source.includes(oldValue)) continue;
    fs.writeFileSync(file, source.split(oldValue).join(newValue));
    changed.push(file);
  }
  return changed;
}

function cacheBustSubset(fontFile) {
  const oldFontName = path.basename(fontFile);
  const newFontName = `Ionicons.${contentHash(fontFile)}.ttf`;
  let changed = [];
  if (oldFontName !== newFontName) {
    const newFontPath = path.join(path.dirname(fontFile), newFontName);
    fs.renameSync(fontFile, newFontPath);
    changed = replaceInTextFiles(oldFontName, newFontName);
    fontFile = newFontPath;
  }

  const bundle = changed.find((file) => /^AppEntry-[a-f0-9]+\.js$/i.test(path.basename(file)));
  if (bundle) {
    const oldBundleName = path.basename(bundle);
    const newBundleName = `AppEntry-${contentHash(bundle)}.js`;
    if (oldBundleName !== newBundleName) {
      fs.renameSync(bundle, path.join(path.dirname(bundle), newBundleName));
      replaceInTextFiles(oldBundleName, newBundleName);
    }
  }
  return fontFile;
}

function arquivosJs(alvo, out = []) {
  if (!fs.existsSync(alvo)) return out;
  const st = fs.statSync(alvo);
  if (st.isFile()) {
    if (alvo.endsWith('.js')) out.push(alvo);
    return out;
  }
  for (const n of fs.readdirSync(alvo)) arquivosJs(path.join(alvo, n), out);
  return out;
}

const codigo = FONTES_SRC.flatMap((f) => arquivosJs(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');

// ── 1. famílias usadas ──────────────────────────────────────────────────────
const FAMILIAS = [
  'AntDesign','Entypo','EvilIcons','Feather','FontAwesome','FontAwesome5','FontAwesome6',
  'Fontisto','Foundation','Ionicons','MaterialCommunityIcons','MaterialIcons','Octicons',
  'SimpleLineIcons','Zocial',
];
const usadas = FAMILIAS.filter((f) => new RegExp(`\\b${f}\\b`).test(codigo));
if (!usadas.length) {
  console.log('nenhuma família de ícone detectada no código — nada a fazer');
  process.exit(0);
}
console.log(`famílias usadas: ${usadas.join(', ')}`);

if (!fs.existsSync(FONT_DIR)) {
  console.log('pasta de fontes não encontrada no dist (export mudou?) — pulando');
  process.exit(0);
}

let removidos = 0;
let kbRemovidos = 0;
for (const arq of fs.readdirSync(FONT_DIR)) {
  if (!arq.endsWith('.ttf')) continue;
  const familia = arq.split('.')[0];
  const base = familia.replace(/_(Brands|Regular|Solid)$/, '');
  if (usadas.some((u) => base === u || base.startsWith(u))) continue;
  const p = path.join(FONT_DIR, arq);
  kbRemovidos += Math.round(fs.statSync(p).size / 1024);
  fs.unlinkSync(p);
  removidos += 1;
}
console.log(`removidas ${removidos} fontes não usadas (${kbRemovidos} KB)`);

// ── 2. subset do Ionicons com os glifos realmente usados ────────────────────
if (usadas.includes('Ionicons')) {
  const glyphPath = path.join(ROOT, 'node_modules', '@expo', 'vector-icons', 'build', 'vendor', 'react-native-vector-icons', 'glyphmaps', 'Ionicons.json');
  if (!fs.existsSync(glyphPath)) {
    console.log('glyphmap ausente — subset pulado');
    process.exit(0);
  }
  const glyphsTodos = JSON.parse(fs.readFileSync(glyphPath, 'utf8'));

  // Regra à prova de falha: QUALQUER literal de string do código que seja um
  // nome válido de ícone entra no subset — não importa se veio de `name=`, de
  // um mapa, de um ternário ou de uma constante. Falso positivo só engorda a
  // fonte em bytes; falso negativo vira quadradinho na tela do usuário.
  const nomes = new Set();
  const lit = /["'`]([a-zA-Z0-9-]{2,40})["'`]/g;
  let m;
  while ((m = lit.exec(codigo)) !== null) {
    if (glyphsTodos[m[1]] != null) nomes.add(m[1]);
  }
  // Variantes da mesma base: se 'heart' é usado, garante 'heart-outline',
  // 'heart-sharp' etc. — cobre montagem dinâmica de nome em runtime.
  for (const n of [...nomes]) {
    const base = n.replace(/-(outline|sharp)$/, '');
    for (const suf of ['', '-outline', '-sharp']) {
      const cand = base + suf;
      if (glyphsTodos[cand] != null) nomes.add(cand);
    }
  }

  const ionicons = fs.readdirSync(FONT_DIR).find((f) => f.startsWith('Ionicons'));
  if (!ionicons) {
    console.log('fonte Ionicons ausente no dist — subset pulado');
    process.exit(0);
  }
  const codepoints = [...nomes].map((n) => glyphsTodos[n]);
  if (codepoints.length < 5) {
    console.log(`só ${codepoints.length} glifos reconhecidos — subset pulado por segurança`);
    process.exit(0);
  }

  let fonte = path.join(FONT_DIR, ionicons);
  const antes = Math.round(fs.statSync(fonte).size / 1024);
  const unicodes = codepoints.map((c) => 'U+' + c.toString(16).toUpperCase()).join(',');
  try {
    execFileSync('python', [
      '-m', 'fontTools.subset', fonte,
      `--unicodes=${unicodes}`,
      '--output-file=' + fonte,
      '--no-hinting', '--desubroutinize', '--drop-tables+=DSIG',
    ], { stdio: 'pipe' });
    const depois = Math.round(fs.statSync(fonte).size / 1024);
    console.log(`Ionicons: ${antes} KB → ${depois} KB (${codepoints.length} ícones preservados)`);
    if (depois >= antes) console.log('  (aviso: subset não reduziu — verifique fontTools)');
    fonte = cacheBustSubset(fonte);
    console.log(`cache bust da fonte: ${path.basename(fonte)}`);
  } catch (e) {
    console.log('subset falhou, fonte original mantida:', String(e.message).slice(0, 120));
  }
}
