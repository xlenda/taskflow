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

// mode e phrase valem na criação: trocar imagem, frase, formato, modo ou movimento recria a cena (a intro
// recomeça). active=false = pôster parado (1º quadro, ou o quadro onde parou). caption, quando vier, substitui a
// frase e não recria nada. Imagem que não carrega: onError('image_error') e a frase fica em texto sobre o fundo.
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
      scene = installCenaViva(window).createRenderer(canvas, { image, phrase, format, mode, reducedMotion: still });
      scene.drawFrame(0);
      setRenderer(scene);
      if (handlers.current.onReady) handlers.current.onReady();
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
  return (
    <View
      testID={testID}
      dataSet={{ active: String(playing) }}
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      style={[styles.frame, format === '9:16' ? styles.tall : styles.portrait, style]}
    >
      <canvas ref={canvasRef} width={width} height={height} aria-hidden="true" style={CANVAS_STYLE} />
      {failed && label ? <Text style={styles.fallback}>{label}</Text> : null}
    </View>
  );
}

// altura própria pelo formato (sem style o card não some); o style de quem chama vence
const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#1C2E4F' },
  portrait: { aspectRatio: 4 / 5 },
  tall: { aspectRatio: 9 / 16 },
  fallback: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    color: '#FFF9F0',
    fontFamily: SERIF,
    fontStyle: 'italic',
    fontSize: 18,
    lineHeight: 25,
    textAlign: 'center',
  },
});
