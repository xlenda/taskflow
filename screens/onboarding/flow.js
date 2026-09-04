import { txt } from '../../constants/i18n';

const ADULT_AGE_RANGES = new Set(['18–24', '25–34', '35–44', '45–54', '55+']);

function normalizedAge(value) {
  return String(value || '')
    .trim()
    .replace(/[\u2014\u2212-]/g, '–')
    .replace(/\s+/g, '');
}

export function isUnder18Age(value) {
  const normalized = normalizedAge(value).toLocaleLowerCase();
  return normalized === 'under18' || normalized === 'menosde18';
}

export function ageConfirmsAdult(value) {
  return ADULT_AGE_RANGES.has(normalizedAge(value));
}

// O roteiro do chat de onboarding, em EN + PT-BR.
// Todo campo de texto é { en, pt }. {app} → nome do app, {name} → nome respondido.
// `when(answers)` liga passos condicionais (filhos e pessoa especifica).
// Chips gravam o valor canônico em inglês (option `en`).
//
// A pergunta do desejo continua cedo porque cria a primeira Cena-Ancora. O
// restante recompõe o roteiro completo documentado no clone da Stella.
// `skippable: true` mantém controle explícito nas perguntas íntimas.

export const FLOW = [
  {
    id: 'intro',
    type: 'statement',
    lines: [
      { en: 'Hello! Welcome to {app}.', pt: 'Olá! Bem-vindo ao {app}.' },
      {
        en: 'This is your space to manifest the life of your dreams.',
        pt: 'Este é o seu espaço para manifestar a vida dos seus sonhos.',
      },
    ],
  },
  {
    id: 'hope',
    type: 'chips',
    key: 'hopedChange',
    multiSelect: true,
    capitalizeAnswer: true,
    compact: true,
    question: {
      en: 'What do you want to change in your life right now?',
      pt: 'O que você quer que mude na sua vida agora?',
    },
    selectionHint: {
      en: 'Choose everything that feels true for you.',
      pt: 'Escolha tudo o que fizer sentido para você.',
    },
    options: [
      {
        en: 'Find love or strengthen a relationship',
        pt: 'Viver um amor ou fortalecer uma relação',
        answer: {
          en: 'find love or strengthen a relationship',
          pt: 'viver um amor ou fortalecer uma relação',
        },
      },
      {
        en: 'Have more money and financial freedom',
        pt: 'Ter mais dinheiro e liberdade financeira',
        answer: {
          en: 'have more money and financial freedom',
          pt: 'ter mais dinheiro e liberdade financeira',
        },
      },
      {
        en: 'Grow my career or business',
        pt: 'Crescer na carreira ou nos negócios',
        answer: {
          en: 'grow my career or business',
          pt: 'crescer na carreira ou nos negócios',
        },
      },
      {
        en: 'Improve my health and well-being',
        pt: 'Melhorar minha saúde e meu bem-estar',
        answer: {
          en: 'improve my health and well-being',
          pt: 'melhorar minha saúde e meu bem-estar',
        },
      },
      {
        en: 'Feel more confident and love myself',
        pt: 'Ter mais confiança e amor-próprio',
        answer: {
          en: 'feel more confident and love myself',
          pt: 'ter mais confiança e amor-próprio',
        },
      },
      {
        en: 'Have more peace and balance',
        pt: 'Ter mais paz e equilíbrio',
        answer: {
          en: 'have more peace and balance',
          pt: 'ter mais paz e equilíbrio',
        },
      },
      {
        en: 'Travel or move somewhere new',
        pt: 'Viajar ou morar em um lugar novo',
        answer: {
          en: 'travel or move somewhere new',
          pt: 'viajar ou morar em um lugar novo',
        },
      },
    ],
    storeLocalized: true,
    allowCustom: true,
    customPlaceholder: { en: 'Tell me what you want to change', pt: 'Conte o que você quer mudar' },
  },
  {
    id: 'why',
    type: 'text',
    key: 'whyMatters',
    skippable: true,
    question: {
      en: 'Why does this matter so much to you right now?',
      pt: 'Por que isso importa tanto para você agora?',
    },
    placeholder: { en: 'What will change if this came true?', pt: 'O que vai mudar se isso se realizar?' },
  },
  {
    id: 'obstacle',
    type: 'chips',
    key: 'obstacle',
    multiSelect: true,
    skippable: true,
    compact: true,
    question: {
      en: 'What feels like it is standing in your way right now?',
      pt: 'O que parece estar no seu caminho agora?',
    },
    selectionHint: {
      en: 'Choose one or more answers.',
      pt: 'Você pode escolher mais de uma resposta.',
    },
    options: [
      {
        en: 'Fear or self-doubt',
        pt: 'Medo ou insegurança',
        answer: { en: 'fear or self-doubt', pt: 'medo ou insegurança' },
      },
      {
        en: 'Lack of clarity',
        pt: 'Falta de clareza',
        answer: { en: 'lack of clarity', pt: 'falta de clareza' },
      },
      {
        en: 'Money or resources',
        pt: 'Dinheiro ou recursos',
        answer: { en: 'money or resources', pt: 'dinheiro ou recursos' },
      },
      {
        en: 'Time or energy',
        pt: 'Tempo ou energia',
        answer: { en: 'time or energy', pt: 'tempo ou energia' },
      },
      {
        en: 'Lack of consistency',
        pt: 'Falta de constância',
        answer: { en: 'lack of consistency', pt: 'falta de constância' },
      },
      {
        en: "Other people's opinions or lack of support",
        pt: 'Opinião dos outros ou falta de apoio',
        answer: {
          en: "other people's opinions or lack of support",
          pt: 'opinião dos outros ou falta de apoio',
        },
      },
      {
        en: 'External circumstances',
        pt: 'Circunstâncias externas',
        answer: { en: 'external circumstances', pt: 'circunstâncias externas' },
      },
      {
        en: 'Nothing specific',
        pt: 'Nada específico',
        answer: { en: 'nothing specific', pt: 'nada específico' },
      },
    ],
    storeLocalized: true,
    exclusiveOptions: ['Nothing specific'],
    allowCustom: true,
    customPlaceholder: { en: 'Describe it in your own words', pt: 'Descreva com suas palavras' },
  },
  {
    id: 'name',
    type: 'text',
    key: 'name',
    question: { en: 'By the way, what should I call you?', pt: 'A propósito, como devo te chamar?' },
    placeholder: { en: 'Your name', pt: 'Seu nome' },
  },
  {
    id: 'welcome-name',
    type: 'statement',
    lines: [{ en: 'Lovely. Welcome, {name}.', pt: 'Que lindo. Bem-vindo, {name}.' }],
  },
  {
    id: 'city',
    type: 'text',
    key: 'city',
    skippable: true,
    question: { en: 'Where do you live?', pt: 'Onde você mora?' },
    placeholder: { en: 'Your city', pt: 'Sua cidade' },
  },
  {
    id: 'age',
    type: 'chips',
    key: 'age',
    skippable: true,
    compact: true,
    question: { en: 'How old are you?', pt: 'Quantos anos você tem?' },
    options: [
      { en: 'Under 18', pt: 'Menos de 18' },
      { en: '18–24', pt: '18–24' },
      { en: '25–34', pt: '25–34' },
      { en: '35–44', pt: '35–44' },
      { en: '45–54', pt: '45–54' },
      { en: '55+', pt: '55+' },
      { en: 'Prefer not to say', pt: 'Prefiro não responder' },
    ],
  },
  {
    id: 'gender',
    type: 'chips',
    key: 'gender',
    skippable: true,
    compact: true,
    question: { en: "What's your gender?", pt: 'Qual é o seu gênero?' },
    options: [
      { en: 'Female', pt: 'Feminino' },
      { en: 'Male', pt: 'Masculino' },
      { en: 'Non-binary', pt: 'Não-binário' },
      { en: 'Prefer not to say', pt: 'Prefiro não dizer' },
    ],
    allowCustom: true,
    customPlaceholder: { en: 'How do you describe yourself?', pt: 'Como você se descreve?' },
  },
  {
    id: 'sexuality',
    type: 'chips',
    key: 'sexuality',
    skippable: true,
    compact: true,
    question: { en: 'What is your sexuality?', pt: 'Qual é a sua sexualidade?' },
    options: [
      { en: 'Straight', pt: 'Heterossexual' },
      { en: 'Gay or lesbian', pt: 'Gay ou lésbica' },
      { en: 'Bisexual', pt: 'Bissexual' },
      { en: 'Pansexual', pt: 'Pansexual' },
      { en: 'Asexual', pt: 'Assexual' },
      { en: 'Questioning', pt: 'Em descoberta' },
      { en: 'Prefer not to say', pt: 'Prefiro não responder' },
    ],
    allowCustom: true,
    customPlaceholder: { en: 'How do you describe yourself?', pt: 'Como você se descreve?' },
  },
  {
    id: 'hasKids',
    type: 'boolean',
    key: 'hasKids',
    question: { en: 'Do you have kids?', pt: 'Você tem filhos?' },
  },
  {
    id: 'kids',
    type: 'list',
    key: 'kids',
    question: { en: "What are your kids' names & ages?", pt: 'Quais os nomes e idades dos seus filhos?' },
    addLabel: { en: 'Add a child', pt: 'Adicionar filho(a)' },
    modalTitle: { en: 'Add Child', pt: 'Adicionar Filho(a)' },
    extraPlaceholder: { en: 'Age', pt: 'Idade' },
    extraKeyboard: 'number-pad',
    requireOne: true,
    when: (a) => a.hasKids === true,
  },
  {
    id: 'people',
    type: 'list',
    key: 'people',
    question: {
      en: 'Who are the people {app} should know matter most to you?',
      pt: 'Quem são as pessoas mais importantes da sua vida que o {app} deve conhecer?',
    },
    addLabel: { en: 'Add a person', pt: 'Adicionar pessoa' },
    modalTitle: { en: 'Add Person', pt: 'Adicionar Pessoa' },
    extraPlaceholder: { en: 'Relationship (mom, partner, friend…)', pt: 'Relação (mãe, parceiro, amigo…)' },
  },
  {
    id: 'work',
    type: 'chips',
    key: 'work',
    skippable: true,
    compact: true,
    question: { en: 'What do you do for work?', pt: 'O que você faz da vida?' },
    options: [
      {
        en: 'Employed',
        pt: 'Trabalho para uma empresa',
        answer: { en: 'a job at a company', pt: 'um emprego em uma empresa' },
      },
      {
        en: 'Self-employed or freelancer',
        pt: 'Sou autônomo(a) ou freelancer',
        answer: { en: 'freelance or self-employed work', pt: 'trabalho autônomo ou freelancer' },
      },
      {
        en: 'Building a business',
        pt: 'Estou empreendendo',
        answer: { en: 'building a business', pt: 'a construção do meu próprio negócio' },
      },
      { en: 'Student', pt: 'Sou estudante', answer: { en: 'studying', pt: 'meus estudos' } },
      {
        en: 'Caregiver or homemaker',
        pt: 'Cuido da casa ou da família',
        answer: { en: 'caring for my home or family', pt: 'o cuidado da casa ou da família' },
      },
      {
        en: 'Between jobs',
        pt: 'Estou entre trabalhos',
        answer: { en: 'a career transition', pt: 'uma transição de carreira' },
      },
      { en: 'Retired', pt: 'Sou aposentado(a)', answer: { en: 'retirement', pt: 'a aposentadoria' } },
    ],
    storeLocalized: true,
    allowCustom: true,
    customPlaceholder: { en: 'What do you do?', pt: 'Conte o que você faz' },
  },
  {
    id: 'workFeel',
    type: 'chips',
    key: 'workFeeling',
    skippable: true,
    compact: true,
    question: { en: 'How do you feel about your work?', pt: 'Como você se sente em relação ao seu trabalho?' },
    options: [
      { en: 'Love it', pt: 'Amo' },
      { en: "It's fine for now", pt: 'Está bom por enquanto' },
      { en: "I'm ready for something new", pt: 'Estou pronto para algo novo' },
      { en: "I'm building something on the side", pt: 'Estou construindo algo em paralelo' },
    ],
  },
  {
    id: 'rel',
    type: 'chips',
    key: 'relationshipStatus',
    skippable: true,
    compact: true,
    question: { en: "What's your relationship status?", pt: 'Qual é o seu estado civil?' },
    options: [
      { en: 'Single', pt: 'Solteiro(a)' },
      { en: 'Dating', pt: 'Conhecendo alguém' },
      { en: 'In a relationship', pt: 'Em um relacionamento' },
      { en: 'Married', pt: 'Casado(a)' },
      { en: 'Separated or divorced', pt: 'Separado(a) ou divorciado(a)' },
      { en: 'Widowed', pt: 'Viúvo(a)' },
      { en: "It's complicated", pt: 'É complicado' },
      { en: 'Not looking right now', pt: 'Não estou buscando agora' },
    ],
  },
  {
    id: 'past',
    type: 'text',
    key: 'pastInfluence',
    skippable: true,
    optional: true,
    question: {
      en: 'Is there anything from your past that still shapes what you want today?',
      pt: 'Existe algo do seu passado que ainda molda o que você quer hoje?',
    },
    placeholder: { en: 'Only share what feels relevant...', pt: 'Compartilhe só o que fizer sentido...' },
  },
  {
    id: 'about',
    type: 'text',
    key: 'aboutYou',
    skippable: true,
    question: {
      en: "Since we've never met, {name}, what should I know about you to understand you better?",
      pt: 'Como nunca nos vimos, {name}, o que eu deveria saber para te entender melhor?',
    },
    placeholder: { en: 'How would you describe yourself?', pt: 'Como você se descreveria?' },
  },
  {
    id: 'intro-visualize',
    type: 'intro',
    icon: 'sparkles',
    title: { en: 'Personalized visualizations.', pt: 'Visualizações personalizadas.' },
    sub: {
      en: 'Every affirmation and story is created from YOUR answers — never generic.',
      pt: 'Cada afirmação e história é criada a partir das SUAS respostas — nunca genérica.',
    },
  },
  {
    id: 'dream',
    type: 'statement',
    pause: 1800,
    lines: [
      { en: 'Now dream a little bigger, {name}.', pt: 'Agora sonhe um pouco maior, {name}.' },
      { en: "Don't be realistic. Don't hold back.", pt: 'Não seja realista. Não se segure.' },
      { en: 'Pretend anything is possible.', pt: 'Finja que tudo é possível.' },
    ],
  },
  {
    id: 'dreamPlace',
    type: 'chips',
    key: 'dreamLocation',
    skippable: true,
    compact: true,
    question: {
      en: 'When you imagine your dream life, where are you living?',
      pt: 'Quando você imagina a vida dos seus sonhos, onde você está morando?',
    },
    options: [
      { en: 'Where I live now, but better', pt: 'Onde moro hoje, mas do meu jeito' },
      { en: 'In a big city', pt: 'Em uma cidade grande' },
      { en: 'By the beach or coast', pt: 'Na praia ou no litoral' },
      { en: 'In the countryside or mountains', pt: 'No campo ou nas montanhas' },
      { en: 'In another country', pt: 'Em outro país' },
      { en: 'Traveling with no fixed base', pt: 'Viajando, sem lugar fixo' },
      { en: "I'm not sure yet", pt: 'Ainda não sei' },
    ],
    storeLocalized: true,
    allowCustom: true,
    customPlaceholder: { en: 'Which place do you picture?', pt: 'Qual lugar você imagina?' },
  },
  {
    id: 'dreamHome',
    type: 'chips',
    key: 'dreamHome',
    skippable: true,
    compact: true,
    question: { en: 'What kind of home would you want to live in?', pt: 'Em que tipo de casa você gostaria de morar?' },
    options: [
      { en: 'Luxury Penthouse', pt: 'Cobertura de Luxo' },
      { en: 'Beachfront Villa', pt: 'Vila à Beira-Mar' },
      { en: 'Modern Loft', pt: 'Loft Moderno' },
      { en: 'Cozy Cottage', pt: 'Chalé Aconchegante' },
      { en: 'Suburban Mansion', pt: 'Mansão no Subúrbio' },
      { en: 'Farmhouse', pt: 'Fazenda' },
      { en: 'Cabin', pt: 'Cabana' },
      { en: 'Tiny Home', pt: 'Mini Casa' },
    ],
    wrap: true,
    needsContinue: true,
    allowCustom: true,
    customPlaceholder: { en: 'Describe your dream home', pt: 'Descreva a casa dos seus sonhos' },
  },
  {
    id: 'intro-future',
    type: 'intro',
    icon: 'planet',
    title: { en: 'Meet your future self.', pt: 'Conheça o seu futuro eu.' },
    sub: {
      en: 'Step into the life you are calling in - one visualization at a time.',
      pt: 'Entre na vida que você está atraindo - uma visualização por vez.',
    },
  },
  {
    id: 'partner',
    type: 'chips',
    key: 'partnerDesire',
    multiSelect: true,
    skippable: true,
    compact: true,
    question: {
      en: '{name}, what kind of partner do you want to call in?',
      pt: '{name}, que tipo de parceiro(a) você quer atrair?',
    },
    selectionHint: {
      en: 'Choose all the qualities that matter to you.',
      pt: 'Escolha todas as qualidades que importam para você.',
    },
    options: [
      {
        en: 'Loving and affectionate',
        pt: 'Amoroso(a) e carinhoso(a)',
        answer: { en: 'love and affection', pt: 'afeto e carinho' },
      },
      {
        en: 'Loyal and trustworthy',
        pt: 'Leal e confiável',
        answer: { en: 'loyalty and trust', pt: 'lealdade e confiança' },
      },
      {
        en: 'A true companion and best friend',
        pt: 'Companheiro(a) e melhor amigo(a)',
        answer: { en: 'companionship and friendship', pt: 'companheirismo e amizade' },
      },
      {
        en: 'Emotionally mature',
        pt: 'Emocionalmente maduro(a)',
        answer: { en: 'emotional maturity', pt: 'maturidade emocional' },
      },
      {
        en: 'Communicative',
        pt: 'Comunicativo(a)',
        answer: { en: 'open communication', pt: 'comunicação aberta' },
      },
      {
        en: 'Supportive of my dreams',
        pt: 'Apoia os meus sonhos',
        answer: { en: 'support for my dreams', pt: 'apoio aos meus sonhos' },
      },
      {
        en: 'Fun and adventurous',
        pt: 'Divertido(a) e aventureiro(a)',
        answer: { en: 'joy and a sense of adventure', pt: 'leveza e espírito aventureiro' },
      },
      {
        en: 'Calm and grounded',
        pt: 'Calmo(a) e equilibrado(a)',
        answer: { en: 'calm and emotional balance', pt: 'calma e equilíbrio emocional' },
      },
      {
        en: 'Family-oriented',
        pt: 'Valoriza a família',
        answer: { en: 'shared value for family', pt: 'valorização da família' },
      },
    ],
    storeLocalized: true,
    allowCustom: true,
    customPlaceholder: { en: 'What matters most to you?', pt: 'O que mais importa para você?' },
  },
  {
    id: 'specific',
    type: 'boolean',
    key: 'manifestingSomeone',
    skippable: true,
    question: {
      en: "Is there a specific person you're manifesting?",
      pt: 'Existe uma pessoa específica que você está manifestando?',
    },
  },
  {
    id: 'personName',
    type: 'text',
    key: 'manifestingName',
    skippable: true,
    question: {
      en: "What's the name of the person you're manifesting?",
      pt: 'Qual é o nome da pessoa que você está manifestando?',
    },
    placeholder: { en: 'Their name', pt: 'O nome da pessoa' },
    when: (answers) => answers.manifestingSomeone === true,
  },
  {
    id: 'cloudPersonalization',
    type: 'boolean',
    key: 'cloudPersonalization',
    textSize: 21,
    shortTextSize: 16,
    compact: true,
    question: {
      en: 'Are you 18 or older and do you allow optional cloud processing? Anthropic creates scenes, with OpenAI as failover and Gemini as a compatibility fallback. Gemini also translates, creates images and interprets dreams; ElevenLabs narrates. Only needed data is sent; saved names stay on this device.',
      pt: 'Você tem 18 anos ou mais e permite processamento opcional em nuvem? A Anthropic cria cenas, com OpenAI como alternativa e Gemini como compatibilidade. Gemini também traduz, cria imagens e interpreta sonhos; ElevenLabs narra. Só o necessário é enviado; nomes salvos ficam no aparelho.',
    },
    yesLabel: { en: 'Allow', pt: 'Permitir' },
    noLabel: { en: 'Create on device', pt: 'Criar no aparelho' },
    when: (answers) => ageConfirmsAdult(answers.age),
  },
  {
    id: 'thanks',
    type: 'statement',
    pause: 1800,
    lines: [
      {
        en: "Thank you for sharing. That's all the information I need for now.",
        pt: 'Obrigada por compartilhar. Essas são todas as informações de que preciso por agora.',
      },
    ],
  },
];

