import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { narrationAudioStorageInternals } from './narrationAudioStorage';

// Play Integrity "standard request" for the Android voice. Docs:
// docs.expo.dev/versions/latest/sdk/app-integrity and
// developer.android.com/google/play/integrity/standard. The token is bound to
// the exact request and to the session that sends it; api/_play-integrity.js
// recomputes this canonical string.
const REQUEST_HASH_VERSION = 'celeste-play-integrity-v2';
// Play prepares a token provider at most 5 times per minute per app instance.
const PREPARE_RETRY_MS = 60 * 1000;
const { sha256Hex } = narrationAudioStorageInternals;

// App Attest on iOS (developer.apple.com "Establishing your app's integrity"; the contract with the server is in
// docs/superpowers/plans/2026-11-19-ios-voz-app-attest.md). One Secure Enclave key per user of the session on this
// device: generated once, attested by Apple and registered with POST /api/app-attest; then every voice and text
// request carries an assertion over this canonical string, which the server recomputes.
const ATTEST_HASH_VERSION = 'celeste-app-attest-v1';
// { keyId, registered } per user. The key identifier is not a secret (the private key never leaves the Secure
// Enclave): it sits next to the Supabase session, in AsyncStorage.
const ATTEST_KEY_STORAGE = '@celeste_app_attest_key_v1:';
const PROD_API_URL = 'https://celeste-jet-two.vercel.app';

let providerPromise = null;
let prepareBlockedUntil = 0;
const attestRegistrations = new Map();

function projectNumber() {
  const value = String(process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER || '').trim();
  return /^\d{1,20}$/.test(value) ? value : '';
}

function appAttestSupported() {
  try {
    // Lazy: a build without the native module stays closed instead of crashing.
    return require('@expo/app-integrity').isSupported === true;
  } catch (_error) {
    return false;
  }
}

export function appIntegrityConfigured() {
  if (Platform.OS === 'ios') return appAttestSupported();
  return Platform.OS === 'android' && Boolean(projectNumber());
}

// sha256 (hex) of the exact JSON string sent, or of the session's access token.
export function integrityHash(value) {
  return sha256Hex(value);
}

export function integrityRequestHash({ operation, requestId, sessionHash, bodyHash }) {
  return sha256Hex([REQUEST_HASH_VERSION, operation, requestId, sessionHash, bodyHash].join('\n'));
}

// What an iOS assertion signs (the native module signs SHA256(utf8(challenge))).
export function appAttestChallenge({ operation, requestId, sessionHash, bodyHash, attestTimeMs }) {
  return sha256Hex([ATTEST_HASH_VERSION, operation, requestId, sessionHash, bodyHash, attestTimeMs].join('\n'));
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

async function postAppAttest(body, headers = {}) {
  const configured = String(process.env.EXPO_PUBLIC_CELESTE_API_URL || '').trim().replace(/\/$/, '');
  const response = await fetch(`${configured || PROD_API_URL}/api/app-attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Celeste-Client': 'ios', ...headers },
    body: JSON.stringify(body),
  });
  const result = response.ok ? await response.json() : null;
  if (!result) throw new Error(`app_attest_${response.status}`);
  return result;
}

function savedAttestKey(value) {
  try {
    const saved = JSON.parse(value);
    return typeof saved?.keyId === 'string' && saved.keyId ? saved : null;
  } catch (_error) {
    return null;
  }
}

// Apple: after DCError.serverUnavailable try again later with the same key; after any other error discard it and
// create a new key on the next try (this also catches a key lost to a reinstall, a device migration or a restore).
async function forgetKeyUnlessRetryable(storageKey, error) {
  if (error?.code !== 'ERR_APP_INTEGRITY_SERVER_UNAVAILABLE') await AsyncStorage.removeItem(storageKey);
}

async function registeredKeyId(AppIntegrity, storageKey, accessToken) {
  let saved = savedAttestKey(await AsyncStorage.getItem(storageKey));
  if (saved?.registered === true) return saved.keyId;
  if (!saved) {
    const keyId = await AppIntegrity.generateKeyAsync();
    if (typeof keyId !== 'string' || !keyId) throw new Error('app_attest_key_unavailable');
    saved = { keyId, registered: false };
    // Kept before attesting: a server-unavailable attestation is retried with this same key.
    await AsyncStorage.setItem(storageKey, JSON.stringify(saved));
  }
  const { challenge } = await postAppAttest({ action: 'challenge' });
  if (typeof challenge !== 'string' || !challenge) throw new Error('app_attest_challenge_invalid');
  let attestation;
  try {
    attestation = await AppIntegrity.attestKeyAsync(saved.keyId, challenge);
  } catch (error) {
    await forgetKeyUnlessRetryable(storageKey, error);
    throw error;
  }
  const registration = await postAppAttest(
    { action: 'register', keyId: saved.keyId, attestation, challenge },
    { Authorization: `Bearer ${accessToken}` }
  );
  if (registration.ok !== true) throw new Error('app_attest_not_registered');
  await AsyncStorage.setItem(storageKey, JSON.stringify({ keyId: saved.keyId, registered: true }));
  return saved.keyId;
}

// One registration at a time per user: the voice and the texts may ask together on a fresh install.
function sharedRegistration(AppIntegrity, storageKey, accessToken) {
  if (!attestRegistrations.has(storageKey)) {
    attestRegistrations.set(
      storageKey,
      registeredKeyId(AppIntegrity, storageKey, accessToken).finally(() => attestRegistrations.delete(storageKey))
    );
  }
  return attestRegistrations.get(storageKey);
}

async function appAttestHeaders({ operation, requestId, sessionHash, bodyHash, accessToken, userId }) {
  const AppIntegrity = require('@expo/app-integrity');
  if (AppIntegrity.isSupported !== true || !accessToken || !userId) return null;
  const storageKey = `${ATTEST_KEY_STORAGE}${userId}`;
  const keyId = await sharedRegistration(AppIntegrity, storageKey, accessToken);
  const attestTimeMs = Date.now();
  let assertion;
  try {
    assertion = await AppIntegrity.generateAssertionAsync(
      keyId,
      appAttestChallenge({ operation, requestId, sessionHash, bodyHash, attestTimeMs })
    );
  } catch (error) {
    await forgetKeyUnlessRetryable(storageKey, error);
    throw error;
  }
  if (typeof assertion !== 'string' || !assertion) return null;
  return {
    'X-Celeste-Attest-Key': keyId,
    'X-Celeste-Attest-Time': String(attestTimeMs),
    'X-Celeste-Attest-Assertion': assertion,
  };
}

// The proof for this exact request, or null; never throws. Android: { 'X-Celeste-Integrity': token } (Play
// Integrity). iOS: X-Celeste-Attest-Key/-Time/-Assertion (App Attest), registering the key first when needed.
export async function integrityHeaderFor({ operation, requestId, sessionHash, bodyHash, accessToken, userId }) {
  if (Platform.OS === 'ios') {
    return appAttestHeaders({ operation, requestId, sessionHash, bodyHash, accessToken, userId }).catch(() => null);
  }
  if (!appIntegrityConfigured() || Date.now() < prepareBlockedUntil) return null;
  try {
    // Lazy: a build without the native module stays closed instead of crashing.
    const AppIntegrity = require('@expo/app-integrity');
    const requestHash = integrityRequestHash({ operation, requestId, sessionHash, bodyHash });
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
