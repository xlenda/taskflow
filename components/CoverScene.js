import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useCenaVivaImage } from '../utils/useCenaVivaImage';
import { useT } from '../utils/useT';
import CenaViva from './cenaViva/CenaViva';
import NarratedScene from './NarratedScene';

const S = {
  readyScene: { pt: 'Cena inspirada nas suas respostas', en: 'Scene inspired by your answers' },
};

// A camada viva de uma capa (GradientCover) ou do palco do player. Só monta quando a cena é querida, então só ela
// assina o estado do app. Parada: o CenaViva cobrindo tudo e, depois de pintar, o véu da capa por cima (o texto do
// card segue legível). Narrando: a NarratedScene com as palavras no ritmo da voz (imagem a caminho: as palavras por
// cima da capa; falha: o painel com o texto inteiro). Cena pronta na tela, depois de pintar: o rótulo honesto numa
// pílula escura — parada, no respiro do pé do card (abaixo do texto, nunca por cima); narrando, dentro do quadro 4:5
// da cena. Erro da cena ou imagem que não deu para preparar: onFailed (a capa volta à imagem parada). active=false: a
// cena parada vira pôster (o quadro onde parou), sem recarregar.
export default function CoverScene({ visualKey, sceneCategory, narration, active = true, veil, onFailed }) {
  const { t } = useT();
  const narrating = !!narration;
  // narrando, a cena anterior fica até a nova entrar (o player troca de imagem no meio da fala); parada, trocar de
  // conteúdo tira a anterior na hora
  const { uri, source, failed } = useCenaVivaImage({ visualKey, category: sceneCategory, keepPrevious: narrating });
  const [painted, setPainted] = useState(null); // a imagem que a cena parada já pintou
  const [brokenUri, setBrokenUri] = useState(null); // a cena desta imagem falhou

  useEffect(() => {
    if (failed && onFailed) onFailed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);
  // "pintou" vale para a cena parada desta montagem: narrando (a cena na tela é outra) ou sem imagem, ela sai; a que
  // voltar é página nova e só ganha véu e rótulo quando pintar
  useEffect(() => {
    if (narrating || !uri) setPainted(null);
  }, [narrating, uri]);

  const fail = () => {
    setBrokenUri(uri);
    if (onFailed) onFailed();
  };
  const showsReady = !!uri && !source && brokenUri !== uri;
  const label = (
    <Text allowFontScaling={false} style={styles.label}>
      {t(S.readyScene)}
    </Text>
  );

  if (narration) {
    // o rótulo vai para dentro da cena narrada: no quadro 4:5 que ela ocupa e só depois de pintar
    return (
      <NarratedScene
        imageUri={uri}
        failed={failed}
        text={narration.text}
        progress={narration.progress}
        active={narration.active}
        label={showsReady ? label : null}
        onError={fail}
        style={StyleSheet.absoluteFillObject}
      />
    );
  }
  if (!uri) return null;
  return (
    <>
      <CenaViva imageUri={uri} active={active} style={styles.scene} onReady={setPainted} onError={fail} />
      {painted === uri ? veil : null}
      {painted === uri && showsReady ? label : null}
    </>
  );
}

const styles = StyleSheet.create({
  // cobre o card inteiro: largura e altura explícitas vencem o 4:5 próprio do CenaViva; transparente até pintar
  // (por baixo continua a imagem parada ou o gradiente)
  scene: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'transparent' },
  // o menor respiro do pé das capas vivas é 15 px (cartão da Cena-Âncora na Home): o rótulo inteiro cabe nele (1 + 12
  // + 2 × 1) e não cresce com a fonte do aparelho (allowFontScaling), então nunca encosta na última linha do card; a
  // pílula escura garante a leitura sobre qualquer cena, e o right 14 o tira da curva do canto arredondado
  label: {
    position: 'absolute',
    right: 14,
    bottom: 1,
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 7,
    overflow: 'hidden',
    backgroundColor: 'rgba(8,16,28,0.5)',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    pointerEvents: 'none',
  },
});
