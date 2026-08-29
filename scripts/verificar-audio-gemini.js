const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const endpoint = require('../api/gerar-audio');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');
const ENV_KEYS = [
  'ELEVENLABS_API_KEY',
  'ELEVENLABS_TTS_MODEL',
  'ELEVENLABS_TTS_TIMEOUT_MS',
  'CELESTE_ALLOWED_ORIGINS',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;
const originalWavLoader = Module._extensions['.wav'];

function loadModule(relativePath, mocks = {}) {
  const filename = path.join(ROOT, relativePath);
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename] = loaded;
  const originalLoad = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    loaded._compile(compiled, filename);
  } finally {
    Module._load = originalLoad;
  }
  return loaded.exports;
}

function configure() {
  process.env.ELEVENLABS_API_KEY = 'elevenlabs-audio-test-secret';
  process.env.ELEVENLABS_TTS_MODEL = 'eleven_multilingual_v2';
  process.env.CELESTE_ALLOWED_ORIGINS = 'https://celeste.example';
  delete process.env.ELEVENLABS_TTS_TIMEOUT_MS;
  endpoint._internals.resetSecurityForTests();
  endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
  endpoint._internals.setPaidAccessAuthorizerForTests(async () => ({
    ok: true,
    userId: '00000000-0000-4000-8000-000000000001',
  }));
}

function restore() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
  if (originalWavLoader) Module._extensions['.wav'] = originalWavLoader;
  else delete Module._extensions['.wav'];
  endpoint._internals.resetSecurityForTests();
}

function req(body, overrides = {}) {
  const { headers, ...rest } = overrides;
  return {
    method: 'POST',
    body,
    headers: {
      origin: 'https://celeste.example',
      'x-is-human': 'unit-test-challenge',
      ...(headers || {}),
    },
    ...rest,
  };
}

function res() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
}

function upstream(pcm = Buffer.from([0, 0, 1, 0, 255, 255, 2, 0]), overrides = {}) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) =>
        name.toLowerCase() === 'content-type'
          ? 'audio/pcm'
          : name.toLowerCase() === 'content-length'
            ? String(pcm.length)
            : null,
    },
    arrayBuffer: async () => pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength),
    ...overrides,
  };
}

async function call(body, overrides) {
  const response = res();
  await endpoint(req(body, overrides), response);
  return response;
}

