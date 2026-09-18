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
import { useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

import { Button, Card, EmptyState, Header, Screen } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { RELEASE_FEATURES } from '../constants/releaseFeatures';
import GradientCover from '../components/GradientCover';
import { useT } from '../utils/useT';
import { usePersonalNarration } from '../utils/usePersonalNarration';
import { todayISO } from '../utils/date';
import { personalAffirmationsForState } from '../utils/personalAffirmations';
import { personalVisionOptionsForState } from '../utils/personalJourney';
import { hasUnifiedCloudMediaConsent } from '../utils/useCloudMediaConsent';
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
  title: { pt: 'Visualize, ouça e repita', en: 'Visualize, listen, and repeat' },
  subtitle: {
    pt: 'Sua visão e a afirmação ficam na tela. Você não precisa saber de cor.',
    en: 'Your vision and affirmation stay on screen. You do not need to memorize them.',
  },
  privacy: {
    pt: 'O microfone só começa quando você tocar. A Celeste não salva o áudio nem a transcrição e só usa reconhecimento no aparelho.',
    en: 'The microphone only starts when you tap. Celeste stores neither audio nor transcript and only uses on-device recognition.',
  },
  visionLabel: { pt: '1. Veja e ouça sua visão ou Cena-Âncora', en: '1. See and hear your vision or Anchor Scene' },
  playVision: { pt: 'Ouvir visão completa', en: 'Listen to full vision' },
  stopVision: { pt: 'Parar narração', en: 'Stop narration' },
  visionAudioHint: {
    pt: 'Ouça a visão completa para liberar a afirmação. Se não ouvir no iPhone, confira o volume e o modo silencioso.',
    en: 'Listen to the full vision to unlock the affirmation. If you hear nothing on iPhone, check the volume and Silent mode.',
  },
  visionAudioFailed: {
    pt: 'A narração não tocou neste aparelho. Sua visão continua disponível para leitura.',
    en: 'Narration did not play on this device. Your vision remains available to read.',
  },
  visionDone: {
    pt: 'Visão concluída. Agora repita a afirmação duas vezes.',
    en: 'Vision complete. Now repeat the affirmation twice.',
  },
  visionRequired: {
    pt: 'Conclua a visão antes de confirmar suas repetições.',
    en: 'Complete the vision before confirming your repetitions.',
  },
  visionReadAlternative: {
    pt: 'Alternativa sem áudio',
    en: 'No-audio alternative',
  },
  confirmVisionRead: {
    pt: 'Li a visão completa',
    en: 'I read the full vision',
  },
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
  previewDone: { pt: 'Teste concluído', en: 'Test complete' },
  doneBody: {
    pt: 'As duas repetições foram registradas na sua jornada. Nenhum áudio ou texto falado foi guardado.',
    en: 'Both repetitions were recorded in your journey. No audio or spoken text was stored.',
  },
  previewDoneBody: {
    pt: 'A prévia funcionou. Salve ou ative o Plano Celeste para usar estas escolhas nos horários do dia.',
    en: 'The preview worked. Save or activate your Celeste Plan to use these choices during the day.',
  },
  finish: { pt: 'Voltar para o início', en: 'Return Home' },
  previewFinish: { pt: 'Voltar ao Plano Celeste', en: 'Return to Celeste Plan' },
  missingTitle: { pt: 'Prática não encontrada', en: 'Practice not found' },
  missingBody: {
    pt: 'Abra o Plano Celeste para escolher uma visão ou Cena-Âncora, uma afirmação e seus horários.',
    en: 'Open the Celeste Plan to choose a vision or Anchor Scene, an affirmation, and your times.',
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
  const isFocused = useIsFocused();
  const { t, lang } = useT();
  const { state, completePracticePlanSlot } = useApp();
  const narration = usePersonalNarration();
  const sessionRef = useRef(0);
  const narrationEpochRef = useRef(0);
  const narrationSessionIdRef = useRef(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
  const narrationStopRef = useRef(narration.stop);
  const cloudPlaybackStartedRef = useRef(false);
  const cloudPlaybackIdRef = useRef(null);
  const localNarratingRef = useRef(false);
  const snoozeGuardRef = useRef(false);
  const mountedRef = useRef(true);

  const affirmations = useMemo(() => personalAffirmationsForState(state), [state]);
  const visions = useMemo(
    () => personalVisionOptionsForState(state, lang),
    [lang, state]
  );
  const plan = useMemo(
    () => normalizePracticePlan(state?.practicePlan, { affirmations, visions }),
    [affirmations, state?.practicePlan, visions]
  );
  const requestedSlotId = cleanText(route.params?.slotId, 80);
  const previewAffirmationId = cleanText(route.params?.previewAffirmationId, 180);
  const previewVisionId = cleanText(route.params?.previewVisionId, 180);
  const savedSlot = useMemo(
    () => plan.slots.find((item) => item.id === requestedSlotId && item.enabled) || null,
    [plan.slots, requestedSlotId]
  );
  const previewSlot = useMemo(
    () => {
      if (!previewAffirmationId || !previewVisionId) return null;
      const validAffirmation = affirmations.some((item) => item.id === previewAffirmationId);
      const validVision = visions.some((item) => item.id === previewVisionId);
      return requestedSlotId && validAffirmation && validVision
        ? {
            ...(savedSlot || { id: requestedSlotId, enabled: true, time: '' }),
            affirmationId: previewAffirmationId,
            visionId: previewVisionId,
          }
        : null;
    },
    [affirmations, previewAffirmationId, previewVisionId, requestedSlotId, savedSlot, visions]
  );
  const slot = previewSlot || savedSlot;
  const isPreviewSession = Boolean(previewSlot);
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
  const visionLang = vision?.lang === 'en' || vision?.speechLang === 'en' ? 'en' : lang;
  const visionLocale = visionLang === 'en' ? 'en-US' : 'pt-BR';
  const contentFingerprint = useMemo(
    () => practiceContentFingerprint({
      affirmationText,
      visionText: `${visionTitle}\n${visionText}`,
    }),
    [affirmationText, visionText, visionTitle]
  );
  // NarrationContext accepts at most 160 characters. A short content
  // fingerprint keeps ownership exact even when imported IDs are very long.
  const visionPlaybackId = `practice-vision:${narrationSessionIdRef.current}:${contentFingerprint}`;
  const cloudNarrationEnabled =
    narration.personalNarrationAvailable && hasUnifiedCloudMediaConsent(state?.profile);
  const ownsCloudNarration = Boolean(
    cloudPlaybackIdRef.current && narration.activePlaybackId === cloudPlaybackIdRef.current
  );
  const cloudNarrating = ownsCloudNarration && (
    narration.isLoading || narration.isPlaying || narration.isPaused
  );
  const practiceDay = todayISO();
  const completedAlready = useMemo(
    () => !isPreviewSession && plan.receipts.some((receipt) =>
      receipt.slotId === slot?.id &&
      receipt.day === practiceDay &&
      receipt.affirmationId === slot?.affirmationId &&
      receipt.visionId === slot?.visionId &&
      receipt.contentFingerprint === contentFingerprint
    ),
    [contentFingerprint, isPreviewSession, plan.receipts, practiceDay, slot?.affirmationId, slot?.id, slot?.visionId]
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
  const [localNarrating, setLocalNarrating] = useState(false);
  const [visionRequesting, setVisionRequesting] = useState(false);
  const [visionAudioFailed, setVisionAudioFailed] = useState(false);
  const [visionStepComplete, setVisionStepComplete] = useState(completedAlready);

  const stopOwnedLocalSpeech = useCallback(async () => {
    if (!localNarratingRef.current) return false;
    localNarratingRef.current = false;
    await Speech.stop().catch(() => {});
    return true;
  }, []);

  const stopOwnedCloudNarration = useCallback(() => {
    const playbackId = cloudPlaybackIdRef.current;
    cloudPlaybackIdRef.current = null;
    cloudPlaybackStartedRef.current = false;
    if (playbackId) narrationStopRef.current?.(playbackId);
    return playbackId;
  }, []);

  useEffect(() => {
    narrationStopRef.current = narration.stop;
  }, [narration.stop]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      narrationEpochRef.current += 1;
      cancelPracticeSpeech().catch(() => {});
      stopOwnedLocalSpeech();
      stopOwnedCloudNarration();
    };
  }, [stopOwnedCloudNarration, stopOwnedLocalSpeech]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' || !mountedRef.current) return;
      sessionRef.current += 1;
      narrationEpochRef.current += 1;
      cancelPracticeSpeech().catch(() => {});
      stopOwnedLocalSpeech();
      stopOwnedCloudNarration();
      setLocalNarrating(false);
      setVisionRequesting(false);
      setPhase((current) => current === 'complete' ? current : 'ready');
      setMessage(null);
    });
    return () => subscription.remove();
  }, [stopOwnedCloudNarration, stopOwnedLocalSpeech]);

  useEffect(() => {
    if (isFocused || !mountedRef.current) return;
    sessionRef.current += 1;
    narrationEpochRef.current += 1;
    cancelPracticeSpeech().catch(() => {});
    stopOwnedLocalSpeech();
    stopOwnedCloudNarration();
    setLocalNarrating(false);
    setVisionRequesting(false);
    setPhase((current) => current === 'complete' ? current : 'ready');
    setMessage(null);
  }, [isFocused, stopOwnedCloudNarration, stopOwnedLocalSpeech]);

  useEffect(() => {
    sessionRef.current += 1;
    narrationEpochRef.current += 1;
    snoozeGuardRef.current = false;
    cancelPracticeSpeech().catch(() => {});
    stopOwnedLocalSpeech();
    stopOwnedCloudNarration();
    setPhase(completedAlready ? 'complete' : 'ready');
    setRepetitions(completedAlready ? REQUIRED_REPETITIONS : 0);
    setFailures(0);
    setMessage(null);
    setFallbackAvailable(!RELEASE_FEATURES.onDevicePracticeSpeech || Platform.OS === 'web');
    setSnoozeBusy(false);
    setLocalNarrating(false);
    setVisionRequesting(false);
    setVisionAudioFailed(false);
    setVisionStepComplete(completedAlready);
  }, [completedAlready, sessionKey, stopOwnedCloudNarration, stopOwnedLocalSpeech]);

  const announce = useCallback((value) => {
    AccessibilityInfo.announceForAccessibility?.(value);
  }, []);

  useEffect(() => {
    const completedPlaybackId = cloudPlaybackIdRef.current;
    if (!completedPlaybackId || narration.lastCompletedPlaybackId !== completedPlaybackId) return;
    cloudPlaybackIdRef.current = null;
    cloudPlaybackStartedRef.current = false;
    setVisionRequesting(false);
    setVisionStepComplete(true);
    announce(t(S.visionDone));
  }, [announce, narration.lastCompletedPlaybackId, t]);

  const finishPractice = useCallback((method, score) => {
    if (!slot || !visionStepComplete || phase === 'complete') return;
    if (isPreviewSession) {
      setRepetitions(REQUIRED_REPETITIONS);
      setPhase('complete');
      setMessage(null);
      announce(t(S.previewDone));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
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
  }, [announce, completePracticePlanSlot, isPreviewSession, phase, slot, t, visionStepComplete]);

  const acceptRepetition = useCallback((method, score) => {
    if (!visionStepComplete) return;
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
  }, [announce, finishPractice, repetitions, t, visionStepComplete]);

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

  const stopVisionNarration = useCallback(async () => {
    narrationEpochRef.current += 1;
    await stopOwnedLocalSpeech();
    setLocalNarrating(false);
    setVisionRequesting(false);
    stopOwnedCloudNarration();
  }, [stopOwnedCloudNarration, stopOwnedLocalSpeech]);

  const speakVisionLocally = useCallback((epoch) => {
    if (!mountedRef.current || !isFocused || narrationEpochRef.current !== epoch) return false;
    const maxLength = Number.isFinite(Speech.maxSpeechInputLength)
      ? Math.max(1, Speech.maxSpeechInputLength)
      : visionText.length;
    if (visionText.length > maxLength) {
      setVisionRequesting(false);
      setVisionAudioFailed(true);
      return false;
    }

    try {
      setVisionAudioFailed(false);
      setVisionRequesting(false);
      localNarratingRef.current = true;
      setLocalNarrating(true);
      Speech.speak(visionText, {
        language: visionLocale,
        rate: 0.9,
        pitch: 1,
        useApplicationAudioSession: false,
        onDone: () => {
          if (!mountedRef.current || narrationEpochRef.current !== epoch) return;
          localNarratingRef.current = false;
          setLocalNarrating(false);
          setVisionStepComplete(true);
          announce(t(S.visionDone));
        },
        onStopped: () => {
          if (!mountedRef.current || narrationEpochRef.current !== epoch) return;
          localNarratingRef.current = false;
          setLocalNarrating(false);
        },
        onError: () => {
          if (!mountedRef.current || narrationEpochRef.current !== epoch) return;
          localNarratingRef.current = false;
          setLocalNarrating(false);
          setVisionAudioFailed(true);
        },
      });
      return true;
    } catch (_error) {
      if (!mountedRef.current || narrationEpochRef.current !== epoch) return false;
      localNarratingRef.current = false;
      setLocalNarrating(false);
      setVisionAudioFailed(true);
      return false;
    }
  }, [announce, isFocused, t, visionLocale, visionText]);

  useEffect(() => {
    if (!narration.error || !cloudPlaybackStartedRef.current) return;
    stopOwnedCloudNarration();
    setVisionRequesting(false);
    speakVisionLocally(narrationEpochRef.current);
  }, [narration.error, speakVisionLocally, stopOwnedCloudNarration]);

  const playVisionNarration = useCallback(async () => {
    if (!visionText) return;
    if (localNarrating || cloudNarrating || visionRequesting) {
      await stopVisionNarration();
      return;
    }

    const epoch = narrationEpochRef.current + 1;
    narrationEpochRef.current = epoch;
    setVisionAudioFailed(false);
    setVisionRequesting(true);
    await Speech.stop().catch(() => {});
    localNarratingRef.current = false;
    if (!mountedRef.current || !isFocused || narrationEpochRef.current !== epoch) {
      if (mountedRef.current && narrationEpochRef.current === epoch) setVisionRequesting(false);
      return;
    }

    // A prévia precisa tocar sem interromper a pessoa com um novo pedido de
    // consentimento. A voz neural continua sendo usada quando ela já ativou
    // os recursos de nuvem; nos demais casos, cai direto na voz do sistema.
    if (cloudNarrationEnabled) {
      const attemptPlaybackId = `${visionPlaybackId}:${epoch}`;
      cloudPlaybackIdRef.current = attemptPlaybackId;
      const result = await narration.playPersonal({
        text: visionText,
        lang: visionLang,
        playbackId: attemptPlaybackId,
      });
      if (!mountedRef.current || !isFocused || narrationEpochRef.current !== epoch) {
        narration.stop(attemptPlaybackId);
        if (cloudPlaybackIdRef.current === attemptPlaybackId) cloudPlaybackIdRef.current = null;
        if (mountedRef.current && narrationEpochRef.current === epoch) setVisionRequesting(false);
        return;
      }
      if (result?.ok && !result.ready) {
        cloudPlaybackStartedRef.current = true;
        setVisionRequesting(false);
        return;
      }
      if (result?.ok && result.ready) {
        if (cloudPlaybackIdRef.current === attemptPlaybackId) cloudPlaybackIdRef.current = null;
        narration.stop(attemptPlaybackId);
        setVisionRequesting(false);
        speakVisionLocally(epoch);
        return;
      }
      if (cloudPlaybackIdRef.current === attemptPlaybackId) cloudPlaybackIdRef.current = null;
      setVisionRequesting(false);
      if (result?.error === 'audio_cancelled') return;
    }

    speakVisionLocally(epoch);
  }, [
    cloudNarrating,
    cloudNarrationEnabled,
    isFocused,
    localNarrating,
    narration,
    speakVisionLocally,
    stopVisionNarration,
    visionLang,
    visionPlaybackId,
    visionRequesting,
    visionText,
  ]);

  const confirmVisionRead = useCallback(async () => {
    await stopVisionNarration();
    setVisionStepComplete(true);
    setVisionAudioFailed(false);
    announce(t(S.visionDone));
  }, [announce, stopVisionNarration, t]);

  const startListening = useCallback(async () => {
    if (!slot || !affirmationText || !visionStepComplete || phase === 'listening' || phase === 'checking' || phase === 'complete') return;
    await stopVisionNarration();
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
  }, [acceptRepetition, affirmationText, announce, handleSpeechFailure, locale, phase, slot, speechLang, stopVisionNarration, t, visionStepComplete]);

  const confirmAccessibleReading = useCallback(async () => {
    if (!fallbackAvailable || !visionStepComplete || phase === 'complete') return;
    await stopVisionNarration();
    acceptRepetition('accessibility', 0);
  }, [acceptRepetition, fallbackAvailable, phase, stopVisionNarration, visionStepComplete]);

  const leaveNow = useCallback(async () => {
    sessionRef.current += 1;
    await cancelPracticeSpeech().catch(() => {});
    await stopVisionNarration();
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.replace('Main');
  }, [navigation, stopVisionNarration]);

  const finishNavigation = useCallback(() => {
    if (isPreviewSession) {
      if (navigation.canGoBack()) navigation.goBack();
      else navigation.replace('PracticePlan');
      return;
    }
    navigation.navigate('Main');
  }, [isPreviewSession, navigation]);

  const snooze = useCallback(async () => {
    if (!slot || snoozeBusy || snoozeGuardRef.current) return;
    snoozeGuardRef.current = true;
    sessionRef.current += 1;
    await cancelPracticeSpeech().catch(() => {});
    await stopVisionNarration();
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
  }, [announce, lang, navigation, slot, snoozeBusy, stopVisionNarration, t]);

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
        <Header
          eyebrow={t(S.eyebrow)}
          title={t(isPreviewSession ? S.previewDone : S.done)}
          subtitle={t(isPreviewSession ? S.previewDoneBody : S.doneBody)}
        />
        <Card
          style={[
            styles.completeCard,
            { backgroundColor: `${theme.success}10`, borderColor: `${theme.success}55` },
          ]}
        >
          <View style={[styles.completeHalo, { borderColor: `${theme.success}30` }]}>
            <View style={[styles.completeIcon, { backgroundColor: `${theme.success}22` }]}>
              <Ionicons name="checkmark-circle" size={54} color={theme.success} />
            </View>
          </View>
          <Text style={[styles.completeProgress, { color: theme.text }]}>
            {t(S.progress).replace('{n}', String(REQUIRED_REPETITIONS))}
          </Text>
          <Text style={[styles.completePrivacy, { color: theme.textMuted }]}>{t(S.privacy)}</Text>
        </Card>
        <Button
          icon={isPreviewSession ? 'calendar-outline' : 'home-outline'}
          label={t(isPreviewSession ? S.previewFinish : S.finish)}
          onPress={finishNavigation}
          style={styles.actionButton}
        />
      </Screen>
    );
  }

  const busy = phase === 'listening' || phase === 'checking';
  const visionNarrating = localNarrating || cloudNarrating || visionRequesting;
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
    : !visionStepComplete
    ? t(S.visionRequired)
    : t(S.ready);
  const feedbackColor = message === 'firstDone'
    ? theme.success
    : ['denied', 'unavailable', 'changed', 'tryAgain', 'snoozeFailed'].includes(message)
    ? theme.warning
    : theme.textMuted;

  return (
    <Screen testID="practice-ritual-screen">
      <Header eyebrow={t(S.eyebrow)} title={t(S.title)} subtitle={t(S.subtitle)} />

      <Card tone="alt" style={styles.privacyCard}>
        <View style={[styles.privacyIcon, { backgroundColor: theme.accentSoft }]}>
          <Ionicons name="shield-checkmark-outline" size={21} color={theme.accent} />
        </View>
        <Text style={[styles.privacyText, { color: theme.textMutedOnAlt || theme.textMuted }]}>{t(S.privacy)}</Text>
      </Card>

      <Text style={[styles.stepLabel, { color: theme.accent }]}>{t(S.visionLabel)}</Text>
      <GradientCover
        testID="practice-vision-visual"
        accent={vision?.accent || 0}
        visualKey={vision?.visualKey}
        icon="images-outline"
        radius={22}
        style={styles.visionVisual}
        decorative
      >
        <View
          aria-hidden={true}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.visionVisualCopy}
        >
          <Text style={styles.visionVisualTitle}>{visionTitle}</Text>
        </View>
      </GradientCover>
      <Card style={[styles.visionCard, { borderLeftColor: theme.accent }]}>
        {visionTitle ? (
          <View style={styles.visionHeading}>
            <View style={[styles.visionIcon, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="images-outline" size={19} color={theme.accent} />
            </View>
            <Text style={[styles.visionTitle, { color: theme.text }]}>{visionTitle}</Text>
          </View>
        ) : null}
        <Text selectable style={[styles.visionText, { color: theme.text }]}>{visionText}</Text>
      </Card>
      <Text style={[styles.visionAudioHint, { color: theme.textMuted }]}>{t(S.visionAudioHint)}</Text>
      <Button
        testID="practice-play-full-vision"
        variant="soft"
        icon={visionNarrating ? 'stop-circle-outline' : 'volume-high-outline'}
        label={visionNarrating ? t(S.stopVision) : t(S.playVision)}
        onPress={playVisionNarration}
        disabled={busy}
        style={styles.visionAudioButton}
      />
      {visionAudioFailed ? (
        <Text accessibilityRole="alert" style={[styles.visionAudioError, { color: theme.warning }]}>
          {t(S.visionAudioFailed)}
        </Text>
      ) : null}
      {!visionStepComplete ? (
        <View style={styles.visionAlternative}>
          <Text style={[styles.visionAlternativeLabel, { color: theme.textMuted }]}>
            {t(S.visionReadAlternative)}
          </Text>
          <Button
            testID="practice-confirm-vision-read"
            variant="ghost"
            icon="book-outline"
            label={t(S.confirmVisionRead)}
            onPress={confirmVisionRead}
            disabled={busy}
            style={styles.actionButton}
          />
        </View>
      ) : (
        <Text style={[styles.visionDone, { color: theme.success }]}>
          {t(S.visionDone)}
        </Text>
      )}

      <Text style={[styles.stepLabel, { color: theme.accent }]}>{t(S.affirmationLabel)}</Text>
      <Card style={[styles.affirmationCard, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
        <Ionicons name="sparkles" size={22} color={theme.accent} style={styles.affirmationSparkle} />
        <Text selectable accessibilityRole="text" style={[styles.affirmationText, { color: theme.text }]}>
          {affirmationText}
        </Text>
      </Card>

      <View style={[styles.progressPanel, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
        <View style={styles.repetitionRow} accessibilityLabel={t(S.progress).replace('{n}', String(repetitions))}>
          {[0, 1].map((index) => (
            <View
              key={index}
              style={[
                styles.repetitionDot,
                {
                  backgroundColor: index < repetitions ? theme.success : theme.surface,
                  borderColor: index < repetitions ? theme.success : theme.border,
                },
              ]}
            >
              <Ionicons
                name={index < repetitions ? 'checkmark' : 'mic-outline'}
                size={20}
                color={index < repetitions ? '#FFFFFF' : theme.textMuted}
              />
            </View>
          ))}
          <Text style={[styles.progressText, { color: theme.text }]}>
            {t(S.progress).replace('{n}', String(repetitions))}
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: repetitions === REQUIRED_REPETITIONS ? theme.success : theme.accent,
                width: `${(repetitions / REQUIRED_REPETITIONS) * 100}%`,
              },
            ]}
          />
        </View>

        <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: feedbackColor }]}>
          {phase === 'listening' ? t(S.listening) : phase === 'checking' ? t(S.checking) : messageText}
        </Text>
      </View>

      {RELEASE_FEATURES.onDevicePracticeSpeech ? (
        <Button
          testID="practice-listen-button"
          icon={phase === 'listening' ? 'radio-outline' : 'mic-outline'}
          label={repetitions === 0 ? t(S.listen) : t(S.listenAgain)}
          onPress={startListening}
          loading={busy}
          disabled={!visionStepComplete}
          style={styles.primaryPracticeButton}
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
          style={styles.actionButton}
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
            disabled={busy || !visionStepComplete}
            style={styles.actionButton}
          />
        </Card>
      ) : null}

      <View style={styles.exitRow}>
        {!isPreviewSession ? (
          <Button
            variant="ghost"
            icon="time-outline"
            label={t(S.snooze)}
            onPress={snooze}
            loading={snoozeBusy}
            style={[styles.exitButton, styles.actionButton]}
          />
        ) : null}
        <Button
          variant="ghost"
          icon="close-outline"
          label={t(S.notNow)}
          onPress={leaveNow}
          style={[styles.exitButton, styles.actionButton]}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  privacyCard: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 20, paddingVertical: 18 },
  privacyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  privacyText: { flex: 1, marginLeft: 12, fontSize: 13, lineHeight: 20, fontWeight: '550' },
  stepLabel: { marginTop: 24, marginBottom: 10, fontSize: 12, lineHeight: 17, fontWeight: '850', textTransform: 'uppercase', letterSpacing: 1.05 },
  visionVisual: { minHeight: 210, justifyContent: 'flex-end', marginBottom: 12 },
  visionVisualCopy: { minHeight: 88, justifyContent: 'flex-end', paddingHorizontal: 20, paddingVertical: 18 },
  visionVisualTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 31, fontWeight: '850', letterSpacing: -0.3, textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  visionCard: { borderLeftWidth: 4, borderRadius: 20, paddingVertical: 18 },
  visionHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  visionIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  visionTitle: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '850', letterSpacing: -0.15 },
  visionText: { fontSize: 17, lineHeight: 28, fontWeight: '500' },
  visionAudioHint: { marginTop: 11, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  visionAudioButton: { minHeight: 52, marginTop: 8 },
  visionAudioError: { marginTop: 8, textAlign: 'center', fontSize: 13, lineHeight: 19, fontWeight: '650' },
  visionAlternative: { marginTop: 6, alignItems: 'center' },
  visionAlternativeLabel: { fontSize: 12, lineHeight: 18, fontWeight: '650' },
  visionDone: { marginTop: 10, textAlign: 'center', fontSize: 13, lineHeight: 19, fontWeight: '800' },
  affirmationCard: { position: 'relative', overflow: 'hidden', borderWidth: 2, borderRadius: 22, paddingVertical: 28, paddingHorizontal: 22 },
  affirmationSparkle: { alignSelf: 'center', marginBottom: 10 },
  affirmationText: { textAlign: 'center', fontSize: 25, lineHeight: 36, fontWeight: '750', fontStyle: 'italic', letterSpacing: -0.25 },
  progressPanel: { marginTop: 14, marginBottom: 8, borderWidth: 1, borderRadius: 20, padding: 16 },
  repetitionRow: { flexDirection: 'row', alignItems: 'center' },
  repetitionDot: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  progressText: { flex: 1, marginLeft: 4, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 14 },
  progressFill: { height: '100%', borderRadius: 3 },
  feedback: { minHeight: 44, marginTop: 12, textAlign: 'center', fontSize: 13.5, lineHeight: 20, fontWeight: '650' },
  primaryPracticeButton: { minHeight: 56, borderRadius: 28 },
  actionButton: { minHeight: 48 },
  fallbackCard: { marginTop: 10, borderRadius: 20, paddingVertical: 18 },
  fallbackText: { marginBottom: 10, textAlign: 'center', fontSize: 13, lineHeight: 19 },
  exitRow: { flexDirection: 'row', marginHorizontal: -4, marginTop: 10, marginBottom: 4 },
  exitButton: { flex: 1, marginHorizontal: 4 },
  completeCard: { alignItems: 'center', borderRadius: 24, paddingVertical: 32, paddingHorizontal: 22 },
  completeHalo: { width: 110, height: 110, borderRadius: 55, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  completeIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  completeProgress: { textAlign: 'center', fontSize: 20, lineHeight: 27, fontWeight: '850', letterSpacing: -0.2 },
  completePrivacy: { marginTop: 12, textAlign: 'center', fontSize: 13, lineHeight: 20 },
});
