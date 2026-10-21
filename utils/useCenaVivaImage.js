import { useEffect, useRef, useState } from 'react';

import { imageUriForCenaViva } from '../components/cenaViva/imageSource';
import { useApp } from '../context/AppContext';
import { acquirePersonalVisual } from '../services/personalVisualStorage';
import { pickReadyScene } from './readyScene';

const NONE = { key: null, uri: null, source: null, failed: false };

// Imagem da cena viva de um conteúdo: { uri, source, failed }. A pessoal (visualKey) quando ela abre — source é a
// uri dela —; sem imagem pessoal (nunca gerada, ou o arquivo sumiu), a cena pronta das respostas (lugar dos sonhos ×
// categoria) e source null: quem mostra põe o rótulo honesto. Enquanto a pessoal abre, nada (sem piscar a cena
// pronta). Trocou de conteúdo: nada até a cena dele (o conteúdo anterior não fica na tela) — só com keepPrevious (a
// voz tocando, quando o player troca de imagem no meio da fala) a cena anterior fica até a nova entrar, sem buraco.
// A imagem pessoal anterior só é liberada quando a nova entra (pode ainda estar na tela). failed: não deu para
// preparar a imagem — quem mostra decide, nada fica calado.
// Só use dentro do que monta quando a cena é querida: este hook assina o estado do app.
export function useCenaVivaImage({ visualKey, category, keepPrevious = false }) {
  const { state } = useApp();
  const dreamLocation = state?.profile?.dreamLocation;
  const key = [visualKey, dreamLocation, category].join('|');
  const [scene, setScene] = useState(NONE);
  const held = useRef(null); // a imagem pessoal que a cena mostra agora

  useEffect(
    () => () => {
      if (held.current) held.current.release();
    },
    []
  );

  useEffect(() => {
    let alive = true;
    let personal = null;
    const show = (next) => {
      if (!alive) {
        if (personal) personal.release();
        return;
      }
      if (held.current) held.current.release();
      held.current = personal;
      setScene({ key, ...next });
    };
    (async () => {
      personal = visualKey ? await acquirePersonalVisual(visualKey).catch(() => null) : null;
      if (!alive) {
        if (personal) personal.release();
        return;
      }
      const uri = await imageUriForCenaViva({
        personalUri: personal ? personal.uri : null,
        readyScene: pickReadyScene({ dreamLocation, category }),
      });
      show({ uri, source: personal ? personal.uri : null, failed: false });
    })().catch(() => show({ uri: null, source: null, failed: true }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualKey, dreamLocation, category]);

  return keepPrevious || scene.key === key ? scene : NONE;
}
