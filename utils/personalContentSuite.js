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

function itemKey(kind, category) {
  return `${kind}:${category}`;
}

function profileFacts(profile, lang) {
  const source = profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};
  const self = interpretSelfDescription(informative(source.aboutYou, 400), lang);
  return {
    why: trimSentence(source.whyMatters, 180),
    obstacle: trimSentence(source.obstacle, 120),
    location: trimSentence(source.dreamLocation || source.city, 100),
    home: trimSentence(source.dreamHome, 100),
    work: trimSentence(source.work, 120),
    workFeeling: trimSentence(source.workFeeling, 100),
    relationship: trimSentence(source.relationshipStatus, 90),
    partner: trimSentence(source.partnerDesire, 150),
    selfAffirmation: self ? self.affirmationFragment : '',
    selfStory: self ? self.storyFragment : '',
  };
}

function portugueseSuite(_desire, facts) {
  const reason = facts.why
    ? ' O motivo registrado na sua Cena-Âncora continua sustentando essa escolha.'
    : '';
  const process = facts.obstacle
    ? ' Quando o obstáculo que você reconheceu aparece, ele se torna um sinal para voltar ao próximo passo possível.'
    : ' Quando surge incerteza, você retorna ao próximo passo possível.';
  const qualities = facts.selfStory
    ? ` Você reconhece ${facts.selfStory} na maneira como escolhe agir.`
    : '';
  const affirmationQualities = facts.selfAffirmation
    ? ` Eu reconheço ${facts.selfAffirmation} como recursos presentes nas minhas escolhas.`
    : '';
  const place = facts.home || facts.location;

  const visions = {
    Love: {
      title: 'Um amor que também é casa',
      story:
        `Imagine uma possibilidade do seu futuro: um fim de tarde simples revela que o amor ganhou espaço para presença, conversa e reciprocidade. ` +
        `${facts.partner ? 'Você reconhece na parceria as qualidades afetivas que escolheu como importantes. ' : ''}` +
        `Não é uma cena perfeita; é a tranquilidade de poder ser inteiro, ouvir e também ser ouvido. A direção guardada na sua Cena-Âncora aparece em escolhas afetivas que respeitam seus limites e seus valores.${qualities}${reason}`,
      visualBrief:
        `Fotografia editorial de um ambiente acolhedor ao entardecer, luz quente, dois pontos de conforto discretos, composição íntima e sem pessoas; linguagem visual exclusiva de Amor${place ? ` em um espaço inspirado por ${place}` : ''}.`,
    },
    Wealth: {
      title: 'Prosperidade com sentido',
      story:
        `Imagine uma possibilidade do seu futuro: você observa uma vida mais organizada, ampla e coerente com o que valoriza. ` +
        `${place ? 'O ambiente lembra o tipo de lar que você escolheu, sem transformar conforto em exibição. ' : ''}` +
        `Prosperidade aparece como margem para escolher, cuidar e sustentar a vida que você deseja construir. Cada recurso tem direção, e cada decisão pequena combina liberdade com responsabilidade.${process}${reason}`,
      visualBrief:
        `Fotografia editorial luminosa de prosperidade serena, mesa organizada, materiais naturais e sinais discretos de crescimento, sem dinheiro, marcas ou pessoas; composição exclusiva de Prosperidade${place ? ` inspirada por ${place}` : ''}.`,
    },
    Career: {
      title: 'Trabalho que tem a sua assinatura',
      story:
        `Imagine uma possibilidade do seu futuro: você encerra uma tarefa importante e percebe que seu trabalho tem mais clareza, autoria e espaço para respirar. ` +
        `${facts.work ? 'A experiência que você já constrói encontra uma direção que combina competência e significado. ' : ''}` +
        `A vida imaginada na sua Cena-Âncora não depende de um salto teatral; ela aparece na constância, nas conversas honestas e no que você decide terminar hoje.${qualities}${process}`,
      visualBrief:
        `Fotografia editorial de um espaço de trabalho concentrado, luz lateral limpa, caderno aberto e um projeto em andamento, sem telas legíveis ou pessoas; composição exclusiva de Carreira${facts.work ? ` inspirada pelo universo de ${facts.work}` : ''}.`,
    },
    Health: {
      title: 'Um corpo tratado como aliado',
      story:
        `Imagine uma possibilidade do seu futuro: a manhã começa sem guerra com você mesmo. Há água, ar fresco e um cuidado pequeno que cabe de verdade no dia. ` +
        `Saúde não aparece como perfeição nem como promessa; aparece como uma relação mais atenta com descanso, movimento e limites. Sua direção pessoal encontra apoio em escolhas sustentáveis, e você percebe valor na continuidade, não na cobrança.${process}${reason}`,
      visualBrief:
        'Fotografia editorial de saúde cotidiana, amanhecer claro, água, tecido leve e uma janela aberta para o verde, sem corpos, equipamentos médicos ou pessoas; composição exclusiva de Saúde.',
    },
    Confidence: {
      title: 'A coragem de ocupar o próprio lugar',
      story:
        `Imagine uma possibilidade do seu futuro: diante de uma escolha importante, você escuta a insegurança sem entregar a ela a decisão. ` +
        `A confiança surge no gesto de se posicionar, aprender e continuar. A direção que você escolheu deixa de exigir uma versão impecável de si e passa a receber sua presença real.${qualities}${process}${reason}`,
      visualBrief:
        'Fotografia editorial de uma porta aberta para luz firme da manhã, arquitetura clara, caminho visível e sombras definidas, sem pessoas; composição exclusiva de Confiança.',
    },
    Peace: {
      title: 'Silêncio suficiente para se ouvir',
      story:
        `Imagine uma possibilidade do seu futuro: o dia desacelera o bastante para você distinguir urgência de importância. ` +
        `${facts.location ? 'A atmosfera lembra o lugar que você associa a uma vida com mais espaço. ' : ''}` +
        `Paz não significa ausência de problemas; significa poder voltar ao corpo, proteger a atenção e escolher o que merece seguir. A direção guardada na sua Cena-Âncora encontra um ritmo mais humano.${process}${reason}`,
      visualBrief:
        `Fotografia editorial contemplativa de uma janela ampla, luz azul suave, tecido em movimento e horizonte silencioso, sem pessoas; composição exclusiva de Paz${facts.location ? ` inspirada pela atmosfera de ${facts.location}` : ''}.`,
    },
  };

  const affirmations = {
    Love:
      'Eu cultivo amor com reciprocidade, clareza e respeito. ' +
      `${facts.partner ? 'Eu reconheço as qualidades afetivas que escolhi como importantes sem abandonar meus limites.' : 'Eu posso acolher afeto sem abandonar meus limites.'}`,
    Wealth:
      'Eu trato prosperidade como cuidado, escolha e constância enquanto construo uma vida coerente comigo. ' +
      'Eu direciono meus recursos para o que tem sentido na minha vida.',
    Career:
      'Eu torno meu trabalho mais visível por meio de passos consistentes. ' +
      `${facts.work ? 'Eu reconheço a experiência que já construo e escolho dar direção a ela.' : 'Eu reconheço o valor do que aprendo e termino.'}`,
    Health:
      'Eu trato meu corpo como aliado e escolho cuidados possíveis que apoiam a vida que desejo. ' +
      'Eu valorizo constância, descanso e limites mais do que perfeição.',
    Confidence:
      'Eu posso agir com presença mesmo antes de sentir certeza completa.' +
      affirmationQualities,
    Peace:
      'Eu protejo minha atenção e crio espaço interno para caminhar na direção que escolhi. ' +
      'Eu volto ao que importa com calma e discernimento.',
  };

  return { visions, affirmations };
}

