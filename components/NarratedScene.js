import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SERIF } from '../constants/brand';
import CenaViva from './cenaViva/CenaViva';

const RATIO = 4 / 5;

// Narração com cena viva: a imagem anda e o texto surge palavra por palavra no ritmo da voz (progress 0..1, de
// utils/captionProgress). A legenda mora no pé do quadro 4:5, então a cena entra INTEIRA no espaço que receber (a
// maior 4:5 que cabe, centrada): cortar o quadro cortaria as palavras. O CenaViva lê o texto todo para o leitor de
// tela. Sem imagem (ainda abrindo, ou nenhuma possível) ou com a cena falhando (imagem quebrada, WebView que
// desistiu), o texto INTEIRO aparece aqui mesmo, com rolagem e contraste — a reserva do CenaViva corta histórias
// longas em 5 linhas — e quem chama continua sabendo do erro.
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
  const [failedUri, setFailedUri] = useState(null);
  const asText = !imageUri || failedUri === imageUri; // imagem nova (a pronta no lugar da quebrada): a cena volta
  const width = box ? Math.min(box.width, box.height * RATIO) : 0;
  return (
    <View
      testID={testID}
      dataSet={{ progress: String(Math.round((Number(progress) || 0) * 1000) / 1000) }}
      onLayout={(event) => setBox(event.nativeEvent.layout)}
      style={[styles.box, asText && styles.boxWithText, style]}
    >
      {asText ? (
        <ScrollView style={styles.textBox} contentContainerStyle={styles.textContent}>
          <Text style={styles.text}>{text}</Text>
        </ScrollView>
      ) : width > 0 ? (
        <CenaViva
          imageUri={imageUri}
          caption={{ text, progress }}
          active={active}
          onReady={onReady}
          onError={(code) => {
            setFailedUri(imageUri);
            if (onError) onError(code);
          }}
          style={{ width, height: width / RATIO }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // toques passam para o card de fora (no react-native-web o prop pointerEvents é obsoleto: vai no style)
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' },
  boxWithText: { pointerEvents: 'auto' }, // o texto rola: aqui o toque fica
  textBox: { alignSelf: 'stretch', flex: 1, backgroundColor: 'rgba(8,16,28,0.86)' },
  textContent: { padding: 20, flexGrow: 1, justifyContent: 'center' },
  text: { color: '#FFF9F0', fontFamily: SERIF, fontStyle: 'italic', fontSize: 17, lineHeight: 26 },
});
