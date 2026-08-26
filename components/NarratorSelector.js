import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  DEFAULT_NARRATOR_ID,
  NARRATORS,
  isNarratorId,
  narratorText,
} from '../constants/narrators';
import { useNarration } from '../context/NarrationContext';
import { accentAt, alpha } from '../utils/colors';

const FALLBACK_THEME = {
  dark: false,
  surface: '#FFFFFF',
  surfaceAlt: '#F2F4F7',
  text: '#171B26',
  textMuted: '#6C7688',
  border: '#E1E6EF',
  accent: '#3B6EF6',
  danger: '#D9544E',
  accents: ['#3B6EF6', '#7B5CE8', '#2E9E68', '#D08E23'],
};

const COPY = {
  pt: {
    group: 'Voz da narração',
    select: 'Selecionar',
    preview: 'Ouvir amostra de',
    stop: 'Parar amostra de',
    loading: 'Carregando amostra de',
    retry: 'Tentar ouvir novamente',
    unavailable: 'Não foi possível reproduzir a amostra de',
  },
  en: {
    group: 'Narration voice',
    select: 'Select',
    preview: 'Listen to a sample from',
    stop: 'Stop sample from',
    loading: 'Loading sample from',
    retry: 'Try listening again',
    unavailable: 'Could not play the sample from',
  },
};

export default function NarratorSelector({
  value = DEFAULT_NARRATOR_ID,
  onChange,
  lang = 'pt',
  theme,
  variant = 'list',
  disabled = false,
}) {
  const locale = lang === 'en' ? 'en' : 'pt';
  const copy = COPY[locale];
  const palette = theme || FALLBACK_THEME;
  const compact = variant === 'compact';
  const selectedId = isNarratorId(value) ? value : DEFAULT_NARRATOR_ID;
  const narration = useNarration();
  const [errorId, setErrorId] = useState(null);

  const handlePreview = useCallback(
    async (narratorId) => {
      if (disabled) return;
      if (
        narration.activeNarratorId === narratorId &&
        (narration.isLoading || narration.isPlaying || narration.isPaused)
      ) {
        narration.stop();
        return;
      }
      setErrorId(null);
      const result = await narration.playPreview(narratorId, locale);
      if (!result.ok && result.error !== 'audio_cancelled') setErrorId(narratorId);
    },
    [disabled, locale, narration]
  );

  const handleSelect = useCallback(
    (narratorId) => {
      if (disabled || narratorId === selectedId) return;
      narration.stop();
      setErrorId(null);
      if (typeof onChange === 'function') onChange(narratorId);
    },
    [disabled, narration, onChange, selectedId]
  );

  useEffect(() => {
    setErrorId(null);
  }, [locale]);

  useEffect(() => {
    if (disabled) narration.stop();
  }, [disabled, narration]);

  return (
    <View
      testID="narrator-selector"
      accessibilityRole="radiogroup"
      accessibilityLabel={copy.group}
      style={[styles.group, compact ? styles.compactGroup : null]}
    >
      {NARRATORS.map((narrator) => {
        const selected = narrator.id === selectedId;
        const active = narrator.id === narration.activeNarratorId;
        const loading = active && narration.isLoading;
        const playing = active && (narration.isPlaying || narration.isPaused);
        const failed = narrator.id === errorId;
        const name = narratorText(narrator.name, locale);
        const description = narratorText(narrator.description, locale);
        const color = accentAt(palette, narrator.accent);
        const previewLabel = loading
          ? `${copy.loading} ${name}`
          : playing
            ? `${copy.stop} ${name}`
            : failed
              ? `${copy.retry}: ${name}`
              : `${copy.preview} ${name}`;

        return (
          <View
            key={narrator.id}
            style={[
              styles.option,
              compact ? styles.compactOption : null,
              {
                backgroundColor: selected ? alpha(color, palette.dark ? 0.13 : 0.08) : palette.surface,
                borderColor: failed ? palette.danger : selected ? color : palette.border,
                opacity: disabled ? 0.55 : 1,
              },
            ]}
          >
            <View style={[styles.optionRow, compact ? styles.compactRow : null]}>
              <Pressable
                testID={`narrator-option-${narrator.id}`}
                accessibilityRole="radio"
                accessibilityLabel={`${name}. ${description}`}
                accessibilityHint={`${copy.select} ${name}`}
                accessibilityState={{ checked: selected, disabled }}
                aria-checked={selected}
                disabled={disabled}
                onPress={() => handleSelect(narrator.id)}
                style={({ pressed }) => [
                  styles.choice,
                  compact ? styles.compactChoice : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.radio,
                    {
                      borderColor: selected ? color : palette.textMuted,
                      backgroundColor: selected ? alpha(color, 0.12) : 'transparent',
                    },
                  ]}
                >
                  {selected ? <View style={[styles.radioDot, { backgroundColor: color }]} /> : null}
                </View>
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={[styles.name, { color: palette.text }]}>
                    {name}
                  </Text>
                  <Text
                    numberOfLines={compact ? 1 : 2}
                    style={[styles.description, compact ? styles.compactDescription : null, { color: palette.textMuted }]}
                  >
                    {description}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                testID={`narrator-preview-${narrator.id}`}
                accessibilityRole="button"
                accessibilityLabel={previewLabel}
                accessibilityState={{ busy: loading, disabled }}
                disabled={disabled}
                onPress={() => handlePreview(narrator.id)}
                style={({ pressed }) => [
                  styles.previewButton,
                  {
                    backgroundColor: playing || loading ? alpha(color, 0.14) : palette.surfaceAlt,
                    borderColor: failed ? palette.danger : playing || loading ? color : palette.border,
                  },
                  pressed ? styles.pressed : null,
                ]}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={color} />
                ) : (
                  <Ionicons
                    name={playing ? 'stop' : failed ? 'refresh' : 'play'}
                    size={19}
                    color={failed ? palette.danger : color}
                  />
                )}
              </Pressable>
            </View>

            {failed ? (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={[styles.errorText, { color: palette.danger }]}
              >
                {copy.unavailable} {name}.
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { width: '100%', gap: 8 },
  compactGroup: { gap: 5 },
  option: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 8,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  compactOption: { borderRadius: 7 },
  optionRow: { minHeight: 72, flexDirection: 'row', alignItems: 'stretch' },
  compactRow: { minHeight: 58 },
  choice: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  compactChoice: { paddingHorizontal: 11, paddingVertical: 8 },
  radio: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  copy: { flex: 1, minWidth: 0, marginLeft: 11 },
  name: { fontSize: 14.5, lineHeight: 19, fontWeight: '700', letterSpacing: 0 },
  description: { fontSize: 12.5, lineHeight: 18, marginTop: 2, letterSpacing: 0 },
  compactDescription: { fontSize: 12, lineHeight: 16, marginTop: 1 },
  previewButton: {
    width: 44,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    flexShrink: 0,
    marginRight: 8,
  },
  errorText: { fontSize: 11.5, lineHeight: 16, paddingHorizontal: 14, paddingBottom: 9 },
  pressed: { opacity: 0.7 },
});
