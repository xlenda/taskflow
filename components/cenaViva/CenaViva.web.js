import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SERIF } from '../../constants/brand';
import { installCenaViva } from './renderer';

// Site: <canvas> de verdade com o renderizador importado como módulo (o CSP script-src 'self' proíbe eval).
// O quadro tem o tamanho do vídeo (720 de largura) e o CSS só escala: o card é igual ao que ela compartilha.
const SIZES = { '4:5': [720, 900], '9:16': [720, 1280] };
const CANVAS_STYLE = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', objectFit: 'cover' };

// "Reduzir movimento" direto no matchMedia: o AccessibilityInfo do react-native-web guarda o ouvinte pelo texto
// da função, e vários cards com o mesmo handler removeriam o ouvinte um do outro
const reducedMotionQuery = () =>
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

// texto de reserva (a imagem não carregou): como a frase parada da cena, a fonte desce 5% por vez até caber em 5
// linhas na largura do card (no mínimo 60%); o numberOfLines corta com "…" se nem assim. O react-native-web não
// tem adjustsFontSizeToFit: mede com o próprio canvas da cena.
const FALLBACK_SIZE = 18;
const FALLBACK_PADDING = 20;
function fallbackFontSize(canvas, text, width) {
  const ctx = canvas && width > 0 ? canvas.getContext('2d') : null;
  if (!ctx) return FALLBACK_SIZE;
  const words = String(text).split(/\s+/).filter(Boolean);
  let size = FALLBACK_SIZE;
  for (let step = 0; step <= 8; step++) {
    size = Math.round(FALLBACK_SIZE * (1 - 0.05 * step) * 10) / 10;
    ctx.font = `italic ${size}px ${SERIF}`;
    const space = ctx.measureText(' ').width;
    let lines = 1;
    let used = 0;
    words.forEach((word) => {
      const wordWidth = ctx.measureText(word).width;
      if (used && used + space + wordWidth > width) {
        lines += 1;
        used = wordWidth;
      } else used += (used ? space : 0) + wordWidth;
    });
    if (lines <= 5) break;
  }
  return size;
}

// mode e phrase valem na criação: trocar imagem, frase, formato, modo ou movimento recria a cena (a intro
// recomeça). active=false = pôster parado (1º quadro, ou o quadro onde parou). caption, quando vier, substitui a
// frase e não recria nada. onReady(uri): a imagem que pintou. Imagem que não carrega: onError('image_error') e a
// frase fica em texto sobre o fundo.
export default function CenaViva({
  imageUri,
  phrase,
  format = '4:5',
  mode = 'loop',
  active = true,
  caption,
  reducedMotion,
  style,
  testID = 'cena-viva',
  onReady,
  onError,
}) {
  const canvasRef = useRef(null);
  const captionOn = useRef(null); // renderizador que tem a legenda por cima da frase (cena nova nasce com a frase)
  const handlers = useRef(null);
  handlers.current = { onReady, onError };
  const [systemStill, setSystemStill] = useState(() => {
    const query = reducedMotionQuery();
    return !!(query && query.matches);
  });
  const [renderer, setRenderer] = useState(null);
  const [failedUri, setFailedUri] = useState(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const still = !!reducedMotion || systemStill;
  const failed = !!imageUri && failedUri === imageUri;
  const [width, height] = SIZES[format] || SIZES['4:5'];

  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query) return undefined;
    const onChange = (event) => setSystemStill(!!event.matches);
    if (query.addEventListener) {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange); // Safari ≤ 13
    return () => query.removeListener(onChange);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!imageUri || !canvas) return undefined;
    let scene = null;
    const image = new window.Image();
    image.onload = () => {
      setFailedUri(null); // falha passageira: a mesma imagem carregou, o texto de reserva sai de cima da cena
      scene = installCenaViva(window).createRenderer(canvas, { image, phrase, format, mode, reducedMotion: still });
      scene.drawFrame(0);
      setRenderer(scene);
      if (handlers.current.onReady) handlers.current.onReady(imageUri); // a imagem deste efeito (a velha não chega aqui)
    };
    image.onerror = () => {
      setFailedUri(imageUri);
      if (handlers.current.onError) handlers.current.onError('image_error');
    };
    image.src = imageUri;
    return () => {
      image.onload = null;
      image.onerror = null;
      if (scene) scene.destroy();
      setRenderer(null);
    };
  }, [imageUri, phrase, format, mode, still]);

  const playing = !!renderer && active && !still;
  useEffect(() => {
    if (!renderer) return;
    if (playing) renderer.start();
    else renderer.stop();
  }, [renderer, playing]);

  // legenda com texto substitui a frase; vazia ou retirada depois de mostrada, a frase volta (tela = rótulo)
  const captionText = caption && caption.text && String(caption.text).trim() ? String(caption.text) : null;
  const captionProgress = captionText ? caption.progress : null;
  useEffect(() => {
    if (!renderer) return;
    if (captionText) {
      renderer.setCaption({ text: captionText, progress: captionProgress });
      captionOn.current = renderer;
    } else if (captionOn.current === renderer) {
      renderer.setCaption({ text: phrase || '', progress: 1 });
      captionOn.current = null;
    }
  }, [renderer, captionText, captionProgress]);

  // o texto está desenhado no canvas: o leitor de tela lê pelo rótulo
  const label = captionText || phrase || undefined;
  const fallbackSize = failed && label ? fallbackFontSize(canvasRef.current, label, boxWidth - 2 * FALLBACK_PADDING) : FALLBACK_SIZE;
  return (
    <View
      testID={testID}
      dataSet={{ active: String(playing) }}
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      onLayout={(event) => setBoxWidth(event.nativeEvent.layout.width)}
      style={[styles.frame, format === '9:16' ? styles.tall : styles.portrait, style]}
    >
      <canvas ref={canvasRef} width={width} height={height} aria-hidden="true" style={CANVAS_STYLE} />
      {failed && label ? (
        <View testID={`${testID}-reserva`} style={styles.fallbackBox}>
          <Text numberOfLines={5} style={[styles.fallback, { fontSize: fallbackSize }]}>
            {label}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// altura própria pelo formato (sem style o card não some); o style de quem chama vence
const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#1C2E4F' },
  portrait: { aspectRatio: 4 / 5 },
  tall: { aspectRatio: 9 / 16 },
  // texto de reserva ancorado embaixo, com respiro, sem cortar (até 5 linhas, fonte ajustada)
  fallbackBox: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    padding: FALLBACK_PADDING,
    justifyContent: 'flex-end',
    pointerEvents: 'none', // no react-native-web o prop pointerEvents é obsoleto: vai no style
  },
  fallback: { color: '#FFF9F0', fontFamily: SERIF, fontStyle: 'italic', textAlign: 'center' },
});
