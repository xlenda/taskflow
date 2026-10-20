import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import PrimaryButton from '../components/PrimaryButton';
import { RELEASE_FEATURES } from '../constants/releaseFeatures';
import { useApp } from '../context/AppContext';
import {
  cancelAffirmationAlarm,
  getAffirmationAlarmCapability,
  requestAffirmationAlarmAuthorization,
  scheduleAffirmationAlarm,
} from '../services/affirmationAlarm';
import { useTheme } from '../ui/theme';
import { alarmWeekdaysOrDefault } from '../utils/alarmSchedule';
import { wavBytesToBase64 } from '../utils/audioBase64';
import { alpha, accentAt } from '../utils/colors';
import { confirmAsync } from '../utils/confirm';
import { usePersonalNarration } from '../utils/usePersonalNarration';
import { useT } from '../utils/useT';
import {
  WAKE_SEQUENCE_MAX,
  estimateListeningSeconds,
  firstPhraseForAlarm,
  wakeSequenceItemsForState,
  wakeSequenceOptionsForState,
} from '../utils/wakeSequence';

const COPY = {
  saveChoice: { pt: 'Salvar minha escolha', en: 'Save my choice' },
  confirmTitle: { pt: 'Confirmar este despertador?', en: 'Confirm this alarm?' },
  confirmBody: {
    pt: 'Acordar às {time} com “{phrase}” nos dias escolhidos? O aparelho pedirá permissão em seguida.',
    en: 'Wake at {time} with “{phrase}” on the selected days? Your device will ask for permission next.',
  },
  confirmAction: { pt: 'Confirmar e ativar', en: 'Confirm and turn on' },
  savedDraft: {
    pt: 'Escolha salva neste aparelho. O alarme ainda não está ativo; ative-o no aplicativo instalado.',
    en: 'Choice saved on this device. The alarm is not active yet; turn it on in the installed app.',
  },
  title: { pt: 'Meu despertar', en: 'My wake-up' },
  subtitle: {
    pt: 'Monte o que você quer ouvir ao acordar.',
    en: 'Build what you want to hear when you wake up.',
  },
  sequenceTitle: { pt: 'Sua sequência', en: 'Your sequence' },
  sequenceBody: {
    pt: 'Escolha até 6 itens entre sua Cena-Âncora, visões e afirmações, na ordem que quiser. Ao despertar, basta ouvir: não há leitura nem microfone.',
    en: 'Choose up to 6 items from your Anchor Scene, visions, and affirmations, in any order. When you wake, just listen: there is no reading or microphone task.',
  },
  emptySequence: {
    pt: 'Sua sequência ainda está vazia. Adicione o primeiro item.',
    en: 'Your sequence is still empty. Add the first item.',
  },
  add: { pt: 'Adicionar', en: 'Add' },
  listenNow: { pt: 'Ouvir agora', en: 'Listen now' },
  moveUp: { pt: 'Subir o item {n}', en: 'Move item {n} up' },
  moveDown: { pt: 'Descer o item {n}', en: 'Move item {n} down' },
  remove: { pt: 'Tirar o item {n} da sequência', en: 'Remove item {n} from the sequence' },
  count: { pt: '{n} de {max} itens', en: '{n} of {max} items' },
  estimateSeconds: { pt: 'cerca de {n} s para ouvir', en: 'about {n} s of listening' },
  estimateMinutes: { pt: 'cerca de {n} min para ouvir', en: 'about {n} min of listening' },
  full: {
    pt: 'Sequência completa: tire um item para incluir outro.',
    en: 'Sequence full: remove an item to add another.',
  },
  time: { pt: 'Horário', en: 'Time' },
  timeHint: { pt: 'Use o formato 07:30.', en: 'Use the 07:30 format.' },
  days: { pt: 'Dias da semana', en: 'Days of the week' },
  daysHint: { pt: 'Escolha pelo menos um dia.', en: 'Choose at least one day.' },
  activate: { pt: 'Ativar despertador', en: 'Turn alarm on' },
  update: { pt: 'Salvar alterações', en: 'Save changes' },
  deactivate: { pt: 'Desativar despertador', en: 'Turn alarm off' },
  deactivateTitle: { pt: 'Desativar o despertador?', en: 'Turn the alarm off?' },
  deactivateBody: {
    pt: 'O conteúdo não tocará mais no horário programado.',
    en: 'The content will no longer play at the scheduled time.',
  },
  deactivateConfirm: { pt: 'Desativar', en: 'Turn off' },
  cancel: { pt: 'Cancelar', en: 'Cancel' },
  checking: { pt: 'Verificando este aparelho…', en: 'Checking this device…' },
  scheduling: { pt: 'Confirmando com o aparelho…', en: 'Confirming with your device…' },
  active: { pt: 'Ativo às {time}.', en: 'Active at {time}.' },
  ready: {
    pt: 'A permissão será solicitada somente quando você tocar em Ativar despertador.',
    en: 'Permission is requested only after you tap Turn alarm on.',
  },
  changed: {
    pt: 'Há alterações ainda não salvas. O despertador atual continua como estava.',
    en: 'There are unsaved changes. Your current alarm remains unchanged.',
  },
  denied: {
    pt: 'O acesso aos Alarmes foi negado. O despertador não foi alterado.',
    en: 'Alarm access was denied. Your alarm was not changed.',
  },
  permissionRequired: {
    pt: 'Conclua a permissão de Alarmes e Notificações que o aparelho abriu. Ao voltar, toque em Ativar novamente.',
    en: 'Complete the Alarm and Notification permission opened by your device. When you return, tap Turn on again.',
  },
  permissionFailed: {
    pt: 'Não foi possível verificar a permissão do aparelho. O despertador não foi alterado; tente novamente.',
    en: 'Your device permission could not be checked. Your alarm was not changed; try again.',
  },
  openSettings: { pt: 'Abrir Ajustes', en: 'Open Settings' },
  failed: {
    pt: 'O aparelho não confirmou o agendamento. Nada foi salvo; tente novamente.',
    en: 'Your device did not confirm the schedule. Nothing was saved; try again.',
  },
  voiceFailed: {
    pt: 'Não foi possível criar a voz escolhida. O despertador não foi alterado.',
    en: 'The selected voice could not be created. Your alarm was not changed.',
  },
  cancelled: { pt: 'Despertador desativado.', en: 'Alarm turned off.' },
  cancelFailed: {
    pt: 'O aparelho não confirmou a desativação. O despertador continua marcado como ativo.',
    en: 'Your device did not confirm cancellation. The alarm remains marked as active.',
  },
  webUnsupported: {
    pt: 'No site você pode preparar e ouvir sua sequência. Para acordar com um alarme real, use o app instalado em um iPhone compatível.',
    en: 'On the website you can prepare and hear your sequence. For a real wake-up alarm, use the installed app on a compatible iPhone.',
  },
  nativeMissing: {
    pt: 'Este app ainda não tem o módulo nativo necessário para criar um despertador real.',
    en: 'This app does not yet include the native module required for a real alarm.',
  },
  unsupported: {
    pt: 'O despertador com conteúdo pessoal não está disponível neste aparelho.',
    en: 'The personal-content alarm is unavailable on this device.',
  },
  pickerTitle: { pt: 'Adicionar ao despertar', en: 'Add to your wake-up' },
  pickerBody: {
    pt: 'As opções abaixo vieram apenas do que você criou no Celeste.',
    en: 'The options below come only from what you created in Celeste.',
  },
  visionsTab: { pt: 'Visões', en: 'Visions' },
  affirmationsTab: { pt: 'Afirmações', en: 'Affirmations' },
  inSequence: { pt: 'Na sequência', en: 'In the sequence' },
  custom: { pt: 'Minha própria afirmação', en: 'My own affirmation' },
  customPlaceholder: {
    pt: 'Eu acordo presente e pronta para o meu dia.',
    en: 'I wake up present and ready for my day.',
  },
  useCustom: { pt: 'Usar esta frase', en: 'Use this affirmation' },
  noOptions: {
    pt: 'Crie uma manifestação ou transforme um sonho para receber seu primeiro conteúdo pessoal.',
    en: 'Create a manifestation or transform a dream to receive your first personal content.',
  },
  affirmation: { pt: 'Afirmação', en: 'Affirmation' },
  vision: { pt: 'Visão', en: 'Vision' },
  anchor: { pt: 'Cena-Âncora', en: 'Anchor Scene' },
  manifestation: { pt: 'Manifestação', en: 'Manifestation' },
  dream: { pt: 'Sonho', en: 'Dream' },
  yours: { pt: 'Sua frase', en: 'Your phrase' },
  close: { pt: 'Fechar', en: 'Close' },
  back: { pt: 'Voltar', en: 'Back' },
};

