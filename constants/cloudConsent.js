// The website's consent: one control for every optional cloud processor.
const CLOUD_CONSENT_VERSION = 'celeste-cloud-processors-v2';
// The Android app asks only for what it sends: the voice (ElevenLabs) and the AI texts (Anchor Scene, visions,
// affirmations and the scene translation). Its own version, so a voice-only consent given earlier on Android is
// asked again while website consents stay valid. constants/cloudConsent.android.js makes it the app's version.
const ANDROID_CLOUD_CONSENT_VERSION = 'celeste-cloud-android-voice-texts-v1';
// The routes of the voice and the texts accept both; images and dreams only the website's.
const VOICE_AND_TEXT_CONSENT_VERSIONS = Object.freeze([CLOUD_CONSENT_VERSION, ANDROID_CLOUD_CONSENT_VERSION]);

const CLOUD_CONSENT_BOOLEAN_FIELDS = Object.freeze([
  'cloudPersonalization',
  'cloudAdultConfirmed',
  'cloudNarrationConsent',
  'cloudDreamConsent',
]);

function sourceProfile(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// The consent rules for the version a platform shows.
function cloudConsentRules(version) {
  function hasCurrentCloudConsentVersion(profile) {
    return sourceProfile(profile).cloudConsentVersion === version;
  }

  function hasCurrentAdultCloudConsent(profile) {
    const source = sourceProfile(profile);
    return source.cloudConsentVersion === version && source.cloudAdultConfirmed === true;
  }

  function normalizeCloudConsentProfile(profile, options = {}) {
    const source = { ...sourceProfile(profile) };
    const forceReconsent = options.forceReconsent === true;
    const knownMinor = options.knownMinor === true;
    const currentVersion = !forceReconsent && !knownMinor && source.cloudConsentVersion === version;
    const adultConfirmed = currentVersion && source.cloudAdultConfirmed === true;
    // v2 exposes one control for every optional cloud processor. The legacy
    // per-feature fields remain as fail-closed aliases for the service guards,
    // but hydration must never recreate a partially enabled profile.
    const allowed = adultConfirmed && source.cloudPersonalization === true;

    return {
      ...source,
      cloudConsentVersion: currentVersion ? version : null,
      cloudPersonalization: allowed,
      cloudAdultConfirmed: allowed,
      cloudNarrationConsent: allowed,
      cloudDreamConsent: allowed,
    };
  }

  return {
    CLOUD_CONSENT_VERSION: version,
    hasCurrentAdultCloudConsent,
    hasCurrentCloudConsentVersion,
    normalizeCloudConsentProfile,
  };
}

function stripCloudConsentProfile(profile) {
  const output = { ...sourceProfile(profile) };
  CLOUD_CONSENT_BOOLEAN_FIELDS.forEach((field) => delete output[field]);
  delete output.cloudConsentVersion;
  return output;
}

module.exports = {
  ...cloudConsentRules(CLOUD_CONSENT_VERSION),
  ANDROID_CLOUD_CONSENT_VERSION,
  CLOUD_CONSENT_BOOLEAN_FIELDS,
  VOICE_AND_TEXT_CONSENT_VERSIONS,
  cloudConsentRules,
  stripCloudConsentProfile,
};
