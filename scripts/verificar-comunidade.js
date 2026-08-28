const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');
const servicePath = path.join(root, 'services', 'communityStories.js');
const screenPath = path.join(root, 'screens', 'CommunityScreen.js');
const baseMigrationPath = path.join(root, 'supabase', 'migrations', '001_constelacao_celeste.sql');
const migrationPath = path.join(root, 'supabase', 'migrations', '002_community_story_consent.sql');
const idempotentDeleteMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '003_community_delete_idempotent.sql'
);
const remoteKillSwitchMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '007_community_remote_kill_switch.sql'
);

const serviceSource = fs.readFileSync(servicePath, 'utf8');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const baseMigrationSource = fs.readFileSync(baseMigrationPath, 'utf8');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');
const idempotentDeleteMigrationSource = fs.readFileSync(idempotentDeleteMigrationPath, 'utf8');
const remoteKillSwitchMigrationSource = fs.readFileSync(remoteKillSwitchMigrationPath, 'utf8');

assert.ok(screenSource.includes("accessibilityRole=\"checkbox\""), 'consentimento deve ser acessivel');
assert.ok(
  screenSource.includes('COMMUNITY_REMOTE_ENABLED && previewReady') &&
    screenSource.includes("submitLocal: { en: 'Save on this device', pt: 'Salvar neste aparelho' }") &&
    screenSource.includes('S.reviewNotice : S.localNotice'),
  'modo local precisa explicar o armazenamento no aparelho, ocultar autorizacao de publicacao e usar CTA coerente'
);
assert.ok(
  screenSource.indexOf('S.reviewNotice : S.localNotice') < screenSource.indexOf('testID="community-submit"'),
  'aviso do modo local precisa aparecer antes da acao de salvar'
);
assert.ok(screenSource.includes("accessibilityRole=\"tab\""), 'abas precisam de semantica acessivel');
assert.strictEqual(
  (screenSource.match(/accessibilityRole="tab"/g) || []).length,
  1,
  'a melhoria nao deve criar novas abas de navegacao'
);
assert.ok(screenSource.includes('Ainda não há relatos publicados'), 'estado vazio PT ausente');
assert.ok(screenSource.includes('No published stories yet'), 'estado vazio EN ausente');
assert.ok(!screenSource.includes('const TESTIMONIALS'), 'nao inclua depoimentos de exemplo');
assert.ok(serviceSource.includes("post.status === 'published'"), 'feed deve aceitar somente published');
assert.ok(
  serviceSource.includes('circleSlug,') && serviceSource.includes('kind,'),
  'recibo local deve preservar Circulo e tipo escolhidos'
);
assert.ok(
  serviceSource.includes("COMMUNITY_POST_KINDS = Object.freeze(['action', 'evidence', 'celebration'])") &&
    !serviceSource.includes("COMMUNITY_POST_KINDS = Object.freeze(['intention'"),
  'piloto deve aceitar apenas Acao, Rastro e Celebracao'
);
assert.ok(
  screenSource.includes('COMMUNITY_CIRCLES.map') && screenSource.includes('feedCircle'),
  'os seis Circulos precisam ficar visiveis e filtrar o feed existente'
);
assert.ok(
  screenSource.includes('Exact publication preview') && screenSource.includes('Prévia exata da publicação') &&
    screenSource.includes('setConsent(false)'),
  'qualquer mudanca precisa invalidar consentimento e atualizar a previa exata'
);
const iconNames = [...screenSource.matchAll(/<Ionicons name="([^"]+)"/g)].map((match) => match[1]);
const existingIconNames = new Set([
  'sparkles', 'link-outline', 'trash-outline', 'create-outline', 'close', 'checkmark',
  'shield-checkmark-outline', 'people-outline', 'checkmark-circle-outline',
  'alert-circle-outline', 'chatbubbles-outline', 'book-outline', 'send',
]);
assert.ok(iconNames.every((name) => existingIconNames.has(name)), 'nao adicione icones novos a Comunidade');
assert.ok(
  serviceSource.includes(".eq('user_id', user.id)") && !screenSource.includes('reactionCount'),
  'reacoes devem carregar apenas o recibo da propria pessoa, sem ranking ou contagem'
);
assert.ok(
  serviceSource.includes("rpc('community_report_post'") && serviceSource.includes(".from('community_blocks')"),
  'denuncia e bloqueio precisam usar o backend existente'
);
assert.ok(
  baseMigrationSource.includes('grant execute on function public.community_report_post') &&
    baseMigrationSource.includes('create policy "users create own blocks"') &&
    baseMigrationSource.includes('create policy "users add own reactions"'),
  'a tela so pode oferecer seguranca que o schema realmente autoriza'
);
assert.ok(
  screenSource.indexOf('await loadLocalCommunityState()') >= 0 &&
    screenSource.indexOf('await loadLocalCommunityState()') < screenSource.indexOf('await loadCommunityState({'),
  'a tela precisa mostrar dados locais antes de esperar a comunidade remota'
);
assert.ok(
  serviceSource.includes('COMMUNITY_REMOTE_TIMEOUT_MS') && serviceSource.includes(": 'timeout'"),
  'atualizacao remota da comunidade precisa ter prazo e fallback local'
);
assert.ok(screenSource.includes('deleteCommunityStory'), 'autora precisa conseguir apagar o proprio relato');
assert.ok(
  screenSource.includes('const submitRef = useRef(false)') &&
    screenSource.includes('if (submitRef.current) return') &&
    screenSource.includes('submitRef.current = true'),
  'toque duplo nao pode publicar o mesmo relato duas vezes'
);
assert.ok(serviceSource.includes("rpc('community_delete_own_post'"), 'relato remoto deve usar RPC de exclusao da autora');
assert.ok(
  /community_delete_own_post[\s\S]*removeLocalCommunityStory\(localId,\s*remoteId\)/.test(serviceSource),
  'exclusao remota confirmada deve apagar recibos pelo id local e remoto'
);
const submitServiceBlock = serviceSource.slice(
  serviceSource.indexOf('export async function submitCommunityStory'),
  serviceSource.indexOf('export async function deleteCommunityStory')
);
const localReceiptBeforeCloud = submitServiceBlock.indexOf('await upsertLocalCommunityStory(localDraft');
assert.ok(
  localReceiptBeforeCloud >= 0 &&
    localReceiptBeforeCloud < submitServiceBlock.indexOf(".from('community_posts')"),
  'recibo local precisa existir antes de qualquer envio do relato a nuvem'
);
assert.ok(
  serviceSource.includes("await supabase.rpc('community_delete_own_post'") &&
    serviceSource.includes('Do not leave a remote story without a local receipt'),
  'falha ao salvar o recibo remoto precisa tentar desfazer a publicacao'
);
assert.ok(
  submitServiceBlock.includes("syncReason: created ? 'remote_cleanup_required' : 'unavailable'") &&
    submitServiceBlock.includes('remoteId: created.id'),
  'rollback remoto nao confirmado precisa preservar o id necessario para exclusao'
);
assert.ok(
  /id:\s*localReceipt\s*\?\s*localReceipt\.id\s*:\s*post\.id/.test(serviceSource),
  'relato sincronizado deve preservar o id do recibo local'
);
assert.ok(
  !serviceSource.includes("|| (circles || [])[0]"),
  'categoria nao pode cair silenciosamente no primeiro circulo de outro tema'
);
assert.ok(migrationSource.includes('publication_consent_at is not null'), 'backend deve exigir consentimento');
assert.ok(migrationSource.includes("set status = 'pending'"), 'envio deve passar por moderacao');
assert.ok(
  idempotentDeleteMigrationSource.includes('create or replace function public.community_delete_own_post') &&
    idempotentDeleteMigrationSource.includes("when status in ('hidden', 'removed') then status") &&
    idempotentDeleteMigrationSource.includes('deleted_at = coalesce(deleted_at, clock_timestamp())'),
  'repetir uma exclusao remota confirmada precisa continuar seguro e idempotente'
);
assert.match(
  serviceSource,
  /EXPO_PUBLIC_CELESTE_COMMUNITY_REMOTE_ENABLED\s*===\s*'1'/,
  'Comunidade remota precisa exigir uma flag publica explicitamente ligada'
);
assert.ok(
  serviceSource.includes("localCommunityState(local, 'remote_disabled')") &&
    serviceSource.includes("syncReason: 'remote_disabled'") &&
    serviceSource.includes("reason: 'remote_disabled'"),
  'flag desligada precisa manter feed e relatos no modo local sem tentar sincronizar'
);
assert.ok(
  remoteKillSwitchMigrationSource.includes('enabled boolean not null default false') &&
    remoteKillSwitchMigrationSource.includes('on conflict (singleton) do nothing'),
  'kill switch do banco precisa nascer desligado e preservar estado em reaplicacoes'
);
assert.ok(
  remoteKillSwitchMigrationSource.includes('as restrictive for all to authenticated') &&
    remoteKillSwitchMigrationSource.includes('before insert or update or delete') &&
    remoteKillSwitchMigrationSource.includes("raise exception 'community_remote_disabled'") &&
    remoteKillSwitchMigrationSource.includes('not public.celeste_community_remote_enabled()'),
  'banco precisa bloquear acesso direto e RPCs SECURITY DEFINER enquanto desligado'
);
[
  'community_profiles',
  'circles',
  'circle_members',
  'community_posts',
  'community_reactions',
  'community_reports',
  'community_blocks',
].forEach((table) => {
  assert.ok(
    remoteKillSwitchMigrationSource.includes(`'${table}'`),
    `kill switch nao cobre public.${table}`
  );
});
assert.ok(
  remoteKillSwitchMigrationSource.includes("to_regclass('public.community_posts')") &&
    remoteKillSwitchMigrationSource.includes("to_regprocedure('public.community_submit_post(uuid,integer)')") &&
    remoteKillSwitchMigrationSource.includes("column_name = 'publication_consent_at'"),
  'migration precisa tolerar schema ausente e as variantes anteriores de consentimento'
);
assert.ok(
  remoteKillSwitchMigrationSource.includes('create or replace function public.community_post_is_visible') &&
    /select public\.celeste_community_remote_enabled\(\)[\s\S]*and exists/.test(remoteKillSwitchMigrationSource),
  'RPC SECURITY DEFINER de visibilidade nao pode contornar o kill switch'
);
assert.ok(
  /atomic per-user and per-IP quotas/i.test(remoteKillSwitchMigrationSource) &&
    /server-side personal-data/i.test(remoteKillSwitchMigrationSource) &&
    /adversarial RLS tests/i.test(remoteKillSwitchMigrationSource),
  'pre-requisitos de habilitacao precisam ficar documentados junto ao kill switch'
);

