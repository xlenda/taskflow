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
// card segue legível). Narrando: a NarratedScene com as palavras no ritmo da voz (sem imagem ainda, as palavras em
// texto). Cena pronta na tela (não a imagem dela): o rótulo honesto, pequeno, no respiro do pé — abaixo do texto do
// card, nunca por cima. Erro da cena ou imagem que não deu para preparar: onFailed (a capa volta à imagem parada).
export default function CoverScene({ visualKey, sceneCategory, narration, veil, onFailed }) {
  const { t } = useT();
  const { uri, source, failed } = useCenaVivaImage({ visualKey, category: sceneCategory });
  const [painted, setPainted] = useState(null); // a imagem que a cena parada já pintou
  const [brokenUri, setBrokenUri] = useState(null); // a cena desta imagem falhou

  useEffect(() => {
    if (failed && onFailed) onFailed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  const fail = () => {
    setBrokenUri(uri);
    if (onFailed) onFailed();
  };
  const showsReady = !!uri && !source && brokenUri !== uri;
  const label = <Text style={styles.label}>{t(S.readyScene)}</Text>;

  if (narration) {
    return (
      <>
        <NarratedScene
          imageUri={uri}
          text={narration.text}
          progress={narration.progress}
          active={narration.active}
          onError={fail}
          style={StyleSheet.absoluteFillObject}
        />
        {showsReady ? label : null}
      </>
    );
  }
  if (!uri) return null;
  return (
    <>
      <CenaViva imageUri={uri} style={styles.scene} onReady={setPainted} onError={fail} />
      {painted === uri ? veil : null}
      {painted === uri && showsReady ? label : null}
    </>
  );
}

const styles = StyleSheet.create({
  // cobre o card inteiro: largura e altura explícitas vencem o 4:5 próprio do CenaViva; transparente até pintar
  // (por baixo continua a imagem parada ou o gradiente)
  scene: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'transparent' },
  label: {
    position: 'absolute',
    right: 10,
    bottom: 5,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    pointerEvents: 'none',
  },
});
