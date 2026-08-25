import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ONB, SERIF } from '../constants/brand';
import { useT } from '../utils/useT';

const HEIGHT = 168;
const NODE_SIZE = 56;

const S = {
  eyebrow: { en: 'YOUR CELESTIAL TRACE', pt: 'SEU TRAÇO CELESTE' },
  title: { en: 'Light the three stars.', pt: 'Acenda as três estrelas.' },
  ready: { en: 'Your Anchor Scene is open.', pt: 'Sua Cena-Âncora está aberta.' },
  progress: { en: '{n} of 3 stars lit', pt: '{n} de 3 estrelas acesas' },
  star: { en: 'Light star {n} of 3', pt: 'Acender estrela {n} de 3' },
  doneStar: { en: 'Star {n} of 3 lit', pt: 'Estrela {n} de 3 acesa' },
  waitingStar: { en: 'Star {n} of 3, waiting', pt: 'Estrela {n} de 3, aguardando' },
};

function lineGeometry(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const width = Math.sqrt(dx * dx + dy * dy);
  return {
    left: (a.x + b.x) / 2 - width / 2,
    top: (a.y + b.y) / 2 - 1,
    width,
    angle: `${Math.atan2(dy, dx)}rad`,
  };
}

export default function CelestialTrace({ initialComplete = false, onComplete }) {
  const { t } = useT();
  const [progress, setProgress] = useState(initialComplete ? 3 : 0);
  const [width, setWidth] = useState(320);
  const reducedMotion = useRef(false);
  const progressRef = useRef(initialComplete ? 3 : 0);
  const completedRef = useRef(initialComplete);
  const finishTimer = useRef(null);
  const stars = useRef([0, 1, 2].map(() => new Animated.Value(1))).current;
  const halos = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const lines = useRef([0, 1].map(() => new Animated.Value(initialComplete ? 1 : 0))).current;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) reducedMotion.current = !!value;
      })
      .catch(() => {});
    return () => {
      alive = false;
      clearTimeout(finishTimer.current);
    };
  }, []);

  const points = useMemo(
    () => [
      { x: 46, y: 112 },
      { x: width / 2, y: 45 },
      { x: Math.max(width - 46, 46), y: 112 },
    ],
    [width]
  );

  const geometries = useMemo(
    () => [lineGeometry(points[0], points[1]), lineGeometry(points[1], points[2])],
    [points]
  );

  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onComplete && onComplete({ reducedMotion: reducedMotion.current });
  };

  const lightStar = (index) => {
    if (completedRef.current || index !== progressRef.current) return;

    const next = index + 1;
    progressRef.current = next;
    setProgress(next);
    if (next < 3) Haptics.selectionAsync().catch(() => {});

    if (reducedMotion.current) {
      stars[index].setValue(1);
      halos[index].setValue(0);
      if (index > 0) lines[index - 1].setValue(1);
      if (next === 3) finish();
      return;
    }

    stars[index].setValue(0.86);
    halos[index].setValue(0.72);
    const animations = [
      Animated.spring(stars[index], {
        toValue: 1,
        damping: 16,
        stiffness: 170,
        mass: 0.7,
        useNativeDriver: true,
      }),
      Animated.timing(halos[index], {
        toValue: 0,
        duration: 520,
        useNativeDriver: true,
      }),
    ];
    if (index > 0) {
      animations.push(
        Animated.timing(lines[index - 1], {
          toValue: 1,
          duration: 420,
          useNativeDriver: true,
        })
      );
    }
    Animated.parallel(animations).start();

    if (next === 3) finishTimer.current = setTimeout(finish, 440);
  };

  return (
    <View style={styles.shell}>
      <Text style={styles.eyebrow}>{t(S.eyebrow)}</Text>
      <Text style={styles.title}>{progress === 3 ? t(S.ready) : t(S.title)}</Text>

      <View
        style={styles.sky}
        onLayout={(event) => {
          const measured = event.nativeEvent.layout.width;
          if (measured > 0 && Math.abs(measured - width) > 1) setWidth(measured);
        }}
      >
        {geometries.map((geometry, index) => (
          <View
            key={`line-base-${index}`}
            pointerEvents="none"
            style={[
              styles.lineBase,
              {
                left: geometry.left,
                top: geometry.top,
                width: geometry.width,
                transform: [{ rotate: geometry.angle }],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.lineFill,
                {
                  opacity: lines[index],
                  transform: [{ scaleX: lines[index] }],
                },
              ]}
            />
          </View>
        ))}

        {points.map((point, index) => {
          const done = index < progress;
          const active = index === progress;
          const label = done ? t(S.doneStar, { n: index + 1 }) : active
            ? t(S.star, { n: index + 1 })
            : t(S.waitingStar, { n: index + 1 });
          return (
            <View
              key={`star-${index}`}
              style={[styles.nodeSlot, { left: point.x - NODE_SIZE / 2, top: point.y - NODE_SIZE / 2 }]}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.halo,
                  {
                    opacity: halos[index],
                    transform: [
                      {
                        scale: halos[index].interpolate({
                          inputRange: [0, 0.72],
                          outputRange: [1.55, 0.8],
                        }),
                      },
                    ],
                  },
                ]}
              />
              <Animated.View style={{ transform: [{ scale: stars[index] }] }}>
                <Pressable
                  testID={`trace-star-${index + 1}`}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ disabled: !active, selected: done }}
                  disabled={!active}
                  onPress={() => lightStar(index)}
                  style={({ pressed }) => [
                    styles.node,
                    done && styles.nodeDone,
                    active && styles.nodeActive,
                    !done && !active && styles.nodeWaiting,
                    pressed && active && styles.nodePressed,
                  ]}
                >
                  <Ionicons
                    name={done ? 'star' : active ? 'star-outline' : 'sparkles-outline'}
                    size={done ? 23 : 22}
                    color={done ? ONB.ctaInk : active ? ONB.ink : ONB.inkFaint}
                  />
                </Pressable>
              </Animated.View>
            </View>
          );
        })}
      </View>

      <View accessibilityLiveRegion="polite" style={styles.progressRow}>
        {[0, 1, 2].map((index) => (
          <View key={`step-${index}`} style={[styles.progressMark, index < progress && styles.progressMarkDone]} />
        ))}
        <Text style={styles.progressText}>{t(S.progress, { n: progress })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    marginTop: 24,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(36,64,110,0.12)',
    borderRadius: 8,
    backgroundColor: ONB.pillSoft,
    overflow: 'hidden',
  },
  eyebrow: { color: ONB.badgeText, fontSize: 11, fontWeight: '800', letterSpacing: 0 },
  title: { color: ONB.ink, fontFamily: SERIF, fontSize: 22, lineHeight: 29, marginTop: 5 },
  sky: { width: '100%', height: HEIGHT, marginTop: 4, position: 'relative' },
  lineBase: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(36,64,110,0.13)',
    overflow: 'hidden',
  },
  lineFill: { width: '100%', height: 2, borderRadius: 1, backgroundColor: ONB.heart },
  nodeSlot: { position: 'absolute', width: NODE_SIZE, height: NODE_SIZE },
  halo: {
    position: 'absolute',
    left: -7,
    top: -7,
    width: NODE_SIZE + 14,
    height: NODE_SIZE + 14,
    borderRadius: (NODE_SIZE + 14) / 2,
    borderWidth: 2,
    borderColor: ONB.heart,
  },
  node: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: ONB.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
  },
  nodeActive: { backgroundColor: '#F8D79D', borderColor: ONB.heart },
  nodeDone: { backgroundColor: ONB.cta, borderColor: ONB.cta },
  nodeWaiting: { backgroundColor: ONB.pillStrong, borderColor: 'rgba(36,64,110,0.12)' },
  nodePressed: { opacity: 0.84, transform: [{ scale: 0.96 }] },
  progressRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center' },
  progressMark: {
    width: 20,
    height: 3,
    borderRadius: 2,
    marginRight: 5,
    backgroundColor: 'rgba(36,64,110,0.18)',
  },
  progressMarkDone: { backgroundColor: ONB.heart },
  progressText: { color: ONB.badgeText, fontSize: 12, marginLeft: 5, fontVariant: ['tabular-nums'] },
});
