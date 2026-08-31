const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.resolve(__dirname, '..');

function loadSessionModule(platform, supabase) {
  const filename = path.join(root, 'services', 'celesteApiSession.js');
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    babelrc: false,
    configFile: false,
  }).code;
  const module = { exports: {} };
  const localRequire = (name) => {
    if (name === 'react-native') return { Platform: { OS: platform } };
    if (name === './celesteSupabase') {
      return { getCelesteSupabaseClient: () => supabase };
    }
    if (name.startsWith('@babel/runtime/')) return require(name);
    return require(name);
  };
  new Function('require', 'module', 'exports', 'process', compiled)(
    localRequire,
    module,
    module.exports,
    process
  );
  return module.exports;
}

async function verifyNativeFailsBeforeCloud(platform) {
  let calls = 0;
  const api = loadSessionModule(platform, {
    auth: {
      getSession: async () => {
        calls += 1;
        return { data: { session: null }, error: null };
      },
      signInAnonymously: async () => {
        calls += 1;
        return { data: { session: null }, error: null };
      },
    },
  });
  assert.deepStrictEqual(api.celesteCloudAccessCapability(), {
    available: false,
    client: platform,
    reason: 'native_attestation_required',
  });
  await assert.rejects(
    () => api.celestePaidApiHeaders(),
    (error) =>
      error &&
      error.message === 'native_attestation_required' &&
      error.code === 'native_attestation_required'
  );
  assert.strictEqual(calls, 0, `${platform} contacted Supabase before attestation`);
}

async function main() {
  await verifyNativeFailsBeforeCloud('android');
  await verifyNativeFailsBeforeCloud('ios');

  let calls = 0;
  const web = loadSessionModule('web', {
    auth: {
      getSession: async () => {
        calls += 1;
        return {
          data: { session: { access_token: 'verified-web-session' } },
          error: null,
        };
      },
      signInAnonymously: async () => {
        throw new Error('existing session should be reused');
      },
    },
  });
  const headers = await web.celestePaidApiHeaders();
  assert.strictEqual(calls, 1);
  assert.strictEqual(headers.Authorization, 'Bearer verified-web-session');
  assert.strictEqual(headers['X-Celeste-Client'], 'web');
  assert.match(headers['X-Celeste-Request-Id'], /^celeste-[a-z0-9]+-[a-z0-9]+$/);

  const paidAccess = fs.readFileSync(path.join(root, 'api', '_paid-access.js'), 'utf8');
  assert.match(paidAccess, /X-Celeste-Client is attacker-controlled/);
  assert.match(paidAccess, /localNativeBypassEnabled\(\)/);
  assert.match(paidAccess, /CELESTE_ALLOW_LOCAL_NATIVE_BYPASS === '1'/);
  assert.match(paidAccess, /process\.env\.VERCEL_ENV === 'development'/);
  assert.match(paidAccess, /process\.env\.NODE_ENV !== 'production'/);

  console.log('Fronteira nativa OK: Android/iOS ficam locais e o backend continua fail-closed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
