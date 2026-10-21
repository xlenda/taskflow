import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { SERIF } from '../constants/brand';
import CenaViva from './cenaViva/CenaViva';

const RATIO = 4 / 5;

// Narração com cena viva: a imagem anda e o texto surge palavra por palavra no ritmo da voz (progress 0..1, de
// utils/captionProgress). A legenda mora no pé do quadro 4:5, então a cena entra INTEIRA no espaço que receber (a
// maior 4:5 que cabe, centrada): cortar o quadro cortaria as palavras. O CenaViva lê o texto todo para o leitor de
// tela. Sem imagem ainda (a caminho), o texto INTEIRO por cima da capa que já está ali, claro e com sombra como o
// texto do card; só numa falha de verdade (failed: não deu para preparar a imagem, ou a cena quebrou — imagem
// quebrada, WebView que desistiu) o painel escuro com o texto inteiro — a reserva do CenaViva corta histórias longas
// em 5 linhas — e quem chama continua sabendo do erro. O texto sempre rola, inclusive dentro da tela que rola.
// label: o rótulo da cena pronta, dentro do quadro 4:5 visível, depois de a cena pintar.
export default function NarratedScene({
  imageUri,
  failed = false,
  text,
  progress,
  active = true,
  label,
  testID = 'narrated-scene',
  style,
  onReady,
  onError,
}) {
  const [box, setBox] = useState(null);
  const [failedUri, setFailedUri] = useState(null);
  const [paintedUri, setPaintedUri] = useState(null);
  // imagem nova (a pronta no lugar da quebrada): a cena volta
  const broken = failed || (!!imageUri && failedUri === imageUri);
  const asText = broken || !imageUri;
  const width = box ? Math.min(box.width, box.height * RATIO) : 0;
  const height = width / RATIO;
  return (
    <View
      testID={testID}
      dataSet={{ progress: String(Math.round((Number(progress) || 0) * 1000) / 1000) }}
      onLayout={(event) => setBox(event.nativeEvent.layout)}
      style={[styles.box, asText && styles.boxWithText, style]}
    >
      {asText ? (
        // nestedScrollEnabled: no Android a rolagem aninhada vem desligada e o texto não rolaria dentro da tela
        <ScrollView
          nestedScrollEnabled
          style={[styles.textBox, broken && styles.panel]}
          contentContainerStyle={styles.textContent}
        >
          <Text style={[styles.text, !broken && styles.overCover]}>{text}</Text>
        </ScrollView>
      ) : width > 0 ? (
        <>
          <CenaViva
            imageUri={imageUri}
            caption={{ text, progress }}
            active={active}
            onReady={(uri) => {
              setPaintedUri(uri);
              if (onReady) onReady(uri);
            }}
            onError={(code) => {
              setFailedUri(imageUri);
              if (onError) onError(code);
            }}
            style={{ width, height }}
          />
          {label && paintedUri === imageUri ? (
            <View
              style={[styles.labelSpot, { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height }]}
            >
              {label}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // toques passam para o card de fora (no react-native-web o prop pointerEvents é obsoleto: vai no style)
  box: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', pointerEvents: 'none' },
  boxWithText: { pointerEvents: 'auto' }, // o texto rola: aqui o toque fica
  textBox: { alignSelf: 'stretch', flex: 1 },
  panel: { backgroundColor: 'rgba(8,16,28,0.86)' },
  textContent: { padding: 20, flexGrow: 1, justifyContent: 'center' },
  text: { color: '#FFF9F0', fontFamily: SERIF, fontStyle: 'italic', fontSize: 17, lineHeight: 26 },
  // sobre a capa (imagem parada ou gradiente, com o véu): como o texto claro do próprio card
  overCover: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(3,9,18,0.62)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  labelSpot: { position: 'absolute', pointerEvents: 'none' },
});
