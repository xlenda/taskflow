// Portão de paridade de idioma: nenhum texto pode ir a produção só em inglês.
// Varre o código com o parser do próprio projeto e falha se achar um objeto de
// tradução com `en` mas sem `pt` (ou o contrário).
// Uso: node scripts/i18n-parity.js
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const DIRS = ['screens', 'components', 'constants', 'ui', 'utils', 'context'];
const SKIP = new Set(['node_modules', 'dist', '.expo', '.vercel', 'scripts']);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = [path.join(ROOT, 'App.js')].filter(fs.existsSync);
DIRS.forEach((d) => {
  const full = path.join(ROOT, d);
  if (fs.existsSync(full)) walk(full, files);
});

const problems = [];

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(code, { sourceType: 'module', plugins: ['jsx'] });
  } catch (e) {
    problems.push(`${path.relative(ROOT, file)}: NÃO COMPILA — ${e.message}`);
    continue;
  }

  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (node.type === 'ObjectExpression') {
      const keys = node.properties
        .filter((p) => p.type === 'ObjectProperty' && !p.computed)
        .map((p) => (p.key.name != null ? p.key.name : p.key.value));
      const hasEn = keys.includes('en');
      const hasPt = keys.includes('pt');
      if (hasEn !== hasPt) {
        const line = node.loc ? node.loc.start.line : '?';
        problems.push(
          `${path.relative(ROOT, file)}:${line} — objeto de tradução com "${hasEn ? 'en' : 'pt'}" e sem "${hasEn ? 'pt' : 'en'}"`
        );
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end') continue;
      visit(node[key]);
    }
  };
  visit(ast.program.body);
}

if (problems.length) {
  console.error(`❌ PARIDADE DE IDIOMA FALHOU (${problems.length}):`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log(`✅ Paridade EN/PT ok em ${files.length} arquivos`);
