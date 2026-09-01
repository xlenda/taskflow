import { PixelRatio, Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { captureRef, releaseCapture } from 'react-native-view-shot';

import { APP_NAME } from '../constants/brand';

export const AFFIRMATION_SHARE_CAPTURE_SIZE = Object.freeze({ width: 1080, height: 1920 });
export const AFFIRMATION_SHARE_FILE_NAME = 'celeste-afirmacao.jpg';
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
  const normalized = String(value || AFFIRMATION_SHARE_FILE_NAME)
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^\.+/, '')
    .slice(0, 96);
  const base = normalized || 'celeste-afirmacao.jpg';
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
    fileName: 'celeste-afirmacao',
  };
};

const ensureCaptureTarget = (viewRef) => {
  if (!viewRef || (typeof viewRef === 'object' && 'current' in viewRef && !viewRef.current)) {
    throw shareError('SHARE_CARD_NOT_READY', 'O cartao de compartilhamento ainda nao esta pronto.');
  }
};

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

const isJpegFile = (file) =>
  typeof File === 'function' &&
  file instanceof File &&
  typeof file.name === 'string' &&
  file.type === 'image/jpeg' &&
  /\.jpe?g$/i.test(file.name);

/**
 * No navegador, aceita um File JPEG ja preparado ou captura o ViewShot e gera
 * um novo File. A tela pode pre-capturar para preservar a ativacao do gesto.
 */
export async function createAffirmationShareFile({ viewRef, file, fileName } = {}) {
  if (Platform.OS !== 'web') {
    throw shareError('WEB_ONLY', 'A criacao de File e exclusiva do navegador.');
  }
  if (file) {
    if (!isJpegFile(file)) {
      throw shareError('INVALID_SHARE_FILE', 'O arquivo de compartilhamento precisa ser JPEG.');
    }
    return file;
  }
  ensureCaptureTarget(viewRef);
  await waitForPaint();
  const dataUri = await captureRef(viewRef, captureOptions('data-uri'));
  return dataUriToJpegFile(dataUri, fileName);
}

const downloadFile = (file, fileName) => {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    throw shareError('WEB_DOWNLOAD_UNAVAILABLE', 'Este navegador nao permite baixar a imagem.');
  }
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = safeJpegName(fileName);
  anchor.rel = 'noopener';
  anchor.setAttribute('aria-hidden', 'true');
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

const shareOnWeb = async ({ viewRef, file, fileName, title }) => {
  const jpeg = await createAffirmationShareFile({ viewRef, file, fileName });
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const payload = { files: [jpeg], title };
  let canShareFile = false;

  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    try {
      canShareFile = nav.canShare({ files: [jpeg] }) === true;
    } catch (_error) {
      canShareFile = false;
    }
  }

  if (canShareFile) {
    try {
      await nav.share(payload);
      return { status: AFFIRMATION_SHARE_STATUS.SHARED, file: jpeg };
    } catch (error) {
      if (isShareCancellation(error)) {
        return { status: AFFIRMATION_SHARE_STATUS.CANCELLED, file: jpeg };
      }
      // Falha de suporte/permissao cai no download; cancelamento nunca cai aqui.
    }
  }

  downloadFile(jpeg, fileName);
  return { status: AFFIRMATION_SHARE_STATUS.DOWNLOADED, file: jpeg };
};

const shareOnNative = async ({ viewRef, title }) => {
  ensureCaptureTarget(viewRef);
  await waitForPaint();
  let temporaryUri = null;
  let handedToShareSheet = false;
  const releaseTemporaryCapture = () => {
    if (!temporaryUri) return;
    try {
      releaseCapture(temporaryUri);
    } catch (_error) {
      // O sistema ja recebeu a imagem; limpeza temporaria e best effort.
    }
  };
  try {
    temporaryUri = await captureRef(viewRef, captureOptions('tmpfile'));
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      throw shareError('NATIVE_SHARE_UNAVAILABLE', 'O compartilhamento nao esta disponivel.');
    }
    const shareUri = /^[a-z][a-z0-9+.-]*:\/\//i.test(temporaryUri)
      ? temporaryUri
      : `file://${temporaryUri}`;
    handedToShareSheet = true;
    await Sharing.shareAsync(shareUri, {
      dialogTitle: title,
      mimeType: 'image/jpeg',
      UTI: 'public.jpeg',
    });
    return { status: AFFIRMATION_SHARE_STATUS.SHARED };
  } catch (error) {
    if (isShareCancellation(error)) {
      return { status: AFFIRMATION_SHARE_STATUS.CANCELLED };
    }
    throw error;
  } finally {
    if (temporaryUri) {
      // Alguns apps Android leem o FileProvider somente depois que o chooser
      // fecha. O atraso preserva o arquivo durante essa leitura e o remove ao
      // voltar ao app; nos demais casos a limpeza continua imediata.
      if (Platform.OS === 'android' && handedToShareSheet) {
        setTimeout(releaseTemporaryCapture, 90_000);
      } else {
        releaseTemporaryCapture();
      }
    }
  }
};

/**
 * Compartilha o cartao em JPEG 1080x1920. No web, `file` e opcional e permite
 * usar uma captura antecipada; no nativo a captura temporaria sempre e limpa.
 */
export async function shareAffirmationCard({
  viewRef,
  file,
  fileName = AFFIRMATION_SHARE_FILE_NAME,
  title = APP_NAME,
} = {}) {
  if (Platform.OS === 'web') {
    return shareOnWeb({ viewRef, file, fileName: safeJpegName(fileName), title });
  }
  return shareOnNative({ viewRef, title });
}
