const API_TIMEOUT_MS = 35000;
const MAX_AUDIO_BYTES = 4_100_000;
const MAX_PERSONAL_REQUEST_CHARS = 1800;
const MAX_PERSONAL_SEQUENCE_CHARS = 12000;
const MAX_MEMORY_CACHE_BYTES = 24 * 1024 * 1024;
const MAX_MEMORY_CACHE_ENTRIES = 24;
const PROD_API_URL = 'https://celeste-jet-two.vercel.app';

export const MAX_AUDIO_CHUNK_CHARS = 800;

const audioMemoryCache = new Map();
const pendingAudioRequests = new Map();
let audioMemoryCacheBytes = 0;

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, maxLength)
    : '';
}

export function normalizeNarrationText(value) {
  return typeof value === 'string'
    ? value
        .replace(/\r\n?/g, '\n')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
}

function lastSentenceBoundary(value, limit, minimum) {
  const candidate = value.slice(0, limit);
  const pattern = /[.!?]+["')\]]*(?=\s|$)/g;
  let match;
  let boundary = -1;
  while ((match = pattern.exec(candidate))) {
    const end = match.index + match[0].length;
    if (end >= minimum) boundary = end;
  }
  return boundary;
}

export function splitNarrationText(value, maxChars = MAX_AUDIO_CHUNK_CHARS) {
  const text = normalizeNarrationText(value);
  if (!text || text.length > MAX_PERSONAL_SEQUENCE_CHARS) {
    throw new NarrationRequestError('text_invalid');
  }

  const requestedLimit = Number(maxChars);
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(200, Math.min(MAX_PERSONAL_REQUEST_CHARS, Math.floor(requestedLimit)))
    : MAX_AUDIO_CHUNK_CHARS;
  const chunks = [];
  let remaining = text;

  while (remaining.length > limit) {
    const minimumSentenceLength = Math.floor(limit * 0.5);
    let boundary = lastSentenceBoundary(remaining, limit, minimumSentenceLength);

    if (boundary < 0) {
      const candidate = remaining.slice(0, limit + 1);
      boundary = candidate.lastIndexOf(' ', limit);
    }
    if (boundary <= 0) boundary = limit;

    const chunk = remaining.slice(0, boundary).trim();
    if (!chunk) throw new NarrationRequestError('text_invalid');
    chunks.push(chunk);
    remaining = remaining.slice(boundary).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function apiEndpoint() {
  const configured = cleanText(process.env.EXPO_PUBLIC_CELESTE_API_URL, 500).replace(/\/$/, '');
  if (configured) return `${configured}/api/gerar-audio`;
  if (typeof window !== 'undefined' && window.location) return '/api/gerar-audio';
  return `${PROD_API_URL}/api/gerar-audio`;
}

export class NarrationRequestError extends Error {
  constructor(code, status = 0) {
    super(code);
    this.name = 'NarrationRequestError';
    this.code = code;
    this.status = status;
  }
}

async function responseError(response) {
  let code = 'audio_request_failed';
  try {
    const raw = await response.text();
    if (raw.length <= 2048) {
      const payload = JSON.parse(raw);
      if (payload && typeof payload.error === 'string' && /^[a-z0-9_]+$/i.test(payload.error)) {
        code = payload.error;
      }
    }
  } catch (_error) {}
  return new NarrationRequestError(code, response.status || 0);
}

function isWave(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 44) return false;
  return (
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WAVE'
  );
}

function cacheKey({ mode, narratorId, lang, text }) {
  return JSON.stringify([mode, narratorId, lang, mode === 'personal' ? text : 'server-preview']);
}

function cachedAudio(key) {
  const cached = audioMemoryCache.get(key);
  if (!cached) return null;
  audioMemoryCache.delete(key);
  audioMemoryCache.set(key, cached);
  return cached.slice();
}

function rememberAudio(key, bytes) {
  const copy = bytes.slice();
  const previous = audioMemoryCache.get(key);
  if (previous) {
    audioMemoryCacheBytes -= previous.byteLength;
    audioMemoryCache.delete(key);
  }
  audioMemoryCache.set(key, copy);
  audioMemoryCacheBytes += copy.byteLength;

  while (
    audioMemoryCache.size > MAX_MEMORY_CACHE_ENTRIES ||
    audioMemoryCacheBytes > MAX_MEMORY_CACHE_BYTES
  ) {
    const oldestKey = audioMemoryCache.keys().next().value;
    const oldest = audioMemoryCache.get(oldestKey);
    audioMemoryCache.delete(oldestKey);
    audioMemoryCacheBytes -= oldest ? oldest.byteLength : 0;
  }
}

export function clearNarrationAudioMemoryCache() {
  for (const pending of pendingAudioRequests.values()) {
    if (pending && pending.controller && !pending.settled) pending.controller.abort();
  }
  pendingAudioRequests.clear();
  audioMemoryCache.clear();
  audioMemoryCacheBytes = 0;
}

export function narrationAudioMemoryCacheSize() {
  return audioMemoryCache.size;
}

function waitForConsumer(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new NarrationRequestError('audio_cancelled'));
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new NarrationRequestError('audio_cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    );
  });
}

