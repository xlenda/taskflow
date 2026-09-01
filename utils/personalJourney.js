const {
  JOURNEY_CATEGORIES,
  JOURNEY_SUITE_VERSION,
  createPersonalContentSuite,
} = require('./personalContentSuite');

const JOURNEY_KINDS = Object.freeze(['vision', 'affirmation']);
const CATEGORY_ACCENTS = Object.freeze({
  Love: 0,
  Wealth: 1,
  Career: 2,
  Health: 3,
  Confidence: 4,
  Peace: 5,
});

const clean = (value, max) =>
  typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';

const sourceObject = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const itemKey = (kind, category) => `${kind}:${category}`;

function normalizeItems(value, fallbackItems, kind) {
  const source = Array.isArray(value) ? value : [];
  const byCategory = new Map(
    source
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map((item) => [item.category, item])
  );

  return JOURNEY_CATEGORIES.map((category, index) => {
    const fallback = fallbackItems[index];
    const raw = byCategory.get(category) || {};
    if (kind === 'vision') {
      return {
        key: itemKey(kind, category),
        category,
        title: clean(raw.title, 120) || fallback.title,
        story: clean(raw.story, 1200) || fallback.story,
        visualBrief: clean(raw.visualBrief, 420) || fallback.visualBrief,
      };
    }
    return {
      key: itemKey(kind, category),
      category,
      text: clean(raw.text, 500) || fallback.text,
      visualBrief: clean(raw.visualBrief, 420) || fallback.visualBrief,
    };
  });
}

function normalizePersonalJourneySuite(value, fallback) {
  const safeFallback = sourceObject(fallback);
  const source = sourceObject(value);
  return {
    version: JOURNEY_SUITE_VERSION,
    source: source.source === 'remote' ? 'remote' : 'local',
    visions: normalizeItems(source.visions, safeFallback.visions || [], 'vision'),
    affirmations: normalizeItems(
      source.affirmations,
      safeFallback.affirmations || [],
      'affirmation'
    ),
  };
}

function buildPersonalJourneySuites({ desire, profile, stored, originLang } = {}) {
  const source = sourceObject(stored);
  const sourceLang = source.originLang === 'en' || source.originLang === 'pt'
    ? source.originLang
    : originLang === 'en'
    ? 'en'
    : 'pt';
  const fallbackFor = (lang) => createPersonalContentSuite({
    desire: lang === sourceLang ? desire : '',
    profile: lang === sourceLang ? profile : {},
    lang,
  });
  const ptFallback = fallbackFor('pt');
  const enFallback = fallbackFor('en');
  const preserved = (value) => {
    const candidate = sourceObject(value);
    return candidate.source === 'remote' ? candidate : null;
  };
  return {
    originLang: sourceLang,
    // Local suites are deterministic fallbacks and are rebuilt when their
    // contract changes. Remote suites are paid personal content and must never
    // be discarded while repairing the alternate-language fallback.
    pt: normalizePersonalJourneySuite(preserved(source.pt), ptFallback),
    en: normalizePersonalJourneySuite(preserved(source.en), enFallback),
  };
}

function journeyVisualStatusKey(manifestationId, journeyKey) {
  return `journey:${clean(manifestationId, 120)}:${clean(journeyKey, 80)}`;
}

function anchorManifestationForState(state) {
  const manifestations = Array.isArray(state && state.manifestations)
    ? state.manifestations
    : [];
  return (
    manifestations.find((item) => item && item.id === state.anchorSceneId) ||
    manifestations.find((item) => item && item.origin === 'onboarding-anchor') ||
    manifestations[manifestations.length - 1] ||
    null
  );
}

function personalJourneyItemsForState(state, kind, requestedLang) {
  if (!JOURNEY_KINDS.includes(kind)) return [];
  const anchor = anchorManifestationForState(state);
  if (!anchor) return [];
  const lang = requestedLang === 'en' || requestedLang === 'pt'
    ? requestedLang
    : state && state.lang === 'en'
    ? 'en'
    : 'pt';
  const suites = sourceObject(anchor.journeySuiteByLang);
  const suite = sourceObject(suites[lang]);
  const source = kind === 'vision' ? suite.visions : suite.affirmations;
  const visuals = sourceObject(anchor.journeyVisuals);
  const storyEdits = sourceObject(sourceObject(anchor.journeyStoryEditsByLang)[lang]);

  return (Array.isArray(source) ? source : []).map((entry) => {
    const key = itemKey(kind, entry.category);
    return {
      ...entry,
      ...(kind === 'vision' && clean(storyEdits[key], 1200)
        ? { story: clean(storyEdits[key], 1200), userEdited: true }
        : {}),
      key,
      id: `${anchor.id}:${key}`,
      manifestationId: anchor.id,
      sourceTitle: anchor.title,
      lang,
      speechLang: lang,
      accent: CATEGORY_ACCENTS[entry.category] ?? 0,
      visualKey: visuals[key] && visuals[key].cacheKey,
      secondaryVisualKey:
        kind === 'vision' && visuals[`${key}:secondary`]
          ? visuals[`${key}:secondary`].cacheKey
          : undefined,
      visualStatusKey: journeyVisualStatusKey(anchor.id, key),
      secondaryVisualStatusKey:
        kind === 'vision'
          ? journeyVisualStatusKey(anchor.id, `${key}:secondary`)
          : undefined,
      personalized: true,
      source: kind,
    };
  });
}

function validPersonalJourneyIds(state, kind) {
  return new Set(personalJourneyItemsForState(state, kind).map((item) => item.id));
}

module.exports = {
  JOURNEY_CATEGORIES,
  JOURNEY_SUITE_VERSION,
  anchorManifestationForState,
  buildPersonalJourneySuites,
  journeyVisualStatusKey,
  normalizePersonalJourneySuite,
  personalJourneyItemsForState,
  validPersonalJourneyIds,
};
