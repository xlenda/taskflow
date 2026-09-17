import { useCallback } from 'react';

import { useApp } from '../context/AppContext';
import { useNarration } from '../context/NarrationContext';
import { DEFAULT_NARRATOR_ID } from '../constants/narrators';
import { CLOUD_CONSENT_VERSION } from '../constants/cloudConsent';
import { RELEASE_FEATURES } from '../constants/releaseFeatures';
import { redactThirdPartyNames, thirdPartyNames } from '../services/generatePersonalizedScene';
import { useCloudMediaConsent } from './useCloudMediaConsent';

function textWithoutSavedNames(text, profile, lang) {
  return redactThirdPartyNames(text, thirdPartyNames(profile), lang);
}

export function usePersonalNarration() {
  const { state } = useApp();
  const narration = useNarration();
  const { ensureCloudMediaConsent } = useCloudMediaConsent();
  const lang = state?.lang === 'en' ? 'en' : 'pt';
  const narratorId = state?.narration?.narratorId || DEFAULT_NARRATOR_ID;

  const ensureConsent = useCallback(async () => {
    if (!RELEASE_FEATURES.paidCloudProcessing) {
      return { ok: false, error: 'personal_narration_unavailable' };
    }
    return ensureCloudMediaConsent();
  }, [ensureCloudMediaConsent]);

  const playPersonal = useCallback(
    async ({ text, lang: contentLang, narratorId: requestedNarrator, playbackId }) => {
      narration.prime();
      const consent = await ensureConsent();
      if (!consent.ok) {
        narration.stop();
        return consent;
      }
      const resolvedLang = contentLang === 'en' ? 'en' : contentLang === 'pt' ? 'pt' : lang;
      const consentProfile = consent.profile || state?.profile || {};
      return narration.playPersonal({
        text: textWithoutSavedNames(text, consentProfile, resolvedLang),
        narratorId: requestedNarrator || narratorId,
        lang: resolvedLang,
        cloudConsent: true,
        cloudConsentVersion: CLOUD_CONSENT_VERSION,
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
      const consentProfile = consent.profile || state?.profile || {};
      return narration.preparePersonal({
        text: textWithoutSavedNames(text, consentProfile, resolvedLang),
        narratorId: requestedNarrator || narratorId,
        lang: resolvedLang,
        cloudConsent: true,
        cloudConsentVersion: CLOUD_CONSENT_VERSION,
        adultConfirmed: true,
      });
    },
    [ensureConsent, lang, narration, narratorId, state?.profile]
  );

  return {
    ...narration,
    narratorId,
    personalNarrationAvailable: RELEASE_FEATURES.paidCloudProcessing,
    playPersonal,
    preparePersonal,
  };
}