async function fetchNarrationAudio({ body, fetchImpl, signal }) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timedOut = false;
  const abort = () => controller && controller.abort();
  const timeout = () => {
    timedOut = true;
    abort();
  };
  if (signal && signal.aborted) {
    throw new NarrationRequestError('audio_cancelled');
  }
  if (signal && typeof signal.addEventListener === 'function') {
    signal.addEventListener('abort', abort, { once: true });
  }
  const timer = controller ? setTimeout(timeout, API_TIMEOUT_MS) : null;
  const request = fetchImpl || fetch;

  try {
    const response = await request(apiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: controller ? controller.signal : signal,
      body: JSON.stringify(body),
    });
    if (!response || !response.ok) throw await responseError(response || {});
    const contentType = response.headers && response.headers.get
      ? response.headers.get('content-type') || ''
      : '';
    if (!/^audio\/wav(?:;|$)/i.test(contentType)) {
      throw new NarrationRequestError('invalid_audio_response', response.status || 0);
    }
    const declaredLength = Number(
      response.headers && response.headers.get ? response.headers.get('content-length') : NaN
    );
    if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
      throw new NarrationRequestError('audio_response_too_large', response.status || 0);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_AUDIO_BYTES) {
      throw new NarrationRequestError('audio_response_too_large', response.status || 0);
    }
    if (!isWave(bytes)) {
      throw new NarrationRequestError('invalid_audio_response', response.status || 0);
    }
    return bytes;
  } catch (error) {
    if (error instanceof NarrationRequestError) throw error;
    if ((controller && controller.signal.aborted) || (error && error.name === 'AbortError')) {
      throw new NarrationRequestError(
        signal && signal.aborted ? 'audio_cancelled' : timedOut ? 'audio_timeout' : 'audio_cancelled'
      );
    }
    throw new NarrationRequestError('audio_unavailable');
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && typeof signal.removeEventListener === 'function') {
      signal.removeEventListener('abort', abort);
    }
  }
}

export async function requestNarrationAudio({
  mode,
  narratorId,
  lang = 'pt',
  text,
  cloudConsent = false,
  adultConfirmed = false,
  fetchImpl,
  signal,
}) {
  const requestMode = mode === 'preview' ? 'preview' : mode === 'personal' ? 'personal' : '';
  if (!requestMode) throw new NarrationRequestError('mode_invalid');
  const narrator = cleanText(narratorId, 40);
  if (!narrator || narrator !== narratorId.trim()) {
    throw new NarrationRequestError('narrator_invalid');
  }
  const locale = lang === 'en' ? 'en' : lang === 'pt' ? 'pt' : '';
  if (!locale) throw new NarrationRequestError('language_invalid');

  const body = { mode: requestMode, narratorId: narrator, lang: locale };
  if (requestMode === 'personal') {
    const passage = normalizeNarrationText(text);
    if (!passage || passage.length > MAX_PERSONAL_REQUEST_CHARS) {
      throw new NarrationRequestError('text_invalid');
    }
    if (cloudConsent !== true) throw new NarrationRequestError('cloud_consent_required', 403);
    if (adultConfirmed !== true) {
      throw new NarrationRequestError('adult_confirmation_required', 403);
    }
    body.text = passage;
    body.cloudConsent = true;
    body.adultConfirmed = true;
  }

  if (signal && signal.aborted) throw new NarrationRequestError('audio_cancelled');
  const key = cacheKey({ ...body, text: body.text });
  const cached = cachedAudio(key);
  if (cached) return cached;

  let pending = pendingAudioRequests.get(key);
  if (
    pending &&
    !pending.settled &&
    pending.consumers === 0 &&
    pending.controller &&
    pending.controller.signal.aborted
  ) {
    if (pendingAudioRequests.get(key) === pending) pendingAudioRequests.delete(key);
    pending = null;
  }
  if (!pending) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    pending = {
      controller,
      consumers: 0,
      settled: false,
      promise: null,
    };
    pending.promise = fetchNarrationAudio({
      body,
      fetchImpl,
      signal: controller ? controller.signal : undefined,
    })
      .then((bytes) => {
        rememberAudio(key, bytes);
        return bytes;
      })
      .finally(() => {
        pending.settled = true;
        if (pendingAudioRequests.get(key) === pending) pendingAudioRequests.delete(key);
      });
    pendingAudioRequests.set(key, pending);
  }

  pending.consumers += 1;
  try {
    const bytes = await waitForConsumer(pending.promise, signal);
    return bytes.slice();
  } finally {
    pending.consumers = Math.max(0, pending.consumers - 1);
    if (!pending.settled && pending.consumers === 0 && pending.controller) {
      pending.controller.abort();
    }
  }
}
