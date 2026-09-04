import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { initialState } from '../constants/content';
import {
  hasCurrentAdultCloudConsent,
  normalizeCloudConsentProfile,
  stripCloudConsentProfile,
} from '../constants/cloudConsent';
import { detectLang } from '../constants/i18n';
import { isNarratorId } from '../constants/narrators';
import { todayISO, streakFrom } from '../utils/date';
import { dreamToAffirmation } from '../utils/dreamToAffirmation';
import {
  createPracticeReceipt,
  normalizePracticePlan,
  practiceContentFingerprint,
} from '../utils/practicePlan';
import { personalAffirmationsForState } from '../utils/personalAffirmations';
import {
  JOURNEY_CATEGORIES,
  buildPersonalJourneySuites,
  journeyVisualStatusKey,
  normalizePersonalJourneySuite,
  personalJourneyItemsForState,
} from '../utils/personalJourney';
import {
  applyTranslatedManifestationVariant,
  localInterpretedUpgradeCandidate,
  localizeManifestation,
  manifestationVariantFromScene,
  repairLegacyLocalManifestation,
  shouldTranslateManifestationVariant,
  snapshotManifestationContent,
} from '../utils/manifestationLanguage';
import { generatePersonalizedScene } from '../services/generatePersonalizedScene';
import { generatePersonalizedVisual } from '../services/generatePersonalizedVisual';
import { translateManifestationScene } from '../services/translateManifestationScene';
import {
  acquirePersonalVisual,
  clearPersonalVisuals,
  createPersonalVisualCacheKey,
  deletePersonalVisual,
  isPersonalVisualCacheKey,
  savePersonalVisual,
} from '../services/personalVisualStorage';
import { createSerialStorageWriter } from '../utils/serialStorageWriter';
import { alarmWeekdaysOrDefault, normalizeAlarmWeekdays } from '../utils/alarmSchedule';
import {
  bridgeDoneOn,
  buildEvolutionContinuity,
  emptyLivingMirror,
  livingMirrorReceipt,
  livingMirrorStatus,
  normalizeLivingMirror,
  snapshotLivingMirrorChapter,
} from '../utils/livingMirror';
import {
  beginCommunityDataReset,
  cancelCommunityDataReset,
  exportLocalCommunityStoriesForBackup,
  finishCommunityDataReset,
  restoreLocalCommunityStoriesFromBackup,
  validateLocalCommunityStoriesBackup,
} from '../services/communityStories';
import {
  cancelDailyRitualReminder,
  cancelOrphanedDailyRitualReminders,
} from '../services/dailyRitualReminder';
import { cancelPracticePlanReminders } from '../services/practicePlanReminders';
import {
  cancelAffirmationAlarm,
  getAffirmationAlarmCapability,
} from '../services/affirmationAlarm';

const STORAGE_KEY = '@stella_state_v2';
const AUXILIARY_STORAGE_KEYS = [
  '@celeste_community_stories_v1',
  '@celeste_onb_draft',
  '@celeste_home_invite_dismissed_v1',
];
const STORAGE_READ_TIMEOUT_MS = 6000;
const STORAGE_WRITE_TIMEOUT_MS = 6000;
const TRANSLATION_BATCH_SIZE = 8;
const TRANSLATION_BATCH_DELAY_MS = 61000;
const TRANSLATION_START_DELAY_MS = 350;
const PERSONAL_VISUAL_RETRY_BASE_MS = 15_000;
const PERSONAL_VISUAL_RETRY_MAX_MS = 5 * 60_000;
export const CELESTE_BACKUP_FORMAT = 'celeste-backup';
export const CELESTE_BACKUP_VERSION = 2;
export const CELESTE_BACKUP_MAX_BYTES = 8 * 1024 * 1024;
const CELESTE_BACKUP_RESTORE_POLICY = 'replace-local-device-data';
const AppCtx = createContext(null);

function settleWithin(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ settled: false, value: null, error: null });
    }, Math.max(1, timeoutMs));
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ settled: true, value, error: null });
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ settled: true, value: null, error });
      }
    );
  });
}

const RITUAL_THEMES = ['clarity', 'courage', 'peace', 'connection', 'abundance', 'renewal'];
const RITUAL_FEELINGS = ['calm', 'joyful', 'curious', 'anxious', 'confused', 'powerful'];
const RITUAL_DETAIL_KEYS = ['dream_semantics', 'feeling', 'theme'];
const VISUAL_MOODS = ['midnight', 'violet', 'ember', 'forest', 'paper', 'cloud', 'blossom', 'mono'];
const PERSONAL_VISUAL_SOURCE_FIELDS = ['desire', 'dreamLocation', 'dreamHome', 'work', 'whyMatters'];
const PERSONAL_VISUAL_MOOD_MAP = {
  midnight: 'serene',
  violet: 'romantic',
  ember: 'abundant',
  forest: 'grounded',
  paper: 'focused',
  cloud: 'luminous',
  blossom: 'romantic',
  mono: 'focused',
};
const validTime = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  return !!match && Number(match[1]) < 24 && Number(match[2]) < 60;
};
const shortText = (value, max) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

function practiceOptionsForState(state) {
  const lang = state?.lang === 'en' ? 'en' : 'pt';
  const affirmations = personalAffirmationsForState(state);
  const visions = personalJourneyItemsForState(state, 'vision', lang);
  return {
    affirmations,
    affirmationIds: affirmations.map((item) => shortText(item?.id, 160)).filter(Boolean),
    visions,
    visionIds: visions.map((item) => shortText(item?.id, 160)).filter(Boolean),
  };
}
const validDay = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const uniqueShortStrings = (values, maxLength, maxItems) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => shortText(value, maxLength))
        .filter(Boolean)
    )
  ).slice(0, maxItems);

function sanitizeAnchorAnswerValue(value, depth = 0) {
  if (depth > 4 || value === undefined || typeof value === 'function') return undefined;
  if (typeof value === 'string') return shortText(value, 1600);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .slice(0, 40)
      .map((entry) => sanitizeAnchorAnswerValue(entry, depth + 1))
      .filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== 'object') return undefined;
  const output = {};
  Object.entries(value).slice(0, 80).forEach(([rawKey, entry]) => {
    const key = shortText(rawKey, 80);
    if (!key || ['__proto__', 'prototype', 'constructor'].includes(key)) return;
    const safe = sanitizeAnchorAnswerValue(entry, depth + 1);
    if (safe !== undefined) output[key] = safe;
  });
  return output;
}

function sanitizeAnchorAnswers(value) {
  const result = sanitizeAnchorAnswerValue(value, 0);
  return result && typeof result === 'object' && !Array.isArray(result) ? result : {};
}
const normalizeKnowledgeCardIds = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) =>
          typeof value === 'string'
            ? value
                .replace(/[\u0000-\u001f\u007f]/g, '')
                .trim()
                .toLowerCase()
            : ''
        )
        .filter((id) => id.length <= 80 && /^[a-z0-9][a-z0-9_-]{1,79}$/.test(id))
    )
  ).slice(0, 8);

const sanitizeGenerationReceipt = (value, fallbackSource, fallbackPromptVersion) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {
    source: shortText(source.source, 40) || fallbackSource,
    promptVersion: shortText(source.promptVersion, 80) || fallbackPromptVersion,
  };
  const model = shortText(source.model, 100);
  const knowledgeVersion = shortText(source.knowledgeVersion, 80);
  const brainVersion = shortText(source.brainVersion, 80);
  const providerCandidate = shortText(source.provider, 20).toLowerCase();
  const provider = ['anthropic', 'openai', 'gemini'].includes(providerCandidate)
    ? providerCandidate
    : '';
  const knowledgeCardIds = normalizeKnowledgeCardIds(source.knowledgeCardIds);
  if (model) out.model = model;
  if (knowledgeVersion) out.knowledgeVersion = knowledgeVersion;
  if (brainVersion) out.brainVersion = brainVersion;
  if (provider) out.provider = provider;
  if (typeof source.fallbackUsed === 'boolean') out.fallbackUsed = source.fallbackUsed;
  if (knowledgeCardIds.length) out.knowledgeCardIds = knowledgeCardIds;
  if (Number.isInteger(source.qualityScore) && source.qualityScore >= 0 && source.qualityScore <= 100) {
    out.qualityScore = source.qualityScore;
  }
  if (Number.isInteger(source.seed)) out.seed = source.seed;
  return out;
};

const sanitizePersonalVisualReceipt = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const cacheKey = shortText(source.cacheKey, 140).toLowerCase();
  if (!isPersonalVisualCacheKey(cacheKey)) return null;
  const out = {
    cacheKey,
    mimeType: 'image/jpeg',
    aspectRatio: '4:5',
    sourceFields: uniqueShortStrings(source.sourceFields, 40, 4).filter((field) =>
      PERSONAL_VISUAL_SOURCE_FIELDS.includes(field)
    ),
  };
  const model = shortText(source.model, 100);
  const promptVersion = shortText(source.promptVersion, 80);
  const visualMood = shortText(source.visualMood, 40);
  const contentFingerprint = shortText(source.contentFingerprint, 80).toLowerCase();
  if (model) out.model = model;
  if (promptVersion) out.promptVersion = promptVersion;
  if (['serene', 'luminous', 'grounded', 'romantic', 'abundant', 'focused'].includes(visualMood)) {
    out.visualMood = visualMood;
  }
  if (/^[a-z0-9_-]{1,80}$/.test(contentFingerprint)) {
    out.contentFingerprint = contentFingerprint;
  }
  if (typeof source.createdAt === 'string' && !Number.isNaN(Date.parse(source.createdAt))) {
    out.createdAt = source.createdAt;
  }
  return out;
};

const JOURNEY_VISUAL_KEYS = new Set(
  JOURNEY_CATEGORIES.flatMap((category) => [
    `vision:${category}`,
    `vision:${category}:secondary`,
    `affirmation:${category}`,
  ])
);

const sanitizeJourneyVisuals = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = {};
  Object.entries(source).forEach(([key, receipt]) => {
    if (!JOURNEY_VISUAL_KEYS.has(key)) return;
    const safe = sanitizePersonalVisualReceipt(receipt);
    if (safe) output[key] = safe;
  });
  return output;
};

const sanitizeJourneyStoryEdits = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = {};
  ['pt', 'en'].forEach((lang) => {
    const entries = source[lang] && typeof source[lang] === 'object' && !Array.isArray(source[lang])
      ? source[lang]
      : {};
    const localized = {};
    Object.entries(entries).forEach(([key, story]) => {
      if (
        !key.startsWith('vision:') ||
        key.endsWith(':secondary') ||
        !JOURNEY_VISUAL_KEYS.has(key)
      ) return;
      const safeStory = shortText(story, 1200);
      if (safeStory) localized[key] = safeStory;
    });
    if (Object.keys(localized).length) output[lang] = localized;
  });
  return output;
};

const journeyItemForManifestation = (manifestation, journeyKey, lang) => {
  if (!manifestation || !JOURNEY_VISUAL_KEYS.has(journeyKey)) return null;
  const locale = lang === 'en' ? 'en' : 'pt';
  const suite = manifestation.journeySuiteByLang?.[locale];
  const collection = journeyKey.startsWith('vision:')
    ? suite?.visions
    : suite?.affirmations;
  const baseKey = journeyKey.endsWith(':secondary')
    ? journeyKey.slice(0, -':secondary'.length)
    : journeyKey;
  const item = (Array.isArray(collection) ? collection : []).find(
    (candidate) => candidate && candidate.key === baseKey
  ) || null;
  if (!item || !journeyKey.endsWith(':secondary')) return item;
  const alternativeDirection = locale === 'en'
    ? 'Alternative later view of the same aspiration, with a distinctly different camera angle and light.'
    : 'Visão posterior alternativa da mesma aspiração, com ângulo de câmera e luz claramente diferentes.';
  return {
    ...item,
    key: journeyKey,
    visualBrief: shortText(`${alternativeDirection} ${item.visualBrief}`, 420),
  };
};

const journeyCompositionVariant = (journeyKey) => {
  const category = String(journeyKey || '').split(':')[1];
  const index = Math.max(0, JOURNEY_CATEGORIES.indexOf(category));
  return journeyKey.startsWith('affirmation:') || journeyKey.endsWith(':secondary')
    ? index + 6
    : index;
};

const journeyVisualFingerprint = (manifestation, item, lang) =>
  compactFingerprint({
    manifestationId: shortText(manifestation && manifestation.id, 120),
    journeyKey: shortText(item && item.key, 80),
    visualBrief: shortText(item && item.visualBrief, 420),
    lang: lang === 'en' ? 'en' : 'pt',
  });

const dreamVisualStatusKey = (entryId) => `dream-visual:${shortText(entryId, 160)}`;

const dreamVisualCategory = (theme) => ({
  connection: 'Love',
  abundance: 'Wealth',
  clarity: 'Career',
  renewal: 'Health',
  courage: 'Confidence',
  peace: 'Peace',
}[theme] || 'Peace');

const dreamVisualFingerprint = (entry) =>
  compactFingerprint({
    id: shortText(entry && entry.id, 160),
    reflection: shortText(entry && entry.reflection, 800),
    affirmation: shortText(entry && entry.affirmation, 800),
    theme: shortText(entry && entry.theme, 40),
    lang: entry && entry.lang === 'en' ? 'en' : 'pt',
  });

const personalVisualMood = (mood, category) => {
  if (PERSONAL_VISUAL_MOOD_MAP[mood]) return PERSONAL_VISUAL_MOOD_MAP[mood];
  if (category === 'Love') return 'romantic';
  if (category === 'Wealth') return 'abundant';
  if (category === 'Career') return 'focused';
  if (category === 'Health') return 'grounded';
  if (category === 'Confidence') return 'luminous';
  return 'serene';
};

const personalVisualSourceFields = (profile) =>
  PERSONAL_VISUAL_SOURCE_FIELDS.filter(
    (field) => field === 'desire' || shortText(profile && profile[field], 600)
  );

function utf8ByteLength(value) {
  const text = String(value || '');
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }
  return bytes;
}

function compactFingerprint(value) {
  const serialized = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function personalVisualSubjectFingerprint(item) {
  return compactFingerprint({
    title: shortText(item && item.title, 240),
    category: shortText(item && item.category, 40),
    lang: item && item.lang === 'en' ? 'en' : 'pt',
  });
}

function personalVisualRetryDelay(attempt) {
  const exponent = Math.max(0, Math.min(8, Number(attempt || 1) - 1));
  return Math.min(PERSONAL_VISUAL_RETRY_MAX_MS, PERSONAL_VISUAL_RETRY_BASE_MS * 2 ** exponent);
}

function personalVisualErrorCode(error) {
  const raw = shortText(error && (error.code || error.message), 80).toLowerCase();
  return /^[a-z0-9_-]+$/.test(raw) ? raw : 'visual_unavailable';
}

function personalVisualErrorStage(error) {
  const raw = shortText(error && error.stage, 40).toLowerCase();
  return /^[a-z0-9_-]+$/.test(raw) ? raw : 'unknown';
}

function translationRequestKey({ id, sourceLang, targetLang, sourceVariant, profile, generationEpoch }) {
  return [
    generationEpoch,
    id,
    sourceLang,
    targetLang,
    compactFingerprint({ sourceVariant: snapshotManifestationContent(sourceVariant), profile }),
  ].join(':');
}

function decodeBackupPayload(str) {
  if (typeof str !== 'string' || !str.length || utf8ByteLength(str) > CELESTE_BACKUP_MAX_BYTES) {
    return { error: 'invalid_size' };
  }
  let parsed;
  try {
    parsed = JSON.parse(str);
  } catch (_error) {
    return { error: 'invalid_json' };
  }
  const isObject = parsed && typeof parsed === 'object' && !Array.isArray(parsed);
  if (isObject && parsed.format === CELESTE_BACKUP_FORMAT) {
    const data = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
      ? parsed.data
      : null;
    const communityStories = data
      ? validateLocalCommunityStoriesBackup(data.communityStories)
      : null;
    if (
      parsed.version !== CELESTE_BACKUP_VERSION ||
      parsed.restorePolicy !== CELESTE_BACKUP_RESTORE_POLICY ||
      typeof parsed.exportedAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.exportedAt)) ||
      !data ||
      !data.state ||
      !Array.isArray(data.state.manifestations) ||
      !communityStories
    ) {
      return { error: 'invalid_shape' };
    }
    return {
      state: data.state,
      communityStories,
      replaceCommunityStories: true,
    };
  }
  if (!isObject || Object.prototype.hasOwnProperty.call(parsed, 'format') || !Array.isArray(parsed.manifestations)) {
    return { error: 'invalid_shape' };
  }
  return { state: parsed, communityStories: null, replaceCommunityStories: false };
}
const isKnownMinor = (profile) => {
  const age = shortText(profile && profile.age, 40)
    .toLocaleLowerCase('en-US')
    .replace(/[\s\u2013\u2014\u2212-]+/g, '');
  return age === 'under18' || age === 'menosde18';
};