function englishSuite(desire, facts) {
  const desired = lowerFirst(desire);
  const reason = facts.why
    ? ` The reason behind this choice remains clear: ${lowerFirst(facts.why)}.`
    : '';
  const process = facts.obstacle
    ? ` When ${lowerFirst(facts.obstacle)} shows up, you recognize it as a cue to return to the next possible step.`
    : ' When uncertainty shows up, you return to the next possible step.';
  const qualities = facts.selfStory
    ? ` You recognize ${facts.selfStory} in the way you choose to act.`
    : '';
  const affirmationQualities = facts.selfAffirmation
    ? ` I let ${facts.selfAffirmation} guide my choices.`
    : '';
  const place = facts.home || facts.location;

  const visions = {
    Love: {
      title: 'A love that also feels like home',
      story:
        `Imagine one possibility in your future: an ordinary evening shows that love has room for presence, conversation, and reciprocity. ` +
        `${facts.partner ? `You recognize what has always mattered in a partnership: ${lowerFirst(facts.partner)}. ` : ''}` +
        `This is not a perfect scene; it is the relief of being whole, listening, and also being heard. Your desire for ${desired} appears in affectionate choices that respect your boundaries and values.${qualities}${reason}`,
      visualBrief:
        `Premium editorial photograph of a welcoming room at dusk, warm light and two discreet points of comfort, intimate composition with no people; a Love-specific visual language${place ? ` inspired by ${place}` : ''}.`,
    },
    Wealth: {
      title: 'Prosperity with meaning',
      story:
        `Imagine one possibility in your future: you notice a life that feels more organized, spacious, and aligned with what you value. ` +
        `${place ? `The setting recalls the place you described, ${lowerFirst(place)}, without turning comfort into display. ` : ''}` +
        `Prosperity means having room to choose, care, and sustain your desire for ${desired}. Each resource has direction, and each small decision joins freedom with responsibility.${process}${reason}`,
      visualBrief:
        `Luminous editorial photograph of calm prosperity, an ordered table, natural materials, and subtle signs of growth, with no money, brands, or people; a Prosperity-specific composition${place ? ` inspired by ${place}` : ''}.`,
    },
    Career: {
      title: 'Work that carries your signature',
      story:
        `Imagine one possibility in your future: you finish a meaningful task and notice that your work has more clarity, authorship, and breathing room. ` +
        `${facts.work ? `The experience you are building in ${lowerFirst(facts.work)} finds a direction that joins competence with meaning. ` : ''}` +
        `Your desire for ${desired} does not require a dramatic leap; it appears in consistency, honest conversations, and what you decide to finish today.${qualities}${process}`,
      visualBrief:
        `Editorial photograph of a focused workspace, clean side light, an open notebook, and a project in progress, with no readable screens or people; a Career-specific composition${facts.work ? ` inspired by ${facts.work}` : ''}.`,
    },
    Health: {
      title: 'A body treated as an ally',
      story:
        `Imagine one possibility in your future: the morning begins without a fight against yourself. There is water, fresh air, and one small act of care that truly fits the day. ` +
        `Health is neither perfection nor a promise; it is a more attentive relationship with rest, movement, and limits. Your desire for ${desired} receives support from sustainable choices, and continuity matters more than pressure.${process}${reason}`,
      visualBrief:
        'Editorial photograph of everyday wellbeing, clear morning light, water, soft fabric, and an open window facing greenery, with no bodies, medical equipment, or people; a Health-specific composition.',
    },
    Confidence: {
      title: 'The courage to take up your place',
      story:
        `Imagine one possibility in your future: faced with an important choice, you hear insecurity without handing it the decision. ` +
        `Confidence appears in the act of speaking, learning, and continuing. Your desire for ${desired} no longer demands a flawless version of you; it receives your real presence.${qualities}${process}${reason}`,
      visualBrief:
        'Editorial photograph of an open doorway facing firm morning light, clean architecture, a visible path, and defined shadows, with no people; a Confidence-specific composition.',
    },
    Peace: {
      title: 'Enough quiet to hear yourself',
      story:
        `Imagine one possibility in your future: the day slows enough for you to tell urgency from importance. ` +
        `${facts.location ? `The atmosphere recalls ${facts.location}, the place you associate with a life that has more room. ` : ''}` +
        `Peace does not mean having no problems; it means returning to your body, protecting your attention, and choosing what deserves to continue. Your desire for ${desired} finds a more human rhythm.${process}${reason}`,
      visualBrief:
        `Contemplative editorial photograph of a wide window, soft blue light, moving fabric, and a quiet horizon, with no people; a Peace-specific composition${facts.location ? ` inspired by the atmosphere of ${facts.location}` : ''}.`,
    },
  };

  const affirmations = {
    Love:
      `I cultivate love through reciprocity, clarity, and respect as I move toward ${desired}. ` +
      `${facts.partner ? `I recognize the value of ${lowerFirst(facts.partner)} without abandoning my boundaries.` : 'I can welcome affection without abandoning my boundaries.'}`,
    Wealth:
      `I treat prosperity as care, choice, and consistency as I build ${desired}. ` +
      'I direct my resources toward what carries meaning in my life.',
    Career:
      `I make my work more visible through consistent steps toward ${desired}. ` +
      `${facts.work ? `I recognize what I learn and build through ${lowerFirst(facts.work)}.` : 'I recognize the value of what I learn and finish.'}`,
    Health:
      `I treat my body as an ally and choose possible acts of care that support ${desired}. ` +
      'I value consistency, rest, and limits more than perfection.',
    Confidence:
      `I can act with presence even before I feel complete certainty about ${desired}.` +
      affirmationQualities,
    Peace:
      `I protect my attention and create inner room to move toward ${desired}. ` +
      'I return to what matters with calm and discernment.',
  };

  return { visions, affirmations };
}

