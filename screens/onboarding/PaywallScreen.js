import React, { useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { OnbScreen } from './onboardingUI';
import { APP_NAME, ONB, SERIF } from '../../constants/brand';
import { UI } from '../../constants/i18n';
import { useT } from '../../utils/useT';
import { useApp } from '../../context/AppContext';

// Tela de acesso enquanto o billing não está ligado. Ela não promete trial nem
// mostra preço fictício: o CTA apenas conclui o onboarding, sem cobrança.

const S = {
  // Chamada aponta pra manifestação REAL criada no onboarding — nada de
  // "histórias que expiram" (não existem) nem contagem regressiva inventada.
  ready: {
    en: 'Your first manifestation is ready — continue with it.',
    pt: 'Sua primeira manifestação está pronta — continue com ela.',
  },
  access: { en: 'Open access in this version', pt: 'Acesso aberto nesta versão' },
  accessNote: { en: 'No trial starts and no charge is made.', pt: 'Nenhum teste começa e nenhuma cobrança é feita.' },
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
  const [entering, setEntering] = useState(false);
  const enteringRef = useRef(false);

  const p = (s) => s.replace(/\{app\}/g, APP_NAME);
  const primeira = state && state.manifestations && state.manifestations[0];
  const enterApp = async () => {
    if (enteringRef.current) return;
    enteringRef.current = true;
    setEntering(true);
    const entered = await completeOnboarding();
    if (!entered) {
      enteringRef.current = false;
      setEntering(false);
    }
  };

  return (
    <OnbScreen style={styles.screen} outerStyle={styles.screenFrame}>
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
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

          <View style={{ alignItems: 'center' }}>
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

      {/* A entrada fica fora da rolagem para nunca nascer escondida em telas baixas. */}
      <View style={styles.footer}>
        <View style={styles.footerInner}>
          <Pressable
            onPress={enterApp}
            disabled={entering}
            accessibilityRole="button"
            accessibilityLabel={p(T.pwCta)}
            accessibilityState={{ disabled: entering }}
            style={({ pressed }) => [styles.cta, (pressed || entering) && styles.ctaPressed]}
          >
            <Text style={styles.ctaText}>{p(T.pwCta)}</Text>
            <Ionicons name="arrow-forward" size={20} color={ONB.ctaInk} style={styles.ctaIcon} />
          </Pressable>

          {/* Recibo exato do que o CTA faz hoje: liberar, sem iniciar cobrança. */}
          <Text style={styles.access}>{t(S.access)}</Text>
          <Text style={styles.accessNote}>{t(S.accessNote)}</Text>
        </View>
      </View>
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  screenFrame: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  screen: { minHeight: 0, overflow: 'hidden' },
  content: { flex: 1, minHeight: 0 },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  footerInner: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  cta: {
    width: '100%',
    minHeight: 58,
    backgroundColor: ONB.cta,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: { opacity: 0.82 },
  ctaText: { flexShrink: 1, fontSize: 19, color: ONB.ctaInk, fontWeight: '600', textAlign: 'center' },
  ctaIcon: { marginLeft: 10 },
  access: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: ONB.surfaceInk,
    textAlign: 'center',
    marginTop: 8,
  },
  accessNote: {
    fontSize: 13,
    lineHeight: 18,
    color: ONB.surfaceSoft,
    textAlign: 'center',
    marginTop: 1,
  },
});
