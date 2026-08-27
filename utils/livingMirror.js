import { summarizeChronologyMemory } from './celesteChronology';

const DREAM_THEMES = new Set(['clarity', 'courage', 'peace', 'connection', 'abundance', 'renewal']);
const DREAM_FEELINGS = new Set(['calm', 'joyful', 'curious', 'anxious', 'confused', 'powerful']);
const MAX_BRIDGE_COMPLETIONS = 90;
const MAX_CHAPTERS = 12;
const KNOWLEDGE_CARD_ID = /^[a-z0-9][a-z0-9_-]{1,79}$/;

const cleanText = (value, max) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

const validDay = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const validTimestamp = (value) =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value));

const boundedInt = (value, fallback, min, max) =>
  Number.isInteger(value) && value >= min && value <= max ? value : fallback;

const cleanKnowledgeIds = (value) =>
  (Array.isArray(value) ? value : [])
    .map((id) => typeof id === 'string'
      ? id
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .trim()
          .toLowerCase()
      : '')
    .filter((id) => id.length <= 80 && KNOWLEDGE_CARD_ID.test(id))
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .slice(0, 8);

const normalizeGeneration = (value, fallback = {
  source: 'legacy',
  promptVersion: 'legacy-unknown',
}) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const out = {
    source: cleanText(source.source, 40) || fallback.source,
    promptVersion: cleanText(source.promptVersion, 80) || fallback.promptVersion,
  };
  const model = cleanText(source.model, 100);
  const knowledgeVersion = cleanText(source.knowledgeVersion, 80);
  const brainVersion = cleanText(source.brainVersion, 80);
  const providerCandidate = cleanText(source.provider, 20).toLowerCase();
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

function generationCandidatesFromManifestation(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const variants = source.contentByLang && typeof source.contentByLang === 'object' && !Array.isArray(source.contentByLang)
    ? source.contentByLang
    : {};
  const order = [source.lang, source.originLang, 'pt', 'en']
    .filter((lang, index, values) =>
      (lang === 'pt' || lang === 'en') && values.indexOf(lang) === index
    );
  return [
    source.generation,
    ...order.map((lang) => variants[lang] && variants[lang].generation),
  ];
}

function generationWithInheritedReceipt(generation, candidates) {
  const out = normalizeGeneration(generation);
  if (out.knowledgeCardIds && out.knowledgeCardIds.length) return out;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
      ? candidate
      : {};
    const knowledgeCardIds = cleanKnowledgeIds(source.knowledgeCardIds);
    if (!knowledgeCardIds.length) continue;
    out.knowledgeCardIds = knowledgeCardIds;
    const knowledgeVersion = cleanText(source.knowledgeVersion, 80);
    const brainVersion = cleanText(source.brainVersion, 80);
    if (knowledgeVersion && !out.knowledgeVersion) out.knowledgeVersion = knowledgeVersion;
    if (brainVersion && !out.brainVersion) out.brainVersion = brainVersion;
    break;
  }
  return out;
}

export function emptyLivingMirror() {
  return {
    version: 1,
    chapter: 1,
    lastEvolvedOn: null,
    lastMemorySignature: '',
    bridgeCompletions: [],
    chapters: [],
  };
}

export function normalizeLivingMirror(value) {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const bridgeCompletions = (Array.isArray(raw.bridgeCompletions) ? raw.bridgeCompletions : [])
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry, index) => ({
      id: cleanText(entry.id, 160) || `bridge-legacy-${index}`,
      date: validDay(entry.date) ? entry.date : null,
      step: cleanText(entry.step, 280),
      chapter: boundedInt(entry.chapter, 1, 1, 365),
      completedAt: validTimestamp(entry.completedAt) ? entry.completedAt : null,
    }))
    .filter((entry) => entry.date && entry.step && entry.completedAt)
    .filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.chapter === entry.chapter && candidate.date === entry.date) ===
        index
    )
    .slice(0, MAX_BRIDGE_COMPLETIONS);

  const chapters = (Array.isArray(raw.chapters) ? raw.chapters : [])
    .filter((entry) => entry && typeof entry === 'object' && !Array.isArray(entry))
    .map((entry) => ({
      chapter: boundedInt(entry.chapter, 1, 1, 365),
      lang: entry.lang === 'en' ? 'en' : 'pt',
      title: cleanText(entry.title, 160),
      intention: cleanText(entry.intention, 600),
      affirmation: cleanText(entry.affirmation, 1200),
      story: cleanText(entry.story, 5000),
      anchorIdentity: cleanText(entry.anchorIdentity, 600),
      anchorStep: cleanText(entry.anchorStep, 280),
      personalizedWith: (Array.isArray(entry.personalizedWith) ? entry.personalizedWith : [])
        .map((label) => cleanText(label, 80))
        .filter(Boolean)
        .slice(0, 16),
      memoryReceipt: (Array.isArray(entry.memoryReceipt) ? entry.memoryReceipt : [])
        .map((label) => cleanText(label, 40))
        .filter(Boolean)
        .slice(0, 8),
      generation: normalizeGeneration(entry.generation),
      createdAt: validTimestamp(entry.createdAt) ? entry.createdAt : new Date(0).toISOString(),
    }))
    .filter((entry) => entry.title && entry.affirmation && entry.story)
    .sort((a, b) => b.chapter - a.chapter)
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.chapter === entry.chapter) === index)
    .slice(0, MAX_CHAPTERS);

  return {
    version: 1,
    chapter: boundedInt(raw.chapter, 1, 1, 365),
    lastEvolvedOn: validDay(raw.lastEvolvedOn) ? raw.lastEvolvedOn : null,
    lastMemorySignature: cleanText(raw.lastMemorySignature, 1000),
    bridgeCompletions,
    chapters,
  };
}

