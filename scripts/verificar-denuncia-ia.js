const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'services', 'aiContentReports.js');
const componentPath = path.join(root, 'components', 'AiContentReportAction.js');
const profilePath = path.join(root, 'screens', 'ProfileScreen.js');
const handlerPath = path.join(root, 'api', 'denunciar-conteudo-ia.js');
const migration011Path = path.join(root, 'supabase', 'migrations', '011_ai_content_reports.sql');
const migration013Path = path.join(root, 'supabase', 'migrations', '013_ai_content_report_gateway.sql');
const migration014Path = path.join(root, 'supabase', 'migrations', '014_disable_legacy_ai_report_rpc.sql');
const integrationPaths = [
  path.join(root, 'screens', 'ManifestationScreen.js'),
  path.join(root, 'screens', 'VisionPlayerScreen.js'),
  path.join(root, 'screens', 'AffirmationsScreen.js'),
  path.join(root, 'screens', 'MorningRitualScreen.js'),
];

const serviceSource = fs.readFileSync(servicePath, 'utf8');
const componentSource = fs.readFileSync(componentPath, 'utf8');
const profileSource = fs.readFileSync(profilePath, 'utf8');
const handlerSource = fs.readFileSync(handlerPath, 'utf8');
const migration011Source = fs.readFileSync(migration011Path, 'utf8');
const migration013Source = fs.readFileSync(migration013Path, 'utf8');
const migration014Source = fs.readFileSync(migration014Path, 'utf8');
const manifestationSource = fs.readFileSync(integrationPaths[0], 'utf8');
const visionSource = fs.readFileSync(integrationPaths[1], 'utf8');
const journeySource = fs.readFileSync(path.join(root, 'utils', 'personalJourney.js'), 'utf8');

assert.ok(
  !serviceSource.includes('celesteApiSession') && serviceSource.includes('ensureReportingSession'),
  'a denuncia de seguranca nao pode depender da sessao de geracao paga bloqueada no Android'
);
assert.ok(
  serviceSource.includes('/api/denunciar-conteudo-ia') &&
    !serviceSource.includes("rpc('celeste_submit_ai_content_report"),
  'o cliente deve usar somente o gateway HTTP, nunca a RPC de gravacao'
);
assert.ok(
  serviceSource.includes("'X-Celeste-Client'") && serviceSource.includes('nothingToDelete: true'),
  'o cliente deve identificar a plataforma e tornar a exclusao sem sessao um no-op local'
);

