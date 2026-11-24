// Site e Android: sem assinatura. Mesmas exportações de services/purchases.ios.js, sem carregar o SDK
// de compras (o Metro nem leva o pacote para estas plataformas). Nada aqui estoura.

export const purchasesSupported = false;

export async function configurePurchases() {
  return { ok: false, reason: 'unsupported' };
}

export async function readEntitlement() {
  return { ok: false, reason: 'unsupported' };
}

export async function loadPlans() {
  return { ok: false, reason: 'unavailable' };
}

export async function buyPlan() {
  return { ok: false, reason: 'failed' };
}

export async function restorePurchases() {
  return { ok: false, reason: 'failed' };
}

export function onEntitlementChange() {
  return () => {};
}
