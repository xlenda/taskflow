export const ALL_ALARM_WEEKDAYS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

export function normalizeAlarmWeekdays(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const weekdays = [...new Set(value)];
  if (weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return null;
  return weekdays.sort((left, right) => left - right);
}

export function alarmWeekdaysOrDefault(value) {
  return normalizeAlarmWeekdays(value) || [...ALL_ALARM_WEEKDAYS];
}
