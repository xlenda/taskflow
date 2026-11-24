// Regra de acesso da assinatura do iPhone. Arquivo puro: só dados entram e saem daqui, para o portão
// (scripts/verificar-assinatura.js) provar cada linha sem aparelho nem loja.

export const ENTITLEMENT_ID = 'premium';
export const ENTITLEMENT_TIMEOUT_MS = 8000;

// Tela raiz (tabela D.2 do desenho). Fecha por padrão: com assinatura, só `active` abre o app.
export function accessFor({ subscription, onboarded, status }) {
  if (!onboarded) return 'onboarding';
  if (!subscription) return 'app';
  if (status === 'active') return 'app';
  if (status === 'checking') return 'checking';
  return 'paywall';
}

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function entitlementFromCustomerInfo(info, id = ENTITLEMENT_ID) {
  const active = info?.entitlements?.active;
  const found = active && typeof active === 'object' && hasOwn(active, id) ? active[id] : null;
  if (!found || found.isActive !== true) return { active: false, expiresAt: null, willRenew: false };
  return {
    active: true,
    expiresAt: typeof found.expirationDate === 'string' ? found.expirationDate : null,
    willRenew: found.willRenew === true,
  };
}

const PERIOD_BY_PACKAGE = { ANNUAL: 'year', MONTHLY: 'month', WEEKLY: 'week' };
const PERIOD_BY_ISO = { P1Y: 'year', P1M: 'month', P1W: 'week' };
const DAYS_BY_UNIT = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };

// Teste grátis só aparece quando a loja diz que a oferta é de graça E que esta pessoa tem direito.
function trialDaysOf(introPrice, eligible) {
  if (eligible !== true || !introPrice || introPrice.price !== 0) return 0;
  const unit = hasOwn(DAYS_BY_UNIT, introPrice.periodUnit) ? DAYS_BY_UNIT[introPrice.periodUnit] : 0;
  const count = introPrice.periodNumberOfUnits;
  return Number.isInteger(count) && count > 0 ? unit * count : 0;
}

// Só anual, mensal e semanal viram plano: a linha legal precisa dizer o período certo e que renova.
// Vitalício, trimestral ou outro pacote criado no painel do RevenueCat não aparece sem mudança de código.
export function planFromPackage(pkg, eligible) {
  const product = pkg?.product;
  const priceString = product?.priceString;
  if (typeof priceString !== 'string' || !priceString) return null;
  const period =
    (hasOwn(PERIOD_BY_PACKAGE, pkg.packageType) && PERIOD_BY_PACKAGE[pkg.packageType]) ||
    (hasOwn(PERIOD_BY_ISO, product.subscriptionPeriod) && PERIOD_BY_ISO[product.subscriptionPeriod]);
  if (!period) return null;
  return { id: pkg.identifier, period, priceString, trialDays: trialDaysOf(product.introPrice, eligible), pkg };
}

const DISCLOSURE = {
  pt: {
    per: { year: 'por ano', month: 'por mês', week: 'por semana' },
    trial: (days, price) => `${days} ${days === 1 ? 'dia' : 'dias'} grátis, depois ${price}.`,
    rest: 'Renova automaticamente até você cancelar. Cancele quando quiser em Ajustes > seu nome > Assinaturas, até 24 h antes da renovação.',
  },
  en: {
    per: { year: 'per year', month: 'per month', week: 'per week' },
    trial: (days, price) => `${days} ${days === 1 ? 'day' : 'days'} free, then ${price}.`,
    rest: 'Renews automatically until you cancel. Cancel anytime in Settings > your name > Subscriptions, up to 24 hours before renewal.',
  },
};

// Linha legal do paywall (Diretriz 3.1.2). Preço, período e dias vêm sempre de `plan`, nunca do código.
export function paywallDisclosure(plan, lang) {
  if (!plan || typeof plan.priceString !== 'string' || !plan.priceString) return '';
  const text = DISCLOSURE[lang === 'pt' ? 'pt' : 'en'];
  if (!hasOwn(text.per, plan.period)) return '';
  const price = `${plan.priceString} ${text.per[plan.period]}`;
  return `${plan.trialDays > 0 ? text.trial(plan.trialDays, price) : `${price}.`} ${text.rest}`;
}

// Chave pública do RevenueCat para a App Store. Recusa a de teste (test_) e a do Google (goog_).
export function isRevenueCatIosKey(value) {
  return typeof value === 'string' && /^appl_[A-Za-z0-9]{16,}$/.test(value);
}
