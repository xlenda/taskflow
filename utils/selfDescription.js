// Shared by the offline fallback and the server prompt. The onboarding answer
// is often a quick list without punctuation (for example, "pro ativo bondoso").
// Turn common traits into grammatical qualities instead of quoting that draft.

const PT_TRAITS = Object.freeze({
  amorosa: 'afeto', amoroso: 'afeto',
  ambiciosa: 'ambicao', ambicioso: 'ambicao',
  autentica: 'autenticidade', autentico: 'autenticidade',
  bondosa: 'bondade', bondoso: 'bondade',
  calma: 'calma', calmo: 'calma',
  compassiva: 'compaixao', compassivo: 'compaixao',
  consistente: 'constancia',
  corajosa: 'coragem', corajoso: 'coragem',
  criativa: 'criatividade', criativo: 'criatividade',
  cuidadosa: 'cuidado', cuidadoso: 'cuidado',
  curiosa: 'curiosidade', curioso: 'curiosidade',
  dedicada: 'dedicacao', dedicado: 'dedicacao',
  determinada: 'determinacao', determinado: 'determinacao',
  disciplinada: 'disciplina', disciplinado: 'disciplina',
  empatica: 'empatia', empatico: 'empatia',
  espiritual: 'espiritualidade',
  focada: 'foco', focado: 'foco',
  forte: 'forca',
  generosa: 'generosidade', generoso: 'generosidade',
  gentil: 'gentileza',
  honesta: 'honestidade', honesto: 'honestidade',
  independente: 'autonomia', leal: 'lealdade',
  organizada: 'organizacao', organizado: 'organizacao',
  otimista: 'otimismo', paciente: 'paciencia', persistente: 'persistencia',
  proativa: 'proatividade', proativo: 'proatividade',
  responsavel: 'responsabilidade', resiliente: 'resiliencia',
  sensivel: 'sensibilidade',
  trabalhadora: 'dedicacao', trabalhador: 'dedicacao',
});

const PT_QUALITIES = Object.freeze({
  afeto: ['meu afeto', 'seu afeto'],
  ambicao: ['minha ambi\u00e7\u00e3o', 'sua ambi\u00e7\u00e3o'],
  autenticidade: ['minha autenticidade', 'sua autenticidade'],
  autonomia: ['minha autonomia', 'sua autonomia'],
  bondade: ['minha bondade', 'sua bondade'],
  calma: ['minha calma', 'sua calma'],
  compaixao: ['minha compaix\u00e3o', 'sua compaix\u00e3o'],
  constancia: ['minha const\u00e2ncia', 'sua const\u00e2ncia'],
  coragem: ['minha coragem', 'sua coragem'],
  criatividade: ['minha criatividade', 'sua criatividade'],
  cuidado: ['meu cuidado', 'seu cuidado'],
  curiosidade: ['minha curiosidade', 'sua curiosidade'],
  dedicacao: ['minha dedica\u00e7\u00e3o', 'sua dedica\u00e7\u00e3o'],
  determinacao: ['minha determina\u00e7\u00e3o', 'sua determina\u00e7\u00e3o'],
  disciplina: ['minha disciplina', 'sua disciplina'],
  empatia: ['minha empatia', 'sua empatia'],
  espiritualidade: ['minha espiritualidade', 'sua espiritualidade'],
  foco: ['meu foco', 'seu foco'],
  forca: ['minha for\u00e7a', 'sua for\u00e7a'],
  generosidade: ['minha generosidade', 'sua generosidade'],
  gentileza: ['minha gentileza', 'sua gentileza'],
  honestidade: ['minha honestidade', 'sua honestidade'],
  lealdade: ['minha lealdade', 'sua lealdade'],
  organizacao: ['minha organiza\u00e7\u00e3o', 'sua organiza\u00e7\u00e3o'],
  otimismo: ['meu otimismo', 'seu otimismo'],
  paciencia: ['minha paci\u00eancia', 'sua paci\u00eancia'],
  persistencia: ['minha persist\u00eancia', 'sua persist\u00eancia'],
  proatividade: ['minha proatividade', 'sua proatividade'],
  responsabilidade: ['minha responsabilidade', 'sua responsabilidade'],
  resiliencia: ['minha resili\u00eancia', 'sua resili\u00eancia'],
  sensibilidade: ['minha sensibilidade', 'sua sensibilidade'],
});

