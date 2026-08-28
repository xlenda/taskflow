import { dreamToAffirmation } from './dreamToAffirmation';

const LANGS = ['pt', 'en'];
const TEXT_LIMITS = {
  title: 160,
  intention: 600,
  affirmation: 1200,
  story: 12000,
  anchorIdentity: 600,
  anchorStep: 280,
};

const cleanText = (value, max) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .trim()
        .slice(0, max)
    : '';

const cleanScalar = (value, max) => cleanText(value, max).replace(/\s+/g, ' ');

const cleanKnowledgeIds = (value) =>
  (Array.isArray(value) ? value : [])
    .map((id) => cleanScalar(id, 80).toLowerCase())
    .filter((id) => /^[a-z0-9][a-z0-9_-]{1,79}$/.test(id))
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .slice(0, 8);

const normalizeGeneration = (value, fallback) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {
    source: cleanScalar(source.source, 40) || fallback.source,
    promptVersion: cleanScalar(source.promptVersion, 80) || fallback.promptVersion,
  };
  const model = cleanScalar(source.model, 100);
  const knowledgeVersion = cleanScalar(source.knowledgeVersion, 80);
  const brainVersion = cleanScalar(source.brainVersion, 80);
  const providerCandidate = cleanScalar(source.provider, 20).toLowerCase();
  const provider = ['anthropic', 'openai', 'gemini'].includes(providerCandidate)
    ? providerCandidate
    : '';
  const knowledgeCardIds = cleanKnowledgeIds(source.knowledgeCardIds);
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

function inheritKnowledgeReceipt(generation, candidates, fallback) {
  const out = normalizeGeneration(generation, fallback);
  if (out.knowledgeCardIds && out.knowledgeCardIds.length) return out;

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? candidate
      : {};
    const knowledgeCardIds = cleanKnowledgeIds(source.knowledgeCardIds);
    if (!knowledgeCardIds.length) continue;
    out.knowledgeCardIds = knowledgeCardIds;
    const knowledgeVersion = cleanScalar(source.knowledgeVersion, 80);
    const brainVersion = cleanScalar(source.brainVersion, 80);
    if (knowledgeVersion && !out.knowledgeVersion) out.knowledgeVersion = knowledgeVersion;
    if (brainVersion && !out.brainVersion) out.brainVersion = brainVersion;
    break;
  }
  return out;
}

function manifestationGenerationCandidates(source) {
  const item = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
  const variants = item.contentByLang && typeof item.contentByLang === 'object' && !Array.isArray(item.contentByLang)
    ? item.contentByLang
    : {};
  const order = [item.lang, item.originLang, 'pt', 'en']
    .filter((lang, index, values) =>
      (lang === 'pt' || lang === 'en') && values.indexOf(lang) === index
    );
  return [
    item.generation,
    ...order.map((lang) => variants[lang] && variants[lang].generation),
  ];
}

const cleanLabels = (value) =>
  (Array.isArray(value) ? value : [])
    .filter((label) => typeof label === 'string' && label.trim())
    .map((label) => label.trim().slice(0, 80))
    .slice(0, 16);

export function snapshotManifestationContent(item) {
  const source = item && typeof item === 'object' ? item : {};
  const out = {};
  Object.entries(TEXT_LIMITS).forEach(([field, max]) => {
    const value = cleanText(source[field], max);
    if (value) out[field] = value;
  });
  out.personalizedWith = cleanLabels(source.personalizedWith);
  const fallback = { source: 'local', promptVersion: 'local-v1' };
  out.generation = inheritKnowledgeReceipt(
    source.generation,
    manifestationGenerationCandidates(source),
    fallback
  );
  return out;
}

function manifestationContentFingerprint(value) {
  const variant = snapshotManifestationContent(value);
  return JSON.stringify({
    title: variant.title || '',
    intention: variant.intention || '',
    affirmation: variant.affirmation || '',
    story: variant.story || '',
    anchorIdentity: variant.anchorIdentity || '',
    anchorStep: variant.anchorStep || '',
    personalizedWith: variant.personalizedWith || [],
  });
}

function cleanVariant(value, fallback) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {};
  Object.entries(TEXT_LIMITS).forEach(([field, max]) => {
    const text = cleanText(source[field], max);
    if (text) out[field] = text;
  });
  if (Object.prototype.hasOwnProperty.call(source, 'personalizedWith')) {
    out.personalizedWith = cleanLabels(source.personalizedWith);
  }
  if (source.generation && typeof source.generation === 'object') {
    out.generation = normalizeGeneration(source.generation, fallback);
  }
  return out;
}

function hasStoredVariantContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.keys(TEXT_LIMITS).some((field) => cleanText(value[field], TEXT_LIMITS[field]))) {
    return true;
  }
  return cleanLabels(value.personalizedWith).length > 0;
}

function mergeVariant(base, overlay, fallback) {
  const safeBase = cleanVariant(base, fallback);
  const safeOverlay = cleanVariant(overlay, fallback);
  const out = { ...safeBase };
  Object.keys(TEXT_LIMITS).forEach((field) => {
    if (safeOverlay[field]) out[field] = safeOverlay[field];
  });
  if (Array.isArray(safeOverlay.personalizedWith)) {
    out.personalizedWith = safeOverlay.personalizedWith;
  }
  if (safeOverlay.generation) out.generation = safeOverlay.generation;
  return out;
}

export function manifestationVariantFromScene({ title, scene, generation }) {
  return cleanVariant(
    {
      ...(scene && typeof scene === 'object' ? scene : {}),
      title,
      generation,
    },
    { source: 'gemini-translation', promptVersion: 'celeste-translation-v1' }
  );
}

export function applyTranslatedManifestationVariant(item, {
  sourceLang,
  targetLang,
  sourceVariant,
  expectedTargetVariant,
  translatedVariant,
}) {
  if (!item || typeof item !== 'object') return item;
  const stored = item.contentByLang && typeof item.contentByLang === 'object'
    ? item.contentByLang
    : {};
  const currentSource = item.lang === sourceLang
    ? snapshotManifestationContent(item)
    : stored[sourceLang];
  const currentTarget = item.lang === targetLang
    ? snapshotManifestationContent(item)
    : stored[targetLang];

  if (
    manifestationContentFingerprint(currentSource) !== manifestationContentFingerprint(sourceVariant) ||
    manifestationContentFingerprint(currentTarget) !== manifestationContentFingerprint(expectedTargetVariant)
  ) {
    return item;
  }

  const safeTranslatedVariant = cleanVariant(translatedVariant, {
    source: 'gemini-translation',
    promptVersion: 'celeste-translation-v1',
  });
  safeTranslatedVariant.generation = inheritKnowledgeReceipt(
    safeTranslatedVariant.generation,
    [sourceVariant && sourceVariant.generation],
    { source: 'gemini-translation', promptVersion: 'celeste-translation-v1' }
  );
  const contentByLang = { ...stored, [targetLang]: safeTranslatedVariant };
  return item.lang === targetLang
    ? { ...item, ...safeTranslatedVariant, contentByLang }
    : { ...item, contentByLang };
}

export function shouldTranslateManifestationVariant(item, targetLang) {
  if (!item || typeof item !== 'object') return false;
  const target = targetLang === 'en' ? 'en' : 'pt';
  if (item.originLang === target) return false;
  const source = item.contentByLang &&
    item.contentByLang[target] &&
    item.contentByLang[target].generation &&
    item.contentByLang[target].generation.source;
  return source === 'local-language-fallback';
}

function generatedVariant(item, profile, lang, sourceLang) {
  const category = item.category || 'Wealth';
  const title = cleanText(item.title, TEXT_LIMITS.title) || (lang === 'pt' ? 'Minha manifestacao' : 'My manifestation');
  const isAlternatePersonalLanguage = lang !== sourceLang;
  // Free-form answers cannot be translated reliably on-device. The alternate
  // local fallback therefore uses language-native neutral copy instead of
  // splicing Portuguese answers into English (or the reverse). With adult
  // cloud consent, AppContext replaces this fallback with a Gemini variant.
  const generationTitle = isAlternatePersonalLanguage
    ? lang === 'pt'
      ? 'minha intencao pessoal'
      : 'my personal intention'
    : title;
  const generationProfile = isAlternatePersonalLanguage ? {} : profile || {};
  const local = dreamToAffirmation(generationTitle, generationProfile, lang, category);
  const localSource = isAlternatePersonalLanguage ? 'local-language-fallback' : 'local';
  const localPromptVersion = isAlternatePersonalLanguage
    ? 'local-language-v1'
    : 'local-interpreted-v2';
  return cleanVariant(
    {
      title,
      intention: local.intention,
      affirmation: local.affirmation,
      story: local.story,
      anchorIdentity: local.anchorIdentity,
      anchorStep: local.anchorStep,
      personalizedWith: isAlternatePersonalLanguage ? [] : local.usouDoPerfil,
      generation: {
        source: localSource,
        promptVersion: localPromptVersion,
      },
    },
    {
      source: localSource,
      promptVersion: localPromptVersion,
    }
  );
}

