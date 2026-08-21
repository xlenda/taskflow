import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from './theme';

// Wron UI kit. Every component reads the active theme — screens built from
// these are automatically cohesive, and a dark-mode toggle is one setTheme call.

function shadow(t) {
  return t.dark
    ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 3 }
    : { shadowColor: '#1A1A2E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 3 };
}

// Deterministic color from a string → one of the theme's accent hues. Icons and
// badges auto-vary by category WITHOUT relying on the model to pass colors, so a
// screen of icons is vibrant and multi-colored by default, never all one hue.
function hueFor(t, seed) {
  var s = String(seed || '');
  var h = 0;
  for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return t.accents[h % t.accents.length];
}

// Safe percentage: 0 when the denominator is 0/missing, so a brand-new app with
// no history shows 0% instead of NaN%. Use for EVERY ratio/progress calculation.
export function pct(done, total) {
  var d = Number(done) || 0;
  var t = Number(total) || 0;
  if (t <= 0) return 0;
  var p = Math.round((d / t) * 100);
  return p < 0 ? 0 : p > 100 ? 100 : p;
}

// Coerce anything non-finite to a safe fallback — guards displayed numbers.
function num(v, fallback) {
  var n = Number(v);
  return isFinite(n) ? n : (fallback || 0);
}

export function Screen(props) {
  const t = useTheme();
  const pad = props.padded === false ? 0 : t.spacing.md;
  const inner = props.scroll === false
    ? React.createElement(View, { style: [{ flex: 1, paddingHorizontal: pad }, props.style] }, props.children)
    : React.createElement(ScrollView, {
        style: { flex: 1 },
        contentContainerStyle: [{ paddingHorizontal: pad, paddingBottom: 96 }, props.style],
        showsVerticalScrollIndicator: false,
      }, props.children);
  return React.createElement(SafeAreaView, { style: { flex: 1, backgroundColor: t.bg }, edges: ['top'] }, inner);
}

export function Header(props) {
  const t = useTheme();
  return React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: t.spacing.lg } },
    React.createElement(View, { style: { flex: 1, paddingRight: t.spacing.md } },
      props.eyebrow ? React.createElement(Text, { style: [t.font.caption, { color: t.accent, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }] }, props.eyebrow) : null,
      React.createElement(Text, { style: [t.font.title, { color: t.text }] }, props.title),
      props.subtitle ? React.createElement(Text, { style: [t.font.body, { color: t.textMuted, marginTop: 4 }] }, props.subtitle) : null
    ),
    props.right || null
  );
}

export function HeroCard(props) {
  const t = useTheme();
  const colors = props.colors || [t.accent, t.accents[1] || t.accent];
  return React.createElement(LinearGradient, {
    colors: colors, start: { x: 0, y: 0 }, end: { x: 1, y: 1 },
    style: [{ borderRadius: t.radius.xl, padding: t.spacing.lg, marginBottom: t.spacing.lg }, shadow(t), props.style],
  }, props.children);
}

export function Card(props) {
  const t = useTheme();
  const style = [
    { backgroundColor: t.surface, borderRadius: t.radius.lg, padding: t.spacing.md, marginBottom: t.spacing.sm + 4, borderWidth: 1, borderColor: t.border },
    shadow(t), props.style,
  ];
  if (props.onPress) {
    return React.createElement(Pressable, {
      onPress: props.onPress,
      accessibilityRole: props.accessibilityRole,
      accessibilityLabel: props.accessibilityLabel,
      style: function (s) { return [style, s.pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]; },
    }, props.children);
  }
  return React.createElement(View, { style: style }, props.children);
}

export function SectionTitle(props) {
  const t = useTheme();
  return React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: t.spacing.md, marginBottom: t.spacing.sm } },
    React.createElement(Text, { style: [t.font.heading, { color: t.text }] }, props.title),
    props.action ? React.createElement(Pressable, { onPress: props.onAction }, React.createElement(Text, { style: [t.font.label, { color: t.accent }] }, props.action)) : null
  );
}

