import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { APP_URL } from '../constants/brand';
import { AFFIRMATION_SHARE_STATUS as STATUS, isShareCancellation } from './shareAffirmationCard';

export const SHARE_MEDIUMS = ['imagem', 'video'];
export const SHARE_CAMPAIGNS = ['afirmacao', 'visao', 'ancora', 'pratica', 'sonho'];

// Link do que ela compartilha: só as utm (origem, formato e superfície). Fora da lista não vira link — nenhuma frase
// ou dado pessoal escapa por ele.
export function shareUrl(medium, campaign) {
  if (!SHARE_MEDIUMS.includes(medium) || !SHARE_CAMPAIGNS.includes(campaign)) {
    throw new Error('share_link_invalido');
  }
  return `${APP_URL}/?utm_source=compartilhar&utm_medium=${medium}&utm_campaign=${campaign}`;
}

// vídeo do compartilhar no cache do app (CenaVivaRecorder grava celeste-share-<ms>.mp4|webm)
const SHARE_FILE = /(?:^|\/)celeste-share-(\d+)\.(?:mp4|webm)$/;
// Android: o app de destino pode ler o arquivo só depois que o seletor fecha (o cartão espera o mesmo)
const ANDROID_GRACE_MS = 90_000;

const shareError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

// apaga um vídeo do compartilhar — nunca outro arquivo; falha de disco não derruba a tela (o próximo sweep tenta)
export function discardShareFile(uri) {
  if (typeof uri !== 'string' || !SHARE_FILE.test(uri)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (_error) {
    // segue: sweepShareCache limpa na próxima abertura
  }
}

// ao abrir a folha: vídeos que ficaram para trás (o app morreu no meio do compartilhar) saem do cache; os de menos de
// 90 s ficam, porque o app de destino pode estar lendo
export function sweepShareCache(now = Date.now()) {
  try {
    Paths.cache.list().forEach((entry) => {
      const match = entry instanceof File ? SHARE_FILE.exec(entry.name) : null;
      if (match && Number(match[1]) < now - ANDROID_GRACE_MS) discardShareFile(entry.uri);
    });
  } catch (_error) {
    // cache ilegível: nada a limpar agora
  }
}

// sem compartilhar arquivo (desktop): baixa e copia o link para colar na mensagem; só diz que copiou se copiou
function downloadWithLink(file, text) {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return Promise.reject(shareError('WEB_DOWNLOAD_UNAVAILABLE'));
  }
  const href = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = file.name;
  anchor.rel = 'noopener';
  anchor.setAttribute('aria-hidden', 'true');
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
  let copying;
  try {
    copying = Promise.resolve(navigator.clipboard.writeText(text));
  } catch (error) {
    copying = Promise.reject(error);
  }
  return copying.then(
    () => ({ status: STATUS.DOWNLOADED, linkCopied: true }),
    () => ({ status: STATUS.DOWNLOADED, linkCopied: false })
  );
}

// sem async: navigator.share sai no próprio toque (o iPhone e o Chrome exigem o gesto; um await antes o perderia)
function shareOnWeb({ file, title, text }) {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  let canShareFile = false;
  try {
    canShareFile =
      !!nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] }) === true;
  } catch (_error) {
    canShareFile = false;
  }
  if (!canShareFile) return downloadWithLink(file, text);
  return nav.share({ files: [file], title, text }).then(
    () => ({ status: STATUS.SHARED }),
    // desistir é desistir; outra recusa (gesto vencido, alvo sem suporte) cai no download
    (error) => (isShareCancellation(error) ? { status: STATUS.CANCELLED } : downloadWithLink(file, text))
  );
}

// o expo-sharing só leva o arquivo (Android EXTRA_STREAM, iPhone [url]): o link vai desenhado no cartão/vídeo e
// pelo "Compartilhar link" da folha. O vídeo é temporário e sai do cache depois (aviso de privacidade).
async function shareOnNative({ uri, mimeType, title }) {
  try {
    if (!(await Sharing.isAvailableAsync())) throw shareError('NATIVE_SHARE_UNAVAILABLE');
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
    return { status: STATUS.SHARED };
  } catch (error) {
    if (isShareCancellation(error)) return { status: STATUS.CANCELLED };
    throw error;
  } finally {
    if (Platform.OS === 'android') setTimeout(() => discardShareFile(uri), ANDROID_GRACE_MS);
    else discardShareFile(uri);
  }
}

// Compartilha um arquivo pronto: o vídeo da cena viva (site: { file }; app: { uri } no cache) — no site também o JPEG
// do cartão, pelo mesmo caminho síncrono. Devolve { status: 'shared'|'downloaded'|'cancelled' } (+ linkCopied).
export function shareVideoFile({ file, uri, mimeType, title, text } = {}) {
  if (Platform.OS === 'web') return shareOnWeb({ file, title, text });
  return shareOnNative({ uri, mimeType, title });
}
