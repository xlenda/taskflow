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
// { keyId, registered } per user, plus { attestation, challenge, challengeAt } between Apple's attestation and its
// registration. The key identifier is not a secret (the private key never leaves the Secure Enclave): it sits next to
// the Supabase session, in AsyncStorage.
const ATTEST_KEY_STORAGE = '@celeste_app_attest_key_v1:';
// A failed registration waits 1 min, 2, 4… up to 6 h before the next one, per user and across launches, so a device
// that cannot register does not ask Apple and our server again on every paid request. A registration clears it.
const ATTEST_RETRY_STORAGE = '@celeste_app_attest_retry_v1:';
const ATTEST_RETRY_BASE_MS = 60 * 1000;
const ATTEST_RETRY_MAX_MS = 6 * 60 * 60 * 1000;
// The server takes a challenge for 5 minutes: an attestation whose registration failed is sent again (Apple is not
// asked again) while its challenge holds, with 30 s of margin for the trip.
const ATTEST_RESEND_MS = 4.5 * 60 * 1000;
const ATTEST_FETCH_TIMEOUT_MS = 15 * 1000;
const PROD_API_URL = 'https://celeste-jet-two.vercel.app';

let providerPromise = null;
let prepareBlockedUntil = 0;
const attestRegistrations = new Map();
// keyId → its user's storage key, for the keys that signed a request in this run: a paid route's refusal names the key.
const attestKeyOwners = new Map();

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

