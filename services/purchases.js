// Site e Android: sem assinatura. Mesmas exportações de services/purchases.ios.js, sem carregar o SDK
// de compras (o Metro nem leva o pacote para estas plataformas). Nada aqui estoura.
//
// Prévia (EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW=1, só em export local do site): planos de mentira para
// conferir a tela do paywall sem iPhone. Comprar e restaurar ativam só na memória desta aba, sem loja e
// sem cobrança. scripts/deploy-celeste.js recusa publicar com a variável ligada.

const PREVIEW = process.env.EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW === '1';
const PREVIEW_PLANS = [
  { id: '$rc_annual', period: 'year', priceString: '0,00', trialDays: 7, preview: true },
  { id: '$rc_monthly', period: 'month', priceString: '0,00', trialDays: 7, preview: true },
];

let previewActive = false;

export const purchasesSupported = PREVIEW;

export async function configurePurchases() {
  return PREVIEW ? { ok: true } : { ok: false, reason: 'unsupported' };
}

export async function readEntitlement() {
  if (!PREVIEW) return { ok: false, reason: 'unsupported' };
  return { ok: true, active: previewActive, expiresAt: null, willRenew: false };
}

export async function loadPlans() {
  return PREVIEW ? { ok: true, plans: PREVIEW_PLANS } : { ok: false, reason: 'unavailable' };
}

export async function buyPlan() {
  if (!PREVIEW) return { ok: false, reason: 'failed' };
  previewActive = true;
  return { ok: true, active: true };
}

export async function restorePurchases() {
  return buyPlan();
}

export function onEntitlementChange() {
  return () => {};
}
