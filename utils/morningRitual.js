const THEMES = ['clarity', 'courage', 'peace', 'connection', 'abundance', 'renewal'];
const FEELINGS = ['calm', 'joyful', 'curious', 'anxious', 'confused', 'powerful'];

const compact = (value, max = 1600) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

function hash(value) {
  let result = 0;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    result = (result * 31 + text.charCodeAt(index)) >>> 0;
  }
  return result;
}

const FEELING_THEME = {
  calm: 'peace',
  joyful: 'abundance',
  curious: 'clarity',
  anxious: 'courage',
  confused: 'clarity',
  powerful: 'courage',
};

const FEELING_LABELS = {
  pt: {
    calm: 'calma',
    joyful: 'feliz',
    curious: 'curiosa',
    anxious: 'ansiosa',
    confused: 'confusa',
    powerful: 'poderosa',
  },
  en: {
    calm: 'calm',
    joyful: 'joyful',
    curious: 'curious',
    anxious: 'anxious',
    confused: 'confused',
    powerful: 'powerful',
  },
};

const THEME_LABELS = {
  pt: {
    clarity: 'clareza',
    courage: 'coragem',
    peace: 'paz',
    connection: 'conexão',
    abundance: 'possibilidade',
    renewal: 'recomeço',
  },
  en: {
    clarity: 'clarity',
    courage: 'courage',
    peace: 'peace',
    connection: 'connection',
    abundance: 'possibility',
    renewal: 'a new beginning',
  },
};

const SENSITIVE_DREAM = /\b(mort[eoas]*|morrer|suic[ií]d|sangue|assassin|estupro|abus[oa]|viol[eê]ncia|ferid[oa]|arma|tiro|acidente|dead|death|dying|suicid|blood|murder|kill|rape|abuse|violence|wound|weapon|gun|shoot|crash)\b/i;

const ANCHORED_AFFIRMATIONS = {
  pt: {
    clarity: (anchor) =>
      `Eu noto a imagem “${anchor}” e o que ela desperta em mim; não preciso decifrá-la para escolher meu próximo passo.`,
    courage: (anchor) =>
      `Eu lembro da imagem “${anchor}” sem tratá-la como previsão, volto ao presente e escolho avançar com coragem e cuidado.`,
    peace: (anchor) =>
      `Eu noto a imagem “${anchor}” e escolho guardar apenas a sensação que me ajuda a respirar com mais calma hoje.`,
    connection: (anchor) =>
      `Eu noto a imagem “${anchor}” e escolho cultivar vínculos recíprocos sem me abandonar.`,
    abundance: (anchor) =>
      `Eu uso a imagem “${anchor}” como ponto de reflexão e volto ao que posso construir com presença e constância.`,
    renewal: (anchor) =>
      `Eu observo a imagem “${anchor}” sem impor um significado e escolho abrir espaço a um começo mais leve hoje.`,
  },
  en: {
    clarity: (anchor) =>
      `I notice the image “${anchor}” and what it stirs in me; I do not need to decode it before choosing my next step.`,
    courage: (anchor) =>
      `I remember the image “${anchor}” without treating it as a prediction, return to the present and choose courage and care.`,
    peace: (anchor) =>
      `I notice the image “${anchor}” and keep only the feeling that helps me breathe more calmly today.`,
    connection: (anchor) =>
      `I notice the image “${anchor}” and choose to nurture reciprocal bonds without abandoning myself.`,
    abundance: (anchor) =>
      `I use the image “${anchor}” as a point for reflection and return to what I can steadily build.`,
    renewal: (anchor) =>
      `I observe the image “${anchor}” without imposing a meaning and choose to make room for a lighter beginning today.`,
  },
};

const SENSITIVE_REFLECTION = {
  pt: 'O sonho trouxe uma imagem intensa. Isso não é uma previsão: você pode deixá-la na noite e voltar ao que é seguro e real agora.',
  en: 'The dream brought an intense image. It is not a prediction: you can leave it in the night and return to what is safe and real now.',
};

function atWordBoundary(value, max) {
  const text = compact(value, max + 20);
  if (text.length <= max) return text;
  const clipped = text.slice(0, max + 1);
  const boundary = clipped.lastIndexOf(' ');
  return (boundary > 24 ? clipped.slice(0, boundary) : clipped.slice(0, max)).trim();
}

