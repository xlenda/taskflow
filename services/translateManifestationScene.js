import {
  profileConfirmsAdult,
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
const TEXT_LIMITS = {
  title: 160,
  intention: 600,
  affirmation: 1200,
  story: 12000,
  anchorIdentity: 600,
  anchorStep: 280,
};

function cleanText(value, max) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max)
    : '';
}

function cleanLabels(value) {
  return (Array.isArray(value) ? value : [])
    .filter((label) => typeof label === 'string' && label.trim())
    .map((label) => cleanText(label, 80))
    .filter(Boolean)
    .slice(0, 16);
}

function cleanScene(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const scene = {};
  Object.entries(TEXT_LIMITS).forEach(([field, max]) => {
    const text = cleanText(source[field], max);
    if (!text) throw new Error(`invalid_translation_${field}`);
    scene[field] = text;
  });
  scene.personalizedWith = cleanLabels(source.personalizedWith);
  return scene;
}

function sceneForCloud(value, profile, sourceLang) {
  const clean = cleanScene(value);
  const privateNames = thirdPartyNames(profile);
  if (!privateNames.length) return clean;
  const redacted = {};
  Object.entries(TEXT_LIMITS).forEach(([field, max]) => {
    redacted[field] = cleanText(
      redactThirdPartyNames(clean[field], privateNames, sourceLang),
      max
    );
  });
  redacted.personalizedWith = clean.personalizedWith.map((label) =>
    cleanText(redactThirdPartyNames(label, privateNames, sourceLang), 80)
  );
  return redacted;
}

function apiEndpoint() {
  const configured = cleanText(process.env.EXPO_PUBLIC_CELESTE_API_URL, 500).replace(/\/$/, '');
  if (configured) return `${configured}/api/traduzir-cena`;
  if (typeof window !== 'undefined' && window.location) return '/api/traduzir-cena';
  return `${PROD_API_URL}/api/traduzir-cena`;
}

function cleanGeneration(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    source: 'gemini-translation',
    model: cleanText(source.model, 100) || 'gemini',
    promptVersion: cleanText(source.promptVersion, 80) || 'celeste-translation-v1',
    seed: Number.isInteger(source.seed) ? source.seed : undefined,
  };
}

export async function translateManifestationScene({
  sourceLang,
  targetLang,
  scene,
  profile,
  fetchImpl,
}) {
  const from = sourceLang === 'en' ? 'en' : 'pt';
  const to = targetLang === 'en' ? 'en' : 'pt';
  if (from === to) throw new Error('translation_languages_equal');

  const sourceProfile = profile && typeof profile === 'object' ? profile : {};
  if (
    !hasCurrentCloudConsentVersion(sourceProfile) ||
    sourceProfile.cloudPersonalization !== true
  ) throw new Error('cloud_consent_required');
  if (!profileConfirmsAdult(sourceProfile)) throw new Error('adult_confirmation_required');

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
        sourceLang: from,
        targetLang: to,
        scene: sceneForCloud(scene, sourceProfile, from),
        cloudConsent: true,
        cloudConsentVersion: CLOUD_CONSENT_VERSION,
        adultConfirmed: true,
      }),
    });
    if (!response.ok) throw new Error(`translation_api_${response.status}`);
    const payload = await response.json();
    return {
      scene: cleanScene(payload && payload.scene),
      generation: cleanGeneration(payload && payload.generation),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
