import React, { useMemo, useState } from 'react';
import { View, Pressable } from 'react-native';
import Typewriter from '../../components/Typewriter';
import { OnbScreen, ContinueButton, serifStyle } from './onboardingUI';
import { APP_NAME } from '../../constants/brand';
import { UI } from '../../constants/i18n';
import { useApp } from '../../context/AppContext';

// On native this is where the OS notification permission prompt will fire —
// wire expo-notifications here later. For now it's the styled interstitial.
export default function NotificationsScreen({ navigation }) {
  const { state } = useApp();
  const lang = (state && state.lang) || 'en';
  const T = UI[lang];
  const [typed, setTyped] = useState(false);
  const [instant, setInstant] = useState(false);
  const lines = useMemo(() => [T.notifs.replace('{app}', APP_NAME)], [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <OnbScreen>
      <Pressable style={{ flex: 1 }} onPress={() => setInstant(true)}>
        <View style={{ flex: 1, paddingHorizontal: 26, paddingTop: 120 }}>
          <Typewriter key={lang} lines={lines} instant={instant} textStyle={serifStyle(30)} onDone={() => setTyped(true)} />
        </View>
      </Pressable>
      <View style={{ paddingHorizontal: 20, paddingBottom: 28, opacity: typed ? 1 : 0 }}>
        <ContinueButton label={T.continue} onPress={() => navigation.navigate('Grow')} disabled={!typed} />
      </View>
    </OnbScreen>
  );
}