function isLegacyRawSelfCopy(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text = [
    source.intention,
    source.affirmation,
    source.story,
    source.anchorIdentity,
    source.anchorStep,
  ].filter((entry) => typeof entry === 'string').join(' ');
  return /(?:honro o que sei sobre mim|honor what i know about myself)\s*:/i.test(text);
}

function isLegacyLocalVariant(value) {
  const generation = value && value.generation && typeof value.generation === 'object'
    ? value.generation
    : {};
  return generation.source === 'local' &&
    generation.promptVersion === 'local-v1' &&
    isLegacyRawSelfCopy(value);
}

export function repairLegacyLocalManifestation(item, profile) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  const itemLang = item.lang === 'en' ? 'en' : 'pt';
  const stored = item.contentByLang && typeof item.contentByLang === 'object' && !Array.isArray(item.contentByLang)
    ? item.contentByLang
    : {};
  const contentByLang = { ...stored };
  let output = item;
  let repaired = false;

  LANGS.forEach((lang) => {
    if (!isLegacyLocalVariant(stored[lang])) return;
    contentByLang[lang] = generatedVariant(
      { ...item, title: cleanText(stored[lang].title, TEXT_LIMITS.title) || item.title },
      profile,
      lang,
      lang
    );
    repaired = true;
  });

  if (isLegacyLocalVariant(item)) {
    const visible = generatedVariant(item, profile, itemLang, itemLang);
    output = { ...item, ...visible };
    contentByLang[itemLang] = visible;
    repaired = true;
  }

  return repaired ? { ...output, contentByLang } : item;
}

export function localInterpretedUpgradeCandidate(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const stored = item.contentByLang && typeof item.contentByLang === 'object' && !Array.isArray(item.contentByLang)
    ? item.contentByLang
    : {};
  const itemLang = item.lang === 'en' ? 'en' : 'pt';
  const order = [item.originLang, itemLang, 'pt', 'en']
    .filter((lang, index, values) => LANGS.includes(lang) && values.indexOf(lang) === index);

  for (const lang of order) {
    const variants = [
      ...(lang === itemLang ? [item] : []),
      stored[lang],
    ].filter(Boolean);
    const eligible = variants.some((variant) => {
      const generation = variant.generation && typeof variant.generation === 'object'
        ? variant.generation
        : {};
      return generation.source === 'local' &&
        generation.promptVersion === 'local-interpreted-v2';
    });
    if (eligible) return { id: cleanScalar(item.id, 120), lang };
  }
  return null;
}

export function localizeManifestation(item, profile, activeLang) {
  if (!item || typeof item !== 'object') return item;
  const targetLang = activeLang === 'en' ? 'en' : 'pt';
  const sourceLang = item.lang === 'en' ? 'en' : 'pt';
  const fallback = {
    source: 'local',
    promptVersion: 'local-v1',
  };
  const stored = item.contentByLang && typeof item.contentByLang === 'object' ? item.contentByLang : {};
  const variants = {};

  LANGS.forEach((lang) => {
    const generated = generatedVariant(item, profile, lang, sourceLang);
    const storedVariant = stored[lang];
    variants[lang] = mergeVariant(generated, storedVariant, fallback);
    if (
      hasStoredVariantContent(storedVariant) &&
      !(storedVariant.generation && typeof storedVariant.generation === 'object')
    ) {
      variants[lang].generation = {
        source: 'user-edited',
        promptVersion: 'legacy-user-edit-v1',
      };
    }
  });

  // The top-level fields are authoritative for the language currently shown.
  // This preserves edits made before a language switch or an app restart.
  const current = cleanVariant(snapshotManifestationContent(item), fallback);
  variants[sourceLang] = mergeVariant(variants[sourceLang], current, fallback);

  const receiptCandidates = [
    ...manifestationGenerationCandidates(item),
    variants[sourceLang] && variants[sourceLang].generation,
    variants.pt && variants.pt.generation,
    variants.en && variants.en.generation,
  ];
  LANGS.forEach((lang) => {
    variants[lang].generation = inheritKnowledgeReceipt(
      variants[lang].generation,
      receiptCandidates,
      fallback
    );
  });

  const declaredOrigin = item.originLang === 'en' || item.originLang === 'pt'
    ? item.originLang
    : null;
  const originalCandidates = LANGS.filter((lang) => {
    const source = variants[lang] && variants[lang].generation && variants[lang].generation.source;
    return source === 'celeste-ai' || source === 'gemini' || source === 'local';
  });
  const originLang = declaredOrigin ||
    (originalCandidates.length === 1 ? originalCandidates[0] : sourceLang);

  const target = { ...variants[targetLang] };

  return {
    ...item,
    ...target,
    lang: targetLang,
    originLang,
    contentByLang: variants,
  };
}
