import { useEffect, useState } from 'react';

import { imageUriForCenaViva } from '../components/cenaViva/imageSource';
import { useApp } from '../context/AppContext';
import { acquirePersonalVisual } from '../services/personalVisualStorage';
import { pickReadyScene } from './readyScene';

// Imagem da cena viva de um conteúdo, só com enabled (null enquanto resolve): a pessoal (visualKey) quando ela abre;
// sem imagem pessoal — nunca gerada, ou o arquivo sumiu — a cena pronta das respostas (lugar dos sonhos × categoria).
// Enquanto a pessoal abre, nada (sem piscar a cena pronta antes). A imagem é pega aqui para esta chave e liberada
// quando a cena sai: no render em que o card da vez troca, nenhuma imagem de outra chave serve.
export function useCenaVivaImage({ visualKey, category, enabled }) {
  const { state } = useApp();
  const dreamLocation = state?.profile?.dreamLocation;
  const [sceneUri, setSceneUri] = useState(null);

  useEffect(() => {
    setSceneUri(null);
    if (!enabled) return undefined;
    let alive = true;
    let release = null;
    (async () => {
      const personal = visualKey ? await acquirePersonalVisual(visualKey).catch(() => null) : null;
      if (!alive) {
        if (personal) personal.release();
        return;
      }
      release = personal ? personal.release : null;
      const uri = await imageUriForCenaViva({
        personalUri: personal ? personal.uri : null,
        readyScene: pickReadyScene({ dreamLocation, category }),
      });
      if (alive) setSceneUri(uri);
    })().catch(() => {}); // sem cena: o card fica com a imagem parada
    return () => {
      alive = false;
      if (release) release();
    };
  }, [enabled, visualKey, dreamLocation, category]);

  return sceneUri;
}