export function extractDreamAnchor(dream, lang = 'pt') {
  const language = lang === 'en' ? 'en' : 'pt';
  const source = compact(dream);
  if (!source) return { text: '', redacted: false };
  if (SENSITIVE_DREAM.test(source)) return { text: '', redacted: true };

  let firstImage = source.split(/[.!?\n]/)[0].trim();
  if (language === 'pt') {
    firstImage = firstImage
      .replace(/^(?:eu\s+)?(?:sonhei\s+(?:que|com)\s+|estava\s+|vi\s+|encontrei\s+|caminhava\s+|andava\s+|fui\s+|cheguei\s+)/i, '')
      .replace(/^(?:em|numa?|n[oa]s?)\s+/i, '');
  } else {
    firstImage = firstImage
      .replace(/^(?:i\s+)?(?:dreamed\s+(?:that|about|of)\s+|was\s+|saw\s+|found\s+|walked\s+|went\s+|arrived\s+)/i, '')
      .replace(/^(?:in|at|on)\s+/i, '');
  }
  firstImage = firstImage
    .replace(/[<>{}\[\]“”"]/g, '')
    .replace(/^[-,;:\s]+|[-,;:\s]+$/g, '')
    .trim();
  return { text: atWordBoundary(firstImage || source, 88), redacted: false };
}

// Fallback deterministico para transformar o relato da propria pessoa quando
// a personalizacao remota nao estiver disponivel. Nao e um deck publico.
const THEME_AFFIRMATIONS = {
  pt: {
    clarity: [
      'Eu escuto o que sinto com calma e escolho o próximo passo que faz sentido para mim.',
      'Minha intuição e minha razão podem caminhar juntas. Hoje eu escolho com clareza.',
    ],
    courage: [
      'Eu estou segura no presente e encontro coragem para atravessar o que vier, um passo de cada vez.',
      'Eu reconheço minha força sem precisar lutar com tudo. Hoje eu ajo com coragem e gentileza.',
    ],
    peace: [
      'Eu começo este dia em paz. Minha respiração me devolve ao que é seguro e real agora.',
      'Eu acolho o que senti durante a noite e escolho levar leveza para o meu dia.',
    ],
    connection: [
      'Eu mereço vínculos recíprocos, seguros e gentis, e começo oferecendo essa presença a mim.',
      'Eu recebo e ofereço amor com clareza. Há espaço para conexão sem que eu me abandone.',
    ],
    abundance: [
      'Eu reconheço as possibilidades ao meu redor e avanço com constância em direção ao que desejo construir.',
      'Eu tenho recursos, criatividade e presença para construir uma vida próspera em passos reais.',
    ],
    renewal: [
      'Eu posso recomeçar sem apagar quem fui. Hoje escolho movimento, cuidado e uma energia nova.',
      'Eu libero o que já cumpriu seu papel e abro espaço para um começo mais leve.',
    ],
  },
  en: {
    clarity: [
      'I listen to what I feel calmly and choose the next step that makes sense for me.',
      'My intuition and reason can walk together. Today I choose with clarity.',
    ],
    courage: [
      'I am safe in the present, and I find courage for what comes next, one step at a time.',
      'I recognize my strength without fighting everything. Today I act with courage and kindness.',
    ],
    peace: [
      'I begin this day in peace. My breath brings me back to what is safe and real right now.',
      'I welcome what I felt during the night and choose to carry lightness into my day.',
    ],
    connection: [
      'I deserve reciprocal, safe and gentle relationships, beginning with the presence I offer myself.',
      'I give and receive love with clarity. There is room for connection without abandoning myself.',
    ],
    abundance: [
      'I notice the possibilities around me and move steadily toward what I want to build.',
      'I have the resources, creativity and presence to build a prosperous life through real steps.',
    ],
    renewal: [
      'I can begin again without erasing who I was. Today I choose movement, care and new energy.',
      'I release what has served its purpose and make room for a lighter beginning.',
    ],
  },
};

const REFLECTIONS = {
  pt: {
    calm: 'A calma que ficou pode ser uma pista sobre o que seu corpo quer preservar hoje.',
    joyful: 'A alegria que ficou pode mostrar uma experiência que você deseja cultivar com mais intenção.',
    curious: 'A curiosidade não exige uma resposta imediata. Ela pode abrir uma pergunta boa para o seu dia.',
    anxious: 'O desconforto pode ser acolhido como um pedido de segurança, não como uma previsão.',
    confused: 'Você não precisa decifrar tudo. Pode escolher apenas o significado que ajuda você a seguir com clareza.',
    powerful: 'A força que apareceu no sonho pode lembrar uma capacidade que já existe em você.',
    default: 'Um sonho não precisa ser previsão. Você pode escolher o significado que ajuda a começar bem o dia.',
  },
  en: {
    calm: 'The calm that remained may point to what your body wants to preserve today.',
    joyful: 'The joy that remained may reveal an experience you want to cultivate more intentionally.',
    curious: 'Curiosity does not need an immediate answer. It can open a useful question for your day.',
    anxious: 'Discomfort can be welcomed as a request for safety, not treated as a prediction.',
    confused: 'You do not have to decode everything. Choose only the meaning that helps you move with clarity.',
    powerful: 'The strength that appeared in your dream can remind you of a capacity already within you.',
    default: 'A dream does not have to be a prediction. You can choose the meaning that helps you begin well.',
  },
};

export function inferDreamTheme(_dream, feeling) {
  const knownFeeling = FEELINGS.includes(feeling) ? feeling : '';
  return knownFeeling ? FEELING_THEME[knownFeeling] : 'clarity';
}

export function createDreamAffirmation({ dream, feeling, theme = 'auto', lang = 'pt' } = {}) {
  const cleanDream = compact(dream);
  const language = lang === 'en' ? 'en' : 'pt';
  const cleanFeeling = FEELINGS.includes(feeling) ? feeling : '';
  const themeWasChosen = THEMES.includes(theme);
  const selectedTheme = themeWasChosen ? theme : inferDreamTheme(cleanDream, cleanFeeling);
  const dreamAnchor = extractDreamAnchor(cleanDream, language);
  const options = THEME_AFFIRMATIONS[language][selectedTheme];
  const affirmation = dreamAnchor.text
    ? ANCHORED_AFFIRMATIONS[language][selectedTheme](dreamAnchor.text)
    : options[hash(`${cleanDream}|${cleanFeeling}|${selectedTheme}`) % options.length];
  const feelingLabel = cleanFeeling ? FEELING_LABELS[language][cleanFeeling] : '';
  const reflection = dreamAnchor.redacted
    ? SENSITIVE_REFLECTION[language]
    : dreamAnchor.text
    ? language === 'pt'
      ? `Você trouxe a imagem “${dreamAnchor.text}”${
          feelingLabel ? ` e acordou ${feelingLabel}` : ''
        }. ${
          themeWasChosen
            ? `Você escolheu levar ${THEME_LABELS.pt[selectedTheme]} para o dia.`
            : feelingLabel
            ? `A Celeste usou apenas esse sentimento para sugerir ${THEME_LABELS.pt[selectedTheme]}.`
            : `Sem atribuir sentido à imagem, a Celeste oferece ${THEME_LABELS.pt[selectedTheme]} como ponto de partida.`
        } A imagem não é previsão nem diagnóstico.`
      : `You brought back the image “${dreamAnchor.text}”${
          feelingLabel ? ` and woke up feeling ${feelingLabel}` : ''
        }. ${
          themeWasChosen
            ? `You chose to carry ${THEME_LABELS.en[selectedTheme]} into the day.`
            : feelingLabel
            ? `Celeste used only that feeling to suggest ${THEME_LABELS.en[selectedTheme]}.`
            : `Without assigning meaning to the image, Celeste offers ${THEME_LABELS.en[selectedTheme]} as a starting point.`
        } The image is not a prediction or diagnosis.`
    : REFLECTIONS[language][cleanFeeling] || REFLECTIONS[language].default;
  const usedDetails = [
    ...(dreamAnchor.text ? ['dream_anchor'] : []),
    ...(cleanFeeling ? ['feeling'] : []),
    'theme',
  ];

  return {
    dream: cleanDream,
    feeling: cleanFeeling,
    theme: selectedTheme,
    affirmation,
    reflection,
    dreamAnchor: dreamAnchor.text,
    usedDetails,
    generatorVersion: 'dream-local-v3',
  };
}
