import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ONB, SERIF } from '../../constants/brand';

// Shared building blocks for the onboarding flow so every screen matches.
// All colors come from ONB tokens — no hardcoded hex here.

export function OnbScreen({ children, style }) {
  return (
    <LinearGradient colors={ONB.gradient} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ flex: 1 }}>
      <SafeAreaView style={[{ flex: 1 }, style]}>{children}</SafeAreaView>
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

export function OptionPill({ label, active, onPress, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: active ? ONB.ink : ONB.pillStrong,
          borderRadius: 999,
          paddingHorizontal: 22,
          paddingVertical: 14,
          alignSelf: 'flex-start',
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
      <Text style={{ fontSize: 16, color: active ? ONB.inkOn : ONB.surfaceInk }}>{label}</Text>
    </Pressable>
  );
}