const PT_CONCEPT_LABELS = Object.freeze({
  ambicao: 'ambi\u00e7\u00e3o', compaixao: 'compaix\u00e3o', constancia: 'const\u00e2ncia',
  dedicacao: 'dedica\u00e7\u00e3o', determinacao: 'determina\u00e7\u00e3o', forca: 'for\u00e7a',
  organizacao: 'organiza\u00e7\u00e3o', paciencia: 'paci\u00eancia', persistencia: 'persist\u00eancia',
  resiliencia: 'resili\u00eancia',
});

const EN_TRAITS = Object.freeze({
  affectionate: 'affection', ambitious: 'ambition', authentic: 'authenticity', brave: 'courage',
  calm: 'calm', caring: 'care', compassionate: 'compassion', consistent: 'consistency',
  creative: 'creativity', curious: 'curiosity', dedicated: 'dedication', determined: 'determination',
  disciplined: 'discipline', empathetic: 'empathy', empathic: 'empathy', focused: 'focus',
  generous: 'generosity', gentle: 'gentleness', honest: 'honesty', independent: 'independence',
  kind: 'kindness', loving: 'affection', loyal: 'loyalty', optimistic: 'optimism',
  organized: 'organization', patient: 'patience', persistent: 'persistence', proactive: 'initiative',
  resilient: 'resilience', responsible: 'responsibility', sensitive: 'sensitivity', spiritual: 'spirituality',
  strong: 'strength', hardworking: 'dedication',
});

function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function clean(value, max = 220) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .replace(/[.!?;,:\s]+$/g, '');
}

function joinNatural(values, conjunction) {
  const unique = [...new Set(values.filter(Boolean))];
  if (unique.length < 2) return unique[0] || '';
  if (unique.length === 2) return `${unique[0]} ${conjunction} ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')} ${conjunction} ${unique[unique.length - 1]}`;
}

function normalizePtDraft(value) {
  return clean(value)
    .replace(/\bpr[o\u00f3]\s*[- ]\s*ativ([oa]s?)\b/gi, 'proativ$1')
    .replace(/^\s*(?:eu\s+)?(?:sou|me\s+considero|me\s+vejo\s+como|me\s+descrevo\s+como)\s+/i, '')
    .replace(/^uma\s+pessoa\s+/i, '')
    .trim();
}

function ptSegments(value) {
  const normalized = normalizePtDraft(value);
  if (!normalized) return [];
  const explicit = normalized
    .split(/\s*(?:,|;|\/|\||\be\s+tamb[e\u00e9]m\b|\btamb[e\u00e9]m\b|\be\b)\s*/i)
    .map((part) => clean(part))
    .filter(Boolean);
  if (explicit.length > 1) {
    return explicit.flatMap((part) => {
      const partWords = fold(part).split(/\s+/).filter(Boolean);
      return partWords.length > 1 && partWords.every((word) => PT_TRAITS[word])
        ? partWords
        : [part];
    });
  }

  const words = fold(normalized).split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 5 && words.every((word) => PT_TRAITS[word])) {
    return words;
  }
  return explicit;
}

