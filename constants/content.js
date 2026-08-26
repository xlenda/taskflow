// Only structural product metadata lives here. User-facing practice cards are
// created from each person's questionnaire answers and saved manifestations.
import { txt } from './i18n';
import { DEFAULT_NARRATOR_ID } from './narrators';

// `key` is persisted as a stable identifier; `label` is translated for display.
export const CATEGORIES = [
  { key: 'Love', icon: 'heart', accent: 1, label: { en: 'Love', pt: 'Amor' } },
  { key: 'Wealth', icon: 'diamond', accent: 0, label: { en: 'Wealth', pt: 'Prosperidade' } },
  { key: 'Career', icon: 'briefcase', accent: 3, label: { en: 'Career', pt: 'Carreira' } },
  { key: 'Health', icon: 'leaf', accent: 4, label: { en: 'Health', pt: 'Saúde' } },
  { key: 'Confidence', icon: 'flame', accent: 2, label: { en: 'Confidence', pt: 'Confiança' } },
  { key: 'Peace', icon: 'moon', accent: 5, label: { en: 'Peace', pt: 'Paz' } },
];

export const categoryMeta = (key) =>
  CATEGORIES.find((category) => category.key === key) || {
    key: 'Personal',
    icon: 'sparkles',
    accent: 0,
    label: { en: 'Personal', pt: 'Pessoal' },
  };

const TEXT_FIELDS = [
  'title',
  'tagline',
  'intention',
  'affirmation',
  'story',
  'caption',
  'script',
  'text',
  'label',
];

export function localized(item, lang) {
  if (item == null) return item;
  if (typeof item === 'string') return item;
  if (typeof item.en === 'string' || typeof item.pt === 'string') return txt(item, lang);
  const out = { ...item };
  for (const field of TEXT_FIELDS) {
    if (out[field] != null) out[field] = txt(out[field], lang);
  }
  return out;
}

export const initialState = () => ({
  name: '',
  onboardingDone: false,
  narration: {
    narratorId: DEFAULT_NARRATOR_ID,
  },
  manifestations: [],
  favoriteAffirmations: [],
  savedVisions: [],
  visionPlays: [],
  affirmationDates: [],
  dailyRitual: {
    reminderEnabled: false,
    reminderTime: '20:30',
    notificationId: null,
    permission: 'unknown',
  },
  morningRitual: {
    alarmStatus: 'native_integration_required',
    reminderEnabled: false,
    alarmSyncError: false,
    reminderTime: '07:00',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    wakeAffirmationId: null,
    wakeAffirmationText: '',
    wakeAffirmationLang: 'pt',
    wakeNarratorId: null,
    wakeSoundSource: null,
    entries: [],
  },
});
