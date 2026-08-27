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
const MAX_KNOWLEDGE_CARD_IDS_PER_PACK = 8;
const MAX_PREVIOUS_KNOWLEDGE_CARD_IDS = 24;
const UNDER_18_VALUES = new Set(['under18', 'menosde18']);
const CONTINUITY_COUNT_MAX = 10000;
const CONTINUITY_MAX_BYTES = 12 * 1024;
const KNOWLEDGE_CARD_ID = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const CONTINUITY_DREAM_THEMES = new Set([
  'clarity',
  'courage',
  'peace',
  'connection',
  'abundance',
  'renewal',
]);
const CONTINUITY_DREAM_FEELINGS = new Set([
  'calm',
  'joyful',
  'curious',
  'anxious',
  'confused',
  'powerful',
]);
const PREVIOUS_SCENE_LIMITS = {
  intention: 600,
  affirmation: 1200,
  story: 2400,
  anchorIdentity: 600,
  anchorStep: 280,
};
const CHRONOLOGY_CHAPTER_LIMITS = {
  title: 160,
  intention: 500,
  affirmation: 900,
  anchorIdentity: 500,
  anchorStep: 280,
};
const MEMORY_RECEIPTS = new Set([
  'desire',
  'practice_days',
  'completed_steps',
  'private_trace_count',
  'consented_dream_theme',
]);

function cleanText(value, max) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

function normalizeKnowledgeCardIds(value, max = MAX_KNOWLEDGE_CARD_IDS_PER_PACK) {
  return [...new Set(
    (Array.isArray(value) ? value : [])
      .map((id) => typeof id === 'string'
        ? id
            .replace(/[\u0000-\u001f\u007f]/g, '')
            .trim()
            .toLowerCase()
        : '')
      .filter((id) => id.length <= 80 && KNOWLEDGE_CARD_ID.test(id))
  )].slice(0, max);
}

function utf8ByteLength(value) {
  let bytes = 0;
  for (const character of String(value || '')) {
    const point = character.codePointAt(0);
    if (point <= 0x7f) bytes += 1;
    else if (point <= 0x7ff) bytes += 2;
    else if (point <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function truncateUtf8(value, maxBytes) {
  let output = '';
  let bytes = 0;
  for (const character of String(value || '')) {
    const size = utf8ByteLength(character);
    if (bytes + size > maxBytes) break;
    output += character;
    bytes += size;
  }
  return output.trim();
}

const serializedBytes = (value) => utf8ByteLength(JSON.stringify(value));

function compactSanitizedContinuity(value) {
  const output = value;
  const tooLarge = () => serializedBytes(output) > CONTINUITY_MAX_BYTES;
  const chronology = output.chronology;
  while (tooLarge() && chronology?.recentChapters?.length) {
    chronology.recentChapters.pop();
  }
  if (tooLarge() && output.previousScene) delete output.previousScene.story;
  if (output.previousScene && !Object.keys(output.previousScene).length) {
    delete output.previousScene;
  }
  while (tooLarge() && chronology?.recentDreamSignals?.length) {
    chronology.recentDreamSignals.pop();
  }
  if (tooLarge() && output.previousScene) {
    for (const [key, limit] of [
      ['affirmation', 1200],
      ['intention', 700],
      ['anchorIdentity', 700],
      ['anchorStep', 500],
    ]) {
      if (output.previousScene[key]) {
        output.previousScene[key] = truncateUtf8(output.previousScene[key], limit);
      }
    }
  }
  if (tooLarge()) delete output.previousScene;
  if (tooLarge()) delete output.chronology;
  return output;
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

function boundedInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function isoDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : '';
}

function isoTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const time = Date.parse(value);
  return Number.isNaN(time) ? '' : new Date(time).toISOString();
}

function sanitizeChronology(value, privateNames, lang) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out = {};
  const currentChapter = boundedInteger(value.currentChapter, 1, 365);
  const chapterCount = boundedInteger(value.chapterCount, 1, 365);
  const goalDays = boundedInteger(value.goalDays, 1, 365);
  if (currentChapter !== undefined) out.currentChapter = currentChapter;
  if (chapterCount !== undefined) out.chapterCount = chapterCount;
  if (goalDays !== undefined) out.goalDays = goalDays;
  const startedOn = isoDay(value.startedOn);
  const completedOn = isoDay(value.completedOn);
  const lastActivityAt = isoTimestamp(value.lastActivityAt);
  if (startedOn) out.startedOn = startedOn;
  if (completedOn) out.completedOn = completedOn;
  if (lastActivityAt) out.lastActivityAt = lastActivityAt;

  const recentChapters = (Array.isArray(value.recentChapters) ? value.recentChapters : [])
    .slice(0, 3)
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const chapter = boundedInteger(entry.chapter, 1, 365);
      const occurredAt = isoTimestamp(entry.occurredAt);
      if (chapter === undefined || !occurredAt) return null;
      const item = { chapter, occurredAt, lang: entry.lang === 'en' ? 'en' : 'pt' };
      for (const [key, limit] of Object.entries(CHRONOLOGY_CHAPTER_LIMITS)) {
        const text = cleanText(redactThirdPartyNames(entry[key], privateNames, lang), limit);
        if (text) item[key] = text;
      }
      const memoryReceipt = (Array.isArray(entry.memoryReceipt) ? entry.memoryReceipt : [])
        .filter((label) => MEMORY_RECEIPTS.has(label))
        .filter((label, index, labels) => labels.indexOf(label) === index)
        .slice(0, 5);
      if (memoryReceipt.length) item.memoryReceipt = memoryReceipt;
      return item;
    })
    .filter(Boolean);
  if (recentChapters.length) out.recentChapters = recentChapters;

  const recentDreamSignals = (Array.isArray(value.recentDreamSignals)
    ? value.recentDreamSignals
    : [])
    .slice(0, 3)
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      if (!CONTINUITY_DREAM_THEMES.has(entry.theme) || !CONTINUITY_DREAM_FEELINGS.has(entry.feeling)) {
        return null;
      }
      const item = {
        theme: entry.theme,
        feeling: entry.feeling,
        lang: entry.lang === 'en' ? 'en' : 'pt',
        practiceCount: boundedInteger(entry.practiceCount, 0, CONTINUITY_COUNT_MAX) || 0,
      };
      const occurredAt = isoTimestamp(entry.occurredAt);
      const lastPracticedAt = isoTimestamp(entry.lastPracticedAt);
      if (occurredAt) item.occurredAt = occurredAt;
      if (lastPracticedAt) item.lastPracticedAt = lastPracticedAt;
      return item;
    })
    .filter(Boolean);
  if (recentDreamSignals.length) out.recentDreamSignals = recentDreamSignals;
  out.rawDreamTextIncluded = false;
  return out;
}

