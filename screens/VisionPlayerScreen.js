import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Screen, Header, pct } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { VISIONS, categoryMeta, localized } from '../constants/content';
import { txt } from '../constants/i18n';
import { useT } from '../utils/useT';
import { speak, stopSpeaking, isSpeechAvailable, splitScript, hasNeuralAudio } from '../utils/speech';
import { audioDur, audioUrl } from '../utils/audioBank';
import { accentAt, alpha } from '../utils/colors';
import { formatTime } from '../utils/date';

import GradientCover from '../components/GradientCover';
import PrimaryButton from '../components/PrimaryButton';

const S = {
  subtitle: { en: '{category} visualization', pt: 'Visualização de {category}' },
  back: { en: 'Back', pt: 'Voltar' },
  save: { en: 'Save this vision', pt: 'Salvar esta visão' },
  unsave: { en: 'Remove from saved', pt: 'Tirar dos salvos' },
  ready: { en: 'Press play to begin', pt: 'Toque para começar a ouvir' },
  lineOf: { en: 'Sentence {n} of {total}', pt: 'Frase {n} de {total}' },
  remaining: { en: '{time} left', pt: '{time} restantes' },
  // Mesmo rótulo da lista de visões: o tempo real do arquivo, antes de tocar.
  narration: { en: '{time} narration', pt: '{time} de narração' },
  endLabel: { en: 'Complete', pt: 'Completa' },
  play: { en: 'Play narration', pt: 'Ouvir a narração' },
  resume: { en: 'Resume narration', pt: 'Continuar a narração' },
  // Parar guarda a posição real do MP3: a volta oferece "Continuar de 0:12".
  stop: { en: 'Stop narration', pt: 'Parar a narração' },
  resumeFrom: { en: 'Continue from {time}', pt: 'Continuar de {time}' },
  soundTip: {
    en: 'Sound on? On iPhone, the silent switch can mute the narration — headphones help.',
    pt: 'Som ligado? No iPhone, a chavinha de silencioso corta a narração — fone ajuda.',
  },
  checkVolume: {
    en: "The narration hasn't moved yet — check the volume and press play.",
    pt: 'A narração ainda não andou — confira o volume e toque no play.',
  },
  prev: { en: 'Previous sentence', pt: 'Frase anterior' },
  next: { en: 'Next sentence', pt: 'Próxima frase' },
  finish: { en: "I've finished this vision", pt: 'Terminei esta visão' },
  done: {
    en: 'Saved to your journey. You have stepped into it.',
    pt: 'Guardado na sua jornada. Você entrou nessa cena.',
  },
  noSpeech: {
    en: 'Your browser does not support narration — read it at your own pace.',
    pt: 'Seu navegador não suporta narração — leia no seu ritmo.',
  },
  audioFail: {
    en: 'The narration did not play here — read the script below at your own pace.',
    pt: 'A narração não tocou aqui — leia o roteiro abaixo no seu ritmo.',
  },
};

// Rótulo das categorias (a chave em inglês continua sendo o identificador do
// conteúdo; só o que a pessoa lê é traduzido).
const CAT = {
  Love: { en: 'Love', pt: 'Amor' },
  Wealth: { en: 'Wealth', pt: 'Prosperidade' },
  Career: { en: 'Career', pt: 'Carreira' },
  Health: { en: 'Health', pt: 'Saúde' },
  Confidence: { en: 'Confidence', pt: 'Confiança' },
  Peace: { en: 'Peace', pt: 'Paz' },
};

// O conteúdo bilíngue mora em constants/content.js e sai de lá por localized().
// Se algum campo ainda vier como { en, pt } cru, txt() resolve — a tela nunca
// renderiza um objeto nem quebra enquanto o conteúdo é traduzido.
const TEXT_FIELDS = ['title', 'caption', 'script'];
function localize(item, lang) {
  if (!item) return item;
  const out =
    typeof localized === 'function' ? { ...item, ...(localized(item, lang) || {}) } : { ...item };
  TEXT_FIELDS.forEach((k) => {
    out[k] = txt(out[k], lang);
  });
  // Chaves estruturais nunca são traduzidas: são elas que casam ícone e cor.
  out.id = item.id;
  out.category = item.category;
  out.accent = item.accent;
  // `duration` do content.js é escrito à mão e mente (171s para um MP3 de 28s):
  // o tempo da tela vem de audioDur(), que só responde quando existe arquivo.
  return out;
}

