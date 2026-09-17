import { Platform } from 'react-native';

// Design-system primitives adapted from the Celeste package. Theme palettes stay
// in theme.js so adopting these tokens cannot silently rebrand an existing theme.
const sansFamily = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
});

const serifFamily = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia, "Times New Roman", serif',
});

export const typeFamilies = Object.freeze({
  sans: sansFamily,
  serif: serifFamily,
});

export const typography = Object.freeze({
  displayXl: {
    fontFamily: serifFamily,
    fontSize: 58,
    lineHeight: 64,
  },
  displayL: {
    fontFamily: serifFamily,
    fontSize: 40,
    lineHeight: 46,
  },
  scene: {
    fontFamily: serifFamily,
    fontSize: 32,
    lineHeight: 42,
  },
  serifLg: {
    fontFamily: serifFamily,
    fontSize: 30,
    lineHeight: 40,
  },
  serifMd: {
    fontFamily: serifFamily,
    fontSize: 22,
    lineHeight: 29,
  },
  affirmation: {
    fontFamily: serifFamily,
    fontSize: 22,
    lineHeight: 33,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  title: {
    fontFamily: sansFamily,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heading: {
    fontFamily: sansFamily,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subhead: {
    fontFamily: sansFamily,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  bodyLg: {
    fontFamily: sansFamily,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  body: {
    fontFamily: sansFamily,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  },
  bodySm: {
    fontFamily: sansFamily,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  label: {
    fontFamily: sansFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  caption: {
    fontFamily: sansFamily,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  eyebrow: {
    fontFamily: sansFamily,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  tag: {
    fontFamily: sansFamily,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
});

// Four-point layout grid, with a 2px micro-step reserved for hairline spacing.
// The five legacy aliases remain byte-for-byte compatible with ui/theme.js.
export const spacing = Object.freeze({
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  s0: 0,
  s1: 2,
  s2: 4,
  s3: 8,
  s4: 12,
  s5: 16,
  s6: 20,
  s7: 24,
  s8: 32,
  s9: 40,
  s10: 48,
  s11: 64,
  s12: 80,
  gutter: 16,
  gutterOnboarding: 26,
  tabClearance: 96,
  contentMax: 720,
});

export const radius = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  card: 18,
  input: 20,
  affirmation: 22,
  xl: 24,
  cta: 26,
  sheet: 28,
  bubble: 36,
  pill: 999,
});

export const dimensions = Object.freeze({
  touchIos: 44,
  touchAndroid: 48,
  touchWeb: 44,
  cta: 52,
  input: 52,
  inputOnboarding: 62,
  fieldSm: 44,
  tabBar: 56,
  header: 64,
  cover: 62,
  node: 56,
  avatar: 40,
  badge: 30,
  trace: 168,
  chart: 108,
  bar: 18,
  affirmationCard: 280,
  icon: Object.freeze({ sm: 14, base: 18, md: 20, lg: 24, xl: 32 }),
  track: Object.freeze({ base: 6, thin: 3, line: 2 }),
  contentMax: 720,
});

export const breakpoints = Object.freeze({
  narrow: 320,
  phone: 360,
  wide: 480,
  web: 768,
  shortViewport: 400,
});

export const motion = Object.freeze({
  durations: Object.freeze({
    instant: 0,
    fast: 160,
    base: 280,
    line: 420,
    halo: 520,
    reveal: 550,
    scene: 900,
  }),
  spring: Object.freeze({
    damping: 16,
    stiffness: 170,
    mass: 0.7,
    useNativeDriver: true,
  }),
});

export const opacity = Object.freeze({
  pressed: 0.85,
  hovered: 0.94,
  disabled: 0.5,
  disabledCta: 0.45,
  decoration: 0.28,
  overlayIcon: 0.3,
});

export const elevation = Object.freeze({
  light: Object.freeze({
    e0: Object.freeze({}),
    e1: Object.freeze({
      shadowColor: '#1A1A2E',
      shadowOffset: Object.freeze({ width: 0, height: 1 }),
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 1,
    }),
    e2: Object.freeze({
      shadowColor: '#1A1A2E',
      shadowOffset: Object.freeze({ width: 0, height: 2 }),
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 3,
    }),
  }),
  dark: Object.freeze({
    e0: Object.freeze({}),
    e1: Object.freeze({
      shadowColor: '#000000',
      shadowOffset: Object.freeze({ width: 0, height: 1 }),
      shadowOpacity: 0.25,
      shadowRadius: 3,
      elevation: 1,
    }),
    e2: Object.freeze({
      shadowColor: '#000000',
      shadowOffset: Object.freeze({ width: 0, height: 2 }),
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 3,
    }),
  }),
});

// textMuted remains untouched for compatibility. These stronger aliases are for
// secondary copy rendered on surfaceAlt and meet WCAG AA at normal text size.
export const textMutedStrongByTheme = Object.freeze({
  midnight: '#8B95A7',
  violet: '#9C93BF',
  ember: '#A39588',
  forest: '#8FA396',
  paper: '#6B675D',
  cloud: '#5F6879',
  blossom: '#78616C',
  mono: '#909090',
});

const tokens = Object.freeze({
  typeFamilies,
  typography,
  spacing,
  radius,
  dimensions,
  breakpoints,
  motion,
  opacity,
  elevation,
  textMutedStrongByTheme,
});

export default tokens;
