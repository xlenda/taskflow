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
    preview: {
      pt: require('../assets/audio/previews/aurora-pt.wav'),
      en: require('../assets/audio/previews/aurora-en.wav'),
    },
    localTone: { rate: 0.94, pitch: 1.06 },
    tts: {
      provider: 'elevenlabs',
      voice: 'UZ8QqWVrz7tMdxiglcLh',
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
    preview: {
      pt: require('../assets/audio/previews/rio-pt.wav'),
      en: require('../assets/audio/previews/rio-en.wav'),
    },
    localTone: { rate: 0.89, pitch: 0.96 },
    tts: {
      provider: 'elevenlabs',
      voice: 'SAz9YHcvj6GT2YYXdXww',
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
    preview: {
      pt: require('../assets/audio/previews/atlas-pt.wav'),
      en: require('../assets/audio/previews/atlas-en.wav'),
    },
    localTone: { rate: 0.86, pitch: 0.82 },
    tts: {
      provider: 'elevenlabs',
      voice: 'nPczCjzI2devNBz1zQrb',
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
    preview: {
      pt: require('../assets/audio/previews/serena-pt.wav'),
      en: require('../assets/audio/previews/serena-en.wav'),
    },
    localTone: { rate: 0.9, pitch: 1.01 },
    tts: {
      provider: 'elevenlabs',
      voice: 'MA970ZNagubdplnfHEiJ',
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
    preview: {
      pt: require('../assets/audio/previews/luma-pt.wav'),
      en: require('../assets/audio/previews/luma-en.wav'),
    },
    localTone: { rate: 0.96, pitch: 1.04 },
    tts: {
      provider: 'elevenlabs',
      voice: '33B4UnXyTNbgLmdEDh5P',
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
    preview: {
      pt: require('../assets/audio/previews/nilo-pt.wav'),
      en: require('../assets/audio/previews/nilo-en.wav'),
    },
    localTone: { rate: 0.91, pitch: 0.91 },
    tts: {
      provider: 'elevenlabs',
      voice: 'onwK4e9ZLuTAKqWW03F9',
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
