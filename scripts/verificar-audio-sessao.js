// Portao do audio embutido da sessao. Modos: (sem flag) completo (tocador + arquivos); `--estrutura` so script, mapa
// e a release do iPhone; `--tocador` so o tocador do app (clipe embutido WAV ou MP3); `--retomada` simula queda e
// retomada do gerador numa pasta temporaria (voz de mentira, ffmpeg de verdade, sem rede). Novos modos entram em MODES.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { sha256, expectedClips, AUDIO_DIR, PENDING_DIR, MANIFEST, MAP_FILE, FORMAT } = require('./gerar-audio-sessao');

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
  if (!fs.existsSync(script)) {
    fail('falta scripts/gerar-audio-sessao.js');
    return null;
  }
  if (!fs.existsSync(MAP_FILE)) {
    fail('falta constants/sessionAudio.js (modulo ausente)');
    return null;
  }
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
    const noConfirm = run('chave-de-teste');
    if (noConfirm.status === 0 || !/--confirm-chars precisa ser igual/.test(noConfirm.stderr || '')) {
      fail('com chave mas sem --confirm-chars o script nao parou');
    }
    const wrong = run('chave-de-teste', '--confirm-chars', String(total + 1));
    if (wrong.status === 0 || !/--confirm-chars precisa ser igual/.test(wrong.stderr || '')) {
      fail('--confirm-chars errado nao parou o script');
    }
  }

  // a release do iPhone roda este portao COMPLETO (sem flag) antes de qualquer build, envio ou "CHECK ONLY aprovado"
  if (require('../package.json').scripts['verify:session-audio'] !== 'node scripts/verificar-audio-sessao.js') {
    fail('verify:session-audio precisa rodar node scripts/verificar-audio-sessao.js sem flag (portao completo)');
  }
  const publish = fs.readFileSync(path.join(__dirname, 'publicar-app-store.ps1'), 'utf8');
  const gate = "Invoke-NpmGate -Npm $npm -Name 'verify:session-audio'";
  const gateAt = publish.indexOf(gate);
  if (gateAt < 0 || publish.split(gate).length !== 2) fail('publicar-app-store.ps1 precisa rodar verify:session-audio uma vez');
  for (const later of ['if ($CheckOnly) {', 'Invoke-EasVisible', "'build:list'"]) {
    if (gateAt < 0 || publish.indexOf(later) < gateAt) fail(`publicar-app-store.ps1: verify:session-audio precisa vir antes de ${later}`);
  }
  // o paywall em portugues abre /termos: o envio ao TestFlight confere as quatro paginas no ar
  const live = publish.slice(publish.indexOf('function Test-CelesteLegalPagesLive'), publish.indexOf('$root = '));
  for (const page of ['/privacidade', '/privacy', '/terms', '/termos']) {
    if (!live.includes(`'${page}'`)) fail(`publicar-app-store.ps1: o envio precisa conferir ${page} no ar`);
  }
  return problems.length ? null : { clips, source };
}

