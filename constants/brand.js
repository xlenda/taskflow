import { Platform } from 'react-native';

// Central place for the app identity used across onboarding + paywall.
// Change APP_NAME here and every screen follows.
export const APP_NAME = 'Celeste';

// Endereço público — vai junto em tudo que é compartilhado, senão a mensagem
// circula sem trazer ninguém de volta. Trocar quando o domínio próprio entrar.
export const APP_URL = 'https://celeste-jet-two.vercel.app';

// Elegant serif to match the editorial look of the onboarding.
// Swap for a custom expo-font (e.g. Playfair Display) later without touching screens.
export const SERIF = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: "Georgia, 'Times New Roman', serif",
});

// Onboarding palette. Every color the onboarding uses lives here — swap this
// object and the whole flow (and paywall) re-skins itself.
// ink* = text on the gradient; surface* = text on frosted/white surfaces.
// Active palette: "Nuvens de Pérola" — powder blue → milky sky → pearl.
// Chosen by design panel 08/2026 (best WCAG contrast of 4 candidates; escapes
// both Stella-pink and Nebula-purple territory). Alternatives in the preview
// artifact — swap this object to re-skin the whole flow.
export const ONB = {
  gradient: ['#AFC8E7', '#C9DBEF', '#E6EFF8'],
  welcomeBackground: '#759ACE',
  ink: '#1C2E4F',
  inkSoft: 'rgba(28,46,79,0.55)',
  inkFaint: 'rgba(28,46,79,0.35)',
  inkOn: '#F6FAFF',
  surfaceInk: '#223250',
  surfaceSoft: 'rgba(34,50,80,0.55)',
  surfaceFaint: 'rgba(34,50,80,0.35)',
  pill: 'rgba(255,255,255,0.65)',
  pillStrong: 'rgba(255,255,255,0.78)',
  pillSoft: 'rgba(255,255,255,0.42)',
  track: 'rgba(255,255,255,0.40)',
  trackFill: 'rgba(28,46,79,0.90)',
  bubble: 'rgba(255,255,255,0.82)',
  heart: '#F2B25C',
  card: '#F7FAFD',
  badgeBg: '#E4EEF9',
  badgeText: '#274069',
  cta: '#24406E',
  ctaInk: '#FFFFFF',
  shadow: '#1B2A47',
};
