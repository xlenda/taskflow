import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ui/theme';
import { gradientPair, alpha } from '../utils/colors';
import { usePersonalVisual } from '../utils/usePersonalVisual';
import CoverScene, { ReadySceneLabel } from './CoverScene';
import { useCardImage } from './ShareCard';

/**
 * Soft dream-like gradient block used as the visual "photo" for visions
 * and manifestations. Fully theme aware.
 *
 * live: a cena viva no lugar da imagem parada — a pessoal, ou a cena pronta de
 * `sceneCategory` (com o rótulo honesto) para quem ainda não tem. Só o card em
 * foco recebe live (no app cada cena é uma WebView); a camada viva (CoverScene)
 * só monta então, e só ela assina o estado do app. Sem frase na cena: o texto do
 * card continua sendo o único texto, com o véu por cima. Qualquer erro da cena =
 * a imagem parada enquanto o card mostrar a mesma imagem.
 *
 * readyScene (pickReadyScene): a imagem parada é a cena da capa mesmo para quem
 * ainda não tem a sua — a pessoal ou, sem ela, a cena pronta das respostas com o
 * rótulo honesto —, como imagem, sem WebView (a mesma do cartão do compartilhar).
 * Enquanto a pessoal abre, nenhuma: a pronta não pisca para quem tem a sua. Com a
 * cena viva montada (live/narration), a imagem parada segue por baixo até e
 * enquanto ela pinta; o rótulo passa a ser o da cena viva.
 *
 * narration { text, progress, active }: a voz tocando — a cena com as palavras
 * surgindo, por cima do véu (ele escureceria a legenda), no lugar da cena do
 * card; sem cena, as palavras em texto. Quem chama esconde o próprio texto dessa
 * fala enquanto ela toca.
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
  readyScene,
}) {
  const t = useTheme();
  const [a, b] = gradientPair(t, accent);
  const personalVisualUri = usePersonalVisual(readyScene ? null : visualKey);
  const sceneStill = useCardImage(readyScene ? visualKey : null, readyScene || null);
  // a cena pronta se reconhece pela identidade, nunca pelo formato: no site o asset empacotado é um objeto com uri
  const readyShown = !!readyScene && !!sceneStill && sceneStill === readyScene.source;
  const personalSource = readyScene
    ? readyShown
      ? null
      : sceneStill
    : personalVisualUri
      ? { uri: personalVisualUri }
      : null;
  // the failure belongs to one image: a reused cover (AffirmationsScreen swaps the affirmation on the same cover)
  // tries the live scene again for another personal image or another ready scene
  const sceneKey = `${visualKey || ''}|${sceneCategory || ''}`;
  const [failedScene, setFailedScene] = useState(null);
  const liveFailed = failedScene === sceneKey;
  // a voz tocando sempre leva a camada: as palavras aparecem mesmo depois de um erro da cena
  const wantsScene = (live && !liveFailed) || !!narration;
  // a imagem parada fica por baixo da camada viva: ela nasce transparente e só cobre quando pinta (no app, a WebView
  // inteira subindo) — sem a imagem, a troca piscava o gradiente
  const imaged = !!personalSource || readyShown;
  // O 3º stop era branco a 28% e derrubava o contraste do texto branco por cima
  // para 1,06:1 — o título e a duração da visão sumiam no sol (auditoria WCAG,
  // 10/08). Agora o gradiente fecha na própria cor de destaque, mantendo o ar
  // sonhador com texto legível. O mesmo véu vai por cima da cena viva.
  const veil = (imaged) => (
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
  );
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
      {imaged ? (
        <Image
          source={personalSource || readyScene.source}
          contentFit="cover"
          transition={imageTransition}
          onLoad={onVisualReady}
          onError={onVisualError}
          accessible={false}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
      {veil(imaged)}
      {wantsScene ? (
        <CoverScene
          visualKey={visualKey}
          sceneCategory={sceneCategory}
          narration={narration}
          veil={veil(true)}
          onFailed={() => setFailedScene(sceneKey)}
        />
      ) : null}
      {/* o rótulo da imagem parada só sem camada viva: com ela, o rótulo é o da viva (nunca dois) */}
      {readyShown && !wantsScene ? <ReadySceneLabel /> : null}
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
