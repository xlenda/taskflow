import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Button, Card, EmptyState, Header, Screen } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { RELEASE_FEATURES } from '../constants/releaseFeatures';
import { useT } from '../utils/useT';
import { todayISO } from '../utils/date';
import { personalAffirmationsForState } from '../utils/personalAffirmations';
import { personalJourneyItemsForState } from '../utils/personalJourney';
import { normalizePracticePlan, practiceContentFingerprint } from '../utils/practicePlan';
import { evaluateSpeechMatch } from '../utils/speechMatch';
import {
  cancel as cancelPracticeSpeech,
  getCapability,
  recognize,
  requestPermission,
} from '../services/practiceSpeech';
import { snoozePracticePlanReminder } from '../services/practicePlanReminders';

const REQUIRED_REPETITIONS = 2;
const FALLBACK_AFTER_FAILURES = 2;

const S = {
  eyebrow: { pt: 'Prática guiada', en: 'Guided practice' },
  title: { pt: 'Leia e repita', en: 'Read and repeat' },
  subtitle: {
    pt: 'A frase fica na tela. Você não precisa saber de cor.',
    en: 'The words stay on screen. You do not need to memorize them.',
  },
  privacy: {
    pt: 'O microfone só começa quando você tocar. A Celeste não salva o áudio nem a transcrição e só usa reconhecimento no aparelho.',
    en: 'The microphone only starts when you tap. Celeste stores neither audio nor transcript and only uses on-device recognition.',
  },
  visionLabel: { pt: '1. Leia sua visão', en: '1. Read your vision' },
  affirmationLabel: { pt: '2. Repita esta afirmação duas vezes', en: '2. Repeat this affirmation twice' },
  progress: { pt: '{n} de 2 repetições confirmadas', en: '{n} of 2 repetitions confirmed' },
  ready: { pt: 'Quando estiver pronta, toque e leia a frase destacada.', en: 'When ready, tap and read the highlighted sentence.' },
  listen: { pt: 'Ouvir minha repetição', en: 'Listen to my repetition' },
  listenAgain: { pt: 'Fazer a segunda repetição', en: 'Do the second repetition' },
  listening: { pt: 'Ouvindo… leia a frase acima', en: 'Listening… read the sentence above' },
  checking: { pt: 'Conferindo no aparelho…', en: 'Checking on device…' },
  firstDone: {
    pt: 'Primeira repetição confirmada. Agora leia mais uma vez.',
    en: 'First repetition confirmed. Now read it once more.',
  },
  tryAgain: {
    pt: 'Ainda não consegui confirmar toda a frase. Ela continua visível; tente novamente no seu ritmo.',
    en: 'I could not confirm the whole sentence yet. It remains visible; try again at your pace.',
  },
  unavailable: {
    pt: 'O reconhecimento local não está disponível neste aparelho ou idioma. Você pode confirmar a leitura manualmente.',
    en: 'On-device recognition is unavailable on this device or language. You can confirm the reading manually.',
  },
  changed: {
    pt: 'Esta prática mudou. Volte ao Plano Celeste e abra o horário novamente.',
    en: 'This practice changed. Return to the Celeste Plan and open the time again.',
  },
  denied: {
    pt: 'Sem acesso ao microfone. Você pode liberar nas configurações ou confirmar a leitura manualmente.',
    en: 'Microphone access is off. You can enable it in Settings or confirm the reading manually.',
  },
  manualFirst: { pt: 'Li em voz alta — 1ª vez', en: 'I read it aloud — first time' },
  manualSecond: { pt: 'Li em voz alta — 2ª vez', en: 'I read it aloud — second time' },
  accessibilityNote: {
    pt: 'Alternativa acessível: confirme cada leitura sem usar o reconhecimento de voz.',
    en: 'Accessible alternative: confirm each reading without voice recognition.',
  },
  needAlternative: {
    pt: 'Preciso de uma alternativa sem microfone',
    en: 'I need an option without the microphone',
  },
  snooze: { pt: 'Adiar 10 min', en: 'Snooze 10 min' },
  snoozed: { pt: 'Lembrete adiado por 10 minutos.', en: 'Reminder snoozed for 10 minutes.' },
  snoozeFailed: { pt: 'Não consegui criar o lembrete. Você ainda pode voltar sem concluir.', en: 'I could not create the reminder. You can still leave without completing.' },
  notNow: { pt: 'Agora não', en: 'Not now' },
  done: { pt: 'Prática concluída', en: 'Practice complete' },
  doneBody: {
    pt: 'As duas repetições foram registradas na sua jornada. Nenhum áudio ou texto falado foi guardado.',
    en: 'Both repetitions were recorded in your journey. No audio or spoken text was stored.',
  },
  finish: { pt: 'Voltar para o início', en: 'Return Home' },
  missingTitle: { pt: 'Prática não encontrada', en: 'Practice not found' },
  missingBody: {
    pt: 'Abra o Plano Celeste para escolher uma visão, uma afirmação e seus horários.',
    en: 'Open the Celeste Plan to choose a vision, an affirmation, and your times.',
  },
  openPlan: { pt: 'Abrir Plano Celeste', en: 'Open Celeste Plan' },
};

