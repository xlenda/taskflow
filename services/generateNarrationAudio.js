import { celestePaidApiHeaders } from './celesteApiSession';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { narratorPreviewUrl } from '../constants/narrators';
import { CLOUD_CONSENT_VERSION } from '../constants/cloudConsent';
import {
  acquireNarrationAudio,
  clearNarrationAudioStorage,
  createNarrationAudioCacheKey,
  NARRATION_AUDIO_MAX_IDLE_MS,
  narrationAudioStorageEpoch,
  narrationAudioStorageToken,
  saveNarrationAudio,
} from './narrationAudioStorage';

const API_TIMEOUT_MS = 35000;
const MAX_AUDIO_BYTES = 4_100_000;
export const MAX_AUDIO_CHUNK_CHARS = 800;
const MAX_PERSONAL_REQUEST_CHARS = MAX_AUDIO_CHUNK_CHARS;
const MAX_PERSONAL_SEQUENCE_CHARS = 12000;
const MAX_MEMORY_CACHE_BYTES = 24 * 1024 * 1024;
const MAX_MEMORY_CACHE_ENTRIES = 24;
const PROD_API_URL = 'https://celeste-jet-two.vercel.app';

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

function cacheIdentity({ mode, narratorId, lang, text }) {
  if (mode === 'personal') {
    const persistentKey = createNarrationAudioCacheKey({ text, narratorId, lang });
    return { memoryKey: persistentKey, persistentKey };
  }
  return {
    memoryKey: JSON.stringify([mode, narratorId, lang, 'bundled-preview']),
    persistentKey: '',
  };
}

function cachedAudio(key, expectedEpoch = null) {
  const cached = audioMemoryCache.get(key);
  if (!cached) return null;
  if (
    Date.now() - cached.lastAccessedAt > NARRATION_AUDIO_MAX_IDLE_MS ||
    (expectedEpoch !== null && cached.storageEpoch !== expectedEpoch)
  ) {
    audioMemoryCache.delete(key);
    audioMemoryCacheBytes -= cached.bytes.byteLength;
    return null;
  }
  audioMemoryCache.delete(key);
  cached.lastAccessedAt = Date.now();
  audioMemoryCache.set(key, cached);
  return cached.bytes.slice();
}

function rememberAudio(key, bytes, storageEpoch = null) {
  const copy = bytes.slice();
  const previous = audioMemoryCache.get(key);
  if (previous) {
    audioMemoryCacheBytes -= previous.bytes.byteLength;
    audioMemoryCache.delete(key);
  }
  audioMemoryCache.set(key, {
    bytes: copy,
    lastAccessedAt: Date.now(),
    storageEpoch,
  });
  audioMemoryCacheBytes += copy.byteLength;

  while (
    audioMemoryCache.size > MAX_MEMORY_CACHE_ENTRIES ||
    audioMemoryCacheBytes > MAX_MEMORY_CACHE_BYTES
  ) {
    const oldestKey = audioMemoryCache.keys().next().value;
    const oldest = audioMemoryCache.get(oldestKey);
    audioMemoryCache.delete(oldestKey);
    audioMemoryCacheBytes -= oldest ? oldest.bytes.byteLength : 0;
  }
}

export function clearNarrationAudioMemoryCache({ persistent = true } = {}) {
  for (const pending of pendingAudioRequests.values()) {
    if (pending && pending.controller && !pending.settled) pending.controller.abort();
  }
  pendingAudioRequests.clear();
  audioMemoryCache.clear();
  audioMemoryCacheBytes = 0;
  if (!persistent) return Promise.resolve(true);
  return clearNarrationAudioStorage().then(
    () => true,
    () => false
  );
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

function normalizedRequestTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return API_TIMEOUT_MS;
  return Math.max(10, Math.min(API_TIMEOUT_MS, Math.floor(parsed)));
}

async function fetchNarrationAudio({ body, fetchImpl, signal, timeoutMs }) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const abort = () => controller && controller.abort();
  if (signal && signal.aborted) {
    throw new NarrationRequestError('audio_cancelled');
  }
  const request = fetchImpl || fetch;
  const requestSignal = controller ? controller.signal : signal;
  let timer = null;
  let onExternalAbort = null;
  let timedOut = false;
  let externallyCancelled = false;

  try {
    const timeoutPromise = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        abort();
        reject(new NarrationRequestError('audio_timeout'));
      }, normalizedRequestTimeout(timeoutMs));
    });
    const cancellationPromise = signal && typeof signal.addEventListener === 'function'
      ? new Promise((_resolve, reject) => {
        onExternalAbort = () => {
          externallyCancelled = true;
          abort();
          reject(new NarrationRequestError('audio_cancelled'));
        };
        signal.addEventListener('abort', onExternalAbort, { once: true });
      })
      : null;
    const operation = (async () => {
      const authorization = fetchImpl ? {} : await celestePaidApiHeaders({ signal: requestSignal });
      if (externallyCancelled || (signal && signal.aborted)) {
        throw new NarrationRequestError('audio_cancelled');
      }
      if (timedOut || (requestSignal && requestSignal.aborted)) {
        throw new NarrationRequestError('audio_timeout');
      }
      const response = await request(apiEndpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authorization },
        cache: 'no-store',
        signal: requestSignal,
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
    })();
    return await Promise.race(
      cancellationPromise ? [operation, timeoutPromise, cancellationPromise] : [operation, timeoutPromise]
    );
  } catch (error) {
    if (error instanceof NarrationRequestError) throw error;
    if ((controller && controller.signal.aborted) || (error && error.name === 'AbortError')) {
      throw new NarrationRequestError(
        externallyCancelled || (signal && signal.aborted) ? 'audio_cancelled' : 'audio_timeout'
      );
    }
    throw new NarrationRequestError('audio_unavailable');
  } finally {
    if (timer) clearTimeout(timer);
    if (signal && onExternalAbort && typeof signal.removeEventListener === 'function') {
      signal.removeEventListener('abort', onExternalAbort);
    }
  }
}

