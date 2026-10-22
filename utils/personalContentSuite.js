const { interpretSelfDescription } = require('./selfDescription');
const { isNonInformativeProfileAnswer } = require('./profileSemantics');

const JOURNEY_SUITE_VERSION = 'celeste-journey-suite-v1';
const JOURNEY_CATEGORIES = Object.freeze([
  'Love',
  'Wealth',
  'Career',
  'Health',
  'Confidence',
  'Peace',
]);
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

function lowerFirst(value) {
  const text = clean(value);
  return text ? text.charAt(0).toLocaleLowerCase() + text.slice(1) : '';
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

function itemKey(kind, category) {
  return `${kind}:${category}`;
}

// The onboarding stores the home chip in canonical English; free text stays as written.
const HOMES = {
  'Luxury Penthouse': { pt: 'uma cobertura', en: 'a penthouse' },
  'Beachfront Villa': { pt: 'uma casa de frente para o mar', en: 'a house facing the sea' },
  'Modern Loft': { pt: 'um loft moderno', en: 'a modern loft' },
  'Cozy Cottage': { pt: 'um chalé aconchegante', en: 'a cozy cottage' },
  'Suburban Mansion': { pt: 'uma casa ampla e tranquila', en: 'a spacious, quiet house' },
  Farmhouse: { pt: 'uma casa de fazenda', en: 'a farmhouse' },
  Cabin: { pt: 'uma cabana', en: 'a cabin' },
  'Tiny Home': { pt: 'uma casa pequena e sua', en: 'a small home of your own' },
};

// The place chips are stored capitalized ("Na praia ou no litoral"); a city keeps its capital letter.
function placeInSentence(value) {
  return /^(Onde|Em|Na|No|Viajando|Where|In|By|Traveling)\b/.test(value) ? lowerFirst(value) : value;
}

function profileFacts(profile, lang) {
  const source = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
  const self = interpretSelfDescription(informative(source.aboutYou, 400), lang);
  const home = trimSentence(source.dreamHome, 100);
  const listed = (key) => (Array.isArray(source[key]) ? source[key].filter(Boolean).length : 0);
  return {
    why: trimSentence(source.whyMatters, 180),
    obstacle: trimSentence(source.obstacle, 120),
    location: placeInSentence(trimSentence(source.dreamLocation || source.city, 100)),
    home: home ? (HOMES[home] ? HOMES[home][lang] : lowerFirst(home)) : '',
    work: trimSentence(source.work, 120),
    partner: lowerFirst(trimSentence(source.partnerDesire, 150)),
    // only whether people matter to her: their names never enter these texts
    lovedOnes: listed('kids') + listed('people') > 0,
    selfAffirmation: self ? self.affirmationFragment : '',
    selfStory: self ? self.storyFragment : '',
  };
}

// Each area has its own titles, openings (the first sentence after the fixed future framing) and cores (what the
// area means, always naming her direction); her own answers come in quoted or after a dash so free text stays
// grammatical. Openings never share their first three words across areas, so no two visions start alike.
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
        'Não é uma cena perfeita; é a tranquilidade de ouvir e também ter espaço para falar. A direção guardada na sua Cena-Âncora aparece em escolhas afetivas que respeitam seus limites e seus valores.',
        'O afeto aqui não pede que você se diminua: há lugar para o seu jeito, os seus limites e o seu tempo. É a direção que você escolheu ganhando forma nas relações.',
        'Amar, nessa possibilidade, inclui receber cuidado de volta, sem disputa nem cobrança. A vida que você deseja aparece nos gestos pequenos que se repetem.',
        'Nada precisa ser dramático: a reciprocidade está na escuta, no combinado cumprido e no carinho sem plateia. Sua direção pessoal fica visível em quem você deixa chegar perto.',
      ],
      facts: [
        (f) => (f.partner ? `Aquilo que você pediu numa parceria — ${f.partner} — deixa de ser lista e vira convivência.` : ''),
        (f) => (f.partner ? `O que você disse buscar no amor, “${f.partner}”, aparece nos gestos simples do dia.` : ''),
        (f) => (f.partner ? 'Você reconhece na parceria as qualidades afetivas que escolheu como importantes.' : ''),
        (f) => (f.lovedOnes ? 'As pessoas que você ama fazem parte da cena, cada uma no seu lugar.' : ''),
      ],
    },
    Wealth: {
      titles: [
        'Prosperidade com sentido',
        'Margem para escolher',
        'Recursos que têm direção',
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
        'Prosperidade aparece como margem para escolher, cuidar e sustentar a vida que você deseja construir. Cada recurso tem direção, e cada decisão pequena combina liberdade com responsabilidade.',
        'Dinheiro, aqui, não é vitrine: é tempo, tranquilidade e a chance de dizer sim ao que tem sentido. A direção que você escolheu orienta cada decisão.',
        'O conforto não vem de exibir, e sim de saber o que é seu e para que serve. Sua direção pessoal aparece no jeito de gastar, guardar e investir em quem você é.',
        'Há constância nas decisões pequenas e generosidade nas grandes. A direção guardada na sua Cena-Âncora vira critério, não cobrança.',
      ],
      facts: [
        (f) => (f.home ? `A casa lembra a que você imaginou — ${f.home} — com espaço para receber quem chega.` : ''),
        (f) => (f.home ? `Há algo da casa que você escolheu, ${f.home}, no jeito como o espaço acolhe a rotina.` : ''),
        (f) => (!f.home && f.location ? `O lugar tem a atmosfera que você descreveu, “${f.location}”, e cada canto parece escolhido.` : ''),
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
        'Competência e significado andam juntos: você sabe por que faz o que faz e para quem. É a direção que você escolheu se tornando visível.',
        'Não há pressa de provar nada; há trabalho bem feito, limites claros e espaço para crescer. Sua direção pessoal aparece no que você aceita e no que recusa.',
        'O reconhecimento chega como consequência de um caminho que você sustenta, não como prêmio de sorte. A vida que você deseja passa também pelo modo como você trabalha.',
      ],
      facts: [
        (f) => (f.work ? `Aquilo que você contou do seu trabalho, “${f.work}”, deixa de ser só tarefa e vira assinatura.` : ''),
        (f) => (f.work ? `O que você já faz hoje — “${f.work}” — ganha clareza e espaço para crescer.` : ''),
        (f) => (f.work ? 'A experiência que você já constrói ganha uma direção clara.' : ''),
      ],
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
        'Saúde não aparece como perfeição nem como promessa; aparece como uma relação mais atenta com descanso, movimento e limites. Sua direção pessoal encontra apoio em escolhas sustentáveis.',
        'Não se trata de números nem de comparação, e sim de escutar sinais, respeitar pausas e voltar ao cuidado quando sair dele. A direção que você escolheu encontra um corpo disposto a acompanhar.',
        'O cuidado é pequeno e possível, por isso continua. A vida que você deseja ganha um ritmo que o seu corpo consegue sustentar.',
        'Há gentileza no modo como você se trata, nos dias bons e nos difíceis. A direção guardada na sua Cena-Âncora conta com descanso, movimento e limites.',
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
        'A confiança surge no gesto de se posicionar, aprender e continuar. A direção que você escolheu deixa de exigir uma versão impecável de si e passa a receber sua presença real.',
        'O medo ainda aparece às vezes, mas não decide por você. Sua direção pessoal se apoia no que você já atravessou.',
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
        'Paz não significa ausência de problemas; significa poder voltar ao corpo, proteger a atenção e escolher o que merece seguir. A direção guardada na sua Cena-Âncora encontra um ritmo mais humano.',
        'A calma não depende de tudo estar resolvido; ela nasce de saber o que é seu para carregar. A direção que você escolheu pede menos pressa e mais presença.',
        'Há espaço entre um compromisso e outro, e é nesse espaço que você se escuta. Sua direção pessoal fica clara quando o barulho baixa.',
        'Descansar deixa de ser prêmio e vira parte do caminho. A vida que você deseja cabe num dia com pausas.',
      ],
      facts: [
        (f) => (f.location ? `A atmosfera lembra o lugar que você imagina, “${f.location}”, onde a vida tem mais espaço.` : ''),
        (f) => (f.location ? `Há um pouco do lugar que você descreveu, “${f.location}”, no ar desse dia.` : ''),
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
        'This is not a perfect scene; it is the relief of listening and also having room to speak. The direction held in your Anchor Scene appears in affectionate choices that respect your boundaries and values.',
        'Affection here does not ask you to shrink: there is room for your ways, your boundaries, and your timing. It is the direction you chose taking shape in your relationships.',
        'Love, in this possibility, includes being cared for in return, without contest or pressure. The life you want shows up in small gestures that repeat.',
        'Nothing needs to be dramatic: reciprocity lives in listening, in kept agreements, and in tenderness without an audience. Your personal direction shows in who you let come close.',
      ],
      facts: [
        (f) => (f.partner ? `What you asked for in a partnership — ${f.partner} — stops being a list and becomes daily life.` : ''),
        (f) => (f.partner ? `What you said you seek in love, “${f.partner}”, shows up in the simple gestures of the day.` : ''),
        (f) => (f.partner ? 'You recognize in the partnership the qualities you chose as important.' : ''),
        (f) => (f.lovedOnes ? 'The people you love are part of the scene, each in their own place.' : ''),
      ],
    },
    Wealth: {
      titles: [
        'Prosperity with meaning',
        'Room to choose',
        'Resources with direction',
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
        'Prosperity means having room to choose, care, and sustain the life you want to build. Each resource has direction, and each small decision joins freedom with responsibility.',
        'Money here is not a showcase: it is time, calm, and the chance to say yes to what has meaning. The direction you chose guides each decision.',
        'Comfort does not come from display, but from knowing what is yours and what it is for. Your personal direction shows in how you spend, save, and invest in who you are.',
        'There is consistency in small decisions and generosity in big ones. The direction held in your Anchor Scene becomes a criterion, not a demand.',
      ],
      facts: [
        (f) => (f.home ? `The home recalls the one you pictured — ${f.home} — with room to welcome whoever arrives.` : ''),
        (f) => (f.home ? `Something of the home you chose, ${f.home}, lives in the way the space welcomes your routine.` : ''),
        (f) => (!f.home && f.location ? `The place has the atmosphere you described, “${f.location}”, and every corner feels chosen.` : ''),
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
        'Competence and meaning walk together: you know why you do what you do and for whom. It is the direction you chose becoming visible.',
        'There is no rush to prove anything; there is good work, clear limits, and room to grow. Your personal direction shows in what you accept and what you decline.',
        'Recognition comes as a consequence of a path you sustain, not as a lucky prize. The life you want also runs through the way you work.',
      ],
      facts: [
        (f) => (f.work ? `What you shared about your work, “${f.work}”, stops being just tasks and becomes your signature.` : ''),
        (f) => (f.work ? `What you already do — “${f.work}” — gains clarity and room to grow.` : ''),
        (f) => (f.work ? 'The experience you are building gains a clear direction.' : ''),
      ],
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
        'Health is neither perfection nor a promise; it is a more attentive relationship with rest, movement, and limits. Your personal direction finds support in sustainable choices.',
        'It is not about numbers or comparison, but about hearing signals, respecting pauses, and returning to care whenever you drift. The direction you chose finds a body willing to come along.',
        'The care is small and possible, which is why it lasts. The life you want finds a rhythm your body can sustain.',
        'There is kindness in the way you treat yourself, on good days and hard ones. The direction held in your Anchor Scene counts on rest, movement, and limits.',
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
        'A step of possible size',
        'Steady voice, calm heart',
      ],
      openings: [
        'faced with an important choice, you hear insecurity without handing it the decision.',
        'your hand goes up in the meeting before you finish rehearsing the sentence.',
        'on the way to the hard conversation, your breathing is slower than your heartbeat.',
        'a kind “no” shows you that the world is still standing.',
        'the message postponed for weeks goes out in two minutes, the way you meant it.',
        'you walk into the room, pick a seat up front, and settle into it.',
        'the opinion you had kept to yourself finally finds its voice, with no apology.',
      ],
      cores: [
        'Confidence appears in the act of speaking up, learning, and continuing. The direction you chose no longer demands a flawless version of you; it receives your real presence.',
        'Fear still shows up sometimes, but it does not decide for you. Your personal direction leans on what you have already come through.',
        'Courage here is a step of possible size, repeated until it feels familiar. The life you want does not wait for complete certainty; it begins with the first gesture.',
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
        'Peace does not mean having no problems; it means returning to your body, protecting your attention, and choosing what deserves to continue. The direction held in your Anchor Scene finds a more human rhythm.',
        'Calm does not depend on everything being solved; it comes from knowing what is yours to carry. The direction you chose asks for less hurry and more presence.',
        'There is space between one commitment and the next, and in that space you hear yourself. Your personal direction becomes clear when the noise drops.',
        'Rest stops being a reward and becomes part of the path. The life you want fits in a day with pauses.',
      ],
      facts: [
        (f) => (f.location ? `The atmosphere recalls the place you imagine, “${f.location}”, where life has more room.` : ''),
        (f) => (f.location ? `A little of the place you described, “${f.location}”, is in the air of this day.` : ''),
      ],
    },
  },
};

