// Portao: no celular, mexer num player do expo-video/expo-audio depois que o hook o liberou derruba o app.
// Ao desmontar, a limpeza do useVideoPlayer/useAudioPlayer roda ANTES das limpezas dos efeitos do componente,
// entao qualquer player.x() ou player.x = y numa limpeza de efeito precisa estar dentro do bloco de um try.
// Origem: rejeicao da Apple 2.1.0 (13/11/2026, "o app travou ao abrir"), reproduzida no emulador Android:
// "Call to function 'VideoPlayer.pause' has been rejected ... Cannot use shared object that was already released"
// em WelcomeVideo, 12 s depois de abrir (fim do video de abertura). Na web o erro nao acontece.
// Limites conhecidos (nao existem no app hoje): player recebido por prop/ref/contexto, limpeza que chama uma
// funcao auxiliar, efeito ou limpeza passados por nome. Quem escrever isso protege a chamada com try do mesmo jeito.
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const { traverse } = require('@babel/core');

const root = path.join(__dirname, '..');
const SKIP_ROOT = new Set(['dist', 'output', 'api', 'scripts', 'supabase', 'public', 'docs', 'e2e-shots', 'ops', 'security-audit', 'knowledge', 'store-listing', 'android', 'ios', 'modules']);
const PLAYER_HOOKS = new Set(['useVideoPlayer', 'useAudioPlayer', 'createVideoPlayer', 'createAudioPlayer']);
const MENTIONS_PLAYER = /\b(use|create)(Video|Audio)Player\b/;
const EFFECTS = new Set(['useEffect', 'useLayoutEffect']);
const isFunction = (node) => !!node && /FunctionExpression$/.test(node.type);

function sourceFiles(dir, top) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || (top && SKIP_ROOT.has(entry.name))) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full, false));
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.web\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full);
  }
  return out;
}

function calleeName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') return callee.property.name;
  return null;
}

// protegido = dentro do bloco do try (catch e finally rodam fora da protecao)
function insideTryBlock(member, cleanup) {
  for (let p = member; p && p !== cleanup; p = p.parentPath) {
    if (p.parentPath && p.parentPath.isTryStatement() && p.key === 'block') return true;
  }
  return false;
}

function unguardedPlayerUses(source, file) {
  const rel = path.relative(root, file);
  let ast;
  try {
    ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch (error) {
    return [`${rel}: nao deu para ler o arquivo (${error.message})`];
  }
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
  const checkCleanup = (cleanup) => {
    cleanup.traverse({
      MemberExpression(member) {
        if (member.node.object.type !== 'Identifier' || !players.has(member.node.object.name)) return;
        const parent = member.parentPath;
        const isCall = parent.isCallExpression() && parent.node.callee === member.node;
        const isWrite = parent.isAssignmentExpression() && parent.node.left === member.node;
        if ((!isCall && !isWrite) || insideTryBlock(member, cleanup)) return;
        problems.push(`${rel}:${member.node.loc.start.line} ${source.slice(member.node.start, member.node.end)} na limpeza do efeito sem try`);
      },
    });
  };
  traverse(ast, {
    CallExpression(p) {
      if (!EFFECTS.has(calleeName(p.node.callee))) return;
      const effect = p.get('arguments.0');
      if (!effect || !isFunction(effect.node)) return;
      // useEffect(() => () => player.pause()): o corpo do efeito ja e a limpeza
      if (isFunction(effect.node.body)) return checkCleanup(effect.get('body'));
      effect.traverse({
        Function(inner) { inner.skip(); },
        ReturnStatement(ret) {
          const cleanup = ret.get('argument');
          if (isFunction(cleanup.node)) checkCleanup(cleanup);
        },
      });
    },
  });
  return problems;
}

const problems = sourceFiles(root, true).flatMap((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return MENTIONS_PLAYER.test(source) ? unguardedPlayerUses(source, file) : [];
});
if (problems.length) {
  console.error('Players nativos tocados depois de liberados (derruba o app no celular):');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log('Players nativos: nenhuma limpeza de efeito mexe em player liberado sem try.');
