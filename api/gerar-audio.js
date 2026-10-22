const { checkBotId } = require('botid/server');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');
const paidAccess = require('./_paid-access');

const DEFAULT_TTS_MODEL = 'eleven_multilingual_v2';
const ELEVENLABS_TTS_ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';
const MAX_BODY_BYTES = 12 * 1024;
const MAX_TEXT_CHARS = 800;
const AUDIO_CHARS_PER_UNIT_STEP = 160;
const AUDIO_UNITS_PER_STEP = 4;
const MAX_AUDIO_UNITS = 20;
const MAX_PCM_BYTES = 4_000_000;
// /with-timestamps devolve JSON: o som em base64 e o tempo de cada letra do texto enviado
const MAX_TIMED_RESPONSE_CHARS = Math.ceil(MAX_PCM_BYTES / 3) * 4 + 200_000;
// rota com tempo que recusou o pedido (não a conta nem o limite): a voz vem pela rota sem tempo
const TIMESTAMPS_REJECTED = new Set([400, 404, 405, 422]);
const PCM_SAMPLE_RATE = 24_000;
const PCM_CHANNELS = 1;
const PCM_BITS_PER_SAMPLE = 16;

const DEFAULT_ALLOWED_ORIGINS = [
  'https://celeste-jet-two.vercel.app',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
];

const NARRATOR_VOICES = Object.freeze({
  aurora: Object.freeze({
    voiceId: 'UZ8QqWVrz7tMdxiglcLh',
    voiceName: 'Livia - Warmth You Can Hear',
    settings: Object.freeze({ stability: 0.62, similarityBoost: 0.78, style: 0.12, speed: 0.94 }),
  }),
  rio: Object.freeze({
    voiceId: 'SAz9YHcvj6GT2YYXdXww',
    voiceName: 'River - Relaxed, Neutral, Informative',
    settings: Object.freeze({ stability: 0.78, similarityBoost: 0.72, style: 0.03, speed: 0.9 }),
  }),
  atlas: Object.freeze({
    voiceId: 'nPczCjzI2devNBz1zQrb',
    voiceName: 'Brian - Deep, Resonant and Comforting',
    settings: Object.freeze({ stability: 0.72, similarityBoost: 0.78, style: 0.08, speed: 0.88 }),
  }),
  serena: Object.freeze({
    voiceId: 'MA970ZNagubdplnfHEiJ',
    voiceName: 'Melodie narradora',
    settings: Object.freeze({ stability: 0.82, similarityBoost: 0.74, style: 0.02, speed: 0.9 }),
  }),
  luma: Object.freeze({
    voiceId: '33B4UnXyTNbgLmdEDh5P',
    voiceName: 'Keren - Young Brazilian Female',
    settings: Object.freeze({ stability: 0.58, similarityBoost: 0.75, style: 0.12, speed: 0.97 }),
  }),
  nilo: Object.freeze({
    voiceId: 'onwK4e9ZLuTAKqWW03F9',
    voiceName: 'Daniel - Steady Broadcaster',
    settings: Object.freeze({ stability: 0.76, similarityBoost: 0.76, style: 0.03, speed: 0.92 }),
  }),
});

const PREVIEW_TEXT = Object.freeze({
  pt: 'Respire com calma. A vida que você está construindo começa no próximo passo possível.',
  en: 'Take a calm breath. The life you are building begins with the next possible step.',
});

const PERSONAL_KEYS = new Set([
  'mode',
  'text',
  'lang',
  'narratorId',
  'cloudConsent',
  'cloudConsentVersion',
  'adultConfirmed',
]);
const PREVIEW_KEYS = new Set(['mode', 'lang', 'narratorId']);

let botVerifier = checkBotId;

class AudioGenerationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function parseBody(req) {
  const declaredLength = Number(req.headers && req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { error: 'payload_too_large', status: 413 };
  }

  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
      return { error: 'payload_too_large', status: 413 };
    }
    try {
      body = JSON.parse(body);
    } catch (_error) {
      return { error: 'invalid_json', status: 400 };
    }
  }
  if (!isPlainObject(body)) return { error: 'invalid_request', status: 400 };

  try {
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) {
      return { error: 'payload_too_large', status: 413 };
    }
  } catch (_error) {
    return { error: 'invalid_request', status: 400 };
  }
  return { body };
}

