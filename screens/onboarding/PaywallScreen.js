import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnbScreen } from './onboardingUI';
import { APP_NAME, ONB, SERIF } from '../../constants/brand';
import { UI } from '../../constants/i18n';
import { useT } from '../../utils/useT';
import { useApp } from '../../context/AppContext';

// Paywall placeholder — ligar react-native-purchases (RevenueCat) aqui depois.
// Sem billing ligado: o CTA destrava o app; "Restaurar" só avisa que assinatura
// entra em breve (fingir restauração de compra seria mentira).

const S = {
  // Chamada aponta pra manifestação REAL criada no onboarding — nada de
  // "histórias que expiram" (não existem) nem contagem regressiva inventada.
  ready: {
    en: 'Your first manifestation is ready — continue with it.',
    pt: 'Sua primeira manifestação está pronta — continue com ela.',
  },
  // Preço legível COLADO no CTA, mesmo peso visual da palavra "grátis".
  price: { en: 'Free for 7 days, then R$ 49,90/week', pt: 'Grátis por 7 dias, depois R$ 49,90/semana' },
  // 49,90 × 52 semanas ÷ 12 meses = 216,23 — aritmética, não estimativa.
  priceMonth: { en: 'that works out to R$ 216,23 per month', pt: 'isso dá R$ 216,23 por mês' },
  restoreNote: {
    en: 'Subscriptions are coming soon — there is nothing to restore yet.',
    pt: 'Assinatura entra em breve — ainda não há nada para restaurar.',
  },
};

export default function PaywallScreen() {
  const { state, completeOnboarding } = useApp();
  const { t } = useT();
  const T = UI[(state && state.lang) || 'en'];
  const [restoreMsg, setRestoreMsg] = useState(false);

  const p = (s) => s.replace(/\{app\}/g, APP_NAME);
  const primeira = state && state.manifestations && state.manifestations[0];

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
          {primeira ? (
            <View
              style={{
                backgroundColor: ONB.badgeBg,
                borderRadius: 18,
                paddingVertical: 12,
                paddingHorizontal: 16,
                marginBottom: 24,
              }}
            >
              <Text style={{ fontSize: 15, lineHeight: 21, color: ONB.badgeText }}>{t(S.ready)}</Text>
              <Text style={{ fontSize: 15, color: ONB.badgeText, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>
                “{primeira.title}”
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

          {/* Preço no mesmo peso visual do "grátis" do botão — ninguém assina sem ver */}
          <Text style={{ fontSize: 17, fontWeight: '600', color: ONB.surfaceInk, textAlign: 'center', marginTop: 12 }}>
            {t(S.price)}
          </Text>
          <Text style={{ fontSize: 15, color: ONB.surfaceSoft, textAlign: 'center', marginTop: 4 }}>
            {t(S.priceMonth)}
          </Text>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, marginTop: 22 }}>
            <Text style={{ fontSize: 15, color: ONB.surfaceFaint }}>{T.pwPrivacy}</Text>
            <Text style={{ fontSize: 15, color: ONB.surfaceFaint }}>{T.pwTerms}</Text>
            <Pressable
              onPress={() => setRestoreMsg(true)}
              accessibilityRole="button"
              // hitSlop não aumenta área de toque no RN-web — dimensão real
              style={{ minHeight: 32, justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 15, color: ONB.surfaceFaint }}>{T.pwRestore}</Text>
            </Pressable>
          </View>

          {restoreMsg ? (
            <Text style={{ fontSize: 14, lineHeight: 20, color: ONB.surfaceSoft, textAlign: 'center', marginTop: 14 }}>
              {t(S.restoreNote)}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </OnbScreen>
  );
}
