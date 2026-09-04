export const MAX_NAVIGATION_PATH_LENGTH = 2048;
export const MAX_NAVIGATION_QUERY_PARTS = 32;

function queryPartCount(path) {
  const queryStart = path.indexOf('?');
  if (queryStart < 0 || queryStart === path.length - 1) return 0;
  const fragmentStart = path.indexOf('#', queryStart + 1);
  const query = path.slice(queryStart + 1, fragmentStart < 0 ? path.length : fragmentStart);
  return query ? query.split('&').length : 0;
}

export function isSafeNavigationPath(path) {
  if (typeof path !== 'string' || path.length > MAX_NAVIGATION_PATH_LENGTH) return false;
  if (queryPartCount(path) > MAX_NAVIGATION_QUERY_PARTS) return false;

  try {
    // Native decodeURIComponent is linear and rejects malformed percent UTF-8
    // before React Navigation reaches the vulnerable dependency fallback.
    const decoded = decodeURIComponent(path);
    return !/[\u0000-\u001f\u007f-\u009f]/.test(decoded);
  } catch (_error) {
    return false;
  }
}

export function safeNavigationStateFromPath(path, options, parser) {
  if (!isSafeNavigationPath(path) || typeof parser !== 'function') return undefined;
  try {
    return parser(path, options);
  } catch (_error) {
    return undefined;
  }
}
