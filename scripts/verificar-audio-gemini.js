const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const endpoint = require('../api/gerar-audio');
const ENV_KEYS = [
  'GEMINI_API_KEY',
  'GEMINI_TTS_MODEL',
  'GEMINI_TTS_TIMEOUT_MS',
  'GEMINI_PAID_DATA_TERMS_ACCEPTED',
  'CELESTE_ALLOWED_ORIGINS',
];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;

function loadModule(relativePath) {
  const filename = path.join(ROOT, relativePath);
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(compiled, filename);
  return loaded.exports;
}

function configure() {
  process.env.GEMINI_API_KEY = 'gemini-audio-test-secret';
  process.env.GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
  process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = '1';
  process.env.CELESTE_ALLOWED_ORIGINS = 'https://celeste.example';
  delete process.env.GEMINI_TTS_TIMEOUT_MS;
  endpoint._internals.resetSecurityForTests();
  endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
}

function restore() {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  global.fetch = originalFetch;
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

function pcmPayload(pcm = Buffer.from([0, 0, 1, 0, 255, 255, 2, 0])) {
  return {
    status: 'completed',
    steps: [
      {
        type: 'model_output',
        content: [
          {
            type: 'audio',
            data: pcm.toString('base64'),
            mime_type: 'audio/l16',
            sample_rate: 24000,
          },
        ],
      },
    ],
  };
}

function upstream(payload = pcmPayload()) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => payload,
  };
}

async function call(body, overrides) {
  const response = res();
  await endpoint(req(body, overrides), response);
  return response;
}

