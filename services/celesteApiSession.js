import { Platform } from 'react-native';
import { getCelesteSupabaseClient } from './celesteSupabase';

let sessionPromise;

const NATIVE_STORE_PLATFORMS = new Set(['ios', 'android']);

export function celesteCloudAccessCapability(platform = Platform.OS) {
  const client = ['ios', 'android', 'web'].includes(platform) ? platform : 'native';
  if (NATIVE_STORE_PLATFORMS.has(client)) {
    return {
      available: false,
      client,
      reason: 'native_attestation_required',
    };
  }
  return { available: true, client, reason: null };
}

function assertCloudAccessAvailable() {
  const capability = celesteCloudAccessCapability();
  if (capability.available) return capability;
  const error = new Error(capability.reason);
  error.code = capability.reason;
  throw error;
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

export async function getCelesteApiSession() {
  // The first store release deliberately stays local on iOS/Android. A client
  // header or embedded secret cannot prove that a request came from the
  // official binary, so do not even create an anonymous cloud session until
  // App Attest / Play Integrity verification exists end to end.
  assertCloudAccessAvailable();
  if (!sessionPromise) {
    sessionPromise = currentOrAnonymousSession().finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

export async function celestePaidApiHeaders() {
  const capability = assertCloudAccessAvailable();
  const session = await getCelesteApiSession();
  return {
    Authorization: `Bearer ${session.access_token}`,
    'X-Celeste-Client': capability.client,
    'X-Celeste-Request-Id': requestId(),
  };
}
