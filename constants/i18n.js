// Minimal EN / PT-BR i18n for the onboarding + paywall.
// Text fields in the flow are { en, pt } objects resolved by txt().

// Idioma do aparelho: português → 'pt'; qualquer outro → 'en'.
// No iPhone o locale do Intl segue as localizações do app, não o idioma do
// celular, então a lista AppleLanguages (Settings do RN, NSUserDefaults) vem
// primeiro. require tardio: os verificadores carregam este arquivo no Node.
export function detectLang() {
  try {
    const { Platform, Settings } = require('react-native');
    let l;
    if (Platform.OS === 'web') {
      l = navigator.language || (navigator.languages && navigator.languages[0]);
    } else {
      if (Platform.OS === 'ios') {
        try {
          const langs = Settings.get('AppleLanguages');
          l = Array.isArray(langs) ? langs[0] : langs;
        } catch (e) {}
      }
      l = l || Intl.DateTimeFormat().resolvedOptions().locale;
    }
    return String(l || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';
  } catch (e) {
    return 'en';
  }
}

// Idioma salvo só vale se a pessoa escolheu, já entrou no app ou já tem conteúdo
// (trocar aqui misturaria línguas). Antes disso segue o celular: quem abriu a
// 1.0.1 em inglês num iPhone em português.
export function resolveSavedLang(st) {
  const saved = st && (st.lang === 'pt' || st.lang === 'en') ? st.lang : null;
  const settled =
    !!st &&
    (st.langChosen === true ||
      st.onboardingDone === true ||
      (Array.isArray(st.manifestations) && st.manifestations.length > 0));
  return saved && settled ? saved : detectLang();
}

export function txt(field, lang) {
  if (field == null) return '';
  if (typeof field === 'string') return field;
  return field[lang] || field.en || '';
}

// Interpola {chave} com os valores passados: tr(S.greeting, 'pt', { name: 'Ana' })
export function tr(field, lang, vars) {
  let out = txt(field, lang);
  if (vars) {
    Object.keys(vars).forEach((k) => {
      out = out.split(`{${k}}`).join(String(vars[k]));
    });
  }
  return out;
}

export const UI = {
  en: {
    continue: 'Continue',
    skip: 'Skip',
    add: 'Add',
    yes: 'Yes',
    no: 'No',
    namePh: 'Name',
    tagline: 'Create the life you desire.',
    signIn: 'Already have an account? Sign in with Apple',
    terms: 'Continuing stores your answers on this device. No account or payment is created.',
    notifs: '{app} works better with Notifications :)',
    pwNote: 'A transparent beginning',
    pwP1: 'Your Anchor Scene and your first daily practice are ready.',
    pwP2: 'Subscriptions are not active in this version. You can enter {app} and use the available experience without a charge.',
    pwP3: 'When plans launch, the exact price, renewal period and cancellation path will appear before any purchase.',
    pwCta: 'Enter {app}',
    pwPrivacy: 'Privacy',
    pwTerms: 'Terms',
  },
  pt: {
    continue: 'Continuar',
    skip: 'Pular',
    add: 'Adicionar',
    yes: 'Sim',
    no: 'Não',
    namePh: 'Nome',
    tagline: 'Crie a vida que você deseja.',
    signIn: 'Já tem uma conta? Entrar com Apple',
    terms: 'Ao continuar, suas respostas ficam neste aparelho. Nenhuma conta ou cobrança é criada.',
    notifs: 'O {app} funciona melhor com Notificações :)',
    pwNote: 'Um começo transparente',
    pwP1: 'Sua Cena-Âncora e sua primeira prática diária estão prontas.',
    pwP2: 'A assinatura não está ativa nesta versão. Você pode entrar no {app} e usar a experiência disponível sem cobrança.',
    pwP3: 'Quando os planos forem lançados, preço exato, renovação e caminho de cancelamento aparecerão antes de qualquer compra.',
    pwCta: 'Entrar no {app}',
    pwPrivacy: 'Privacidade',
    pwTerms: 'Termos',
  },
};
