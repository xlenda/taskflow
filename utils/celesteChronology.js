const DREAM_THEMES = new Set([
  'clarity',
  'courage',
  'peace',
  'connection',
  'abundance',
  'renewal',
]);
const DREAM_FEELINGS = new Set([
  'calm',
  'joyful',
  'curious',
  'anxious',
  'confused',
  'powerful',
]);
const MEMORY_RECEIPTS = new Set([
  'desire',
  'practice_days',
  'completed_steps',
  'private_trace_count',
  'consented_dream_theme',
]);
const CATEGORIES = new Set(['Love', 'Wealth', 'Career', 'Health', 'Confidence', 'Peace']);
const KNOWLEDGE_CARD_ID = /^[a-z0-9][a-z0-9_-]{1,79}$/;

export const CELESTE_CHRONOLOGY_LIMITS = Object.freeze({
  maxEvents: 64,
  maxEventsBytes: 24 * 1024,
  maxPracticeEvents: 30,
  maxBridgeEvents: 12,
  maxChapterEvents: 8,
  maxDreamEvents: 8,
  maxRecentChapters: 3,
  maxRecentDreamSignals: 3,
  maxMemoryBytes: 12 * 1024,
  maxStoredDreamSignals: 90,
  maxKnowledgePacks: 3,
  maxKnowledgeCardIdsPerPack: 8,
  maxPreviousKnowledgeCardIds: 24,
});

const isRecord = (value) =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const cleanText = (value, max) =>
  typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

const boundedInt = (value, fallback, min, max) =>
  Number.isInteger(value) && value >= min && value <= max ? value : fallback;

const validDay = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : '';
};

const validTimestamp = (value) => {
  if (typeof value !== 'string' || !value.trim()) return '';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString();
};

const occurredAt = (timestamp, day) => {
  const exact = validTimestamp(timestamp);
  if (exact) return exact;
  const calendarDay = validDay(day);
  return calendarDay ? `${calendarDay}T00:00:00.000Z` : '';
};

const dayFrom = (timestamp, day) => validDay(day) || validTimestamp(timestamp).slice(0, 10);

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

function normalizedKnowledgeCardIds(value, max = CELESTE_CHRONOLOGY_LIMITS.maxKnowledgeCardIdsPerPack) {
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

function normalizedGenerationReceipt(value) {
  const generation = isRecord(value) ? value : {};
  const knowledgeCardIds = normalizedKnowledgeCardIds(generation.knowledgeCardIds);
  return knowledgeCardIds.length ? { knowledgeCardIds } : null;
}

function sourcesFrom(input) {
  const envelope = isRecord(input) ? input : {};
  const manifestation = isRecord(envelope.manifestation)
    ? envelope.manifestation
    : envelope;
  const explicitMirror = isRecord(envelope.livingMirror) ? envelope.livingMirror : null;
  const mirror = explicitMirror || (isRecord(manifestation.livingMirror) ? manifestation.livingMirror : {});
  return {
    manifestation,
    mirror,
    sessions: Array.isArray(envelope.sessions) ? envelope.sessions : manifestation.sessions,
    chapters: Array.isArray(envelope.chapters) ? envelope.chapters : mirror.chapters,
    dreams: Array.isArray(envelope.dreamEntries)
      ? envelope.dreamEntries
      : Array.isArray(envelope.dreams)
        ? envelope.dreams
        : [],
  };
}

function normalizedSessions(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(validDay).filter(Boolean))].sort();
}

