const THEMES = ['clarity', 'courage', 'peace', 'connection', 'abundance', 'renewal'];
const FEELINGS = ['calm', 'joyful', 'curious', 'anxious', 'confused', 'powerful'];
const { interpretSelfDescription } = require('./selfDescription');

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

const SENSITIVE_DREAM = /\b(?:mort[eoas]*|morrer|morreu|cad[aá]ver|suic[ií]d|sangue|sangrar|ensanguent|assassin|estupro|abus[oa]|viol[eê]ncia|violent[oa]|agress[aã]o|ferid[oa]|ferimento|arma|tiro|bala|faca|facada|l[aâ]mina|serra|motosserra|eletrosserra|cort(?:ar|ad[oa]s?|ou|ei|ando)|amput|decapit|esquartej|mutil|dilacer|desmembr|atropel|acidente|dead|death|dying|corpse|suicid|blood|bleed|murder|kill|rape|abuse|violence|violent|assault|wound|injur|weapon|gun|shoot|bullet|knife|stab|blade|chainsaw|cut|slice|amputat|decapitat|dismember|mutilat|run\s+over|crash)\b/i;

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
    powerful: 'A sensação de força ao acordar pode lembrar uma capacidade que você já consegue praticar.',
    default: 'O que você sentiu ao acordar pode virar uma pergunta cuidadosa sobre o que precisa hoje.',
  },
  en: {
    calm: 'The calm that remained may point to what your body wants to preserve today.',
    joyful: 'The joy that remained may reveal an experience you want to cultivate more intentionally.',
    curious: 'Curiosity does not need an immediate answer. It can open a useful question for your day.',
    anxious: 'Discomfort can be welcomed as a request for safety, not treated as a prediction.',
    confused: 'You do not have to decode everything. Choose only the meaning that helps you move with clarity.',
    powerful: 'The sense of strength you woke with may point to a capacity you can already practise.',
    default: 'What you felt on waking may become a careful question about what you need today.',
  },
};

const REFLECTION_BOUNDARY = {
  pt: 'Essa é apenas uma possibilidade de reflexão, não uma previsão, diagnóstico ou verdade escondida.',
  en: 'This is only one possible reflection, not a prediction, diagnosis, or hidden truth.',
};

const THEME_REFLECTIONS = {
  pt: {
    clarity: 'Uma leitura construtiva possível é que sua mente esteja tentando organizar o que ainda parece confuso e devolver a você poder de escolha.',
    courage: 'Uma leitura construtiva possível é que sua mente esteja ensaiando como proteger o que importa e recuperar sua capacidade de agir.',
    peace: 'Uma leitura construtiva possível é que sua mente esteja pedindo menos alerta e mais espaço para segurança, descanso e presença.',
    connection: 'Uma leitura construtiva possível é que sua mente esteja elaborando necessidades de vínculo, reciprocidade e pertencimento.',
    abundance: 'Uma leitura construtiva possível é que sua mente esteja reorganizando desejos de possibilidade, autonomia e recursos com significado.',
    renewal: 'Uma leitura construtiva possível é que sua mente esteja abrindo espaço para encerrar um ciclo e experimentar uma forma mais leve de seguir.',
  },
  en: {
    clarity: 'One constructive possibility is that your mind is organizing what still feels unclear and returning a sense of choice to you.',
    courage: 'One constructive possibility is that your mind is rehearsing how to protect what matters and recover your capacity to act.',
    peace: 'One constructive possibility is that your mind is asking for less vigilance and more room for safety, rest, and presence.',
    connection: 'One constructive possibility is that your mind is working through needs for connection, reciprocity, and belonging.',
    abundance: 'One constructive possibility is that your mind is reorganizing wishes for possibility, autonomy, and meaningful resources.',
    renewal: 'One constructive possibility is that your mind is making room to close a cycle and try a lighter way forward.',
  },
};

