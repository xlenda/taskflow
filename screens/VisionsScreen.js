import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Screen, Header, Card, EmptyState } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { CATEGORIES, categoryMeta } from '../constants/content';
import { useT } from '../utils/useT';
import { accentAt, alpha } from '../utils/colors';
import { usePersonalNarration } from '../utils/usePersonalNarration';
import { useCloudMediaConsent } from '../utils/useCloudMediaConsent';
import { personalJourneyItemsForState } from '../utils/personalJourney';

import GradientCover from '../components/GradientCover';
import SectionHeading from '../components/SectionHeading';

const GAP = 14;
const PLAYBACK_PREFIX = 'visions:';

const S = {
  title: { en: 'Visions', pt: 'Visões' },
  subtitle: { en: 'Meet your future self', pt: 'Encontre quem você está se tornando' },
  leadA: { en: 'Swipe to the vision you want to ', pt: 'Deslize até a visão em que você quer ' },
  leadB: { en: 'step into…', pt: 'entrar…' },
  personalNarration: { en: 'Your personal narration', pt: 'Sua narração pessoal' },
  audioPreparing: { en: 'Preparing your narration', pt: 'Preparando sua narração' },
  resumeNow: { en: 'Continue the narration', pt: 'Continuar a narração' },
  emptyTitle: { en: 'Your first vision is waiting', pt: 'Sua primeira visão está esperando' },
  emptyBody: {
    en: 'Create a manifestation and Celeste will turn your answers into a vision made only for you.',
    pt: 'Crie uma manifestação e a Celeste transforma suas respostas em uma visão feita só para você.',
  },
  save: { en: 'Save this vision', pt: 'Salvar esta visão' },
  unsave: { en: 'Remove from saved', pt: 'Tirar dos salvos' },
  savedTitle: { en: 'Saved visions', pt: 'Visões salvas' },
  savedEmptyTitle: { en: 'No saved visions yet', pt: 'Nenhuma visão salva ainda' },
  savedEmptyBody: {
    en: 'Tap the bookmark on a personal vision to keep it close.',
    pt: 'Toque no marcador de uma visão pessoal para deixá-la pertinho.',
  },
  recentTitle: { en: 'Recently stepped into', pt: 'Onde você entrou recentemente' },
  recentEmptyTitle: { en: 'Nothing played yet', pt: 'Nada tocado ainda' },
  recentEmptyBody: {
    en: 'Your listening history will show up here.',
    pt: 'Seu histórico de escuta vai aparecer aqui.',
  },
  replay: { en: 'Play again', pt: 'Ouvir de novo' },
  playNow: { en: 'Play this vision now', pt: 'Tocar esta visão agora' },
  stopNow: { en: 'Stop the narration', pt: 'Parar a narração' },
  audioUnavailable: {
    en: 'Audio is unavailable. Your vision remains here in text.',
    pt: 'O áudio não está disponível. Sua visão continua aqui em texto.',
  },
  visualPreparing: { en: 'Preparing your image', pt: 'Preparando sua imagem' },
  visualRetry: { en: 'Try the image again', pt: 'Tentar a imagem novamente' },
  visualActivate: { en: 'Enable my personal image', pt: 'Ativar minha imagem pessoal' },
  all: { en: 'All', pt: 'Todas' },
};

const CAT = {
  Love: { en: 'Love', pt: 'Amor' },
  Wealth: { en: 'Wealth', pt: 'Prosperidade' },
  Career: { en: 'Career', pt: 'Carreira' },
  Health: { en: 'Health', pt: 'Saúde' },
  Confidence: { en: 'Confidence', pt: 'Confiança' },
  Peace: { en: 'Peace', pt: 'Paz' },
};

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
};

function dateLabel(iso, lang) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(iso || '');
  const month = (MONTHS[lang] || MONTHS.en)[d.getMonth()];
  return lang === 'pt' ? `${d.getDate()} de ${month}` : `${month} ${d.getDate()}`;
}

