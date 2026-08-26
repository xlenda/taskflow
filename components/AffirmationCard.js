import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../ui/theme';
import { useT } from '../utils/useT';
import { accentAt, alpha } from '../utils/colors';

const S = {
  listen: { en: 'Listen to this affirmation', pt: 'Ouvir esta afirmação' },
  stop: { en: 'Stop the audio', pt: 'Parar o áudio' },
  favorite: { en: 'Save to favourites', pt: 'Guardar nas favoritas' },
  unfavorite: { en: 'Remove from favourites', pt: 'Tirar das favoritas' },
  share: { en: 'Share this affirmation', pt: 'Compartilhar esta afirmação' },
};

export default function AffirmationCard({
  affirmation,
  accent = 0,
  favorite = false,
  categoryLabel,
  speaking = false,
  onToggleFavorite,
  onToggleSpeak,
  onShare,
}) {
  const theme = useTheme();
  const { t } = useT();
  const color = accentAt(theme, accent);

  // Afirmações são pessoais; a reprodução só aparece quando o aparelho
  // oferece uma voz local disponível.
  const showSpeak = !!onToggleSpeak;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: alpha(color, 0.25),
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 3,
        },
      ]}
    >
      <View style={styles.headRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onToggleFavorite}
          accessibilityRole="button"
          accessibilityLabel={favorite ? t(S.unfavorite) : t(S.favorite)}
          style={styles.iconBtn}
        >
          <Ionicons
            name={favorite ? 'heart' : 'heart-outline'}
            size={20}
            color={favorite ? color : theme.textMuted}
          />
        </TouchableOpacity>

        <View style={styles.headActions}>
          {showSpeak ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onToggleSpeak}
              accessibilityRole="button"
              accessibilityLabel={speaking ? t(S.stop) : t(S.listen)}
              style={styles.iconBtn}
            >
              <Ionicons
                name={speaking ? 'stop' : 'volume-high'}
                size={20}
                color={speaking ? color : theme.textMuted}
              />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel={t(S.share)}
            style={styles.iconBtn}
          >
            <Ionicons name="share-outline" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.text, { color: theme.text }]}>{affirmation.text}</Text>

      <View style={styles.footer}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.cat, { color: theme.textMuted }]}>
          {String(categoryLabel || affirmation.category || '').toUpperCase()}
        </Text>
      </View>
    </View>
  );
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
  text: {
    fontSize: 22,
    lineHeight: 33,
    fontWeight: '500',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 8 },
  cat: { fontSize: 11, letterSpacing: 1.6, fontWeight: '700' },
});