// Merge defensivo sobre o estado default — usado no load e no import.
// Campo novo entra sempre com default AQUI (estado salvo antigo continua válido).
function mergeDefensivo(parsed) {
  const base = initialState();
  const st = parsed && Array.isArray(parsed.manifestations) ? { ...base, ...parsed } : base;
  // Defensive: any array field missing/corrupted in the stored blob falls back to the default.
  ['manifestations', 'favoriteAffirmations', 'affirmationDates', 'savedVisions', 'visionPlays'].forEach(
    (key) => {
      if (!Array.isArray(st[key])) st[key] = base[key];
    }
  );
  st.favoriteAffirmations = uniqueShortStrings(st.favoriteAffirmations, 160, 500);
  st.savedVisions = uniqueShortStrings(st.savedVisions, 160, 200);
  st.affirmationDates = Array.from(new Set(st.affirmationDates.filter(validDay))).slice(0, 3650);
  st.visionPlays = st.visionPlays
    .filter((play) => play && typeof play === 'object' && !Array.isArray(play))
    .map((play) => ({
      visionId: shortText(play.visionId, 160),
      date: validDay(play.date) ? play.date : null,
    }))
    .filter((play) => play.visionId && play.date)
    .slice(0, 200);
  // Estados antigos podem trazer strings. Somente true real (ou seu legado
  // serializado) libera o app; `"false"` e `"0"` nunca podem ser truthy aqui.
  st.onboardingDone = st.onboardingDone === true || st.onboardingDone === 'true';
  if (st.lang !== 'pt' && st.lang !== 'en') st.lang = detectLang();
  st.name = shortText(st.name, 80);
  st.mood = VISUAL_MOODS.includes(st.mood) ? st.mood : null;
  const savedNarration =
    st.narration && typeof st.narration === 'object' && !Array.isArray(st.narration)
      ? st.narration
      : {};
  st.narration = {
    narratorId: isNarratorId(savedNarration.narratorId)
      ? savedNarration.narratorId
      : base.narration.narratorId,
  };
  const savedProfile = st.profile && typeof st.profile === 'object' && !Array.isArray(st.profile)
    ? st.profile
    : {};
  st.profile = normalizeCloudConsentProfile(savedProfile, {
    knownMinor: isKnownMinor(savedProfile),
  });
  const savedDailyRitual =
    st.dailyRitual && typeof st.dailyRitual === 'object' && !Array.isArray(st.dailyRitual)
      ? st.dailyRitual
      : {};
  st.dailyRitual = {
    reminderEnabled: savedDailyRitual.reminderEnabled === true,
    reminderTime: validTime(savedDailyRitual.reminderTime)
      ? savedDailyRitual.reminderTime
      : base.dailyRitual.reminderTime,
    notificationId: shortText(savedDailyRitual.notificationId, 240) || null,
    permission: ['unknown', 'granted', 'denied', 'unsupported'].includes(savedDailyRitual.permission)
      ? savedDailyRitual.permission
      : 'unknown',
  };
  // Item importado/antigo sem sessions derrubaria derived e setPractice —
  // normalizar aqui protege load e import de uma vez.
  st.manifestations = st.manifestations
    .filter((raw) => raw && typeof raw === 'object' && !Array.isArray(raw))
    .map((raw, manifestationIndex) => {
    const m = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const itemLang = m.lang === 'pt' || m.lang === 'en' ? m.lang : st.lang;
    const categories = ['Love', 'Wealth', 'Career', 'Health', 'Confidence', 'Peace'];
    const category = categories.includes(m.category) ? m.category : null;
    const titleFallback = itemLang === 'pt' ? 'Minha manifestação' : 'My manifestation';
    const textOr = (value, fallback, max) =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
    const title = textOr(m.title, titleFallback, 160);
    const generated = dreamToAffirmation(title, st.profile || {}, itemLang, category);
    // Older releases could create a manifestation from an editorial card.
    // Rebuild those entries from the person's own title and profile so the
    // removed catalog cannot return after an update.
    const cameFromCatalog = !!shortText(m.templateId, 120);
    const { templateId: _legacyTemplateId, ...manifestationFields } = m;
    const anchorAnswers = sanitizeAnchorAnswers(m.anchorAnswers);
    const journeyProfile = Object.keys(anchorAnswers).length
      ? { ...(st.profile || {}), ...anchorAnswers }
      : st.profile || {};
    const journeyOriginLang = m.journeySuiteByLang?.originLang === 'en' ||
      m.journeySuiteByLang?.originLang === 'pt'
      ? m.journeySuiteByLang.originLang
      : m.originLang === 'en' || m.originLang === 'pt'
      ? m.originLang
      : itemLang;
    const originTitle = shortText(m.contentByLang?.[journeyOriginLang]?.title, 160) || title;
    const journeySuiteByLang = buildPersonalJourneySuites({
      desire: originTitle,
      profile: journeyProfile,
      stored: m.journeySuiteByLang,
      originLang: journeyOriginLang,
    });
    const evidence = (Array.isArray(m.evidence) ? m.evidence : [])
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.text === 'string' && entry.text.trim())
      .map((entry, index) => ({
        ...entry,
        id: typeof entry.id === 'string' && entry.id ? entry.id : `e-${m.id || 'legacy'}-${index}`,
        text: entry.text.trim().slice(0, 280),
      }));
    const normalized = {
      ...manifestationFields,
      id: textOr(m.id, `m-legacy-${manifestationIndex}`, 120),
      origin: m.origin === 'onboarding-anchor' ? 'onboarding-anchor' : 'manifestation',
      anchorAnswers,
      journeySuiteByLang,
      journeyVisuals: sanitizeJourneyVisuals(m.journeyVisuals),
      journeyStoryEditsByLang: sanitizeJourneyStoryEdits(m.journeyStoryEditsByLang),
      title,
      category,
      lang: itemLang,
      intention: textOr(cameFromCatalog ? null : m.intention, generated.intention, 600),
      affirmation: textOr(cameFromCatalog ? null : m.affirmation, generated.affirmation, 1200),
      story: textOr(cameFromCatalog ? null : m.story, generated.story, 12000),
      sessions: Array.from(
        new Set(
          (Array.isArray(m.sessions) ? m.sessions : []).filter(
            (day) =>
              typeof day === 'string' &&
              /^\d{4}-\d{2}-\d{2}$/.test(day) &&
              !Number.isNaN(Date.parse(`${day}T00:00:00Z`))
          )
        )
      ),
      evidence,
      personalizedWith: (Array.isArray(cameFromCatalog ? generated.usouDoPerfil : m.personalizedWith)
        ? (cameFromCatalog ? generated.usouDoPerfil : m.personalizedWith)
        : [])
        .filter((label) => typeof label === 'string' && label.trim())
        .map((label) => label.trim().slice(0, 80))
        .slice(0, 12),
      anchorOpenedAt:
        typeof m.anchorOpenedAt === 'string' && !Number.isNaN(Date.parse(m.anchorOpenedAt))
          ? m.anchorOpenedAt
          : undefined,
      anchorIdentity: textOr(cameFromCatalog ? null : m.anchorIdentity, generated.anchorIdentity, 600),
      anchorStep: textOr(cameFromCatalog ? null : m.anchorStep, generated.anchorStep, 280),
      livingMirror: normalizeLivingMirror(m.livingMirror),
      visual: sanitizePersonalVisualReceipt(m.visual),
      generation: cameFromCatalog
        ? { source: 'local', promptVersion: 'personal-catalog-migration-v1' }
        : m.generation,
      goalDays:
        Number.isInteger(m.goalDays) && m.goalDays > 0 && m.goalDays <= 365 ? m.goalDays : 21,
    };
      return localizeManifestation(
        repairLegacyLocalManifestation(normalized, st.profile),
        st.profile,
        st.lang
      );
    });
  const declaredAnchorId = shortText(st.anchorSceneId, 120);
  const declaredAnchor = st.manifestations.find((item) => item.id === declaredAnchorId);
  const discoveredAnchor =
    declaredAnchor ||
    st.manifestations.find((item) => item.origin === 'onboarding-anchor') ||
    st.manifestations.find((item) => item.anchorOpenedAt) ||
    st.manifestations[st.manifestations.length - 1] ||
    null;
  st.anchorSceneId = discoveredAnchor ? discoveredAnchor.id : null;
  if (discoveredAnchor) {
    st.manifestations = st.manifestations.map((item) =>
      item.id === discoveredAnchor.id
        ? {
            ...item,
            origin: 'onboarding-anchor',
            anchorAnswers: Object.keys(item.anchorAnswers || {}).length
              ? item.anchorAnswers
              : sanitizeAnchorAnswers(st.profile),
          }
        : item
    );
  }
  const savedRitual = st.morningRitual && typeof st.morningRitual === 'object' ? st.morningRitual : {};
  const defaultRitual = base.morningRitual;
  st.morningRitual = {
    alarmStatus: 'native_integration_required',
    reminderEnabled: savedRitual.reminderEnabled === true,
    alarmSyncError: savedRitual.alarmSyncError === true,
    reminderTime: validTime(savedRitual.reminderTime)
      ? savedRitual.reminderTime
      : defaultRitual.reminderTime,
    weekdays: alarmWeekdaysOrDefault(savedRitual.weekdays),
    wakeAffirmationId: shortText(savedRitual.wakeAffirmationId, 160) || null,
    wakeAffirmationText: shortText(savedRitual.wakeAffirmationText, 800),
    wakeAffirmationLang: savedRitual.wakeAffirmationLang === 'en' ? 'en' : 'pt',
    wakeNarratorId: isNarratorId(savedRitual.wakeNarratorId) ? savedRitual.wakeNarratorId : null,
    wakeSoundSource:
      savedRitual.wakeSoundSource === 'neural_wav' || savedRitual.wakeSoundSource === 'local_speech'
        ? savedRitual.wakeSoundSource
        : null,
    entries: (Array.isArray(savedRitual.entries) ? savedRitual.entries : [])
      .filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          shortText(entry.id, 160) &&
          shortText(entry.dream, 1600) &&
          shortText(entry.affirmation, 800)
      )
      .map((entry) => ({
        id: shortText(entry.id, 160),
        dream: shortText(entry.dream, 1600),
        feeling: RITUAL_FEELINGS.includes(entry.feeling) ? entry.feeling : '',
        theme: RITUAL_THEMES.includes(entry.theme) ? entry.theme : 'clarity',
        affirmation: shortText(entry.affirmation, 800),
        reflection: shortText(entry.reflection, 800),
        dreamAnchor: shortText(entry.dreamAnchor, 120),
        usedDetails: (Array.isArray(entry.usedDetails) ? entry.usedDetails : [])
          .filter((key) => RITUAL_DETAIL_KEYS.includes(key))
          .filter((key, index, values) => values.indexOf(key) === index),
        generatorVersion: shortText(entry.generatorVersion, 40) || 'dream-local-v1',
        visual: sanitizePersonalVisualReceipt(entry.visual),
        generation: sanitizeGenerationReceipt(
          entry.generation,
          'local-dream',
          'dream-local-v2'
        ),
        lang: entry.lang === 'en' ? 'en' : 'pt',
        createdAt:
          typeof entry.createdAt === 'string' && !Number.isNaN(Date.parse(entry.createdAt))
            ? entry.createdAt
            : new Date(0).toISOString(),
        practiceCount:
          Number.isInteger(entry.practiceCount) && entry.practiceCount > 0
            ? Math.min(entry.practiceCount, 10000)
            : 0,
        lastPracticedAt:
          typeof entry.lastPracticedAt === 'string' && !Number.isNaN(Date.parse(entry.lastPracticedAt))
            ? entry.lastPracticedAt
            : null,
        useInLivingMirror: entry.useInLivingMirror === true,
      }))
      .slice(0, 90),
  };

  // Fixed catalog IDs from older builds are no longer valid. Every collection
  // below may point only to content created from this person's own answers.
  const personalAffirmationItems = personalJourneyItemsForState(st, 'affirmation', st.lang);
  const personalVisionItems = personalJourneyItemsForState(st, 'vision', st.lang);
  const personalAffirmationIds = new Set(personalAffirmationItems.map((item) => item.id));
  const personalVisionIds = new Set(personalVisionItems.map((item) => item.id));
  const ritualIds = new Set(
    (st.morningRitual.entries || []).map((entry) => `ritual:${entry.id}`)
  );
  st.favoriteAffirmations = st.favoriteAffirmations.filter(
    (id) => personalAffirmationIds.has(id) || ritualIds.has(id)
  );
  st.savedVisions = st.savedVisions.filter((id) => personalVisionIds.has(id));
  st.visionPlays = st.visionPlays.filter((play) => personalVisionIds.has(play.visionId));
  st.practicePlan = normalizePracticePlan(st.practicePlan, practiceOptionsForState(st));

  const wakeId = st.morningRitual.wakeAffirmationId;
  const validWakeId =
    !wakeId ||
    wakeId === 'custom' ||
    personalAffirmationIds.has(wakeId) ||
    ritualIds.has(wakeId);
  if (!validWakeId) {
    const fallbackAffirmation = personalAffirmationItems.find(
      (item) => typeof item.text === 'string' && item.text.trim()
    );
    const fallbackDream = (st.morningRitual.entries || []).find(
      (entry) => typeof entry.affirmation === 'string' && entry.affirmation.trim()
    );
    const fallbackWake = fallbackAffirmation
      ? {
          id: fallbackAffirmation.id,
          text: fallbackAffirmation.text.trim(),
          lang: fallbackAffirmation.lang === 'en' ? 'en' : 'pt',
        }
      : fallbackDream
        ? {
            id: `ritual:${fallbackDream.id}`,
            text: fallbackDream.affirmation.trim(),
            lang: fallbackDream.lang === 'en' ? 'en' : 'pt',
          }
        : null;
    st.morningRitual.wakeAffirmationId = fallbackWake ? fallbackWake.id : null;
    st.morningRitual.wakeAffirmationText = fallbackWake ? fallbackWake.text : '';
    st.morningRitual.wakeAffirmationLang = fallbackWake ? fallbackWake.lang : st.lang;
    st.morningRitual.wakeNarratorId = null;
    st.morningRitual.wakeSoundSource = null;
    if (fallbackWake) {
      // The native AlarmKit may still contain the removed catalog narration.
      // Keep the alarm visible, but force NativeAlarmContentSync to replace it
      // before treating the personal text as confirmed.
      st.morningRitual.alarmSyncError = st.morningRitual.reminderEnabled;
    } else {
      st.morningRitual.reminderEnabled = false;
      st.morningRitual.alarmSyncError = false;
    }
  }
  return st;
}

