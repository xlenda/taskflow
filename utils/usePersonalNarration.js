import { useCallback } from 'react';

import { useApp } from '../context/AppContext';
import { useNarration } from '../context/NarrationContext';
import { DEFAULT_NARRATOR_ID } from '../constants/narrators';
import { ageConfirmsAdult } from '../screens/onboarding/flow';
import { redactThirdPartyNames, thirdPartyNames } from '../services/generatePersonalizedScene';
import { confirmAsync } from './confirm';

const COPY = {
  pt: {
    title: 'Ativar voz pessoal?',
    message:
      'Para narrar com a voz escolhida, o Celeste envia ao Google Gemini somente o texto que você decidiu ouvir. Nomes de outras pessoas salvos no aparelho não são enviados. O áudio é criado para esta reprodução e não é público.',
    confirm: 'Ativar voz',
    cancel: 'Agora não',
  },
  en: {
    title: 'Enable your personal voice?',
    message:
      'To narrate with your chosen voice, Celeste sends Google Gemini only the text you chose to hear. Names of other people saved on this device are not sent. The audio is created for this playback and is not public.',
    confirm: 'Enable voice',
    cancel: 'Not now',
  },
};

function textWithoutSavedNames(text, profile, lang) {
  return redactThirdPartyNames(text, thirdPartyNames(profile), lang);
}

export function usePersonalNarration() {
  const { state, saveProfile } = useApp();
  const narration = useNarration();
  const lang = state?.lang === 'en' ? 'en' : 'pt';
  const narratorId = state?.narration?.narratorId || DEFAULT_NARRATOR_ID;

  const ensureConsent = useCallback(async () => {
    const profile = state?.profile || {};
    if (!ageConfirmsAdult(profile.age)) {
      return { ok: false, error: 'adult_confirmation_required' };
    }
    if (
      profile.cloudPersonalization === true &&
      profile.cloudAdultConfirmed === true &&
      profile.cloudNarrationConsent === true
    ) {
      return { ok: true };
    }

    const copy = COPY[lang];
    const accepted = await confirmAsync({
      title: copy.title,
      message: copy.message,
      confirmLabel: copy.confirm,
      cancelLabel: copy.cancel,
      destructive: false,
      lang,
    });
    if (!accepted) return { ok: false, error: 'cloud_consent_required' };

    saveProfile({
      cloudPersonalization: true,
      cloudAdultConfirmed: true,
      cloudNarrationConsent: true,
    });
    return { ok: true };
  }, [lang, saveProfile, state?.profile]);

  const playPersonal = useCallback(
    async ({ text, lang: contentLang, narratorId: requestedNarrator, playbackId }) => {
      narration.prime();
      const consent = await ensureConsent();
      if (!consent.ok) {
        narration.stop();
        return consent;
      }
      const resolvedLang = contentLang === 'en' ? 'en' : contentLang === 'pt' ? 'pt' : lang;
      return narration.playPersonal({
        text: textWithoutSavedNames(text, state?.profile || {}, resolvedLang),
        narratorId: requestedNarrator || narratorId,
        lang: resolvedLang,
        cloudConsent: true,
        adultConfirmed: true,
        playbackId,
      });
    },
    [ensureConsent, lang, narration, narratorId, state?.profile]
  );

  const preparePersonal = useCallback(
    async ({ text, lang: contentLang, narratorId: requestedNarrator }) => {
      const consent = await ensureConsent();
      if (!consent.ok) return consent;
      const resolvedLang = contentLang === 'en' ? 'en' : contentLang === 'pt' ? 'pt' : lang;
      return narration.preparePersonal({
        text: textWithoutSavedNames(text, state?.profile || {}, resolvedLang),
        narratorId: requestedNarrator || narratorId,
        lang: resolvedLang,
        cloudConsent: true,
        adultConfirmed: true,
      });
    },
    [ensureConsent, lang, narration, narratorId, state?.profile]
  );

  return {
    ...narration,
    narratorId,
    playPersonal,
    preparePersonal,
  };
}