function hasOnlyKeys(body, allowed) {
  return Object.keys(body).every((key) => allowed.has(key));
}

function validateInput(body) {
  const mode = body.mode;
  if (mode !== 'preview' && mode !== 'personal') {
    return { error: 'mode_invalid', status: 400 };
  }
  if (body.lang !== 'pt' && body.lang !== 'en') {
    return { error: 'language_invalid', status: 400 };
  }
  if (typeof body.narratorId !== 'string' || !NARRATOR_VOICES[body.narratorId]) {
    return { error: 'narrator_invalid', status: 400 };
  }

  if (mode === 'preview') {
    if (!hasOnlyKeys(body, PREVIEW_KEYS)) return { error: 'invalid_request', status: 400 };
    return {
      value: {
        mode,
        lang: body.lang,
        narratorId: body.narratorId,
        text: PREVIEW_TEXT[body.lang],
      },
    };
  }

  if (!hasOnlyKeys(body, PERSONAL_KEYS)) return { error: 'invalid_request', status: 400 };
  if (body.cloudConsent !== true) return { error: 'cloud_consent_required', status: 403 };
  if (body.cloudConsentVersion !== CLOUD_CONSENT_VERSION) {
    return { error: 'cloud_consent_required', status: 403 };
  }
  if (body.adultConfirmed !== true) {
    return { error: 'adult_confirmation_required', status: 403 };
  }
  if (typeof body.text !== 'string' || body.text.length > MAX_TEXT_CHARS) {
    return { error: 'text_invalid', status: 400 };
  }
  const text = cleanText(body.text, MAX_TEXT_CHARS);
  if (text.length < 2) return { error: 'text_invalid', status: 400 };
  return {
    value: {
      mode,
      lang: body.lang,
      narratorId: body.narratorId,
      text,
    },
  };
}

function audioUnits(input) {
  if (input && input.mode === 'preview') return 1;
  const length = typeof input?.text === 'string' ? input.text.length : 0;
  const steps = Math.max(1, Math.ceil(length / AUDIO_CHARS_PER_UNIT_STEP));
  return Math.min(MAX_AUDIO_UNITS, steps * AUDIO_UNITS_PER_STEP);
}

function buildElevenLabsRequest(input, model = configuredModel()) {
  const narrator = NARRATOR_VOICES[input.narratorId];
  return {
    text: input.text,
    model_id: model,
    voice_settings: {
      stability: narrator.settings.stability,
      similarity_boost: narrator.settings.similarityBoost,
      style: narrator.settings.style,
      use_speaker_boost: true,
      speed: narrator.settings.speed,
    },
  };
}

function configuredModel() {
  const value = cleanText(process.env.ELEVENLABS_TTS_MODEL || DEFAULT_TTS_MODEL, 100);
  return /^eleven_[a-z0-9._-]+$/i.test(value) ? value : DEFAULT_TTS_MODEL;
}