function completo() {
  const base = estrutura();
  if (!base) return;
  const { clips, source } = base;
  if (!fs.existsSync(MANIFEST)) return fail('falta assets/audio/sessao/manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch (error) {
    return fail(`manifest.json ilegivel: ${error.message}`);
  }
  if (manifest.format !== FORMAT) fail(`manifest.format precisa ser ${FORMAT}`);
  const entries = manifest.entries || {};
  const expected = new Set(clips.map((clip) => clip.key));
  const files = new Map(
    walk(AUDIO_DIR)
      .filter((file) => file.endsWith('.mp3'))
      .map((file) => [path.relative(AUDIO_DIR, file).split(path.sep).join('/').replace(/\.mp3$/, ''), file])
  );
  const mapped = new Set(
    [...source.matchAll(/^\s*'([^']+)': require\('\.\.\/assets\/audio\/sessao\/([^']+)\.mp3'\)/gm)].map((m) =>
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
  // nada alem dos MP3 e do manifesto na pasta do mapa; sidecar sobrando = geracao que caiu e ainda nao foi adotada
  for (const file of walk(AUDIO_DIR)) {
    if (!file.endsWith('.mp3') && file !== MANIFEST) fail(`arquivo estranho em assets/audio/sessao: ${path.relative(AUDIO_DIR, file)}`);
  }
  for (const file of walk(PENDING_DIR)) {
    fail(`sidecar pendente (rode o gerador para adotar): ${path.relative(PENDING_DIR, file)}`);
  }
  if (!problems.length) console.log(`audio da sessao: ok (${clips.length} clipes, ${(bytes / 1e6).toFixed(1)} MB)`);
}

// Carrega um arquivo ESM do app com Babel, trocando os modulos de `mocks` (e somando `inject` ao fim do fonte).
function loadApp(relativePath, mocks, inject = '') {
  const Module = require('module');
  const { transformSync } = require('@babel/core');
  const filename = path.join(__dirname, '..', relativePath);
  const code = transformSync(fs.readFileSync(filename, 'utf8') + inject, {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return original.call(this, request, parent, isMain);
  };
  try {
    loaded._compile(code, filename);
  } finally {
    Module._load = original;
  }
  return loaded.exports;
}

// O tocador do app: reconhece WAV/MP3 pelos primeiros bytes, toca o clipe embutido sem rede, um cache por clipe, e a
// voz da Celeste (modo personal) continua so WAV.
async function tocador() {
  const { resolveObjectURL } = require('buffer');
  const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');
  const sized = (head) => {
    const bytes = new Uint8Array(64);
    bytes.set(head);
    return bytes;
  };
  const ascii = (text) => [...text].map((c) => c.charCodeAt(0));
  const WAV = sized(ascii('RIFF\0\0\0\0WAVE'));
  const MP3_ID3 = sized(ascii('ID3\x04'));
  const MP3_SYNC = sized([0xff, 0xfb, 0x90, 0x64]);
  const AAC = sized([0xff, 0xf1, 0x50, 0x80]);
  const JUNK = sized(ascii('<html>'));
  const same = (a, b) => a instanceof Uint8Array && Buffer.from(a).equals(Buffer.from(b));
  const codeOf = (promise) => promise.then(() => 'ok', (error) => (error && error.code) || String(error));

  const fromModule = [];
  const service = loadApp('services/generateNarrationAudio.js', {
    './celesteApiSession': { celestePaidApiHeaders: async () => ({}), celestePaidApiRefused: async () => {} },
    'expo-asset': {
      Asset: {
        fromModule: (id) => {
          fromModule.push(id);
          return { localUri: `file:///bundle/${id}`, downloadAsync: async () => {} };
        },
      },
    },
    'expo-file-system': {
      File: class BundleFile {
        constructor(uri) {
          this.uri = uri;
        }
        async bytes() {
          if (this.uri !== 'file:///bundle/clip-breath') throw new Error('arquivo inexistente');
          return MP3_SYNC.slice();
        }
      },
    },
    'react-native': { Platform: { OS: 'ios' } },
    '../constants/narrators': { narratorPreviewUrl: () => null },
    '../constants/sessionAudio': {
      sessionClipModule: (narratorId, lang, clipId) => (clipId === 'breath' ? `clip-${clipId}` : null),
    },
    './narrationAudioStorage': {
      acquireNarrationAudio: async () => null,
      clearNarrationAudioStorage: async () => true,
      createNarrationAudioCacheKey: ({ text, narratorId, lang }) => JSON.stringify([narratorId, lang, text]),
      NARRATION_AUDIO_MAX_IDLE_MS: 1e12,
      narrationAudioStorageEpoch: () => 0,
      narrationAudioStorageToken: async () => '0',
      saveNarrationAudio: async () => true,
    },
  });
  const { audioKindOf, requestNarrationAudio, clearNarrationAudioMemoryCache } = service;
  if (typeof audioKindOf !== 'function') return fail('servico sem audioKindOf');

  const kinds = [WAV, MP3_ID3, MP3_SYNC, AAC, JUNK].map((bytes) => audioKindOf(bytes));
  if (kinds.join() !== 'wav,mp3,mp3,,') fail(`audioKindOf: ${JSON.stringify(kinds)} (esperava wav, mp3, mp3, null, null)`);

  // embutido: os bytes do carregador, nunca a rede, um cache por clipe
  let fetchCalls = 0;
  const response = (contentType, bytes) => ({
    ok: true,
    status: 200,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    arrayBuffer: async () => bytes.slice().buffer,
  });
  const fetchImpl = async () => {
    fetchCalls += 1;
    return response('audio/wav', WAV);
  };
  const loaded = [];
  const clipLoaderImpl = async ({ clipId }) => {
    loaded.push(clipId);
    return (clipId === 'breath' ? MP3_ID3 : MP3_SYNC).slice();
  };
  const bundled = (clipId, extra = {}) =>
    requestNarrationAudio({ mode: 'bundled', narratorId: 'aurora', lang: 'pt', clipId, fetchImpl, ...extra });
  const breath = await bundled('breath', { clipLoaderImpl }).catch((error) => error);
  if (!same(breath, MP3_ID3)) fail(`embutido: nao devolveu os bytes do carregador (${breath && breath.code})`);
  const pause = await bundled('pause', { clipLoaderImpl }).catch((error) => error);
  if (!same(pause, MP3_SYNC)) fail('embutido: dois clipes dividiram o cache (a chave precisa do clipId)');
  await bundled('breath', { clipLoaderImpl }).catch(() => {});
  if (loaded.join() !== 'breath,pause') fail(`embutido: carregador chamado para ${loaded.join()} (repetir vem da memoria)`);

  // sem carregador de teste: o modulo de sessionClipModule pelo mesmo caminho da amostra (Asset.fromModule + bytes)
  await clearNarrationAudioMemoryCache({ persistent: false });
  const real = await bundled('breath').catch((error) => error);
  if (!same(real, MP3_SYNC) || fromModule.join() !== 'clip-breath') {
    fail(`embutido: nao leu o modulo de sessionClipModule por Asset.fromModule (${real && real.code})`);
  }
  for (const clipId of ['nada', '../nada']) {
    const code = await codeOf(bundled(clipId));
    if (code !== 'clip_unavailable') fail(`clipe ${clipId}: ${code} (esperava clip_unavailable)`);
  }
  if (fetchCalls) fail(`embutido chamou a rede (${fetchCalls}x)`);

  // personal: a voz da Celeste continua so WAV
  let sentence = 0;
  const personal = (contentType, bytes) => {
    sentence += 1;
    return requestNarrationAudio({
      mode: 'personal',
      narratorId: 'aurora',
      lang: 'pt',
      text: `Eu escolho a calma de hoje, frase ${sentence}.`,
      cloudConsent: true,
      cloudConsentVersion: CLOUD_CONSENT_VERSION,
      adultConfirmed: true,
      fetchImpl: async () => response(contentType, bytes),
    });
  };
  const wave = await personal('audio/wav', WAV).catch((error) => error);
  if (!same(wave, WAV)) fail(`personal: WAV valido nao voltou (${wave && wave.code})`);
  for (const [contentType, bytes] of [['audio/mpeg', MP3_ID3], ['audio/wav', MP3_SYNC]]) {
    const code = await codeOf(personal(contentType, bytes));
    if (code !== 'invalid_audio_response') fail(`personal aceitou MP3 (${contentType}): ${code}`);
  }

  // contexto: playBundled e tipo/extensao do arquivo temporario por audioKindOf
  const contextSource = fs.readFileSync(path.join(__dirname, '..', 'context', 'NarrationContext.js'), 'utf8');
  if (
    !/const playBundled = useCallback\([\s\S]{0,200}start\(\{ mode: 'bundled', clipId, narratorId, lang, playbackId \}\)/.test(contextSource) ||
    !/^\s+playBundled,$/m.test(contextSource)
  ) {
    fail('contexto nao exporta playBundled (start com mode bundled)');
  }
  const platform = { OS: 'web' };
  const files = [];
  const context = loadApp(
    'context/NarrationContext.js',
    {
      'react-native': { Platform: platform },
      'expo-file-system': {
        File: class CacheFile {
          constructor(_dir, name) {
            files.push(name);
            this.uri = `file:///cache/${name}`;
          }
          create() {}
          write() {}
        },
        Paths: { cache: 'cache' },
      },
      'expo-audio': { setAudioModeAsync: async () => {}, useAudioPlayer: () => ({}), useAudioPlayerStatus: () => ({}) },
      'expo-speech': { speak: () => {}, stop: async () => {} },
      '../utils/captionProgress': { CHARS_PER_SECOND: 14, letterTimesFromWav: () => null, lettersSpoken: () => 0 },
      '../services/generateNarrationAudio': service,
    },
    '\nexport const __TOCADOR__ = { temporaryAudioSource };'
  );
  const temporary = context.__TOCADOR__.temporaryAudioSource;
  const webType = (bytes) => {
    const source = temporary(bytes);
    const type = resolveObjectURL(source.uri).type;
    source.dispose();
    return type;
  };
  const types = [webType(MP3_ID3), webType(WAV)];
  platform.OS = 'ios';
  temporary(MP3_SYNC);
  temporary(WAV);
  const extensions = files.map((name) => path.extname(name));
  if (types.join() !== 'audio/mpeg,audio/wav' || extensions.join() !== '.mp3,.wav') {
    fail(`arquivo temporario: tipos ${types.join()} e extensoes ${extensions.join()} (esperava audio/mpeg+.mp3 e audio/wav+.wav)`);
  }
}

// Queda e retomada do gerador sem rede e sem gastar: pasta temporaria, voz de mentira (WAV de silencio pelo mesmo
// pcmToWav da API) e o ffmpeg de verdade. Cada caso parte de uma pasta limpa.
async function retomada() {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'celeste-retomada-'));
  const env = { SESSAO_AUDIO_SAIDA_TESTE: process.env.SESSAO_AUDIO_SAIDA_TESTE, ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY };
  const modulePath = require.resolve('./gerar-audio-sessao');
  const { renameSync } = fs;
  const log = console.log;
  process.env.SESSAO_AUDIO_SAIDA_TESTE = dir;
  process.env.ELEVENLABS_API_KEY = 'chave-de-teste';
  delete require.cache[modulePath];
  try {
    const gen = require('./gerar-audio-sessao');
    if (!gen.AUDIO_DIR.startsWith(dir) || !gen.MAP_FILE.startsWith(dir)) return fail('retomada: o gerador nao usou a pasta temporaria');
    const real = gen.load('api/gerar-audio.js')._internals;
    const model = real.configuredModel();
    const clips = gen.expectedClips();
    const clipOf = new Map(clips.map((clip) => [clip.key, clip]));
    const keyOf = new Map(clips.map((clip) => [`${clip.narratorId}/${clip.lang}|${clip.text}`, clip.key]));
    const check = (ok, text) => ok || fail(`retomada: ${text}`);
    const exists = (file) => fs.existsSync(file);
    const isMp3 = (buf) => Buffer.isBuffer(buf) && buf.length > 3 && (buf.toString('latin1', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
    const entryOf = (key, buf) => ({ textSha256: sha256(clipOf.get(key).text), chars: clipOf.get(key).text.length, bytes: buf.length });
    const put = (file, content) => {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    };
    const manifest = () => JSON.parse(fs.readFileSync(gen.MANIFEST, 'utf8'));
    const reset = () => {
      fs.rmSync(path.join(dir, 'assets'), { recursive: true, force: true });
      fs.mkdirSync(path.join(dir, 'constants'), { recursive: true });
    };
    const FAKE_MP3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(400)]);
    // voz de mentira: anota cada pedido; `refuse` falha sem audio (como um 5xx da ElevenLabs)
    const voice = (refuse = false) => {
      const calls = [];
      const api = {
        ...real,
        requestElevenLabs: async (input, _model, apiKey, timed) => {
          calls.push(keyOf.get(`${input.narratorId}/${input.lang}|${input.text}`));
          if (timed !== false || apiKey !== 'chave-de-teste') throw new Error('pedido fora do combinado');
          if (refuse) throw Object.assign(new Error('recusado'), { code: 'audio_unavailable' });
          return real.pcmToWav(Buffer.alloc(9600));
        },
      };
      return { api, calls };
    };
    // main do gerador em silencio; devolve o resumo ou o erro
    const run = async (api, ...args) => {
      console.log = () => {};
      try {
        return await gen.main(args, api);
      } catch (error) {
        return error;
      } finally {
        console.log = log;
      }
    };

    // 1. o teste do ffmpeg com o WAV da API devolve MP3
    const probe = await gen.preflightFfmpeg(real).catch((error) => error);
    check(isMp3(probe), `preflight do ffmpeg sem MP3 (${probe && probe.message})`);

    // 2. queda entre o MP3 no lugar e o manifesto: a volta adota sem pagar de novo
    reset();
    const first = voice();
    const baseline = await run(first.api, '--dry-run');
    fs.renameSync = function crash(from, to) {
      if (to === gen.MANIFEST && first.calls.length) throw new Error('queda simulada');
      return renameSync.call(this, from, to);
    };
    const crashed = await run(first.api, '--confirm-chars', String(baseline.total));
    fs.renameSync = renameSync;
    const paid = first.calls.filter(Boolean).sort();
    check(crashed instanceof Error && /queda simulada/.test(crashed.message), `a queda nao derrubou a geracao (${crashed && crashed.message})`);
    check(paid.length === 2 && first.calls.length === 2, `esperava 2 pedidos antes da queda, houve ${first.calls.length}`);
    check(Object.keys(manifest().entries).length === 0, 'o manifesto ganhou entrada apesar da queda');
    for (const key of paid) {
      const sidecar = exists(gen.sidecarOf(key)) ? JSON.parse(fs.readFileSync(gen.sidecarOf(key), 'utf8')) : {};
      const bytes = exists(gen.fileOf(key)) ? fs.statSync(gen.fileOf(key)).size : -1;
      const want = { textSha256: sha256(clipOf.get(key).text), chars: clipOf.get(key).text.length, bytes, model, format: FORMAT };
      check(JSON.stringify(sidecar) === JSON.stringify(want), `queda sem MP3 + sidecar certo: ${key} ${JSON.stringify(sidecar)}`);
    }
    const second = voice(true);
    const dry = await run(second.api, '--dry-run');
    const saved = paid.reduce((sum, key) => sum + clipOf.get(key).text.length, 0);
    check(String(dry.adopted && dry.adopted.slice().sort()) === String(paid), `dry-run nao adotou os 2 clipes (${dry.adopted || dry.message})`);
    check(dry.total === baseline.total - saved, `dry-run cobraria ${dry.total}, esperava ${baseline.total - saved}`);
    check(Object.keys(manifest().entries).length === 0 && paid.every((key) => exists(gen.sidecarOf(key))), 'o dry-run gravou algo');
    const resumed = await run(second.api, '--confirm-chars', String(dry.total));
    check(resumed instanceof Error && /recusado/.test(resumed.message), `a retomada nao chegou a voz (${resumed && resumed.message})`);
    check(second.calls.length > 0 && second.calls.every((key) => key && !paid.includes(key)), `a retomada pagou de novo um adotado (${second.calls})`);
    const entries = manifest().entries;
    const map = fs.readFileSync(gen.MAP_FILE, 'utf8');
    for (const key of paid) {
      check(entries[key] && entries[key].bytes === fs.statSync(gen.fileOf(key)).size, `adotado fora do manifesto: ${key}`);
      check(!exists(gen.sidecarOf(key)), `sidecar do adotado nao sumiu: ${key}`);
      check(map.includes(`'${key}': require('../assets/audio/sessao/${key}.mp3')`), `adotado fora do mapa: ${key}`);
    }

    // 3. MP3 sem entrada no manifesto e sem sidecar valido: para antes de contar e o arquivo fica intocado
    reset();
    const orphan = clips[5].key;
    put(gen.fileOf(orphan), FAKE_MP3);
    const third = voice();
    for (const args of [['--dry-run'], ['--confirm-chars', String(baseline.total)]]) {
      const result = await run(third.api, ...args);
      check(result instanceof Error && result.message.includes('sem entrada no manifesto e sem sidecar') && result.message.includes(orphan), `MP3 orfao nao parou ${args[0]} (${result && result.message})`);
    }
    for (const [label, sidecar] of [
      ['outro modelo', { ...entryOf(orphan, FAKE_MP3), model: 'eleven_outro_modelo', format: FORMAT }],
      ['outros bytes', { ...entryOf(orphan, FAKE_MP3), bytes: FAKE_MP3.length + 1, model, format: FORMAT }],
    ]) {
      put(gen.sidecarOf(orphan), JSON.stringify(sidecar));
      const result = await run(third.api, '--dry-run');
      check(result instanceof Error && result.message.includes(orphan), `sidecar de ${label} foi adotado`);
    }
    check(third.calls.length === 0 && fs.readFileSync(gen.fileOf(orphan)).equals(FAKE_MP3) && !exists(gen.MANIFEST), 'MP3 orfao: pagou, mexeu no arquivo ou gravou o manifesto');

    // 4. manifesto de outro modelo ou formato: para com mensagem clara, sem pagar
    for (const [oldModel, oldFormat] of [['eleven_outro_modelo', FORMAT], [model, 'mp3-128k-stereo-44100']]) {
      reset();
      const key = clips[0].key;
      put(gen.fileOf(key), FAKE_MP3);
      put(gen.MANIFEST, JSON.stringify({ model: oldModel, format: oldFormat, entries: { [key]: entryOf(key, FAKE_MP3) } }));
      const fourth = voice();
      for (const args of [['--dry-run'], ['--confirm-chars', String(baseline.total)]]) {
        const result = await run(fourth.api, ...args);
        check(result instanceof Error && result.message.includes(`manifest.json e de ${oldModel}/${oldFormat} e o atual e ${model}/${FORMAT}`), `manifesto ${oldModel}/${oldFormat} nao parou (${result && result.message})`);
      }
      check(fourth.calls.length === 0, `manifesto ${oldModel}/${oldFormat} pagou`);
    }

    // 5. sidecar sem MP3 no lugar: o clipe volta a fila (cobrado no total) e o sidecar some ao gerar
    reset();
    const stale = clips[1].key;
    put(gen.sidecarOf(stale), JSON.stringify({ ...entryOf(stale, FAKE_MP3), model, format: FORMAT }));
    const fifth = voice(true);
    const staleDry = await run(fifth.api, '--dry-run');
    check(String(staleDry.stale) === stale && staleDry.todo.includes(stale) && staleDry.total === baseline.total, `sidecar sem MP3 nao voltou a fila (${staleDry.message || staleDry.total})`);
    await run(fifth.api, '--confirm-chars', String(staleDry.total));
    check(!exists(gen.sidecarOf(stale)), 'sidecar sem MP3 nao sumiu ao gerar');
  } finally {
    fs.renameSync = renameSync;
    console.log = log;
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    delete require.cache[modulePath];
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const MODES = {
  '--estrutura': estrutura,
  '--tocador': tocador,
  '--retomada': retomada,
  '': async () => {
    await tocador().catch((error) => fail(`erro no tocador: ${(error && error.stack) || error}`));
    completo();
  },
};
const mode = process.argv.slice(2).find((arg) => arg in MODES) || '';
const label = `audio da sessao${mode ? ` (${mode.slice(2)})` : ''}`;
Promise.resolve()
  .then(() => MODES[mode]())
  .catch((error) => fail(`erro: ${(error && error.stack) || error}`))
  .then(() => {
    if (problems.length) {
      console.error(problems.slice(0, 40).join('\n'));
      console.error(`${label}: ${problems.length} problema(s)`);
      process.exit(1);
    }
    if (mode) console.log(`${label}: ok`);
  });