export default function VisionsScreen() {
  const th = useTheme();
  const { t, lang } = useT();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const {
    state,
    loading,
    toggleSavedVision,
    logVisionPlay,
    personalVisualStatus,
    ensureJourneyVisual,
  } = useApp();
  const {
    activePlaybackId,
    lastCompletedPlaybackId,
    phase: narrationPhase,
    personalNarrationAvailable,
    playPersonal,
    resume: resumeNarration,
    stop: stopNarration,
  } = usePersonalNarration();
  const { withCloudMediaConsent } = useCloudMediaConsent();
  const [index, setIndex] = useState(0);
  const [filter, setFilter] = useState('All');
  const [audioFailedId, setAudioFailedId] = useState(null);
  const scrollRef = useRef(null);
  const playSessionRef = useRef(0);
  const activePlaybackIdRef = useRef(activePlaybackId);
  const handledCompletionRef = useRef(null);
  const attemptedPlaybackRef = useRef(null);
  const isFocused = useIsFocused();

  const activeVisionId =
    String(activePlaybackId || '').startsWith(PLAYBACK_PREFIX) &&
    (narrationPhase === 'loading' ||
      narrationPhase === 'playing' ||
      narrationPhase === 'paused' ||
      narrationPhase === 'ready')
      ? activePlaybackId.slice(PLAYBACK_PREFIX.length)
      : null;

  useEffect(() => {
    activePlaybackIdRef.current = activePlaybackId;
  }, [activePlaybackId]);

  useEffect(() => {
    if (
      !lastCompletedPlaybackId ||
      !lastCompletedPlaybackId.startsWith(PLAYBACK_PREFIX) ||
      attemptedPlaybackRef.current !== lastCompletedPlaybackId ||
      handledCompletionRef.current === lastCompletedPlaybackId
    ) {
      return;
    }
    handledCompletionRef.current = lastCompletedPlaybackId;
    attemptedPlaybackRef.current = null;
    logVisionPlay(lastCompletedPlaybackId.slice(PLAYBACK_PREFIX.length));
  }, [lastCompletedPlaybackId, logVisionPlay]);

  useEffect(() => {
    if (narrationPhase !== 'error' || !attemptedPlaybackRef.current) return;
    setAudioFailedId(attemptedPlaybackRef.current.slice(PLAYBACK_PREFIX.length));
    attemptedPlaybackRef.current = null;
  }, [narrationPhase]);

  const stopOwnedNarration = useCallback(() => {
    playSessionRef.current += 1;
    attemptedPlaybackRef.current = null;
    if (String(activePlaybackIdRef.current || '').startsWith(PLAYBACK_PREFIX)) {
      stopNarration();
    }
  }, [stopNarration]);

  const allVisions = useMemo(
    () => personalJourneyItemsForState(state, 'vision', lang).map((vision) => ({
      ...vision,
      caption: (vision.story.match(/^.*?[.!?…](?:\s|$)/)?.[0] || vision.story).trim(),
    })),
    [state, lang]
  );

  const populatedCategories = allVisions.length ? CATEGORIES : [];
  const activeFilter =
    filter === 'All' || populatedCategories.some((category) => category.key === filter)
      ? filter
      : 'All';
  const visions = useMemo(
    () =>
      activeFilter === 'All'
        ? allVisions
        : allVisions.filter((vision) => vision.category === activeFilter),
    [activeFilter, allVisions]
  );

  const visibleVision = visions[index] || visions[0];
  const visibleVisualPhase = visibleVision?.visualStatusKey
    ? personalVisualStatus[visibleVision.visualStatusKey]?.phase
    : null;
  useEffect(() => {
    if (!isFocused || !visibleVision) return;
    void ensureJourneyVisual(
      visibleVision.manifestationId,
      visibleVision.key,
      { lang: visibleVision.lang }
    );
  }, [
    ensureJourneyVisual,
    isFocused,
    visibleVision?.id,
    visibleVision?.lang,
    visibleVision?.visualBrief,
  ]);

  useEffect(() => {
    if (!isFocused && activeVisionId) {
      stopOwnedNarration();
    }
  }, [activeVisionId, isFocused, stopOwnedNarration]);

  useEffect(() => () => stopOwnedNarration(), [stopOwnedNarration]);

  useEffect(() => {
    if (activeVisionId && !visions.some((vision) => vision.id === activeVisionId)) {
      stopOwnedNarration();
    }
    setIndex((current) => Math.max(0, Math.min(current, Math.max(0, visions.length - 1))));
  }, [activeVisionId, visions, stopOwnedNarration]);

  const CARD_W = Math.min(640, Math.max(248, width - 72));
  const CARD_H = Math.min(448, Math.max(420, Math.round(CARD_W * 0.7)));

  const recent = useMemo(() => {
    if (!state) return [];
    const latest = new Map();
    state.visionPlays.forEach((play) => {
      if (!play || !play.visionId || !play.date) return;
      const current = latest.get(play.visionId);
      if (!current || String(play.date) > String(current.date)) latest.set(play.visionId, play);
    });
    return Array.from(latest.values())
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5)
      .map((play) => ({ ...play, vision: visions.find((vision) => vision.id === play.visionId) }))
      .filter((play) => play.vision);
  }, [state, visions]);

  const catLabel = (key) => (CAT[key] ? t(CAT[key]) : String(key || ''));

  const chooseFilter = (key) => {
    if (key === activeFilter) return;
    stopOwnedNarration();
    setAudioFailedId(null);
    setFilter(key);
    setIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
    Haptics.selectionAsync().catch(() => {});
  };

  if (loading || !state) {
    return (
      <Screen>
        <Header title={t(S.title)} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={th.accent} />
        </View>
      </Screen>
    );
  }

  const saved = visions.filter((vision) => state.savedVisions.includes(vision.id));

  const syncIndex = (event) => {
    if (!visions.length) return;
    const x = event.nativeEvent.contentOffset.x;
    const next = Math.max(0, Math.min(visions.length - 1, Math.round(x / (CARD_W + GAP))));
    if (next !== index) {
      setIndex(next);
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const onPlayCircle = async (vision) => {
    if (!personalNarrationAvailable) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const playbackId = `${PLAYBACK_PREFIX}${vision.id}`;
    if (activePlaybackId === playbackId && activeVisionId === vision.id) {
      if (narrationPhase === 'paused' || narrationPhase === 'ready') {
        setAudioFailedId(null);
        await resumeNarration();
      } else {
        stopOwnedNarration();
      }
      return;
    }

    const token = playSessionRef.current + 1;
    playSessionRef.current = token;
    setAudioFailedId(null);
    handledCompletionRef.current = null;
    attemptedPlaybackRef.current = playbackId;
    const result = await playPersonal({
      text: vision.story,
      lang: vision.lang,
      playbackId,
    });

    if (playSessionRef.current !== token) {
      if (result?.ok && activePlaybackIdRef.current === playbackId) stopNarration();
      return;
    }
    if (!result?.ok && result?.error !== 'audio_cancelled') {
      attemptedPlaybackRef.current = null;
      setAudioFailedId(vision.id);
    }
  };

  return (
    <Screen>
      <Header title={t(S.title)} subtitle={t(S.subtitle)} />
      <ScrollView
        style={styles.pageScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {allVisions.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilters}
          >
            {[{ key: 'All', accent: 0 }, ...populatedCategories].map((category) => {
              const selected = category.key === activeFilter;
              const color = accentAt(th, category.accent);
              return (
                <TouchableOpacity
                  key={category.key}
                  testID={`vision-filter-${category.key}`}
                  activeOpacity={0.8}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => chooseFilter(category.key)}
                  style={[
                    styles.categoryFilter,
                    {
                      backgroundColor: selected ? color : alpha(color, 0.12),
                      borderColor: alpha(color, 0.3),
                    },
                  ]}
                >
                  <Text style={[styles.categoryFilterText, { color: selected ? '#FFFFFF' : color }]}>
                    {category.key === 'All' ? t(S.all) : catLabel(category.key)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}
        <Text style={[styles.lead, { color: th.textMuted }]}>
          {t(S.leadA)}
          <Text style={[styles.leadItalic, { color: th.text }]}>{t(S.leadB)}</Text>
        </Text>

        {visions.length === 0 ? (
          <EmptyState icon="sparkles-outline" title={t(S.emptyTitle)} body={t(S.emptyBody)} />
        ) : (
          <>
            <ScrollView
              ref={scrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={CARD_W + GAP}
              decelerationRate="fast"
              onScroll={syncIndex}
              scrollEventThrottle={16}
              onMomentumScrollEnd={syncIndex}
              contentContainerStyle={styles.carousel}
            >
              {visions.map((vision) => {
                const isSaved = state.savedVisions.includes(vision.id);
                return (
                  <View
                    key={vision.id}
                    style={[
                      styles.slideShell,
                      { width: CARD_W, marginRight: GAP },
                      th.elevation?.e2,
                    ]}
                  >
                    <GradientCover
                      accent={vision.accent}
                      visualKey={vision.visualKey}
                      radius={28}
                      style={[styles.slide, { height: CARD_H }]}
                    >
                      <View style={styles.slideTop}>
                        {vision.category ? (
                          <View style={[styles.pill, { backgroundColor: alpha('#FFFFFF', 0.28) }]}>
                            <Ionicons name={categoryMeta(vision.category).icon} size={12} color="#FFFFFF" />
                            <Text style={styles.pillText}>{catLabel(vision.category)}</Text>
                          </View>
                        ) : (
                          <View />
                        )}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={(event) => {
                            event.stopPropagation?.();
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            toggleSavedVision(vision.id);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={isSaved ? t(S.unsave) : t(S.save)}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          style={styles.saveCircle}
                        >
                          <Ionicons
                            name={isSaved ? 'bookmark' : 'bookmark-outline'}
                            size={20}
                            color="#FFFFFF"
                          />
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.86}
                        onPress={() => navigation.navigate('VisionPlayer', { visionId: vision.id })}
                        accessibilityRole="button"
                        accessibilityLabel={vision.title}
                        style={styles.slideBody}
                      >
                        <Text
                          numberOfLines={6}
                          style={[styles.caption, { fontFamily: th.typeFamilies?.serif }]}
                        >
                          {vision.caption}
                        </Text>
                      </TouchableOpacity>

                      <View style={styles.slideBottom}>
                        {personalNarrationAvailable ? (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={(event) => {
                              event.stopPropagation?.();
                              void onPlayCircle(vision);
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={
                              activeVisionId === vision.id &&
                              (narrationPhase === 'paused' || narrationPhase === 'ready')
                                ? t(S.resumeNow)
                                : activeVisionId === vision.id
                                ? t(S.stopNow)
                                : t(S.playNow)
                            }
                            style={[styles.playCircle, { backgroundColor: alpha('#FFFFFF', 0.92) }]}
                          >
                            {activeVisionId === vision.id && narrationPhase === 'loading' ? (
                              <ActivityIndicator size="small" color={accentAt(th, vision.accent)} />
                            ) : (
                              <Ionicons
                                name={
                                  activeVisionId === vision.id && narrationPhase === 'playing'
                                    ? 'stop'
                                    : 'play'
                                }
                                size={20}
                                color={accentAt(th, vision.accent)}
                              />
                            )}
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => navigation.navigate('VisionPlayer', { visionId: vision.id })}
                          accessible={false}
                          style={styles.slideMeta}
                        >
                          <Text numberOfLines={1} style={styles.slideTitle}>
                            {vision.title}
                          </Text>
                          <Text style={styles.slideDur}>
                            {!personalNarrationAvailable
                              ? t(S.audioUnavailable)
                              : activeVisionId === vision.id && narrationPhase === 'loading'
                              ? t(S.audioPreparing)
                              : audioFailedId === vision.id
                              ? t(S.audioUnavailable)
                              : t(S.personalNarration)}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </GradientCover>
                  </View>
                );
              })}
            </ScrollView>

            {visibleVisualPhase === 'pending' ? (
              <View
                testID="visions-personal-visual-pending"
                accessibilityLiveRegion="polite"
                style={styles.visualStatusRow}
              >
                <ActivityIndicator size="small" color={accentAt(th, visibleVision.accent)} />
                <Text style={[styles.visualStatusText, { color: th.textMuted }]}>
                  {t(S.visualPreparing)}
                </Text>
              </View>
            ) : visibleVisualPhase === 'error' || visibleVisualPhase === 'consent_required' ? (
              <TouchableOpacity
                testID="visions-personal-visual-retry"
                activeOpacity={0.76}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  void withCloudMediaConsent((profile) =>
                    ensureJourneyVisual(visibleVision.manifestationId, visibleVision.key, {
                      force: true,
                      lang: visibleVision.lang,
                      profile,
                    })
                  );
                }}
                accessibilityRole="button"
                accessibilityLabel={t(
                  visibleVisualPhase === 'consent_required' ? S.visualActivate : S.visualRetry
                )}
                style={[
                  styles.visualRetry,
                  {
                    backgroundColor: alpha(accentAt(th, visibleVision.accent), 0.1),
                    borderColor: alpha(accentAt(th, visibleVision.accent), 0.28),
                  },
                ]}
              >
                <Ionicons name="refresh" size={16} color={accentAt(th, visibleVision.accent)} />
                <Text
                  style={[
                    styles.visualRetryText,
                    { color: accentAt(th, visibleVision.accent) },
                  ]}
                >
                  {t(visibleVisualPhase === 'consent_required' ? S.visualActivate : S.visualRetry)}
                </Text>
              </TouchableOpacity>
            ) : null}

            <View style={styles.dots}>
              {visions.map((vision, dotIndex) => (
                <View
                  key={vision.id}
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        dotIndex === index ? accentAt(th, dotIndex) : alpha(th.textMuted, 0.25),
                      width: dotIndex === index ? 20 : 7,
                    },
                  ]}
                />
              ))}
            </View>

            <SectionHeading title={t(S.savedTitle)} />
            {saved.length === 0 ? (
              <EmptyState
                icon="bookmark-outline"
                title={t(S.savedEmptyTitle)}
                body={t(S.savedEmptyBody)}
              />
            ) : (
              saved.map((vision) => (
                <TouchableOpacity
                  key={vision.id}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('VisionPlayer', { visionId: vision.id })}
                  accessibilityRole="button"
                  accessibilityLabel={vision.title}
                >
                  <Card style={[styles.row, { backgroundColor: th.surface }]}>
                    <GradientCover
                      accent={vision.accent}
                      visualKey={vision.visualKey}
                      radius={12}
                      style={styles.thumb}
                    />
                    <View style={styles.rowBody}>
                      <Text numberOfLines={1} style={[styles.rowTitle, { color: th.text }]}>
                        {vision.title}
                      </Text>
                      <Text numberOfLines={1} style={[styles.rowSub, { color: th.textMuted }]}>
                        {catLabel(vision.category)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        toggleSavedVision(vision.id);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t(S.unsave)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={styles.rowAction}
                    >
                      <Ionicons name="bookmark" size={20} color={accentAt(th, vision.accent)} />
                    </TouchableOpacity>
                    <Ionicons name="play-circle" size={26} color={accentAt(th, vision.accent)} />
                  </Card>
                </TouchableOpacity>
              ))
            )}

            <SectionHeading title={t(S.recentTitle)} />
            {recent.length === 0 ? (
              <EmptyState
                icon="time-outline"
                title={t(S.recentEmptyTitle)}
                body={t(S.recentEmptyBody)}
              />
            ) : (
              recent.map((play) => (
                <TouchableOpacity
                  key={play.visionId}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('VisionPlayer', { visionId: play.visionId })}
                  accessibilityRole="button"
                  accessibilityLabel={`${play.vision.title} — ${t(S.replay)}`}
                >
                  <Card style={[styles.row, { backgroundColor: th.surface }]}>
                    <View
                      style={[
                        styles.histIcon,
                        { backgroundColor: alpha(accentAt(th, play.vision.accent), 0.15) },
                      ]}
                    >
                      <Ionicons name="headset" size={17} color={accentAt(th, play.vision.accent)} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text numberOfLines={1} style={[styles.rowTitle, { color: th.text }]}>
                        {play.vision.title}
                      </Text>
                      <Text style={[styles.rowSub, { color: th.textMuted }]}>
                        {dateLabel(play.date, lang)}
                      </Text>
                    </View>
                    <Ionicons name="refresh" size={20} color={th.textMuted} />
                  </Card>
                </TouchableOpacity>
              ))
            )}
          </>
        )}
        <View style={styles.bottomSpace} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pageScroll: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  categoryFilters: { gap: 8, paddingRight: 16, paddingBottom: 16 },
  categoryFilter: {
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
  },
  categoryFilterText: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0 },
  lead: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginBottom: 20, marginTop: 4 },
  leadItalic: { fontStyle: 'italic', fontWeight: '600' },
  carousel: { paddingRight: 16, paddingBottom: 4 },
  slideShell: { borderRadius: 28 },
  slide: { padding: 20, justifyContent: 'space-between' },
  slideTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  saveCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,12,22,0.32)',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillText: { color: '#FFFFFF', fontSize: 11.5, lineHeight: 16, fontWeight: '800', marginLeft: 6 },
  slideBody: { flex: 1, justifyContent: 'center', paddingVertical: 18 },
  caption: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 36,
    fontWeight: '500',
    fontStyle: 'italic',
    letterSpacing: -0.25,
    textShadowColor: 'rgba(3,9,18,0.58)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  slideBottom: { flexDirection: 'row', alignItems: 'center' },
  playCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  slideMeta: { flex: 1, marginLeft: 14 },
  slideTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    textShadowColor: 'rgba(3,9,18,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  slideDur: { color: 'rgba(255,255,255,0.9)', fontSize: 12, lineHeight: 17, marginTop: 2 },
  visualStatusRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  visualStatusText: { fontSize: 12.5, lineHeight: 18, marginLeft: 8, textAlign: 'center' },
  visualRetry: {
    minHeight: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  visualRetryText: { fontSize: 12.5, lineHeight: 18, fontWeight: '700', marginLeft: 7 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  dot: { height: 7, borderRadius: 4, marginHorizontal: 3 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 84, padding: 12, borderRadius: 20, marginBottom: 12 },
  thumb: { width: 58, height: 58 },
  histIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, marginLeft: 14 },
  rowAction: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, lineHeight: 21, fontWeight: '700' },
  rowSub: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  bottomSpace: { height: 32 },
});