function timeoutMs() {
  const configured = Number(process.env.ELEVENLABS_TTS_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return 20_000;
  return Math.min(30_000, Math.max(2_000, Math.floor(configured)));
}

// O ms em que a voz começa cada letra, só quando o alinhamento é do texto enviado letra por letra (senão null: o app
// segue a legenda por letras, como antes).
function letterTimes(alignment, text) {
  const characters = alignment && Array.isArray(alignment.characters) ? alignment.characters : null;
  const starts = alignment && Array.isArray(alignment.character_start_times_seconds)
    ? alignment.character_start_times_seconds
    : null;
  if (!characters || !starts || starts.length !== text.length || characters.join('') !== text) return null;
  let last = 0;
  const times = [];
  for (const start of starts) {
    const seconds = Number(start);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    last = Math.max(last, Math.round(seconds * 1000));
    times.push(last);
  }
  return times;
}

// O WAV de sempre (cabeçalho de 44 bytes + PCM). Com os tempos das letras, eles vão DEPOIS do som num pedaço 'ctim'
// (JSON): os tocadores param no fim do pedaço 'data' e o cache do app guarda os dois juntos.
function pcmToWav(pcm, times = null) {
  if (!Buffer.isBuffer(pcm) || !pcm.length || pcm.length > MAX_PCM_BYTES || pcm.length % 2 !== 0) {
    throw new AudioGenerationError('invalid_audio');
  }
  const timing = times ? Buffer.from(JSON.stringify(times), 'ascii') : null;
  const extra = timing ? 8 + timing.length + (timing.length % 2) : 0;
  const header = Buffer.alloc(44);
  const blockAlign = (PCM_CHANNELS * PCM_BITS_PER_SAMPLE) / 8;
  const byteRate = PCM_SAMPLE_RATE * blockAlign;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length + extra, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(PCM_CHANNELS, 22);
  header.writeUInt32LE(PCM_SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(PCM_BITS_PER_SAMPLE, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  if (!timing) return Buffer.concat([header, pcm]);
  const chunk = Buffer.alloc(extra);
  chunk.write('ctim', 0, 'ascii');
  chunk.writeUInt32LE(timing.length, 4);
  timing.copy(chunk, 8);
  return Buffer.concat([header, pcm, chunk]);
}

// A voz com o tempo de cada letra (/with-timestamps, o mesmo corpo): a legenda do app anda com ela. Se essa rota
// recusar o pedido, a voz vem pela rota de antes (timed = false), sem os tempos.
async function requestElevenLabs(input, model, apiKey, timed = true) {
  if (typeof fetch !== 'function') throw new AudioGenerationError('audio_unavailable');
  const narrator = NARRATOR_VOICES[input.narratorId];
  const query = new URLSearchParams({
    output_format: `pcm_${PCM_SAMPLE_RATE}`,
    enable_logging: 'false',
  });
  const route = timed ? '/with-timestamps' : '';
  const endpoint = `${ELEVENLABS_TTS_ENDPOINT}/${encodeURIComponent(narrator.voiceId)}${route}?${query}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: timed ? 'application/json' : 'audio/pcm',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify(buildElevenLabsRequest(input, model)),
      signal: controller.signal,
    });
    if (!response || !response.ok) {
      if (response && response.status === 429) {
        throw new AudioGenerationError('audio_rate_limited');
      }
      if (response && (response.status === 401 || response.status === 403)) {
        throw new AudioGenerationError('audio_not_configured');
      }
      if (timed && response && TIMESTAMPS_REJECTED.has(response.status)) {
        return requestElevenLabs(input, model, apiKey, false);
      }
      throw new AudioGenerationError('audio_unavailable');
    }
    const contentType = cleanText(
      response.headers && response.headers.get ? response.headers.get('content-type') || '' : '',
      120
    ).toLowerCase();
    if (timed) {
      if (!/^application\/json(?:;|$)/.test(contentType)) throw new AudioGenerationError('invalid_audio');
      const raw = await response.text();
      if (raw.length > MAX_TIMED_RESPONSE_CHARS) throw new AudioGenerationError('audio_too_large');
      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch (_error) {}
      const pcm = Buffer.from(payload && typeof payload.audio_base64 === 'string' ? payload.audio_base64 : '', 'base64');
      if (pcm.length > MAX_PCM_BYTES) throw new AudioGenerationError('audio_too_large');
      return pcmToWav(pcm, letterTimes(payload && payload.alignment, input.text));
    }
    if (!/^audio\/(?:pcm|l16|raw)(?:;|$)/.test(contentType)) {
      throw new AudioGenerationError('invalid_audio');
    }
    const declaredLength = Number(
      response.headers && response.headers.get ? response.headers.get('content-length') : NaN
    );
    if (Number.isFinite(declaredLength) && declaredLength > MAX_PCM_BYTES) {
      throw new AudioGenerationError('audio_too_large');
    }
    const pcm = Buffer.from(await response.arrayBuffer());
    if (!pcm.length || pcm.length > MAX_PCM_BYTES) {
      throw new AudioGenerationError('audio_too_large');
    }
    return pcmToWav(pcm);
  } catch (error) {
    if (error instanceof AudioGenerationError) throw error;
    if (error && error.name === 'AbortError') throw new AudioGenerationError('audio_timeout');
    throw new AudioGenerationError('audio_unavailable');
  } finally {
    clearTimeout(timer);
  }
}

function allowedOrigins() {
  const configured = cleanText(process.env.CELESTE_ALLOWED_ORIGINS || '', 4000);
  const values = configured
    ? configured.split(',').map((value) => value.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;
  return new Set(values.filter((value) => /^https?:\/\/[^\s/]+(?::\d+)?$/.test(value)));
}

function setResponseHeaders(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  const origin = cleanText((req.headers && req.headers.origin) || '', 500);
  const allowed = Boolean(origin) && allowedOrigins().has(origin);
  if (origin && allowed) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-Celeste-Client, X-Celeste-Request-Id, X-Is-Human, X-Path, X-Method'
  );
  return allowed;
}

async function verifyHumanRequest(req) {
  try {
    const verification = await botVerifier({
      developmentOptions: {
        isDevelopment:
          process.env.CELESTE_ALLOW_LOCAL_BOT_BYPASS === '1' &&
          process.env.VERCEL_ENV !== 'production' &&
          process.env.VERCEL_ENV !== 'preview',
        bypass: 'HUMAN',
      },
      advancedOptions: {
        checkLevel: 'basic',
        headers: (req && req.headers) || {},
      },
    });
    if (!verification || verification.isBot || verification.isHuman !== true) {
      return { status: 403, error: 'automated_request_blocked' };
    }
    return null;
  } catch (_error) {
    return { status: 503, error: 'bot_verification_unavailable' };
  }
}

function sendJson(res, status, code) {
  return res.status(status).json({ error: code });
}

async function handler(req, res) {
  const originAllowed = setResponseHeaders(req, res);
  const nativeRequest = paidAccess.isNativeRequest(req);
  if (!originAllowed && !nativeRequest) return sendJson(res, 403, 'origin_not_allowed');

  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return res.status(204).end();
  if (method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, 'method_not_allowed');
  }

  if (originAllowed) {
    const botError = await verifyHumanRequest(req);
    if (botError) return sendJson(res, botError.status, botError.error);
  }

  const parsed = parseBody(req);
  if (parsed.error) return sendJson(res, parsed.status, parsed.error);
  const validated = validateInput(parsed.body);
  if (validated.error) return sendJson(res, validated.status, validated.error);

  const localPreviewCapture =
    process.env.CELESTE_ALLOW_PREVIEW_CAPTURE === '1' &&
    process.env.VERCEL_ENV !== 'production' &&
    process.env.VERCEL_ENV !== 'preview';
  if (validated.value.mode === 'preview' && !localPreviewCapture) {
    return sendJson(res, 410, 'preview_is_bundled');
  }

  const apiKey = cleanText(process.env.ELEVENLABS_API_KEY || '', 512);
  if (!apiKey) {
    return sendJson(res, 503, 'audio_not_configured');
  }

  const access = await paidAccess.authorizePaidRequest(req, {
    operation: 'audio',
    units: audioUnits(validated.value),
  });
  if (!access.ok) return sendJson(res, access.status, access.error);
  const committedAccess = await paidAccess.commitPaidRequest(access);
  if (!committedAccess.ok) {
    await paidAccess.releasePaidRequest(access).catch(() => {});
    return sendJson(res, committedAccess.status, committedAccess.error);
  }

  try {
    const wav = await requestElevenLabs(validated.value, configuredModel(), apiKey);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(wav.length));
    return res.status(200).send(wav);
  } catch (error) {
    if (error && error.code === 'audio_timeout') return sendJson(res, 504, error.code);
    if (error && error.code === 'audio_rate_limited') return sendJson(res, 429, error.code);
    if (error && error.code === 'audio_not_configured') return sendJson(res, 503, error.code);
    if (
      error &&
      ['invalid_audio', 'audio_too_large'].includes(error.code)
    ) {
      return sendJson(res, 502, error.code);
    }
    return sendJson(res, 503, 'audio_unavailable');
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.handler = handler;
module.exports._internals = {
  AUDIO_CHARS_PER_UNIT_STEP,
  MAX_AUDIO_UNITS,
  MAX_TEXT_CHARS,
  NARRATOR_VOICES,
  PREVIEW_TEXT,
  audioUnits,
  buildElevenLabsRequest,
  configuredModel,
  parseBody,
  pcmToWav,
  requestElevenLabs,
  validateInput,
  resetSecurityForTests: () => {
    botVerifier = checkBotId;
    paidAccess.resetAuthorizerForTests();
  },
  setBotVerifierForTests: (verifier) => {
    botVerifier = typeof verifier === 'function' ? verifier : checkBotId;
  },
  setPaidAccessAuthorizerForTests: paidAccess.setAuthorizerForTests,
};
