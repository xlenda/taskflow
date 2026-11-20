// Portão dos anúncios do SITE (Meta e Google). Compila os módulos de verdade (Babel, como o Metro) e roda
// num navegador de mentira, sem rede:
//  1) sem aceite nada carrega (nenhum <script>, fbq ou gtag); Recusar guarda a escolha e apaga cookies de anúncio;
//  2) com aceite carrega só os domínios certos por <script src> (Meta; Google só com ID) e manda o PageView;
//  3) o Lead sai uma vez só, no "Entrar no Celeste" do fim do cadastro, e só se a pessoa entrou;
//  4) o selo da App Store só aparece em iPhone/iPad (inclusive Instagram/Facebook), nunca no Android, no
//     computador ou no app de loja; é o selo oficial da Apple, sem alteração;
//  5) o app de loja não faz nada (utils/adTracking.js vazio; aviso e selo devolvem null fora da web);
//  6) a CSP do vercel.json libera exatamente os domínios da Meta e do Google e segue sem 'unsafe-inline' em script;
//  7) prova por mutação: cada regra acima reprova quando a lógica é quebrada de propósito.
// Uso (cwd = raiz do app): node scripts/verificar-anuncios-site.js
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const { transformSync } = require('@babel/core');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const SITE = 'https://celeste-jet-two.vercel.app';
const CONSENT_KEY = '@celeste_ad_consent_v1';
const PIXEL_ID = '1822816372332275';
const APP_STORE_URL = 'https://apps.apple.com/br/app/id6833663415?ct=site_celeste&mt=8';
// Selos oficiais (toolbox.marketingtools.apple.com, pt-br e en-us), conferidos byte a byte.
const OFFICIAL_BADGES = {
  'assets/badges/app-store-pt-br.svg': '0e9291a9c654e479762b75b51dd94a150af6fab76390a79cb2218cdc8f6cc893',
  'assets/badges/app-store-en-us.svg': 'a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f',
};

// Domínios exatos (guias de CSP da Meta e do Google Ads). google.com.br: Brasil, onde a Celeste anuncia.
// googleads.g.doubleclick.net em script-src: o gtag.js de verdade carrega o viewthroughconversion como script
// (visto no navegador com a CSP aplicada e um ID de teste).
const META = {
  script: ['https://connect.facebook.net'],
  img: ['https://www.facebook.com'],
  connect: ['https://www.facebook.com'],
};
const GOOGLE = {
  script: [
    'https://www.googletagmanager.com',
    'https://www.googleadservices.com',
    'https://googleads.g.doubleclick.net',
    'https://www.google.com',
  ],
  img: [
    'https://www.googletagmanager.com',
    'https://www.googleadservices.com',
    'https://googleads.g.doubleclick.net',
    'https://pagead2.googlesyndication.com',
    'https://www.google.com',
    'https://www.google.com.br',
  ],
  connect: [
    'https://www.googletagmanager.com',
    'https://www.googleadservices.com',
    'https://googleads.g.doubleclick.net',
    'https://pagead2.googlesyndication.com',
    'https://www.google.com',
    'https://www.google.com.br',
    'https://ad.doubleclick.net',
  ],
};
// Google só entra na CSP quando a tag existe (GOOGLE_ADS_ID em constants/ads.js): www.google.com e afins têm
// endpoints JSONP que desmontam a CSP, então não ficam liberados sem uso (revisão de código, 19/11/2026).
const GOOGLE_ON = /export const GOOGLE_ADS_ID = 'AW-\d+';/.test(read('constants/ads.js'));
const GOOGLE_CSP = GOOGLE_ON ? GOOGLE : { script: [], img: [], connect: [] };
const CSP_EXPECTED = {
  'default-src': ["'self'"],
  'script-src': ["'self'", ...META.script, ...GOOGLE_CSP.script],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:', ...META.img, ...GOOGLE_CSP.img],
  'font-src': ["'self'", 'data:'],
  'media-src': ["'self'", 'data:', 'blob:'],
  'connect-src': ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', ...META.connect, ...GOOGLE_CSP.connect],
  'worker-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'frame-src': ["'none'"],
  'frame-ancestors': ["'none'"],
  'form-action': ["'self'"],
};

class MutationNotApplied extends Error {}

// ---------------------------------------------------------------- carregador (Babel + módulos de mentira)
const compiledCache = new Map();
function compile(file, source) {
  const key = `${file}\0${source}`;
  if (!compiledCache.has(key)) {
    compiledCache.set(
      key,
      transformSync(source, {
        filename: file,
        presets: ['babel-preset-expo'],
        sourceType: 'module',
        babelrc: false,
        configFile: false,
      }).code
    );
  }
  return compiledCache.get(key);
}

function resolveFile(base) {
  for (const candidate of [base, `${base}.js`, path.join(base, 'index.js')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`arquivo não encontrado: ${base}`);
}

const projectKey = (file) => path.relative(ROOT, file).replace(/\\/g, '/');

// mocks: por nome de pacote ('react') ou por caminho do projeto sem .js ('context/AppContext').
// env: window/document/navigator do navegador de mentira. edit: mutação { file, from, to }.
function load(relative, { mocks = {}, env = {}, edit } = {}) {
  const cache = new Map();
  const run = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    if (/\.(svg|png)$/.test(file)) return { asset: projectKey(file) };
    // LF sempre: no checkout do Windows (autocrlf) os arquivos chegam com CRLF e as mutações procuram "\n"
    let source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (edit && edit.file === projectKey(file)) {
      const next = source.replace(edit.from, edit.to);
      if (next === source) throw new MutationNotApplied(`mutação não aplicou em ${edit.file}: ${edit.from}`);
      source = next;
    }
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = (request) => {
      if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
      if (!request.startsWith('.')) return require(request);
      const target = /\.(svg|png)$/.test(request)
        ? path.resolve(path.dirname(file), request)
        : resolveFile(path.resolve(path.dirname(file), request));
      const key = projectKey(target).replace(/\.js$/, '');
      if (Object.prototype.hasOwnProperty.call(mocks, key)) return mocks[key];
      return run(target);
    };
    // window/document/navigator viram parâmetros: cada carga tem o seu navegador, sem tocar no global do Node.
    const fn = new Function('require', 'module', 'exports', 'window', 'document', 'navigator', compile(file, source));
    fn(localRequire, module, module.exports, env.window, env.document, env.navigator);
    return module.exports;
  };
  return run(path.join(ROOT, relative));
}

