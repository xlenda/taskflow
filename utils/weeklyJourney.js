// Jornada da semana: um tema por semana, um dia do tema por dia da semana.
// 'YYYY-MM-DD' é lido como data pura (Date.UTC), sem fuso: o mesmo dia dá o mesmo tema em qualquer aparelho.
import { WEEKLY_JOURNEYS } from '../constants/weeklyJourneys';

export const JOURNEY_LIMITS = { line: 80, affirmation: 70, action: 90 };

const DAY_MS = 86400000;

/** 1970-01-01 -> 0; texto que não é um dia real -> null. */
export function daysSinceEpoch(dayISO) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayISO));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
  return date.getTime() / DAY_MS;
}

/** Semanas inteiras desde a segunda-feira 1970-01-05 (dia 4). Conta contínua, sem pular na virada do ano. */
export function weekSerial(dayISO) {
  const days = daysSinceEpoch(dayISO);
  return days === null ? null : Math.floor((days - 4) / 7);
}

/** Segunda 0 ... domingo 6. */
export function weekdayIndex(dayISO) {
  const days = daysSinceEpoch(dayISO);
  return days === null ? null : (((days - 4) % 7) + 7) % 7;
}

export function journeyClipId(themeId, dayIndex) {
  return `j_${themeId}_${dayIndex + 1}`;
}

/** { theme, dayIndex, day, clipId } do dia, ou null (biblioteca vazia, dia inválido ou antes de 05/01/1970). */
export function journeyForDay(dayISO, journeys = WEEKLY_JOURNEYS) {
  const serial = weekSerial(dayISO);
  if (!journeys.length || serial === null || serial < 0) return null;
  const theme = journeys[serial % journeys.length];
  const dayIndex = weekdayIndex(dayISO);
  return { theme, dayIndex, day: theme.days[dayIndex], clipId: journeyClipId(theme.id, dayIndex) };
}
