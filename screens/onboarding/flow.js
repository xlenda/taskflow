import { txt } from '../../constants/i18n';

// O roteiro do chat de onboarding, em EN + PT-BR.
// Todo campo de texto é { en, pt }. {app} → nome do app, {name} → nome respondido.
// `when(answers)` liga passos condicionais (lista de filhos).
// Chips gravam o valor canônico em inglês (option `en`).
//
// Enxugado em 20/08: a primeira pergunta é a que importa (o desejo, que vira a
// 1ª manifestação na tela Reveal) e SÓ ficam perguntas cujo campo alguém lê
// (utils/dreamToAffirmation lê hopedChange, whyMatters, obstacle, name, city,
// dreamLocation, dreamHome, kids, people — nada além disso é lido no app).
// Cortados por ninguém ler: age, gender, sexuality, work, workFeeling,
// relationshipStatus, pastInfluence, aboutYou, partnerDesire, manifestingSomeone,
// manifestingName. `skippable: true` mostra "Pular" no canto (pergunta que
// enriquece a personalização mas não é essencial).

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
    type: 'text',
    key: 'hopedChange',
    question: {
      en: 'What do you want to change in your life right now?',
      pt: 'O que você quer que mude na sua vida agora?',
    },
    placeholder: { en: 'Love, confidence, peace…', pt: 'Amor, confiança, paz…' },
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
    type: 'text',
    key: 'obstacle',
    skippable: true,
    question: {
      en: 'What feels like the biggest thing standing in your way right now?',
      pt: 'O que parece ser o maior obstáculo no seu caminho agora?',
    },
    placeholder: { en: 'Doubt, timing, money, fear…', pt: 'Dúvida, timing, dinheiro, medo…' },
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
    skippable: true,
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
    skippable: true,
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
