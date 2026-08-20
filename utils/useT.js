import { useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { tr } from '../constants/i18n';

// Tradução do app inteiro (não só do onboarding). O idioma sai de state.lang,
// que é detectado do aparelho no primeiro load e pode ser trocado pelo usuário.
//
// Uso na tela:
//   const S = { title: { en: 'Affirmations', pt: 'Afirmações' } };
//   const { t, lang } = useT();
//   <Text>{t(S.title)}</Text>
//   <Text>{t(S.greeting, { name: state.name })}</Text>
//
// Cada tela declara seu próprio dicionário local no topo do arquivo — mantém a
// string ao lado do uso e o portão scripts/i18n-parity.js garante que nenhum
// objeto {en} vá para produção sem o {pt} correspondente.
export function useT() {
  const { state } = useApp();
  const lang = (state && state.lang) || 'en';
  const t = useCallback((field, vars) => tr(field, lang, vars), [lang]);
  return useMemo(() => ({ t, lang }), [t, lang]);
}
