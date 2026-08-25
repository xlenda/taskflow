import React from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from './theme';

function shadow(theme) {
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
  const inner =
    props.scroll === false
      ? React.createElement(
          View,
          { style: [{ flex: 1, paddingHorizontal: padding }, props.style] },
          props.children
        )
      : React.createElement(
          ScrollView,
          {
            style: { flex: 1 },
            contentContainerStyle: [
              { paddingHorizontal: padding, paddingBottom: 96 },
              props.style,
            ],
            showsVerticalScrollIndicator: false,
          },
          props.children
        );
  return React.createElement(
    SafeAreaView,
    {
      testID: props.testID,
      style: { flex: 1, backgroundColor: theme.bg },
      edges: ['top'],
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
                theme.font.caption,
                {
                  color: theme.accent,
                  textTransform: 'uppercase',
                  letterSpacing: 1.2,
                  marginBottom: 4,
                },
              ],
            },
            props.eyebrow
          )
        : null,
      React.createElement(Text, { style: [theme.font.title, { color: theme.text }] }, props.title),
      props.subtitle
        ? React.createElement(
            Text,
            { style: [theme.font.body, { color: theme.textMuted, marginTop: 4 }] },
            props.subtitle
          )
        : null
    ),
    props.right || null
  );
}

export function Card(props) {
  const theme = useTheme();
  const style = [
    {
      backgroundColor: theme.surface,
      borderRadius: theme.radius.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.sm + 4,
      borderWidth: 1,
      borderColor: theme.border,
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
        accessibilityRole: props.accessibilityRole,
        accessibilityLabel: props.accessibilityLabel,
        accessibilityHint: props.accessibilityHint,
        accessibilityState: props.accessibilityState,
        style: ({ pressed }) => [
          style,
          pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
        ],
      },
      props.children
    );
  }
  return React.createElement(View, { style }, props.children);
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
  const variant = props.variant || 'primary';
  const backgroundColor =
    variant === 'primary' ? theme.accent : variant === 'soft' ? theme.accentSoft : 'transparent';
  const foreground =
    variant === 'primary' ? (theme.dark ? '#0B0E14' : '#FFFFFF') : theme.accent;
  return React.createElement(
    Pressable,
    {
      onPress: props.onPress,
      disabled: props.disabled || props.loading,
      style: ({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor,
          borderRadius: theme.radius.md,
          paddingVertical: 14,
          paddingHorizontal: theme.spacing.lg,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: theme.border,
          opacity: props.disabled ? 0.5 : 1,
          marginVertical: theme.spacing.xs,
        },
        pressed && { opacity: 0.85 },
        props.style,
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
          { style: [theme.font.label, { color: foreground, fontSize: 15 }] },
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
          theme.font.heading,
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
              theme.font.body,
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
