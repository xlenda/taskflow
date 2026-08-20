// Minimal EN / PT-BR i18n for the onboarding + paywall.
// Text fields in the flow are { en, pt } objects resolved by txt().

export const LANGS = ['en', 'pt'];

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
    terms: 'By clicking "Continue", you agree to our Terms of Service and Privacy Policy',
    referralTitle: 'Have a referral code?',
    referralSub: 'Enter it below to get started',
    referralPh: 'Enter code',
    notifs: '{app} works better with Notifications :)',
    grow: 'Help us grow :)',
    pwExpire: 'Your stories expire in ',
    pwNote: 'Note from the team',
    pwP1: 'Thank you for taking the time to download {app}!',
    pwP2:
      'We are currently experiencing overwhelming demand for the app, so we are asking everyone to start a free trial in order to continue. This helps manage the load and keep things smooth for all!',
    pwP3: 'We are thrilled to see so many people loving {app} and we are working hard to improve the app every day!',
    pwCta: 'Try {app} for free',
    pwPrice: '7-day free trial, then R$ 49,90 per week',
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
    terms: 'Ao clicar em "Continuar", você concorda com nossos Termos de Serviço e Política de Privacidade',
    referralTitle: 'Tem um código de indicação?',
    referralSub: 'Digite abaixo para começar',
    referralPh: 'Digite o código',
    notifs: 'O {app} funciona melhor com Notificações :)',
    grow: 'Ajude a gente a crescer :)',
    pwExpire: 'Suas histórias expiram em ',
    pwNote: 'Recado da equipe',
    pwP1: 'Obrigado por baixar o {app}!',
    pwP2:
      'Estamos com uma demanda enorme no app, então pedimos que todos iniciem um teste grátis para continuar. Isso ajuda a equilibrar a carga e manter tudo funcionando bem para todos!',
    pwP3: 'Estamos muito felizes de ver tanta gente amando o {app} — e trabalhamos duro para melhorar o app todos os dias!',
    pwCta: 'Testar o {app} grátis',
    pwPrice: 'Teste grátis de 7 dias, depois R$ 49,90 por semana',
    pwPrivacy: 'Privacidade',
    pwTerms: 'Termos',
    pwRestore: 'Restaurar',
  },
};
