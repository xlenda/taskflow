import React, { forwardRef, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { APP_NAME, APP_URL, SERIF } from '../constants/brand';
import { acquirePersonalVisual } from '../services/personalVisualStorage';
import { useTheme } from '../ui/theme';
import { alpha, gradientPair } from '../utils/colors';

export const SHARE_CARD_ASPECT_RATIO = 9 / 16;
export const SHARE_CARD_LAYOUT_SIZE = Object.freeze({ width: 360, height: 640 });

// véu de legibilidade (o texto é branco): um escuro uniforme e um degradê vertical, com ou sem imagem (a imagem que
// falhou deixa o gradiente da marca, claro demais em vários temas). Medido nas 42 cenas prontas e no gradiente de
// cada tema por scripts/contraste-cartao-compartilhar.js: todo texto do cartão passa de 4,5:1 nos 10% mais claros
export const SHARE_CARD_VEIL = Object.freeze({
  image: 'rgba(5,12,22,0.34)',
  gradient: { colors: ['rgba(4,10,18,0.18)', 'rgba(4,10,18,0.56)', 'rgba(4,10,18,0.30)'], locations: [0, 0.52, 1] },
});

const GOLD = '#F2B25C';
// o arco do Traço Celeste (CelestialTrace: 46,112 · centro,45 · direita,112) em miniatura, numa caixa de 46×22
const TRACE = [{ x: 5, y: 16 }, { x: 23, y: 5 }, { x: 41, y: 16 }];

// a frase sempre cabe: a maior fonte em que ela cabe nas linhas acima da assinatura (420 px de altura × 295 px de
// largura nos 640 do cartão), e as linhas travam nisso — passou até da menor, reticências; nunca invade o Traço
// Celeste nem o link. Cabe = linhas × letras por linha, com o itálico serifado a ~0,64 da fonte por letra e 85% da
// linha aproveitada (quebra de palavras): conservador de propósito — no cartão real (E2E) 165 letras a 30 px não
// cabiam nas 10 linhas
const PHRASE_BOX = { width: 295, height: 420 };
const PHRASE_TIERS = [
  { fontSize: 38, lineHeight: 50 },
  { fontSize: 30, lineHeight: 40 },
  { fontSize: 23, lineHeight: 32 },
  { fontSize: 17, lineHeight: 24 },
  { fontSize: 14, lineHeight: 20 },
];
const linesIn = (tier) => Math.floor(PHRASE_BOX.height / tier.lineHeight);
const capacity = (tier) => linesIn(tier) * (PHRASE_BOX.width / (0.64 * tier.fontSize)) * 0.85;
const phraseFit = (length) => {
  const tier = PHRASE_TIERS.find((candidate) => capacity(candidate) >= length) || PHRASE_TIERS[PHRASE_TIERS.length - 1];
  return { style: { fontSize: tier.fontSize, lineHeight: tier.lineHeight }, lines: linesIn(tier) };
};

// imagem do cartão: a pessoal (visualKey) ou, sem ela, a cena pronta das respostas — a mesma do vídeo; sem as duas,
// o gradiente da marca. Enquanto a pessoal abre, nenhuma: a captura não pode sair com a cena pronta por engano. É
// também a imagem parada das capas com readyScene (GradientCover): a cena sem WebView
export function useCardImage(visualKey, readyScene) {
  const [personal, setPersonal] = useState(null); // { key, uri } da última busca
  useEffect(() => {
    if (!visualKey) return undefined;
    let alive = true;
    let release = null;
    acquirePersonalVisual(visualKey)
      .catch(() => null)
      .then((resource) => {
        if (!alive) {
          if (resource) resource.release();
          return;
        }
        release = resource ? resource.release : null;
        setPersonal({ key: visualKey, uri: resource ? resource.uri : null });
      });
    return () => {
      alive = false;
      if (release) release();
    };
  }, [visualKey]);
  if (visualKey && (!personal || personal.key !== visualKey)) return null;
  if (visualKey && personal.uri) return { uri: personal.uri };
  return readyScene ? readyScene.source : null;
}

/**
 * Cartão 9:16 pronto para prévia e captura (1080×1920): a imagem, o rótulo do conteúdo, a frase curta e a
 * assinatura (Traço Celeste + Celeste + link). Contrato estreito: só o que a pessoa conferiu na prévia vai no
 * arquivo. Os sufixos dos testIDs vêm do cartão de afirmação (a tela de Afirmações depende deles).
 */
const ShareCard = forwardRef(function ShareCard(
  {
    phrase,
    kindLabel,
    accent = 0,
    visualKey,
    readyScene,
    style,
    testID = 'share-card',
    onLayout,
    onVisualReady,
    onVisualError,
  },
  ref
) {
  const theme = useTheme();
  const [a, b] = gradientPair(theme, accent);
  const source = useCardImage(visualKey, readyScene);
  const text = String(phrase || '').trim();
  const fit = phraseFit(text.length + 2); // + as aspas

  return (
    <ViewShot ref={ref} onLayout={onLayout} style={[styles.frame, style]}>
      <LinearGradient
        testID={testID}
        colors={[alpha(a, 0.95), alpha(b, 0.82), alpha(b, 0.62)]}
        start={{ x: 0.05, y: 0 }}
        end={{ x: 0.95, y: 1 }}
        style={styles.cover}
      >
        {source ? (
          <Image
            source={source}
            contentFit="cover"
            transition={0}
            onLoad={onVisualReady}
            onError={onVisualError}
            accessible={false}
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.veil]} />
        <LinearGradient
          pointerEvents="none"
          colors={SHARE_CARD_VEIL.gradient.colors}
          locations={SHARE_CARD_VEIL.gradient.locations}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <View pointerEvents="none" style={styles.safeArea}>
          <View style={styles.center}>
            <Text maxFontSizeMultiplier={1} testID={`${testID}-category`} style={styles.kind}>
              {String(kindLabel || '').trim().toUpperCase()}
            </Text>
            <Text
              maxFontSizeMultiplier={1}
              numberOfLines={fit.lines}
              ellipsizeMode="tail"
              testID={`${testID}-affirmation`}
              style={[styles.phrase, fit.style]}
            >
              {`“${text}”`}
            </Text>
          </View>

          <View testID={`${testID}-signature`} style={styles.footer}>
            <View style={styles.signatureRow}>
              <View style={styles.mark}>
                {[0, 1].map((i) => {
                  const from = TRACE[i];
                  const to = TRACE[i + 1];
                  const width = Math.hypot(to.x - from.x, to.y - from.y);
                  return (
                    <View
                      key={`line-${i}`}
                      style={[
                        styles.markLine,
                        {
                          left: (from.x + to.x) / 2 - width / 2,
                          top: (from.y + to.y) / 2 - 0.6,
                          width,
                          transform: [{ rotate: `${Math.atan2(to.y - from.y, to.x - from.x)}rad` }],
                        },
                      ]}
                    />
                  );
                })}
                {TRACE.map((point, i) => (
                  <Ionicons
                    key={`star-${i}`}
                    name="star"
                    size={10}
                    color={GOLD}
                    style={[styles.markStar, { left: point.x - 5, top: point.y - 5 }]}
                  />
                ))}
              </View>
              <Text maxFontSizeMultiplier={1} testID={`${testID}-brand`} style={styles.brand}>
                {APP_NAME}
              </Text>
            </View>
            <Text maxFontSizeMultiplier={1} testID={`${testID}-url`} style={styles.url}>
              {APP_URL}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </ViewShot>
  );
});

export default ShareCard;

const styles = StyleSheet.create({
  frame: {
    width: SHARE_CARD_LAYOUT_SIZE.width,
    height: SHARE_CARD_LAYOUT_SIZE.height,
    overflow: 'hidden',
    backgroundColor: '#759ACE',
  },
  cover: { flex: 1 },
  veil: { backgroundColor: SHARE_CARD_VEIL.image },
  safeArea: {
    flex: 1,
    paddingHorizontal: '9%',
    paddingTop: '12%',
    paddingBottom: '8%',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: '7%',
  },
  // rótulo e link brancos inteiros (texto de 11 px: a 86% ficavam abaixo de 4,5:1 nas cenas de céu claro)
  kind: {
    minHeight: 18,
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 24,
    textShadowColor: 'rgba(0,0,0,0.42)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  phrase: {
    width: '100%',
    color: '#FFFFFF',
    fontFamily: SERIF,
    fontStyle: 'italic',
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.56)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  footer: { alignItems: 'center' },
  signatureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  mark: { width: 46, height: 22, marginRight: 9 },
  markLine: {
    position: 'absolute',
    height: 1.2,
    borderRadius: 1,
    backgroundColor: 'rgba(242,178,92,0.85)',
  },
  markStar: { position: 'absolute', width: 10, height: 10, lineHeight: 10, textAlign: 'center' },
  brand: {
    color: '#FFF9F0',
    fontFamily: SERIF,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.38)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  url: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.35,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.42)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