async function main() {
  configure();
  const narrators = loadModule('constants/narrators.js');
  const service = loadModule('services/generateNarrationAudio.js');
  const ids = narrators.NARRATORS.map(({ id }) => id);
  assert.strictEqual(ids.length, 6, 'Celeste precisa de seis vozes Gemini curadas');
  assert.strictEqual(new Set(ids).size, 6, 'IDs de narrador duplicados');
  assert.strictEqual(new Set(narrators.NARRATORS.map(({ tts }) => tts.voice)).size, 6);
  for (const narrator of narrators.NARRATORS) {
    assert.strictEqual(narrator.tts.provider, 'gemini');
    assert.strictEqual(
      narrator.tts.voice,
      endpoint._internals.NARRATOR_VOICES[narrator.id].voice,
      `Voz cliente/servidor divergente para ${narrator.id}`
    );
    assert.strictEqual(narrators.narratorPreviewUrl(narrator.id, 'pt'), null);
  }

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
  assert.strictEqual(preview.statusCode, 200);
  assert.ok(Buffer.isBuffer(preview.body));
  assert.strictEqual(preview.body.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(preview.body.toString('ascii', 8, 12), 'WAVE');
  assert.strictEqual(preview.body.readUInt32LE(24), 24000);
  assert.strictEqual(preview.headers['content-type'], 'audio/wav');
  assert.strictEqual(preview.headers['cache-control'], 'no-store, max-age=0');
  assert.strictEqual(preview.headers['cdn-cache-control'], 'no-store');
  assert.strictEqual(preview.headers['vercel-cdn-cache-control'], 'no-store');
  assert.strictEqual(preview.headers['surrogate-control'], 'no-store');
  assert.strictEqual(preview.headers['referrer-policy'], 'no-referrer');
  assert.strictEqual(
    endpoint._internals.PREVIEW_TEXT.pt,
    'Respire com calma. A vida que você está construindo começa no próximo passo possível.'
  );
  assert.match(sent.url, /\/v1beta\/interactions$/);
  assert.strictEqual(sent.options.headers['Api-Revision'], '2026-05-20');
  assert.strictEqual(sent.options.headers['x-goog-api-key'], process.env.GEMINI_API_KEY);
  assert.strictEqual(sent.body.model, process.env.GEMINI_TTS_MODEL);
  assert.strictEqual(sent.body.store, false);
  assert.deepStrictEqual(sent.body.response_format, { type: 'audio', sample_rate: 24000 });
  assert.deepStrictEqual(sent.body.generation_config.speech_config, [{ voice: 'Achird' }]);
  assert.ok(sent.body.input.includes(endpoint._internals.PREVIEW_TEXT.pt));
  assert.ok(!sent.options.body.includes(process.env.GEMINI_API_KEY));

  const personalText = 'Eu caminho com calma na direcao do que importa para mim.';
  const personal = await call({
    mode: 'personal',
    narratorId: 'atlas',
    lang: 'pt',
    text: personalText,
    cloudConsent: true,
    adultConfirmed: true,
  });
  assert.strictEqual(personal.statusCode, 200);
  assert.ok(sent.body.input.includes(personalText));
  assert.deepStrictEqual(sent.body.generation_config.speech_config, [{ voice: 'Orus' }]);
  assert.ok(!JSON.stringify(personal.body).includes(process.env.GEMINI_API_KEY));

  assert.strictEqual(
    (await call({ mode: 'preview', narratorId: 'luma', lang: 'pt', text: 'nao aceitar' })).statusCode,
    400
  );
  assert.strictEqual(
    (await call({ mode: 'personal', narratorId: 'luma', lang: 'pt', text: 'texto valido', cloudConsent: true, adultConfirmed: true, voice: 'Kore' })).statusCode,
    400
  );
  assert.strictEqual(
    (await call({ mode: 'personal', narratorId: 'desconhecida', lang: 'pt', text: 'texto valido', cloudConsent: true, adultConfirmed: true })).body.error,
    'narrator_invalid'
  );
  assert.strictEqual(
    (await call({ mode: 'personal', narratorId: 'luma', lang: 'pt', text: 'texto valido', adultConfirmed: true })).body.error,
    'cloud_consent_required'
  );
  assert.strictEqual(
    (await call({ mode: 'personal', narratorId: 'luma', lang: 'pt', text: 'texto valido', cloudConsent: true })).body.error,
    'adult_confirmation_required'
  );
  assert.strictEqual(
    (await call({ mode: 'preview', narratorId: 'luma', lang: 'pt' }, { headers: { origin: undefined } })).body.error,
    'origin_not_allowed'
  );
  assert.strictEqual(upstreamCalls, 2, 'origem ausente nao pode consumir o Gemini');

  endpoint._internals.setBotVerifierForTests(async () => {
    throw new Error('verificador indisponivel');
  });
  const botUnavailable = await call({ mode: 'preview', narratorId: 'luma', lang: 'pt' });
  assert.strictEqual(botUnavailable.statusCode, 503);
  assert.strictEqual(botUnavailable.body.error, 'bot_verification_unavailable');
  assert.strictEqual(upstreamCalls, 2, 'falha fechada do BotID nao pode consumir o Gemini');
  endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));

  const tooLarge = await call(
    { mode: 'preview', narratorId: 'luma', lang: 'pt' },
    { headers: { 'content-length': String(13 * 1024) } }
  );
  assert.strictEqual(tooLarge.statusCode, 413);
  assert.strictEqual(tooLarge.body.error, 'payload_too_large');
  assert.strictEqual(upstreamCalls, 2, 'payload grande nao pode consumir o Gemini');

  global.fetch = async () => upstream({ status: 'completed', steps: [] });
  const malformed = await call({ mode: 'preview', narratorId: 'aurora', lang: 'en' });
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
  service.clearNarrationAudioMemoryCache();
  const previewRequest = {
    mode: 'preview',
    narratorId: 'serena',
    lang: 'en',
    fetchImpl: clientFetch,
  };
  const bytes = await service.requestNarrationAudio(previewRequest);
  const repeatedBytes = await service.requestNarrationAudio(previewRequest);
  assert.ok(bytes instanceof Uint8Array && bytes.length === wav.length);
  assert.ok(repeatedBytes instanceof Uint8Array && repeatedBytes.length === wav.length);
  assert.notStrictEqual(bytes, repeatedBytes, 'cache deve devolver uma copia privada do WAV');
  assert.deepStrictEqual(clientBody, { mode: 'preview', narratorId: 'serena', lang: 'en' });
  assert.strictEqual(clientOptions.cache, 'no-store');
  assert.strictEqual(clientFetchCalls, 1, 'mesma voz/idioma/texto deve reutilizar cache da sessao');
  assert.strictEqual(service.narrationAudioMemoryCacheSize(), 1);

  const cachedPersonalRequest = {
    mode: 'personal',
    narratorId: 'serena',
    lang: 'pt',
    text: 'Eu caminho com calma e presenca.',
    cloudConsent: true,
    adultConfirmed: true,
    fetchImpl: clientFetch,
  };
  await service.requestNarrationAudio(cachedPersonalRequest);
  await service.requestNarrationAudio(cachedPersonalRequest);
  assert.strictEqual(clientFetchCalls, 2, 'texto pessoal repetido deve gerar uma unica chamada');
  await service.requestNarrationAudio({ ...cachedPersonalRequest, narratorId: 'atlas' });
  await service.requestNarrationAudio({ ...cachedPersonalRequest, lang: 'en' });
  await service.requestNarrationAudio({ ...cachedPersonalRequest, text: 'Outro texto pessoal.' });
  assert.strictEqual(clientFetchCalls, 5, 'voz, idioma e texto devem participar da chave privada');

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
        text: 'a'.repeat(1801),
      }),
    (requestError) => requestError && requestError.code === 'text_invalid'
  );
  assert.strictEqual(clientFetchCalls, 5, 'texto grande nunca deve ser truncado silenciosamente');

  const liveAbort = new AbortController();
  let liveAbortStarted = false;
  let sharedFetchCalls = 0;
  let resolveSharedFetch;
  const sharedFetch = async () => {
    liveAbortStarted = true;
    sharedFetchCalls += 1;
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
  assert.strictEqual(liveAbortStarted, true);
  liveAbort.abort();
  await assert.rejects(
    () => interruptedRequest,
    (requestError) => requestError && requestError.code === 'audio_cancelled'
  );
  resolveSharedFetch();
  const survivingBytes = await survivingRequest;
  assert.ok(survivingBytes instanceof Uint8Array && survivingBytes.length === wav.length);
  assert.strictEqual(sharedFetchCalls, 1, 'cancelar um consumidor nao deve abortar outro com o mesmo audio');

  service.clearNarrationAudioMemoryCache();
  await service.requestNarrationAudio(previewRequest);
  assert.strictEqual(clientFetchCalls, 6, 'limpar a cache deve exigir nova geracao');

  const contextSource = fs.readFileSync(path.join(ROOT, 'context/NarrationContext.js'), 'utf8');
  const serviceSource = fs.readFileSync(path.join(ROOT, 'services/generateNarrationAudio.js'), 'utf8');
  const apiSource = fs.readFileSync(path.join(ROOT, 'api/gerar-audio.js'), 'utf8');
  assert.ok(
    !fs.existsSync(path.join(ROOT, 'scripts', 'gerar-amostras-narradores.js')),
    'gerador antigo de amostras voltou ao repositorio'
  );
  const legacySamples = path.join(ROOT, 'scripts', 'amostras');
  assert.ok(
    !fs.existsSync(legacySamples) || fs.readdirSync(legacySamples).length === 0,
    'amostras antigas de voz continuam versionadas'
  );
  for (const source of [contextSource, serviceSource, apiSource]) {
    assert.doesNotMatch(source, /elevenlabs|ELEVENLABS|expo-speech/i);
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
  assert.match(contextSource, /progress:\s*\(\(\) =>/);
  assert.match(contextSource, /const audio = new Audio\(\)/);
  assert.match(contextSource, /new Blob\(/);
  assert.match(contextSource, /new File\(/);
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
  assert.match(serviceSource, /audioMemoryCache/);
  assert.match(apiSource, /store:\s*false/);

  process.stdout.write(
    'Gemini TTS OK: 6 vozes, blocos completos, cache privado, IDs e WAV sequencial.\n'
  );
}

main().then(restore, (error) => {
  restore();
  console.error(error.stack || error);
  process.exitCode = 1;
});
