const assert = require('assert');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.CELESTE_RELEASE_SUPABASE_URL;
const publicKey = process.env.CELESTE_RELEASE_SUPABASE_PUBLIC_KEY;
const serviceKey = process.env.CELESTE_RELEASE_SUPABASE_SERVICE_KEY;
const databaseContractVerified = process.env.CELESTE_RELEASE_DB_CONTRACT_VERIFIED === '1';
const rolloutMode = String(process.env.CELESTE_AI_REPORT_ROLLOUT || 'final').trim().toLowerCase();
const skipEndpoint = process.env.CELESTE_RELEASE_SKIP_REPORT_ENDPOINT === '1';
const rawAppOrigin = String(
  process.env.CELESTE_RELEASE_APP_URL || 'https://celeste-jet-two.vercel.app'
).trim();
if (!['final', 'expansion'].includes(rolloutMode)) {
  throw new Error('CELESTE_AI_REPORT_ROLLOUT must be final or expansion.');
}
if (!url || !publicKey || [url, publicKey].some((value) => value === '[SENSITIVE]')) {
  throw new Error('Supabase public release credentials are unavailable.');
}
const hasServiceKey = Boolean(serviceKey && serviceKey !== '[SENSITIVE]');
if (!hasServiceKey && !databaseContractVerified) {
  throw new Error('The database contract was not verified and the service key is unavailable.');
}
let appOrigin;
try {
  const parsed = new URL(rawAppOrigin);
  if (parsed.protocol !== 'https:' || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('unsafe');
  }
  appOrigin = parsed.origin;
} catch (_error) {
  throw new Error('CELESTE_RELEASE_APP_URL must be an HTTPS origin.');
}

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
};
const reporter = createClient(url, publicKey, clientOptions);
const administrator = hasServiceKey ? createClient(url, serviceKey, clientOptions) : null;

let reportId = null;
let reporterId = null;
let reporterAccessToken = null;

