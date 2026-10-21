import { PixelRatio, Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';

// Captura do cartão 9:16 do compartilhar (ShareCard). O envio mora em utils/shareContent.js: no site o JPEG vira
// File aqui; no app a captura volta em base64 e o shareContent grava no cache do app com o nome do compartilhar.
export const AFFIRMATION_SHARE_CAPTURE_SIZE = Object.freeze({ width: 1080, height: 1920 });
export const AFFIRMATION_SHARE_STATUS = Object.freeze({
  SHARED: 'shared',
  DOWNLOADED: 'downloaded',
  CANCELLED: 'cancelled',
});

const CANCEL_PATTERN = /\b(abort(?:ed)?|cancel(?:led|ed|ado|ada)?|dismiss(?:ed)?)\b/i;

export function isShareCancellation(error) {
  const name = String((error && error.name) || '');
  const code = String((error && error.code) || '');
  const message = String((error && error.message) || '');
  return (
    name === 'AbortError' ||
    name === 'CanceledError' ||
    name === 'CancelledError' ||
    CANCEL_PATTERN.test(`${name} ${code} ${message}`)
  );
}

const shareError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const safeJpegName = (value) => {
  const normalized = String(value || 'celeste-share.jpg')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 96);
  const base = normalized || 'celeste-share.jpg';
  return /\.jpe?g$/i.test(base) ? base.replace(/\.jpeg$/i, '.jpg') : `${base}.jpg`;
};

const waitForPaint = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

const captureOptions = (result) => {
  // iOS measures the requested size in points; Android and web use pixels.
  const scale = Platform.OS === 'ios' ? Math.max(1, PixelRatio.get()) : 1;
  return {
    width: AFFIRMATION_SHARE_CAPTURE_SIZE.width / scale,
    height: AFFIRMATION_SHARE_CAPTURE_SIZE.height / scale,
    format: 'jpg',
    quality: 0.94,
    result,
  };
};

const ensureCaptureTarget = (viewRef) => {
  if (!viewRef || (typeof viewRef === 'object' && 'current' in viewRef && !viewRef.current)) {
    throw shareError('SHARE_CARD_NOT_READY', 'O cartao de compartilhamento ainda nao esta pronto.');
  }
};

// o cartão em JPEG 1080×1920 depois de pintado: 'data-uri' no site, 'base64' no app (nunca o arquivo temporário do
// view-shot, que no Android pode cair no cache externo, fora do alcance da limpeza do compartilhar)
export async function captureShareCard(viewRef, result) {
  ensureCaptureTarget(viewRef);
  await waitForPaint();
  return captureRef(viewRef, captureOptions(result));
}

const dataUriToJpegFile = (dataUri, fileName) => {
  if (typeof File !== 'function' || typeof atob !== 'function') {
    throw shareError('WEB_FILE_UNAVAILABLE', 'Este navegador nao consegue preparar a imagem.');
  }
  const match = /^data:image\/jpeg;base64,([a-zA-Z0-9+/=\s]+)$/.exec(String(dataUri || ''));
  if (!match) {
    throw shareError('INVALID_CAPTURE', 'A captura nao retornou uma imagem JPEG valida.');
  }
  const binary = atob(match[1].replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], safeJpegName(fileName), {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
};

// No navegador: captura o cartão e devolve o File JPEG. A folha captura antes do toque para o envio sair no próprio
// gesto.
export async function createAffirmationShareFile({ viewRef, fileName } = {}) {
  if (Platform.OS !== 'web') {
    throw shareError('WEB_ONLY', 'A criacao de File e exclusiva do navegador.');
  }
  const dataUri = await captureShareCard(viewRef, 'data-uri');
  return dataUriToJpegFile(dataUri, fileName);
}