const WEEKDAYS = [
  { value: 1, label: { pt: 'Seg', en: 'Mon' }, full: { pt: 'segunda-feira', en: 'Monday' } },
  { value: 2, label: { pt: 'Ter', en: 'Tue' }, full: { pt: 'terça-feira', en: 'Tuesday' } },
  { value: 3, label: { pt: 'Qua', en: 'Wed' }, full: { pt: 'quarta-feira', en: 'Wednesday' } },
  { value: 4, label: { pt: 'Qui', en: 'Thu' }, full: { pt: 'quinta-feira', en: 'Thursday' } },
  { value: 5, label: { pt: 'Sex', en: 'Fri' }, full: { pt: 'sexta-feira', en: 'Friday' } },
  { value: 6, label: { pt: 'Sáb', en: 'Sat' }, full: { pt: 'sábado', en: 'Saturday' } },
  { value: 7, label: { pt: 'Dom', en: 'Sun' }, full: { pt: 'domingo', en: 'Sunday' } },
];

const PICKER_TABS = [
  { kind: 'anchor', label: COPY.anchor },
  { kind: 'vision', label: COPY.visionsTab },
  { kind: 'affirmation', label: COPY.affirmationsTab },
];

const clean = (value, max = 800) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const isValidTime = (value) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  return !!match;
};

const editTime = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
};

