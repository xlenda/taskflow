const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const SDK = 'react-native-purchases';

// Babel nos arquivos do projeto. `stubs` troca um módulo pelo dublê (o SDK nativo não carrega no Node) e
// `fresh` devolve uma instância nova, para cada cenário começar sem estado.
function load(relative, { stubs = {}, fresh = false } = {}) {
  const originalJs = Module._extensions['.js'];
  const originalLoad = Module._load;
  Module._extensions['.js'] = (loaded, filename) => {
    if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
      originalJs(loaded, filename);
      return;
    }
    const code = transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      presets: ['babel-preset-expo'],
      sourceType: 'module',
    }).code;
    loaded._compile(code, filename);
  };
  Module._load = function patched(request, ...rest) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, ...rest);
  };
  const file = path.join(root, relative);
  if (fresh) delete require.cache[file];
  try {
    return require(file);
  } finally {
    Module._extensions['.js'] = originalJs;
    Module._load = originalLoad;
  }
}

// fim de linha do checkout (core.autocrlf=true grava CRLF no Windows)
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');
const exists = (relative) => fs.existsSync(path.join(root, relative));

// Promessa que nunca responde esvazia a fila e o Node sairia com 0, calado: sem o "ok" o portão cai.
let finished = false;
process.on('exit', () => {
  if (finished || process.exitCode) return;
  console.error('assinatura: o portão parou antes do fim (alguma espera nunca respondeu)');
  process.exitCode = 1;
});

