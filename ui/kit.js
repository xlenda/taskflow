import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

function shadow(theme) {
  if (theme.elevation && theme.elevation.e2) return theme.elevation.e2;
  return theme.dark
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 3,
      }
    : {
        shadowColor: '#1A1A2E',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 3,
      };
}

function touchTarget(theme) {
  if (Platform.OS === 'android') return theme.size.touchAndroid;
  if (Platform.OS === 'ios') return theme.size.touchIos;
  return theme.size.touchWeb;
}

function webFocus(theme, focused) {
  if (Platform.OS !== 'web' || !focused) return null;
  return {
    outlineColor: theme.accent,
    outlineOffset: 2,
    outlineStyle: 'solid',
    outlineWidth: 2,
  };
}

function hueFor(theme, seed) {
  const value = String(seed || '');
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return theme.accents[hash % theme.accents.length];
}

export function pct(done, total) {
  const numerator = Number(done) || 0;
  const denominator = Number(total) || 0;
  if (denominator <= 0) return 0;
  const percent = Math.round((numerator / denominator) * 100);
  return Math.max(0, Math.min(100, percent));
}

export function Screen(props) {
  const theme = useTheme();
  const padding = props.padded === false ? 0 : theme.spacing.md;
  const contentFrame = {
    alignSelf: 'center',
    maxWidth: theme.spacing.contentMax,
    width: '100%',
  };
  const inner =
    props.scroll === false
      ? React.createElement(
          View,
          {
            style: [{ flex: 1, paddingHorizontal: padding }, contentFrame, props.style],
          },
          props.children
        )
      : React.createElement(
          ScrollView,
          {
            style: [
              { flex: 1, minHeight: 0 },
              Platform.OS === 'web' ? { height: '100%', overflowY: 'auto', overflowX: 'hidden' } : null,
            ],
            contentContainerStyle: [
              {
                paddingHorizontal: padding,
                paddingBottom: theme.spacing.tabClearance,
              },
              contentFrame,
              props.style,
              props.contentContainerStyle,
            ],
            showsVerticalScrollIndicator: false,
            keyboardShouldPersistTaps: props.keyboardShouldPersistTaps,
          },
          props.children
        );
  return React.createElement(
    SafeAreaView,
    {
      testID: props.testID,
      style: [
        { flex: 1, minHeight: 0, backgroundColor: theme.bg },
        Platform.OS === 'web'
          ? { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' }
          : { overflow: 'hidden' },
      ],
      edges: props.edges || ['top'],
    },
    inner
  );
}

export function Header(props) {
  const theme = useTheme();
  return React.createElement(
    View,
    {
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.lg,
      },
    },
    React.createElement(
      View,
      { style: { flex: 1, paddingRight: theme.spacing.md } },
      props.eyebrow
        ? React.createElement(
            Text,
            {
              style: [
                theme.typography.eyebrow,
                {
                  color: theme.accent,
                  marginBottom: 4,
                },
              ],
            },
            props.eyebrow
          )
        : null,
      React.createElement(
        Text,
        {
          accessibilityRole: 'header',
          style: [theme.typography.title, { color: theme.text }],
        },
        props.title
      ),
      props.subtitle
        ? React.createElement(
            Text,
            {
              style: [theme.typography.body, { color: theme.textMuted, marginTop: 4 }],
            },
            props.subtitle
          )
        : null
    ),
    props.right || null
  );
}

export function Card(props) {
  const theme = useTheme();
  const [focused, setFocused] = React.useState(false);
  const disabled = props.disabled === true || props.accessibilityState?.disabled === true;
  const selected =
    props.selected === undefined ? props.accessibilityState?.selected : props.selected === true;
  const tone = props.tone || 'surface';
  const backgroundColor =
    tone === 'alt' ? theme.surfaceAlt : tone === 'accent' ? theme.accentSoft : theme.surface;
  const style = [
    {
      backgroundColor,
      borderRadius: theme.radius.card || theme.radius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm + 4,
      borderWidth: selected ? 2 : 1,
      borderColor: selected ? theme.accent : theme.border,
      opacity: disabled ? theme.opacity.disabled : 1,
    },
    shadow(theme),
    props.style,
  ];
  if (props.onPress) {
    return React.createElement(
      Pressable,
      {
        testID: props.testID,
        onPress: props.onPress,
        onLongPress: props.onLongPress,
        disabled,
        focusable: props.focusable !== false,
        onFocus: (event) => {
          setFocused(true);
          if (props.onFocus) props.onFocus(event);
        },
        onBlur: (event) => {
          setFocused(false);
          if (props.onBlur) props.onBlur(event);
        },
        accessibilityRole: props.accessibilityRole || 'button',
        accessibilityLabel: props.accessibilityLabel,
        accessibilityHint: props.accessibilityHint,
        accessibilityState: {
          ...props.accessibilityState,
          disabled,
          ...(selected === undefined ? null : { selected: Boolean(selected) }),
        },
        hitSlop: props.hitSlop,
        style: ({ pressed, hovered }) => [
          style,
          { minHeight: touchTarget(theme) },
          Platform.OS === 'web'
            ? { cursor: disabled ? 'not-allowed' : 'pointer' }
            : null,
          hovered && !disabled ? { opacity: theme.opacity.hovered } : null,
          pressed && !disabled
            ? { opacity: theme.opacity.pressed, transform: [{ scale: 0.99 }] }
            : null,
          webFocus(theme, focused),
        ],
      },
      props.children
    );
  }
  return React.createElement(
    View,
    {
      style,
      testID: props.testID,
      accessibilityLabel: props.accessibilityLabel,
      accessibilityHint: props.accessibilityHint,
    },
    props.children
  );
}