const cleanText = (value, max = 1400) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const permissionGranted = (capability) =>
  capability?.authorization === 'authorized' || capability?.authorization === 'granted';

function bestSpeechMatch(target, candidates, lang) {
  let best = null;
  for (const candidate of Array.isArray(candidates) ? candidates.slice(0, 5) : []) {
    const result = evaluateSpeechMatch(target, candidate, { lang });
    if (!best || result.score > best.score) best = result;
  }
  return best || evaluateSpeechMatch(target, '', { lang });
}

export default function PracticeRitualScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const route = useRoute();
  const { t, lang } = useT();
  const { state, completePracticePlanSlot } = useApp();
  const sessionRef = useRef(0);
  const snoozeGuardRef = useRef(false);
  const mountedRef = useRef(true);

  const affirmations = useMemo(() => personalAffirmationsForState(state), [state]);
  const visions = useMemo(
    () => personalJourneyItemsForState(state, 'vision', lang),
    [lang, state]
  );
  const plan = useMemo(
    () => normalizePracticePlan(state?.practicePlan, { affirmations, visions }),
    [affirmations, state?.practicePlan, visions]
  );
  const requestedSlotId = cleanText(route.params?.slotId, 80);
  const slot = useMemo(
    () => plan.slots.find((item) => item.id === requestedSlotId && item.enabled) || null,
    [plan.slots, requestedSlotId]
  );
  const affirmation = useMemo(
    () => affirmations.find((item) => item.id === slot?.affirmationId) || null,
    [affirmations, slot?.affirmationId]
  );
  const vision = useMemo(
    () => visions.find((item) => item.id === slot?.visionId) || null,
    [slot?.visionId, visions]
  );
  const affirmationText = cleanText(affirmation?.text, 800);
  const visionTitle = cleanText(vision?.title || vision?.sourceTitle, 180);
  const visionText = cleanText(vision?.story || vision?.text || vision?.title, 1400);
  const speechLang = affirmation?.lang === 'en' || affirmation?.speechLang === 'en' ? 'en' : lang;
  const locale = speechLang === 'en' ? 'en-US' : 'pt-BR';
  const practiceDay = todayISO();
  const contentFingerprint = useMemo(
    () => practiceContentFingerprint({
      affirmationText,
      visionText: `${visionTitle}\n${visionText}`,
    }),
    [affirmationText, visionText, visionTitle]
  );
  const completedAlready = useMemo(
    () => plan.receipts.some((receipt) =>
      receipt.slotId === slot?.id &&
      receipt.day === practiceDay &&
      receipt.affirmationId === slot?.affirmationId &&
      receipt.visionId === slot?.visionId &&
      receipt.contentFingerprint === contentFingerprint
    ),
    [contentFingerprint, plan.receipts, practiceDay, slot?.affirmationId, slot?.id, slot?.visionId]
  );
  const sessionKey = `${practiceDay}|${slot?.id || ''}|${slot?.affirmationId || ''}|${slot?.visionId || ''}|${contentFingerprint}`;

  const [phase, setPhase] = useState(completedAlready ? 'complete' : 'ready');
  const [repetitions, setRepetitions] = useState(completedAlready ? REQUIRED_REPETITIONS : 0);
  const [failures, setFailures] = useState(0);
  const [message, setMessage] = useState(null);
  const [fallbackAvailable, setFallbackAvailable] = useState(
    !RELEASE_FEATURES.onDevicePracticeSpeech || Platform.OS === 'web'
  );
  const [snoozeBusy, setSnoozeBusy] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      cancelPracticeSpeech().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' || !mountedRef.current) return;
      sessionRef.current += 1;
      cancelPracticeSpeech().catch(() => {});
      setPhase((current) => current === 'complete' ? current : 'ready');
      setMessage(null);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    sessionRef.current += 1;
    snoozeGuardRef.current = false;
    cancelPracticeSpeech().catch(() => {});
    setPhase(completedAlready ? 'complete' : 'ready');
    setRepetitions(completedAlready ? REQUIRED_REPETITIONS : 0);
    setFailures(0);
    setMessage(null);
    setFallbackAvailable(!RELEASE_FEATURES.onDevicePracticeSpeech || Platform.OS === 'web');
    setSnoozeBusy(false);
  }, [completedAlready, sessionKey]);

  const announce = useCallback((value) => {
    AccessibilityInfo.announceForAccessibility?.(value);
  }, []);

  const finishPractice = useCallback((method, score) => {
    if (!slot || phase === 'complete') return;
    const accepted = completePracticePlanSlot({ slotId: slot.id, method, score });
    if (!accepted) {
      setPhase('ready');
      setMessage('changed');
      setFallbackAvailable(true);
      announce(t(S.changed));
      return;
    }
    setRepetitions(REQUIRED_REPETITIONS);
    setPhase('complete');
    setMessage(null);
    announce(t(S.done));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [announce, completePracticePlanSlot, phase, slot, t]);

  const acceptRepetition = useCallback((method, score) => {
    const next = Math.min(REQUIRED_REPETITIONS, repetitions + 1);
    if (next >= REQUIRED_REPETITIONS) {
      finishPractice(method, score);
      return;
    }
    setRepetitions(next);
    setPhase('ready');
    setMessage('firstDone');
    setFailures(0);
    announce(t(S.firstDone));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [announce, finishPractice, repetitions, t]);

  const handleSpeechFailure = useCallback((kind) => {
    setFailures((current) => {
      const next = current + 1;
      if (next >= FALLBACK_AFTER_FAILURES) setFallbackAvailable(true);
      return next;
    });
    setPhase('ready');
    setMessage(kind);
    announce(t(kind === 'denied' ? S.denied : kind === 'unavailable' ? S.unavailable : S.tryAgain));
  }, [announce, t]);

  const startListening = useCallback(async () => {
    if (!slot || !affirmationText || phase === 'listening' || phase === 'checking' || phase === 'complete') return;
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    setMessage(null);
    setPhase('checking');
    try {
      let capability = await getCapability({ locale });
      if (!mountedRef.current || sessionRef.current !== session) return;

      // Browser speech recognition may use a remote service. The plan only
      // accepts the explicitly on-device native path; otherwise it offers the
      // accessible self-confirmation flow without capturing any voice.
      if (!capability?.supported || capability?.onDevice !== true) {
        setFallbackAvailable(true);
        handleSpeechFailure('unavailable');
        return;
      }
      if (!permissionGranted(capability)) {
        capability = await requestPermission({ locale });
        if (!mountedRef.current || sessionRef.current !== session) return;
      }
      if (!permissionGranted(capability) || capability?.canRecognize !== true) {
        setFallbackAvailable(true);
        handleSpeechFailure(capability?.authorization === 'denied' ? 'denied' : 'unavailable');
        return;
      }

      setPhase('listening');
      announce(t(S.listening));
      const result = await recognize({ locale });
      if (!mountedRef.current || sessionRef.current !== session) return;
      setPhase('checking');
      const match = bestSpeechMatch(affirmationText, result?.candidates, speechLang);
      if (match.matched) {
        acceptRepetition('speech', match.score);
      } else {
        handleSpeechFailure('tryAgain');
      }
    } catch (error) {
      if (!mountedRef.current || sessionRef.current !== session || error?.code === 'cancelled') return;
      const permissionError = error?.code === 'permission_denied' || error?.code === 'permission_required';
      const unavailableError = [
        'android_version_unsupported',
        'ios_unsupported',
        'language_not_supported',
        'language_unavailable',
        'native_module_missing',
        'on_device_unavailable',
        'recognizer_unavailable',
      ].includes(error?.code);
      if (permissionError || unavailableError) setFallbackAvailable(true);
      handleSpeechFailure(permissionError ? 'denied' : unavailableError ? 'unavailable' : 'tryAgain');
    }
  }, [acceptRepetition, affirmationText, announce, handleSpeechFailure, locale, phase, slot, speechLang, t]);

  const confirmAccessibleReading = useCallback(() => {
    if (!fallbackAvailable || phase === 'complete') return;
    acceptRepetition('accessibility', 0);
  }, [acceptRepetition, fallbackAvailable, phase]);

  const leaveNow = useCallback(async () => {
    sessionRef.current += 1;
    await cancelPracticeSpeech().catch(() => {});
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Main');
  }, [navigation]);

  const snooze = useCallback(async () => {
    if (!slot || snoozeBusy || snoozeGuardRef.current) return;
    snoozeGuardRef.current = true;
    sessionRef.current += 1;
    await cancelPracticeSpeech().catch(() => {});
    setSnoozeBusy(true);
    const result = await snoozePracticePlanReminder(slot.id, { lang });
    if (!mountedRef.current) return;
    setSnoozeBusy(false);
    if (result.ok) {
      announce(t(S.snoozed));
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.replace('Main');
    } else {
      snoozeGuardRef.current = false;
      setMessage('snoozeFailed');
      announce(t(S.snoozeFailed));
    }
  }, [announce, lang, navigation, slot, snoozeBusy, t]);

  if (!slot || !affirmationText || !visionText) {
    return (
      <Screen testID="practice-ritual-missing">
        <EmptyState
          icon="sparkles-outline"
          title={t(S.missingTitle)}
          body={t(S.missingBody)}
          actionLabel={t(S.openPlan)}
          onAction={() => navigation.replace('PracticePlan')}
        />
      </Screen>
    );
  }

  if (phase === 'complete') {
    return (
      <Screen testID="practice-ritual-complete">
        <Header eyebrow={t(S.eyebrow)} title={t(S.done)} subtitle={t(S.doneBody)} />
        <Card style={styles.completeCard}>
          <View style={[styles.completeIcon, { backgroundColor: `${theme.success}22` }]}>
            <Ionicons name="checkmark-circle" size={54} color={theme.success} />
          </View>
          <Text style={[styles.completeProgress, { color: theme.text }]}>
            {t(S.progress).replace('{n}', String(REQUIRED_REPETITIONS))}
          </Text>
          <Text style={[styles.completePrivacy, { color: theme.textMuted }]}>{t(S.privacy)}</Text>
        </Card>
        <Button icon="home-outline" label={t(S.finish)} onPress={() => navigation.navigate('Main')} />
      </Screen>
    );
  }

  const busy = phase === 'listening' || phase === 'checking';
  const messageText = message === 'firstDone'
    ? t(S.firstDone)
    : message === 'denied'
    ? t(S.denied)
    : message === 'unavailable'
    ? t(S.unavailable)
    : message === 'changed'
    ? t(S.changed)
    : message === 'tryAgain'
    ? t(S.tryAgain)
    : message === 'snoozed'
    ? t(S.snoozed)
    : message === 'snoozeFailed'
    ? t(S.snoozeFailed)
    : t(S.ready);

  return (
    <Screen testID="practice-ritual-screen">
      <Header eyebrow={t(S.eyebrow)} title={t(S.title)} subtitle={t(S.subtitle)} />

      <Card style={[styles.privacyCard, { backgroundColor: theme.surfaceAlt }]}>
        <Ionicons name="shield-checkmark-outline" size={21} color={theme.accent} />
        <Text style={[styles.privacyText, { color: theme.textMuted }]}>{t(S.privacy)}</Text>
      </Card>

      <Text style={[styles.stepLabel, { color: theme.accent }]}>{t(S.visionLabel)}</Text>
      <Card>
        {visionTitle ? <Text style={[styles.visionTitle, { color: theme.text }]}>{visionTitle}</Text> : null}
        <Text selectable style={[styles.visionText, { color: theme.text }]}>{visionText}</Text>
      </Card>

      <Text style={[styles.stepLabel, { color: theme.accent }]}>{t(S.affirmationLabel)}</Text>
      <Card style={[styles.affirmationCard, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
        <Text selectable accessibilityRole="text" style={[styles.affirmationText, { color: theme.text }]}>
          {affirmationText}
        </Text>
      </Card>

      <View style={styles.repetitionRow} accessibilityLabel={t(S.progress).replace('{n}', String(repetitions))}>
        {[0, 1].map((index) => (
          <View
            key={index}
            style={[
              styles.repetitionDot,
              {
                backgroundColor: index < repetitions ? theme.success : theme.surfaceAlt,
                borderColor: index < repetitions ? theme.success : theme.border,
              },
            ]}
          >
            <Ionicons
              name={index < repetitions ? 'checkmark' : 'mic-outline'}
              size={18}
              color={index < repetitions ? '#FFFFFF' : theme.textMuted}
            />
          </View>
        ))}
        <Text style={[styles.progressText, { color: theme.text }]}>
          {t(S.progress).replace('{n}', String(repetitions))}
        </Text>
      </View>

      <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: message === 'firstDone' ? theme.success : theme.textMuted }]}>
        {phase === 'listening' ? t(S.listening) : phase === 'checking' ? t(S.checking) : messageText}
      </Text>

      {RELEASE_FEATURES.onDevicePracticeSpeech ? (
        <Button
          testID="practice-listen-button"
          icon={phase === 'listening' ? 'radio-outline' : 'mic-outline'}
          label={repetitions === 0 ? t(S.listen) : t(S.listenAgain)}
          onPress={startListening}
          loading={busy}
        />
      ) : null}

      {!fallbackAvailable ? (
        <Button
          testID="practice-show-accessible-fallback"
          variant="ghost"
          icon="accessibility-outline"
          label={t(S.needAlternative)}
          onPress={() => setFallbackAvailable(true)}
          disabled={busy}
        />
      ) : null}

      {fallbackAvailable ? (
        <Card style={styles.fallbackCard}>
          <Text style={[styles.fallbackText, { color: theme.textMuted }]}>{t(S.accessibilityNote)}</Text>
          <Button
            testID="practice-accessible-confirm"
            variant="soft"
            icon="accessibility-outline"
            label={repetitions === 0 ? t(S.manualFirst) : t(S.manualSecond)}
            onPress={confirmAccessibleReading}
            disabled={busy}
          />
        </Card>
      ) : null}

      <View style={styles.exitRow}>
        <Button
          variant="ghost"
          icon="time-outline"
          label={t(S.snooze)}
          onPress={snooze}
          loading={snoozeBusy}
          style={styles.exitButton}
        />
        <Button
          variant="ghost"
          icon="close-outline"
          label={t(S.notNow)}
          onPress={leaveNow}
          style={styles.exitButton}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  privacyCard: { flexDirection: 'row', alignItems: 'flex-start' },
  privacyText: { flex: 1, marginLeft: 10, fontSize: 12.5, lineHeight: 18 },
  stepLabel: { marginTop: 13, marginBottom: 8, fontSize: 13, lineHeight: 18, fontWeight: '850', textTransform: 'uppercase', letterSpacing: 0.7 },
  visionTitle: { marginBottom: 8, fontSize: 18, lineHeight: 24, fontWeight: '850' },
  visionText: { fontSize: 17, lineHeight: 27, fontWeight: '500' },
  affirmationCard: { borderWidth: 2, paddingVertical: 22 },
  affirmationText: { textAlign: 'center', fontSize: 24, lineHeight: 34, fontWeight: '850', letterSpacing: -0.25 },
  repetitionRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 12 },
  repetitionDot: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  progressText: { flex: 1, marginLeft: 3, fontSize: 13.5, lineHeight: 19, fontWeight: '750' },
  feedback: { minHeight: 44, marginBottom: 5, textAlign: 'center', fontSize: 13.5, lineHeight: 20, fontWeight: '650' },
  fallbackCard: { marginTop: 8 },
  fallbackText: { marginBottom: 7, textAlign: 'center', fontSize: 12.5, lineHeight: 18 },
  exitRow: { flexDirection: 'row', marginHorizontal: -4, marginTop: 8 },
  exitButton: { flex: 1, marginHorizontal: 4 },
  completeCard: { alignItems: 'center', paddingVertical: 28 },
  completeIcon: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  completeProgress: { textAlign: 'center', fontSize: 19, lineHeight: 26, fontWeight: '850' },
  completePrivacy: { marginTop: 10, textAlign: 'center', fontSize: 12.5, lineHeight: 18 },
});
