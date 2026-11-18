// Portao: estilo que so existe na web nao pode ir para o celular.
// O React Native 0.86 (o do app) REMOVEU StyleSheet.absoluteFillObject; so o react-native-web ainda tem.
// No celular ele vira undefined: a camada fica com tamanho zero e some, sem erro nenhum (achado no emulador
// Android em 18/11/2026: o cartao "Minha Cena-Ancora" da Home ficava branco com letra branca; o mesmo valia
// para o video de abertura, o player de visoes e o cartao de compartilhar, no iPhone tambem).
// Use StyleSheet.absoluteFill no style, ou as propriedades explicitas quando precisar espalhar ({ ...}).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SKIP_ROOT = new Set(['dist', 'output', 'api', 'scripts', 'supabase', 'public', 'docs', 'e2e-shots', 'ops', 'security-audit', 'knowledge', 'store-listing', 'android', 'ios']);
const WEB_ONLY = /\babsoluteFillObject\b/;

function sourceFiles(dir, top) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || (top && SKIP_ROOT.has(entry.name))) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full, false));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.web\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const problems = [];
for (const file of sourceFiles(root, true)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (WEB_ONLY.test(line)) problems.push(`${path.relative(root, file)}:${index + 1}: ${line.trim()}`);
  });
}

if (problems.length) {
  console.error('StyleSheet.absoluteFillObject nao existe no celular (React Native 0.86) e some a camada sem erro:');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error('Troque por StyleSheet.absoluteFill (no style) ou pelas propriedades explicitas (ao espalhar).');
  process.exit(1);
}
console.log('Estilos nativos: nenhum absoluteFillObject (so existe na web) no codigo do app.');
