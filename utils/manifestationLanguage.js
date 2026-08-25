import { findForYouById, localized } from '../constants/content';
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

const normalizeGeneration = (value, fallback) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {
    source: cleanScalar(source.source, 40) || fallback.source,
    promptVersion: cleanScalar(source.promptVersion, 80) || fallback.promptVersion,
  };
  const model = cleanScalar(source.model, 100);
  const knowledgeVersion = cleanScalar(source.knowledgeVersion, 80);
  if (model) out.model = model;
  if (knowledgeVersion) out.knowledgeVersion = knowledgeVersion;
  if (Number.isInteger(source.seed)) out.seed = source.seed;
  return out;
};

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
  out.generation = normalizeGeneration(source.generation, {
    source: source.templateId ? 'editorial' : 'local',
    promptVersion: source.templateId ? 'catalog-v1' : 'local-v1',
  });
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

  const contentByLang = { ...stored, [targetLang]: translatedVariant };
  return item.lang === targetLang
    ? { ...item, ...translatedVariant, contentByLang }
    : { ...item, contentByLang };
}

export function shouldTranslateManifestationVariant(item, targetLang) {
  if (!item || typeof item !== 'object' || item.templateId) return false;
  const target = targetLang === 'en' ? 'en' : 'pt';
  if (item.originLang === target) return false;
  const source = item.contentByLang &&
    item.contentByLang[target] &&
    item.contentByLang[target].generation &&
    item.contentByLang[target].generation.source;
  return source === 'local-language-fallback';
}

function generatedVariant(item, profile, lang, template, sourceLang) {
  const category = item.category || 'Wealth';
  const title = cleanText(item.title, TEXT_LIMITS.title) || (lang === 'pt' ? 'Minha manifestacao' : 'My manifestation');
  const isAlternatePersonalLanguage = !template && lang !== sourceLang;
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
  const catalog = template ? localized(template, lang) : null;
  const localSource = isAlternatePersonalLanguage ? 'local-language-fallback' : 'local';
  const localPromptVersion = isAlternatePersonalLanguage ? 'local-language-v1' : 'local-v1';
  return cleanVariant(
    {
      title: catalog ? catalog.title : title,
      intention: catalog ? catalog.intention : local.intention,
      affirmation: catalog ? catalog.affirmation : local.affirmation,
      story: catalog ? catalog.story : local.story,
      anchorIdentity: local.anchorIdentity,
      anchorStep: local.anchorStep,
      personalizedWith: catalog || isAlternatePersonalLanguage ? [] : local.usouDoPerfil,
      generation: {
        source: catalog ? 'editorial' : localSource,
        promptVersion: catalog ? 'catalog-v1' : localPromptVersion,
      },
    },
    {
      source: catalog ? 'editorial' : localSource,
      promptVersion: catalog ? 'catalog-v1' : localPromptVersion,
    }
  );
}

export function localizeManifestation(item, profile, activeLang) {
  if (!item || typeof item !== 'object') return item;
  const targetLang = activeLang === 'en' ? 'en' : 'pt';
  const sourceLang = item.lang === 'en' ? 'en' : 'pt';
  const template = item.templateId ? findForYouById(item.templateId) : null;
  const fallback = {
    source: template ? 'editorial' : 'local',
    promptVersion: template ? 'catalog-v1' : 'local-v1',
  };
  const stored = item.contentByLang && typeof item.contentByLang === 'object' ? item.contentByLang : {};
  const variants = {};

  LANGS.forEach((lang) => {
    const generated = generatedVariant(item, profile, lang, template, sourceLang);
    const storedVariant = stored[lang];
    variants[lang] = mergeVariant(generated, storedVariant, fallback);
    if (
      !template &&
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

  const declaredOrigin = item.originLang === 'en' || item.originLang === 'pt'
    ? item.originLang
    : null;
  const originalCandidates = LANGS.filter((lang) => {
    const source = variants[lang] && variants[lang].generation && variants[lang].generation.source;
    return source === 'gemini' || source === 'local';
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