function createPersonalContentSuite({ desire, profile = {}, lang = 'pt' } = {}) {
  const locale = lang === 'en' ? 'en' : 'pt';
  const safeDesire = informative(
    desire,
    240
  ) || (locale === 'pt' ? 'uma vida mais alinhada com o que importa' : 'a life aligned with what matters');
  const facts = profileFacts(profile, locale);
  const seed = `${locale}|${safeDesire}|${JSON.stringify(facts)}`;
  const content = locale === 'pt'
    ? portugueseSuite(safeDesire, facts)
    : englishSuite(safeDesire, facts);

  // The optional sensory detail changes deterministically with the personal map,
  // while category structure and identifiers remain stable for persistence.
  const sensory = locale === 'pt'
    ? choose(['luz natural', 'texturas honestas', 'silêncio acolhedor'], seed)
    : choose(['natural light', 'honest textures', 'welcoming quiet'], seed);
  const affirmationVisualBriefs = locale === 'pt'
    ? {
        Love: 'Natureza-morta editorial com duas texturas suaves que se encontram, luz rosada lateral e centro calmo, sem pessoas, símbolos ou texto; composição exclusiva da afirmação de Amor.',
        Wealth: 'Natureza-morta editorial com broto, cerâmica e linhas organizadas, luz dourada contida e centro livre, sem dinheiro, marcas ou texto; composição exclusiva da afirmação de Prosperidade.',
        Career: 'Natureza-morta editorial com uma ferramenta criativa e papel sem escrita, luz branca precisa e geometria focada, sem telas, pessoas ou texto; composição exclusiva da afirmação de Carreira.',
        Health: 'Natureza-morta editorial com água, folha e tecido respirável, luz fresca difusa e centro sereno, sem corpos, produtos ou texto; composição exclusiva da afirmação de Saúde.',
        Confidence: 'Natureza-morta editorial com pedra vertical banhada por um feixe de luz, contraste limpo e espaço central, sem pessoas ou texto; composição exclusiva da afirmação de Confiança.',
        Peace: 'Natureza-morta editorial com superfície de água quieta e reflexo de céu, tons frios suaves e centro vazio, sem pessoas ou texto; composição exclusiva da afirmação de Paz.',
      }
    : {
        Love: 'Editorial still life of two soft textures meeting, side-lit in restrained rose tones with a calm center, no people, symbols, or text; composition exclusive to the Love affirmation.',
        Wealth: 'Editorial still life with a seedling, ceramic, and ordered lines, restrained golden light and an open center, no money, brands, or text; composition exclusive to the Prosperity affirmation.',
        Career: 'Editorial still life with one creative tool and unmarked paper, precise white light and focused geometry, no screens, people, or text; composition exclusive to the Career affirmation.',
        Health: 'Editorial still life with water, a leaf, and breathable fabric, cool diffused light and a serene center, no bodies, products, or text; composition exclusive to the Health affirmation.',
        Confidence: 'Editorial still life with an upright stone crossed by one beam of light, clean contrast and central space, no people or text; composition exclusive to the Confidence affirmation.',
        Peace: 'Editorial still life of quiet water reflecting the sky, soft cool tones and an open center, no people or text; composition exclusive to the Peace affirmation.',
      };

  return {
    version: JOURNEY_SUITE_VERSION,
    visions: JOURNEY_CATEGORIES.map((category) => ({
      key: itemKey('vision', category),
      category,
      title: content.visions[category].title,
      story: content.visions[category].story,
      visualBrief: `${content.visions[category].visualBrief} ${locale === 'pt' ? 'Detalhe sensorial' : 'Sensory detail'}: ${sensory}.`,
    })),
    affirmations: JOURNEY_CATEGORIES.map((category) => ({
      key: itemKey('affirmation', category),
      category,
      text: content.affirmations[category],
      visualBrief: affirmationVisualBriefs[category],
    })),
  };
}

module.exports = {
  JOURNEY_CATEGORIES,
  JOURNEY_SUITE_VERSION,
  createPersonalContentSuite,
  itemKey,
};