// Gives up after 15 s, or as soon as the caller's signal aborts (the narration's own timeout or cancel).
async function postAppAttest(body, headers, signal) {
  const configured = String(process.env.EXPO_PUBLIC_CELESTE_API_URL || '').trim().replace(/\/$/, '');
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, ATTEST_FETCH_TIMEOUT_MS);
  if (signal?.aborted) abort();
  signal?.addEventListener?.('abort', abort);
  try {
    const response = await fetch(`${configured || PROD_API_URL}/api/app-attest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Celeste-Client': 'ios', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const result = response.ok ? await response.json() : null;
    if (!result) throw new Error(`app_attest_${response.status}`);
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
  }
}

function savedAttestKey(value) {
  try {
    const saved = JSON.parse(value);
    return typeof saved?.keyId === 'string' && saved.keyId ? saved : null;
  } catch (_error) {
    return null;
  }
}

function savedRetry(value) {
  try {
    const saved = JSON.parse(value);
    return { failures: Number(saved?.failures) || 0, until: Number(saved?.until) || 0 };
  } catch (_error) {
    return { failures: 0, until: 0 };
  }
}

async function attestAndRegister(AppIntegrity, storageKey, saved, accessToken, signal) {
  const age = Date.now() - saved?.challengeAt;
  let pending = saved?.attestation && age >= 0 && age < ATTEST_RESEND_MS ? saved : null;
  if (!pending) {
    // A key Apple already attested is not attested again: once that challenge expires, a new key.
    let keyId = saved && !saved.attestation ? saved.keyId : '';
    if (!keyId) {
      keyId = await AppIntegrity.generateKeyAsync();
      if (typeof keyId !== 'string' || !keyId) throw new Error('app_attest_key_unavailable');
      // Kept before attesting: a server-unavailable attestation is retried with this same key.
      await AsyncStorage.setItem(storageKey, JSON.stringify({ keyId, registered: false }));
    }
    const challengeAt = Date.now();
    const { challenge } = await postAppAttest({ action: 'challenge' }, {}, signal);
    if (typeof challenge !== 'string' || !challenge) throw new Error('app_attest_challenge_invalid');
    let attestation;
    try {
      attestation = await AppIntegrity.attestKeyAsync(keyId, challenge);
    } catch (error) {
      // Apple: after DCError.serverUnavailable try again later with the same key; after any other error discard it
      // and create a new key on the next try (this also catches a key lost to a reinstall, a migration or a restore).
      if (error?.code !== 'ERR_APP_INTEGRITY_SERVER_UNAVAILABLE') await AsyncStorage.removeItem(storageKey);
      throw error;
    }
    pending = { keyId, registered: false, attestation, challenge, challengeAt };
    // Kept before registering: if the registration fails, only the registration is sent again.
    await AsyncStorage.setItem(storageKey, JSON.stringify(pending));
  }
  const registration = await postAppAttest(
    { action: 'register', keyId: pending.keyId, attestation: pending.attestation, challenge: pending.challenge },
    { Authorization: `Bearer ${accessToken}` },
    signal
  );
  if (registration.ok !== true) throw new Error('app_attest_not_registered');
  await AsyncStorage.setItem(storageKey, JSON.stringify({ keyId: pending.keyId, registered: true }));
  return pending.keyId;
}

async function registeredKeyId(AppIntegrity, userId, accessToken, signal) {
  const storageKey = `${ATTEST_KEY_STORAGE}${userId}`;
  const saved = savedAttestKey(await AsyncStorage.getItem(storageKey));
  if (saved?.registered === true) return saved.keyId;
  // Checked before Apple or our server is asked (a wait beyond the cap comes from a clock set back: it does not hold).
  const retryKey = `${ATTEST_RETRY_STORAGE}${userId}`;
  const retry = savedRetry(await AsyncStorage.getItem(retryKey));
  const wait = retry.until - Date.now();
  if (wait > 0 && wait <= ATTEST_RETRY_MAX_MS) throw new Error('app_attest_retry_later');
  try {
    const keyId = await attestAndRegister(AppIntegrity, storageKey, saved, accessToken, signal);
    await AsyncStorage.removeItem(retryKey);
    return keyId;
  } catch (error) {
    // the caller giving up (its timeout or cancel) is not a failed registration
    if (!signal?.aborted) {
      const failures = retry.failures + 1;
      const delay = Math.min(ATTEST_RETRY_BASE_MS * 2 ** (failures - 1), ATTEST_RETRY_MAX_MS);
      await AsyncStorage.setItem(retryKey, JSON.stringify({ failures, until: Date.now() + delay }));
    }
    throw error;
  }
}

// One registration at a time per user: the voice and the texts may ask together on a fresh install.
function sharedRegistration(AppIntegrity, userId, accessToken, signal) {
  if (!attestRegistrations.has(userId)) {
    attestRegistrations.set(
      userId,
      registeredKeyId(AppIntegrity, userId, accessToken, signal).finally(() => attestRegistrations.delete(userId))
    );
  }
  return attestRegistrations.get(userId);
}

async function appAttestHeaders({ operation, requestId, sessionHash, bodyHash, accessToken, userId, signal }) {
  const AppIntegrity = require('@expo/app-integrity');
  if (AppIntegrity.isSupported !== true || !accessToken || !userId) return null;
  const keyId = await sharedRegistration(AppIntegrity, userId, accessToken, signal);
  const storageKey = `${ATTEST_KEY_STORAGE}${userId}`;
  attestKeyOwners.set(keyId, storageKey);
  const attestTimeMs = Date.now();
  let assertion;
  try {
    assertion = await AppIntegrity.generateAssertionAsync(
      keyId,
      appAttestChallenge({ operation, requestId, sessionHash, bodyHash, attestTimeMs })
    );
  } catch (error) {
    // Only a key the Secure Enclave no longer has (reinstall, device migration, backup restore) is forgotten; any
    // other failure keeps the registered key for the next request.
    if (error?.code === 'ERR_APP_INTEGRITY_INVALID_KEY') await AsyncStorage.removeItem(storageKey);
    throw error;
  }
  if (typeof assertion !== 'string' || !assertion) return null;
  return {
    'X-Celeste-Attest-Key': keyId,
    'X-Celeste-Attest-Time': String(attestTimeMs),
    'X-Celeste-Attest-Assertion': assertion,
  };
}

// A paid route answered 403 app_attest_reattest_required: the server does not know this key for this user. Forget it
// (unless a newer key already took its place), so the next paid request registers a new one within the retry wait.
// Never throws.
export async function forgetAppAttestKey(keyId) {
  const storageKey = attestKeyOwners.get(keyId);
  if (!storageKey) return;
  attestKeyOwners.delete(keyId);
  try {
    if (savedAttestKey(await AsyncStorage.getItem(storageKey))?.keyId === keyId) await AsyncStorage.removeItem(storageKey);
  } catch (_error) {}
}

// The proof for this exact request, or null; never throws. Android: { 'X-Celeste-Integrity': token } (Play
// Integrity). iOS: X-Celeste-Attest-Key/-Time/-Assertion (App Attest), registering the key first when needed; the
// caller's signal stops that registration's network calls.
export async function integrityHeaderFor({ operation, requestId, sessionHash, bodyHash, accessToken, userId, signal }) {
  if (Platform.OS === 'ios') {
    return appAttestHeaders({ operation, requestId, sessionHash, bodyHash, accessToken, userId, signal }).catch(
      () => null
    );
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