export function IconBadge(props) {
  const t = useTheme();
  // Explicit color wins; otherwise auto-vary by icon name so categories are
  // multi-colored by default instead of all one accent.
  const color = props.color || hueFor(t, props.icon);
  const size = props.size || 40;
  return React.createElement(View, {
    style: { width: size, height: size, borderRadius: t.radius.md, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' },
  }, React.createElement(Ionicons, { name: props.icon, size: size * 0.5, color: color }));
}

export function StatTile(props) {
  const t = useTheme();
  // One color per tile, auto-varied by its icon/label so a row of stats is
  // multi-colored by default; icon badge and unit share it.
  const c = props.color || hueFor(t, props.icon || props.label);
  // Non-finite numbers (NaN from a 0/0 division) render as '0', never "NaN".
  const shown = (typeof props.value === 'number' && !isFinite(props.value)) ? '0' : String(props.value == null ? '0' : props.value);
  return React.createElement(Card, { style: [{ flex: 1, alignItems: 'flex-start' }, props.style] },
    React.createElement(IconBadge, { icon: props.icon, color: c, size: 34 }),
    React.createElement(Text, { style: [t.font.title, { color: t.text, marginTop: t.spacing.sm }] },
      shown,
      props.unit ? React.createElement(Text, { style: [t.font.label, { color: c }] }, ' ' + props.unit) : null
    ),
    React.createElement(Text, { style: [t.font.caption, { color: t.textMuted, marginTop: 2 }] }, props.label)
  );
}

export function Row(props) {
  const t = useTheme();
  const inner = React.createElement(View, { style: { flexDirection: 'row', alignItems: 'center' } },
    props.icon ? React.createElement(IconBadge, { icon: props.icon, color: props.color }) : null,
    React.createElement(View, { style: { flex: 1, marginLeft: props.icon ? t.spacing.sm + 4 : 0 } },
      React.createElement(Text, { style: [t.font.body, { color: t.text, fontWeight: '600' }] }, props.title),
      props.subtitle ? React.createElement(Text, { style: [t.font.caption, { color: t.textMuted, marginTop: 2 }] }, props.subtitle) : null
    ),
    props.right !== undefined ? props.right : (props.onPress ? React.createElement(Ionicons, { name: 'chevron-forward', size: 18, color: t.textMuted }) : null)
  );
  return React.createElement(Card, { onPress: props.onPress, style: props.style }, inner);
}

export function Chip(props) {
  const t = useTheme();
  const color = props.color || t.accent;
  const active = !!props.active;
  return React.createElement(Pressable, {
    onPress: props.onPress,
    style: function (s) {
      return [{
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: t.radius.pill, marginRight: t.spacing.sm,
        backgroundColor: active ? color : t.surfaceAlt, borderWidth: 1, borderColor: active ? color : t.border,
      }, s.pressed && { opacity: 0.8 }];
    },
  }, React.createElement(Text, { style: [t.font.label, { color: active ? (t.dark ? '#0B0E14' : '#FFFFFF') : t.textMuted }] }, props.label));
}

export function Button(props) {
  const t = useTheme();
  const variant = props.variant || 'primary';
  const bg = variant === 'primary' ? t.accent : variant === 'soft' ? t.accentSoft : 'transparent';
  const fg = variant === 'primary' ? (t.dark ? '#0B0E14' : '#FFFFFF') : t.accent;
  return React.createElement(Pressable, {
    onPress: props.onPress, disabled: props.disabled || props.loading,
    style: function (s) {
      return [{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg, borderRadius: t.radius.md, paddingVertical: 14, paddingHorizontal: t.spacing.lg,
        borderWidth: variant === 'ghost' ? 1 : 0, borderColor: t.border,
        opacity: props.disabled ? 0.5 : 1, marginVertical: t.spacing.xs,
      }, s.pressed && { opacity: 0.85 }, props.style];
    },
  },
    props.loading ? React.createElement(ActivityIndicator, { size: 'small', color: fg }) : null,
    props.icon && !props.loading ? React.createElement(Ionicons, { name: props.icon, size: 17, color: fg, style: { marginRight: 7 } }) : null,
    props.loading ? null : React.createElement(Text, { style: [t.font.label, { color: fg, fontSize: 15 }] }, props.label)
  );
}

export function EmptyState(props) {
  const t = useTheme();
  return React.createElement(View, { style: { alignItems: 'center', paddingVertical: t.spacing.xl * 1.5, paddingHorizontal: t.spacing.lg } },
    React.createElement(IconBadge, { icon: props.icon || 'sparkles-outline', size: 56, color: props.color }),
    React.createElement(Text, { style: [t.font.heading, { color: t.text, marginTop: t.spacing.md, textAlign: 'center' }] }, props.title),
    props.body ? React.createElement(Text, { style: [t.font.body, { color: t.textMuted, marginTop: t.spacing.sm, textAlign: 'center', lineHeight: 21 }] }, props.body) : null,
    props.actionLabel ? React.createElement(Button, { label: props.actionLabel, onPress: props.onAction, style: { marginTop: t.spacing.lg, alignSelf: 'stretch' } }) : null
  );
}

export function ProgressBar(props) {
  const t = useTheme();
  const value = Math.max(0, Math.min(1, num(props.value, 0)));
  return React.createElement(View, { style: [{ height: props.height || 8, borderRadius: t.radius.pill, backgroundColor: t.surfaceAlt, overflow: 'hidden' }, props.style] },
    React.createElement(View, { style: { width: (value * 100) + '%', height: '100%', borderRadius: t.radius.pill, backgroundColor: props.color || t.accent } })
  );
}

export function BarChart(props) {
  const t = useTheme();
  const data = props.data || [];
  const max = Math.max.apply(null, data.map(function (d) { return num(d.value, 0); }).concat([1]));
  const h = props.height || 120;
  return React.createElement(View, { style: { flexDirection: 'row', alignItems: 'flex-end', height: h + 24, gap: 8 } },
    data.map(function (d, i) {
      const barH = Math.max(4, (num(d.value, 0) / max) * h);
      return React.createElement(View, { key: String(i), style: { flex: 1, alignItems: 'center' } },
        React.createElement(View, { style: { width: '100%', maxWidth: 34, height: barH, borderRadius: 6, backgroundColor: d.color || t.accents[i % t.accents.length] } }),
        React.createElement(Text, { style: [t.font.caption, { color: t.textMuted, marginTop: 6, fontSize: 10 }] }, d.label)
      );
    })
  );
}

export function Badge(props) {
  const t = useTheme();
  const color = props.color || t.accent;
  return React.createElement(View, { style: { backgroundColor: color + '22', borderRadius: t.radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' } },
    React.createElement(Text, { style: [t.font.caption, { color: color, fontWeight: '700' }] }, props.label)
  );
}

export function Avatar(props) {
  const t = useTheme();
  const size = props.size || 40;
  const initials = (props.name || '?').split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
  const color = props.color || t.accents[(props.name || '').length % t.accents.length];
  return React.createElement(View, { style: { width: size, height: size, borderRadius: size / 2, backgroundColor: color + '33', alignItems: 'center', justifyContent: 'center' } },
    React.createElement(Text, { style: { color: color, fontWeight: '700', fontSize: size * 0.38 } }, initials)
  );
}

export function FAB(props) {
  const t = useTheme();
  return React.createElement(Pressable, {
    onPress: props.onPress,
    style: function (s) {
      return [{
        position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
        backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center',
      }, shadow(t), s.pressed && { transform: [{ scale: 0.94 }] }];
    },
  }, React.createElement(Ionicons, { name: props.icon || 'add', size: 26, color: t.dark ? '#0B0E14' : '#FFFFFF' }));
}

export function Divider() {
  const t = useTheme();
  return React.createElement(View, { style: { height: 1, backgroundColor: t.border, marginVertical: t.spacing.md } });
}
