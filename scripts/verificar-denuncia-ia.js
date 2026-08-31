const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');
const servicePath = path.join(root, 'services', 'aiContentReports.js');
const componentPath = path.join(root, 'components', 'AiContentReportAction.js');
const migrationPath = path.join(root, 'supabase', 'migrations', '011_ai_content_reports.sql');
const integrationPaths = [
  path.join(root, 'screens', 'ManifestationScreen.js'),
  path.join(root, 'screens', 'VisionPlayerScreen.js'),
  path.join(root, 'screens', 'AffirmationsScreen.js'),
  path.join(root, 'screens', 'MorningRitualScreen.js'),
];

const serviceSource = fs.readFileSync(servicePath, 'utf8');
const componentSource = fs.readFileSync(componentPath, 'utf8');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');

assert.ok(
  !serviceSource.includes('celesteApiSession') && serviceSource.includes('ensureReportingSession'),
  'a denuncia de seguranca nao pode depender da sessao de geracao paga bloqueada no Android'
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
  componentSource.includes('Suas respostas originais e o relato do sonho não serão enviados.'),
  'a pessoa precisa saber exatamente quais dados saem do aparelho'
);
assert.ok(!/\bLinking\b|mailto:|https?:\/\//.test(componentSource), 'a denuncia nao pode tirar a pessoa do app');

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

assert.ok(
  migrationSource.includes('alter table public.ai_content_reports enable row level security') &&
    migrationSource.includes('revoke all on table public.ai_content_reports from public, anon, authenticated'),
  'a evidencia nao pode ficar legivel ou gravavel diretamente pelo cliente'
);
assert.ok(
  migrationSource.includes('security definer') &&
    migrationSource.includes("set search_path = ''") &&
    migrationSource.includes('grant execute on function public.celeste_submit_ai_content_report'),
  'a gravacao deve passar por uma RPC estreita e endurecida'
);
assert.ok(
  migrationSource.includes('pg_advisory_xact_lock') &&
    migrationSource.includes(") >= 10 then") &&
    migrationSource.includes('existing_report_id'),
  'o backend precisa serializar, limitar e deduplicar denuncias'
);
assert.ok(
  !/prompt_text|dream_report|onboarding_answers/.test(migrationSource),
  'o schema nao deve abrir colunas para prompt, sonho bruto ou onboarding'
);

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

(async () => {
  const api = moduleBox.exports;
  const normalized = api.normalizeAiContentReport({
    contentType: 'dream',
    contentRef: 'dream:entry-1:pt',
    reason: 'unsafe_harmful',
    content: ' Reflexão\u0000 segura\nAfirmação ',
    visualRef: 'visual-entry-1-safe',
    note: '  Revisar\npor favor.  ',
    lang: 'pt',
    generation: { source: 'gemini-dream', model: 'gemini-test', promptVersion: 'dream-v1' },
    rawDream: 'SEGREDO_QUE_NAO_PODE_SAIR',
    onboardingAnswers: { name: 'Nome privado' },
  });
  assert.strictEqual(normalized.content, 'Reflexão segura Afirmação');
  assert.strictEqual(normalized.note, 'Revisar por favor.');
  assert.strictEqual(normalized.platform, 'android');
  assert.strictEqual(Object.hasOwn(normalized, 'rawDream'), false);
  assert.strictEqual(Object.hasOwn(normalized, 'onboardingAnswers'), false);

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

  let rpcName;
  let rpcPayload;
  let sessionCalls = 0;
  const successful = await api.submitAiContentReport(
    {
      contentType: 'scene',
      contentRef: 'manifestation:m-1:pt',
      reason: 'privacy',
      content: 'Texto gerado selecionado.',
      note: 'Pode expor um dado.',
      lang: 'pt',
      generation: { source: 'anthropic-scene', model: 'model-safe', promptVersion: 'scene-v1' },
      prompt: 'PROMPT_PRIVADO_NUNCA_ENVIADO',
    },
    {
      ensureSession: async () => { sessionCalls += 1; },
      supabase: {
        rpc: async (name, payload) => {
          rpcName = name;
          rpcPayload = payload;
          return { data: '8f75ca4d-5c06-4c41-a638-473adb2e507c', error: null };
        },
      },
    }
  );
  assert.deepStrictEqual(successful, { ok: true, reportId: '8f75ca4d-5c06-4c41-a638-473adb2e507c' });
  assert.strictEqual(sessionCalls, 1, 'o envio precisa confirmar uma sessao autenticada');
  assert.strictEqual(rpcName, 'celeste_submit_ai_content_report');
  assert.strictEqual(rpcPayload.p_content_text, 'Texto gerado selecionado.');
  assert.strictEqual(rpcPayload.p_reason, 'privacy');
  assert.ok(!JSON.stringify(rpcPayload).includes('PROMPT_PRIVADO_NUNCA_ENVIADO'));

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
        ensureSession: async () => {},
        supabase: {
          rpc: async () => ({ data: null, error: { message: 'ai_report_rate_limited' } }),
        },
      }
    ),
    (error) => error.code === 'ai_report_rate_limited'
  );

  console.log('Denuncia de conteudo de IA: fluxo, minimizacao e backend validados.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
