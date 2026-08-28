import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Screen, Header, EmptyState, pct } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { categoryMeta } from '../constants/content';
import { useT } from '../utils/useT';
import { usePersonalNarration } from '../utils/usePersonalNarration';
import { accentAt, alpha } from '../utils/colors';
import { personalJourneyItemsForState } from '../utils/personalJourney';

import GradientCover from '../components/GradientCover';
import PrimaryButton from '../components/PrimaryButton';

const S = {
  pageTitle: { en: 'Visions', pt: 'Visões' },
  subtitle: { en: '{category} visualization', pt: 'Visualização de {category}' },
  back: { en: 'Back', pt: 'Voltar' },
  save: { en: 'Save this vision', pt: 'Salvar esta visão' },
  unsave: { en: 'Remove from saved', pt: 'Tirar dos salvos' },
  ready: { en: 'Press play to begin', pt: 'Toque para começar a ouvir' },
  lineOf: { en: 'Sentence {n} of {total}', pt: 'Frase {n} de {total}' },
  endLabel: { en: 'Complete', pt: 'Completa' },
  play: { en: 'Play narration', pt: 'Ouvir a narração' },
  resume: { en: 'Resume narration', pt: 'Continuar a narração' },
  stop: { en: 'Pause narration', pt: 'Pausar a narração' },
  soundTip: {
    en: 'This personal story is narrated with the voice you chose.',
    pt: 'Esta história pessoal é narrada com a voz que você escolheu.',
  },
  prev: { en: 'Previous sentence', pt: 'Frase anterior' },
  next: { en: 'Next sentence', pt: 'Próxima frase' },
  finish: { en: "I've finished this vision", pt: 'Terminei esta visão' },
  done: {
    en: 'Saved to your journey. You have stepped into it.',
    pt: 'Guardado na sua jornada. Você entrou nessa cena.',
  },
  noSpeech: {
    en: 'Personal narration is not available here. Your story remains ready to read below.',
    pt: 'A narração pessoal não está disponível aqui. Sua história continua pronta para ler abaixo.',
  },
  audioFail: {
    en: 'The narration did not play here. Read your personal story below at your own pace.',
    pt: 'A narração não tocou aqui. Leia sua história pessoal abaixo no seu ritmo.',
  },
  visualPreparing: { en: 'Preparing your image', pt: 'Preparando sua imagem' },
  visualRetry: { en: 'Try the image again', pt: 'Tentar a imagem novamente' },
  missingTitle: { en: 'This vision is no longer here', pt: 'Esta visão não está mais aqui' },
  missingBody: {
    en: 'It may have been removed. Return to your personal visions to choose another one.',
    pt: 'Ela pode ter sido removida. Volte às suas visões pessoais para escolher outra.',
  },
  backToVisions: { en: 'Back to my visions', pt: 'Voltar às minhas visões' },
};

const CAT = {
  Love: { en: 'Love', pt: 'Amor' },
  Wealth: { en: 'Wealth', pt: 'Prosperidade' },
  Career: { en: 'Career', pt: 'Carreira' },
  Health: { en: 'Health', pt: 'Saúde' },
  Confidence: { en: 'Confidence', pt: 'Confiança' },
  Peace: { en: 'Peace', pt: 'Paz' },
};

const splitNarration = (text) =>
  String(text || '')
    .split(/(?<=[.!?\u2026])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

export default function VisionPlayerScreen() {
  const th = useTheme();
  const { t, lang } = useT();
  const navigation = useNavigation();
  const route = useRoute();
  const {
    state,
    loading,
    toggleSavedVision,
    logVisionPlay,
    personalVisualStatus,
    ensureJourneyVisual,
  } = useApp();

  const routeId =
    typeof route.params?.visionId === 'string' && route.params.visionId.trim()
      ? route.params.visionId
      : null;
  const vision = useMemo(
    () => personalJourneyItemsForState(state, 'vision', lang)
      .find((item) => item.id === routeId) || null,
    [lang, routeId, state]
  );

  useEffect(() => {
    if (!vision) return;
    void ensureJourneyVisual(vision.manifestationId, vision.key, { lang: vision.lang });
  }, [ensureJourneyVisual, vision?.id, vision?.lang]);

  const backToVisions = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('VisionsMain');
  };

  if (loading || !state) {
    return (
      <Screen>
        <Header title={t(S.pageTitle)} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={th.accent} />
        </View>
      </Screen>
    );
  }

  if (!vision) {
    return (
      <Screen>
        <Header title={t(S.pageTitle)} />
        <ScrollView contentContainerStyle={styles.missingScroll}>
          <EmptyState
            icon="sparkles-outline"
            title={t(S.missingTitle)}
            body={t(S.missingBody)}
          />
          <PrimaryButton
            label={t(S.backToVisions)}
            icon="arrow-back"
            onPress={backToVisions}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <PersonalVisionPlayer
      vision={vision}
      state={state}
      navigation={navigation}
      toggleSavedVision={toggleSavedVision}
      logVisionPlay={logVisionPlay}
      visualStatus={personalVisualStatus[vision.visualStatusKey]}
      onRetryVisual={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        void ensureJourneyVisual(vision.manifestationId, vision.key, {
          force: true,
          lang: vision.lang,
        });
      }}
    />
  );
}