function ptConcept(segment) {
  const natural = clean(segment).toLocaleLowerCase('pt-BR');
  const key = fold(segment);
  const quality = PT_TRAITS[key];
  if (quality) {
    const phrasing = PT_QUALITIES[quality];
    return { concept: quality, firstPerson: phrasing[0], secondPerson: phrasing[1] };
  }

  let match = natural.match(/^dedicad[oa]\s+a\s+(.+)$/);
  if (match) {
    return {
      concept: `cuidado com ${match[1]}`,
      firstPerson: `meu cuidado com ${match[1]}`,
      secondPerson: `seu cuidado com ${match[1]}`,
    };
  }

  match = natural.match(/^(?:estou\s+)?aprendendo\s+a\s+(.+)$/);
  if (match) {
    return {
      concept: `disposi\u00e7\u00e3o para aprender a ${match[1]}`,
      firstPerson: `minha disposi\u00e7\u00e3o para aprender a ${match[1]}`,
      secondPerson: `sua disposi\u00e7\u00e3o para aprender a ${match[1]}`,
    };
  }
  match = natural.match(/^aprendo\s+(.+)$/);
  if (match) {
    return {
      concept: `abertura para aprender ${match[1]}`,
      firstPerson: `minha abertura para aprender ${match[1]}`,
      secondPerson: `sua abertura para aprender ${match[1]}`,
    };
  }
  match = natural.match(/^gosto\s+de\s+(.+)$/);
  if (match) {
    return {
      concept: `interesse por ${match[1]}`,
      firstPerson: `meu interesse por ${match[1]}`,
      secondPerson: `seu interesse por ${match[1]}`,
    };
  }
  if (/^(?:nao|nunca)\s+desisto\b/.test(key)) {
    return {
      concept: 'persistencia',
      firstPerson: 'minha persistência',
      secondPerson: 'sua persistência',
    };
  }
  return null;
}

function interpretPortuguese(value) {
  const segments = ptSegments(value);
  const interpreted = segments.map(ptConcept);
  // Partial interpretation can silently erase an important part of what the
  // person wrote. In that case the remote model receives the cleaned original,
  // while the conservative offline fallback simply omits this detail.
  if (!interpreted.length || interpreted.some((concept) => !concept)) return null;
  const concepts = interpreted.slice(0, 4);
  const labels = concepts.map((item) => PT_CONCEPT_LABELS[item.concept] || item.concept);
  return {
    lang: 'pt',
    concepts: labels,
    affirmationFragment: joinNatural(concepts.map((item) => item.firstPerson), 'e'),
    storyFragment: joinNatural(concepts.map((item) => item.secondPerson), 'e'),
    providerValue: `Qualidades reconhecidas pela pessoa: ${joinNatural(labels, 'e')}.`,
  };
}

function interpretEnglish(value) {
  const normalized = clean(value)
    .replace(/^\s*(?:i\s+am|i'm|i\s+consider\s+myself|i\s+see\s+myself\s+as)\s+/i, '')
    .trim();
  if (!normalized) return null;
  const explicit = normalized
    .split(/\s*(?:,|;|\/|\||\band\s+also\b|\balso\b|\band\b)\s*/i)
    .map((part) => clean(part))
    .filter(Boolean);
  let segments = explicit;
  segments = explicit.flatMap((part) => {
    const words = fold(part).split(/\s+/).filter(Boolean);
    return words.length > 1 && words.length <= 5 && words.every((word) => EN_TRAITS[word])
      ? words
      : [part];
  });
  const interpreted = segments.map((segment) => EN_TRAITS[fold(segment)]);
  if (!interpreted.length || interpreted.some((quality) => !quality)) return null;
  const unique = [...new Set(interpreted)].slice(0, 4);
  return {
    lang: 'en',
    concepts: unique,
    affirmationFragment: joinNatural(unique.map((quality) => `my ${quality}`), 'and'),
    storyFragment: joinNatural(unique.map((quality) => `your ${quality}`), 'and'),
    providerValue: `Personal qualities recognized by the person: ${joinNatural(unique, 'and')}.`,
  };
}

function interpretSelfDescription(value, lang = 'pt') {
  return lang === 'en' ? interpretEnglish(value) : interpretPortuguese(value);
}

module.exports = {
  interpretSelfDescription,
  _internals: { fold, normalizePtDraft, ptSegments },
};
