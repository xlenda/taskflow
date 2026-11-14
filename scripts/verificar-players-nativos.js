// Portao: no celular, mexer num player do expo-video/expo-audio depois que o hook o liberou derruba o app.
// Ao desmontar, a limpeza do useVideoPlayer/useAudioPlayer roda ANTES das limpezas dos efeitos do componente,
// entao qualquer player.x() ou player.x = y numa limpeza de efeito precisa estar dentro de try.
// Origem: rejeicao da Apple 2.1.0 (13/11/2026, "o app travou ao abrir"), reproduzida no emulador Android:
// "Call to function 'VideoPlayer.pause' has been rejected ... Cannot use shared object that was already released"
// em WelcomeVideo, 12 s depois de abrir (fim do video de abertura). Na web o erro nao acontece.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const root = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', 'dist', 'output', 'api', 'scripts', 'supabase', 'public', 'docs', 'e2e-shots', 'ops', 'security-audit', 'knowledge', 'store-listing']);
const PLAYER_HOOKS = new Set(['useVideoPlayer', 'useAudioPlayer', 'createVideoPlayer', 'createAudioPlayer']);
const EFFECTS = new Set(['useEffect', 'useLayoutEffect']);

function sourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.web\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

function calleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') return callee.property.name;
  return null;
}

function unguardedPlayerUses(source, file) {
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  const players = new Set();
  traverse(ast, {
    VariableDeclarator(p) {
      const init = p.node.init;
      if (p.node.id.type === 'Identifier' && init && init.type === 'CallExpression' && PLAYER_HOOKS.has(calleeName(init.callee))) {
        players.add(p.node.id.name);
      }
    },
  });
  if (!players.size) return [];
  const problems = [];
  traverse(ast, {
    CallExpression(p) {
      if (!EFFECTS.has(calleeName(p.node.callee))) return;
      const effect = p.get('arguments.0');
      if (!effect || !effect.node || !/FunctionExpression$/.test(effect.node.type)) return;
      effect.traverse({
        Function(inner) { inner.skip(); },
        ReturnStatement(ret) {
          const cleanup = ret.get('argument');
          if (!cleanup.node || !/FunctionExpression$/.test(cleanup.node.type)) return;
          cleanup.traverse({
            MemberExpression(member) {
              if (member.node.object.type !== 'Identifier' || !players.has(member.node.object.name)) return;
              const parent = member.parentPath;
              const isCall = parent.isCallExpression() && parent.node.callee === member.node;
              const isWrite = parent.isAssignmentExpression() && parent.node.left === member.node;
              if (!isCall && !isWrite) return;
              const guarded = member.findParent((q) => q.isTryStatement() || q === cleanup);
              if (guarded && guarded.isTryStatement()) return;
              problems.push(`${path.relative(root, file)}:${member.node.loc.start.line} ${source.slice(member.node.start, member.node.end)} na limpeza do efeito sem try`);
            },
          });
        },
      });
    },
  });
  return problems;
}

const problems = sourceFiles(root).flatMap((file) => unguardedPlayerUses(fs.readFileSync(file, 'utf8'), file));
if (problems.length) {
  console.error('Players nativos tocados depois de liberados (derruba o app no celular):');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log('Players nativos: nenhuma limpeza de efeito mexe em player liberado sem try.');
