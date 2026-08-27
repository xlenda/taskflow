import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

const DB_NAME = 'celeste-private-assets';
const DB_VERSION = 1;
const STORE_NAME = 'personal-visuals';
const NATIVE_DIRECTORY = 'celeste-personal-visuals';
const MAX_IMAGE_BYTES = 2_500_000;
const MAX_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4;
const CACHE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{5,139}$/;

let databasePromise = null;

function cleanCacheKey(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return CACHE_KEY_PATTERN.test(key) ? key : '';
}

function validBase64(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_BASE64_CHARS &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

function estimatedBase64Bytes(value) {
  if (!value) return 0;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function openDatabase() {
  if (Platform.OS !== 'web' || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('personal_visual_storage_unavailable'));
  }
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('personal_visual_storage_unavailable'));
    request.onblocked = () => reject(new Error('personal_visual_storage_unavailable'));
  }).catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

async function webOperation(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    try {
      result = operation(store);
    } catch (_error) {
      reject(new Error('personal_visual_storage_unavailable'));
      return;
    }
    transaction.oncomplete = () => resolve(result && result.result);
    transaction.onerror = () => reject(new Error('personal_visual_storage_unavailable'));
    transaction.onabort = () => reject(new Error('personal_visual_storage_unavailable'));
  });
}

function nativeDirectory() {
  return new Directory(Paths.document, NATIVE_DIRECTORY);
}

function nativeFile(cacheKey) {
  return new File(nativeDirectory(), `${cacheKey}.jpg`);
}

function base64ToBlob(base64) {
  if (typeof atob !== 'function') throw new Error('personal_visual_storage_unavailable');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: 'image/jpeg' });
}

export function createPersonalVisualCacheKey(manifestationId) {
  const id = String(manifestationId || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'manifestation';
  const nonce = Math.random().toString(36).slice(2, 10);
  return `visual-${id}-${Date.now().toString(36)}-${nonce}`.slice(0, 140);
}

export async function savePersonalVisual({ cacheKey, base64, mimeType }) {
  const key = cleanCacheKey(cacheKey);
  if (
    !key ||
    mimeType !== 'image/jpeg' ||
    !validBase64(base64) ||
    estimatedBase64Bytes(base64) > MAX_IMAGE_BYTES
  ) {
    throw new Error('invalid_personal_visual');
  }

  if (Platform.OS === 'web') {
    const blob = base64ToBlob(base64);
    if (!blob.size || blob.size > MAX_IMAGE_BYTES) throw new Error('invalid_personal_visual');
    await webOperation('readwrite', (store) =>
      store.put({ blob, mimeType: 'image/jpeg', createdAt: new Date().toISOString() }, key)
    );
    return key;
  }

  const directory = nativeDirectory();
  directory.create({ intermediates: true, idempotent: true });
  const file = nativeFile(key);
  file.create({ intermediates: true, overwrite: true });
  file.write(base64, { encoding: 'base64' });
  if (!file.exists || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    if (file.exists) file.delete();
    throw new Error('invalid_personal_visual');
  }
  return key;
}

export async function acquirePersonalVisual(cacheKey) {
  const key = cleanCacheKey(cacheKey);
  if (!key) return null;

  if (Platform.OS === 'web') {
    const record = await webOperation('readonly', (store) => store.get(key));
    const blob = record && record.blob;
    if (
      !(blob instanceof Blob) ||
      blob.type !== 'image/jpeg' ||
      !blob.size ||
      blob.size > MAX_IMAGE_BYTES ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      return null;
    }
    const uri = URL.createObjectURL(blob);
    return {
      uri,
      release: () => {
        if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(uri);
      },
    };
  }

  const file = nativeFile(key);
  if (!file.exists || file.size <= 0 || file.size > MAX_IMAGE_BYTES) return null;
  return { uri: file.uri, release: () => {} };
}

export async function deletePersonalVisual(cacheKey) {
  const key = cleanCacheKey(cacheKey);
  if (!key) return false;
  if (Platform.OS === 'web') {
    await webOperation('readwrite', (store) => store.delete(key));
    return true;
  }
  const file = nativeFile(key);
  if (file.exists) file.delete();
  return true;
}

export async function clearPersonalVisuals() {
  if (Platform.OS === 'web') {
    await webOperation('readwrite', (store) => store.clear());
    return true;
  }
  const directory = nativeDirectory();
  if (directory.exists) directory.delete();
  return true;
}

export function isPersonalVisualCacheKey(value) {
  return !!cleanCacheKey(value);
}
