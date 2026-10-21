import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { installCenaViva } from './renderer';

const CAMPAIGN = /^[a-z]+$/; // só o nome de uma campanha vira parte do nome do arquivo

const recorderError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

async function recordFile({ imageUri, phrase, linkText, campaign }, signal) {
  const image = new window.Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(recorderError('image_error'));
    image.src = imageUri;
  });
  // a folha pode ter fechado enquanto a imagem abria: nem começa
  if (signal.aborted) throw recorderError('recorder_cancelled');
  const video = await installCenaViva(window).recordVideo({ image, phrase, linkText, signal });
  const mimeType = video.mimeType.split(';')[0];
  const prefix = CAMPAIGN.test(String(campaign || '')) ? `celeste-share-${campaign}` : 'celeste-share';
  const name = `${prefix}-${Date.now()}.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
  return { file: new window.File([video.blob], name, { type: mimeType }), mimeType };
}

// Site: grava no próprio navegador com o MESMO renderizador e devolve um File pronto para o navigator.share.
// ref: { record({ imageUri /* blob: ou URL do asset */, phrase, linkText, campaign }) -> Promise<{ file, mimeType }> };
// File celeste-share-<campanha>-<ms>.mp4|webm, mime sem codecs (o share do Android casa video/mp4). Como no app: uma
// gravação por vez (recorder_busy), recorder_cancelled se a tela sai no meio — e aí a gravação para de verdade
// (nada de canvas 720×1280 escondido pintando 8 s) —, recorder_unsupported quando o navegador não grava, e erro sem
// código de texto (DOMException do MediaRecorder) vira recorder_error.
const CenaVivaRecorder = forwardRef(function CenaVivaRecorder(_props, ref) {
  const job = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      record(params) {
        if (job.current) return Promise.reject(recorderError('recorder_busy'));
        return new Promise((resolve, reject) => {
          const controller = new AbortController();
          const current = {
            controller,
            finish: (error, video) => {
              if (job.current !== current) return;
              job.current = null;
              if (!error) resolve(video);
              else reject(typeof error.code === 'string' ? error : recorderError('recorder_error'));
            },
          };
          job.current = current;
          recordFile(params || {}, controller.signal).then(
            (video) => current.finish(null, video),
            (error) => current.finish(error || recorderError('recorder_error'))
          );
        });
      },
    }),
    []
  );

  useEffect(
    () => () => {
      const current = job.current;
      if (!current) return;
      current.finish(recorderError('recorder_cancelled'));
      current.controller.abort();
    },
    []
  );

  return null;
});

export default CenaVivaRecorder;
