import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

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
// frase e não recria nada.
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
}) {
  const canvasRef = useRef(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const [systemStill, setSystemStill] = useState(() => {
    const query = reducedMotionQuery();
    return !!(query && query.matches);
  });
  const [renderer, setRenderer] = useState(null);
  const still = !!reducedMotion || systemStill;
  const [width, height] = SIZES[format] || SIZES['4:5'];

  useEffect(() => {
    const query = reducedMotionQuery();
    if (!query || !query.addEventListener) return undefined; // Safari antigo: vale o valor inicial
    const onChange = (event) => setSystemStill(!!event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
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
      if (readyRef.current) readyRef.current();
    };
    image.src = imageUri;
    return () => {
      image.onload = null;
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

  const captionText = caption ? caption.text : null;
  const captionProgress = caption ? caption.progress : null;
  useEffect(() => {
    if (renderer && captionText != null) renderer.setCaption({ text: captionText, progress: captionProgress });
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
      style={[styles.frame, style]}
    >
      <canvas ref={canvasRef} width={width} height={height} aria-hidden="true" style={CANVAS_STYLE} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#1C2E4F' },
});
