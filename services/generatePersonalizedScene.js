// The server keeps its own 18 s ceiling. The client leaves earlier so the
// tested local generator can finish the onboarding instead of feeling frozen.
const API_TIMEOUT_MS = 15000;
const PROD_API_URL = 'https://celeste-jet-two.vercel.app';

const PROFILE_FIELD_LIMITS = {
  name: 80,
  whyMatters: 600,
  obstacle: 500,
  city: 160,
  dreamLocation: 160,
  dreamHome: 120,
  work: 180,
  workFeeling: 120,
  relationshipStatus: 120,
  aboutYou: 600,
  partnerDesire: 400,
  pastInfluence: 600,
};

const COMMON_PROFILE_FIELDS = ['name', 'aboutYou', 'obstacle', 'whyMatters'];
const CATEGORY_PROFILE_FIELDS = {
  Love: ['relationshipStatus', 'partnerDesire', 'pastInfluence'],
  Wealth: ['city', 'dreamLocation', 'dreamHome', 'work', 'workFeeling'],
  Career: ['city', 'dreamLocation', 'work', 'workFeeling'],
  Health: ['pastInfluence'],
  Confidence: ['pastInfluence'],
  Peace: [],
};
const MAX_PERSONALIZED_LABELS = 16;
const UNDER_18_VALUES = new Set(['under18', 'menosde18']);

function cleanText(value, max) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

function normalizedAge(value) {
  return cleanText(value, 40)
    .toLocaleLowerCase()
    .replace(/[\u2014\u2212-]/g, '–')
    .replace(/\s+/g, '');
}

export function profileConfirmsAdult(profile) {
  const source = profile && typeof profile === 'object' ? profile : {};
  if (UNDER_18_VALUES.has(normalizedAge(source.age))) return false;
  return source.cloudAdultConfirmed === true;
}

function listedPersonName(item) {
  if (typeof item === 'string') return cleanText(item, 80);
  return item && typeof item === 'object' ? cleanText(item.name, 80) : '';
}

export function thirdPartyNames(profile) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const ownName = cleanText(source.name, 80).toLocaleLowerCase();
  const names = [cleanText(source.manifestingName, 80)];
  for (const key of ['kids', 'people']) {
    if (!Array.isArray(source[key])) continue;
    source[key].forEach((item) => names.push(listedPersonName(item)));
  }
  return [...new Set(names.filter((name) => name.length >= 2 && name.toLocaleLowerCase() !== ownName))];
}

function isNameBoundary(character) {
  return !character || !/[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(character);
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

export function redactThirdPartyNames(value, names, lang) {
  const replacement = lang === 'en' ? 'someone close to me' : 'uma pessoa próxima';
  return names.reduce((text, name) => replaceWholeName(text, name, replacement), String(value || ''));
}

// Only the answers that can genuinely improve the scene leave the device.
// UI preferences, practice history and private evidence are never included.
export function minimizeProfile(profile, category, lang = 'pt') {
  const source = profile && typeof profile === 'object' ? profile : {};
  const privateNames = thirdPartyNames(source);
  const out = {};
  const fields = [
    ...COMMON_PROFILE_FIELDS,
    ...(CATEGORY_PROFILE_FIELDS[category] || []),
  ];
  fields.forEach((key) => {
    const raw = key === 'name'
      ? source[key]
      : redactThirdPartyNames(source[key], privateNames, lang);
    const value = cleanText(raw, PROFILE_FIELD_LIMITS[key]);
    if (value) out[key] = value;
  });
  return out;
}

function apiEndpoint() {
  const configured = cleanText(process.env.EXPO_PUBLIC_CELESTE_API_URL, 500).replace(/\/$/, '');
  if (configured) return `${configured}/api/gerar-cena`;
  if (typeof window !== 'undefined' && window.location) return '/api/gerar-cena';
  return `${PROD_API_URL}/api/gerar-cena`;
}

function requiredText(value, max, field) {
  const text = cleanText(value, max);
  if (!text) throw new Error(`invalid_scene_${field}`);
  return text;
}

function validateScene(payload) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const raw = body.scene && typeof body.scene === 'object' ? body.scene : null;
  if (!raw) throw new Error('invalid_scene');
  const cleanLabels = (value) =>
    Array.isArray(value)
      ? value
        .filter((label) => typeof label === 'string' && label.trim())
        .map((label) => label.trim().slice(0, 80))
        .slice(0, MAX_PERSONALIZED_LABELS)
      : [];
  const legacyLabels = cleanLabels(raw.personalizedWith);
  const affirmationLabels = cleanLabels(raw.affirmationPersonalizedWith);
  const storyLabels = cleanLabels(raw.storyPersonalizedWith);
  const labels = [...new Set([...legacyLabels, ...affirmationLabels, ...storyLabels])];
  return {
    scene: {
      intention: requiredText(raw.intention, 600, 'intention'),
      affirmation: requiredText(raw.affirmation, 1200, 'affirmation'),
      story: requiredText(raw.story, 12000, 'story'),
      anchorIdentity: requiredText(raw.anchorIdentity, 600, 'identity'),
      anchorStep: requiredText(raw.anchorStep, 280, 'step'),
      personalizedWith: labels,
      affirmationPersonalizedWith: affirmationLabels,
      storyPersonalizedWith: storyLabels,
    },
    generation: {
      source: 'gemini',
      model: cleanText(body.generation && body.generation.model, 100) || 'gemini',
      promptVersion: cleanText(body.generation && body.generation.promptVersion, 80) || 'celeste-scene-v5',
      knowledgeVersion:
        cleanText(body.generation && body.generation.knowledgeVersion, 80) ||
        'celeste-knowledge-v1',
      seed: Number.isInteger(body.generation && body.generation.seed)
        ? body.generation.seed
        : undefined,
    },
  };
}

export async function generatePersonalizedScene({ desire, category, lang, profile, fetchImpl }) {
  const title = cleanText(desire, 240);
  if (!title) throw new Error('missing_desire');

  const sourceProfile = profile && typeof profile === 'object' ? profile : {};
  const cloudConsent = sourceProfile.cloudPersonalization === true;
  const adultConfirmed = profileConfirmsAdult(sourceProfile);
  if (!cloudConsent) throw new Error('cloud_consent_required');
  if (!adultConfirmed) throw new Error('adult_confirmation_required');

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
        desire: title,
        category,
        lang: lang === 'en' ? 'en' : 'pt',
        profile: minimizeProfile(sourceProfile, category, lang),
        cloudConsent,
        adultConfirmed,
      }),
    });
    if (!response.ok) throw new Error(`scene_api_${response.status}`);
    return validateScene(await response.json());
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const __test = {
  cleanText,
  validateScene,
  apiEndpoint,
  redactThirdPartyNames,
  thirdPartyNames,
};
