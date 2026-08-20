import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import Typewriter from '../../components/Typewriter';
import { OnbScreen, ContinueButton, serifStyle } from './onboardingUI';
import { APP_NAME, ONB, SERIF } from '../../constants/brand';
import { UI } from '../../constants/i18n';
import { useApp } from '../../context/AppContext';

// Phase 1: the tagline types out. Phase 2: the app name + CTA fade in.
// The EN/PT toggle is for testing both languages — it persists in state.lang.
export default function WelcomeScreen({ navigation }) {
  const { state, setLang } = useApp();
  const lang = (state && state.lang) || 'en';
  const T = UI[lang];
  const [phase, setPhase] = useState(1);
  const [instant, setInstant] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const phaseTimer = useRef(null);
  const tagline = useMemo(() => [T.tagline], [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cancel any pending phase switch when the language changes (the tagline
  // restarts from zero via key={lang}) and on unmount — a stale timer would
  // cut the new tagline mid-typing.
  useEffect(() => {
    clearTimeout(phaseTimer.current);
    return () => clearTimeout(phaseTimer.current);
  }, [lang]);

  const toPhase2 = () => {
    clearTimeout(phaseTimer.current);
    phaseTimer.current = setTimeout(() => {
      setPhase(2);
      Animated.timing(fade, { toValue: 1, duration: 700, useNativeDriver: true }).start();
    }, 900);
  };

  return (
    <OnbScreen>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 10 }}>
        {['en', 'pt'].map((l) => (
          <Pressable
            key={l}
            accessibilityRole="button"
            onPress={() => setLang(l)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 999,
              marginLeft: 8,
              backgroundColor: lang === l ? ONB.ink : ONB.track,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: lang === l ? ONB.inkOn : ONB.inkSoft }}>
              {l.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={{ flex: 1 }} onPress={() => setInstant(true)}>
        {phase === 1 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
            <Typewriter
              key={lang}
              lines={tagline}
              instant={instant}
              textStyle={serifStyle(28, { textAlign: 'center' })}
              onDone={toPhase2}
            />
          </View>
        ) : (
          <Animated.View style={{ flex: 1, opacity: fade }}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: SERIF, fontSize: 52, color: ONB.ink }}>{APP_NAME}</Text>
            </View>
            <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
              <ContinueButton label={T.continue} onPress={() => navigation.navigate('Referral')} />
              <Text style={{ fontSize: 12, color: ONB.inkFaint, textAlign: 'center', marginTop: 16, lineHeight: 18 }}>
                {T.terms}
              </Text>
            </View>
          </Animated.View>
        )}
      </Pressable>
    </OnbScreen>
  );
}
