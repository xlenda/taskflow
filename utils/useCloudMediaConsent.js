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

// Android: only the voice goes to the cloud (images stay on the website), so the request names only the voice.
const VOICE_ONLY_COPY = {
  pt: {
    title: 'Ativar a voz da Celeste?',
    message:
      'A Celeste usa a ElevenLabs para criar a voz que você escolher. Somente quando você pedir para ouvir, o texto, o idioma e a voz selecionada vão ao nosso servidor e à ElevenLabs, só para gerar o áudio. Nenhuma imagem é criada no app. O conteúdo não fica público. Ao continuar, você confirma que tem 18 anos ou mais. Você pode desativar em Perfil.',
    confirm: 'Ativar a voz',
    cancel: 'Agora não',
  },
  en: {
    title: "Enable Celeste's voice?",
    message:
      'Celeste uses ElevenLabs to create the voice you choose. Only when you ask to listen, the text, language and selected voice go to our server and to ElevenLabs, only to create the audio. No images are created in the app. Your content is not public. By continuing, you confirm that you are 18 or older. You can turn this off in Profile.',
    confirm: 'Enable the voice',
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

    const copy = (RELEASE_FEATURES.paidCloudProcessing ? COPY : VOICE_ONLY_COPY)[lang];
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
