import { Platform } from 'react-native';
import { getCelesteSupabaseClient } from './celesteSupabase';

let sessionPromise;

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
  if (!sessionPromise) {
    sessionPromise = currentOrAnonymousSession().finally(() => {
      sessionPromise = null;
    });
  }
  return sessionPromise;
}

export async function celestePaidApiHeaders() {
  const session = await getCelesteApiSession();
  return {
    Authorization: `Bearer ${session.access_token}`,
    'X-Celeste-Client': ['ios', 'android', 'web'].includes(Platform.OS)
      ? Platform.OS
      : 'native',
    'X-Celeste-Request-Id': requestId(),
  };
}
