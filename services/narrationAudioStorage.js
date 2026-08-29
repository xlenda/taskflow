import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

const DB_NAME = 'celeste-private-narration-audio';
const DB_VERSION = 2;
const STORE_NAME = 'personal-audio';
const META_STORE_NAME = 'cache-meta';
const META_GENERATION_KEY = 'generation';
const NATIVE_DIRECTORY = 'celeste-personal-narration-audio';
const NATIVE_INDEX = 'index-v1.json';
const CACHE_VERSION = 'narration-v1';
const CACHE_KEY_PATTERN = /^narration-v1-[a-f0-9]{64}$/;
const MAX_ITEM_BYTES = 4_100_000;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 40;
export const NARRATION_AUDIO_MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_IDLE_MS = NARRATION_AUDIO_MAX_IDLE_MS;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

let databasePromise = null;
let operationQueue = Promise.resolve();
let storageEpoch = 0;
let prunedStorageEpoch = -1;
let lastPrunedAt = 0;
let clearChannel = null;

function storageToken() {
  const random = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${random}`;
}

function ensureClearChannel() {
  if (
    clearChannel ||
    Platform.OS !== 'web' ||
    typeof window === 'undefined' ||
    typeof BroadcastChannel === 'undefined'
  ) {
    return clearChannel;
  }
  clearChannel = new BroadcastChannel('celeste-private-narration-audio-v1');
  clearChannel.onmessage = (event) => {
    if (event?.data?.type === 'clear') storageEpoch += 1;
  };
  return clearChannel;
}

function storageError(code = 'narration_audio_storage_unavailable') {
  const error = new Error(code);
  error.code = code;
  error.stage = 'storage';
  return error;
}

function queueOperation(operation) {
  const pending = operationQueue.catch(() => {}).then(operation);
  operationQueue = pending.catch(() => {});
  return pending;
}

function utf8Bytes(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value);
  const bytes = [];
  for (let index = 0; index < value.length; index += 1) {
    let point = value.charCodeAt(index);
    if (point >= 0xd800 && point <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        point = 0x10000 + ((point - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }
    if (point <= 0x7f) bytes.push(point);
    else if (point <= 0x7ff) {
      bytes.push(0xc0 | (point >>> 6), 0x80 | (point & 0x3f));
    } else if (point <= 0xffff) {
      bytes.push(0xe0 | (point >>> 12), 0x80 | ((point >>> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      bytes.push(
        0xf0 | (point >>> 18),
        0x80 | ((point >>> 12) & 0x3f),
        0x80 | ((point >>> 6) & 0x3f),
        0x80 | (point & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotateRight(value, amount) {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256Hex(value) {
  const input = utf8Bytes(value);
  const bitLength = input.length * 8;
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;
  const view = new DataView(padded.buffer);
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  view.setUint32(paddedLength - 8, highBits, false);
  view.setUint32(paddedLength - 4, lowBits, false);

  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const before15 = words[index - 15];
      const before2 = words[index - 2];
      const sigma0 = rotateRight(before15, 7) ^ rotateRight(before15, 18) ^ (before15 >>> 3);
      const sigma1 = rotateRight(before2, 17) ^ rotateRight(before2, 19) ^ (before2 >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temporary1 = (h + sum1 + choice + constants[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((part) => part.toString(16).padStart(8, '0')).join('');
}

function cleanCacheKey(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return CACHE_KEY_PATTERN.test(key) ? key : '';
}

function byteCopy(value) {
  if (value instanceof Uint8Array) return value.slice();
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    return new Uint8Array(value.slice(0));
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  }
  return null;
}

function isWave(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 44 || bytes.length > MAX_ITEM_BYTES) {
    return false;
  }
  return (
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WAVE'
  );
}

function validMetadata(record) {
  return (
    record &&
    cleanCacheKey(record.key) === record.key &&
    Number.isFinite(record.size) &&
    record.size >= 44 &&
    record.size <= MAX_ITEM_BYTES &&
    Number.isFinite(record.createdAt) &&
    Number.isFinite(record.lastAccessedAt)
  );
}

function evictionKeys(
  records,
  protectedKey,
  now = Date.now(),
  maxEntries = MAX_CACHE_ENTRIES,
  maxBytes = MAX_CACHE_BYTES,
  maxIdleMs = MAX_IDLE_MS
) {
  const remove = new Set();
  const live = [];
  for (const record of Array.isArray(records) ? records : []) {
    if (!validMetadata(record)) {
      if (record && cleanCacheKey(record.key)) remove.add(record.key);
      continue;
    }
    if (record.key !== protectedKey && now - record.lastAccessedAt > maxIdleMs) {
      remove.add(record.key);
      continue;
    }
    live.push(record);
  }

  live.sort(
    (left, right) =>
      left.lastAccessedAt - right.lastAccessedAt ||
      left.createdAt - right.createdAt ||
      left.key.localeCompare(right.key)
  );
  let count = live.length;
  let bytes = live.reduce((total, record) => total + record.size, 0);
  for (const record of live) {
    if (count <= maxEntries && bytes <= maxBytes) break;
    if (record.key === protectedKey) continue;
    remove.add(record.key);
    count -= 1;
    bytes -= record.size;
  }
  return [...remove];
}

function openDatabase() {
  if (Platform.OS !== 'web' || typeof indexedDB === 'undefined') {
    return Promise.reject(storageError());
  }
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
      if (!database.objectStoreNames.contains(META_STORE_NAME)) {
        database.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storageError());
    request.onblocked = () => reject(storageError());
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

async function webGenerationToken() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(META_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(META_STORE_NAME);
    const request = store.get(META_GENERATION_KEY);
    let token = '';
    request.onsuccess = () => {
      token = typeof request.result?.value === 'string' ? request.result.value : storageToken();
      if (!request.result?.value) store.put({ key: META_GENERATION_KEY, value: token });
    };
    transaction.oncomplete = () => resolve(token);
    transaction.onerror = () => reject(storageError());
    transaction.onabort = () => reject(storageError());
  });
}

async function webAcquire(key, now) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);
    let result = null;
    request.onsuccess = () => {
      const record = request.result;
      const bytes = byteCopy(record && record.bytes);
      if (
        !validMetadata(record) ||
        !bytes ||
        bytes.byteLength !== record.size ||
        now - record.lastAccessedAt > MAX_IDLE_MS ||
        !isWave(bytes)
      ) {
        if (record) store.delete(key);
        return;
      }
      result = bytes;
      if (now - record.lastAccessedAt >= TOUCH_INTERVAL_MS) {
        store.put({ ...record, lastAccessedAt: now });
      }
    };
    transaction.oncomplete = () => resolve(result && result.slice());
    transaction.onerror = () => reject(storageError());
    transaction.onabort = () => reject(storageError());
  });
}

async function webSave(key, bytes, expectedEpoch, expectedToken, now) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(META_STORE_NAME);
    const tokenRequest = metaStore.get(META_GENERATION_KEY);
    let saved = false;
    tokenRequest.onsuccess = () => {
      if (
        expectedEpoch !== storageEpoch ||
        !expectedToken ||
        tokenRequest.result?.value !== expectedToken
      ) {
        transaction.abort();
        return;
      }
      const request = store.getAll();
      request.onsuccess = () => {
        const prior = (request.result || []).find((record) => record && record.key === key);
        const record = {
          key,
          bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          size: bytes.byteLength,
          createdAt: validMetadata(prior) ? prior.createdAt : now,
          lastAccessedAt: now,
        };
        const records = (request.result || []).filter((item) => item && item.key !== key);
        records.push(record);
        for (const evictedKey of evictionKeys(records, key, now)) store.delete(evictedKey);
        store.put(record);
        saved = true;
      };
    };
    transaction.oncomplete = () => resolve(saved);
    transaction.onerror = () => reject(storageError());
    transaction.onabort = () => resolve(false);
  });
}

async function webClear() {
  if (typeof indexedDB === 'undefined') return true;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    transaction.objectStore(META_STORE_NAME).put({
      key: META_GENERATION_KEY,
      value: storageToken(),
    });
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(storageError());
    transaction.onabort = () => reject(storageError());
  });
}

async function webPrune(now) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    let removed = 0;
    request.onsuccess = () => {
      for (const key of evictionKeys(request.result || [], '', now)) {
        store.delete(key);
        removed += 1;
      }
    };
    transaction.oncomplete = () => resolve(removed);
    transaction.onerror = () => reject(storageError());
    transaction.onabort = () => reject(storageError());
  });
}

function nativeDirectory() {
  return new Directory(Paths.cache, NATIVE_DIRECTORY);
}

function nativeFile(key) {
  return new File(nativeDirectory(), `${key}.wav`);
}

function nativeIndexFile() {
  return new File(nativeDirectory(), NATIVE_INDEX);
}

function emptyNativeIndex() {
  return { version: 1, entries: {} };
}

async function readNativeIndex(directory) {
  const file = nativeIndexFile();
  if (!file.exists) return emptyNativeIndex();
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || parsed.version !== 1 || !parsed.entries || Array.isArray(parsed.entries)) {
      throw storageError();
    }
    const entries = {};
    for (const [key, value] of Object.entries(parsed.entries)) {
      const record = { key, ...value };
      if (validMetadata(record)) entries[key] = value;
    }
    return { version: 1, entries };
  } catch (_error) {
    if (directory.exists) directory.delete();
    directory.create({ intermediates: true, idempotent: true });
    return emptyNativeIndex();
  }
}

function writeNativeIndex(index) {
  const file = nativeIndexFile();
  file.create({ intermediates: true, overwrite: true });
  file.write(JSON.stringify(index));
}

function deleteNativeFile(key) {
  const file = nativeFile(key);
  if (file.exists) file.delete();
}

async function nativeAcquire(key, now) {
  const directory = nativeDirectory();
  if (!directory.exists) return null;
  const index = await readNativeIndex(directory);
  const metadata = index.entries[key];
  const file = nativeFile(key);
  if (!metadata || !file.exists) {
    if (metadata) {
      delete index.entries[key];
      writeNativeIndex(index);
    }
    return null;
  }
  const bytes = byteCopy(await file.bytes());
  if (
    !bytes ||
    bytes.byteLength !== metadata.size ||
    now - metadata.lastAccessedAt > MAX_IDLE_MS ||
    !isWave(bytes)
  ) {
    deleteNativeFile(key);
    delete index.entries[key];
    writeNativeIndex(index);
    return null;
  }
  if (now - metadata.lastAccessedAt >= TOUCH_INTERVAL_MS) {
    index.entries[key] = { ...metadata, lastAccessedAt: now };
    writeNativeIndex(index);
  }
  return bytes.slice();
}

async function nativeSave(key, bytes, expectedEpoch, now) {
  if (expectedEpoch !== storageEpoch) return false;
  const directory = nativeDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const index = await readNativeIndex(directory);
  if (expectedEpoch !== storageEpoch) return false;
  const file = nativeFile(key);
  file.create({ intermediates: true, overwrite: true });
  file.write(bytes);
  if (!file.exists || file.size !== bytes.byteLength || !isWave(byteCopy(await file.bytes()))) {
    if (file.exists) file.delete();
    throw storageError('invalid_narration_audio');
  }
  const prior = index.entries[key];
  index.entries[key] = {
    size: bytes.byteLength,
    createdAt: prior && Number.isFinite(prior.createdAt) ? prior.createdAt : now,
    lastAccessedAt: now,
  };
  const records = Object.entries(index.entries).map(([entryKey, value]) => ({
    key: entryKey,
    ...value,
  }));
  for (const evictedKey of evictionKeys(records, key, now)) {
    deleteNativeFile(evictedKey);
    delete index.entries[evictedKey];
  }
  if (expectedEpoch !== storageEpoch) {
    deleteNativeFile(key);
    delete index.entries[key];
    return false;
  }
  writeNativeIndex(index);
  return true;
}

async function nativeClear() {
  const directory = nativeDirectory();
  if (directory.exists) directory.delete();
  return true;
}

async function nativePrune(now) {
  const directory = nativeDirectory();
  if (!directory.exists) return 0;
  const index = await readNativeIndex(directory);
  const records = Object.entries(index.entries).map(([key, value]) => ({ key, ...value }));
  const expired = evictionKeys(records, '', now);
  let removed = 0;
  for (const key of expired) {
    deleteNativeFile(key);
    delete index.entries[key];
    removed += 1;
  }
  for (const entry of directory.list()) {
    if (!(entry instanceof File) || !entry.name.endsWith('.wav')) continue;
    const key = entry.name.slice(0, -4);
    if (!cleanCacheKey(key) || !index.entries[key]) {
      entry.delete();
      removed += 1;
    }
  }
  if (expired.length) writeNativeIndex(index);
  return removed;
}

async function pruneStorageOnce(now) {
  const epoch = storageEpoch;
  if (prunedStorageEpoch === epoch && now - lastPrunedAt < PRUNE_INTERVAL_MS) return 0;
  const removed = Platform.OS === 'web' ? await webPrune(now) : await nativePrune(now);
  if (epoch === storageEpoch) {
    prunedStorageEpoch = epoch;
    lastPrunedAt = now;
  }
  return removed;
}

export function createNarrationAudioCacheKey({ text, narratorId, lang }) {
  const passage = typeof text === 'string' ? text : '';
  const narrator = typeof narratorId === 'string' ? narratorId : '';
  const locale = lang === 'pt' || lang === 'en' ? lang : '';
  if (!passage || passage.length > 800 || !/^[a-z0-9_-]{1,40}$/.test(narrator) || !locale) {
    return '';
  }
  const digest = sha256Hex(JSON.stringify([CACHE_VERSION, narrator, locale, passage]));
  return `${CACHE_VERSION}-${digest}`;
}

export function narrationAudioStorageEpoch() {
  return storageEpoch;
}

export function narrationAudioStorageToken() {
  return queueOperation(() => {
    if (Platform.OS !== 'web') return String(storageEpoch);
    ensureClearChannel();
    return webGenerationToken();
  });
}

export async function acquireNarrationAudio(cacheKey) {
  const key = cleanCacheKey(cacheKey);
  if (!key) return null;
  return queueOperation(async () => {
    const now = Date.now();
    await pruneStorageOnce(now);
    return Platform.OS === 'web' ? webAcquire(key, now) : nativeAcquire(key, now);
  });
}

export async function saveNarrationAudio({ cacheKey, bytes, expectedEpoch, expectedToken }) {
  const key = cleanCacheKey(cacheKey);
  const copy = byteCopy(bytes);
  const epoch = Number.isInteger(expectedEpoch) ? expectedEpoch : storageEpoch;
  if (!key || !copy || !isWave(copy)) throw storageError('invalid_narration_audio');
  return queueOperation(() => {
    if (epoch !== storageEpoch) return false;
    return Platform.OS === 'web'
      ? webSave(key, copy, epoch, expectedToken, Date.now())
      : nativeSave(key, copy, epoch, Date.now());
  });
}

export function clearNarrationAudioStorage() {
  storageEpoch += 1;
  const channel = ensureClearChannel();
  channel?.postMessage({ type: 'clear' });
  return queueOperation(() => (Platform.OS === 'web' ? webClear() : nativeClear()));
}

export const narrationAudioStorageInternals = Object.freeze({
  MAX_CACHE_BYTES,
  MAX_CACHE_ENTRIES,
  MAX_IDLE_MS,
  PRUNE_INTERVAL_MS,
  CACHE_KEY_PATTERN,
  evictionKeys,
  pruneStorageOnce,
  sha256Hex,
});
