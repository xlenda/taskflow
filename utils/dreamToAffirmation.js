// Transforma o desejo que a pessoa digita numa afirmação e numa cena de
// visualização — usando as respostas que ela deu no onboarding.
//
// O onboarding pergunta ~28 coisas íntimas e promete que o conteúdo é "criado a
// partir das SUAS respostas". Até 09/08 essa promessa era falsa: o perfil era
// gravado e nunca lido, e toda manifestação virava a mesma frase de template em
// inglês. Aqui a promessa passa a ser verdadeira sem custo e sem servidor.
//
// Regras de honestidade (doutrina do dono):
// - nada de promessa de resultado ("vai acontecer em X dias", "+10% de sorte");
// - a cena é escrita no presente, como já sendo vivida — é visualização, não
//   previsão;
// - só usamos o que a pessoa realmente contou; campo vazio some da frase, nunca
//   vira "undefined" nem inventa detalhe.

const norm = (s) => String(s || '').trim();
const lower = (s) => norm(s).toLowerCase();

// Escolhe determinístico pelo texto do desejo: a mesma pessoa com o mesmo desejo
// recebe sempre a mesma afirmação (previsível e testável), mas desejos
// diferentes recebem variações diferentes.
function hash(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const pick = (arr, seed) => arr[hash(seed) % arr.length];

// Tira o "eu quero (manifestar)", o verbo no infinitivo e o artigo iniciais
// para a frase encaixar nos templates ("encontrar um amor de verdade" →
// "amor de verdade"). Sem isso saía "Eu recebo encontrar um amor…".
// Verbo seguido de preposição fica inteiro em PT ("ganhar na loteria") e cai
// junto com ela em EN ("be at peace" → "peace"). Lookahead, nunca lookbehind
// (iOS < 16.4 nem parseia lookbehind e o app abre em branco).
// Caem: verbos de aquisição — tirar não muda o sentido ('ter paz' → 'paz').
const VERBOS_CAEM_PT = 'encontrar|ter|conseguir|receber|ganhar|arrumar|achar|realizar|atrair|construir|criar|comprar|manifestar|alcançar|abrir|montar';
// Ficam inteiros: tirar INVERTERIA o sentido ('perder peso' → 'peso', 'quitar as
// dívidas' → 'dívidas') ou deixaria adjetivo solto ('ser feliz' → 'feliz').
const VERBOS_FICAM_PT = 'ser|estar|ficar|viver|virar|quitar|pagar|sair|largar|parar|perder|deixar|superar|vencer|emagrecer|casar|passar|mudar';
const VERBOS_EN = 'find|have|get|be|become|receive|earn|attract|build|create|buy|win|achieve|manifest';
const QUERO_PT = /^(eu\s+)?(quero|desejo|gostaria\s+de|vou)\s+(manifestar\s+)?/i;
const QUERO_EN = /^i\s+(want|wish|would\s+like)\s+(to\s+)?/i;
const VERBO_PT = new RegExp('^(' + VERBOS_CAEM_PT + ')\\s+(?!(em|na|no|nas|nos|de|do|da|das|dos|com|para|pra)\\b)', 'i');
const VERBO_PREP_EN = new RegExp('^(to\\s+)?(' + VERBOS_EN + ')\\s+(in|on|at|with|for|of)\\s+', 'i');
// ponytail: "be happy" em EN ainda sobra "have happy" — adjetivo pós-verbo
// pede template próprio; mexer quando o público EN existir de verdade.
const VERBO_EN = new RegExp('^(to\\s+)?(' + VERBOS_EN + ')\\s+', 'i');
// O que sobrar começando em verbo (PT) pede template que aceite verbo.
const COMECA_VERBO_PT = new RegExp('^(' + VERBOS_CAEM_PT + '|' + VERBOS_FICAM_PT + ')\\b', 'i');
function limpa(desejo, L) {
  let d = norm(desejo).replace(L === 'pt' ? QUERO_PT : QUERO_EN, '');
  // verbos encadeados ("conseguir comprar uma casa") caem um por vez
  let antes;
  do {
    antes = d;
    d = L === 'pt' ? d.replace(VERBO_PT, '') : d.replace(VERBO_PREP_EN, '').replace(VERBO_EN, '');
  } while (d !== antes);
  // Artigo só cai em PT ("o carro novo" → "carro novo"); em inglês ele é
  // obrigatório — "have lottery" sem "the" quebra a frase.
  return L === 'pt' ? d.replace(/^(um|uma|uns|umas|o|a|os|as)\s+/i, '') : d;
}

const AFIRMACOES = {
  pt: [
    (d) => `Eu posso dar passos possíveis em direção a ${d}.`,
    (d) => `${cap(d)} importa para mim, e eu escolho construir esse caminho sem exigir certeza de mim.`,
    (d) => `Eu reconheço o desejo de ${d} e começo pelo que depende de mim hoje.`,
    (d) => `Eu posso imaginar ${d} e continuar presente para a próxima escolha real.`,
    (d) => `Eu me permito querer ${d} e aprender com cada passo possível.`,
  ],
  en: [
    (d) => `I can take possible steps toward ${d}.`,
    (d) => `${cap(d)} matters to me, and I choose to build that path without demanding certainty from myself.`,
    (d) => `I acknowledge my desire for ${d} and begin with what depends on me today.`,
    (d) => `I can imagine ${d} and stay present for the next real choice.`,
    (d) => `I allow myself to want ${d} and learn from each possible step.`,
  ],
};

const ABERTURAS = {
  pt: [
    'É de manhã e você acorda antes do despertador.',
    'É fim de tarde e a luz entra torta pela janela.',
    'É um dia comum, desses que ninguém marca no calendário.',
    'Você está voltando pra casa, sem pressa nenhuma.',
  ],
  en: [
    'It is morning and you wake up before the alarm.',
    'It is late afternoon and the light comes in sideways.',
    'It is an ordinary day, the kind nobody marks on a calendar.',
    'You are on your way home, in no hurry at all.',
  ],
};

const FECHOS = {
  pt: [
    'Nada disso parece sorte. Parece a sua vida.',
    'Você percebe que já não está esperando — você já está vivendo.',
    'E o mais estranho é como isso tudo parece normal agora.',
  ],
  en: [
    'None of it feels like luck. It feels like your life.',
    'You notice you are not waiting anymore — you are already living it.',
    'And the strangest part is how ordinary all of it feels now.',
  ],
};

// A Cena-Âncora não termina numa promessa abstrata. Ela devolve uma identidade
// praticável e uma ponte curta para o presente. As sugestões são deliberadamente
// pequenas: visualização é reflexão; o passo continua sob controle da pessoa.
const IDENTIDADES = {
  pt: {
    Love: 'Eu pratico reciprocidade, clareza e respeito antes mesmo do resultado.',
    Wealth: 'Eu trato prosperidade como cuidado, decisão e constância.',
    Career: 'Eu construo espaço para o meu trabalho ser visto.',
    Health: 'Eu cuido do meu corpo com constância, sem guerra comigo.',
    Confidence: 'Eu ajo em passos pequenos mesmo quando a certeza ainda não chegou.',
    Peace: 'Eu protejo minha atenção e escolho o que merece entrar no meu dia.',
    default: 'Eu transformo intenção em presença e presença em movimento.',
  },
  en: {
    Love: 'I practise reciprocity, clarity and respect before the outcome arrives.',
    Wealth: 'I treat prosperity as care, decision and consistency.',
    Career: 'I make room for my work to be seen.',
    Health: 'I care for my body consistently, without fighting myself.',
    Confidence: 'I take small steps even before certainty arrives.',
    Peace: 'I protect my attention and choose what deserves to enter my day.',
    default: 'I turn intention into presence, and presence into movement.',
  },
};

const PONTES = {
  pt: {
    Love: 'Escreva o limite ou gesto de reciprocidade que você quer praticar hoje.',
    Wealth: 'Conclua uma decisão financeira de até 10 minutos que depende de você.',
    Career: 'Dedique 10 minutos à oportunidade mais concreta diante de você.',
    Health: 'Escolha um cuidado pequeno que seu corpo consegue receber hoje.',
    Confidence: 'Faça por 10 minutos algo que a insegurança vinha adiando.',
    Peace: 'Fique dois minutos sem tela e escolha o que não precisa seguir com você hoje.',
    default: 'Dê um passo de até 10 minutos que dependa apenas de você.',
  },
  en: {
    Love: 'Write down the boundary or reciprocal gesture you want to practise today.',
    Wealth: 'Complete one financial decision that takes ten minutes and depends on you.',
    Career: 'Give ten minutes to the most concrete opportunity in front of you.',
    Health: 'Choose one small act of care your body can receive today.',
    Confidence: 'Spend ten minutes doing something insecurity had been delaying.',
    Peace: 'Take two screen-free minutes and choose what does not need to follow you today.',
    default: 'Take one step of ten minutes or less that depends only on you.',
  },
};

// Quando a pessoa contou o que costuma travá-la, a Ponte vira um plano de
// implementação explícito. O obstáculo continua sendo contexto, não identidade;
// a resposta é curta, observável e inteiramente controlável pela pessoa.
const ACOES_PONTE = {
  pt: {
    Love: 'anotar por dois minutos o limite ou gesto de reciprocidade que quero praticar hoje',
    Wealth: 'concluir uma decisão financeira de até 10 minutos que depende de mim',
    Career: 'dedicar 10 minutos à oportunidade mais concreta diante de mim',
    Health: 'escolher um cuidado pequeno que meu corpo consegue receber hoje',
    Confidence: 'fazer por 10 minutos algo que a insegurança vinha adiando',
    Peace: 'ficar dois minutos sem tela e escolher o que não precisa seguir comigo hoje',
    default: 'dar um passo de até 10 minutos que depende apenas de mim',
  },
  en: {
    Love: 'spend two minutes writing the boundary or reciprocal gesture I want to practise today',
    Wealth: 'complete one financial decision that takes ten minutes and depends on me',
    Career: 'give ten minutes to the most concrete opportunity in front of me',
    Health: 'choose one small act of care my body can receive today',
    Confidence: 'spend ten minutes doing something insecurity had been delaying',
    Peace: 'take two screen-free minutes and choose what does not need to follow me today',
    default: 'take one step of ten minutes or less that depends only on me',
  },
};

function cap(s) {
  const t = norm(s);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

// As opções de "casa dos sonhos" são gravadas canonicamente em inglês (é a
// chave do onboarding); aqui viram texto no idioma de quem lê.
const CASAS_PT = {
  'Luxury Penthouse': 'uma cobertura de luxo',
  'Beachfront Villa': 'uma casa de frente pro mar',
  'Modern Loft': 'um loft moderno',
  'Cozy Cottage': 'um chalé aconchegante',
  'Suburban Mansion': 'uma mansão tranquila',
  Farmhouse: 'uma casa de fazenda',
  Cabin: 'uma cabana',
  'Tiny Home': 'uma casa pequena e sua',
};

const TRABALHO_PT = {
  'Love it': 'que ama o que faz',
  "It's fine for now": 'que está bem por enquanto',
  "I'm ready for something new": 'que está pronta para algo novo',
  "I'm building something on the side": 'que está construindo algo em paralelo',
};

const RELACAO_PT = {
  Single: 'estar solteiro(a)',
  Dating: 'estar conhecendo alguém',
  'In a relationship': 'estar em um relacionamento',
  Married: 'estar casado(a)',
  'Separated or divorced': 'estar separado(a) ou divorciado(a)',
  Widowed: 'ser viúvo(a)',
  "It's complicated": 'viver uma relação complicada',
  'Not looking right now': 'não estar buscando uma relação agora',
};

function casaEmIdioma(valor, L) {
  const v = norm(valor);
  if (!v) return '';
  if (L !== 'pt') return v;
  return CASAS_PT[v] || v;
}

// A afirmação carrega um detalhe que seja realmente daquela pessoa, sem
// repetir dados demográficos, dificuldades, passado sensível ou terceiros.
// O limite mantém a frase agradável de ler e ouvir.
function trechoSeguro(valor, max = 96) {
  const texto = norm(valor).replace(/\s+/g, ' ').replace(/[.!?]+$/g, '');
  if (!texto || texto.length <= max) return texto;
  const corte = texto.slice(0, max + 1);
  const ultimoEspaco = corte.lastIndexOf(' ');
  return (ultimoEspaco > Math.floor(max * 0.55) ? corte.slice(0, ultimoEspaco) : corte.slice(0, max))
    .replace(/[\s,;:\-]+$/g, '');
}

function escapaRegex(valor) {
  return String(valor || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function semNomesDeTerceiros(valor, perfil, L) {
  let texto = norm(valor);
  const pessoas = [...(Array.isArray(perfil.kids) ? perfil.kids : []), ...(Array.isArray(perfil.people) ? perfil.people : [])];
  const nomes = pessoas
    .map((pessoa) => norm(pessoa && pessoa.name))
    .concat(norm(perfil.manifestingName))
    .filter((nome) => nome.length >= 2);
  const substituto = L === 'pt' ? 'alguém importante' : 'someone important';
  for (const nome of nomes) {
    const borda = "\\s\\[\\]{}()<>.,!?;:'\"“”‘’";
    const rx = new RegExp(`(^|[${borda}])${escapaRegex(nome)}(?=$|[${borda}])`, 'gi');
    texto = texto.replace(rx, (_match, prefixo) => `${prefixo}${substituto}`);
  }
  return texto;
}

const ROTULOS_PERFIL = {
  pt: {
    aboutYou: 'como você se descreve',
    whyMatters: 'por que isso importa',
    hopedChange: 'o que você quer transformar',
    work: 'seu trabalho',
    partnerDesire: 'o que busca no amor',
    location: 'onde quer morar',
    dreamHome: 'casa dos sonhos',
    people: 'quem importa pra você',
    pastInfluence: 'o que do passado ainda influencia',
    obstacle: 'o que travava você',
  },
  en: {
    aboutYou: 'how you describe yourself',
    whyMatters: 'why this matters',
    hopedChange: 'what you want to change',
    work: 'your work',
    partnerDesire: 'what you seek in love',
    location: 'where you want to live',
    dreamHome: 'your dream home',
    people: 'who matters to you',
    pastInfluence: 'what from the past still influences you',
    obstacle: 'what used to hold you back',
  },
};

const RESPOSTAS_SEM_DETALHE = new Set([
  "i'm not sure yet",
  'i’m not sure yet',
  'not sure yet',
  'ainda não sei',
  'ainda nao sei',
  'prefer not to say',
  'prefiro não responder',
  'prefiro nao responder',
]);

function valorInformativo(valor) {
  const texto = norm(valor);
  return texto && !RESPOSTAS_SEM_DETALHE.has(texto.toLocaleLowerCase()) ? texto : '';
}

function rotuloPerfil(L, key) {
  return ROTULOS_PERFIL[L][key];
}

function selecionaAncoraPessoal(perfil, L, category) {
  const candidata = (key, value) => {
    const text = trechoSeguro(semNomesDeTerceiros(valorInformativo(value), perfil, L));
    return text ? { key, text, label: rotuloPerfil(L, key) } : null;
  };
  const candidatas = [];

  // Contexto específico ganha prioridade porque é mais relevante para o desejo.
  if (category === 'Career') candidatas.push(candidata('work', perfil.work));
  if (category === 'Love') candidatas.push(candidata('partnerDesire', perfil.partnerDesire));

  candidatas.push(
    candidata('aboutYou', perfil.aboutYou),
    candidata('whyMatters', perfil.whyMatters),
    candidata('location', norm(perfil.dreamLocation) || norm(perfil.city)),
    candidata('dreamHome', casaEmIdioma(perfil.dreamHome, L)),
    candidata('hopedChange', perfil.hopedChange)
  );
  return candidatas.find(Boolean) || null;
}

const OBJETIVOS_PESSOAIS = {
  pt: [
    (d) => `Eu avanço com presença em direção ao que desejo: ${d}.`,
    (d) => `Eu dou passos possíveis na direção do que desejo: ${d}.`,
  ],
  en: [
    (d) => `I move with presence toward what I want: ${d}.`,
    (d) => `I take possible steps toward what I want: ${d}.`,
  ],
};

const FRASES_ANCORA = {
  pt: {
    aboutYou: (a) => `Eu honro o que sei sobre mim: ${a}.`,
    whyMatters: (a) => `Eu mantenho claro o meu motivo: ${a}.`,
    hopedChange: (a) => `Eu mantenho claro o que quero transformar: ${a}.`,
    work: (a) => `Eu reconheço meu caminho profissional: ${a}.`,
    partnerDesire: (a) => `Eu mantenho claro o que busco numa parceria: ${a}.`,
    location: (a) => `Eu dou forma ao lugar que imagino para mim: ${a}.`,
    dreamHome: (a) => `Eu abro espaço para a casa que imagino: ${a}.`,
  },
  en: {
    aboutYou: (a) => `I honor what I know about myself: ${a}.`,
    whyMatters: (a) => `I keep my reason clear: ${a}.`,
    hopedChange: (a) => `I stay clear about what I want to change: ${a}.`,
    work: (a) => `I recognize my professional path: ${a}.`,
    partnerDesire: (a) => `I stay clear about what I seek in a partnership: ${a}.`,
    location: (a) => `I give shape to the place I imagine for myself: ${a}.`,
    dreamHome: (a) => `I make room for the home I imagine: ${a}.`,
  },
};

function afirmacaoComAncora(desejo, ancora, L, seed) {
  const objetivo = trechoSeguro(desejo, 96);
  const abertura = pick(OBJETIVOS_PESSOAIS[L], `${seed}|objetivo`)(objetivo);
  return `${abertura} ${FRASES_ANCORA[L][ancora.key](ancora.text)}`;
}

function ponteComPlanoSeEntao(obstaculo, L, category) {
  const acao = ACOES_PONTE[L][category] || ACOES_PONTE[L].default;
  return L === 'pt'
    ? `Se eu notar que “${obstaculo}” está me travando, então vou ${acao}.`
    : `If I notice “${obstaculo}” getting in my way, then I will ${acao}.`;
}

/**
 * @param {string} desejo  o que a pessoa digitou ("um apartamento na praia")
 * @param {object} perfil  state.profile do onboarding
 * @param {string} lang      'pt' | 'en'
 * @param {string} category  categoria canônica da manifestação
 * @returns {{affirmation:string, story:string, intention:string, anchorIdentity:string, anchorStep:string, usouDoPerfil:string[]}}
 */
export function dreamToAffirmation(desejo, perfil = {}, lang = 'pt', category = '') {
  const L = lang === 'pt' ? 'pt' : 'en';
  const d = limpa(desejo, L) || (L === 'pt' ? 'a vida que eu quero' : 'the life I want');
  const seed = `${d}|${L}`;
  const usou = [];
  const marcarUso = (label) => {
    if (label && !usou.includes(label)) usou.push(label);
  };
  const ancora = selecionaAncoraPessoal(perfil, L, category);

  // Frase verbal ("ganhar na loteria") não encaixa em "a pessoa que tem X" —
  // sorteia só entre os templates que aceitam verbo.
  const ehVerboPT = L === 'pt' && COMECA_VERBO_PT.test(d);
  const affirmation = ancora
    ? afirmacaoComAncora(d, ancora, L, `${seed}|${ancora.key}|${ancora.text}`)
    : (ehVerboPT
        ? pick([AFIRMACOES.pt[1], AFIRMACOES.pt[3]], seed)
        : pick(AFIRMACOES[L], seed))(d);
  if (ancora) marcarUso(ancora.label);

  // ── cena montada com o que a pessoa contou ────────────────────────────────
  const partes = [];
  partes.push(pick(ABERTURAS[L], seed + 'a'));

  const cidade = valorInformativo(perfil.dreamLocation) || valorInformativo(perfil.city);
  const casa = valorInformativo(casaEmIdioma(perfil.dreamHome, L));
  if (cidade || casa) {
    if (cidade) marcarUso(rotuloPerfil(L, 'location'));
    if (casa) marcarUso(rotuloPerfil(L, 'dreamHome'));
    // "onde você disse que queria estar: X" encaixa tanto num nome de cidade
    // ("Lisboa") quanto numa descrição ("perto da praia") — o usuário digita
    // livre e a frase não pode depender de preposição.
    if (L === 'pt') {
      partes.push(
        cidade && casa
          ? `Você está onde disse que queria estar: ${cidade}. E a casa é aquela — ${lower(casa)}.`
          : cidade
          ? `Você está onde disse que queria estar: ${cidade}.`
          : `A casa é aquela que você descreveu: ${lower(casa)}.`
      );
    } else {
      partes.push(
        cidade && casa
          ? `You are where you said you wanted to be: ${cidade}. And the home is the one you pictured — ${lower(casa)}.`
          : cidade
          ? `You are where you said you wanted to be: ${cidade}.`
          : `The home is the one you described: ${lower(casa)}.`
      );
    }
  }

  partes.push(
    L === 'pt'
      ? `E ${d} já faz parte do seu dia — não como novidade, como rotina.`
      : `And ${d} is already part of your day — not as news, as routine.`
  );

  const pessoas = Array.isArray(perfil.people) ? perfil.people.filter((p) => p && p.name) : [];
  const filhos = Array.isArray(perfil.kids) ? perfil.kids.filter((k) => k && k.name) : [];
  const nomes = [...filhos, ...pessoas].slice(0, 2).map((p) => p.name);
  if (nomes.length) {
    marcarUso(rotuloPerfil(L, 'people'));
    const lista = nomes.length === 2 ? `${nomes[0]} e ${nomes[1]}` : nomes[0];
    partes.push(
      L === 'pt'
        ? `${lista} ${nomes.length === 2 ? 'estão' : 'está'} por perto, e você não precisa explicar nada.`
        : `${lista} ${nomes.length === 2 ? 'are' : 'is'} nearby, and you do not have to explain anything.`
      );
  }

  // O roteiro completo guarda mais contexto do que cabe numa única cena. No
  // máximo dois detalhes entram por vez, priorizando a categoria do desejo.
  // Dados demográficos e o nome de uma terceira pessoa nunca são repetidos aqui.
  const detalhes = [];
  const trabalho = norm(perfil.work).slice(0, 160);
  const sentimentoTrabalho = norm(perfil.workFeeling);
  const relacao = norm(perfil.relationshipStatus);
  const parceiro = norm(perfil.partnerDesire).slice(0, 220);
  const sobre = norm(perfil.aboutYou).slice(0, 220);
  const passado = norm(perfil.pastInfluence).slice(0, 220);
  const addDetalhe = (label, text) => {
    if (text) detalhes.push({ label, text });
  };

  if (category === 'Career' && trabalho) {
    const sentir =
      L === 'pt'
        ? TRABALHO_PT[sentimentoTrabalho] || lower(sentimentoTrabalho)
        : lower(sentimentoTrabalho);
    addDetalhe(
      rotuloPerfil(L, 'work'),
      L === 'pt'
        ? `Você trabalha com ${lower(trabalho)}${sentir ? ` e contou ${sentir}` : ''}; agora existe espaço entre ambição e presença.`
        : `You work in ${lower(trabalho)}${sentir ? ` and said you feel ${sentir}` : ''}; there is room now between ambition and presence.`
    );
  }
  if (category === 'Love' && (parceiro || relacao)) {
    const estado = L === 'pt' ? RELACAO_PT[relacao] || lower(relacao) : lower(relacao);
    addDetalhe(
      rotuloPerfil(L, 'partnerDesire'),
      L === 'pt'
        ? `Na vida afetiva, você parte de ${estado || 'onde está hoje'}${parceiro ? ` e reconhece o que quer sentir: ${lower(parceiro)}` : ''}.`
        : `In your love life, you begin with ${estado || 'where you are today'}${parceiro ? ` and recognize what you want to feel: ${lower(parceiro)}` : ''}.`
    );
  }
  if (sobre) {
    addDetalhe(
      rotuloPerfil(L, 'aboutYou'),
      L === 'pt'
        ? `Você se reconhece no que contou sobre si: ${lower(sobre)}.`
        : `You recognize yourself in what you shared: ${lower(sobre)}.`
    );
  }
  if (passado) {
    addDetalhe(
      rotuloPerfil(L, 'pastInfluence'),
      L === 'pt'
        ? `O que você contou sobre o passado - ${lower(passado)} - aparece como contexto, não como destino.`
        : `What you shared about the past - ${lower(passado)} - appears as context, not destiny.`
    );
  }
  if (category !== 'Career' && trabalho) {
    addDetalhe(
      rotuloPerfil(L, 'work'),
      L === 'pt'
        ? `O seu trabalho com ${lower(trabalho)} cabe na cena sem ocupar tudo o que você é.`
        : `Your work in ${lower(trabalho)} belongs in the scene without taking over everything you are.`
    );
  }
  detalhes.slice(0, 2).forEach((detalhe) => {
    marcarUso(detalhe.label);
    partes.push(detalhe.text);
  });

  const obstaculo = trechoSeguro(
    semNomesDeTerceiros(valorInformativo(perfil.obstacle), perfil, L),
    72
  );
  if (obstaculo) {
    marcarUso(rotuloPerfil(L, 'obstacle'));
    partes.push(
      L === 'pt'
        ? `Você reconhece que ${lower(obstaculo)} ainda pode aparecer. Aqui, isso é algo a preparar, não uma prova de fracasso.`
        : `You recognize that ${lower(obstaculo)} may still appear. Here, it is something to prepare for, not proof of failure.`
    );
  }

  const porqueImporta = norm(perfil.whyMatters);
  const mudancaDesejada = norm(perfil.hopedChange);
  const porque = porqueImporta || mudancaDesejada;
  if (porque) {
    marcarUso(rotuloPerfil(L, porqueImporta ? 'whyMatters' : 'hopedChange'));
    partes.push(
      L === 'pt'
        ? `E o motivo continua o mesmo: ${lower(porque)}.`
        : `And the reason is still the same: ${lower(porque)}.`
    );
  }

  partes.push(pick(FECHOS[L], seed + 'f'));

  const intention = ehVerboPT
    ? `${cap(d)} — e achar isso normal.`
    : L === 'pt'
    ? `Viver ${d} como algo normal.`
    : `Living ${d} as something ordinary.`;

  const identitySet = IDENTIDADES[L];
  const stepSet = PONTES[L];

  return {
    affirmation,
    story: partes.join(' '),
    intention,
    anchorIdentity: identitySet[category] || identitySet.default,
    anchorStep: obstaculo
      ? ponteComPlanoSeEntao(obstaculo, L, category)
      : stepSet[category] || stepSet.default,
    usouDoPerfil: usou,
  };
}
