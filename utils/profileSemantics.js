const NON_INFORMATIVE_ANSWERS = new Set([
  'ainda nao sei',
  'i am not sure yet',
  'im not sure yet',
  'not sure yet',
  'nada especifico',
  'nothing specific',
  'prefer not to say',
  'prefiro nao responder',
]);

function semanticKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^0-9A-Za-z]+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function isNonInformativeProfileAnswer(value) {
  return NON_INFORMATIVE_ANSWERS.has(semanticKey(value));
}

// The onboarding stores the dream-home chip in canonical English ("Farmhouse"); a home she typed stays as written.
// Neutral phrases (no "your" or "my") fit a vision, an affirmation and the AI request alike.
const HOME_CHIPS = {
  'Luxury Penthouse': { pt: 'uma cobertura de luxo', en: 'a luxury penthouse' },
  'Beachfront Villa': { pt: 'uma casa à beira-mar', en: 'a beachfront villa' },
  'Modern Loft': { pt: 'um loft moderno', en: 'a modern loft' },
  'Cozy Cottage': { pt: 'um chalé aconchegante', en: 'a cozy cottage' },
  'Suburban Mansion': { pt: 'uma casa ampla no subúrbio', en: 'a spacious house in the suburbs' },
  Farmhouse: { pt: 'uma casa de fazenda', en: 'a farmhouse' },
  Cabin: { pt: 'uma cabana', en: 'a cabin' },
  'Tiny Home': { pt: 'uma minicasa', en: 'a tiny home' },
};

// The chip said in the language ('' when the answer is not a chip).
function homeInLanguage(value, lang) {
  const chip = HOME_CHIPS[String(value || '').trim()];
  return chip ? chip[lang === 'en' ? 'en' : 'pt'] : '';
}

module.exports = { homeInLanguage, isNonInformativeProfileAnswer };
