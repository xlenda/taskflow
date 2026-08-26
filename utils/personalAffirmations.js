const clean = (value, max = 800) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

export const alarmAffirmationText = (value) => {
  const text = clean(value);
  if (text.length <= 280) return text;
  const candidate = text.slice(0, 281);
  const sentence = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('! '), candidate.lastIndexOf('? '));
  const boundary = sentence >= 140 ? sentence + 1 : candidate.lastIndexOf(' ', 280);
  return candidate.slice(0, boundary > 0 ? boundary : 280).trim();
};

export function personalAffirmationsForState(state) {
  const manifestations = (Array.isArray(state && state.manifestations)
    ? state.manifestations
    : [])
    .map((item) => ({
      id: `manifestation:${clean(item && item.id, 160)}`,
      text: alarmAffirmationText(item && item.affirmation),
      lang: item && item.lang === 'en' ? 'en' : 'pt',
      source: 'manifestation',
    }))
    .filter((item) => item.id !== 'manifestation:' && item.text);

  const ritual = state && state.morningRitual;
  const dreams = (Array.isArray(ritual && ritual.entries) ? ritual.entries : [])
    .map((entry) => ({
      id: `ritual:${clean(entry && entry.id, 160)}`,
      text: alarmAffirmationText(entry && entry.affirmation),
      lang: entry && entry.lang === 'en' ? 'en' : 'pt',
      source: 'dream',
    }))
    .filter((item) => item.id !== 'ritual:' && item.text);

  const customText = alarmAffirmationText(ritual && ritual.wakeAffirmationText);
  const custom = ritual && ritual.wakeAffirmationId === 'custom' && customText
    ? [{ id: 'custom', text: customText, lang: ritual.wakeAffirmationLang === 'en' ? 'en' : 'pt', source: 'custom' }]
    : [];

  return [...manifestations, ...dreams, ...custom];
}
