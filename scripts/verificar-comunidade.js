const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');
const servicePath = path.join(root, 'services', 'communityStories.js');
const screenPath = path.join(root, 'screens', 'CommunityScreen.js');
const migrationPath = path.join(root, 'supabase', 'migrations', '002_community_story_consent.sql');
const idempotentDeleteMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '003_community_delete_idempotent.sql'
);

const serviceSource = fs.readFileSync(servicePath, 'utf8');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');
const idempotentDeleteMigrationSource = fs.readFileSync(idempotentDeleteMigrationPath, 'utf8');

assert.ok(screenSource.includes("accessibilityRole=\"checkbox\""), 'consentimento deve ser acessivel');
assert.ok(screenSource.includes("accessibilityRole=\"tab\""), 'abas precisam de semantica acessivel');
assert.ok(screenSource.includes('Ainda não há relatos publicados'), 'estado vazio PT ausente');
assert.ok(screenSource.includes('No published stories yet'), 'estado vazio EN ausente');
assert.ok(!screenSource.includes('const TESTIMONIALS'), 'nao inclua depoimentos de exemplo');
assert.ok(serviceSource.includes("post.status === 'published'"), 'feed deve aceitar somente published');
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

const storage = new Map();
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
  if (name === '@supabase/supabase-js') return { createClient: () => { throw new Error('cloud should be off'); } };
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
  await assert.rejects(
    api.submitCommunityStory({ body: 'Uma conquista verdadeira.', consent: false, locale: 'pt' }),
    (error) => error.code === 'consent_required'
  );
  const result = await api.submitCommunityStory({
    body: 'Recebi a notícia que eu estava esperando e quero registrar este momento.',
    consent: true,
    locale: 'pt',
    manifestationId: 'm-local-1',
    manifestationTitle: 'Minha nova fase',
  });
  assert.strictEqual(result.synced, false, 'sem credenciais nunca deve fingir envio');
  assert.strictEqual(result.item.status, 'local_draft');
  const loaded = await api.loadCommunityState();
  assert.strictEqual(loaded.feed.length, 0, 'fallback nao pode inventar feed publico');
  assert.strictEqual(loaded.own.length, 1, 'rascunho local deve sobreviver ao reload');
  assert.strictEqual(loaded.own[0].manifestationId, 'm-local-1');
  const deleted = await api.deleteCommunityStory(loaded.own[0]);
  assert.strictEqual(deleted.ok, true, 'rascunho local deve poder ser apagado');
  assert.strictEqual((await api.loadLocalCommunityStories()).length, 0, 'rascunho apagado nao pode reaparecer');

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
    JSON.stringify([{ body: 'Relato legado sem identificador, mas ainda valido.', status: 'local_draft' }])
  );
  const legacyFirst = await api.loadLocalCommunityStories();
  const legacySecond = await api.loadLocalCommunityStories();
  assert.strictEqual(legacyFirst[0].id, legacySecond[0].id, 'id legado precisa ser deterministico');
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
    }),
    (error) => error.code === api.COMMUNITY_STORAGE_ERROR_CODE,
    'nova escrita precisa ser bloqueada enquanto o armazenamento estiver ilegivel'
  );
  assert.strictEqual(
    storage.get(api.COMMUNITY_STORAGE_KEY),
    '{json-corrompido',
    'payload corrompido deve ser preservado para recuperacao, nunca sobrescrito'
  );
  console.log('OK: comunidade local-first, consentimento, moderacao, exclusao sincronizada e PT/EN verificados');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
