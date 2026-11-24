// Permissão da assinatura (tabela D.2 do desenho). Vive só aqui, na memória: nunca entra no estado salvo
// nem no arquivo de exportar/importar. Site e Android não têm assinatura: `active` fixo, sem componente,
// sem efeito e sem chamada ao serviço de compras.
import React from 'react';
import { AppState } from 'react-native';

import { RELEASE_FEATURES } from '../constants/releaseFeatures';
import { configurePurchases, onEntitlementChange, readEntitlement } from '../services/purchases';
import { ENTITLEMENT_TIMEOUT_MS } from '../utils/entitlement';

const OPEN = Object.freeze({ status: 'active', refresh: async () => {}, setActive: () => {} });
const EntitlementContext = React.createContext(OPEN);

export function useEntitlement() {
  return React.useContext(EntitlementContext);
}

async function configureAndRead() {
  const ready = await configurePurchases();
  return ready && ready.ok === true ? readEntitlement() : ready;
}

// Uma consulta, com limite: loja ou rede calada vira `unavailable` (paywall com "Tentar de novo"),
// nunca `checking` para sempre. Só `active: true` vindo do serviço abre o app.
async function readStatus() {
  let timer;
  const limit = new Promise((resolve) => {
    timer = setTimeout(resolve, ENTITLEMENT_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([configureAndRead(), limit]);
    if (!result || result.ok !== true) return 'unavailable';
    return result.active === true ? 'active' : 'inactive';
  } catch {
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}

function SubscriptionProvider({ children }) {
  const [status, setStatus] = React.useState('checking');
  // Só a consulta mais nova decide. Compra concluída e aviso do RevenueCat são mais novos que qualquer
  // consulta em andamento, então também avançam o número.
  const latest = React.useRef(0);

  const check = React.useCallback(async (visible) => {
    const run = ++latest.current;
    if (visible) setStatus('checking');
    const next = await readStatus();
    if (run !== latest.current) return;
    // A consulta silenciosa (volta ao primeiro plano) não troca uma resposta certa por "sem resposta":
    // quem está no app com a permissão confirmada não é jogada no paywall por uma falha de rede.
    if (visible || next !== 'unavailable') setStatus(next);
    else setStatus((current) => (current === 'checking' ? 'unavailable' : current));
  }, []);

  React.useEffect(() => {
    check(true);
    const stopListening = onEntitlementChange((entitlement) => {
      latest.current += 1;
      setStatus(entitlement && entitlement.active === true ? 'active' : 'inactive');
    });
    let last = AppState.currentState;
    const foreground = AppState.addEventListener('change', (next) => {
      // sem tela de abertura aqui: `checking` desmontaria o app inteiro a cada volta
      if (next === 'active' && last !== 'active') check(false);
      last = next;
    });
    return () => {
      latest.current += 1;
      stopListening();
      foreground.remove();
    };
  }, [check]);

  const value = React.useMemo(
    () => ({
      status,
      refresh: () => check(true),
      setActive: () => {
        latest.current += 1;
        setStatus('active');
      },
    }),
    [status, check]
  );

  return React.createElement(EntitlementContext.Provider, { value }, children);
}

export const EntitlementProvider = RELEASE_FEATURES.subscription ? SubscriptionProvider : React.Fragment;
