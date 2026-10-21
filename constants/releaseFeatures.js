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
  androidStoreRelease = process.env.EXPO_PUBLIC_CELESTE_ANDROID_STORE_RELEASE
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
    // The Celeste voice (the narrator she picks) on the website and on Android
    // alike. Android requests pass the server only with a verified Play
    // Integrity token; otherwise the device voice reads with an honest notice.
    cloudNarration: platformOS === 'web' || platformOS === 'android',
    // Images, cloud scenes, dreams and the Living Mirror stay website-only. If a
    // future Android build turns this on, bump CLOUD_CONSENT_VERSION
    // (constants/cloudConsent.js, used by utils/useCloudMediaConsent.js): the
    // consent Android users gave (VOICE_ONLY_COPY) named only the voice.
    paidCloudProcessing: platformOS === 'web',
  });
}

export const RELEASE_FEATURES = releaseFeaturesForPlatform(Platform.OS);
