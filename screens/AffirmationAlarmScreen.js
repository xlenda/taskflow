import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { useApp } from '../context/AppContext';
import {
  cancelAffirmationAlarm,
  getAffirmationAlarmCapability,
  scheduleAffirmationAlarm,
} from '../services/affirmationAlarm';
import { useTheme } from '../ui/theme';
import { alarmWeekdaysOrDefault } from '../utils/alarmSchedule';
import { wavBytesToBase64 } from '../utils/audioBase64';
import { alpha, accentAt } from '../utils/colors';
import { confirmAsync } from '../utils/confirm';
import { personalAffirmationsForState } from '../utils/personalAffirmations';
import { usePersonalNarration } from '../utils/usePersonalNarration';
import { useT } from '../utils/useT';

const COPY = {
  title: { pt: 'Meu despertador', en: 'My alarm' },
  subtitle: {
    pt: 'Acorde com uma afirmação criada para você.',
    en: 'Wake up with an affirmation made for you.',
  },
  phraseTitle: { pt: 'Afirmação do despertar', en: 'Wake-up affirmation' },
  phraseBody: {
    pt: 'Escolha uma frase das suas manifestações, dos seus sonhos ou escreva a sua.',
    en: 'Choose a phrase from your manifestations or dreams, or write your own.',
  },
  choose: { pt: 'Escolher afirmação', en: 'Choose affirmation' },
  change: { pt: 'Trocar', en: 'Change' },
  preview: { pt: 'Ouvir prévia', en: 'Hear preview' },
  stop: { pt: 'Parar', en: 'Stop' },
  noPhrase: { pt: 'Escolha uma afirmação para continuar.', en: 'Choose an affirmation to continue.' },
  time: { pt: 'Horário', en: 'Time' },
  timeHint: { pt: 'Use o formato 07:30.', en: 'Use the 07:30 format.' },
  days: { pt: 'Dias da semana', en: 'Days of the week' },
  daysHint: { pt: 'Escolha pelo menos um dia.', en: 'Choose at least one day.' },
  activate: { pt: 'Ativar despertador', en: 'Turn alarm on' },
  update: { pt: 'Salvar alterações', en: 'Save changes' },
  deactivate: { pt: 'Desativar despertador', en: 'Turn alarm off' },
  deactivateTitle: { pt: 'Desativar o despertador?', en: 'Turn the alarm off?' },
  deactivateBody: {
    pt: 'A afirmação não tocará mais no horário programado.',
    en: 'The affirmation will no longer play at the scheduled time.',
  },
  deactivateConfirm: { pt: 'Desativar', en: 'Turn off' },
  cancel: { pt: 'Cancelar', en: 'Cancel' },
  checking: { pt: 'Verificando este aparelho…', en: 'Checking this device…' },
  scheduling: { pt: 'Confirmando com o iPhone…', en: 'Confirming with your iPhone…' },
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
  openSettings: { pt: 'Abrir Ajustes', en: 'Open Settings' },
  failed: {
    pt: 'O iPhone não confirmou o agendamento. Nada foi salvo; tente novamente.',
    en: 'Your iPhone did not confirm the schedule. Nothing was saved; try again.',
  },
  voiceFailed: {
    pt: 'Não foi possível criar a voz escolhida. O despertador não foi alterado.',
    en: 'The selected voice could not be created. Your alarm was not changed.',
  },
  cancelled: { pt: 'Despertador desativado.', en: 'Alarm turned off.' },
  cancelFailed: {
    pt: 'O iPhone não confirmou a desativação. O despertador continua marcado como ativo.',
    en: 'Your iPhone did not confirm cancellation. The alarm remains marked as active.',
  },
  webUnsupported: {
    pt: 'No site você pode preparar e ouvir a frase. Para acordar com um alarme real, use o app instalado em um iPhone compatível.',
    en: 'On the website you can prepare and preview the phrase. For a real wake-up alarm, use the installed app on a compatible iPhone.',
  },
  nativeMissing: {
    pt: 'Este app ainda não tem o módulo nativo necessário para criar um despertador real.',
    en: 'This app does not yet include the native module required for a real alarm.',
  },
  unsupported: {
    pt: 'O despertador com afirmação não está disponível neste aparelho.',
    en: 'The affirmation alarm is unavailable on this device.',
  },
  audioUnavailable: {
    pt: 'A prévia privada não está disponível neste aparelho.',
    en: 'A private preview is unavailable on this device.',
  },
  pickerTitle: { pt: 'Escolha sua afirmação', en: 'Choose your affirmation' },
  pickerBody: {
    pt: 'As frases abaixo vieram apenas do que você criou no Celeste.',
    en: 'The phrases below come only from what you created in Celeste.',
  },
  custom: { pt: 'Minha própria afirmação', en: 'My own affirmation' },
  customPlaceholder: {
    pt: 'Eu acordo presente e pronta para o meu dia.',
    en: 'I wake up present and ready for my day.',
  },
  useCustom: { pt: 'Usar esta frase', en: 'Use this affirmation' },
  noOptions: {
    pt: 'Crie uma manifestação ou transforme um sonho para receber sua primeira afirmação.',
    en: 'Create a manifestation or transform a dream to receive your first affirmation.',
  },
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

function selectedFromState(options, ritual) {
  const matched = options.find((item) => item.id === ritual.wakeAffirmationId);
  if (matched) return matched;
  const text = clean(ritual.wakeAffirmationText);
  if (ritual.wakeAffirmationId === 'custom' && text) {
    return { id: 'custom', text, lang: ritual.wakeAffirmationLang === 'en' ? 'en' : 'pt', source: 'custom' };
  }
  return null;
}

export default function AffirmationAlarmScreen({ route }) {
  const theme = useTheme();
  const navigation = useNavigation();
  const focused = useIsFocused();
  const { t, lang } = useT();
  const { state, saveMorningRitualPreferences } = useApp();
  const narration = usePersonalNarration();
  const ritual = state.morningRitual || {};
  const options = useMemo(() => personalAffirmationsForState(state), [state]);
  const persistedSelection = useMemo(
    () => selectedFromState(options, ritual),
    [options, ritual.wakeAffirmationId, ritual.wakeAffirmationText, ritual.wakeAffirmationLang]
  );

  const [selected, setSelected] = useState(() => persistedSelection || options[0] || null);
  const [time, setTime] = useState(() => isValidTime(ritual.reminderTime) ? ritual.reminderTime : '07:00');
  const [weekdays, setWeekdays] = useState(() => alarmWeekdaysOrDefault(ritual.weekdays));
  const [customText, setCustomText] = useState(() =>
    ritual.wakeAffirmationId === 'custom' ? clean(ritual.wakeAffirmationText, 280) : ''
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [capability, setCapability] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [busy, setBusy] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const operationRef = useRef(false);
  const mountedRef = useRef(true);
  const preselectionRef = useRef(null);

  const persistedDays = alarmWeekdaysOrDefault(ritual.weekdays);
  const dirty =
    (selected && selected.id) !== (persistedSelection && persistedSelection.id) ||
    (selected && selected.text) !== (persistedSelection && persistedSelection.text) ||
    time !== (isValidTime(ritual.reminderTime) ? ritual.reminderTime : '07:00') ||
    !sameDays(weekdays, persistedDays) ||
    (ritual.reminderEnabled && ritual.wakeNarratorId !== narration.narratorId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      narration.stop();
    };
  }, [narration.stop]);

  useEffect(() => {
    if (!focused) {
      narration.stop();
      return;
    }
    let active = true;
    getAffirmationAlarmCapability()
      .then((result) => {
        if (active) setCapability(result);
      })
      .catch(() => {
        if (active) setCapability({ supported: false, reason: 'capability_error' });
      });
    return () => {
      active = false;
    };
  }, [focused, narration.stop]);

  useEffect(() => {
    const preselectId = clean(route?.params?.preselectId, 160);
    if (!preselectId || preselectionRef.current === preselectId) return;
    const item = options.find((option) => option.id === preselectId);
    if (!item) return;
    preselectionRef.current = preselectId;
    setSelected(item);
    setFeedback(null);
    navigation.setParams?.({ preselectId: undefined });
  }, [navigation, options, route?.params?.preselectId]);

  const haptic = useCallback((success = false) => {
    if (Platform.OS === 'web') return;
    const action = success
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.selectionAsync();
    action.catch(() => {});
  }, []);

  const choose = useCallback((item) => {
    if (operationRef.current) return;
    narration.stop();
    setSelected(item);
    setPickerOpen(false);
    setFeedback(null);
    haptic();
  }, [haptic, narration.stop]);

  const chooseCustom = useCallback(() => {
    const text = clean(customText, 280);
    if (text.length < 4) return;
    choose({ id: 'custom', text, lang, source: 'custom' });
  }, [choose, customText, lang]);

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

  const previewPlaybackId = selected
    ? `alarm-preview:${selected.id || clean(selected.text, 72)}`
    : null;
  const speaking =
    narration.activePlaybackId === previewPlaybackId &&
    (narration.isLoading || narration.isPlaying || narration.isPaused);

  const preview = useCallback(async () => {
    if (!selected) return;
    if (speaking) {
      narration.stop();
      return;
    }
    setAudioFailed(false);
    const result = await narration.playPersonal({
      text: selected.text,
      lang: selected.lang || lang,
      playbackId: previewPlaybackId,
    });
    if (!result.ok && result.error !== 'audio_cancelled' && mountedRef.current) {
      setAudioFailed(true);
    }
  }, [lang, narration, previewPlaybackId, selected, speaking]);

  const activate = useCallback(async () => {
    if (operationRef.current || !selected || !isValidTime(time) || weekdays.length === 0) return;
    operationRef.current = true;
    setBusy(true);
    setFeedback(null);
    try {
      narration.stop();
      const prepared = await narration.preparePersonal({
        text: selected.text,
        lang: selected.lang || lang,
      });
      if (!prepared.ok || !(prepared.bytes instanceof Uint8Array)) {
        if (mountedRef.current) setFeedback('voice_failed');
        return;
      }
      const audioBase64Wav = wavBytesToBase64(prepared.bytes);
      const response = await scheduleAffirmationAlarm({
        time,
        weekdays,
        affirmation: selected.text,
        locale: selected.lang === 'en' ? 'en-US' : 'pt-BR',
        requestAuthorization: true,
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
        setFeedback(response.reason === 'authorization_denied' ? 'denied' : 'failed');
      }
    } catch (_error) {
      if (mountedRef.current) setFeedback('voice_failed');
    } finally {
      operationRef.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [haptic, lang, narration, saveMorningRitualPreferences, selected, time, weekdays]);

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

  const status = busy
    ? t(COPY.scheduling)
    : feedback === 'denied' || capability?.authorization === 'denied'
    ? t(COPY.denied)
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
    source === 'dream' ? t(COPY.dream) : source === 'custom' ? t(COPY.yours) : t(COPY.manifestation);

  const renderOption = useCallback(({ item }) => {
    const checked = selected?.id === item.id;
    return (
      <Pressable
        testID={`alarm-affirmation-${item.id}`}
        accessibilityRole="radio"
        accessibilityState={{ selected: checked }}
        onPress={() => choose(item)}
        style={({ pressed }) => [
          styles.option,
          {
            backgroundColor: checked ? alpha(theme.accent, 0.09) : theme.surface,
            borderColor: checked ? theme.accent : theme.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.sourceTag, { backgroundColor: alpha(accentAt(theme, item.source === 'dream' ? 1 : 3), 0.13) }]}>
          <Text style={[styles.sourceText, { color: accentAt(theme, item.source === 'dream' ? 1 : 3) }]}>
            {sourceLabel(item.source)}
          </Text>
        </View>
        <Text style={[styles.optionText, { color: theme.text }]}>{item.text}</Text>
        <Ionicons
          name={checked ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={checked ? theme.accent : theme.textMuted}
        />
      </Pressable>
    );
  }, [choose, selected?.id, sourceLabel, theme]);

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
                <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(COPY.phraseTitle)}</Text>
                <Text style={[styles.body, { color: theme.textMuted }]}>{t(COPY.phraseBody)}</Text>
              </View>
            </View>

            <View style={[styles.phraseCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {selected ? (
                <>
                  <Text style={[styles.sourceLine, { color: accentAt(theme, 1) }]}>{sourceLabel(selected.source)}</Text>
                  <Text style={[styles.phrase, { color: theme.text }]}>{selected.text}</Text>
                </>
              ) : (
                <View style={styles.emptyPhrase}>
                  <Ionicons name="volume-mute-outline" size={24} color={theme.textMuted} />
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t(COPY.noPhrase)}</Text>
                </View>
              )}
              <View style={styles.actionRow}>
                <Pressable
                  testID="open-alarm-affirmation-picker"
                  onPress={() => setPickerOpen(true)}
                  style={({ pressed }) => [styles.smallButton, { backgroundColor: theme.surfaceAlt }, pressed && styles.pressed]}
                >
                  <Ionicons name="list-outline" size={17} color={theme.accent} />
                  <Text style={[styles.smallButtonText, { color: theme.accent }]}>
                    {selected ? t(COPY.change) : t(COPY.choose)}
                  </Text>
                </Pressable>
                {selected ? (
                  <Pressable
                    testID="preview-alarm-affirmation"
                    onPress={preview}
                    style={({ pressed }) => [styles.smallButton, { backgroundColor: alpha(theme.accent, 0.1) }, pressed && styles.pressed]}
                  >
                    <Ionicons name={speaking ? 'stop' : 'play'} size={17} color={theme.accent} />
                    <Text style={[styles.smallButtonText, { color: theme.accent }]}>
                      {speaking ? t(COPY.stop) : t(COPY.preview)}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {audioFailed ? <Text style={[styles.warning, { color: theme.warning }]}>{t(COPY.audioUnavailable)}</Text> : null}
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
              label={ritual.reminderEnabled ? COPY.update : COPY.activate}
              icon="alarm-outline"
              disabled={busy || !canSchedule}
              onPress={activate}
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
                { backgroundColor: alpha(feedback === 'failed' || feedback === 'denied' ? theme.danger : theme.warning, 0.1) },
              ]}
            >
              <Ionicons
                name={ritual.reminderEnabled && !dirty ? 'checkmark-circle-outline' : 'information-circle-outline'}
                size={19}
                color={ritual.reminderEnabled && !dirty ? theme.success : theme.warning}
              />
              <Text style={[styles.statusText, { color: theme.textMuted }]}>{status}</Text>
            </View>
            {(feedback === 'denied' || capability?.authorization === 'denied') && Platform.OS === 'ios' ? (
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
                accessibilityRole="button"
                accessibilityLabel={t(COPY.close)}
                onPress={() => setPickerOpen(false)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>
            <FlatList
              data={options.filter((item) => item.source !== 'custom')}
              renderItem={renderOption}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.optionList}
              ListHeaderComponent={(
                <View style={[styles.customCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={[styles.customLabel, { color: theme.text }]}>{t(COPY.custom)}</Text>
                  <View style={styles.customRow}>
                    <TextInput
                      testID="custom-alarm-affirmation"
                      accessibilityLabel={t(COPY.custom)}
                      value={customText}
                      onChangeText={(value) => setCustomText(value.slice(0, 280))}
                      onSubmitEditing={chooseCustom}
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
                      accessibilityState={{ disabled: clean(customText).length < 4 }}
                      disabled={clean(customText).length < 4}
                      onPress={chooseCustom}
                      style={({ pressed }) => [
                        styles.customButton,
                        { backgroundColor: theme.accent, opacity: clean(customText).length < 4 ? 0.4 : 1 },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    </Pressable>
                  </View>
                </View>
              )}
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
    minHeight: 70,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, paddingRight: 44 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800', textAlign: 'center', letterSpacing: 0 },
  subtitle: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 1, letterSpacing: 0 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 112 },
  content: { width: '100%', maxWidth: 700, alignSelf: 'center' },
  intro: { flexDirection: 'row', alignItems: 'flex-start' },
  featureIcon: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  sectionTitle: { fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: 0 },
  body: { fontSize: 14, lineHeight: 21, marginTop: 4, letterSpacing: 0 },
  phraseCard: { borderWidth: 1, borderRadius: 8, padding: 16, marginTop: 18 },
  sourceLine: { fontSize: 10, lineHeight: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0 },
  phrase: { fontSize: 22, lineHeight: 31, fontWeight: '700', marginTop: 7, letterSpacing: 0 },
  emptyPhrase: { minHeight: 74, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center', marginTop: 7, letterSpacing: 0 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 12 },
  smallButton: { minHeight: 42, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, margin: 4 },
  smallButtonText: { fontSize: 13, fontWeight: '800', marginLeft: 6, letterSpacing: 0 },
  warning: { fontSize: 12, lineHeight: 18, marginTop: 8, letterSpacing: 0 },
  scheduleRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 22 },
  timeColumn: { flex: 1 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '800', marginBottom: 9, letterSpacing: 0 },
  daysLabel: { marginTop: 22 },
  timeInput: { width: 132, height: 54, borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, fontSize: 25, lineHeight: 30, fontWeight: '700', letterSpacing: 0 },
  clockIcon: { width: 54, height: 54, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  dayChip: { minWidth: 44, height: 42, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', margin: 3 },
  dayText: { fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  primaryAction: { marginTop: 24 },
  secondaryAction: { marginTop: 10 },
  status: { borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 },
  statusText: { flex: 1, fontSize: 12, lineHeight: 18, marginLeft: 8, letterSpacing: 0 },
  settingsButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  settingsText: { fontSize: 13, fontWeight: '800', marginLeft: 7, letterSpacing: 0 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 14 },
  modalSheet: { width: '100%', maxWidth: 680, height: '82%', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 12 },
  modalTitle: { fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: 0 },
  modalBody: { fontSize: 13, lineHeight: 19, marginTop: 2, letterSpacing: 0 },
  optionList: { paddingHorizontal: 14, paddingBottom: 24 },
  customCard: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 12 },
  customLabel: { fontSize: 13, lineHeight: 18, fontWeight: '800', letterSpacing: 0 },
  customRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  customInput: { flex: 1, minWidth: 0, height: 46, borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, fontSize: 14, letterSpacing: 0 },
  customButton: { width: 46, height: 46, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  emptyOptions: { fontSize: 14, lineHeight: 21, textAlign: 'center', padding: 24, letterSpacing: 0 },
  option: { minHeight: 88, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' },
  sourceTag: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, marginRight: 10 },
  sourceText: { fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 0 },
  optionText: { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: '600', paddingRight: 10, letterSpacing: 0 },
});
