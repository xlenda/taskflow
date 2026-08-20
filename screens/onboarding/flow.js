import { txt } from '../../constants/i18n';

// The chat-onboarding script, faithful to the competitor flow, in EN + PT-BR.
// Every text field is { en, pt }. {app} → app name, {name} → the user's name answer.
// `when(answers)` gates conditional steps (kids list, specific person name).
// Chip answers are stored canonically in EN via option `en` values.

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
    id: 'preface',
    type: 'statement',
    needsContinue: true,
    lines: [
      {
        en: 'Before we begin, I have a few important questions.',
        pt: 'Antes de começarmos, tenho algumas perguntas importantes.',
      },
      {
        en: 'The more honest you are, the more personal {app} can feel.',
        pt: 'Quanto mais sincero você for, mais pessoal o {app} se torna.',
      },
      {
        en: 'Everything you share is completely confidential.',
        pt: 'Tudo o que você compartilhar é totalmente confidencial.',
      },
    ],
  },
  {
    id: 'name',
    type: 'text',
    key: 'name',
    question: { en: 'First, what should I call you?', pt: 'Primeiro, como devo te chamar?' },
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
    question: { en: 'Where do you live?', pt: 'Onde você mora?' },
    placeholder: { en: 'Your city', pt: 'Sua cidade' },
  },
  {
    id: 'age',
    type: 'text',
    key: 'age',
    question: { en: 'How old are you?', pt: 'Quantos anos você tem?' },
    placeholder: { en: '28', pt: '28' },
    keyboard: 'number-pad',
  },
  {
    id: 'gender',
    type: 'chips',
    key: 'gender',
    question: { en: "What's your gender?", pt: 'Qual é o seu gênero?' },
    options: [
      { en: 'Female', pt: 'Feminino' },
      { en: 'Male', pt: 'Masculino' },
      { en: 'Non-binary', pt: 'Não-binário' },
      { en: 'Prefer not to say', pt: 'Prefiro não dizer' },
    ],
  },
  {
    id: 'sexuality',
    type: 'text',
    key: 'sexuality',
    question: { en: 'What is your sexuality?', pt: 'Qual é a sua sexualidade?' },
    placeholder: { en: 'e.g. Straight, Gay, Bisexual…', pt: 'ex.: Hétero, Gay, Bissexual…' },
    optional: true,
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
    type: 'text',
    key: 'work',
    question: { en: 'What do you do for work?', pt: 'O que você faz da vida?' },
    placeholder: { en: 'Student, nurse, founder, designer…', pt: 'Estudante, enfermeira, fundador, designer…' },
  },
  {
    id: 'workFeel',
    type: 'chips',
    key: 'workFeeling',
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
    question: { en: "What's your relationship status?", pt: 'Qual é o seu estado civil?' },
    options: [
      { en: 'Single', pt: 'Solteiro(a)' },
      { en: 'In a relationship', pt: 'Em um relacionamento' },
      { en: 'Married', pt: 'Casado(a)' },
      { en: "It's complicated", pt: 'É complicado' },
    ],
  },
  {
    id: 'hope',
    type: 'text',
    key: 'hopedChange',
    question: {
      en: '{name}, what are you hoping changes in your life right now?',
      pt: '{name}, o que você espera que mude na sua vida agora?',
    },
    placeholder: { en: 'Love, confidence, peace…', pt: 'Amor, confiança, paz…' },
  },
  {
    id: 'why',
    type: 'text',
    key: 'whyMatters',
    question: {
      en: 'Why does this matter so much to you right now?',
      pt: 'Por que isso importa tanto para você agora?',
    },
    placeholder: { en: 'What will change if this came true?', pt: 'O que vai mudar se isso se realizar?' },
  },
  {
    id: 'obstacle',
    type: 'text',
    key: 'obstacle',
    question: {
      en: 'What feels like the biggest thing standing in your way right now?',
      pt: 'O que parece ser o maior obstáculo no seu caminho agora?',
    },
    placeholder: { en: 'Doubt, timing, money, fear…', pt: 'Dúvida, timing, dinheiro, medo…' },
  },
  {
    id: 'past',
    type: 'text',
    key: 'pastInfluence',
    question: {
      en: 'Is there anything from your past that still shapes what you want today?',
      pt: 'Existe algo do seu passado que ainda molda o que você quer hoje?',
    },
    placeholder: { en: 'Only share what feels relevant…', pt: 'Compartilhe só o que fizer sentido…' },
    optional: true,
  },
  {
    id: 'about',
    type: 'text',
    key: 'aboutYou',
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
    type: 'text',
    key: 'dreamLocation',
    question: {
      en: 'When you imagine your dream life, where are you living?',
      pt: 'Quando você imagina a vida dos seus sonhos, onde você está morando?',
    },
    placeholder: { en: 'Anywhere in the world…', pt: 'Em qualquer lugar do mundo…' },
  },
  {
    id: 'dreamHome',
    type: 'chips',
    key: 'dreamHome',
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
  },
  {
    id: 'intro-future',
    type: 'intro',
    icon: 'planet',
    title: { en: 'Meet your future self.', pt: 'Conheça o seu futuro eu.' },
    sub: {
      en: 'Step into the life you are calling in — one visualization at a time.',
      pt: 'Entre na vida que você está atraindo — uma visualização por vez.',
    },
  },
  {
    id: 'partner',
    type: 'text',
    key: 'partnerDesire',
    question: {
      en: '{name}, what kind of partner do you want to call in?',
      pt: '{name}, que tipo de parceiro(a) você quer atrair?',
    },
    placeholder: { en: 'How should they make you feel?', pt: 'Como essa pessoa deve te fazer sentir?' },
  },
  {
    id: 'specific',
    type: 'boolean',
    key: 'manifestingSomeone',
    question: {
      en: "Is there a specific person you're manifesting?",
      pt: 'Existe uma pessoa específica que você está manifestando?',
    },
  },
  {
    id: 'personName',
    type: 'text',
    key: 'manifestingName',
    question: {
      en: "What's the name of the person you're manifesting?",
      pt: 'Qual é o nome da pessoa que você está manifestando?',
    },
    placeholder: { en: 'Their name', pt: 'O nome da pessoa' },
    when: (a) => a.manifestingSomeone === true,
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
