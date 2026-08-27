import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../context/AppContext';
import {
  NARRATION_PLAYBACK_RATES,
  useNarration,
} from '../context/NarrationContext';
import { useTheme } from '../ui/theme';

const COPY = {
  en: {
    loading: 'Preparing audio',
    ready: 'Audio ready',
    paused: 'Audio paused',
    playing: 'Personal narration',
    progress: 'Audio progress',
    speed: 'Speed',
    pause: 'Pause narration',
    resume: 'Resume narration',
    stop: 'Stop and close audio',
    stopHint: 'Stops the current narration and closes the player',
  },
  pt: {
    loading: 'Preparando áudio',
    ready: 'Áudio pronto',
    paused: 'Áudio pausado',
    playing: 'Narração pessoal',
    progress: 'Progresso do áudio',
    speed: 'Velocidade',
    pause: 'Pausar narração',
    resume: 'Continuar narração',
    stop: 'Parar e fechar o áudio',
    stopHint: 'Interrompe a narração atual e fecha o player',
  },
};

export function formatTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function clampProgress(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export default function NarrationPlaybackControls() {
  const { state } = useApp();
  const narration = useNarration();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [stopTooltipVisible, setStopTooltipVisible] = React.useState(false);
  const lang = state?.lang === 'en' ? 'en' : 'pt';
  const copy = COPY[lang];
  const visible =
    Boolean(narration.activePlaybackId) &&
    (narration.isLoading || narration.isPlaying || narration.isPaused || narration.isReady);
  const progress = clampProgress(narration.progress);
  const progressPercent = Math.round(progress * 100);
  const elapsed = formatTime(narration.elapsedTime);
  const total = narration.totalDuration > 0 ? formatTime(narration.totalDuration) : '--:--';
  const estimatedPrefix = narration.chunkCount > 1 ? '≈' : '';

  const togglePlayback = useCallback(() => {
    if (narration.isPlaying) narration.pause();
    else if (narration.isPaused || narration.isReady) narration.resume();
  }, [narration]);

  const stopPlayback = useCallback(() => {
    setStopTooltipVisible(false);
    narration.stop(narration.activePlaybackId);
  }, [narration.activePlaybackId, narration.stop]);

  if (!visible) return null;

  const statusLabel = narration.isLoading
    ? copy.loading
    : narration.isReady
    ? copy.ready
    : narration.isPaused
    ? copy.paused
    : copy.playing;

  return (
    <View
      style={[styles.layer, { paddingBottom: Math.max(insets.bottom, 8) }]}
    >
      <View
        testID="narration-playback-controls"
        accessibilityLabel={statusLabel}
        style={[
          styles.player,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            shadowColor: theme.text,
          },
        ]}
      >
        <View style={styles.statusRow}>
          <View style={[styles.audioMark, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="volume-medium" size={18} color={theme.accent} />
          </View>
          <Text numberOfLines={1} style={[styles.statusText, { color: theme.text }]}>
            {statusLabel}
          </Text>
          <Text style={[styles.timeText, { color: theme.textMuted }]}>
            {estimatedPrefix}{elapsed} / {total === '--:--' ? total : `${estimatedPrefix}${total}`}
          </Text>
          {narration.isLoading ? (
            <View style={styles.controlButton} accessibilityLabel={copy.loading}>
              <ActivityIndicator size="small" color={theme.accent} />
            </View>
          ) : (
            <Pressable
              testID="narration-playback-toggle"
              accessibilityRole="button"
              accessibilityLabel={narration.isPlaying ? copy.pause : copy.resume}
              hitSlop={8}
              onPress={togglePlayback}
              style={({ pressed }) => [
                styles.controlButton,
                { backgroundColor: theme.accentSoft },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={narration.isPlaying ? 'pause' : 'play'}
                size={18}
                color={theme.accent}
              />
            </Pressable>
          )}
          <View style={styles.stopControlSlot}>
            <Pressable
              testID="narration-playback-stop"
              accessibilityRole="button"
              accessibilityLabel={copy.stop}
              accessibilityHint={copy.stopHint}
              hitSlop={8}
              onPress={stopPlayback}
              onHoverIn={() => setStopTooltipVisible(true)}
              onHoverOut={() => setStopTooltipVisible(false)}
              onFocus={() => setStopTooltipVisible(true)}
              onBlur={() => setStopTooltipVisible(false)}
              style={({ pressed }) => [
                styles.controlButton,
                styles.stopControlButton,
                { backgroundColor: theme.surfaceAlt },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="close" size={20} color={theme.textMuted} />
            </Pressable>
            {stopTooltipVisible ? (
              <View
                testID="narration-playback-stop-tooltip"
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[styles.tooltip, { backgroundColor: theme.text }]}
              >
                <Text style={[styles.tooltipText, { color: theme.surface }]}>{copy.stop}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View
          testID="narration-progress"
          accessibilityRole="progressbar"
          accessibilityLabel={copy.progress}
          accessibilityValue={{
            min: 0,
            max: 100,
            now: progressPercent,
            text: `${progressPercent}%`,
          }}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          aria-valuetext={`${progressPercent}%`}
          style={[styles.progressTrack, { backgroundColor: theme.surfaceAlt }]}
        >
          <View
            style={[
              styles.progressFill,
              { backgroundColor: theme.accent, width: `${progressPercent}%` },
            ]}
          />
        </View>

        <View style={styles.speedRow}>
          <Text style={[styles.speedLabel, { color: theme.textMuted }]}>{copy.speed}</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={copy.speed}
            style={[styles.speedControl, { borderColor: theme.border }]}
          >
            {NARRATION_PLAYBACK_RATES.map((rate, index) => {
              const selected = narration.playbackRate === rate;
              return (
                <Pressable
                  key={rate}
                  testID={`narration-speed-${rate}`}
                  accessibilityRole="radio"
                  accessibilityLabel={`${rate}x`}
                  accessibilityState={{ checked: selected }}
                  aria-checked={selected}
                  onPress={() => narration.setPlaybackRate(rate)}
                  style={({ pressed }) => [
                    styles.speedButton,
                    index > 0 && { borderLeftColor: theme.border, borderLeftWidth: 1 },
                    selected && { backgroundColor: theme.accentSoft },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.speedButtonText,
                      { color: selected ? theme.accent : theme.textMuted },
                      selected && styles.speedButtonTextSelected,
                    ]}
                  >
                    {rate}x
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    flexShrink: 0,
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  player: {
    width: '100%',
    maxWidth: 460,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 9,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
  },
  statusRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
  },
  audioMark: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 9,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  timeText: {
    marginLeft: 8,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  controlButton: {
    width: 32,
    height: 32,
    marginLeft: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopControlSlot: {
    position: 'relative',
    width: 32,
    height: 32,
    marginLeft: 8,
  },
  stopControlButton: {
    marginLeft: 0,
  },
  tooltip: {
    position: 'absolute',
    right: 0,
    bottom: 38,
    width: 158,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
    zIndex: 2,
  },
  tooltipText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  progressTrack: {
    height: 4,
    marginTop: 8,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  speedRow: {
    minHeight: 32,
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  speedLabel: {
    marginRight: 10,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  speedControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  speedButton: {
    minWidth: 45,
    height: 30,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedButtonText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  speedButtonTextSelected: {
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.68,
  },
});