function IconBadge(props) {
  const theme = useTheme();
  const color = props.color || hueFor(theme, props.icon);
  const size = props.size || 40;
  return React.createElement(
    View,
    {
      style: {
        width: size,
        height: size,
        borderRadius: theme.radius.md,
        backgroundColor: `${color}22`,
        alignItems: 'center',
        justifyContent: 'center',
      },
    },
    React.createElement(Ionicons, { name: props.icon, size: size * 0.5, color })
  );
}

export function Button(props) {
  const theme = useTheme();
  const [focused, setFocused] = React.useState(false);
  const variant = props.variant || 'primary';
  const disabled =
    props.disabled === true ||
    props.loading === true ||
    props.accessibilityState?.disabled === true;
  const selected =
    props.selected === undefined ? props.accessibilityState?.selected : props.selected === true;
  const backgroundColor =
    variant === 'primary'
      ? theme.accent
      : variant === 'soft' || selected
        ? theme.accentSoft
        : 'transparent';
  const foreground =
    variant === 'primary' ? theme.accentInk : theme.accent;
  return React.createElement(
    Pressable,
    {
      testID: props.testID,
      onPress: props.onPress,
      onLongPress: props.onLongPress,
      disabled,
      focusable: props.focusable !== false,
      onFocus: (event) => {
        setFocused(true);
        if (props.onFocus) props.onFocus(event);
      },
      onBlur: (event) => {
        setFocused(false);
        if (props.onBlur) props.onBlur(event);
      },
      accessibilityRole: 'button',
      accessibilityLabel: props.accessibilityLabel || props.label,
      accessibilityHint: props.accessibilityHint,
      accessibilityState: {
        ...props.accessibilityState,
        disabled,
        busy: props.loading === true || props.accessibilityState?.busy === true,
        ...(selected === undefined ? null : { selected: Boolean(selected) }),
      },
      hitSlop: props.hitSlop,
      style: ({ pressed, hovered }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor,
          borderRadius: theme.radius.cta || theme.radius.md,
          minHeight: touchTarget(theme),
          paddingVertical: 14,
          paddingHorizontal: theme.spacing.lg,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: theme.border,
          opacity: disabled ? theme.opacity.disabled : 1,
          marginVertical: theme.spacing.xs,
        },
        Platform.OS === 'web'
          ? { cursor: disabled ? 'not-allowed' : 'pointer' }
          : null,
        hovered && !disabled ? { opacity: theme.opacity.hovered } : null,
        pressed && !disabled ? { opacity: theme.opacity.pressed } : null,
        props.style,
        webFocus(theme, focused),
      ],
    },
    props.loading ? React.createElement(ActivityIndicator, { size: 'small', color: foreground }) : null,
    props.icon && !props.loading
      ? React.createElement(Ionicons, {
          name: props.icon,
          size: 17,
          color: foreground,
          style: { marginRight: 7 },
        })
      : null,
    props.loading
      ? null
      : React.createElement(
          Text,
          { style: [theme.typography.label, { color: foreground, fontSize: 15 }] },
          props.label
        )
  );
}

export function EmptyState(props) {
  const theme = useTheme();
  return React.createElement(
    View,
    {
      style: {
        alignItems: 'center',
        paddingVertical: theme.spacing.xl * 1.5,
        paddingHorizontal: theme.spacing.lg,
      },
    },
    React.createElement(IconBadge, {
      icon: props.icon || 'sparkles-outline',
      size: 56,
      color: props.color,
    }),
    React.createElement(
      Text,
      {
        style: [
          theme.typography.heading,
          { color: theme.text, marginTop: theme.spacing.md, textAlign: 'center' },
        ],
      },
      props.title
    ),
    props.body
      ? React.createElement(
          Text,
          {
            style: [
              theme.typography.body,
              {
                color: theme.textMuted,
                marginTop: theme.spacing.sm,
                textAlign: 'center',
                lineHeight: 21,
              },
            ],
          },
          props.body
        )
      : null,
    props.actionLabel
      ? React.createElement(Button, {
          label: props.actionLabel,
          onPress: props.onAction,
          style: { marginTop: theme.spacing.lg, alignSelf: 'stretch' },
        })
      : null
  );
}
