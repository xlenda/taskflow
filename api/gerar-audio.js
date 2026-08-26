const { checkBotId } = require('botid/server');

const DEFAULT_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_INTERACTIONS_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_API_REVISION = '2026-05-20';
const MAX_BODY_BYTES = 12 * 1024;
const MAX_TEXT_CHARS = 1800;
const MAX_PCM_BYTES = 4_000_000;
const MAX_UPSTREAM_BYTES = 6_000_000;
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
    voice: 'Sulafat',
    direction: 'Warm, confident, luminous, and intimate. Keep a calm natural pace.',
  }),
  rio: Object.freeze({
    voice: 'Callirrhoe',
    direction: 'Calm, neutral, contemplative, and unhurried. Keep the delivery natural.',
  }),
  atlas: Object.freeze({
    voice: 'Orus',
    direction: 'Deep, warm, grounded, and immersive. Speak slowly without sounding theatrical.',
  }),
  serena: Object.freeze({
    voice: 'Vindemiatrix',
    direction: 'Soft, intimate, serene, and reassuring. Use a gentle natural pace.',
  }),
  luma: Object.freeze({
    voice: 'Achird',
    direction: 'Friendly, light, close, and welcoming. Sound sincere rather than promotional.',
  }),
  nilo: Object.freeze({
    voice: 'Charon',
    direction: 'Clear, centered, composed, and assured. Keep an even natural rhythm.',
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

function languageDirection(lang) {
  return lang === 'en'
    ? 'Speak in natural English.'
    : 'Speak in natural Brazilian Portuguese.';
}

function buildGeminiRequest(input) {
  const narrator = NARRATOR_VOICES[input.narratorId];
  const prompt = [
    languageDirection(input.lang),
    narrator.direction,
    'Read only the passage below exactly as written. Do not add, remove, explain, or repeat words.',
    '--- BEGIN PASSAGE ---',
    input.text,
    '--- END PASSAGE ---',
  ].join('\n');
  return {
    model: null,
    input: prompt,
    store: false,
    response_format: {
      type: 'audio',
      sample_rate: PCM_SAMPLE_RATE,
    },
    generation_config: {
      speech_config: [{ voice: narrator.voice }],
    },
  };
}

function configuredModel() {
  const value = cleanText(process.env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL, 100);
  return /^gemini-[a-z0-9._-]*tts[a-z0-9._-]*$/i.test(value) ? value : DEFAULT_TTS_MODEL;
}

function timeoutMs() {
  const configured = Number(process.env.GEMINI_TTS_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return 30_000;
  return Math.min(60_000, Math.max(20, Math.floor(configured)));
}

function base64Buffer(value) {
  if (typeof value !== 'string') throw new AudioGenerationError('invalid_audio');
  const encoded = value.replace(/\s+/g, '');
  const maxEncodedLength = Math.ceil(MAX_PCM_BYTES / 3) * 4 + 4;
  if (!encoded || encoded.length > maxEncodedLength || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new AudioGenerationError('invalid_audio');
  }
  const decoded = Buffer.from(encoded, 'base64');
  const normalizedInput = encoded.replace(/=+$/, '');
  const normalizedOutput = decoded.toString('base64').replace(/=+$/, '');
  if (normalizedInput !== normalizedOutput) throw new AudioGenerationError('invalid_audio');
  return decoded;
}

function isWave(buffer) {
  return (
    buffer.length >= 44 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WAVE'
  );
}

function audioParts(payload) {
  const parts = [];
  if (isPlainObject(payload && payload.output_audio)) parts.push(payload.output_audio);
  for (const step of Array.isArray(payload && payload.steps) ? payload.steps : []) {
    if (!isPlainObject(step)) continue;
    if (step.type === 'audio') parts.push(step);
    for (const part of Array.isArray(step.content) ? step.content : []) {
      if (isPlainObject(part) && part.type === 'audio') parts.push(part);
    }
  }
  for (const output of Array.isArray(payload && payload.outputs) ? payload.outputs : []) {
    if (!isPlainObject(output)) continue;
    if (output.type === 'audio') parts.push(output);
    for (const part of Array.isArray(output.content) ? output.content : []) {
      if (isPlainObject(part) && part.type === 'audio') parts.push(part);
    }
  }
  return parts;
}

function extractAudio(payload) {
  if (!isPlainObject(payload)) throw new AudioGenerationError('invalid_upstream_json');
  if (payload.status && payload.status !== 'completed') {
    throw new AudioGenerationError('invalid_audio');
  }
  const part = audioParts(payload).find((candidate) => typeof candidate.data === 'string');
  if (!part) throw new AudioGenerationError('invalid_audio');

  const sampleRate = Number(part.sample_rate || part.sampleRate || PCM_SAMPLE_RATE);
  if (sampleRate !== PCM_SAMPLE_RATE) throw new AudioGenerationError('invalid_audio');
  const mimeType = cleanText(part.mime_type || part.mimeType || 'audio/l16', 120).toLowerCase();
  const audio = base64Buffer(part.data);
  if (!audio.length || audio.length > MAX_PCM_BYTES) {
    throw new AudioGenerationError('audio_too_large');
  }
  if (/^audio\/(?:wav|x-wav)(?:;|$)/.test(mimeType)) {
    if (!isWave(audio)) throw new AudioGenerationError('invalid_audio');
    return audio;
  }
  if (!/^audio\/(?:l16|pcm|raw)(?:;|$)/.test(mimeType) || audio.length % 2 !== 0) {
    throw new AudioGenerationError('invalid_audio');
  }
  return pcmToWav(audio);
}

function pcmToWav(pcm) {
  if (!Buffer.isBuffer(pcm) || !pcm.length || pcm.length > MAX_PCM_BYTES || pcm.length % 2 !== 0) {
    throw new AudioGenerationError('invalid_audio');
  }
  const header = Buffer.alloc(44);
  const blockAlign = (PCM_CHANNELS * PCM_BITS_PER_SAMPLE) / 8;
  const byteRate = PCM_SAMPLE_RATE * blockAlign;
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
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
  return Buffer.concat([header, pcm]);
}

async function requestGemini(input, model, apiKey) {
  if (typeof fetch !== 'function') throw new AudioGenerationError('audio_unavailable');
  const request = buildGeminiRequest(input);
  request.model = model;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  let response;
  try {
    response = await fetch(GEMINI_INTERACTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'Api-Revision': GEMINI_API_REVISION,
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
  } catch (error) {
    if (error && error.name === 'AbortError') throw new AudioGenerationError('audio_timeout');
    throw new AudioGenerationError('audio_unavailable');
  } finally {
    clearTimeout(timer);
  }
  if (!response || !response.ok) throw new AudioGenerationError('audio_unavailable');
  const declaredLength = Number(response.headers && response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPSTREAM_BYTES) {
    throw new AudioGenerationError('audio_too_large');
  }
  let payload;
  try {
    payload = await response.json();
  } catch (_error) {
    throw new AudioGenerationError('invalid_upstream_json');
  }
  return extractAudio(payload);
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Is-Human, X-Path, X-Method');
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
  if (!originAllowed) return sendJson(res, 403, 'origin_not_allowed');

  const method = String(req.method || 'GET').toUpperCase();
  if (method === 'OPTIONS') return res.status(204).end();
  if (method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(res, 405, 'method_not_allowed');
  }

  const botError = await verifyHumanRequest(req);
  if (botError) return sendJson(res, botError.status, botError.error);

  const parsed = parseBody(req);
  if (parsed.error) return sendJson(res, parsed.status, parsed.error);
  const validated = validateInput(parsed.body);
  if (validated.error) return sendJson(res, validated.status, validated.error);

  const apiKey = cleanText(process.env.GEMINI_API_KEY || '', 512);
  if (!apiKey || process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED !== '1') {
    return sendJson(res, 503, 'audio_not_configured');
  }

  try {
    const wav = await requestGemini(validated.value, configuredModel(), apiKey);
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(wav.length));
    return res.status(200).send(wav);
  } catch (error) {
    if (error && error.code === 'audio_timeout') return sendJson(res, 504, error.code);
    if (
      error &&
      ['invalid_audio', 'invalid_upstream_json', 'audio_too_large'].includes(error.code)
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
  NARRATOR_VOICES,
  PREVIEW_TEXT,
  buildGeminiRequest,
  extractAudio,
  parseBody,
  pcmToWav,
  validateInput,
  resetSecurityForTests: () => { botVerifier = checkBotId; },
  setBotVerifierForTests: (verifier) => {
    botVerifier = typeof verifier === 'function' ? verifier : checkBotId;
  },
};
