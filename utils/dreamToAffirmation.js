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
    (d) => `Eu já sou a pessoa que tem ${d}. Isso está vindo na minha direção.`,
    (d) => `${cap(d)} não é um pedido meu — é o jeito que a minha vida está ficando.`,
    (d) => `Eu recebo ${d} com naturalidade, como quem recebe o que já é seu.`,
    (d) => `Tudo em mim está alinhado com ${d}, e eu não preciso forçar nada.`,
    (d) => `Eu me permito ter ${d} — e me permito achar isso normal.`,
  ],
  en: [
    (d) => `I am already the person who has ${d}. It is on its way to me.`,
    (d) => `${cap(d)} is not something I beg for — it is simply how my life looks now.`,
    (d) => `I receive ${d} easily, the way you receive what is already yours.`,
    (d) => `Everything in me is aligned with ${d}, and I do not have to force it.`,
    (d) => `I allow myself to have ${d} — and I allow it to feel ordinary.`,
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

function casaEmIdioma(valor, L) {
  const v = norm(valor);
  if (!v) return '';
  if (L !== 'pt') return v;
  return CASAS_PT[v] || v;
}

/**
 * @param {string} desejo  o que a pessoa digitou ("um apartamento na praia")
 * @param {object} perfil  state.profile do onboarding
 * @param {string} lang    'pt' | 'en'
 * @returns {{affirmation:string, story:string, intention:string, usouDoPerfil:string[]}}
 */
export function dreamToAffirmation(desejo, perfil = {}, lang = 'pt') {
  const L = lang === 'pt' ? 'pt' : 'en';
  const d = limpa(desejo, L) || (L === 'pt' ? 'a vida que eu quero' : 'the life I want');
  const seed = `${d}|${L}`;
  const usou = [];

  // Frase verbal ("ganhar na loteria") não encaixa em "a pessoa que tem X" —
  // sorteia só entre os templates que aceitam verbo.
  const ehVerboPT = L === 'pt' && COMECA_VERBO_PT.test(d);
  const affirmation = (ehVerboPT
    ? pick([AFIRMACOES.pt[1], AFIRMACOES.pt[3]], seed)
    : pick(AFIRMACOES[L], seed))(d);

  // ── cena montada com o que a pessoa contou ────────────────────────────────
  const partes = [];
  partes.push(pick(ABERTURAS[L], seed + 'a'));

  const cidade = norm(perfil.dreamLocation) || norm(perfil.city);
  const casa = casaEmIdioma(perfil.dreamHome, L);
  if (cidade || casa) {
    usou.push(cidade ? 'onde quer morar' : 'casa dos sonhos');
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
          ? `You are where you said you wanted to be: ${lower(cidade)}. And the home is the one you pictured — ${lower(casa)}.`
          : cidade
          ? `You are where you said you wanted to be: ${lower(cidade)}.`
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
    usou.push('quem importa pra você');
    const lista = nomes.length === 2 ? `${nomes[0]} e ${nomes[1]}` : nomes[0];
    partes.push(
      L === 'pt'
        ? `${lista} ${nomes.length === 2 ? 'estão' : 'está'} por perto, e você não precisa explicar nada.`
        : `${lista} ${nomes.length === 2 ? 'are' : 'is'} nearby, and you do not have to explain anything.`
    );
  }

  const obstaculo = norm(perfil.obstacle);
  if (obstaculo) {
    usou.push('o que travava você');
    partes.push(
      L === 'pt'
        ? `Aquilo que travava você — ${lower(obstaculo)} — não tem mais tamanho aqui.`
        : `The thing that used to stop you — ${lower(obstaculo)} — has no size here.`
    );
  }

  const porque = norm(perfil.whyMatters) || norm(perfil.hopedChange);
  if (porque) {
    usou.push('por que isso importa');
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

  return { affirmation, story: partes.join(' '), intention, usouDoPerfil: usou };
}