async function cleanup() {
  if (reportId) {
    if (administrator) {
      const { error } = await administrator.from('ai_content_reports').delete().eq('id', reportId);
      if (error) throw new Error(`report cleanup failed: ${error.message}`);
    } else if (reporterAccessToken) {
      const response = await fetch(`${appOrigin}/api/denunciar-conteudo-ia`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${reporterAccessToken}`,
          'X-Celeste-Client': 'web',
          Origin: appOrigin,
        },
      });
      if (response.status !== 204) throw new Error('report endpoint cleanup failed');
    } else {
      throw new Error('report cleanup identity is unavailable');
    }
    reportId = null;
  }
  if (reporterId && administrator) {
    const { error } = await administrator.auth.admin.deleteUser(reporterId);
    if (error) throw new Error(`anonymous user cleanup failed: ${error.message}`);
    reporterId = null;
  } else if (reporterId) {
    console.log(`REPORTER_ID_TO_DELETE=${reporterId}`);
    reporterId = null;
  }
}

function assertSubmission(result) {
  assert.strictEqual(result && result.accepted, true);
  assert.strictEqual(result && result.duplicate, false);
  assert.strictEqual(result && result.userQuota, true);
  assert.strictEqual(result && result.actorQuota, true);
  assert.strictEqual(result && result.globalQuota, true);
  assert.match((result && result.reportId) || '', /^[0-9a-f-]{36}$/i);
  return result.reportId;
}

async function submitDirect(contentRef) {
  assert.ok(administrator, 'service role is required for a direct RPC smoke');
  const actorHash = crypto
    .createHash('sha256')
    .update(`celeste-release-report:${reporterId}:${Date.now()}`)
    .digest('hex');
  const { data, error } = await administrator.rpc('celeste_submit_ai_content_report_server', {
    p_reporter_id: reporterId,
    p_actor_hash: actorHash,
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
    p_platform: 'web',
    p_app_version: '1.0.0',
  });
  if (error) throw new Error(`server report RPC failed: ${error.message}`);
  reportId = assertSubmission(data);

  const deleted = await administrator.rpc('celeste_delete_all_ai_content_reports_server', {
    p_reporter_id: reporterId,
  });
  if (deleted.error) throw new Error(`server report delete failed: ${deleted.error.message}`);
  assert.strictEqual(deleted.data && deleted.data.deleted, true);
  reportId = null;
}

async function submitThroughEndpoint(contentRef, accessToken) {
  const response = await fetch(`${appOrigin}/api/denunciar-conteudo-ia`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Celeste-Client': 'web',
      Origin: appOrigin,
    },
    body: JSON.stringify({
      contentType: 'scene',
      contentRef,
      reason: 'other',
      content: 'Automated release smoke report. Safe to delete.',
      visualRef: '',
      note: '',
      lang: 'en',
      generation: { source: 'release-smoke', model: 'none', promptVersion: 'release-v1' },
      platform: 'web',
      appVersion: '1.0.0',
    }),
  });
  const payload = await response.json().catch(() => ({}));
  assert.ok(
    response.status === 201 && payload.ok === true && payload.duplicate === false,
    `report gateway POST failed: HTTP ${response.status} ${payload.error || 'invalid_response'}`
  );
  reportId = payload.reportId;
  assert.match(reportId || '', /^[0-9a-f-]{36}$/i);

  const deleted = await fetch(`${appOrigin}/api/denunciar-conteudo-ia`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-Celeste-Client': 'web',
      Origin: appOrigin,
    },
  });
  assert.strictEqual(deleted.status, 204, 'report gateway DELETE failed');
  reportId = null;
}

async function main() {
  if (administrator) {
    const { data: version, error: versionError } = await administrator.rpc(
      'celeste_ai_content_report_gateway_version'
    );
    if (versionError) throw new Error(`gateway version failed: ${versionError.message}`);
    const expectedVersion = rolloutMode === 'expansion' ? 1 : 2;
    const expectedLegacyDisabled = rolloutMode === 'final';
    assert.deepStrictEqual(
      {
        schemaVersion: version && version.schemaVersion,
        serverGateway: version && version.serverGateway,
        userQuota: version && version.userQuota,
        actorQuota: version && version.actorQuota,
        globalQuota: version && version.globalQuota,
        retentionDays: version && version.retentionDays,
        legacyClientSubmitDisabled: version && version.legacyClientSubmitDisabled,
        deleteAll: version && version.deleteAll,
      },
      {
        schemaVersion: expectedVersion,
        serverGateway: true,
        userQuota: true,
        actorQuota: true,
        globalQuota: true,
        retentionDays: 180,
        legacyClientSubmitDisabled: expectedLegacyDisabled,
        deleteAll: true,
      },
      `o backend remoto nao publicou o contrato ${rolloutMode} esperado`
    );
  }

  const { data: authData, error: authError } = await reporter.auth.signInAnonymously();
  if (authError) throw new Error(`anonymous sign-in failed: ${authError.message}`);
  reporterId = authData && authData.user && authData.user.id;
  const accessToken = authData && authData.session && authData.session.access_token;
  reporterAccessToken = accessToken;
  assert.match(reporterId || '', /^[0-9a-f-]{36}$/i);
  assert.ok(typeof accessToken === 'string' && accessToken.length >= 20, 'anonymous token is missing');

  const contentRef = `release:smoke:${Date.now().toString(36)}`;
  if (rolloutMode === 'final') {
    const legacy = await reporter.rpc('celeste_submit_ai_content_report', {
      p_content_type: 'scene',
      p_content_ref: contentRef,
      p_reason: 'other',
      p_content_text: 'Legacy RPC must reject this report.',
      p_visual_ref: '',
      p_user_note: '',
      p_locale: 'en',
      p_generation_source: 'release-smoke',
      p_generation_model: 'none',
      p_prompt_version: 'release-v1',
      p_platform: 'web',
      p_app_version: '1.0.0',
    });
    if (typeof legacy.data === 'string' && /^[0-9a-f-]{36}$/i.test(legacy.data)) {
      reportId = legacy.data;
    }
    assert.ok(legacy.error, 'a RPC legada ainda aceita gravacao autenticada direta');
    assert.match(
      `${legacy.error.code || ''} ${legacy.error.message || ''}`,
      /42501|ai_report_gateway_required|permission denied/i,
      'a RPC legada falhou por um motivo inesperado'
    );
  }

  if (skipEndpoint) await submitDirect(contentRef);
  else await submitThroughEndpoint(contentRef, accessToken);

  await cleanup();
  console.log(
    `Gateway remoto de denuncia validado em modo ${rolloutMode}; ` +
      `${skipEndpoint ? 'RPCs internas' : 'endpoint POST/DELETE'} passaram e o smoke foi removido.`
  );
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
