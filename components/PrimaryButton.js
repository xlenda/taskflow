import React from 'react';
import { Text, StyleSheet, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ui/theme';
import { gradientPair, alpha, accentAt } from '../utils/colors';
import { useT } from '../utils/useT';
import { txt } from '../constants/i18n';

// label aceita string já traduzida OU um objeto {en, pt} — txt() resolve os dois.
export default function PrimaryButton({
  label,
  onPress,
  icon,
  accent = 0,
  variant = 'solid',
  style,
  disabled = false,
  accessibilityLabel,
}) {
  const th = useTheme();
  const { lang } = useT();
  const [a, b] = gradientPair(th, accent);
  const color = accentAt(th, accent);
  const text = txt(label, lang);
  const a11y = txt(accessibilityLabel, lang) || text;

  if (variant === 'soft' || variant === 'ghost') {
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={a11y}
        accessibilityState={{ disabled }}
        style={[
          styles.base,
          {
            backgroundColor: variant === 'soft' ? alpha(color, 0.14) : 'transparent',
            borderWidth: variant === 'ghost' ? 1 : 0,
            borderColor: alpha(color, 0.35),
            opacity: disabled ? 0.5 : 1,
          },
          style,
        ]}
      >
        <View style={styles.inner}>
          {icon ? <Ionicons name={icon} size={18} color={color} style={styles.icon} /> : null}
          <Text style={[styles.label, { color }]}>{text}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={[style, { opacity: disabled ? 0.6 : 1 }]}
    >
      <LinearGradient
        colors={[a, b]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.base}
      >
        <View style={styles.inner}>
          {icon ? <Ionicons name={icon} size={18} color="#FFFFFF" style={styles.icon} /> : null}
          <Text style={[styles.label, { color: '#FFFFFF' }]}>{text}</Text>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  inner: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: 8 },
  label: { fontSize: 15.5, fontWeight: '700' },
});