const storage = new Map();
const transformed = babel.transformSync(serviceSource, {
  filename: servicePath,
  presets: ['babel-preset-expo'],
  babelrc: false,
  configFile: false,
}).code;
const moduleBox = { exports: {} };
let remoteClientCalls = 0;
const fakeRequire = (name) => {
  if (name.startsWith('@babel/runtime/')) return require(name);
  if (name === 'expo/virtual/env') return { env: {} };
  if (name === '@react-native-async-storage/async-storage') {
    return {
      __esModule: true,
      default: {
        getItem: async (key) => storage.get(key) || null,
        setItem: async (key, value) => storage.set(key, value),
        removeItem: async (key) => storage.delete(key),
      },
    };
  }
  if (name === './celesteSupabase') {
    return {
      getCelesteSupabaseClient: () => {
        remoteClientCalls += 1;
        return null;
      },
    };
  }
  throw new Error(`unexpected require: ${name}`);
};
new Function('require', 'module', 'exports', 'process', transformed)(
  fakeRequire,
  moduleBox,
  moduleBox.exports,
  { env: {} }
);

(async () => {
  const api = moduleBox.exports;
  assert.strictEqual(api.COMMUNITY_REMOTE_ENABLED, false, 'Comunidade remota deve nascer desligada');
  assert.strictEqual(api.COMMUNITY_CIRCLES.length, 6, 'catalogo deve expor os seis Circulos editoriais');
  assert.deepStrictEqual(
    api.COMMUNITY_POST_KINDS,
    ['action', 'evidence', 'celebration'],
    'tipos publicos devem seguir o piloto seguro'
  );
  assert.strictEqual(
    api.validateCommunityStory('Fale comigo em pessoa@exemplo.com').reason,
    'personal_data',
    'e-mail nao pode entrar na fila publica'
  );
  assert.strictEqual(
    api.validateCommunityStory('Envie dinheiro para minha chave Pix').reason,
    'money_request',
    'pedido de dinheiro nao pode entrar na fila publica'
  );
  await assert.rejects(
    api.submitCommunityStory({
      body: 'Eu desejo receber algo, sem relatar uma acao real.',
      consent: true,
      locale: 'pt',
      kind: 'intention',
      circleSlug: 'paz-presenca',
    }),
    (error) => error.code === 'kind_required',
    'desejo bruto nao pode usar o tipo Intencao'
  );
  await assert.rejects(
    api.submitCommunityStory({
      body: 'Conclui uma acao real e quero registra-la.',
      consent: true,
      locale: 'pt',
      kind: 'action',
      circleSlug: 'circulo-inventado',
    }),
    (error) => error.code === 'circle_required',
    'Circulo fora do catalogo nao pode ser inventado'
  );
  const result = await api.submitCommunityStory({
    body: 'Recebi a notícia que eu estava esperando e quero registrar este momento.',
    consent: false,
    locale: 'pt',
    kind: 'evidence',
    circleSlug: 'paz-presenca',
    manifestationId: 'm-local-1',
    manifestationTitle: 'Minha nova fase',
  });
  assert.strictEqual(result.synced, false, 'sem credenciais nunca deve fingir envio');
  assert.strictEqual(result.reason, 'remote_disabled', 'flag desligada deve explicar o modo local');
  assert.strictEqual(result.item.status, 'local_draft');
  assert.strictEqual(
    result.item.publicationConsentAt,
    null,
    'rascunho somente local nao deve simular autorizacao de publicacao'
  );
  const loaded = await api.loadCommunityState();
  assert.strictEqual(loaded.reason, 'remote_disabled');
  assert.strictEqual(loaded.feed.length, 0, 'fallback nao pode inventar feed publico');
  assert.strictEqual(loaded.own.length, 1, 'rascunho local deve sobreviver ao reload');
  assert.strictEqual(loaded.own[0].manifestationId, 'm-local-1');
  assert.strictEqual(loaded.own[0].category, 'Peace', 'categoria real deve sobreviver ao reload');
  assert.strictEqual(loaded.own[0].circleSlug, 'paz-presenca', 'Circulo real deve sobreviver ao reload');
  assert.strictEqual(loaded.own[0].kind, 'evidence', 'tipo Rastro deve sobreviver ao reload');
  const localFirst = await api.loadLocalCommunityState();
  assert.strictEqual(localFirst.reason, 'refreshing');
  assert.strictEqual(localFirst.own.length, 1, 'primeiro quadro local precisa ficar disponivel sem rede');
  assert.deepStrictEqual(
    await api.toggleCommunityReaction({ remoteId: 'post-1', circleId: 'circle-1', userId: 'author-1' }, 'with_you'),
    { ok: false, reason: 'remote_disabled' },
    'modo local nao pode fingir uma reacao remota'
  );
  assert.deepStrictEqual(
    await api.reportCommunityStory({ remoteId: 'post-1', userId: 'author-1' }),
    { ok: false, reason: 'remote_disabled' },
    'modo local nao pode fingir uma denuncia remota'
  );
  assert.deepStrictEqual(
    await api.blockCommunityMember({ remoteId: 'post-1', userId: 'author-1' }),
    { ok: false, reason: 'remote_disabled' },
    'modo local nao pode fingir um bloqueio remoto'
  );
  const deleted = await api.deleteCommunityStory(loaded.own[0]);
  assert.strictEqual(deleted.ok, true, 'rascunho local deve poder ser apagado');
  assert.strictEqual((await api.loadLocalCommunityStories()).length, 0, 'rascunho apagado nao pode reaparecer');
  assert.deepStrictEqual(
    await api.deleteCommunityStory({ id: 'local-remote-receipt', remoteId: 'remote-post' }),
    { ok: false, reason: 'remote_disabled' },
    'flag desligada deve preservar o recibo necessario para uma futura exclusao remota'
  );
  assert.strictEqual(remoteClientCalls, 0, 'flag desligada nao pode nem construir o cliente Supabase');

  storage.set(
    api.COMMUNITY_STORAGE_KEY,
    JSON.stringify([
      {
        id: 'local-receipt',
        remoteId: 'remote-post',
        body: 'Relato sincronizado que deve sumir de forma definitiva.',
        status: 'pending',
        locale: 'pt',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])
  );
  await api.removeLocalCommunityStory('remote-post', 'remote-post');
  assert.strictEqual(
    (await api.loadLocalCommunityStories()).length,
    0,
    'recibo sincronizado apagado pelo id remoto nao pode reaparecer apos reload'
  );

  storage.set(
    api.COMMUNITY_STORAGE_KEY,
    JSON.stringify([
      { id: 'delete-a', body: 'Relato A que sera removido em paralelo.', status: 'local_draft' },
      { id: 'delete-b', body: 'Relato B que sera removido em paralelo.', status: 'local_draft' },
    ])
  );
  await Promise.all([
    api.removeLocalCommunityStory('delete-a'),
    api.removeLocalCommunityStory('delete-b'),
  ]);
  assert.strictEqual(
    (await api.loadLocalCommunityStories()).length,
    0,
    'duas exclusoes simultaneas nao podem fazer um relato reaparecer'
  );

  storage.set(
    api.COMMUNITY_STORAGE_KEY,
    JSON.stringify([
      {
        body: 'Relato legado sem identificador, mas ainda valido.',
        status: 'local_draft',
        category: 'Categoria inventada',
      },
    ])
  );
  const legacyFirst = await api.loadLocalCommunityStories();
  const legacySecond = await api.loadLocalCommunityStories();
  assert.strictEqual(legacyFirst[0].id, legacySecond[0].id, 'id legado precisa ser deterministico');
  assert.strictEqual(legacyFirst[0].category, null, 'categoria invalida nunca pode ser inventada no relato');
  await api.removeLocalCommunityStory(legacyFirst[0].id);
  assert.strictEqual(
    (await api.loadLocalCommunityStories()).length,
    0,
    'relato legado sem id precisa poder ser apagado definitivamente'
  );

  const staleSubmit = api.submitCommunityStory({
    body: 'Relato iniciado antes do reset e que nao pode reaparecer depois.',
    consent: true,
    locale: 'pt',
    kind: 'action',
    circleSlug: 'coragem-confianca',
  });
  const resetToken = await api.beginCommunityDataReset();
  assert.strictEqual(
    storage.has(api.COMMUNITY_STORAGE_KEY),
    true,
    'abrir a barreira de reset nao pode apagar relatos antes do reset principal confirmar'
  );
  await assert.rejects(staleSubmit, (error) => error.code === 'community_reset_in_progress');
  await api.finishCommunityDataReset(resetToken);
  assert.strictEqual(
    (await api.loadLocalCommunityStories()).length,
    0,
    'submit antigo nao pode recriar a chave local depois do reset'
  );

  storage.set(
    api.COMMUNITY_STORAGE_KEY,
    JSON.stringify([
      {
        id: 'backup-source',
        body: 'Relato local que precisa fazer parte da copia versionada.',
        status: 'local_draft',
        locale: 'pt',
      },
    ])
  );
  const backupStories = await api.exportLocalCommunityStoriesForBackup();
  assert.strictEqual(backupStories.length, 1, 'backup precisa incluir os relatos locais');
  assert.strictEqual(backupStories[0].id, 'backup-source');
  const restoreToken = await api.beginCommunityDataReset();
  await api.restoreLocalCommunityStoriesFromBackup(restoreToken, [
    {
      id: 'backup-restored',
      body: 'Relato restaurado deve substituir o conteudo local anterior.',
      status: 'pending',
      locale: 'pt',
    },
  ]);
  const restoredStories = await api.loadLocalCommunityStories();
  assert.deepStrictEqual(
    restoredStories.map((item) => item.id),
    ['backup-restored'],
    'politica v2 precisa substituir, nao mesclar, os relatos locais'
  );
  assert.strictEqual(
    api.validateLocalCommunityStoriesBackup(new Array(api.COMMUNITY_BACKUP_MAX_ITEMS + 1).fill({})),
    null,
    'quota de relatos precisa ser validada antes da restauracao'
  );

  storage.set(api.COMMUNITY_STORAGE_KEY, '{json-corrompido');
  await assert.rejects(
    api.loadLocalCommunityStories(),
    (error) => error.code === api.COMMUNITY_STORAGE_ERROR_CODE,
    'armazenamento ilegivel precisa ser sinalizado'
  );
  await assert.rejects(
    api.submitCommunityStory({
      body: 'Este novo relato nao pode apagar silenciosamente os relatos antigos.',
      consent: true,
      locale: 'pt',
      kind: 'evidence',
      circleSlug: 'paz-presenca',
    }),
    (error) => error.code === api.COMMUNITY_STORAGE_ERROR_CODE,
    'nova escrita precisa ser bloqueada enquanto o armazenamento estiver ilegivel'
  );
  assert.strictEqual(
    storage.get(api.COMMUNITY_STORAGE_KEY),
    '{json-corrompido',
    'payload corrompido deve ser preservado para recuperacao, nunca sobrescrito'
  );

  storage.delete(api.COMMUNITY_STORAGE_KEY);
  const hungModule = { exports: {} };
  const hungRequire = (name) => {
    if (name.startsWith('@babel/runtime/')) return require(name);
    if (name === 'expo/virtual/env') {
      return { env: { EXPO_PUBLIC_CELESTE_COMMUNITY_REMOTE_ENABLED: '1' } };
    }
    if (name === '@react-native-async-storage/async-storage') {
      return {
        __esModule: true,
        default: {
          getItem: async () => null,
          setItem: async () => undefined,
          removeItem: async () => undefined,
        },
      };
    }
    if (name === './celesteSupabase') {
      return {
        getCelesteSupabaseClient: () => ({
          auth: { getSession: () => new Promise(() => {}) },
        }),
      };
    }
    throw new Error(`unexpected require: ${name}`);
  };
  new Function('require', 'module', 'exports', 'process', transformed)(
    hungRequire,
    hungModule,
    hungModule.exports,
    { env: { EXPO_PUBLIC_CELESTE_COMMUNITY_REMOTE_ENABLED: '1' } }
  );
  assert.strictEqual(hungModule.exports.COMMUNITY_REMOTE_ENABLED, true, 'flag explicita deve liberar o caminho remoto');
  await assert.rejects(
    hungModule.exports.submitCommunityStory({
      body: 'Uma conquista verdadeira que eu gostaria de publicar.',
      consent: false,
      locale: 'pt',
      kind: 'celebration',
      circleSlug: 'paz-presenca',
    }),
    (error) => error.code === 'consent_required',
    'modo remoto deve continuar exigindo autorizacao explicita de publicacao'
  );
  const timeoutStartedAt = Date.now();
  const timedOut = await hungModule.exports.loadCommunityState({
    localStories: [],
    timeoutMs: 500,
  });
  assert.strictEqual(timedOut.reason, 'timeout', 'rede travada precisa voltar ao estado local');
  assert.ok(Date.now() - timeoutStartedAt < 1200, 'rede travada nao pode prender a Comunidade');
  console.log('OK: seis Circulos, tipos seguros, previa, privacidade, apoio sem ranking e modo local-first verificados');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
