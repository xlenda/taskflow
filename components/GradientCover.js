import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ui/theme';
import { gradientPair, alpha } from '../utils/colors';
import { usePersonalVisual } from '../utils/usePersonalVisual';

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
  visualKey,
  testID,
  imageTransition = 280,
  onVisualReady,
  onVisualError,
}) {
  const t = useTheme();
  const [a, b] = gradientPair(t, accent);
  const personalVisualUri = usePersonalVisual(visualKey);
  // O 3º stop era branco a 28% e derrubava o contraste do texto branco por cima
  // para 1,06:1 — o título e a duração da visão sumiam no sol (auditoria WCAG,
  // 10/08). Agora o gradiente fecha na própria cor de destaque, mantendo o ar
  // sonhador com texto legível.
  return (
    <LinearGradient
      testID={testID}
      colors={[alpha(a, 0.95 * intensity), alpha(b, 0.82 * intensity), alpha(b, 0.62 * intensity)]}
      start={{ x: 0.05, y: 0 }}
      end={{ x: 0.95, y: 1 }}
      style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
    >
      {personalVisualUri ? (
        <Image
          source={{ uri: personalVisualUri }}
          contentFit="cover"
          transition={imageTransition}
          onLoad={onVisualReady}
          onError={onVisualError}
          accessible={false}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: personalVisualUri
                ? 'rgba(5,12,22,0.34)'
                : 'rgba(20,30,50,0.22)',
            },
          ]}
        />
        {personalVisualUri ? (
          <LinearGradient
            colors={[
              'rgba(4,10,18,0.10)',
              'rgba(4,10,18,0.56)',
              'rgba(4,10,18,0.30)',
            ]}
            locations={[0, 0.52, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
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
