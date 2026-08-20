import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Typewriter from '../../components/Typewriter';
import { OnbScreen, ContinueButton, serifStyle } from './onboardingUI';
import { ONB } from '../../constants/brand';
import { UI } from '../../constants/i18n';
import { useApp } from '../../context/AppContext';

// On native this is where the App Store review prompt fires (StoreReview later).
export default function GrowScreen({ navigation }) {
  const { state } = useApp();
  const lang = (state && state.lang) || 'en';
  const T = UI[lang];
  const [instant, setInstant] = useState(false);
  const lines = useMemo(() => [T.grow], [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <OnbScreen>
      <Pressable style={{ flex: 1 }} onPress={() => setInstant(true)}>
        <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 120 }}>
          <Typewriter key={lang} lines={lines} instant={instant} textStyle={serifStyle(30)} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                width: 240,
                height: 160,
                borderRadius: 36,
                backgroundColor: ONB.bubble,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: ONB.shadow,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.2,
                shadowRadius: 18,
                elevation: 3,
              }}
            >
              <Ionicons name="heart" size={64} color={ONB.heart} />
            </View>
          </View>
        </View>
      </Pressable>
      <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
        <ContinueButton label={T.continue} onPress={() => navigation.navigate('ChatOnboarding')} />
      </View>
    </OnbScreen>
  );
}