// Continuity is deliberately narrower than the local journey state. Raw dreams,
// notes, traces and any unknown properties never cross the network boundary.
export function sanitizeContinuity(continuity, privateNames = [], lang = 'pt') {
  if (!continuity || typeof continuity !== 'object' || Array.isArray(continuity)) {
    return undefined;
  }
  const chapter = boundedInteger(continuity.chapter, 2, 365);
  if (chapter === undefined) return undefined;

  const out = { chapter };
  for (const key of ['practiceDays', 'evidenceCount', 'stepCompletions', 'dreamCount']) {
    const value = boundedInteger(continuity[key], 0, CONTINUITY_COUNT_MAX);
    if (value !== undefined) out[key] = value;
  }
  if (CONTINUITY_DREAM_THEMES.has(continuity.latestDreamTheme)) {
    out.latestDreamTheme = continuity.latestDreamTheme;
  }
  if (CONTINUITY_DREAM_FEELINGS.has(continuity.latestDreamFeeling)) {
    out.latestDreamFeeling = continuity.latestDreamFeeling;
  }
  const lastPracticeDay = isoDay(continuity.lastPracticeDay);
  if (lastPracticeDay) out.lastPracticeDay = lastPracticeDay;
  if (typeof continuity.previousStepCompleted === 'boolean') {
    out.previousStepCompleted = continuity.previousStepCompleted;
  }
  const previousKnowledgeCardIds = normalizeKnowledgeCardIds(
    continuity.previousKnowledgeCardIds,
    MAX_PREVIOUS_KNOWLEDGE_CARD_IDS
  );
  if (previousKnowledgeCardIds.length) {
    out.previousKnowledgeCardIds = previousKnowledgeCardIds;
  }
  const chronology = sanitizeChronology(continuity.chronology, privateNames, lang);
  if (chronology) out.chronology = chronology;

  const previous = continuity.previousScene;
  if (previous && typeof previous === 'object' && !Array.isArray(previous)) {
    const previousScene = {};
    for (const [key, limit] of Object.entries(PREVIOUS_SCENE_LIMITS)) {
      const value = cleanText(
        redactThirdPartyNames(previous[key], privateNames, lang),
        limit
      );
      if (value) previousScene[key] = value;
    }
    if (Object.keys(previousScene).length) out.previousScene = previousScene;
  }
  return compactSanitizedContinuity(out);
}

