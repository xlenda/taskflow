const assert = require('assert');
const { createClient } = require('@supabase/supabase-js');

const url = process.env.CELESTE_RELEASE_SUPABASE_URL;
const serviceKey = process.env.CELESTE_RELEASE_SUPABASE_SERVICE_KEY;
if (!url || !serviceKey || url === '[SENSITIVE]' || serviceKey === '[SENSITIVE]') {
  throw new Error('Supabase release credentials are unavailable.');
}

const client = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function tableExists(table, columns) {
  const { error } = await client.from(table).select(columns).limit(1);
  if (!error) return true;
  if (error.code === 'PGRST205' || /could not find the table/i.test(error.message || '')) {
    return false;
  }
  throw new Error(`${table}: ${error.message}`);
}

async function main() {
  for (const [table, columns] of [
    ['celeste_generation_actor_usage', 'usage_day'],
    ['celeste_generation_operation_policy', 'operation'],
  ]) {
    assert.strictEqual(await tableExists(table, columns), true, `${table} is missing`);
  }

  const { data, error } = await client
    .from('celeste_generation_policy')
    .select('actor_schema_version')
    .limit(1);
  if (error) throw new Error(`celeste_generation_policy: ${error.message}`);
  assert.ok(Array.isArray(data) && data.length === 1, 'generation policy row is missing');
  assert.strictEqual(data[0].actor_schema_version, 10, 'generation schema is not version 10');

  const communityTables = [
    ['community_profiles', 'id'],
    ['circles', 'id'],
    ['circle_members', 'circle_id'],
    ['community_posts', 'id'],
    ['community_reactions', 'post_id'],
    ['community_reports', 'post_id'],
    ['community_blocks', 'blocker_id'],
    ['celeste_community_policy', 'enabled'],
  ];
  const communityPresence = [];
  for (const [table, columns] of communityTables) {
    communityPresence.push(await tableExists(table, columns));
  }
  const presentCount = communityPresence.filter(Boolean).length;
  if (presentCount !== 0 && presentCount !== communityTables.length) {
    throw new Error('community schema is partially applied; refusing automatic repair');
  }

  const mode = presentCount === 0 ? 'generation_only' : 'complete';
  console.log('Supabase remoto validado sem ler dados pessoais.');
  console.log(`BASELINE_MODE=${mode}`);
}

main().catch((error) => {
  console.error(`Falha na auditoria do Supabase: ${error.message}`);
  process.exitCode = 1;
});