function PersonalVisionPlayer({
  vision,
  state,
  navigation,
  toggleSavedVision,
  logVisionPlay,
  visualStatus,
  onRetryVisual,
}) {
  const th = useTheme();
  const { t } = useT();
  const {
    activePlaybackId,
    lastCompletedPlaybackId,
    phase: narrationPhase,
    isLoading: narrationLoading,
    isPlaying: narrationPlaying,
    isPaused: narrationPaused,
    progress: narrationProgress,
    playPersonal,
    prime,
    pause,
    resume,
    stop,
  } = usePersonalNarration();
  const { height: winH } = useWindowDimensions();
  const compact = winH > 0 && winH < 760;
  const isFocused = useIsFocused();
  const color = accentAt(th, vision.accent);
  const isSaved = state.savedVisions.includes(vision.id);
  const catLabel = CAT[vision.category] ? t(CAT[vision.category]) : String(vision.category || '');
  const lines = useMemo(() => splitNarration(vision.story), [vision.story]);
  const caption = lines[0] || vision.title;
  const total = lines.length;
  const canNarrate = total > 0;
  const playbackId = `vision:${vision.id}`;
  const ownsPlayback = activePlaybackId === playbackId;
  const playing = ownsPlayback && (narrationLoading || narrationPlaying);

  const [idx, setIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [failed, setFailed] = useState(false);

  const requestEpochRef = useRef(0);
  const playbackStartedRef = useRef(false);
  const manualStopRef = useRef(false);
  const ownsAttemptRef = useRef(false);
  const activePlaybackIdRef = useRef(activePlaybackId);
  const ownedPlaybackIdRef = useRef(playbackId);
  const playbackOffsetRatioRef = useRef(0);
  const logged = useRef(false);

  useEffect(() => {
    activePlaybackIdRef.current = activePlaybackId;
  }, [activePlaybackId]);

  const stopVoice = useCallback(() => {
    requestEpochRef.current += 1;
    manualStopRef.current = true;
    ownsAttemptRef.current = false;
    playbackStartedRef.current = false;
    if (activePlaybackIdRef.current === ownedPlaybackIdRef.current) {
      stop();
    }
  }, [stop]);

  const recordFinish = useCallback(() => {
    playbackStartedRef.current = false;
    ownsAttemptRef.current = false;
    manualStopRef.current = false;
    playbackOffsetRatioRef.current = 0;
    setIdx(Math.max(0, total - 1));
    setStarted(true);
    setCompleted(true);
    setFailed(false);
    if (!logged.current) {
      logged.current = true;
      logVisionPlay(vision.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [logVisionPlay, total, vision.id]);

  const finish = useCallback(() => {
    stopVoice();
    recordFinish();
  }, [recordFinish, stopVoice]);

  useEffect(() => {
    requestEpochRef.current += 1;
    if (activePlaybackIdRef.current === ownedPlaybackIdRef.current) {
      manualStopRef.current = true;
      stop();
    }
    ownedPlaybackIdRef.current = playbackId;
    playbackStartedRef.current = false;
    ownsAttemptRef.current = false;
    playbackOffsetRatioRef.current = 0;
    setIdx(0);
    setStarted(false);
    setCompleted(false);
    setFailed(false);
    logged.current = false;
  }, [playbackId, stop, vision.lang]);

  useEffect(() => {
    if (!ownsPlayback) return;
    if (narrationPlaying) {
      playbackStartedRef.current = true;
      setStarted(true);
    }
    const remainingProgress = Math.min(1, Math.max(0, Number(narrationProgress) || 0));
    const offset = playbackOffsetRatioRef.current;
    const overallProgress = offset + remainingProgress * (1 - offset);
    if (total > 0) {
      setIdx(
        Math.min(total - 1, Math.max(0, Math.floor(overallProgress * total)))
      );
    }
  }, [
    narrationPlaying,
    narrationProgress,
    ownsPlayback,
    total,
  ]);

  useEffect(() => {
    if (!ownsAttemptRef.current) return;
    if (activePlaybackId && activePlaybackId !== playbackId) {
      ownsAttemptRef.current = false;
      playbackStartedRef.current = false;
      manualStopRef.current = false;
      return;
    }
    if (narrationPhase === 'error') {
      ownsAttemptRef.current = false;
      playbackStartedRef.current = false;
      manualStopRef.current = false;
      setFailed(true);
      return;
    }
    if (
      narrationPhase === 'idle' &&
      !ownsPlayback &&
      lastCompletedPlaybackId === playbackId &&
      playbackStartedRef.current
    ) {
      if (manualStopRef.current) {
        ownsAttemptRef.current = false;
        playbackStartedRef.current = false;
        manualStopRef.current = false;
      } else {
        recordFinish();
      }
    }
  }, [
    activePlaybackId,
    lastCompletedPlaybackId,
    narrationPhase,
    ownsPlayback,
    playbackId,
    recordFinish,
  ]);

  useEffect(() => {
    if (!isFocused) stopVoice();
  }, [isFocused, stopVoice]);

  useEffect(
    () => () => {
      requestEpochRef.current += 1;
      if (activePlaybackIdRef.current === ownedPlaybackIdRef.current) {
        manualStopRef.current = true;
        stop();
      }
    },
    [stop]
  );

  const finishedLines = completed ? total : started ? idx : 0;
  const remainingProgress = Math.min(1, Math.max(0, Number(narrationProgress) || 0));
  const overallProgress = ownsPlayback
    ? playbackOffsetRatioRef.current + remainingProgress * (1 - playbackOffsetRatioRef.current)
    : total > 0
    ? finishedLines / total
    : 0;
  const progress = completed ? 100 : pct(overallProgress, 1);
  const leftLabel = !started
    ? t(S.ready)
    : t(S.lineOf, { n: Math.min(idx + 1, total), total });
  const rightLabel = completed ? t(S.endLabel) : '';
  const mainLabel = playing
    ? t(S.stop)
    : started && !completed
    ? t(S.resume)
    : t(S.play);

  const goBack = () => {
    stopVoice();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('VisionsMain');
  };

  const startNarration = async (lineIndex) => {
    prime?.();
    if (!canNarrate) return;
    const at = Math.min(total - 1, Math.max(0, lineIndex));
    const requestEpoch = requestEpochRef.current + 1;
    requestEpochRef.current = requestEpoch;
    playbackOffsetRatioRef.current = at > 0 ? at / total : 0;
    manualStopRef.current = false;
    playbackStartedRef.current = false;
    ownsAttemptRef.current = true;
    setIdx(at);
    setStarted(true);
    setCompleted(false);
    setFailed(false);

    const result = await playPersonal({
      text: lines.slice(at).join(' '),
      lang: vision.lang,
      playbackId,
    });
    if (requestEpoch !== requestEpochRef.current) {
      if (
        ownedPlaybackIdRef.current !== playbackId &&
        activePlaybackIdRef.current === playbackId
      ) {
        stop();
      }
      return;
    }
    if (!result?.ok) {
      ownsAttemptRef.current = false;
      playbackStartedRef.current = false;
      if (result?.error !== 'audio_cancelled') setFailed(true);
    }
  };

  const moveToLine = (lineIndex) => {
    const at = Math.min(total - 1, Math.max(0, lineIndex));
    setIdx(at);
    setStarted(true);
    setCompleted(false);
    setFailed(false);
    if (ownsPlayback) {
      startNarration(at);
      return;
    }
    startNarration(at);
  };

  const onPlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (ownsPlayback && narrationLoading) {
      stopVoice();
      return;
    }
    if (ownsPlayback && narrationPlaying) {
      pause();
      return;
    }
    if (ownsPlayback && narrationPaused) {
      resume();
      return;
    }
    if (completed) {
      logged.current = false;
      setIdx(0);
      startNarration(0);
      return;
    }
    startNarration(idx);
  };

  const onPrev = () => {
    Haptics.selectionAsync().catch(() => {});
    moveToLine(Math.max(0, idx - 1));
  };

  const onNext = () => {
    Haptics.selectionAsync().catch(() => {});
    if (idx + 1 >= total) {
      finish();
      return;
    }
    moveToLine(idx + 1);
  };

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
          visualKey={vision.visualKey}
          radius={26}
          style={[styles.stage, compact && styles.stageCompact]}
        >
          <View style={[styles.pill, { backgroundColor: alpha('#FFFFFF', 0.28) }]}>
            <Ionicons name={categoryMeta(vision.category).icon} size={12} color="#FFFFFF" />
            <Text style={styles.pillText}>{catLabel}</Text>
          </View>
          <Text numberOfLines={compact ? 5 : 7} style={[styles.caption, compact && styles.captionCompact]}>
            {caption}
          </Text>
          {canNarrate ? (
            <View style={styles.waveRow}>
              {Array.from({ length: 22 }).map((_, barIndex) => {
                const active = (barIndex / 22) * 100 <= progress;
                const height = 8 + ((barIndex * 13) % 26);
                return (
                  <View
                    key={barIndex}
                    style={[
                      styles.wave,
                      {
                        height,
                        backgroundColor: active ? '#FFFFFF' : alpha('#FFFFFF', 0.35),
                      },
                    ]}
                  />
                );
              })}
            </View>
          ) : null}
        </GradientCover>

        {visualStatus?.phase === 'pending' ? (
          <View
            testID="vision-player-personal-visual-pending"
            accessibilityLiveRegion="polite"
            style={styles.visualStatusRow}
          >
            <ActivityIndicator size="small" color={color} />
            <Text style={[styles.visualStatusText, { color: th.textMuted }]}>
              {t(S.visualPreparing)}
            </Text>
          </View>
        ) : visualStatus?.phase === 'error' ? (
          <TouchableOpacity
            testID="vision-player-personal-visual-retry"
            activeOpacity={0.76}
            onPress={onRetryVisual}
            accessibilityRole="button"
            accessibilityLabel={t(S.visualRetry)}
            style={[
              styles.visualRetry,
              { backgroundColor: alpha(color, 0.1), borderColor: alpha(color, 0.28) },
            ]}
          >
            <Ionicons name="refresh" size={16} color={color} />
            <Text style={[styles.visualRetryText, { color }]}>{t(S.visualRetry)}</Text>
          </TouchableOpacity>
        ) : null}

        {canNarrate ? (
          <>
            <View style={[styles.trackWrap, { backgroundColor: alpha(color, 0.16) }]}>
              <View style={[styles.trackFill, { width: `${progress}%`, backgroundColor: color }]} />
            </View>
            <View style={styles.timeRow}>
              <Text style={[styles.time, { color: th.textMuted }]}>{leftLabel}</Text>
              <Text style={[styles.time, { color: th.textMuted }]}>{rightLabel}</Text>
            </View>

            <View style={styles.controls}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onPrev}
                accessibilityRole="button"
                accessibilityLabel={t(S.prev)}
                style={[styles.smallBtn, { backgroundColor: alpha(color, 0.12) }]}
              >
                <Ionicons name="play-back" size={20} color={color} />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onPlayPause}
                accessibilityRole="button"
                accessibilityLabel={mainLabel}
                style={[styles.playBtn, { backgroundColor: color }]}
              >
                <Ionicons name={playing ? 'pause' : 'play'} size={30} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onNext}
                accessibilityRole="button"
                accessibilityLabel={t(S.next)}
                style={[styles.smallBtn, { backgroundColor: alpha(color, 0.12) }]}
              >
                <Ionicons name="play-forward" size={20} color={color} />
              </TouchableOpacity>
            </View>

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

        {!canNarrate ? (
          <View style={[styles.noteBox, { backgroundColor: alpha(color, 0.1) }]}>
            <Ionicons name="book-outline" size={18} color={color} />
            <Text style={[styles.noteText, { color: th.textMuted }]}>{t(S.noSpeech)}</Text>
          </View>
        ) : null}

        <View style={styles.scriptWrap}>
          {lines.map((line, lineIndex) => {
            const active = started && lineIndex === idx && !completed;
            return (
              <Text
                key={`${vision.id}-${lineIndex}`}
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
          })}
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
            onPress={finish}
            style={styles.finishButton}
          />
        )}
        <View style={styles.bottomSpace} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  missingScroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 36 },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  navBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  stage: { height: 320, padding: 20, justifyContent: 'space-between' },
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
  visualStatusRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  visualStatusText: { fontSize: 12.5, lineHeight: 18, marginLeft: 8, textAlign: 'center' },
  visualRetry: {
    minHeight: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  visualRetryText: { fontSize: 12.5, lineHeight: 18, fontWeight: '700', marginLeft: 7 },
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
  finishButton: { marginTop: 20 },
  bottomSpace: { height: 32 },
});
