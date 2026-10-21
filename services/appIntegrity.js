import { Platform } from 'react-native';
import { narrationAudioStorageInternals } from './narrationAudioStorage';

// Play Integrity "standard request" for the Android voice. Docs:
// docs.expo.dev/versions/latest/sdk/app-integrity and
// developer.android.com/google/play/integrity/standard. The token is bound to
// the exact request; api/_play-integrity.js recomputes this canonical string.
const REQUEST_HASH_VERSION = 'celeste-play-integrity-v1';
// Play prepares a token provider at most 5 times per minute per app instance.
const PREPARE_RETRY_MS = 60 * 1000;
const { sha256Hex } = narrationAudioStorageInternals;

let providerPromise = null;
let prepareBlockedUntil = 0;

function projectNumber() {
  const value = String(process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER || '').trim();
  return /^\d{1,20}$/.test(value) ? value : '';
}

export function appIntegrityConfigured() {
  return Platform.OS === 'android' && Boolean(projectNumber());
}

export function requestBodyHash(body) {
  return sha256Hex(body);
}

export function integrityRequestHash({ operation, requestId, bodyHash }) {
  return sha256Hex([REQUEST_HASH_VERSION, operation, requestId, bodyHash].join('\n'));
}

function prepareProvider(AppIntegrity, renew = false) {
  if (renew) providerPromise = null;
  if (!providerPromise) {
    providerPromise = AppIntegrity.prepareIntegrityTokenProviderAsync(projectNumber()).catch(
      (error) => {
        providerPromise = null;
        prepareBlockedUntil = Date.now() + PREPARE_RETRY_MS;
        throw error;
      }
    );
  }
  return providerPromise;
}

// Returns { 'X-Celeste-Integrity': token } or null; never throws.
export async function integrityHeaderFor({ operation, requestId, bodyHash }) {
  if (!appIntegrityConfigured() || Date.now() < prepareBlockedUntil) return null;
  try {
    // Lazy: a build without the native module stays closed instead of crashing.
    const AppIntegrity = require('@expo/app-integrity');
    const requestHash = integrityRequestHash({ operation, requestId, bodyHash });
    await prepareProvider(AppIntegrity);
    let token;
    try {
      token = await AppIntegrity.requestIntegrityCheckAsync(requestHash);
    } catch (error) {
      if (!error || error.code !== 'ERR_APP_INTEGRITY_PROVIDER_INVALID') throw error;
      await prepareProvider(AppIntegrity, true);
      token = await AppIntegrity.requestIntegrityCheckAsync(requestHash);
    }
    return typeof token === 'string' && token ? { 'X-Celeste-Integrity': token } : null;
  } catch (_error) {
    return null;
  }
}