export function AppProvider({ children }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [storageLoadError, setStorageLoadError] = useState(false);
  const [storageCorrupt, setStorageCorrupt] = useState(false);
  const [storageMutation, setStorageMutation] = useState(null);
  const [personalVisualStatus, setPersonalVisualStatus] = useState({});
  const stateRef = useRef(null);
  const pendingOnboardingRef = useRef(false);
  const mountedRef = useRef(true);
  const hydratedRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const readAttemptRef = useRef(0);
  const storageRepairRef = useRef(false);
  const generationEpochRef = useRef(0);
  const translationLanguageEpochRef = useRef(0);
  const translationRequestsRef = useRef(new Map());
  const desiredLanguageRef = useRef(null);
  const lastDreamSaveRef = useRef({ epoch: -1, signature: '', id: null, at: 0 });
  const evolutionRequestsRef = useRef(new Set());
  const localSceneUpgradeEpochRef = useRef(-1);
  const journeySuiteUpgradeEpochRef = useRef(-1);
  const personalVisualRequestsRef = useRef(new Map());
  const personalVisualFailuresRef = useRef(new Map());
  const resetInProgressRef = useRef(false);
  const storageMutationRef = useRef(null);
  const pendingResetRevisionRef = useRef(0);
  const pendingResetFinalizeRef = useRef(null);
  const pendingImportRevisionRef = useRef(0);
  const pendingImportFinalizeRef = useRef(null);
  const pendingStoragePreparationRef = useRef(null);
  const practicePlanCleanupRef = useRef(false);
  const writerRef = useRef(null);
  stateRef.current = state;

  const setPersonalVisualPhase = useCallback((id, nextStatus) => {
    setPersonalVisualStatus((current) => {
      if (!nextStatus) {
        if (!Object.prototype.hasOwnProperty.call(current, id)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      const previous = current[id];
      if (
        previous &&
        previous.phase === nextStatus.phase &&
        previous.error === nextStatus.error &&
        previous.stage === nextStatus.stage &&
        previous.retryAt === nextStatus.retryAt &&
        previous.fingerprint === nextStatus.fingerprint
      ) {
        return current;
      }
      return { ...current, [id]: nextStatus };
    });
  }, []);

  const applyRemoteSceneUpgrade = useCallback(({
    id,
    lang,
    sourceFingerprint,
    profileFingerprint,
    candidateTitle,
    remote,
    generationEpoch,
  }) => {
    if (!mountedRef.current || generationEpoch !== generationEpochRef.current) return;
    setState((currentState) => {
      if (!currentState || generationEpoch !== generationEpochRef.current) return currentState;
      if (JSON.stringify(currentState.profile || {}) !== profileFingerprint) return currentState;

      const index = currentState.manifestations.findIndex((item) => item.id === id);
      if (index < 0) return currentState;
      const current = currentState.manifestations[index];
      const currentCandidate = localInterpretedUpgradeCandidate(current);
      if (!currentCandidate || currentCandidate.id !== id || currentCandidate.lang !== lang) {
        return currentState;
      }
      const currentVariant = current.lang === lang
        ? snapshotManifestationContent(current)
        : current.contentByLang?.[lang];
      const currentFingerprint = JSON.stringify(
        snapshotManifestationContent(currentVariant || {})
      );
      if (currentFingerprint !== sourceFingerprint) return currentState;

      const upgradedVariant = manifestationVariantFromScene({
        title: shortText(currentVariant && currentVariant.title, 160) || candidateTitle,
        scene: remote.scene,
        generation: remote.generation,
      });
      const contentByLang = {
        ...(current.contentByLang || {}),
        [lang]: upgradedVariant,
      };
      const fallbackSuite = current.journeySuiteByLang?.[lang] ||
        buildPersonalJourneySuites({
          desire: current.title,
          profile: current.anchorAnswers || currentState.profile,
          originLang: current.originLang || current.lang,
        })[lang];
      const journeySuiteByLang = remote.journeySuite
        ? {
            ...(current.journeySuiteByLang || {}),
            [lang]: normalizePersonalJourneySuite(
              { ...remote.journeySuite, source: 'remote' },
              fallbackSuite
            ),
          }
        : current.journeySuiteByLang;
      const upgraded = current.lang === lang
        ? { ...current, ...upgradedVariant, contentByLang, journeySuiteByLang }
        : { ...current, contentByLang, journeySuiteByLang };
      const manifestations = [...currentState.manifestations];
      manifestations[index] = localizeManifestation(
        upgraded,
        currentState.profile,
        currentState.lang
      );
      return { ...currentState, manifestations };
    });
  }, []);

  const applyRemoteJourneySuite = useCallback(({
    id,
    lang,
    profileFingerprint,
    remote,
    generationEpoch,
  }) => {
    if (
      !remote?.journeySuite ||
      !mountedRef.current ||
      generationEpoch !== generationEpochRef.current
    ) return;
    setState((currentState) => {
      if (
        !currentState ||
        generationEpoch !== generationEpochRef.current ||
        JSON.stringify(currentState.profile || {}) !== profileFingerprint
      ) return currentState;
      const index = currentState.manifestations.findIndex((item) => item.id === id);
      if (index < 0) return currentState;
      const current = currentState.manifestations[index];
      const fallbackSuite = current.journeySuiteByLang?.[lang];
      if (!fallbackSuite) return currentState;
      const manifestations = [...currentState.manifestations];
      manifestations[index] = {
        ...current,
        journeySuiteByLang: {
          ...(current.journeySuiteByLang || {}),
          [lang]: normalizePersonalJourneySuite(
            { ...remote.journeySuite, source: 'remote' },
            fallbackSuite
          ),
        },
      };
      return { ...currentState, manifestations };
    });
  }, []);

  if (!writerRef.current) {
    writerRef.current = createSerialStorageWriter({
      write: (value) => AsyncStorage.setItem(STORAGE_KEY, value),
      timeoutMs: STORAGE_WRITE_TIMEOUT_MS,
      onStatus: ({ type, revision }) => {
        if (!mountedRef.current) return;
        if (type === 'ok') {
          if (
            pendingResetRevisionRef.current &&
            revision === pendingResetRevisionRef.current &&
            pendingResetFinalizeRef.current
          ) {
            void pendingResetFinalizeRef.current();
          } else if (
            pendingImportRevisionRef.current &&
            revision === pendingImportRevisionRef.current &&
            pendingImportFinalizeRef.current
          ) {
            void pendingImportFinalizeRef.current();
          } else if (!pendingResetRevisionRef.current && !pendingImportRevisionRef.current) {
            setStorageError(false);
          }
        }
        if (type === 'timeout' || type === 'failed') setStorageError(true);
      },
    });
  }

  const loadStoredState = useCallback(() => {
    const attempt = readAttemptRef.current + 1;
    readAttemptRef.current = attempt;
    hydratedRef.current = false;
    setLoading(true);
    setStorageLoadError(false);
    setStorageCorrupt(false);

    let finished = false;
    const timer = setTimeout(() => {
      if (!mountedRef.current || readAttemptRef.current !== attempt || finished) return;
      // Do not create or persist a blank state here. The original read remains
      // observed and may still recover without overwriting saved user data.
      setLoading(false);
      setStorageLoadError(true);
    }, STORAGE_READ_TIMEOUT_MS);

    Promise.resolve()
      .then(() => AsyncStorage.getItem(STORAGE_KEY))
      .then((raw) => {
        if (!mountedRef.current || readAttemptRef.current !== attempt) return;
        finished = true;
        clearTimeout(timer);
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch (_error) {
          const invalid = new Error('invalid_stored_state');
          invalid.code = 'invalid_stored_state';
          throw invalid;
        }
        if (
          parsed !== null &&
          (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.manifestations))
        ) {
          const invalid = new Error('invalid_stored_state');
          invalid.code = 'invalid_stored_state';
          throw invalid;
        }
        const merged = mergeDefensivo(parsed);
        const needsRepair = !!raw && JSON.stringify(parsed) !== JSON.stringify(merged);
        hydratedRef.current = true;
        desiredLanguageRef.current = merged.lang;
        // A valid old/corrupted shape is upgraded once. A genuinely empty
        // storage remains untouched until the person changes something.
        skipNextPersistRef.current = !needsRepair;
        setState(merged);
        setStorageError(false);
        setStorageLoadError(false);
        setStorageCorrupt(false);
        setLoading(false);
      })
      .catch((error) => {
        if (!mountedRef.current || readAttemptRef.current !== attempt) return;
        finished = true;
        clearTimeout(timer);
        hydratedRef.current = false;
        setLoading(false);
        setStorageLoadError(true);
        setStorageCorrupt(error && error.code === 'invalid_stored_state');
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadStoredState();
    return () => {
      mountedRef.current = false;
      readAttemptRef.current += 1;
      if (writerRef.current) writerRef.current.dispose();
    };
  }, [loadStoredState]);

  useEffect(() => {
    if (!state) return;
    const ids = new Set(state.manifestations.map((item) => item.id));
    state.manifestations.forEach((item) => {
      JOURNEY_VISUAL_KEYS.forEach((journeyKey) => {
        ids.add(journeyVisualStatusKey(item.id, journeyKey));
      });
    });
    (state.morningRitual?.entries || []).forEach((entry) => {
      ids.add(dreamVisualStatusKey(entry.id));
    });
    setPersonalVisualStatus((current) => {
      const entries = Object.entries(current).filter(([id]) => ids.has(id));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
    for (const id of personalVisualFailuresRef.current.keys()) {
      if (!ids.has(id)) personalVisualFailuresRef.current.delete(id);
    }
  }, [state && state.manifestations]);

  useEffect(() => {
    if (
      !state ||
      !hydratedRef.current ||
      isKnownMinor(state.profile) ||
      state.profile?.cloudPersonalization !== true ||
      !hasCurrentAdultCloudConsent(state.profile)
    ) return;

    const generationEpoch = generationEpochRef.current;
    if (localSceneUpgradeEpochRef.current === generationEpoch) return;

    let target = null;
    let candidate = null;
    for (const item of state.manifestations) {
      const nextCandidate = localInterpretedUpgradeCandidate(item);
      if (!nextCandidate || !nextCandidate.id) continue;
      target = item;
      candidate = nextCandidate;
      break;
    }
    if (!target || !candidate) return;

    localSceneUpgradeEpochRef.current = generationEpoch;
    const sourceVariant = target.lang === candidate.lang
      ? snapshotManifestationContent(target)
      : target.contentByLang?.[candidate.lang];
    const sourceFingerprint = JSON.stringify(
      snapshotManifestationContent(sourceVariant || {})
    );
    const profileFingerprint = JSON.stringify(state.profile || {});
    const candidateTitle = shortText(sourceVariant && sourceVariant.title, 160) || target.title;

    void generatePersonalizedScene({
      desire: candidateTitle,
      category: target.category || 'Wealth',
      lang: candidate.lang,
      profile: state.profile,
      includeJourneySuite:
        target.id === state.anchorSceneId || target.origin === 'onboarding-anchor',
    }).then((remote) => {
      applyRemoteSceneUpgrade({
        id: candidate.id,
        lang: candidate.lang,
        sourceFingerprint,
        profileFingerprint,
        candidateTitle,
        remote,
        generationEpoch,
      });
    }).catch(() => {
      // The interpreted local v2 copy remains readable; a later app launch can retry.
    });
  }, [applyRemoteSceneUpgrade, state]);

  useEffect(() => {
    if (
      !state ||
      !hydratedRef.current ||
      isKnownMinor(state.profile) ||
      state.profile?.cloudPersonalization !== true ||
      !hasCurrentAdultCloudConsent(state.profile)
    ) return;
    const generationEpoch = generationEpochRef.current;
    if (
      localSceneUpgradeEpochRef.current === generationEpoch ||
      journeySuiteUpgradeEpochRef.current === generationEpoch
    ) return;
    const anchor =
      state.manifestations.find((item) => item.id === state.anchorSceneId) ||
      state.manifestations.find((item) => item.origin === 'onboarding-anchor');
    if (!anchor || anchor.journeySuiteByLang?.[state.lang]?.source === 'remote') return;

    journeySuiteUpgradeEpochRef.current = generationEpoch;
    const profileFingerprint = JSON.stringify(state.profile || {});
    void generatePersonalizedScene({
      desire: anchor.title,
      category: anchor.category || 'Wealth',
      lang: state.lang,
      profile: state.profile,
      includeJourneySuite: true,
    }).then((remote) => {
      applyRemoteJourneySuite({
        id: anchor.id,
        lang: state.lang,
        profileFingerprint,
        remote,
        generationEpoch,
      });
    }).catch(() => {
      // The complete local 6+6 suite remains available; retry happens next launch.
    });
  }, [applyRemoteJourneySuite, state]);

  const retryLoad = useCallback(() => {
    loadStoredState();
  }, [loadStoredState]);

  const repairCorruptedStorage = useCallback(async () => {
    if (!storageCorrupt || storageRepairRef.current) return false;
    storageRepairRef.current = true;
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('storage_repair_timeout')),
        STORAGE_WRITE_TIMEOUT_MS
      );
    });
    try {
      await Promise.race([
        Promise.all([AsyncStorage.removeItem(STORAGE_KEY), clearPersonalVisuals()]),
        timeout,
      ]);
      if (!mountedRef.current) return false;
      generationEpochRef.current += 1;
      personalVisualFailuresRef.current.clear();
      setPersonalVisualStatus({});
      setStorageCorrupt(false);
      setStorageLoadError(false);
      loadStoredState();
      return true;
    } catch (_error) {
      if (mountedRef.current) setStorageLoadError(true);
      return false;
    } finally {
      clearTimeout(timeoutId);
      storageRepairRef.current = false;
    }
  }, [loadStoredState, storageCorrupt]);

  useEffect(() => {
    if (
      !state ||
      !hydratedRef.current ||
      storageMutationRef.current ||
      pendingResetRevisionRef.current ||
      pendingImportRevisionRef.current
    ) return;

    const normalized = normalizePracticePlan(
      state.practicePlan || initialState().practicePlan,
      practiceOptionsForState(state)
    );
    if (JSON.stringify(normalized) !== JSON.stringify(state.practicePlan)) {
      setState((current) => current
        ? {
            ...current,
            practicePlan: normalizePracticePlan(
              current.practicePlan || initialState().practicePlan,
              practiceOptionsForState(current)
            ),
          }
        : current);
      return;
    }

    // A selected manifestation/dream may be deleted while recurring reminders
    // still exist. Normalization marks that plan inactive+syncError instead of
    // silently retargeting another personal text; this effect removes the
    // entire notification family, including unpersisted 10-minute snoozes.
    if (normalized.enabled || !normalized.syncError || practicePlanCleanupRef.current) return;
    practicePlanCleanupRef.current = true;
    void cancelPracticePlanReminders().then((result) => {
      if (!result?.ok || !mountedRef.current) return;
      setState((current) => {
        if (!current) return current;
        const latest = normalizePracticePlan(
          current.practicePlan || initialState().practicePlan,
          practiceOptionsForState(current)
        );
        if (latest.enabled || !latest.syncError) return current;
        return {
          ...current,
          practicePlan: normalizePracticePlan(
            {
              ...latest,
              enabled: false,
              syncError: false,
              notificationIdsBySlot: {},
            },
            practiceOptionsForState(current)
          ),
        };
      });
    }).finally(() => {
      practicePlanCleanupRef.current = false;
    });
  }, [state]);

  useEffect(() => {
    if (!state || !hydratedRef.current || !writerRef.current) return;
    if (
      storageMutationRef.current ||
      pendingResetRevisionRef.current ||
      pendingImportRevisionRef.current
    ) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const snapshot = pendingOnboardingRef.current
      ? { ...state, onboardingDone: true }
      : state;
    writerRef.current.enqueue(JSON.stringify(snapshot));
  }, [state]);

  const retryPersist = useCallback(async () => {
    if (!state || !hydratedRef.current || !writerRef.current) return false;
    if (pendingStoragePreparationRef.current) {
      const preparation = pendingStoragePreparationRef.current;
      const outcome = await settleWithin(preparation.promise, STORAGE_WRITE_TIMEOUT_MS);
      if (!outcome.settled || outcome.error || outcome.value !== true) {
        if (mountedRef.current) setStorageError(true);
        return false;
      }
    }
    if (pendingResetRevisionRef.current) {
      const pendingRevision = pendingResetRevisionRef.current;
      writerRef.current.resume();
      const saved = await writerRef.current.waitFor(pendingRevision, STORAGE_WRITE_TIMEOUT_MS);
      if (saved && pendingResetFinalizeRef.current) {
        const finalized = await settleWithin(
          pendingResetFinalizeRef.current(),
          STORAGE_WRITE_TIMEOUT_MS
        );
        if (finalized.settled && !finalized.error) return finalized.value === true;
      }
      if (mountedRef.current) setStorageError(true);
      return false;
    }
    if (pendingImportRevisionRef.current) {
      const pendingRevision = pendingImportRevisionRef.current;
      writerRef.current.resume();
      const saved = await writerRef.current.waitFor(pendingRevision, STORAGE_WRITE_TIMEOUT_MS);
      if (saved && pendingImportFinalizeRef.current) {
        const finalized = await settleWithin(
          pendingImportFinalizeRef.current(),
          STORAGE_WRITE_TIMEOUT_MS
        );
        if (finalized.settled && !finalized.error) return finalized.value === true;
      }
      if (mountedRef.current) setStorageError(true);
      return false;
    }
    const completesOnboarding = pendingOnboardingRef.current;
    const next = completesOnboarding ? { ...state, onboardingDone: true } : state;
    const revision = writerRef.current.enqueue(JSON.stringify(next));
    writerRef.current.resume();
    const saved = await writerRef.current.waitFor(revision, STORAGE_WRITE_TIMEOUT_MS);
    if (saved) {
      if (completesOnboarding) {
        pendingOnboardingRef.current = false;
        setState((current) => ({ ...current, onboardingDone: true }));
      }
      setStorageError(false);
      return true;
    }
    if (mountedRef.current) setStorageError(true);
    return false;
  }, [state]);

  /*
   * State persistence is intentionally serialized above. A timeout releases
   * the interface but does not start a competing write: AsyncStorage promises
   * cannot be cancelled, and a late older write must never overwrite a newer
   * one.
   */

  // O desejo digitado vira afirmação + cena montadas com as respostas do
  // onboarding (utils/dreamToAffirmation). Antes disso, todo desejo virava a
  // MESMA frase de template em inglês e o state.profile nunca era lido — o app
  // prometia conteúdo "criado a partir das suas respostas" e não cumpria.
  const translateAndStoreVariant = useCallback(async ({
    id,
    sourceLang,
    targetLang,
    sourceVariant,
    expectedTargetVariant,
    profile,
    generationEpoch,
  }) => {
    const requestKey = translationRequestKey({
      id,
      sourceLang,
      targetLang,
      sourceVariant,
      profile,
      generationEpoch,
    });
    let request = translationRequestsRef.current.get(requestKey);
    if (!request) {
      request = translateManifestationScene({
        sourceLang,
        targetLang,
        scene: sourceVariant,
        profile,
      });
      translationRequestsRef.current.set(requestKey, request);
      void request.then(
        () => {
          setTimeout(() => {
            if (translationRequestsRef.current.get(requestKey) === request) {
              translationRequestsRef.current.delete(requestKey);
            }
          }, 0);
        },
        () => {
          if (translationRequestsRef.current.get(requestKey) === request) {
            translationRequestsRef.current.delete(requestKey);
          }
        }
      );
    }
    let remote;
    try {
      remote = await request;
    } catch (_error) {
      // The language-native local fallback remains usable. Personal text and
      // network errors are deliberately never logged.
      return;
    }
    if (!mountedRef.current || generationEpoch !== generationEpochRef.current) return;

    const translated = manifestationVariantFromScene({
      title: remote.scene.title,
      scene: remote.scene,
      generation: remote.generation,
    });
    setState((currentState) => {
      if (
        !currentState ||
        generationEpoch !== generationEpochRef.current
      ) return currentState;
      const index = currentState.manifestations.findIndex((item) => item.id === id);
      if (index < 0) return currentState;
      const current = currentState.manifestations[index];
      const nextItem = applyTranslatedManifestationVariant(current, {
        sourceLang,
        targetLang,
        sourceVariant,
        expectedTargetVariant,
        translatedVariant: translated,
      });
      if (nextItem === current) return currentState;
      const manifestations = [...currentState.manifestations];
      manifestations[index] = nextItem;
      return { ...currentState, manifestations };
    });
  }, []);

  const ensurePersonalVisual = useCallback((manifestationId, options = {}) => {
    const id = shortText(manifestationId, 120);
    if (!id) return Promise.resolve({ ok: false, error: 'manifestation_not_found' });

    const snapshot = stateRef.current || initialState();
    const suppliedManifestation =
      options.manifestation && typeof options.manifestation === 'object'
        ? options.manifestation
        : null;
    const manifestation =
      snapshot.manifestations.find((item) => item.id === id) || suppliedManifestation;
    if (!manifestation) {
      setPersonalVisualPhase(id, null);
      return Promise.resolve({ ok: false, error: 'manifestation_not_found' });
    }

    const fingerprint = personalVisualSubjectFingerprint(manifestation);
    const running = personalVisualRequestsRef.current.get(id);
    if (running) {
      if (running.fingerprint === fingerprint) return running.promise;
      return running.promise.then(() => ensurePersonalVisual(id, options));
    }

    const force = options.force === true;
    const previousFailure = personalVisualFailuresRef.current.get(id);
    if (
      !force &&
      previousFailure &&
      previousFailure.fingerprint === fingerprint &&
      previousFailure.retryAt > Date.now()
    ) {
      setPersonalVisualPhase(id, {
        phase: 'error',
        error: previousFailure.error,
        stage: previousFailure.stage || 'unknown',
        retryAt: previousFailure.retryAt,
        fingerprint,
      });
      return Promise.resolve({
        ok: false,
        error: 'visual_backoff',
        retryAt: previousFailure.retryAt,
      });
    }

    const generationEpoch = generationEpochRef.current;
    const suppliedProfile =
      options.profile && typeof options.profile === 'object' ? options.profile : {};
    const profile = { ...(snapshot.profile || {}), ...suppliedProfile };
    const mood = shortText(options.mood, 40) || snapshot.mood;

    const fail = (error) => {
      if (!mountedRef.current || generationEpoch !== generationEpochRef.current) {
        return { ok: false, error: 'visual_cancelled' };
      }
      const errorCode = personalVisualErrorCode(error);
      const errorStage = personalVisualErrorStage(error);
      const lastFailure = personalVisualFailuresRef.current.get(id);
      const attempt =
        lastFailure && lastFailure.fingerprint === fingerprint ? lastFailure.attempt + 1 : 1;
      const retryAt = Date.now() + personalVisualRetryDelay(attempt);
      personalVisualFailuresRef.current.set(id, {
        attempt,
        error: errorCode,
        stage: errorStage,
        retryAt,
        fingerprint,
      });
      setPersonalVisualPhase(id, {
        phase: 'error',
        error: errorCode,
        stage: errorStage,
        retryAt,
        fingerprint,
      });
      return { ok: false, error: errorCode, retryAt };
    };

    const task = (async () => {
      const existingKey = manifestation.visual && manifestation.visual.cacheKey;
      if (existingKey) {
        let resource;
        try {
          resource = await acquirePersonalVisual(existingKey);
        } catch (error) {
          return fail(error);
        }
        if (resource) {
          try {
            resource.release();
          } catch (_error) {
            // Releasing an object URL is best effort and does not invalidate the asset.
          }
          personalVisualFailuresRef.current.delete(id);
          setPersonalVisualPhase(id, null);
          return { ok: true, status: 'ready', cacheKey: existingKey };
        }

        setState((currentState) => {
          if (!currentState) return currentState;
          const index = currentState.manifestations.findIndex((item) => item.id === id);
          if (index < 0 || currentState.manifestations[index].visual?.cacheKey !== existingKey) {
            return currentState;
          }
          const manifestations = [...currentState.manifestations];
          manifestations[index] = { ...manifestations[index], visual: null };
          return { ...currentState, manifestations };
        });
        void deletePersonalVisual(existingKey).catch(() => {});
      }

      if (!mountedRef.current || generationEpoch !== generationEpochRef.current) {
        return { ok: false, error: 'visual_cancelled' };
      }
      if (
        isKnownMinor(profile) ||
        profile.cloudPersonalization !== true ||
        !hasCurrentAdultCloudConsent(profile)
      ) {
        personalVisualFailuresRef.current.delete(id);
        setPersonalVisualPhase(id, null);
        return { ok: false, error: 'visual_consent_required' };
      }

      setPersonalVisualPhase(id, { phase: 'pending', fingerprint });
      let visual;
      try {
        visual = await generatePersonalizedVisual({
          desire: manifestation.title,
          category: manifestation.category || 'Wealth',
          lang: manifestation.lang,
          profile,
          visualMood: personalVisualMood(mood, manifestation.category),
        });
      } catch (error) {
        return fail(error);
      }

      const cacheKey = createPersonalVisualCacheKey(id);
      try {
        await savePersonalVisual({
          cacheKey,
          base64: visual.image.data,
          mimeType: visual.image.mimeType,
        });
      } catch (error) {
        return fail(error);
      }

      const currentManifestation = stateRef.current?.manifestations?.find(
        (item) => item.id === id
      );
      if (
        !mountedRef.current ||
        generationEpoch !== generationEpochRef.current ||
        !currentManifestation ||
        personalVisualSubjectFingerprint(currentManifestation) !== fingerprint
      ) {
        void deletePersonalVisual(cacheKey).catch(() => {});
        setPersonalVisualPhase(id, null);
        return { ok: false, error: 'visual_cancelled' };
      }

      const visualMood = personalVisualMood(mood, manifestation.category);
      const sourceFields = personalVisualSourceFields(profile);
      setState((currentState) => {
        if (!currentState || generationEpoch !== generationEpochRef.current) return currentState;
        const index = currentState.manifestations.findIndex((item) => item.id === id);
        if (
          index < 0 ||
          personalVisualSubjectFingerprint(currentState.manifestations[index]) !== fingerprint
        ) {
          return currentState;
        }
        const manifestations = [...currentState.manifestations];
        manifestations[index] = {
          ...manifestations[index],
          visual: {
            cacheKey,
            mimeType: 'image/jpeg',
            aspectRatio: '4:5',
            model: visual.generation.model,
            promptVersion: visual.generation.promptVersion,
            visualMood,
            sourceFields,
            createdAt: new Date().toISOString(),
          },
        };
        return { ...currentState, manifestations };
      });
      personalVisualFailuresRef.current.delete(id);
      setPersonalVisualPhase(id, null);
      return { ok: true, status: 'generated', cacheKey };
    })().catch(fail);

    const tracked = { promise: task, fingerprint };
    personalVisualRequestsRef.current.set(id, tracked);
    const release = () => {
      if (personalVisualRequestsRef.current.get(id) === tracked) {
        personalVisualRequestsRef.current.delete(id);
      }
    };
    task.then(release, release);
    return task;
  }, [setPersonalVisualPhase]);

  const ensureJourneyVisual = useCallback((manifestationId, rawJourneyKey, options = {}) => {
    const id = shortText(manifestationId, 120);
    const journeyKey = shortText(rawJourneyKey, 80);
    if (!id || !JOURNEY_VISUAL_KEYS.has(journeyKey)) {
      return Promise.resolve({ ok: false, error: 'journey_item_not_found' });
    }

    const snapshot = stateRef.current || initialState();
    const manifestation = snapshot.manifestations.find((entry) => entry.id === id);
    const lang = options.lang === 'en' || options.lang === 'pt' ? options.lang : snapshot.lang;
    const item = journeyItemForManifestation(manifestation, journeyKey, lang);
    const statusId = journeyVisualStatusKey(id, journeyKey);
    if (!manifestation || !item) {
      setPersonalVisualPhase(statusId, null);
      return Promise.resolve({ ok: false, error: 'journey_item_not_found' });
    }

    const fingerprint = journeyVisualFingerprint(manifestation, item, lang);
    const running = personalVisualRequestsRef.current.get(statusId);
    if (running) {
      if (running.fingerprint === fingerprint) return running.promise;
      return running.promise.then(() => ensureJourneyVisual(id, journeyKey, options));
    }

    const force = options.force === true;
    const previousFailure = personalVisualFailuresRef.current.get(statusId);
    if (
      !force &&
      previousFailure &&
      previousFailure.fingerprint === fingerprint &&
      previousFailure.retryAt > Date.now()
    ) {
      setPersonalVisualPhase(statusId, {
        phase: 'error',
        error: previousFailure.error,
        stage: previousFailure.stage || 'unknown',
        retryAt: previousFailure.retryAt,
        fingerprint,
      });
      return Promise.resolve({
        ok: false,
        error: 'visual_backoff',
        retryAt: previousFailure.retryAt,
      });
    }

    const generationEpoch = generationEpochRef.current;
    const profile = {
      ...(snapshot.profile || {}),
      ...(manifestation.anchorAnswers || {}),
      ...(options.profile && typeof options.profile === 'object' ? options.profile : {}),
    };
    const mood = shortText(options.mood, 40) || snapshot.mood;

    const fail = (error) => {
      if (!mountedRef.current || generationEpoch !== generationEpochRef.current) {
        return { ok: false, error: 'visual_cancelled' };
      }
      const errorCode = personalVisualErrorCode(error);
      const errorStage = personalVisualErrorStage(error);
      const lastFailure = personalVisualFailuresRef.current.get(statusId);
      const attempt =
        lastFailure && lastFailure.fingerprint === fingerprint ? lastFailure.attempt + 1 : 1;
      const retryAt = Date.now() + personalVisualRetryDelay(attempt);
      personalVisualFailuresRef.current.set(statusId, {
        attempt,
        error: errorCode,
        stage: errorStage,
        retryAt,
        fingerprint,
      });
      setPersonalVisualPhase(statusId, {
        phase: 'error',
        error: errorCode,
        stage: errorStage,
        retryAt,
        fingerprint,
      });
      return { ok: false, error: errorCode, retryAt };
    };

    const task = (async () => {
      const existingReceipt = manifestation.journeyVisuals?.[journeyKey];
      const existingKey = existingReceipt?.cacheKey;
      if (existingKey) {
        if (existingReceipt.contentFingerprint !== fingerprint) {
          setState((currentState) => {
            if (!currentState) return currentState;
            const index = currentState.manifestations.findIndex((entry) => entry.id === id);
            if (index < 0) return currentState;
            const manifestations = [...currentState.manifestations];
            const journeyVisuals = { ...(manifestations[index].journeyVisuals || {}) };
            if (journeyVisuals[journeyKey]?.cacheKey !== existingKey) return currentState;
            delete journeyVisuals[journeyKey];
            manifestations[index] = { ...manifestations[index], journeyVisuals };
            return { ...currentState, manifestations };
          });
          void deletePersonalVisual(existingKey).catch(() => {});
        } else {
          let resource;
          try {
            resource = await acquirePersonalVisual(existingKey);
          } catch (error) {
            return fail(error);
          }
          if (resource) {
            try {
              resource.release();
            } catch (_error) {
              // Releasing an object URL is best effort.
            }
            personalVisualFailuresRef.current.delete(statusId);
            setPersonalVisualPhase(statusId, null);
            return { ok: true, status: 'ready', cacheKey: existingKey };
          }

          setState((currentState) => {
            if (!currentState) return currentState;
            const index = currentState.manifestations.findIndex((entry) => entry.id === id);
            if (
              index < 0 ||
              currentState.manifestations[index].journeyVisuals?.[journeyKey]?.cacheKey !== existingKey
            ) {
              return currentState;
            }
            const manifestations = [...currentState.manifestations];
            const journeyVisuals = { ...(manifestations[index].journeyVisuals || {}) };
            delete journeyVisuals[journeyKey];
            manifestations[index] = { ...manifestations[index], journeyVisuals };
            return { ...currentState, manifestations };
          });
          void deletePersonalVisual(existingKey).catch(() => {});
        }
      }

      if (!mountedRef.current || generationEpoch !== generationEpochRef.current) {
        return { ok: false, error: 'visual_cancelled' };
      }
      if (
        isKnownMinor(profile) ||
        profile.cloudPersonalization !== true ||
        !hasCurrentAdultCloudConsent(profile)
      ) {
        personalVisualFailuresRef.current.delete(statusId);
        setPersonalVisualPhase(statusId, null);
        return { ok: false, error: 'visual_consent_required' };
      }

      setPersonalVisualPhase(statusId, { phase: 'pending', fingerprint });
      const purpose = journeyKey.startsWith('vision:') ? 'vision' : 'affirmation';
      let visual;
      try {
        visual = await generatePersonalizedVisual({
          desire: manifestation.title,
          category: item.category,
          lang,
          profile,
          visualMood: personalVisualMood(mood, item.category),
          purpose,
          visualBrief: item.visualBrief,
          compositionVariant: journeyCompositionVariant(journeyKey),
        });
      } catch (error) {
        return fail(error);
      }

      const cacheKey = createPersonalVisualCacheKey(`${id}-${purpose}-${item.category}`);
      try {
        await savePersonalVisual({
          cacheKey,
          base64: visual.image.data,
          mimeType: visual.image.mimeType,
        });
      } catch (error) {
        return fail(error);
      }

      const latestManifestation = stateRef.current?.manifestations?.find((entry) => entry.id === id);
      const latestItem = journeyItemForManifestation(latestManifestation, journeyKey, lang);
      if (
        !mountedRef.current ||
        generationEpoch !== generationEpochRef.current ||
        !latestManifestation ||
        !latestItem ||
        journeyVisualFingerprint(latestManifestation, latestItem, lang) !== fingerprint
      ) {
        void deletePersonalVisual(cacheKey).catch(() => {});
        setPersonalVisualPhase(statusId, null);
        return { ok: false, error: 'visual_cancelled' };
      }

      const visualMood = personalVisualMood(mood, item.category);
      const sourceFields = personalVisualSourceFields(profile);
      setState((currentState) => {
        if (!currentState || generationEpoch !== generationEpochRef.current) return currentState;
        const index = currentState.manifestations.findIndex((entry) => entry.id === id);
        if (index < 0) return currentState;
        const currentManifestation = currentState.manifestations[index];
        const currentItem = journeyItemForManifestation(currentManifestation, journeyKey, lang);
        if (
          !currentItem ||
          journeyVisualFingerprint(currentManifestation, currentItem, lang) !== fingerprint
        ) {
          return currentState;
        }
        const manifestations = [...currentState.manifestations];
        manifestations[index] = {
          ...currentManifestation,
          journeyVisuals: {
            ...(currentManifestation.journeyVisuals || {}),
            [journeyKey]: {
              cacheKey,
              mimeType: 'image/jpeg',
              aspectRatio: '4:5',
              model: visual.generation.model,
              promptVersion: visual.generation.promptVersion,
              visualMood,
              contentFingerprint: fingerprint,
              sourceFields,
              createdAt: new Date().toISOString(),
            },
          },
        };
        return { ...currentState, manifestations };
      });
      personalVisualFailuresRef.current.delete(statusId);
      setPersonalVisualPhase(statusId, null);
      return { ok: true, status: 'generated', cacheKey };
    })().catch(fail);

    const tracked = { promise: task, fingerprint };
    personalVisualRequestsRef.current.set(statusId, tracked);
    const release = () => {
      if (personalVisualRequestsRef.current.get(statusId) === tracked) {
        personalVisualRequestsRef.current.delete(statusId);
      }
    };
    task.then(release, release);
    return task;
  }, [setPersonalVisualPhase]);

  const ensureDreamVisual = useCallback((entryId, options = {}) => {
    const id = shortText(entryId, 160);
    if (!id) return Promise.resolve({ ok: false, error: 'dream_not_found' });
    const snapshot = stateRef.current || initialState();
    const entry = snapshot.morningRitual?.entries?.find((item) => item.id === id);
    const statusId = dreamVisualStatusKey(id);
    if (!entry) {
      setPersonalVisualPhase(statusId, null);
      return Promise.resolve({ ok: false, error: 'dream_not_found' });
    }

    const fingerprint = dreamVisualFingerprint(entry);
    const running = personalVisualRequestsRef.current.get(statusId);
    if (running) {
      if (running.fingerprint === fingerprint) return running.promise;
      return running.promise.then(() => ensureDreamVisual(id, options));
    }
    const force = options.force === true;
    const previousFailure = personalVisualFailuresRef.current.get(statusId);
    if (
      !force &&
      previousFailure &&
      previousFailure.fingerprint === fingerprint &&
      previousFailure.retryAt > Date.now()
    ) {
      setPersonalVisualPhase(statusId, {
        phase: 'error',
        error: previousFailure.error,
        stage: previousFailure.stage || 'unknown',
        retryAt: previousFailure.retryAt,
        fingerprint,
      });
      return Promise.resolve({ ok: false, error: 'visual_backoff', retryAt: previousFailure.retryAt });
    }

    const generationEpoch = generationEpochRef.current;
    const profile = snapshot.profile || {};
    const fail = (error) => {
      if (!mountedRef.current || generationEpoch !== generationEpochRef.current) {
        return { ok: false, error: 'visual_cancelled' };
      }
      const errorCode = personalVisualErrorCode(error);
      const errorStage = personalVisualErrorStage(error);
      const lastFailure = personalVisualFailuresRef.current.get(statusId);
      const attempt =
        lastFailure && lastFailure.fingerprint === fingerprint ? lastFailure.attempt + 1 : 1;
      const retryAt = Date.now() + personalVisualRetryDelay(attempt);
      personalVisualFailuresRef.current.set(statusId, {
        attempt,
        error: errorCode,
        stage: errorStage,
        retryAt,
        fingerprint,
      });
      setPersonalVisualPhase(statusId, {
        phase: 'error',
        error: errorCode,
        stage: errorStage,
        retryAt,
        fingerprint,
      });
      return { ok: false, error: errorCode, retryAt };
    };

    const task = (async () => {
      const existingKey = entry.visual?.cacheKey;
      if (existingKey) {
        if (entry.visual.contentFingerprint !== fingerprint) {
          setState((currentState) => ({
            ...currentState,
            morningRitual: {
              ...currentState.morningRitual,
              entries: (currentState.morningRitual?.entries || []).map((item) =>
                item.id === id && item.visual?.cacheKey === existingKey
                  ? { ...item, visual: null }
                  : item
              ),
            },
          }));
          void deletePersonalVisual(existingKey).catch(() => {});
        } else {
          let resource;
          try {
            resource = await acquirePersonalVisual(existingKey);
          } catch (error) {
            return fail(error);
          }
          if (resource) {
            try {
              resource.release();
            } catch (_error) {
              // Releasing an object URL is best effort.
            }
            personalVisualFailuresRef.current.delete(statusId);
            setPersonalVisualPhase(statusId, null);
            return { ok: true, status: 'ready', cacheKey: existingKey };
          }

          setState((currentState) => ({
            ...currentState,
            morningRitual: {
              ...currentState.morningRitual,
              entries: (currentState.morningRitual?.entries || []).map((item) =>
                item.id === id && item.visual?.cacheKey === existingKey
                  ? { ...item, visual: null }
                  : item
              ),
            },
          }));
          void deletePersonalVisual(existingKey).catch(() => {});
        }
      }

      if (!mountedRef.current || generationEpoch !== generationEpochRef.current) {
        return { ok: false, error: 'visual_cancelled' };
      }
      if (
        isKnownMinor(profile) ||
        profile.cloudPersonalization !== true ||
        !hasCurrentAdultCloudConsent(profile)
      ) {
        personalVisualFailuresRef.current.delete(statusId);
        setPersonalVisualPhase(statusId, null);
        return { ok: false, error: 'visual_consent_required' };
      }

      const category = dreamVisualCategory(entry.theme);
      const lang = entry.lang === 'en' ? 'en' : 'pt';
      const visualBrief = lang === 'en'
        ? `Create a hopeful editorial image from this safe reflection only: ${entry.reflection}. Do not reconstruct the original dream.`
        : `Crie uma imagem editorial esperançosa apenas a partir desta reflexão segura: ${entry.reflection}. Não reconstrua o sonho original.`;
      setPersonalVisualPhase(statusId, { phase: 'pending', fingerprint });
      let visual;
      try {
        visual = await generatePersonalizedVisual({
          desire: entry.affirmation,
          category,
          lang,
          profile,
          visualMood: personalVisualMood(snapshot.mood, category),
          purpose: 'dream',
          visualBrief,
          compositionVariant: parseInt(compactFingerprint(id), 36) % 12,
        });
      } catch (error) {
        return fail(error);
      }

      const cacheKey = createPersonalVisualCacheKey(`${id}-dream`);
      try {
        await savePersonalVisual({
          cacheKey,
          base64: visual.image.data,
          mimeType: visual.image.mimeType,
        });
      } catch (error) {
        return fail(error);
      }

      const latestEntry = stateRef.current?.morningRitual?.entries?.find((item) => item.id === id);
      if (
        !mountedRef.current ||
        generationEpoch !== generationEpochRef.current ||
        !latestEntry ||
        dreamVisualFingerprint(latestEntry) !== fingerprint
      ) {
        void deletePersonalVisual(cacheKey).catch(() => {});
        return { ok: false, error: 'visual_cancelled' };
      }

      const visualMood = personalVisualMood(snapshot.mood, category);
      setState((currentState) => ({
        ...currentState,
        morningRitual: {
          ...currentState.morningRitual,
          entries: (currentState.morningRitual?.entries || []).map((item) =>
            item.id === id && dreamVisualFingerprint(item) === fingerprint
              ? {
                  ...item,
                  visual: {
                    cacheKey,
                    mimeType: 'image/jpeg',
                    aspectRatio: '4:5',
                    model: visual.generation.model,
                    promptVersion: visual.generation.promptVersion,
                    visualMood,
                    contentFingerprint: fingerprint,
                    sourceFields: personalVisualSourceFields(profile),
                    createdAt: new Date().toISOString(),
                  },
                }
              : item
          ),
        },
      }));
      personalVisualFailuresRef.current.delete(statusId);
      setPersonalVisualPhase(statusId, null);
      return { ok: true, status: 'generated', cacheKey };
    })().catch(fail);

    const tracked = { promise: task, fingerprint };
    personalVisualRequestsRef.current.set(statusId, tracked);
    const release = () => {
      if (personalVisualRequestsRef.current.get(statusId) === tracked) {
        personalVisualRequestsRef.current.delete(statusId);
      }
    };
    task.then(release, release);
    return task;
  }, [setPersonalVisualPhase]);

  const addManifestation = useCallback(async (data) => {
    const generationEpoch = generationEpochRef.current;
    const snapshot = stateRef.current || initialState();
    const lang = data.lang === 'en' || data.lang === 'pt' ? data.lang : snapshot.lang || 'pt';
    // Onboarding saves the profile immediately before creating the first scene.
    // Passing it explicitly avoids a React state race on that final transition.
    const profile = { ...(snapshot.profile || {}), ...(data.profile || {}) };
    const local = dreamToAffirmation(data.title, profile, lang, data.category);
    const generation = {
      source: 'local',
      promptVersion: 'local-interpreted-v2',
    };

    const id = `m-${Date.now()}`;
    const isAnchor =
      data.origin === 'onboarding-anchor' ||
      (!snapshot.anchorSceneId && snapshot.manifestations.length === 0);
    const journeySuiteByLang = buildPersonalJourneySuites({
      desire: data.title,
      profile,
      originLang: lang,
    });
    const item = {
      id,
      origin: isAnchor ? 'onboarding-anchor' : 'manifestation',
      anchorAnswers: isAnchor ? sanitizeAnchorAnswers(profile) : {},
      journeySuiteByLang,
      journeyVisuals: {},
      title: data.title,
      category: data.category || 'Wealth',
      accent: typeof data.accent === 'number' ? data.accent : 0,
      lang, // variante visível; contentByLang preserva PT e EN sem perder edições
      intention: local.intention,
      affirmation: local.affirmation,
      story: local.story,
      anchorIdentity: local.anchorIdentity,
      anchorStep: local.anchorStep,
      // o que do perfil foi usado — a tela mostra isso como recibo honesto
      personalizedWith: local.usouDoPerfil || [],
      generation,
      goalDays: data.goalDays || 21,
      createdAt: todayISO(),
      sessions: [],
      evidence: [],
      livingMirror: emptyLivingMirror(),
    };
    const bilingualItem = localizeManifestation(item, profile, lang);

    // Save the complete local reward first. The remote provider only upgrades
    // this same item later and never delays navigation out of onboarding.
    setState((s) => {
      if (!s || generationEpoch !== generationEpochRef.current) return s;
      // The app language may have changed between the final answer and this
      // state update. Insert the item in the language that is active now.
      const visibleItem = localizeManifestation(bilingualItem, profile, s.lang);
      return {
        ...s,
        anchorSceneId: isAnchor ? id : s.anchorSceneId,
        manifestations: [visibleItem, ...s.manifestations],
      };
    });

    setTimeout(() => {
      void ensurePersonalVisual(id, {
        manifestation: bilingualItem,
        profile,
        mood: snapshot.mood,
      });
    }, 0);

    const canUseCloud =
      !isKnownMinor(profile) &&
      profile.cloudPersonalization === true &&
      hasCurrentAdultCloudConsent(profile);
    if (canUseCloud) {
      // The hydration upgrade effect sees the local item in the next render.
      // Mark this epoch before it can start a duplicate paid request.
      localSceneUpgradeEpochRef.current = generationEpoch;
      const sourceVariant = bilingualItem.lang === lang
        ? snapshotManifestationContent(bilingualItem)
        : bilingualItem.contentByLang?.[lang];
      const sourceFingerprint = JSON.stringify(
        snapshotManifestationContent(sourceVariant || {})
      );
      const profileFingerprint = JSON.stringify(profile || {});
      const candidateTitle = shortText(sourceVariant && sourceVariant.title, 160) || item.title;

      void generatePersonalizedScene({
        desire: data.title,
        category: data.category || 'Wealth',
        lang,
        profile,
        includeJourneySuite: isAnchor,
      }).then((remote) => {
        applyRemoteSceneUpgrade({
          id,
          lang,
          sourceFingerprint,
          profileFingerprint,
          candidateTitle,
          remote,
          generationEpoch,
        });
      }).catch(() => {
        // Keep the local scene. A later app launch can retry this same item.
      });
    }

    return id;
  }, [applyRemoteSceneUpgrade, ensurePersonalVisual, translateAndStoreVariant]);

  // Regra ÚNICA de marcar/desmarcar prática por data (sessions = lista de ISO).
  // `on`: true marca, false desmarca, undefined alterna. Não confirma nada —
  // quem chama confirma (confirmAsync) ANTES de desfazer. Ao cruzar goalDays
  // pela 1ª vez grava completedAt (e não apaga se desmarcar depois — honesto).
  const setPractice = useCallback((id, day, on) => {
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) => {
        if (m.id !== id) return m;
        const marcado = m.sessions.includes(day);
        const quer = on === undefined ? !marcado : on;
        if (quer === marcado) return m;
        const sessions = quer ? [...m.sessions, day] : m.sessions.filter((d) => d !== day);
        const next = { ...m, sessions };
        if (quer && !m.completedAt && sessions.length >= m.goalDays) next.completedAt = todayISO();
        return next;
      }),
    }));
  }, []);

  const togglePractice = useCallback((id, dateIso) => setPractice(id, dateIso || todayISO()), [setPractice]);
  // Atalhos de hoje: logSession só marca (2ª prática no dia não desmarca), undo só desmarca.
  const logSession = useCallback((id) => setPractice(id, todayISO(), true), [setPractice]);
  const undoSession = useCallback((id) => setPractice(id, todayISO(), false), [setPractice]);

  // A Ponte e a pratica usam o mesmo dia, mas continuam fatos diferentes:
  // concluir a Ponte marca a pratica; desfazer a Ponte nao apaga uma pratica
  // que tambem pode ter sido concluida pela narrativa ou pelo ritual de 1 min.
  const toggleBridgeCompletion = useCallback((id, dateIso) => {
    const day = validDay(dateIso) ? dateIso : todayISO();
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((manifestation) => {
        if (manifestation.id !== id) return manifestation;
        const mirror = normalizeLivingMirror(manifestation.livingMirror);
        const alreadyDone = bridgeDoneOn(manifestation, day);
        if (alreadyDone) {
          return {
            ...manifestation,
            livingMirror: {
              ...mirror,
              bridgeCompletions: mirror.bridgeCompletions.filter(
                (entry) => !(entry.date === day && entry.chapter === mirror.chapter)
              ),
            },
          };
        }
        const step = shortText(manifestation.anchorStep, 280);
        if (!step) return manifestation;
        const completedAt = new Date().toISOString();
        const sessions = manifestation.sessions.includes(day)
          ? manifestation.sessions
          : [...manifestation.sessions, day];
        const next = {
          ...manifestation,
          sessions,
          livingMirror: {
            ...mirror,
            bridgeCompletions: [
              {
                id: `bridge-${id}-${mirror.chapter}-${day}`,
                date: day,
                step,
                chapter: mirror.chapter,
                completedAt,
              },
              ...mirror.bridgeCompletions,
            ].slice(0, 90),
          },
        };
        if (!manifestation.completedAt && sessions.length >= manifestation.goalDays) {
          next.completedAt = day;
        }
        return next;
      }),
    }));
  }, []);

  const evolveManifestation = useCallback(async (id) => {
    const target = shortText(id, 120);
    const snapshot = stateRef.current;
    const manifestation = snapshot?.manifestations?.find((item) => item.id === target);
    if (!manifestation) return { ok: false, error: 'manifestation_not_found' };

    const day = todayISO();
    const status = livingMirrorStatus(manifestation, snapshot.morningRitual?.entries, day);
    if (status.evolvedToday) return { ok: false, error: 'already_evolved_today' };
    if (!status.hasNewMemory) return { ok: false, error: 'new_memory_required' };
    if (
      isKnownMinor(snapshot.profile) ||
      snapshot.profile?.cloudPersonalization !== true ||
      !hasCurrentAdultCloudConsent(snapshot.profile)
    ) {
      return { ok: false, error: 'cloud_consent_required' };
    }

    const requestKey = `${target}:${manifestation.lang}:${status.memorySignature}`;
    if (evolutionRequestsRef.current.has(requestKey)) {
      return { ok: false, error: 'evolution_in_progress' };
    }
    evolutionRequestsRef.current.add(requestKey);
    const generationEpoch = generationEpochRef.current;
    const sourceFingerprint = JSON.stringify(snapshotManifestationContent(manifestation));
    try {
      const remote = await generatePersonalizedScene({
        desire: manifestation.title,
        category: manifestation.category || 'Wealth',
        lang: manifestation.lang,
        profile: snapshot.profile,
        continuity: buildEvolutionContinuity(manifestation, snapshot.morningRitual?.entries),
      });
      if (generationEpoch !== generationEpochRef.current) {
        return { ok: false, error: 'state_replaced' };
      }

      const createdAt = new Date().toISOString();
      const nextChapter = Math.min(365, status.chapter + 1);
      let resolveCommit;
      const commitResult = new Promise((resolve) => {
        resolveCommit = resolve;
      });
      setState((currentState) => {
        if (!currentState || generationEpoch !== generationEpochRef.current) {
          resolveCommit({ ok: false, error: 'state_replaced' });
          return currentState;
        }
        const index = currentState.manifestations.findIndex((item) => item.id === target);
        if (index < 0) {
          resolveCommit({ ok: false, error: 'manifestation_not_found' });
          return currentState;
        }
        const current = currentState.manifestations[index];
        const latestStatus = livingMirrorStatus(
          current,
          currentState.morningRitual?.entries,
          day
        );
        if (
          latestStatus.memorySignature !== status.memorySignature ||
          JSON.stringify(snapshotManifestationContent(current)) !== sourceFingerprint
        ) {
          resolveCommit({ ok: false, error: 'memory_changed' });
          return currentState;
        }

        const previous = snapshotLivingMirrorChapter(
          current,
          livingMirrorReceipt(status.memory),
          createdAt
        );
        const variant = manifestationVariantFromScene({
          title: current.title,
          scene: remote.scene,
          generation: remote.generation,
        });
        const mirror = normalizeLivingMirror(current.livingMirror);
        const evolved = {
          ...current,
          ...variant,
          lang: currentState.lang,
          originLang: currentState.lang,
          contentByLang: { [currentState.lang]: variant },
          livingMirror: {
            ...mirror,
            chapter: nextChapter,
            lastEvolvedOn: day,
            lastMemorySignature: status.memorySignature,
            chapters: [previous, ...mirror.chapters]
              .filter(
                (entry, chapterIndex, chapters) =>
                  chapters.findIndex((candidate) => candidate.chapter === entry.chapter) === chapterIndex
              )
              .slice(0, 12),
          },
        };
        const manifestations = [...currentState.manifestations];
        manifestations[index] = localizeManifestation(
          evolved,
          currentState.profile,
          currentState.lang
        );
        resolveCommit({ ok: true, chapter: nextChapter });
        return { ...currentState, manifestations };
      });
      let commitTimeout;
      const outcome = await Promise.race([
        commitResult,
        new Promise((resolve) => {
          commitTimeout = setTimeout(
            () => resolve({ ok: false, error: 'state_update_unavailable' }),
            2000
          );
        }),
      ]);
      if (commitTimeout) clearTimeout(commitTimeout);
      return outcome;
    } catch (error) {
      return {
        ok: false,
        error:
          error && typeof error.message === 'string' && error.message
            ? error.message
            : 'generation_unavailable',
      };
    } finally {
      evolutionRequestsRef.current.delete(requestKey);
    }
  }, []);

  const updateManifestation = useCallback((id, patch) => {
    const saved = stateRef.current?.manifestations?.find((item) => item.id === id);
    const changesVisualSubject =
      !!saved &&
      Object.prototype.hasOwnProperty.call(patch, 'title') &&
      shortText(patch.title, 160) !== shortText(saved.title, 160);
    if (changesVisualSubject && saved.visual?.cacheKey) {
      void deletePersonalVisual(saved.visual.cacheKey).catch(() => {});
    }
    if (changesVisualSubject) {
      Object.values(saved.journeyVisuals || {}).forEach((receipt) => {
        if (receipt?.cacheKey) void deletePersonalVisual(receipt.cacheKey).catch(() => {});
      });
      personalVisualFailuresRef.current.delete(id);
      setPersonalVisualPhase(id, null);
      JOURNEY_VISUAL_KEYS.forEach((journeyKey) => {
        const statusId = journeyVisualStatusKey(id, journeyKey);
        personalVisualFailuresRef.current.delete(statusId);
        setPersonalVisualPhase(statusId, null);
      });
    }
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) => {
        if (m.id !== id) return m;
        const itemChangesVisualSubject =
          Object.prototype.hasOwnProperty.call(patch, 'title') &&
          shortText(patch.title, 160) !== shortText(m.title, 160);
        const journeyOriginLang = m.journeySuiteByLang?.originLang === 'en'
          ? 'en'
          : m.journeySuiteByLang?.originLang === 'pt'
          ? 'pt'
          : m.lang === 'en'
          ? 'en'
          : 'pt';
        const journeyOriginTitle = journeyOriginLang === m.lang
          ? patch.title
          : m.contentByLang?.[journeyOriginLang]?.title || m.title;
        const next = {
          ...m,
          ...patch,
          ...(itemChangesVisualSubject
            ? {
                visual: null,
                journeyVisuals: {},
                journeyStoryEditsByLang: {},
                journeySuiteByLang: buildPersonalJourneySuites({
                  desire: journeyOriginTitle,
                  profile: Object.keys(m.anchorAnswers || {}).length
                    ? { ...(s.profile || {}), ...m.anchorAnswers }
                    : s.profile,
                  originLang: journeyOriginLang,
                }),
              }
            : {}),
        };
        const contentFields = [
          'title',
          'intention',
          'affirmation',
          'story',
          'anchorIdentity',
          'anchorStep',
          'personalizedWith',
        ];
        const editsContent = contentFields.some((field) =>
          Object.prototype.hasOwnProperty.call(patch, field)
        );
        if (!editsContent) return next;
        const editedSnapshot = snapshotManifestationContent(next);
        const editedVariant = {
          ...editedSnapshot,
          generation: {
            ...editedSnapshot.generation,
            source: 'user-edited',
            promptVersion: 'user-edit-v1',
          },
        };
        return {
          ...next,
          ...editedVariant,
          originLang: m.originLang === 'en' || m.originLang === 'pt' ? m.originLang : m.lang,
          contentByLang: {
            ...(m.contentByLang || {}),
            [m.lang]: editedVariant,
          },
        };
      }),
    }));
    if (changesVisualSubject) {
      setTimeout(() => {
        void ensurePersonalVisual(id, { force: true });
      }, 0);
    }
  }, [ensurePersonalVisual, setPersonalVisualPhase]);

  const updateJourneyVisionStory = useCallback((manifestationId, rawJourneyKey, rawLang, value) => {
    const id = shortText(manifestationId, 120);
    const journeyKey = shortText(rawJourneyKey, 80);
    const lang = rawLang === 'en' ? 'en' : 'pt';
    const story = shortText(value, 1200);
    const saved = stateRef.current?.manifestations?.find((item) => item.id === id);
    if (
      !saved ||
      !story ||
      !journeyKey.startsWith('vision:') ||
      journeyKey.endsWith(':secondary') ||
      !JOURNEY_VISUAL_KEYS.has(journeyKey) ||
      !journeyItemForManifestation(saved, journeyKey, lang)
    ) {
      return false;
    }
    setState((currentState) => ({
      ...currentState,
      manifestations: currentState.manifestations.map((manifestation) =>
        manifestation.id !== id
          ? manifestation
          : {
              ...manifestation,
              journeyStoryEditsByLang: {
                ...(manifestation.journeyStoryEditsByLang || {}),
                [lang]: {
                  ...(manifestation.journeyStoryEditsByLang?.[lang] || {}),
                  [journeyKey]: story,
                },
              },
            }
      ),
    }));
    return true;
  }, []);

  const addEvidence = useCallback((id, text) => {
    const body = String(text || '').trim().slice(0, 280);
    if (!body) return false;
    const entry = { id: `e-${Date.now()}`, text: body, createdAt: new Date().toISOString() };
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) =>
        m.id === id ? { ...m, evidence: [entry, ...(Array.isArray(m.evidence) ? m.evidence : [])] } : m
      ),
    }));
    return true;
  }, []);

  const updateEvidence = useCallback((manifestationId, evidenceId, text) => {
    const body = String(text || '').trim().slice(0, 280);
    if (!body) return false;
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) =>
        m.id !== manifestationId
          ? m
          : {
              ...m,
              evidence: (Array.isArray(m.evidence) ? m.evidence : []).map((entry) =>
                entry.id === evidenceId ? { ...entry, text: body, updatedAt: new Date().toISOString() } : entry
              ),
            }
      ),
    }));
    return true;
  }, []);

  const removeEvidence = useCallback((manifestationId, evidenceId) => {
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) =>
        m.id !== manifestationId
          ? m
          : { ...m, evidence: (Array.isArray(m.evidence) ? m.evidence : []).filter((entry) => entry.id !== evidenceId) }
      ),
    }));
  }, []);

  const removeManifestation = useCallback((id) => {
    const removedManifestation = stateRef.current?.manifestations?.find((item) => item.id === id);
    const visualKey = removedManifestation?.visual?.cacheKey;
    if (visualKey) void deletePersonalVisual(visualKey).catch(() => {});
    Object.values(removedManifestation?.journeyVisuals || {}).forEach((receipt) => {
      if (receipt?.cacheKey) void deletePersonalVisual(receipt.cacheKey).catch(() => {});
    });
    personalVisualFailuresRef.current.delete(id);
    setPersonalVisualPhase(id, null);
    JOURNEY_VISUAL_KEYS.forEach((journeyKey) => {
      const statusId = journeyVisualStatusKey(id, journeyKey);
      personalVisualFailuresRef.current.delete(statusId);
      setPersonalVisualPhase(statusId, null);
    });
    setState((s) => {
      const affirmationPrefix = `${id}:affirmation:`;
      const visionPrefix = `${id}:vision:`;
      const usedAsAlarm = String(s.morningRitual?.wakeAffirmationId || '').startsWith(
        affirmationPrefix
      );
      const remainingManifestations = s.manifestations.filter((m) => m.id !== id);
      const nextAnchor = s.anchorSceneId === id
        ? remainingManifestations.find((item) => item.origin === 'onboarding-anchor') ||
          remainingManifestations[remainingManifestations.length - 1] ||
          null
        : null;
      return {
        ...s,
        anchorSceneId: s.anchorSceneId === id ? nextAnchor?.id || null : s.anchorSceneId,
        manifestations: remainingManifestations.map((item) =>
          nextAnchor && item.id === nextAnchor.id
            ? { ...item, origin: 'onboarding-anchor' }
            : item
        ),
        favoriteAffirmations: s.favoriteAffirmations.filter(
          (favoriteId) => !String(favoriteId).startsWith(affirmationPrefix)
        ),
        savedVisions: s.savedVisions.filter(
          (visionId) => !String(visionId).startsWith(visionPrefix)
        ),
        visionPlays: s.visionPlays.filter(
          (play) => !String(play?.visionId || '').startsWith(visionPrefix)
        ),
        ...(usedAsAlarm
          ? {
              morningRitual: {
                ...s.morningRitual,
                reminderEnabled: false,
                wakeAffirmationId: null,
                wakeAffirmationText: '',
                wakeAffirmationLang: s.lang === 'en' ? 'en' : 'pt',
                wakeNarratorId: null,
                wakeSoundSource: null,
              },
            }
          : {}),
      };
    });
  }, [setPersonalVisualPhase]);

  const toggleFavoriteAffirmation = useCallback((id) => {
    setState((s) => ({
      ...s,
      favoriteAffirmations: s.favoriteAffirmations.includes(id)
        ? s.favoriteAffirmations.filter((x) => x !== id)
        : [id, ...s.favoriteAffirmations],
    }));
  }, []);

  const markAffirmationRead = useCallback(() => {
    const day = todayISO();
    setState((s) =>
      s.affirmationDates.includes(day) ? s : { ...s, affirmationDates: [day, ...s.affirmationDates] }
    );
  }, []);

  const toggleSavedVision = useCallback((id) => {
    setState((s) => ({
      ...s,
      savedVisions: s.savedVisions.includes(id)
        ? s.savedVisions.filter((x) => x !== id)
        : [id, ...s.savedVisions],
    }));
  }, []);

  const logVisionPlay = useCallback((visionId) => {
    setState((s) => ({
      ...s,
      visionPlays: [{ visionId, date: todayISO() }, ...s.visionPlays].slice(0, 200),
    }));
  }, []);

  const setName = useCallback((name) => {
    setState((s) => ({ ...s, name: shortText(name, 80) || s.name }));
  }, []);

  const resetAll = useCallback(async () => {
    if (
      resetInProgressRef.current ||
      storageMutationRef.current ||
      pendingResetRevisionRef.current ||
      pendingImportRevisionRef.current ||
      !hydratedRef.current ||
      !writerRef.current
    ) return false;
    resetInProgressRef.current = true;
    storageMutationRef.current = 'reset';
    setStorageMutation('reset');
    generationEpochRef.current += 1;
    personalVisualFailuresRef.current.clear();
    setPersonalVisualStatus({});
    pendingOnboardingRef.current = false;
    const current = stateRef.current || initialState();
    // Reset apaga os dados, não as preferências: idioma e clima ficam
    // (senão quem tem celular em inglês volta pro inglês do detectLang).
    const next = { ...initialState(), lang: current.lang, mood: current.mood };
    let communityToken = null;
    let preparationPromise = null;
    try {
      preparationPromise = (async () => {
        // Inclui lembretes recorrentes e eventuais adiamentos de 10 minutos.
        const planCancellation = await cancelPracticePlanReminders();
        if (!planCancellation.ok) throw new Error('practice_plan_cancel_failed');
        // The persisted daily identifier can be lost if the process stops
        // after native scheduling. Sweep only Celeste-tagged ritual notices
        // before making the reset durable.
        const dailyRitualSweep = await cancelOrphanedDailyRitualReminders();
        if (!dailyRitualSweep.ok) throw new Error('daily_ritual_cancel_failed');
        communityToken = await beginCommunityDataReset();
        // Privacy-sensitive auxiliary records must be gone before the empty
        // onboarding can ever become visible again.
        await AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS);
        await clearPersonalVisuals();
        const revision = writerRef.current.enqueue(JSON.stringify(next));
        if (!revision) throw new Error('storage_writer_unavailable');
        pendingResetRevisionRef.current = revision;

        let finalizePromise = null;
        const finalizeReset = () => {
          if (pendingResetRevisionRef.current !== revision) return Promise.resolve(false);
          if (finalizePromise) return finalizePromise;
          finalizePromise = (async () => {
            const slowTimer = setTimeout(() => {
              if (mountedRef.current) setStorageError(true);
            }, STORAGE_WRITE_TIMEOUT_MS);
            try {
              // The generation barrier rejects submits that started before reset;
              // this final pass waits for their local writes before unlocking.
              await AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS);
              await finishCommunityDataReset(communityToken);
              if (mountedRef.current) {
                skipNextPersistRef.current = true;
                desiredLanguageRef.current = next.lang;
                setState(next);
                setStorageError(false);
                setStorageMutation(null);
              }
              storageMutationRef.current = null;
              pendingResetRevisionRef.current = 0;
              pendingResetFinalizeRef.current = null;
              return true;
            } catch (_error) {
              finalizePromise = null;
              if (mountedRef.current) setStorageError(true);
              return false;
            } finally {
              clearTimeout(slowTimer);
            }
          })();
          return finalizePromise;
        };
        pendingResetFinalizeRef.current = finalizeReset;
        writerRef.current.resume();
        return true;
      })();
      const preparation = { kind: 'reset', promise: preparationPromise };
      pendingStoragePreparationRef.current = preparation;
      void preparationPromise.then(
        () => {
          if (pendingStoragePreparationRef.current === preparation) {
            pendingStoragePreparationRef.current = null;
          }
        },
        () => {
          if (pendingStoragePreparationRef.current === preparation) {
            pendingStoragePreparationRef.current = null;
          }
          if (!pendingResetRevisionRef.current && storageMutationRef.current === 'reset') {
            cancelCommunityDataReset(communityToken);
            storageMutationRef.current = null;
            if (mountedRef.current) {
              setStorageError(true);
              setStorageMutation(null);
            }
          }
        }
      );

      const prepared = await settleWithin(preparationPromise, STORAGE_WRITE_TIMEOUT_MS);
      if (!prepared.settled || prepared.error || prepared.value !== true) {
        if (mountedRef.current) setStorageError(true);
        if (prepared.error && !pendingResetRevisionRef.current) {
          cancelCommunityDataReset(communityToken);
          storageMutationRef.current = null;
          if (mountedRef.current) setStorageMutation(null);
        }
        return false;
      }
      const revision = pendingResetRevisionRef.current;
      const saved = await writerRef.current.waitFor(revision, STORAGE_WRITE_TIMEOUT_MS);
      if (!saved) {
        if (mountedRef.current) setStorageError(true);
        return false;
      }
      const finalized = await settleWithin(
        pendingResetFinalizeRef.current(),
        STORAGE_WRITE_TIMEOUT_MS
      );
      if (!finalized.settled || finalized.error) {
        if (mountedRef.current) setStorageError(true);
        return false;
      }
      return finalized.value === true;
    } catch (_error) {
      if (mountedRef.current) {
        setStorageError(true);
        if (!pendingResetRevisionRef.current) {
          cancelCommunityDataReset(communityToken);
          storageMutationRef.current = null;
          setStorageMutation(null);
        }
      }
      return false;
    } finally {
      resetInProgressRef.current = false;
    }
  }, []);

  // Clima escolhido na Jornada — persiste junto com o resto do estado.
  const setMood = useCallback((m) => {
    if (!VISUAL_MOODS.includes(m)) return;
    setState((s) => ({ ...s, mood: m }));
  }, []);

  const setNarrator = useCallback((narratorId) => {
    if (!isNarratorId(narratorId)) return;
    setState((s) => ({ ...s, narration: { narratorId } }));
  }, []);

  const saveDailyRitualPreferences = useCallback((patch) => {
    setState((s) => {
      const current = s.dailyRitual || initialState().dailyRitual;
      const next = { ...current };
      if (patch && typeof patch.reminderEnabled === 'boolean') {
        next.reminderEnabled = patch.reminderEnabled;
      }
      if (patch && validTime(patch.reminderTime)) next.reminderTime = patch.reminderTime;
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'notificationId')) {
        next.notificationId = shortText(patch.notificationId, 240) || null;
      }
      if (patch && ['unknown', 'granted', 'denied', 'unsupported'].includes(patch.permission)) {
        next.permission = patch.permission;
      }
      return { ...s, dailyRitual: next };
    });
  }, []);

  const savePracticePlan = useCallback((value) => {
    setState((s) => {
      const current = normalizePracticePlan(
        s.practicePlan || initialState().practicePlan,
        practiceOptionsForState(s)
      );
      const requested = typeof value === 'function' ? value(current) : value;
      const source = requested && typeof requested === 'object' && !Array.isArray(requested)
        ? { ...current, ...requested }
        : current;
      return {
        ...s,
        practicePlan: normalizePracticePlan(source, practiceOptionsForState(s)),
      };
    });
  }, []);

  const completePracticePlanSlot = useCallback(({ slotId, method = 'speech', score = 0 } = {}) => {
    const requestedSlotId = shortText(slotId, 80);
    if (!requestedSlotId) return false;

    const completedAt = new Date().toISOString();
    const day = todayISO();
    const prepareCompletion = (sourceState) => {
      if (!sourceState) return null;
      const options = practiceOptionsForState(sourceState);
      const current = normalizePracticePlan(
        sourceState.practicePlan || initialState().practicePlan,
        options
      );
      const slot = current.slots.find((item) => item.id === requestedSlotId && item.enabled);
      if (!slot?.affirmationId || !slot?.visionId) return null;
      const affirmation = options.affirmations.find((item) => item.id === slot.affirmationId);
      const vision = options.visions.find((item) => item.id === slot.visionId);
      if (!affirmation || !vision) return null;
      const visionTitle = shortText(vision.title || vision.sourceTitle, 180);
      const visionBody = shortText(vision.story || vision.text || vision.title, 1400);
      const receipt = createPracticeReceipt(
        {
          slotId: slot.id,
          affirmationId: slot.affirmationId,
          visionId: slot.visionId,
          completedAt,
          day,
          method,
          score,
          contentFingerprint: practiceContentFingerprint({
            affirmationText: shortText(affirmation.text, 800),
            visionText: `${visionTitle}\n${visionBody}`,
          }),
        },
        { ...options, slots: current.slots }
      );
      return receipt ? { current, options, receipt, slot } : null;
    };

    // Return a reliable synchronous acceptance result to the screen. The state
    // updater validates the same IDs/content again before writing the receipt.
    if (!prepareCompletion(stateRef.current)) return false;
    setState((s) => {
      const prepared = prepareCompletion(s);
      if (!prepared) return s;
      const { current, options, receipt, slot } = prepared;
      const affirmationDates = Array.isArray(s.affirmationDates) ? s.affirmationDates : [];
      const visionPlays = Array.isArray(s.visionPlays) ? s.visionPlays : [];
      const nextAffirmationDates = !affirmationDates.includes(receipt.day)
        ? [receipt.day, ...affirmationDates]
        : affirmationDates;
      const nextVisionPlays = [
        { visionId: slot.visionId, date: receipt.day },
        ...visionPlays,
      ].slice(0, 200);
      return {
        ...s,
        affirmationDates: nextAffirmationDates,
        visionPlays: nextVisionPlays,
        practicePlan: normalizePracticePlan(
          { ...current, receipts: [receipt, ...current.receipts] },
          options
        ),
      };
    });
    return true;
  }, []);

  const saveMorningRitualPreferences = useCallback((patch) => {
    setState((s) => {
      const current = s.morningRitual || initialState().morningRitual;
      const next = { ...current };
      if (patch && typeof patch.reminderEnabled === 'boolean') {
        next.reminderEnabled = patch.reminderEnabled;
      }
      if (patch && typeof patch.alarmSyncError === 'boolean') {
        next.alarmSyncError = patch.alarmSyncError;
      }
      if (patch && validTime(patch.reminderTime)) next.reminderTime = patch.reminderTime;
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'weekdays')) {
        const weekdays = normalizeAlarmWeekdays(patch.weekdays);
        if (weekdays) next.weekdays = weekdays;
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'wakeAffirmationId')) {
        next.wakeAffirmationId = shortText(patch.wakeAffirmationId, 160) || null;
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'wakeAffirmationText')) {
        next.wakeAffirmationText = shortText(patch.wakeAffirmationText, 800);
      }
      if (patch && (patch.wakeAffirmationLang === 'pt' || patch.wakeAffirmationLang === 'en')) {
        next.wakeAffirmationLang = patch.wakeAffirmationLang;
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'wakeNarratorId')) {
        next.wakeNarratorId = isNarratorId(patch.wakeNarratorId) ? patch.wakeNarratorId : null;
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'wakeSoundSource')) {
        next.wakeSoundSource =
          patch.wakeSoundSource === 'neural_wav' || patch.wakeSoundSource === 'local_speech'
            ? patch.wakeSoundSource
            : null;
      }
      return { ...s, morningRitual: next };
    });
  }, []);

  const saveDreamRitual = useCallback((data) => {
    const dream = shortText(data && data.dream, 1600);
    const affirmation = shortText(data && data.affirmation, 800);
    if (!dream || !affirmation) return null;

    const feeling = RITUAL_FEELINGS.includes(data.feeling) ? data.feeling : '';
    const theme = RITUAL_THEMES.includes(data.theme) ? data.theme : 'clarity';
    const reflection = shortText(data.reflection, 800);
    const dreamAnchor = shortText(data.dreamAnchor, 120);
    const lang = data.lang === 'en' ? 'en' : 'pt';
    const requestedReplacementId = shortText(data && data.replaceId, 160);
    const existingEntry = requestedReplacementId
      ? (stateRef.current?.morningRitual?.entries || []).find(
          (entry) => entry.id === requestedReplacementId
        ) || null
      : null;
    const signature = JSON.stringify({ dream, affirmation, feeling, theme, reflection, dreamAnchor, lang });
    const nowMs = Date.now();
    const previous = lastDreamSaveRef.current;
    if (
      previous.epoch === generationEpochRef.current &&
      previous.signature === signature &&
      nowMs - previous.at < 1500
    ) {
      return previous.id;
    }

    const now = new Date(nowMs).toISOString();
    const id = existingEntry?.id || `dream-${nowMs}-${Math.random().toString(36).slice(2, 7)}`;
    lastDreamSaveRef.current = {
      epoch: generationEpochRef.current,
      signature,
      id,
      at: nowMs,
    };
    const item = {
      id,
      dream,
      feeling,
      theme,
      affirmation,
      reflection,
      dreamAnchor,
      usedDetails: (Array.isArray(data.usedDetails) ? data.usedDetails : [])
        .filter((key) => RITUAL_DETAIL_KEYS.includes(key))
        .filter((key, index, values) => values.indexOf(key) === index),
      generatorVersion: shortText(data.generatorVersion, 40) || 'dream-local-v2',
      generation: sanitizeGenerationReceipt(
        data.generation,
        'local-dream',
        'dream-local-v2'
      ),
      lang,
      createdAt: existingEntry?.createdAt || now,
      practiceCount: Number(existingEntry?.practiceCount) || 0,
      lastPracticedAt: existingEntry?.lastPracticedAt || null,
      useInLivingMirror: existingEntry?.useInLivingMirror === true,
      ...(existingEntry?.visual ? { visual: existingEntry.visual } : {}),
    };
    setState((s) => {
      const ritual = s.morningRitual || initialState().morningRitual;
      const entries = ritual.entries || [];
      return {
        ...s,
        morningRitual: {
          ...ritual,
          entries: existingEntry
            ? entries.map((entry) => (entry.id === id ? item : entry))
            : [item, ...entries].slice(0, 90),
        },
      };
    });
    return id;
  }, []);

  const markDreamRitualPracticed = useCallback((id) => {
    const practicedAt = new Date().toISOString();
    const day = todayISO();
    setState((s) => {
      const ritual = s.morningRitual || initialState().morningRitual;
      return {
        ...s,
        affirmationDates: Array.from(new Set([...(s.affirmationDates || []), day])),
        morningRitual: {
          ...ritual,
          entries: (ritual.entries || []).map((entry) =>
            entry.id === id && String(entry.lastPracticedAt || '').slice(0, 10) !== day
              ? {
                  ...entry,
                  practiceCount: (Number(entry.practiceCount) || 0) + 1,
                  lastPracticedAt: practicedAt,
                }
              : entry
          ),
        },
      };
    });
  }, []);

  const setDreamLivingMirrorConsent = useCallback((id, enabled) => {
    const target = shortText(id, 160);
    if (!target || typeof enabled !== 'boolean') return;
    setState((s) => {
      const ritual = s.morningRitual || initialState().morningRitual;
      return {
        ...s,
        morningRitual: {
          ...ritual,
          entries: (ritual.entries || []).map((entry) =>
            entry.id === target ? { ...entry, useInLivingMirror: enabled } : entry
          ),
        },
      };
    });
  }, []);

  const removeDreamRitual = useCallback((id) => {
    const target = shortText(id, 160);
    if (!target) return;
    const visualKey = stateRef.current?.morningRitual?.entries?.find(
      (entry) => entry.id === target
    )?.visual?.cacheKey;
    if (visualKey) void deletePersonalVisual(visualKey).catch(() => {});
    const statusId = dreamVisualStatusKey(target);
    personalVisualFailuresRef.current.delete(statusId);
    setPersonalVisualPhase(statusId, null);
    if (lastDreamSaveRef.current.id === target) {
      lastDreamSaveRef.current = { epoch: -1, signature: '', id: null, at: 0 };
    }
    setState((s) => {
      const ritual = s.morningRitual || initialState().morningRitual;
      const usedAsAlarm = ritual.wakeAffirmationId === `ritual:${target}`;
      return {
        ...s,
        morningRitual: {
          ...ritual,
          entries: (ritual.entries || []).filter((entry) => entry.id !== target),
          ...(usedAsAlarm
            ? {
                reminderEnabled: false,
                wakeAffirmationId: null,
                wakeAffirmationText: '',
                wakeNarratorId: null,
                wakeSoundSource: null,
              }
            : {}),
        },
      };
    });
  }, [setPersonalVisualPhase]);

  const exportStateJson = useCallback(async () => {
    if (
      storageMutationRef.current ||
      pendingResetRevisionRef.current ||
      pendingImportRevisionRef.current
    ) {
      const error = new Error('backup_storage_unavailable');
      error.code = 'backup_storage_unavailable';
      throw error;
    }
    const communityStories = await exportLocalCommunityStoriesForBackup();
    const envelope = {
      format: CELESTE_BACKUP_FORMAT,
      version: CELESTE_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      restorePolicy: CELESTE_BACKUP_RESTORE_POLICY,
      includes: ['app-state', 'local-community-stories'],
      excludes: [
        'cloud-community-posts',
        'submitted-ai-content-reports',
        'pseudonymous-reporting-session',
        'device-consents',
        'scheduled-notifications',
        'generated-image-files',
      ],
      data: {
        state: {
          ...(stateRef.current || initialState()),
          profile: stripCloudConsentProfile((stateRef.current || initialState()).profile),
          manifestations: ((stateRef.current || initialState()).manifestations || []).map(
            ({
              visual: _deviceOnlyVisual,
              journeyVisuals: _deviceOnlyJourneyVisuals,
              ...manifestation
            }) => manifestation
          ),
          morningRitual: {
            ...((stateRef.current || initialState()).morningRitual || {}),
            entries: (((stateRef.current || initialState()).morningRitual || {}).entries || []).map(
              ({ visual: _deviceOnlyDreamVisual, ...entry }) => entry
            ),
          },
          practicePlan: {
            ...((stateRef.current || initialState()).practicePlan || {}),
            enabled: false,
            notificationIdsBySlot: {},
            permission: 'unknown',
            syncError: false,
          },
        },
        communityStories,
      },
    };
    // Keep the user-controlled export inspectable without proprietary tooling.
    const serialized = JSON.stringify(envelope, null, 2);
    if (utf8ByteLength(serialized) > CELESTE_BACKUP_MAX_BYTES) {
      const error = new Error('backup_too_large');
      error.code = 'backup_too_large';
      throw error;
    }
    return serialized;
  }, []);

  // Import valida (JSON parseável + shape mínimo) e passa pelo mesmo merge
  // defensivo do load. `erro` é código de máquina — a tela traduz via i18n.
  const importStateJson = useCallback(async (str) => {
    const backup = decodeBackupPayload(str);
    if (backup.error) return { ok: false, erro: backup.error };
    const restored = mergeDefensivo(backup.state);
    restored.manifestations = restored.manifestations.map(({
      visual: _visual,
      journeyVisuals: _journeyVisuals,
      ...item
    }) => item);
    // Consentimento de nuvem pertence a este aparelho e a esta instalação.
    // Mesmo um backup forjado com a versão atual precisa de novo aceite local.
    restored.profile = normalizeCloudConsentProfile(restored.profile, {
      knownMinor: isKnownMinor(restored.profile),
      forceReconsent: true,
    });
    restored.dailyRitual = {
      ...(restored.dailyRitual || initialState().dailyRitual),
      reminderEnabled: false,
      notificationId: null,
      permission: 'unknown',
    };
    restored.morningRitual = {
      ...(restored.morningRitual || initialState().morningRitual),
      reminderEnabled: false,
      alarmSyncError: false,
      wakeAffirmationId: null,
      wakeAffirmationText: '',
      wakeAffirmationLang: restored.lang === 'en' ? 'en' : 'pt',
      wakeNarratorId: null,
      wakeSoundSource: null,
      entries: (restored.morningRitual?.entries || []).map((entry) => ({
        ...entry,
        visual: null,
        useInLivingMirror: false,
      })),
    };
    restored.practicePlan = normalizePracticePlan(
      {
        ...(restored.practicePlan || initialState().practicePlan),
        enabled: false,
        notificationIdsBySlot: {},
        permission: 'unknown',
        syncError: false,
      },
      practiceOptionsForState(restored)
    );
    if (
      pendingResetRevisionRef.current ||
      pendingImportRevisionRef.current ||
      storageMutationRef.current ||
      !hydratedRef.current ||
      !writerRef.current
    ) {
      return { ok: false, erro: 'storage_unavailable' };
    }
    storageMutationRef.current = 'import';
    setStorageMutation('import');
    let communityToken = null;
    try {
      if (backup.replaceCommunityStories) {
        communityToken = await beginCommunityDataReset();
      }
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        const alarmCapability = await getAffirmationAlarmCapability().catch(() => null);
        if (!alarmCapability) {
          cancelCommunityDataReset(communityToken);
          storageMutationRef.current = null;
          setStorageMutation(null);
          return { ok: false, erro: 'alarm_cancel_failed' };
        }
        if (alarmCapability.supported === true || alarmCapability.nativeModuleAvailable === true) {
          const alarmCancelled = await cancelAffirmationAlarm().catch(() => null);
          if (!alarmCancelled || alarmCancelled.ok !== true) {
            cancelCommunityDataReset(communityToken);
            storageMutationRef.current = null;
            setStorageMutation(null);
            return { ok: false, erro: 'alarm_cancel_failed' };
          }
        }
      }
      const reminderCancelled = await cancelDailyRitualReminder(
        stateRef.current?.dailyRitual?.notificationId
      );
      if (!reminderCancelled.ok) {
        cancelCommunityDataReset(communityToken);
        storageMutationRef.current = null;
        setStorageMutation(null);
        return { ok: false, erro: 'reminder_cancel_failed' };
      }
      const orphanedRemindersCancelled = await cancelOrphanedDailyRitualReminders();
      if (!orphanedRemindersCancelled.ok) {
        cancelCommunityDataReset(communityToken);
        storageMutationRef.current = null;
        setStorageMutation(null);
        return { ok: false, erro: 'reminder_cancel_failed' };
      }
      // O backup substitui o estado inteiro; nenhum adiamento antigo deve
      // sobreviver mesmo que seu identificador não estivesse persistido.
      const planRemindersCancelled = await cancelPracticePlanReminders();
      if (!planRemindersCancelled.ok) {
        cancelCommunityDataReset(communityToken);
        storageMutationRef.current = null;
        setStorageMutation(null);
        return { ok: false, erro: 'reminder_cancel_failed' };
      }
      const revision = writerRef.current.enqueue(JSON.stringify(restored));
      if (!revision) {
        cancelCommunityDataReset(communityToken);
        storageMutationRef.current = null;
        setStorageMutation(null);
        return { ok: false, erro: 'storage_unavailable' };
      }
      generationEpochRef.current += 1;
      personalVisualFailuresRef.current.clear();
      setPersonalVisualStatus({});
      pendingImportRevisionRef.current = revision;
      writerRef.current.resume();

      let finalizePromise = null;
      const finalizeImport = () => {
        if (pendingImportRevisionRef.current !== revision) return Promise.resolve(false);
        if (finalizePromise) return finalizePromise;
        finalizePromise = (async () => {
          try {
            if (backup.replaceCommunityStories) {
              await restoreLocalCommunityStoriesFromBackup(
                communityToken,
                backup.communityStories
              );
            }
            // Keep the current visual files until the replacement state is
            // durably persisted. A failed import must leave the old state usable.
            await clearPersonalVisuals();
            if (mountedRef.current) {
              skipNextPersistRef.current = true;
              desiredLanguageRef.current = restored.lang;
              setState(restored);
              setStorageError(false);
              setStorageMutation(null);
            }
            storageMutationRef.current = null;
            pendingImportRevisionRef.current = 0;
            pendingImportFinalizeRef.current = null;
            return true;
          } catch (_error) {
            finalizePromise = null;
            if (mountedRef.current) setStorageError(true);
            return false;
          }
        })();
        return finalizePromise;
      };
      pendingImportFinalizeRef.current = finalizeImport;

      const saved = await writerRef.current.waitFor(revision, STORAGE_WRITE_TIMEOUT_MS);
      if (!saved) {
        if (mountedRef.current) setStorageError(true);
        return { ok: false, erro: 'storage_unavailable' };
      }
      const finalized = await finalizeImport();
      return finalized
        ? { ok: true, erro: null }
        : { ok: false, erro: 'storage_unavailable' };
    } catch (_error) {
      if (!pendingImportRevisionRef.current) {
        cancelCommunityDataReset(communityToken);
        storageMutationRef.current = null;
        if (mountedRef.current) setStorageMutation(null);
      }
      if (mountedRef.current) setStorageError(true);
      return { ok: false, erro: 'storage_unavailable' };
    }
  }, []);

  // ── Onboarding ────────────────────────────────────────────────────────────
  const saveProfile = useCallback((patch) => {
    setState((s) => {
      const candidate = { ...(s.profile || {}), ...(patch || {}) };
      const profile = normalizeCloudConsentProfile(candidate, {
        knownMinor: isKnownMinor(candidate),
      });
      return {
        ...s,
        profile,
        name: patch && patch.name ? String(patch.name).trim() : s.name,
      };
    });
  }, []);

  const completeOnboarding = useCallback(async () => {
    const current = stateRef.current;
    if (
      !current ||
      !hydratedRef.current ||
      !writerRef.current ||
      storageMutationRef.current
    ) return false;
    const next = { ...current, onboardingDone: true };
    pendingOnboardingRef.current = true;
    // Confirma a gravacao antes de desmontar o paywall. A fila impede que uma
    // escrita antiga termine depois e devolva onboardingDone para false.
    const revision = writerRef.current.enqueue(JSON.stringify(next));
    writerRef.current.resume();
    const saved = await writerRef.current.waitFor(revision, STORAGE_WRITE_TIMEOUT_MS);
    if (saved) {
      pendingOnboardingRef.current = false;
      // Preserva qualquer mudanca que tenha ocorrido enquanto a gravacao nativa
      // estava pendente; concluir o onboarding altera somente este campo.
      setState((latest) => ({ ...latest, onboardingDone: true }));
      setStorageError(false);
      return true;
    }
    if (mountedRef.current) setStorageError(true);
    return false;
  }, []);

  const resetOnboarding = useCallback(() => {
    generationEpochRef.current += 1;
    personalVisualFailuresRef.current.clear();
    setPersonalVisualStatus({});
    setState((s) => ({ ...s, onboardingDone: false }));
  }, []);

  const setLang = useCallback((lang) => {
    const nextLang = lang === 'pt' ? 'pt' : 'en';
    const snapshot = stateRef.current;
    const requestedLang = desiredLanguageRef.current || (snapshot && snapshot.lang);
    if (requestedLang === nextLang) return;
    desiredLanguageRef.current = nextLang;
    const languageEpoch = translationLanguageEpochRef.current + 1;
    translationLanguageEpochRef.current = languageEpoch;
    const generationEpoch = generationEpochRef.current;
    setState((s) => ({
      ...s,
      lang: nextLang,
      manifestations: s.manifestations.map((item) =>
        localizeManifestation(item, s.profile, nextLang)
      ),
    }));

    if (
      !snapshot ||
      isKnownMinor(snapshot.profile) ||
      snapshot.profile.cloudPersonalization !== true ||
      !hasCurrentAdultCloudConsent(snapshot.profile)
    ) {
      return;
    }

    const localizedItems = snapshot.manifestations.map((item) =>
      localizeManifestation(item, snapshot.profile, nextLang)
    );
    const pending = localizedItems.filter((item) =>
      shouldTranslateManifestationVariant(item, nextLang)
    );
    const translateBatch = (offset) => {
      if (
        !mountedRef.current ||
        generationEpoch !== generationEpochRef.current ||
        languageEpoch !== translationLanguageEpochRef.current
      ) return;
      const latest = stateRef.current;
      if (
        !latest ||
        latest.lang !== nextLang ||
        isKnownMinor(latest.profile) ||
        latest.profile.cloudPersonalization !== true ||
        !hasCurrentAdultCloudConsent(latest.profile)
      ) {
        return;
      }
      pending.slice(offset, offset + TRANSLATION_BATCH_SIZE).forEach((queuedItem) => {
        const current = latest.manifestations.find((item) => item.id === queuedItem.id);
        if (!current) return;
        const item = localizeManifestation(current, latest.profile, nextLang);
        if (!shouldTranslateManifestationVariant(item, nextLang)) return;
        void translateAndStoreVariant({
          id: item.id,
          sourceLang: item.originLang,
          targetLang: nextLang,
          sourceVariant: item.contentByLang[item.originLang],
          expectedTargetVariant: item.contentByLang[nextLang],
          profile: latest.profile,
          generationEpoch,
        });
      });
      const nextOffset = offset + TRANSLATION_BATCH_SIZE;
      if (nextOffset < pending.length) {
        setTimeout(() => translateBatch(nextOffset), TRANSLATION_BATCH_DELAY_MS);
      }
    };
    setTimeout(() => translateBatch(0), TRANSLATION_START_DELAY_MS);
  }, [translateAndStoreVariant]);

  const derived = useMemo(() => {
    if (!state) {
      return { allSessionDates: [], streak: 0, totalSessions: 0, completed: 0 };
    }
    const allSessionDates = state.manifestations.flatMap((m) => m.sessions);
    const visionDates = state.visionPlays.map((play) => play && play.date).filter(Boolean);
    const unique = Array.from(new Set([...allSessionDates, ...visionDates, ...state.affirmationDates]));
    return {
      allSessionDates,
      uniqueDays: unique,
      streak: streakFrom(unique),
      totalSessions: allSessionDates.length + state.visionPlays.length,
      completed: state.manifestations.filter((m) => m.sessions.length >= m.goalDays).length,
    };
  }, [state]);

  const value = useMemo(
    () => ({
      state,
      loading,
      storageError,
      storageMutation,
      storageLoadError,
      storageCorrupt,
      personalVisualStatus,
      retryLoad,
      repairCorruptedStorage,
      retryPersist,
      derived,
      addManifestation,
      ensurePersonalVisual,
      ensureJourneyVisual,
      ensureDreamVisual,
      updateManifestation,
      updateJourneyVisionStory,
      addEvidence,
      updateEvidence,
      removeEvidence,
      togglePractice,
      logSession,
      undoSession,
      toggleBridgeCompletion,
      evolveManifestation,
      removeManifestation,
      toggleFavoriteAffirmation,
      markAffirmationRead,
      toggleSavedVision,
      logVisionPlay,
      setName,
      setMood,
      setNarrator,
      saveDailyRitualPreferences,
      savePracticePlan,
      completePracticePlanSlot,
      saveMorningRitualPreferences,
      saveDreamRitual,
      markDreamRitualPracticed,
      setDreamLivingMirrorConsent,
      removeDreamRitual,
      resetAll,
      exportStateJson,
      importStateJson,
      saveProfile,
      completeOnboarding,
      resetOnboarding,
      setLang,
    }),
    [
      state,
      loading,
      storageError,
      storageMutation,
      storageLoadError,
      storageCorrupt,
      personalVisualStatus,
      retryLoad,
      repairCorruptedStorage,
      retryPersist,
      derived,
      addManifestation,
      ensurePersonalVisual,
      ensureJourneyVisual,
      ensureDreamVisual,
      updateManifestation,
      updateJourneyVisionStory,
      addEvidence,
      updateEvidence,
      removeEvidence,
      togglePractice,
      logSession,
      undoSession,
      toggleBridgeCompletion,
      evolveManifestation,
      removeManifestation,
      toggleFavoriteAffirmation,
      markAffirmationRead,
      toggleSavedVision,
      logVisionPlay,
      setName,
      setMood,
      setNarrator,
      saveDailyRitualPreferences,
      savePracticePlan,
      completePracticePlanSlot,
      saveMorningRitualPreferences,
      saveDreamRitual,
      markDreamRitualPracticed,
      setDreamLivingMirrorConsent,
      removeDreamRitual,
      resetAll,
      exportStateJson,
      importStateJson,
      saveProfile,
      completeOnboarding,
      resetOnboarding,
      setLang,
    ]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
