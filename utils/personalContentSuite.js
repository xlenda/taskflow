const { interpretSelfDescription } = require('./selfDescription');
const { homeInLanguage, isNonInformativeProfileAnswer } = require('./profileSemantics');
// The first local generator: suites built before 21/10 keep it (utils/personalJourney.js), and every suite keeps its
// image directions, so the same answers keep the same image briefs (they key the paid journey images).
const frozen = require('./personalContentSuiteV1');

const { JOURNEY_CATEGORIES, JOURNEY_SUITE_VERSION, itemKey } = frozen;
const VISION_PREFIX = {
  pt: 'Imagine uma possibilidade do seu futuro:',
  en: 'Imagine one possibility in your future:',
};

function clean(value, max = 400) {
  const source = Array.isArray(value) ? value.join(', ') : value;
  return typeof source === 'string'
    ? source
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

function informative(value, max) {
  const text = clean(value, max);
  return text && !isNonInformativeProfileAnswer(text) ? text : '';
}

function trimSentence(value, max = 150) {
  return informative(value, max).replace(/[.!?;,:\-\s]+$/g, '');
}

// "Na praia ou no litoral" → "na praia ou no litoral"; an acronym ("TI", "UX") or the English "I" stays as written.
function lowerFirst(value) {
  const text = clean(value);
  if (!text || /^(\p{Lu}{2}|I\b)/u.test(text)) return text;
  return text.charAt(0).toLocaleLowerCase() + text.slice(1);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function choose(values, seed) {
  return values[stableHash(seed) % values.length];
}

// The same answers always give the same order; different answers, a different one.
function shuffled(values, seed) {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const other = stableHash(`${seed}|${index}`) % (index + 1);
    [output[index], output[other]] = [output[other], output[index]];
  }
  return output;
}

// The place chips are stored capitalized ("Na praia ou no litoral"); a city keeps its capital letter.
function placeInSentence(value) {
  return /^(Onde|Em|Na|No|Viajando|Where|In|By|Traveling)\b/.test(value) ? lowerFirst(value) : value;
}

// "Where I live now, but better" is not an imagined elsewhere: it is where she lives.
const HERE_CHIPS = new Set(['onde moro hoje, mas do meu jeito', 'where i live now, but better']);

// The work chips are stored as her answer phrase and only some describe a job; free text describes her job unless it
// says she is between jobs or retired. Each kind has its own sentences, so "a aposentadoria" never reads as a job.
const WORK_KINDS = {
  'um emprego em uma empresa': 'employee',
  'a job at a company': 'employee',
  'trabalho autônomo ou freelancer': 'freelance',
  'freelance or self-employed work': 'freelance',
  'a construção do meu próprio negócio': 'business',
  'building a business': 'business',
  'meus estudos': 'study',
  studying: 'study',
  'o cuidado da casa ou da família': 'care',
  'caring for my home or family': 'care',
  'uma transição de carreira': 'transition',
  'a career transition': 'transition',
  'a aposentadoria': 'retired',
  retirement: 'retired',
};

function workKind(work) {
  if (!work) return '';
  const chip = WORK_KINDS[work.toLocaleLowerCase()];
  if (chip) return chip;
  if (/desempregad|sem emprego|sem trabalho|procurando (um )?(emprego|trabalho)|entre (um )?trabalhos?|unemployed|out of work|between jobs|looking for (a )?(job|work)/i.test(work)) {
    return 'transition';
  }
  return /aposentad|retired/i.test(work) ? 'retired' : 'job';
}

function profileFacts(profile, lang) {
  const source = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
  const self = interpretSelfDescription(informative(source.aboutYou, 400), lang);
  const homeAnswer = trimSentence(source.dreamHome, 100);
  const homeChip = homeInLanguage(homeAnswer, lang);
  const dreamPlace = trimSentence(source.dreamLocation, 100);
  const here = HERE_CHIPS.has(dreamPlace.toLocaleLowerCase());
  const work = trimSentence(source.work, 120);
  const listed = (key) => (Array.isArray(source[key]) ? source[key].filter(Boolean).length : 0);
  // Her own words go in quotes exactly as she wrote them (no lowercasing: "TI" and "I want" stay right).
  return {
    why: trimSentence(source.whyMatters, 180),
    obstacle: trimSentence(source.obstacle, 120),
    // the place she imagines; where she lives today (city) is never presented as imagined
    dreamPlace: here ? '' : placeInSentence(dreamPlace),
    city: trimSentence(source.city, 100),
    here,
    homeChip,
    homeText: homeChip ? '' : homeAnswer,
    work,
    workKind: workKind(work),
    partner: trimSentence(source.partnerDesire, 150),
    // only whether people matter to her: their names never enter these texts
    lovedOnes: listed('kids') + listed('people') > 0,
    selfAffirmation: self ? self.affirmationFragment : '',
    selfStory: self ? self.storyFragment : '',
  };
}

const WORK_STORY = {
  pt: {
    job: [
      (f) => `Aquilo que você contou do seu trabalho, “${f.work}”, deixa de ser só tarefa e vira assinatura.`,
      (f) => `O que você já faz hoje — “${f.work}” — ganha clareza e espaço para crescer.`,
    ],
    employee: [
      () => 'O trabalho na empresa deixa de ser só tarefa e passa a ter a sua assinatura.',
      () => 'No emprego de hoje, o que você entrega ganha clareza e espaço para crescer.',
    ],
    freelance: [
      () => 'No seu trabalho autônomo, cada entrega leva a sua assinatura.',
      () => 'Os clientes que você atende passam a reconhecer o seu jeito de trabalhar.',
    ],
    business: [
      () => 'O negócio que você está construindo ganha forma, um passo de cada vez.',
      () => 'Cada decisão no seu próprio negócio fica mais clara e mais sua.',
    ],
    study: [
      () => 'Os seus estudos deixam de ser só obrigação e viram caminho.',
      () => 'O que você aprende nos estudos começa a ter uso e sentido.',
    ],
    care: [
      () => 'O cuidado que você dedica à casa e à família é reconhecido como trabalho de verdade.',
      () => 'Cuidar da casa e da família ganha apoio, espaço e tempo para você também.',
    ],
    transition: [
      () => 'A transição que você está vivendo ganha um próximo passo claro.',
      () => 'Entre um trabalho e outro, o que você já sabe fazer continua sendo seu.',
    ],
    retired: [
      () => 'Na aposentadoria, o que você sabe fazer encontra novos usos, no seu ritmo.',
      () => 'O tempo livre da aposentadoria vira espaço para projetos com a sua cara.',
    ],
  },
  en: {
    job: [
      (f) => `What you shared about your work, “${f.work}”, stops being just tasks and becomes your signature.`,
      (f) => `What you already do — “${f.work}” — gains clarity and room to grow.`,
    ],
    employee: [
      () => 'Your job at the company stops being just tasks and starts to carry your signature.',
      () => 'In the job you have today, what you deliver gains clarity and room to grow.',
    ],
    freelance: [
      () => 'In your freelance work, every delivery carries your signature.',
      () => 'The clients you serve start to recognize the way you work.',
    ],
    business: [
      () => 'The business you are building takes shape, one step at a time.',
      () => 'Every decision in your own business becomes clearer and more yours.',
    ],
    study: [
      () => 'Your studies stop being just an obligation and become a path.',
      () => 'What you learn in your studies starts to have use and meaning.',
    ],
    care: [
      () => 'The care you give your home and family is recognized as real work.',
      () => 'Caring for your home and family gains support, room, and time for you too.',
    ],
    transition: [
      () => 'The transition you are going through gains a clear next step.',
      () => 'Between one job and the next, what you know how to do is still yours.',
    ],
    retired: [
      () => 'In retirement, what you know how to do finds new uses, at your own pace.',
      () => 'The free time of retirement becomes room for projects that look like you.',
    ],
  },
};

const workStory = (locale, index) => (f) => {
  const line = (WORK_STORY[locale][f.workKind] || [])[index];
  return line ? line(f) : '';
};

// Each area has its own titles, openings (the first sentence after the fixed future framing) and cores (what the
// area means; only some name her direction, so it does not become a tic); her own answers come in quoted, a known
// chip as a phrase that fits the sentence. Openings never share their first three words across areas.
const BANKS = {
  pt: {
    Love: {
      titles: [
        'Um amor que também é casa',
        'Reciprocidade no cotidiano',
        'Onde você pode ser você',
        'O afeto que cabe nos dias comuns',
        'Presença que se escolhe todo dia',
        'Amor sem plateia',
      ],
      openings: [
        'um fim de tarde simples revela que o amor ganhou espaço para presença, conversa e reciprocidade.',
        'duas xícaras esfriam na mesa porque a conversa ficou boa demais para interromper.',
        'alguém pergunta como foi o seu dia e espera, de verdade, pela resposta.',
        'na volta para casa, você percebe que não precisa ensaiar o que vai dizer.',
        'a mensagem que chega no meio da tarde é curta, mas diz exatamente o que você precisava ouvir.',
        'o domingo começa devagar, com risada antes do café e nenhuma pressa.',
        'um abraço demorado na porta resolve mais do que a conversa inteira.',
      ],
      cores: [
        'Não é uma cena perfeita; é a tranquilidade de ouvir e também ter espaço para falar, em escolhas afetivas que respeitam seus limites e seus valores.',
        'O afeto aqui não pede que você se diminua: há lugar para o seu jeito, os seus limites e o seu tempo.',
        'Amar, nessa possibilidade, inclui receber cuidado de volta, sem disputa nem cobrança. A vida que você deseja aparece nos gestos pequenos que se repetem.',
        'Nada precisa ser dramático: a reciprocidade está na escuta, no combinado cumprido e no carinho sem plateia. A direção que você escolheu fica visível em quem você deixa chegar perto.',
      ],
      facts: [
        (f) => (f.partner ? `Aquilo que você pediu numa parceria — “${f.partner}” — deixa de ser lista e vira convivência.` : ''),
        (f) => (f.partner ? `O que você disse buscar no amor, “${f.partner}”, cabe nos gestos simples do dia.` : ''),
        (f) => (f.partner ? 'Você reconhece na parceria as qualidades afetivas que escolheu como importantes.' : ''),
        (f) => (f.lovedOnes ? 'As pessoas que você ama fazem parte da cena, cada uma no seu lugar.' : ''),
      ],
    },
    Wealth: {
      titles: [
        'Prosperidade com sentido',
        'Margem para escolher',
        'Recursos com propósito',
        'Uma vida que cabe no que você valoriza',
        'Segurança para dizer sim',
        'Dinheiro a serviço da vida',
      ],
      openings: [
        'você observa uma vida mais organizada, ampla e coerente com o que valoriza.',
        'o mês vira e a conta fecha com folga, sem aquele aperto no peito de antes.',
        'a planilha aberta já não assusta; você decide com calma para onde vai cada recurso.',
        'uma compra adiada por anos acontece sem culpa, porque cabe no plano que você traçou.',
        'logo cedo, nenhuma conta mental pesa, e sobra espaço para pensar no que importa.',
        'a reserva de emergência cresce em silêncio, e você dorme melhor por causa dela.',
        'você paga uma conta antes do vencimento sem precisar conferir o saldo duas vezes.',
      ],
      cores: [
        'Prosperidade aparece como margem para escolher, cuidar e sustentar a vida que você deseja construir. Cada decisão pequena combina liberdade com responsabilidade.',
        'Dinheiro, aqui, não é vitrine: é tempo, tranquilidade e a chance de dizer sim ao que tem sentido.',
        'O conforto não vem de exibir, e sim de saber o que é seu e para que serve, no jeito de gastar, guardar e investir em quem você é.',
        'Há constância nas decisões pequenas e generosidade nas grandes. A direção guardada na sua Cena-Âncora vira critério, não cobrança.',
      ],
      facts: [
        (f) => (f.homeChip ? `A casa lembra a que você imaginou — ${f.homeChip} — com espaço para receber quem chega.` : ''),
        (f) => (f.homeChip ? `Há algo da casa que você escolheu, ${f.homeChip}, no jeito como o espaço acolhe a rotina.` : ''),
        (f) => (f.homeText ? `A casa lembra a que você descreveu, “${f.homeText}”, com espaço para receber quem chega.` : ''),
        (f) => (!f.homeChip && !f.homeText && f.dreamPlace ? `O lugar tem a atmosfera que você descreveu, “${f.dreamPlace}”, e cada canto parece escolhido.` : ''),
        (f) => (!f.homeChip && !f.homeText && !f.dreamPlace && f.city ? `Sem mudar de cidade — “${f.city}” —, a casa ganha o seu jeito e cada canto parece escolhido.` : ''),
        (f) => (!f.homeChip && !f.homeText && !f.dreamPlace && !f.city && f.here ? 'Sem mudar de cidade, a casa ganha o seu jeito e cada canto parece escolhido.' : ''),
      ],
    },
    Career: {
      titles: [
        'Trabalho que tem a sua assinatura',
        'Autoria no que você entrega',
        'O valor do que você constrói',
        'Um ofício com espaço para respirar',
        'O crédito que é seu',
        'Competência com calma',
      ],
      openings: [
        'você encerra uma tarefa importante e percebe que seu trabalho tem mais clareza, autoria e espaço para respirar.',
        'alguém cita uma ideia sua numa reunião, e desta vez o crédito fica com quem pensou nela.',
        'a agenda da manhã guarda um bloco protegido para o que só você sabe fazer.',
        'o computador fecha no horário, e você leva para casa a sensação de ter feito algo que importa.',
        'um projeto que começou pequeno ganha corpo, e as pessoas certas começam a perguntar por ele.',
        'o e-mail que você temia escrever sai claro, firme e gentil.',
        'uma pessoa que você admira pede a sua opinião sobre um problema difícil.',
      ],
      cores: [
        'A vida imaginada na sua Cena-Âncora não depende de um salto teatral; ela aparece na constância, nas conversas honestas e no que você decide terminar hoje.',
        'Competência e significado andam juntos: você sabe por que faz o que faz e para quem.',
        'Não há pressa de provar nada; há trabalho bem feito, limites claros e espaço para crescer. A direção que você escolheu aparece no que você aceita e no que recusa.',
        'O reconhecimento chega como consequência de um caminho que você sustenta, não como prêmio de sorte.',
      ],
      facts: [workStory('pt', 0), workStory('pt', 1)],
    },
    Health: {
      titles: [
        'Um corpo tratado como aliado',
        'Cuidado que cabe no dia',
        'Energia sem cobrança',
        'O ritmo que o seu corpo pede',
        'Descanso como parte do caminho',
        'Cuidado sem guerra',
      ],
      openings: [
        'a manhã começa sem guerra com o próprio corpo; há água, ar fresco e um cuidado pequeno que cabe de verdade no dia.',
        'a escada fica para trás sem pressa, e o fôlego acompanha a conversa.',
        'o sono chega na hora que o corpo pede, e o despertador já não assusta.',
        'a caminhada do fim de tarde virou um compromisso que você não quer perder.',
        'na cozinha, o prato do almoço tem cor, tempo e nenhuma culpa.',
        'o corpo acorda leve depois de uma noite inteira de sono.',
        'a garrafa de água vazia no fim do dia conta uma história de cuidado.',
      ],
      cores: [
        'Saúde não aparece como perfeição nem como promessa; aparece como uma relação mais atenta com descanso, movimento e limites, apoiada em escolhas sustentáveis.',
        'Não se trata de números nem de comparação, e sim de escutar sinais, respeitar pausas e voltar ao cuidado quando sair dele.',
        'O cuidado é pequeno e possível, por isso continua. A vida que você deseja ganha um ritmo que o seu corpo consegue sustentar.',
        'Há gentileza no modo como você se trata, nos dias bons e nos difíceis. A direção que você escolheu conta com descanso, movimento e limites.',
      ],
      facts: [
        (f) => (f.lovedOnes ? 'Sobra fôlego para estar presente com quem você ama.' : ''),
      ],
    },
    Confidence: {
      titles: [
        'A coragem de ocupar o próprio lugar',
        'Presença antes da certeza',
        'Sua voz na sala',
        'Firmeza sem armadura',
        'Um passo do tamanho possível',
        'Voz firme, coração calmo',
      ],
      openings: [
        'diante de uma escolha importante, você escuta a insegurança sem entregar a ela a decisão.',
        'sua mão se levanta na reunião antes de você terminar de ensaiar a frase.',
        'no caminho até a conversa difícil, a respiração está mais lenta do que o coração.',
        'um “não” dito com gentileza mostra que o mundo continua de pé.',
        'a mensagem adiada por semanas sai em dois minutos, do jeito que você pensou.',
        'você entra na sala, escolhe uma cadeira na frente e fica à vontade nela.',
        'a opinião que você guardava há tempos finalmente ganha voz, sem pedido de desculpas.',
      ],
      cores: [
        'A confiança surge no gesto de se posicionar, aprender e continuar, sem exigir uma versão impecável de si.',
        'O medo ainda aparece às vezes, mas não decide por você. Você se apoia no que já atravessou.',
        'Coragem, aqui, é um passo do tamanho possível, repetido até ficar familiar. A vida que você deseja não espera certeza completa; ela começa no primeiro gesto.',
        'Você não precisa de aplauso para saber o que vale. A direção guardada na sua Cena-Âncora fala mais alto do que a vontade de agradar.',
      ],
      facts: [],
    },
    Peace: {
      titles: [
        'Silêncio suficiente para se ouvir',
        'Um dia que cabe em você',
        'Atenção de volta para casa',
        'O ritmo mais humano',
        'Pausas que sustentam o dia',
        'Calma de verdade',
      ],
      openings: [
        'o dia desacelera o bastante para você distinguir urgência de importância.',
        'o celular fica em outro cômodo, e a tarde parece mais longa.',
        'o cheiro do café chega antes da lista de tarefas.',
        'a janela aberta deixa entrar o barulho da rua, e mesmo assim há silêncio por dentro.',
        'antes de dormir, nada fica pendurado na cabeça; o que importava foi feito e o resto pode esperar.',
        'a chuva bate na janela, e você deixa que ela seja a única coisa acontecendo.',
        'uma tarde sem compromisso se abre, e você não corre para preenchê-la.',
      ],
      cores: [
        'Paz não significa ausência de problemas; significa poder voltar ao corpo, proteger a atenção e escolher o que merece seguir, num ritmo mais humano.',
        'A calma não depende de tudo estar resolvido; ela nasce de saber o que é seu para carregar.',
        'Há espaço entre um compromisso e outro, e é nesse espaço que você se escuta. A direção que você escolheu fica clara quando o barulho baixa.',
        'Descansar deixa de ser prêmio e vira parte do caminho. A vida que você deseja cabe num dia com pausas.',
      ],
      facts: [
        (f) => (f.dreamPlace ? `A atmosfera lembra o lugar que você imagina, “${f.dreamPlace}”, onde a vida tem mais espaço.` : ''),
        (f) => (f.dreamPlace ? `Há um pouco do lugar que você descreveu, “${f.dreamPlace}”, no ar desse dia.` : ''),
        (f) => (!f.dreamPlace && f.city ? `Mesmo aí onde você mora, “${f.city}”, o dia encontra um canto de silêncio.` : ''),
        (f) => (!f.dreamPlace && f.city ? `No lugar onde você mora — “${f.city}” — as ruas conhecidas parecem menos apressadas.` : ''),
        (f) => (!f.dreamPlace && !f.city && f.here ? 'Mesmo aí onde você mora hoje, o dia encontra um canto de silêncio.' : ''),
      ],
    },
  },
  en: {
    Love: {
      titles: [
        'A love that also feels like home',
        'Reciprocity in ordinary days',
        'Where you can be yourself',
        'Affection that fits everyday life',
        'Presence chosen every day',
        'Love without an audience',
      ],
      openings: [
        'an ordinary evening shows that love has room for presence, conversation, and reciprocity.',
        'two cups go cold on the table because the conversation is too good to interrupt.',
        'someone asks how your day went and truly waits for the answer.',
        'on the way home, you notice there is no need to rehearse what you will say.',
        'the message that arrives mid-afternoon is short, but it says exactly what you needed to hear.',
        'Sunday starts slowly, with laughter before coffee and no rush at all.',
        'a long hug at the door says more than the whole conversation.',
      ],
      cores: [
        'This is not a perfect scene; it is the relief of listening and also having room to speak, in affectionate choices that respect your boundaries and values.',
        'Affection here does not ask you to shrink: there is room for your ways, your boundaries, and your timing.',
        'Love, in this possibility, includes being cared for in return, without contest or pressure. The life you want shows up in small gestures that repeat.',
        'Nothing needs to be dramatic: reciprocity lives in listening, in kept agreements, and in tenderness without an audience. The direction you chose shows in who you let come close.',
      ],
      facts: [
        (f) => (f.partner ? `What you asked for in a partnership — “${f.partner}” — stops being a list and becomes daily life.` : ''),
        (f) => (f.partner ? `What you said you seek in love, “${f.partner}”, lives in the simple gestures of the day.` : ''),
        (f) => (f.partner ? 'You recognize in the partnership the qualities you chose as important.' : ''),
        (f) => (f.lovedOnes ? 'The people you love are part of the scene, each in their own place.' : ''),
      ],
    },
    Wealth: {
      titles: [
        'Prosperity with meaning',
        'Room to choose',
        'Resources with a purpose',
        'A life that fits what you value',
        'Security to say yes',
        'Money in service of life',
      ],
      openings: [
        'you notice a life that feels more organized, spacious, and aligned with what you value.',
        'the month turns and the numbers close with room to spare, without the old tightness in your chest.',
        'the open spreadsheet no longer scares you; you calmly decide where each resource goes.',
        'a purchase postponed for years happens without guilt, because it fits the plan you made.',
        'first thing in the morning, no mental math weighs on you, and there is room to think about what matters.',
        'the emergency fund grows quietly, and you sleep better because of it.',
        'you pay a bill before it is due without checking the balance twice.',
      ],
      cores: [
        'Prosperity means having room to choose, care, and sustain the life you want to build. Each small decision joins freedom with responsibility.',
        'Money here is not a showcase: it is time, calm, and the chance to say yes to what has meaning.',
        'Comfort does not come from display, but from knowing what is yours and what it is for, in how you spend, save, and invest in who you are.',
        'There is consistency in small decisions and generosity in big ones. The direction held in your Anchor Scene becomes a criterion, not a demand.',
      ],
      facts: [
        (f) => (f.homeChip ? `The home recalls the one you pictured — ${f.homeChip} — with room to welcome whoever arrives.` : ''),
        (f) => (f.homeChip ? `Something of the home you chose, ${f.homeChip}, lives in the way the space welcomes your routine.` : ''),
        (f) => (f.homeText ? `The home recalls the one you described, “${f.homeText}”, with room to welcome whoever arrives.` : ''),
        (f) => (!f.homeChip && !f.homeText && f.dreamPlace ? `The place has the atmosphere you described, “${f.dreamPlace}”, and every corner feels chosen.` : ''),
        (f) => (!f.homeChip && !f.homeText && !f.dreamPlace && f.city ? `Without changing cities — “${f.city}” — home takes on your way of living and every corner feels chosen.` : ''),
        (f) => (!f.homeChip && !f.homeText && !f.dreamPlace && !f.city && f.here ? 'Without changing cities, home takes on your way of living and every corner feels chosen.' : ''),
      ],
    },
    Career: {
      titles: [
        'Work that carries your signature',
        'Authorship in what you deliver',
        'The value of what you build',
        'A craft with room to breathe',
        'The credit that is yours',
        'Competence with calm',
      ],
      openings: [
        'you finish a meaningful task and notice that your work has more clarity, authorship, and breathing room.',
        'someone quotes one of your ideas in a meeting, and this time the credit stays with the person who had it.',
        'the morning calendar keeps a protected block for what only you know how to do.',
        'the laptop closes on time, and you take home the feeling of having done something that matters.',
        'a project that started small gains shape, and the right people start asking about it.',
        'the email you dreaded writing goes out clear, firm, and kind.',
        'someone you admire asks for your opinion on a hard problem.',
      ],
      cores: [
        'The life imagined in your Anchor Scene does not require a dramatic leap; it appears in consistency, honest conversations, and what you decide to finish today.',
        'Competence and meaning walk together: you know why you do what you do and for whom.',
        'There is no rush to prove anything; there is good work, clear limits, and room to grow. The direction you chose shows in what you accept and what you decline.',
        'Recognition comes as a consequence of a path you sustain, not as a lucky prize.',
      ],
      facts: [workStory('en', 0), workStory('en', 1)],
    },
    Health: {
      titles: [
        'A body treated as an ally',
        'Care that fits the day',
        'Energy without pressure',
        'The rhythm your body asks for',
        'Rest as part of the path',
        'Care without a fight',
      ],
      openings: [
        'the morning begins without a fight against your own body; there is water, fresh air, and one small act of care that truly fits the day.',
        'the stairs pass without hurry, and your breath keeps up with the conversation.',
        'sleep arrives when the body asks, and the alarm no longer startles you.',
        'the late-afternoon walk has become an appointment you do not want to miss.',
        'in the kitchen, lunch has color, time, and no guilt.',
        'your body wakes up light after a full night of sleep.',
        'the empty water bottle at the end of the day tells a story of care.',
      ],
      cores: [
        'Health is neither perfection nor a promise; it is a more attentive relationship with rest, movement, and limits, supported by sustainable choices.',
        'It is not about numbers or comparison, but about hearing signals, respecting pauses, and returning to care whenever you drift.',
        'The care is small and doable, which is why it lasts. The life you want finds a rhythm your body can sustain.',
        'There is kindness in the way you treat yourself, on good days and hard ones. The direction you chose counts on rest, movement, and limits.',
      ],
      facts: [
        (f) => (f.lovedOnes ? 'There is breath left to be present with the people you love.' : ''),
      ],
    },
    Confidence: {
      titles: [
        'The courage to take up your place',
        'Presence before certainty',
        'Your voice in the room',
        'Steadiness without armor',
        'A step that fits',
        'Steady voice, calm heart',
      ],
      openings: [
        'faced with an important choice, you hear insecurity without handing it the decision.',
        'your hand goes up in the meeting before you finish rehearsing the sentence.',
        'heading into the hard conversation, your breathing is slower than your heartbeat.',
        'a kind “no” shows you that the world is still standing.',
        'the message postponed for weeks goes out in two minutes, the way you meant it.',
        'you walk into the room, pick a seat up front, and settle into it.',
        'the opinion you had kept to yourself finally finds its voice, with no apology.',
      ],
      cores: [
        'Confidence appears in the act of speaking up, learning, and continuing, without demanding a flawless version of you.',
        'Fear still shows up sometimes, but it does not decide for you. You lean on what you have already come through.',
        'Courage here is a step that fits, repeated until it feels familiar. The life you want does not wait for complete certainty; it begins with the first gesture.',
        'You do not need applause to know what matters. The direction held in your Anchor Scene speaks louder than the urge to please.',
      ],
      facts: [],
    },
    Peace: {
      titles: [
        'Enough quiet to hear yourself',
        'A day that fits you',
        'Attention coming home',
        'A more human rhythm',
        'Pauses that hold the day',
        'Real calm',
      ],
      openings: [
        'the day slows enough for you to tell urgency from importance.',
        'the phone stays in another room, and the afternoon feels longer.',
        'the smell of coffee arrives before the to-do list.',
        'the open window lets in the noise of the street, and still there is quiet inside.',
        'before sleep, nothing is left hanging in your mind; what mattered got done and the rest can wait.',
        'rain taps on the window, and you let it be the only thing happening.',
        'an afternoon with no plans opens up, and you do not rush to fill it.',
      ],
      cores: [
        'Peace does not mean having no problems; it means returning to your body, protecting your attention, and choosing what deserves to continue, at a more human rhythm.',
        'Calm does not depend on everything being solved; it comes from knowing what is yours to carry.',
        'There is space between one commitment and the next, and in that space you hear yourself. The direction you chose becomes clear when the noise drops.',
        'Rest stops being a reward and becomes part of the path. The life you want fits in a day with pauses.',
      ],
      facts: [
        (f) => (f.dreamPlace ? `The atmosphere recalls the place you imagine, “${f.dreamPlace}”, where life has more room.` : ''),
        (f) => (f.dreamPlace ? `A little of the place you described, “${f.dreamPlace}”, is in the air of this day.` : ''),
        (f) => (!f.dreamPlace && f.city ? `Even right where you live, “${f.city}”, the day finds a corner of quiet.` : ''),
        (f) => (!f.dreamPlace && f.city ? `Where you live — “${f.city}” — the familiar streets feel less hurried.` : ''),
        (f) => (!f.dreamPlace && !f.city && f.here ? 'Even right where you live now, the day finds a corner of quiet.' : ''),
      ],
    },
  },
};

// Sentences every area may carry; each area of one suite gets a different phrasing (never the same sentence twice).
// The obstacle is always framed as what she said stood in her way (the chip "dinheiro ou recursos" is a lack, never
// something that "appears"), with her answer quoted as she gave it, a multiple choice included.
const SHARED = {
  pt: {
    desire: [
      (f) => `O que você escreveu lá no começo, “${f.desire}”, continua sendo a bússola.`,
      (f) => `Seu desejo — “${f.desire}” — aparece aqui sem pressa e sem atalhos.`,
      (f) => `Tudo isso conversa com o que você pediu: “${f.desire}”.`,
      (f) => `É um pedaço possível de “${f.desire}”, vivido no presente.`,
    ],
    obstacle: [
      (f) => `O que parecia estar no seu caminho — “${f.obstacle}” — vira sinal para um passo menor, não sentença.`,
      (f) => `Você contou o que pesa agora — “${f.obstacle}” — e, mesmo assim, existe um passo que cabe nesse dia.`,
      (f) => `Sobre o que estava no seu caminho, “${f.obstacle}”, você já sabe qual é o próximo passo possível.`,
      (f) => `Mesmo com o obstáculo que você apontou, “${f.obstacle}”, existe uma ação pequena que depende só de você.`,
    ],
    obstacleSoft: [
      () => 'Quando o obstáculo que você reconheceu aparece, ele se torna um sinal para voltar ao próximo passo possível.',
      () => 'O que antes travava ainda dá sinal de vez em quando, e você responde com um gesto possível.',
      () => 'Aquilo que costumava travar você ainda aparece às vezes; agora vem com um plano pequeno ao lado.',
      () => 'O velho obstáculo perde força quando encontra um passo já combinado.',
    ],
    uncertainty: [
      () => 'Quando surge incerteza, você retorna ao próximo passo possível.',
      () => 'Nos dias confusos, você escolhe o menor passo que ainda faz sentido.',
      () => 'Se algo sai do roteiro, você ajusta o passo sem abandonar o caminho.',
      () => 'Quando a dúvida aparece, ela vira pergunta, não freio.',
      () => 'Num dia mais pesado, basta o gesto pequeno que ainda cabe.',
      () => 'O imprevisto não apaga a direção; só muda o tamanho do próximo passo.',
    ],
    reason: [
      (f) => `O motivo que você deu continua de pé: “${f.why}”.`,
      (f) => `Por trás de tudo, segue o seu porquê: “${f.why}”.`,
      (f) => `Você lembra por que começou: “${f.why}”.`,
    ],
    qualities: [
      (f) => `Você reconhece ${f.selfStory} na maneira como escolhe agir.`,
      (f) => `É com ${f.selfStory} que você atravessa esse dia.`,
      (f) => `Você leva ${f.selfStory} para cada conversa.`,
      (f) => `Quem olha de fora percebe ${f.selfStory} nas suas escolhas.`,
    ],
  },
  en: {
    desire: [
      (f) => `What you wrote at the start, “${f.desire}”, is still the compass.`,
      (f) => `Your desire — “${f.desire}” — shows up here without rush or shortcuts.`,
      (f) => `All of this speaks to what you asked for: “${f.desire}”.`,
      (f) => `It is one piece of “${f.desire}”, lived in the present.`,
    ],
    obstacle: [
      (f) => `What seemed to stand in your way — “${f.obstacle}” — becomes a cue for a smaller step, not a verdict.`,
      (f) => `You named what weighs on you now — “${f.obstacle}” — and still there is a step that fits this day.`,
      (f) => `About what stood in your way, “${f.obstacle}”, you already know what your next step is.`,
      (f) => `Even with the obstacle you named, “${f.obstacle}”, there is one small action that depends only on you.`,
    ],
    obstacleSoft: [
      () => 'When the obstacle you recognized shows up, it becomes a cue to return to the next step within reach.',
      () => 'What used to hold you back still signals now and then, and you answer with something small you can do.',
      () => 'What used to stop you still appears sometimes; now it comes with a small plan beside it.',
      () => 'The old obstacle loses strength when it meets a step you already agreed on.',
    ],
    uncertainty: [
      () => 'When uncertainty shows up, you return to the next step within reach.',
      () => 'On confusing days, you choose the smallest step that still makes sense.',
      () => 'If something goes off script, you adjust the step without leaving the path.',
      () => 'When doubt appears, it becomes a question, not a brake.',
      () => 'On a heavier day, the small gesture that still fits is enough.',
      () => 'The unexpected does not erase the direction; it only changes the size of the next step.',
    ],
    reason: [
      (f) => `The reason you gave still stands: “${f.why}”.`,
      (f) => `Behind it all, your why remains: “${f.why}”.`,
      (f) => `You remember why you started: “${f.why}”.`,
    ],
    qualities: [
      (f) => `You recognize ${f.selfStory} in the way you choose to act.`,
      (f) => `It is with ${f.selfStory} that you move through this day.`,
      (f) => `You bring ${f.selfStory} into every conversation.`,
      (f) => `Anyone watching notices ${f.selfStory} in your choices.`,
    ],
  },
};

const CAREER_SECONDS = {
  pt: {
    job: (f) => `Eu me orgulho do que faço no meu trabalho: “${f.work}”.`,
    employee: () => 'Eu me orgulho do que entrego no meu emprego.',
    freelance: () => 'Eu me orgulho das entregas do meu trabalho autônomo.',
    business: () => 'Eu me orgulho do negócio que estou construindo.',
    study: () => 'Eu me orgulho do que aprendo nos meus estudos.',
    care: () => 'Eu me orgulho do cuidado que dedico à casa e à família.',
    transition: () => 'Entre um trabalho e outro, eu me orgulho do que já construí.',
    retired: () => 'Eu me orgulho do que a experiência me ensinou.',
  },
  en: {
    job: (f) => `I take pride in what I do at work: “${f.work}”.`,
    employee: () => 'I take pride in what I deliver at my job.',
    freelance: () => 'I take pride in the work I deliver as a freelancer.',
    business: () => 'I take pride in the business I am building.',
    study: () => 'I take pride in what I learn in my studies.',
    care: () => 'I take pride in the care I give my home and family.',
    transition: () => 'Between one job and the next, I take pride in what I have built.',
    retired: () => 'I take pride in what experience has taught me.',
  },
};

// Affirmations: present tense, first person, no promises. Each suite draws six of ten openers (never the same six for
// everyone); no opener word comes back later in the same affirmation. Her own words go in quotes after "what I asked
// for" or "what I described", never pasted raw after a colon.
const AFFIRMATIONS = {
  pt: {
    openers: [
      'Eu',
      'Hoje eu',
      'Com leveza, eu',
      'No meu ritmo, eu',
      'Mesmo sem certeza, eu',
      'A cada dia, eu',
      'Aos poucos, eu',
      'Do meu jeito, eu',
      'Sem pressa, eu',
      'De coração aberto, eu',
    ],
    Love: {
      bodies: [
        'cultivo amor com reciprocidade, clareza e respeito.',
        'escolho relações em que posso ser quem sou.',
        'abro espaço para um afeto que me respeita e que eu também respeito.',
        'pratico a escuta e deixo que cuidem de mim também.',
        'reconheço o amor nos gestos pequenos e constantes.',
      ],
      seconds: [
        (f) => (f.partner ? `Eu lembro do que pedi no amor: “${f.partner}”.` : ''),
        () => 'Eu posso acolher afeto sem abandonar meus limites.',
        () => 'Meus limites também fazem parte da minha forma de amar.',
        () => 'Eu me permito receber tanto quanto ofereço.',
      ],
    },
    Wealth: {
      bodies: [
        'trato prosperidade como cuidado, escolha e constância.',
        'direciono meus recursos para o que tem sentido na minha vida.',
        'tomo decisões de dinheiro com calma e clareza.',
        'construo margem para escolher com liberdade.',
        'cuido do que tenho e abro espaço para o que desejo construir.',
      ],
      seconds: [
        (f) =>
          f.homeChip
            ? `Eu guardo comigo a imagem da casa que desejo: ${f.homeChip}.`
            : f.homeText
            ? `Eu guardo comigo a imagem da casa que descrevi: “${f.homeText}”.`
            : '',
        () => 'Toda escolha pequena conta na vida que estou construindo.',
        () => 'Eu mereço segurança sem precisar provar nada a ninguém.',
        () => 'Eu valorizo a tranquilidade tanto quanto o crescimento.',
      ],
    },
    Career: {
      bodies: [
        'torno meu trabalho mais visível por meio de passos consistentes.',
        'reconheço o valor do que aprendo e termino.',
        'coloco minha assinatura no que faço.',
        'escolho tarefas que combinam com quem estou me tornando.',
        'trato meu talento com seriedade e paciência.',
      ],
      seconds: [
        (f) => (CAREER_SECONDS.pt[f.workKind] ? CAREER_SECONDS.pt[f.workKind](f) : ''),
        () => 'Eu posso crescer sem me desgastar.',
        () => 'Minha constância também é uma forma de competência.',
        () => 'Eu dou crédito ao que já construí.',
      ],
    },
    Health: {
      bodies: [
        'trato meu corpo como aliado.',
        'escolho cuidados possíveis que cabem na minha rotina.',
        'respeito meu descanso como parte do caminho.',
        'escuto os sinais do meu corpo com gentileza.',
        'movimento meu corpo por cuidado, não por cobrança.',
      ],
      seconds: [
        (f) => (f.lovedOnes ? 'Eu cuido de mim também por quem eu amo.' : ''),
        () => 'Eu valorizo constância, descanso e limites mais do que perfeição.',
        () => 'Todo cuidado pequeno conta.',
        () => 'Eu posso recomeçar o cuidado quantas vezes precisar.',
      ],
    },
    Confidence: {
      bodies: [
        'posso agir com presença antes de ter todas as respostas.',
        'ocupo meu lugar sem pedir licença para existir.',
        'digo o que penso com respeito e firmeza.',
        'confio no que já atravessei.',
        'dou um passo do tamanho possível e sigo.',
      ],
      seconds: [
        (f) => (f.selfAffirmation ? `Eu levo comigo ${f.selfAffirmation}.` : ''),
        (f) => (f.selfAffirmation ? `Eu conto com ${f.selfAffirmation} nas minhas escolhas.` : ''),
        () => 'Minha voz importa, ainda que trema.',
        () => 'Eu não preciso de perfeição para começar.',
        () => 'Toda tentativa também me ensina.',
      ],
    },
    Peace: {
      bodies: [
        'protejo minha atenção e crio espaço interno.',
        'escolho o que pode entrar na minha rotina.',
        'volto ao que importa com calma e discernimento.',
        'desacelero sem culpa.',
        'respiro antes de responder.',
      ],
      seconds: [
        () => 'Eu posso descansar sem precisar merecer.',
        () => 'O silêncio também me orienta.',
        () => 'Eu solto o que não é meu para carregar.',
        () => 'Minha calma é uma escolha que eu renovo.',
      ],
    },
  },
  en: {
    openers: [
      'I',
      'Today I',
      'Gently, I',
      'At my own pace, I',
      'Even when unsure, I',
      'Each day, I',
      'Little by little, I',
      'On my own terms, I',
      'Unhurried, I',
      'With an open heart, I',
    ],
    Love: {
      bodies: [
        'cultivate love through reciprocity, clarity, and respect.',
        'choose relationships where I can be who I am.',
        'make room for affection that respects me and that I respect too.',
        'practise listening and let others care for me too.',
        'recognize love in small, steady gestures.',
      ],
      seconds: [
        (f) => (f.partner ? `I remember what I asked for in love: “${f.partner}”.` : ''),
        () => 'I can welcome affection without abandoning my boundaries.',
        () => 'My boundaries are also part of how I love.',
        () => 'I allow myself to receive as much as I give.',
      ],
    },
    Wealth: {
      bodies: [
        'treat prosperity as care, choice, and consistency.',
        'direct my resources toward what carries meaning in my life.',
        'make money decisions with calm and clarity.',
        'build room to choose freely.',
        'take care of what I have and make room for what I want to build.',
      ],
      seconds: [
        (f) =>
          f.homeChip
            ? `I keep with me the image of the home I want: ${f.homeChip}.`
            : f.homeText
            ? `I keep with me the image of the home I described: “${f.homeText}”.`
            : '',
        () => 'Every small choice counts in the life I am building.',
        () => 'I deserve security without having to prove anything to anyone.',
        () => 'I value calm as much as growth.',
      ],
    },
    Career: {
      bodies: [
        'make my work more visible through consistent steps.',
        'recognize the value of what I learn and finish.',
        'put my signature on what I do.',
        'choose tasks that match who I am becoming.',
        'treat my talent with seriousness and patience.',
      ],
      seconds: [
        (f) => (CAREER_SECONDS.en[f.workKind] ? CAREER_SECONDS.en[f.workKind](f) : ''),
        () => 'I can grow without wearing myself out.',
        () => 'My consistency is also a form of competence.',
        () => 'I give credit to what I have already built.',
      ],
    },
    Health: {
      bodies: [
        'treat my body as an ally.',
        'choose small acts of care that fit my routine.',
        'respect my rest as part of the path.',
        'listen to my body’s signals with kindness.',
        'move my body out of care, not pressure.',
      ],
      seconds: [
        (f) => (f.lovedOnes ? 'I care for myself also for the people I love.' : ''),
        () => 'I value consistency, rest, and limits more than perfection.',
        () => 'Every small act of care counts.',
        () => 'I can begin caring again as many times as I need.',
      ],
    },
    Confidence: {
      bodies: [
        'can act with presence before I have every answer.',
        'take up my place without asking permission to exist.',
        'say what I think with respect and steadiness.',
        'trust what I have already come through.',
        'take a step that fits and keep going.',
      ],
      seconds: [
        (f) => (f.selfAffirmation ? `I bring ${f.selfAffirmation} with me.` : ''),
        (f) => (f.selfAffirmation ? `I count on ${f.selfAffirmation} in my choices.` : ''),
        () => 'My voice matters, steady or shaky.',
        () => 'I do not need perfection to begin.',
        () => 'I learn from every attempt.',
      ],
    },
    Peace: {
      bodies: [
        'protect my attention and create inner room.',
        'choose what gets into my routine.',
        'return to what matters with calm and discernment.',
        'slow down without guilt.',
        'breathe before I answer.',
      ],
      seconds: [
        () => 'I can rest without having to earn it.',
        () => 'Silence guides me too.',
        () => 'I let go of what is not mine to carry.',
        () => 'My calm is a choice I renew.',
      ],
    },
  },
};

// First phrasing in `bank` that has the facts it needs (a phrasing without them returns '').
function firstAvailable(bank, facts, seed) {
  for (const phrasing of shuffled(bank, seed)) {
    const sentence = phrasing(facts);
    if (sentence) return sentence;
  }
  return '';
}

function buildVisions(locale, facts, seed, desireCategory) {
  const banks = BANKS[locale];
  const shared = SHARED[locale];
  // Her desire and her reason live in the area of the desire; her qualities in Confidence (or the next area when the
  // desire is about confidence); the obstacle or the uncertainty in two other areas, quoted once, so each area carries
  // at most two of these sentences and none repeats.
  const order = shuffled(JOURNEY_CATEGORIES, `${seed}|areas`);
  const desireArea = JOURNEY_CATEGORIES.includes(desireCategory) ? desireCategory : order[0];
  const others = order.filter((area) => area !== desireArea);
  const qualityArea = desireArea === 'Confidence' ? others[0] : 'Confidence';
  const processAreas = others.filter((area) => area !== qualityArea).slice(0, 2);
  const processSentences = facts.obstacle
    ? [choose(shared.obstacle, `${seed}|obstacle`), choose(shared.obstacleSoft, `${seed}|obstacle-soft`)]
    : shuffled(shared.uncertainty, `${seed}|uncertainty`).slice(0, 2);

  return JOURNEY_CATEGORIES.map((category) => {
    const bank = banks[category];
    const areaSeed = `${seed}|${category}`;
    const opening = choose(bank.openings, `${areaSeed}|opening`);
    const core = choose(bank.cores, `${areaSeed}|core`);
    const fact = firstAvailable(bank.facts, facts, `${areaSeed}|fact`);
    const middle = stableHash(`${areaSeed}|order`) % 2 ? [fact, core] : [core, fact];
    const extras = [
      category === qualityArea && facts.selfStory ? choose(shared.qualities, `${seed}|qualities`)(facts) : '',
      category === desireArea && facts.desire ? choose(shared.desire, `${seed}|desire`)(facts) : '',
      category === desireArea && facts.why ? choose(shared.reason, `${seed}|reason`)(facts) : '',
      processAreas.includes(category) ? processSentences[processAreas.indexOf(category)](facts) : '',
    ];
    return {
      key: itemKey('vision', category),
      category,
      title: choose(bank.titles, `${areaSeed}|title`),
      story: [VISION_PREFIX[locale], opening, ...middle, ...extras].filter(Boolean).join(' '),
    };
  });
}

function buildAffirmations(locale, facts, seed) {
  const bank = AFFIRMATIONS[locale];
  const openers = shuffled(bank.openers, `${seed}|openers`);
  return JOURNEY_CATEGORIES.map((category, index) => {
    const areaSeed = `${seed}|${category}`;
    const body = choose(bank[category].bodies, `${areaSeed}|body`);
    const second = firstAvailable(bank[category].seconds, facts, `${areaSeed}|second`);
    return {
      key: itemKey('affirmation', category),
      category,
      text: `${openers[index]} ${body} ${second}`.trim(),
    };
  });
}

// `category` is the area of her desire (the manifestation's category), when known.
function createPersonalContentSuite({ desire, profile = {}, lang = 'pt', category } = {}) {
  const locale = lang === 'en' ? 'en' : 'pt';
  const ownDesire = trimSentence(desire, 240);
  const facts = { ...profileFacts(profile, locale), desire: ownDesire };
  const desireCategory = JOURNEY_CATEGORIES.includes(category) ? category : '';
  // The same answers always give the same suite; different answers (or a different area), different choices.
  const seed = `${locale}|${ownDesire}|${desireCategory}|${JSON.stringify(facts)}`;
  const images = frozen.createPersonalContentSuite({ desire, profile, lang: locale });

  return {
    version: JOURNEY_SUITE_VERSION,
    visions: buildVisions(locale, facts, seed, desireCategory).map((item, index) => ({
      ...item,
      visualBrief: images.visions[index].visualBrief,
    })),
    affirmations: buildAffirmations(locale, facts, seed).map((item, index) => ({
      ...item,
      visualBrief: images.affirmations[index].visualBrief,
    })),
  };
}

module.exports = {
  JOURNEY_CATEGORIES,
  JOURNEY_SUITE_VERSION,
  createPersonalContentSuite,
  itemKey,
};
