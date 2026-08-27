import React from 'react';
import { ActivityIndicator, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ui/theme';
import { useT } from '../utils/useT';
import { accentAt, alpha } from '../utils/colors';
import GradientCover from './GradientCover';

const S = {
  listen: { en: 'Listen to this affirmation', pt: 'Ouvir esta afirmação' },
  stop: { en: 'Stop the audio', pt: 'Parar o áudio' },
  favorite: { en: 'Save to favourites', pt: 'Guardar nas favoritas' },
  unfavorite: { en: 'Remove from favourites', pt: 'Tirar das favoritas' },
  share: { en: 'Share this affirmation', pt: 'Compartilhar esta afirmação' },
  visualPreparing: { en: 'Preparing your image', pt: 'Preparando sua imagem' },
  visualRetry: { en: 'Try the image again', pt: 'Tentar a imagem novamente' },
};

export default function AffirmationCard({
  affirmation,
  accent = 0,
  favorite = false,
  categoryLabel,
  speaking = false,
  visualKey,
  visualStatus,
  onToggleFavorite,
  onToggleSpeak,
  onShare,
  onRetryVisual,
}) {
  const theme = useTheme();
  const { t } = useT();
  const color = accentAt(theme, accent);
  const visual = !!visualKey;
  const foreground = visual ? '#FFFFFF' : theme.text;
  const mutedForeground = visual ? 'rgba(255,255,255,0.82)' : theme.textMuted;
  const visualPhase = visualStatus && visualStatus.phase;

  // Afirmações são pessoais; a reprodução só aparece quando o aparelho
  // oferece uma voz local disponível.
  const showSpeak = !!onToggleSpeak;

  const content = (
    <>
      <View style={styles.headRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onToggleFavorite}
          accessibilityRole="button"
          accessibilityLabel={favorite ? t(S.unfavorite) : t(S.favorite)}
          style={[styles.iconBtn, visual && styles.visualIconBtn]}
        >
          <Ionicons
            name={favorite ? 'heart' : 'heart-outline'}
            size={20}
            color={visual ? '#FFFFFF' : favorite ? color : theme.textMuted}
          />
        </TouchableOpacity>

        <View style={styles.headActions}>
          {showSpeak ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onToggleSpeak}
              accessibilityRole="button"
              accessibilityLabel={speaking ? t(S.stop) : t(S.listen)}
              style={[styles.iconBtn, visual && styles.visualIconBtn]}
            >
              <Ionicons
                name={speaking ? 'stop' : 'volume-high'}
                size={20}
                color={visual ? '#FFFFFF' : speaking ? color : theme.textMuted}
              />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel={t(S.share)}
            style={[styles.iconBtn, visual && styles.visualIconBtn]}
          >
            <Ionicons name="share-outline" size={20} color={mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.text, visual && styles.visualText, { color: foreground }]}>
        {affirmation.text}
      </Text>

      {visualPhase === 'pending' ? (
        <View
          testID="personal-visual-pending"
          accessibilityLiveRegion="polite"
          style={styles.visualStatusRow}
        >
          <ActivityIndicator size="small" color={visual ? '#FFFFFF' : color} />
          <Text style={[styles.visualStatusText, { color: mutedForeground }]}>
            {t(S.visualPreparing)}
          </Text>
        </View>
      ) : visualPhase === 'error' && onRetryVisual ? (
        <TouchableOpacity
          testID="personal-visual-retry"
          activeOpacity={0.76}
          onPress={onRetryVisual}
          accessibilityRole="button"
          accessibilityLabel={t(S.visualRetry)}
          style={[
            styles.visualRetry,
            {
              backgroundColor: visual ? 'rgba(8,16,28,0.30)' : alpha(color, 0.1),
              borderColor: visual ? 'rgba(255,255,255,0.28)' : alpha(color, 0.28),
            },
          ]}
        >
          <Ionicons name="refresh" size={16} color={visual ? '#FFFFFF' : color} />
          <Text style={[styles.visualRetryText, { color: visual ? '#FFFFFF' : color }]}>
            {t(S.visualRetry)}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.footer}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.cat, visual && styles.visualCat, { color: mutedForeground }]}>
          {String(categoryLabel || affirmation.category || '').toUpperCase()}
        </Text>
      </View>
    </>
  );

  const surfaceStyle = [
    styles.card,
    {
      borderColor: visual ? 'rgba(255,255,255,0.28)' : alpha(color, 0.25),
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: visual ? 0.18 : 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
  ];

  if (visual) {
    return (
      <GradientCover visualKey={visualKey} accent={accent} radius={22} style={surfaceStyle}>
        {content}
      </GradientCover>
    );
  }

  return <View style={[surfaceStyle, { backgroundColor: theme.surface }]}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 24,
    minHeight: 280,
    justifyContent: 'space-between',
  },
  // Os ícones têm 20px, mas o alvo de toque precisa de 44 no celular — e no
  // react-native-web hitSlop não aumenta nada. A área vem do próprio botão; as
  // margens negativas devolvem o alinhamento óptico às bordas do card.
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: -12,
    marginTop: -8,
  },
  headActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  visualIconBtn: { backgroundColor: 'rgba(8,16,28,0.30)', borderRadius: 22 },
  text: {
    fontSize: 22,
    lineHeight: 33,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  visualText: {
    textShadowColor: 'rgba(0,0,0,0.44)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  visualStatusRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  visualStatusText: { fontSize: 12.5, lineHeight: 18, marginLeft: 8, textAlign: 'center' },
  visualRetry: {
    minHeight: 40,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  visualRetryText: { fontSize: 12.5, lineHeight: 18, fontWeight: '700', marginLeft: 7 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  cat: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
  visualCat: {
    textShadowColor: 'rgba(0,0,0,0.38)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
