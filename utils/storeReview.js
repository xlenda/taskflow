import { Platform } from 'react-native';
import * as StoreReview from 'expo-store-review';

// Pedido de avaliação só pela API nativa da loja (Google In-App Review e
// App Store 5.6.1): sem pergunta antes, sem botão próprio, sem prova social.
// Uma vez por instalação e nunca antes de a Cena-Âncora ter sido aberta. A loja
// decide se mostra a janela; qualquer falha vira 'skipped' e nada muda no fluxo.
let askedThisSession = false; // toque duplo ainda enxerga o estado antigo

export async function maybeRequestStoreReview({ state, markRequested } = {}) {
  try {
    if (Platform.OS !== 'android' && Platform.OS !== 'ios') return 'skipped';
    if (askedThisSession || !state || state.storeReviewRequestedAt) return 'skipped';
    const anchor = (state.manifestations || []).find(
      (item) => item && item.id === state.anchorSceneId
    );
    if (!anchor || !anchor.anchorOpenedAt) return 'skipped';
    askedThisSession = true;
    if (!(await StoreReview.isAvailableAsync())) return 'skipped';
    markRequested();
    await StoreReview.requestReview();
    return 'requested';
  } catch (_error) {
    return 'skipped';
  }
}
