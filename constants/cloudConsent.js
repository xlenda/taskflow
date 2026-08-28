const CLOUD_CONSENT_VERSION = 'celeste-cloud-processors-v1';

const CLOUD_CONSENT_BOOLEAN_FIELDS = Object.freeze([
  'cloudPersonalization',
  'cloudAdultConfirmed',
  'cloudNarrationConsent',
  'cloudDreamConsent',
]);

function sourceProfile(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function hasCurrentCloudConsentVersion(profile) {
  return sourceProfile(profile).cloudConsentVersion === CLOUD_CONSENT_VERSION;
}

function hasCurrentAdultCloudConsent(profile) {
  const source = sourceProfile(profile);
  return (
    source.cloudConsentVersion === CLOUD_CONSENT_VERSION &&
    source.cloudAdultConfirmed === true
  );
}

function normalizeCloudConsentProfile(profile, options = {}) {
  const source = { ...sourceProfile(profile) };
  const forceReconsent = options.forceReconsent === true;
  const knownMinor = options.knownMinor === true;
  const currentVersion =
    !forceReconsent &&
    !knownMinor &&
    source.cloudConsentVersion === CLOUD_CONSENT_VERSION;
  const adultConfirmed = currentVersion && source.cloudAdultConfirmed === true;

  return {
    ...source,
    cloudConsentVersion: currentVersion ? CLOUD_CONSENT_VERSION : null,
    cloudPersonalization: adultConfirmed && source.cloudPersonalization === true,
    cloudAdultConfirmed: adultConfirmed,
    cloudNarrationConsent: adultConfirmed && source.cloudNarrationConsent === true,
    cloudDreamConsent: adultConfirmed && source.cloudDreamConsent === true,
  };
}

function stripCloudConsentProfile(profile) {
  const output = { ...sourceProfile(profile) };
  CLOUD_CONSENT_BOOLEAN_FIELDS.forEach((field) => delete output[field]);
  delete output.cloudConsentVersion;
  return output;
}

module.exports = {
  CLOUD_CONSENT_BOOLEAN_FIELDS,
  CLOUD_CONSENT_VERSION,
  hasCurrentAdultCloudConsent,
  hasCurrentCloudConsentVersion,
  normalizeCloudConsentProfile,
  stripCloudConsentProfile,
};
