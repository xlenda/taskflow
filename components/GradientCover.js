import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ui/theme';
import { gradientPair, alpha } from '../utils/colors';
import { useCenaVivaImage } from '../utils/useCenaVivaImage';
import { usePersonalVisual } from '../utils/usePersonalVisual';
import CenaViva from './cenaViva/CenaViva';
import NarratedScene from './NarratedScene';

/**
 * Soft dream-like gradient block used as the visual "photo" for visions
 * and manifestations. Fully theme aware.
 *
 * live: a cena viva no lugar da imagem parada — a pessoal, ou a cena pronta de
 * `sceneCategory` para quem ainda não tem. Só o card em foco recebe live (no app
 * cada cena é uma WebView). Sem frase na cena: o texto do card continua sendo o
 * único texto, com o véu por cima. Qualquer erro da cena = a imagem parada até o
 * card sair.
 *
 * narration { text, progress, active }: a voz tocando — a cena com as palavras
 * surgindo, por cima do véu (ele escureceria a legenda), no lugar da cena do
 * card. Quem chama esconde o próprio texto dessa fala enquanto ela toca.
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
  decorative = false,
  live = false,
  sceneCategory,
  narration,
}) {
  const t = useTheme();
  const [a, b] = gradientPair(t, accent);
  const personalVisualUri = usePersonalVisual(visualKey);
  const [liveFailed, setLiveFailed] = useState(false);
  // a narração sempre mostra a cena: se ela falhar, o próprio CenaViva deixa as palavras em texto
  const wantsScene = (live && !liveFailed) || !!narration;
  const sceneUri = useCenaVivaImage({ visualKey, category: sceneCategory, enabled: wantsScene });
  const scene = wantsScene ? sceneUri : null;
  const imaged = !!personalVisualUri || !!scene;
  // O 3º stop era branco a 28% e derrubava o contraste do texto branco por cima
  // para 1,06:1 — o título e a duração da visão sumiam no sol (auditoria WCAG,
  // 10/08). Agora o gradiente fecha na própria cor de destaque, mantendo o ar
  // sonhador com texto legível.
  return (
    <LinearGradient
      testID={testID}
      aria-hidden={decorative ? true : undefined}
      accessible={decorative ? false : undefined}
      accessibilityElementsHidden={decorative || undefined}
      importantForAccessibility={decorative ? 'no-hide-descendants' : undefined}
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
      {scene && !narration ? (
        <CenaViva imageUri={scene} style={styles.scene} onError={() => setLiveFailed(true)} />
      ) : null}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: imaged
                ? 'rgba(5,12,22,0.34)'
                : 'rgba(20,30,50,0.22)',
            },
          ]}
        />
        {imaged ? (
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
      {scene && narration ? (
        <NarratedScene
          imageUri={scene}
          text={narration.text}
          progress={narration.progress}
          active={narration.active}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
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
  // cobre o card inteiro: largura e altura explícitas vencem o 4:5 próprio do CenaViva; transparente até pintar
  // (por baixo continua a imagem parada ou o gradiente)
  scene: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'transparent' },
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