export function fill(str, answers, app) {
  return String(str || '')
    .replace(/\{app\}/g, app)
    .replace(/\{name\}/g, String(answers.name || '').trim() || 'friend');
}

export function stepLines(step, answers, app, lang) {
  const raw = step.type === 'statement' ? step.lines : [step.question];
  return raw.map((s) => fill(txt(s, lang), answers, app));
}

// Categoria da 1ª manifestação inferida do desejo — só quando é óbvia pelo
// texto; senão devolve undefined e vale o default do AppContext.
// ponytail: heurística de palavra-chave; trocar por classificação de verdade
// só se a categoria errada começar a incomodar.
const CAT_RX = [
  ['Love', /amor|amoros|relacionament|casament|namor|love|relationship|partner|marria/i],
  ['Health', /sa[uú]de|corpo|peso|emagre|health|body|weight|fitness/i],
  ['Career', /carreira|trabalho|emprego|neg[oó]cio|empresa|career|job|work|business/i],
  ['Wealth', /dinheiro|rico|riqueza|financ|grana|sal[aá]rio|money|wealth|rich/i],
  ['Peace', /paz|calma|ansiedade|tranquil|peace|calm|anxiety/i],
  ['Confidence', /confian[çc]a|autoestima|confidence|self[- ]esteem/i],
];
export function inferCategory(text) {
  const t = String(text || '');
  const hit = CAT_RX.find(([, rx]) => rx.test(t));
  return hit ? hit[0] : undefined;
}
