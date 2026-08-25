// Minimal EN / PT-BR i18n for the onboarding + paywall.
// Text fields in the flow are { en, pt } objects resolved by txt().

export function detectLang() {
  try {
    const l =
      (typeof navigator !== 'undefined' && (navigator.language || (navigator.languages && navigator.languages[0]))) ||
      Intl.DateTimeFormat().resolvedOptions().locale ||
      'en';
    return String(l).toLowerCase().startsWith('pt') ? 'pt' : 'en';
  } catch (e) {
    return 'en';
  }
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
    referralTitle: 'Have a referral code?',
    referralSub: 'Enter it below to get started',
    referralPh: 'Enter code',
    notifs: '{app} works better with Notifications :)',
    grow: 'Help us grow :)',
    pwNote: 'A transparent beginning',
    pwP1: 'Your Anchor Scene and your first daily practice are ready.',
    pwP2: 'Subscriptions are not active in this version. You can enter {app} and use the available experience without a charge.',
    pwP3: 'When plans launch, the exact price, renewal period and cancellation path will appear before any purchase.',
    pwCta: 'Enter {app}',
    pwPrivacy: 'Privacy',
    pwTerms: 'Terms',
    pwRestore: 'Restore',
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
    referralTitle: 'Tem um código de indicação?',
    referralSub: 'Digite abaixo para começar',
    referralPh: 'Digite o código',
    notifs: 'O {app} funciona melhor com Notificações :)',
    grow: 'Ajude a gente a crescer :)',
    pwNote: 'Um começo transparente',
    pwP1: 'Sua Cena-Âncora e sua primeira prática diária estão prontas.',
    pwP2: 'A assinatura não está ativa nesta versão. Você pode entrar no {app} e usar a experiência disponível sem cobrança.',
    pwP3: 'Quando os planos forem lançados, preço exato, renovação e caminho de cancelamento aparecerão antes de qualquer compra.',
    pwCta: 'Entrar no {app}',
    pwPrivacy: 'Privacidade',
    pwTerms: 'Termos',
    pwRestore: 'Restaurar',
  },
};
