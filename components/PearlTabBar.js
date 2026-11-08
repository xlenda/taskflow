import React from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../ui/theme';
import { motion } from '../ui/tokens';
import { ONB } from '../constants/brand';

// Barra "Pérola": cápsula de vidro perolado com a pílula da aba ativa deslizando até a aba tocada.
// A barra fica NO FLUXO do layout (nunca position:absolute nem `return null`): barra fora do fluxo trava o scroll
// das telas no site (CONTEXTO/ARMADILHAS.md). Sem backdrop-filter: com a barra no fluxo não há conteúdo atrás dela
// para desfocar, e o filtro só traria o risco de prender elementos fixed. O "vidro" é cor translúcida + borda + brilho.
export const SLIDE_MS = motion.durations.base;
export const SLIDE_EASING = Easing.bezier(0.34, 1.36, 0.64, 1); // ease-out com leve passada, cara de mola
const NATIVE_DRIVER = Platform.OS !== 'web';

export function pearlPalette(theme) {
  if (theme.dark) {
    return {
      dock: theme.bg,
      capsule: [theme.surfaceAlt, theme.surface],
      capsuleBorder: 'rgba(201,219,239,0.10)',
      capsuleShadow: '0px 10px 26px rgba(0,0,0,0.35), inset 0px 1px 0px rgba(255,255,255,0.06)',
      pill: ['rgba(74,128,201,0.34)', 'rgba(74,128,201,0.18)'],
      pillBorder: 'rgba(201,219,239,0.18)',
      glow: '0px 4px 16px rgba(74,128,201,0.45), 0px -2px 10px rgba(242,178,92,0.20)',
      iconOn: ONB.gradient[1],
      labelOn: theme.text,
      off: theme.textMuted,
    };
  }
  return {
    dock: theme.bg,
    capsule: ['rgba(255,255,255,0.95)', 'rgba(230,239,248,0.92)'],
    capsuleBorder: 'rgba(175,200,231,0.55)',
    capsuleShadow: '0px 10px 26px rgba(27,42,71,0.12), inset 0px 1px 0px rgba(255,255,255,0.9)',
    pill: ['#FFFFFF', '#EAF2FB'],
    pillBorder: 'rgba(255,255,255,0.95)',
    glow: '0px 4px 14px rgba(74,128,201,0.30), 0px 0px 0px 1px rgba(74,128,201,0.10), 0px -2px 10px rgba(242,178,92,0.22)',
    iconOn: theme.accent,
    labelOn: ONB.cta,
    off: theme.textMutedStrong || theme.textMuted,
  };
}

