import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';

import {
  DEFAULT_NARRATOR_ID,
  NARRATORS,
  isNarratorId,
  narratorPreviewUrl,
  narratorText,
} from '../constants/narrators';
import { accentAt, alpha } from '../utils/colors';

const PREVIEW_TIMEOUT_MS = 10000;

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
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [activeId, setActiveId] = useState(null);
  const [previewPhase, setPreviewPhase] = useState('idle');
  const [errorId, setErrorId] = useState(null);
  const activeIdRef = useRef(null);
  const startStatusRef = useRef(null);
  const loadingTimerRef = useRef(null);
  const localeRef = useRef(locale);
  const webAudioRef = useRef(null);

  const clearLoadingTimer = useCallback(() => {
    if (loadingTimerRef.current !== null) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  }, []);

  const teardownPreview = useCallback(() => {
    clearLoadingTimer();
    activeIdRef.current = null;
    startStatusRef.current = null;
    const webAudio = webAudioRef.current;
    webAudioRef.current = null;
    if (webAudio) {
      webAudio.onplaying = null;
      webAudio.onended = null;
      webAudio.onerror = null;
      try {
        webAudio.pause();
        webAudio.removeAttribute('src');
        webAudio.load();
      } catch (_error) {}
    }
    try {
      if (Platform.OS !== 'web') {
        player.pause();
        player.replace(null);
      }
    } catch (_error) {
      // The player may already be released while the component is unmounting.
    }
    setActiveId(null);
    setPreviewPhase('idle');
  }, [clearLoadingTimer, player]);

  const markPreviewError = useCallback(
    (narratorId) => {
      if (activeIdRef.current !== narratorId) return;
      teardownPreview();
      setErrorId(narratorId);
    },
    [teardownPreview]
  );

  const startPreview = useCallback(
    (narratorId) => {
      if (activeIdRef.current) teardownPreview();
      clearLoadingTimer();
      activeIdRef.current = narratorId;
      startStatusRef.current = status;
      setActiveId(narratorId);
      setPreviewPhase('loading');
      setErrorId(null);

      try {
        const url = narratorPreviewUrl(narratorId, locale);
        if (Platform.OS === 'web' && typeof Audio !== 'undefined') {
          const audio = new Audio(url);
          webAudioRef.current = audio;
          audio.preload = 'auto';
          audio.onplaying = () => {
            if (activeIdRef.current !== narratorId) return;
            clearLoadingTimer();
            setPreviewPhase('playing');
          };
          audio.onended = () => {
            if (activeIdRef.current === narratorId) teardownPreview();
          };
          audio.onerror = () => markPreviewError(narratorId);
          const request = audio.play();
          if (request && typeof request.catch === 'function') {
            request.catch((error) => {
              if (activeIdRef.current !== narratorId || error?.name === 'AbortError') return;
              markPreviewError(narratorId);
            });
          }
        } else {
          // replace() unloads the previous native sample before installing the next one.
          player.pause();
          player.replace({ uri: url });
          player.play();
        }
      } catch (_error) {
        markPreviewError(narratorId);
        return;
      }

      loadingTimerRef.current = setTimeout(() => {
        markPreviewError(narratorId);
      }, PREVIEW_TIMEOUT_MS);
    },
    [clearLoadingTimer, locale, markPreviewError, player, status, teardownPreview]
  );

  const handlePreview = useCallback(
    (narratorId) => {
      if (disabled) return;
      if (
        activeIdRef.current === narratorId &&
        (previewPhase === 'loading' || previewPhase === 'playing')
      ) {
        teardownPreview();
        return;
      }
      startPreview(narratorId);
    },
    [disabled, previewPhase, startPreview, teardownPreview]
  );

  const handleSelect = useCallback(
    (narratorId) => {
      if (disabled || narratorId === selectedId) return;
      teardownPreview();
      setErrorId(null);
      if (typeof onChange === 'function') onChange(narratorId);
    },
    [disabled, onChange, selectedId, teardownPreview]
  );

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const narratorId = activeIdRef.current;
    if (!narratorId || status === startStatusRef.current) return;
    startStatusRef.current = null;

    const playbackState = String(status.playbackState || '').toLowerCase();
    if (playbackState === 'failed') {
      markPreviewError(narratorId);
      return;
    }

    if (status.playing) {
      clearLoadingTimer();
      setPreviewPhase('playing');
      return;
    }

    if (
      previewPhase === 'playing' &&
      (status.didJustFinish || playbackState === 'ended')
    ) {
      teardownPreview();
    }
  }, [
    clearLoadingTimer,
    markPreviewError,
    previewPhase,
    status,
    teardownPreview,
  ]);

  useEffect(() => {
    if (localeRef.current === locale) return;
    localeRef.current = locale;
    teardownPreview();
    setErrorId(null);
  }, [locale, teardownPreview]);

  useEffect(() => {
    if (disabled) teardownPreview();
  }, [disabled, teardownPreview]);

  useEffect(
    () => () => {
      clearLoadingTimer();
      activeIdRef.current = null;
      const webAudio = webAudioRef.current;
      webAudioRef.current = null;
      if (webAudio) {
        webAudio.onplaying = null;
        webAudio.onended = null;
        webAudio.onerror = null;
        try {
          webAudio.pause();
          webAudio.removeAttribute('src');
          webAudio.load();
        } catch (_error) {}
      }
      try {
        if (Platform.OS !== 'web') {
          player.pause();
          // useAudioPlayer releases the native object after unmount; remove unloads now.
          player.remove();
        }
      } catch (_error) {
        // Cleanup is best-effort if the native shared object released first.
      }
    },
    [clearLoadingTimer, player]
  );

  return (
    <View
      testID="narrator-selector"
      accessibilityRole="radiogroup"
      accessibilityLabel={copy.group}
      style={[styles.group, compact ? styles.compactGroup : null]}
    >
      {NARRATORS.map((narrator) => {
        const selected = narrator.id === selectedId;
        const loading = narrator.id === activeId && previewPhase === 'loading';
        const playing = narrator.id === activeId && previewPhase === 'playing';
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
