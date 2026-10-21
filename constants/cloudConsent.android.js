// Android build: Metro picks this file over cloudConsent.js, so the app checks, stores and sends the version of
// the consent it shows (voice + AI texts). The explicit `.js` keeps Metro from resolving this file again; the
// server keeps requiring cloudConsent.js, which accepts both versions on the voice and text routes.
const shared = require('./cloudConsent.js');

module.exports = { ...shared, ...shared.cloudConsentRules(shared.ANDROID_CLOUD_CONSENT_VERSION) };
