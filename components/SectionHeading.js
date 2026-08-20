import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ui/theme';
import { useT } from '../utils/useT';
import { txt } from '../constants/i18n';

// title e actionLabel aceitam string já traduzida OU um objeto {en, pt} —
// txt() resolve os dois, então nenhuma tela precisa traduzir antes de passar.
export default function SectionHeading({ title, actionLabel, onAction, style }) {
  const th = useTheme();
  const { lang } = useT();
  const label = txt(title, lang);
  const action = txt(actionLabel, lang);

  return (
    <View style={[styles.row, style]}>
      <Text accessibilityRole="header" style={[styles.title, { color: th.text }]}>
        {label}
      </Text>
      {action && onAction ? (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={action}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: th.accent }]}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={th.accent} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 24,
  },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  action: { flexDirection: 'row', alignItems: 'center' },
  actionText: { fontSize: 13, fontWeight: '700', marginRight: 2 },
});
