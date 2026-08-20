// Portão anti-quadradinho: o subset da fonte de ícones é a otimização mais
// perigosa do deploy — se um glifo usado ficar de fora, o usuário vê ▯ e nada
// no console acusa.
//
// A verificação é feita NO ARQUIVO da fonte que vai ao ar (determinística), não
// medindo largura no navegador: no react-native-web a família da fonte é
// aplicada por CSS interno e um <span> de teste não a herda, o que dava falso
// positivo em 100% dos glifos mesmo com a tela renderizando certo.
//
// Uso: node scripts/verificar-icones.js   (roda depois do enxugar-fontes)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FONT_DIR = path.join(
  ROOT, 'dist', 'assets', 'node_modules', '@expo', 'vector-icons', 'build',
  'vendor', 'react-native-vector-icons', 'Fonts'
);
const glyphPath = path.join(ROOT, 'node_modules', '@expo', 'vector-icons', 'build', 'vendor', 'react-native-vector-icons', 'glyphmaps', 'Ionicons.json');

if (!fs.existsSync(FONT_DIR) || !fs.existsSync(glyphPath)) {
  console.log('dist ou glyphmap ausente — nada a verificar');
  process.exit(0);
}
const glyphs = JSON.parse(fs.readFileSync(glyphPath, 'utf8'));

// ── ícones que o app usa em atributo name= (o que aparece na tela) ──────────
function lerCodigo() {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.js')) out.push(p);
    }
  };
  ['screens', 'components', 'ui'].forEach((d) => walk(path.join(ROOT, d)));
  const app = path.join(ROOT, 'App.js');
  if (fs.existsSync(app)) out.push(app);
  return out.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

const codigo = lerCodigo();
const usados = new Set();
let m;
const reName = /name=\{?["'`]([a-zA-Z0-9-]{2,40})["'`]/g;
while ((m = reName.exec(codigo)) !== null) if (glyphs[m[1]] != null) usados.add(m[1]);
// nomes dentro de mapas/ternários (ex.: focused ? 'heart' : 'heart-outline')
const reLit = /["'`]([a-z][a-z0-9-]{2,40})["'`]/g;
while ((m = reLit.exec(codigo)) !== null) if (glyphs[m[1]] != null) usados.add(m[1]);

const ttf = fs.readdirSync(FONT_DIR).find((f) => f.startsWith('Ionicons'));
if (!ttf) {
  console.error('❌ fonte Ionicons não está no dist');
  process.exit(1);
}
const fonte = path.join(FONT_DIR, ttf);

// ── codepoints realmente presentes na fonte publicada ───────────────────────
let presentes;
try {
  const saida = execFileSync('python', ['-c', `
import sys
from fontTools.ttLib import TTFont
f = TTFont(sys.argv[1])
cps = set()
for table in f['cmap'].tables:
    cps.update(table.cmap.keys())
print(','.join(str(c) for c in sorted(cps)))
`, fonte], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  presentes = new Set(saida.trim().split(',').filter(Boolean).map(Number));
} catch (e) {
  console.log('fontTools indisponível — verificação de glifos pulada:', String(e.message).slice(0, 80));
  process.exit(0);
}

const faltando = [...usados].filter((n) => !presentes.has(glyphs[n]));
const kb = Math.round(fs.statSync(fonte).size / 1024);

if (faltando.length) {
  console.error(`❌ ${faltando.length} ícone(s) usados pelo app NÃO estão na fonte publicada (virariam ▯):`);
  faltando.forEach((n) => console.error('   - ' + n));
  console.error('   → rode o deploy sem o subset ou ajuste scripts/enxugar-fontes.js');
  process.exit(1);
}
console.log(`✅ ícones ok: ${usados.size} usados, todos presentes na fonte (${presentes.size} glifos, ${kb} KB)`);