function apiEndpoint() {
  const configured = cleanText(process.env.EXPO_PUBLIC_CELESTE_API_URL, 500).replace(/\/$/, '');
  if (configured) return `${configured}/api/gerar-cena`;
  if (typeof window !== 'undefined' && window.location) return '/api/gerar-cena';
  return `${PROD_API_URL}/api/gerar-cena`;
}

async function paidApiHeaders(fetchImpl) {
  // Unit tests inject fetch directly; the server remains the security boundary.
  if (fetchImpl) return {};
  const { celestePaidApiHeaders } = require('./celesteApiSession');
  return celestePaidApiHeaders();
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
  const generationSource = body.generation && typeof body.generation === 'object'
    ? body.generation
    : {};
  const knowledgeCardIds = normalizeKnowledgeCardIds(generationSource.knowledgeCardIds);
  const hasKnowledgeReceipt = knowledgeCardIds.length > 0;
  const declaredSource = cleanText(generationSource.source, 40);
  const declaredPromptVersion = cleanText(generationSource.promptVersion, 80);
  const declaredKnowledgeVersion = cleanText(generationSource.knowledgeVersion, 80);
  const declaredBrainVersion = cleanText(generationSource.brainVersion, 80);
  const declaredProvider = cleanText(generationSource.provider, 20).toLowerCase();
  const provider = ['anthropic', 'openai', 'gemini'].includes(declaredProvider)
    ? declaredProvider
    : '';
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
      source: hasKnowledgeReceipt ? declaredSource || 'celeste-ai' : 'legacy-remote',
      model: cleanText(generationSource.model, 100) || 'unknown',
      promptVersion:
        declaredPromptVersion || (hasKnowledgeReceipt ? 'unknown' : 'legacy-unknown'),
      knowledgeVersion: declaredKnowledgeVersion || 'unknown',
      brainVersion: declaredBrainVersion || 'unknown',
      knowledgeCardIds,
      qualityScore:
        Number.isInteger(generationSource.qualityScore) &&
        generationSource.qualityScore >= 0 &&
        generationSource.qualityScore <= 100
          ? generationSource.qualityScore
          : undefined,
      provider: provider || undefined,
      fallbackUsed:
        typeof generationSource.fallbackUsed === 'boolean'
          ? generationSource.fallbackUsed
          : undefined,
      seed: Number.isInteger(generationSource.seed)
        ? generationSource.seed
        : undefined,
    },
  };
}

export async function generatePersonalizedScene({
  desire,
  category,
  lang,
  profile,
  continuity,
  fetchImpl,
}) {
  const title = cleanText(desire, 240);
  if (!title) throw new Error('missing_desire');

  const sourceProfile = profile && typeof profile === 'object' ? profile : {};
  const locale = lang === 'en' ? 'en' : 'pt';
  const privateNames = thirdPartyNames(sourceProfile);
  const safeTitle = cleanText(
    redactThirdPartyNames(title, privateNames, locale),
    240
  );
  const cloudConsent = sourceProfile.cloudPersonalization === true;
  const adultConfirmed = profileConfirmsAdult(sourceProfile);
  const safeContinuity = sanitizeContinuity(continuity, privateNames, locale);
  if (!cloudConsent) throw new Error('cloud_consent_required');
  if (!adultConfirmed) throw new Error('adult_confirmation_required');

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), API_TIMEOUT_MS) : null;
  const request = fetchImpl || fetch;
  try {
    const authorization = await paidApiHeaders(fetchImpl);
    const response = await request(apiEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authorization },
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
      body: JSON.stringify({
        desire: safeTitle,
        category,
        lang: locale,
        profile: minimizeProfile(sourceProfile, category, locale),
        cloudConsent,
        adultConfirmed,
        ...(safeContinuity ? { continuity: safeContinuity } : {}),
      }),
    });
    if (!response.ok) throw new Error(`scene_api_${response.status}`);
    return validateScene(await response.json());
  } finally {
    if (timer) clearTimeout(timer);
  }
}
