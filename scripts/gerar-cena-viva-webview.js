// Gera components/cenaViva/rendererSource.generated.js: o texto de renderer.js sem `export`, seguido de
// installCenaViva(window), para a WebView do app rodar o MESMO desenho que o site.
// Uso: node scripts/gerar-cena-viva-webview.js          (grava o arquivo)
//      node scripts/gerar-cena-viva-webview.js --check  (portão: sai com erro se o arquivo gerado estiver velho)
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rendererPath = path.join(root, 'components', 'cenaViva', 'renderer.js');
const generatedPath = path.join(root, 'components', 'cenaViva', 'rendererSource.generated.js');

// fins de linha normalizados: checkout com autocrlf não pode deixar o portão vermelho
const readLf = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

function buildGeneratedSource() {
  const source = readLf(rendererPath);
  if (/^\s*import\s/m.test(source)) throw new Error('renderer.js não pode ter import: roda puro dentro da WebView');
  const exported = source.match(/^export\s.*$/gm) || [];
  if (exported.length !== 1 || !exported[0].startsWith('export function installCenaViva(')) {
    throw new Error('renderer.js precisa exportar só `export function installCenaViva(root)`');
  }
  if (/<\/script|<!--/i.test(source)) {
    throw new Error('renderer.js não pode conter "</script" nem "<!--": vai dentro de <script> na WebView');
  }
  const script = `${source.replace(/^export function/m, 'function').trimEnd()}\ninstallCenaViva(window);\n`;
  return [
    '// GERADO por scripts/gerar-cena-viva-webview.js a partir de components/cenaViva/renderer.js. Não editar:',
    '// rode `node scripts/gerar-cena-viva-webview.js` (o portão --check falha quando este arquivo fica velho).',
    `export const CENA_VIVA_RENDERER_SOURCE = ${JSON.stringify(script)};`,
    '',
  ].join('\n');
}

if (require.main === module) {
  const expected = buildGeneratedSource();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(generatedPath) ? readLf(generatedPath) : null;
    if (current !== expected) {
      console.error('rendererSource.generated.js está velho: rode node scripts/gerar-cena-viva-webview.js');
      process.exit(1);
    }
    console.log('Fonte da cena viva na WebView sincronizada com renderer.js');
  } else {
    fs.writeFileSync(generatedPath, expected);
    console.log(`Gerado ${path.relative(root, generatedPath)} (${expected.length} bytes)`);
  }
}

module.exports = { buildGeneratedSource };
