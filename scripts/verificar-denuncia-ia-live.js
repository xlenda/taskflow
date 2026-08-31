const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.CELESTE_RELEASE_SUPABASE_URL;
const publicKey = process.env.CELESTE_RELEASE_SUPABASE_PUBLIC_KEY;
const serviceKey = process.env.CELESTE_RELEASE_SUPABASE_SERVICE_KEY;
if (
  !url || !publicKey || !serviceKey ||
  [url, publicKey, serviceKey].some((value) => value === '[SENSITIVE]')
) {
  throw new Error('Supabase release credentials are unavailable.');
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const reporter = createClient(url, publicKey, clientOptions);
const administrator = createClient(url, serviceKey, clientOptions);

let reportId = null;
let reporterId = null;

async function cleanup() {
  if (reportId) {
    const { error } = await administrator.from('ai_content_reports').delete().eq('id', reportId);
    if (error) throw new Error(`report cleanup failed: ${error.message}`);
  }
  if (reporterId) {
    const { error } = await administrator.auth.admin.deleteUser(reporterId);
    if (error) throw new Error(`anonymous user cleanup failed: ${error.message}`);
  }
}

async function main() {
  const { data: authData, error: authError } = await reporter.auth.signInAnonymously();
  if (authError) throw new Error(`anonymous sign-in failed: ${authError.message}`);
  reporterId = authData && authData.user && authData.user.id;
  assert.match(reporterId || '', /^[0-9a-f-]{36}$/i);

  const contentRef = `release:smoke:${Date.now().toString(36)}`;
  const { data, error } = await reporter.rpc('celeste_submit_ai_content_report', {
    p_content_type: 'scene',
    p_content_ref: contentRef,
    p_reason: 'other',
    p_content_text: 'Automated release smoke report. Safe to delete.',
    p_visual_ref: '',
    p_user_note: '',
    p_locale: 'en',
    p_generation_source: 'release-smoke',
    p_generation_model: 'none',
    p_prompt_version: 'release-v1',
    p_platform: 'android',
    p_app_version: '1.0.0',
  });
  if (error) throw new Error(`report RPC failed: ${error.message}`);
  reportId = data;
  assert.match(reportId || '', /^[0-9a-f-]{36}$/i);

  await cleanup();
  reportId = null;
  reporterId = null;
  console.log('Denuncia IA remota validada; dados do smoke removidos.');
}

main().catch(async (error) => {
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error(`Falha ao limpar smoke remoto: ${cleanupError.message}`);
  }
  console.error(`Falha no smoke de denuncia IA: ${error.message}`);
  process.exitCode = 1;
});
