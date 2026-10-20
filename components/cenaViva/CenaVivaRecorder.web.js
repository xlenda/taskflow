import { forwardRef, useImperativeHandle } from 'react';

import { installCenaViva } from './renderer';

const recorderError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

// Site: grava no próprio navegador com o MESMO renderizador e devolve um File pronto para o navigator.share.
// ref: { record({ imageUri /* blob: ou URL do asset */, phrase, linkText }) -> Promise<{ file, mimeType }> };
// mime sem codecs (o share do Android casa video/mp4); recorder_unsupported quando o navegador não grava.
const CenaVivaRecorder = forwardRef(function CenaVivaRecorder(_props, ref) {
  useImperativeHandle(
    ref,
    () => ({
      async record({ imageUri, phrase, linkText }) {
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
      },
    }),
    []
  );
  return null;
});

export default CenaVivaRecorder;