assert.ok(
  componentSource.includes('<Modal') && componentSource.includes('accessibilityViewIsModal'),
  'a denuncia precisa acontecer dentro do app em um dialogo acessivel'
);
assert.ok(
  componentSource.includes('accessibilityRole="radio"') &&
    componentSource.includes('testID="ai-report-submit"'),
  'o fluxo precisa permitir escolher o problema e confirmar o envio'
);
assert.ok(
  componentSource.includes('Suas respostas originais') &&
    componentSource.includes('relato bruto do sonho') &&
    componentSource.includes('180 dias'),
  'a pessoa precisa saber exatamente quais dados saem do aparelho e por quanto tempo ficam'
);
assert.ok(!/\bLinking\b|mailto:|https?:\/\//.test(componentSource), 'a denuncia nao pode tirar a pessoa do app');
assert.ok(
  componentSource.includes('normalizeAiReportEvidenceText(content)') &&
    !componentSource.includes('slice(0, 357)'),
  'a confirmacao precisa mostrar exatamente todo o texto normalizado que sera enviado'
);
assert.ok(
  profileSource.includes('deleteAllAiContentReports') &&
    profileSource.includes('Excluir denúncias de conteúdo de IA enviadas') &&
    profileSource.includes("result.nothingToDelete === true ? 'empty' : 'success'") &&
    profileSource.includes('destructive: true'),
  'o Perfil precisa confirmar a exclusao, chamar o servico e distinguir a ausencia de sessao'
);
assert.ok(
  manifestationSource.includes('content={item.story}') &&
    !manifestationSource.includes('content={`${item.title}\\n${item.affirmation}\\n${item.story}`}'),
  'a denuncia da cena nao pode anexar titulo ou afirmacao editaveis pela pessoa'
);
assert.ok(
  journeySource.includes("const generatedStory = kind === 'vision' ? clean(entry.story, 1200) : ''") &&
    visionSource.includes('content={vision.generatedStory}') &&
    !visionSource.includes('content={`${vision.title}\\n${vision.story}`}'),
  'a denuncia da visao precisa usar a historia original gerada, nunca a edicao da pessoa'
);

integrationPaths.forEach((screenPath) => {
  const source = fs.readFileSync(screenPath, 'utf8');
  assert.ok(
    source.includes("import AiContentReportAction from '../components/AiContentReportAction'"),
    `${path.basename(screenPath)} precisa importar a acao de denuncia`
  );
  assert.ok(source.includes('<AiContentReportAction'), `${path.basename(screenPath)} precisa expor a acao`);
  babel.transformSync(source, {
    filename: screenPath,
    presets: ['babel-preset-expo'],
    babelrc: false,
    configFile: false,
  });
});
babel.transformSync(componentSource, {
  filename: componentPath,
  presets: ['babel-preset-expo'],
  babelrc: false,
  configFile: false,
});
babel.transformSync(profileSource, {
  filename: profilePath,
  presets: ['babel-preset-expo'],
  babelrc: false,
  configFile: false,
});

assert.ok(
  migration011Source.includes('alter table public.ai_content_reports enable row level security') &&
    migration011Source.includes('revoke all on table public.ai_content_reports from public, anon, authenticated'),
  'a evidencia nao pode ficar legivel ou gravavel diretamente pelo cliente'
);
assert.ok(
  !/prompt_text|dream_report|onboarding_answers/.test(migration011Source),
  'o schema nao deve abrir colunas para prompt, sonho bruto ou onboarding'
);

for (const marker of [
  'create table if not exists public.celeste_ai_report_user_usage',
  'create table if not exists public.celeste_ai_report_actor_usage',
  'create table if not exists public.celeste_ai_report_global_usage',
  'create or replace function public.celeste_submit_ai_content_report_server',
  'create or replace function public.celeste_delete_all_ai_content_reports_server',
  'create or replace function public.celeste_ai_content_report_gateway_version()',
  'grant execute on function public.celeste_submit_ai_content_report_server',
  'grant execute on function public.celeste_delete_all_ai_content_reports_server(uuid)',
  'grant execute on function public.celeste_ai_content_report_gateway_version()',
  "v_now + interval '180 days'",
  "'userQuota', true",
  "'actorQuota', true",
  "'globalQuota', true",
]) {
  assert.ok(migration013Source.includes(marker), `migration 013 sem protecao obrigatoria: ${marker}`);
}
assert.match(
  migration013Source,
  /revoke all on function public\.celeste_submit_ai_content_report_server\([\s\S]*?\) from public, anon, authenticated;/,
  'a RPC de escrita do gateway deve ser apenas service-role'
);
assert.ok(
  migration013Source.includes('pg_advisory_xact_lock') &&
    migration013Source.includes('celeste-ai-report-user:') &&
    migration013Source.includes('for update'),
  'as cotas precisam ser serializadas no banco'
);
assert.ok(
  migration014Source.includes("raise exception 'ai_report_gateway_required'") &&
    migration014Source.includes('from public, anon, authenticated, service_role') &&
    migration014Source.includes('schema_version = 2') &&
    migration014Source.includes('legacy_direct_submit_disabled = true'),
  'migration 014 precisa desativar a RPC legada e publicar schema 2'
);

for (const marker of [
  "'celeste_submit_ai_content_report_server'",
  "'celeste_delete_all_ai_content_reports_server'",
  'deriveReportActorHash',
  'identity.isAnonymous !== true',
  'result.userQuota !== true',
  'result.actorQuota !== true',
  'result.globalQuota !== true',
  "'actor_limit'",
]) {
  assert.ok(handlerSource.includes(marker), `handler sem guarda obrigatoria: ${marker}`);
}

const transformed = babel.transformSync(serviceSource, {
  filename: servicePath,
  presets: ['babel-preset-expo'],
  babelrc: false,
  configFile: false,
}).code;
const moduleBox = { exports: {} };
const fakeRequire = (name) => {
  if (name.startsWith('@babel/runtime/')) return require(name);
  if (name === 'expo/virtual/env') return { env: {} };
  if (name === 'react-native') return { Platform: { OS: 'android' } };
  if (name === './celesteSupabase') return { getCelesteSupabaseClient: () => null };
  throw new Error(`unexpected require: ${name}`);
};
new Function('require', 'module', 'exports', transformed)(fakeRequire, moduleBox, moduleBox.exports);

function responseRecorder() {
  return {
    headers: {},
    statusCode: 0,
    payload: undefined,
    ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
    end() { this.ended = true; return this; },
  };
}

function loadHandler({ identity, rpcValues }) {
  const calls = [];
  const queue = [...rpcValues];
  const paidAccess = {
    serverConfig: () => ({
      url: 'https://celeste-test.supabase.co',
      anonKey: 'anon-key',
      serviceKey: 'service-key',
      actorHashSecret: 'actor-secret-with-enough-entropy-for-the-test',
    }),
    validActorHashSecret: () => true,
    bearerToken: (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''),
    authenticatedUser: async () => identity,
    deriveReportActorHash: () => 'a'.repeat(64),
    serviceRoleHeaders: () => ({ apikey: 'service-key' }),
    fetchWithTimeout: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => queue.shift() };
    },
  };
  const box = { exports: {} };
  new Function('require', 'module', 'exports', handlerSource)(
    (name) => {
      if (name === './_paid-access') return paidAccess;
      throw new Error(`unexpected handler require: ${name}`);
    },
    box,
    box.exports
  );
  return { handler: box.exports, calls };
}

