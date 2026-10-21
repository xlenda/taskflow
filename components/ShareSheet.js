import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { APP_NAME, APP_URL } from '../constants/brand';
import { tr } from '../constants/i18n';
import { useApp } from '../context/AppContext';
import { acquirePersonalVisual } from '../services/personalVisualStorage';
import { useTheme } from '../ui/theme';
import { alpha } from '../utils/colors';
import { pickReadyScene } from '../utils/readyScene';
import { createAffirmationShareFile, isShareCancellation } from '../utils/shareAffirmationCard';
import {
  SHARE_CAMPAIGNS,
  captureShareImage,
  discardShareFile,
  shareFileBase,
  shareUrl,
  shareVideoFile,
  sweepShareCache,
} from '../utils/shareContent';
import { useT } from '../utils/useT';
import CenaVivaRecorder from './cenaViva/CenaVivaRecorder';
import { imageUriForCenaViva } from './cenaViva/imageSource';
import PrimaryButton from './PrimaryButton';
import ShareCard, { SHARE_CARD_LAYOUT_SIZE } from './ShareCard';

const S = {
  title: { en: 'Share', pt: 'Compartilhar' },
  body: {
    en: 'Check it before sending. The image and the video carry the Celestial Trace and the link.',
    pt: 'Confira antes de enviar. A imagem e o vídeo levam o Traço Celeste e o link.',
  },
  close: { en: 'Close', pt: 'Fechar' },
  readyScene: { en: 'Scene inspired by your answers', pt: 'Cena inspirada nas suas respostas' },
  invalid: {
    en: 'This content could not be prepared for sharing.',
    pt: 'Não deu para preparar este conteúdo para compartilhar.',
  },
  image: { en: 'Share image', pt: 'Compartilhar imagem' },
  imagePreparing: { en: 'Preparing the image…', pt: 'Preparando a imagem…' },
  imageUnavailable: { en: 'Image unavailable in this browser', pt: 'Imagem indisponível neste navegador' },
  video: { en: 'Share video', pt: 'Compartilhar vídeo' },
  videoWebm: { en: 'Share WebM video', pt: 'Compartilhar vídeo WebM' },
  videoPreparing: { en: 'Preparing the video…', pt: 'Preparando o vídeo…' },
  videoProgress: {
    en: 'The 8-second video is being recorded. Tap again when it is ready.',
    pt: 'O vídeo de 8 segundos está sendo gravado. Toque de novo quando ele ficar pronto.',
  },
  videoUnavailable: { en: 'Video unavailable', pt: 'Vídeo indisponível' },
  videoUnsupported: {
    en: 'This device cannot record the video. The image is ready to share.',
    pt: 'Este aparelho não grava o vídeo. A imagem continua pronta para compartilhar.',
  },
  videoFailed: {
    en: 'The video could not be recorded right now. The image is ready to share.',
    pt: 'Não deu para gravar o vídeo agora. A imagem continua pronta para compartilhar.',
  },
  videoAgain: { en: 'Record the video again', pt: 'Gravar o vídeo de novo' },
  webmWarning: {
    en: 'This browser only records WebM video, which WhatsApp does not open. The image opens anywhere.',
    pt: 'Este navegador só grava vídeo WebM, que o WhatsApp não abre. A imagem abre em qualquer lugar.',
  },
  webmWarningDevice: {
    en: 'This device only records WebM video, which WhatsApp does not open. The image opens anywhere.',
    pt: 'Este aparelho só grava vídeo WebM, que o WhatsApp não abre. A imagem abre em qualquer lugar.',
  },
  link: { en: 'Share link', pt: 'Compartilhar link' },
  downloaded: {
    en: 'File downloaded and link copied: paste it in your message.',
    pt: 'Arquivo baixado e link copiado: cole na mensagem.',
  },
  downloadedPaste: { en: 'File downloaded. Paste this link in your message:', pt: 'Arquivo baixado. Cole este link na mensagem:' },
  copied: { en: 'Link copied ✓', pt: 'Link copiado ✓' },
  manual: { en: 'Sharing is off here. Copy the text below:', pt: 'Compartilhar não funciona aqui. Copie o texto abaixo:' },
  failed: { en: 'Sharing did not work here. Try the link.', pt: 'Não deu para compartilhar aqui. Tente o link.' },
};

