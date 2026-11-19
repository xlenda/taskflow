import { Platform } from 'react-native';
import { appIntegrityConfigured, forgetAppAttestKey, integrityHash, integrityHeaderFor } from './appIntegrity';
import { getCelesteSupabaseClient } from './celesteSupabase';

let sessionPromise;

const NATIVE_STORE_PLATFORMS = new Set(['ios', 'android']);
// The paid operations the store apps may run, each verified on the server — Play Integrity
// on Android, App Attest on iOS (same names as api/_play-integrity.js NATIVE_OPERATIONS):
// the voice and the AI texts, the Anchor Scene with the 6+6 suite and its translation.
// Images and dreams stay closed.
const NATIVE_VERIFIED_OPERATIONS = new Set(['audio', 'scene', 'translation']);

// A platform's proof only vouches for the platform the app is running on.
function nativeVerified(client, operation) {
  return client === Platform.OS && NATIVE_VERIFIED_OPERATIONS.has(operation) && appIntegrityConfigured();
}

export function celesteCloudAccessCapability(platform = Platform.OS, operation = null) {
  const client = ['ios', 'android', 'web'].includes(platform) ? platform : 'native';
  if (NATIVE_STORE_PLATFORMS.has(client) && !nativeVerified(client, operation)) {
    return {
      available: false,
      client,
      reason: 'native_attestation_required',
    };
  }
  return { available: true, client, reason: null };
}

function attestationRequired() {
  const error = new Error('native_attestation_required');
  error.code = 'native_attestation_required';
  return error;
}

function assertCloudAccessAvailable(operation) {
  const capability = celesteCloudAccessCapability(Platform.OS, operation);
  if (capability.available) return capability;
  throw attestationRequired();
}

function requestId() {
  const random = Math.random().toString(36).slice(2);
  return `celeste-${Date.now().toString(36)}-${random}`.slice(0, 90);
}

async function currentOrAnonymousSession() {
  const supabase = getCelesteSupabaseClient();
  if (!supabase) throw new Error('cloud_session_not_configured');

  const { data: current, error: currentError } = await supabase.auth.getSession();
  if (currentError) throw new Error('cloud_session_unavailable');
  if (current && current.session && current.session.access_token) return current.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data || !data.session || !data.session.access_token) {
    throw new Error('cloud_session_unavailable');
  }
  return data.session;
}

function apiSession() {
  if (!sessionPromise) {
    sessionPromise = currentOrAnonymousSession().finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

export async function getCelesteApiSession() {
  // A client header or embedded secret cannot prove that a request came from
  // the official binary: iOS/Android never get a generic cloud session.
  // Their voice and texts get one only through celestePaidApiHeaders, with a Play
  // Integrity token (Android) or an App Attest assertion (iOS) for that exact request.
  assertCloudAccessAvailable();
  return apiSession();
}

// `body` is the exact JSON string the caller will send: in the store apps the proof
// (Play Integrity token, App Attest assertion) is bound to it, to the operation and
// to the session that sends it (a proof captured for one session fails for another),
// so the session is created or reused first and every app request must pass its body here.
// `signal` (the narration's timeout or cancel) stops the iPhone's key registration on the way.
export async function celestePaidApiHeaders({ operation = null, body, signal } = {}) {
  const capability = assertCloudAccessAvailable(operation);
  const native = NATIVE_STORE_PLATFORMS.has(capability.client);
  if (native && typeof body !== 'string') throw attestationRequired();
  const id = requestId();
  const session = await apiSession();
  let integrity = null;
  if (native) {
    integrity = await integrityHeaderFor({
      operation,
      requestId: id,
      sessionHash: integrityHash(session.access_token),
      bodyHash: integrityHash(body),
      // iOS registers its App Attest key once per user of this session (POST /api/app-attest).
      accessToken: session.access_token,
      userId: session.user?.id,
      signal,
    });
    if (!integrity) throw attestationRequired();
  }
  return {
    Authorization: `Bearer ${session.access_token}`,
    'X-Celeste-Client': capability.client,
    'X-Celeste-Request-Id': id,
    ...integrity,
  };
}

// Every paid service reports here a refusal of a request sent with these headers. The one rule: 403
// app_attest_reattest_required (the server does not know this iPhone's App Attest key for this user) forgets that key,
// so the next paid request registers a new one. Any other refusal changes nothing. Never throws.
export async function celestePaidApiRefused(headers, status, code) {
  if (status !== 403 || code !== 'app_attest_reattest_required') return;
  await forgetAppAttestKey(headers?.['X-Celeste-Attest-Key']);
}