function normalizedBridges(mirror) {
  const seen = new Set();
  return (Array.isArray(mirror.bridgeCompletions) ? mirror.bridgeCompletions : [])
    .filter(isRecord)
    .map((entry) => {
      const day = dayFrom(entry.completedAt, entry.date);
      const at = occurredAt(entry.completedAt, day);
      const chapter = boundedInt(entry.chapter, 1, 1, 365);
      const step = cleanText(entry.step, 280);
      return day && at && step ? { day, at, chapter, step } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.at.localeCompare(a.at) || b.chapter - a.chapter)
    .filter((entry) => {
      const key = `${entry.chapter}:${entry.day}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function normalizedChapters(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .filter(isRecord)
    .map((entry) => {
      const chapter = boundedInt(entry.chapter, 0, 1, 365);
      const at = validTimestamp(entry.createdAt);
      if (!chapter || !at) return null;
      const generation = normalizedGenerationReceipt(entry.generation);
      return {
        chapter,
        at,
        lang: entry.lang === 'en' ? 'en' : 'pt',
        title: cleanText(entry.title, 160),
        intention: cleanText(entry.intention, 500),
        affirmation: cleanText(entry.affirmation, 900),
        anchorIdentity: cleanText(entry.anchorIdentity, 500),
        anchorStep: cleanText(entry.anchorStep, 280),
        memoryReceipt: [...new Set(
          (Array.isArray(entry.memoryReceipt) ? entry.memoryReceipt : [])
            .filter((label) => MEMORY_RECEIPTS.has(label))
        )].slice(0, 5),
        ...(generation ? { generation } : {}),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.at.localeCompare(a.at) || b.chapter - a.chapter)
    .filter((entry) => {
      if (seen.has(entry.chapter)) return false;
      seen.add(entry.chapter);
      return true;
    });
}

// Dream payloads are intentionally rebuilt from an allowlist. Raw reports,
// reflections, anchors and generated affirmations cannot enter this result.
function normalizedDreamSignals(values) {
  return (Array.isArray(values) ? values : [])
    .filter((entry) => isRecord(entry) && entry.useInLivingMirror === true)
    .filter((entry) => DREAM_THEMES.has(entry.theme) && DREAM_FEELINGS.has(entry.feeling))
    .map((entry) => {
      const at = validTimestamp(entry.createdAt);
      const lastPracticedAt = validTimestamp(entry.lastPracticedAt);
      return {
        theme: entry.theme,
        feeling: entry.feeling,
        ...(at ? { at } : {}),
        lang: entry.lang === 'en' ? 'en' : 'pt',
        practiceCount: boundedInt(entry.practiceCount, 0, 0, 10000),
        ...(lastPracticedAt ? { lastPracticedAt } : {}),
      };
    })
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
    .slice(0, CELESTE_CHRONOLOGY_LIMITS.maxStoredDreamSignals);
}

const eventOrder = Object.freeze({
  manifestation_started: 0,
  practice_completed: 1,
  dream_signal: 2,
  bridge_completed: 3,
  chapter_checkpoint: 4,
  chapter_evolved: 5,
  manifestation_completed: 6,
});

function compactEvents(events) {
  const output = events
    .sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) ||
      (eventOrder[a.kind] || 0) - (eventOrder[b.kind] || 0) ||
      (a.chapter || 0) - (b.chapter || 0)
    )
    .slice(-CELESTE_CHRONOLOGY_LIMITS.maxEvents);
  while (
    output.length > 1 &&
    serializedBytes(output) > CELESTE_CHRONOLOGY_LIMITS.maxEventsBytes
  ) {
    output.shift();
  }
  return output;
}

export function normalizeChronologyEvents(input = {}) {
  const { manifestation, mirror, sessions, chapters, dreams } = sourcesFrom(input);
  const events = [];
  const startedOn = validDay(manifestation.createdAt) || validTimestamp(manifestation.createdAt).slice(0, 10);
  if (startedOn) {
    events.push({
      kind: 'manifestation_started',
      occurredAt: `${startedOn}T00:00:00.000Z`,
      day: startedOn,
      lang: manifestation.lang === 'en' ? 'en' : 'pt',
      ...(CATEGORIES.has(manifestation.category) ? { category: manifestation.category } : {}),
      ...(cleanText(manifestation.title, 160) ? { title: cleanText(manifestation.title, 160) } : {}),
    });
  }

  normalizedSessions(sessions)
    .slice(-CELESTE_CHRONOLOGY_LIMITS.maxPracticeEvents)
    .forEach((day) => events.push({
      kind: 'practice_completed',
      occurredAt: `${day}T00:00:00.000Z`,
      day,
    }));

  normalizedBridges(mirror)
    .slice(0, CELESTE_CHRONOLOGY_LIMITS.maxBridgeEvents)
    .forEach((entry) => events.push({
      kind: 'bridge_completed',
      occurredAt: entry.at,
      day: entry.day,
      chapter: entry.chapter,
      step: entry.step,
    }));

  normalizedChapters(chapters)
    .slice(0, CELESTE_CHRONOLOGY_LIMITS.maxChapterEvents)
    .forEach((entry) => events.push({
      kind: 'chapter_checkpoint',
      occurredAt: entry.at,
      day: entry.at.slice(0, 10),
      chapter: entry.chapter,
      ...(entry.memoryReceipt.length ? { memoryReceipt: entry.memoryReceipt } : {}),
    }));

  normalizedDreamSignals(dreams)
    .filter((entry) => entry.at)
    .slice(0, CELESTE_CHRONOLOGY_LIMITS.maxDreamEvents)
    .forEach((entry) => events.push({
      kind: 'dream_signal',
      occurredAt: entry.at,
      day: entry.at.slice(0, 10),
      theme: entry.theme,
      feeling: entry.feeling,
      practiceCount: entry.practiceCount,
      ...(entry.lastPracticedAt ? { lastPracticedAt: entry.lastPracticedAt } : {}),
    }));

  const currentChapter = boundedInt(mirror.chapter, 1, 1, 365);
  const evolvedOn = validDay(mirror.lastEvolvedOn);
  if (evolvedOn && currentChapter > 1) {
    events.push({
      kind: 'chapter_evolved',
      occurredAt: `${evolvedOn}T00:00:00.000Z`,
      day: evolvedOn,
      chapter: currentChapter,
    });
  }

  const completedOn = validDay(manifestation.completedAt) || validTimestamp(manifestation.completedAt).slice(0, 10);
  if (completedOn) {
    events.push({
      kind: 'manifestation_completed',
      occurredAt: `${completedOn}T00:00:00.000Z`,
      day: completedOn,
    });
  }

  return compactEvents(events);
}

function previousSceneFrom(manifestation) {
  const previousScene = {};
  const fields = {
    intention: [600, 1800],
    affirmation: [1200, 3600],
    story: [2400, 5400],
    anchorIdentity: [600, 1800],
    anchorStep: [280, 840],
  };
  Object.entries(fields).forEach(([key, [maxChars, maxBytes]]) => {
    const value = truncateUtf8(cleanText(manifestation[key], maxChars), maxBytes);
    if (value) previousScene[key] = value;
  });
  return previousScene;
}

function previousKnowledgeCardIdsFrom(manifestation, chapterHistory) {
  const packs = [];
  const packKeys = new Set();
  const addPack = (generation) => {
    if (packs.length >= CELESTE_CHRONOLOGY_LIMITS.maxKnowledgePacks) return;
    const ids = normalizedKnowledgeCardIds(
      isRecord(generation) ? generation.knowledgeCardIds : []
    );
    if (!ids.length) return;
    const key = [...ids].sort().join('|');
    if (packKeys.has(key)) return;
    packKeys.add(key);
    packs.push(ids);
  };

  addPack(manifestation.generation);

  const variants = isRecord(manifestation.contentByLang)
    ? manifestation.contentByLang
    : {};
  const variantOrder = [
    manifestation.lang,
    manifestation.originLang,
    'pt',
    'en',
  ].filter((lang, index, values) =>
    (lang === 'pt' || lang === 'en') && values.indexOf(lang) === index
  );
  variantOrder.forEach((lang) => addPack(variants[lang]?.generation));

  (Array.isArray(chapterHistory) ? chapterHistory : [])
    .slice(0, CELESTE_CHRONOLOGY_LIMITS.maxRecentChapters)
    .forEach((entry) => addPack(entry.generation));

  return [...new Set(packs.flat())]
    .slice(0, CELESTE_CHRONOLOGY_LIMITS.maxPreviousKnowledgeCardIds);
}

function compactMemory(memory) {
  const output = {
    ...memory,
    previousScene: { ...(memory.previousScene || {}) },
    chronology: {
      ...(memory.chronology || {}),
      recentChapters: [...(memory.chronology?.recentChapters || [])],
      recentDreamSignals: [...(memory.chronology?.recentDreamSignals || [])],
    },
  };
  const tooLarge = () => serializedBytes(output) > CELESTE_CHRONOLOGY_LIMITS.maxMemoryBytes;

  while (tooLarge() && output.chronology.recentChapters.length) {
    output.chronology.recentChapters.pop();
  }
  if (tooLarge()) delete output.previousScene.story;
  while (tooLarge() && output.chronology.recentDreamSignals.length) {
    output.chronology.recentDreamSignals.pop();
  }
  if (tooLarge()) {
    for (const [key, maxBytes] of [
      ['affirmation', 1200],
      ['intention', 700],
      ['anchorIdentity', 700],
      ['anchorStep', 500],
    ]) {
      if (output.previousScene[key]) {
        output.previousScene[key] = truncateUtf8(output.previousScene[key], maxBytes);
      }
    }
  }
  if (tooLarge()) output.previousScene = {};
  return output;
}

export function summarizeChronologyMemory(input = {}) {
  const { manifestation, mirror, sessions, chapters, dreams } = sourcesFrom(input);
  const practiceDays = normalizedSessions(sessions);
  const bridges = normalizedBridges(mirror);
  const chapterHistory = normalizedChapters(chapters);
  const dreamSignals = normalizedDreamSignals(dreams);
  const currentChapter = boundedInt(mirror.chapter, 1, 1, 365);
  const lastPracticeDay = practiceDays.length ? practiceDays[practiceDays.length - 1] : '';
  const latestDream = dreamSignals[0] || null;
  const events = normalizeChronologyEvents(input);
  const lastEvent = events.length ? events[events.length - 1] : null;
  const evidenceCount = Math.min(
    Array.isArray(manifestation.evidence) ? manifestation.evidence.length : 0,
    500
  );
  const previousScene = previousSceneFrom(manifestation);
  const previousKnowledgeCardIds = previousKnowledgeCardIdsFrom(
    manifestation,
    chapterHistory
  );

  const recentChapters = chapterHistory
    .slice(0, CELESTE_CHRONOLOGY_LIMITS.maxRecentChapters)
    .map((entry) => ({
      chapter: entry.chapter,
      occurredAt: entry.at,
      lang: entry.lang,
      ...(entry.title ? { title: entry.title } : {}),
      ...(entry.intention ? { intention: entry.intention } : {}),
      ...(entry.affirmation ? { affirmation: entry.affirmation } : {}),
      ...(entry.anchorIdentity ? { anchorIdentity: entry.anchorIdentity } : {}),
      ...(entry.anchorStep ? { anchorStep: entry.anchorStep } : {}),
      ...(entry.memoryReceipt.length ? { memoryReceipt: entry.memoryReceipt } : {}),
    }));

  const recentDreamSignals = dreamSignals
    .slice(0, CELESTE_CHRONOLOGY_LIMITS.maxRecentDreamSignals)
    .map((entry) => ({
      theme: entry.theme,
      feeling: entry.feeling,
      ...(entry.at ? { occurredAt: entry.at } : {}),
      lang: entry.lang,
      practiceCount: entry.practiceCount,
      ...(entry.lastPracticedAt ? { lastPracticedAt: entry.lastPracticedAt } : {}),
    }));

  const startedOn = validDay(manifestation.createdAt) || validTimestamp(manifestation.createdAt).slice(0, 10);
  const completedOn = validDay(manifestation.completedAt) || validTimestamp(manifestation.completedAt).slice(0, 10);
  const memory = {
    // These keys preserve the existing buildEvolutionContinuity contract.
    chapter: Math.min(365, currentChapter + 1),
    practiceDays: Math.min(practiceDays.length, 3650),
    evidenceCount,
    stepCompletions: Math.min(bridges.length, 90),
    dreamCount: Math.min(dreamSignals.length, 90),
    latestDreamTheme: latestDream ? latestDream.theme : '',
    latestDreamFeeling: latestDream ? latestDream.feeling : '',
    lastPracticeDay,
    previousStepCompleted: bridges.some((entry) => entry.chapter === currentChapter),
    previousScene,
    previousKnowledgeCardIds,
    chronology: {
      currentChapter,
      goalDays: boundedInt(manifestation.goalDays, 21, 1, 365),
      chapterCount: Math.min(currentChapter, 365),
      ...(startedOn ? { startedOn } : {}),
      ...(completedOn ? { completedOn } : {}),
      ...(lastEvent ? { lastActivityAt: lastEvent.occurredAt } : {}),
      recentChapters,
      recentDreamSignals,
      rawDreamTextIncluded: false,
    },
  };

  return compactMemory(memory);
}

export function buildCelesteChronology(input = {}) {
  const events = normalizeChronologyEvents(input);
  const memory = summarizeChronologyMemory(input);
  return {
    version: 1,
    events,
    memory,
    size: {
      eventCount: events.length,
      eventsBytes: serializedBytes(events),
      memoryBytes: serializedBytes(memory),
    },
  };
}
