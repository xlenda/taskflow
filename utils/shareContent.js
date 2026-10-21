import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { APP_URL } from '../constants/brand';
import { AFFIRMATION_SHARE_STATUS as STATUS, captureShareCard, isShareCancellation } from './shareAffirmationCard';

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

// arquivo do compartilhar no cache do app: <shareFilePrefix>-<ms>.<ext> — celeste-share-<campanha>-<ms> ou, sem
// campanha, celeste-share-<ms> (vídeo dos gravadores, cartão do captureShareImage)
const SHARE_FILE = /(?:^|\/)celeste-share-(?:[a-z]+-)?(\d+)\.(?:mp4|webm|jpg|png)$/;
// cartão das versões que usavam o arquivo temporário do view-shot: nenhuma versão atual cria esse nome
const LEGACY_CARD = /(?:^|\/)celeste-afirmacao\d*\.jpg$/;
// Android: o app de destino pode ler o arquivo só depois que o seletor fecha
const ANDROID_GRACE_MS = 90_000;

const shareError = (code) => {
  const error = new Error(code);
  error.code = code;
  return error;
};

// prefixo de todo arquivo do compartilhar (cartão e vídeo do app e do site): a campanha só entra se for da lista,
// nunca texto do conteúdo; sem lançar — os gravadores gravam mesmo sem campanha
export function shareFilePrefix(campaign) {
  return SHARE_CAMPAIGNS.includes(campaign) ? `celeste-share-${campaign}` : 'celeste-share';
}

// nome (sem extensão) do cartão: aqui a campanha é obrigatória
export function shareFileBase(campaign, now = Date.now()) {
  if (!SHARE_CAMPAIGNS.includes(campaign)) throw new Error('share_campanha_invalida');
  return `${shareFilePrefix(campaign)}-${now}`;
}

// apaga um arquivo do compartilhar — nunca outro; falha de disco não derruba a tela (a próxima limpeza tenta)
export function discardShareFile(uri) {
  if (typeof uri !== 'string' || !(SHARE_FILE.test(uri) || LEGACY_CARD.test(uri))) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (_error) {
    // segue: sweepShareCache limpa na próxima abertura
  }
}

// depois de entregue a outro app: no Android ele pode ler só depois que o seletor fecha (prazo); no iPhone, já
export function discardAfterShare(uri) {
  if (Platform.OS === 'android') setTimeout(() => discardShareFile(uri), ANDROID_GRACE_MS);
  else discardShareFile(uri);
}

// ao abrir o app e a folha: o que ficou para trás (o app morreu no meio do compartilhar) sai do cache — os de menos de
// 90 s ficam, porque o app de destino pode estar lendo; o cartão de versões antigas sai sempre
export function sweepShareCache(now = Date.now()) {
  try {
    Paths.cache.list().forEach((entry) => {
      if (!(entry instanceof File)) return;
      const match = SHARE_FILE.exec(entry.name);
      if ((match && Number(match[1]) < now - ANDROID_GRACE_MS) || LEGACY_CARD.test(entry.name)) {
        discardShareFile(entry.uri);
      }
    });
  } catch (_error) {
    // cache ilegível: nada a limpar agora
  }
}

// app: o cartão vira JPEG no cache do próprio app com o nome do compartilhar (a limpeza acha mesmo se o app morrer
// no meio); disco cheio não deixa arquivo pela metade
export async function captureShareImage({ viewRef, campaign }) {
  const base64 = await captureShareCard(viewRef, 'base64');
  const file = new File(Paths.cache, `${shareFileBase(campaign)}.jpg`);
  try {
    file.create({ overwrite: true });
    file.write(base64, { encoding: 'base64' });
  } catch (error) {
    if (file.exists) file.delete();
    throw error;
  }
  return { uri: file.uri, mimeType: 'image/jpeg' };
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
// pelo "Compartilhar link" da folha. O arquivo (vídeo ou cartão) é temporário e sai do cache depois (aviso de
// privacidade); se o app morrer antes, a limpeza da abertura apaga. keepFile: quem chamou apaga (o vídeo da folha
// fica para outro envio enquanto ela está aberta).
async function shareOnNative({ uri, mimeType, title, keepFile }) {
  try {
    if (!(await Sharing.isAvailableAsync())) throw shareError('NATIVE_SHARE_UNAVAILABLE');
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: title });
    return { status: STATUS.SHARED };
  } catch (error) {
    if (isShareCancellation(error)) return { status: STATUS.CANCELLED };
    throw error;
  } finally {
    if (!keepFile) discardAfterShare(uri);
  }
}

// Compartilha um arquivo pronto — o vídeo da cena viva ou o JPEG do cartão (site: { file }, pelo caminho síncrono;
// app: { uri } no cache, de captureShareImage ou do gravador). Devolve { status: 'shared'|'downloaded'|'cancelled' }
// (+ linkCopied).
export function shareVideoFile({ file, uri, mimeType, title, text, keepFile } = {}) {
  if (Platform.OS === 'web') return shareOnWeb({ file, title, text });
  return shareOnNative({ uri, mimeType, title, keepFile });
}
