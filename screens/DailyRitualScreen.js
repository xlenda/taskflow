import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Screen, EmptyState } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { RELEASE_FEATURES } from '../constants/releaseFeatures';
import { useT } from '../utils/useT';
import { todayISO } from '../utils/date';
import { selectDailyRitual, dailyRitualNarration } from '../utils/dailyRitual';
import { bridgeDoneOn, livingMirrorStatus } from '../utils/livingMirror';
import { usePersonalNarration } from '../utils/usePersonalNarration';
import { accentAt, alpha } from '../utils/colors';
import PrimaryButton from '../components/PrimaryButton';
import {
  cancelDailyRitualReminder,
  getDailyRitualReminderStatus,
  scheduleDailyRitualReminder,
} from '../services/dailyRitualReminder';

const REMINDER_TIMES = ['08:00', '12:30', '20:30'];

const S = {
  title: { pt: 'Seu minuto Celeste', en: 'Your Celeste minute' },
  eyebrow: { pt: 'Ritual de hoje', en: "Today's ritual" },
  close: { pt: 'Voltar', en: 'Go back' },
  chapter: { pt: 'Capítulo {n}', en: 'Chapter {n}' },
  chosen: { pt: 'Sua afirmação escolhida', en: 'Your chosen affirmation' },
  dream: { pt: 'A frase do seu sonho', en: 'Your dream affirmation' },
  ready: { pt: 'Um minuto. Uma frase. Um passo possível.', en: 'One minute. One phrase. One possible step.' },
  start: { pt: 'Começar meu minuto', en: 'Start my minute' },
  preparing: { pt: 'Preparando sua voz…', en: 'Preparing your voice…' },
  pause: { pt: 'Pausar', en: 'Pause' },
  resume: { pt: 'Continuar', en: 'Continue' },
  seconds: { pt: 'segundos', en: 'seconds' },
  listening: { pt: 'Ouça, repita e deixe a frase pousar.', en: 'Listen, repeat, and let the words settle.' },
  reading: {
    pt: 'A voz não ficou disponível. Leia a frase no seu ritmo; o minuto continua valendo.',
    en: 'The voice was unavailable. Read at your own pace; the minute still counts.',
  },
  done: { pt: 'Seu minuto está feito', en: 'Your minute is complete' },
  doneBody: {
    pt: 'A prática de hoje entrou na sua jornada.',
    en: "Today's practice is now part of your journey.",
  },
  bridge: { pt: 'Sua ponte para hoje', en: 'Your bridge for today' },
  bridgeDone: { pt: 'Ponte feita hoje', en: 'Bridge completed today' },
  doBridge: { pt: 'Fiz esta ponte', en: 'I completed this bridge' },
  evolve: { pt: 'Criar próximo capítulo', en: 'Create next chapter' },
  evolving: { pt: 'Criando seu próximo capítulo…', en: 'Creating your next chapter…' },
  evolved: { pt: 'Capítulo {n} pronto', en: 'Chapter {n} is ready' },
  openChapter: { pt: 'Abrir meu novo capítulo', en: 'Open my new chapter' },
  evolutionFailed: {
    pt: 'O novo capítulo não ficou pronto. Sua cena atual continua guardada; tente novamente depois.',
    en: 'The new chapter was not ready. Your current scene is still saved; try again later.',
  },
  evolvedToday: {
    pt: 'Seu espelho já evoluiu hoje.',
    en: 'Your mirror has already evolved today.',
  },
  memory: { pt: 'Celeste lembrou', en: 'Celeste remembered' },
  practiceCount: { pt: '{n} dias', en: '{n} days' },
  bridgeCount: { pt: '{n} pontes', en: '{n} bridges' },
  traceCount: { pt: '{n} rastros', en: '{n} traces' },
  dreamTheme: { pt: 'tema do sonho', en: 'dream theme' },
  emptyTitle: { pt: 'Seu primeiro minuto nasce de você', en: 'Your first minute starts with you' },
  emptyBody: {
    pt: 'Crie uma manifestação ou transforme um sonho para receber uma afirmação pessoal.',
    en: 'Create a manifestation or transform a dream to receive a personal affirmation.',
  },
  goHome: { pt: 'Criar minha afirmação', en: 'Create my affirmation' },
  reminderTitle: { pt: 'Lembrete diário', en: 'Daily reminder' },
  reminderBody: {
    pt: 'Uma chamada discreta para abrir seu minuto.',
    en: 'A discreet invitation to open your minute.',
  },
  reminderTimes: { pt: 'Horário do lembrete', en: 'Reminder time' },
  reminderWeb: {
    pt: 'O lembrete do sistema fica disponível no app instalado.',
    en: 'The system reminder is available in the installed app.',
  },
  reminderFailed: {
    pt: 'O lembrete não foi ativado. Verifique a permissão de notificações do Celeste.',
    en: 'The reminder was not enabled. Check Celeste notification permission.',
  },
};

