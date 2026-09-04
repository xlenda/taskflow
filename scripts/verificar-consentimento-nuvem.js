const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  CLOUD_CONSENT_BOOLEAN_FIELDS,
  CLOUD_CONSENT_VERSION,
  hasCurrentAdultCloudConsent,
  normalizeCloudConsentProfile,
  stripCloudConsentProfile,
} = require('../constants/cloudConsent');

const ROOT = path.resolve(__dirname, '..');

const legacyProfile = {
  name: 'Ana',
  localAnchor: 'Uma vida com calma',
  cloudPersonalization: true,
  cloudAdultConfirmed: true,
  cloudNarrationConsent: true,
  cloudDreamConsent: true,
};
const migratedLegacy = normalizeCloudConsentProfile(legacyProfile);
assert.strictEqual(migratedLegacy.cloudConsentVersion, null);
for (const field of CLOUD_CONSENT_BOOLEAN_FIELDS) {
  assert.strictEqual(migratedLegacy[field], false, `${field} legado nao pode autorizar nuvem`);
}
assert.strictEqual(hasCurrentAdultCloudConsent(migratedLegacy), false);
assert.strictEqual(migratedLegacy.name, legacyProfile.name);
assert.strictEqual(migratedLegacy.localAnchor, legacyProfile.localAnchor);

const acceptedProfile = normalizeCloudConsentProfile({
  ...legacyProfile,
  cloudConsentVersion: CLOUD_CONSENT_VERSION,
});
assert.strictEqual(acceptedProfile.cloudConsentVersion, CLOUD_CONSENT_VERSION);
assert.strictEqual(hasCurrentAdultCloudConsent(acceptedProfile), true);
for (const field of CLOUD_CONSENT_BOOLEAN_FIELDS) {
  assert.strictEqual(acceptedProfile[field], true, `${field} atual deve permanecer autorizado`);
}

const partialProfile = normalizeCloudConsentProfile({
  ...legacyProfile,
  cloudConsentVersion: CLOUD_CONSENT_VERSION,
  cloudNarrationConsent: false,
  cloudDreamConsent: false,
});
for (const field of CLOUD_CONSENT_BOOLEAN_FIELDS) {
  assert.strictEqual(partialProfile[field], true, `${field} deve seguir o controle unificado`);
}

const staleProfile = normalizeCloudConsentProfile({
  ...legacyProfile,
  cloudConsentVersion: 'celeste-cloud-processors-legacy',
});
assert.strictEqual(hasCurrentAdultCloudConsent(staleProfile), false);
assert.strictEqual(staleProfile.cloudConsentVersion, null);

const exportedProfile = stripCloudConsentProfile(acceptedProfile);
assert.strictEqual(exportedProfile.name, acceptedProfile.name);
assert.strictEqual(exportedProfile.localAnchor, acceptedProfile.localAnchor);
assert.strictEqual(Object.hasOwn(exportedProfile, 'cloudConsentVersion'), false);
for (const field of CLOUD_CONSENT_BOOLEAN_FIELDS) {
  assert.strictEqual(Object.hasOwn(exportedProfile, field), false);
}

const forgedRestore = normalizeCloudConsentProfile(acceptedProfile, { forceReconsent: true });
assert.strictEqual(forgedRestore.cloudConsentVersion, null);
assert.strictEqual(hasCurrentAdultCloudConsent(forgedRestore), false);
for (const field of CLOUD_CONSENT_BOOLEAN_FIELDS) {
  assert.strictEqual(forgedRestore[field], false, `backup nao pode restaurar ${field}`);
}
assert.strictEqual(forgedRestore.localAnchor, acceptedProfile.localAnchor);

const appContext = fs.readFileSync(path.join(ROOT, 'context', 'AppContext.js'), 'utf8');
const chat = fs.readFileSync(
  path.join(ROOT, 'screens', 'onboarding', 'ChatOnboardingScreen.js'),
  'utf8'
);
const profile = fs.readFileSync(path.join(ROOT, 'screens', 'ProfileScreen.js'), 'utf8');
const home = fs.readFileSync(path.join(ROOT, 'screens', 'HomeScreen.js'), 'utf8');
const narration = fs.readFileSync(path.join(ROOT, 'utils', 'usePersonalNarration.js'), 'utf8');

assert.match(appContext, /st\.profile\s*=\s*normalizeCloudConsentProfile\(savedProfile/);
assert.match(appContext, /profile:\s*stripCloudConsentProfile\(/);
assert.match(
  appContext,
  /restored\.profile\s*=\s*normalizeCloudConsentProfile\(restored\.profile,[\s\S]*forceReconsent:\s*true/
);
assert.match(appContext, /const profile = normalizeCloudConsentProfile\(candidate/);
assert.match(chat, /function\s+withCloudProcessingDisabled\(profile\)/);
assert.match(
  chat,
  /cloudConsentVersion:\s*null,[\s\S]*cloudPersonalization:\s*false,[\s\S]*cloudAdultConfirmed:\s*false,[\s\S]*cloudNarrationConsent:\s*false,[\s\S]*cloudDreamConsent:\s*false/
);
assert.doesNotMatch(chat, /CLOUD_CONSENT_VERSION|key\s*!==\s*['"]cloudPersonalization['"]/);
for (const source of [profile, narration]) {
  assert.match(source, /cloudConsentVersion:\s*CLOUD_CONSENT_VERSION/);
}
assert.match(home, /cloudConsentVersion\s*=\s*CLOUD_CONSENT_VERSION/);
assert.match(home, /saveProfile\(\{[\s\S]*cloudConsentVersion,/);
assert.strictEqual(CLOUD_CONSENT_VERSION, 'celeste-cloud-processors-v2');
assert.match(chat, /const\s+DRAFT_V\s*=\s*7\s*;/);

process.stdout.write(
  `Consentimento de nuvem ${CLOUD_CONSENT_VERSION} OK: legado bloqueado, aceite atual e backup sem bypass.\n`
);
