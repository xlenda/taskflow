// Fronteira com o RevenueCat. É o ÚNICO arquivo do projeto que fala com o SDK, e só o iPhone o carrega
// (site e Android usam services/purchases.js). Nenhuma função daqui estoura: todo erro vira
// { ok: false, reason }. Nomes do SDK conferidos nos .d.ts da versão instalada pelo portão.
import Purchases from 'react-native-purchases';

import {
  ENTITLEMENT_TIMEOUT_MS,
  entitlementFromCustomerInfo,
  isRevenueCatIosKey,
  planFromPackage,
} from '../utils/entitlement';

export const purchasesSupported = true;

let configured = false;

// Loja ou rede que não responde não pode deixar o paywall parado: a espera tem limite e vira erro tratado.
// A compra (buyPlan) fica de fora de propósito: a folha da Apple está aberta e quem decide o tempo é ela.
function within(promise) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ENTITLEMENT_TIMEOUT_MS);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

export async function configurePurchases() {
  if (configured) return { ok: true };
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!isRevenueCatIosKey(apiKey)) return { ok: false, reason: 'missing_key' };
  try {
    Purchases.configure({ apiKey });
    configured = true;
    return { ok: true };
  } catch {
    return { ok: false, reason: 'configure_failed' };
  }
}

export async function readEntitlement() {
  const ready = await configurePurchases();
  if (!ready.ok) return ready;
  try {
    return { ok: true, ...entitlementFromCustomerInfo(await Purchases.getCustomerInfo()) };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

// Direito ao teste por produto. Sem resposta da loja, ninguém tem direito: a tela não promete teste.
async function trialEligibility(packages) {
  try {
    const ids = packages.map((pkg) => pkg?.product?.identifier).filter(Boolean);
    return (await within(Purchases.checkTrialOrIntroductoryPriceEligibility(ids))) || {};
  } catch {
    return {};
  }
}

export async function loadPlans() {
  if (!(await configurePurchases()).ok) return { ok: false, reason: 'unavailable' };
  try {
    const offerings = await within(Purchases.getOfferings());
    const packages = offerings?.current?.availablePackages;
    if (!Array.isArray(packages) || !packages.length) return { ok: false, reason: 'no_products' };
    const eligibility = await trialEligibility(packages);
    const eligibleStatus = Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE;
    const plans = packages
      .map((pkg) => planFromPackage(pkg, eligibility[pkg?.product?.identifier]?.status === eligibleStatus))
      .filter(Boolean);
    return plans.length ? { ok: true, plans } : { ok: false, reason: 'no_products' };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function buyPlan(plan) {
  if (!plan?.pkg || !(await configurePurchases()).ok) return { ok: false, reason: 'failed' };
  try {
    const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
    return { ok: true, active: entitlementFromCustomerInfo(customerInfo).active };
  } catch (error) {
    try {
      // `userCancelled` é o campo antigo (marcado como obsoleto no .d.ts); o código é o que vale hoje.
      if (error?.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || error?.userCancelled === true) {
        return { ok: false, reason: 'cancelled' };
      }
      if (error?.code === Purchases.PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) return { ok: false, reason: 'pending' };
    } catch {
      // cai no motivo genérico
    }
    return { ok: false, reason: 'failed' };
  }
}

export async function restorePurchases() {
  if (!(await configurePurchases()).ok) return { ok: false, reason: 'failed' };
  try {
    return { ok: true, active: entitlementFromCustomerInfo(await within(Purchases.restorePurchases())).active };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

export function onEntitlementChange(listener) {
  const handler = (info) => {
    try {
      listener(entitlementFromCustomerInfo(info));
    } catch {
      // um ouvinte com defeito não pode derrubar o aviso do SDK
    }
  };
  try {
    Purchases.addCustomerInfoUpdateListener(handler);
  } catch {
    return () => {};
  }
  return () => {
    try {
      Purchases.removeCustomerInfoUpdateListener(handler);
    } catch {
      // já removido
    }
  };
}
