import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { CENA_VIVA_RENDERER_SOURCE } from './rendererSource.generated';

// App: o MESMO renderizador do site (fonte gerada, sem Babel) roda numa WebView com HTML inline; a imagem chega
// como data URI (imageUriForCenaViva). Página → app: { type: 'ready' }; app → página: window.cenaVivaCommand(...)
const SIZES = { '4:5': [720, 900], '9:16': [720, 1280] };

// JSON dentro de <script>: "<" escapado, nenhuma frase fecha a tag
export const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

export function cenaVivaHtml(body, script) {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">' +
    '<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}' +
    'canvas{position:fixed;left:0;top:0;width:100%;height:100%;object-fit:cover}</style></head>' +
    `<body>${body}<script>${CENA_VIVA_RENDERER_SOURCE}</script><script>${script}</script></body></html>`
  );
}

// cada página ganha um número: a WebView é a mesma quando as props mudam, e um 'ready' atrasado da página velha
// não pode liberar comandos para a nova antes de ela ter renderizador
let pages = 0;

function sceneHtml({ id, image, phrase, format, mode, reducedMotion }) {
  const [width, height] = SIZES[format] || SIZES['4:5'];
  return cenaVivaHtml(
    `<canvas id="c" width="${width}" height="${height}"></canvas>`,
    `(function () {
  var send = function (message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); };
  var options = ${scriptJson({ phrase, format, mode, reducedMotion })};
  var renderer = null;
  var image = new Image();
  image.onload = function () {
    options.image = image;
    renderer = window.CenaViva.createRenderer(document.getElementById('c'), options);
    renderer.drawFrame(0);
    send({ type: 'ready', id: ${id} });
  };
  image.onerror = function () { send({ type: 'error', code: 'image_error' }); };
  window.cenaVivaCommand = function (command) {
    if (!renderer) return;
    if ('active' in command) {
      if (command.active) renderer.start();
      else renderer.stop();
    }
    if (command.caption) renderer.setCaption(command.caption);
  };
  image.src = ${scriptJson(image)};
})();`
  );
}

// mode e phrase valem na criação: trocar imagem, frase, formato, modo ou movimento recarrega a página (a intro
// recomeça). active e caption vão por comando, sem recarregar. active=false = pôster parado.
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
  const webRef = useRef(null);
  const [systemStill, setSystemStill] = useState(null); // null: o aparelho ainda não respondeu
  const [readyId, setReadyId] = useState(0);
  const still = !!reducedMotion || !!systemStill;
  const known = !!reducedMotion || systemStill !== null;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setSystemStill(!!value))
      .catch(() => alive && setSystemStill(false));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => setSystemStill(!!value));
    return () => {
      alive = false;
      if (subscription && subscription.remove) subscription.remove();
    };
  }, []);

  // sem saber o "reduzir movimento" a página não nasce: nasceria animada e recarregaria parada
  const page = useMemo(() => {
    if (!imageUri || !known) return null;
    pages += 1;
    return { id: pages, html: sceneHtml({ id: pages, image: imageUri, phrase, format, mode, reducedMotion: still }) };
  }, [imageUri, phrase, format, mode, still, known]);
  const ready = !!page && readyId === page.id;
  const playing = ready && active && !still;
  const send = (command) => {
    if (webRef.current) webRef.current.injectJavaScript(`window.cenaVivaCommand(${JSON.stringify(command)});true;`);
  };

  useEffect(() => {
    if (ready) send({ active: playing });
  }, [ready, playing]);

  const captionText = caption ? caption.text : null;
  const captionProgress = caption ? caption.progress : null;
  useEffect(() => {
    if (ready && captionText != null) send({ caption: { text: captionText, progress: captionProgress } });
  }, [ready, captionText, captionProgress]);

  const onMessage = (event) => {
    let message = null;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch (_error) {
      return;
    }
    if (!message || message.type !== 'ready' || !page || message.id !== page.id) return;
    setReadyId(page.id);
    if (onReady) onReady();
  };

  // o texto está desenhado no canvas: o leitor de tela lê pelo rótulo; toques passam para o card de fora
  const label = captionText || phrase || undefined;
  return (
    <View
      testID={testID}
      accessible={!!label}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      pointerEvents="none"
      style={[styles.frame, style]}
    >
      {page ? (
        <WebView
          ref={webRef}
          source={{ html: page.html }}
          originWhitelist={['*']}
          javaScriptEnabled
          allowsInlineMediaPlayback
          scrollEnabled={false}
          onMessage={onMessage}
          style={styles.web}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: '#1C2E4F' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
