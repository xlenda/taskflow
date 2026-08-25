import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Screen, Header, Card, pct } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { useT } from '../utils/useT';
import { accentAt, alpha } from '../utils/colors';
import { lastNDays, todayISO, streakFrom, formatTime } from '../utils/date';
import { audioDur } from '../utils/audioBank';
import { confirmAsync } from '../utils/confirm';
import { APP_NAME } from '../constants/brand';
import {
  cancelAffirmationAlarm,
  getAffirmationAlarmCapability,
} from '../services/affirmationAlarm';

import WeekChart from '../components/WeekChart';
import SectionHeading from '../components/SectionHeading';
import GradientCover from '../components/GradientCover';
import PrimaryButton from '../components/PrimaryButton';

// Dicionário local da tela (o portão scripts/i18n-parity.js exige en + pt).
const S = {
  title: { en: 'Journey', pt: 'Jornada' },
  subtitle: {
    en: "{name}'s manifestation practice",
    pt: 'A prática de manifestação de {name}',
  },

  heroLabel: { en: '30 DAY CONSISTENCY', pt: 'CONSTÂNCIA DE 30 DIAS' },
  daysLoggedOne: { en: '1 day with a practice logged', pt: '1 dia com prática registrada' },
  daysLoggedMany: { en: '{n} days with a practice logged', pt: '{n} dias com prática registrada' },
  longestFocus: { en: 'longest focus: {title}', pt: 'foco mais longo: {title}' },

  statStreak: { en: 'Day streak', pt: 'Dias seguidos' },
  statPractices: { en: 'Practices', pt: 'Práticas' },
  // O dado é a duração das narrações concluídas, não o tempo que a pessoa
  // realmente ouviu (dá para concluir uma visão sem tocar o áudio).
  statListened: { en: 'Narration time', pt: 'Tempo de narração' },
  statManifested: { en: 'Cycles complete', pt: 'Ciclos concluídos' },

  thisWeek: { en: 'This week', pt: 'Esta semana' },
  perDay: { en: 'Practices completed per day', pt: 'Práticas concluídas por dia' },
  // A mesma definição que alimenta o streak, a constância, o gráfico e os tiles
  // — escrita na tela para o número nunca parecer arbitrário.
  practiceCounts: {
    en: 'A practice is a manifestation session, a vision heard to the end or an affirmation received.',
    pt: 'Prática é uma sessão de manifestação, uma visão ouvida até o fim ou uma afirmação recebida.',
  },

  activeManifestations: { en: 'Active manifestations', pt: 'Manifestações ativas' },
  noManifestations: {
    en: 'No active manifestations yet. Start one and it shows up right here.',
    pt: 'Nenhuma manifestação ativa por enquanto. Comece uma e ela aparece aqui.',
  },
  ofDaysOne: { en: '{n} of 1 day', pt: '{n} de 1 dia' },
  ofDaysMany: { en: '{n} of {goal} days', pt: '{n} de {goal} dias' },
  practisedToday: { en: 'practised today', pt: 'praticado hoje' },
  notPractisedToday: { en: 'not practised today', pt: 'ainda não praticado hoje' },

  traces: { en: 'Traces of change', pt: 'Rastros de mudança' },
  tracesEmpty: {
    en: 'Your honest observations will appear here whenever you choose to record one.',
    pt: 'Suas observações honestas aparecem aqui quando você escolher registrar uma.',
  },
  editTrace: { en: 'Edit this trace', pt: 'Editar este rastro' },
  deleteTrace: { en: 'Delete this trace', pt: 'Excluir este rastro' },
  deleteTraceTitle: { en: 'Delete this trace?', pt: 'Excluir este rastro?' },
  deleteTraceBody: {
    en: 'This private observation will be permanently removed.',
    pt: 'Esta observação privada será removida de forma permanente.',
  },
  deleteTraceConfirm: { en: 'Delete', pt: 'Excluir' },
  saveTrace: { en: 'Save trace', pt: 'Salvar rastro' },

  milestones: { en: 'Milestones', pt: 'Marcos' },
  msFirst: { en: 'First manifestation set', pt: 'Primeira manifestação criada' },
  msStreak: { en: '7 day streak', pt: '7 dias seguidos' },
  msPractices: { en: '25 guided practices', pt: '25 práticas guiadas' },
  msCycle: { en: 'Complete a 21-day cycle', pt: 'Completar um ciclo de 21 dias' },

  yourSpace: { en: 'Your space', pt: 'Seu espaço' },
  profileSettings: { en: 'Profile and settings', pt: 'Perfil e configurações' },
  profileSettingsBody: {
    en: 'Name, language, appearance, Gemini and privacy',
    pt: 'Nome, idioma, aparência, Gemini e privacidade',
  },
  community: { en: 'Community', pt: 'Comunidade' },
  communityBody: {
    en: 'Real stories, reviewed before they appear',
    pt: 'Relatos reais, analisados antes de aparecer',
  },

  resetCta: { en: 'Reset my journey', pt: 'Recomeçar minha jornada' },
  resetTitle: { en: 'Reset your journey?', pt: 'Recomeçar sua jornada?' },
  // A conta real do que some — nada de aviso genérico.
  resetMessage: {
    en: 'Your {n} manifestations, {r} private traces and {m} days of practice will be gone, and you redo the questionnaire. Your language stays. There is no way back.',
    pt: 'Suas {n} manifestações, {r} Rastros privados e seus {m} dias de prática somem, e você refaz o questionário. O idioma fica. Isso não tem volta.',
  },
  resetConfirm: { en: 'Reset', pt: 'Recomeçar' },
  resetStoppingAlarm: { en: 'Resetting...', pt: 'Recomeçando...' },
  resetAlarmFailed: {
    en: 'The alarm could not be turned off. Open My alarm and try again before resetting.',
    pt: 'Não foi possível desligar o despertador. Abra Meu despertador e tente novamente antes de recomeçar.',
  },
  resetStorageFailed: {
    en: 'The device is still confirming the reset. Keep Celeste open and try again.',
    pt: 'O aparelho ainda está confirmando o recomeço. Mantenha o Celeste aberto e tente novamente.',
  },
  cancel: { en: 'Cancel', pt: 'Cancelar' },

  backupTitle: { en: 'Backup', pt: 'Cópia de segurança' },
  backupNote: {
    en: 'Your saved practice is stored in this browser. Download a copy to keep your own backup.',
    pt: 'Sua prática salva fica neste navegador. Baixe uma cópia para manter seu próprio backup.',
  },
  saveCopy: { en: 'Save a copy', pt: 'Salvar uma cópia' },
  restoreCopy: { en: 'Restore from a file', pt: 'Restaurar de um arquivo' },
  restoreTitle: { en: 'Restore this copy?', pt: 'Restaurar esta cópia?' },
  restoreMessage: {
    en: 'This replaces your current practice with the one in the file. There is no way back.',
    pt: 'Isso troca sua prática atual pela do arquivo. Isso não tem volta.',
  },
  restoreConfirm: { en: 'Restore', pt: 'Restaurar' },
  restoreFail: {
    en: 'That file is not a valid {app} copy.',
    pt: 'Esse arquivo não é uma cópia válida do {app}.',
  },
  restoreStorageFail: {
    en: 'The device has not confirmed the restore yet. Keep Celeste open and try again.',
    pt: 'O aparelho ainda não confirmou a restauração. Mantenha o Celeste aberto e tente novamente.',
  },

  footer: {
    en: '{app} · saved locally; Gemini is used only when you allow it',
    pt: '{app} · salvo localmente; o Gemini só é usado com sua permissão',
  },
};

