import { initBotId } from 'botid/client/core';

let initialized = false;

export function initCelesteBotProtection() {
  if (initialized || typeof window === 'undefined') return;
  const hostname = window.location && window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return;
  initialized = true;
  initBotId({
    protect: [
      {
        path: '/api/gerar-cena',
        method: 'POST',
        advancedOptions: { checkLevel: 'basic' },
      },
      {
        path: '/api/traduzir-cena',
        method: 'POST',
        advancedOptions: { checkLevel: 'basic' },
      },
    ],
  });
}