async function loadNarratorPreview({ narratorId, lang, signal }) {
  if (signal && signal.aborted) throw new NarrationRequestError('audio_cancelled');
  const moduleId = narratorPreviewUrl(narratorId, lang);
  if (!moduleId) throw new NarrationRequestError('preview_unavailable');
  try {
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    if (signal && signal.aborted) throw new NarrationRequestError('audio_cancelled');
    const uri = asset.localUri || asset.uri;
    let bytes;
    if (Platform.OS === 'web') {
      const response = await fetch(uri, { cache: 'force-cache', signal });
      if (!response.ok) throw new NarrationRequestError('preview_unavailable');
      bytes = new Uint8Array(await response.arrayBuffer());
    } else {
      bytes = await new File(uri).bytes();
    }
    if (bytes.length > MAX_AUDIO_BYTES || !isWave(bytes)) {
      throw new NarrationRequestError('invalid_audio_response');
    }
    return bytes;
  } catch (error) {
    if (error instanceof NarrationRequestError) throw error;
    if ((signal && signal.aborted) || (error && error.name === 'AbortError')) {
      throw new NarrationRequestError('audio_cancelled');
    }
    throw new NarrationRequestError('preview_unavailable');
  }
}

export async function requestNarrationAudio({
  mode,
  narratorId,
  lang = 'pt',
  text,
  cloudConsent = false,
  cloudConsentVersion,
  adultConfirmed = false,
  fetchImpl,
  previewLoaderImpl,
  signal,
  timeoutMs,
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
    if (cloudConsentVersion !== CLOUD_CONSENT_VERSION) {
      throw new NarrationRequestError('cloud_consent_required', 403);
    }
    if (adultConfirmed !== true) {
      throw new NarrationRequestError('adult_confirmation_required', 403);
    }
    body.text = passage;
    body.cloudConsent = true;
    body.cloudConsentVersion = CLOUD_CONSENT_VERSION;
    body.adultConfirmed = true;
  }

  if (signal && signal.aborted) throw new NarrationRequestError('audio_cancelled');
  const { memoryKey, persistentKey } = cacheIdentity({ ...body, text: body.text });
  if (!memoryKey) throw new NarrationRequestError('text_invalid');
  const currentStorageEpoch = requestMode === 'personal' ? narrationAudioStorageEpoch() : null;
  const cached = cachedAudio(memoryKey, currentStorageEpoch);
  if (cached) return cached;

  let pending = pendingAudioRequests.get(memoryKey);
  if (
    pending &&
    !pending.settled &&
    pending.consumers === 0 &&
    pending.controller &&
    pending.controller.signal.aborted
  ) {
    if (pendingAudioRequests.get(memoryKey) === pending) {
      pendingAudioRequests.delete(memoryKey);
    }
    pending = null;
  }
  if (!pending) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const persistentEpoch = narrationAudioStorageEpoch();
    pending = {
      controller,
      consumers: 0,
      settled: false,
      promise: null,
    };
    const pendingSignal = controller ? controller.signal : undefined;
    let cacheGenerationCurrent = requestMode !== 'personal';
    pending.promise = (async () => {
      let persistentToken = '';
      if (requestMode === 'personal' && persistentKey) {
        try {
          persistentToken = await narrationAudioStorageToken();
          const stored = await acquireNarrationAudio(persistentKey);
          if (stored) {
            if (pendingSignal && pendingSignal.aborted) {
              throw new NarrationRequestError('audio_cancelled');
            }
            cacheGenerationCurrent =
              narrationAudioStorageEpoch() === persistentEpoch &&
              (await narrationAudioStorageToken()) === persistentToken;
            return stored;
          }
        } catch (storageFailure) {
          cacheGenerationCurrent = narrationAudioStorageEpoch() === persistentEpoch;
          if (storageFailure instanceof NarrationRequestError) throw storageFailure;
          // Storage is a best-effort private cache; playback remains available.
        }
      }

      if (pendingSignal && pendingSignal.aborted) {
        throw new NarrationRequestError('audio_cancelled');
      }
      const bytes = requestMode === 'preview'
        ? await (previewLoaderImpl || loadNarratorPreview)({
          narratorId: narrator,
          lang: locale,
          signal: pendingSignal,
        })
        : await fetchNarrationAudio({
          body,
          fetchImpl,
          signal: pendingSignal,
          timeoutMs,
        });

      if (requestMode === 'personal' && persistentKey) {
        try {
          const saved = await saveNarrationAudio({
            cacheKey: persistentKey,
            bytes,
            expectedEpoch: persistentEpoch,
            expectedToken: persistentToken,
          });
          cacheGenerationCurrent = saved !== false;
        } catch (_storageError) {
          cacheGenerationCurrent = narrationAudioStorageEpoch() === persistentEpoch;
          // Private mode can reject persistence; keep the valid audio in this
          // session unless a reset invalidated the generation in the meantime.
        }
      }
      return bytes;
    })()
      .then((bytes) => {
        if (
          requestMode !== 'personal' ||
          (cacheGenerationCurrent && narrationAudioStorageEpoch() === persistentEpoch)
        ) {
          rememberAudio(memoryKey, bytes, requestMode === 'personal' ? persistentEpoch : null);
        }
        return bytes;
      })
      .finally(() => {
        pending.settled = true;
        if (pendingAudioRequests.get(memoryKey) === pending) {
          pendingAudioRequests.delete(memoryKey);
        }
      });
    pendingAudioRequests.set(memoryKey, pending);
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
