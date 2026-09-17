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
import { personalVisionOptionsForState } from '../utils/personalJourney';
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
  { id: 1, pt: 'S', en: 'M', ptLabel: 'Segunda-feira', enLabel: 'Monday' },
  { id: 2, pt: 'T', en: 'T', ptLabel: 'Terça-feira', enLabel: 'Tuesday' },
  { id: 3, pt: 'Q', en: 'W', ptLabel: 'Quarta-feira', enLabel: 'Wednesday' },
  { id: 4, pt: 'Q', en: 'T', ptLabel: 'Quinta-feira', enLabel: 'Thursday' },
  { id: 5, pt: 'S', en: 'F', ptLabel: 'Sexta-feira', enLabel: 'Friday' },
  { id: 6, pt: 'S', en: 'S', ptLabel: 'Sábado', enLabel: 'Saturday' },
  { id: 7, pt: 'D', en: 'S', ptLabel: 'Domingo', enLabel: 'Sunday' },
];

const S = {
  eyebrow: { pt: 'Compromisso gentil', en: 'Gentle commitment' },
  title: { pt: 'Plano Celeste', en: 'Celeste Plan' },
  subtitle: {
    pt: 'Escolha sua visão ou Cena-Âncora, sua afirmação e até quatro momentos do dia.',
    en: 'Choose your vision or Anchor Scene, affirmation, and up to four moments in your day.',
  },
  privacy: {
    pt: 'Sua visão ou Cena-Âncora e sua afirmação ficam visíveis na prática. Você lê a afirmação duas vezes; áudio e transcrição não são salvos. A tela bloqueada mostra só um lembrete discreto.',
    en: 'Your vision or Anchor Scene and affirmation remain visible during practice. You read the affirmation twice; audio and transcript are not stored. The lock screen only shows a discreet reminder.',
  },
  noContentTitle: { pt: 'Crie seu primeiro conteúdo pessoal', en: 'Create your first personal content' },
  noContentBody: {
    pt: 'O plano usa somente sua Cena-Âncora, visões e afirmações criadas a partir das suas respostas.',
    en: 'The plan only uses your Anchor Scene, visions, and affirmations created from your answers.',
  },
  backHome: { pt: 'Voltar para o início', en: 'Go to Home' },
  affirmation: { pt: 'Afirmação do plano', en: 'Plan affirmation' },
  vision: { pt: 'Visão ou Cena-Âncora do plano', en: 'Plan vision or Anchor Scene' },
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
                borderWidth: selected ? 2 : 1,
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
            <Ionicons
              name={selected ? 'checkmark-circle' : 'chevron-forward'}
              size={20}
              color={selected ? theme.accent : theme.textMuted}
            />
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
    () => personalVisionOptionsForState(state, lang),
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

      <Card tone="alt" style={styles.privacyCard}>
        <View style={styles.privacyRow}>
          <View style={[styles.privacyIcon, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.accent} />
          </View>
          <Text style={[styles.privacyText, { color: theme.textMutedOnAlt || theme.textMuted }]}>{t(S.privacy)}</Text>
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

      <Card style={styles.scheduleCard}>
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
        <Button variant="soft" icon="sparkles-outline" label={t(S.suggest)} onPress={suggest} style={styles.actionButton} />
      </Card>

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(S.moments)}</Text>
      {draft.slots.map((slot, index) => (
        <Card
          key={slot.id}
          testID={`practice-slot-${slot.id}`}
          style={[
            styles.slotCard,
            slot.enabled ? { backgroundColor: theme.accentSoft, borderColor: theme.accent } : null,
          ]}
        >
          <View style={styles.slotRow}>
            <Switch
              value={slot.enabled}
              onValueChange={(enabled) => updateSlot(slot.id, { enabled })}
              accessibilityLabel={`${t(S.moments)} ${index + 1}`}
              hitSlop={{ top: 10, right: 4, bottom: 10, left: 4 }}
              trackColor={{ false: theme.surfaceAlt, true: theme.accentSoft }}
              thumbColor={slot.enabled ? theme.accent : '#FFFFFF'}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${slot.time} - 30`}
              onPress={() => updateSlot(slot.id, {
                time: adjustPracticeSlotTime(slot.time, 'earlier', draft),
              })}
              style={({ pressed }) => [
                styles.timeAdjust,
                { backgroundColor: theme.surface, opacity: pressed ? 0.72 : 1 },
              ]}
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
              style={({ pressed }) => [
                styles.timeAdjust,
                { backgroundColor: theme.surface, opacity: pressed ? 0.72 : 1 },
              ]}
            >
              <Ionicons name="add" size={19} color={theme.text} />
            </Pressable>
            {draft.slots.length > 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remover horário"
                onPress={() => removeSlot(slot.id)}
                style={({ pressed }) => [styles.removeSlot, { opacity: pressed ? 0.64 : 1 }]}
              >
                <Ionicons name="trash-outline" size={19} color={theme.warning} />
              </Pressable>
            ) : null}
          </View>
        </Card>
      ))}
      {draft.slots.length < MAX_PRACTICE_SLOTS ? (
        <Button variant="ghost" icon="add" label={t(S.addMoment)} onPress={addSlot} style={styles.actionButton} />
      ) : null}

      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(S.days)}</Text>
      <View style={styles.weekdays}>
        {WEEKDAYS.map((day) => {
          const active = draft.weekdays.includes(day.id);
          return (
            <Pressable
              key={day.id}
              accessibilityRole="checkbox"
              accessibilityLabel={lang === 'en' ? day.enLabel : day.ptLabel}
              accessibilityState={{ checked: active }}
              onPress={() => toggleWeekday(day.id)}
              style={({ pressed }) => [
                styles.weekday,
                {
                  backgroundColor: active ? theme.accent : theme.surfaceAlt,
                  borderColor: active ? theme.accent : theme.border,
                  opacity: pressed ? 0.72 : 1,
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

      <Card style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusIcon, { backgroundColor: stored.enabled ? `${theme.success}20` : theme.surfaceAlt }]}>
            <Ionicons
              name={stored.enabled ? 'checkmark-circle' : 'notifications-outline'}
              size={20}
              color={stored.enabled ? theme.success : theme.textMuted}
            />
          </View>
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
          style={styles.actionButton}
        />
        {stored.enabled ? (
          <Button
            variant="ghost"
            icon="notifications-off-outline"
            label={t(S.deactivate)}
            onPress={deactivate}
            disabled={busy}
            style={styles.actionButton}
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
            style={styles.actionButton}
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
  privacyCard: { borderRadius: 20, paddingVertical: 18 },
  privacyRow: { flexDirection: 'row', alignItems: 'flex-start' },
  privacyIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  privacyText: { flex: 1, marginLeft: 12, fontSize: 13, lineHeight: 20, fontWeight: '600' },
  sectionTitle: { marginTop: 28, marginBottom: 12, fontSize: 19, lineHeight: 25, fontWeight: '850', letterSpacing: -0.2 },
  helper: { marginTop: 8, fontSize: 13, lineHeight: 19 },
  choiceList: { marginBottom: 2 },
  choice: { minHeight: 64, flexDirection: 'row', alignItems: 'center', borderRadius: 18, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 10 },
  choiceDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  choiceDotFill: { width: 10, height: 10, borderRadius: 5 },
  choiceText: { flex: 1, marginRight: 10, fontSize: 14, lineHeight: 20, fontWeight: '650' },
  scheduleCard: { borderRadius: 22, paddingVertical: 20 },
  timeChoiceGroup: { marginBottom: 18 },
  label: { marginBottom: 10, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  chip: { minWidth: 72, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 24, paddingHorizontal: 14, margin: 4 },
  chipText: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  slotCard: { borderRadius: 18, paddingVertical: 12 },
  slotRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeAdjust: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  slotTime: { minWidth: 52, textAlign: 'center', fontSize: 19, lineHeight: 25, fontWeight: '850', fontVariant: ['tabular-nums'] },
  removeSlot: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginHorizontal: -4 },
  weekday: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center', margin: 4 },
  weekdayText: { fontSize: 13, lineHeight: 18, fontWeight: '850' },
  statusCard: { marginTop: 22, borderRadius: 22, paddingVertical: 18 },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statusIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  statusText: { flex: 1, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  actionButton: { minHeight: 48 },
  feedback: { marginTop: 10, textAlign: 'center', fontSize: 13, lineHeight: 19, fontWeight: '650' },
});
