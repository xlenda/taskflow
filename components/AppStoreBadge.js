import React from 'react';
import { Image, Platform, Pressable } from 'react-native';

import { APP_STORE_URL } from '../constants/ads';
import { trackAppStoreClick } from '../utils/adTracking';
import { useT } from '../utils/useT';

// Selos oficiais da Apple, sem alteração (Apple Marketing Guidelines): altura mínima de 40 px na tela e área
// livre de 1/4 da altura em volta. O selo segue o idioma do app.
const BADGES = {
  pt: require('../assets/badges/app-store-pt-br.svg'),
  en: require('../assets/badges/app-store-en-us.svg'),
};
const BADGE_RATIO = 119.66407 / 40; // viewBox dos SVGs oficiais

const S = {
  label: { en: 'Download on the App Store', pt: 'Baixar na App Store' },
};

// Só quem abre o site num iPhone ou iPad vê o selo, inclusive no navegador do Instagram e do Facebook (o user
// agent deles mantém "iPhone"/"iPad"). O iPadOS 13+ se apresenta como Mac: o toque denuncia o iPad.
export function isIOSBrowser(userAgent = '', maxTouchPoints = 0) {
  const ua = String(userAgent);
  if (/Android|Windows Phone/i.test(ua)) return false;
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
}

export function shouldShowAppStoreBadge() {
  return (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    isIOSBrowser(navigator.userAgent, navigator.maxTouchPoints)
  );
}

export default function AppStoreBadge({ height = 40, style, testID = 'app-store-badge' }) {
  const { t, lang } = useT();
  if (!shouldShowAppStoreBadge()) return null;
  const clearSpace = Math.ceil(height / 4);
  return (
    <Pressable
      testID={testID}
      href={APP_STORE_URL}
      hrefAttrs={{ target: '_blank', rel: 'noopener' }}
      accessibilityRole="link"
      accessibilityLabel={t(S.label)}
      onPress={() => trackAppStoreClick()}
      style={({ pressed, focused }) => [
        { alignSelf: 'center', padding: clearSpace, borderRadius: 12, opacity: pressed ? 0.8 : 1 },
        focused && { outlineColor: '#4A80C9', outlineStyle: 'solid', outlineWidth: 2 },
        style,
      ]}
    >
      <Image
        source={BADGES[lang] || BADGES.pt}
        accessibilityIgnoresInvertColors
        style={{ width: Math.round(height * BADGE_RATIO), height }}
      />
    </Pressable>
  );
}