// Chave canônica em inglês do dia da semana — o WeekChart traduz pelo dicionário
// dele. Local de propósito: utils/date.weekdayLetter é usado por outra tela.
const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayKey = (iso) => WEEKDAY_KEYS[new Date(`${iso}T00:00:00`).getDay()];
const traceDate = (iso, lang) => {
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-US', {
      day: '2-digit',
      month: 'short',
    }).format(date);
  } catch (e) {
    return '';
  }
};

export default function JourneyScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const { t, lang } = useT();
  // setMood/exportStateJson/importStateJson vêm do contrato novo do AppContext.
  const {
    state,
    loading,
    derived,
    resetAll,
    updateEvidence,
    removeEvidence,
    exportStateJson,
    importStateJson,
  } = useApp();

  const [backupErro, setBackupErro] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState(null);
  const [editingTrace, setEditingTrace] = useState(null);
  const [traceDraft, setTraceDraft] = useState('');

  // UMA definição de prática para a tela inteira: sessão de manifestação, visão
  // ouvida até o fim ou afirmação recebida. Antes o gráfico contava as visões e
  // o streak não — quem só ouvia visões via "0 dias com prática" logo acima de
  // barras cheias e de "Práticas: 5". Tudo aqui embaixo bebe deste mesmo poço.
  const practice = useMemo(() => {
    if (!state) return { byDay: {}, days: [], total: 0, listenedSec: 0 };
    const byDay = {};
    const add = (iso) => {
      if (!iso) return;
      byDay[iso] = (byDay[iso] || 0) + 1;
    };
    state.manifestations.forEach((m) => m.sessions.forEach(add));
    state.visionPlays.forEach((p) => add(p && p.date));
    state.affirmationDates.forEach(add);
    const days = Object.keys(byDay);
    // Tempo real de escuta: duração do MP3 de cada visão concluída. Id sem
    // áudio soma zero — nada de estimativa.
    const listenedSec = state.visionPlays.reduce(
      (sum, p) => sum + (audioDur(p && p.visionId, lang) || 0),
      0
    );
    return {
      byDay,
      days,
      total: days.reduce((n, d) => n + byDay[d], 0),
      listenedSec,
    };
  }, [state, lang]);

  const chartData = useMemo(
    () => lastNDays(7).map((iso) => ({ label: weekdayKey(iso), value: practice.byDay[iso] || 0 })),
    [practice]
  );

  const traces = useMemo(() => {
    if (!state) return [];
    return state.manifestations
      .flatMap((m) =>
        (Array.isArray(m.evidence) ? m.evidence : []).map((entry) => ({
          ...entry,
          manifestationId: m.id,
          manifestationTitle: m.title,
          accent: m.accent,
        }))
      )
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [state]);

  const activeManifestations = useMemo(
    () => (state ? state.manifestations.filter((m) => m.sessions.length < m.goalDays) : []),
    [state]
  );

  if (loading || !state) {
    return (
      <Screen>
        <Header title={t(S.title)} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </Screen>
    );
  }

  const totalPractices = practice.total;
  const active = state.manifestations.length;
  const completed = derived.completed;
  const last30 = new Set(lastNDays(30));
  const daysLogged = practice.days.filter((d) => last30.has(d)).length;
  const consistency = pct(daysLogged, 30);
  const streak = streakFrom(practice.days);
  const longestFocus = state.manifestations.reduce(
    (best, m) => (!best || m.sessions.length > best.sessions.length ? m : best),
    null
  );

  const milestones = [
    { icon: 'sparkles', key: 'first', label: S.msFirst, target: 1, current: active },
    { icon: 'flame', key: 'streak', label: S.msStreak, target: 7, current: streak },
    { icon: 'headset', key: 'practices', label: S.msPractices, target: 25, current: totalPractices },
    { icon: 'trophy', key: 'cycle', label: S.msCycle, target: 1, current: completed },
  ];

  // O tile de tempo só existe quando há escuta com duração conhecida. Antes era
  // "práticas × 3" — número inventado. Sem áudio ouvido, o tile some.
  const stats = [
    { icon: 'flame', key: 'streak', label: S.statStreak, value: `${streak}`, accent: 2 },
    { icon: 'headset', key: 'practices', label: S.statPractices, value: `${totalPractices}`, accent: 0 },
    ...(practice.listenedSec > 0
      ? [
          {
            icon: 'time',
            key: 'listened',
            label: S.statListened,
            value: formatTime(practice.listenedSec),
            accent: 3,
          },
        ]
      : []),
    { icon: 'trophy', key: 'manifested', label: S.statManifested, value: `${completed}`, accent: 4 },
  ];

  const confirmReset = async () => {
    if (resetBusy) return;
    setResetError(null);
    const ok = await confirmAsync({
      title: t(S.resetTitle),
      // A conta real: N manifestações e M dias de prática (a mesma definição
      // de prática do resto da tela).
      message: t(S.resetMessage, {
        n: state.manifestations.length,
        r: traces.length,
        m: practice.days.length,
      }),
      confirmLabel: t(S.resetConfirm),
      cancelLabel: t(S.cancel),
    });
    if (!ok) return;
    setResetBusy(true);
    try {
      const alarmCapability = await getAffirmationAlarmCapability().catch(() => null);
      if (Platform.OS === 'ios' && !alarmCapability) {
        setResetError('alarm');
        return;
      }
      if (
        Platform.OS === 'ios' &&
        (alarmCapability?.supported === true || alarmCapability?.nativeModuleAvailable === true)
      ) {
        const cancelled = await cancelAffirmationAlarm();
        if (!cancelled.ok) {
          setResetError('alarm');
          return;
        }
      }
      const reset = await resetAll();
      if (!reset) {
        setResetError('storage');
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    } finally {
      setResetBusy(false);
    }
  };

  // Web-only de propósito: no export estático a prática vive no navegador.
  // Blob + clique DENTRO do gesto é o que o navegador aceita para baixar.
  const saveBackup = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    try {
      const blob = new Blob([exportStateJson()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${APP_NAME.toLowerCase()}-${todayISO()}.json`;
      // Firefox antigo só dispara o download com o anchor no documento.
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {}
  };

  const restoreBackup = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    setBackupErro(false);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        // Confirma ANTES de aplicar: restaurar apaga a prática atual.
        const ok = await confirmAsync({
          title: t(S.restoreTitle),
          message: t(S.restoreMessage),
          confirmLabel: t(S.restoreConfirm),
          cancelLabel: t(S.cancel),
        });
        if (!ok) return;
        const r = await importStateJson(String(reader.result || ''));
        if (r && r.ok) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else {
          setBackupErro(r && r.erro === 'storage_unavailable' ? 'storage' : 'invalid');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const saveTraceEdit = () => {
    if (!editingTrace || !traceDraft.trim()) return;
    const ok = updateEvidence(editingTrace.manifestationId, editingTrace.id, traceDraft);
    if (!ok) return;
    setEditingTrace(null);
    setTraceDraft('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const confirmDeleteTrace = async (entry) => {
    const ok = await confirmAsync({
      title: t(S.deleteTraceTitle),
      message: t(S.deleteTraceBody),
      confirmLabel: t(S.deleteTraceConfirm),
      cancelLabel: t(S.cancel),
      destructive: true,
    });
    if (!ok) return;
    removeEvidence(entry.manifestationId, entry.id);
    if (editingTrace && editingTrace.id === entry.id) {
      setEditingTrace(null);
      setTraceDraft('');
    }
  };

  return (
    <Screen scroll={false} testID="journey-screen">
      <Header title={t(S.title)} subtitle={t(S.subtitle, { name: state.name })} />
      <ScrollView
        testID="journey-scroll"
        style={styles.scrollView}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Card
          testID="journey-open-community"
          onPress={() => navigation.navigate('Community')}
          accessibilityRole="button"
          accessibilityLabel={t(S.community)}
          accessibilityHint={t(S.communityBody)}
          style={[styles.communityAccess, { backgroundColor: theme.surface }]}
        >
          <View style={[styles.spaceIcon, { backgroundColor: alpha(accentAt(theme, 2), 0.14) }]}>
            <Ionicons name="people-outline" size={20} color={accentAt(theme, 2)} />
          </View>
          <View style={styles.spaceCopy}>
            <Text style={[styles.spaceTitle, { color: theme.text }]}>{t(S.community)}</Text>
            <Text style={[styles.spaceBody, { color: theme.textMuted }]}>{t(S.communityBody)}</Text>
          </View>
          <Ionicons name="chevron-forward" size={19} color={theme.textMuted} />
        </Card>

        <GradientCover accent={4} radius={22} style={styles.hero}>
          <Text style={styles.heroLabel}>{t(S.heroLabel)}</Text>
          <Text style={styles.heroValue}>{consistency}%</Text>
          <Text style={styles.heroSub}>
            {t(daysLogged === 1 ? S.daysLoggedOne : S.daysLoggedMany, { n: daysLogged })}
            {' · '}
            {t(S.longestFocus, { title: longestFocus?.title || '—' })}
          </Text>
        </GradientCover>

        <View style={styles.statGrid}>
          {stats.map((s) => (
            <Card
              key={s.key}
              style={[styles.statTile, { backgroundColor: theme.surface }]}
            >
              <View style={[styles.statIcon, { backgroundColor: alpha(accentAt(theme, s.accent), 0.15) }]}>
                <Ionicons name={s.icon} size={18} color={accentAt(theme, s.accent)} />
              </View>
              <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{t(s.label)}</Text>
            </Card>
          ))}
        </View>

        <SectionHeading title={t(S.yourSpace)} />
        <Card style={[styles.spaceCard, { backgroundColor: theme.surface }]}>
          <TouchableOpacity
            testID="journey-open-profile"
            activeOpacity={0.76}
            accessibilityRole="button"
            accessibilityLabel={t(S.profileSettings)}
            onPress={() => navigation.navigate('Profile')}
            style={styles.spaceRow}
          >
            <View style={[styles.spaceIcon, { backgroundColor: alpha(accentAt(theme, 1), 0.14) }]}>
              <Ionicons name="person-outline" size={20} color={accentAt(theme, 1)} />
            </View>
            <View style={styles.spaceCopy}>
              <Text style={[styles.spaceTitle, { color: theme.text }]}>{t(S.profileSettings)}</Text>
              <Text style={[styles.spaceBody, { color: theme.textMuted }]}>{t(S.profileSettingsBody)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={19} color={theme.textMuted} />
          </TouchableOpacity>
        </Card>

        <SectionHeading title={t(S.traces)} />
        {traces.length === 0 ? (
          <Card style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t(S.tracesEmpty)}</Text>
          </Card>
        ) : (
          <Card style={[styles.card, { backgroundColor: theme.surface }]}>
            {traces.map((entry, index) => {
              const activeEdit = editingTrace && editingTrace.id === entry.id;
              const c = accentAt(theme, entry.accent);
              return (
                <View
                  key={entry.id}
                  style={[styles.traceItem, index > 0 && [styles.traceDivider, { borderTopColor: theme.border }]]}
                >
                  <View style={styles.traceHead}>
                    <View style={[styles.traceMark, { backgroundColor: alpha(c, 0.14) }]}>
                      <Ionicons name="reader-outline" size={16} color={c} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={1} style={[styles.traceTitle, { color: theme.text }]}>
                        {entry.manifestationTitle}
                      </Text>
                      <Text style={[styles.traceDate, { color: theme.textMuted }]}>
                        {traceDate(entry.createdAt, lang)}
                      </Text>
                    </View>
                    {!activeEdit ? (
                      <View style={styles.traceActions}>
                        <TouchableOpacity
                          onPress={() => {
                            setEditingTrace(entry);
                            setTraceDraft(entry.text);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t(S.editTrace)}
                          style={styles.traceAction}
                        >
                          <Ionicons name="pencil-outline" size={17} color={theme.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => confirmDeleteTrace(entry)}
                          accessibilityRole="button"
                          accessibilityLabel={t(S.deleteTrace)}
                          style={styles.traceAction}
                        >
                          <Ionicons name="trash-outline" size={17} color={theme.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                  {activeEdit ? (
                    <>
                      <TextInput
                        value={traceDraft}
                        onChangeText={setTraceDraft}
                        multiline
                        autoFocus
                        maxLength={280}
                        style={[
                          styles.traceInput,
                          { color: theme.text, borderColor: theme.border, backgroundColor: alpha(theme.textMuted, 0.06) },
                        ]}
                      />
                      <View style={styles.traceEditActions}>
                        <PrimaryButton
                          label={t(S.cancel)}
                          variant="ghost"
                          onPress={() => {
                            setEditingTrace(null);
                            setTraceDraft('');
                          }}
                          style={{ flex: 1, marginRight: 8 }}
                        />
                        <PrimaryButton
                          label={t(S.saveTrace)}
                          icon="checkmark"
                          disabled={!traceDraft.trim()}
                          onPress={saveTraceEdit}
                          style={{ flex: 1 }}
                        />
                      </View>
                    </>
                  ) : (
                    <Text style={[styles.traceText, { color: theme.textMuted }]}>{entry.text}</Text>
                  )}
                </View>
              );
            })}
          </Card>
        )}

        <SectionHeading title={t(S.thisWeek)} />
        <Card style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.cardSub, { color: theme.textMuted }]}>
            {t(S.perDay)}
          </Text>
          <WeekChart data={chartData} accent={0} />
          <Text style={[styles.legend, { color: theme.textMuted }]}>{t(S.practiceCounts)}</Text>
        </Card>

        <SectionHeading title={t(S.activeManifestations)} />
        {activeManifestations.length === 0 ? (
          <Card style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {t(S.noManifestations)}
            </Text>
          </Card>
        ) : null}
        {activeManifestations.map((m) => {
          const c = accentAt(theme, m.accent);
          const p = pct(m.sessions.length, m.goalDays);
          return (
            <Card
              key={m.id}
              // A Jornada mora numa aba irmã da Home: para abrir a manifestação
              // é preciso mirar a aba Manifest e a tela de dentro do stack dela.
              onPress={() =>
                navigation.navigate('Manifest', {
                  screen: 'Manifestation',
                  params: { id: m.id },
                })
              }
              style={[styles.progressRow, { backgroundColor: theme.surface }]}
            >
              <View style={styles.progressTop}>
                <Text numberOfLines={1} style={[styles.progressTitle, { color: theme.text }]}>
                  {m.title}
                </Text>
                <Text style={[styles.progressPct, { color: c }]}>{p}%</Text>
                <Ionicons
                  name="chevron-forward"
                  size={15}
                  color={theme.textMuted}
                  style={{ marginLeft: 6 }}
                />
              </View>
              <View style={[styles.track, { backgroundColor: alpha(c, 0.15) }]}>
                <View style={[styles.fill, { width: `${p}%`, backgroundColor: c }]} />
              </View>
              <Text style={[styles.progressSub, { color: theme.textMuted }]}>
                {t(m.goalDays === 1 ? S.ofDaysOne : S.ofDaysMany, {
                  n: m.sessions.length,
                  goal: m.goalDays,
                })}
                {' · '}
                {t(m.sessions.includes(todayISO()) ? S.practisedToday : S.notPractisedToday)}
              </Text>
            </Card>
          );
        })}

        <SectionHeading title={t(S.milestones)} />
        <Card style={[styles.card, { backgroundColor: theme.surface }]}>
          {milestones.map((ms, i) => {
            const reached = ms.current >= ms.target;
            const c = accentAt(theme, i + 1);
            return (
              <View
                key={ms.key}
                style={[
                  styles.msRow,
                  i < milestones.length - 1 && [styles.divider, { borderBottomColor: theme.border }],
                ]}
              >
                <View
                  style={[
                    styles.msIcon,
                    { backgroundColor: reached ? c : alpha(c, 0.14) },
                  ]}
                >
                  <Ionicons name={ms.icon} size={17} color={reached ? '#FFFFFF' : c} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.msLabel, { color: theme.text }]}>{t(ms.label)}</Text>
                  <Text style={[styles.msSub, { color: theme.textMuted }]}>
                    {Math.min(ms.current, ms.target)} / {ms.target}
                  </Text>
                </View>
                <Ionicons
                  name={reached ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={reached ? c : theme.textMuted}
                />
              </View>
            );
          })}
        </Card>

        {/* Só o "Recomeçar" (e a cópia de segurança) mora no fim da página. */}
        {Platform.OS === 'web' ? (
          <>
            <SectionHeading title={t(S.backupTitle)} />
            <Text style={[styles.backupNote, { color: theme.textMuted }]}>
              {t(S.backupNote)}
            </Text>
            <PrimaryButton
              label={t(S.saveCopy)}
              icon="download-outline"
              accent={0}
              variant="soft"
              onPress={saveBackup}
            />
            <PrimaryButton
              label={t(S.restoreCopy)}
              icon="folder-open-outline"
              accent={0}
              variant="ghost"
              onPress={restoreBackup}
              style={{ marginTop: 10 }}
            />
            {backupErro ? (
              <Text style={[styles.backupErro, { color: accentAt(theme, 1) }]}>
                {t(backupErro === 'storage' ? S.restoreStorageFail : S.restoreFail, { app: APP_NAME })}
              </Text>
            ) : null}
          </>
        ) : null}

        <PrimaryButton
          label={t(resetBusy ? S.resetStoppingAlarm : S.resetCta)}
          icon="refresh"
          accent={1}
          variant="ghost"
          onPress={confirmReset}
          disabled={resetBusy}
          style={{ marginTop: 24 }}
        />
        {resetError ? (
          <Text style={[styles.backupErro, { color: accentAt(theme, 1) }]}>
            {t(resetError === 'alarm' ? S.resetAlarmFailed : S.resetStorageFailed)}
          </Text>
        ) : null}
        <Text style={[styles.footer, { color: theme.textMuted }]}>
          {t(S.footer, { app: APP_NAME })}
        </Text>
        <View style={{ height: 28 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1, minHeight: 0 },
  scroll: { paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  communityAccess: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 4,
    marginBottom: 14,
  },
  hero: { padding: 22, marginTop: 4 },
  heroLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  heroValue: { color: '#FFFFFF', fontSize: 44, fontWeight: '800', marginTop: 6, letterSpacing: -1 },
  heroSub: { color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 19, marginTop: 6 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 16 },
  statTile: { width: '48%', borderRadius: 18, padding: 14, marginBottom: 12 },
  statIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 24, fontWeight: '800', marginTop: 10, letterSpacing: -0.5 },
  statLabel: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  card: { padding: 16, borderRadius: 18 },
  cardSub: { fontSize: 12.5, marginBottom: 14, fontWeight: '600' },
  legend: { fontSize: 11.5, lineHeight: 17, marginTop: 12 },
  emptyText: { fontSize: 13.5, lineHeight: 20 },
  progressRow: { padding: 14, borderRadius: 16, marginBottom: 10 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressTitle: { fontSize: 14.5, fontWeight: '700', flex: 1, marginRight: 10 },
  progressPct: { fontSize: 14, fontWeight: '800' },
  track: { height: 7, borderRadius: 4, overflow: 'hidden', marginTop: 10 },
  fill: { height: 7, borderRadius: 4 },
  progressSub: { fontSize: 12, marginTop: 8 },
  msRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  // Sem cor fixa: a cor vem de theme.border na hora de usar — o preto a 8%
  // sumia por completo nos climas escuros.
  divider: { borderBottomWidth: StyleSheet.hairlineWidth },
  msIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  msLabel: { fontSize: 14, fontWeight: '700' },
  msSub: { fontSize: 12, marginTop: 2 },
  spaceCard: { padding: 0, borderRadius: 8, overflow: 'hidden' },
  spaceRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  spaceIcon: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  spaceCopy: { flex: 1, minWidth: 0, marginHorizontal: 12 },
  spaceTitle: { fontSize: 14.5, lineHeight: 20, fontWeight: '800', letterSpacing: 0 },
  spaceBody: { fontSize: 12, lineHeight: 17, marginTop: 2, letterSpacing: 0 },
  traceItem: { paddingVertical: 4 },
  traceDivider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, marginTop: 12 },
  traceHead: { flexDirection: 'row', alignItems: 'center' },
  traceMark: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  traceTitle: { fontSize: 13.5, fontWeight: '700' },
  traceDate: { fontSize: 11.5, marginTop: 2 },
  traceActions: { flexDirection: 'row', marginLeft: 6 },
  traceAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  traceText: { fontSize: 14, lineHeight: 21, marginTop: 9 },
  traceInput: {
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
    textAlignVertical: 'top',
  },
  traceEditActions: { flexDirection: 'row', marginTop: 8 },
  backupNote: { fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  backupErro: { fontSize: 12.5, fontWeight: '600', marginTop: 10 },
  footer: { fontSize: 11.5, textAlign: 'center', marginTop: 18 },
});