const DREAM_THEME_SIGNALS = [
  {
    theme: 'connection',
    pattern: /\b(?:amor|amar|parceir|namor|casament|fam[ií]li|amizad|amig|sozinh|abandon|rejei[cç]|pertenc|love|partner|marri|family|friend|lonely|abandon|reject|belong)\b/i,
  },
  {
    theme: 'renewal',
    pattern: /\b(?:mudan[cç]|recome[cç]|come[cç]|termin|partid|chegad|novo|nova|viaj|transform|change|restart|begin|ending|leav|arriv|new|travel|transform)\b/i,
  },
  {
    theme: 'courage',
    pattern: /\b(?:medo|ansios|pres[oa]|fug|perseg|amea[cç]|impot[eê]n|coragem|fear|anxious|trapp|escap|chas|threat|powerless|courage)\b/i,
  },
  {
    theme: 'peace',
    pattern: /\b(?:calm|paz|descans|segur|al[ií]vio|tranquil|mar|oceano|[aá]gua|peace|rest|safe|relief|quiet|sea|ocean|water)\b/i,
  },
  {
    theme: 'abundance',
    pattern: /\b(?:trabalh|dinheir|prosper|conquist|oportun|fazenda|casa|work|money|prosper|achiev|opportun|farm|home)\b/i,
  },
];

function profileResource(profile, language) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const description = compact(source.aboutYou || source.selfDescription, 600);
  const interpreted = interpretSelfDescription(description, language);
  return interpreted ? compact(interpreted.affirmationFragment, 220) : '';
}

function weaveProfileResource(affirmation, resource, language) {
  if (!resource) return affirmation;
  return language === 'pt'
    ? `${affirmation} Eu reconheço ${resource} como recursos que posso praticar com gentileza.`
    : `${affirmation} I recognize ${resource} as resources I can practise with care.`;
}

export function inferDreamTheme(dream, feeling) {
  const knownFeeling = FEELINGS.includes(feeling) ? feeling : '';
  const semanticTheme = DREAM_THEME_SIGNALS.find((item) => item.pattern.test(compact(dream)))?.theme;
  return semanticTheme || (knownFeeling ? FEELING_THEME[knownFeeling] : 'clarity');
}

export function createDreamAffirmation({ dream, feeling, theme = 'auto', lang = 'pt', profile } = {}) {
  const cleanDream = compact(dream);
  const language = lang === 'en' ? 'en' : 'pt';
  const cleanFeeling = FEELINGS.includes(feeling) ? feeling : '';
  const themeWasChosen = THEMES.includes(theme);
  const selectedTheme = themeWasChosen ? theme : inferDreamTheme(cleanDream, cleanFeeling);
  const sensitive = SENSITIVE_DREAM.test(cleanDream);
  const options = THEME_AFFIRMATIONS[language][selectedTheme];
  const baseAffirmation = options[hash(`${cleanDream}|${cleanFeeling}|${selectedTheme}`) % options.length];
  const affirmation = weaveProfileResource(
    baseAffirmation,
    profileResource(profile, language),
    language
  );
  const reflection = sensitive
    ? `${SENSITIVE_REFLECTION[language]} ${THEME_REFLECTIONS[language][selectedTheme]} ${REFLECTION_BOUNDARY[language]}`
    : `${THEME_REFLECTIONS[language][selectedTheme]} ${REFLECTIONS[language][cleanFeeling] || REFLECTIONS[language].default} ${REFLECTION_BOUNDARY[language]}`;
  const usedDetails = [
    'dream_semantics',
    ...(cleanFeeling ? ['feeling'] : []),
    'theme',
  ];

  return {
    dream: cleanDream,
    feeling: cleanFeeling,
    theme: selectedTheme,
    affirmation,
    reflection,
    // The original report remains in `dream`; generated copy never exposes a
    // fragment that another screen could accidentally present as affirmation.
    dreamAnchor: '',
    usedDetails,
    generatorVersion: 'dream-local-v4',
  };
}