async function main() {
  const {
    ENTITLEMENT_ID,
    ENTITLEMENT_TIMEOUT_MS,
    accessFor,
    entitlementFromCustomerInfo,
    isRevenueCatIosKey,
    paywallDisclosure,
    planFromPackage,
  } = load('utils/entitlement.js');

  assert.strictEqual(ENTITLEMENT_ID, 'premium');
  assert.strictEqual(ENTITLEMENT_TIMEOUT_MS, 8000);

  // ── accessFor: tabela D.2 do desenho ────────────────────────────────────────────────────────────
  const access = (subscription, onboarded, status) => accessFor({ subscription, onboarded, status });
  assert.strictEqual(access(false, false, undefined), 'onboarding', 'sem assinatura, sem entrada');
  assert.strictEqual(access(false, true, undefined), 'app', 'sem assinatura, entrada concluída');
  for (const status of ['checking', 'active', 'inactive', 'unavailable', undefined, 'qualquer']) {
    assert.strictEqual(access(true, false, status), 'onboarding', `com assinatura, sem entrada (${status})`);
  }
  assert.strictEqual(access(true, true, 'checking'), 'checking');
  assert.strictEqual(access(true, true, 'active'), 'app');
  assert.strictEqual(access(true, true, 'inactive'), 'paywall');
  assert.strictEqual(access(true, true, 'unavailable'), 'paywall', 'RevenueCat fora do ar nunca libera o app');
  assert.strictEqual(access(true, true, undefined), 'paywall', 'status ausente fecha');
  assert.strictEqual(access(true, true, 'qualquer'), 'paywall', 'status desconhecido fecha');
  assert.strictEqual(access(true, true, null), 'paywall');

  // ── entitlementFromCustomerInfo ─────────────────────────────────────────────────────────────────
  const entitlement = (id, extra = {}) => ({
    identifier: id,
    isActive: true,
    willRenew: true,
    expirationDate: '2026-12-01T10:00:00Z',
    ...extra,
  });
  const infoWith = (...items) => ({
    entitlements: { active: Object.fromEntries(items.map((item) => [item.identifier, item])) },
  });
  const INACTIVE = { active: false, expiresAt: null, willRenew: false };
  assert.deepStrictEqual(entitlementFromCustomerInfo(infoWith(entitlement('premium'))), {
    active: true,
    expiresAt: '2026-12-01T10:00:00Z',
    willRenew: true,
  });
  assert.deepStrictEqual(
    entitlementFromCustomerInfo(infoWith(entitlement('premium', { willRenew: false, expirationDate: null }))),
    { active: true, expiresAt: null, willRenew: false }
  );
  assert.deepStrictEqual(entitlementFromCustomerInfo(infoWith(entitlement('outra'))), INACTIVE);
  assert.deepStrictEqual(entitlementFromCustomerInfo(infoWith(entitlement('outra')), 'outra').active, true);
  assert.deepStrictEqual(entitlementFromCustomerInfo(infoWith(entitlement('premium', { isActive: false }))), INACTIVE);
  for (const torto of [null, undefined, {}, 'premium', 7, { entitlements: null }, { entitlements: { active: null } },
    { entitlements: { active: { premium: true } } }, { entitlements: { all: { premium: entitlement('premium') } } }]) {
    assert.deepStrictEqual(entitlementFromCustomerInfo(torto), INACTIVE, `info torto: ${JSON.stringify(torto)}`);
  }
  // nome de propriedade herdada não vira permissão
  assert.deepStrictEqual(entitlementFromCustomerInfo(infoWith(), 'constructor'), INACTIVE);

  // ── planFromPackage ─────────────────────────────────────────────────────────────────────────────
  const pkgOf = ({ type = 'ANNUAL', identifier = '$rc_annual', priceString = 'R$ 99,90', introPrice = null, ...rest }) => ({
    identifier,
    packageType: type,
    product: { identifier: 'celeste_premium_annual', priceString, introPrice, ...rest },
  });
  const freeIntro = (periodUnit, periodNumberOfUnits) => ({ price: 0, priceString: 'R$ 0,00', cycles: 1, periodUnit, periodNumberOfUnits });

  const annualDays = pkgOf({ introPrice: freeIntro('DAY', 7) });
  const annualPlan = planFromPackage(annualDays, true);
  assert.deepStrictEqual(annualPlan, { id: '$rc_annual', period: 'year', priceString: 'R$ 99,90', trialDays: 7, pkg: annualDays });
  assert.strictEqual(annualPlan.pkg, annualDays, 'o pacote original segue junto para a compra');
  assert.strictEqual(planFromPackage(pkgOf({ introPrice: freeIntro('WEEK', 1) }), true).trialDays, 7);
  assert.strictEqual(planFromPackage(pkgOf({ introPrice: freeIntro('MONTH', 1) }), true).trialDays, 30);
  assert.strictEqual(planFromPackage(pkgOf({ introPrice: freeIntro('YEAR', 1) }), true).trialDays, 365);
  assert.strictEqual(planFromPackage(pkgOf({ introPrice: freeIntro('DAY', 3) }), true).trialDays, 3);
  // sem direito confirmado não há teste na tela
  for (const eligible of [false, undefined, null, 'true', 1, 2]) {
    assert.strictEqual(planFromPackage(annualDays, eligible).trialDays, 0, `eligible ${String(eligible)}`);
  }
  // oferta introdutória paga não é teste grátis
  assert.strictEqual(planFromPackage(pkgOf({ introPrice: { ...freeIntro('DAY', 7), price: 0.99 } }), true).trialDays, 0);
  assert.strictEqual(planFromPackage(pkgOf({ introPrice: null }), true).trialDays, 0);
  assert.strictEqual(planFromPackage(pkgOf({ introPrice: freeIntro('UNKNOWN', 7) }), true).trialDays, 0);
  assert.strictEqual(planFromPackage(pkgOf({ introPrice: freeIntro('DAY', 0) }), true).trialDays, 0);
  assert.strictEqual(planFromPackage(pkgOf({ introPrice: freeIntro('DAY', '7') }), true).trialDays, 0);
  // sem preço da loja não há plano
  const semPreco = pkgOf({ introPrice: freeIntro('DAY', 7) });
  delete semPreco.product.priceString;
  assert.strictEqual(planFromPackage(semPreco, true), null);
  assert.strictEqual(planFromPackage(pkgOf({ priceString: null }), true), null);
  assert.strictEqual(planFromPackage(pkgOf({ priceString: '' }), true), null);
  assert.strictEqual(planFromPackage(pkgOf({ priceString: 99.9 }), true), null);
  for (const torto of [null, undefined, {}, { identifier: 'x' }, 'pacote']) {
    assert.strictEqual(planFromPackage(torto, true), null);
  }
  assert.strictEqual(planFromPackage(pkgOf({ type: 'MONTHLY', identifier: '$rc_monthly' }), false).period, 'month');
  assert.strictEqual(planFromPackage(pkgOf({ type: 'WEEKLY' }), false).period, 'week');
  assert.strictEqual(planFromPackage(pkgOf({ type: 'CUSTOM', subscriptionPeriod: 'P1Y' }), false).period, 'year');
  assert.strictEqual(planFromPackage(pkgOf({ type: 'CUSTOM', subscriptionPeriod: 'P1M' }), false).period, 'month');
  assert.strictEqual(planFromPackage(pkgOf({ type: 'CUSTOM', subscriptionPeriod: 'P1W' }), false).period, 'week');
  // pacote que a linha legal não sabe descrever (vitalício não renova; trimestral não é "por mês") não vira plano
  for (const type of ['LIFETIME', 'THREE_MONTH', 'SIX_MONTH', 'TWO_MONTH', 'UNKNOWN', 'CUSTOM', null]) {
    assert.strictEqual(planFromPackage(pkgOf({ type, introPrice: freeIntro('DAY', 7) }), true), null, `pacote ${type} não é oferecido`);
  }
  for (const subscriptionPeriod of ['P3M', 'P6M', 'P2M', '', null]) {
    assert.strictEqual(planFromPackage(pkgOf({ type: 'CUSTOM', subscriptionPeriod }), true), null, `período ${subscriptionPeriod}`);
  }

  // ── paywallDisclosure ───────────────────────────────────────────────────────────────────────────
  const WORDS = {
    pt: { year: 'por ano', month: 'por mês', week: 'por semana', days: '7 dias grátis', renew: 'Renova automaticamente',
      cancel: 'Ajustes > seu nome > Assinaturas', free: /gr[aá]tis/i },
    en: { year: 'per year', month: 'per month', week: 'per week', days: '7 days free', renew: 'Renews automatically',
      cancel: 'Settings > your name > Subscriptions', free: /free/i },
  };
  const semDigitosAlheios = (text, plan) => {
    let rest = text.split(plan.priceString).join('');
    if (plan.trialDays > 0) rest = rest.replace(new RegExp(`\\b${plan.trialDays}\\b`), '');
    rest = rest.replace(/\b24\b/, '');
    assert.ok(!/\d/.test(rest), `dígito que não veio do plano: ${text}`);
  };
  for (const lang of ['pt', 'en']) {
    const words = WORDS[lang];
    for (const [priceString, period] of [['R$ 99,90', 'year'], ['US$ 6.99', 'month'], ['R$ 9,90', 'week']]) {
      const withTrial = { id: 'x', period, priceString, trialDays: 7, pkg: {} };
      const text = paywallDisclosure(withTrial, lang);
      assert.ok(text.includes(words.days), `${lang}: dias do teste — ${text}`);
      assert.ok(text.includes(priceString), `${lang}: preço da loja — ${text}`);
      assert.ok(text.includes(words[period]), `${lang}: período — ${text}`);
      assert.ok(text.includes(words.renew), `${lang}: renovação automática — ${text}`);
      assert.ok(text.includes(words.cancel), `${lang}: caminho de cancelamento — ${text}`);
      assert.ok(text.includes('24'), `${lang}: prazo de 24 h — ${text}`);
      assert.ok(text.indexOf(words.days) < text.indexOf(priceString), `${lang}: o teste vem antes do preço`);
      semDigitosAlheios(text, withTrial);

      const noTrial = { ...withTrial, trialDays: 0 };
      const plain = paywallDisclosure(noTrial, lang);
      assert.ok(!words.free.test(plain), `${lang}: sem teste não fala em grátis — ${plain}`);
      assert.ok(plain.startsWith(priceString), `${lang}: sem teste a linha começa no preço — ${plain}`);
      for (const key of [period, 'renew', 'cancel']) assert.ok(plain.includes(words[key]), `${lang}: ${key} — ${plain}`);
      assert.ok(plain.includes('24'));
      semDigitosAlheios(plain, noTrial);
    }
    // outro número de dias vem do plano, não do texto
    const three = paywallDisclosure({ id: 'x', period: 'year', priceString: 'R$ 99,90', trialDays: 3, pkg: {} }, lang);
    assert.ok(/\b3\b/.test(three) && !/\b7\b/.test(three), `${lang}: dias vêm do plano — ${three}`);
  }
  assert.strictEqual(
    paywallDisclosure({ period: 'year', priceString: 'R$ 99,90', trialDays: 7 }, 'pt'),
    '7 dias grátis, depois R$ 99,90 por ano. Renova automaticamente até você cancelar. ' +
      'Cancele quando quiser em Ajustes > seu nome > Assinaturas, até 24 h antes da renovação.'
  );
  // idioma desconhecido cai no inglês, como o resto do app
  assert.strictEqual(
    paywallDisclosure({ period: 'month', priceString: '$6.99', trialDays: 0 }, 'fr'),
    paywallDisclosure({ period: 'month', priceString: '$6.99', trialDays: 0 }, 'en')
  );
  assert.strictEqual(paywallDisclosure(null, 'pt'), '', 'sem plano não há linha (e nenhum preço inventado)');
  for (const period of ['other', undefined, 'lifetime', 'constructor']) {
    for (const lang of ['pt', 'en']) {
      assert.strictEqual(paywallDisclosure({ period, priceString: 'R$ 99,90', trialDays: 7 }, lang), '', `período ${period}: sem linha vaga`);
    }
  }

  // ── isRevenueCatIosKey ──────────────────────────────────────────────────────────────────────────
  const TWENTY = 'AbCdEfGhIjKlMnOpQrSt';
  assert.strictEqual(isRevenueCatIosKey(`appl_${TWENTY}`), true);
  for (const bad of [`test_${TWENTY}`, `goog_${TWENTY}`, '', undefined, null, 'appl_', 'appl_curta', ` appl_${TWENTY}`,
    `appl_${TWENTY}\n`, `appl_${TWENTY}!`, [`appl_${TWENTY}`]]) {
    assert.strictEqual(isRevenueCatIosKey(bad), false, `chave recusada: ${JSON.stringify(bad)}`);
  }

  // ── Fronteira ───────────────────────────────────────────────────────────────────────────────────
  const pkg = JSON.parse(read('package.json'));
  assert.strictEqual(pkg.dependencies[SDK], '10.16.0', 'versão exata do SDK, sem ^ nem ~');
  assert.ok(!(pkg.devDependencies || {})[SDK]);
  const installed = JSON.parse(read(`node_modules/${SDK}/package.json`)).version;
  assert.strictEqual(installed, '10.16.0', 'node_modules tem a mesma versão que o package.json');
  assert.strictEqual(JSON.parse(read('package-lock.json')).packages[`node_modules/${SDK}`].version, '10.16.0');

  // só um arquivo do projeto fala com o SDK
  const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-trigger-check', '.expo', '.vercel', 'docs',
    '.superpowers', '.playwright-cli']);
  const ALLOWED = new Set(['services/purchases.ios.js', 'react-native.config.js', 'scripts/verificar-assinatura.js']);
  const mentions = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const relative = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(relative);
      } else if (/\.(js|jsx|ts|tsx|mjs|cjs)$/.test(entry.name) && !ALLOWED.has(relative) && read(relative).includes(SDK)) {
        mentions.push(relative);
      }
    }
  })('');
  assert.deepStrictEqual(mentions, [], `só services/purchases.ios.js pode citar ${SDK}`);
  assert.ok(read('services/purchases.ios.js').includes(`from '${SDK}'`));
  assert.ok(!read('services/purchases.js').includes(SDK), 'site e Android não importam o SDK');
  assert.ok(!/\b(import|require)\b/.test(read('services/purchases.js').replace(/^import \{[^}]*\} from '\.\.\/utils\/entitlement';\n/m, '')),
    'services/purchases.js não importa nada além da lógica pura');

  // o módulo nativo fica fora do Android
  delete require.cache[path.join(root, 'react-native.config.js')];
  const rnConfig = require(path.join(root, 'react-native.config.js'));
  assert.deepStrictEqual(rnConfig.dependencies[SDK], { platforms: { android: null } }, 'Android não liga o módulo nativo');

  // cada nome do SDK usado existe nos .d.ts instalados
  const iosSource = read('services/purchases.ios.js');
  const sdkTypes = read(`node_modules/${SDK}/dist/purchases.d.ts`);
  const internalDir = path.join(root, 'node_modules/@revenuecat/purchases-typescript-internal/dist');
  const internalTypes = ['offerings.d.ts', 'customerInfo.d.ts', 'errors.d.ts', 'generated/error-codes.d.ts']
    .map((file) => fs.readFileSync(path.join(internalDir, file), 'utf8'))
    .join('\n');
  const methods = [...new Set([...iosSource.matchAll(/\bPurchases\.([A-Za-z_]\w*)\(/g)].map((match) => match[1]))];
  assert.ok(methods.length >= 7, `métodos do SDK encontrados: ${methods.join(', ')}`);
  for (const name of methods) {
    assert.ok(new RegExp(`^\\s*static ${name}\\(`, 'm').test(sdkTypes), `Purchases.${name}( não existe no .d.ts instalado`);
  }
  const enums = [...iosSource.matchAll(/\bPurchases\.([A-Z][A-Z_]+)\.([A-Z][A-Z_]+)\b/g)];
  assert.ok(enums.length >= 3);
  for (const [, group, member] of enums) {
    assert.ok(new RegExp(`^\\s*static ${group}: typeof ${group};`, 'm').test(sdkTypes), `Purchases.${group} não existe no .d.ts`);
    const body = internalTypes.match(new RegExp(`export declare enum ${group} \\{[\\s\\S]*?\\n\\}`));
    assert.ok(body && new RegExp(`^\\s*${member} = `, 'm').test(body[0]), `${group}.${member} não existe no .d.ts`);
  }
  // campos lidos do pacote, do produto e da permissão existem nos tipos
  for (const field of ['priceString', 'introPrice', 'periodUnit', 'periodNumberOfUnits', 'packageType', 'subscriptionPeriod',
    'availablePackages', 'current', 'isActive', 'willRenew', 'expirationDate', 'entitlements', 'active', 'userCancelled']) {
    assert.ok(new RegExp(`^\\s*(readonly )?${field}\\??:`, 'm').test(internalTypes), `campo ${field} não existe nos .d.ts`);
  }

  assert.ok(!/\bthrow\b/.test(iosSource), 'services/purchases.ios.js nunca lança');
  assert.ok(!/\bthrow\b/.test(read('services/purchases.js')), 'services/purchases.js nunca lança');
  assert.ok(!/\b(import|require)\b/.test(read('utils/entitlement.js')), 'utils/entitlement.js é puro: não importa nada');
  assert.ok(iosSource.includes('process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY'));
  assert.ok(!/appl_[A-Za-z0-9]{16,}/.test(iosSource), 'nenhuma chave escrita no código');

  // ── Estado: a permissão não entra no estado salvo ───────────────────────────────────────────────
  assert.ok(!/entitlement|premium/i.test(read('context/AppContext.js')), 'AppContext não guarda a permissão');

  // ── services/purchases.js (site e Android): mesmas exportações, nada acontece ───────────────────
  const EXPORTS = ['buyPlan', 'configurePurchases', 'loadPlans', 'onEntitlementChange', 'purchasesSupported',
    'readEntitlement', 'restorePurchases'];
  const webService = (preview) => {
    if (preview === undefined) delete process.env.EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW;
    else process.env.EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW = preview;
    try {
      return load('services/purchases.js', { stubs: { 'expo/virtual/env': { env: process.env } }, fresh: true });
    } finally {
      delete process.env.EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW;
    }
  };
  const closed = webService();
  assert.deepStrictEqual(Object.keys(closed).sort(), EXPORTS);
  assert.strictEqual(closed.purchasesSupported, false);
  assert.deepStrictEqual(await closed.configurePurchases(), { ok: false, reason: 'unsupported' });
  assert.deepStrictEqual(await closed.readEntitlement(), { ok: false, reason: 'unsupported' });
  assert.deepStrictEqual(await closed.loadPlans(), { ok: false, reason: 'unavailable' });
  assert.deepStrictEqual(await closed.buyPlan(annualPlan), { ok: false, reason: 'failed' });
  assert.deepStrictEqual(await closed.restorePurchases(), { ok: false, reason: 'failed' });
  assert.strictEqual(typeof closed.onEntitlementChange(() => {}), 'function');
  assert.doesNotThrow(() => closed.onEntitlementChange(() => {})());
  // qualquer valor que não seja exatamente '1' deixa tudo fechado
  for (const value of ['0', '', 'true', '11', ' 1']) assert.strictEqual(webService(value).purchasesSupported, false, `prévia "${value}"`);

  // ── Prévia do paywall (D.7): planos de mentira, compra e restauração só na memória ──────────────
  {
    const preview = webService('1');
    assert.deepStrictEqual(Object.keys(preview).sort(), EXPORTS);
    assert.strictEqual(preview.purchasesSupported, true);
    assert.deepStrictEqual(await preview.configurePurchases(), { ok: true });
    assert.deepStrictEqual(await preview.readEntitlement(), { ok: true, ...INACTIVE });
    const loaded = await preview.loadPlans();
    assert.strictEqual(loaded.ok, true);
    assert.deepStrictEqual(loaded.plans.map((plan) => [plan.id, plan.period, plan.priceString, plan.preview]),
      [['$rc_annual', 'year', '0,00', true], ['$rc_monthly', 'month', '0,00', true]]);
    for (const plan of loaded.plans) assert.ok(paywallDisclosure(plan, 'pt').includes('0,00'), 'a linha legal aceita o plano de mentira');
    assert.deepStrictEqual(await preview.buyPlan(loaded.plans[0]), { ok: true, active: true });
    assert.strictEqual((await preview.readEntitlement()).active, true, 'a compra de mentira ativa em memória');
    const restored = webService('1');
    assert.strictEqual((await restored.readEntitlement()).active, false, 'nada fica guardado entre aberturas');
    assert.deepStrictEqual(await restored.restorePurchases(), { ok: true, active: true });
    assert.strictEqual((await restored.readEntitlement()).active, true);
    assert.doesNotThrow(() => restored.onEntitlementChange(() => {})());
  }

  // ── services/purchases.ios.js com dublê do SDK ──────────────────────────────────────────────────
  const real = require('@revenuecat/purchases-typescript-internal');
  const KEY = `appl_${TWENTY}`;
  const ELIGIBLE = { status: real.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE };
  const monthly = pkgOf({ type: 'MONTHLY', identifier: '$rc_monthly', priceString: 'R$ 19,90', introPrice: freeIntro('DAY', 7) });
  monthly.product.identifier = 'celeste_premium_monthly';
  const activeInfo = infoWith(entitlement('premium'));

  function ios(overrides = {}, key = KEY) {
    const calls = [];
    const listeners = [];
    const sdk = {
      INTRO_ELIGIBILITY_STATUS: real.INTRO_ELIGIBILITY_STATUS,
      PURCHASES_ERROR_CODE: real.PURCHASES_ERROR_CODE,
      configure: (config) => { calls.push(['configure', config]); },
      getCustomerInfo: async () => activeInfo,
      getOfferings: async () => ({ current: { availablePackages: [annualDays, monthly] } }),
      checkTrialOrIntroductoryPriceEligibility: async (ids) => {
        calls.push(['eligibility', ids]);
        return { celeste_premium_annual: ELIGIBLE, celeste_premium_monthly: { status: real.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_INELIGIBLE } };
      },
      purchasePackage: async (bought) => { calls.push(['purchase', bought]); return { customerInfo: activeInfo }; },
      restorePurchases: async () => activeInfo,
      addCustomerInfoUpdateListener: (listener) => { listeners.push(listener); },
      removeCustomerInfoUpdateListener: (listener) => listeners.splice(listeners.indexOf(listener), 1).length > 0,
      ...overrides,
    };
    if (key === null) delete process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    else process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = key;
    const service = load('services/purchases.ios.js', {
      // o Babel do Expo troca process.env.EXPO_PUBLIC_* por este módulo virtual
      stubs: { [SDK]: { __esModule: true, default: sdk }, 'expo/virtual/env': { env: process.env } },
      fresh: true,
    });
    return { service, calls, listeners };
  }
  const boom = () => { throw new Error('nativo indisponível'); };
  const rejects = async () => { throw new Error('sem rede'); };

  {
    const { service, calls } = ios();
    assert.deepStrictEqual(Object.keys(service).sort(), EXPORTS, 'as duas fronteiras exportam o mesmo');
    assert.strictEqual(service.purchasesSupported, true);
    assert.deepStrictEqual(await service.configurePurchases(), { ok: true });
    assert.deepStrictEqual(await service.configurePurchases(), { ok: true });
    assert.deepStrictEqual(calls, [['configure', { apiKey: KEY }]], 'configura uma vez só, com a chave do ambiente');
    assert.deepStrictEqual(await service.readEntitlement(), { ok: true, active: true, expiresAt: '2026-12-01T10:00:00Z', willRenew: true });

    const loaded = await service.loadPlans();
    assert.strictEqual(loaded.ok, true);
    assert.deepStrictEqual(loaded.plans.map(({ id, period, priceString, trialDays }) => ({ id, period, priceString, trialDays })), [
      { id: '$rc_annual', period: 'year', priceString: 'R$ 99,90', trialDays: 7 },
      // a loja diz que há teste, mas ela já usou: sem selo
      { id: '$rc_monthly', period: 'month', priceString: 'R$ 19,90', trialDays: 0 },
    ]);
    assert.deepStrictEqual(calls[1], ['eligibility', ['celeste_premium_annual', 'celeste_premium_monthly']]);
    assert.deepStrictEqual(await service.buyPlan(loaded.plans[0]), { ok: true, active: true });
    assert.strictEqual(calls[2][1], annualDays, 'compra o pacote original da loja');
    assert.deepStrictEqual(await service.restorePurchases(), { ok: true, active: true });
  }
  // chave ausente, de teste ou do Google: o SDK nem é chamado
  for (const key of [null, '', `test_${TWENTY}`, `goog_${TWENTY}`]) {
    const { service, calls } = ios({}, key);
    assert.deepStrictEqual(await service.configurePurchases(), { ok: false, reason: 'missing_key' }, `chave ${key}`);
    assert.deepStrictEqual(await service.readEntitlement(), { ok: false, reason: 'missing_key' });
    assert.deepStrictEqual(await service.loadPlans(), { ok: false, reason: 'unavailable' });
    assert.deepStrictEqual(await service.buyPlan(annualPlan), { ok: false, reason: 'failed' });
    assert.deepStrictEqual(await service.restorePurchases(), { ok: false, reason: 'failed' });
    assert.deepStrictEqual(calls, [], 'sem chave válida nada chega ao SDK');
  }
  {
    const { service } = ios({ configure: boom });
    assert.deepStrictEqual(await service.configurePurchases(), { ok: false, reason: 'configure_failed' });
    assert.deepStrictEqual(await service.readEntitlement(), { ok: false, reason: 'configure_failed' });
  }
  // nenhuma função lança, com o SDK inteiro quebrado (síncrono e assíncrono)
  for (const broken of [boom, rejects]) {
    const { service } = ios({
      getCustomerInfo: broken, getOfferings: broken, checkTrialOrIntroductoryPriceEligibility: broken,
      purchasePackage: broken, restorePurchases: broken, addCustomerInfoUpdateListener: boom, removeCustomerInfoUpdateListener: boom,
    });
    assert.deepStrictEqual(await service.readEntitlement(), { ok: false, reason: 'unavailable' });
    assert.deepStrictEqual(await service.loadPlans(), { ok: false, reason: 'unavailable' });
    assert.deepStrictEqual(await service.buyPlan(annualPlan), { ok: false, reason: 'failed' });
    assert.deepStrictEqual(await service.buyPlan(null), { ok: false, reason: 'failed' });
    assert.deepStrictEqual(await service.restorePurchases(), { ok: false, reason: 'failed' });
    let stop;
    assert.doesNotThrow(() => { stop = service.onEntitlementChange(() => {}); });
    assert.doesNotThrow(() => stop());
  }
  {
    // sem resposta sobre o direito ao teste: os planos aparecem, sem prometer teste
    const { service } = ios({ checkTrialOrIntroductoryPriceEligibility: rejects });
    const loaded = await service.loadPlans();
    assert.deepStrictEqual(loaded.plans.map((plan) => plan.trialDays), [0, 0]);
  }
  for (const offerings of [{ current: null }, { current: { availablePackages: [] } }, null,
    { current: { availablePackages: [pkgOf({ priceString: '' })] } },
    { current: { availablePackages: [pkgOf({ type: 'LIFETIME' }), pkgOf({ type: 'THREE_MONTH' })] } }]) {
    const { service } = ios({ getOfferings: async () => offerings });
    assert.deepStrictEqual(await service.loadPlans(), { ok: false, reason: 'no_products' });
  }
  {
    const cancelled = Object.assign(new Error('x'), { code: real.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR });
    const legacyCancelled = Object.assign(new Error('x'), { userCancelled: true });
    const pending = Object.assign(new Error('x'), { code: real.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR });
    const cases = [[cancelled, 'cancelled'], [legacyCancelled, 'cancelled'], [pending, 'pending'], [new Error('x'), 'failed'], [null, 'failed']];
    for (const [error, reason] of cases) {
      const { service } = ios({ purchasePackage: async () => { throw error; } });
      assert.deepStrictEqual(await service.buyPlan(annualPlan), { ok: false, reason });
    }
    // comprou mas a permissão não veio ativa: não libera
    const { service } = ios({ purchasePackage: async () => ({ customerInfo: infoWith(entitlement('outra')) }), restorePurchases: async () => ({}) });
    assert.deepStrictEqual(await service.buyPlan(annualPlan), { ok: true, active: false });
    assert.deepStrictEqual(await service.restorePurchases(), { ok: true, active: false });
  }
  {
    const { service, listeners } = ios();
    const seen = [];
    const stop = service.onEntitlementChange((value) => seen.push(value));
    assert.strictEqual(listeners.length, 1);
    listeners[0](activeInfo);
    listeners[0]({});
    assert.deepStrictEqual(seen, [{ active: true, expiresAt: '2026-12-01T10:00:00Z', willRenew: true }, INACTIVE]);
    stop();
    assert.strictEqual(listeners.length, 0, 'cancelar remove o mesmo ouvinte');
    // ouvinte que estoura não derruba o SDK
    service.onEntitlementChange(boom);
    assert.doesNotThrow(() => listeners[0](activeInfo));
  }

  // ── Limite de tempo: loja que nunca responde não deixa o paywall parado ─────────────────────────
  const never = () => new Promise(() => {});
  const tick = () => new Promise((resolve) => setImmediate(resolve));
  const realSetTimeout = global.setTimeout;
  const realClearTimeout = global.clearTimeout;
  const clock = { timers: [], cleared: [] };
  global.setTimeout = (fn, ms) => { const timer = { fn, ms }; clock.timers.push(timer); return timer; };
  global.clearTimeout = (timer) => { clock.cleared.push(timer); };
  const expire = async (index, label) => {
    await tick();
    assert.strictEqual(clock.timers.length, index + 1, `${label}: a espera tem limite de tempo`);
    assert.strictEqual(clock.timers[index].ms, ENTITLEMENT_TIMEOUT_MS, `${label}: limite de ${ENTITLEMENT_TIMEOUT_MS} ms`);
    clock.timers[index].fn();
  };
  const reset = () => { clock.timers.length = 0; clock.cleared.length = 0; };
  try {
    {
      const { service } = ios({ getOfferings: never });
      const pending = service.loadPlans();
      await expire(0, 'getOfferings');
      assert.deepStrictEqual(await pending, { ok: false, reason: 'unavailable' });
      assert.deepStrictEqual(clock.cleared, clock.timers, 'relógio desligado depois do estouro');
    }
    reset();
    {
      // só o direito ao teste não respondeu: os planos aparecem, sem teste
      const { service } = ios({ checkTrialOrIntroductoryPriceEligibility: never });
      const pending = service.loadPlans();
      await expire(1, 'direito ao teste');
      const loaded = await pending;
      assert.strictEqual(loaded.ok, true);
      assert.deepStrictEqual(loaded.plans.map((plan) => [plan.id, plan.trialDays]), [['$rc_annual', 0], ['$rc_monthly', 0]]);
      assert.deepStrictEqual(clock.cleared, clock.timers);
    }
    reset();
    {
      const { service } = ios({ restorePurchases: never });
      const pending = service.restorePurchases();
      await expire(0, 'restorePurchases');
      assert.deepStrictEqual(await pending, { ok: false, reason: 'failed' });
    }
    reset();
    {
      // resposta normal: cada relógio armado é desligado, nenhum fica pendurado
      const { service } = ios();
      assert.strictEqual((await service.loadPlans()).ok, true);
      assert.deepStrictEqual(await service.restorePurchases(), { ok: true, active: true });
      assert.strictEqual(clock.timers.length, 3);
      assert.deepStrictEqual(clock.cleared, clock.timers);
    }
    reset();
    {
      // a compra não tem limite: a folha da Apple fica aberta o tempo que ela precisar
      const { service } = ios({ purchasePackage: never });
      let settled = false;
      service.buyPlan(annualPlan).then(() => { settled = true; });
      await tick();
      assert.strictEqual(clock.timers.length, 0, 'buyPlan não arma relógio');
      assert.strictEqual(settled, false);
    }
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
  }

  assert.ok(exists('react-native.config.js'));

  // ── Tarefa 9: a assinatura só existe no iPhone (e na prévia do site) ────────────────────────────
  {
    const { releaseFeaturesForPlatform } = load('constants/releaseFeatures.js', {
      stubs: { 'react-native': { Platform: { OS: 'web' } }, 'expo/virtual/env': { env: process.env } },
      fresh: true,
    });
    assert.strictEqual(releaseFeaturesForPlatform('ios').subscription, true);
    assert.strictEqual(releaseFeaturesForPlatform('android').subscription, false);
    assert.strictEqual(releaseFeaturesForPlatform('web').subscription, false);
    assert.strictEqual(releaseFeaturesForPlatform('web', undefined, '1').subscription, true);
    assert.strictEqual(releaseFeaturesForPlatform('android', undefined, '1').subscription, false, 'a prévia nunca liga o Android');
    assert.strictEqual(releaseFeaturesForPlatform('android', '0', '1').subscription, false);
    assert.strictEqual(releaseFeaturesForPlatform('ios', undefined, '0').subscription, true);
    for (const value of ['0', '', 'true', 1, true]) {
      assert.strictEqual(releaseFeaturesForPlatform('web', undefined, value).subscription, false, `prévia ${JSON.stringify(value)}`);
    }
  }

  // ── Tarefa 9: portão único na raiz (App.js) ─────────────────────────────────────────────────────
  {
    const app = read('App.js');
    const start = app.indexOf('function RootNav()');
    const rootNav = app.slice(start, app.indexOf('const linking = {'));
    assert.ok(start > 0 && rootNav.length > 0, 'RootNav encontrado');
    assert.ok(rootNav.includes('const { status } = useEntitlement();'), 'RootNav lê a permissão do provedor');
    assert.ok(rootNav.includes('accessFor({ subscription: RELEASE_FEATURES.subscription, onboarded, status })'),
      'a tela raiz sai de accessFor');
    assert.ok(/if \(access === 'checking'\) return <AppBootState \/>;/.test(rootNav), 'consultando: tela de abertura, nunca tela branca');
    const screensOf = (source) => [...source.matchAll(/<Root\.Screen\s+name="([^"]+)"/g)].map((match) => match[1]);
    const branches = rootNav.match(/\{access === 'paywall' \? \(([\s\S]*?)\n {6}\) : access === 'app' \? \(([\s\S]*?)\n {6}\) : \(([\s\S]*?)\n {6}\)\}/);
    assert.ok(branches, 'RootNav tem os três ramos: paywall, app e entrada');
    assert.deepStrictEqual(screensOf(branches[1]), ['Paywall'], 'sem permissão, o navegador só tem o paywall');
    assert.ok(/<Root\.Screen\s+name="Paywall"\s+component=\{PaywallScreen\}\s+initialParams=\{\{ locked: true \}\}\s*\/>/.test(branches[1]),
      'o paywall de quem volta abre trancado');
    assert.ok(screensOf(branches[2]).includes('Main') && !screensOf(branches[2]).includes('Paywall'));
    assert.deepStrictEqual(screensOf(branches[3]), ['Welcome', 'Notifications', 'ChatOnboarding', 'Reveal', 'Paywall'],
      'a entrada continua como era');
    assert.strictEqual(screensOf(rootNav).filter((name) => name === 'Main').length, 1, 'Main só existe no ramo do app');
    assert.ok(/<EntitlementProvider>\s*<NavigationContainer linking=\{linking\}>\s*<RootNav \/>\s*<\/NavigationContainer>\s*<\/EntitlementProvider>/.test(app),
      'o provedor da permissão envolve a navegação');
  }

  // ── Tarefa 9: provedor da permissão, com React, relógio e serviço de mentira ────────────────────
  const fakeReact = () => {
    const slots = [];
    let cursor = 0;
    let dirty = false;
    let pending = [];
    const slot = (make) => { if (!slots[cursor]) slots[cursor] = make(); return slots[cursor++]; };
    const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
    const React = {
      Fragment: Symbol('Fragment'),
      useState(initial) {
        const state = slot(() => ({ value: initial }));
        state.set = state.set || ((next) => {
          const value = typeof next === 'function' ? next(state.value) : next;
          if (!Object.is(value, state.value)) { state.value = value; dirty = true; }
        });
        return [state.value, state.set];
      },
      useRef: (initial) => slot(() => ({ current: initial })),
      useMemo(make, deps) {
        const memo = slot(() => ({}));
        if (!same(memo.deps, deps)) Object.assign(memo, { value: make(), deps });
        return memo.value;
      },
      useCallback: (fn, deps) => React.useMemo(() => fn, deps),
      useEffect(effect, deps) {
        const hook = slot(() => ({}));
        if (same(hook.deps, deps)) return;
        hook.deps = deps;
        pending.push(() => { if (hook.cleanup) hook.cleanup(); hook.cleanup = effect(); });
      },
      createContext: (value) => ({ Provider: Symbol('Provider'), value }),
      useContext: (context) => context.value,
      createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    };
    React.default = React;
    const mount = (Component) => {
      let tree;
      const render = () => {
        do {
          dirty = false;
          cursor = 0;
          tree = Component({ children: 'filho' });
          const run = pending;
          pending = [];
          run.forEach((effect) => effect());
        } while (dirty);
      };
      render();
      const fresh = () => { if (dirty) render(); return tree.props.value; };
      return {
        value: fresh,
        status: () => fresh().status,
        unmount: () => slots.forEach((hook) => { if (hook && typeof hook.cleanup === 'function') hook.cleanup(); }),
      };
    };
    return { React, mount };
  };
  const entitlementContext = ({ subscription, service = {} }) => {
    const calls = [];
    const listeners = [];
    const appState = [];
    const purchases = {
      configurePurchases: async () => ({ ok: true }),
      readEntitlement: async () => ({ ok: true, active: true, expiresAt: null, willRenew: true }),
      onEntitlementChange: (listener) => {
        listeners.push(listener);
        return () => listeners.splice(listeners.indexOf(listener), 1);
      },
      ...service,
    };
    const logged = Object.fromEntries(Object.entries(purchases).map(([name, fn]) => [name, (...args) => { calls.push(name); return fn(...args); }]));
    const { React, mount } = fakeReact();
    const context = load('context/EntitlementContext.js', {
      stubs: {
        react: React,
        'react-native': {
          AppState: {
            currentState: 'active',
            addEventListener: (type, handler) => {
              assert.strictEqual(type, 'change');
              appState.push(handler);
              return { remove: () => appState.splice(appState.indexOf(handler), 1) };
            },
          },
        },
        '../constants/releaseFeatures': { RELEASE_FEATURES: { subscription } },
        '../services/purchases': logged,
      },
      fresh: true,
    });
    return { React, mount, context, calls, listeners, appState };
  };
  const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };
  const comeBack = (appState) => { appState[0]('background'); appState[0]('active'); };
  const reads = (calls) => calls.filter((call) => call === 'readEntitlement').length;

  {
    // site e Android: `active` fixo, nenhum componente, nenhum efeito, nenhuma chamada
    const { React, context, calls, appState } = entitlementContext({ subscription: false });
    assert.strictEqual(context.EntitlementProvider, React.Fragment, 'sem assinatura o provedor não é um componente');
    const open = context.useEntitlement();
    assert.strictEqual(open.status, 'active');
    await open.refresh();
    open.setActive();
    await settle();
    assert.strictEqual(context.useEntitlement().status, 'active');
    assert.deepStrictEqual(calls, [], 'sem assinatura, nenhuma chamada ao serviço de compras');
    assert.deepStrictEqual(appState, [], 'sem assinatura, ninguém escuta o primeiro plano');
  }

  global.setTimeout = (fn, ms) => { const timer = { fn, ms }; clock.timers.push(timer); return timer; };
  global.clearTimeout = (timer) => { clock.cleared.push(timer); };
  reset();
  try {
    {
      // iPhone com `premium` ativo: consulta, depois app
      const { mount, context, calls, listeners, appState } = entitlementContext({ subscription: true });
      const view = mount(context.EntitlementProvider);
      assert.strictEqual(view.status(), 'checking', 'começa consultando: nunca abre o app antes da resposta');
      assert.strictEqual(listeners.length, 1);
      assert.strictEqual(appState.length, 1);
      await settle();
      assert.strictEqual(view.status(), 'active');
      assert.deepStrictEqual(calls.filter((call) => call !== 'onEntitlementChange'), ['configurePurchases', 'readEntitlement'],
        'configura, depois lê a permissão');
      assert.strictEqual(clock.timers.length, 1);
      assert.strictEqual(clock.timers[0].ms, ENTITLEMENT_TIMEOUT_MS);
      assert.deepStrictEqual(clock.cleared, clock.timers, 'relógio desligado quando a resposta chega');
      assert.deepStrictEqual(Object.keys(view.value()).sort(), ['refresh', 'setActive', 'status']);
      view.unmount();
      assert.strictEqual(listeners.length + appState.length, 0, 'ao sair, os ouvintes são removidos');
    }
    reset();
    {
      // RevenueCat nunca responde: 8 s e vira `unavailable` (paywall com Tentar de novo), nunca preso em `checking`
      let answer = never;
      const { mount, context } = entitlementContext({ subscription: true, service: { readEntitlement: () => answer() } });
      const view = mount(context.EntitlementProvider);
      await settle();
      assert.strictEqual(view.status(), 'checking');
      await expire(0, 'permissão');
      await settle();
      assert.strictEqual(view.status(), 'unavailable');
      assert.strictEqual(accessFor({ subscription: true, onboarded: true, status: view.status() }), 'paywall');
      // "Tentar de novo": refaz tudo e mostra a consulta
      answer = async () => ({ ok: true, active: true });
      const again = view.value().refresh();
      assert.strictEqual(view.status(), 'checking');
      await again;
      assert.strictEqual(view.status(), 'active');
    }
    reset();
    {
      // configurar também tem limite
      const { mount, context, calls } = entitlementContext({ subscription: true, service: { configurePurchases: never } });
      const view = mount(context.EntitlementProvider);
      await expire(0, 'configuração');
      await settle();
      assert.strictEqual(view.status(), 'unavailable');
      assert.strictEqual(reads(calls), 0);
    }
    reset();
    for (const [label, service, expected, read] of [
      ['chave ausente', { configurePurchases: async () => ({ ok: false, reason: 'missing_key' }) }, 'unavailable', 0],
      ['sem resposta útil', { readEntitlement: async () => ({ ok: false, reason: 'unavailable' }) }, 'unavailable', 1],
      ['sem premium', { readEntitlement: async () => ({ ok: true, active: false }) }, 'inactive', 1],
      ['resposta torta', { readEntitlement: async () => ({ ok: true, active: 'sim' }) }, 'inactive', 1],
      ['resposta vazia', { readEntitlement: async () => undefined }, 'unavailable', 1],
      ['serviço estoura', { readEntitlement: async () => { throw new Error('x'); } }, 'unavailable', 1],
      ['configurar estoura', { configurePurchases: () => { throw new Error('x'); } }, 'unavailable', 0],
    ]) {
      const { mount, context, calls } = entitlementContext({ subscription: true, service });
      const view = mount(context.EntitlementProvider);
      await settle();
      assert.strictEqual(view.status(), expected, label);
      assert.strictEqual(reads(calls), read, `${label}: leitura`);
      assert.notStrictEqual(accessFor({ subscription: true, onboarded: true, status: view.status() }), 'app', label);
    }
    reset();
    {
      // compra concluída libera na hora; permissão vencida com o app aberto fecha na hora
      const { mount, context, listeners } = entitlementContext({
        subscription: true, service: { readEntitlement: async () => ({ ok: true, active: false }) },
      });
      const view = mount(context.EntitlementProvider);
      await settle();
      assert.strictEqual(view.status(), 'inactive');
      view.value().setActive();
      assert.strictEqual(view.status(), 'active');
      listeners[0]({ active: false, expiresAt: null, willRenew: false });
      assert.strictEqual(view.status(), 'inactive');
      listeners[0]({ active: true, expiresAt: null, willRenew: true });
      assert.strictEqual(view.status(), 'active');
    }
    reset();
    {
      // consulta antiga que chega depois da compra não derruba quem acabou de assinar
      let release;
      const { mount, context } = entitlementContext({
        subscription: true, service: { readEntitlement: () => new Promise((resolve) => { release = resolve; }) },
      });
      const view = mount(context.EntitlementProvider);
      await settle();
      view.value().setActive();
      release({ ok: true, active: false });
      await settle();
      assert.strictEqual(view.status(), 'active');
    }
    reset();
    {
      // voltar ao primeiro plano consulta de novo, sem trocar a tela pela de abertura
      let answer = async () => ({ ok: true, active: true });
      const { mount, context, calls, appState } = entitlementContext({ subscription: true, service: { readEntitlement: () => answer() } });
      const view = mount(context.EntitlementProvider);
      await settle();
      const before = reads(calls);
      appState[0]('inactive');
      appState[0]('background');
      assert.strictEqual(reads(calls), before, 'sair do app não consulta');
      answer = async () => ({ ok: true, active: false });
      appState[0]('active');
      assert.strictEqual(view.status(), 'active', 'a consulta ao voltar não mostra a tela de abertura');
      await settle();
      assert.strictEqual(reads(calls), before + 1);
      assert.strictEqual(view.status(), 'inactive', 'venceu enquanto estava fora: paywall');
      appState[0]('active');
      await settle();
      assert.strictEqual(reads(calls), before + 1, 'active repetido não consulta');
    }
    reset();
    {
      // voltou sem internet: quem estava com a permissão confirmada continua; quem estava no paywall continua nele
      for (const [first, kept] of [[true, 'active'], [false, 'inactive']]) {
        let answer = async () => ({ ok: true, active: first });
        const { mount, context, appState } = entitlementContext({ subscription: true, service: { readEntitlement: () => answer() } });
        const view = mount(context.EntitlementProvider);
        await settle();
        answer = async () => ({ ok: false, reason: 'unavailable' });
        comeBack(appState);
        await settle();
        assert.strictEqual(view.status(), kept);
      }
    }
    reset();
    {
      // voltar ao primeiro plano no meio da primeira consulta não deixa ninguém preso em `checking`
      const { mount, context, appState } = entitlementContext({ subscription: true, service: { readEntitlement: never } });
      const view = mount(context.EntitlementProvider);
      await settle();
      comeBack(appState);
      await settle();
      assert.strictEqual(view.status(), 'checking');
      assert.strictEqual(clock.timers.length, 2, 'cada consulta tem o próprio limite');
      for (const timer of clock.timers) timer.fn();
      await settle();
      assert.strictEqual(view.status(), 'unavailable');
    }
  } finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
  }

  // ── Tarefa 9: o deploy do site recusa a prévia do paywall ───────────────────────────────────────
  {
    const os = require('os');
    const { refusePaywallPreview } = require('./deploy-celeste-guards');
    const VAR = 'EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW';
    assert.strictEqual(typeof refusePaywallPreview, 'function', 'deploy-celeste-guards exporta refusePaywallPreview');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'celeste-previa-'));
    try {
      assert.strictEqual(refusePaywallPreview({}, folder), true);
      assert.strictEqual(refusePaywallPreview({ [VAR]: '0' }, folder), true);
      assert.strictEqual(refusePaywallPreview({ [VAR]: '' }, folder), true);
      for (const value of ['1', ' 1 ', 'true', 'sim']) {
        assert.throws(() => refusePaywallPreview({ [VAR]: value }, folder), /PAYWALL_PREVIEW/, `ambiente "${value}"`);
      }
      const cases = [
        ['.env', `${VAR}=1`, true], ['.env.local', `OUTRA=2\r\n${VAR}=1\r\n`, true], ['.env.production', `export ${VAR} = "1"`, true],
        ['.env.development.local', `  ${VAR}='1' # ligar`, true], ['.env.qualquer', `${VAR}=true`, true],
        ['.env', `${VAR}=0`, false], ['.env', `${VAR}=`, false], ['.env', `# ${VAR}=1`, false], ['.env', `OUTRA_${VAR}=1`, false],
        ['env.txt', `${VAR}=1`, false],
      ];
      for (const [name, content, refused] of cases) {
        const file = path.join(folder, name);
        fs.writeFileSync(file, content);
        if (refused) assert.throws(() => refusePaywallPreview({}, folder), (error) => error.message.includes(name), `${name}: ${content}`);
        else assert.strictEqual(refusePaywallPreview({}, folder), true, `${name}: ${content}`);
        fs.rmSync(file);
      }
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
    assert.strictEqual(refusePaywallPreview({}, root), true, 'nenhum .env* do projeto liga a prévia');
    const deploy = read('scripts/deploy-celeste.js');
    const mainAt = deploy.indexOf('async function main() {');
    const guardAt = deploy.indexOf('refusePaywallPreview(process.env, ROOT);', mainAt);
    const exportAt = deploy.indexOf("'export', '--platform', 'web'", mainAt);
    const firstReturnAt = deploy.indexOf("process.argv.includes('--validate-configuration')", mainAt);
    assert.ok(mainAt > 0 && exportAt > mainAt && firstReturnAt > mainAt, 'deploy-celeste.js: main e export encontrados');
    assert.ok(guardAt > mainAt && guardAt < exportAt, 'o deploy recusa a prévia antes do export');
    assert.ok(guardAt < firstReturnAt, 'a recusa da prévia vale para todos os modos do deploy');
  }

  finished = true;
  console.log('assinatura (logica, fronteira, portao na raiz e previa): ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
