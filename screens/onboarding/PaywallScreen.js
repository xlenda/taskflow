import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { OnbScreen } from './onboardingUI';
import { APP_NAME, ONB, SERIF } from '../../constants/brand';
import { UI } from '../../constants/i18n';
import { useApp } from '../../context/AppContext';

const DEADLINE_KEY = '@celeste_paywall_deadline';

function fmt(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Placeholder paywall — wire react-native-purchases (RevenueCat) here later.
// "Try for free" and "Restore" both unlock the app for now.
export default function PaywallScreen() {
  const { state, completeOnboarding } = useApp();
  const T = UI[(state && state.lang) || 'en'];
  const [left, setLeft] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      let deadline = null;
      try {
        const raw = await AsyncStorage.getItem(DEADLINE_KEY);
        const parsed = raw ? parseInt(raw, 10) : NaN;
        if (Number.isFinite(parsed)) deadline = parsed;
      } catch (e) {
        // ignore — fall through to a fresh deadline
      }
      if (!deadline) {
        deadline = Date.now() + 3 * 3600 * 1000;
        AsyncStorage.setItem(DEADLINE_KEY, String(deadline)).catch(() => {});
      }
      if (cancelled) return;
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setLeft(remaining);
        if (remaining <= 0) clearInterval(timer.current);
      };
      tick();
      timer.current = setInterval(tick, 1000);
    };
    start();
    return () => {
      cancelled = true;
      clearInterval(timer.current);
    };
  }, []);

  const p = (s) => s.replace(/\{app\}/g, APP_NAME);

  return (
    <OnbScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 24 }}
      >
        <View
          style={{
            backgroundColor: ONB.card,
            borderRadius: 30,
            padding: 24,
            paddingTop: 28,
            shadowColor: ONB.shadow,
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: 0.25,
            shadowRadius: 30,
            elevation: 6,
          }}
        >
          {left !== null && left > 0 ? (
            <View
              style={{
                backgroundColor: ONB.badgeBg,
                borderRadius: 999,
                paddingVertical: 12,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
              }}
            >
              <Text style={{ fontSize: 15, color: ONB.badgeText }}>{T.pwExpire}</Text>
              <Text style={{ fontSize: 16, color: ONB.badgeText, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {fmt(left)}
              </Text>
            </View>
          ) : null}

          <Text style={{ fontFamily: SERIF, fontSize: 30, fontStyle: 'italic', color: ONB.surfaceInk, marginBottom: 18 }}>
            {T.pwNote}
          </Text>

          <Text style={{ fontSize: 16.5, lineHeight: 25, color: ONB.surfaceInk, marginBottom: 16 }}>{p(T.pwP1)}</Text>
          <Text style={{ fontSize: 16.5, lineHeight: 25, color: ONB.surfaceInk, marginBottom: 16 }}>{p(T.pwP2)}</Text>
          <Text style={{ fontSize: 16.5, lineHeight: 25, color: ONB.surfaceInk, marginBottom: 24 }}>{p(T.pwP3)}</Text>

          <Pressable
            onPress={completeOnboarding}
            style={({ pressed }) => [
              {
                backgroundColor: ONB.cta,
                borderRadius: 999,
                paddingVertical: 19,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ fontSize: 19, color: ONB.ctaInk, fontWeight: '600' }}>{p(T.pwCta)}</Text>
            <Ionicons name="arrow-forward" size={20} color={ONB.ctaInk} style={{ marginLeft: 10 }} />
          </Pressable>

          <Text style={{ fontSize: 14, color: ONB.surfaceInk, textAlign: 'center', marginTop: 14 }}>{T.pwPrice}</Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, marginTop: 22 }}>
            <Text style={{ fontSize: 15, color: ONB.surfaceFaint }}>{T.pwPrivacy}</Text>
            <Text style={{ fontSize: 15, color: ONB.surfaceFaint }}>{T.pwTerms}</Text>
            <Pressable onPress={completeOnboarding}>
              <Text style={{ fontSize: 15, color: ONB.surfaceFaint }}>{T.pwRestore}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </OnbScreen>
  );
}
