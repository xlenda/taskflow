const CLOUD_CONSENT_VERSION = 'celeste-cloud-processors-v2';

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
  // v2 exposes one control for every optional cloud processor. The legacy
  // per-feature fields remain as fail-closed aliases for the service guards,
  // but hydration must never recreate a partially enabled profile.
  const allowed = adultConfirmed && source.cloudPersonalization === true;

  return {
    ...source,
    cloudConsentVersion: currentVersion ? CLOUD_CONSENT_VERSION : null,
    cloudPersonalization: allowed,
    cloudAdultConfirmed: allowed,
    cloudNarrationConsent: allowed,
    cloudDreamConsent: allowed,
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
