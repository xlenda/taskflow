import React, { forwardRef, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';

import { APP_NAME, APP_URL, SERIF } from '../constants/brand';
import { useTheme } from '../ui/theme';
import { accentAt } from '../utils/colors';
import GradientCover from './GradientCover';

export const AFFIRMATION_SHARE_ASPECT_RATIO = 9 / 16;
export const AFFIRMATION_SHARE_LAYOUT_SIZE = Object.freeze({ width: 360, height: 640 });

const cleanText = (value) => String(value || '').trim();

const affirmationValue = (affirmation) =>
  cleanText(typeof affirmation === 'string' ? affirmation : affirmation && affirmation.text);

const typeForLength = (length) => {
  if (length > 260) return styles.affirmationCompact;
  if (length > 170) return styles.affirmationSmall;
  if (length > 95) return styles.affirmationMedium;
  return styles.affirmationLarge;
};

/**
 * Cartao vertical pronto para preview e captura. O contrato e propositalmente
 * estreito: exporta apenas a afirmacao que a pessoa conferiu, categoria,
 * marca e URL; nenhum outro campo do perfil e acrescentado ao arquivo.
 */
const AffirmationShareCard = forwardRef(function AffirmationShareCard(
  {
    affirmation,
    categoryLabel,
    accent = 0,
    visualKey,
    style,
    testID = 'affirmation-share-card',
    onLayout,
    onVisualReady,
    onVisualError,
  },
  ref
) {
  const theme = useTheme();
  const text = useMemo(() => affirmationValue(affirmation), [affirmation]);
  const category = cleanText(categoryLabel).toUpperCase();
  const color = accentAt(theme, accent);

  return (
    <ViewShot ref={ref} onLayout={onLayout} style={[styles.frame, style]}>
      <GradientCover
        testID={testID}
        visualKey={visualKey}
        accent={accent}
        radius={0}
        intensity={1}
        imageTransition={0}
        onVisualReady={onVisualReady}
        onVisualError={onVisualError}
        style={styles.cover}
      >
        <View pointerEvents="none" style={styles.safeArea}>
          <View style={styles.brandRow}>
            <View style={[styles.brandMark, { backgroundColor: color }]} />
            <Text maxFontSizeMultiplier={1} testID={`${testID}-brand`} style={styles.brand}>
              {APP_NAME}
            </Text>
          </View>

          <View style={styles.center}>
            <Text maxFontSizeMultiplier={1} testID={`${testID}-category`} style={styles.category}>
              {category}
            </Text>
            <Text
              testID={`${testID}-affirmation`}
              maxFontSizeMultiplier={1}
              style={[styles.affirmation, typeForLength(text.length)]}
            >
              {`“${text}”`}
            </Text>
          </View>

          <View style={styles.footer}>
            <View style={styles.footerRule} />
            <Text maxFontSizeMultiplier={1} testID={`${testID}-url`} style={styles.url}>
              {APP_URL}
            </Text>
          </View>
        </View>
      </GradientCover>
    </ViewShot>
  );
});

export default AffirmationShareCard;

const styles = StyleSheet.create({
  frame: {
    width: AFFIRMATION_SHARE_LAYOUT_SIZE.width,
    height: AFFIRMATION_SHARE_LAYOUT_SIZE.height,
    overflow: 'hidden',
    backgroundColor: '#759ACE',
  },
  cover: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: '9%',
    paddingTop: '9%',
    paddingBottom: '8%',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(5,12,22,0.30)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
  },
  brandMark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.38)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: '7%',
  },
  category: {
    minHeight: 18,
    color: 'rgba(255,255,255,0.86)',
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
  affirmation: {
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
  affirmationLarge: { fontSize: 38, lineHeight: 50 },
  affirmationMedium: { fontSize: 30, lineHeight: 40 },
  affirmationSmall: { fontSize: 23, lineHeight: 32 },
  affirmationCompact: { fontSize: 17, lineHeight: 24 },
  footer: {
    alignItems: 'center',
  },
  footerRule: {
    width: 34,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.68)',
    marginBottom: 13,
  },
  url: {
    color: 'rgba(255,255,255,0.92)',
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
