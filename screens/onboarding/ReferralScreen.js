import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Platform, KeyboardAvoidingView } from 'react-native';
import { OnbScreen, ContinueButton, serifStyle } from './onboardingUI';
import { ONB } from '../../constants/brand';
import { UI } from '../../constants/i18n';
import { useApp } from '../../context/AppContext';

export default function ReferralScreen({ navigation }) {
  const { state, saveProfile } = useApp();
  const T = UI[(state && state.lang) || 'en'];
  const [code, setCode] = useState('');

  // Skip discards whatever was typed; only Continue saves the code.
  const skip = () => {
    navigation.navigate('Notifications');
  };

  const next = () => {
    if (code.trim()) saveProfile({ referralCode: code.trim() });
    navigation.navigate('Notifications');
  };

  return (
    <OnbScreen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 10 }}>
          <Pressable accessibilityRole="button" onPress={skip} hitSlop={12}>
            <Text style={{ fontSize: 16, color: ONB.inkSoft }}>{T.skip}</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 26 }}>
          <Text style={serifStyle(32)}>{T.referralTitle}</Text>
          <Text style={{ fontSize: 16, color: ONB.inkSoft, marginTop: 10 }}>{T.referralSub}</Text>
          <View
            style={{
              backgroundColor: ONB.pill,
              borderRadius: 20,
              marginTop: 28,
              paddingHorizontal: 22,
              height: 62,
              justifyContent: 'center',
            }}
          >
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder={T.referralPh}
              placeholderTextColor={ONB.surfaceSoft}
              autoCapitalize="characters"
              style={[{ fontSize: 16, color: ONB.surfaceInk }, Platform.OS === 'web' ? { outlineStyle: 'none' } : null]}
              onSubmitEditing={next}
            />
          </View>
        </View>
        <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
          <ContinueButton label={T.continue} onPress={next} />
        </View>
      </KeyboardAvoidingView>
    </OnbScreen>
  );
}
