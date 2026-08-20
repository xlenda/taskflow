import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Screen, Header, Card, pct } from '../ui/kit';
import { useTheme, useSetTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { useT } from '../utils/useT';
import { accentAt, alpha } from '../utils/colors';
import { lastNDays, todayISO, streakFrom, formatTime } from '../utils/date';
import { audioDur } from '../utils/audioBank';
import { confirmAsync } from '../utils/confirm';
import { APP_NAME } from '../constants/brand';

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
  statManifested: { en: 'Manifested', pt: 'Manifestadas' },

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

  milestones: { en: 'Milestones', pt: 'Marcos' },
  msFirst: { en: 'First manifestation set', pt: 'Primeira manifestação criada' },
  msStreak: { en: '7 day streak', pt: '7 dias seguidos' },
  msPractices: { en: '25 guided practices', pt: '25 práticas guiadas' },
  msCycle: { en: 'Complete a 21-day cycle', pt: 'Completar um ciclo de 21 dias' },

  profile: { en: 'Your profile', pt: 'Seu perfil' },
  save: { en: 'Save', pt: 'Salvar' },
  edit: { en: 'Edit', pt: 'Editar' },

  mood: { en: 'Mood of the app', pt: 'Clima do app' },
  themeBlossom: { en: 'Blossom', pt: 'Florada' },
  themePaper: { en: 'Paper', pt: 'Papel' },
  themeCloud: { en: 'Cloud', pt: 'Nuvem' },
  themeViolet: { en: 'Midnight rose', pt: 'Rosa de meia-noite' },

  resetCta: { en: 'Reset my journey', pt: 'Recomeçar minha jornada' },
  resetTitle: { en: 'Reset your journey?', pt: 'Recomeçar sua jornada?' },
  resetMessage: {
    en: 'This restores {app} to its starting state.',
    pt: 'Isso devolve o {app} ao estado inicial.',
  },
  resetConfirm: { en: 'Reset', pt: 'Recomeçar' },
  cancel: { en: 'Cancel', pt: 'Cancelar' },

  footer: {
    en: '{app} · your practice is stored privately on this device',
    pt: '{app} · sua prática fica guardada só neste aparelho',
  },
};

const THEMES = [
  { key: 'blossom', label: S.themeBlossom },
  { key: 'paper', label: S.themePaper },
  { key: 'cloud', label: S.themeCloud },
  { key: 'violet', label: S.themeViolet },
];

// Chave canônica em inglês do dia da semana — o WeekChart traduz pelo dicionário
// dele. Local de propósito: utils/date.weekdayLetter é usado por outra tela.
const WEEKDAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const weekdayKey = (iso) => WEEKDAY_KEYS[new Date(`${iso}T00:00:00`).getDay()];

