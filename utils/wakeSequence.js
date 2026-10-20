import { personalAlarmContentForState } from './personalAffirmations';
import {
  anchorManifestationForState,
  personalJourneyItemsForState,
  personalVisionOptionsForState,
} from './personalJourney';

export const WAKE_SEQUENCE_MAX = 6;
const CHARS_PER_SECOND = 14;

const cleanId = (value) => (typeof value === 'string' ? value.trim().slice(0, 220) : '');

// The kind comes from the id format, never from what was stored: dream phrases,
// the person's own phrase and legacy manifestation phrases are affirmations.
function kindForId(id) {
  if (id === 'custom' || /^(ritual|manifestation):/.test(id)) return 'affirmation';
  if (id.startsWith('anchor:')) return 'anchor';
  return /:vision:[^:]+$/.test(id) ? 'vision' : 'affirmation';
}

const alarmIds = (state) => new Set(personalAlarmContentForState(state).map((option) => option.id));

export function normalizeWakeSequence(value, { validIds } = {}) {
  const sequence = [];
  if (!Array.isArray(value) || !(validIds instanceof Set)) return sequence;
  for (const entry of value) {
    const id = cleanId(typeof entry === 'string' ? entry : entry && entry.id);
    if (!validIds.has(id) || sequence.some((item) => item.id === id)) continue;
    sequence.push({ kind: kindForId(id), id });
    if (sequence.length === WAKE_SEQUENCE_MAX) break;
  }
  return sequence;
}

// A single-item alarm saved before sequences existed becomes a one-item sequence.
export function restoreWakeSequence(ritual, validIds) {
  const saved =
    ritual && Array.isArray(ritual.wakeSequence)
      ? ritual.wakeSequence
      : [ritual && ritual.wakeAffirmationId];
  return normalizeWakeSequence(saved, { validIds });
}

export function wakeSequenceOptionsForState(state, lang) {
  const details = new Map(
    [
      ...personalVisionOptionsForState(state, lang),
      ...personalJourneyItemsForState(state, 'affirmation', lang),
    ].map((item) => [item.id, item])
  );
  return personalAlarmContentForState(state).map((option) => {
    const kind = kindForId(option.id);
    const detail = details.get(option.id) || {};
    // Anchor Scene and visions narrate the whole story; affirmations, the phrase.
    const story = kind !== 'affirmation' && detail.story;
    return {
      kind,
      id: option.id,
      source: option.source,
      title: (kind !== 'affirmation' && detail.title) || option.text,
      text: story || option.text,
      lang: (story && detail.lang) || option.lang,
      visualKey: detail.visualKey || null,
      category: detail.category || null,
      manifestationId:
        detail.manifestationId ||
        (option.id.startsWith('manifestation:') ? option.id.slice('manifestation:'.length) : null),
    };
  });
}

export function wakeSequenceItemsForState(state, lang) {
  const byId = new Map(wakeSequenceOptionsForState(state, lang).map((option) => [option.id, option]));
  const ritual = state && state.morningRitual;
  return normalizeWakeSequence(ritual && ritual.wakeSequence, { validIds: new Set(byId.keys()) }).map(
    (entry) => byId.get(entry.id)
  );
}

export const estimateListeningSeconds = (items) =>
  Math.ceil(
    (Array.isArray(items) ? items : []).reduce(
      (total, item) => total + (item && typeof item.text === 'string' ? item.text.length : 0),
      0
    ) / CHARS_PER_SECOND
  );

// AlarmKit sound: the first affirmation of the sequence; without one, the
// Anchor Scene affirmation; an empty sequence has no alarm phrase.
export function firstPhraseForAlarm(items, state) {
  if (!Array.isArray(items) || !items.length) return null;
  const phrases = new Map(personalAlarmContentForState(state).map((option) => [option.id, option]));
  const firstId = items
    .map((item) => cleanId(item && item.id))
    .find((id) => kindForId(id) === 'affirmation' && phrases.has(id));
  const anchor = anchorManifestationForState(state);
  const phrase = firstId ? phrases.get(firstId) : anchor && phrases.get(`manifestation:${anchor.id}`);
  return phrase ? { id: phrase.id, text: phrase.text, lang: phrase.lang } : null;
}

export function appendToWakeSequence(state, entry) {
  const { kind, id } = entry || {};
  const target = cleanId(id);
  const validIds = alarmIds(state);
  if (!validIds.has(target) || kindForId(target) !== kind) return { ok: false, reason: 'unknown' };
  const ritual = state && state.morningRitual;
  const sequence = normalizeWakeSequence(ritual && ritual.wakeSequence, { validIds });
  if (sequence.some((item) => item.id === target)) return { ok: false, reason: 'duplicate' };
  if (sequence.length >= WAKE_SEQUENCE_MAX) return { ok: false, reason: 'full' };
  return { ok: true, sequence: [...sequence, { kind, id: target }] };
}

// Saving the sequence re-points the AlarmKit phrase. While a native alarm is
// active, text and language stay what the device confirmed, so
// NativeAlarmContentSync sees the difference and replaces the audio first.
export function ritualWithWakeSequence(state, sequence) {
  const ritual = (state && state.morningRitual) || {};
  const wakeSequence = normalizeWakeSequence(sequence, { validIds: alarmIds(state) });
  const phrase = firstPhraseForAlarm(wakeSequence, state);
  if (ritual.reminderEnabled) {
    // An active alarm never loses its phrase; turning it off stays explicit.
    return { ...ritual, wakeSequence, wakeAffirmationId: phrase ? phrase.id : ritual.wakeAffirmationId };
  }
  return {
    ...ritual,
    wakeSequence,
    wakeAffirmationId: phrase ? phrase.id : null,
    wakeAffirmationText: phrase ? phrase.text : '',
    wakeAffirmationLang: phrase ? phrase.lang : ritual.wakeAffirmationLang,
  };
}