const sameDays = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export default function AffirmationAlarmScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const focused = useIsFocused();
  const { t, lang } = useT();
  const { state, saveMorningRitualPreferences, addToWakeSequence } = useApp();
  const narration = usePersonalNarration();
  const ritual = state.morningRitual || {};
  // The sequence is saved as it is edited; time and days stay a draft until the
  // main button. The AlarmKit sound is the sequence's first phrase.
  const items = useMemo(() => wakeSequenceItemsForState(state, lang), [state, lang]);
  const options = useMemo(() => wakeSequenceOptionsForState(state, lang), [state, lang]);
  const selected = useMemo(() => firstPhraseForAlarm(items, state), [items, state]);
  const sequenceIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);
  const full = items.length >= WAKE_SEQUENCE_MAX;
  const listeningSeconds = estimateListeningSeconds(items);

  const [time, setTime] = useState(() => isValidTime(ritual.reminderTime) ? ritual.reminderTime : '07:00');
  const [weekdays, setWeekdays] = useState(() => alarmWeekdaysOrDefault(ritual.weekdays));
  const [customText, setCustomText] = useState(() => clean(ritual.wakeCustomText, 280));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState('anchor');
  const [capability, setCapability] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const operationRef = useRef(false);
  const mountedRef = useRef(true);

  const persistedDays = alarmWeekdaysOrDefault(ritual.weekdays);
  const dirty =
    time !== (isValidTime(ritual.reminderTime) ? ritual.reminderTime : '07:00') ||
    !sameDays(weekdays, persistedDays) ||
    (ritual.reminderEnabled &&
      ((selected && selected.text) !== ritual.wakeAffirmationText ||
        ritual.wakeNarratorId !== narration.narratorId));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      narration.stop();
    };
  }, [narration.stop]);

  const refreshCapability = useCallback(async () => {
    try {
      const result = await getAffirmationAlarmCapability();
      if (mountedRef.current) setCapability(result);
    } catch (_error) {
      if (mountedRef.current) setCapability({ supported: false, reason: 'capability_error' });
    }
  }, []);

  useEffect(() => {
    if (!focused) {
      narration.stop();
      return undefined;
    }
    refreshCapability();
    return undefined;
  }, [focused, narration.stop, refreshCapability]);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && focused) refreshCapability();
    });
    return () => subscription.remove();
  }, [focused, refreshCapability]);

  const haptic = useCallback((success = false) => {
    if (Platform.OS === 'web') return;
    const action = success
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.selectionAsync();
    action.catch(() => {});
  }, []);

  // Editing the sequence never asks for permission nor touches the native
  // alarm: the provider keeps the device-confirmed phrase until it is replaced.
  const saveSequence = useCallback((patch) => {
    if (operationRef.current) return;
    saveMorningRitualPreferences(patch);
    setFeedback(null);
    haptic();
  }, [haptic, saveMorningRitualPreferences]);

  const addItem = useCallback((item) => {
    if (operationRef.current) return;
    if (addToWakeSequence({ kind: item.kind, id: item.id }).ok) {
      setFeedback(null);
      haptic();
    }
  }, [addToWakeSequence, haptic]);

  const moveItem = useCallback((index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = items.slice();
    [next[index], next[target]] = [next[target], next[index]];
    saveSequence({ wakeSequence: next });
  }, [items, saveSequence]);

  const removeItem = useCallback((index) => {
    saveSequence({ wakeSequence: items.filter((_, position) => position !== index) });
  }, [items, saveSequence]);

  const customInSequence = sequenceIds.has('custom');
  const canSaveCustom = clean(customText).length >= 4 && (customInSequence || !full);
  const saveCustom = useCallback(() => {
    if (!canSaveCustom) return;
    saveSequence({
      wakeCustomText: clean(customText, 280),
      wakeCustomLang: lang,
      wakeSequence: customInSequence ? items : [...items, { kind: 'affirmation', id: 'custom' }],
    });
  }, [canSaveCustom, customInSequence, customText, items, lang, saveSequence]);

  const toggleDay = useCallback((day) => {
    if (operationRef.current) return;
    setWeekdays((current) => {
      if (!current.includes(day)) return [...current, day].sort((left, right) => left - right);
      if (current.length === 1) {
        setFeedback('invalid_days');
        return current;
      }
      return current.filter((value) => value !== day);
    });
    haptic();
  }, [haptic]);

  const activate = useCallback(async () => {
    if (operationRef.current || !selected || !isValidTime(time) || weekdays.length === 0) return;
    const confirmed = await confirmAsync({
      title: t(COPY.confirmTitle),
      message: t(COPY.confirmBody, { time, phrase: selected.text }),
      confirmLabel: t(COPY.confirmAction),
      cancelLabel: t(COPY.cancel),
      destructive: false,
      lang,
    });
    if (!confirmed || operationRef.current) return;
    operationRef.current = true;
    setBusy(true);
    setFeedback(null);
    let activationStage = 'permission';
    try {
      narration.stop();
      const authorization = await requestAffirmationAlarmAuthorization();
      if (authorization.capability && mountedRef.current) {
        setCapability(authorization.capability);
      }
      if (authorization.ok !== true) {
        if (mountedRef.current) {
          setFeedback(
            authorization.reason === 'authorization_denied'
              ? 'denied'
              : authorization.reason === 'exact_alarm_permission_required' ||
                authorization.reason === 'notification_permission_required' ||
                authorization.reason === 'authorization_required'
              ? 'permission_required'
              : 'failed'
          );
        }
        return;
      }
      activationStage = 'voice';
      const prepared = await narration.preparePersonal({
        text: selected.text,
        lang: selected.lang || lang,
      });
      if (!prepared.ok || !(prepared.bytes instanceof Uint8Array)) {
        if (mountedRef.current) setFeedback('voice_failed');
        return;
      }
      const audioBase64Wav = wavBytesToBase64(prepared.bytes);
      activationStage = 'schedule';
      const response = await scheduleAffirmationAlarm({
        time,
        weekdays,
        affirmation: selected.text,
        locale: selected.lang === 'en' ? 'en-US' : 'pt-BR',
        requestAuthorization: false,
        audioBase64Wav,
      });
      if (response.ok === true) {
        saveMorningRitualPreferences({
          reminderEnabled: true,
          alarmSyncError: false,
          reminderTime: time,
          weekdays,
          wakeAffirmationId: selected.id,
          wakeAffirmationText: selected.text,
          wakeAffirmationLang: selected.lang,
          wakeNarratorId: narration.narratorId,
          wakeSoundSource: response.soundSource,
        });
        if (mountedRef.current) {
          if (response.capability) setCapability(response.capability);
          setFeedback('scheduled');
          haptic(true);
        }
        return;
      }
      if (mountedRef.current) {
        if (response.capability) setCapability(response.capability);
        setFeedback(
          response.reason === 'authorization_denied'
            ? 'denied'
            : response.reason === 'exact_alarm_permission_required' ||
              response.reason === 'notification_permission_required' ||
              response.reason === 'authorization_required'
            ? 'permission_required'
            : 'failed'
        );
      }
    } catch (_error) {
      if (mountedRef.current) {
        setFeedback(
          activationStage === 'permission'
            ? 'permission_failed'
            : activationStage === 'voice'
            ? 'voice_failed'
            : 'failed'
        );
      }
    } finally {
      operationRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [haptic, lang, narration, saveMorningRitualPreferences, selected, t, time, weekdays]);

  const saveWebChoice = useCallback(() => {
    if (operationRef.current || !selected || !isValidTime(time) || weekdays.length === 0) return;
    saveMorningRitualPreferences({
      reminderTime: time,
      weekdays,
      wakeAffirmationId: selected.id,
      wakeAffirmationText: selected.text,
      wakeAffirmationLang: selected.lang || lang,
      wakeNarratorId: narration.narratorId,
    });
    setFeedback('saved_draft');
    haptic(true);
  }, [haptic, lang, narration.narratorId, saveMorningRitualPreferences, selected, time, weekdays]);

  const deactivate = useCallback(async () => {
    if (operationRef.current) return;
    const confirmed = await confirmAsync({
      title: t(COPY.deactivateTitle),
      message: t(COPY.deactivateBody),
      confirmLabel: t(COPY.deactivateConfirm),
      cancelLabel: t(COPY.cancel),
      destructive: true,
      lang,
    });
    if (!confirmed || operationRef.current) return;
    operationRef.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await cancelAffirmationAlarm();
      if (response.ok === true) {
        saveMorningRitualPreferences({ reminderEnabled: false, alarmSyncError: false });
        if (mountedRef.current) {
          if (response.capability) setCapability(response.capability);
          setFeedback('cancelled');
          haptic(true);
        }
      } else if (mountedRef.current) {
        setFeedback('cancel_failed');
      }
    } catch (_error) {
      if (mountedRef.current) setFeedback('cancel_failed');
    } finally {
      operationRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [haptic, lang, saveMorningRitualPreferences, t]);

  const goBack = useCallback(() => {
    if (operationRef.current) return;
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate('Main');
  }, [navigation]);

  const canSchedule = !!(
    selected &&
    isValidTime(time) &&
    weekdays.length > 0 &&
    capability &&
    capability.supported === true &&
    (capability.canSchedule || capability.canRequestAuthorization)
  );
  const canSaveChoice = !!(selected && isValidTime(time) && weekdays.length > 0);

  const status = busy
    ? t(COPY.scheduling)
    : feedback === 'saved_draft'
    ? t(COPY.savedDraft)
    : feedback === 'denied' || capability?.authorization === 'denied'
    ? t(COPY.denied)
    : feedback === 'permission_required'
    ? t(COPY.permissionRequired)
    : feedback === 'permission_failed'
    ? t(COPY.permissionFailed)
    : feedback === 'failed'
    ? t(COPY.failed)
    : feedback === 'voice_failed'
    ? t(COPY.voiceFailed)
    : feedback === 'cancel_failed'
    ? t(COPY.cancelFailed)
    : feedback === 'cancelled'
    ? t(COPY.cancelled)
    : feedback === 'invalid_days'
    ? t(COPY.daysHint)
    : ritual.alarmSyncError
    ? t(COPY.failed)
    : ritual.reminderEnabled && dirty
    ? t(COPY.changed)
    : ritual.reminderEnabled
    ? t(COPY.active, { time: ritual.reminderTime || '07:00' })
    : !capability
    ? t(COPY.checking)
    : Platform.OS === 'web'
    ? t(COPY.webUnsupported)
    : capability.reason === 'native_module_missing'
    ? t(COPY.nativeMissing)
    : capability.supported !== true
    ? t(COPY.unsupported)
    : t(COPY.ready);

  const sourceLabel = (source) =>
    source === 'dream'
      ? t(COPY.dream)
      : source === 'custom'
      ? t(COPY.yours)
      : source === 'vision'
      ? t(COPY.vision)
      : source === 'anchor'
      ? t(COPY.anchor)
      : source === 'affirmation'
      ? t(COPY.affirmation)
      : t(COPY.manifestation);
  const sourceAccent = (source) =>
    source === 'dream' ? 1 : source === 'vision' ? 2 : source === 'anchor' ? 0 : 3;

  const renderOption = useCallback(({ item }) => {
    const added = sequenceIds.has(item.id);
    const disabled = added || full || busy;
    return (
      <Pressable
        testID={`wake-picker-item-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${sourceLabel(item.source)}: ${item.title}`}
        accessibilityState={{ selected: added, disabled }}
        disabled={disabled}
        onPress={() => addItem(item)}
        style={({ pressed }) => [
          styles.option,
          {
            backgroundColor: added ? alpha(theme.accent, 0.09) : theme.surface,
            borderColor: added ? theme.accent : theme.border,
          },
          disabled && !added && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.sourceTag, { backgroundColor: alpha(accentAt(theme, sourceAccent(item.source)), 0.13) }]}>
          <Text style={[styles.sourceText, { color: accentAt(theme, sourceAccent(item.source)) }]}>
            {sourceLabel(item.source)}
          </Text>
        </View>
        <View style={styles.optionCopy}>
          <Text numberOfLines={3} style={[styles.optionText, { color: theme.text }]}>{item.title}</Text>
          {item.kind !== 'affirmation' ? (
            <Text numberOfLines={2} style={[styles.optionPreview, { color: theme.textMuted }]}>{item.text}</Text>
          ) : null}
          {added ? <Text style={[styles.optionAdded, { color: theme.accent }]}>{t(COPY.inSequence)}</Text> : null}
        </View>
        <Ionicons
          name={added ? 'checkmark-circle' : 'add-circle-outline'}
          size={22}
          color={added ? theme.accent : theme.textMuted}
        />
      </Pressable>
    );
  }, [addItem, busy, full, sequenceIds, sourceLabel, t, theme]);

  return (
    <SafeAreaView
      testID="affirmation-alarm-screen"
      edges={['top']}
      style={[styles.safe, Platform.OS === 'web' && styles.webViewport, { backgroundColor: theme.bg }]}
    >
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable
            testID="affirmation-alarm-back"
            accessibilityRole="button"
            accessibilityLabel={t(COPY.back)}
            disabled={busy}
            onPress={goBack}
            style={({ pressed }) => [styles.iconButton, busy && styles.disabled, pressed && styles.pressed]}
          >
            <Ionicons name="arrow-back" size={23} color={theme.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{t(COPY.title)}</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>{t(COPY.subtitle)}</Text>
          </View>
        </View>

        <ScrollView
          testID="affirmation-alarm-scroll"
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.content}>
            <View style={styles.intro}>
              <View style={[styles.featureIcon, { backgroundColor: alpha(accentAt(theme, 3), 0.14) }]}>
                <Ionicons name="alarm-outline" size={23} color={accentAt(theme, 3)} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(COPY.sequenceTitle)}</Text>
                <Text style={[styles.body, { color: theme.textMuted }]}>{t(COPY.sequenceBody)}</Text>
              </View>
            </View>

            <View
              testID="wake-sequence-list"
              style={[styles.phraseCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
            >
              {items.length === 0 ? (
                <View style={styles.emptyPhrase}>
                  <Ionicons name="moon-outline" size={24} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t(COPY.emptySequence)}</Text>
                </View>
              ) : (
                items.map((item, index) => {
                  const position = index + 1;
                  // An active native alarm keeps at least one item; turning it off stays explicit.
                  const lockedLast = ritual.reminderEnabled && items.length === 1;
                  const controls = [
                    {
                      testID: `wake-sequence-up-${index}`,
                      icon: 'arrow-up',
                      label: COPY.moveUp,
                      disabled: index === 0,
                      onPress: () => moveItem(index, -1),
                    },
                    {
                      testID: `wake-sequence-down-${index}`,
                      icon: 'arrow-down',
                      label: COPY.moveDown,
                      disabled: index === items.length - 1,
                      onPress: () => moveItem(index, 1),
                    },
                    {
                      testID: `wake-sequence-remove-${index}`,
                      icon: 'close',
                      label: COPY.remove,
                      disabled: lockedLast,
                      onPress: () => removeItem(index),
                    },
                  ];
                  return (
                    <View
                      key={item.id}
                      testID={`wake-sequence-item-${index}`}
                      style={[styles.sequenceRow, index > 0 && { borderTopColor: theme.border }, index > 0 && styles.sequenceDivider]}
                    >
                      <View style={styles.sequenceTop}>
                        <View style={[styles.position, { backgroundColor: alpha(accentAt(theme, sourceAccent(item.source)), 0.14) }]}>
                          <Text style={[styles.positionText, { color: accentAt(theme, sourceAccent(item.source)) }]}>{position}</Text>
                        </View>
                        <Text numberOfLines={3} style={[styles.sequenceTitle, { color: theme.text }]}>{item.title}</Text>
                      </View>
                      <View style={styles.sequenceBottom}>
                        <Text style={[styles.sourceLine, styles.flex, { color: accentAt(theme, sourceAccent(item.source)) }]}>
                          {sourceLabel(item.source)}
                        </Text>
                        {controls.map((control) => (
                          <Pressable
                            key={control.testID}
                            testID={control.testID}
                            accessibilityRole="button"
                            accessibilityLabel={t(control.label, { n: position })}
                            accessibilityState={{ disabled: busy || control.disabled }}
                            disabled={busy || control.disabled}
                            onPress={control.onPress}
                            style={({ pressed }) => [
                              styles.rowButton,
                              { backgroundColor: theme.surfaceAlt },
                              (busy || control.disabled) && styles.disabled,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Ionicons name={control.icon} size={18} color={theme.text} />
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  );
                })
              )}
              {items.length > 0 ? (
                <Text style={[styles.sequenceMeta, { color: theme.textMuted }]}>
                  {t(COPY.count, { n: items.length, max: WAKE_SEQUENCE_MAX })} ·{' '}
                  {listeningSeconds < 60
                    ? t(COPY.estimateSeconds, { n: listeningSeconds })
                    : t(COPY.estimateMinutes, { n: Math.round(listeningSeconds / 60) })}
                </Text>
              ) : null}
              <View style={styles.actionRow}>
                <Pressable
                  testID="wake-sequence-add"
                  accessibilityRole="button"
                  accessibilityLabel={t(COPY.add)}
                  accessibilityState={{ disabled: busy || full }}
                  disabled={busy || full}
                  onPress={() => setPickerOpen(true)}
                  style={({ pressed }) => [
                    styles.smallButton,
                    { backgroundColor: theme.surfaceAlt },
                    (busy || full) && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons name="add" size={18} color={theme.accent} />
                  <Text style={[styles.smallButtonText, { color: theme.accent }]}>{t(COPY.add)}</Text>
                </Pressable>
                {/* Appears once the listening screen (WakeSequence route) is turned on. */}
                {RELEASE_FEATURES.wakeSequence ? (
                  <Pressable
                    testID="wake-listen-now"
                    accessibilityRole="button"
                    accessibilityLabel={t(COPY.listenNow)}
                    accessibilityState={{ disabled: items.length === 0 }}
                    disabled={items.length === 0}
                    onPress={() => navigation.navigate('WakeSequence')}
                    style={({ pressed }) => [
                      styles.smallButton,
                      { backgroundColor: alpha(theme.accent, 0.1) },
                      items.length === 0 && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons name="play" size={17} color={theme.accent} />
                    <Text style={[styles.smallButtonText, { color: theme.accent }]}>{t(COPY.listenNow)}</Text>
                  </Pressable>
                ) : null}
              </View>
              {full ? <Text style={[styles.warning, { color: theme.textMuted }]}>{t(COPY.full)}</Text> : null}
            </View>

            <View style={styles.scheduleRow}>
              <View style={styles.timeColumn}>
                <Text style={[styles.label, { color: theme.text }]}>{t(COPY.time)}</Text>
                <TextInput
                  testID="alarm-time-input"
                  accessibilityLabel={t(COPY.time)}
                  accessibilityHint={t(COPY.timeHint)}
                  value={time}
                  maxLength={5}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  editable={!busy}
                  onChangeText={(value) => {
                    setTime(editTime(value));
                    setFeedback(null);
                  }}
                  onBlur={() => {
                    if (!isValidTime(time)) setFeedback('invalid_time');
                  }}
                  placeholder="07:00"
                  placeholderTextColor={theme.textMuted}
                  style={[
                    styles.timeInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.surface,
                      borderColor: isValidTime(time) ? theme.border : theme.danger,
                    },
                  ]}
                />
              </View>
              <View style={[styles.clockIcon, { backgroundColor: alpha(accentAt(theme, 2), 0.12) }]}>
                <Ionicons name="time-outline" size={27} color={accentAt(theme, 2)} />
              </View>
            </View>
            {!isValidTime(time) ? <Text style={[styles.warning, { color: theme.danger }]}>{t(COPY.timeHint)}</Text> : null}

            <Text style={[styles.label, styles.daysLabel, { color: theme.text }]}>{t(COPY.days)}</Text>
            <View style={styles.daysRow}>
              {WEEKDAYS.map((day) => {
                const checked = weekdays.includes(day.value);
                return (
                  <Pressable
                    key={day.value}
                    testID={`alarm-weekday-${day.value}`}
                    accessibilityRole="checkbox"
                    accessibilityLabel={t(day.full)}
                    accessibilityState={{ checked, disabled: busy }}
                    disabled={busy}
                    onPress={() => toggleDay(day.value)}
                    style={({ pressed }) => [
                      styles.dayChip,
                      {
                        backgroundColor: checked ? theme.accent : theme.surface,
                        borderColor: checked ? theme.accent : theme.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.dayText, { color: checked ? '#FFFFFF' : theme.textMuted }]}>{t(day.label)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <PrimaryButton
              testID="activate-affirmation-alarm"
              label={
                Platform.OS === 'web'
                  ? COPY.saveChoice
                  : ritual.reminderEnabled
                  ? COPY.update
                  : COPY.activate
              }
              icon={Platform.OS === 'web' ? 'checkmark-circle-outline' : 'alarm-outline'}
              disabled={busy || (Platform.OS === 'web' ? !canSaveChoice : !canSchedule)}
              onPress={Platform.OS === 'web' ? saveWebChoice : activate}
              style={styles.primaryAction}
            />
            {ritual.reminderEnabled ? (
              <PrimaryButton
                testID="deactivate-affirmation-alarm"
                label={COPY.deactivate}
                icon="stop-circle-outline"
                variant="ghost"
                disabled={busy}
                onPress={deactivate}
                style={styles.secondaryAction}
              />
            ) : null}

            <View
              accessibilityLiveRegion="polite"
              style={[
                styles.status,
                {
                  backgroundColor: alpha(
                    feedback === 'failed' || feedback === 'denied'
                      ? theme.danger
                      : feedback === 'saved_draft' || (ritual.reminderEnabled && !dirty)
                      ? theme.success
                      : theme.warning,
                    0.1
                  ),
                },
              ]}
            >
              <Ionicons
                name={
                  feedback === 'saved_draft' || (ritual.reminderEnabled && !dirty)
                    ? 'checkmark-circle-outline'
                    : 'information-circle-outline'
                }
                size={19}
                color={
                  feedback === 'saved_draft' || (ritual.reminderEnabled && !dirty)
                    ? theme.success
                    : theme.warning
                }
              />
              <Text style={[styles.statusText, { color: theme.textMuted }]}>{status}</Text>
            </View>
            {(feedback === 'denied' || capability?.authorization === 'denied') &&
            Platform.OS !== 'web' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => Linking.openSettings().catch(() => {})}
                style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
              >
                <Ionicons name="settings-outline" size={17} color={theme.accent} />
                <Text style={[styles.settingsText, { color: theme.accent }]}>{t(COPY.openSettings)}</Text>
              </Pressable>
            ) : null}
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
                <Text style={[styles.modalTitle, { color: theme.text }]}>{t(COPY.pickerTitle)}</Text>
                <Text style={[styles.modalBody, { color: theme.textMuted }]}>{t(COPY.pickerBody)}</Text>
              </View>
              <Pressable
                testID="wake-picker-close"
                accessibilityRole="button"
                accessibilityLabel={t(COPY.close)}
                onPress={() => setPickerOpen(false)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>
            <View accessibilityRole="tablist" style={styles.tabs}>
              {PICKER_TABS.map((tab) => {
                const active = tab.kind === pickerTab;
                return (
                  <Pressable
                    key={tab.kind}
                    testID={`wake-picker-tab-${tab.kind}`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setPickerTab(tab.kind)}
                    style={({ pressed }) => [
                      styles.tab,
                      {
                        backgroundColor: active ? theme.accent : theme.surface,
                        borderColor: active ? theme.accent : theme.border,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text numberOfLines={1} style={[styles.tabText, { color: active ? '#FFFFFF' : theme.text }]}>
                      {t(tab.label)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {full ? <Text style={[styles.pickerNote, { color: theme.textMuted }]}>{t(COPY.full)}</Text> : null}
            <FlatList
              data={options.filter((item) => item.kind === pickerTab && item.source !== 'custom')}
              extraData={sequenceIds}
              renderItem={renderOption}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.optionList}
              ListHeaderComponent={pickerTab === 'affirmation' ? (
                <View style={[styles.customCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.customLabel, { color: theme.text }]}>{t(COPY.custom)}</Text>
                  <View style={styles.customRow}>
                    <TextInput
                      testID="custom-alarm-affirmation"
                      accessibilityLabel={t(COPY.custom)}
                      value={customText}
                      onChangeText={(value) => setCustomText(value.slice(0, 280))}
                      onSubmitEditing={saveCustom}
                      placeholder={t(COPY.customPlaceholder)}
                      placeholderTextColor={theme.textMuted}
                      maxLength={280}
                      returnKeyType="done"
                      style={[
                        styles.customInput,
                        { color: theme.text, backgroundColor: theme.bg, borderColor: theme.border },
                      ]}
                    />
                    <Pressable
                      testID="save-custom-alarm-affirmation"
                      accessibilityRole="button"
                      accessibilityLabel={t(COPY.useCustom)}
                      accessibilityState={{ disabled: !canSaveCustom }}
                      disabled={!canSaveCustom}
                      onPress={saveCustom}
                      style={({ pressed }) => [
                        styles.customButton,
                        { backgroundColor: theme.accent, opacity: canSaveCustom ? 1 : 0.4 },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    </Pressable>
                  </View>
                  {customInSequence ? (
                    <Text style={[styles.optionAdded, { color: theme.accent }]}>{t(COPY.inSequence)}</Text>
                  ) : null}
                </View>
              ) : null}
              ListEmptyComponent={(
                <Text style={[styles.emptyOptions, { color: theme.textMuted }]}>{t(COPY.noOptions)}</Text>
              )}
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
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  header: {
    minHeight: 76,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, paddingRight: 48 },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '800', textAlign: 'center', letterSpacing: -0.25 },
  subtitle: { fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 2, letterSpacing: 0.1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 128 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  intro: { flexDirection: 'row', alignItems: 'flex-start' },
  featureIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  sectionTitle: { fontSize: 24, lineHeight: 31, fontWeight: '800', letterSpacing: -0.35 },
  body: { fontSize: 15, lineHeight: 23, marginTop: 5, letterSpacing: 0 },
  phraseCard: { borderWidth: 1, borderRadius: 22, padding: 20, marginTop: 22 },
  sourceLine: { fontSize: 10, lineHeight: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1 },
  sequenceRow: { paddingVertical: 12 },
  sequenceDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  sequenceTop: { flexDirection: 'row', alignItems: 'flex-start' },
  position: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  positionText: { fontSize: 13, fontWeight: '800', letterSpacing: 0 },
  sequenceTitle: { flex: 1, fontSize: 15.5, lineHeight: 22, fontWeight: '700', letterSpacing: -0.1 },
  sequenceBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingLeft: 38 },
  rowButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  sequenceMeta: { fontSize: 12.5, lineHeight: 18, marginTop: 10, letterSpacing: 0 },
  emptyPhrase: { minHeight: 88, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center', marginTop: 7, letterSpacing: 0 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5, marginTop: 15 },
  smallButton: { minHeight: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15, margin: 5 },
  smallButtonText: { fontSize: 13, fontWeight: '800', marginLeft: 6, letterSpacing: 0 },
  warning: { fontSize: 12, lineHeight: 18, marginTop: 8, letterSpacing: 0 },
  scheduleRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 28 },
  timeColumn: { flex: 1 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '800', marginBottom: 10, letterSpacing: 0.1 },
  daysLabel: { marginTop: 26 },
  timeInput: { width: 144, height: 60, borderWidth: 1, borderRadius: 18, paddingHorizontal: 16, fontSize: 27, lineHeight: 32, fontWeight: '700', letterSpacing: 0.3 },
  clockIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  dayChip: { minWidth: 48, minHeight: 48, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center', margin: 4 },
  dayText: { fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  primaryAction: { marginTop: 28 },
  secondaryAction: { marginTop: 12 },
  status: { borderRadius: 16, padding: 15, flexDirection: 'row', alignItems: 'flex-start', marginTop: 14 },
  statusText: { flex: 1, fontSize: 12.5, lineHeight: 19, marginLeft: 9, letterSpacing: 0 },
  settingsButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  settingsText: { fontSize: 13, fontWeight: '800', marginLeft: 7, letterSpacing: 0 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalSheet: { width: '100%', maxWidth: 720, height: '82%', borderWidth: 1, borderRadius: 26, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14 },
  modalTitle: { fontSize: 23, lineHeight: 29, fontWeight: '800', letterSpacing: -0.25 },
  modalBody: { fontSize: 13, lineHeight: 19, marginTop: 2, letterSpacing: 0 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12 },
  tab: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginHorizontal: 3 },
  tabText: { fontSize: 13, fontWeight: '800', letterSpacing: 0 },
  pickerNote: { fontSize: 12.5, lineHeight: 18, paddingHorizontal: 20, paddingBottom: 10, letterSpacing: 0 },
  optionList: { paddingHorizontal: 16, paddingBottom: 28 },
  customCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginBottom: 14 },
  customLabel: { fontSize: 13, lineHeight: 18, fontWeight: '800', letterSpacing: 0 },
  customRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  customInput: { flex: 1, minWidth: 0, height: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 13, fontSize: 14, letterSpacing: 0 },
  customButton: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  emptyOptions: { fontSize: 14, lineHeight: 21, textAlign: 'center', padding: 24, letterSpacing: 0 },
  option: { minHeight: 92, borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  sourceTag: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, marginRight: 11 },
  sourceText: { fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 0 },
  optionCopy: { flex: 1, minWidth: 0, paddingRight: 10 },
  optionText: { fontSize: 14, lineHeight: 21, fontWeight: '600', letterSpacing: 0 },
  optionPreview: { fontSize: 12.5, lineHeight: 18, marginTop: 3, letterSpacing: 0 },
  optionAdded: { fontSize: 11.5, lineHeight: 16, fontWeight: '800', marginTop: 5, letterSpacing: 0 },
});
