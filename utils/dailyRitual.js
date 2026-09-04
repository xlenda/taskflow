import { todayISO } from './date';
import { normalizeLivingMirror } from './livingMirror';
import {
  alarmContentBelongsToManifestation,
  resolvePersonalAlarmContent,
} from './personalAffirmations';

const clean = (value, max) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const completedDreamToday = (entry, day) =>
  typeof entry?.lastPracticedAt === 'string' && entry.lastPracticedAt.slice(0, 10) === day;

function manifestationRitual(item, day) {
  if (!item || !clean(item.affirmation, 1200)) return null;
  const mirror = normalizeLivingMirror(item.livingMirror);
  return {
    id: `manifestation:${item.id}`,
    sourceType: 'manifestation',
    sourceId: item.id,
    title: clean(item.title, 160),
    affirmation: clean(item.affirmation, 1200),
    anchorIdentity: clean(item.anchorIdentity, 600),
    anchorStep: clean(item.anchorStep, 280),
    lang: item.lang === 'en' ? 'en' : 'pt',
    chapter: mirror.chapter,
    completedToday: Array.isArray(item.sessions) && item.sessions.includes(day),
  };
}

function dreamRitual(entry, day) {
  if (!entry || !clean(entry.affirmation, 800)) return null;
  return {
    id: `ritual:${entry.id}`,
    sourceType: 'dream',
    sourceId: entry.id,
    title: '',
    affirmation: clean(entry.affirmation, 800),
    anchorIdentity: '',
    anchorStep: '',
    lang: entry.lang === 'en' ? 'en' : 'pt',
    chapter: null,
    completedToday: completedDreamToday(entry, day),
  };
}

export function selectDailyRitual(state, day = todayISO()) {
  if (!state || typeof state !== 'object') return null;
  const manifestations = Array.isArray(state.manifestations) ? state.manifestations : [];
  const dreams = Array.isArray(state.morningRitual?.entries) ? state.morningRitual.entries : [];
  const alarmContent = resolvePersonalAlarmContent(state);

  if (alarmContent?.source === 'dream') {
    const dreamId = alarmContent.id.slice('ritual:'.length);
    const selected = dreamRitual(dreams.find((entry) => entry.id === dreamId), day);
    if (selected) return { ...selected, affirmation: alarmContent.text, selection: 'alarm' };
  }

  if (alarmContent?.source === 'custom') {
    return {
      id: 'custom',
      sourceType: 'custom',
      sourceId: null,
      title: '',
      affirmation: alarmContent.text,
      anchorIdentity: '',
      anchorStep: '',
      lang: alarmContent.lang,
      chapter: null,
      completedToday: Array.isArray(state.affirmationDates) && state.affirmationDates.includes(day),
      selection: 'alarm',
    };
  }

  if (alarmContent) {
    const selected = manifestationRitual(
      manifestations.find((item) =>
        alarmContentBelongsToManifestation(alarmContent.id, item?.id)
      ),
      day
    );
    if (selected) {
      return {
        ...selected,
        id: alarmContent.id,
        affirmation: alarmContent.text,
        lang: alarmContent.lang,
        selection: 'alarm',
      };
    }
  }

  const active = manifestations.filter((item) => {
    const goal = Number.isInteger(item.goalDays) ? item.goalDays : 21;
    return !Array.isArray(item.sessions) || item.sessions.length < goal;
  });
  const pending = active.find((item) => !Array.isArray(item.sessions) || !item.sessions.includes(day));
  const manifestation = manifestationRitual(pending || active[0] || manifestations[0], day);
  if (manifestation) return { ...manifestation, selection: 'practice' };

  const latestDream = [...dreams].sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
  )[0];
  const dream = dreamRitual(latestDream, day);
  return dream ? { ...dream, selection: 'latest_dream' } : null;
}

export function dailyRitualNarration(ritual, lang) {
  if (!ritual) return '';
  const locale = ritual.lang === 'en' ? 'en' : ritual.lang === 'pt' ? 'pt' : lang === 'en' ? 'en' : 'pt';
  const affirmation = spokenExcerpt(ritual.affirmation);
  if (locale === 'en') {
    return [
      'Take one slow breath. Repeat with me.',
      affirmation,
      'Stay with these words for a few quiet moments.',
    ].filter(Boolean).join(' ');
  }
  return [
    'Respire devagar uma vez. Repita comigo.',
    affirmation,
    'Fique alguns instantes em silêncio com essas palavras.',
  ].filter(Boolean).join(' ');
}

function spokenExcerpt(value) {
  const text = clean(value, 700);
  const words = text.split(' ').filter(Boolean);
  if (words.length <= 55 && text.length <= 420) return text;

  const candidate = words.slice(0, 55).join(' ').slice(0, 420).trim();
  const completeSentences = candidate.match(/[^.!?]+[.!?]+/g);
  const complete = completeSentences?.join(' ').replace(/\s+/g, ' ').trim();
  if (complete && complete.length >= 80) return complete;

  const boundary = candidate.lastIndexOf(' ');
  return `${(boundary > 0 ? candidate.slice(0, boundary) : candidate).trim()}...`;
}

export const _dailyRitualTest = { spokenExcerpt };
