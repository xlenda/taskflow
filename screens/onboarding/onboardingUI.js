import React from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ONB, SERIF } from '../../constants/brand';

// Shared building blocks for the onboarding flow so every screen matches.
// All colors come from ONB tokens — no hardcoded hex here.

export function OnbScreen({ children, style, outerStyle, colors = ONB.gradient }) {
  const { height } = useWindowDimensions();
  const viewportStyle =
    Platform.OS === 'web'
      ? { width: '100%', height, maxHeight: height, minHeight: 0, overflow: 'hidden' }
      : { flex: 1 };
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[viewportStyle, outerStyle]}
    >
      <SafeAreaView style={[{ flex: 1, minHeight: 0, overflow: 'hidden' }, style]}>{children}</SafeAreaView>
    </LinearGradient>
  );
}

export function serifStyle(size = 30, extra = {}) {
  return { fontFamily: SERIF, fontSize: size, lineHeight: Math.round(size * 1.32), color: ONB.ink, ...extra };
}

export function ContinueButton({ label = 'Continue', onPress, disabled, dark, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: dark ? ONB.cta : '#FFFFFF',
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
          borderRadius: 999,
          paddingVertical: 18,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: ONB.shadow,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.25,
          shadowRadius: 14,
          elevation: 3,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: 17, fontWeight: '600', color: dark ? ONB.ctaInk : ONB.surfaceInk }}>{label}</Text>
    </Pressable>
  );
}

export function OptionPill({ label, active, onPress, style, multiple = false }) {
  return (
    <Pressable
      accessibilityRole={multiple ? 'checkbox' : 'button'}
      accessibilityState={multiple ? { checked: !!active } : undefined}
      aria-checked={multiple ? !!active : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: active ? ONB.ink : ONB.pillStrong,
          borderRadius: 999,
          paddingHorizontal: 22,
          paddingVertical: 14,
          alignSelf: 'flex-start',
          maxWidth: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 12,
          opacity: pressed ? 0.85 : 1,
          shadowColor: ONB.shadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.18,
          shadowRadius: 10,
          elevation: 2,
        },
        style,
      ]}
    >
      {multiple ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={{ width: 18, height: 18, marginRight: 9, alignItems: 'center', justifyContent: 'center' }}
        >
          {active ? <Ionicons name="checkmark" size={17} color={ONB.inkOn} /> : null}
        </View>
      ) : null}
      <Text style={{ flexShrink: 1, fontSize: 16, color: active ? ONB.inkOn : ONB.surfaceInk }}>{label}</Text>
    </Pressable>
  );
}
