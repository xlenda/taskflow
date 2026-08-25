import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { useApp } from '../context/AppContext';
import { AFFIRMATIONS, localized } from '../constants/content';
import PrimaryButton from '../components/PrimaryButton';
import { useTheme } from '../ui/theme';
import { useT } from '../utils/useT';
import { accentAt, alpha } from '../utils/colors';
import { createDreamAffirmation } from '../utils/morningRitual';
import { narrate, stopSpeaking, warmUpVoices } from '../utils/speech';
import { confirmAsync } from '../utils/confirm';
import {
  DEFAULT_AFFIRMATION_ALARM_ID,
  cancelAffirmationAlarm,
  getAffirmationAlarmCapability,
  scheduleAffirmationAlarm,
} from '../services/affirmationAlarm';

const S = {
  title: { pt: 'Meu despertar', en: 'My wake-up' },
  subtitle: {
    pt: 'Seus sonhos e a afirmação que vai acordar você.',
    en: 'Your dreams and the affirmation that will wake you.',
  },
  wakeTitle: { pt: 'A afirmação será o alarme', en: 'Your affirmation is the alarm' },
  wakeBody: {
    pt: 'Escolha ou escreva a frase que tocará no horário marcado para acordar você.',
    en: 'Choose or write the words that will play at the scheduled time to wake you.',
  },
  noAffirmation: { pt: 'Nenhuma afirmação escolhida', en: 'No affirmation selected' },
  choose: { pt: 'Escolher afirmação', en: 'Choose affirmation' },
  change: { pt: 'Trocar', en: 'Change' },
  preview: { pt: 'Ouvir prévia', en: 'Hear preview' },
  stop: { pt: 'Parar', en: 'Stop' },
  time: { pt: 'Horário do despertador', en: 'Alarm time' },
  saveWake: { pt: 'Ativar despertador', en: 'Turn alarm on' },
  checkingAlarm: { pt: 'Verificando o despertador deste aparelho…', en: 'Checking this device alarm…' },
  webUnsupported: {
    pt: 'No site você pode escolher a frase, o horário e ouvir a prévia. Para ela tocar como despertador e acordar você, use o app instalado no iPhone.',
    en: 'On the website you can choose the affirmation, time and hear a preview. To play it as an alarm that wakes you, use the installed iPhone app.',
  },
  notScheduled: {
    pt: 'Nenhum despertador está ativo. A prévia funciona agora.',
    en: 'No alarm is active. The preview works now.',
  },
  nativePending: {
    pt: 'Este aparelho ainda não tem o módulo nativo necessário para usar a afirmação como despertador real.',
    en: 'This device does not yet have the native module required to use the affirmation as a real alarm.',
  },
  alarmScheduled: { pt: 'Despertador ativado para {time}.', en: 'Alarm set for {time}.' },
  alarmDenied: {
    pt: 'Permita o acesso aos Alarmes do iPhone para ativar este despertador.',
    en: 'Allow iPhone Alarm access to turn this alarm on.',
  },
  alarmFailed: {
    pt: 'O despertador não foi ativado. Tente novamente no app instalado.',
    en: 'The alarm was not activated. Try again in the installed app.',
  },
  alarmSyncFailed: {
    pt: 'A frase do despertador não pôde ser confirmada. Desative-o ou escolha a frase novamente antes de confiar nele.',
    en: 'The alarm affirmation could not be confirmed. Turn it off or choose the affirmation again before relying on it.',
  },
  alarmBusy: { pt: 'Ativando o despertador…', en: 'Turning the alarm on…' },
  audioUnavailable: {
    pt: 'A voz privada não está disponível neste aparelho. A frase continua salva para leitura.',
    en: 'A private voice is unavailable on this device. The phrase remains saved for reading.',
  },
  dreamShortcutTitle: { pt: 'Conte seu sonho', en: 'Share your dream' },
  dreamShortcutBody: {
    pt: 'Fale ou escreva o que sonhou e transforme isso numa afirmação só sua.',
    en: 'Speak or write what you dreamed and turn it into an affirmation of your own.',
  },
  bonus: { pt: 'Seus sonhos', en: 'Your dreams' },
  threeS: { pt: 'Sonhar · Significar · Sentir', en: 'Dream · Meaning · Feeling' },
  bonusBody: {
    pt: 'Conte um sonho da noite e transforme o sentimento dele numa afirmação positiva.',
    en: 'Share a dream from the night and turn its feeling into a positive affirmation.',
  },
  openDream: { pt: 'Transformar meu sonho', en: 'Transform my dream' },
  closeDream: { pt: 'Fechar bônus', en: 'Close bonus' },
  dreamLabel: { pt: 'O que ficou do sonho?', en: 'What stayed with you?' },
  dreamPlaceholder: {
    pt: 'Eu estava perto do mar e encontrei uma porta que nunca tinha visto…',
    en: 'I was near the sea and found a door I had never seen before…',
  },
  feelingLabel: { pt: 'Como você acordou?', en: 'How did you wake up feeling?' },
  meaningLabel: { pt: 'O que quer levar para o dia?', en: 'What do you want to carry into your day?' },
  automatic: { pt: 'Pelo que senti', en: 'From how I felt' },
  speakDream: { pt: 'Contar por voz', en: 'Speak my dream' },
  listening: { pt: 'Ouvindo…', en: 'Listening…' },
  voiceUnavailable: { pt: 'Voz indisponível aqui; escreva normalmente.', en: 'Voice is unavailable here; type normally.' },
  voicePrivacy: {
    pt: 'A transcrição é fornecida pelo navegador. A transformação da frase acontece localmente.',
    en: 'Transcription is provided by your browser. The affirmation is transformed locally.',
  },
  transform: { pt: 'Transformar em afirmação', en: 'Turn into an affirmation' },
  meaningResult: { pt: 'Um significado possível', en: 'One possible meaning' },
  affirmationResult: { pt: 'Sua frase desta manhã', en: 'Your phrase this morning' },
  listenResult: { pt: 'Ouvir', en: 'Listen' },
  feel: { pt: 'Sentir por 12 segundos', en: 'Feel it for 12 seconds' },
  breathingIn: { pt: 'Inspire devagar', en: 'Breathe in slowly' },
  breathingOut: { pt: 'Expire sem pressa', en: 'Breathe out slowly' },
  completed: { pt: 'Prática concluída', en: 'Practice complete' },
  useTomorrow: { pt: 'Usar no próximo despertar', en: 'Use for my next wake-up' },
  usedTomorrow: { pt: 'Este será seu próximo despertar', en: 'This will be your next wake-up' },
  lastDream: { pt: 'Praticar a última frase', en: 'Practice the latest phrase' },
  pickerTitle: { pt: 'Afirmação para despertar', en: 'Wake-up affirmation' },
  pickerBody: {
    pt: 'Escolha uma frase do Celeste ou escreva exatamente o que quer ouvir.',
    en: 'Choose a Celeste affirmation or write exactly what you want to hear.',
  },
  customLabel: { pt: 'Minha própria afirmação', en: 'My own affirmation' },
  customPlaceholder: {
    pt: 'Eu acordo pronta para viver um dia extraordinário.',
    en: 'I wake up ready to live an extraordinary day.',
  },
  customSave: { pt: 'Usar esta frase', en: 'Use this affirmation' },
  deleteDream: { pt: 'Apagar este sonho e a frase', en: 'Delete this dream and affirmation' },
  deleteDreamTitle: { pt: 'Apagar este sonho?', en: 'Delete this dream?' },
  deleteDreamBody: {
    pt: 'O relato e a afirmação criada a partir dele serão apagados deste aparelho.',
    en: 'The dream and the affirmation created from it will be deleted from this device.',
  },
  deleteDreamConfirm: { pt: 'Apagar', en: 'Delete' },
  cancel: { pt: 'Cancelar', en: 'Cancel' },
  close: { pt: 'Fechar', en: 'Close' },
  personal: { pt: 'Sua', en: 'Yours' },
  celeste: { pt: 'Celeste', en: 'Celeste' },
};

