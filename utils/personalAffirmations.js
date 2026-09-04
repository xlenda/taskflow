import {
  personalJourneyItemsForState,
  personalVisionOptionsForState,
} from './personalJourney';

const clean = (value, max = 800) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const contentLang = (value) => (value === 'en' ? 'en' : 'pt');

export const alarmAffirmationText = (value) => {
  const text = clean(value);
  if (text.length <= 280) return text;
  const candidate = text.slice(0, 281);
  const sentence = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('! '), candidate.lastIndexOf('? '));
  const boundary = sentence >= 140 ? sentence + 1 : candidate.lastIndexOf(' ', 280);
  return candidate.slice(0, boundary > 0 ? boundary : 280).trim();
};

const validOption = (item) => item.id && item.text;

const personalJourneyAlarmItems = (state, kind, source) =>
  personalJourneyItemsForState(state, kind, state && state.lang)
    .map((item) => ({
      id: clean(item && item.id, 220),
      text: alarmAffirmationText(
        kind === 'vision' && item ? item.story || item.generatedStory || item.text || item.title : item && item.text
      ),
      lang: contentLang(item && item.lang),
      source,
    }))
    .filter(validOption);

const legacyManifestationAlarmItems = (state) =>
  (Array.isArray(state && state.manifestations) ? state.manifestations : [])
    .map((item) => ({
      id: `manifestation:${clean(item && item.id, 160)}`,
      text: alarmAffirmationText(item && item.affirmation),
      lang: contentLang(item && item.lang),
      source: 'manifestation',
    }))
    .filter((item) => item.id !== 'manifestation:' && item.text);

const dreamAlarmItems = (state) => {
  const ritual = state && state.morningRitual;
  return (Array.isArray(ritual && ritual.entries) ? ritual.entries : [])
    .map((entry) => ({
      id: `ritual:${clean(entry && entry.id, 160)}`,
      text: alarmAffirmationText(entry && entry.affirmation),
      lang: contentLang(entry && entry.lang),
      source: 'dream',
    }))
    .filter((item) => item.id !== 'ritual:' && item.text);
};

const customAlarmItems = (state) => {
  const ritual = state && state.morningRitual;
  const text = alarmAffirmationText(ritual && ritual.wakeAffirmationText);
  return ritual && ritual.wakeAffirmationId === 'custom' && text
    ? [{
        id: 'custom',
        text,
        lang: contentLang(ritual.wakeAffirmationLang),
        source: 'custom',
      }]
    : [];
};

export function personalAffirmationsForState(state) {
  const journeyAffirmations = personalJourneyAlarmItems(state, 'affirmation', 'manifestation');

  // States created before the 6+6 journey migration can reach this helper in
  // isolation (for example during native alarm recovery). Keep their one
  // personal affirmation available until normal state hydration upgrades it.
  const manifestations = journeyAffirmations.length
    ? journeyAffirmations
    : legacyManifestationAlarmItems(state);
  return [...manifestations, ...dreamAlarmItems(state), ...customAlarmItems(state)];
}

export function personalAlarmContentForState(state) {
  const affirmations = personalAffirmationsForState(state).map((item) =>
    item.source === 'manifestation' && !item.id.startsWith('manifestation:')
      ? { ...item, source: 'affirmation', personal: true }
      : { ...item, personal: true }
  );
  const visionsAndAnchor = personalVisionOptionsForState(state, state && state.lang)
    .map((item) => ({
      id: clean(item && item.id, 220),
      text: alarmAffirmationText(item && (item.story || item.generatedStory || item.text || item.title)),
      lang: contentLang(item && (item.lang || item.speechLang)),
      source: item && item.source === 'anchor' ? 'anchor' : 'vision',
      personal: true,
    }))
    .filter(validOption);

  // Keep legacy manifestation IDs resolvable even after the 6+6 content suite
  // exists. Older alarms persist these IDs and must not become orphaned just
  // because the app gained richer choices.
  const knownIds = new Set(affirmations.map((item) => item.id));
  const legacy = legacyManifestationAlarmItems(state)
    .filter((item) => !knownIds.has(item.id))
    .map((item) => ({ ...item, personal: true }));
  return [...affirmations, ...visionsAndAnchor, ...legacy];
}

export function resolvePersonalAlarmContent(state) {
  const ritual = state && state.morningRitual;
  const wakeId = clean(ritual && ritual.wakeAffirmationId, 220);
  if (!wakeId) return null;
  return personalAlarmContentForState(state).find((item) => item.id === wakeId) || null;
}

export function alarmContentBelongsToManifestation(contentId, manifestationId) {
  const id = clean(contentId, 220);
  const ownerId = clean(manifestationId, 160);
  if (!id || !ownerId) return false;
  return (
    id === `manifestation:${ownerId}` ||
    id === `anchor:${ownerId}` ||
    id.startsWith(`${ownerId}:affirmation:`) ||
    id.startsWith(`${ownerId}:vision:`)
  );
}