export function bridgeDoneOn(manifestation, day) {
  const mirror = normalizeLivingMirror(manifestation && manifestation.livingMirror);
  return mirror.bridgeCompletions.some(
    (entry) => entry.date === day && entry.chapter === mirror.chapter
  );
}

function optedInDreams(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && entry.useInLivingMirror === true)
    .filter((entry) => DREAM_THEMES.has(entry.theme) && DREAM_FEELINGS.has(entry.feeling))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

export function livingMirrorMemory(manifestation, dreamEntries) {
  const source = manifestation && typeof manifestation === 'object' ? manifestation : {};
  const mirror = normalizeLivingMirror(source.livingMirror);
  const dreams = optedInDreams(dreamEntries);
  const latestDream = dreams[0] || null;
  const sessions = (Array.isArray(source.sessions) ? source.sessions : []).filter(validDay).sort();
  return {
    practiceDays: Math.min(sessions.length, 3650),
    evidenceCount: Math.min(Array.isArray(source.evidence) ? source.evidence.length : 0, 500),
    stepCompletions: Math.min(mirror.bridgeCompletions.length, MAX_BRIDGE_COMPLETIONS),
    dreamCount: Math.min(dreams.length, 90),
    latestDreamTheme: latestDream ? latestDream.theme : '',
    latestDreamFeeling: latestDream ? latestDream.feeling : '',
    lastPracticeDay: sessions.length ? sessions[sessions.length - 1] : '',
    previousStepCompleted: mirror.bridgeCompletions.some(
      (entry) => entry.chapter === mirror.chapter
    ),
  };
}

export function livingMirrorMemorySignature(memory) {
  const source = memory && typeof memory === 'object' ? memory : {};
  return JSON.stringify({
    practiceDays: source.practiceDays || 0,
    evidenceCount: source.evidenceCount || 0,
    stepCompletions: source.stepCompletions || 0,
    dreamCount: source.dreamCount || 0,
    latestDreamTheme: source.latestDreamTheme || '',
    latestDreamFeeling: source.latestDreamFeeling || '',
    lastPracticeDay: source.lastPracticeDay || '',
  });
}

export function livingMirrorStatus(manifestation, dreamEntries, day) {
  const mirror = normalizeLivingMirror(manifestation && manifestation.livingMirror);
  const memory = livingMirrorMemory(manifestation, dreamEntries);
  const signature = livingMirrorMemorySignature(memory);
  const hasProgress =
    memory.practiceDays + memory.evidenceCount + memory.stepCompletions + memory.dreamCount > 0;
  return {
    chapter: mirror.chapter,
    memory,
    memorySignature: signature,
    evolvedToday: mirror.lastEvolvedOn === day,
    hasNewMemory: hasProgress && mirror.lastMemorySignature !== signature,
    canEvolve:
      mirror.chapter < 365 &&
      mirror.lastEvolvedOn !== day &&
      hasProgress &&
      mirror.lastMemorySignature !== signature,
  };
}

export function buildEvolutionContinuity(manifestation, dreamEntries) {
  return summarizeChronologyMemory({ manifestation, dreamEntries });
}

export function snapshotLivingMirrorChapter(manifestation, memoryReceipt, createdAt) {
  const source = manifestation && typeof manifestation === 'object' ? manifestation : {};
  const mirror = normalizeLivingMirror(source.livingMirror);
  return {
    chapter: mirror.chapter,
    lang: source.lang === 'en' ? 'en' : 'pt',
    title: cleanText(source.title, 160),
    intention: cleanText(source.intention, 600),
    affirmation: cleanText(source.affirmation, 1200),
    story: cleanText(source.story, 5000),
    anchorIdentity: cleanText(source.anchorIdentity, 600),
    anchorStep: cleanText(source.anchorStep, 280),
    personalizedWith: (Array.isArray(source.personalizedWith) ? source.personalizedWith : [])
      .map((label) => cleanText(label, 80))
      .filter(Boolean)
      .slice(0, 16),
    memoryReceipt: (Array.isArray(memoryReceipt) ? memoryReceipt : []).slice(0, 8),
    generation: generationWithInheritedReceipt(
      source.generation,
      generationCandidatesFromManifestation(source)
    ),
    createdAt: validTimestamp(createdAt) ? createdAt : new Date().toISOString(),
  };
}

export function livingMirrorReceipt(memory) {
  const source = memory && typeof memory === 'object' ? memory : {};
  const receipt = ['desire'];
  if (source.practiceDays > 0) receipt.push('practice_days');
  if (source.stepCompletions > 0) receipt.push('completed_steps');
  if (source.evidenceCount > 0) receipt.push('private_trace_count');
  if (source.dreamCount > 0) receipt.push('consented_dream_theme');
  return receipt;
}