export default function JourneyScreen() {
  const theme = useTheme();
  const setTheme = useSetTheme();
  const navigation = useNavigation();
  const { t, lang } = useT();
  const { state, loading, derived, resetAll, setName } = useApp();
  const [nameDraft, setNameDraft] = useState('');
  const [editing, setEditing] = useState(false);

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
    state.visionPlays.forEach((p) => add(p.date));
    state.affirmationDates.forEach(add);
    const days = Object.keys(byDay);
    // Tempo real de escuta: duração do MP3 de cada visão concluída. Id sem
    // áudio soma zero — nada de estimativa.
    const listenedSec = state.visionPlays.reduce(
      (sum, p) => sum + (audioDur(p.visionId, lang) || 0),
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

  const saveName = () => {
    const v = nameDraft.trim();
    if (!v) {
      setEditing(false);
      return;
    }
    setName(v);
    setNameDraft('');
    setEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const confirmReset = async () => {
    const ok = await confirmAsync({
      title: t(S.resetTitle),
      message: t(S.resetMessage, { app: APP_NAME }),
      confirmLabel: t(S.resetConfirm),
      cancelLabel: t(S.cancel),
    });
    if (!ok) return;
    resetAll();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  };

  return (
    <Screen>
      <Header title={t(S.title)} subtitle={t(S.subtitle, { name: state.name })} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
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

        <SectionHeading title={t(S.thisWeek)} />
        <Card style={[styles.card, { backgroundColor: theme.surface }]}>
          <Text style={[styles.cardSub, { color: theme.textMuted }]}>
            {t(S.perDay)}
          </Text>
          <WeekChart data={chartData} accent={0} />
          <Text style={[styles.legend, { color: theme.textMuted }]}>{t(S.practiceCounts)}</Text>
        </Card>

        <SectionHeading title={t(S.activeManifestations)} />
        {state.manifestations.length === 0 ? (
          <Card style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>
              {t(S.noManifestations)}
            </Text>
          </Card>
        ) : null}
        {state.manifestations.map((m) => {
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

        <SectionHeading title={t(S.profile)} />
        <Card style={[styles.card, { backgroundColor: theme.surface }]}>
          <View style={styles.profileRow}>
            <View style={[styles.avatar, { backgroundColor: alpha(accentAt(theme, 1), 0.18) }]}>
              <Ionicons name="person" size={20} color={accentAt(theme, 1)} />
            </View>
            {editing ? (
              <TextInput
                value={nameDraft}
                onChangeText={setNameDraft}
                placeholder={state.name}
                placeholderTextColor={alpha(theme.text, 0.35)}
                autoFocus
                style={[
                  styles.nameInput,
                  { color: theme.text, borderColor: alpha(theme.textMuted, 0.3) },
                ]}
                onSubmitEditing={saveName}
                returnKeyType="done"
              />
            ) : (
              <Text style={[styles.name, { color: theme.text }]}>{state.name}</Text>
            )}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => (editing ? saveName() : setEditing(true))}
              style={[styles.editBtn, { backgroundColor: alpha(accentAt(theme, 0), 0.14) }]}
            >
              <Text style={[styles.editText, { color: accentAt(theme, 0) }]}>
                {editing ? t(S.save) : t(S.edit)}
              </Text>
            </TouchableOpacity>
          </View>
        </Card>

        <SectionHeading title={t(S.mood)} />
        <View style={styles.themeRow}>
          {THEMES.map((th, i) => {
            // theme.name é o clima realmente aplicado — sem isso os quatro chips
            // ficavam idênticos e ninguém sabia qual estava valendo.
            const on = theme.name === th.key;
            const c = accentAt(theme, i);
            const onText = theme.dark ? '#0B0E14' : '#FFFFFF';
            return (
              <TouchableOpacity
                key={th.key}
                activeOpacity={0.85}
                onPress={() => {
                  setTheme(th.key);
                  Haptics.selectionAsync().catch(() => {});
                }}
                accessibilityRole="button"
                accessibilityLabel={t(th.label)}
                accessibilityState={{ selected: on }}
                style={[
                  styles.themeChip,
                  {
                    backgroundColor: on ? c : alpha(c, 0.14),
                    borderColor: on ? c : alpha(c, 0.35),
                  },
                ]}
              >
                <Ionicons
                  name={on ? 'checkmark-circle' : 'color-palette-outline'}
                  size={14}
                  color={on ? onText : c}
                />
                <Text style={[styles.themeText, { color: on ? onText : c }]}>{t(th.label)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <PrimaryButton
          label={t(S.resetCta)}
          icon="refresh"
          accent={1}
          variant="ghost"
          onPress={confirmReset}
          style={{ marginTop: 24 }}
        />
        <Text style={[styles.footer, { color: theme.textMuted }]}>
          {t(S.footer, { app: APP_NAME })}
        </Text>
        <View style={{ height: 28 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, fontSize: 16, fontWeight: '700', marginLeft: 14 },
  nameInput: {
    flex: 1,
    marginLeft: 14,
    borderBottomWidth: 1,
    fontSize: 16,
    fontWeight: '700',
    paddingVertical: 6,
  },
  editBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, marginLeft: 10 },
  editText: { fontSize: 13, fontWeight: '700' },
  themeRow: { flexDirection: 'row', flexWrap: 'wrap' },
  themeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  themeText: { fontSize: 13, fontWeight: '700', marginLeft: 6 },
  footer: { fontSize: 11.5, textAlign: 'center', marginTop: 18 },
});