const REPORTER_ID = '8f75ca4d-5c06-4c41-a638-473adb2e507c';
const REPORT_ID = '52ee026f-17f3-4d1d-9ab9-258d11d8d715';
const validGatewayBody = {
  contentType: 'scene',
  contentRef: 'manifestation:m-1:pt',
  reason: 'privacy',
  content: 'Texto gerado selecionado.',
  visualRef: '',
  note: 'Pode expor um dado.',
  lang: 'pt',
  generation: { source: 'anthropic-scene', model: 'model-safe', promptVersion: 'scene-v1' },
  platform: 'android',
  appVersion: '1.0.0',
};

(async () => {
  const api = moduleBox.exports;
  const normalized = api.normalizeAiContentReport({
    contentType: 'dream',
    contentRef: 'dream:entry-1:pt',
    reason: 'unsafe_harmful',
    content: ' Reflexao\u0000 segura\nAfirmacao ',
    visualRef: 'visual-entry-1-safe',
    note: '  Revisar\npor favor.  ',
    lang: 'pt',
    generation: { source: 'gemini-dream', model: 'gemini-test', promptVersion: 'dream-v1' },
    rawDream: 'SEGREDO_QUE_NAO_PODE_SAIR',
    onboardingAnswers: { name: 'Nome privado' },
  });
  assert.strictEqual(normalized.content, 'Reflexao segura Afirmacao');
  assert.strictEqual(normalized.note, 'Revisar por favor.');
  assert.strictEqual(normalized.platform, 'android');
  assert.strictEqual(Object.hasOwn(normalized, 'rawDream'), false);
  assert.strictEqual(Object.hasOwn(normalized, 'onboardingAnswers'), false);

  const hiddenSuffix = `Inicio ${'conteudo gerado '.repeat(40)}SENTINELA_FINAL_VISIVEL`;
  assert.strictEqual(
    api.normalizeAiReportEvidenceText(hiddenSuffix),
    api.normalizeAiContentReport({
      contentType: 'scene',
      contentRef: 'manifestation:preview:pt',
      reason: 'other',
      content: hiddenSuffix,
    }).content,
    'a previa e o envio precisam usar a mesma normalizacao sem sufixo oculto'
  );
  assert.ok(api.normalizeAiReportEvidenceText(hiddenSuffix).includes('SENTINELA_FINAL_VISIVEL'));

  let anonymousSignIns = 0;
  const nativeSession = await api._aiContentReportInternals.ensureReportingSession({
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      signInAnonymously: async () => {
        anonymousSignIns += 1;
        return { data: { session: { access_token: 'report-only-session' } }, error: null };
      },
    },
  });
  assert.strictEqual(nativeSession.access_token, 'report-only-session');
  assert.strictEqual(anonymousSignIns, 1, 'a seguranca precisa funcionar no Android sem abrir APIs pagas');

  assert.throws(
    () => api.normalizeAiContentReport({ contentType: 'dream', contentRef: 'dream:1', reason: 'invented' }),
    /ai_report_reason_required/
  );
  assert.throws(
    () => api.normalizeAiContentReport({ contentType: 'dream', contentRef: '../unsafe', reason: 'other' }),
    /ai_report_reference_required/
  );

  const clientCalls = [];
  let sessionCalls = 0;
  const successful = await api.submitAiContentReport(
    { ...validGatewayBody, prompt: 'PROMPT_PRIVADO_NUNCA_ENVIADO' },
    {
      ensureSession: async () => {
        sessionCalls += 1;
        return { access_token: 'report-only-session' };
      },
      fetchImpl: async (url, options) => {
        clientCalls.push({ url, options });
        return {
          ok: true,
          status: 201,
          json: async () => ({ ok: true, reportId: REPORT_ID, duplicate: false }),
        };
      },
    }
  );
  assert.deepStrictEqual(successful, { ok: true, reportId: REPORT_ID, duplicate: false });
  assert.strictEqual(sessionCalls, 1, 'o envio precisa confirmar uma sessao autenticada');
  assert.match(clientCalls[0].url, /\/api\/denunciar-conteudo-ia$/);
  assert.strictEqual(clientCalls[0].options.method, 'POST');
  assert.strictEqual(clientCalls[0].options.headers.Authorization, 'Bearer report-only-session');
  assert.strictEqual(clientCalls[0].options.headers['X-Celeste-Client'], 'android');
  const clientPayload = JSON.parse(clientCalls[0].options.body);
  assert.strictEqual(clientPayload.content, 'Texto gerado selecionado.');
  assert.strictEqual(clientPayload.reason, 'privacy');
  assert.ok(!JSON.stringify(clientPayload).includes('PROMPT_PRIVADO_NUNCA_ENVIADO'));

  await assert.rejects(
    api.submitAiContentReport(
      {
        contentType: 'vision',
        contentRef: 'vision:v-1:en',
        reason: 'other',
        content: 'Generated vision.',
        lang: 'en',
      },
      {
        accessToken: 'report-only-session',
        fetchImpl: async () => ({
          ok: false,
          status: 429,
          json: async () => ({ error: 'ai_report_rate_limited' }),
        }),
      }
    ),
    (error) => error.code === 'ai_report_rate_limited'
  );

  let deleteFetches = 0;
  assert.deepStrictEqual(
    await api.deleteAllAiContentReports({
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          signInAnonymously: async () => { throw new Error('delete must not sign in'); },
        },
      },
      fetchImpl: async () => { deleteFetches += 1; },
    }),
    { ok: true, nothingToDelete: true }
  );
  assert.strictEqual(deleteFetches, 0, 'exclusao sem sessao nao deve chamar a rede');

  let deleteOptions;
  assert.deepStrictEqual(
    await api.deleteAllAiContentReports({
      accessToken: 'report-only-session',
      fetchImpl: async (_url, options) => {
        deleteOptions = options;
        return { ok: true, status: 204, json: async () => null };
      },
    }),
    { ok: true }
  );
  assert.strictEqual(deleteOptions.method, 'DELETE');
  assert.strictEqual(deleteOptions.headers['X-Celeste-Client'], 'android');
  assert.strictEqual(Object.hasOwn(deleteOptions, 'body'), false);

  const successHarness = loadHandler({
    identity: { userId: REPORTER_ID, isAnonymous: true },
    rpcValues: [{
      accepted: true,
      duplicate: false,
      reportId: REPORT_ID,
      userQuota: true,
      actorQuota: true,
      globalQuota: true,
    }],
  });
  const successResponse = responseRecorder();
  await successHarness.handler({
    method: 'POST',
    headers: { authorization: 'Bearer anonymous-session', 'x-celeste-client': 'android' },
    body: validGatewayBody,
  }, successResponse);
  assert.strictEqual(successResponse.statusCode, 201, JSON.stringify(successResponse.payload));
  assert.deepStrictEqual(successResponse.payload, { ok: true, reportId: REPORT_ID, duplicate: false });
  assert.match(successHarness.calls[0].url, /\/rpc\/celeste_submit_ai_content_report_server$/);
  const serverPayload = JSON.parse(successHarness.calls[0].options.body);
  assert.strictEqual(serverPayload.p_reporter_id, REPORTER_ID);
  assert.strictEqual(serverPayload.p_actor_hash, 'a'.repeat(64));
  assert.strictEqual(serverPayload.p_content_text, validGatewayBody.content);

  const invalidHarness = loadHandler({
    identity: { userId: REPORTER_ID, isAnonymous: true },
    rpcValues: [],
  });
  const invalidResponse = responseRecorder();
  await invalidHarness.handler({
    method: 'POST',
    headers: { authorization: 'Bearer anonymous-session', 'x-celeste-client': 'android' },
    body: { ...validGatewayBody, privatePrompt: 'nao aceitar' },
  }, invalidResponse);
  assert.strictEqual(invalidResponse.statusCode, 400);
  assert.strictEqual(invalidResponse.payload.error, 'ai_report_invalid');
  assert.strictEqual(invalidHarness.calls.length, 0);

  const nonAnonymousHarness = loadHandler({
    identity: { userId: REPORTER_ID, isAnonymous: false },
    rpcValues: [],
  });
  const nonAnonymousResponse = responseRecorder();
  await nonAnonymousHarness.handler({
    method: 'POST',
    headers: { authorization: 'Bearer account-session', 'x-celeste-client': 'android' },
    body: validGatewayBody,
  }, nonAnonymousResponse);
  assert.strictEqual(nonAnonymousResponse.statusCode, 403);
  assert.strictEqual(nonAnonymousResponse.payload.error, 'ai_report_anonymous_identity_required');

  const quotaHarness = loadHandler({
    identity: { userId: REPORTER_ID, isAnonymous: true },
    rpcValues: [{ accepted: false, reason: 'actor_limit' }],
  });
  const quotaResponse = responseRecorder();
  await quotaHarness.handler({
    method: 'POST',
    headers: { authorization: 'Bearer anonymous-session', 'x-celeste-client': 'android' },
    body: validGatewayBody,
  }, quotaResponse);
  assert.strictEqual(quotaResponse.statusCode, 429);
  assert.strictEqual(quotaResponse.payload.error, 'ai_report_rate_limited');

  const incompleteHarness = loadHandler({
    identity: { userId: REPORTER_ID, isAnonymous: true },
    rpcValues: [{
      accepted: true,
      duplicate: false,
      reportId: REPORT_ID,
      userQuota: true,
      actorQuota: true,
      globalQuota: false,
    }],
  });
  const incompleteResponse = responseRecorder();
  await incompleteHarness.handler({
    method: 'POST',
    headers: { authorization: 'Bearer anonymous-session', 'x-celeste-client': 'android' },
    body: validGatewayBody,
  }, incompleteResponse);
  assert.strictEqual(incompleteResponse.statusCode, 503);
  assert.strictEqual(incompleteResponse.payload.error, 'ai_report_unavailable');

  const deleteHarness = loadHandler({
    identity: { userId: REPORTER_ID, isAnonymous: true },
    rpcValues: [{ deleted: true }],
  });
  const deleteResponse = responseRecorder();
  await deleteHarness.handler({
    method: 'DELETE',
    headers: { authorization: 'Bearer anonymous-session', 'x-celeste-client': 'android' },
  }, deleteResponse);
  assert.strictEqual(deleteResponse.statusCode, 204);
  assert.strictEqual(deleteResponse.ended, true);
  assert.match(deleteHarness.calls[0].url, /\/rpc\/celeste_delete_all_ai_content_reports_server$/);

  console.log('Denuncia de conteudo de IA: minimizacao, gateway, cotas e revogacao validados.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
