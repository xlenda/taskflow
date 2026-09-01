const DEFAULT_THRESHOLDS = Object.freeze({
  coverage: 0.82,
  order: 0.8,
  similarity: 0.72,
  score: 82,
});

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Normalization is deterministic for both Portuguese and English speech. */
export function normalizeSpeechText(value, lang = 'pt') {
  if (typeof value !== 'string') return '';
  const locale = lang === 'en' ? 'en-US' : 'pt-BR';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase(locale)
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1600);
}

const wordsOf = (value, lang) => normalizeSpeechText(value, lang).split(' ').filter(Boolean).slice(0, 160);

function multisetCoverage(target, spoken) {
  if (!target.length) return 0;
  const counts = new Map();
  spoken.forEach((word) => counts.set(word, (counts.get(word) || 0) + 1));
  let matches = 0;
  target.forEach((word) => {
    const available = counts.get(word) || 0;
    if (available > 0) {
      matches += 1;
      counts.set(word, available - 1);
    }
  });
  return matches / target.length;
}

function orderedCoverage(target, spoken) {
  if (!target.length || !spoken.length) return 0;
  let previous = new Array(spoken.length + 1).fill(0);
  for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
    const current = new Array(spoken.length + 1).fill(0);
    for (let spokenIndex = 1; spokenIndex <= spoken.length; spokenIndex += 1) {
      current[spokenIndex] = target[targetIndex - 1] === spoken[spokenIndex - 1]
        ? previous[spokenIndex - 1] + 1
        : Math.max(previous[spokenIndex], current[spokenIndex - 1]);
    }
    previous = current;
  }
  return previous[spoken.length] / target.length;
}

/**
 * Token Levenshtein against the best contiguous region. Words before or after
 * the affirmation are free, while omissions, substitutions and insertions
 * inside it are penalized.
 */
function bestRegionSimilarity(target, spoken) {
  if (!target.length || !spoken.length) return 0;
  let previous = new Array(spoken.length + 1).fill(0);
  for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
    const current = new Array(spoken.length + 1);
    current[0] = targetIndex;
    for (let spokenIndex = 1; spokenIndex <= spoken.length; spokenIndex += 1) {
      const substitution = previous[spokenIndex - 1] + (target[targetIndex - 1] === spoken[spokenIndex - 1] ? 0 : 1);
      current[spokenIndex] = Math.min(
        previous[spokenIndex] + 1,
        current[spokenIndex - 1] + 1,
        substitution
      );
    }
    previous = current;
  }
  const distance = Math.min(...previous);
  return clamp01(1 - distance / target.length);
}

const metric = (value) => Math.round(clamp01(value) * 100) / 100;

/**
 * Evaluates locally and returns metrics only. The result intentionally never
 * contains the target, transcript or normalized words, making it safe to use
 * directly when creating a completion receipt.
 */
export function evaluateSpeechMatch(targetText, transcriptText, options = {}) {
  const lang = options.lang === 'en' ? 'en' : 'pt';
  const target = wordsOf(targetText, lang).slice(0, 80);
  const spoken = wordsOf(transcriptText, lang);
  if (!target.length || !spoken.length) {
    return {
      matched: false,
      score: 0,
      coverage: 0,
      order: 0,
      similarity: 0,
      targetWordCount: target.length,
      spokenWordCount: spoken.length,
      reason: target.length ? 'no_speech' : 'invalid_target',
    };
  }

  const coverage = multisetCoverage(target, spoken);
  const order = orderedCoverage(target, spoken);
  const similarity = bestRegionSimilarity(target, spoken);
  const score = Math.round(clamp01(coverage * 0.45 + order * 0.35 + similarity * 0.2) * 100);
  const requested = objectOrEmpty(options.thresholds);
  const thresholds = {
    coverage: clamp01(Number.isFinite(requested.coverage) ? requested.coverage : DEFAULT_THRESHOLDS.coverage),
    order: clamp01(Number.isFinite(requested.order) ? requested.order : DEFAULT_THRESHOLDS.order),
    similarity: clamp01(Number.isFinite(requested.similarity) ? requested.similarity : DEFAULT_THRESHOLDS.similarity),
    score: Math.round(Math.min(100, Math.max(0, Number.isFinite(requested.score) ? requested.score : DEFAULT_THRESHOLDS.score))),
  };

  // Very short targets are easy to trigger accidentally, so they must be
  // reproduced exactly and in order. Normal affirmations use all four gates.
  const shortTarget = target.length <= 3;
  const matched = shortTarget
    ? coverage === 1 && order === 1 && similarity === 1
    : coverage >= thresholds.coverage &&
      order >= thresholds.order &&
      similarity >= thresholds.similarity &&
      score >= thresholds.score;

  return {
    matched,
    score,
    coverage: metric(coverage),
    order: metric(order),
    similarity: metric(similarity),
    targetWordCount: target.length,
    spokenWordCount: spoken.length,
    reason: matched ? 'matched' : 'not_close_enough',
  };
}

export const speechMatchThresholds = () => ({ ...DEFAULT_THRESHOLDS });

function objectOrEmpty(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export const _speechMatchTest = {
  multisetCoverage,
  orderedCoverage,
  bestRegionSimilarity,
};
