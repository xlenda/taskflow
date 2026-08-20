import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../ui/theme';
import { useT } from '../utils/useT';
import { accentAt, alpha } from '../utils/colors';

// Dicionário local do componente (o portão scripts/i18n-parity.js exige en + pt).
const S = {
  empty: { en: 'Nothing here yet.', pt: 'Ainda não há nada aqui.' },
  noneThisWeek: {
    en: 'No practice logged this week yet. The first one already raises the bars.',
    pt: 'Nenhuma prática registrada nesta semana ainda. A primeira já levanta as barras.',
  },
  // Dias da semana. A tela envia a chave canônica em inglês (Mon, Tue, ...) e o
  // gráfico traduz aqui — assim qualquer tela que use o WeekChart vem traduzida.
  days: {
    sun: { en: 'Sun', pt: 'Dom' },
    mon: { en: 'Mon', pt: 'Seg' },
    tue: { en: 'Tue', pt: 'Ter' },
    wed: { en: 'Wed', pt: 'Qua' },
    thu: { en: 'Thu', pt: 'Qui' },
    fri: { en: 'Fri', pt: 'Sex' },
    sat: { en: 'Sat', pt: 'Sáb' },
  },
  // A altura da barra só existe para quem enxerga — o leitor de tela recebe o
  // número por extenso.
  barNone: { en: '{day}: no practice', pt: '{day}: nenhuma prática' },
  barOne: { en: '{day}: 1 practice', pt: '{day}: 1 prática' },
  barMany: { en: '{day}: {n} practices', pt: '{day}: {n} práticas' },
};

/**
 * Simple, safe bar chart: data = [{ label, value }]
 * Never divides by zero. Weekday labels ('Mon' / 'Monday') are translated;
 * anything else is rendered as received.
 */
export default function WeekChart({ data = [], height = 108, accent = 0 }) {
  const theme = useTheme();
  const { t } = useT();
  const color = accentAt(theme, accent);
  const max = data.reduce((m, d) => Math.max(m, d.value || 0), 0);

  const dayLabel = (raw) => {
    const key = String(raw || '').slice(0, 3).toLowerCase();
    return S.days[key] ? t(S.days[key]) : String(raw || '');
  };

  const barLabel = (raw, v) => {
    const day = dayLabel(raw);
    if (!v) return t(S.barNone, { day });
    return v === 1 ? t(S.barOne, { day }) : t(S.barMany, { day, n: v });
  };

  if (data.length === 0) {
    return <Text style={[styles.empty, { color: theme.textMuted }]}>{t(S.empty)}</Text>;
  }

  return (
    <View>
      <View style={[styles.row, { height }]}>
        {data.map((d, i) => {
          const ratio = max > 0 ? (d.value || 0) / max : 0;
          const barH = Math.max(6, Math.round(ratio * (height - 24)));
          const barColor = d.value > 0 ? accentAt(theme, accent + (i % 3)) : alpha(color, 0.18);
          return (
            <View
              key={`${d.label}-${i}`}
              style={styles.col}
              // Sem papel, o react-native-web emite aria-label numa div
              // genérica e o leitor de tela ignora — o rótulo precisa de role.
              accessibilityRole="text"
              accessibilityLabel={barLabel(d.label, d.value || 0)}
            >
              <Text style={[styles.value, { color: theme.textMuted }]}>{d.value > 0 ? d.value : ''}</Text>
              <View style={[styles.bar, { height: barH, backgroundColor: barColor }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.labels}>
        {data.map((d, i) => (
          <View key={`l-${i}`} style={styles.col}>
            <Text style={[styles.label, { color: theme.textMuted }]}>{dayLabel(d.label)}</Text>
          </View>
        ))}
      </View>
      {max === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>{t(S.noneThisWeek)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  col: { flex: 1, alignItems: 'center' },
  bar: { width: 18, borderRadius: 9 },
  value: { fontSize: 10.5, marginBottom: 4, fontWeight: '600' },
  labels: { flexDirection: 'row', marginTop: 8 },
  label: { fontSize: 11, fontWeight: '600' },
  empty: { fontSize: 12.5, lineHeight: 18, marginTop: 12 },
});
