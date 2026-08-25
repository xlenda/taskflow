const assert = require('assert');
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

const root = path.join(__dirname, '..');
const servicePath = path.join(root, 'services', 'communityStories.js');
const screenPath = path.join(root, 'screens', 'CommunityScreen.js');
const migrationPath = path.join(root, 'supabase', 'migrations', '002_community_story_consent.sql');

const serviceSource = fs.readFileSync(servicePath, 'utf8');
const screenSource = fs.readFileSync(screenPath, 'utf8');
const migrationSource = fs.readFileSync(migrationPath, 'utf8');

assert.ok(screenSource.includes("accessibilityRole=\"checkbox\""), 'consentimento deve ser acessivel');
assert.ok(screenSource.includes("accessibilityRole=\"tab\""), 'abas precisam de semantica acessivel');
assert.ok(screenSource.includes('Ainda não há relatos publicados'), 'estado vazio PT ausente');
assert.ok(screenSource.includes('No published stories yet'), 'estado vazio EN ausente');
assert.ok(!screenSource.includes('const TESTIMONIALS'), 'nao inclua depoimentos de exemplo');
assert.ok(serviceSource.includes("post.status === 'published'"), 'feed deve aceitar somente published');
assert.ok(screenSource.includes('deleteCommunityStory'), 'autora precisa conseguir apagar o proprio relato');
assert.ok(serviceSource.includes("rpc('community_delete_own_post'"), 'relato remoto deve usar RPC de exclusao da autora');
assert.ok(
  !serviceSource.includes("|| (circles || [])[0]"),
  'categoria nao pode cair silenciosamente no primeiro circulo de outro tema'
);
assert.ok(migrationSource.includes('publication_consent_at is not null'), 'backend deve exigir consentimento');
assert.ok(migrationSource.includes("set status = 'pending'"), 'envio deve passar por moderacao');

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
  console.log('OK: comunidade local-first, consentimento, moderacao, vazio real e PT/EN verificados');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