// ---------------------------------------------------------------- navegador de mentira
function browser({ url = `${SITE}/`, saved, storageFails = false, navigator } = {}) {
  const store = new Map(saved ? [[CONSENT_KEY, saved]] : []);
  const log = [];
  const cookieWrites = [];
  const window = {
    location: new URL(url),
    localStorage: {
      getItem(key) {
        if (storageFails) throw new Error('SecurityError');
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        if (storageFails) throw new Error('QuotaExceededError');
        store.set(key, String(value));
      },
    },
    history: {
      state: { key: 'estado-da-navegacao' },
      replaceState(state, _title, next) {
        log.push({ kind: 'replaceState', state, url: String(next) });
        window.location = new URL(String(next));
      },
    },
  };
  const document = {
    head: {
      appendChild(node) {
        log.push({ kind: 'script', node });
      },
    },
    createElement(tag) {
      return { tagName: String(tag).toUpperCase() };
    },
  };
  Object.defineProperty(document, 'cookie', {
    get: () => '',
    set: (value) => {
      cookieWrites.push(String(value));
      log.push({ kind: 'cookie', value: String(value) });
    },
  });
  return {
    window,
    document,
    navigator,
    store,
    log,
    cookieWrites,
    scripts: () => log.filter((entry) => entry.kind === 'script').map((entry) => entry.node),
    fbq: () => (window.fbq ? window.fbq.queue.map((args) => Array.from(args)) : []),
    gtag: () => (window.dataLayer || []).map((args) => Array.from(args)),
  };
}

function loadTracking(env, { edit, ads } = {}) {
  return load('utils/adTracking.web.js', {
    env,
    edit,
    mocks: ads ? { 'constants/ads': ads } : {},
  });
}

const ALLOWED_FBQ = [
  JSON.stringify(['set', 'autoConfig', false, PIXEL_ID]),
  JSON.stringify(['init', PIXEL_ID]),
  JSON.stringify(['track', 'PageView']),
  JSON.stringify(['track', 'Lead']),
  JSON.stringify(['trackCustom', 'AppStoreClick']),
];
function assertNoPersonalData(env) {
  for (const call of env.fbq()) {
    assert.ok(ALLOWED_FBQ.includes(JSON.stringify(call)), `chamada do pixel fora do combinado: ${JSON.stringify(call)}`);
  }
}

// ---------------------------------------------------------------- React / react-native de mentira
function fakeReact() {
  const slots = [];
  let cursor = 0;
  const React = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (next) => {
          slots[index] = typeof next === 'function' ? next(slots[index]) : next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback: (fn) => fn,
    useMemo: (make) => make(),
    useEffect() {},
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
  };
  return {
    module: { __esModule: true, default: React, ...React },
    render: (Component, props = {}) => {
      cursor = 0;
      return Component(props);
    },
  };
}
const jsxRuntime = {
  jsx: (type, props, key) => ({ type, props: props || {}, key }),
  jsxs: (type, props, key) => ({ type, props: props || {}, key }),
  Fragment: 'Fragment',
};
function fakeNative(os = 'web') {
  return {
    Platform: { OS: os, select: (options) => (os in options ? options[os] : options.default) },
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Image: 'Image',
    StyleSheet: { create: (styles) => styles, absoluteFill: {} },
  };
}
function walk(node, visit) {
  if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
  if (!node || typeof node !== 'object') return;
  visit(node);
  walk(node.props && node.props.children, visit);
}
function find(tree, predicate) {
  let found = null;
  walk(tree, (node) => {
    if (!found && predicate(node)) found = node;
  });
  return found;
}
function textOf(tree) {
  const parts = [];
  const visitChildren = (children) => {
    if (Array.isArray(children)) return children.forEach(visitChildren);
    if (typeof children === 'string' || typeof children === 'number') parts.push(String(children));
    else if (children && typeof children === 'object') visitChildren(children.props && children.props.children);
  };
  visitChildren(tree);
  return parts.join('');
}
const flatten = (style) =>
  Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style && typeof style === 'object' ? style : {};

// ---------------------------------------------------------------- checagens (cada uma aceita uma mutação)
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadLegacy:
    'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  ipadDesktopClass:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  instagramIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.20.88 (iPhone15,3; iOS 18_1; pt_BR; pt; scale=3.00; 1290x2796; 654321)',
  facebookIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/489.0.0.40.108;FBBV/650000000;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/18.1;FBSS/3;FBCR/;FBID/phone;FBLC/pt_BR;FBOP/80]',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  instagramAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 Instagram 356.0.0.41.101 Android (34/14; 480dpi; 1080x2340; samsung; SM-S918B; dm3q; qcom; pt_BR; 654321)',
  facebookAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-A546B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.39 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/489.0.0.66.81;]',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  windowsPhone:
    'Mozilla/5.0 (Mobile; Windows Phone 8.1; Android 4.0; ARM; Trident/7.0; Touch; rv:11.0; IEMobile/11.0; NOKIA; Lumia 635) like iPhone OS 7_0_3 Mac OS X AppleWebKit/537 (KHTML, like Gecko) Mobile Safari/537',
};

