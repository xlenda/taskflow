import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ui/theme';
import { pct } from '../ui/kit';
import GradientCover from './GradientCover';
import { categoryMeta } from '../constants/content';
import { accentAt, alpha } from '../utils/colors';
import { todayISO } from '../utils/date';
import { useT } from '../utils/useT';
import { txt } from '../constants/i18n';

const S = {
  dayOf: { en: 'day {d} of {n}', pt: 'dia {d} de {n}' },
  practised: { en: 'practised today', pt: 'praticada hoje' },
  notPractised: { en: 'not practised today', pt: 'ainda não praticada hoje' },
  markToday: { en: 'Mark today’s practice', pt: 'Marcar a prática de hoje' },
  undoToday: { en: 'Undo today’s practice', pt: 'Desfazer a prática de hoje' },
};

export default function ManifestCard({ item, onPress, onToggleToday }) {
  const th = useTheme();
  const { t, lang } = useT();
  // Categoria e acento vêm gravados na criação (o chip escolhido na Home):
  // é daqui que saem o ícone da capa, o rótulo e a cor do card.
  const meta = categoryMeta(item.category);
  const color = accentAt(th, item.accent);
  const done = item.sessions.length;
  const percent = pct(done, item.goalDays);
  const doneToday = item.sessions.includes(todayISO());

  const categoryLabel = meta.label ? txt(meta.label, lang) : item.category;
  const progressLabel = t(S.dayOf, { d: Math.min(done, item.goalDays), n: item.goalDays });
  const subtitle = `${categoryLabel} · ${progressLabel}`;
  // O título pode chegar como string (o normal) ou como {en, pt} vindo de um
  // template bilíngue — txt() resolve os dois casos.
  const title = txt(item.title, lang);

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}. ${
        doneToday ? t(S.practised) : t(S.notPractised)
      }`}
      style={[
        styles.card,
        {
          backgroundColor: th.surface,
          borderRadius: 18,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 3,
        },
      ]}
    >
      <GradientCover accent={item.accent} radius={14} style={styles.cover} icon={meta.icon} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text numberOfLines={1} style={[styles.title, { color: th.text }]}>
            {title}
          </Text>
          {/* Antes era um ícone morto com cara de checkbox. Agora é o controle
              de verdade da prática de hoje; sem handler, vira só status. */}
          {onToggleToday ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onToggleToday}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityState={{ selected: doneToday }}
              accessibilityLabel={doneToday ? t(S.undoToday) : t(S.markToday)}
              style={[
                styles.toggle,
                {
                  backgroundColor: doneToday ? alpha(color, 0.16) : alpha(th.textMuted, 0.1),
                },
              ]}
            >
              <Ionicons
                name={doneToday ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={doneToday ? color : th.textMuted}
              />
            </TouchableOpacity>
          ) : (
            <Ionicons
              name={doneToday ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={doneToday ? color : th.textMuted}
            />
          )}
        </View>
        <View style={styles.subRow}>
          <Ionicons name={meta.icon} size={12} color={color} style={styles.subIcon} />
          <Text numberOfLines={1} style={[styles.sub, { color: th.textMuted }]}>
            {subtitle}
          </Text>
        </View>
        <View style={[styles.track, { backgroundColor: alpha(color, 0.16) }]}>
          <View
            style={[styles.fill, { width: `${Math.min(100, percent)}%`, backgroundColor: color }]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
  },
  cover: { width: 62, height: 62 },
  body: { flex: 1, marginLeft: 14 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 15.5, fontWeight: '700', flex: 1, marginRight: 8 },
  toggle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, marginBottom: 10 },
  subIcon: { marginRight: 5 },
  sub: { fontSize: 12.5, flex: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
