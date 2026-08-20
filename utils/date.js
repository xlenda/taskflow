export const toISO = (d) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const todayISO = () => toISO(new Date());

export const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISO(d);
};

export const lastNDays = (n) => {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(daysAgoISO(i));
  return out;
};

export const weekdayLetter = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()];
};

export const prettyDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
};

/** Streak of consecutive days ending today (or yesterday) present in the date list. */
export const streakFrom = (dates) => {
  const set = new Set(dates);
  if (set.size === 0) return 0;
  let start = 0;
  if (!set.has(daysAgoISO(0))) {
    if (!set.has(daysAgoISO(1))) return 0;
    start = 1;
  }
  let streak = 0;
  for (let i = start; i < 400; i++) {
    if (set.has(daysAgoISO(i))) streak++;
    else break;
  }
  return streak;
};

export const formatTime = (secs) => {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${`${r}`.padStart(2, '0')}`;
};