const checks = {
  'sem aceite nada carrega'(edit) {
    for (const saved of [undefined, 'denied', 'qualquer-coisa']) {
      const env = browser({ saved });
      const tracking = loadTracking(env, { edit });
      assert.strictEqual(tracking.AD_CONSENT_KEY, CONSENT_KEY, 'chave da escolha mudou');
      tracking.initAdTracking();
      tracking.trackSignup();
      tracking.trackAppStoreClick();
      assert.strictEqual(env.scripts().length, 0, `sem aceite (${saved}) nenhum script pode carregar`);
      assert.deepStrictEqual(env.cookieWrites, [], 'sem aceite nenhum cookie é gravado');
      assert.strictEqual(env.window.fbq, undefined, 'sem aceite não existe fbq');
      assert.strictEqual(env.window.gtag, undefined, 'sem aceite não existe gtag');
      assert.strictEqual(tracking.shouldAskAdConsent(), saved !== 'denied', 'o aviso aparece enquanto não há escolha');
    }
  },

  'recusar guarda a escolha e apaga cookies'(edit) {
    const env = browser();
    const tracking = loadTracking(env, { edit });
    tracking.setAdConsent('denied');
    assert.strictEqual(env.store.get(CONSENT_KEY), 'denied', 'a recusa fica guardada');
    assert.strictEqual(env.scripts().length, 0, 'recusar não carrega nada');
    assert.strictEqual(tracking.shouldAskAdConsent(), false, 'depois de recusar o aviso some');
    for (const cookie of ['_fbp', '_fbc', '_gcl_au', '_gcl_aw']) {
      assert.ok(
        env.cookieWrites.some((write) => write.startsWith(`${cookie}=;`) && /Max-Age=0/.test(write)),
        `recusar apaga ${cookie}`
      );
    }
    // num domínio próprio a Meta e o Google gravam no domínio principal: a recusa apaga lá também
    const own = browser({ url: 'https://www.celeste.app/' });
    loadTracking(own, { edit }).setAdConsent('denied');
    for (const domain of ['www.celeste.app', 'celeste.app']) {
      assert.ok(
        own.cookieWrites.includes(`_fbp=; Max-Age=0; path=/; domain=${domain}`),
        `recusar apaga o _fbp em ${domain}`
      );
    }
    // a recusa vale na próxima visita
    const next = browser({ saved: env.store.get(CONSENT_KEY) });
    const reloaded = loadTracking(next, { edit });
    reloaded.initAdTracking();
    assert.strictEqual(next.scripts().length, 0, 'a recusa guardada segue sem carregar nada');
    assert.strictEqual(reloaded.shouldAskAdConsent(), false);
  },

  'aceite carrega a Meta por script src e manda PageView'(edit) {
    const env = browser();
    const tracking = loadTracking(env, { edit });
    tracking.setAdConsent('granted');
    assert.strictEqual(env.store.get(CONSENT_KEY), 'granted', 'o aceite fica guardado');
    const scripts = env.scripts();
    assert.deepStrictEqual(
      scripts.map((node) => node.src),
      [tracking.META_SCRIPT_URL],
      'com a tag do Google vazia, só o pixel da Meta carrega'
    );
    assert.ok(scripts.every((node) => node.tagName === 'SCRIPT' && node.async === true), 'script assíncrono');
    assert.ok(
      scripts.every((node) => !('text' in node) && !('textContent' in node) && !('innerHTML' in node)),
      'nada de script inline (a CSP não deixa)'
    );
    assert.strictEqual(new URL(tracking.META_SCRIPT_URL).origin, 'https://connect.facebook.net');
    assert.deepStrictEqual(
      env.fbq(),
      [['set', 'autoConfig', false, PIXEL_ID], ['init', PIXEL_ID], ['track', 'PageView']],
      'autoConfig desligado antes do init (sem rótulos de botão), init sem dados e um PageView'
    );
    assert.strictEqual(env.window.fbq.disablePushState, true, 'sem PageView automático a cada troca de tela');
    assert.strictEqual(env.window.gtag, undefined, 'Google desligado enquanto o ID está vazio');
    assert.strictEqual(tracking.shouldAskAdConsent(), false, 'depois de aceitar o aviso some');
    tracking.setAdConsent('granted');
    tracking.initAdTracking();
    assert.strictEqual(env.scripts().length, 1, 'aceitar de novo não duplica o pixel');
    // quem já aceitou carrega na abertura do site
    const returning = browser({ saved: 'granted' });
    loadTracking(returning, { edit }).initAdTracking();
    assert.deepStrictEqual(returning.scripts().map((node) => node.src), [tracking.META_SCRIPT_URL]);
    assert.deepStrictEqual(returning.fbq()[2], ['track', 'PageView']);
  },

  'Google só com ID: tag por script src, page_view e conversão do cadastro'(edit) {
    const ads = { META_PIXEL_ID: PIXEL_ID, GOOGLE_ADS_ID: 'AW-123456789', GOOGLE_ADS_SIGNUP_LABEL: 'rotuloCadastro' };
    const env = browser();
    const tracking = loadTracking(env, { edit, ads });
    tracking.setAdConsent('granted');
    const sources = env.scripts().map((node) => node.src);
    assert.deepStrictEqual(sources, [tracking.META_SCRIPT_URL, `${tracking.GOOGLE_SCRIPT_URL}?id=AW-123456789`]);
    assert.strictEqual(new URL(tracking.GOOGLE_SCRIPT_URL).origin, 'https://www.googletagmanager.com');
    const layer = env.window.dataLayer;
    assert.ok(
      layer.every((entry) => Object.prototype.toString.call(entry) === '[object Arguments]'),
      'o gtag só entende o objeto arguments no dataLayer'
    );
    assert.strictEqual(env.gtag()[0][0], 'js');
    assert.deepStrictEqual(env.gtag()[1], ['config', 'AW-123456789'], 'config manda o page_view');
    tracking.trackSignup();
    tracking.trackSignup();
    assert.deepStrictEqual(
      env.gtag().filter((call) => call[0] === 'event'),
      [['event', 'conversion', { send_to: 'AW-123456789/rotuloCadastro' }]],
      'uma conversão de cadastro'
    );
    // sem rótulo: a tag carrega, mas não inventa conversão
    const noLabel = browser();
    const withoutLabel = loadTracking(noLabel, { edit, ads: { ...ads, GOOGLE_ADS_SIGNUP_LABEL: '' } });
    withoutLabel.setAdConsent('granted');
    withoutLabel.trackSignup();
    assert.ok(!noLabel.gtag().some((call) => call[0] === 'event'), 'sem rótulo, sem conversão');
    assert.ok(noLabel.fbq().some((call) => call[1] === 'Lead'), 'o Lead da Meta sai mesmo sem rótulo do Google');
  },

  'Lead uma vez só e só com aceite'(edit) {
    const lead = (env) => env.fbq().filter((call) => call[1] === 'Lead').length;
    const env = browser();
    const tracking = loadTracking(env, { edit });
    tracking.setAdConsent('granted');
    tracking.trackSignup();
    tracking.trackSignup();
    tracking.trackSignup();
    assert.strictEqual(lead(env), 1, 'um Lead por cadastro');
    tracking.trackAppStoreClick();
    assert.deepStrictEqual(env.fbq().pop(), ['trackCustom', 'AppStoreClick'], 'clique na App Store é evento próprio');
    assertNoPersonalData(env);

    // cadastro antes de responder o aviso: nada sai até o aceite; aceitou nesta visita, sai um Lead
    const early = browser();
    const pending = loadTracking(early, { edit });
    pending.trackSignup();
    assert.strictEqual(early.scripts().length, 0, 'sem aceite o Lead não carrega nada');
    assert.strictEqual(early.window.fbq, undefined);
    pending.setAdConsent('granted');
    assert.strictEqual(lead(early), 1, 'o Lead que esperou sai no aceite');
    pending.trackSignup();
    assert.strictEqual(lead(early), 1, 'e só uma vez');
    assertNoPersonalData(early);

    // cadastro e recusa: o Lead nunca sai
    const refused = browser();
    const declined = loadTracking(refused, { edit });
    declined.trackSignup();
    declined.setAdConsent('denied');
    declined.trackSignup();
    assert.strictEqual(refused.scripts().length, 0);
    assert.strictEqual(refused.window.fbq, undefined, 'com recusa não há Lead');
  },

  'clique do anúncio vai para o cookie de cada tag, antes do script'(edit) {
    const ads = { META_PIXEL_ID: PIXEL_ID, GOOGLE_ADS_ID: 'AW-123456789', GOOGLE_ADS_SIGNUP_LABEL: 'rotuloCadastro' };
    const firstScript = (env) => env.log.findIndex((entry) => entry.kind === 'script');
    const cookieAt = (env, name) => env.log.findIndex((entry) => entry.kind === 'cookie' && entry.value.startsWith(`${name}=`));
    // visitante novo: a navegação já trocou a URL quando a pessoa aceita
    const env = browser({ url: `${SITE}/?fbclid=CLIQUE123&gclid=G456&utm_source=instagram` });
    const tracking = loadTracking(env, { edit, ads });
    env.window.location = new URL(`${SITE}/bem-vindo`);
    tracking.setAdConsent('granted');
    const fbc = env.cookieWrites.find((write) => write.startsWith('_fbc='));
    const gcl = env.cookieWrites.find((write) => write.startsWith('_gcl_aw='));
    assert.match(fbc || '', /^_fbc=fb\.2\.\d{13}\.CLIQUE123; Max-Age=7776000; path=\/; SameSite=Lax; Secure$/, 'cookie _fbc da Meta');
    assert.match(gcl || '', /^_gcl_aw=GCL\.\d{10}\.G456; Max-Age=7776000; path=\/; SameSite=Lax; Secure$/, 'cookie _gcl_aw do Google');
    assert.ok(cookieAt(env, '_fbc') < firstScript(env) && cookieAt(env, '_gcl_aw') < firstScript(env), 'antes de os scripts lerem');
    // quem já aceitou e volta por outro anúncio: o app troca a URL antes do script baixar, o cookie não depende dela
    const back = browser({ url: `${SITE}/?fbclid=VOLTA9`, saved: 'granted' });
    loadTracking(back, { edit }).initAdTracking();
    assert.ok(cookieAt(back, '_fbc') >= 0 && cookieAt(back, '_fbc') < firstScript(back), 'retorno por anúncio grava o _fbc antes do pixel');
    assert.ok(back.cookieWrites.some((write) => /^_fbc=fb\.2\.\d+\.VOLTA9;/.test(write)));
    assert.ok(!back.cookieWrites.some((write) => write.startsWith('_gcl_aw=')), 'sem tag do Google, sem _gcl_aw');
    // sem clique de anúncio, nada é inventado
    const plain = browser();
    loadTracking(plain, { edit, ads }).setAdConsent('granted');
    assert.deepStrictEqual(plain.cookieWrites, [], 'sem fbclid/gclid nenhum cookie é gravado');
  },

  'rever a escolha reabre o aviso sem carregar nada'(edit) {
    const env = browser({ url: `${SITE}/?cookies=rever`, saved: 'granted' });
    const tracking = loadTracking(env, { edit });
    tracking.initAdTracking();
    assert.strictEqual(env.scripts().length, 0, 'revendo a escolha, nada carrega até a nova resposta');
    assert.strictEqual(tracking.shouldAskAdConsent(), true, 'o aviso reabre mesmo com aceite antigo');
    tracking.setAdConsent('denied');
    assert.strictEqual(env.store.get(CONSENT_KEY), 'denied');
    assert.ok(env.cookieWrites.some((write) => write.startsWith('_fbp=;')), 'recusar depois de aceitar apaga o _fbp');
    assert.strictEqual(env.scripts().length, 0);
  },

  'armazenamento quebrado não derruba o site'(edit) {
    const env = browser({ storageFails: true });
    const tracking = loadTracking(env, { edit });
    assert.strictEqual(tracking.getAdConsent(), null);
    assert.strictEqual(tracking.shouldAskAdConsent(), true);
    assert.doesNotThrow(() => tracking.setAdConsent('granted'), 'aceitar não lança erro sem armazenamento');
    assert.strictEqual(tracking.shouldAskAdConsent(), false, 'o aviso fecha nesta visita mesmo sem guardar');
    assert.strictEqual(env.scripts().length, 1, 'o aceite vale nesta visita');
    const refused = browser({ storageFails: true });
    const other = loadTracking(refused, { edit });
    assert.doesNotThrow(() => other.setAdConsent('denied'));
    assert.strictEqual(other.shouldAskAdConsent(), false);
    assert.strictEqual(refused.scripts().length, 0);
  },

  'app de loja não faz nada'(edit) {
    const native = load('utils/adTracking.js', { edit, env: browser({ saved: 'granted' }) });
    const env = browser({ saved: 'granted' });
    const web = loadTracking(env);
    const webFunctions = Object.keys(web).filter((name) => typeof web[name] === 'function').sort();
    assert.deepStrictEqual(
      Object.keys(native).filter((name) => typeof native[name] === 'function').sort(),
      webFunctions,
      'utils/adTracking.js precisa ter as mesmas funções da versão web (o Metro troca um pelo outro)'
    );
    const nativeEnv = browser({ saved: 'granted' });
    const nativeTracking = load('utils/adTracking.js', { edit, env: nativeEnv });
    nativeTracking.initAdTracking();
    nativeTracking.setAdConsent('granted');
    nativeTracking.trackSignup();
    nativeTracking.trackAppStoreClick();
    assert.strictEqual(nativeTracking.shouldAskAdConsent(), false, 'o app de loja nunca mostra o aviso');
    assert.strictEqual(nativeTracking.getAdConsent(), null);
    assert.strictEqual(nativeEnv.scripts().length, 0, 'o app de loja nunca injeta script');
    assert.strictEqual(nativeEnv.store.get(CONSENT_KEY), 'granted', 'o app de loja não grava nada');
    assert.strictEqual(nativeEnv.cookieWrites.length, 0);
  },

  'aviso de cookies: só na web, PT/EN, Recusar e Aceitar com o mesmo peso'(edit) {
    const render = ({ os = 'web', lang = 'pt', ask = true, state = { lang } } = {}) => {
      const react = fakeReact();
      const calls = [];
      const Banner = load('components/AdConsentBanner.js', {
        edit,
        mocks: {
          react: react.module,
          'react/jsx-runtime': jsxRuntime,
          'react-native': fakeNative(os),
          'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) },
          'context/AppContext': { useApp: () => ({ state }) },
          'utils/adTracking': { shouldAskAdConsent: () => ask, setAdConsent: (choice) => calls.push(choice) },
        },
      });
      return { tree: react.render(Banner.default), again: () => react.render(Banner.default), calls, inset: Banner.useAdConsentInset };
    };
    const pt = render();
    assert.ok(find(pt.tree, (node) => node.props.testID === 'ad-consent-banner'), 'aviso aparece na web sem escolha');
    // no fluxo, nunca por cima do conteúdo; publica a altura para o questionário subir e zera ao escolher
    assert.notStrictEqual(flatten(pt.tree.props.style).position, 'absolute', 'o aviso não pode cobrir a tela');
    assert.strictEqual(pt.inset(), 0);
    pt.tree.props.onLayout({ nativeEvent: { layout: { height: 117.4 } } });
    assert.strictEqual(pt.inset(), 118, 'a altura do aviso vai para as telas do questionário');
    const ptText = textOf(pt.tree);
    assert.match(ptText, /cookies de anúncio da Meta e do Google/);
    const link = find(pt.tree, (node) => node.props.testID === 'ad-consent-policy');
    assert.strictEqual(link.props.href, '/privacidade#cookies', 'link para a política em português');
    const decline = find(pt.tree, (node) => node.props.testID === 'ad-consent-decline');
    const accept = find(pt.tree, (node) => node.props.testID === 'ad-consent-accept');
    assert.strictEqual(textOf(decline), 'Recusar');
    assert.strictEqual(textOf(accept), 'Aceitar');
    const look = (node) => JSON.stringify(flatten(node.props.style({ pressed: false, focused: false })));
    assert.strictEqual(look(decline), look(accept), 'Recusar e Aceitar com o mesmo peso visual');
    assert.ok(flatten(accept.props.style({})).minHeight >= 44, 'alvo de toque');
    accept.props.onPress();
    assert.deepStrictEqual(pt.calls, ['granted']);
    assert.strictEqual(pt.again(), null, 'o aviso fecha depois de aceitar');
    assert.strictEqual(pt.inset(), 0, 'sem aviso, a tela volta à altura inteira');
    const refused = render();
    find(refused.tree, (node) => node.props.testID === 'ad-consent-decline').props.onPress();
    assert.deepStrictEqual(refused.calls, ['denied']);
    assert.strictEqual(refused.again(), null, 'o aviso fecha depois de recusar');

    const en = render({ lang: 'en' });
    assert.match(textOf(en.tree), /Meta and Google ad cookies/);
    assert.strictEqual(textOf(find(en.tree, (node) => node.props.testID === 'ad-consent-decline')), 'Decline');
    assert.strictEqual(textOf(find(en.tree, (node) => node.props.testID === 'ad-consent-accept')), 'Accept');
    assert.strictEqual(find(en.tree, (node) => node.props.testID === 'ad-consent-policy').props.href, '/privacy#cookies');

    assert.strictEqual(render({ ask: false }).tree, null, 'com escolha guardada o aviso não aparece');
    assert.strictEqual(render({ os: 'ios' }).tree, null, 'nunca no app de iPhone');
    assert.strictEqual(render({ os: 'android' }).tree, null, 'nunca no app Android');
    assert.strictEqual(render({ state: null }).tree, null, 'espera o idioma carregar');
  },

  'questionário sobe acima do aviso (nada de Continuar coberto)'(edit) {
    const screen = (os, inset) => {
      const react = fakeReact();
      const { OnbScreen } = load('screens/onboarding/onboardingUI.js', {
        edit,
        mocks: {
          react: react.module,
          'react/jsx-runtime': jsxRuntime,
          'react-native': { ...fakeNative(os), useWindowDimensions: () => ({ width: 390, height: 844 }) },
          '@expo/vector-icons': { Ionicons: 'Ionicons' },
          'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
          'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
          'components/AdConsentBanner': { useAdConsentInset: () => inset },
        },
      });
      return flatten(react.render(OnbScreen, { children: null }).props.style);
    };
    const web = screen('web', 118);
    assert.strictEqual(web.height, 844 - 118, 'com o aviso na tela, o questionário desconta a altura dele');
    assert.strictEqual(web.maxHeight, 844 - 118);
    assert.strictEqual(screen('web', 0).height, 844, 'sem aviso, altura inteira da janela');
    assert.deepStrictEqual(screen('ios', 118), { flex: 1 }, 'no app de loja nada muda');
  },

  'selo da App Store só no iPhone/iPad'(edit) {
    const render = ({ os = 'web', ua, touch = 0, lang = 'pt' } = {}) => {
      const react = fakeReact();
      const clicks = [];
      const env = { navigator: ua === undefined ? undefined : { userAgent: ua, maxTouchPoints: touch } };
      const mod = load('components/AppStoreBadge.js', {
        edit,
        env,
        mocks: {
          react: react.module,
          'react/jsx-runtime': jsxRuntime,
          'react-native': fakeNative(os),
          'context/AppContext': { useApp: () => ({ state: { lang } }) },
          'utils/adTracking': { trackAppStoreClick: () => clicks.push('AppStoreClick') },
        },
      });
      return { mod, tree: react.render(mod.default, { testID: 'selo', height: 48 }), clicks };
    };
    const { isIOSBrowser } = render({ ua: UA.iphoneSafari }).mod;
    const matrix = [
      ['iphoneSafari', 0, true],
      ['ipadLegacy', 0, true],
      ['ipadDesktopClass', 5, true],
      ['instagramIos', 0, true],
      ['facebookIos', 0, true],
      ['androidChrome', 0, false],
      ['instagramAndroid', 0, false],
      ['facebookAndroid', 0, false],
      ['macSafari', 0, false],
      ['windowsChrome', 0, false],
      ['windowsPhone', 0, false],
    ];
    for (const [name, touch, expected] of matrix) {
      assert.strictEqual(isIOSBrowser(UA[name], touch), expected, `detecção errada: ${name}`);
    }

    const iphone = render({ ua: UA.instagramIos });
    const link = find(iphone.tree, (node) => node.props.testID === 'selo');
    assert.ok(link, 'iPhone (navegador do Instagram) vê o selo');
    assert.strictEqual(link.props.href, APP_STORE_URL, 'link exato da ficha com ct=site_celeste');
    assert.strictEqual(link.props.hrefAttrs.target, '_blank', 'abre a loja sem derrubar o evento');
    assert.strictEqual(link.props.accessibilityRole, 'link');
    assert.strictEqual(link.props.accessibilityLabel, 'Baixar na App Store');
    const image = find(link, (node) => node.type === 'Image');
    assert.strictEqual(image.props.source.asset, 'assets/badges/app-store-pt-br.svg', 'selo oficial em português');
    assert.ok(image.props.style.height >= 40, 'Apple: altura mínima de 40 px na tela');
    assert.ok(Math.abs(image.props.style.width / image.props.style.height - 119.66407 / 40) < 0.02, 'proporção original');
    assert.ok(
      flatten(link.props.style({ pressed: false, focused: false })).padding >= image.props.style.height / 4,
      'Apple: área livre de 1/4 da altura'
    );
    link.props.onPress();
    assert.deepStrictEqual(iphone.clicks, ['AppStoreClick'], 'o toque registra o clique na loja');

    const english = render({ ua: UA.iphoneSafari, lang: 'en' });
    const englishLink = find(english.tree, (node) => node.props.testID === 'selo');
    assert.strictEqual(englishLink.props.accessibilityLabel, 'Download on the App Store');
    assert.strictEqual(find(englishLink, (node) => node.type === 'Image').props.source.asset, 'assets/badges/app-store-en-us.svg');

    assert.ok(render({ ua: UA.ipadDesktopClass, touch: 5 }).tree, 'iPad com iPadOS moderno vê o selo');
    for (const name of ['androidChrome', 'instagramAndroid', 'facebookAndroid', 'macSafari', 'windowsChrome']) {
      assert.strictEqual(render({ ua: UA[name] }).tree, null, `${name} não vê o selo`);
    }
    assert.strictEqual(render({ os: 'ios', ua: UA.iphoneSafari }).tree, null, 'o app de iPhone não mostra o selo');
    assert.strictEqual(render({ os: 'android', ua: UA.androidChrome }).tree, null, 'o app Android não mostra o selo');
    assert.strictEqual(render({ ua: undefined }).tree, null, 'sem navigator, sem selo');
  },

  'Entrar no Celeste dispara o Lead uma vez, só quando entrou'(edit) {
    const enter = async (entered) => {
      const react = fakeReact();
      const leads = [];
      let completions = 0;
      const Paywall = load('screens/onboarding/PaywallScreen.js', {
        edit,
        mocks: {
          react: react.module,
          'react/jsx-runtime': jsxRuntime,
          'react-native': fakeNative('web'),
          '@expo/vector-icons': { Ionicons: 'Ionicons' },
          'screens/onboarding/onboardingUI': { OnbScreen: 'OnbScreen' },
          'context/AppContext': {
            useApp: () => ({
              state: { lang: 'pt', manifestations: [] },
              completeOnboarding: async () => {
                completions += 1;
                return entered;
              },
            }),
          },
          'utils/adTracking': { trackSignup: () => leads.push('Lead') },
        },
      }).default;
      const tree = react.render(Paywall);
      const cta = find(tree, (node) => node.props.accessibilityLabel === 'Entrar no Celeste');
      assert.ok(cta, 'botão "Entrar no Celeste" do fim do cadastro');
      await Promise.all([cta.props.onPress(), cta.props.onPress()]); // toque duplo
      await new Promise((resolve) => setImmediate(resolve));
      return { leads, completions };
    };
    return (async () => {
      const ok = await enter(true);
      assert.strictEqual(ok.completions, 1, 'o toque duplo conclui uma vez');
      assert.deepStrictEqual(ok.leads, ['Lead'], 'um Lead quando a pessoa entra');
      const failed = await enter(false);
      assert.deepStrictEqual(failed.leads, [], 'sem Lead se a gravação falhou e a pessoa não entrou');
    })();
  },

  'CSP libera só Meta e Google, sem unsafe-inline em script'(_edit, vercel = JSON.parse(read('vercel.json'))) {
    const rule = vercel.headers.find((entry) => entry.source === '/(.*)');
    assert.ok(rule, 'cabeçalhos globais ausentes');
    const header = (key) => (rule.headers.find((entry) => entry.key === key) || {}).value;
    assert.strictEqual(header('X-Frame-Options'), 'DENY');
    assert.strictEqual(header('X-Content-Type-Options'), 'nosniff');
    assert.strictEqual(header('Referrer-Policy'), 'strict-origin-when-cross-origin');
    const csp = new Map(
      header('Content-Security-Policy')
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const [name, ...sources] = part.split(/\s+/);
          return [name, sources];
        })
    );
    assert.deepStrictEqual([...csp.keys()].sort(), Object.keys(CSP_EXPECTED).sort(), 'diretivas da CSP mudaram');
    for (const [directive, expected] of Object.entries(CSP_EXPECTED)) {
      assert.deepStrictEqual([...csp.get(directive)].sort(), [...expected].sort(), `CSP ${directive} fora do combinado`);
    }
    const script = csp.get('script-src');
    assert.ok(!script.some((source) => /unsafe-inline|unsafe-eval|unsafe-hashes|^\*$|^https?:$|^data:$/.test(source)), 'script-src frouxo');
    // os scripts que a medição injeta precisam caber na CSP
    const tracking = loadTracking(browser());
    for (const url of [tracking.META_SCRIPT_URL, ...(GOOGLE_ON ? [tracking.GOOGLE_SCRIPT_URL] : [])]) {
      assert.ok(script.includes(new URL(url).origin), `script-src não libera ${url}`);
    }
    if (!GOOGLE_ON) {
      assert.ok(!script.some((source) => /google|doubleclick/.test(source)), 'script-src libera o Google sem a tag do Google existir');
    }
  },

  'política dentro do app e Perfil (só na web) deixam rever ou retirar o aceite'() {
    const legal = read('constants/legal.js');
    assert.match(legal, /title: \{ en: 'Ad cookies on the website', pt: 'Cookies de anúncio no site' \}/, 'política do app sem a seção de cookies do site');
    assert.match(legal, /Os apps de iPhone e Android não usam esses cookies/, 'política do app precisa dizer que os apps não usam');
    const profile = read('screens/ProfileScreen.js');
    assert.match(
      profile,
      /\{Platform\.OS === 'web' \? \(\s*<LegalLink\s+testID="profile-ad-cookies-link"[\s\S]{0,600}?window\.location\.assign\('\/\?cookies=rever'\)/,
      'Perfil (só na web) precisa reabrir o aviso de cookies por /?cookies=rever'
    );
  },

  'política pública: seção de cookies em PT e EN e links do aviso'() {
    for (const [file, words] of [
      ['public/privacidade/index.html', ['Cookies de anúncio no site', 'Pixel da Meta', 'Google Ads', 'Aceitar', 'Recusar', 'não usa esses cookies']],
      ['public/privacy/index.html', ['Ad cookies on the website', 'Meta Pixel', 'Google Ads', 'Accept', 'Decline', 'do not use these cookies']],
    ]) {
      const html = read(file).replace(/\s+/g, ' ');
      assert.match(html, /id="cookies"/, `${file}: âncora #cookies (link do aviso) ausente`);
      for (const word of words) assert.ok(html.includes(word), `${file}: falta "${word}"`);
      assert.ok(html.includes('href="/?cookies=rever"'), `${file}: caminho para rever a escolha ausente`);
      assert.ok(html.includes('href="#cookies"'), `${file}: o resumo não aponta para a seção de cookies`);
    }
  },

  'tudo num lugar só: IDs, scripts e ligações nas telas'() {
    const appFiles = ['App.js'];
    const walkDir = (dir) =>
      fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).forEach((entry) => {
        const relative = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walkDir(relative);
        else if (entry.name.endsWith('.js')) appFiles.push(relative);
      });
    ['components', 'constants', 'context', 'screens', 'services', 'ui', 'utils'].forEach(walkDir);
    for (const file of appFiles) {
      const source = read(file);
      if (file !== 'constants/ads.js') assert.ok(!source.includes(PIXEL_ID), `${file}: ID do pixel fora de constants/ads.js`);
      if (file !== 'utils/adTracking.web.js') {
        assert.ok(!/connect\.facebook\.net|googletagmanager\.com|\bfbq\(|\bgtag\(/.test(source), `${file}: medição fora de utils/adTracking.web.js`);
      }
    }
    const jsx = (file) => {
      const found = [];
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(visit);
        if (node.type === 'JSXOpeningElement' && node.name.name) {
          const attrs = Object.fromEntries(
            node.attributes
              .filter((attr) => attr.type === 'JSXAttribute' && attr.value && attr.value.type === 'StringLiteral')
              .map((attr) => [attr.name.name, attr.value.value])
          );
          found.push({ name: node.name.name, attrs });
        }
        Object.keys(node).forEach((key) => key !== 'loc' && visit(node[key]));
      };
      visit(parser.parse(read(file), { sourceType: 'module', plugins: ['jsx'] }).program);
      return found;
    };
    assert.ok(jsx('App.js').some((el) => el.name === 'AdConsentBanner'), 'App.js não monta o aviso de cookies');
    assert.match(
      read('App.js'),
      /if \(Platform\.OS === 'web' && typeof document !== 'undefined'\) \{[^}]*initAdTracking\(\);/,
      'App.js precisa chamar initAdTracking só na web'
    );
    assert.ok(
      jsx('screens/onboarding/WelcomeScreen.js').some((el) => el.name === 'AppStoreBadge' && el.attrs.testID === 'app-store-badge-welcome'),
      'selo no primeiro contato do funil (boas-vindas)'
    );
    assert.ok(
      jsx('screens/HomeScreen.js').some((el) => el.name === 'AppStoreBadge' && el.attrs.testID === 'app-store-badge-home'),
      'selo discreto na Home'
    );
    // os portões que simulam quem já usa o app gravam a mesma chave da escolha (se ela mudar, mudam juntos)
    for (const file of ['scripts/qa-novos-recursos.js', 'scripts/auditoria-idiomas.js', 'scripts/e2e-anuncios-site.js']) {
      assert.ok(read(file).includes(CONSENT_KEY), `${file}: chave da escolha de cookies diferente da do app`);
    }
    // o modo compacto do questionário conta só o espaço acima do aviso
    for (const file of ['screens/onboarding/WelcomeScreen.js', 'screens/onboarding/ChatOnboardingScreen.js']) {
      assert.match(read(file), /useOnbHeight\(\)/, `${file}: modo compacto ignora o aviso de cookies`);
    }
    const ads = load('constants/ads.js');
    assert.strictEqual(ads.META_PIXEL_ID, PIXEL_ID);
    assert.strictEqual(ads.APP_STORE_URL, APP_STORE_URL);
    assert.strictEqual(typeof ads.GOOGLE_ADS_ID, 'string');
    for (const [file, hash] of Object.entries(OFFICIAL_BADGES)) {
      // fim de linha normalizado: o checkout no Windows (autocrlf) troca LF por CRLF sem mudar o selo
      const svg = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
      assert.strictEqual(
        crypto.createHash('sha256').update(svg).digest('hex'),
        hash,
        `${file} não é o selo oficial da Apple sem alteração`
      );
    }
  },
};

// ---------------------------------------------------------------- mutações: cada uma precisa reprovar
const TRACKING = 'utils/adTracking.web.js';
const mutations = [
  ['pixel carrega sem aceite', 'sem aceite nada carrega', { file: TRACKING, from: "if (!landing.reviewing && getAdConsent() === 'granted') start();", to: 'start();' }],
  ['Recusar carrega o pixel', 'recusar guarda a escolha e apaga cookies', { file: TRACKING, from: "if (value === 'granted') start();\n  else clearAdCookies();", to: 'start();' }],
  ['script inline no lugar de src', 'aceite carrega a Meta por script src e manda PageView', { file: TRACKING, from: 'script.src = src;', to: 'script.text = src;' }],
  ['autoConfig ligado (rótulos de botão vazam)', 'aceite carrega a Meta por script src e manda PageView', { file: TRACKING, from: "fbq('set', 'autoConfig', false, META_PIXEL_ID);", to: '' }],
  ['tag do Google carrega sem ID', 'aceite carrega a Meta por script src e manda PageView', { file: TRACKING, from: 'if (!GOOGLE_ADS_ID) return;', to: '' }],
  ['Lead repetido', 'Lead uma vez só e só com aceite', { file: TRACKING, from: '  if (leadSent) return;\n  if (started) sendLead();', to: '  if (started) sendLead();' }],
  ['Lead sem aceite', 'Lead uma vez só e só com aceite', { file: TRACKING, from: 'if (started) sendLead();\n  else leadPending = true;', to: 'sendLead();' }],
  ['Lead do cadastro antes do aceite some', 'Lead uma vez só e só com aceite', { file: TRACKING, from: 'if (leadPending) sendLead();', to: '' }],
  ['conversão do Google com dado inventado', 'Google só com ID: tag por script src, page_view e conversão do cadastro', { file: TRACKING, from: 'send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_SIGNUP_LABEL}`', to: 'send_to: GOOGLE_ADS_ID' }],
  ['fbclid perdido', 'clique do anúncio vai para o cookie de cada tag, antes do script', { file: TRACKING, from: 'if (landing.fbclid) {', to: 'if (false) {' }],
  ['clique gravado depois do script', 'clique do anúncio vai para o cookie de cada tag, antes do script', { file: TRACKING, from: '  saveAdClick();\n  startMeta();\n  startGoogle();', to: '  startMeta();\n  startGoogle();\n  saveAdClick();' }],
  ['recusa apaga só no host', 'recusar guarda a escolha e apaga cookies', { file: TRACKING, from: 'labels.slice(0, -1)', to: 'labels.slice(0, 1)' }],
  ['rever a escolha carrega o aceite antigo', 'rever a escolha reabre o aviso sem carregar nada', { file: TRACKING, from: '!landing.reviewing && ', to: '' }],
  ['aviso não fecha sem armazenamento', 'armazenamento quebrado não derruba o site', { file: TRACKING, from: 'answered = true;', to: '' }],
  ['app de loja mostra o aviso', 'app de loja não faz nada', { file: 'utils/adTracking.js', from: 'export function shouldAskAdConsent() {\n  return false;', to: 'export function shouldAskAdConsent() {\n  return true;' }],
  ['aviso aparece no app de loja', 'aviso de cookies: só na web, PT/EN, Recusar e Aceitar com o mesmo peso', { file: 'components/AdConsentBanner.js', from: "Platform.OS !== 'web' || ", to: '' }],
  ['Aceitar grava recusa', 'aviso de cookies: só na web, PT/EN, Recusar e Aceitar com o mesmo peso', { file: 'components/AdConsentBanner.js', from: "t(S.accept), 'granted'", to: "t(S.accept), 'denied'" }],
  ['aviso por cima do conteúdo', 'aviso de cookies: só na web, PT/EN, Recusar e Aceitar com o mesmo peso', { file: 'components/AdConsentBanner.js', from: 'flexShrink: 0,', to: "position: 'absolute', bottom: 0, left: 0, right: 0," }],
  ['altura do aviso não zera ao escolher', 'aviso de cookies: só na web, PT/EN, Recusar e Aceitar com o mesmo peso', { file: 'components/AdConsentBanner.js', from: 'setOpen(false);\n    publishHeight(0);', to: 'setOpen(false);' }],
  ['questionário ignora o aviso', 'questionário sobe acima do aviso (nada de Continuar coberto)', { file: 'screens/onboarding/onboardingUI.js', from: 'useWindowDimensions().height - useAdConsentInset()', to: 'useWindowDimensions().height' }],
  ['selo para todo mundo', 'selo da App Store só no iPhone/iPad', { file: 'components/AppStoreBadge.js', from: 'return /iPhone|iPad|iPod/i.test(ua) ||', to: 'return true ||' }],
  ['selo no app de loja', 'selo da App Store só no iPhone/iPad', { file: 'components/AppStoreBadge.js', from: "Platform.OS === 'web' &&", to: '' }],
  ['iPad moderno sem selo', 'selo da App Store só no iPhone/iPad', { file: 'components/AppStoreBadge.js', from: 'maxTouchPoints > 1', to: 'maxTouchPoints > 99' }],
  ['Lead mesmo sem entrar', 'Entrar no Celeste dispara o Lead uma vez, só quando entrou', { file: 'screens/onboarding/PaywallScreen.js', from: 'if (entered) {', to: 'if (true) {' }],
];
const CSP_CHECK = 'CSP libera só Meta e Google, sem unsafe-inline em script';
const cspMutation = (name, change) => [name, change];
const cspMutations = [
  cspMutation("'unsafe-inline' em script-src", (csp) => csp.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")),
  cspMutation('pixel da Meta bloqueado', (csp) => csp.replace(' https://connect.facebook.net', '')),
  cspMutation('evento da Meta bloqueado (img-src)', (csp) => csp.replace("blob: https://www.facebook.com", 'blob:')),
  cspMutation('beacon da Meta bloqueado (connect-src)', (csp) => csp.replace('wss://*.supabase.co https://www.facebook.com', 'wss://*.supabase.co')),
  // com a tag do Google: ela precisa caber; sem a tag: o Google não pode estar liberado
  GOOGLE_ON
    ? cspMutation('tag do Google bloqueada', (csp) => csp.replace("script-src 'self' https://connect.facebook.net https://www.googletagmanager.com", "script-src 'self' https://connect.facebook.net"))
    : cspMutation('Google liberado sem a tag', (csp) => csp.replace("script-src 'self' https://connect.facebook.net", "script-src 'self' https://connect.facebook.net https://www.google.com")),
  cspMutation('domínio a mais em script-src', (csp) => csp.replace("script-src 'self'", "script-src 'self' https://cdn.exemplo.com")),
  cspMutation('script-src aberto para qualquer https', (csp) => csp.replace("script-src 'self'", "script-src 'self' https:")),
  cspMutation('frame-ancestors aberto', (csp) => csp.replace("frame-ancestors 'none'", 'frame-ancestors *')),
];

async function main() {
  let passed = 0;
  for (const [name, check] of Object.entries(checks)) {
    await check();
    passed += 1;
    process.stdout.write(`  ok  ${name}\n`);
  }
  let killed = 0;
  const survive = async (label, run) => {
    try {
      await run();
    } catch (error) {
      if (error instanceof MutationNotApplied) throw error;
      killed += 1;
      const why = String((error && error.message) || error).split('\n')[0].slice(0, 110);
      process.stdout.write(`  mutação reprovada (bom): ${label} → ${why}\n`);
      return;
    }
    throw new Error(`MUTAÇÃO SOBREVIVEU — o portão não pega: ${label}`);
  };
  for (const [label, checkName, edit] of mutations) {
    await survive(label, () => checks[checkName](edit));
  }
  for (const [label, change] of cspMutations) {
    const vercel = JSON.parse(read('vercel.json'));
    const header = vercel.headers.find((entry) => entry.source === '/(.*)').headers.find((entry) => entry.key === 'Content-Security-Policy');
    const mutated = change(header.value);
    if (mutated === header.value) throw new MutationNotApplied(`mutação da CSP não aplicou: ${label}`);
    header.value = mutated;
    await survive(`CSP: ${label}`, () => checks[CSP_CHECK](null, vercel));
  }
  process.stdout.write(
    `Anúncios do site OK: ${passed} checagens e ${killed}/${mutations.length + cspMutations.length} mutações reprovadas.\n`
  );
}

main().catch((error) => {
  console.error(`❌ ANÚNCIOS DO SITE: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
