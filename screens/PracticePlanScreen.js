import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';

import { Button, Card, EmptyState, Header, Screen } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { useT } from '../utils/useT';
import { personalAffirmationsForState } from '../utils/personalAffirmations';
import { personalJourneyItemsForState } from '../utils/personalJourney';
import {
  MAX_PRACTICE_SLOTS,
  adjustPracticeSlotTime,
  appendSuggestedPracticeSlot,
  mergePracticeSlotsWithTimes,
  normalizePracticePlan,
  suggestPracticeSlots,
} from '../utils/practicePlan';
import {
  cancelPracticePlanReminders,
  reconcilePracticePlanReminders,
  schedulePracticePlanReminders,
} from '../services/practicePlanReminders';

const WAKE_OPTIONS = ['06:00', '07:00', '08:00', '09:00'];
const SLEEP_OPTIONS = ['21:30', '22:30', '23:30', '00:30'];
const WEEKDAYS = [
  { id: 1, pt: 'S', en: 'M' },
  { id: 2, pt: 'T', en: 'T' },
  { id: 3, pt: 'Q', en: 'W' },
  { id: 4, pt: 'Q', en: 'T' },
  { id: 5, pt: 'S', en: 'F' },
  { id: 6, pt: 'S', en: 'S' },
  { id: 7, pt: 'D', en: 'S' },
];

const S = {
  eyebrow: { pt: 'Compromisso gentil', en: 'Gentle commitment' },
  title: { pt: 'Plano Celeste', en: 'Celeste Plan' },
  subtitle: {
    pt: 'Escolha sua visão, sua afirmação e até quatro momentos do dia.',
    en: 'Choose your vision, affirmation, and up to four moments in your day.',
  },
  privacy: {
    pt: 'Sua visão e sua afirmação ficam visíveis na prática. Você lê a afirmação duas vezes; áudio e transcrição não são salvos. A tela bloqueada mostra só um lembrete discreto.',
    en: 'Your vision and affirmation remain visible during practice. You read the affirmation twice; audio and transcript are not stored. The lock screen only shows a discreet reminder.',
  },
  noContentTitle: { pt: 'Crie sua primeira visão', en: 'Create your first vision' },
  noContentBody: {
    pt: 'O plano usa somente visões e afirmações criadas a partir das suas respostas.',
    en: 'The plan only uses visions and affirmations created from your answers.',
  },
  backHome: { pt: 'Voltar para o início', en: 'Go to Home' },
  affirmation: { pt: 'Afirmação do plano', en: 'Plan affirmation' },
  vision: { pt: 'Visão do plano', en: 'Plan vision' },
  wake: { pt: 'Eu acordo por volta de', en: 'I wake around' },
  sleep: { pt: 'Eu durmo por volta de', en: 'I sleep around' },
  suggest: { pt: 'Sugerir os melhores horários', en: 'Suggest the best times' },
  moments: { pt: 'Momentos do dia', en: 'Moments in the day' },
  days: { pt: 'Dias da semana', en: 'Days of the week' },
  addMoment: { pt: 'Adicionar momento', en: 'Add a moment' },
  activate: { pt: 'Ativar meu plano', en: 'Activate my plan' },
  update: { pt: 'Salvar novos horários', en: 'Save new times' },
  deactivate: { pt: 'Desativar lembretes', en: 'Turn reminders off' },
  tryNow: { pt: 'Testar a prática agora', en: 'Try the practice now' },
  active: { pt: 'Plano ativo', en: 'Plan active' },
  inactive: { pt: 'Plano ainda não ativado', en: 'Plan not active yet' },
  web: {
    pt: 'Você pode montar o plano aqui. Os lembretes do sistema são ativados no app instalado.',
    en: 'You can build the plan here. System reminders are activated in the installed app.',
  },
  permissionDenied: {
    pt: 'A permissão de notificações não foi concedida. O plano ficou salvo, mas não foi ativado.',
    en: 'Notification permission was not granted. The plan was saved but not activated.',
  },
  saveFailed: {
    pt: 'Não foi possível atualizar os lembretes. Os horários anteriores foram preservados.',
    en: 'Reminders could not be updated. Your previous times were preserved.',
  },
  cancelFailed: {
    pt: 'Não foi possível desligar todos os lembretes. Tente novamente.',
    en: 'Not all reminders could be turned off. Please try again.',
  },
  saved: { pt: 'Plano salvo no aparelho.', en: 'Plan saved on this device.' },
};

