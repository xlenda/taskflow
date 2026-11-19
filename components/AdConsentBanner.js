import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useApp } from '../context/AppContext';
import { setAdConsent, shouldAskAdConsent } from '../utils/adTracking';
import { useT } from '../utils/useT';

// Aviso de cookies de anúncio (LGPD), só no site: Recusar e Aceitar com o mesmo peso, a escolha fica guardada
// e, sem aceite, nenhum pixel ou tag carrega (utils/adTracking.web.js). Fica no fluxo, embaixo da navegação, e
// nunca por cima: as abas sobem sozinhas e as telas do questionário (OnbScreen mede a janela) descontam a altura
// publicada aqui, para o aviso não cobrir o "Continuar".
let bannerHeight = 0;
const listeners = new Set();
function publishHeight(height) {
  if (height === bannerHeight) return;
  bannerHeight = height;
  listeners.forEach((listener) => listener());
}
function subscribeHeight(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const readHeight = () => bannerHeight;
const noHeight = () => 0;
export function useAdConsentInset() {
  return React.useSyncExternalStore(subscribeHeight, readHeight, noHeight);
}

const S = {
  region: { en: 'Ad cookies notice', pt: 'Aviso de cookies de anúncio' },
  text: {
    en: 'On this website, Celeste uses Meta and Google ad cookies to measure its ads, only if you accept.',
    pt: 'Neste site, o Celeste usa cookies de anúncio da Meta e do Google para medir os anúncios, só se você aceitar.',
  },
  policy: { en: 'Privacy policy', pt: 'Política de privacidade' },
  decline: { en: 'Decline', pt: 'Recusar' },
  accept: { en: 'Accept', pt: 'Aceitar' },
};

export default function AdConsentBanner() {
  const { state } = useApp();
  const { t, lang } = useT();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(shouldAskAdConsent);
  React.useEffect(() => () => publishHeight(0), []);
  if (Platform.OS !== 'web' || !open || !state) return null;

  const choose = (choice) => {
    setAdConsent(choice);
    setOpen(false);
    publishHeight(0);
  };
  const button = (testID, label, choice) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={() => choose(choice)}
      style={({ pressed, focused }) => [
        styles.button,
        pressed && styles.pressed,
        focused && styles.focused,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );

  return (
    <View
      testID="ad-consent-banner"
      role="region"
      aria-label={t(S.region)}
      onLayout={(event) => publishHeight(Math.ceil(event.nativeEvent.layout.height))}
      style={[styles.layer, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <View style={styles.bar}>
        <Text style={styles.text}>
          {t(S.text)}{' '}
          <Text
            testID="ad-consent-policy"
            href={lang === 'pt' ? '/privacidade#cookies' : '/privacy#cookies'}
            hrefAttrs={{ target: '_blank', rel: 'noopener' }}
            style={styles.link}
          >
            {t(S.policy)}
          </Text>
        </Text>
        <View style={styles.actions}>
          {button('ad-consent-decline', t(S.decline), 'denied')}
          {button('ad-consent-accept', t(S.accept), 'granted')}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    flexShrink: 0,
    zIndex: 60,
    backgroundColor: '#20314F',
    paddingHorizontal: 12,
    paddingTop: 10,
    alignItems: 'center',
  },
  bar: { width: '100%', maxWidth: 640 },
  text: { color: '#FFFFFF', fontSize: 13, lineHeight: 18 },
  link: { color: '#FFFFFF', fontWeight: '700', textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', marginTop: 8 },
  button: {
    flex: 1,
    minHeight: 44,
    marginHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#F5F8FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.8 },
  focused: { outlineColor: '#9CC2F0', outlineStyle: 'solid', outlineWidth: 2 },
  buttonText: { color: '#20314F', fontSize: 15, fontWeight: '700' },
});
