import React, { useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnbScreen, ContinueButton, serifStyle } from './onboardingUI';
import { ONB, SERIF } from '../../constants/brand';
import { useT } from '../../utils/useT';
import { useApp } from '../../context/AppContext';

// A recompensa do onboarding: ANTES de qualquer cobrança, a pessoa vê o próprio
// desejo transformado na primeira manifestação dela (criada no fim do chat) —
// afirmação real, do estado, com recibo honesto do que foi usado do que ela contou.

const S = {
  title: { en: 'Your first manifestation is ready.', pt: 'Sua primeira manifestação está pronta.' },
  receipt: { en: 'Made with what you told me:', pt: 'Feita com o que você contou:' },
  yourWish: { en: 'what you want to change', pt: 'o que você quer que mude' },
  cta: { en: 'Continue', pt: 'Continuar' },
};

// personalizedWith é gravado como rótulo em PT (dado do estado, não string de
// tela); aqui cada rótulo conhecido vira texto no idioma de quem lê.
const RECIBO = {
  'onde quer morar': { en: 'where you want to live', pt: 'onde quer morar' },
  'casa dos sonhos': { en: 'your dream home', pt: 'casa dos sonhos' },
  'quem importa pra você': { en: 'who matters to you', pt: 'quem importa pra você' },
  'o que travava você': { en: 'what was holding you back', pt: 'o que travava você' },
  'por que isso importa': { en: 'why it matters', pt: 'por que isso importa' },
};

export default function RevealScreen({ navigation, route }) {
  const { state } = useApp();
  const { t } = useT();

  const id = route.params && route.params.id;
  const list = (state && state.manifestations) || [];
  const m = list.find((x) => x.id === id) || list[0];

  // Deep-link em /revelacao sem manifestação criada → recomeça do início.
  useEffect(() => {
    if (!m) navigation.replace('Welcome');
  }, [m, navigation]);
  if (!m) return null;

  const itens = [t(S.yourWish)].concat(
    (m.personalizedWith || []).map((rotulo) => (RECIBO[rotulo] ? t(RECIBO[rotulo]) : rotulo))
  );

  return (
    <OnbScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
      >
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 24,
            backgroundColor: ONB.bubble,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
            shadowColor: ONB.shadow,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.18,
            shadowRadius: 16,
            elevation: 3,
          }}
        >
          <Ionicons name="sparkles" size={36} color={ONB.heart} />
        </View>

        <Text style={serifStyle(30)}>{t(S.title)}</Text>

        <View
          style={{
            backgroundColor: ONB.card,
            borderRadius: 24,
            padding: 24,
            marginTop: 24,
            shadowColor: ONB.shadow,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.2,
            shadowRadius: 24,
            elevation: 4,
          }}
        >
          <Text
            style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 22, lineHeight: 32, color: ONB.surfaceInk }}
          >
            “{m.affirmation}”
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 21, color: ONB.surfaceSoft, marginTop: 18 }}>
            {t(S.receipt)} {itens.join(' · ')}
          </Text>
        </View>

        <ContinueButton dark label={t(S.cta)} onPress={() => navigation.replace('Paywall')} style={{ marginTop: 28 }} />
      </ScrollView>
    </OnbScreen>
  );
}
