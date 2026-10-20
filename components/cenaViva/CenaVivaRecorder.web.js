import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import { installCenaViva } from './renderer';

const recorderError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

async function recordFile({ imageUri, phrase, linkText }) {
  const image = new window.Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(recorderError('image_error'));
    image.src = imageUri;
  });
  const video = await installCenaViva(window).recordVideo({ image, phrase, linkText });
  const mimeType = video.mimeType.split(';')[0];
  const name = `celeste-share-${Date.now()}.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
  return { file: new window.File([video.blob], name, { type: mimeType }), mimeType };
}

// Site: grava no próprio navegador com o MESMO renderizador e devolve um File pronto para o navigator.share.
// ref: { record({ imageUri /* blob: ou URL do asset */, phrase, linkText }) -> Promise<{ file, mimeType }> };
// mime sem codecs (o share do Android casa video/mp4). Como no app: uma gravação por vez (recorder_busy),
// recorder_cancelled se a tela sai no meio, recorder_unsupported quando o navegador não grava, e erro sem código
// de texto (DOMException do MediaRecorder) vira recorder_error.
const CenaVivaRecorder = forwardRef(function CenaVivaRecorder(_props, ref) {
  const job = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      record(params) {
        if (job.current) return Promise.reject(recorderError('recorder_busy'));
        return new Promise((resolve, reject) => {
          const current = {
            finish: (error, video) => {
              if (job.current !== current) return;
              job.current = null;
              if (!error) resolve(video);
              else reject(typeof error.code === 'string' ? error : recorderError('recorder_error'));
            },
          };
          job.current = current;
          recordFile(params || {}).then(
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
      if (job.current) job.current.finish(recorderError('recorder_cancelled'));
    },
    []
  );

  return null;
});

export default CenaVivaRecorder;
