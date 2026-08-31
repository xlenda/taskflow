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
    paidCloudProcessing: platformOS === 'web',
  });
}

export const RELEASE_FEATURES = releaseFeaturesForPlatform(Platform.OS);
