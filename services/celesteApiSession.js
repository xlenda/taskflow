import { Platform } from 'react-native';
import { appIntegrityConfigured, integrityHeaderFor, requestBodyHash } from './appIntegrity';
import { getCelesteSupabaseClient } from './celesteSupabase';

let sessionPromise;

const NATIVE_STORE_PLATFORMS = new Set(['ios', 'android']);
// The one paid operation Android may run: the voice, verified by Play Integrity
// (same name as the server operation in api/gerar-audio.js).
const ANDROID_VOICE_OPERATION = 'audio';

function androidVoice(client, operation) {
  return client === 'android' && operation === ANDROID_VOICE_OPERATION && appIntegrityConfigured();
}

export function celesteCloudAccessCapability(platform = Platform.OS, operation = null) {
  const client = ['ios', 'android', 'web'].includes(platform) ? platform : 'native';
  if (NATIVE_STORE_PLATFORMS.has(client) && !androidVoice(client, operation)) {
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
  // Android voice gets one only through celestePaidApiHeaders, after a Play
  // Integrity token was issued for that exact request.
  assertCloudAccessAvailable();
  return apiSession();
}

// `body` is the exact JSON string the caller will send: on Android the Play
// Integrity token is bound to it, so the voice request must pass it here.
export async function celestePaidApiHeaders({ operation = null, body } = {}) {
  const capability = assertCloudAccessAvailable(operation);
  const id = requestId();
  let integrity = null;
  if (capability.client === 'android') {
    integrity =
      typeof body === 'string'
        ? await integrityHeaderFor({ operation, requestId: id, bodyHash: requestBodyHash(body) })
        : null;
    if (!integrity) throw attestationRequired();
  }
  const session = await apiSession();
  return {
    Authorization: `Bearer ${session.access_token}`,
    'X-Celeste-Client': capability.client,
    'X-Celeste-Request-Id': id,
    ...integrity,
  };
}
