// Portao do audio embutido da sessao. Modos: (sem flag) completo; `--estrutura` so script e mapa.
// Novos modos (ex.: --tocador) entram como mais uma funcao em MODES.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { sha256, expectedClips, AUDIO_DIR, MANIFEST, MAP_FILE, FORMAT } = require('./gerar-audio-sessao');

const MAX_BYTES = 28_000_000;
const MAX_DRY_CHARS = 59_160;
const NAME = /^[a-z0-9_]+\.mp3$/;
const problems = [];
const fail = (text) => problems.push(text);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

// So o script e o mapa. Devolve { clips, source } ou null se ja falhou.
function estrutura() {
  const script = path.join(__dirname, 'gerar-audio-sessao.js');
  if (!fs.existsSync(script)) return fail('falta scripts/gerar-audio-sessao.js');
  if (!fs.existsSync(MAP_FILE)) return fail('falta constants/sessionAudio.js (modulo ausente)');
  const source = fs.readFileSync(MAP_FILE, 'utf8');
  if (!/export function sessionClipModule\(/.test(source)) fail('mapa sem sessionClipModule');
  const clips = expectedClips();
  if (clips.length !== 744) fail(`esperava 744 clipes (6 x 2 x 62), achei ${clips.length}`);

  const run = (key, ...args) =>
    spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env: { ...process.env, ELEVENLABS_API_KEY: key } });
  const dry = run('', '--dry-run');
  const total = Number((/^total: (\d+)$/m.exec(dry.stdout || '') || [])[1]);
  if (dry.status !== 0 || !Number.isFinite(total)) fail('--dry-run nao imprimiu total');
  else if (total > MAX_DRY_CHARS) fail(`dry-run soma ${total} (> ${MAX_DRY_CHARS})`);
  // sem chave, ou com chave e --confirm-chars errado, nao gera (e nao chama a rede)
  if (total > 0) {
    if (run('').status === 0) fail('sem chave o script nao parou');
    const wrong = run('chave-de-teste', '--confirm-chars', String(total + 1));
    if (wrong.status === 0 || !/--confirm-chars precisa ser igual/.test(wrong.stderr || '')) {
      fail('--confirm-chars errado nao parou o script');
    }
  }
  return problems.length ? null : { clips, source };
}

function completo() {
  const base = estrutura();
  if (!base) return;
  const { clips, source } = base;
  if (!fs.existsSync(MANIFEST)) return fail('falta assets/audio/sessao/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (manifest.format !== FORMAT) fail(`manifest.format precisa ser ${FORMAT}`);
  const entries = manifest.entries || {};
  const expected = new Set(clips.map((clip) => clip.key));
  const files = new Map(
    walk(AUDIO_DIR)
      .filter((file) => file.endsWith('.mp3'))
      .map((file) => [path.relative(AUDIO_DIR, file).split(path.sep).join('/').replace(/\.mp3$/, ''), file])
  );
  const mapped = new Set(
    [...source.matchAll(/'([^']+)': require\('\.\.\/assets\/audio\/sessao\/([^']+)\.mp3'\)/g)].map((m) =>
      m[1] === m[2] ? m[1] : `${m[1]}!=${m[2]}`
    )
  );
  const sets = { arquivos: new Set(files.keys()), manifesto: new Set(Object.keys(entries)), mapa: mapped };
  for (const [label, set] of Object.entries(sets)) {
    for (const key of expected) if (!set.has(key)) fail(`${label}: falta ${key}`);
    for (const key of set) if (!expected.has(key)) fail(`${label}: sobra ${key}`);
  }
  let bytes = 0;
  for (const [key, file] of files) {
    if (!NAME.test(path.basename(file))) fail(`nome invalido: ${key}`);
    const buf = fs.readFileSync(file);
    bytes += buf.length;
    const id3 = buf.length > 3 && buf.toString('latin1', 0, 3) === 'ID3';
    const sync = buf.length > 1 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
    if (!id3 && !sync) fail(`nao e MP3: ${key}`);
    const entry = entries[key];
    if (entry && entry.bytes !== buf.length) fail(`bytes do manifesto diferem do arquivo: ${key}`);
  }
  for (const clip of clips) {
    const entry = entries[clip.key];
    if (entry && entry.textSha256 !== sha256(clip.text)) fail(`texto mudou depois do audio: ${clip.key}`);
  }
  if (bytes > MAX_BYTES) fail(`soma dos MP3 ${bytes} > ${MAX_BYTES}`);
  if (!problems.length) console.log(`audio da sessao: ok (${clips.length} clipes, ${(bytes / 1e6).toFixed(1)} MB)`);
}

const MODES = { '--estrutura': estrutura, '': completo };
const mode = process.argv.slice(2).find((arg) => arg in MODES) || '';
MODES[mode]();
if (problems.length) {
  console.error(problems.slice(0, 40).join('\n'));
  console.error(`audio da sessao${mode ? ' (estrutura)' : ''}: ${problems.length} problema(s)`);
  process.exit(1);
}
if (mode === '--estrutura') console.log('audio da sessao (estrutura): ok');
