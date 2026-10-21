const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { transformSync } = require('@babel/core');
const playIntegrity = require('../api/_play-integrity');

const root = path.resolve(__dirname, '..');
const PROJECT_NUMBER_ENV = 'EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER';
const originalProjectNumber = process.env[PROJECT_NUMBER_ENV];

function loadEsm(relativePath, mocks) {
  const filename = path.join(root, relativePath);
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    babelrc: false,
    configFile: false,
  }).code;
  const module = { exports: {} };
  const localRequire = (name) =>
    Object.prototype.hasOwnProperty.call(mocks, name) ? mocks[name] : require(name);
  new Function('require', 'module', 'exports', 'process', compiled)(
    localRequire,
    module,
    module.exports,
    process
  );
  return module.exports;
}

function fakeAppIntegrity({ prepareError = null, results = [] } = {}) {
  const calls = { prepare: [], request: [] };
  return {
    calls,
    module: {
      prepareIntegrityTokenProviderAsync: async (projectNumber) => {
        calls.prepare.push(projectNumber);
        if (prepareError) throw prepareError;
      },
      requestIntegrityCheckAsync: async (requestHash) => {
        calls.request.push(requestHash);
        const next = results.length ? results.shift() : 'device-integrity-token';
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

function loadClient(platform, { projectNumber = '', integrity = fakeAppIntegrity(), session = null } = {}) {
  if (projectNumber) process.env[PROJECT_NUMBER_ENV] = projectNumber;
  else delete process.env[PROJECT_NUMBER_ENV];
  const reactNative = { Platform: { OS: platform } };
  const storage = loadEsm('services/narrationAudioStorage.js', {
    'expo-file-system': { Directory: class TestDirectory {}, File: class TestFile {}, Paths: {} },
    'react-native': reactNative,
  });
  // the order the app talks to Supabase ('session') and asks Google for the token ('token')
  const events = [];
  const appIntegrity = loadEsm('services/appIntegrity.js', {
    '@expo/app-integrity': {
      ...integrity.module,
      requestIntegrityCheckAsync: (requestHash) => {
        events.push('token');
        return integrity.module.requestIntegrityCheckAsync(requestHash);
      },
    },
    './narrationAudioStorage': storage,
    'react-native': reactNative,
  });
  const supabaseCalls = { count: 0 };
  const api = loadEsm('services/celesteApiSession.js', {
    './appIntegrity': appIntegrity,
    './celesteSupabase': {
      getCelesteSupabaseClient: () => ({
        auth: {
          getSession: async () => {
            supabaseCalls.count += 1;
            events.push('session');
            return { data: { session }, error: null };
          },
          signInAnonymously: async () => {
            supabaseCalls.count += 1;
            events.push('session');
            return { data: { session: { access_token: 'native-anonymous-session' } }, error: null };
          },
        },
      }),
    },
    'react-native': reactNative,
  });
  return { api, appIntegrity, integrity, supabaseCalls, events };
}

const sha256Hex = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
// Independent oracle of the canonical request hash checked by api/_play-integrity.js: the token is bound to the
// operation, the request id, the session (Bearer) that sends it and the exact body.
const oracleRequestHash = (operation, requestId, accessToken, body) =>
  sha256Hex(
    ['celeste-play-integrity-v2', operation, requestId, sha256Hex(accessToken), sha256Hex(body)].join('\n')
  );
const attestationRequired = (error) =>
  error &&
  error.message === 'native_attestation_required' &&
  error.code === 'native_attestation_required';
const CLOSED = (client) => ({ available: false, client, reason: 'native_attestation_required' });
const voiceBody = JSON.stringify({
  mode: 'personal',
  narratorId: 'serena',
  lang: 'pt',
  text: 'Você escolhe a própria voz ✨ e respira com calma.',
  cloudConsent: true,
  cloudConsentVersion: 'test-consent',
  adultConfirmed: true,
});
const sceneBody = JSON.stringify({
  desire: 'Viver perto do mar ✨ com calma',
  category: 'Peace',
  lang: 'pt',
  profile: { whyMatters: 'respirar sem pressa' },
  cloudConsent: true,
  cloudConsentVersion: 'test-consent',
  adultConfirmed: true,
  includeJourneySuite: true,
});
const translationBody = JSON.stringify({
  sourceLang: 'pt',
  targetLang: 'en',
  scene: { title: 'Mar', intention: 'Calma.', affirmation: 'Eu escolho a calma.', story: 'Você respira.', anchorIdentity: 'Eu respiro.', anchorStep: 'Respirar.' },
  cloudConsent: true,
  cloudConsentVersion: 'test-consent',
  adultConfirmed: true,
});

async function assertClosedBeforeCloud(client, label, call) {
  await assert.rejects(call, attestationRequired, label);
  assert.strictEqual(client.supabaseCalls.count, 0, `${label}: Supabase contatado sem atestacao`);
}

// The token binds to the session, so Google is asked only after the session exists; when no token comes, the call
// still refuses (the caller never sends the voice request).
async function assertRefusedAfterSession(client, label, call) {
  await assert.rejects(call, attestationRequired, label);
  assert.strictEqual(client.events[0], 'session', `${label}: a sessao vem antes do pedido do token`);
}

async function verifyIosStaysLocal() {
  const ios = loadClient('ios', { projectNumber: '123456789012' });
  assert.deepStrictEqual(ios.api.celesteCloudAccessCapability(), CLOSED('ios'));
  assert.deepStrictEqual(ios.api.celesteCloudAccessCapability('ios', 'audio'), CLOSED('ios'));
  await assertClosedBeforeCloud(ios, 'iOS sem operacao', () => ios.api.celestePaidApiHeaders());
  await assertClosedBeforeCloud(ios, 'iOS voz', () =>
    ios.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  await assertClosedBeforeCloud(ios, 'iOS sessao', () => ios.api.getCelesteApiSession());
  assert.strictEqual(ios.integrity.calls.prepare.length + ios.integrity.calls.request.length, 0);
}

// The paid operations the server knows (api/_paid-access.js OPERATIONS): Android may open exactly the server's
// NATIVE_OPERATIONS — the voice and the AI texts (scene with the 6+6 suite, translation) — and nothing else.
const SERVER_OPERATIONS = ['scene', 'translation', 'dream', 'audio', 'visual'];

async function verifyAndroidOpensOnlyVerifiedVoiceAndTexts() {
  const unconfigured = loadClient('android');
  assert.deepStrictEqual(unconfigured.api.celesteCloudAccessCapability(), CLOSED('android'));
  for (const operation of ['audio', 'scene', 'translation']) {
    assert.deepStrictEqual(
      unconfigured.api.celesteCloudAccessCapability('android', operation),
      CLOSED('android'),
      `sem numero do projeto Google Cloud o Android continua fechado (${operation})`
    );
    await assertClosedBeforeCloud(unconfigured, `Android ${operation} sem projeto`, () =>
      unconfigured.api.celestePaidApiHeaders({ operation, body: voiceBody })
    );
  }
  assert.strictEqual(unconfigured.integrity.calls.prepare.length, 0);

  const android = loadClient('android', { projectNumber: '123456789012' });
  for (const operation of SERVER_OPERATIONS) {
    const allowed = playIntegrity.NATIVE_OPERATIONS.includes(operation);
    assert.deepStrictEqual(
      android.api.celesteCloudAccessCapability('android', operation),
      allowed ? { available: true, client: 'android', reason: null } : CLOSED('android'),
      `Android ${operation}: o app abre exatamente o que o servidor aceita do Android verificado`
    );
  }
  assert.deepStrictEqual(
    [...playIntegrity.NATIVE_OPERATIONS].sort(),
    ['audio', 'scene', 'translation'],
    'Android verificado: voz, cena (com a suite 6+6) e traducao; imagem e sonho nunca'
  );
  for (const operation of ['audio', 'scene', 'translation']) {
    assert.deepStrictEqual(
      android.api.celesteCloudAccessCapability('ios', operation),
      CLOSED('ios'),
      `${operation} verificado e so do Android`
    );
  }
  for (const operation of ['visual', 'dream']) {
    await assertClosedBeforeCloud(android, `Android ${operation}`, () =>
      android.api.celestePaidApiHeaders({ operation, body: voiceBody })
    );
  }
  await assertClosedBeforeCloud(android, 'Android sem operacao (chamadas antigas)', () =>
    android.api.celestePaidApiHeaders()
  );
  for (const operation of ['audio', 'scene', 'translation']) {
    await assertClosedBeforeCloud(android, `Android ${operation} sem corpo exato`, () =>
      android.api.celestePaidApiHeaders({ operation })
    );
  }
  await assertClosedBeforeCloud(android, 'Android sessao generica', () => android.api.getCelesteApiSession());
  assert.strictEqual(android.integrity.calls.request.length, 0, 'so voz e textos com o corpo exato pedem token');

  const headers = await android.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  const requestId = headers['X-Celeste-Request-Id'];
  assert.match(requestId, /^celeste-[a-z0-9]+-[a-z0-9]+$/);
  assert.deepStrictEqual(headers, {
    Authorization: 'Bearer native-anonymous-session',
    'X-Celeste-Client': 'android',
    'X-Celeste-Request-Id': requestId,
    'X-Celeste-Integrity': 'device-integrity-token',
  });
  assert.deepStrictEqual(
    android.events,
    ['session', 'session', 'token'],
    'a sessao anonima e criada antes do token: o token fica amarrado a ela'
  );
  assert.deepStrictEqual(android.integrity.calls.prepare, ['123456789012']);
  assert.deepStrictEqual(android.integrity.calls.request, [
    oracleRequestHash('audio', requestId, 'native-anonymous-session', voiceBody),
  ]);
  assert.strictEqual(
    android.integrity.calls.request[0],
    playIntegrity.requestHashFor({
      operation: 'audio',
      requestId,
      sessionHash: sha256Hex('native-anonymous-session'),
      bodyHash: playIntegrity.requestBodyHash(JSON.parse(voiceBody)),
    }),
    'app e servidor precisam calcular o mesmo hash do pedido'
  );
  await android.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.deepStrictEqual(android.integrity.calls.prepare, ['123456789012'], 'provedor preparado uma vez');

  // The session already on the device is the one the token binds: another session gives another hash.
  const signedIn = loadClient('android', {
    projectNumber: '123456789012',
    session: { access_token: 'sessao-anonima-ja-guardada' },
  });
  const reused = await signedIn.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.strictEqual(reused.Authorization, 'Bearer sessao-anonima-ja-guardada');
  assert.deepStrictEqual(signedIn.integrity.calls.request, [
    oracleRequestHash('audio', reused['X-Celeste-Request-Id'], 'sessao-anonima-ja-guardada', voiceBody),
  ]);

  // The AI texts bind the token the same way, to their own operation: a scene token never serves the voice.
  for (const [operation, body] of [['scene', sceneBody], ['translation', translationBody]]) {
    const texts = loadClient('android', { projectNumber: '123456789012' });
    const textHeaders = await texts.api.celestePaidApiHeaders({ operation, body });
    const textRequestId = textHeaders['X-Celeste-Request-Id'];
    assert.deepStrictEqual(textHeaders, {
      Authorization: 'Bearer native-anonymous-session',
      'X-Celeste-Client': 'android',
      'X-Celeste-Request-Id': textRequestId,
      'X-Celeste-Integrity': 'device-integrity-token',
    });
    assert.deepStrictEqual(texts.events, ['session', 'session', 'token'], `${operation}: a sessao vem antes do token`);
    assert.deepStrictEqual(texts.integrity.calls.request, [
      playIntegrity.requestHashFor({
        operation,
        requestId: textRequestId,
        sessionHash: sha256Hex('native-anonymous-session'),
        bodyHash: playIntegrity.requestBodyHash(JSON.parse(body)),
      }),
    ], `${operation}: app e servidor calculam o mesmo hash, amarrado a operacao`);
    assert.notStrictEqual(
      texts.integrity.calls.request[0],
      oracleRequestHash('audio', textRequestId, 'native-anonymous-session', body),
      `${operation}: o token do texto nao vale para a voz`
    );
  }
}

// The text services sign exactly the bytes they send: generatePersonalizedScene asks for a 'scene' token and
// translateManifestationScene for a 'translation' token, each over the JSON string that goes in the request body.
async function verifyTextServicesSignTheExactBody() {
  const consent = require('../constants/cloudConsent.android.js');
  const headerCalls = [];
  const sent = [];
  const session = {
    celestePaidApiHeaders: async (options) => {
      headerCalls.push(options);
      return { Authorization: 'Bearer s', 'X-Celeste-Client': 'android', 'X-Celeste-Integrity': 'token' };
    },
  };
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    sent.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => (String(url).endsWith('/api/traduzir-cena')
        ? { scene: { title: 'T', intention: 'I', affirmation: 'Eu escolho.', story: 'S', anchorIdentity: 'A', anchorStep: 'P', personalizedWith: [] }, generation: {} }
        : { scene: { intention: 'I', affirmation: 'Eu escolho.', story: 'S', anchorIdentity: 'A', anchorStep: 'P' }, generation: {} }),
    };
  };
  try {
    const sceneService = loadEsm('services/generatePersonalizedScene.js', {
      '../constants/cloudConsent': consent,
      './celesteApiSession': session,
    });
    const translation = loadEsm('services/translateManifestationScene.js', {
      '../constants/cloudConsent': consent,
      './celesteApiSession': session,
      './generatePersonalizedScene': sceneService,
    });
    const profile = {
      age: '25–34',
      cloudConsentVersion: consent.CLOUD_CONSENT_VERSION,
      cloudPersonalization: true,
      cloudAdultConfirmed: true,
      cloudNarrationConsent: true,
      cloudDreamConsent: true,
    };
    await sceneService.generatePersonalizedScene({
      desire: 'viver perto do mar',
      category: 'Peace',
      lang: 'pt',
      profile,
      includeJourneySuite: false,
    });
    await translation.translateManifestationScene({
      sourceLang: 'pt',
      targetLang: 'en',
      scene: { title: 'T', intention: 'I', affirmation: 'Eu escolho.', story: 'S', anchorIdentity: 'A', anchorStep: 'P' },
      profile,
    });
  } finally {
    global.fetch = originalFetch;
  }
  assert.deepStrictEqual(headerCalls.map((call) => call.operation), ['scene', 'translation']);
  assert.strictEqual(headerCalls[0].body, sent[0].init.body, 'cena: o token cobre exatamente o corpo enviado');
  assert.strictEqual(headerCalls[1].body, sent[1].init.body, 'traducao: o token cobre exatamente o corpo enviado');
  assert.ok(String(sent[0].url).endsWith('/api/gerar-cena') && String(sent[1].url).endsWith('/api/traduzir-cena'));
  assert.strictEqual(
    JSON.parse(sent[0].init.body).cloudConsentVersion,
    consent.ANDROID_CLOUD_CONSENT_VERSION,
    'no Android vai a versao do aceite que o Android mostrou'
  );
  assert.strictEqual(sent[0].init.headers['X-Celeste-Integrity'], 'token');
}

async function verifyAndroidIntegrityFailuresStayLocal() {
  const integrityError = (code) => Object.assign(new Error(code), { code });

  const failing = loadClient('android', {
    projectNumber: '123456789012',
    integrity: fakeAppIntegrity({ results: [integrityError('ERR_APP_INTEGRITY_NETWORK_ERROR')] }),
  });
  await assertRefusedAfterSession(failing, 'Play Integrity falhou', () =>
    failing.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );

  const emptyToken = loadClient('android', {
    projectNumber: '123456789012',
    integrity: fakeAppIntegrity({ results: [''] }),
  });
  await assertRefusedAfterSession(emptyToken, 'token vazio', () =>
    emptyToken.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );

  const expired = loadClient('android', {
    projectNumber: '123456789012',
    integrity: fakeAppIntegrity({
      results: [integrityError('ERR_APP_INTEGRITY_PROVIDER_INVALID'), 'fresh-integrity-token'],
    }),
  });
  const renewed = await expired.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody });
  assert.strictEqual(renewed['X-Celeste-Integrity'], 'fresh-integrity-token');
  assert.strictEqual(expired.integrity.calls.prepare.length, 2, 'provedor expirado e preparado de novo uma vez');

  const unprepared = loadClient('android', {
    projectNumber: '123456789012',
    integrity: fakeAppIntegrity({ prepareError: integrityError('ERR_APP_INTEGRITY_PLAY_STORE_NOT_FOUND') }),
  });
  await assertRefusedAfterSession(unprepared, 'Play Store ausente', () =>
    unprepared.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  await assertRefusedAfterSession(unprepared, 'Play Store ausente (repeticao)', () =>
    unprepared.api.celestePaidApiHeaders({ operation: 'audio', body: voiceBody })
  );
  assert.strictEqual(
    unprepared.integrity.calls.prepare.length,
    1,
    'a Play aceita 5 preparos por minuto: falha nao pode virar loop'
  );
  assert.strictEqual(
    await unprepared.appIntegrity.integrityHeaderFor({ operation: 'audio', requestId: 'x', sessionHash: 'z', bodyHash: 'y' }),
    null,
    'integrityHeaderFor nunca lanca para quem chama'
  );
}

async function verifyWebUnchanged() {
  const web = loadClient('web', {
    projectNumber: '123456789012',
    session: { access_token: 'verified-web-session' },
  });
  assert.deepStrictEqual(web.api.celesteCloudAccessCapability(), { available: true, client: 'web', reason: null });
  const headers = await web.api.celestePaidApiHeaders();
  assert.strictEqual(web.supabaseCalls.count, 1);
  assert.strictEqual(headers.Authorization, 'Bearer verified-web-session');
  assert.strictEqual(headers['X-Celeste-Client'], 'web');
  assert.match(headers['X-Celeste-Request-Id'], /^celeste-[a-z0-9]+-[a-z0-9]+$/);
  assert.ok(!('X-Celeste-Integrity' in headers), 'site nao usa Play Integrity');
  assert.strictEqual(web.integrity.calls.prepare.length + web.integrity.calls.request.length, 0);
}

function verifyServerBoundarySource() {
  const paidAccess = fs.readFileSync(path.join(root, 'api', '_paid-access.js'), 'utf8');
  assert.match(paidAccess, /X-Celeste-Client is attacker-controlled/);
  assert.match(paidAccess, /localNativeBypassEnabled\(\)/);
  assert.match(paidAccess, /CELESTE_ALLOW_LOCAL_NATIVE_BYPASS === '1'/);
  assert.match(paidAccess, /process\.env\.VERCEL_ENV === 'development'/);
  assert.match(paidAccess, /process\.env\.NODE_ENV !== 'production'/);
  assert.match(
    paidAccess,
    /clientKind\(req\) === 'android' && Boolean\(playIntegrity\.integrityToken\(req\)\)/,
    'so Android com token passa o pre-filtro nativo'
  );
  assert.match(
    paidAccess,
    /attestNative && !playIntegrity\.NATIVE_OPERATIONS\.includes\(operation\)/,
    'Play Integrity abre so a lista nativa (voz e textos)'
  );
  const integritySource = fs.readFileSync(path.join(root, 'api', '_play-integrity.js'), 'utf8');
  assert.match(
    integritySource,
    /const NATIVE_OPERATIONS = Object\.freeze\(\['audio', 'scene', 'translation'\]\);/,
    'lista nativa explicita e congelada: voz, cena e traducao'
  );
  const sceneRoute = fs.readFileSync(path.join(root, 'api', 'gerar-cena.js'), 'utf8');
  assert.match(
    sceneRoute,
    /if \(nativeRequest && validated\.value\.continuity\) \{\s*const refusal = paidAccess\.nativeRefusal\('operation_not_allowed'\);/,
    'Espelho Vivo (cena com continuidade) fica fora do Android'
  );
  const verifyIndex = paidAccess.indexOf('playIntegrity.verifyPlayIntegrity(req');
  const identityIndex = paidAccess.indexOf('await authenticatedUser(config, token)');
  assert.ok(verifyIndex > 0 && verifyIndex < identityIndex, 'Google valida antes de identidade e cota');
}

// An AAB built without the Cloud project number never opens the Celeste voice on Android (the app refuses before the
// network): the publish script says so out loud, without blocking and without printing any value.
function verifyAabScriptWarnsWithoutProjectNumber() {
  const script = fs.readFileSync(path.join(root, 'scripts', 'publicar-google-play.ps1'), 'utf8');
  assert.match(
    script,
    /if \(-not \$scopes\.ContainsKey\('EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER'\)\) \{\s*Write-Warning '[^'\r\n]*EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER[^'\r\n]*'\s*\}/,
    'publicar-google-play.ps1 avisa (sem bloquear) quando falta o numero do projeto no EAS production'
  );
}

async function main() {
  try {
    await verifyIosStaysLocal();
    await verifyAndroidOpensOnlyVerifiedVoiceAndTexts();
    await verifyAndroidIntegrityFailuresStayLocal();
    await verifyTextServicesSignTheExactBody();
    await verifyWebUnchanged();
    verifyServerBoundarySource();
    verifyAabScriptWarnsWithoutProjectNumber();
  } finally {
    if (originalProjectNumber === undefined) delete process.env[PROJECT_NUMBER_ENV];
    else process.env[PROJECT_NUMBER_ENV] = originalProjectNumber;
  }
  console.log(
    'Fronteira nativa OK: iOS local, Android so abre voz e textos (cena, traducao) com Play Integrity e o resto continua fail-closed.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
