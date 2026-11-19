// No app de loja (iPhone e Android) não há pixel, tag nem aviso de cookies: a medição de anúncios é só do
// site (utils/adTracking.web.js). Estas versões vazias existem para as telas chamarem sem perguntar a plataforma.
export function initAdTracking() {}

export function getAdConsent() {
  return null;
}

export function shouldAskAdConsent() {
  return false;
}

export function setAdConsent() {}

export function trackSignup() {}

export function trackAppStoreClick() {}
