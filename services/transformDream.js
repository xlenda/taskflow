import {
  profileConfirmsAdult,
  redactThirdPartyNames,
  thirdPartyNames,
} from './generatePersonalizedScene';

const API_TIMEOUT_MS = 15000;
const PROD_API_URL = 'https://celeste-jet-two.vercel.app';
const FEELINGS = new Set(['', 'calm', 'joyful', 'curious', 'anxious', 'confused', 'powerful']);
const THEMES = new Set(['auto', 'clarity', 'courage', 'peace', 'connection', 'abundance', 'renewal']);

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
    : '';
}

function apiEndpoint() {
  const configured = cleanText(process.env.EXPO_PUBLIC_CELESTE_API_URL, 500).replace(/\/$/, '');
  if (configured) return `${configured}/api/transformar-sonho`;
  if (typeof window !== 'undefined' && window.location) return '/api/transformar-sonho';
  return `${PROD_API_URL}/api/transformar-sonho`;
}

function minimizeDreamProfile(profile, lang) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const privateNames = thirdPartyNames(source);
  const output = {};
  const limits = { name: 80, aboutYou: 600, whyMatters: 600, obstacle: 500 };
  for (const [key, limit] of Object.entries(limits)) {
    const raw = key === 'name'
      ? source[key]
      : redactThirdPartyNames(source[key], privateNames, lang);
    const value = cleanText(raw, limit);
    if (value) output[key] = value;
  }
  return output;
}

function requiredText(value, maxLength, field) {
  const text = cleanText(value, maxLength);
  if (!text) throw new Error(`invalid_dream_${field}`);
  return text;
}

function validateResponse(payload, source) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const generated = body.dream && typeof body.dream === 'object' ? body.dream : null;
  if (!generated) throw new Error('invalid_dream_response');
  const basis = Array.isArray(generated.basis)
    ? generated.basis.filter((item) => typeof item === 'string').slice(0, 4)
    : [];
  return {
    dream: source.dream,
    feeling: source.feeling,
    theme: source.theme === 'auto' ? 'clarity' : source.theme,
    reflection: requiredText(generated.reflection, 900, 'reflection'),
    affirmation: requiredText(generated.affirmation, 700, 'affirmation'),
    dreamAnchor: '',
    usedDetails: [
      ...(basis.includes('dream') ? ['dream_anchor'] : []),
      ...(basis.includes('feeling') && source.feeling ? ['feeling'] : []),
      ...(basis.includes('theme') && source.theme !== 'auto' ? ['theme'] : []),
    ],
    generatorVersion: cleanText(
      body.generation && body.generation.promptVersion,
      40
    ) || 'celeste-dream-v1',
    generation: {
      source: 'gemini-dream',
      model: cleanText(body.generation && body.generation.model, 100) || 'gemini',
      knowledgeVersion: cleanText(
        body.generation && body.generation.knowledgeVersion,
        80
      ) || 'celeste-knowledge-v1',
    },
  };
}

export async function transformDreamWithKnowledge({
  dream,
  feeling,
  theme,
  lang,
  profile,
  fetchImpl,
}) {
  const sourceProfile = profile && typeof profile === 'object' ? profile : {};
  if (
    sourceProfile.cloudDreamConsent !== true
  ) {
    throw new Error('cloud_consent_required');
  }
  if (!profileConfirmsAdult(sourceProfile)) {
    throw new Error('adult_confirmation_required');
  }
  const source = {
    dream: requiredText(dream, 1600, 'text'),
    feeling: FEELINGS.has(feeling || '') ? feeling || '' : '',
    theme: THEMES.has(theme || 'auto') ? theme || 'auto' : 'auto',
    lang: lang === 'en' ? 'en' : 'pt',
  };
  const safeDream = requiredText(
    redactThirdPartyNames(source.dream, thirdPartyNames(sourceProfile), source.lang),
    1600,
    'text'
  );
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), API_TIMEOUT_MS) : null;
  const request = fetchImpl || fetch;
  try {
    const response = await request(apiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        ...source,
        dream: safeDream,
        profile: minimizeDreamProfile(sourceProfile, source.lang),
        cloudConsent: true,
        adultConfirmed: true,
      }),
    });
    if (!response.ok) throw new Error(`dream_api_${response.status}`);
    return validateResponse(await response.json(), source);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const _dreamServiceInternals = {
  minimizeDreamProfile,
  validateResponse,
};
