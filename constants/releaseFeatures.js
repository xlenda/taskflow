import { Platform } from 'react-native';

/**
 * Store-facing release boundary for the first Android submission.
 *
 * Android stays fail-closed when the build flag is missing. A dedicated local
 * development build may set the flag to `0` to exercise the Community UI, but
 * the affirmation alarm remains Apple-only until its Android permissions and
 * Play declaration are intentionally reintroduced together.
 */
export function releaseFeaturesForPlatform(
  platformOS,
  androidStoreRelease = process.env.EXPO_PUBLIC_CELESTE_ANDROID_STORE_RELEASE,
  paywallPreview = process.env.EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW
) {
  const androidStoreBoundary =
    platformOS === 'android' && androidStoreRelease !== '0';

  return Object.freeze({
    androidStoreBoundary,
    publicCommunity: !androidStoreBoundary,
    affirmationAlarm: platformOS !== 'android',
    // "Meu despertar" (build the sequence, listen to it) everywhere. iOS wakes
    // with AlarmKit above; Android gets an ordinary reminder with sound that
    // opens the sequence (no exact alarm); the website only prepares and plays.
    wakeSequence: true,
    // Common local notifications stay inside the Android store boundary. The
    // plan never enables the exact-alarm module and speech is requested only
    // from the foreground ritual after a clear disclosure. Web speech engines
    // may use a remote service, so the privacy-preserving native verifier is
    // offered only on Android and Apple builds.
    practicePlan: true,
    onDevicePracticeSpeech: platformOS === 'android' || platformOS === 'ios',
    // The Celeste voice (the narrator she picks) on the website and in both store
    // apps. App requests pass the server only with a verified proof of the official
    // binary (Play Integrity on Android, App Attest on iOS); otherwise the device
    // voice reads with an honest notice.
    cloudNarration: ['web', 'android', 'ios'].includes(platformOS),
    // The AI texts: the Anchor Scene, the 6+6 visions and affirmations and the
    // scene translation, on the website and in both store apps (verified the same
    // way; without it the texts built on the device stay, with no error). The apps
    // ask for them in their own consent (ANDROID_CLOUD_CONSENT_VERSION, the same on
    // Android and iOS).
    cloudText: ['web', 'android', 'ios'].includes(platformOS),
    // Images, cloud dreams and the Living Mirror stay website-only. If a future
    // app build turns this on, bump ANDROID_CLOUD_CONSENT_VERSION
    // (constants/cloudConsent.js, used by utils/useCloudMediaConsent.js): the
    // consent app users gave (ANDROID_CLOUD_CONSENT_COPY) names only the voice and texts.
    paidCloudProcessing: platformOS === 'web',
    // Subscription (RevenueCat) on the iPhone only. The website turns it on just in a local
    // preview export (EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW=1, fake plans) that
    // scripts/deploy-celeste.js refuses to publish. Android never has it.
    subscription: platformOS === 'ios' || (platformOS === 'web' && paywallPreview === '1'),
  });
}

export const RELEASE_FEATURES = releaseFeaturesForPlatform(Platform.OS);
