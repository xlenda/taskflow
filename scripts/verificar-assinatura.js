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
  assert.strictEqual(planFromPackage(pkgOf({ type: 'LIFETIME' }), false).period, 'other');
  assert.strictEqual(planFromPackage(pkgOf({ type: 'CUSTOM', subscriptionPeriod: 'P1Y' }), false).period, 'year');
  assert.strictEqual(planFromPackage(pkgOf({ type: 'CUSTOM', subscriptionPeriod: 'P1M' }), false).period, 'month');
  assert.strictEqual(planFromPackage(pkgOf({ type: 'CUSTOM', subscriptionPeriod: 'P3M' }), false).period, 'other');

  // ── paywallDisclosure ───────────────────────────────────────────────────────────────────────────
  const WORDS = {
    pt: { year: 'por ano', month: 'por mês', days: '7 dias grátis', renew: 'Renova automaticamente',
      cancel: 'Ajustes > seu nome > Assinaturas', free: /gr[aá]tis/i },
    en: { year: 'per year', month: 'per month', days: '7 days free', renew: 'Renews automatically',
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
    for (const [priceString, period] of [['R$ 99,90', 'year'], ['US$ 6.99', 'month']]) {
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
  const closed = load('services/purchases.js');
  assert.deepStrictEqual(Object.keys(closed).sort(), EXPORTS);
  assert.strictEqual(closed.purchasesSupported, false);
  assert.deepStrictEqual(await closed.configurePurchases(), { ok: false, reason: 'unsupported' });
  assert.deepStrictEqual(await closed.readEntitlement(), { ok: false, reason: 'unsupported' });
  assert.deepStrictEqual(await closed.loadPlans(), { ok: false, reason: 'unavailable' });
  assert.deepStrictEqual(await closed.buyPlan(annualPlan), { ok: false, reason: 'failed' });
  assert.deepStrictEqual(await closed.restorePurchases(), { ok: false, reason: 'failed' });
  assert.strictEqual(typeof closed.onEntitlementChange(() => {}), 'function');
  assert.doesNotThrow(() => closed.onEntitlementChange(() => {})());

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
    { current: { availablePackages: [pkgOf({ priceString: '' })] } }]) {
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

  assert.ok(exists('react-native.config.js'));
  console.log('assinatura (logica e fronteira): ok');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
