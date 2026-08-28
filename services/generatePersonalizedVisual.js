const VISUAL_API_TIMEOUT_MS = 58_000;
const MAX_RESPONSE_CHARS = 3_360_000;
const PROD_API_URL = 'https://celeste-jet-two.vercel.app';
const PROFILE_FIELD_LIMITS = Object.freeze({
  dreamLocation: 160,
  dreamHome: 120,
  work: 180,
  whyMatters: 600,
});
export const PERSONALIZED_VISUAL_MOODS = Object.freeze([
  'serene',
  'luminous',
  'grounded',
  'romantic',
  'abundant',
  'focused',
]);
const VISUAL_MOOD_SET = new Set(PERSONALIZED_VISUAL_MOODS);

function cleanText(value, max) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

function listedPersonName(item) {
  if (typeof item === 'string') return cleanText(item, 80);
  return item && typeof item === 'object' ? cleanText(item.name, 80) : '';
}

function thirdPartyNames(profile) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const ownName = cleanText(source.name, 80).toLocaleLowerCase();
  const names = [cleanText(source.manifestingName, 80)];
  for (const key of ['kids', 'people']) {
    if (!Array.isArray(source[key])) continue;
    source[key].forEach((item) => names.push(listedPersonName(item)));
  }
  return [...new Set(
    names.filter((name) => name.length >= 2 && name.toLocaleLowerCase() !== ownName)
  )];
}

function isNameBoundary(character) {
  return !character || !/[0-9A-Za-z\u00c0-\u024f]/.test(character);
}

function replaceWholeName(value, name, replacement) {
  let output = String(value || '');
  const needle = name.toLocaleLowerCase();
  let searchFrom = 0;
  while (needle && searchFrom < output.length) {
    const lower = output.toLocaleLowerCase();
    const index = lower.indexOf(needle, searchFrom);
    if (index < 0) break;
    const end = index + name.length;
    if (isNameBoundary(output[index - 1]) && isNameBoundary(output[end])) {
      output = `${output.slice(0, index)}${replacement}${output.slice(end)}`;
      searchFrom = index + replacement.length;
    } else {
      searchFrom = end;
    }
  }
  return output;
}

function redactThirdPartyNames(value, names, lang) {
  const replacement = lang === 'en' ? 'someone close to me' : 'uma pessoa proxima';
  return names.reduce((text, name) => replaceWholeName(text, name, replacement), String(value || ''));
}

export function minimizeVisualProfile(profile, lang = 'pt') {
  const source = profile && typeof profile === 'object' ? profile : {};
  const names = thirdPartyNames(source);
  const output = {};
  for (const [key, limit] of Object.entries(PROFILE_FIELD_LIMITS)) {
    const value = cleanText(redactThirdPartyNames(source[key], names, lang), limit);
    if (value) output[key] = value;
  }
  return output;
}

function profileConfirmsAdult(profile) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const age = cleanText(source.age, 40).toLocaleLowerCase().replace(/\s+/g, '');
  if (age === 'under18' || age === 'menosde18') return false;
  return source.cloudAdultConfirmed === true;
}

function apiEndpoint() {
  const configured = cleanText(process.env.EXPO_PUBLIC_CELESTE_API_URL, 500).replace(/\/$/, '');
  if (configured) return `${configured}/api/gerar-visual`;
  if (typeof window !== 'undefined' && window.location) return '/api/gerar-visual';
  return `${PROD_API_URL}/api/gerar-visual`;
}

async function paidApiHeaders(fetchImpl, signal) {
  // Tests inject fetch directly. Authentication remains mandatory on the server.
  if (fetchImpl) return {};
  const { celestePaidApiHeaders } = require('./celesteApiSession');
  return celestePaidApiHeaders({ signal });
}

function normalizedVisualTimeout(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return VISUAL_API_TIMEOUT_MS;
  return Math.max(10, Math.min(VISUAL_API_TIMEOUT_MS, Math.floor(parsed)));
}

