import { useCallback } from 'react';

import { CLOUD_CONSENT_VERSION, hasCurrentAdultCloudConsent } from '../constants/cloudConsent';
import { RELEASE_FEATURES } from '../constants/releaseFeatures';
import { useApp } from '../context/AppContext';
import { isUnder18Age } from '../screens/onboarding/flow';
import { confirmAsync } from './confirm';

const COPY = {
  pt: {
    title: 'Ativar voz e imagens pessoais?',
    message:
      'A Celeste usa a ElevenLabs para criar a voz escolhida e o Google Gemini para criar imagens pessoais. Somente quando você pedir, serão enviados o texto, o idioma, a voz selecionada e o contexto visual necessário. Isso também ativa os recursos personalizados em nuvem descritos na Política de Privacidade. O conteúdo não fica público. Ao continuar, você confirma que tem 18 anos ou mais. Você pode desativar em Perfil.',
    confirm: 'Ativar voz e imagens',
    cancel: 'Agora não',
  },
  en: {
    title: 'Enable personal voice and images?',
    message:
      'Celeste uses ElevenLabs to create the voice you choose and Google Gemini to create personal images. Only when you ask, the necessary text, language, selected voice, and visual context are sent. This also enables the personalized cloud features described in the Privacy Policy. Your content is not public. By continuing, you confirm that you are 18 or older. You can turn this off in Profile.',
    confirm: 'Enable voice and images',
    cancel: 'Not now',
  },
};

// Android: the voice and the AI texts go to the cloud (images stay on the website), so the request names exactly
// those, with Android's own consent version (constants/cloudConsent.android.js). The Home asks with this same text
// when she creates a desire, as the website does.
export const ANDROID_CLOUD_CONSENT_COPY = {
  pt: {
    title: 'Ativar a voz e os textos da Celeste?',
    message:
      'A Celeste usa IA para escrever sua Cena-Âncora, suas visões e afirmações a partir do seu desejo e das suas respostas: a Anthropic normalmente escreve, com a OpenAI como alternativa e, se nenhuma estiver configurada, o Google Gemini, que também traduz a cena quando você troca o idioma. A ElevenLabs cria a voz que você escolher, só quando você pedir para ouvir. Esses dados vão ao nosso servidor e a esses provedores só para gerar os textos e o áudio. Os nomes cadastrados de filhos e de pessoas importantes ficam neste aparelho; evite nomes e dados confidenciais nos textos livres. Nenhuma imagem é criada no app. O conteúdo não fica público. Ao continuar, você confirma que tem 18 anos ou mais. Você pode desativar em Perfil.',
    confirm: 'Ativar voz e textos',
    cancel: 'Agora não',
  },
  en: {
    title: "Enable Celeste's voice and texts?",
    message:
      'Celeste uses AI to write your Anchor Scene, visions and affirmations from your desire and your answers: Anthropic normally writes them, with OpenAI as the failover and, if neither is configured, Google Gemini, which also translates the scene when you change the language. ElevenLabs creates the voice you choose, only when you ask to listen. This data goes to our server and to these providers only to create the texts and the audio. Saved names of children and important people stay on this device; avoid names and confidential data in free text. No images are created in the app. Your content is not public. By continuing, you confirm that you are 18 or older. You can turn this off in Profile.',
    confirm: 'Enable voice and texts',
    cancel: 'Not now',
  },
};

export const UNIFIED_CLOUD_MEDIA_PATCH = Object.freeze({
  cloudConsentVersion: CLOUD_CONSENT_VERSION,
  cloudPersonalization: true,
  cloudAdultConfirmed: true,
  cloudNarrationConsent: true,
  cloudDreamConsent: true,
});

export function hasUnifiedCloudMediaConsent(profile) {
  return (
    hasCurrentAdultCloudConsent(profile) &&
    profile?.cloudPersonalization === true &&
    profile?.cloudNarrationConsent === true &&
    profile?.cloudDreamConsent === true
  );
}

export function useCloudMediaConsent() {
  const { state, saveProfile } = useApp();
  const lang = state?.lang === 'en' ? 'en' : 'pt';

  const ensureCloudMediaConsent = useCallback(async () => {
    const profile = state?.profile || {};
    if (isUnder18Age(profile.age)) {
      return { ok: false, error: 'adult_confirmation_required' };
    }
    if (hasUnifiedCloudMediaConsent(profile)) {
      return { ok: true, profile };
    }

    const copy = (RELEASE_FEATURES.paidCloudProcessing ? COPY : ANDROID_CLOUD_CONSENT_COPY)[lang];
    const accepted = await confirmAsync({
      title: copy.title,
      message: copy.message,
      confirmLabel: copy.confirm,
      cancelLabel: copy.cancel,
      destructive: false,
      lang,
    });
    if (!accepted) return { ok: false, error: 'cloud_consent_required' };

    const acceptedProfile = { ...profile, ...UNIFIED_CLOUD_MEDIA_PATCH };
    saveProfile(UNIFIED_CLOUD_MEDIA_PATCH);
    return { ok: true, profile: acceptedProfile };
  }, [lang, saveProfile, state?.profile]);

  const withCloudMediaConsent = useCallback(
    async (action) => {
      const consent = await ensureCloudMediaConsent();
      if (!consent.ok || typeof action !== 'function') return consent;
      return action(consent.profile);
    },
    [ensureCloudMediaConsent]
  );

  return {
    cloudMediaEnabled: hasUnifiedCloudMediaConsent(state?.profile || {}),
    ensureCloudMediaConsent,
    withCloudMediaConsent,
  };
}