async function main() {
  configure();
  Module._extensions['.wav'] = (loaded, filename) => {
    loaded.exports = filename;
  };
  const narrators = loadModule('constants/narrators.js');
  const storage = loadModule('services/narrationAudioStorage.js', {
    'expo-file-system': { Directory: class TestDirectory {}, File: class TestFile {}, Paths: {} },
    'react-native': { Platform: { OS: 'web' } },
  });
  const privateText = 'Eu reconheco meu caminho com presenca e coragem.';
  const privateKey = storage.createNarrationAudioCacheKey({
    text: privateText,
    narratorId: 'serena',
    lang: 'pt',
  });
  const expectedDigest = crypto
    .createHash('sha256')
    .update(JSON.stringify(['narration-v1', 'serena', 'pt', privateText]))
    .digest('hex');
  assert.strictEqual(privateKey, `narration-v1-${expectedDigest}`);
  assert.ok(!privateKey.includes(privateText), 'chave persistente nao pode conter texto pessoal');
  assert.notStrictEqual(
    privateKey,
    storage.createNarrationAudioCacheKey({ text: privateText, narratorId: 'atlas', lang: 'pt' })
  );
  assert.notStrictEqual(
    privateKey,
    storage.createNarrationAudioCacheKey({ text: privateText, narratorId: 'serena', lang: 'en' })
  );
  assert.strictEqual(
    storage.narrationAudioStorageInternals.sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
  const now = Date.now();
  const lruKeys = Array.from({ length: 4 }, (_, index) =>
    storage.createNarrationAudioCacheKey({
      text: `Audio privado numero ${index + 1}.`,
      narratorId: 'serena',
      lang: 'pt',
    })
  );
  const lruRecords = lruKeys.map((key, index) => ({
    key,
    size: 100,
    createdAt: now - (index + 1) * 1000,
    lastAccessedAt: now - (4 - index) * 1000,
  }));
  assert.deepStrictEqual(
    storage.narrationAudioStorageInternals.evictionKeys(
      lruRecords,
      lruKeys[3],
      now,
      2,
      1000,
      Number.MAX_SAFE_INTEGER
    ),
    [lruKeys[0], lruKeys[1]],
    'LRU deve remover primeiro os audios menos recentes e preservar o atual'
  );
  assert.deepStrictEqual(
    storage.narrationAudioStorageInternals.evictionKeys(
      lruRecords,
      lruKeys[3],
      now,
      40,
      64 * 1024 * 1024,
      2500
    ),
    [lruKeys[0], lruKeys[1]],
    'cache deve expirar itens sem uso sem remover o item protegido'
  );

  const persistentAudioCache = new Map();
  let persistentEpoch = 0;
  let persistentReads = 0;
  let persistentWrites = 0;
  let persistentClears = 0;
  let persistentSaveFailure = false;
  const persistentKeyFor = ({ text, narratorId, lang }) =>
    `narration-v1-${crypto
      .createHash('sha256')
      .update(JSON.stringify(['narration-v1', narratorId, lang, text]))
      .digest('hex')}`;
  let paidHeadersImpl = async () => ({});
  const service = loadModule('services/generateNarrationAudio.js', {
    './celesteApiSession': { celestePaidApiHeaders: (...args) => paidHeadersImpl(...args) },
    './narrationAudioStorage': {
      acquireNarrationAudio: async (key) => {
        persistentReads += 1;
        const saved = persistentAudioCache.get(key);
        return saved ? saved.slice() : null;
      },
      clearNarrationAudioStorage: async () => {
        persistentEpoch += 1;
        persistentClears += 1;
        persistentAudioCache.clear();
        return true;
      },
      createNarrationAudioCacheKey: persistentKeyFor,
      narrationAudioStorageEpoch: () => persistentEpoch,
      narrationAudioStorageToken: async () => String(persistentEpoch),
      NARRATION_AUDIO_MAX_IDLE_MS: 30 * 24 * 60 * 60 * 1000,
      saveNarrationAudio: async ({ cacheKey, bytes, expectedEpoch, expectedToken }) => {
        if (persistentSaveFailure) throw new Error('storage_unavailable');
        if (expectedEpoch !== persistentEpoch || expectedToken !== String(persistentEpoch)) return false;
        persistentWrites += 1;
        persistentAudioCache.set(cacheKey, bytes.slice());
        return true;
      },
    },
    'expo-asset': { Asset: { fromModule: () => ({ downloadAsync: async () => {} }) } },
    'expo-file-system': { File: class TestFile {} },
    'react-native': { Platform: { OS: 'web' } },
  });
  const ids = narrators.NARRATORS.map(({ id }) => id);
  assert.strictEqual(ids.length, 6, 'Celeste precisa de seis vozes ElevenLabs curadas');
  assert.strictEqual(new Set(ids).size, 6, 'IDs de narrador duplicados');
  assert.strictEqual(new Set(narrators.NARRATORS.map(({ tts }) => tts.voice)).size, 6);
  for (const narrator of narrators.NARRATORS) {
    assert.strictEqual(narrator.tts.provider, 'elevenlabs');
    assert.strictEqual(
      narrator.tts.voice,
      endpoint._internals.NARRATOR_VOICES[narrator.id].voiceId,
      `Voz cliente/servidor divergente para ${narrator.id}`
    );
    assert.ok(narrators.narratorPreviewUrl(narrator.id, 'pt'));
    assert.ok(narrators.narratorPreviewUrl(narrator.id, 'en'));
  }
  assert.strictEqual(endpoint._internals.audioUnits({ mode: 'personal', text: 'a'.repeat(160) }), 4);
  assert.strictEqual(endpoint._internals.audioUnits({ mode: 'personal', text: 'a'.repeat(161) }), 8);
  assert.strictEqual(endpoint._internals.audioUnits({ mode: 'personal', text: 'a'.repeat(800) }), 20);
  assert.strictEqual(
    service.MAX_AUDIO_CHUNK_CHARS,
    endpoint._internals.MAX_TEXT_CHARS,
    'cliente e servidor precisam compartilhar o mesmo teto atomico de audio'
  );
  assert.strictEqual(
    endpoint._internals.MAX_TEXT_CHARS / endpoint._internals.MAX_AUDIO_UNITS,
    40,
    'o teto global precisa limitar o pior caso do ElevenLabs a 48 mil caracteres por dia'
  );

  const longText = Array.from(
    { length: 38 },
    (_, index) =>
      `Esta e a frase ${index + 1}, escrita para preservar cada palavra da narracao pessoal.`
  ).join(' ');
  const chunks = service.splitNarrationText(longText);
  assert.ok(chunks.length >= 3, 'texto longo precisa ser dividido em varios blocos');
  assert.ok(
    chunks.every((chunk) => chunk.length > 0 && chunk.length <= service.MAX_AUDIO_CHUNK_CHARS),
    'cada bloco deve respeitar o teto seguro do TTS'
  );
  assert.strictEqual(
    service.normalizeNarrationText(chunks.join(' ')),
    service.normalizeNarrationText(longText),
    'a divisao por sentencas nao pode truncar nem reordenar o texto'
  );
  const unbrokenText = 'a'.repeat(1901);
  const unbrokenChunks = service.splitNarrationText(unbrokenText);
  assert.ok(unbrokenChunks.every((chunk) => chunk.length <= service.MAX_AUDIO_CHUNK_CHARS));
  assert.strictEqual(unbrokenChunks.join(''), unbrokenText, 'fallback duro nao pode perder caracteres');
  assert.throws(
    () => service.splitNarrationText('a'.repeat(12001)),
    (error) => error && error.code === 'text_invalid'
  );

  let sent;
  let upstreamCalls = 0;
  global.fetch = async (url, options) => {
    upstreamCalls += 1;
    sent = { url, options, body: JSON.parse(options.body) };
    return upstream();
  };
  const preview = await call({ mode: 'preview', narratorId: 'luma', lang: 'pt' });
  assert.strictEqual(preview.statusCode, 410);
  assert.strictEqual(preview.body.error, 'preview_is_bundled');
  assert.strictEqual(preview.headers['cache-control'], 'no-store, max-age=0');
  assert.strictEqual(preview.headers['cdn-cache-control'], 'no-store');
  assert.strictEqual(preview.headers['vercel-cdn-cache-control'], 'no-store');
  assert.strictEqual(preview.headers['surrogate-control'], 'no-store');
  assert.strictEqual(preview.headers['referrer-policy'], 'no-referrer');
  assert.strictEqual(
    endpoint._internals.PREVIEW_TEXT.pt,
    'Respire com calma. A vida que você está construindo começa no próximo passo possível.'
  );
  assert.strictEqual(upstreamCalls, 0, 'preview empacotado nunca pode chegar ao provedor');

  const personalText = 'Eu caminho com calma na direcao do que importa para mim.';
  const paidCalls = [];
  endpoint._internals.setPaidAccessAuthorizerForTests(async (_request, input) => {
    paidCalls.push(input);
    return { ok: true, userId: '00000000-0000-4000-8000-000000000001' };
  });
  const missingVersion = await call({
    mode: 'personal',
    narratorId: 'atlas',
    lang: 'pt',
    text: personalText,
    cloudConsent: true,
    adultConfirmed: true,
  });
  assert.strictEqual(missingVersion.statusCode, 403);
  assert.strictEqual(missingVersion.body.error, 'cloud_consent_required');
  const staleVersion = await call({
    mode: 'personal',
    narratorId: 'atlas',
    lang: 'pt',
    text: personalText,
    cloudConsent: true,
    cloudConsentVersion: 'legacy-version',
    adultConfirmed: true,
  });
  assert.strictEqual(staleVersion.statusCode, 403);
  assert.strictEqual(staleVersion.body.error, 'cloud_consent_required');
  assert.deepStrictEqual(paidCalls, [], 'invalid consent version must fail before quota');
  assert.strictEqual(upstreamCalls, 0, 'invalid consent version must fail before ElevenLabs');
  const personal = await call({
    mode: 'personal',
    narratorId: 'atlas',
    lang: 'pt',
    text: personalText,
    cloudConsent: true,
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    adultConfirmed: true,
  });
  assert.strictEqual(personal.statusCode, 200);
  assert.deepStrictEqual(paidCalls, [{
    operation: 'audio',
    units: endpoint._internals.audioUnits({ mode: 'personal', text: personalText }),
  }]);
  const sentUrl = new URL(sent.url);
  assert.strictEqual(sentUrl.origin, 'https://api.elevenlabs.io');
  assert.strictEqual(
    sentUrl.pathname,
    `/v1/text-to-speech/${endpoint._internals.NARRATOR_VOICES.atlas.voiceId}`
  );
  assert.strictEqual(sentUrl.searchParams.get('output_format'), 'pcm_24000');
  assert.strictEqual(sentUrl.searchParams.get('enable_logging'), 'false');
  assert.strictEqual(sent.options.headers['xi-api-key'], process.env.ELEVENLABS_API_KEY);
  assert.strictEqual(sent.options.headers.Accept, 'audio/pcm');
  assert.deepStrictEqual(
    sent.body,
    endpoint._internals.buildElevenLabsRequest(
      { mode: 'personal', narratorId: 'atlas', lang: 'pt', text: personalText },
      'eleven_multilingual_v2'
    )
  );
  assert.strictEqual(sent.body.text, personalText);
  assert.strictEqual(sent.body.model_id, 'eleven_multilingual_v2');
  assert.ok(!JSON.stringify(personal.body).includes(process.env.ELEVENLABS_API_KEY));

  assert.strictEqual(
    (await call({ mode: 'preview', narratorId: 'luma', lang: 'pt', text: 'nao aceitar' })).statusCode,
    400
  );
  assert.strictEqual(
    (await call({ mode: 'personal', narratorId: 'luma', lang: 'pt', text: 'texto valido', cloudConsent: true, cloudConsentVersion: CLOUD_CONSENT_VERSION, adultConfirmed: true, voice: 'Kore' })).statusCode,
    400
  );
  assert.strictEqual(
    (await call({ mode: 'personal', narratorId: 'desconhecida', lang: 'pt', text: 'texto valido', cloudConsent: true, cloudConsentVersion: CLOUD_CONSENT_VERSION, adultConfirmed: true })).body.error,
    'narrator_invalid'
  );
  assert.strictEqual(
    (await call({ mode: 'personal', narratorId: 'luma', lang: 'pt', text: 'texto valido', cloudConsentVersion: CLOUD_CONSENT_VERSION, adultConfirmed: true })).body.error,
    'cloud_consent_required'
  );
  assert.strictEqual(
    (await call({ mode: 'personal', narratorId: 'luma', lang: 'pt', text: 'texto valido', cloudConsent: true, cloudConsentVersion: CLOUD_CONSENT_VERSION })).body.error,
    'adult_confirmation_required'
  );
  assert.strictEqual(
    (await call({
      mode: 'personal',
      narratorId: 'luma',
      lang: 'pt',
      text: 'a'.repeat(endpoint._internals.MAX_TEXT_CHARS + 1),
      cloudConsent: true,
      cloudConsentVersion: CLOUD_CONSENT_VERSION,
      adultConfirmed: true,
    })).body.error,
    'text_invalid'
  );
  assert.strictEqual(
    (await call({ mode: 'preview', narratorId: 'luma', lang: 'pt' }, { headers: { origin: undefined } })).body.error,
    'origin_not_allowed'
  );
  assert.strictEqual(upstreamCalls, 1, 'origem ausente nao pode consumir o provedor');

  endpoint._internals.setBotVerifierForTests(async () => {
    throw new Error('verificador indisponivel');
  });
  const botUnavailable = await call({ mode: 'preview', narratorId: 'luma', lang: 'pt' });
  assert.strictEqual(botUnavailable.statusCode, 503);
  assert.strictEqual(botUnavailable.body.error, 'bot_verification_unavailable');
  assert.strictEqual(upstreamCalls, 1, 'falha fechada do BotID nao pode consumir o provedor');
  endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));

  const tooLarge = await call(
    { mode: 'preview', narratorId: 'luma', lang: 'pt' },
    { headers: { 'content-length': String(13 * 1024) } }
  );
  assert.strictEqual(tooLarge.statusCode, 413);
  assert.strictEqual(tooLarge.body.error, 'payload_too_large');
  assert.strictEqual(upstreamCalls, 1, 'payload grande nao pode consumir o provedor');

  global.fetch = async () => upstream(Buffer.from([0, 0, 1]));
  const malformed = await call({
    mode: 'personal',
    narratorId: 'aurora',
    lang: 'en',
    text: 'A valid personal narration.',
    cloudConsent: true,
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    adultConfirmed: true,
  });
  assert.strictEqual(malformed.statusCode, 502);
  assert.strictEqual(malformed.body.error, 'invalid_audio');

  const wav = endpoint._internals.pcmToWav(Buffer.from([0, 0, 1, 0]));
  let clientBody;
  let clientOptions;
  let clientFetchCalls = 0;
  const clientFetch = async (_url, options) => {
    clientFetchCalls += 1;
    clientOptions = options;
    clientBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name) =>
          name.toLowerCase() === 'content-type'
            ? 'audio/wav'
            : name.toLowerCase() === 'content-length'
              ? String(wav.length)
              : null,
      },
      arrayBuffer: async () => wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength),
    };
  };
  await service.clearNarrationAudioMemoryCache();
  const previewRequest = {
    mode: 'preview',
    narratorId: 'serena',
    lang: 'en',
    fetchImpl: clientFetch,
    previewLoaderImpl: async () => new Uint8Array(wav),
  };
  const bytes = await service.requestNarrationAudio(previewRequest);
  const repeatedBytes = await service.requestNarrationAudio(previewRequest);
  assert.ok(bytes instanceof Uint8Array && bytes.length === wav.length);
  assert.ok(repeatedBytes instanceof Uint8Array && repeatedBytes.length === wav.length);
  assert.notStrictEqual(bytes, repeatedBytes, 'cache deve devolver uma copia privada do WAV');
  assert.strictEqual(clientBody, undefined, 'preview local nao deve montar corpo de rede');
  assert.strictEqual(clientOptions, undefined, 'preview local nao deve abrir requisicao');
  assert.strictEqual(clientFetchCalls, 0, 'preview local nao deve consumir endpoint');
  assert.strictEqual(service.narrationAudioMemoryCacheSize(), 1);
  assert.strictEqual(persistentReads, 0, 'preview empacotada nao deve consultar cache pessoal');
  assert.strictEqual(persistentWrites, 0, 'preview empacotada nao deve persistir WAV pessoal');

  const cachedPersonalRequest = {
    mode: 'personal',
    narratorId: 'serena',
    lang: 'pt',
    text: 'Eu caminho com calma e presenca.',
    cloudConsent: true,
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    adultConfirmed: true,
    fetchImpl: clientFetch,
  };
  await service.requestNarrationAudio(cachedPersonalRequest);
  await service.requestNarrationAudio(cachedPersonalRequest);
  assert.strictEqual(clientFetchCalls, 1, 'texto pessoal repetido deve gerar uma unica chamada');
  assert.strictEqual(persistentWrites, 1, 'primeira geracao pessoal deve persistir uma copia privada');
  await service.clearNarrationAudioMemoryCache({ persistent: false });
  await service.requestNarrationAudio(cachedPersonalRequest);
  assert.strictEqual(
    clientFetchCalls,
    1,
    'apos reiniciar a memoria, o WAV persistente deve evitar uma nova chamada paga'
  );
  assert.ok(persistentReads >= 2, 'cache persistente deve ser consultado apos limpar a sessao');
  await service.requestNarrationAudio({ ...cachedPersonalRequest, narratorId: 'atlas' });
  await service.requestNarrationAudio({ ...cachedPersonalRequest, lang: 'en' });
  await service.requestNarrationAudio({ ...cachedPersonalRequest, text: 'Outro texto pessoal.' });
  assert.strictEqual(clientFetchCalls, 4, 'voz, idioma e texto devem participar da chave privada');
  assert.strictEqual(persistentAudioCache.size, 4);

  persistentSaveFailure = true;
  const privateModeRequest = {
    ...cachedPersonalRequest,
    text: 'Este audio continua privado mesmo sem armazenamento persistente.',
  };
  await service.requestNarrationAudio(privateModeRequest);
  await service.requestNarrationAudio(privateModeRequest);
  assert.strictEqual(
    clientFetchCalls,
    5,
    'falha do armazenamento deve preservar o cache em memoria da mesma sessao'
  );
  persistentSaveFailure = false;

  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    () => service.requestNarrationAudio({ ...cachedPersonalRequest, signal: aborted.signal }),
    (requestError) => requestError && requestError.code === 'audio_cancelled'
  );
  assert.strictEqual(clientFetchCalls, 5, 'requisicao cancelada nao deve consumir o endpoint');
  await assert.rejects(
    () =>
      service.requestNarrationAudio({
        ...cachedPersonalRequest,
        text: 'a'.repeat(service.MAX_AUDIO_CHUNK_CHARS + 1),
      }),
    (requestError) => requestError && requestError.code === 'text_invalid'
  );
  assert.strictEqual(clientFetchCalls, 5, 'texto grande nunca deve ser truncado silenciosamente');

  await service.clearNarrationAudioMemoryCache();
  assert.strictEqual(persistentAudioCache.size, 0, 'limpeza explicita deve apagar WAV persistente');
  assert.ok(persistentClears >= 2, 'limpeza persistente deve acompanhar a API publica de clear');
  const networkFetch = global.fetch;
  let authorizationSignal;
  let resolveAuthorization;
  let authenticatedFetchCalls = 0;
  paidHeadersImpl = ({ signal: nextSignal } = {}) => {
    authorizationSignal = nextSignal;
    return new Promise((resolve) => {
      resolveAuthorization = resolve;
    });
  };
  global.fetch = async () => {
    authenticatedFetchCalls += 1;
    return upstream();
  };
  try {
    const timeoutStartedAt = Date.now();
    await assert.rejects(
      () => service.requestNarrationAudio({
        ...cachedPersonalRequest,
        text: 'Uma autenticacao travada deve liberar o estado de carregamento.',
        fetchImpl: undefined,
        timeoutMs: 20,
      }),
      (requestError) => requestError && requestError.code === 'audio_timeout'
    );
    assert.ok(Date.now() - timeoutStartedAt < 1000, 'autenticacao travada nao pode manter loading infinito');
    assert.strictEqual(authorizationSignal?.aborted, true, 'timeout deve cancelar o sinal da autenticacao');
    resolveAuthorization({ Authorization: 'Bearer late-test-token' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(authenticatedFetchCalls, 0, 'timeout na autenticacao nao pode iniciar o fetch pago');

    const externalAbort = new AbortController();
    const cancelledDuringAuthorization = service.requestNarrationAudio({
      ...cachedPersonalRequest,
      text: 'Uma autenticacao travada tambem deve respeitar o cancelamento externo.',
      fetchImpl: undefined,
      signal: externalAbort.signal,
      timeoutMs: 5000,
    });
    externalAbort.abort();
    await assert.rejects(
      () => cancelledDuringAuthorization,
      (requestError) => requestError && requestError.code === 'audio_cancelled'
    );
    assert.strictEqual(authorizationSignal?.aborted, true, 'cancelamento externo deve chegar a autenticacao');
    resolveAuthorization({ Authorization: 'Bearer cancelled-test-token' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(authenticatedFetchCalls, 0, 'cancelamento na autenticacao nao pode iniciar o fetch pago');
  } finally {
    global.fetch = networkFetch;
    paidHeadersImpl = async () => ({});
  }

  const liveAbort = new AbortController();
  let liveAbortStarted = false;
  let sharedFetchCalls = 0;
  let resolveSharedFetch;
  let sharedUpstreamSignal;
  const sharedFetch = async (_url, options = {}) => {
    liveAbortStarted = true;
    sharedFetchCalls += 1;
    sharedUpstreamSignal = options.signal;
    return new Promise((resolve) => {
      resolveSharedFetch = () => resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name) => name.toLowerCase() === 'content-type' ? 'audio/wav' : null,
        },
        arrayBuffer: async () => wav.buffer.slice(wav.byteOffset, wav.byteOffset + wav.byteLength),
      });
    });
  };
  const interruptedRequest = service.requestNarrationAudio({
    ...cachedPersonalRequest,
    text: 'Uma geracao diferente que sera cancelada durante a rede.',
    signal: liveAbort.signal,
    fetchImpl: sharedFetch,
  });
  const survivingRequest = service.requestNarrationAudio({
    ...cachedPersonalRequest,
    text: 'Uma geracao diferente que sera cancelada durante a rede.',
    fetchImpl: sharedFetch,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(liveAbortStarted, true);
  liveAbort.abort();
  await assert.rejects(
    () => interruptedRequest,
    (requestError) => requestError && requestError.code === 'audio_cancelled'
  );
  assert.strictEqual(
    sharedUpstreamSignal && sharedUpstreamSignal.aborted,
    false,
    'cancelar um de dois consumidores nao pode abortar a geracao compartilhada'
  );
  resolveSharedFetch();
  const survivingBytes = await survivingRequest;
  assert.ok(survivingBytes instanceof Uint8Array && survivingBytes.length === wav.length);
  assert.strictEqual(sharedFetchCalls, 1, 'cancelar um consumidor nao deve abortar outro com o mesmo audio');

  const loneAbort = new AbortController();
  let loneUpstreamSignal;
  let loneUpstreamAborted = false;
  const loneFetch = async (_url, options = {}) => {
    loneUpstreamSignal = options.signal;
    return new Promise((_resolve, reject) => {
      const rejectAbort = () => {
        loneUpstreamAborted = true;
        const abortError = new Error('aborted');
        abortError.name = 'AbortError';
        reject(abortError);
      };
      if (options.signal && options.signal.aborted) rejectAbort();
      else if (options.signal) options.signal.addEventListener('abort', rejectAbort, { once: true });
    });
  };
  const loneRequest = service.requestNarrationAudio({
    ...cachedPersonalRequest,
    text: 'Uma geracao isolada que precisa parar junto com seu ultimo consumidor.',
    signal: loneAbort.signal,
    fetchImpl: loneFetch,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(loneUpstreamSignal, 'a geracao compartilhada precisa receber um AbortSignal');
  loneAbort.abort();
  await assert.rejects(
    () => loneRequest,
    (requestError) => requestError && requestError.code === 'audio_cancelled'
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(loneUpstreamAborted, true, 'o ultimo consumidor deve abortar a chamada paga');
  assert.strictEqual(loneUpstreamSignal.aborted, true, 'o AbortSignal upstream deve refletir o cancelamento');

  await service.clearNarrationAudioMemoryCache();
  await service.requestNarrationAudio(previewRequest);
  assert.strictEqual(clientFetchCalls, 5, 'limpar preview local nao pode exigir rede');

  const contextSource = fs.readFileSync(path.join(ROOT, 'context/NarrationContext.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(ROOT, 'services/generateNarrationAudio.js'), 'utf8');
  const storageSource = fs.readFileSync(
    path.join(ROOT, 'services', 'narrationAudioStorage.js'),
    'utf8'
  );
  const apiSource = fs.readFileSync(path.join(ROOT, 'api/gerar-audio.js'), 'utf8');
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'capture-narrator-previews.js')));
  const legacySamples = path.join(ROOT, 'scripts', 'amostras');
  assert.ok(
    !fs.existsSync(legacySamples) || fs.readdirSync(legacySamples).length === 0,
    'amostras antigas de voz continuam versionadas'
  );
  for (const source of [contextSource, serviceSource]) {
    assert.doesNotMatch(source, /elevenlabs|ELEVENLABS|expo-speech/i);
  }
  for (const source of [contextSource, serviceSource, apiSource]) {
    assert.doesNotMatch(source, /\bsk_[a-z0-9_-]{20,}/i);
    assert.doesNotMatch(source, /console\.(?:log|warn|error)/);
  }
  assert.match(contextSource, /playPreview/);
  assert.match(contextSource, /playPersonal/);
  assert.match(contextSource, /preparePersonal/);
  assert.match(contextSource, /passage\.length > 280/);
  assert.match(contextSource, /const prime = useCallback/);
  assert.match(contextSource, /activePlaybackId/);
  assert.match(contextSource, /playbackId:\s*activePlaybackId/);
  assert.match(contextSource, /lastCompletedPlaybackId/);
  assert.match(contextSource, /setLastCompletedPlaybackId\(null\)/);
  assert.match(contextSource, /setLastCompletedPlaybackId\(completedId\)/);
  assert.match(contextSource, /splitNarrationText\(request\.text\)/);
  assert.match(contextSource, /advanceChunk/);
  assert.match(contextSource, /requestChunk\(sequence, index \+ 1\)/);
  assert.match(contextSource, /chunkIndex:\s*chunkProgress\.index/);
  assert.match(contextSource, /chunkCount:\s*chunkProgress\.count/);
  assert.match(contextSource, /function aggregatePlaybackMetrics\(/);
  assert.match(contextSource, /progress:\s*aggregate\.progress/);
  assert.match(contextSource, /const audio = new Audio\(\)/);
  assert.match(contextSource, /new Blob\(/);
  assert.match(contextSource, /new File\(/);
  assert.match(contextSource, /attemptWebPlayback/);
  assert.match(contextSource, /webUnlockPromiseRef/);
  assert.match(contextSource, /setPhase\(['"]ready['"]\)/);
  assert.doesNotMatch(contextSource, /audio\.muted\s*=\s*true/);
  const startOffset = contextSource.indexOf('const start = useCallback');
  const directBlessOffset = contextSource.indexOf('webAudioReady = blessWebAudio();', startOffset);
  const firstPlaybackAwaitOffset = contextSource.indexOf('await playChunk(sequence, 0)', startOffset);
  assert.ok(
    startOffset >= 0 &&
      directBlessOffset >= startOffset &&
      firstPlaybackAwaitOffset > directBlessOffset,
    'Safari deve receber o play sincrono antes da primeira espera de rede'
  );
  assert.match(serviceSource, /cache:\s*'no-store'/);
  assert.match(serviceSource, /MAX_AUDIO_CHUNK_CHARS\s*=\s*800/);
  assert.match(serviceSource, /MAX_PERSONAL_REQUEST_CHARS\s*=\s*MAX_AUDIO_CHUNK_CHARS/);
  assert.match(serviceSource, /audioMemoryCache/);
  assert.match(serviceSource, /acquireNarrationAudio/);
  assert.match(serviceSource, /saveNarrationAudio/);
  assert.match(serviceSource, /narrationAudioStorageToken/);
  assert.match(serviceSource, /narrationAudioStorageEpoch\(\) === persistentEpoch/);
  assert.match(serviceSource, /cacheGenerationCurrent = saved !== false/);
  assert.match(serviceSource, /cacheGenerationCurrent && narrationAudioStorageEpoch\(\) === persistentEpoch/);
  assert.match(storageSource, /indexedDB\.open/);
  assert.match(storageSource, /META_STORE_NAME\s*=\s*['"]cache-meta['"]/);
  assert.match(storageSource, /tokenRequest\.result\?\.value !== expectedToken/);
  assert.match(storageSource, /BroadcastChannel/);
  assert.match(storageSource, /Paths\.cache/);
  assert.doesNotMatch(storageSource, /Paths\.document/);
  assert.match(storageSource, /MAX_CACHE_BYTES\s*=\s*64 \* 1024 \* 1024/);
  assert.match(storageSource, /MAX_CACHE_ENTRIES\s*=\s*40/);
  assert.match(storageSource, /PRUNE_INTERVAL_MS\s*=\s*24 \* 60 \* 60 \* 1000/);
  assert.match(storageSource, /async function webPrune\(now\)/);
  assert.match(storageSource, /async function nativePrune\(now\)/);
  assert.match(storageSource, /await pruneStorageOnce\(now\)/);
  assert.match(storageSource, /now - lastPrunedAt < PRUNE_INTERVAL_MS/);
  assert.doesNotMatch(storageSource, /localStorage|AsyncStorage/);
  assert.match(serviceSource, /loadNarratorPreview/);
  assert.match(apiSource, /preview_is_bundled/);
  assert.match(apiSource, /api\.elevenlabs\.io/);
  assert.match(
    apiSource,
    /authorizePaidRequest[\s\S]{0,400}commitPaidRequest\(access\)[\s\S]{0,500}requestElevenLabs/,
    'audio deve confirmar a reserva antes de chamar a ElevenLabs'
  );
  assert.match(apiSource, /ELEVENLABS_API_KEY/);
  assert.match(apiSource, /enable_logging:\s*'false'/);
  assert.doesNotMatch(apiSource, /GEMINI_TTS|generativelanguage/);

  process.stdout.write(
    'ElevenLabs TTS OK: 6 vozes, blocos completos, cache privado, IDs e WAV sequencial.\n'
  );
}

main().then(restore, (error) => {
  restore();
  console.error(error.stack || error);
  process.exitCode = 1;
});
