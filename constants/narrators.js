export const DEFAULT_NARRATOR_ID = 'aurora';

export const NARRATORS = [
  {
    id: 'aurora',
    name: { pt: 'Aurora', en: 'Aurora' },
    description: {
      pt: 'Acolhedora, confiante e luminosa',
      en: 'Warm, confident and luminous',
    },
    accent: 3,
    localTone: { rate: 0.94, pitch: 1.06 },
    preview: {
      pt: '/audio/narrators/aurora-pt-v1.mp3',
      en: '/audio/narrators/aurora-en-v1.mp3',
    },
  },
  {
    id: 'rio',
    name: { pt: 'Rio', en: 'River' },
    description: {
      pt: 'Calma, neutra e contemplativa',
      en: 'Calm, neutral and contemplative',
    },
    accent: 2,
    localTone: { rate: 0.89, pitch: 0.96 },
    preview: {
      pt: '/audio/narrators/rio-pt-v1.mp3',
      en: '/audio/narrators/rio-en-v1.mp3',
    },
  },
  {
    id: 'atlas',
    name: { pt: 'Atlas', en: 'Atlas' },
    description: {
      pt: 'Grave, quente e envolvente',
      en: 'Deep, warm and immersive',
    },
    accent: 1,
    localTone: { rate: 0.86, pitch: 0.82 },
    preview: {
      pt: '/audio/narrators/atlas-pt-v1.mp3',
      en: '/audio/narrators/atlas-en-v1.mp3',
    },
  },
];

const BY_ID = new Map(NARRATORS.map((narrator) => [narrator.id, narrator]));

export function narratorById(id) {
  return BY_ID.get(id) || BY_ID.get(DEFAULT_NARRATOR_ID);
}

export function isNarratorId(id) {
  return BY_ID.has(id);
}

export function narratorText(value, lang = 'pt') {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return value[lang === 'en' ? 'en' : 'pt'] || value.pt || value.en || '';
}

export function narratorPreviewUrl(id, lang = 'pt') {
  const narrator = narratorById(id);
  return narrator.preview[lang === 'en' ? 'en' : 'pt'];
}