const FEELINGS = [
  { key: 'calm', label: { pt: 'Calma', en: 'Calm' } },
  { key: 'joyful', label: { pt: 'Feliz', en: 'Joyful' } },
  { key: 'curious', label: { pt: 'Curiosa', en: 'Curious' } },
  { key: 'anxious', label: { pt: 'Ansiosa', en: 'Anxious' } },
  { key: 'confused', label: { pt: 'Confusa', en: 'Confused' } },
  { key: 'powerful', label: { pt: 'Poderosa', en: 'Powerful' } },
];

const THEMES = [
  { key: 'clarity', label: { pt: 'Clareza', en: 'Clarity' } },
  { key: 'courage', label: { pt: 'Coragem', en: 'Courage' } },
  { key: 'peace', label: { pt: 'Paz', en: 'Peace' } },
  { key: 'connection', label: { pt: 'Conexão', en: 'Connection' } },
  { key: 'abundance', label: { pt: 'Prosperidade', en: 'Abundance' } },
  { key: 'renewal', label: { pt: 'Recomeço', en: 'Renewal' } },
];

const TIMES = ['06:00', '06:30', '07:00', '07:30', '08:00'];
const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();

function recognitionClass() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export default function MorningRitualScreen({ route }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const focused = useIsFocused();
  const { t, lang } = useT();
  const {
    state,
    saveMorningRitualPreferences,
    saveDreamRitual,
    markDreamRitualPracticed,
    removeDreamRitual,
  } = useApp();

  const ritual = state.morningRitual || {
    alarmStatus: 'native_integration_required',
    reminderEnabled: false,
    alarmSyncError: false,
    reminderTime: '07:00',
    wakeAffirmationId: null,
    wakeAffirmationText: '',
    entries: [],
  };
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customWake, setCustomWake] = useState(
    ritual.wakeAffirmationId === 'custom' ? ritual.wakeAffirmationText : ''
  );
  const [bonusOpen, setBonusOpen] = useState(false);
  const [dream, setDream] = useState('');
  const [feeling, setFeeling] = useState('');
  const [meaning, setMeaning] = useState('auto');
  const [result, setResult] = useState(null);
  const [entryId, setEntryId] = useState(null);
  const [speaking, setSpeaking] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceFailed, setVoiceFailed] = useState(false);
  const [practiceState, setPracticeState] = useState('idle');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [alarmCapability, setAlarmCapability] = useState(null);
  const [alarmFeedback, setAlarmFeedback] = useState(null);
  const [alarmBusy, setAlarmBusy] = useState(false);
  const recognitionRef = useRef(null);
  const mainScrollRef = useRef(null);
  const mainScrollYRef = useRef(0);
  const dreamInputRef = useRef(null);
  const dreamResultPanelRef = useRef(null);
  const dreamSectionYRef = useRef(0);
  const dreamPanelYRef = useRef(0);
  const dreamResultYRef = useRef(0);
  const dreamScrollFrameRef = useRef(null);
  const dreamSettleFrameRef = useRef(null);
  const dreamScrollTimerRef = useRef(null);
  const dreamResultTimerRef = useRef(null);
  const alarmOperationRef = useRef(false);
  const practiceProgress = useRef(new Animated.Value(0)).current;
  const practiceTimers = useRef([]);
  const mountedRef = useRef(true);
  const voiceAvailable = useMemo(() => !!recognitionClass(), []);

  const wakeOptions = useMemo(() => {
    const personal = (state.manifestations || [])
      .filter((item) => typeof item.affirmation === 'string' && item.affirmation.trim())
      .map((item) => ({
        id: `manifestation:${item.id}`,
        text: item.affirmation.trim(),
        lang: item.lang === 'en' ? 'en' : 'pt',
        personal: true,
      }));
    const fixed = AFFIRMATIONS.map((item) => ({
      id: item.id,
      text: localized(item, lang).text,
      lang,
      personal: false,
    }));
    return [...personal, ...fixed];
  }, [state.manifestations, lang]);

  const selectedWake = useMemo(() => {
    const active = wakeOptions.find((item) => item.id === ritual.wakeAffirmationId);
    if (active) return active;
    if (!ritual.wakeAffirmationText) return null;
    return {
      id: ritual.wakeAffirmationId,
      text: ritual.wakeAffirmationText,
      lang: ritual.wakeAffirmationLang || lang,
      personal: true,
    };
  }, [wakeOptions, ritual.wakeAffirmationId, ritual.wakeAffirmationText, ritual.wakeAffirmationLang, lang]);

  const lastEntry = ritual.entries && ritual.entries[0];
  const usingResultForWake = !!result && ritual.wakeAffirmationId === `ritual:${entryId}`;

  const clearPractice = useCallback(() => {
    practiceTimers.current.forEach(clearTimeout);
    practiceTimers.current = [];
    practiceProgress.stopAnimation();
  }, [practiceProgress]);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch (_error) {}
    }
    if (mountedRef.current) setListening(false);
  }, []);

  const scrollToDreamSection = useCallback((animated = true) => {
    mainScrollRef.current?.scrollTo({
      y: Math.max(0, dreamSectionYRef.current - 12),
      animated,
    });
  }, []);

  const settleDreamSection = useCallback(() => {
    dreamInputRef.current?.focus();
    if (dreamSettleFrameRef.current) cancelAnimationFrame(dreamSettleFrameRef.current);
    // Focusing may make Safari/Chromium scroll on its own. Our scroll runs in
    // the next frame so the final position is deterministic and fully visible.
    dreamSettleFrameRef.current = requestAnimationFrame(() => {
      dreamSettleFrameRef.current = null;
      if (mountedRef.current) scrollToDreamSection(true);
    });
  }, [scrollToDreamSection]);

  const scheduleDreamSettle = useCallback((delay = 180) => {
    if (dreamScrollTimerRef.current) clearTimeout(dreamScrollTimerRef.current);
    dreamScrollTimerRef.current = setTimeout(() => {
      dreamScrollTimerRef.current = null;
      if (mountedRef.current) settleDreamSection();
    }, delay);
  }, [settleDreamSection]);

  const scrollToDreamResult = useCallback(() => {
    Keyboard.dismiss();
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const target =
        document.querySelector('[data-testid="dream-personalized-affirmation"]') ||
        document.querySelector('[data-testid="dream-result-panel"]');
      if (target && typeof target.scrollIntoView === 'function') {
        target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        return;
      }
      const scroller = document.querySelector('[data-testid="morning-ritual-scroll"]');
      if (target && scroller) {
        const targetTop = target.getBoundingClientRect().top;
        const scrollerTop = scroller.getBoundingClientRect().top;
        scroller.scrollTo({
          top: Math.max(0, scroller.scrollTop + targetTop - scrollerTop - 12),
          behavior: 'smooth',
        });
        return;
      }
    }
    const panel = dreamResultPanelRef.current;
    if (panel && typeof panel.measureInWindow === 'function') {
      panel.measureInWindow((_x, windowY) => {
        if (!mountedRef.current) return;
        mainScrollRef.current?.scrollTo({
          y: Math.max(0, mainScrollYRef.current + windowY - 92),
          animated: true,
        });
      });
      return;
    }
    mainScrollRef.current?.scrollTo({
      y: Math.max(0, dreamSectionYRef.current + dreamPanelYRef.current + dreamResultYRef.current - 12),
      animated: true,
    });
  }, []);

  const openDreamSection = useCallback(() => {
    clearPractice();
    setPracticeState('idle');
    setBonusOpen(true);
    if (dreamScrollTimerRef.current) clearTimeout(dreamScrollTimerRef.current);
    if (dreamScrollFrameRef.current) cancelAnimationFrame(dreamScrollFrameRef.current);
    dreamScrollFrameRef.current = requestAnimationFrame(() => {
      dreamScrollFrameRef.current = null;
      scrollToDreamSection(true);
      // The expanded form changes the ScrollView height. A second pass after
      // layout keeps the input visible on compact phones and slow web views.
      scheduleDreamSettle(180);
    });
  }, [clearPractice, scrollToDreamSection, scheduleDreamSettle]);

  useEffect(() => {
    if (!focused || route?.params?.focus !== 'dream') return;
    openDreamSection();
    // Clear the one-shot request so returning from another screen does not
    // reopen the form. Navigating from Home can request it again later.
    navigation.setParams({ focus: undefined });
  }, [focused, route?.params?.focus, navigation, openDreamSection]);

  useEffect(() => {
    mountedRef.current = true;
    warmUpVoices(lang);
    warmUpVoices(lang, { localOnly: true });
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mountedRef.current = false;
      if (dreamScrollFrameRef.current) cancelAnimationFrame(dreamScrollFrameRef.current);
      if (dreamSettleFrameRef.current) cancelAnimationFrame(dreamSettleFrameRef.current);
      if (dreamScrollTimerRef.current) clearTimeout(dreamScrollTimerRef.current);
      if (dreamResultTimerRef.current) clearTimeout(dreamResultTimerRef.current);
      stopRecognition();
      if (subscription && subscription.remove) subscription.remove();
    };
  }, [lang, stopRecognition]);

  useEffect(() => {
    if (!focused) return undefined;
    let active = true;
    getAffirmationAlarmCapability()
      .then((capability) => {
        if (!active) return;
        setAlarmCapability(capability);
        // reminderEnabled means a real native alarm exists. Older web builds
        // stored it as a preference even though no alarm had been scheduled.
        if (Platform.OS === 'web' && ritual.reminderEnabled) {
          saveMorningRitualPreferences({ reminderEnabled: false });
          return;
        }
        if (Array.isArray(capability.scheduledAlarmIds)) {
          const scheduled = capability.scheduledAlarmIds.includes(DEFAULT_AFFIRMATION_ALARM_ID);
          if (scheduled !== ritual.reminderEnabled) {
            saveMorningRitualPreferences({
              reminderEnabled: scheduled,
              ...(!scheduled ? { alarmSyncError: false } : {}),
            });
          }
        }
      })
      .catch(() => {
        if (active) setAlarmCapability({ supported: false, reason: 'capability_error' });
      });
    return () => {
      active = false;
    };
  }, [focused, ritual.reminderEnabled, saveMorningRitualPreferences]);

  useEffect(() => {
    if (!focused) {
      stopSpeaking();
      setSpeaking(false);
      stopRecognition();
      clearPractice();
      setPracticeState('idle');
    }
    return () => {
      stopSpeaking();
      stopRecognition();
      clearPractice();
    };
  }, [focused, clearPractice, stopRecognition]);

  const haptic = useCallback((success = false) => {
    if (Platform.OS === 'web') return;
    const task = success
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.selectionAsync();
    task.catch(() => {});
  }, []);

  const scheduleRealAlarm = useCallback(async ({ id, text, itemLang, time }) => {
    if (alarmOperationRef.current) return false;
    alarmOperationRef.current = true;
    setAlarmBusy(true);
    setAlarmFeedback(null);
    try {
      const response = await scheduleAffirmationAlarm({
        time,
        affirmation: text,
        locale: (itemLang || lang) === 'pt' ? 'pt-BR' : 'en-US',
        requestAuthorization: true,
      });
      // Persist the native side effect even if the screen was popped while the
      // bridge was working. UI-only state remains protected by mountedRef.
      let resolvedCapability = response.capability;
      if (response.ok === true) {
        saveMorningRitualPreferences({
          reminderEnabled: true,
          alarmSyncError: false,
          reminderTime: time,
          wakeAffirmationId: id,
          wakeAffirmationText: text,
          wakeAffirmationLang: itemLang || lang,
        });
      } else {
        let scheduledAlarmIds = Array.isArray(response.scheduledAlarmIds)
          ? response.scheduledAlarmIds
          : null;
        if (!scheduledAlarmIds) {
          try {
            resolvedCapability = await getAffirmationAlarmCapability();
            scheduledAlarmIds = Array.isArray(resolvedCapability.scheduledAlarmIds)
              ? resolvedCapability.scheduledAlarmIds
              : null;
          } catch (_error) {}
        }
        const stillScheduled =
          Array.isArray(scheduledAlarmIds) &&
          scheduledAlarmIds.includes(DEFAULT_AFFIRMATION_ALARM_ID);
        saveMorningRitualPreferences({
          reminderEnabled: stillScheduled,
          alarmSyncError: stillScheduled,
        });
      }
      if (mountedRef.current) {
        if (resolvedCapability) setAlarmCapability(resolvedCapability);
        setAlarmFeedback(
          response.ok === true
            ? 'scheduled'
            : response.reason === 'authorization_denied'
            ? 'denied'
            : 'failed'
        );
        if (response.ok) haptic(true);
      }
      return response.ok === true;
    } catch (error) {
      try {
        const capability = await getAffirmationAlarmCapability();
        const stillScheduled =
          Array.isArray(capability.scheduledAlarmIds) &&
          capability.scheduledAlarmIds.includes(DEFAULT_AFFIRMATION_ALARM_ID);
        saveMorningRitualPreferences({
          reminderEnabled: stillScheduled,
          alarmSyncError: stillScheduled,
        });
        if (mountedRef.current) setAlarmCapability(capability);
      } catch (_capabilityError) {
        saveMorningRitualPreferences({ reminderEnabled: false, alarmSyncError: false });
      }
      if (mountedRef.current) {
        setAlarmFeedback('failed');
      }
      return false;
    } finally {
      alarmOperationRef.current = false;
      if (mountedRef.current) setAlarmBusy(false);
    }
  }, [lang, saveMorningRitualPreferences, haptic]);

  const setAlarmEnabled = useCallback(async (enabled) => {
    if (alarmBusy || alarmOperationRef.current || (enabled && !selectedWake)) return;
    if (enabled) {
      await scheduleRealAlarm({
        id: selectedWake.id,
        text: selectedWake.text,
        itemLang: selectedWake.lang,
        time: ritual.reminderTime,
      });
      return;
    }
    alarmOperationRef.current = true;
    setAlarmBusy(true);
    setAlarmFeedback(null);
    try {
      const response = await cancelAffirmationAlarm();
      // The native alarm is already gone even if this screen was popped while
      // the bridge was working. Keep provider state aligned with that result.
      if (response.ok === true) {
        saveMorningRitualPreferences({ reminderEnabled: false, alarmSyncError: false });
      }
      if (mountedRef.current) {
        if (response.capability) setAlarmCapability(response.capability);
        if (response.ok) {
          setAlarmFeedback(null);
          haptic();
        } else {
          setAlarmFeedback('failed');
        }
      }
    } catch (error) {
      if (mountedRef.current) setAlarmFeedback('failed');
    } finally {
      alarmOperationRef.current = false;
      if (mountedRef.current) setAlarmBusy(false);
    }
  }, [alarmBusy, selectedWake, ritual.reminderTime, scheduleRealAlarm, saveMorningRitualPreferences, haptic]);

  const selectWake = useCallback(async (item) => {
    stopSpeaking();
    setSpeaking(false);
    if (ritual.reminderEnabled) {
      const scheduled = await scheduleRealAlarm({
        id: item.id,
        text: item.text,
        itemLang: item.lang,
        time: ritual.reminderTime,
      });
      if (!scheduled) return;
    }
    saveMorningRitualPreferences({
      wakeAffirmationId: item.id,
      wakeAffirmationText: item.text,
      wakeAffirmationLang: item.lang,
    });
    if (mountedRef.current) setPickerOpen(false);
    if (!ritual.reminderEnabled) haptic();
  }, [ritual.reminderEnabled, ritual.reminderTime, saveMorningRitualPreferences, scheduleRealAlarm, haptic]);

  const selectAlarmTime = useCallback(async (time) => {
    if (ritual.reminderEnabled && selectedWake) {
      const scheduled = await scheduleRealAlarm({
        id: selectedWake.id,
        text: selectedWake.text,
        itemLang: selectedWake.lang,
        time,
      });
      if (!scheduled) return;
    }
    saveMorningRitualPreferences({ reminderTime: time });
    if (mountedRef.current && !ritual.reminderEnabled) setAlarmFeedback(null);
    if (!ritual.reminderEnabled) haptic();
  }, [ritual.reminderEnabled, selectedWake, saveMorningRitualPreferences, scheduleRealAlarm, haptic]);

  const saveCustomWake = useCallback(() => {
    const text = clean(customWake).slice(0, 280);
    if (text.length < 4) return;
    selectWake({ id: 'custom', text, lang, personal: true });
  }, [customWake, lang, selectWake]);

  const playText = useCallback((item) => {
    if (!item) return;
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    setAudioFailed(false);
    const played = narrate(item.personal ? null : item.id, item.text, {
      lang: item.lang || lang,
      localOnly: !!item.personal,
      onDone: () => mountedRef.current && setSpeaking(false),
      onError: () => {
        if (mountedRef.current) {
          setSpeaking(false);
          setAudioFailed(true);
        }
      },
    });
    setSpeaking(!!played);
    if (!played) setAudioFailed(true);
  }, [speaking, lang]);

  const startVoice = useCallback(() => {
    const Recognition = recognitionClass();
    if (!Recognition) {
      setVoiceFailed(true);
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }
    const original = clean(dream);
    const recognition = new Recognition();
    recognition.lang = lang === 'pt' ? 'pt-BR' : 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onstart = () => {
      setVoiceFailed(false);
      setListening(true);
    };
    recognition.onresult = (event) => {
      clearPractice();
      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      setDream([original, transcript.trim()].filter(Boolean).join(' ').slice(0, 1600));
      setResult(null);
      setEntryId(null);
      setPracticeState('idle');
    };
    recognition.onerror = () => {
      setListening(false);
      setVoiceFailed(true);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error) {
      recognitionRef.current = null;
      setVoiceFailed(true);
      setListening(false);
    }
  }, [dream, lang, listening, clearPractice]);

  const transformDream = useCallback(() => {
    if (clean(dream).length < 4) return;
    clearPractice();
    if (dreamScrollTimerRef.current) {
      clearTimeout(dreamScrollTimerRef.current);
      dreamScrollTimerRef.current = null;
    }
    if (dreamSettleFrameRef.current) {
      cancelAnimationFrame(dreamSettleFrameRef.current);
      dreamSettleFrameRef.current = null;
    }
    const generated = createDreamAffirmation({ dream, feeling, theme: meaning, lang });
    const id = saveDreamRitual({ ...generated, lang });
    if (!id) return;
    Keyboard.dismiss();
    setResult({ ...generated, lang });
    setEntryId(id);
    setPracticeState('idle');
    practiceProgress.setValue(0);
    haptic(true);
    if (dreamResultTimerRef.current) clearTimeout(dreamResultTimerRef.current);
    dreamResultTimerRef.current = setTimeout(() => {
      dreamResultTimerRef.current = null;
      if (mountedRef.current) scrollToDreamResult();
    }, 180);
  }, [dream, feeling, meaning, lang, saveDreamRitual, practiceProgress, clearPractice, haptic, scrollToDreamResult]);

  const openLastEntry = useCallback(() => {
    if (!lastEntry) return;
    setBonusOpen(true);
    setDream(lastEntry.dream);
    setFeeling(lastEntry.feeling || '');
    setMeaning(lastEntry.theme || 'auto');
    setResult({
      dream: lastEntry.dream,
      feeling: lastEntry.feeling,
      theme: lastEntry.theme,
      affirmation: lastEntry.affirmation,
      reflection: lastEntry.reflection,
      dreamAnchor: lastEntry.dreamAnchor,
      usedDetails: lastEntry.usedDetails,
      generatorVersion: lastEntry.generatorVersion,
      lang: lastEntry.lang,
    });
    setEntryId(lastEntry.id);
    setPracticeState('idle');
    practiceProgress.setValue(0);
  }, [lastEntry, practiceProgress]);

  const practice = useCallback(() => {
    if (!entryId || practiceState === 'running' || practiceState === 'complete') return;
    clearPractice();
    setPracticeState('running');
    practiceProgress.setValue(0);
    if (reduceMotion) {
      practiceProgress.setValue(1);
    } else {
      Animated.timing(practiceProgress, {
        toValue: 1,
        duration: 12000,
        useNativeDriver: false,
      }).start();
    }
    practiceTimers.current = [
      setTimeout(() => setPracticeState('exhale'), 5000),
      setTimeout(() => {
        setPracticeState('complete');
        markDreamRitualPracticed(entryId);
        haptic(true);
      }, 12000),
    ];
  }, [entryId, practiceState, clearPractice, practiceProgress, reduceMotion, markDreamRitualPracticed, haptic]);

  const useResultAsWake = useCallback(async () => {
    if (!result || !entryId) return;
    if (ritual.reminderEnabled) {
      const scheduled = await scheduleRealAlarm({
        id: `ritual:${entryId}`,
        text: result.affirmation,
        itemLang: result.lang || lang,
        time: ritual.reminderTime,
      });
      if (!scheduled) return;
    }
    saveMorningRitualPreferences({
      wakeAffirmationId: `ritual:${entryId}`,
      wakeAffirmationText: result.affirmation,
      wakeAffirmationLang: result.lang || lang,
    });
    if (!ritual.reminderEnabled) haptic(true);
  }, [result, entryId, lang, ritual.reminderEnabled, ritual.reminderTime, scheduleRealAlarm, saveMorningRitualPreferences, haptic]);

  const deleteCurrentDream = useCallback(async () => {
    if (!entryId) return;
    const allowed = await confirmAsync({
      title: t(S.deleteDreamTitle),
      message: t(S.deleteDreamBody),
      confirmLabel: t(S.deleteDreamConfirm),
      cancelLabel: t(S.cancel),
      destructive: true,
      lang,
    });
    if (!allowed) return;

    const usedByAlarm = ritual.wakeAffirmationId === `ritual:${entryId}`;
    if (usedByAlarm && Platform.OS === 'ios') {
      if (!alarmCapability) {
        if (mountedRef.current) setAlarmFeedback('failed');
        return;
      }
      const canHaveNativeAlarm =
        alarmCapability.supported === true || alarmCapability.nativeModuleAvailable === true;
      if (canHaveNativeAlarm) {
        if (alarmOperationRef.current) return;
        alarmOperationRef.current = true;
        if (mountedRef.current) setAlarmBusy(true);
        const cancelled = await cancelAffirmationAlarm().catch(() => null);
        alarmOperationRef.current = false;
        if (mountedRef.current) setAlarmBusy(false);
        if (!cancelled || cancelled.ok !== true) {
          if (mountedRef.current) setAlarmFeedback('failed');
          return;
        }
      }
    }

    if (mountedRef.current) clearPractice();
    removeDreamRitual(entryId);
    if (!mountedRef.current) return;
    setDream('');
    setFeeling('');
    setMeaning('auto');
    setResult(null);
    setEntryId(null);
    setPracticeState('idle');
    haptic(true);
  }, [entryId, lang, ritual.wakeAffirmationId, alarmCapability, t, clearPractice, removeDreamRitual, haptic]);

  const renderOption = useCallback(({ item }) => {
    const selected = ritual.wakeAffirmationId === item.id;
    const color = accentAt(theme, item.personal ? 1 : 2);
    return (
      <Pressable
        onPress={() => selectWake(item)}
        disabled={alarmBusy}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled: alarmBusy }}
        style={({ pressed }) => [
          styles.pickerRow,
          {
            borderColor: selected ? theme.accent : theme.border,
            backgroundColor: selected ? alpha(theme.accent, 0.08) : theme.surface,
            opacity: alarmBusy ? 0.5 : pressed ? 0.75 : 1,
          },
        ]}
      >
        <View style={[styles.sourceTag, { backgroundColor: alpha(color, 0.13) }]}>
          <Text style={[styles.sourceText, { color }]}>{item.personal ? t(S.personal) : t(S.celeste)}</Text>
        </View>
        <Text style={[styles.pickerText, { color: theme.text }]}>{item.text}</Text>
        <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? theme.accent : theme.textMuted} />
      </Pressable>
    );
  }, [ritual.wakeAffirmationId, selectWake, theme, t, alarmBusy]);

  const practiceCopy = practiceState === 'complete'
    ? t(S.completed)
    : practiceState === 'exhale'
    ? t(S.breathingOut)
    : practiceState === 'running'
    ? t(S.breathingIn)
    : t(S.feel);
  const alarmCanBeEnabled = !!(
    selectedWake &&
    alarmCapability &&
    alarmCapability.supported === true &&
    (alarmCapability.canSchedule || alarmCapability.canRequestAuthorization)
  );
  const alarmNote = alarmBusy
    ? t(S.alarmBusy)
    : ritual.alarmSyncError
    ? t(S.alarmSyncFailed)
    : alarmFeedback === 'scheduled' || ritual.reminderEnabled
    ? t(S.alarmScheduled, { time: ritual.reminderTime })
    : alarmFeedback === 'denied' || (alarmCapability && alarmCapability.authorization === 'denied')
    ? t(S.alarmDenied)
    : alarmFeedback === 'failed'
    ? t(S.alarmFailed)
    : !alarmCapability
    ? t(S.checkingAlarm)
    : Platform.OS === 'web'
    ? t(S.webUnsupported)
    : alarmCapability.reason === 'native_module_missing'
    ? t(S.nativePending)
    : t(S.notScheduled);
  const goBack = () => {
    if (alarmBusy) return;
    if (navigation.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Main');
  };

  return (
    <SafeAreaView
      testID="affirmation-alarm-screen"
      style={[styles.safe, Platform.OS === 'web' && styles.webViewport, { backgroundColor: theme.bg }]}
      edges={['top']}
    >
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            testID="affirmation-alarm-back"
            accessibilityRole="button"
            accessibilityLabel={lang === 'pt' ? 'Voltar' : 'Back'}
            disabled={alarmBusy}
            onPress={goBack}
            style={({ pressed }) => [styles.iconButton, alarmBusy && styles.disabled, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={23} color={theme.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={[styles.pageTitle, { color: theme.text }]}>{t(S.title)}</Text>
            <Text style={[styles.pageSubtitle, { color: theme.textMuted }]}>{t(S.subtitle)}</Text>
          </View>
        </View>

        <ScrollView
          ref={mainScrollRef}
          testID="morning-ritual-scroll"
          style={styles.scrollView}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={({ nativeEvent }) => {
            mainScrollYRef.current = nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.content}>
            <Pressable
              testID="open-dream-shortcut"
              accessibilityRole="button"
              accessibilityLabel={t(S.dreamShortcutTitle)}
              accessibilityHint={t(S.dreamShortcutBody)}
              onPress={openDreamSection}
              style={({ pressed }) => [
                styles.dreamShortcut,
                { backgroundColor: theme.surface, borderColor: theme.border },
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.dreamShortcutIcon, { backgroundColor: alpha(accentAt(theme, 1), 0.14) }]}>
                <Ionicons name="moon-outline" size={22} color={accentAt(theme, 1)} />
              </View>
              <View style={styles.dreamShortcutCopy}>
                <Text style={[styles.dreamShortcutTitle, { color: theme.text }]}>{t(S.dreamShortcutTitle)}</Text>
                <Text style={[styles.dreamShortcutBody, { color: theme.textMuted }]}>{t(S.dreamShortcutBody)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={19} color={theme.textMuted} />
            </Pressable>

            <View style={styles.introRow}>
              <View style={[styles.featureIcon, { backgroundColor: alpha(accentAt(theme, 3), 0.13) }]}>
                <Ionicons name="alarm-outline" size={23} color={accentAt(theme, 3)} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(S.wakeTitle)}</Text>
                <Text style={[styles.sectionBody, { color: theme.textMuted }]}>{t(S.wakeBody)}</Text>
              </View>
            </View>

            <View style={[styles.wakePanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {selectedWake ? (
                <Text style={[styles.wakeText, { color: theme.text }]}>{selectedWake.text}</Text>
              ) : (
                <View style={styles.emptyWake}>
                  <Ionicons name="volume-mute-outline" size={24} color={theme.textMuted} />
                  <Text style={[styles.emptyWakeText, { color: theme.textMuted }]}>{t(S.noAffirmation)}</Text>
                </View>
              )}
              <View style={styles.buttonRow}>
                <Pressable
                  testID="open-wake-affirmation-picker"
                  onPress={() => setPickerOpen(true)}
                  style={({ pressed }) => [styles.smallButton, { backgroundColor: theme.surfaceAlt }, pressed && styles.pressed]}
                >
                  <Ionicons name="list-outline" size={17} color={theme.accent} />
                  <Text style={[styles.smallButtonText, { color: theme.accent }]}>{selectedWake ? t(S.change) : t(S.choose)}</Text>
                </Pressable>
                {selectedWake ? (
                  <Pressable
                    onPress={() => playText(selectedWake)}
                    style={({ pressed }) => [styles.smallButton, { backgroundColor: alpha(theme.accent, 0.1) }, pressed && styles.pressed]}
                  >
                    <Ionicons name={speaking ? 'stop' : 'play'} size={17} color={theme.accent} />
                    <Text style={[styles.smallButtonText, { color: theme.accent }]}>{speaking ? t(S.stop) : t(S.preview)}</Text>
                  </Pressable>
                ) : null}
              </View>
              {audioFailed ? <Text style={[styles.warningText, { color: theme.warning }]}>{t(S.audioUnavailable)}</Text> : null}
            </View>

            <Text style={[styles.fieldLabel, { color: theme.text }]}>{t(S.time)}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeRow}>
              {TIMES.map((time) => {
                const selected = ritual.reminderTime === time;
                return (
                  <Pressable
                    key={time}
                    testID={`alarm-time-${time.replace(':', '')}`}
                    onPress={() => selectAlarmTime(time)}
                    disabled={alarmBusy}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: alarmBusy }}
                    style={({ pressed }) => [
                      styles.timeChip,
                      {
                        backgroundColor: selected ? theme.accent : theme.surface,
                        borderColor: selected ? theme.accent : theme.border,
                        opacity: alarmBusy ? 0.5 : pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.timeText, { color: selected ? '#FFFFFF' : theme.textMuted }]}>{time}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View
              style={[
                styles.switchRow,
                {
                  borderColor: theme.border,
                  opacity: ritual.reminderEnabled || alarmCanBeEnabled ? 1 : 0.55,
                },
              ]}
            >
              <Text style={[styles.switchText, { color: theme.text }]}>{t(S.saveWake)}</Text>
              <Switch
                testID="affirmation-alarm-switch"
                value={ritual.reminderEnabled}
                disabled={alarmBusy || (!ritual.reminderEnabled && !alarmCanBeEnabled)}
                onValueChange={setAlarmEnabled}
                trackColor={{ false: theme.surfaceAlt, true: alpha(theme.accent, 0.45) }}
                thumbColor={ritual.reminderEnabled ? theme.accent : '#FFFFFF'}
              />
            </View>
            <View style={[styles.honestyNote, { backgroundColor: alpha(theme.warning, 0.1) }]}>
              <Ionicons name="information-circle-outline" size={18} color={theme.warning} />
              <Text style={[styles.honestyText, { color: theme.textMuted }]}>{alarmNote}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            <View
              onLayout={({ nativeEvent }) => {
                dreamSectionYRef.current = nativeEvent.layout.y;
                if (bonusOpen && !result) scheduleDreamSettle(60);
              }}
            >
            <View style={styles.bonusHeader}>
              <View style={styles.flex}>
                <Text style={[styles.eyebrow, { color: accentAt(theme, 1) }]}>{t(S.bonus)}</Text>
                <Text style={[styles.bonusTitle, { color: theme.text }]}>{t(S.threeS)}</Text>
                <Text style={[styles.sectionBody, { color: theme.textMuted }]}>{t(S.bonusBody)}</Text>
              </View>
              <Pressable
                onPress={() => {
                  if (bonusOpen) {
                    clearPractice();
                    setPracticeState('idle');
                    setBonusOpen(false);
                  } else {
                    openDreamSection();
                  }
                }}
                accessibilityRole="button"
                style={({ pressed }) => [styles.expandButton, { backgroundColor: theme.surfaceAlt }, pressed && styles.pressed]}
              >
                <Ionicons name={bonusOpen ? 'chevron-up' : 'add'} size={20} color={theme.accent} />
              </Pressable>
            </View>

            {!bonusOpen ? (
              <View style={styles.bonusActions}>
                <PrimaryButton
                  testID="open-dream-bonus"
                  label={t(S.openDream)}
                  icon="moon-outline"
                  variant="soft"
                  onPress={openDreamSection}
                  style={styles.flexButton}
                />
                {lastEntry ? (
                  <PrimaryButton label={t(S.lastDream)} icon="play" variant="ghost" onPress={openLastEntry} style={styles.flexButton} />
                ) : null}
              </View>
            ) : (
              <View
                style={[styles.bonusPanel, { borderColor: theme.border }]}
                onLayout={({ nativeEvent }) => {
                  dreamPanelYRef.current = nativeEvent.layout.y;
                }}
              >
                <Text style={[styles.fieldLabel, styles.firstLabel, { color: theme.text }]}>{t(S.dreamLabel)}</Text>
                <View style={[styles.inputShell, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <TextInput
                    ref={dreamInputRef}
                    testID="dream-report-input"
                    value={dream}
                    onChangeText={(value) => {
                      clearPractice();
                      setDream(value.slice(0, 1600));
                      setResult(null);
                      setEntryId(null);
                      setPracticeState('idle');
                    }}
                    placeholder={t(S.dreamPlaceholder)}
                    placeholderTextColor={theme.textMuted}
                    multiline
                    maxLength={1600}
                    textAlignVertical="top"
                    style={[styles.input, { color: theme.text }]}
                  />
                  <View style={[styles.inputFooter, { borderTopColor: theme.border }]}>
                    {voiceAvailable ? (
                      <Pressable onPress={startVoice} style={({ pressed }) => [styles.voiceButton, pressed && styles.pressed]}>
                        <Ionicons name={listening ? 'stop-circle' : 'mic-outline'} size={18} color={theme.accent} />
                        <Text style={[styles.voiceText, { color: theme.accent }]}>{listening ? t(S.listening) : t(S.speakDream)}</Text>
                      </Pressable>
                    ) : (
                      <Text style={[styles.voiceUnavailable, { color: theme.textMuted }]}>{t(S.voiceUnavailable)}</Text>
                    )}
                    <Text style={[styles.counter, { color: theme.textMuted }]}>{dream.length}/1600</Text>
                  </View>
                </View>
                {voiceAvailable ? <Text style={[styles.privacyText, { color: theme.textMuted }]}>{t(S.voicePrivacy)}</Text> : null}
                {voiceFailed ? <Text style={[styles.warningText, { color: theme.warning }]}>{t(S.voiceUnavailable)}</Text> : null}

                <Text style={[styles.fieldLabel, { color: theme.text }]}>{t(S.feelingLabel)}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                  {FEELINGS.map((item, index) => {
                    const selected = feeling === item.key;
                    const color = accentAt(theme, index);
                    return (
                      <Pressable
                        key={item.key}
                        testID={`dream-feeling-${item.key}`}
                        onPress={() => {
                          clearPractice();
                          setFeeling(selected ? '' : item.key);
                          setResult(null);
                          setEntryId(null);
                          setPracticeState('idle');
                          haptic();
                        }}
                        style={({ pressed }) => [
                          styles.choiceChip,
                          {
                            backgroundColor: selected ? alpha(color, 0.14) : theme.surface,
                            borderColor: selected ? color : theme.border,
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.choiceText, { color: selected ? theme.text : theme.textMuted }]}>{t(item.label)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={[styles.fieldLabel, { color: theme.text }]}>{t(S.meaningLabel)}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                  {[{ key: 'auto', label: S.automatic }, ...THEMES].map((item, index) => {
                    const selected = meaning === item.key;
                    const color = accentAt(theme, index);
                    return (
                      <Pressable
                        key={item.key}
                        testID={`dream-theme-${item.key}`}
                        onPress={() => {
                          clearPractice();
                          setMeaning(item.key);
                          setResult(null);
                          setEntryId(null);
                          setPracticeState('idle');
                          haptic();
                        }}
                        style={({ pressed }) => [
                          styles.choiceChip,
                          {
                            backgroundColor: selected ? alpha(color, 0.14) : theme.surface,
                            borderColor: selected ? color : theme.border,
                            opacity: pressed ? 0.8 : 1,
                          },
                        ]}
                      >
                        <Text style={[styles.choiceText, { color: selected ? theme.text : theme.textMuted }]}>{t(item.label)}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <PrimaryButton
                  testID="transform-dream"
                  label={t(S.transform)}
                  icon="sparkles"
                  onPress={transformDream}
                  disabled={clean(dream).length < 4}
                  style={styles.transformButton}
                />

                {result ? (
                  <View
                    ref={dreamResultPanelRef}
                    testID="dream-result-panel"
                    style={[styles.resultPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onLayout={({ nativeEvent }) => {
                      dreamResultYRef.current = nativeEvent.layout.y;
                      if (dreamResultTimerRef.current) clearTimeout(dreamResultTimerRef.current);
                      dreamResultTimerRef.current = setTimeout(() => {
                        dreamResultTimerRef.current = null;
                        if (mountedRef.current) scrollToDreamResult();
                      }, 60);
                    }}
                  >
                    <Text style={[styles.resultLabel, { color: theme.textMuted }]}>{t(S.meaningResult)}</Text>
                    <Text style={[styles.reflection, { color: theme.text }]}>{result.reflection}</Text>
                    <View style={[styles.resultDivider, { backgroundColor: theme.border }]} />
                    <Text style={[styles.resultLabel, { color: accentAt(theme, 1) }]}>{t(S.affirmationResult)}</Text>
                    <Text testID="dream-personalized-affirmation" style={[styles.resultText, { color: theme.text }]}>
                      {result.affirmation}
                    </Text>
                    <View style={styles.resultActions}>
                      <Pressable
                        onPress={() => playText({ text: result.affirmation, lang: result.lang || lang, personal: true })}
                        style={({ pressed }) => [styles.resultButton, { backgroundColor: alpha(theme.accent, 0.1) }, pressed && styles.pressed]}
                      >
                        <Ionicons name={speaking ? 'stop' : 'volume-high-outline'} size={18} color={theme.accent} />
                        <Text style={[styles.resultButtonText, { color: theme.accent }]}>{speaking ? t(S.stop) : t(S.listenResult)}</Text>
                      </Pressable>
                      <Pressable
                        onPress={useResultAsWake}
                        style={({ pressed }) => [styles.resultButton, { backgroundColor: alpha(accentAt(theme, 2), 0.12) }, pressed && styles.pressed]}
                      >
                        <Ionicons name={usingResultForWake ? 'checkmark' : 'alarm-outline'} size={18} color={accentAt(theme, 2)} />
                        <Text style={[styles.resultButtonText, { color: accentAt(theme, 2) }]}>{usingResultForWake ? t(S.usedTomorrow) : t(S.useTomorrow)}</Text>
                      </Pressable>
                    </View>
                    {audioFailed ? <Text style={[styles.warningText, { color: theme.warning }]}>{t(S.audioUnavailable)}</Text> : null}

                    <Pressable
                      onPress={practice}
                      disabled={practiceState === 'running' || practiceState === 'exhale' || practiceState === 'complete'}
                      style={({ pressed }) => [styles.practiceButton, { borderColor: theme.border }, pressed && styles.pressed]}
                    >
                      <Ionicons name={practiceState === 'complete' ? 'checkmark-circle' : 'leaf-outline'} size={19} color={accentAt(theme, 2)} />
                      <Text style={[styles.practiceText, { color: theme.text }]}>{practiceCopy}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t(S.deleteDream)}
                      onPress={deleteCurrentDream}
                      style={({ pressed }) => [styles.deleteDreamButton, pressed && styles.pressed]}
                    >
                      <Ionicons name="trash-outline" size={17} color={theme.danger} />
                      <Text style={[styles.deleteDreamText, { color: theme.danger }]}>{t(S.deleteDream)}</Text>
                    </Pressable>
                    <View style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}>
                      <Animated.View
                        style={[
                          styles.progressFill,
                          {
                            backgroundColor: accentAt(theme, 2),
                            width: practiceProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                          },
                        ]}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.modalBackdrop, { backgroundColor: alpha('#101827', 0.48) }]}
        >
          <View style={[styles.modalSheet, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <View style={styles.flex}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>{t(S.pickerTitle)}</Text>
                <Text style={[styles.modalBody, { color: theme.textMuted }]}>{t(S.pickerBody)}</Text>
              </View>
              <Pressable
                onPress={() => setPickerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t(S.close)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>
            <FlatList
              data={wakeOptions}
              renderItem={renderOption}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.pickerList}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={(
                <View style={[styles.customWake, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.customWakeLabel, { color: theme.text }]}>{t(S.customLabel)}</Text>
                  <View style={styles.customWakeRow}>
                    <TextInput
                      testID="custom-wake-affirmation"
                      accessibilityLabel={t(S.customLabel)}
                      value={customWake}
                      onChangeText={(value) => setCustomWake(value.slice(0, 280))}
                      onSubmitEditing={saveCustomWake}
                      placeholder={t(S.customPlaceholder)}
                      placeholderTextColor={theme.textMuted}
                      returnKeyType="done"
                      maxLength={280}
                      style={[
                        styles.customWakeInput,
                        { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border },
                      ]}
                    />
                    <Pressable
                      testID="save-custom-wake-affirmation"
                      accessibilityRole="button"
                      accessibilityLabel={t(S.customSave)}
                      accessibilityState={{ disabled: clean(customWake).length < 4 }}
                      disabled={clean(customWake).length < 4}
                      onPress={saveCustomWake}
                      style={({ pressed }) => [
                        styles.customWakeButton,
                        { backgroundColor: theme.accent, opacity: clean(customWake).length < 4 ? 0.4 : 1 },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    </Pressable>
                  </View>
                </View>
              )}
              showsVerticalScrollIndicator={false}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0 },
  webViewport: { height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' },
  flex: { flex: 1, minHeight: 0 },
  scrollView: { flex: 1, minHeight: 0 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  header: { minHeight: 70, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, paddingRight: 44 },
  pageTitle: { fontSize: 20, lineHeight: 25, fontWeight: '800', textAlign: 'center', letterSpacing: 0 },
  pageSubtitle: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 1, letterSpacing: 0 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 112 },
  content: { width: '100%', maxWidth: 700, alignSelf: 'center' },
  dreamShortcut: {
    minHeight: 86,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 13,
    marginBottom: 22,
  },
  dreamShortcutIcon: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  dreamShortcutCopy: { flex: 1, minWidth: 0, marginHorizontal: 12 },
  dreamShortcutTitle: { fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: 0 },
  dreamShortcutBody: { fontSize: 12, lineHeight: 17, marginTop: 2, letterSpacing: 0 },
  introRow: { flexDirection: 'row', alignItems: 'flex-start' },
  featureIcon: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sectionTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: 0 },
  sectionBody: { fontSize: 14, lineHeight: 21, marginTop: 4, letterSpacing: 0 },
  wakePanel: { borderWidth: 1, borderRadius: 8, padding: 16, marginTop: 16 },
  wakeText: { fontSize: 23, lineHeight: 32, fontWeight: '700', letterSpacing: 0 },
  emptyWake: { minHeight: 74, alignItems: 'center', justifyContent: 'center' },
  emptyWakeText: { fontSize: 14, fontWeight: '600', marginTop: 7, letterSpacing: 0 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 12 },
  smallButton: { height: 42, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, margin: 4 },
  smallButtonText: { fontSize: 13, fontWeight: '800', marginLeft: 6, letterSpacing: 0 },
  warningText: { fontSize: 12, lineHeight: 18, marginTop: 9, letterSpacing: 0 },
  fieldLabel: { fontSize: 14, lineHeight: 20, fontWeight: '800', marginTop: 18, marginBottom: 9, letterSpacing: 0 },
  firstLabel: { marginTop: 0 },
  timeRow: { paddingRight: 4 },
  timeChip: { minWidth: 64, height: 40, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  timeText: { fontSize: 13, fontWeight: '800', letterSpacing: 0 },
  switchRow: { minHeight: 58, borderWidth: 1, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, marginTop: 14 },
  switchText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700', paddingRight: 12, letterSpacing: 0 },
  honestyNote: { borderRadius: 8, padding: 11, flexDirection: 'row', alignItems: 'flex-start', marginTop: 9 },
  honestyText: { flex: 1, fontSize: 12, lineHeight: 18, marginLeft: 8, letterSpacing: 0 },
  divider: { height: 1, marginVertical: 28 },
  bonusHeader: { flexDirection: 'row', alignItems: 'center' },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0 },
  bonusTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', marginTop: 2, letterSpacing: 0 },
  expandButton: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  bonusActions: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 14 },
  flexButton: { flexGrow: 1, minWidth: 210, marginHorizontal: 4 },
  bonusPanel: { borderTopWidth: 1, marginTop: 16, paddingTop: 18 },
  inputShell: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  input: { minHeight: 116, maxHeight: 230, padding: 13, fontSize: 15, lineHeight: 23, letterSpacing: 0 },
  inputFooter: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11 },
  voiceButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
  voiceText: { fontSize: 12, fontWeight: '800', marginLeft: 6, letterSpacing: 0 },
  voiceUnavailable: { flex: 1, fontSize: 11, lineHeight: 16, letterSpacing: 0 },
  counter: { marginLeft: 'auto', fontSize: 11, letterSpacing: 0 },
  privacyText: { fontSize: 11, lineHeight: 17, marginTop: 6, letterSpacing: 0 },
  choiceRow: { paddingRight: 4 },
  choiceChip: { height: 39, borderWidth: 1, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 12, marginRight: 7 },
  choiceText: { fontSize: 12, fontWeight: '700', letterSpacing: 0 },
  transformButton: { marginTop: 20 },
  resultPanel: { borderWidth: 1, borderRadius: 8, padding: 16, marginTop: 18 },
  resultLabel: { fontSize: 11, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0 },
  reflection: { fontSize: 14, lineHeight: 21, fontWeight: '600', marginTop: 5, letterSpacing: 0 },
  resultDivider: { height: 1, marginVertical: 15 },
  resultText: { fontSize: 22, lineHeight: 31, fontWeight: '700', marginTop: 5, letterSpacing: 0 },
  resultActions: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 13 },
  resultButton: { minHeight: 42, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, margin: 4 },
  resultButtonText: { fontSize: 12, lineHeight: 17, fontWeight: '800', marginLeft: 6, letterSpacing: 0 },
  practiceButton: { minHeight: 46, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', marginTop: 14, paddingTop: 12 },
  practiceText: { fontSize: 13, lineHeight: 19, fontWeight: '800', marginLeft: 7, letterSpacing: 0 },
  deleteDreamButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  deleteDreamText: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginLeft: 7, letterSpacing: 0 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: 4, borderRadius: 2 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 14 },
  modalSheet: { width: '100%', maxWidth: 680, height: '82%', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 },
  modalTitle: { fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: 0 },
  modalBody: { fontSize: 13, lineHeight: 19, marginTop: 2, letterSpacing: 0 },
  pickerList: { paddingHorizontal: 14, paddingBottom: 24 },
  customWake: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  customWakeLabel: { fontSize: 13, lineHeight: 18, fontWeight: '800', letterSpacing: 0 },
  customWakeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  customWakeInput: {
    flex: 1,
    minWidth: 0,
    height: 46,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 12,
    fontSize: 14,
    letterSpacing: 0,
  },
  customWakeButton: {
    width: 46,
    height: 46,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  pickerRow: { minHeight: 88, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  sourceTag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, marginRight: 10 },
  sourceText: { fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 0 },
  pickerText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: '600', paddingRight: 10, letterSpacing: 0 },
});
