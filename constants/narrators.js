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
    tts: {
      provider: 'gemini',
      voice: 'Sulafat',
      style: {
        pt: 'calorosa, confiante e luminosa',
        en: 'warm, confident and luminous',
      },
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
    tts: {
      provider: 'gemini',
      voice: 'Callirrhoe',
      style: {
        pt: 'calma, neutra e contemplativa',
        en: 'calm, neutral and contemplative',
      },
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
    tts: {
      provider: 'gemini',
      voice: 'Orus',
      style: {
        pt: 'grave, quente e envolvente',
        en: 'deep, warm and immersive',
      },
    },
  },
  {
    id: 'serena',
    name: { pt: 'Serena', en: 'Serena' },
    description: {
      pt: 'Suave, íntima e serena',
      en: 'Soft, intimate and serene',
    },
    accent: 0,
    localTone: { rate: 0.9, pitch: 1.01 },
    tts: {
      provider: 'gemini',
      voice: 'Vindemiatrix',
      style: {
        pt: 'suave, íntima e serena',
        en: 'soft, intimate and serene',
      },
    },
  },
  {
    id: 'luma',
    name: { pt: 'Luma', en: 'Luma' },
    description: {
      pt: 'Próxima, leve e acolhedora',
      en: 'Friendly, light and reassuring',
    },
    accent: 3,
    localTone: { rate: 0.96, pitch: 1.04 },
    tts: {
      provider: 'gemini',
      voice: 'Achird',
      style: {
        pt: 'próxima, leve e acolhedora',
        en: 'friendly, light and reassuring',
      },
    },
  },
  {
    id: 'nilo',
    name: { pt: 'Nilo', en: 'Nilo' },
    description: {
      pt: 'Clara, centrada e segura',
      en: 'Clear, grounded and assured',
    },
    accent: 2,
    localTone: { rate: 0.91, pitch: 0.91 },
    tts: {
      provider: 'gemini',
      voice: 'Charon',
      style: {
        pt: 'clara, centrada e segura',
        en: 'clear, grounded and assured',
      },
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
  const preview = narrator && narrator.preview;
  return preview ? preview[lang === 'en' ? 'en' : 'pt'] || null : null;
}
