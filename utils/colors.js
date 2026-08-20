const FALLBACK_ACCENT = '#B85FC8';

const accentList = (t) =>
  t && t.accents && t.accents.length ? t.accents : [(t && t.accent) || FALLBACK_ACCENT];

export const accentAt = (t, i) => {
  const list = accentList(t);
  const idx = ((Math.round(i) % list.length) + list.length) % list.length;
  return list[idx];
};

export const gradientPair = (t, i) => {
  const list = accentList(t);
  const a = accentAt(t, i);
  const b = accentAt(t, i + (list.length > 2 ? 2 : 1));
  return [a, b];
};

/** hex + alpha -> rgba string */
export const alpha = (hex, a) => {
  const h = String(hex || '#B85FC8').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
};
