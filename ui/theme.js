import React, { createContext, useContext, useState } from 'react';

// ── Themes ──────────────────────────────────────────────────────────────────
// Each theme is a complete palette. accents[] drives category colors, chart
// bars, avatars, tag chips — the "no monochrome apps" rule made concrete.
const base = {
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  radius: { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 },
  font: {
    title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    heading: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
    body: { fontSize: 15, fontWeight: '400' },
    label: { fontSize: 13, fontWeight: '600' },
    caption: { fontSize: 12, fontWeight: '500' },
  },
};

const themes = {
  midnight: { dark: true,  bg: '#0B0E14', surface: '#151A23', surfaceAlt: '#1D2430', text: '#F2F5F9', textMuted: '#8B95A7', border: '#232B38', accent: '#5B8CFF', accentSoft: '#16233F', success: '#3DD68C', warning: '#F5B84B', danger: '#F4645C', accents: ['#5B8CFF', '#9D7BFF', '#3DD6C3', '#F5B84B', '#FF7BAC', '#3DD68C'] },
  violet:   { dark: true,  bg: '#0E0A1F', surface: '#191330', surfaceAlt: '#231B41', text: '#F4F1FF', textMuted: '#9C93BF', border: '#2B2250', accent: '#8B6CFF', accentSoft: '#241B4A', success: '#4ADE97', warning: '#FBBF4B', danger: '#F87171', accents: ['#8B6CFF', '#5B8CFF', '#EC6BBE', '#FBBF4B', '#4ADE97', '#38BDF8'] },
  ember:    { dark: true,  bg: '#131010', surface: '#1E1917', surfaceAlt: '#292220', text: '#F7F2EE', textMuted: '#A39588', border: '#332A26', accent: '#FF8A4C', accentSoft: '#332014', success: '#7BC97F', warning: '#F5C04E', danger: '#EF5F5F', accents: ['#FF8A4C', '#F5C04E', '#E76B8B', '#7BC97F', '#5BA8C9', '#C98ADB'] },
  forest:   { dark: true,  bg: '#0C120E', surface: '#151D17', surfaceAlt: '#1E2A21', text: '#EFF5F0', textMuted: '#8FA396', border: '#25332A', accent: '#4CC38A', accentSoft: '#132A1E', success: '#4CC38A', warning: '#E8C468', danger: '#E5726A', accents: ['#4CC38A', '#8FD14F', '#E8C468', '#5BB8D4', '#B89BE8', '#E58E6A'] },
  paper:    { dark: false, bg: '#F7F5F0', surface: '#FFFFFF', surfaceAlt: '#EFECE4', text: '#1C1A15', textMuted: '#79746A', border: '#E4E0D6', accent: '#C56A3F', accentSoft: '#F6E5DB', success: '#3E8E5A', warning: '#C08A2D', danger: '#C4544A', accents: ['#C56A3F', '#3E8E5A', '#4A76B8', '#8E5FB0', '#C08A2D', '#B85479'] },
  cloud:    { dark: false, bg: '#F4F6FA', surface: '#FFFFFF', surfaceAlt: '#EAEEF5', text: '#171B26', textMuted: '#6C7688', border: '#E1E6EF', accent: '#3B6EF6', accentSoft: '#E4EBFE', success: '#2E9E68', warning: '#D08E23', danger: '#D9544E', accents: ['#3B6EF6', '#7B5CE8', '#2E9E68', '#D08E23', '#DB5C93', '#2AA5BF'] },
  blossom:  { dark: false, bg: '#FBF4F6', surface: '#FFFFFF', surfaceAlt: '#F5E9ED', text: '#26141C', textMuted: '#8D7480', border: '#EEDEE4', accent: '#D9548C', accentSoft: '#F9E1EC', success: '#3E9E71', warning: '#CE9032', danger: '#D25050', accents: ['#D9548C', '#8E5FB0', '#3E9E71', '#CE9032', '#4A76B8', '#D97B54'] },
  mono:     { dark: true,  bg: '#0A0A0A', surface: '#161616', surfaceAlt: '#212121', text: '#F5F5F5', textMuted: '#909090', border: '#2A2A2A', accent: '#F5F5F5', accentSoft: '#262626', success: '#6BCB8B', warning: '#E6C25A', danger: '#E66A62', accents: ['#F5F5F5', '#B0B0B0', '#6BCB8B', '#E6C25A', '#7FA8E8', '#E66A62'] },
};

// A base theme supplies the polished neutral foundation (backgrounds, surfaces,
// text). Optional overrides let an EXPLICIT user color request drive the accents
// without losing that foundation — so "make it red and blue" keeps a clean base
// but recolors buttons, icons, and highlights.
function resolve(name, ov) {
  const t = themes[name] || themes.midnight;
  const m = Object.assign({}, base, t, { name: themes[name] ? name : 'midnight' });
  if (ov) {
    if (ov.accent) m.accent = ov.accent;
    if (ov.accentSoft) m.accentSoft = ov.accentSoft;
    if (ov.accents && ov.accents.length) m.accents = ov.accents;
  }
  return m;
}

// ── Provider ────────────────────────────────────────────────────────────────
const ThemeContext = createContext(resolve('midnight'));
const ThemeSetterContext = createContext(function () {});

export function ThemeProvider(props) {
  const [name, setName] = useState(props.theme || 'midnight');
  // accent / accents / accentSoft props (if provided) override the preset —
  // this is how explicit user-requested colors are honored.
  const ov = { accent: props.accent, accentSoft: props.accentSoft, accents: props.accents };
  return React.createElement(
    ThemeContext.Provider,
    { value: resolve(name, ov) },
    React.createElement(ThemeSetterContext.Provider, { value: setName }, props.children)
  );
}

export function useTheme() { return useContext(ThemeContext); }
export function useSetTheme() { return useContext(ThemeSetterContext); }