// Sentences every area may carry; each area of one suite gets a different phrasing (never the same sentence twice).
const SHARED = {
  pt: {
    desire: [
      (f) => `O que você escreveu lá no começo, “${f.desire}”, continua sendo a bússola.`,
      (f) => `Seu desejo — “${f.desire}” — aparece aqui sem pressa e sem atalhos.`,
      (f) => `Tudo isso conversa com o que você pediu: “${f.desire}”.`,
      (f) => `É um pedaço possível de “${f.desire}”, vivido no presente.`,
    ],
    obstacle: [
      (f) => `Quando “${f.obstacle}” aparece, você trata como um sinal para dar um passo menor, não como sentença.`,
      (f) => `Pode ser que “${f.obstacle}” ainda apareça; a diferença é que agora você sabe qual é o próximo passo possível.`,
      (f) => `Se “${f.obstacle}” voltar a pesar, você diminui o passo e continua.`,
      (f) => `Mesmo com “${f.obstacle}” por perto, existe uma ação pequena que depende só de você.`,
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
      (f) => `It is one possible piece of “${f.desire}”, lived in the present.`,
    ],
    obstacle: [
      (f) => `When “${f.obstacle}” shows up, you treat it as a cue for a smaller step, not as a verdict.`,
      (f) => `It may be that “${f.obstacle}” still appears; the difference is that now you know the next possible step.`,
      (f) => `If “${f.obstacle}” weighs on you again, you shorten the step and keep going.`,
      (f) => `Even with “${f.obstacle}” nearby, there is one small action that depends only on you.`,
    ],
    obstacleSoft: [
      () => 'When the obstacle you recognized shows up, it becomes a cue to return to the next possible step.',
      () => 'What used to hold you back still signals now and then, and you answer with a possible gesture.',
      () => 'What used to stop you still appears sometimes; now it comes with a small plan beside it.',
      () => 'The old obstacle loses strength when it meets a step you already agreed on.',
    ],
    uncertainty: [
      () => 'When uncertainty shows up, you return to the next possible step.',
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

// Affirmations: present tense, first person, no promises. The openers differ inside one suite; the area body and the
// second sentence vary with her answers.
const AFFIRMATIONS = {
  pt: {
    openers: ['Eu', 'Hoje eu', 'Com leveza, eu', 'No meu ritmo, eu', 'Mesmo sem certeza, eu', 'A cada dia, eu'],
    Love: {
      bodies: [
        'cultivo amor com reciprocidade, clareza e respeito.',
        'escolho relações em que posso ser quem sou.',
        'abro espaço para um afeto que me respeita e que eu também respeito.',
        'pratico a escuta e deixo que cuidem de mim também.',
        'reconheço o amor nos gestos pequenos e constantes.',
      ],
      seconds: [
        (f) => (f.partner ? `Eu lembro do que importa para mim no amor: ${lowerFirst(f.partner)}.` : ''),
        () => 'Eu posso acolher afeto sem abandonar meus limites.',
        () => 'Meus limites também fazem parte do meu jeito de amar.',
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
        (f) => (f.home ? `Eu guardo comigo a imagem da casa que desejo: ${lowerFirst(f.home)}.` : ''),
        () => 'Cada escolha pequena conta na vida que estou construindo.',
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
        (f) => (f.work ? `Eu reconheço o valor do que já faço: ${lowerFirst(f.work)}.` : ''),
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
        () => 'Cada cuidado pequeno conta.',
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
        () => 'Minha voz importa, mesmo quando treme.',
        () => 'Eu não preciso de perfeição para começar.',
        () => 'Eu aprendo com cada tentativa.',
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
    openers: ['I', 'Today I', 'Gently, I', 'At my own pace, I', 'Even without certainty, I', 'Each day, I'],
    Love: {
      bodies: [
        'cultivate love through reciprocity, clarity, and respect.',
        'choose relationships where I can be who I am.',
        'make room for affection that respects me and that I respect too.',
        'practise listening and let others care for me too.',
        'recognize love in small, steady gestures.',
      ],
      seconds: [
        (f) => (f.partner ? `I remember what matters to me in love: ${lowerFirst(f.partner)}.` : ''),
        () => 'I can welcome affection without abandoning my boundaries.',
        () => 'My boundaries are also part of the way I love.',
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
        (f) => (f.home ? `I keep with me the image of the home I want: ${lowerFirst(f.home)}.` : ''),
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
        (f) => (f.work ? `I recognize the value of what I already do: ${lowerFirst(f.work)}.` : ''),
        () => 'I can grow without wearing myself out.',
        () => 'My consistency is also a form of competence.',
        () => 'I give credit to what I have already built.',
      ],
    },
    Health: {
      bodies: [
        'treat my body as an ally.',
        'choose possible acts of care that fit my routine.',
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
        'take a step of possible size and keep going.',
      ],
      seconds: [
        (f) => (f.selfAffirmation ? `I bring ${f.selfAffirmation} with me.` : ''),
        (f) => (f.selfAffirmation ? `I count on ${f.selfAffirmation} in my choices.` : ''),
        () => 'My voice matters, even when it shakes.',
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

const VISUAL_BRIEFS = {
  pt: {
    Love: (place) => `Fotografia editorial de um ambiente acolhedor ao entardecer, luz quente, dois pontos de conforto discretos, composição íntima e sem pessoas; linguagem visual exclusiva de Amor${place ? ` em um espaço inspirado por ${place}` : ''}.`,
    Wealth: (place) => `Fotografia editorial luminosa de prosperidade serena, mesa organizada, materiais naturais e sinais discretos de crescimento, sem dinheiro, marcas ou pessoas; composição exclusiva de Prosperidade${place ? ` inspirada por ${place}` : ''}.`,
    Career: (_place, work) => `Fotografia editorial de um espaço de trabalho concentrado, luz lateral limpa, caderno aberto e um projeto em andamento, sem telas legíveis ou pessoas; composição exclusiva de Carreira${work ? ` inspirada pelo universo de ${work}` : ''}.`,
    Health: () => 'Fotografia editorial de saúde cotidiana, amanhecer claro, água, tecido leve e uma janela aberta para o verde, sem corpos, equipamentos médicos ou pessoas; composição exclusiva de Saúde.',
    Confidence: () => 'Fotografia editorial de uma porta aberta para luz firme da manhã, arquitetura clara, caminho visível e sombras definidas, sem pessoas; composição exclusiva de Confiança.',
    Peace: (_place, _work, location) => `Fotografia editorial contemplativa de uma janela ampla, luz azul suave, tecido em movimento e horizonte silencioso, sem pessoas; composição exclusiva de Paz${location ? ` inspirada pela atmosfera de ${location}` : ''}.`,
  },
  en: {
    Love: (place) => `Premium editorial photograph of a welcoming room at dusk, warm light and two discreet points of comfort, intimate composition with no people; a Love-specific visual language${place ? ` inspired by ${place}` : ''}.`,
    Wealth: (place) => `Luminous editorial photograph of calm prosperity, an ordered table, natural materials, and subtle signs of growth, with no money, brands, or people; a Prosperity-specific composition${place ? ` inspired by ${place}` : ''}.`,
    Career: (_place, work) => `Editorial photograph of a focused workspace, clean side light, an open notebook, and a project in progress, with no readable screens or people; a Career-specific composition${work ? ` inspired by ${work}` : ''}.`,
    Health: () => 'Editorial photograph of everyday wellbeing, clear morning light, water, soft fabric, and an open window facing greenery, with no bodies, medical equipment, or people; a Health-specific composition.',
    Confidence: () => 'Editorial photograph of an open doorway facing firm morning light, clean architecture, a visible path, and defined shadows, with no people; a Confidence-specific composition.',
    Peace: (_place, _work, location) => `Contemplative editorial photograph of a wide window, soft blue light, moving fabric, and a quiet horizon, with no people; a Peace-specific composition${location ? ` inspired by the atmosphere of ${location}` : ''}.`,
  },
};

const AFFIRMATION_VISUAL_BRIEFS = {
  pt: {
    Love: 'Natureza-morta editorial com duas texturas suaves que se encontram, luz rosada lateral e centro calmo, sem pessoas, símbolos ou texto; composição exclusiva da afirmação de Amor.',
    Wealth: 'Natureza-morta editorial com broto, cerâmica e linhas organizadas, luz dourada contida e centro livre, sem dinheiro, marcas ou texto; composição exclusiva da afirmação de Prosperidade.',
    Career: 'Natureza-morta editorial com uma ferramenta criativa e papel sem escrita, luz branca precisa e geometria focada, sem telas, pessoas ou texto; composição exclusiva da afirmação de Carreira.',
    Health: 'Natureza-morta editorial com água, folha e tecido respirável, luz fresca difusa e centro sereno, sem corpos, produtos ou texto; composição exclusiva da afirmação de Saúde.',
    Confidence: 'Natureza-morta editorial com pedra vertical banhada por um feixe de luz, contraste limpo e espaço central, sem pessoas ou texto; composição exclusiva da afirmação de Confiança.',
    Peace: 'Natureza-morta editorial com superfície de água quieta e reflexo de céu, tons frios suaves e centro vazio, sem pessoas ou texto; composição exclusiva da afirmação de Paz.',
  },
  en: {
    Love: 'Editorial still life of two soft textures meeting, side-lit in restrained rose tones with a calm center, no people, symbols, or text; composition exclusive to the Love affirmation.',
    Wealth: 'Editorial still life with a seedling, ceramic, and ordered lines, restrained golden light and an open center, no money, brands, or text; composition exclusive to the Prosperity affirmation.',
    Career: 'Editorial still life with one creative tool and unmarked paper, precise white light and focused geometry, no screens, people, or text; composition exclusive to the Career affirmation.',
    Health: 'Editorial still life with water, a leaf, and breathable fabric, cool diffused light and a serene center, no bodies, products, or text; composition exclusive to the Health affirmation.',
    Confidence: 'Editorial still life with an upright stone crossed by one beam of light, clean contrast and central space, no people or text; composition exclusive to the Confidence affirmation.',
    Peace: 'Editorial still life of quiet water reflecting the sky, soft cool tones and an open center, no people or text; composition exclusive to the Peace affirmation.',
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
  const place = facts.home || facts.location;

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
      visualBrief: VISUAL_BRIEFS[locale][category](place, facts.work, facts.location),
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
      visualBrief: AFFIRMATION_VISUAL_BRIEFS[locale][category],
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

  // The optional sensory detail changes deterministically with the personal map,
  // while category structure and identifiers remain stable for persistence.
  const sensory = locale === 'pt'
    ? choose(['luz natural', 'texturas honestas', 'silêncio acolhedor'], seed)
    : choose(['natural light', 'honest textures', 'welcoming quiet'], seed);
  const visions = buildVisions(locale, facts, seed, desireCategory).map((item) => ({
    ...item,
    visualBrief: `${item.visualBrief} ${locale === 'pt' ? 'Detalhe sensorial' : 'Sensory detail'}: ${sensory}.`,
  }));

  return {
    version: JOURNEY_SUITE_VERSION,
    visions,
    affirmations: buildAffirmations(locale, facts, seed),
  };
}

module.exports = {
  JOURNEY_CATEGORIES,
  JOURNEY_SUITE_VERSION,
  createPersonalContentSuite,
  itemKey,
};