const compact = (value, max = 150) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function choiceTitle(item, fallback) {
  return compact(item?.text || item?.title || item?.sourceTitle, 120) || fallback;
}

function ChoiceList({ items, selectedId, onSelect, theme, emptyLabel }) {
  if (!items.length) {
    return <Text style={[styles.helper, { color: theme.textMuted }]}>{emptyLabel}</Text>;
  }
  return (
    <View style={styles.choiceList}>
      {items.map((item, index) => {
        const selected = item.id === selectedId;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onSelect(item.id)}
            style={({ pressed }) => [
              styles.choice,
              {
                borderColor: selected ? theme.accent : theme.border,
                backgroundColor: selected ? theme.accentSoft : theme.surfaceAlt,
                opacity: pressed ? 0.75 : 1,
              },
            ]}
          >
            <View style={[styles.choiceDot, { borderColor: selected ? theme.accent : theme.textMuted }]}>
              {selected ? <View style={[styles.choiceDotFill, { backgroundColor: theme.accent }]} /> : null}
            </View>
            <Text numberOfLines={2} style={[styles.choiceText, { color: theme.text }]}>
              {choiceTitle(item, `#${index + 1}`)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TimeChoices({ title, values, selected, onSelect, theme }) {
  return (
    <View style={styles.timeChoiceGroup}>
      <Text style={[styles.label, { color: theme.text }]}>{title}</Text>
      <View style={styles.chips}>
        {values.map((value) => {
          const active = value === selected;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(value)}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: active ? theme.accent : theme.surfaceAlt,
                  borderColor: active ? theme.accent : theme.border,
                  opacity: pressed ? 0.72 : 1,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? '#FFFFFF' : theme.text }]}>{value}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function PracticePlanScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { t, lang } = useT();
  const { state, savePracticePlan } = useApp();
  const affirmations = useMemo(() => personalAffirmationsForState(state), [state]);
  const visions = useMemo(
    () => personalJourneyItemsForState(state, 'vision', lang),
    [lang, state]
  );
  const options = useMemo(() => ({ affirmations, visions }), [affirmations, visions]);
  const stored = useMemo(
    () => normalizePracticePlan(state?.practicePlan, options),
    [options, state?.practicePlan]
  );
  const [draft, setDraft] = useState(stored);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (isFocused && !busy) setDraft(stored);
  }, [busy, isFocused, stored]);

  useEffect(() => {
    if (!isFocused || Platform.OS === 'web' || !stored.enabled) return undefined;
    let alive = true;
    reconcilePracticePlanReminders(stored.notificationIdsBySlot).then(async (result) => {
      if (!alive || !result?.ok) return;
      const missing = Array.isArray(result.missingIdentifiers) && result.missingIdentifiers.length > 0;
      if (missing || result.permission !== 'granted') {
        // Uma grade parcialmente perdida não deve continuar disparando apenas
        // alguns horários. Tenta retirar toda a família do Plano, incluindo
        // adiamentos; se isso falhar, mantém o plano como ativo/erro para que a
        // ação de desativar continue visível e possa ser tentada novamente.
        const cancelled = await cancelPracticePlanReminders();
        if (!alive) return;
        savePracticePlan(cancelled.ok
          ? {
              ...stored,
              enabled: false,
              permission: result.permission || 'unknown',
              syncError: true,
              notificationIdsBySlot: {},
            }
          : {
              ...stored,
              enabled: true,
              permission: result.permission || 'unknown',
              syncError: true,
              notificationIdsBySlot: result.identifiersBySlot || stored.notificationIdsBySlot,
            });
      }
    });
    return () => { alive = false; };
  }, [isFocused, savePracticePlan, stored]);

  const setAllSlots = useCallback((field, value) => {
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => ({ ...slot, [field]: value })),
    }));
  }, []);

  const updateSlot = useCallback((slotId, patch) => {
    setDraft((current) => ({
      ...current,
      slots: current.slots.map((slot) => slot.id === slotId ? { ...slot, ...patch } : slot),
    }));
  }, []);

  const suggest = useCallback(() => {
    setDraft((current) => ({
      ...current,
      slots: mergePracticeSlotsWithTimes(
        current.slots,
        suggestPracticeSlots(current.wakeTime, current.sleepTime, current.slots.length || 3),
        options
      ),
    }));
    setFeedback(null);
  }, [options]);

  const addSlot = useCallback(() => {
    setDraft((current) => {
      if (current.slots.length >= MAX_PRACTICE_SLOTS) return current;
      return {
        ...current,
        slots: appendSuggestedPracticeSlot(current.slots, current, options),
      };
    });
  }, [options]);

  const removeSlot = useCallback((slotId) => {
    setDraft((current) => current.slots.length <= 1
      ? current
      : { ...current, slots: current.slots.filter((slot) => slot.id !== slotId) });
  }, []);

  const toggleWeekday = useCallback((weekday) => {
    setDraft((current) => {
      const exists = current.weekdays.includes(weekday);
      if (exists && current.weekdays.length === 1) return current;
      const weekdays = exists
        ? current.weekdays.filter((day) => day !== weekday)
        : [...current.weekdays, weekday].sort((a, b) => a - b);
      return { ...current, weekdays };
    });
  }, []);

  const activate = useCallback(async () => {
    const candidate = normalizePracticePlan({ ...draft, enabled: true }, options);
    if (!candidate.enabled) {
      setFeedback('failed');
      return;
    }
    setBusy(true);
    setFeedback(null);
    const result = await schedulePracticePlanReminders({
      slots: candidate.slots.map((slot) => ({ ...slot, weekdays: candidate.weekdays })),
      previousIdentifiersBySlot: stored.notificationIdsBySlot,
      lang,
      requestPermission: true,
    });
    if (result.ok) {
      savePracticePlan({
        ...candidate,
        enabled: true,
        permission: result.permission,
        syncError: false,
        notificationIdsBySlot: result.identifiersBySlot,
      });
      setFeedback('saved');
    } else if (!stored.enabled) {
      savePracticePlan({
        ...candidate,
        enabled: false,
        permission: result.permission || (Platform.OS === 'web' ? 'unsupported' : 'unknown'),
        syncError: false,
        notificationIdsBySlot: {},
      });
      setFeedback(result.error === 'permission_denied' ? 'permission' : Platform.OS === 'web' ? 'web' : 'failed');
    } else {
      savePracticePlan({ ...stored, syncError: true });
      setFeedback('failed');
    }
    setBusy(false);
  }, [draft, lang, options, savePracticePlan, stored]);

  const deactivate = useCallback(async () => {
    setBusy(true);
    setFeedback(null);
    // Desativar também remove qualquer lembrete único criado por “Adiar 10
    // min”, cujo identificador não faz parte da grade recorrente persistida.
    const result = await cancelPracticePlanReminders();
    if (result.ok) {
      savePracticePlan({
        ...draft,
        enabled: false,
        notificationIdsBySlot: {},
        permission: Platform.OS === 'web' ? 'unsupported' : stored.permission,
        syncError: false,
      });
      setFeedback('saved');
    } else {
      setFeedback('cancelFailed');
    }
    setBusy(false);
  }, [draft, savePracticePlan, stored]);

  const firstEnabledSlot = draft.slots.find((slot) => slot.enabled) || null;
  const selectionSlot = firstEnabledSlot || draft.slots[0] || null;
  if (!affirmations.length || !visions.length) {
    return (
      <Screen testID="practice-plan-screen">
        <Header eyebrow={t(S.eyebrow)} title={t(S.title)} subtitle={t(S.subtitle)} />
        <EmptyState
          icon="images-outline"
          title={t(S.noContentTitle)}
          body={t(S.noContentBody)}
          actionLabel={t(S.backHome)}
          onAction={() => navigation.navigate('Main')}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="practice-plan-screen">
      <Header eyebrow={t(S.eyebrow)} title={t(S.title)} subtitle={t(S.subtitle)} />

      <Card style={{ backgroundColor: theme.surfaceAlt }}>
        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed-outline" size={19} color={theme.accent} />
          <Text style={[styles.privacyText, { color: theme.textMuted }]}>{t(S.privacy)}</Text>
        </View>
      </Card>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(S.affirmation)}</Text>
      <ChoiceList
        items={affirmations}
        selectedId={selectionSlot?.affirmationId}
        onSelect={(id) => setAllSlots('affirmationId', id)}
        theme={theme}
        emptyLabel={t(S.noContentBody)}
      />

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(S.vision)}</Text>
      <ChoiceList
        items={visions}
        selectedId={selectionSlot?.visionId}
        onSelect={(id) => setAllSlots('visionId', id)}
        theme={theme}
        emptyLabel={t(S.noContentBody)}
      />

      <Card>
        <TimeChoices
          title={t(S.wake)}
          values={WAKE_OPTIONS}
          selected={draft.wakeTime}
          onSelect={(wakeTime) => setDraft((current) => ({ ...current, wakeTime }))}
          theme={theme}
        />
        <TimeChoices
          title={t(S.sleep)}
          values={SLEEP_OPTIONS}
          selected={draft.sleepTime}
          onSelect={(sleepTime) => setDraft((current) => ({ ...current, sleepTime }))}
          theme={theme}
        />
        <Button variant="soft" icon="sparkles-outline" label={t(S.suggest)} onPress={suggest} />
      </Card>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(S.moments)}</Text>
      {draft.slots.map((slot, index) => (
        <Card key={slot.id} testID={`practice-slot-${slot.id}`}>
          <View style={styles.slotRow}>
            <Switch
              value={slot.enabled}
              onValueChange={(enabled) => updateSlot(slot.id, { enabled })}
              accessibilityLabel={`${t(S.moments)} ${index + 1}`}
              trackColor={{ false: theme.surfaceAlt, true: theme.accentSoft }}
              thumbColor={slot.enabled ? theme.accent : '#FFFFFF'}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${slot.time} - 30`}
              onPress={() => updateSlot(slot.id, {
                time: adjustPracticeSlotTime(slot.time, 'earlier', draft),
              })}
              style={[styles.timeAdjust, { backgroundColor: theme.surfaceAlt }]}
            >
              <Ionicons name="remove" size={19} color={theme.text} />
            </Pressable>
            <Text style={[styles.slotTime, { color: theme.text }]}>{slot.time}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${slot.time} + 30`}
              onPress={() => updateSlot(slot.id, {
                time: adjustPracticeSlotTime(slot.time, 'later', draft),
              })}
              style={[styles.timeAdjust, { backgroundColor: theme.surfaceAlt }]}
            >
              <Ionicons name="add" size={19} color={theme.text} />
            </Pressable>
            {draft.slots.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remover horário"
                onPress={() => removeSlot(slot.id)}
                style={styles.removeSlot}
              >
                <Ionicons name="trash-outline" size={19} color={theme.warning} />
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}
      {draft.slots.length < MAX_PRACTICE_SLOTS ? (
        <Button variant="ghost" icon="add" label={t(S.addMoment)} onPress={addSlot} />
      ) : null}

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(S.days)}</Text>
      <View style={styles.weekdays}>
        {WEEKDAYS.map((day) => {
          const active = draft.weekdays.includes(day.id);
          return (
            <Pressable
              key={day.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              onPress={() => toggleWeekday(day.id)}
              style={[
                styles.weekday,
                {
                  backgroundColor: active ? theme.accent : theme.surfaceAlt,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}
            >
              <Text style={[styles.weekdayText, { color: active ? '#FFFFFF' : theme.text }]}>
                {lang === 'en' ? day.en : day.pt}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ marginTop: 18 }}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: stored.enabled ? theme.success : theme.textMuted }]} />
          <Text style={[styles.statusText, { color: theme.text }]}>
            {stored.enabled ? t(S.active) : t(S.inactive)}
          </Text>
        </View>
        {Platform.OS === 'web' ? (
          <Text style={[styles.helper, { color: theme.textMuted }]}>{t(S.web)}</Text>
        ) : null}
        <Button
          testID="activate-practice-plan"
          icon="notifications-outline"
          label={stored.enabled ? t(S.update) : t(S.activate)}
          onPress={activate}
          loading={busy}
          disabled={!draft.slots.some((slot) => slot.enabled)}
        />
        {stored.enabled ? (
          <Button
            variant="ghost"
            icon="notifications-off-outline"
            label={t(S.deactivate)}
            onPress={deactivate}
            disabled={busy}
          />
        ) : null}
        {firstEnabledSlot ? (
          <Button
            testID="try-practice-plan-now"
            variant="soft"
            icon="mic-outline"
            label={t(S.tryNow)}
            onPress={() => navigation.navigate('PracticeRitual', { slotId: firstEnabledSlot.id })}
            disabled={busy}
          />
        ) : null}
        {feedback ? (
          <Text
            accessibilityRole={feedback === 'saved' ? undefined : 'alert'}
            style={[
              styles.feedback,
              { color: feedback === 'saved' ? theme.success : theme.warning },
            ]}
          >
            {feedback === 'saved'
              ? t(S.saved)
              : feedback === 'permission'
              ? t(S.permissionDenied)
              : feedback === 'web'
              ? t(S.web)
              : feedback === 'cancelFailed'
              ? t(S.cancelFailed)
              : t(S.saveFailed)}
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  privacyRow: { flexDirection: 'row', alignItems: 'center' },
  privacyText: { flex: 1, marginLeft: 10, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  sectionTitle: { marginTop: 20, marginBottom: 9, fontSize: 18, lineHeight: 24, fontWeight: '800' },
  helper: { marginTop: 7, fontSize: 12.5, lineHeight: 18 },
  choiceList: { marginBottom: 4 },
  choice: { minHeight: 58, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  choiceDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  choiceDotFill: { width: 10, height: 10, borderRadius: 5 },
  choiceText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '650' },
  timeChoiceGroup: { marginBottom: 14 },
  label: { marginBottom: 8, fontSize: 13, lineHeight: 18, fontWeight: '750' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  chip: { minWidth: 66, alignItems: 'center', borderWidth: 1, borderRadius: 18, paddingVertical: 8, paddingHorizontal: 11, margin: 4 },
  chipText: { fontSize: 12.5, lineHeight: 17, fontWeight: '800' },
  slotRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeAdjust: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  slotTime: { minWidth: 62, textAlign: 'center', fontSize: 19, lineHeight: 25, fontWeight: '850' },
  removeSlot: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center' },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between' },
  weekday: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  weekdayText: { fontSize: 13, lineHeight: 18, fontWeight: '850' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  statusDot: { width: 9, height: 9, borderRadius: 5, marginRight: 8 },
  statusText: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  feedback: { marginTop: 8, textAlign: 'center', fontSize: 12.5, lineHeight: 18, fontWeight: '650' },
});