export default function PearlTabBar({ state, descriptors, navigation }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const palette = pearlPalette(theme);
  // larguras medidas no Chrome (Segoe UI) com "Comunidade"/"Affirmations": 11 px cabe a partir de 390, 10 px abaixo
  const narrow = width < 360;
  const compact = width < 390;
  const [rowWidth, setRowWidth] = React.useState(0);
  const [reduceMotion, setReduceMotion] = React.useState(false);
  const [keyboardShown, setKeyboardShown] = React.useState(false);
  const slide = React.useRef(new Animated.Value(state.index)).current; // posição em "abas", não em pixels
  const scales = React.useRef([]).current;
  const scaleOf = (index) => scales[index] || (scales[index] = new Animated.Value(1));
  const hideOnKeyboard = descriptors[state.routes[state.index].key].options.tabBarHideOnKeyboard === true;
  const tabWidth = rowWidth / state.routes.length;
  const translateX = React.useMemo(() => Animated.multiply(slide, tabWidth), [slide, tabWidth]);

  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => alive && setReduceMotion(!!enabled))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => setReduceMotion(!!enabled));
    return () => {
      alive = false;
      subscription?.remove?.();
    };
  }, []);

  React.useEffect(() => {
    if (!hideOnKeyboard) return undefined;
    const ios = Platform.OS === 'ios';
    const subscriptions = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardShown(true)),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardShown(false)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [hideOnKeyboard]);

  React.useEffect(() => {
    if (reduceMotion) {
      slide.setValue(state.index);
      return undefined;
    }
    const animation = Animated.timing(slide, {
      toValue: state.index,
      duration: SLIDE_MS,
      easing: SLIDE_EASING,
      useNativeDriver: NATIVE_DRIVER,
    });
    animation.start();
    return () => animation.stop();
  }, [state.index, reduceMotion, slide]);

  // teclado aberto: altura zero, mas ainda no fluxo
  if (hideOnKeyboard && keyboardShown) return <View style={styles.hidden} />;

  const pressIn = (index) => {
    if (reduceMotion) return;
    Animated.timing(scaleOf(index), { toValue: 0.92, duration: 90, useNativeDriver: NATIVE_DRIVER }).start();
  };
  const pressOut = (index) => {
    if (reduceMotion) return;
    Animated.spring(scaleOf(index), { ...motion.spring, toValue: 1, useNativeDriver: NATIVE_DRIVER }).start();
  };

  return (
    <View
      testID="pearl-tab-bar"
      style={[
        styles.dock,
        {
          backgroundColor: palette.dock,
          paddingHorizontal: (narrow ? 4 : compact ? 8 : 12) + Math.max(insets.left, insets.right),
          paddingBottom: Math.max(insets.bottom - 6, 10),
        },
      ]}
    >
      <View
        style={[
          styles.capsule,
          { padding: narrow ? 2 : 4, borderColor: palette.capsuleBorder, boxShadow: palette.capsuleShadow },
        ]}
      >
        <LinearGradient pointerEvents="none" colors={palette.capsule} style={styles.capsuleFace} />
        <View
          accessibilityRole="tablist"
          style={styles.row}
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        >
          {rowWidth > 0 ? (
            <Animated.View
              testID="pearl-tab-indicator"
              pointerEvents="none"
              style={[styles.pill, { width: tabWidth, transform: [{ translateX }] }]}
            >
              <LinearGradient
                colors={palette.pill}
                style={[styles.pillFace, { borderColor: palette.pillBorder, boxShadow: palette.glow }]}
              />
              <View style={styles.spark} />
            </Animated.View>
          ) : null}
          {state.routes.map((route, index) => {
            const focused = index === state.index;
            const { options } = descriptors[route.key];
            const label = options.title !== undefined ? options.title : route.name;
            const onPress = () => {
              if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) {
                navigation.dispatch({
                  ...CommonActions.navigate({ name: route.name, merge: true }),
                  target: state.key,
                });
              }
            };
            const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
            return (
              <Pressable
                key={route.key}
                testID={options.tabBarTestID}
                accessibilityRole="tab"
                aria-selected={focused} // react-native-web 0.21 ignora accessibilityState; aria-* vale no site e no app
                accessibilityLabel={label}
                onPress={onPress}
                onLongPress={onLongPress}
                onPressIn={() => pressIn(index)}
                onPressOut={() => pressOut(index)}
                style={styles.tab}
              >
                <Animated.View style={[styles.tabInner, { transform: [{ scale: scaleOf(index) }] }]}>
                  {options.tabBarIcon
                    ? options.tabBarIcon({ focused, color: focused ? palette.iconOn : palette.off, size: narrow ? 19 : 22 })
                    : null}
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.label,
                      {
                        color: focused ? palette.labelOn : palette.off,
                        fontSize: compact ? 10 : 11,
                        lineHeight: compact ? 12 : 14,
                        letterSpacing: narrow ? -0.2 : 0,
                      },
                    ]}
                  >
                    {label}
                  </Text>
                </Animated.View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { height: 0 },
  dock: { paddingTop: 6 },
  capsule: { height: 62, borderRadius: 24, borderWidth: 1, overflow: 'visible' },
  capsuleFace: { ...StyleSheet.absoluteFillObject, borderRadius: 23 },
  row: { flex: 1, flexDirection: 'row' },
  pill: { position: 'absolute', top: 0, bottom: 0, left: 0, paddingHorizontal: 1 },
  pillFace: { flex: 1, borderRadius: 20, borderWidth: 1 },
  spark: {
    position: 'absolute',
    top: 3,
    left: '50%',
    marginLeft: -7,
    width: 14,
    height: 2,
    borderRadius: 1,
    backgroundColor: ONB.heart,
    opacity: 0.9,
  },
  tab: { flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  tabInner: { alignItems: 'center', justifyContent: 'center', gap: 3, maxWidth: '100%' },
  label: { fontWeight: '700', textAlign: 'center' },
});
