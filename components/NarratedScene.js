import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import CenaViva from './cenaViva/CenaViva';

const RATIO = 4 / 5;

// Narração com cena viva: a imagem anda e o texto surge palavra por palavra no ritmo da voz (progress 0..1, de
// utils/captionProgress). A legenda mora no pé do quadro 4:5, então a cena entra INTEIRA no espaço que receber (a
// maior 4:5 que cabe, centrada): cortar o quadro cortaria as palavras. O CenaViva lê o texto todo para o leitor de
// tela e, se a imagem falhar ou a WebView desistir, mostra o próprio texto de reserva — nada aqui o esconde.
export default function NarratedScene({
  imageUri,
  text,
  progress,
  active = true,
  testID = 'narrated-scene',
  style,
  onReady,
  onError,
}) {
  const [box, setBox] = useState(null);
  const width = box ? Math.min(box.width, box.height * RATIO) : 0;
  return (
    <View
      testID={testID}
      dataSet={{ progress: String(Math.round((Number(progress) || 0) * 1000) / 1000) }}
      onLayout={(event) => setBox(event.nativeEvent.layout)}
      style={[styles.box, style]}
    >
      {width > 0 ? (
        <CenaViva
          imageUri={imageUri}
          caption={{ text, progress }}
          active={active}
          onReady={onReady}
          onError={onError}
          style={{ width, height: width / RATIO }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // toques passam para o card de fora (no react-native-web o prop pointerEvents é obsoleto: vai no style)
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' },
});
