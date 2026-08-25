import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import WelcomeVideo from '../../components/WelcomeVideo';
import { OnbScreen, ContinueButton } from './onboardingUI';
import { APP_NAME, ONB, SERIF } from '../../constants/brand';
import { UI } from '../../constants/i18n';
import { useApp } from '../../context/AppContext';

// O arquivo dura 10,04 s. Um segundo de margem cobre o evento `ended`, mas
// nunca deixa um poster parado parecer uma tela congelada.
const OPENING_FALLBACK_MS = 11000;

export default function WelcomeScreen({ navigation }) {
  const { state, setLang } = useApp();
  const lang = (state && state.lang) || 'en';
  const T = UI[lang];
  const [phase, setPhase] = useState('opening');
  const fade = useRef(new Animated.Value(0)).current;
  const finishedRef = useRef(false);
  const { width, height } = useWindowDimensions();
  const compactHeight = height < 400;

  const finishOpening = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setPhase('welcome');
    Animated.timing(fade, { toValue: 1, duration: 550, useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => {
    if (phase !== 'opening') return undefined;
    const fallback = setTimeout(finishOpening, OPENING_FALLBACK_MS);
    return () => clearTimeout(fallback);
  }, [finishOpening, phase]);

  if (phase === 'opening') {
    return (
      <View style={{ flex: 1, backgroundColor: ONB.welcomeBackground }}>
        <WelcomeVideo
          width={width}
          height={height}
          lang={lang}
          fullBleed
          loop={false}
          onFinished={finishOpening}
          onPlaybackIssue={finishOpening}
        />
        <SafeAreaView
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <Pressable
            testID="celeste-opening-skip"
            accessibilityRole="button"
            accessibilityLabel={lang === 'pt' ? 'Pular abertura' : 'Skip opening'}
            onPress={finishOpening}
            style={({ pressed }) => ({
              alignSelf: 'flex-end',
              width: 44,
              height: 44,
              marginTop: 10,
              marginRight: 14,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(28,46,79,0.72)',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons name="chevron-forward" size={23} color={ONB.inkOn} />
          </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <OnbScreen colors={[ONB.welcomeBackground, ONB.welcomeBackground]}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 10 }}>
        {['en', 'pt'].map((language) => (
          <Pressable
            key={language}
            accessibilityRole="button"
            onPress={() => setLang(language)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 7,
              borderRadius: 999,
              marginLeft: 8,
              backgroundColor: lang === language ? ONB.ink : ONB.track,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: lang === language ? ONB.inkOn : ONB.ink,
              }}
            >
              {language.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingHorizontal: 28,
            paddingBottom: compactHeight ? 8 : 16,
          }}
        >
          <Text
            style={{
              maxWidth: 520,
              fontFamily: SERIF,
              fontSize: compactHeight ? 21 : 27,
              lineHeight: compactHeight ? 28 : 36,
              color: ONB.ink,
              textAlign: 'center',
              marginBottom: compactHeight ? 4 : 10,
            }}
          >
            {T.tagline}
          </Text>
          <Text style={{ fontFamily: SERIF, fontSize: compactHeight ? 40 : 58, color: ONB.ink }}>
            {APP_NAME}
          </Text>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: compactHeight ? 10 : 28 }}>
          <ContinueButton label={T.continue} onPress={() => navigation.navigate('Referral')} />
          <Text
            style={{
              fontSize: compactHeight ? 10 : 12,
              color: ONB.ink,
              textAlign: 'center',
              marginTop: compactHeight ? 6 : 16,
              lineHeight: compactHeight ? 13 : 18,
            }}
          >
            {T.terms}
          </Text>
        </View>
      </Animated.View>
    </OnbScreen>
  );
}
