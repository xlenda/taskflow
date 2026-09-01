export const PRACTICE_PLAN_VERSION = 1;
export const MAX_PRACTICE_SLOTS = 4;
export const MAX_PRACTICE_RECEIPTS = 120;
export const PRACTICE_TIME_ADJUSTMENT_MINUTES = 30;

const DEFAULT_WAKE_TIME = '07:00';
const DEFAULT_SLEEP_TIME = '22:30';
const ALL_WEEKDAYS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
const RECEIPT_METHODS = new Set(['speech', 'accessibility', 'manual']);
const PERMISSION_STATES = new Set(['unknown', 'granted', 'denied', 'unsupported']);
const CONTENT_FINGERPRINT_PATTERN = /^v1-[0-9a-f]{16}$/;

const clean = (value, max = 160) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const objectOrEmpty = (value) =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const asBoolean = (value, fallback = false) => {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  return fallback;
};

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function timeToMinutes(value) {
  if (Number.isInteger(value) && value >= 0 && value < 24 * 60) return value;
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(value) {
  if (!Number.isFinite(value)) return null;
  const normalized = ((Math.round(value) % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function normalizePracticeTime(value, fallback = null) {
  const minutes = timeToMinutes(value);
  return minutes === null ? fallback : minutesToTime(minutes);
}

function unfoldedAwakeWindow(wakeTime, sleepTime) {
  const wake = timeToMinutes(wakeTime);
  const sleepClock = timeToMinutes(sleepTime);
  if (wake === null || sleepClock === null || wake === sleepClock) return null;
  return { wake, sleep: sleepClock <= wake ? sleepClock + 24 * 60 : sleepClock };
}

const roundToFive = (value) => Math.round(value / 5) * 5;

function clampToWindow(value, earliest, latest) {
  return clamp(roundToFive(value), earliest, latest);
}

function preferredClockInWindow(clockMinutes, wake, sleep) {
  const occurrences = [clockMinutes - 24 * 60, clockMinutes, clockMinutes + 24 * 60];
  return occurrences.find((candidate) => candidate >= wake && candidate <= sleep) ?? (wake + sleep) / 2;
}

/**
 * Suggests quiet, useful moments inside the person's waking window. Three
 * slots intentionally favour shortly after waking, lunch time and one hour
 * before sleep (07:30, 13:00 and 21:30 for a 07:00-22:30 day).
 */
export function suggestPracticeSlots(wakeTime, sleepTime, count = 3) {
  const window = unfoldedAwakeWindow(
    normalizePracticeTime(wakeTime, DEFAULT_WAKE_TIME),
    normalizePracticeTime(sleepTime, DEFAULT_SLEEP_TIME)
  ) || unfoldedAwakeWindow(DEFAULT_WAKE_TIME, DEFAULT_SLEEP_TIME);
  const desiredCount = clamp(Number.isFinite(Number(count)) ? Math.trunc(Number(count)) : 3, 1, MAX_PRACTICE_SLOTS);
  const { wake, sleep } = window;
  const duration = sleep - wake;
  const earliest = Math.min(sleep, wake + Math.min(30, Math.floor(duration / 4)));
  const latest = Math.max(earliest, sleep - Math.min(60, Math.floor(duration / 4)));

  let candidates;
  if (desiredCount === 1) {
    candidates = [preferredClockInWindow(13 * 60, earliest, latest)];
  } else if (desiredCount === 2) {
    candidates = [earliest, latest];
  } else if (desiredCount === 3) {
    candidates = [earliest, preferredClockInWindow(13 * 60, earliest, latest), latest];
  } else {
    const span = latest - earliest;
    candidates = [earliest, earliest + span / 3, earliest + (span * 2) / 3, latest];
  }

  const result = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const time = minutesToTime(clampToWindow(candidate, earliest, latest));
    if (!seen.has(time)) {
      seen.add(time);
      result.push(time);
    }
  }

  // Very short or unusual waking windows can collapse rounded suggestions.
  // Fill only with unique in-window minutes; never invent a fifth slot.
  for (let minute = earliest; result.length < desiredCount && minute <= latest; minute += 1) {
    const time = minutesToTime(minute);
    if (!seen.has(time)) {
      seen.add(time);
      result.push(time);
    }
  }

  return result.slice(0, MAX_PRACTICE_SLOTS);
}

/** Adjusts a clock time by at most 30 minutes, optionally staying in a waking window. */
export function adjustPracticeTime(time, deltaMinutes, bounds = {}) {
  const current = timeToMinutes(time);
  if (current === null || !Number.isFinite(Number(deltaMinutes))) return normalizePracticeTime(time);
  const delta = clamp(Math.trunc(Number(deltaMinutes)), -PRACTICE_TIME_ADJUSTMENT_MINUTES, PRACTICE_TIME_ADJUSTMENT_MINUTES);
  const window = unfoldedAwakeWindow(bounds.wakeTime, bounds.sleepTime);
  if (!window) return minutesToTime(current + delta);

  let unfolded = current;
  while (unfolded < window.wake) unfolded += 24 * 60;
  while (unfolded > window.sleep) unfolded -= 24 * 60;
  return minutesToTime(clamp(unfolded + delta, window.wake, window.sleep));
}

export function adjustPracticeSlotTime(time, direction, bounds = {}) {
  const delta = direction === -1 || direction === 'earlier'
    ? -PRACTICE_TIME_ADJUSTMENT_MINUTES
    : PRACTICE_TIME_ADJUSTMENT_MINUTES;
  return adjustPracticeTime(time, delta, bounds);
}

export function jsDayToIsoWeekday(day) {
  return Number.isInteger(day) && day >= 0 && day <= 6 ? (day === 0 ? 7 : day) : null;
}

export function isoWeekdayToJsDay(day) {
  return Number.isInteger(day) && day >= 1 && day <= 7 ? day % 7 : null;
}

const WEEKDAY_NAMES = Object.freeze({
  monday: 1,
  mon: 1,
  segunda: 1,
  seg: 1,
  'segunda-feira': 1,
  tuesday: 2,
  tue: 2,
  terca: 2,
  ter: 2,
  'terca-feira': 2,
  wednesday: 3,
  wed: 3,
  quarta: 3,
  qua: 3,
  'quarta-feira': 3,
  thursday: 4,
  thu: 4,
  quinta: 4,
  qui: 4,
  'quinta-feira': 4,
  friday: 5,
  fri: 5,
  sexta: 5,
  sex: 5,
  'sexta-feira': 5,
  saturday: 6,
  sat: 6,
  sabado: 6,
  sab: 6,
  sunday: 7,
  sun: 7,
  domingo: 7,
  dom: 7,
});

const weekdayName = (value) =>
  clean(value, 32)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function normalizePracticeWeekdays(value, options = {}) {
  if (!Array.isArray(value) || value.length === 0) return [...ALL_WEEKDAYS];
  const numeric = value.filter(Number.isInteger);
  const usesJsDays = options.source === 'js' || (options.source !== 'iso' && numeric.includes(0));
  const days = value.map((item) => {
    if (Number.isInteger(item)) return usesJsDays ? jsDayToIsoWeekday(item) : (item >= 1 && item <= 7 ? item : null);
    return WEEKDAY_NAMES[weekdayName(item)] || null;
  });
  const valid = [...new Set(days.filter(Boolean))].sort((left, right) => left - right);
  return valid.length ? valid : [...ALL_WEEKDAYS];
}

export const practiceWeekdaysToJs = (value) =>
  normalizePracticeWeekdays(value, { source: 'iso' }).map(isoWeekdayToJsDay);

function idsFrom(value) {
  if (!Array.isArray(value)) return null;
  const ids = value
    .map((item) => clean(typeof item === 'string' ? item : item?.id, 160))
    .filter(Boolean);
  return [...new Set(ids)];
}

export function firstValidPracticeId(items) {
  return idsFrom(items)?.[0] || null;
}

export function selectValidPracticeId(preferredId, items, fallback = true) {
  const preferred = clean(preferredId, 160) || null;
  const ids = idsFrom(items);
  if (ids === null) return preferred;
  if (preferred && ids.includes(preferred)) return preferred;
  return fallback ? ids[0] || null : null;
}

function slotSources(source) {
  for (const candidate of [source.slots, source.practiceSlots, source.reminders, source.times]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function slotFrom(source, index, options, fallbackTime) {
  const raw = typeof source === 'string' || Number.isInteger(source) ? { time: source } : objectOrEmpty(source);
  const time = normalizePracticeTime(raw.time ?? raw.at ?? raw.hour, fallbackTime);
  const affirmationValue = raw.affirmationId ?? raw.selectedAffirmationId ?? raw.affirmation?.id;
  const visionValue = raw.visionId ?? raw.selectedVisionId ?? raw.vision?.id;
  return {
    id: clean(raw.id, 80) || `practice-${index + 1}`,
    time,
    enabled: asBoolean(raw.enabled ?? raw.active, true),
    affirmationId: selectValidPracticeId(
      affirmationValue,
      options.affirmations ?? options.affirmationIds,
      options.fallbackSelections !== false
    ),
    visionId: selectValidPracticeId(
      visionValue,
      options.visions ?? options.visionIds,
      options.fallbackSelections !== false
    ),
  };
}

function uniqueSlots(slots) {
  const times = new Set();
  const ids = new Set();
  const result = [];
  for (const slot of slots) {
    if (!slot.time || times.has(slot.time) || result.length >= MAX_PRACTICE_SLOTS) continue;
    let id = slot.id;
    let suffix = 2;
    while (ids.has(id)) {
      id = `${slot.id.slice(0, 70)}-${suffix}`;
      suffix += 1;
    }
    times.add(slot.time);
    ids.add(id);
    result.push({ ...slot, id });
  }
  return result;
}

function sanitizeNotificationIdsBySlot(value, slots) {
  const source = objectOrEmpty(value);
  const allowed = new Set((Array.isArray(slots) ? slots : []).map((slot) => slot.id));
  const result = {};
  for (const [slotId, rawIds] of Object.entries(source)) {
    const cleanSlotId = clean(slotId, 80);
    if (!allowed.has(cleanSlotId) || !Array.isArray(rawIds)) continue;
    const ids = [...new Set(rawIds.map((id) => clean(id, 240)).filter(Boolean))].slice(0, 7);
    if (ids.length) result[cleanSlotId] = ids;
  }
  return result;
}

/** Replaces times without discarding each slot's enabled state or content selections. */
export function mergePracticeSlotsWithTimes(existingSlots, times, options = {}) {
  const previous = Array.isArray(existingSlots) ? existingSlots : [];
  const requestedTimes = Array.isArray(times) ? times : [];
  return uniqueSlots(requestedTimes.map((time, index) => {
    const current = objectOrEmpty(previous[index]);
    return slotFrom({ ...current, time }, index, options, null);
  }));
}

/** Adds one suggested moment without changing any existing slot. */
export function appendSuggestedPracticeSlot(existingSlots, bounds = {}, options = {}) {
  const previous = Array.isArray(existingSlots) ? existingSlots : [];
  if (previous.length >= MAX_PRACTICE_SLOTS) return previous;

  const usedTimes = new Set(
    previous.map((slot) => normalizePracticeTime(slot?.time)).filter(Boolean)
  );
  const suggestions = suggestPracticeSlots(
    bounds?.wakeTime,
    bounds?.sleepTime,
    previous.length + 1
  );
  const time = suggestions.find((candidate) => !usedTimes.has(candidate));
  if (!time) return previous;

  const inherited = previous.find((slot) => slot?.enabled !== false) || previous[0] || {};
  const usedIds = new Set(previous.map((slot) => clean(slot?.id, 80)).filter(Boolean));
  const idBase = `practice-${previous.length + 1}`;
  let id = idBase;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${idBase}-${suffix}`;
    suffix += 1;
  }

  const appended = slotFrom({
    id,
    time,
    enabled: true,
    affirmationId: inherited.affirmationId,
    visionId: inherited.visionId,
  }, previous.length, options, time);
  return [...previous, appended];
}

function validCompletedAt(value) {
  const text = clean(value, 40);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) return null;
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function receiptMethod(value) {
  const method = clean(value, 32).toLowerCase();
  if (RECEIPT_METHODS.has(method)) return method;
  if (['voice', 'microphone', 'mic'].includes(method)) return 'speech';
  if (['accessible', 'skip', 'fallback'].includes(method)) return 'accessibility';
  return null;
}

export function sanitizePracticeReceipt(value, options = {}) {
  const source = objectOrEmpty(value);
  const completedAt = validCompletedAt(source.completedAt ?? source.createdAt ?? source.timestamp);
  const slotId = clean(source.slotId ?? source.reminderId, 80);
  const method = receiptMethod(source.method ?? source.completionMethod);
  if (!completedAt || !slotId || !method) return null;

  const originalDay = clean(source.day ?? source.date, 10);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(originalDay)
    ? originalDay
    : clean(source.completedAt ?? source.createdAt ?? source.timestamp, 40).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;

  const allowedSlotIds = idsFrom(options.slots);
  if (allowedSlotIds && !allowedSlotIds.includes(slotId)) return null;
  const rawScore = Number(source.score);
  const score = Number.isFinite(rawScore) ? clamp(Math.round(rawScore), 0, 100) : 0;
  const requestedFingerprint = clean(source.contentFingerprint ?? source.contentHash, 40).toLowerCase();
  const contentFingerprint = CONTENT_FINGERPRINT_PATTERN.test(requestedFingerprint)
    ? requestedFingerprint
    : null;

  return {
    slotId,
    affirmationId: selectValidPracticeId(source.affirmationId, options.affirmations ?? options.affirmationIds, false),
    visionId: selectValidPracticeId(source.visionId, options.visions ?? options.visionIds, false),
    completedAt,
    day,
    method,
    score,
    contentFingerprint,
  };
}

export function sanitizePracticeReceipts(value, options = {}) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map((receipt) => sanitizePracticeReceipt(receipt, options))
    .filter(Boolean)
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .filter((receipt) => {
      const key = `${receipt.slotId}|${receipt.completedAt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_PRACTICE_RECEIPTS);
}

export function createPracticeReceipt(value, options = {}) {
  return sanitizePracticeReceipt(value, options);
}

function fingerprintWord(value) {
  const text = typeof value === 'string'
    ? value.normalize('NFKC').replace(/\s+/g, ' ').trim()
    : '';
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

/**
 * Fingerprint of the content shown to the person. It prevents an edited text
 * with the same ID from inheriting an earlier completion, without persisting
 * the personal phrase itself or anything captured by the microphone.
 */
export function practiceContentFingerprint({ affirmationText, visionText } = {}) {
  return `v1-${fingerprintWord(`${clean(affirmationText, 1200)}\n${clean(visionText, 1800)}`)}`;
}

export function createDefaultPracticePlan(options = {}) {
  const wakeTime = normalizePracticeTime(options.wakeTime, DEFAULT_WAKE_TIME);
  const sleepTime = normalizePracticeTime(options.sleepTime, DEFAULT_SLEEP_TIME);
  const times = suggestPracticeSlots(wakeTime, sleepTime, options.count);
  const slots = times.map((time, index) => slotFrom({ time }, index, options, time));
  return {
    version: PRACTICE_PLAN_VERSION,
    enabled: false,
    wakeTime,
    sleepTime,
    weekdays: [...ALL_WEEKDAYS],
    slots,
    notificationIdsBySlot: {},
    permission: 'unknown',
    syncError: false,
    receipts: [],
  };
}

export const DEFAULT_PRACTICE_PLAN = Object.freeze({
  ...createDefaultPracticePlan(),
  weekdays: Object.freeze([...ALL_WEEKDAYS]),
  slots: Object.freeze(createDefaultPracticePlan().slots.map((slot) => Object.freeze(slot))),
  notificationIdsBySlot: Object.freeze({}),
  permission: 'unknown',
  syncError: false,
  receipts: Object.freeze([]),
});

/**
 * Accepts the current model plus small legacy aliases. Unknown properties are
 * deliberately dropped, so raw microphone text can never leak into storage.
 */
export function normalizePracticePlan(value, options = {}) {
  const source = objectOrEmpty(value);
  const requestedEnabled = asBoolean(source.enabled ?? source.active, false);
  const affirmationCatalogue = idsFrom(options.affirmations ?? options.affirmationIds);
  const visionCatalogue = idsFrom(options.visions ?? options.visionIds);
  const selectionsCanBeValidated = affirmationCatalogue !== null && visionCatalogue !== null;
  const slotOptions = {
    ...options,
    // An active plan must never silently switch to the first remaining item
    // when its explicitly selected content was edited away or deleted.
    fallbackSelections: !requestedEnabled,
  };
  const wakeTime = normalizePracticeTime(source.wakeTime ?? source.wake ?? source.dayStart, DEFAULT_WAKE_TIME);
  const sleepTime = normalizePracticeTime(source.sleepTime ?? source.sleep ?? source.dayEnd, DEFAULT_SLEEP_TIME);
  const suggestions = suggestPracticeSlots(wakeTime, sleepTime, source.slotCount ?? options.count);
  const rawSlots = slotSources(source);
  const normalizedSlots = rawSlots.map((slot, index) => slotFrom(slot, index, slotOptions, suggestions[index] || null));
  const slots = uniqueSlots(normalizedSlots.length
    ? normalizedSlots
    : suggestions.map((time, index) => slotFrom({ time }, index, slotOptions, time)));
  const receipts = sanitizePracticeReceipts(
    source.receipts ?? source.completionReceipts ?? source.history,
    { ...options, slots }
  );
  const hasUsableSlot = slots.some((slot) => slot.enabled && (
    selectionsCanBeValidated
      ? slot.affirmationId && slot.visionId
      : slot.affirmationId || slot.visionId
  ));
  const invalidActiveSelection = requestedEnabled && selectionsCanBeValidated && slots.some(
    (slot) => slot.enabled && (!slot.affirmationId || !slot.visionId)
  );
  const notificationIdsBySlot = sanitizeNotificationIdsBySlot(
    source.notificationIdsBySlot ?? source.identifiersBySlot,
    slots
  );
  const permission = PERMISSION_STATES.has(source.permission) ? source.permission : 'unknown';

  return {
    version: PRACTICE_PLAN_VERSION,
    // If available content was supplied, stale selections cannot silently arm
    // a reminder. Without a catalogue, preserve a valid legacy plan as-is.
    enabled: requestedEnabled && !invalidActiveSelection && (
      hasUsableSlot || !selectionsCanBeValidated
    ),
    wakeTime,
    sleepTime,
    weekdays: normalizePracticeWeekdays(source.weekdays ?? source.days, {
      source: source.weekdayFormat === 'js' ? 'js' : undefined,
    }),
    slots,
    notificationIdsBySlot,
    permission,
    syncError: asBoolean(source.syncError, false) || invalidActiveSelection,
    receipts,
  };
}
