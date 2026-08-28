import { txt } from '../constants/i18n';

export const CUSTOM_CHOICE_KEY = '__custom__';

function uniqueStrings(values) {
  const seen = new Set();
  return values.reduce((result, value) => {
    const clean = String(value || '').trim();
    const identity = clean.toLocaleLowerCase();
    if (!clean || seen.has(identity)) return result;
    seen.add(identity);
    result.push(clean);
    return result;
  }, []);
}

function comparisonKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([ao]\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^0-9A-Za-z]+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function cleanCustomValue(value, lang) {
  const conjunction = lang === 'pt' ? /^e\s+/i : /^and\s+/i;
  const clean = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;]+\s*/, '')
    .trim();
  return clean.replace(conjunction, '').trim() || clean;
}

export function hasMeaningfulCustomValue(value) {
  return /[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(String(value || ''));
}

export function optionValue(step, option, lang) {
  return step.storeLocalized ? txt(option.answer || option, lang) : option.en;
}

export function joinNaturalList(values, lang) {
  const clean = uniqueStrings(values);
  if (clean.length < 2) return clean[0] || '';
  if (clean.length === 2) {
    return lang === 'pt'
      ? `${clean[0]}, além de ${clean[1]}`
      : `${clean[0]}, as well as ${clean[1]}`;
  }

  const beginning = clean.slice(0, -1).join('; ');
  return lang === 'pt'
    ? `${beginning}; e ${clean[clean.length - 1]}`
    : `${beginning}; and ${clean[clean.length - 1]}`;
}

function formatList(step, values, lang) {
  const joined = joinNaturalList(values, lang);
  if (!step.capitalizeAnswer || !joined) return joined;
  return `${joined.charAt(0).toLocaleUpperCase(lang === 'pt' ? 'pt-BR' : 'en-US')}${joined.slice(1)}`;
}

export function serializeMultiChoice(step, selectedKeys, customValue, lang) {
  const selected = new Set(Array.isArray(selectedKeys) ? selectedKeys : []);
  const values = step.options
    .filter((option) => selected.has(option.en))
    .map((option) => optionValue(step, option, lang));

  if (selected.has(CUSTOM_CHOICE_KEY)) {
    const custom = cleanCustomValue(customValue, lang);
    const matchingOption = step.options.find((option) => {
      const customKey = comparisonKey(custom);
      return [optionValue(step, option, lang), txt(option, lang), option.en]
        .some((candidate) => comparisonKey(candidate) === customKey);
    });
    values.push(matchingOption ? optionValue(step, matchingOption, lang) : custom);
  }
  return formatList(step, values, lang);
}

export function toggleMultiChoice(selectedKeys, key, exclusiveKeys = []) {
  const current = Array.isArray(selectedKeys) ? selectedKeys : [];
  if (current.includes(key)) return current.filter((selectedKey) => selectedKey !== key);

  const exclusive = new Set(exclusiveKeys);
  if (exclusive.has(key)) return [key];
  return [...current.filter((selectedKey) => !exclusive.has(selectedKey)), key];
}

function customPrefix(step, values, lang) {
  if (!values.length) return '';
  const marker = '__CELESTE_CUSTOM_VALUE__';
  const withMarker = formatList(step, [...values, marker], lang);
  const markerIndex = withMarker.indexOf(marker);
  return markerIndex >= 0 ? withMarker.slice(0, markerIndex) : '';
}

// Multi-select values stay strings in the profile. This restores the selected
// chips when someone goes back or resumes a saved onboarding draft.
export function restoreMultiChoice(step, storedValue, lang) {
  const stored = String(storedValue || '').trim();
  if (!stored) return { selectedKeys: [], customValue: '' };

  const entries = step.options.map((option) => ({
    key: option.en,
    value: String(optionValue(step, option, lang) || '').trim(),
  }));

  // Before multi-select existed, a saved draft could contain the visible chip
  // label. Keep those drafts editable after labels and stored wording diverge.
  const legacyOption = step.options.find((option) =>
    [txt(option, lang), option.en].some((candidate) => comparisonKey(candidate) === comparisonKey(stored))
  );
  if (legacyOption) return { selectedKeys: [legacyOption.en], customValue: '' };

  const combinations = [];

  for (let mask = 1; mask < 2 ** entries.length; mask += 1) {
    const picked = entries.filter((_, index) => mask & (1 << index));
    combinations.push(picked);
  }
  combinations.sort((a, b) => b.length - a.length);

  for (const picked of combinations) {
    const values = picked.map((entry) => entry.value);
    if (formatList(step, values, lang) === stored) {
      return { selectedKeys: picked.map((entry) => entry.key), customValue: '' };
    }

    const prefix = customPrefix(step, values, lang);
    if (prefix && stored.startsWith(prefix) && stored.length > prefix.length) {
      return {
        selectedKeys: [...picked.map((entry) => entry.key), CUSTOM_CHOICE_KEY],
        customValue: stored.slice(prefix.length).trim(),
      };
    }
  }

  return step.allowCustom
    ? { selectedKeys: [CUSTOM_CHOICE_KEY], customValue: stored }
    : { selectedKeys: [], customValue: '' };
}