function validBase64(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_RESPONSE_CHARS &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

const ERROR_CODE_PATTERN = /^[a-z0-9_-]{1,80}$/;
const ERROR_STAGE_PATTERN = /^[a-z0-9_-]{1,40}$/;

export const PersonalVisualError = class PersonalVisualError extends Error {
  constructor(code, { stage = 'client', status } = {}) {
    const safeCode = ERROR_CODE_PATTERN.test(code || '') ? code : 'visual_unavailable';
    super(safeCode);
    this.name = 'PersonalVisualError';
    this.code = safeCode;
    this.stage = ERROR_STAGE_PATTERN.test(stage || '') ? stage : 'client';
    if (Number.isInteger(status) && status >= 400 && status <= 599) this.status = status;
  }
};

function validateVisual(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  const image = source.image && typeof source.image === 'object' ? source.image : {};
  if (
    image.mimeType !== 'image/jpeg' ||
    image.aspectRatio !== '4:5' ||
    image.imageSize !== '1K' ||
    !validBase64(image.data)
  ) {
    throw new PersonalVisualError('invalid_personalized_visual', { stage: 'response' });
  }
  const generation = source.generation && typeof source.generation === 'object'
    ? source.generation
    : {};
  return {
    image: {
      mimeType: 'image/jpeg',
      data: image.data,
      bytes: Number.isInteger(image.bytes) && image.bytes > 0 ? image.bytes : undefined,
      aspectRatio: '4:5',
      imageSize: '1K',
    },
    overlay: {
      textColor: '#FFFFFF',
      scrimColor: 'rgba(8, 16, 28, 0.38)',
    },
    generation: {
      source: cleanText(generation.source, 80) || 'gemini-image',
      model: cleanText(generation.model, 100) || 'gemini-3.1-flash-image',
      promptVersion: cleanText(generation.promptVersion, 80) || 'celeste-visual-v1',
    },
  };
}

async function readJsonResponse(response) {
  const declaredLength = Number(response.headers && response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_CHARS) {
    throw new PersonalVisualError('personalized_visual_too_large', { stage: 'response' });
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new PersonalVisualError('personalized_visual_too_large', { stage: 'response' });
  }
  try {
    return JSON.parse(text);
  } catch (_error) {
    throw new PersonalVisualError('invalid_personalized_visual', { stage: 'response' });
  }
}

async function visualApiError(response) {
  let payload = null;
  try {
    const text = await response.text();
    if (text.length <= 4096) payload = JSON.parse(text);
  } catch (_error) {
    // The status still provides a bounded, non-personal error classification.
  }
  const code = ERROR_CODE_PATTERN.test(payload && payload.error)
    ? payload.error
    : `visual_api_${response.status}`;
  const stage = ERROR_STAGE_PATTERN.test(payload && payload.stage) ? payload.stage : 'api';
  return new PersonalVisualError(code, { stage, status: response.status });
}

export async function generatePersonalizedVisual({
  desire,
  category,
  lang,
  profile,
  visualMood,
  fetchImpl,
  timeoutMs,
}) {
  const locale = lang === 'en' ? 'en' : 'pt';
  const sourceProfile = profile && typeof profile === 'object' ? profile : {};
  const names = thirdPartyNames(sourceProfile);
  const safeDesire = cleanText(redactThirdPartyNames(desire, names, locale), 240);
  if (!safeDesire) throw new PersonalVisualError('missing_desire', { stage: 'validation' });
  if (!VISUAL_MOOD_SET.has(visualMood)) {
    throw new PersonalVisualError('invalid_visual_mood', { stage: 'validation' });
  }
  if (sourceProfile.cloudPersonalization !== true) {
    throw new PersonalVisualError('cloud_consent_required', { stage: 'validation' });
  }
  if (!profileConfirmsAdult(sourceProfile)) {
    throw new PersonalVisualError('adult_confirmation_required', { stage: 'validation' });
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const request = fetchImpl || fetch;
  let timer = null;
  let timedOut = false;
  try {
    const timeoutPromise = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        if (controller) controller.abort();
        reject(new PersonalVisualError('personalized_visual_timeout', { stage: 'client_timeout' }));
      }, normalizedVisualTimeout(timeoutMs));
    });
    const operation = (async () => {
      let authorization;
      try {
        authorization = await paidApiHeaders(fetchImpl, controller ? controller.signal : undefined);
      } catch (error) {
        throw new PersonalVisualError(
          ERROR_CODE_PATTERN.test(error && error.message)
            ? error.message
            : 'cloud_session_unavailable',
          { stage: 'session' }
        );
      }
      if (timedOut || (controller && controller.signal.aborted)) {
        throw new PersonalVisualError('personalized_visual_timeout', { stage: 'client_timeout' });
      }
      let response;
      try {
        response = await request(apiEndpoint(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authorization },
          cache: 'no-store',
          signal: controller ? controller.signal : undefined,
          body: JSON.stringify({
            desire: safeDesire,
            category,
            lang: locale,
            profile: minimizeVisualProfile(sourceProfile, locale),
            visualMood,
            cloudConsent: true,
            adultConfirmed: true,
          }),
        });
      } catch (error) {
        if (timedOut || (error && error.name === 'AbortError')) {
          throw new PersonalVisualError('personalized_visual_timeout', { stage: 'network' });
        }
        throw new PersonalVisualError('personalized_visual_network_error', { stage: 'network' });
      }
      if (!response.ok) throw await visualApiError(response);
      return validateVisual(await readJsonResponse(response));
    })();
    return await Promise.race([operation, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// This helper is intentionally fire-and-continue: onboarding can move on while
// the visual is prepared, and a failed image never blocks the personal scene.
export function generatePersonalizedVisualInBackground(options, callbacks = {}) {
  return Promise.resolve()
    .then(() => generatePersonalizedVisual(options))
    .then((visual) => {
      if (typeof callbacks.onReady === 'function') callbacks.onReady(visual);
      return visual;
    })
    .catch((error) => {
      if (typeof callbacks.onError === 'function') callbacks.onError(error);
      return null;
    });
}
