import {
  profileConfirmsAdult,
  profileAnswerHasDetail,
  redactThirdPartyNames,
  thirdPartyNames,
} from './generatePersonalizedScene';
import { celestePaidApiHeaders } from './celesteApiSession';
import {
  CLOUD_CONSENT_VERSION,
  hasCurrentCloudConsentVersion,
} from '../constants/cloudConsent';

const API_TIMEOUT_MS = 15000;
const PROD_API_URL = 'https://celeste-jet-two.vercel.app';
const FEELINGS = new Set(['', 'calm', 'joyful', 'curious', 'anxious', 'confused', 'powerful']);
const THEMES = new Set(['auto', 'clarity', 'courage', 'peace', 'connection', 'abundance', 'renewal']);
const DREAM_PROFILE_FIELDS = Object.freeze({
  name: { limit: 80, sources: ['name'] },
  aboutYou: { limit: 600, sources: ['aboutYou', 'selfDescription'] },
  whyMatters: { limit: 600, sources: ['whyMatters', 'whyItMatters'] },
  obstacle: { limit: 500, sources: ['obstacle'] },
  desire: { limit: 600, sources: ['desire', 'hopedChange'] },
  desiredFeeling: { limit: 160, sources: ['desiredFeeling'] },
  work: { limit: 180, sources: ['work'] },
  partnerDesire: { limit: 400, sources: ['partnerDesire'] },
  dreamLocation: { limit: 160, sources: ['dreamLocation'] },
  dreamHome: { limit: 120, sources: ['dreamHome'] },
});

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
  for (const [key, config] of Object.entries(DREAM_PROFILE_FIELDS)) {
    const sourceKey = config.sources.find((candidate) => cleanText(source[candidate], config.limit));
    const sourceValue = sourceKey ? source[sourceKey] : '';
    const raw = key === 'name'
      ? sourceValue
      : redactThirdPartyNames(sourceValue, privateNames, lang);
    const value = cleanText(raw, config.limit);
    if (profileAnswerHasDetail(value)) output[key] = value;
  }
  return output;
}

function requiredText(value, maxLength, field) {
  const text = cleanText(value, maxLength);
  if (!text) throw new Error(`invalid_dream_${field}`);
  return text;
}

function normalizedWords(value) {
  return cleanText(value, 4000)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function hasDreamRecallEcho(recall, generated) {
  const source = normalizedWords(recall);
  const output = normalizedWords(generated);
  if (source.length < 3 || output.length < 3) return false;
  const sourcePhrases = new Set();
  for (let index = 0; index <= source.length - 3; index += 1) {
    sourcePhrases.add(source.slice(index, index + 3).join(' '));
  }
  for (let index = 0; index <= output.length - 3; index += 1) {
    if (sourcePhrases.has(output.slice(index, index + 3).join(' '))) return true;
  }
  return false;
}

function validateResponse(payload, source) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const generated = body.dream && typeof body.dream === 'object' ? body.dream : null;
  if (!generated) throw new Error('invalid_dream_response');
  const generationSource = body.generation && typeof body.generation === 'object'
    ? body.generation
    : {};
  const knowledgeCardIds = (Array.isArray(generationSource.knowledgeCardIds)
    ? generationSource.knowledgeCardIds
    : [])
    .map((id) => cleanText(id, 80).toLowerCase())
    .filter((id) => /^[a-z0-9][a-z0-9_-]{1,79}$/.test(id))
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .slice(0, 8);
  const hasKnowledgeReceipt = knowledgeCardIds.length > 0;
  const declaredSource = cleanText(generationSource.source, 40);
  const declaredPromptVersion = cleanText(generationSource.promptVersion, 80);
  const declaredKnowledgeVersion = cleanText(generationSource.knowledgeVersion, 80);
  const declaredBrainVersion = cleanText(generationSource.brainVersion, 80);
  const basis = Array.isArray(generated.basis)
    ? generated.basis.filter((item) => typeof item === 'string').slice(0, 4)
    : [];
  const reflection = requiredText(generated.reflection, 900, 'reflection');
  const affirmation = requiredText(generated.affirmation, 700, 'affirmation');
  const generatedTheme = THEMES.has(generated.theme) && generated.theme !== 'auto'
    ? generated.theme
    : source.theme !== 'auto'
      ? source.theme
      : 'clarity';
  if (hasDreamRecallEcho(source.dream, `${reflection} ${affirmation}`)) {
    throw new Error('invalid_dream_echo');
  }
  return {
    dream: source.dream,
    feeling: source.feeling,
    theme: generatedTheme,
    reflection,
    affirmation,
    dreamAnchor: '',
    usedDetails: [
      ...(basis.includes('dream') ? ['dream_semantics'] : []),
      ...(basis.includes('feeling') && source.feeling ? ['feeling'] : []),
      ...(basis.includes('theme') ? ['theme'] : []),
    ],
    generatorVersion: cleanText(
      body.generation && body.generation.promptVersion,
      40
    ) || (hasKnowledgeReceipt ? 'unknown' : 'legacy-dream-unknown'),
    generation: {
      source: hasKnowledgeReceipt ? declaredSource || 'gemini-dream' : 'legacy-remote',
      model: cleanText(generationSource.model, 100) || 'unknown',
      promptVersion:
        declaredPromptVersion || (hasKnowledgeReceipt ? 'unknown' : 'legacy-dream-unknown'),
      knowledgeVersion: declaredKnowledgeVersion || 'unknown',
      brainVersion: declaredBrainVersion || 'unknown',
      knowledgeCardIds,
      qualityScore:
        Number.isInteger(generationSource.qualityScore) &&
        generationSource.qualityScore >= 0 &&
        generationSource.qualityScore <= 100
          ? generationSource.qualityScore
          : undefined,
      seed: Number.isInteger(generationSource.seed)
        ? generationSource.seed
        : undefined,
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
    !hasCurrentCloudConsentVersion(sourceProfile) ||
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
    const authorization = fetchImpl ? {} : await celestePaidApiHeaders();
    const response = await request(apiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authorization },
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        ...source,
        dream: safeDream,
        profile: minimizeDreamProfile(sourceProfile, source.lang),
        cloudConsent: true,
        cloudConsentVersion: CLOUD_CONSENT_VERSION,
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
  hasDreamRecallEcho,
  minimizeDreamProfile,
  validateResponse,
};