// Posição de retomada por visão/idioma. Vive na memória da sessão: sair da
// tela no meio e voltar oferece "Continuar de 0:12" em vez de zerar a escuta.
const RESUME = new Map();

export default function VisionPlayerScreen() {
  const th = useTheme();
  const { t, lang } = useT();
  const { height: winH } = useWindowDimensions();
  // Palco compacto no celular: com 320px o play caía atrás da barra de abas
  // (y=581 numa área visível de 580) enquanto o texto pedia "toque para ouvir".
  const compact = winH > 0 && winH < 760;
  const navigation = useNavigation();
  const route = useRoute();
  const { state, toggleSavedVision, logVisionPlay } = useApp();
  const isFocused = useIsFocused();

  const source = VISIONS.find((v) => v.id === route.params?.visionId) || VISIONS[0];
  const vision = useMemo(() => localize(source, lang), [source, lang]);
  const color = accentAt(th, vision.accent);
  const isSaved = state ? state.savedVisions.includes(vision.id) : false;
  const catLabel = CAT[vision.category] ? t(CAT[vision.category]) : String(vision.category || '');

  const lines = useMemo(() => splitScript(vision.script), [vision.script]);
  const total = lines.length;
  const speechOk = isSpeechAvailable();
  // Só conta como locução neural o que ESTE aparelho consegue tocar: fora da
  // web o playId nem tenta e o caminho é a voz do aparelho.
  const neuralOk = useMemo(
    () => Platform.OS === 'web' && typeof Audio !== 'undefined' && hasNeuralAudio(vision.id, lang),
    [vision.id, lang]
  );
  // Duração REAL do MP3 (segundos) — null quando não há arquivo. É o que faz a
  // barra andar de verdade; sem ela, nenhum número aparece.
  const neuralDur = useMemo(
    () => (neuralOk ? audioDur(vision.id, lang) : null),
    [neuralOk, vision.id, lang]
  );
  // Existindo MP3, o player funciona mesmo sem Web Speech no navegador.
  const canNarrate = neuralOk || (speechOk && total > 0);

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  // 'neural' = arquivo único tocando; 'voice' = voz do aparelho, frase a frase.
  const [mode, setMode] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [failed, setFailed] = useState(false);
  // Posição guardada da última escuta desta visão — alimenta "Continuar de X".
  const [resumeAt, setResumeAt] = useState(0);
  // "Terminei" sem o MP3 ter andado não vira conclusão: vira este convite.
  const [volumeNote, setVolumeNote] = useState(false);

  // Enquanto o arquivo único for o caminho, não existe "frase atual": some com
  // os botões de frase e com o rótulo "Frase X de Y". Sem voz do aparelho eles
  // também não aparecem — não teriam o que narrar.
  const usingNeural = neuralOk && mode !== 'voice';
  const showLineBtns = !usingNeural && speechOk && total > 0;

  const linesRef = useRef(lines);
  const speakLineRef = useRef(null);
  // Elemento de áudio do MP3, gerenciado AQUI (e não em utils/speech) porque a
  // retomada, o registro em ~70% e a conclusão honesta leem o currentTime real.
  const audioRef = useRef(null);
  const keyRef = useRef('');
  // Cada fala nasce com um token. Quem para/pula incrementa o token, então o
  // onDone da fala antiga (o cancel() do navegador dispara "end") é ignorado e
  // nunca empurra o roteiro sozinho.
  const sessionRef = useRef(0);
  const logged = useRef(false);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // Pausa o MP3 e, se pedido, guarda onde parou (só se andou de verdade e não
  // estava a segundos do fim). Devolve a posição em segundos. Só mexe em refs.
  const haltNeural = useCallback((save) => {
    const el = audioRef.current;
    if (!el) return 0;
    audioRef.current = null;
    let pos = 0;
    let dur = 0;
    try {
      el.pause();
      pos = el.currentTime || 0;
      dur = el.duration || 0;
      el.onended = null;
      el.onerror = null;
    } catch (e) {}
    if (save && pos > 1 && (!(dur > 0) || pos < dur - 2)) RESUME.set(keyRef.current, pos);
    return pos;
  }, []);

  const stopVoice = useCallback(() => {
    sessionRef.current += 1;
    stopSpeaking();
    // Parar o MP3 guarda a posição real: a volta oferece "Continuar de 0:12".
    haltNeural(true);
    setResumeAt(RESUME.get(keyRef.current) || 0);
    setPlaying(false);
  }, [haltNeural]);

  const finish = useCallback(() => {
    sessionRef.current += 1;
    stopSpeaking();
    haltNeural(false);
    RESUME.delete(keyRef.current);
    setResumeAt(0);
    setVolumeNote(false);
    setPlaying(false);
    setStarted(true);
    setCompleted(true);
    setFailed(false);
    if (!logged.current) {
      logged.current = true;
      logVisionPlay(vision.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [vision.id, logVisionPlay, haltNeural]);

  // Caminho da voz do aparelho: frase a frase, com progresso real por frase.
  const speakLine = useCallback(
    (i) => {
      const list = linesRef.current;
      if (!list.length) return;
      if (i >= list.length) {
        finish();
        return;
      }
      const at = Math.max(0, i);
      const token = sessionRef.current + 1;
      sessionRef.current = token;
      setMode('voice');
      setIdx(at);
      setStarted(true);
      setCompleted(false);
      setFailed(false);
      setPlaying(true);

      const falou = speak(list[at], {
        lang,
        onDone: () => {
          if (sessionRef.current !== token) return; // parado, pulado ou trocado
          const next = at + 1;
          if (next >= linesRef.current.length) {
            finish();
            return;
          }
          if (speakLineRef.current) speakLineRef.current(next);
        },
        onError: () => {
          if (sessionRef.current !== token) return;
          setPlaying(false);
          setFailed(true);
        },
      });
      if (!falou) {
        setPlaying(false);
        setFailed(true);
        if (at === 0) setStarted(false);
      }
    },
    [lang, finish]
  );

  useEffect(() => {
    speakLineRef.current = speakLine;
  }, [speakLine]);

  // Caminho do arquivo neural: UM MP3 com o roteiro inteiro, num elemento
  // próprio — é o currentTime dele que dá retomada, registro em ~70% e
  // conclusão honesta. Se não tocar (404, autoplay barrado), cai na voz do
  // aparelho.
  const startNeural = useCallback(
    (fromSec) => {
      const url = audioUrl(vision.id, lang);
      if (!url) return false;
      const token = sessionRef.current + 1;
      sessionRef.current = token;
      stopSpeaking();
      haltNeural(false);
      let el;
      try {
        el = new Audio(url);
      } catch (e) {
        return false;
      }
      setMode('neural');
      setIdx(0);
      setElapsed(Math.floor(fromSec) || 0);
      setStarted(true);
      setCompleted(false);
      setFailed(false);
      setVolumeNote(false);
      setPlaying(true);

      const falhou = () => {
        if (sessionRef.current !== token) return;
        haltNeural(false);
        setPlaying(false);
        setMode('voice');
        if (speechOk && linesRef.current.length && speakLineRef.current) {
          speakLineRef.current(0);
        } else {
          setStarted(false);
          setFailed(true);
        }
      };

      el.preload = 'auto';
      el.onended = () => {
        if (sessionRef.current !== token) return;
        if (neuralDur > 0) setElapsed(neuralDur);
        finish();
      };
      el.onerror = falhou;
      // Retomada: o navegador só aceita o seek com os metadados carregados.
      if (fromSec > 1) {
        const seek = () => {
          try {
            el.currentTime = fromSec;
          } catch (e) {}
        };
        if (el.readyState >= 1) seek();
        else el.addEventListener('loadedmetadata', seek, { once: true });
      }
      audioRef.current = el;
      // play() DIRETO no gesto — qualquer await antes e o Safari corta o áudio.
      const p = el.play();
      if (p && p.catch) p.catch(falhou);
      return true;
    },
    [vision.id, lang, finish, speechOk, neuralDur, haltNeural]
  );

  // Trocou de visão ou de idioma: silêncio e roteiro do zero (as frases mudam).
  // O MP3 antigo é guardado (chave antiga ainda em keyRef) antes de trocar.
  useEffect(() => {
    sessionRef.current += 1;
    stopSpeaking();
    haltNeural(true);
    keyRef.current = `${vision.id}:${lang}`;
    setResumeAt(RESUME.get(keyRef.current) || 0);
    setPlaying(false);
    setIdx(0);
    setStarted(false);
    setCompleted(false);
    setMode(null);
    setElapsed(0);
    setFailed(false);
    setVolumeNote(false);
    logged.current = false;
  }, [vision.id, lang, haltNeural]);

  // Relógio da locução neural: lê o currentTime REAL do elemento — é ele que
  // move a barra, permite retomar e registra a escuta a partir de ~70%.
  useEffect(() => {
    if (!playing || mode !== 'neural') return undefined;
    const tick = setInterval(() => {
      const el = audioRef.current;
      if (!el) return;
      const pos = el.currentTime || 0;
      setElapsed(neuralDur > 0 ? Math.min(neuralDur, Math.floor(pos)) : Math.floor(pos));
      // Quem ouviu ~70% viveu a cena: registra aqui, não só no fim do arquivo.
      if (!logged.current && neuralDur > 0 && pos >= neuralDur * 0.7) {
        logged.current = true;
        logVisionPlay(vision.id);
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [playing, mode, neuralDur, vision.id, logVisionPlay]);

  // Saiu da tela (aba, back, outra rota): a voz para junto.
  useEffect(() => {
    if (!isFocused) stopVoice();
  }, [isFocused, stopVoice]);

  // Unmount: nunca deixar voz tocando com a tela fechada — e a posição do MP3
  // fica guardada para a próxima visita oferecer "Continuar de 0:12".
  useEffect(
    () => () => {
      sessionRef.current += 1;
      stopSpeaking();
      haltNeural(true);
    },
    [haltNeural]
  );

  // Progresso: no MP3 é tempo real (tick x duração do arquivo); na voz do
  // aparelho são as frases JÁ TERMINADAS — contar a frase em curso como pronta
  // fazia a barra bater 100% com a última frase ainda sendo narrada.
  const finishedLines = completed ? total : started ? idx : 0;
  const neuralLeft = neuralDur > 0 ? Math.max(0, neuralDur - elapsed) : null;
  const progress = completed
    ? 100
    : usingNeural
    ? neuralDur > 0
      ? Math.min(100, Math.round((elapsed / neuralDur) * 100))
      : 0
    : pct(finishedLines, total);
  // Sem duração real não existe barra: melhor nenhum número que um inventado.
  const showTrack = usingNeural ? neuralDur > 0 : total > 0;

  const leftLabel = !started
    ? t(S.ready)
    : usingNeural
    ? neuralDur > 0
      ? formatTime(Math.min(elapsed, neuralDur))
      : ''
    : t(S.lineOf, { n: Math.min(idx + 1, total), total });

  // Sem MP3 não existe tempo real de narração: o lado direito fica vazio em vez
  // de estimar minutos que ninguém mediu.
  const rightLabel = completed
    ? t(S.endLabel)
    : !usingNeural || !(neuralDur > 0)
    ? ''
    : started
    ? t(S.remaining, { time: formatTime(neuralLeft) })
    : t(S.narration, { time: formatTime(neuralDur) });

  const goBack = () => {
    stopVoice();
    navigation.goBack();
  };

  // Safari só deixa falar a partir de um gesto: playId/speak saem DIRETO do
  // onPress, sem timer nem efeito no meio.
  const beginPlay = (from) => {
    // Depois de cair na voz do aparelho, o arquivo só é tentado de novo quando
    // não existe voz nenhuma — aí uma nova tentativa é a única saída.
    if (neuralOk && (mode !== 'voice' || !speechOk)) {
      if (startNeural(resumeAt)) return;
    }
    if (speechOk && total > 0) {
      speakLine(from);
      return;
    }
    setPlaying(false);
    setFailed(true);
  };

  const onPlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (playing) {
      stopVoice();
      return;
    }
    if (completed) {
      logged.current = false;
      setIdx(0);
      beginPlay(0);
      return;
    }
    beginPlay(idx);
  };

  const onPrev = () => {
    Haptics.selectionAsync().catch(() => {});
    speakLine(Math.max(0, idx - 1));
  };

  const onNext = () => {
    Haptics.selectionAsync().catch(() => {});
    if (idx + 1 >= total) {
      finish();
      return;
    }
    speakLine(idx + 1);
  };

  const finishNow = () => {
    // Conclusão honesta: no caminho do MP3, "Terminei" só vale se o áudio
    // ANDOU (currentTime > 1). Senão, convite a checar o volume — nada é
    // declarado nem registrado. Na voz do aparelho segue como sempre foi.
    if (usingNeural) {
      const el = audioRef.current;
      const pos = (el && el.currentTime) || elapsed || resumeAt || 0;
      if (!(pos > 1)) {
        setVolumeNote(true);
        return;
      }
    }
    finish();
  };

  // Voltou com posição guardada: o convite "Continuar de 0:12" fica visível
  // no lugar do "toque para começar".
  const showResume = !playing && !completed && usingNeural && resumeAt > 1;
  const leftLabelFinal = showResume
    ? t(S.resumeFrom, { time: formatTime(Math.floor(resumeAt)) })
    : leftLabel;

  const mainLabel = playing
    ? t(S.stop)
    : (started && !completed) || showResume
    ? t(S.resume)
    : t(S.play);

  return (
    <Screen>
      <View style={styles.navRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={t(S.back)}
          style={[styles.navBtn, { backgroundColor: alpha(color, 0.14) }]}
        >
          <Ionicons name="chevron-back" size={20} color={color} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            toggleSavedVision(vision.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={isSaved ? t(S.unsave) : t(S.save)}
          style={[styles.navBtn, { backgroundColor: alpha(color, 0.14) }]}
        >
          <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={color} />
        </TouchableOpacity>
      </View>

      <Header title={vision.title} subtitle={t(S.subtitle, { category: catLabel })} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <GradientCover
          accent={vision.accent}
          radius={26}
          style={[styles.stage, compact && styles.stageCompact]}
        >
          <View style={[styles.pill, { backgroundColor: alpha('#FFFFFF', 0.28) }]}>
            <Ionicons name={categoryMeta(vision.category).icon} size={12} color="#FFFFFF" />
            <Text style={styles.pillText}>{catLabel}</Text>
          </View>
          <Text style={[styles.caption, compact && styles.captionCompact]}>{vision.caption}</Text>
          {canNarrate && showTrack ? (
            <View style={styles.waveRow}>
              {Array.from({ length: 22 }).map((_, i) => {
                const active = (i / 22) * 100 <= progress;
                const h = 8 + ((i * 13) % 26);
                return (
                  <View
                    key={i}
                    style={[
                      styles.wave,
                      {
                        height: h,
                        backgroundColor: active ? '#FFFFFF' : alpha('#FFFFFF', 0.35),
                      },
                    ]}
                  />
                );
              })}
            </View>
          ) : null}
        </GradientCover>

        {canNarrate ? (
          <>
            {showTrack ? (
              <View style={[styles.trackWrap, { backgroundColor: alpha(color, 0.16) }]}>
                <View style={[styles.trackFill, { width: `${progress}%`, backgroundColor: color }]} />
              </View>
            ) : null}
            <View style={styles.timeRow}>
              <Text style={[styles.time, { color: th.textMuted }]}>{leftLabelFinal}</Text>
              <Text style={[styles.time, { color: th.textMuted }]}>{rightLabel}</Text>
            </View>

            <View style={styles.controls}>
              {showLineBtns ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={onPrev}
                  accessibilityRole="button"
                  accessibilityLabel={t(S.prev)}
                  style={[styles.smallBtn, { backgroundColor: alpha(color, 0.12) }]}
                >
                  <Ionicons name="play-back" size={20} color={color} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onPlayPause}
                accessibilityRole="button"
                accessibilityLabel={mainLabel}
                style={[styles.playBtn, { backgroundColor: color }]}
              >
                <Ionicons name={playing ? 'stop' : 'play'} size={30} color="#FFFFFF" />
              </TouchableOpacity>
              {showLineBtns ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={onNext}
                  accessibilityRole="button"
                  accessibilityLabel={t(S.next)}
                  style={[styles.smallBtn, { backgroundColor: alpha(color, 0.12) }]}
                >
                  <Ionicons name="play-forward" size={20} color={color} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Antes do primeiro play da sessão: a chavinha de silencioso do
                iPhone corta o áudio sem nenhum erro — a linha avisa antes. */}
            {!started ? (
              <Text style={[styles.tip, { color: th.textMuted }]}>{t(S.soundTip)}</Text>
            ) : null}
          </>
        ) : null}

        {failed ? (
          <View style={[styles.noteBox, { backgroundColor: alpha(color, 0.1) }]}>
            <Ionicons name="alert-circle-outline" size={18} color={color} />
            <Text style={[styles.noteText, { color: th.textMuted }]}>{t(S.audioFail)}</Text>
          </View>
        ) : null}

        {volumeNote ? (
          <View style={[styles.noteBox, { backgroundColor: alpha(color, 0.1) }]}>
            <Ionicons name="volume-mute-outline" size={18} color={color} />
            <Text style={[styles.noteText, { color: th.textMuted }]}>{t(S.checkVolume)}</Text>
          </View>
        ) : null}

        {!canNarrate ? (
          <View style={[styles.noteBox, { backgroundColor: alpha(color, 0.1) }]}>
            <Ionicons name="book-outline" size={18} color={color} />
            <Text style={[styles.noteText, { color: th.textMuted }]}>{t(S.noSpeech)}</Text>
          </View>
        ) : null}

        <View style={styles.scriptWrap}>
          {total > 0 ? (
            lines.map((line, i) => {
              // No arquivo único não dá para saber a frase em curso — nenhuma
              // fica em destaque em vez de destacar a errada.
              const active = !usingNeural && started && i === idx && !completed;
              return (
                <Text
                  key={`${vision.id}-${i}`}
                  style={[
                    styles.scriptLine,
                    {
                      color: active ? th.text : th.textMuted,
                      fontWeight: active ? '600' : '400',
                    },
                  ]}
                >
                  {line}
                </Text>
              );
            })
          ) : (
            <Text style={[styles.scriptLine, { color: th.text }]}>{vision.script}</Text>
          )}
        </View>

        {completed ? (
          <View style={[styles.doneBox, { backgroundColor: alpha(color, 0.12) }]}>
            <Ionicons name="checkmark-circle" size={20} color={color} />
            <Text style={[styles.doneText, { color }]}>{t(S.done)}</Text>
          </View>
        ) : (
          <PrimaryButton
            label={t(S.finish)}
            icon="checkmark-done"
            accent={vision.accent}
            variant="soft"
            onPress={finishNow}
            style={{ marginTop: 20 }}
          />
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  navBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  stage: { height: 320, padding: 20, justifyContent: 'space-between' },
  // Celular (390x664): palco menor para play + controles caberem sem rolagem.
  stageCompact: { height: 200, padding: 16 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  pillText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700', marginLeft: 5 },
  caption: {
    color: '#FFFFFF',
    fontSize: 25,
    lineHeight: 35,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  captionCompact: { fontSize: 19, lineHeight: 26 },
  tip: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 14 },
  waveRow: { flexDirection: 'row', alignItems: 'flex-end', height: 36 },
  wave: { width: 4, borderRadius: 2, marginRight: 5 },
  trackWrap: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 22 },
  trackFill: { height: 6, borderRadius: 3 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { fontSize: 11.5, fontWeight: '600' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  smallBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 22,
  },
  playBtn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginTop: 22,
  },
  noteText: { fontSize: 13, marginLeft: 10, flex: 1, lineHeight: 19 },
  scriptWrap: { marginTop: 26 },
  scriptLine: { fontSize: 15, lineHeight: 25, marginBottom: 8 },
  doneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    marginTop: 20,
  },
  doneText: { fontSize: 13.5, fontWeight: '700', marginLeft: 10, flex: 1 },
});