const NOTICES = { downloaded: S.downloaded, paste: S.downloadedPaste, copied: S.copied, manual: S.manual, failed: S.failed };

// Folha do compartilhar: content = { campaign, phrase, kindLabel, visualKey, readyScene, lang }. Cada abertura monta
// uma folha nova (key): fechar cancela a gravação, solta a imagem pessoal e apaga o vídeo que não foi entregue.
export default function ShareSheet({ visible, onClose, content }) {
  if (!visible || !content) return null;
  const session = [
    content.campaign,
    content.phrase,
    content.visualKey || '',
    content.readyScene ? content.readyScene.id : '',
    content.lang,
  ].join('|');
  return <SharePanel key={session} content={content} onClose={onClose} />;
}

// A tela abre a folha por aqui: open({ campaign, phrase, kindLabel, visualKey, category }) monta o content — sem
// imagem pessoal, a cena pronta das respostas (lugar dos sonhos × categoria), a mesma do card — e sheet é o elemento
// que a tela põe na árvore. O botão share-open-<campaign> é da tela, no estilo dela, fora do card.
export function useShareSheet() {
  const { state } = useApp();
  const { lang } = useT();
  const [content, setContent] = useState(null);
  const dreamLocation = state && state.profile ? state.profile.dreamLocation : undefined;
  const open = ({ category, visualKey, ...rest }) =>
    setContent({ ...rest, visualKey: visualKey || null, readyScene: pickReadyScene({ dreamLocation, category }), lang });
  return { open, sheet: <ShareSheet visible={!!content} content={content} onClose={() => setContent(null)} /> };
}

