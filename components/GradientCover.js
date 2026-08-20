import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ui/theme';
import { gradientPair, alpha } from '../utils/colors';

/**
 * Soft dream-like gradient block used as the visual "photo" for visions
 * and manifestations. Fully theme aware.
 */
export default function GradientCover({
  accent = 0,
  icon,
  radius = 18,
  style,
  children,
  intensity = 1,
}) {
  const t = useTheme();
  const [a, b] = gradientPair(t, accent);
  // O 3º stop era branco a 28% e derrubava o contraste do texto branco por cima
  // para 1,06:1 — o título e a duração da visão sumiam no sol (auditoria WCAG,
  // 10/08). Agora o gradiente fecha na própria cor de destaque, mantendo o ar
  // sonhador com texto legível.
  return (
    <LinearGradient
      colors={[alpha(a, 0.95 * intensity), alpha(b, 0.82 * intensity), alpha(b, 0.62 * intensity)]}
      start={{ x: 0.05, y: 0 }}
      end={{ x: 0.95, y: 1 }}
      style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
    >
      <View style={styles.glowWrap} pointerEvents="none">
        <View style={[styles.glow, { backgroundColor: alpha('#FFFFFF', 0.22) }]} />
        <View style={[styles.glowSmall, { backgroundColor: alpha(b, 0.5) }]} />
        {/* Véu escuro por baixo do conteúdo: garante o texto branco legível em
            qualquer accent, inclusive nos claros (dourado, coral). */}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(20,30,50,0.22)' }]} />
      </View>
      {icon ? (
        // Selo puramente decorativo: fica fora do leitor de tela para não ler o glifo.
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.iconWrap, { backgroundColor: alpha('#FFFFFF', 0.28) }]}
        >
          <Ionicons name={icon} size={16} color="#FFFFFF" />
        </View>
      ) : null}
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  glowWrap: { ...StyleSheet.absoluteFillObject },
  glow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -60,
    right: -50,
    opacity: 0.6,
  },
  glowSmall: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    bottom: -50,
    left: -30,
    opacity: 0.5,
  },
  iconWrap: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