export default function DailyRitualScreen() {
  const theme = useTheme();
  const { t, lang } = useT();
  const { height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < 620;
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const {
    state,
    logSession,
    markAffirmationRead,
    markDreamRitualPracticed,
    toggleBridgeCompletion,
    evolveManifestation,
    saveDailyRitualPreferences,
  } = useApp();
  const {
    activePlaybackId,
    phase: narrationPhase,
    personalNarrationAvailable,
    playPersonal,
    pause,
    resume,
    stop,
  } = usePersonalNarration();

  const day = todayISO();
  const suggestedRitual = useMemo(() => selectDailyRitual(state, day), [state, day]);
  const [ritual, setRitual] = useState(suggestedRitual);
  const sourceManifestation = useMemo(
    () =>
      ritual?.sourceType === 'manifestation'
        ? state?.manifestations?.find((item) => item.id === ritual.sourceId) || null
        : null,
    [ritual, state?.manifestations]
  );
  const mirrorStatus = useMemo(
    () =>
      sourceManifestation
        ? livingMirrorStatus(sourceManifestation, state?.morningRitual?.entries, day)
        : null,
    [day, sourceManifestation, state?.morningRitual?.entries]
  );
  const bridgeDone = sourceManifestation ? bridgeDoneOn(sourceManifestation, day) : false;
  const playbackId = ritual ? `daily-ritual:${day}:${ritual.id}` : null;
  const ownsPlayback = !!playbackId && activePlaybackId === playbackId;

  const [phase, setPhase] = useState('ready');
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [paused, setPaused] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [evolving, setEvolving] = useState(false);
  const [evolutionError, setEvolutionError] = useState(false);
  const [evolvedChapter, setEvolvedChapter] = useState(null);
  const completedRef = useRef(false);
  const startEpochRef = useRef(0);
  const ritualLockedRef = useRef(false);
  const mountedRef = useRef(true);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [reminderError, setReminderError] = useState(false);
  const reminder = state?.dailyRitual || {
    reminderEnabled: false,
    reminderTime: '20:30',
    notificationId: null,
  };

  useEffect(
    () => () => {
      startEpochRef.current += 1;
      mountedRef.current = false;
    },
    []
  );

  useEffect(() => {
    if (!ritualLockedRef.current && phase === 'ready') setRitual(suggestedRitual);
  }, [phase, suggestedRitual]);

  useEffect(() => {
    startEpochRef.current += 1;
    completedRef.current = false;
    setPhase('ready');
    setSecondsLeft(60);
    setPaused(false);
    setAudioFailed(false);
    setEvolutionError(false);
    setEvolvedChapter(null);
  }, [ritual?.id]);

  const completeRitual = useCallback(() => {
    if (!ritual || completedRef.current) return;
    completedRef.current = true;
    if (ownsPlayback) stop(playbackId);
    if (ritual.sourceType === 'manifestation') logSession(ritual.sourceId);
    if (ritual.sourceType === 'dream') markDreamRitualPracticed(ritual.sourceId);
    markAffirmationRead();
    setPhase('complete');
    setPaused(false);
    AccessibilityInfo.announceForAccessibility?.(t(S.done));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [logSession, markAffirmationRead, markDreamRitualPracticed, ownsPlayback, playbackId, ritual, stop, t]);

  useEffect(() => {
    if (phase !== 'running' || paused) return undefined;
    const timer = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [paused, phase]);

  useEffect(() => {
    if (phase === 'running' && secondsLeft === 0) completeRitual();
  }, [completeRitual, phase, secondsLeft]);

  useEffect(() => {
    if (phase === 'running' && narrationPhase === 'error') setAudioFailed(true);
  }, [narrationPhase, phase]);

  useEffect(() => {
    if (isFocused) return;
    startEpochRef.current += 1;
    ritualLockedRef.current = false;
    if (ownsPlayback) stop(playbackId);
    if (phase !== 'ready') {
      setPhase('ready');
      setSecondsLeft(60);
      setPaused(false);
    }
  }, [isFocused, ownsPlayback, phase, playbackId, stop]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' || (phase !== 'starting' && phase !== 'running')) return;
      startEpochRef.current += 1;
      ritualLockedRef.current = false;
      if (playbackId) stop(playbackId);
      setPhase('ready');
      setSecondsLeft(60);
      setPaused(false);
      setAudioFailed(false);
    });
    return () => subscription.remove();
  }, [phase, playbackId, stop]);

  useEffect(
    () => () => {
      if (playbackId) stop(playbackId);
    },
    [playbackId, stop]
  );

  const start = useCallback(async () => {
    if (!ritual || phase !== 'ready') return;
    const epoch = startEpochRef.current + 1;
    startEpochRef.current = epoch;
    ritualLockedRef.current = true;
    completedRef.current = false;
    setPhase('starting');
    setSecondsLeft(60);
    setPaused(false);
    setAudioFailed(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const result = personalNarrationAvailable
      ? await playPersonal({
          text: dailyRitualNarration(ritual, ritual.lang || lang),
          lang: ritual.lang || lang,
          playbackId,
        })
      : { ok: false, error: 'personal_narration_unavailable' };
    if (!mountedRef.current || startEpochRef.current !== epoch) return;
    if (!result?.ok && result?.error !== 'audio_cancelled') setAudioFailed(true);
    setPhase('running');
  }, [lang, phase, personalNarrationAvailable, playPersonal, playbackId, ritual]);

  const togglePause = useCallback(async () => {
    if (paused) {
      const didResume = !ownsPlayback || await resume();
      if (didResume) setPaused(false);
    } else {
      const didPause = !ownsPlayback || pause();
      if (didPause) setPaused(true);
    }
  }, [ownsPlayback, pause, paused, resume]);

  const completeBridge = useCallback(() => {
    if (!sourceManifestation || bridgeDone) return;
    toggleBridgeCompletion(sourceManifestation.id, day);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [bridgeDone, day, sourceManifestation, toggleBridgeCompletion]);

  const evolve = useCallback(async () => {
    if (!RELEASE_FEATURES.paidCloudProcessing || !sourceManifestation || evolving) return;
    setEvolving(true);
    setEvolutionError(false);
    const result = await evolveManifestation(sourceManifestation.id);
    setEvolving(false);
    if (result?.ok) {
      setEvolvedChapter(result.chapter);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (result?.error === 'already_evolved_today') {
      setEvolvedChapter(mirrorStatus?.chapter || null);
    } else {
      setEvolutionError(true);
    }
  }, [evolveManifestation, evolving, mirrorStatus?.chapter, sourceManifestation]);

  const openChapter = useCallback(() => {
    if (!sourceManifestation) return;
    navigation.navigate('Main', {
      screen: 'Manifest',
      params: { screen: 'Manifestation', params: { id: sourceManifestation.id } },
    });
  }, [navigation, sourceManifestation]);

  const toggleReminder = useCallback(async (enabled) => {
    if (reminderBusy || Platform.OS === 'web') return;
    setReminderBusy(true);
    setReminderError(false);
    const result = enabled
      ? await scheduleDailyRitualReminder({
          time: reminder.reminderTime,
          previousId: reminder.notificationId,
          lang,
        })
      : await cancelDailyRitualReminder(reminder.notificationId);
    if (!mountedRef.current) return;
    setReminderBusy(false);
    if (!result?.ok) {
      setReminderError(true);
      saveDailyRitualPreferences({
        permission: result?.error === 'permission_denied' ? 'denied' : reminder.permission,
      });
      return;
    }
    saveDailyRitualPreferences({
      reminderEnabled: enabled,
      notificationId: enabled ? result.identifier : null,
      permission: enabled ? 'granted' : reminder.permission,
    });
  }, [lang, reminder, reminderBusy, saveDailyRitualPreferences]);

  const selectReminderTime = useCallback(async (time) => {
    if (reminderBusy || reminder.reminderTime === time) return;
    if (!reminder.reminderEnabled) {
      saveDailyRitualPreferences({ reminderTime: time });
      return;
    }
    setReminderBusy(true);
    setReminderError(false);
    const result = await scheduleDailyRitualReminder({
      time,
      previousId: reminder.notificationId,
      lang,
    });
    if (!mountedRef.current) return;
    setReminderBusy(false);
    if (!result?.ok) {
      setReminderError(true);
      return;
    }
    saveDailyRitualPreferences({
      reminderEnabled: true,
      reminderTime: time,
      notificationId: result.identifier,
      permission: 'granted',
    });
  }, [lang, reminder, reminderBusy, saveDailyRitualPreferences]);

  useEffect(() => {
    if (
      !isFocused ||
      Platform.OS === 'web' ||
      reminderBusy ||
      reminder.reminderEnabled !== true
    ) return undefined;
    let active = true;
    getDailyRitualReminderStatus(reminder.notificationId).then((status) => {
      if (!active || !mountedRef.current || !status?.ok) return;
      if (status.permission !== 'granted' || status.scheduled !== true) {
        saveDailyRitualPreferences({
          reminderEnabled: false,
          notificationId: null,
          permission: status.permission === 'denied' ? 'denied' : reminder.permission,
        });
      }
    });
    return () => { active = false; };
  }, [
    isFocused,
    reminder.notificationId,
    reminder.permission,
    reminder.reminderEnabled,
    reminderBusy,
    saveDailyRitualPreferences,
  ]);

  const close = useCallback(() => {
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate('Main');
  }, [navigation]);

  if (!ritual) {
    return (
      <Screen testID="daily-ritual-screen">
        <TopBar title={t(S.title)} backLabel={t(S.close)} onBack={close} theme={theme} />
        <EmptyState
          icon="sparkles-outline"
          title={t(S.emptyTitle)}
          body={t(S.emptyBody)}
          actionLabel={t(S.goHome)}
          onAction={() => navigation.navigate('Main')}
        />
      </Screen>
    );
  }

  const sourceTitle =
    ritual.title || (ritual.sourceType === 'dream' ? t(S.dream) : t(S.chosen));
  const progress = Math.max(0, Math.min(1, (60 - secondsLeft) / 60));
  const memory = mirrorStatus?.memory;
  const memoryParts = memory
    ? [
        memory.practiceDays > 0 ? t(S.practiceCount, { n: memory.practiceDays }) : '',
        memory.stepCompletions > 0 ? t(S.bridgeCount, { n: memory.stepCompletions }) : '',
        memory.evidenceCount > 0 ? t(S.traceCount, { n: memory.evidenceCount }) : '',
        memory.dreamCount > 0 ? t(S.dreamTheme) : '',
      ].filter(Boolean)
    : [];

  return (
    <Screen testID="daily-ritual-screen" style={styles.screen}>
      <TopBar title={t(S.title)} backLabel={t(S.close)} onBack={close} theme={theme} />

      <View style={[styles.content, compact && styles.contentCompact]}>
        <Text style={[styles.eyebrow, { color: theme.accent }]}>{t(S.eyebrow)}</Text>
        <Text numberOfLines={2} style={[styles.sourceTitle, { color: theme.text }]}>
          {sourceTitle}
        </Text>
        {ritual.chapter ? (
          <Text style={[styles.chapter, { color: theme.textMuted }]}>
            {t(S.chapter, { n: ritual.chapter })}
          </Text>
        ) : null}

        <View style={[
          styles.affirmation,
          compact && styles.affirmationCompact,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}>
          <View style={[styles.quoteRule, { backgroundColor: accentAt(theme, 1) }]} />
          <Text style={[styles.affirmationText, { color: theme.text }]}>{ritual.affirmation}</Text>
        </View>

        {phase === 'ready' ? (
          <View style={styles.actionArea}>
            <Text style={[styles.guidance, { color: theme.textMuted }]}>{t(S.ready)}</Text>
            <PrimaryButton testID="start-daily-ritual" icon="play" label={t(S.start)} onPress={start} />
          </View>
        ) : null}

        {phase === 'starting' ? (
          <View style={styles.preparing} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={[styles.preparingText, { color: theme.textMuted }]}>{t(S.preparing)}</Text>
          </View>
        ) : null}

        {phase === 'running' ? (
          <View style={styles.actionArea}>
            <View style={[styles.timer, { borderColor: alpha(theme.accent, 0.34) }]}>
              <Text style={[styles.timerNumber, { color: theme.text }]}>{secondsLeft}</Text>
              <Text style={[styles.timerLabel, { color: theme.textMuted }]}>{t(S.seconds)}</Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
              <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: theme.accent }]} />
            </View>
            <Text style={[styles.guidance, { color: audioFailed ? theme.warning : theme.textMuted }]}>
              {audioFailed ? t(S.reading) : t(S.listening)}
            </Text>
            <PrimaryButton
              testID="pause-daily-ritual"
              variant="soft"
              icon={paused ? 'play' : 'pause'}
              label={paused ? t(S.resume) : t(S.pause)}
              onPress={togglePause}
            />
          </View>
        ) : null}

        {phase === 'complete' ? (
          <View style={styles.completeArea}>
            <View style={[styles.doneIcon, { backgroundColor: alpha(theme.success, 0.14) }]}>
              <Ionicons name="checkmark" size={25} color={theme.success} />
            </View>
            <Text
              accessibilityRole="header"
              accessibilityLiveRegion="polite"
              style={[styles.doneTitle, { color: theme.text }]}
            >
              {t(S.done)}
            </Text>
            <Text style={[styles.doneBody, { color: theme.textMuted }]}>{t(S.doneBody)}</Text>

            {ritual.anchorStep ? (
              <View style={[styles.bridge, { borderTopColor: theme.border }]}>
                <Text style={[styles.bridgeLabel, { color: theme.accent }]}>{t(S.bridge)}</Text>
                <Text style={[styles.bridgeText, { color: theme.text }]}>{ritual.anchorStep}</Text>
                <PrimaryButton
                  testID="complete-daily-bridge"
                  variant={bridgeDone ? 'soft' : 'solid'}
                  icon={bridgeDone ? 'checkmark-circle' : 'footsteps-outline'}
                  label={bridgeDone ? t(S.bridgeDone) : t(S.doBridge)}
                  onPress={completeBridge}
                  disabled={bridgeDone}
                  style={styles.fullButton}
                />
              </View>
            ) : null}

            {evolving ? (
              <View style={styles.evolvingRow}>
                <ActivityIndicator size="small" color={theme.accent} />
                <Text style={[styles.evolvingText, { color: theme.textMuted }]}>{t(S.evolving)}</Text>
              </View>
            ) : evolvedChapter ? (
              <View style={styles.evolutionArea}>
                <Text style={[styles.evolvedText, { color: theme.success }]}>
                  {t(S.evolved, { n: evolvedChapter })}
                </Text>
                <PrimaryButton
                  testID="open-evolved-chapter"
                  icon="book-outline"
                  label={t(S.openChapter)}
                  onPress={openChapter}
                />
              </View>
            ) : RELEASE_FEATURES.paidCloudProcessing && mirrorStatus?.canEvolve ? (
              <PrimaryButton
                testID="evolve-living-mirror"
                variant="soft"
                icon="sparkles"
                label={t(S.evolve)}
                onPress={evolve}
                style={styles.fullButton}
              />
            ) : mirrorStatus?.evolvedToday ? (
              <Text style={[styles.evolvedToday, { color: theme.textMuted }]}>{t(S.evolvedToday)}</Text>
            ) : null}

            {evolutionError ? (
              <Text accessibilityRole="alert" style={[styles.error, { color: theme.warning }]}>
                {t(S.evolutionFailed)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={[styles.reminderSection, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.reminderHeader}>
          <View style={[styles.reminderIcon, { backgroundColor: alpha(accentAt(theme, 2), 0.12) }]}>
            <Ionicons name="notifications-outline" size={20} color={accentAt(theme, 2)} />
          </View>
          <View style={styles.reminderCopy}>
            <Text style={[styles.reminderTitle, { color: theme.text }]}>{t(S.reminderTitle)}</Text>
            <Text style={[styles.reminderBody, { color: theme.textMuted }]}>
              {Platform.OS === 'web' ? t(S.reminderWeb) : t(S.reminderBody)}
            </Text>
          </View>
          <Switch
            testID="daily-ritual-reminder-toggle"
            value={reminder.reminderEnabled === true}
            onValueChange={toggleReminder}
            disabled={reminderBusy || Platform.OS === 'web'}
            accessibilityLabel={t(S.reminderTitle)}
            accessibilityHint={Platform.OS === 'web' ? t(S.reminderWeb) : t(S.reminderBody)}
            accessibilityState={{
              checked: reminder.reminderEnabled === true,
              disabled: reminderBusy || Platform.OS === 'web',
            }}
            trackColor={{ false: theme.surfaceAlt, true: alpha(theme.accent, 0.45) }}
            thumbColor={reminder.reminderEnabled ? theme.accent : '#FFFFFF'}
          />
        </View>
        {Platform.OS !== 'web' ? (
          <View
            style={styles.reminderTimes}
            accessibilityRole="radiogroup"
            accessibilityLabel={t(S.reminderTimes)}
          >
            {REMINDER_TIMES.map((time) => {
              const selected = reminder.reminderTime === time;
              return (
                <Pressable
                  key={time}
                  accessibilityRole="radio"
                  accessibilityLabel={time}
                  accessibilityState={{ selected, disabled: reminderBusy }}
                  disabled={reminderBusy}
                  onPress={() => selectReminderTime(time)}
                  style={({ pressed }) => [
                    styles.reminderTime,
                    {
                      backgroundColor: selected ? theme.accent : theme.surfaceAlt,
                      opacity: pressed ? 0.72 : 1,
                    },
                  ]}
                >
                  <Text style={[styles.reminderTimeText, { color: selected ? '#FFFFFF' : theme.text }]}>
                    {time}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {reminderError ? (
          <Text accessibilityRole="alert" style={[styles.reminderError, { color: theme.warning }]}>
            {t(S.reminderFailed)}
          </Text>
        ) : null}
      </View>

      {memoryParts.length ? (
        <View style={[styles.memoryBar, { borderTopColor: theme.border }]}>
          <Ionicons name="sparkles-outline" size={16} color={theme.accent} />
          <Text numberOfLines={2} style={[styles.memoryText, { color: theme.textMuted }]}>
            {t(S.memory)}: {memoryParts.join(' · ')}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

function TopBar({ title, backLabel, onBack, theme }) {
  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backLabel}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <Ionicons name="arrow-back" size={23} color={theme.text} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.topTitle, { color: theme.text }]}>{title}</Text>
      <View style={styles.backButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20, paddingBottom: 28 },
  topBar: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.62 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 16, lineHeight: 22, fontWeight: '800', letterSpacing: 0 },
  content: { minHeight: 520, alignItems: 'center', justifyContent: 'center', paddingBottom: 8 },
  contentCompact: { minHeight: 392, justifyContent: 'flex-start', paddingTop: 8 },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1 },
  sourceTitle: { maxWidth: 460, marginTop: 7, textAlign: 'center', fontSize: 22, lineHeight: 29, fontWeight: '800', letterSpacing: 0 },
  chapter: { marginTop: 4, fontSize: 12, lineHeight: 18, fontWeight: '700', letterSpacing: 0 },
  affirmation: { width: '100%', maxWidth: 560, minHeight: 150, marginTop: 20, borderWidth: 1, borderRadius: 8, paddingHorizontal: 24, paddingVertical: 22, justifyContent: 'center' },
  affirmationCompact: { minHeight: 118, marginTop: 12, paddingVertical: 15 },
  quoteRule: { width: 42, height: 3, borderRadius: 2, marginBottom: 17 },
  affirmationText: { fontFamily: 'Georgia', fontSize: 23, lineHeight: 33, fontStyle: 'italic', fontWeight: '500', letterSpacing: 0 },
  actionArea: { width: '100%', maxWidth: 420, alignItems: 'stretch', marginTop: 22 },
  preparing: { minHeight: 74, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  preparingText: { marginLeft: 9, fontSize: 13.5, lineHeight: 20, fontWeight: '600', letterSpacing: 0 },
  guidance: { minHeight: 40, marginBottom: 10, textAlign: 'center', fontSize: 13.5, lineHeight: 20, fontWeight: '600', letterSpacing: 0 },
  timer: { alignSelf: 'center', width: 106, height: 106, borderRadius: 53, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  timerNumber: { fontSize: 36, lineHeight: 40, fontWeight: '800', letterSpacing: 0 },
  timerLabel: { fontSize: 10, lineHeight: 14, fontWeight: '700', letterSpacing: 0 },
  progressTrack: { width: '100%', height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 18, marginBottom: 13 },
  progressFill: { height: '100%', borderRadius: 3 },
  completeArea: { width: '100%', maxWidth: 520, alignItems: 'center', marginTop: 17 },
  doneIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { marginTop: 9, fontSize: 20, lineHeight: 27, fontWeight: '800', letterSpacing: 0 },
  doneBody: { marginTop: 3, textAlign: 'center', fontSize: 13, lineHeight: 19, letterSpacing: 0 },
  bridge: { width: '100%', marginTop: 17, paddingTop: 15, borderTopWidth: 1 },
  bridgeLabel: { fontSize: 11, lineHeight: 16, textTransform: 'uppercase', fontWeight: '800', letterSpacing: 1 },
  bridgeText: { marginTop: 6, fontSize: 16, lineHeight: 23, fontWeight: '600', letterSpacing: 0 },
  fullButton: { width: '100%', marginTop: 10 },
  evolvingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  evolvingText: { marginLeft: 9, fontSize: 13, lineHeight: 19, fontWeight: '600', letterSpacing: 0 },
  evolutionArea: { width: '100%', marginTop: 12 },
  evolvedText: { textAlign: 'center', marginBottom: 4, fontSize: 13, lineHeight: 19, fontWeight: '800', letterSpacing: 0 },
  evolvedToday: { marginTop: 13, fontSize: 12.5, lineHeight: 18, fontWeight: '600', letterSpacing: 0 },
  error: { marginTop: 10, textAlign: 'center', fontSize: 12.5, lineHeight: 18, fontWeight: '600', letterSpacing: 0 },
  memoryBar: { minHeight: 52, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  memoryText: { flexShrink: 1, marginLeft: 8, textAlign: 'center', fontSize: 11.5, lineHeight: 17, fontWeight: '600', letterSpacing: 0 },
  reminderSection: { width: '100%', maxWidth: 560, alignSelf: 'center', borderWidth: 1, borderRadius: 8, padding: 14, marginTop: 14 },
  reminderHeader: { flexDirection: 'row', alignItems: 'center' },
  reminderIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  reminderCopy: { flex: 1, minWidth: 0, marginHorizontal: 11 },
  reminderTitle: { fontSize: 14, lineHeight: 19, fontWeight: '800', letterSpacing: 0 },
  reminderBody: { marginTop: 2, fontSize: 11.5, lineHeight: 16, fontWeight: '500', letterSpacing: 0 },
  reminderTimes: { flexDirection: 'row', marginTop: 12, marginHorizontal: -4 },
  reminderTime: { flex: 1, minHeight: 40, marginHorizontal: 4, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  reminderTimeText: { fontSize: 13, lineHeight: 18, fontWeight: '800', letterSpacing: 0 },
  reminderError: { marginTop: 9, fontSize: 11.5, lineHeight: 16, fontWeight: '600', letterSpacing: 0 },
});