// Prévia do cartão 9:16 primeiro; o vídeo de 8 s começa a gravar quando a folha abre e só vai no toque. No site, o
// arquivo já pronto vai no próprio toque (navigator.share sem await antes); sem ele pronto, o toque mostra o
// andamento e o envio fica para o próximo toque. Conteúdo que não dá para compartilhar (campanha fora da lista, sem
// cena pronta, sem frase) mostra o aviso e nada grava: nenhum toque chega ao shareUrl.
function SharePanel({ content, onClose }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const web = Platform.OS === 'web';
  const t = (field) => tr(field, content.lang);
  const valid =
    SHARE_CAMPAIGNS.includes(content.campaign) && !!content.readyScene && !!String(content.phrase || '').trim();
  const captureRef = useRef(null); // site: o cartão em 360×640 fora da tela (a miniatura reduzida não serve)
  const previewRef = useRef(null); // app: a própria prévia é capturada em 1080×1920
  const recorderRef = useRef(null);
  const videoRef = useRef(null); // vídeo gravado e ainda não entregue (app: o arquivo no cache)
  const loadedRef = useRef(false);
  const [laidOut, setLaidOut] = useState(false);
  const [visualReady, setVisualReady] = useState(false);
  const [shot, setShot] = useState(0);
  const [cardFile, setCardFile] = useState(null);
  const [cardFailed, setCardFailed] = useState(false);
  const [readyShown, setReadyShown] = useState(false); // a prévia mostra a cena pronta (sem imagem pessoal)
  const [video, setVideo] = useState({ state: 'recording' }); // recording | ready | unsupported | failed | spent
  const [attempt, setAttempt] = useState(0);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [medium, setMedium] = useState('imagem'); // formato do último envio: o link vai com a utm dele
  const [notice, setNotice] = useState(null);
  const cardReady = laidOut && visualReady;

  // grava ao abrir, com a imagem pessoal ou a cena pronta das respostas (a mesma do cartão)
  useEffect(() => {
    if (!valid) return undefined;
    let alive = true;
    let personal = null;
    if (!web && attempt === 0) sweepShareCache(); // o app pode ter morrido no meio de um compartilhar
    (async () => {
      const found = content.visualKey ? await acquirePersonalVisual(content.visualKey).catch(() => null) : null;
      if (!alive) {
        if (found) found.release();
        return;
      }
      personal = found;
      setReadyShown(!found);
      const imageUri = await imageUriForCenaViva({ personalUri: found ? found.uri : null, readyScene: content.readyScene });
      if (!alive) return;
      const recorded = await recorderRef.current.record({
        imageUri,
        phrase: content.phrase,
        linkText: APP_URL,
        campaign: content.campaign,
      });
      if (!alive) {
        discardShareFile(recorded.uri);
        return;
      }
      videoRef.current = recorded;
      setVideo({ state: 'ready', mimeType: recorded.mimeType });
    })().catch((error) => {
      // recorder_cancelled = a folha fechou no meio (alive já é false)
      if (alive) setVideo({ state: error && error.code === 'recorder_unsupported' ? 'unsupported' : 'failed' });
    });
    return () => {
      alive = false;
      if (personal) personal.release();
    };
  }, [attempt]);

  // fechou com um vídeo que nunca foi entregue a outro app: sai do cache já (o entregue, o shareVideoFile apaga)
  useEffect(
    () => () => {
      if (videoRef.current) discardShareFile(videoRef.current.uri);
    },
    []
  );

  // site: o JPEG do cartão fica pronto antes do toque (padrão da tela de Afirmações), com o nome do compartilhar
  useEffect(() => {
    if (!web || !valid || !cardReady) return undefined;
    let alive = true;
    setCardFile(null);
    setCardFailed(false);
    createAffirmationShareFile({ viewRef: captureRef, fileName: shareFileBase(content.campaign) })
      .then((file) => alive && setCardFile(file))
      .catch(() => alive && setCardFailed(true));
    return () => {
      alive = false;
    };
  }, [cardReady, shot]);

  // a imagem pode não avisar que pintou (rede, cena que falhou): o cartão segue em 1,8 s com o que tiver
  useEffect(() => {
    if (visualReady) return undefined;
    const timer = setTimeout(() => setVisualReady(true), 1800);
    return () => clearTimeout(timer);
  }, [visualReady]);

  const onVisualReady = () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    if (visualReady) setShot((n) => n + 1); // pintou depois do prazo: a captura só com o gradiente não vale
    else setVisualReady(true);
  };

  const track = (sharing, link) => {
    setBusy(true);
    setNotice(null);
    sharing
      .then(
        (result) => {
          if (result && result.status === 'downloaded') {
            setNotice(result.linkCopied ? { kind: 'downloaded' } : { kind: 'paste', text: link });
          }
        },
        () => setNotice({ kind: 'failed' })
      )
      .then(() => setBusy(false));
  };

  const imageReady = cardReady && (!web || !!cardFile);
  const shareImage = () => {
    if (!valid || busy || !imageReady) return;
    const link = shareUrl('imagem', content.campaign);
    const text = `${APP_NAME} — ${link}`;
    const sharing = web
      ? shareVideoFile({ file: cardFile, mimeType: 'image/jpeg', title: t(S.title), text })
      : captureShareImage({ viewRef: previewRef, campaign: content.campaign }).then((image) =>
          shareVideoFile({ uri: image.uri, mimeType: image.mimeType, title: t(S.title), text })
        );
    setMedium('imagem');
    track(sharing, link);
  };

  const shareVideo = () => {
    if (!valid || busy) return;
    if (video.state === 'failed' || video.state === 'spent') {
      setAsked(false);
      setVideo({ state: 'recording' });
      setAttempt((n) => n + 1);
      return;
    }
    if (video.state !== 'ready') {
      setAsked(true);
      return;
    }
    const recorded = videoRef.current;
    const link = shareUrl('video', content.campaign);
    const sharing = shareVideoFile({
      file: recorded.file,
      uri: recorded.uri,
      mimeType: recorded.mimeType,
      title: t(S.title),
      text: `${APP_NAME} — ${link}`,
    });
    setMedium('video');
    if (!web) {
      // entregue ao seletor: o shareVideoFile apaga o arquivo depois; outro envio grava de novo
      videoRef.current = null;
      setVideo({ state: 'spent' });
    }
    track(sharing, link);
  };

  // o expo-sharing não leva texto junto do arquivo: o link vai por aqui (no site, se não der, copia)
  const shareLink = async () => {
    if (!valid || busy) return;
    const message = `“${content.phrase}” — ${APP_NAME}\n${shareUrl(medium, content.campaign)}`;
    setNotice(null);
    try {
      await Share.share({ message });
      return;
    } catch (error) {
      if (isShareCancellation(error)) return;
    }
    try {
      await navigator.clipboard.writeText(message);
      setNotice({ kind: 'copied' });
    } catch (_error) {
      setNotice({ kind: 'manual', text: message });
    }
  };

  const webm = video.state === 'ready' && video.mimeType === 'video/webm';
  const imageLabel = web && cardFailed ? t(S.imageUnavailable) : imageReady ? t(S.image) : t(S.imagePreparing);
  const videoLabel = {
    recording: t(S.videoPreparing),
    ready: webm ? t(S.videoWebm) : t(S.video),
    unsupported: t(S.videoUnavailable),
    failed: t(S.videoAgain),
    spent: t(S.videoAgain),
  }[video.state];
  const card = {
    phrase: content.phrase,
    kindLabel: content.kindLabel,
    visualKey: content.visualKey,
    readyScene: content.readyScene,
  };
  const previewWidth = Math.max(150, Math.min(width - 48, (height - 340) * (9 / 16), 300));
  const previewHeight = previewWidth * (16 / 9);
  const muted = { color: theme.textMuted };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {web && valid ? (
          <View pointerEvents="none" accessible={false} aria-hidden style={styles.captureHost}>
            <ShareCard
              ref={captureRef}
              testID="share-capture-card"
              {...card}
              onLayout={() => setLaidOut(true)}
              onVisualReady={onVisualReady}
              onVisualError={() => setVisualReady(true)}
            />
          </View>
        ) : null}
        <ScrollView
          testID="share-sheet"
          style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: theme.text }]}>{t(S.title)}</Text>
              <Text style={[styles.body, muted]}>{t(S.body)}</Text>
            </View>
            {/* fechar vale até com um compartilhar pendurado (seletor que nunca responde não prende a folha) */}
            <TouchableOpacity
              testID="share-sheet-close"
              activeOpacity={0.72}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={t(S.close)}
              style={[styles.close, { backgroundColor: alpha(theme.textMuted, 0.1) }]}
            >
              <Ionicons name="close" size={21} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          {valid ? (
            <>
              <View testID="share-sheet-preview" style={[styles.preview, { width: previewWidth, height: previewHeight }]}>
                <ShareCard
                  ref={web ? undefined : previewRef}
                  {...card}
                  onLayout={web ? undefined : () => setLaidOut(true)}
                  onVisualReady={web ? undefined : onVisualReady}
                  onVisualError={web ? undefined : () => setVisualReady(true)}
                  style={{
                    position: 'absolute',
                    left: (previewWidth - SHARE_CARD_LAYOUT_SIZE.width) / 2,
                    top: (previewHeight - SHARE_CARD_LAYOUT_SIZE.height) / 2,
                    transform: [{ scale: previewWidth / SHARE_CARD_LAYOUT_SIZE.width }],
                  }}
                />
                {/* rótulo honesto só na prévia: por cima dela, fora do cartão capturado e do vídeo */}
                {readyShown ? (
                  <Text testID="share-sheet-ready-label" style={styles.readyLabel}>
                    {t(S.readyScene)}
                  </Text>
                ) : null}
              </View>

              {webm ? (
                <Text testID="share-video-webm-warning" accessibilityLiveRegion="polite" style={[styles.status, muted]}>
                  {t(web ? S.webmWarning : S.webmWarningDevice)}
                </Text>
              ) : null}
              {video.state === 'unsupported' || video.state === 'failed' ? (
                <Text testID="share-video-unavailable" accessibilityLiveRegion="polite" style={[styles.status, muted]}>
                  {t(video.state === 'unsupported' ? S.videoUnsupported : S.videoFailed)}
                </Text>
              ) : null}
              {asked && video.state === 'recording' ? (
                <View testID="share-video-progress" accessibilityLiveRegion="polite" style={styles.progress}>
                  <ActivityIndicator size="small" color={theme.textMuted} />
                  <Text style={[styles.progressText, muted]}>{t(S.videoProgress)}</Text>
                </View>
              ) : null}
              {notice ? (
                <View testID="share-sheet-notice" accessibilityLiveRegion="polite" style={styles.notice}>
                  <Text style={[styles.status, muted]}>{t(NOTICES[notice.kind])}</Text>
                  {notice.text ? (
                    <Text selectable style={[styles.noticeText, { color: theme.text }]}>
                      {notice.text}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <PrimaryButton
                testID="share-image"
                label={imageLabel}
                icon="image-outline"
                disabled={busy || !imageReady}
                onPress={shareImage}
                style={styles.button}
              />
              <PrimaryButton
                testID="share-video"
                label={videoLabel}
                icon="videocam-outline"
                variant={video.state === 'ready' && !webm ? 'solid' : 'soft'}
                disabled={busy || video.state === 'unsupported'}
                onPress={shareVideo}
                style={styles.button}
              />
              <TouchableOpacity
                testID="share-link"
                activeOpacity={0.72}
                disabled={busy}
                onPress={shareLink}
                accessibilityRole="button"
                accessibilityLabel={t(S.link)}
                accessibilityState={{ disabled: busy }}
                style={[styles.link, busy && styles.dimmed]}
              >
                <Ionicons name="link-outline" size={18} color={theme.textMuted} />
                <Text style={[styles.linkText, muted]}>{t(S.link)}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text testID="share-sheet-invalid" accessibilityLiveRegion="polite" style={[styles.status, muted]}>
              {t(S.invalid)}
            </Text>
          )}
        </ScrollView>
      </View>
      {valid ? <CenaVivaRecorder ref={recorderRef} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(5,12,22,0.68)',
  },
  sheet: { width: '100%', maxWidth: 460, maxHeight: '96%', borderWidth: 1, borderRadius: 28, overflow: 'hidden' },
  content: { padding: 20 },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
  copy: { flex: 1, paddingRight: 14 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '800' },
  body: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  close: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  preview: { alignSelf: 'center', overflow: 'hidden', borderRadius: 20 },
  // no alto da prévia (o cartão deixa o topo livre), pequeno e legível sobre a imagem
  readyLabel: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // o alvo do site fica fora da viewport, mas com os 360×640 sem transformação (a captura não rasteriza a miniatura)
  captureHost: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: SHARE_CARD_LAYOUT_SIZE.width,
    height: SHARE_CARD_LAYOUT_SIZE.height,
  },
  status: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 12 },
  progress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  progressText: { flexShrink: 1, fontSize: 13, lineHeight: 19, marginLeft: 8 },
  notice: { marginTop: 4 },
  noticeText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  button: { marginTop: 12 },
  link: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  dimmed: { opacity: 0.45 },
  linkText: { fontSize: 14, lineHeight: 20, fontWeight: '700', marginLeft: 6 },
});
