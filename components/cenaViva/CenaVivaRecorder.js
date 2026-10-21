import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';

import { shareFilePrefix } from '../../utils/shareContent';
import { cenaVivaHtml, scriptJson } from './CenaViva';
import { installCenaViva } from './renderer';

// App: grava o vídeo numa WebView oculta (2×2 px) com o MESMO renderizador. A ponte não aguenta ~4 MB de uma
// vez: a página manda { type: 'chunk', index, total, data } (base64 em pedaços de 512 KB) e { type: 'done',
// mimeType }; aqui os pedaços são remontados e gravados em Paths.cache/<shareFilePrefix>-<ts>.mp4|webm: o nome que
// a limpeza do compartilhar procura.
const { joinChunks } = installCenaViva({});
const TIMEOUT_MS = 30000; // 8 s de gravação + abrir a WebView + devolver os pedaços, com folga
const EXTENSIONS = { 'video/mp4': 'mp4', 'video/webm': 'webm' };

const recorderError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

function recordingHtml({ image, phrase, linkText }) {
  return cenaVivaHtml(
    '',
    `(function () {
  var send = function (message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); };
  var fail = function (error) {
    send({ type: 'error', code: error && typeof error.code === 'string' ? error.code : 'recorder_error' });
  };
  var job = ${scriptJson({ phrase, linkText })};
  var image = new Image();
  image.onload = function () {
    window.CenaViva.recordVideo({ image: image, phrase: job.phrase, linkText: job.linkText }).then(function (video) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result);
        var parts = window.CenaViva.splitChunks(dataUrl.slice(dataUrl.lastIndexOf(',') + 1));
        for (var i = 0; i < parts.length; i++) send({ type: 'chunk', index: i, total: parts.length, data: parts[i] });
        send({ type: 'done', mimeType: video.mimeType });
      };
      reader.onerror = fail;
      reader.readAsDataURL(video.blob);
    }, fail);
  };
  image.onerror = function () { fail({ code: 'image_error' }); };
  image.src = ${scriptJson(image)};
})();`
  );
}

// junta os pedaços que a página mandou; no 'done' grava o arquivo e devolve { uri, mimeType } (mime sem codecs:
// o filtro de compartilhamento do Android casa video/mp4). Pedaço faltando ou mime estranho = erro.
export function collectVideo(job, message) {
  if (!message) return null;
  if (message.type === 'error') throw recorderError(String(message.code || 'recorder_error'));
  if (message.type === 'chunk') {
    if (Number.isInteger(message.index) && typeof message.data === 'string') job.parts[message.index] = message.data;
    job.total = message.total;
    return null;
  }
  if (message.type !== 'done') return null;
  const mimeType = String(message.mimeType || '').split(';')[0];
  const extension = EXTENSIONS[mimeType];
  const total = Number.isInteger(job.total) && job.total > 0 && job.total <= 1000 ? job.total : 0;
  const parts = Array.from({ length: total }, (_, i) => job.parts[i]);
  if (!extension || !total || parts.some((part) => typeof part !== 'string')) throw recorderError('recorder_error');
  const file = new File(Paths.cache, `${job.prefix || shareFilePrefix()}-${Date.now()}.${extension}`);
  try {
    file.create({ overwrite: true });
    file.write(joinChunks(parts), { encoding: 'base64' });
  } catch (error) {
    if (file.exists) file.delete(); // disco cheio no meio: nada de vídeo pela metade no cache
    throw error;
  }
  return { uri: file.uri, mimeType };
}

// ref: { record({ imageUri /* data URI */, phrase, linkText, campaign }) -> Promise<{ uri, mimeType }> }; uma gravação
// por vez (recorder_busy); recorder_unsupported quando a WebView não grava (a tela oferece o cartão)
const CenaVivaRecorder = forwardRef(function CenaVivaRecorder(_props, ref) {
  const [page, setPage] = useState(null);
  const job = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      record({ imageUri, phrase, linkText, campaign }) {
        if (job.current) return Promise.reject(recorderError('recorder_busy'));
        return new Promise((resolve, reject) => {
          const current = { parts: [], total: 0, prefix: shareFilePrefix(campaign) };
          current.finish = (error, video) => {
            if (job.current !== current) return;
            clearTimeout(current.timer);
            job.current = null;
            setPage(null);
            if (error) reject(error);
            else resolve(video);
          };
          current.timer = setTimeout(() => current.finish(recorderError('recorder_timeout')), TIMEOUT_MS);
          job.current = current;
          setPage({ key: `${Date.now()}-${Math.random()}`, html: recordingHtml({ image: imageUri, phrase, linkText }) });
        });
      },
    }),
    []
  );

  // fechou a tela no meio da gravação: a promessa não fica pendurada
  useEffect(
    () => () => {
      if (job.current) job.current.finish(recorderError('recorder_cancelled'));
    },
    []
  );

  const onMessage = (event) => {
    const current = job.current;
    if (!current) return;
    try {
      const video = collectVideo(current, JSON.parse(event.nativeEvent.data));
      if (video) current.finish(null, video);
    } catch (error) {
      current.finish(error && error.code ? error : recorderError('recorder_error'));
    }
  };
  // a página não carregou ou o processo da WebView morreu: rejeita na hora, sem esperar o prazo de 30 s
  const fail = () => {
    if (job.current) job.current.finish(recorderError('recorder_error'));
  };

  if (!page) return null;
  return (
    <View pointerEvents="none" style={styles.hidden}>
      <WebView
        key={page.key}
        source={{ html: page.html }}
        originWhitelist={['*']}
        javaScriptEnabled
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        onMessage={onMessage}
        onError={fail}
        onContentProcessDidTerminate={fail}
        onRenderProcessGone={fail}
        style={styles.web}
      />
    </View>
  );
});

export default CenaVivaRecorder;

// visível (2×2 px, transparente): WebView escondida com opacity 0 pode parar de gerar quadros
const styles = StyleSheet.create({
  hidden: { position: 'absolute', left: 0, top: 0, width: 2, height: 2, overflow: 'hidden' },
  web: { width: 2, height: 2, backgroundColor: 'transparent' },
});
