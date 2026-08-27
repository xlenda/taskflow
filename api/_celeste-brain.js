/*
 * Celeste Brain is deliberately provider-agnostic. It turns verified user
 * input into a factual personal map, retrieves a small knowledge pack, and
 * evaluates generated copy before a provider response can reach the app.
 */

let knowledgeLoadError = null;
let CELESTE_KNOWLEDGE;

try {
  CELESTE_KNOWLEDGE = require('../knowledge/celeste-core-v2.json');
} catch (error) {
  const missingV2 =
    error &&
    error.code === 'MODULE_NOT_FOUND' &&
    String(error.message || '').includes('celeste-core-v2.json');
  if (!missingV2) throw error;
  knowledgeLoadError = error;
  CELESTE_KNOWLEDGE = {
    version: 'celeste-knowledge-v2-pending',
    knowledgeCards: [],
    editorialRules: [],
    generationContracts: {},
    forbiddenClaims: [],
  };
}

const DEFAULT_LIMITS = {
  affirmation: 6,
  scene: 7,
  dream: 6,
  companion: 6,
  check_in: 5,
};

const MAX_FACT_LENGTH = 1600;
const MAX_ARRAY_FACTS = 8;
const MAX_PREVIOUS_KNOWLEDGE_CARD_IDS = 24;
const CONTINUITY_COUNT_MAX = 10000;
const MEMORY_DREAM_THEMES = new Set([
  'clarity',
  'courage',
  'peace',
  'connection',
  'abundance',
  'renewal',
]);
const MEMORY_DREAM_FEELINGS = new Set([
  'calm',
  'joyful',
  'curious',
  'anxious',
  'confused',
  'powerful',
]);
const MEMORY_RECEIPT_SIGNALS = Object.freeze({
  desire: ['prior_desire_thread_present'],
  practice_days: ['practice_history_present', 'routine_present'],
  completed_steps: ['step_completion_history_present', 'completed_step'],
  private_trace_count: ['private_trace_count_present', 'change_trace'],
  consented_dream_theme: ['consented_dream_memory_present'],
});

// These are generation invariants, not optional retrieval lenses. Recognition
// is always personal and truthful; belonging and return never belong to the app.
const CORE_RELATIONSHIP_RULES = [
  "Create recognition from the person's supplied words, values, choices and real progress; never claim to know a hidden need.",
  'Support belonging in their own story and real human relationships or community, never exclusive belonging to Celeste.',
  'Keep every invitation to return optional and grounded in their own reflection or progress; never use guilt, urgency, streak loss or fear.',
];

const FACT_PATHS = [
  ['preferredName', ['profile.preferredName', 'profile.name', 'preferredName', 'name']],
  ['desire', ['desire', 'profile.desire']],
  ['category', ['category', 'profile.category']],
  ['selfDescription', ['profile.selfDescription', 'profile.aboutYou', 'selfDescription', 'aboutYou']],
  ['values', ['profile.values', 'values']],
  ['strengths', ['profile.strengths', 'strengths']],
  ['existingEvidence', ['profile.existingEvidence', 'existingEvidence']],
  ['whyItMatters', ['profile.whyItMatters', 'profile.whyMatters', 'whyItMatters', 'whyMatters']],
  ['desiredFeeling', ['profile.desiredFeeling', 'desiredFeeling']],
  ['timeHorizon', ['profile.timeHorizon', 'timeHorizon']],
  ['plausibility', ['profile.plausibility', 'plausibility']],
  ['work', ['profile.work', 'work']],
  ['workFeeling', ['profile.workFeeling', 'workFeeling']],
  ['relationshipContext', ['profile.relationships', 'profile.relationshipStatus', 'relationshipStatus']],
  ['partnerDesire', ['profile.partnerDesire', 'partnerDesire']],
  ['place', ['profile.place', 'profile.location', 'profile.dreamLocation', 'profile.city', 'location']],
  ['dreamHome', ['profile.dreamHome', 'dreamHome']],
  ['ordinaryFutureScene', ['profile.ordinaryFutureScene', 'ordinaryFutureScene']],
  ['support', ['profile.support', 'support']],
  ['obstacle', ['profile.obstacle', 'obstacle']],
  ['recognizableCue', ['profile.recognizableCue', 'recognizableCue']],
  ['smallAction', ['profile.smallAction', 'smallAction']],
  ['fallback', ['profile.fallback', 'fallback']],
  ['friction', ['profile.friction', 'friction']],
  ['pastInfluence', ['profile.pastInfluence', 'pastInfluence']],
  ['languageStyle', ['profile.languageStyle', 'languageStyle']],
  ['spiritualStyle', ['profile.spiritualStyle', 'spiritualStyle']],
  ['voice', ['profile.voice', 'voice']],
  ['soundscape', ['profile.soundscape', 'soundscape']],
  ['excludedTopics', ['profile.excludedTopics', 'excludedTopics']],
  ['dreamRecall', ['dream', 'exactRecall', 'profile.dream.exactRecall']],
  ['wakingFeeling', ['feeling', 'wakingFeeling', 'profile.dream.wakingFeeling']],
  ['userChosenTheme', ['theme', 'userChosenTheme', 'profile.dream.userChosenMeaning']],
  ['dreamRecurrence', ['recurrence', 'profile.dream.recurrence']],
  ['dreamDistress', ['distress', 'profile.dream.distress']],
  ['dreamImpact', ['impact', 'profile.dream.impact']],
];

const DREAM_FACTS = new Set([
  'preferredName',
  'selfDescription',
  'values',
  'strengths',
  'existingEvidence',
  'whyItMatters',
  'desiredFeeling',
  'obstacle',
  'spiritualStyle',
  'excludedTopics',
  'dreamRecall',
  'wakingFeeling',
  'userChosenTheme',
  'dreamRecurrence',
  'dreamDistress',
  'dreamImpact',
]);

const STOP_WORDS = new Set([
  'a', 'ao', 'aos', 'as', 'com', 'como', 'da', 'das', 'de', 'do', 'dos', 'e', 'ela', 'ele',
  'em', 'essa', 'esse', 'esta', 'este', 'eu', 'isso', 'me', 'meu', 'minha', 'na', 'nas', 'no',
  'nos', 'o', 'os', 'para', 'por', 'que', 'se', 'sem', 'ser', 'sua', 'suas', 'seu', 'seus',
  'um', 'uma', 'voce', 'the', 'a', 'an', 'and', 'as', 'at', 'be', 'for', 'from', 'i', 'in',
  'is', 'it', 'me', 'my', 'of', 'on', 'or', 'that', 'this', 'to', 'with', 'you', 'your',
]);

const DOMAIN_ALIASES = {
  relationship: 'love',
  relationships: 'love',
  romance: 'love',
  romantic: 'love',
  amor: 'love',
  wealth: 'prosperity',
  money: 'prosperity',
  finance: 'prosperity',
  finances: 'prosperity',
  financial: 'prosperity',
  abundance: 'prosperity',
  dinheiro: 'prosperity',
  prosperidade: 'prosperity',
  purpose: 'career',
  work: 'career',
  trabalho: 'career',
  carreira: 'career',
  wellbeing: 'health',
  wellness: 'health',
  saude: 'health',
  self_worth: 'confidence',
  self_esteem: 'confidence',
  autoestima: 'confidence',
  confianca: 'confidence',
  calm: 'peace',
  emotional_balance: 'peace',
  emotional_regulation: 'peace',
  paz: 'peace',
  dream_reflection: 'dream',
  dreams: 'dream',
  sonhos: 'dream',
};

const DOMAIN_PATTERNS = [
  ['love', /\b(?:amor|amar|relacionamento|parceria|parceir[oa]|romance|love|relationship|partner|romance)\b/i],
  ['prosperity', /\b(?:dinheiro|renda|prosperidade|abundancia|financeir[oa]|money|income|wealth|prosperity|financial)\b/i],
  ['career', /\b(?:carreira|trabalho|profissao|negocio|empresa|career|work|profession|business)\b/i],
  ['health', /\b(?:saude|bem-estar|energia|health|wellbeing|wellness)\b/i],
  ['confidence', /\b(?:confianca|autoestima|coragem|confidence|self-esteem|self worth|courage)\b/i],
  ['peace', /\b(?:paz|calma|serenidade|equilibrio|peace|calm|serenity|balance)\b/i],
  ['home', /\b(?:casa|lar|moradia|home|house)\b/i],
  ['dream', /\b(?:sonho|pesadelo|dream|nightmare)\b/i],
];

const GRAPHIC_CONTENT_PATTERNS = [
  /\b(?:sangue|sangrar|ensanguent|cadaver|morrer|morreu|morto|morta|matar|matou|assassinar|assassinato|suicid|estupro|violencia|agressao|ferida|ferido|ferimento|arma|tiro|bala|faca|facada|lamina|serra|motosserra|eletrosserra|cortar|cortado|cortada|amput|decapit|esquartej|mutil|dilacer|desmembr|atropel)\b/i,
  /\b(?:blood|bleed|bleeding|gore|corpse|dead|death|dying|kill|killed|killing|murder|murdered|suicid|rape|violence|violent|assault|wound|wounded|injury|injured|weapon|gun|shooting|bullet|knife|stabbed|stabbing|blade|chainsaw|electric saw|power saw|circular saw|cutting|amputat|decapitat|dismember|mutilat|disembowel|run over)\b/i,
  /\b(?:cortad[oa]|partid[oa])\s+(?:ao|em)\s+meio\b/i,
  /\b(?:cut|sliced|split)\s+(?:me|you|him|her|them|someone)?\s*(?:in|into)\s+half\b/i,
];

const RISK_PATTERNS = {
  promise: [
    /\b(?:garantid[oa]s?|vai acontecer|certamente acontecera|sem duvida acontecera|destinad[oa] a|ja (?:e|eh) (?:seu|sua)|esta a caminho|o universo (?:vai|ira)|manifestara inevitavelmente)\b/i,
    /\b(?:guaranteed|certain to happen|definitely will happen|destined to|already yours|on its way|the universe will|will inevitably manifest)\b/i,
    /\b(?:voce|seu desejo|isso).{0,40}(?:vai|ira).{0,30}(?:acontecer|se realizar|se concretizar|dar certo)\b/i,
    /\bvoce (?:vai|ira) conseguir (?:tudo|isso|o que deseja|realizar seu desejo)\b/i,
    /\b(?:you|your wish|your desire|it).{0,40}will.{0,30}(?:happen|come true|become reality|work out)\b/i,
    /\beu (?:ja )?(?:tenho|possuo|estou vivendo) (?:a casa dos sonhos|riqueza ilimitada|todo o dinheiro|o relacionamento perfeito)\b/i,
    /\bi (?:already )?(?:have|own|am living) (?:my dream home|unlimited wealth|all the money|the perfect relationship)\b/i,
    /\b(?:repetir|ouvir) (?:esta|essa) afirmacao (?:fara|vai fazer).{0,50}(?:acontecer|realidade)\b/i,
    /\b(?:repeating|listening to) this affirmation will.{0,50}(?:happen|reality|come true)\b/i,
  ],
  diagnosis: [
    /\b(?:diagnosticad[oa]|voce (?:tem|sofre de) (?:ansiedade|depressao|trauma|transtorno)|(?:isso|seu sonho|este sonho|esse sonho) (?:prova|confirma|mostra) que voce tem|(?:isso|este sonho|esse sonho) (?:e|representa|confirma) um diagnostico|cura trauma|trata depressao)\b/i,
    /\b(?:diagnosed|you (?:have|suffer from) (?:anxiety|depression|trauma|a disorder)|(?:this|your dream|this dream) (?:proves|confirms|shows) you have|(?:this|this dream) (?:is|represents|confirms) a diagnosis|heals trauma|treats depression)\b/i,
    /\b(?:indica|indique|sugere|sugira|aponta|aponte|demonstra|demonstre|mostra|mostre|reflete|reflita|representa|represente).{0,80}\b(?:trauma|conflito|verdade|memoria|desejo|medo) (?:reprimid[oa]s?|ocult[oa]s?|escondid[oa]s?|inconsciente)\b/i,
    /\b(?:indicates|suggests|points to|demonstrates|shows|reflects|represents).{0,80}\b(?:repressed|suppressed|hidden|unconscious) (?:trauma|conflict|truth|memory|desire|fear)\b/i,
  ],
  dependency: [
    /\b(?:so a celeste|apenas a celeste|so eu) (?:te entende|me entende|entendo voce|entende voce|pode te ajudar)\b/i,
    /\b(?:so|apenas|somente) a celeste (?:entende|compreende|sabe) (?:o que (?:isso|esse sonho|essa experiencia|essa dor|esse desejo) significa para voce|como voce se sente|quem voce e de verdade)\b/i,
    /\b(?:voce precisa|precisa) (?:de mim|da celeste|deste app|me ouvir todos os dias)\b/i,
    /\b(?:sem (?:mim|a celeste|este app).{0,30}(?:nao consegue|nao vai conseguir|vai regredir))\b/i,
    /\b(?:only celeste|only i) (?:understands you|can help you)\b/i,
    /\b(?:only celeste|celeste alone) (?:understands|knows) (?:what (?:this|that|your dream|your pain|your desire) means to you|how you feel|who you really are)\b/i,
    /\b(?:so aqui voce e compreendid[oa]|eu sou a unica (?:pessoa )?que te entende|voce pertence a celeste|celeste e seu unico lugar seguro)\b/i,
    /\b(?:only here are you understood|i am the only one who understands you|you belong to celeste|celeste is your only safe place)\b/i,
    /\bceleste (?:e|eh) quem.{0,45}(?:entende|compreende) (?:me|te|voce).{0,60}(?:sabe|conhece).{0,35}(?:do que (?:eu preciso|voce precisa)|o que (?:eu preciso|voce precisa)|(?:suas|minhas) necessidades)\b/i,
    /\bceleste (?:e|eh) (?:o|a) unic[oa] (?:lugar|espaco|voz|presenca|companhia).{0,70}(?:compreende|entende|acolhe|conhece)\b/i,
    /\b(?:minha|sua) (?:evolucao|cura|seguranca|paz|progresso|bem estar).{0,35}(?:depende|so acontece).{0,60}(?:voltar|abrir|ouvir|celeste|aqui)\b/i,
    /\bceleste is (?:the one|who).{0,50}(?:understands|gets) (?:me|you).{0,60}(?:knows|understands).{0,30}(?:what (?:i|you) need|my needs|your needs)\b/i,
    /\bceleste is (?:the )?only (?:place|space|voice|presence|companion).{0,70}(?:understands|gets|knows).{0,25}(?:me|you)\b/i,
    /\b(?:my|your) (?:growth|healing|safety|peace|progress|well being).{0,35}(?:depends on|requires).{0,60}(?:coming back|returning|opening|listening|celeste|here)\b/i,
    /\b(?:you need (?:me|celeste|this app)|without (?:me|celeste|this app).{0,30}(?:you cannot|you can t|you will regress))\b/i,
  ],
  manipulation: [
    /\b(?:nao quebre (?:a|sua) sequencia|vai perder (?:seu|todo o) progresso|prove (?:seu compromisso|que voce quer)|se voce realmente quiser|nao nos abandone)\b/i,
    /\b(?:eu preciso|voce precisa|precisa) .{0,30}(?:voltar|abrir|ouvir).{0,30}(?:todos os dias|diariamente).{0,50}(?:nao perder|manter|preservar) (?:meu|seu|o) progresso\b/i,
    /\b(?:se eu nao voltar|se voce nao voltar|sem voltar).{0,50}(?:perco|perde|perder|regredir)\b/i,
    /\b(?:do not break your streak|don t break your streak|you will lose (?:your|all) progress|prove (?:your commitment|you want it)|if you really want it|do not leave us|don t leave us)\b/i,
    /\b(?:voce precisa voltar|volte) todos os dias\b/i,
    /\b(?:you need to come back|come back) every day\b/i,
    /\b(?:minha|sua) (?:evolucao|cura|seguranca|paz|progresso|bem estar).{0,35}(?:depende|so acontece).{0,60}(?:voltar|abrir|ouvir|celeste|aqui)\b/i,
    /\b(?:my|your) (?:growth|healing|safety|peace|progress|well being).{0,35}(?:depends on|requires).{0,60}(?:coming back|returning|opening|listening|celeste|here)\b/i,
  ],
  literalDream: [
    /\b(?:seu sonho|esse sonho|sonhar com .{0,40}) (?:significa|revela|prova|preve|prediz)\b/i,
    /\b(?:o simbolo|essa imagem) (?:significa|revela)\b/i,
    /\b(?:your dream|this dream|dreaming (?:about|of) .{0,40}) (?:means|reveals|proves|predicts)\b/i,
    /\b(?:the symbol|this image) (?:means|reveals)\b/i,
    /\b(?:a|o|essa|esse|esta|este) [a-z0-9 ]{2,40} (?:significa|revela|preve|prediz)\b/i,
    /\b(?:the|this|that) [a-z0-9 ]{2,40} (?:means|reveals|predicts)\b/i,
    /\b(?:seu|esse|este|o) sonho.{0,30}(?:indica|indique|sugere|sugira|aponta|aponte|demonstra|demonstre|mostra|mostre|reflete|reflita|representa|represente)\b/i,
    /\b(?:your|this|that|the) dream.{0,30}(?:indicates|suggests|points to|demonstrates|shows|reflects|represents)\b/i,
    /\b(?:a|o|essa|esse|esta|este) (?:simbolo|imagem|cena|sala|cor|porta|casa|agua|animal)(?: [a-z0-9]{1,24}){0,3} (?:indica|indique|sugere|sugira|aponta|aponte|demonstra|demonstre|mostra|mostre|reflete|reflita|representa|represente)\b/i,
    /\b(?:the|this|that) (?:symbol|image|scene|room|color|door|house|water|animal)(?: [a-z0-9]{1,24}){0,3} (?:indicates|suggests|points to|demonstrates|shows|reflects|represents)\b/i,
    /\b(?:indica|indique|sugere|sugira|aponta|aponte|demonstra|demonstre|mostra|mostre|reflete|reflita|representa|represente).{0,80}\b(?:trauma|conflito|verdade|memoria|desejo|medo) (?:reprimid[oa]s?|ocult[oa]s?|escondid[oa]s?|inconsciente)\b/i,
    /\b(?:indicates|suggests|points to|demonstrates|shows|reflects|represents).{0,80}\b(?:repressed|suppressed|hidden|unconscious) (?:trauma|conflict|truth|memory|desire|fear)\b/i,
  ],
};

const GENERIC_PATTERNS = [
  /\b(?:acredite em voce|tudo vai dar certo|voce consegue tudo|basta acreditar|pensamento positivo|sua melhor versao)\b/i,
  /\b(?:believe in yourself|everything will be fine|you can do anything|just believe|positive vibes|best version of yourself|trust the process)\b/i,
  /\b(?:eu sou capaz|eu sou merecedor[ao]?|i am worthy|i am enough)\b/i,
  /\b(?:voce e especial e merece tudo|you are special and deserve everything)\b/i,
];

const SEMANTIC_FACT_ALIASES = {
  wakingFeeling: {
    calm: ['calm', 'calma', 'calmo', 'tranquila', 'tranquilo'],
    joyful: ['joyful', 'joy', 'alegre', 'alegria', 'feliz'],
    curious: ['curious', 'curiosa', 'curioso', 'curiosidade'],
    anxious: ['anxious', 'ansiosa', 'ansioso', 'ansiedade', 'inquieta', 'inquieto'],
    confused: ['confused', 'confusa', 'confuso', 'confusao'],
    powerful: ['powerful', 'forte', 'potente', 'poderosa', 'poderoso'],
  },
  userChosenTheme: {
    clarity: ['clarity', 'clareza'],
    courage: ['courage', 'coragem'],
    peace: ['peace', 'paz', 'calma'],
    connection: ['connection', 'conexao', 'vinculo'],
    abundance: ['abundance', 'abundancia', 'prosperidade'],
    renewal: ['renewal', 'renovacao', 'recomeco'],
  },
};

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cleanText(value, maxLength = MAX_FACT_LENGTH) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeText(value) {
  return cleanText(String(value || ''), 20_000)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeIdentifier(value) {
  return normalizeText(value).replace(/\s+/g, '_').slice(0, 80);
}

function normalizeScope(scope) {
  const value = normalizeIdentifier(scope || 'scene');
  if (value === 'checkin' || value === 'check_in' || value === 'daily_check_in') return 'check_in';
  if (value === 'dream_reflection' || value === 'sonho') return 'dream';
  if (value === 'anchor_scene' || value === 'cena') return 'scene';
  return value || 'scene';
}

function normalizeDomain(value) {
  const normalized = normalizeIdentifier(value);
  return DOMAIN_ALIASES[normalized] || normalized;
}

function boundedUnique(values, mapper = normalizeIdentifier, limit = 32) {
  const list = Array.isArray(values) ? values : values === undefined || values === null ? [] : [values];
  const output = [];
  const seen = new Set();
  for (const value of list) {
    const normalized = mapper(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function boundedContinuityCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= CONTINUITY_COUNT_MAX
    ? value
    : undefined;
}

function validIsoDay(value) {
  const day = cleanText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const [year, month, date] = day.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, date);
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === date
    ? day
    : '';
}

function daysSinceIsoDay(value, now = new Date()) {
  const day = validIsoDay(value);
  if (!day || !(now instanceof Date) || !Number.isFinite(now.getTime())) return undefined;
  const [year, month, date] = day.split('-').map(Number);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const elapsed = Math.floor((today - Date.UTC(year, month - 1, date)) / 86_400_000);
  return elapsed >= 0 ? elapsed : undefined;
}

function continuityMemory(input) {
  const continuity = isPlainObject(input && input.continuity) ? input.continuity : {};
  const memory = {};
  const chapter = boundedContinuityCount(continuity.chapter);
  if (chapter !== undefined && chapter >= 2 && chapter <= 365) memory.chapter = chapter;
  for (const key of ['practiceDays', 'evidenceCount', 'stepCompletions', 'dreamCount']) {
    const value = boundedContinuityCount(continuity[key]);
    if (value !== undefined) memory[key] = value;
  }
  if (MEMORY_DREAM_THEMES.has(continuity.latestDreamTheme)) {
    memory.latestDreamTheme = continuity.latestDreamTheme;
  }
  if (MEMORY_DREAM_FEELINGS.has(continuity.latestDreamFeeling)) {
    memory.latestDreamFeeling = continuity.latestDreamFeeling;
  }
  const lastPracticeDay = validIsoDay(continuity.lastPracticeDay);
  if (lastPracticeDay) memory.lastPracticeDay = lastPracticeDay;
  if (typeof continuity.previousStepCompleted === 'boolean') {
    memory.previousStepCompleted = continuity.previousStepCompleted;
  }

  const chronology = isPlainObject(continuity.chronology) ? continuity.chronology : {};
  const recentChapterSignals = new Set();
  const recentChapters = Array.isArray(chronology.recentChapters)
    ? chronology.recentChapters.slice(0, 3)
    : [];
  recentChapters.forEach((entry) => {
    if (!isPlainObject(entry)) return;
    if (Number.isInteger(entry.chapter) && entry.chapter >= 1 && entry.chapter <= 365) {
      recentChapterSignals.add('prior_chapter_present');
    }
    if (entry.lang === 'pt' || entry.lang === 'en') {
      recentChapterSignals.add('recent_language_present');
    }
    if (['title', 'intention', 'affirmation', 'anchorIdentity'].some((key) => Boolean(cleanText(entry[key], 20)))) {
      recentChapterSignals.add('prior_content_present');
    }
    if (cleanText(entry.anchorStep, 20)) {
      recentChapterSignals.add('prior_content_present');
      recentChapterSignals.add('prior_bridge_present');
      recentChapterSignals.add('next_open_thread_present');
    }
    boundedUnique(entry.memoryReceipt, normalizeIdentifier, 5).forEach((receipt) => {
      (MEMORY_RECEIPT_SIGNALS[receipt] || []).forEach((signal) => {
        recentChapterSignals.add(signal);
      });
    });
  });
  if (recentChapterSignals.size) {
    memory.recentChapterSignals = [...recentChapterSignals].sort();
  }

  return memory;
}

function textArray(value, limit = 12, maxLength = 700) {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const output = [];
  const seen = new Set();
  for (const item of values) {
    const text = cleanText(item, maxLength);
    const normalized = normalizeText(text);
    if (!text || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(text);
    if (output.length >= limit) break;
  }
  return output;
}

function getPath(input, path) {
  let value = input;
  for (const key of String(path).split('.')) {
    if (!isPlainObject(value) || !Object.prototype.hasOwnProperty.call(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

function cleanFact(value) {
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    const entries = value
      .map((item) => {
        if (typeof item === 'string') return cleanText(item, 300);
        if (typeof item === 'number' && Number.isFinite(item)) return item;
        if (typeof item === 'boolean') return item;
        return undefined;
      })
      .filter((item) => item !== undefined && item !== '');
    return entries.slice(0, MAX_ARRAY_FACTS);
  }
  return undefined;
}

function factHasValue(value) {
  if (typeof value === 'string') return Boolean(value);
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

function extractFacts(scope, input) {
  const facts = {};
  const sources = {};
  const scopedToDream = scope === 'dream';
  for (const [key, paths] of FACT_PATHS) {
    if (scopedToDream && !DREAM_FACTS.has(key)) continue;
    for (const path of paths) {
      const value = cleanFact(getPath(input, path));
      if (!factHasValue(value)) continue;
      if (key === 'userChosenTheme' && normalizeIdentifier(value) === 'auto') break;
      facts[key] = value;
      sources[key] = path;
      break;
    }
  }
  return { facts, sources };
}

function factText(value) {
  if (Array.isArray(value)) return value.join(' ');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

function combinedFactText(facts) {
  return Object.values(facts).map(factText).filter(Boolean).join(' ');
}

function detectDomains(scope, input, facts, suppliedMemory) {
  const domains = new Set();
  const memory = isPlainObject(suppliedMemory) ? suppliedMemory : continuityMemory(input);
  const explicit = [];
  if (Array.isArray(input && input.domains)) explicit.push(...input.domains);
  if (input && input.domain !== undefined) explicit.push(input.domain);
  if (facts.category) explicit.push(facts.category);
  explicit.forEach((value) => {
    const domain = normalizeDomain(value);
    if (domain) domains.add(domain);
  });

  const text = normalizeText(combinedFactText(facts));
  DOMAIN_PATTERNS.forEach(([domain, pattern]) => {
    if (pattern.test(text)) domains.add(domain);
  });
  if (facts.desire) domains.add('goal_pursuit');
  if (facts.whyItMatters || facts.values) {
    domains.add('values');
    domains.add('goal_alignment');
  }
  if (facts.selfDescription) domains.add('identity');
  if (facts.strengths || facts.existingEvidence) domains.add('competence');
  if (facts.strengths) domains.add('strengths');
  if (facts.obstacle) domains.add('obstacles');
  if (facts.recognizableCue) domains.add('cue');
  if (facts.smallAction) {
    domains.add('action');
    domains.add('controllability');
  }
  if (facts.friction) domains.add('friction');
  const hasJourneyMemory = Object.keys(memory).some((key) => key !== 'chapter');
  if (hasJourneyMemory) {
    domains.add('memory');
    domains.add('chronology');
  }
  if ((memory.practiceDays || 0) > 0 || memory.lastPracticeDay) domains.add('habit');
  if ((memory.evidenceCount || 0) > 0 || (memory.stepCompletions || 0) > 0) {
    domains.add('progress');
    domains.add('measurement');
  }
  if ((memory.dreamCount || 0) > 0 || memory.latestDreamTheme) domains.add('dream');
  if (memory.latestDreamFeeling) domains.add('emotion');
  if (scope === 'dream') {
    domains.add('dream');
    domains.add('reflection');
    if (facts.wakingFeeling) domains.add('emotion');
    if (containsGraphicContent(factText(facts.dreamRecall))) {
      domains.add('graphic_content');
      domains.add('nightmare');
      domains.add('safety');
    }
  }
  return [...domains].sort();
}

function containsGraphicContent(value) {
  const text = normalizeText(value);
  return Boolean(text) && GRAPHIC_CONTENT_PATTERNS.some((pattern) => pattern.test(text));
}

function detectSignals(scope, input, facts, suppliedMemory) {
  const signals = new Set();
  const memory = isPlainObject(suppliedMemory) ? suppliedMemory : continuityMemory(input);
  const explicit = Array.isArray(input && input.signals) ? input.signals : [];
  boundedUnique(explicit).forEach((signal) => signals.add(signal));

  signals.add('generated_content');
  if (scope === 'scene') {
    signals.add('scene_requested');
    signals.add('future_scene_requested');
    signals.add('affirmation_requested');
  }
  if (scope === 'affirmation') signals.add('affirmation_requested');
  if (scope === 'check_in') signals.add('check_in_requested');
  if (facts.desire) {
    signals.add('desired_future');
    signals.add('desire_present');
  }
  if (facts.whyItMatters || facts.values) {
    signals.add('values');
    signals.add('value_present');
    signals.add('why_it_matters_present');
  }
  if (facts.selfDescription || facts.strengths) {
    signals.add('self_knowledge');
    signals.add('safe_profile_anchor_present');
  }
  if (facts.strengths) signals.add('strength_present');
  if (facts.existingEvidence) {
    signals.add('existing_evidence');
    signals.add('existing_evidence_present');
  }
  if (facts.obstacle) {
    signals.add('obstacle');
    signals.add('obstacle_present');
  }
  if (facts.recognizableCue) {
    signals.add('recognizable_cue');
    signals.add('recognizable_cue_present');
  }
  if (facts.smallAction) {
    signals.add('small_action');
    signals.add('small_action_present');
    signals.add('action_present');
    signals.add('next_step_offered');
  }
  if (facts.friction) signals.add('friction');
  if (facts.support || facts.relationshipContext) signals.add('human_connection');
  if (facts.ordinaryFutureScene) {
    signals.add('ordinary_future_scene');
    signals.add('ordinary_future_detail_present');
  }
  if (facts.pastInfluence) signals.add('past_influence');
  if (facts.desiredFeeling) signals.add('desired_feeling_present');
  if (facts.languageStyle) signals.add('language_style_present');
  if (facts.spiritualStyle) signals.add('spiritual_style_present');
  if (facts.soundscape) signals.add('soundscape_present');
  if (facts.excludedTopics) signals.add('excluded_topic_present');
  if (Object.keys(facts).length > 2) signals.add('context_present');

  if (Number.isInteger(memory.chapter) && memory.chapter > 1) {
    signals.add('continuity');
    signals.add('prior_chapter_present');
  }
  const continuity = isPlainObject(input && input.continuity) ? input.continuity : {};
  if (isPlainObject(continuity.previousScene)) signals.add('prior_content_present');
  if (memory.previousStepCompleted === true) {
    signals.add('previous_step_completed');
    signals.add('completed_step');
    signals.add('change_trace');
  }
  if (memory.previousStepCompleted === false) {
    signals.add('previous_step_not_completed');
    signals.add('step_not_completed');
  }

  const hasJourneyMemory = Object.keys(memory).some((key) => key !== 'chapter');
  if (hasJourneyMemory) {
    signals.add('consented_memory_present');
    signals.add('memory_retrieval');
  }
  if ((memory.practiceDays || 0) > 0) {
    signals.add('practice_history_present');
    if (memory.practiceDays >= 2) {
      signals.add('repeated_action');
      signals.add('routine_present');
    }
  }
  if ((memory.evidenceCount || 0) > 0) {
    signals.add('private_trace_count_present');
    signals.add('change_trace');
    signals.add('no_external_result');
  }
  if ((memory.stepCompletions || 0) > 0) {
    signals.add('step_completion_history_present');
    signals.add('completed_step');
    signals.add('change_trace');
  }
  if ((memory.dreamCount || 0) > 0) signals.add('consented_dream_memory_present');
  if (memory.latestDreamTheme) signals.add('consented_dream_theme_present');
  if (memory.latestDreamFeeling) signals.add('consented_dream_feeling_present');
  if (memory.lastPracticeDay) {
    signals.add('last_practice_day_present');
    const elapsedDays = daysSinceIsoDay(memory.lastPracticeDay);
    if ((memory.practiceDays || 0) >= 2 && elapsedDays !== undefined && elapsedDays >= 2) {
      signals.add('missed_day');
      signals.add('practice_gap_present');
      signals.add('return_after_gap');
    }
  }
  (memory.recentChapterSignals || []).forEach((signal) => signals.add(signal));

  if (scope === 'dream') {
    signals.add('dream_recall');
    signals.add('dream_reported');
    signals.add('dream_affirmation_requested');
    if (facts.wakingFeeling) {
      signals.add('waking_feeling');
      signals.add('waking_feeling_present');
    }
    if (facts.userChosenTheme) {
      signals.add('user_chosen_meaning');
      signals.add('user_chosen_meaning_present');
    }
    if (facts.dreamRecurrence) {
      signals.add('recurring_dream');
      signals.add('recurrent_nightmare');
    }
    if (facts.dreamDistress || facts.dreamImpact) signals.add('difficulty_reported');
    if (containsGraphicContent(factText(facts.dreamRecall))) {
      signals.add('graphic_nightmare');
      signals.add('graphic_dream');
      signals.add('violent_dream');
      signals.add('sensitive_input');
      signals.add('present_safety');
    } else {
      signals.add('non_graphic_recall');
    }
    const feeling = normalizeIdentifier(facts.wakingFeeling);
    if (['anxious', 'confused', 'afraid', 'fearful', 'ansioso', 'ansiosa', 'confuso', 'confusa'].includes(feeling)) {
      signals.add('difficult_feeling');
      signals.add('self_compassion');
    }
  }

  return [...signals].sort();
}

function buildPersonalMap(scope = 'scene', input = {}) {
  const normalizedScope = normalizeScope(scope);
  const safeInput = isPlainObject(input) ? input : {};
  const { facts, sources } = extractFacts(normalizedScope, safeInput);
  const memory = continuityMemory(safeInput);
  const domains = detectDomains(normalizedScope, safeInput, facts, memory);
  const signals = detectSignals(normalizedScope, safeInput, facts, memory);
  const anchors = Object.entries(facts).map(([key, value]) => ({
    key,
    value,
    source: sources[key],
  }));
  const language = cleanText(safeInput.lang || safeInput.language, 12) || 'pt';
  return {
    scope: normalizedScope,
    language,
    facts,
    anchors,
    domains,
    signals,
    continuity: memory,
    factKeys: Object.keys(facts),
  };
}

function cardCollection(knowledge = CELESTE_KNOWLEDGE) {
  const candidates = [
    knowledge && knowledge.knowledgeCards,
    knowledge && knowledge.cards,
    knowledge && knowledge.concepts,
    knowledge && knowledge.principles,
    knowledge && knowledge.library && knowledge.library.cards,
    knowledge && knowledge.knowledgeBase && knowledge.knowledgeBase.cards,
  ];
  return candidates.find(Array.isArray) || [];
}

function normalizeCard(card, index = 0) {
  if (!isPlainObject(card)) return null;
  const id = normalizeIdentifier(card.id || card.key || card.slug || `card_${index + 1}`);
  if (!id) return null;
  const scopes = boundedUnique(card.scopes || card.scope || ['all'], normalizeScope);
  const domains = boundedUnique(card.domains || card.domain, normalizeDomain);
  const signals = boundedUnique(card.signals || card.triggers || card.when);
  const coverage = boundedUnique(card.coverage || card.coverageTags || card.tags);
  const principle = cleanText(card.principle || card.summary || card.content || card.statement, 1200);
  const apply = textArray(card.apply || card.guidance || card.instructions, 12, 700);
  const limits = textArray(card.limits || card.guardrails, 12, 700);
  const avoid = textArray(card.avoid, 12, 700);
  const sources = textArray(card.sources || card.sourceIds || card.evidence, 10, 500);
  const evidenceLevel = normalizeIdentifier(card.evidenceLevel || card.evidence_level);
  const promptCue = cleanText(card.promptCue || card.prompt_cue, 900);
  const rawPriority = Number(card.priority);
  const priority = Number.isFinite(rawPriority) ? Math.max(-10, Math.min(10, rawPriority)) : 0;
  const lens = normalizeIdentifier(card.lens || card.family || card.category || coverage[0] || id);
  const alwaysConsider = boundedUnique(
    CELESTE_KNOWLEDGE.retrievalPolicy && CELESTE_KNOWLEDGE.retrievalPolicy.alwaysConsider
  );
  return {
    id,
    scopes: scopes.length ? scopes : ['all'],
    domains,
    signals,
    coverage,
    lens,
    priority,
    core:
      card.core === true ||
      card.required === true ||
      card.always === true ||
      alwaysConsider.includes(id),
    principle,
    apply,
    limits,
    avoid,
    evidenceLevel,
    sources,
    promptCue,
  };
}

function normalizeKnowledgeCards(knowledge = CELESTE_KNOWLEDGE) {
  return cardCollection(knowledge)
    .map((card, index) => normalizeCard(card, index))
    .filter(Boolean);
}

function intersects(first, second) {
  const lookup = second instanceof Set ? second : new Set(second || []);
  return (first || []).filter((value) => lookup.has(value));
}

function scopeMatches(card, scope) {
  return (
    card.scopes.includes(scope) ||
    (scope === 'scene' && card.scopes.includes('affirmation')) ||
    card.scopes.includes('all') ||
    card.scopes.includes('global')
  );
}

function cardRelevance(card, map) {
  const domains = new Set(map.domains);
  const signals = new Set(map.signals);
  const matchedDomains = intersects(card.domains, domains);
  const matchedSignals = intersects(card.signals, signals);
  const specificDomains = card.domains.filter((value) => !['all', 'general', 'global'].includes(value));
  const specificSignals = card.signals.filter((value) => !['all', 'always', 'general'].includes(value));
  const domainRelevant = !specificDomains.length || matchedDomains.length > 0;
  const signalRelevant = !specificSignals.length || matchedSignals.length > 0;
  const relevant = card.core || (
    specificDomains.length && specificSignals.length
      ? domainRelevant || signalRelevant
      : domainRelevant && signalRelevant
  );
  const exactScope = card.scopes.includes(map.scope);
  const score =
    (exactScope ? 40 : 16) +
    matchedDomains.length * 12 +
    matchedSignals.length * 14 +
    card.priority * 2 +
    (card.core ? 8 : 0) -
    (!domainRelevant ? 14 : 0) -
    (!signalRelevant ? 12 : 0);
  return { relevant, score, matchedDomains, matchedSignals };
}

function validPreviousKnowledgeCardIds(input, cards = normalizeKnowledgeCards()) {
  const continuity = isPlainObject(input && input.continuity) ? input.continuity : {};
  const knownIds = new Set(cards.map((card) => card.id));
  return boundedUnique(continuity.previousKnowledgeCardIds)
    .filter((id) => knownIds.has(id))
    .slice(0, MAX_PREVIOUS_KNOWLEDGE_CARD_IDS);
}

function evidenceLevelIsRequiredSafety(card, relevance) {
  return (
    card.evidenceLevel === 'safety_guideline' &&
    (card.core || (relevance && relevance.matchedSignals && relevance.matchedSignals.length > 0))
  );
}

function selectKnowledgeCards(scope = 'scene', input = {}, options = {}) {
  const map = buildPersonalMap(scope, input);
  const requestedLimit = Number(options && options.limit);
  const fallbackLimit = DEFAULT_LIMITS[map.scope] || 6;
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(12, Math.floor(requestedLimit)))
    : fallbackLimit;
  const allCards = normalizeKnowledgeCards();
  const previousIds = new Set(validPreviousKnowledgeCardIds(input, allCards));
  const candidates = allCards
    .filter((card) => scopeMatches(card, map.scope))
    .map((card) => {
      const relevance = cardRelevance(card, map);
      const previouslyUsed = previousIds.has(card.id);
      return {
        card,
        ...relevance,
        previouslyUsed,
        // A used card can still return when it is the only relevant safety or
        // coverage card, but an equally relevant fresh card always wins.
        score:
          relevance.score -
          (previouslyUsed && evidenceLevelIsRequiredSafety(card, relevance) ? 0 : previouslyUsed ? 1000 : 0),
      };
    })
    .filter((entry) => entry.relevant);

  const selected = [];
  const coveredDomains = new Set();
  const coveredSignals = new Set();
  const coveredLenses = new Set();
  while (selected.length < limit && candidates.length) {
    candidates.sort((left, right) => {
      const adjusted = (entry) => {
        const newDomains = entry.matchedDomains.filter((value) => !coveredDomains.has(value)).length;
        const newSignals = entry.matchedSignals.filter((value) => !coveredSignals.has(value)).length;
        const newLens = coveredLenses.has(entry.card.lens) ? 0 : 1;
        return entry.score + newDomains * 8 + newSignals * 9 + newLens * 5;
      };
      return adjusted(right) - adjusted(left) || left.card.id.localeCompare(right.card.id);
    });
    const next = candidates.shift();
    next.matchedDomains.forEach((value) => coveredDomains.add(value));
    next.matchedSignals.forEach((value) => coveredSignals.add(value));
    coveredLenses.add(next.card.lens);
    selected.push({
      ...next.card,
      matchedDomains: next.matchedDomains,
      matchedSignals: next.matchedSignals,
      selectionScore: next.score,
      previouslyUsed: next.previouslyUsed,
    });
  }
  return selected;
}

function scopedRule(rule, scope, signals) {
  if (typeof rule === 'string') return { text: cleanText(rule, 900), priority: 0, matched: true };
  if (!isPlainObject(rule)) return null;
  const text = cleanText(rule.text || rule.rule || rule.content || rule.principle, 900);
  if (!text) return null;
  const scopes = boundedUnique(rule.scopes || rule.scope || ['all'], normalizeScope);
  if (!scopes.includes(scope) && !scopes.includes('all') && !scopes.includes('global')) return null;
  const requiredSignals = boundedUnique(rule.signals || rule.when);
  const matches = !requiredSignals.length || intersects(requiredSignals, new Set(signals)).length > 0;
  return {
    text,
    priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0,
    matched: matches || rule.required === true,
  };
}

function selectRules(rules, scope, signals, limit) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => scopedRule(rule, scope, signals))
    .filter((rule) => rule && rule.matched)
    .sort((left, right) => right.priority - left.priority || left.text.localeCompare(right.text))
    .slice(0, limit)
    .map((rule) => rule.text);
}

function generationContract(scope) {
  const contracts = CELESTE_KNOWLEDGE.generationContracts || CELESTE_KNOWLEDGE.contracts || {};
  const contract = contracts[scope];
  if (Array.isArray(contract)) {
    return { required: textArray(contract, 12, 900), rejectWhen: [] };
  }
  if (!isPlainObject(contract)) return { required: [], rejectWhen: [] };
  return {
    required: textArray(contract.required, 12, 900),
    rejectWhen: textArray(contract.rejectWhen || contract.reject_when, 12, 900),
  };
}

function qualityChecklist() {
  const rubric = isPlainObject(CELESTE_KNOWLEDGE.qualityRubric)
    ? CELESTE_KNOWLEDGE.qualityRubric
    : {};
  const dimensions = Array.isArray(rubric.dimensions)
    ? rubric.dimensions
        .filter(isPlainObject)
        .slice(0, 10)
        .map((dimension) => ({
          id: normalizeIdentifier(dimension.id),
          question: cleanText(dimension.question, 700),
        }))
        .filter((dimension) => dimension.id && dimension.question)
    : [];
  return {
    dimensions,
    acceptance: textArray(rubric.acceptance, 8, 900),
  };
}

function promptCard(card) {
  return {
    id: card.id,
    principle: card.principle,
    apply: card.apply,
    limits: card.limits,
    avoid: card.avoid,
    evidenceLevel: card.evidenceLevel,
    sources: card.sources,
    promptCue: card.promptCue,
    matchedDomains: card.matchedDomains,
    matchedSignals: card.matchedSignals,
  };
}

function buildKnowledgePack(scope = 'scene', input = {}) {
  const personalMap = buildPersonalMap(scope, input);
  const cards = selectKnowledgeCards(personalMap.scope, input, {});
  const selectedEditorialRules = selectRules(
    CELESTE_KNOWLEDGE.editorialRules,
    personalMap.scope,
    personalMap.signals,
    16
  );
  const editorialRules = [
    ...CORE_RELATIONSHIP_RULES,
    ...selectedEditorialRules.filter((rule) => !CORE_RELATIONSHIP_RULES.includes(rule)),
  ];
  const forbiddenClaims = selectRules(
    CELESTE_KNOWLEDGE.forbiddenClaims,
    personalMap.scope,
    personalMap.signals,
    20
  );
  return {
    knowledgeVersion: cleanText(CELESTE_KNOWLEDGE.version, 120),
    knowledgeAvailable: cards.length > 0,
    scope: personalMap.scope,
    personalMap,
    cards: cards.map(promptCard),
    editorialRules,
    generationContract: generationContract(personalMap.scope),
    qualityChecklist: qualityChecklist(),
    forbiddenClaims,
    selectionReceipt: {
      cardIds: cards.map((card) => card.id),
      selectedCount: cards.length,
      availableCount: normalizeKnowledgeCards().length,
      previousCardIdsConsidered: validPreviousKnowledgeCardIds(input),
      domains: personalMap.domains,
      signals: personalMap.signals,
    },
  };
}

function outputText(payload, fields) {
  if (typeof payload === 'string') return cleanText(payload, 20_000);
  if (!isPlainObject(payload)) return '';
  return fields.map((field) => cleanText(payload[field], 8000)).filter(Boolean).join(' ');
}

function tokens(value, keepStopWords = false) {
  const values = normalizeText(value).split(' ').filter(Boolean);
  return keepStopWords ? values : values.filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

function factAnchored(value, generatedText) {
  const sourceTokens = [...new Set(tokens(factText(value)))];
  if (!sourceTokens.length) return false;
  const generated = new Set(tokens(generatedText));
  const matched = sourceTokens.filter((token) => generated.has(token)).length;
  const required = sourceTokens.length >= 3 ? 2 : 1;
  return matched >= required;
}

function semanticFactAnchored(key, value, generatedText) {
  if (factAnchored(value, generatedText)) return true;
  const aliasesByValue = SEMANTIC_FACT_ALIASES[key];
  if (!aliasesByValue) return false;
  const aliases = aliasesByValue[normalizeIdentifier(value)] || [];
  const generated = new Set(tokens(generatedText, true));
  return aliases.some((alias) => generated.has(normalizeIdentifier(alias)));
}

function anchorCoverage(map, generatedText, allowedKeys) {
  const keys = (allowedKeys || Object.keys(map.facts)).filter((key) => factHasValue(map.facts[key]));
  const matchedKeys = keys.filter((key) => semanticFactAnchored(key, map.facts[key], generatedText));
  return {
    availableKeys: keys,
    matchedKeys,
    ratio: keys.length ? matchedKeys.length / keys.length : 1,
  };
}

function shingleSet(value, size = 3) {
  const list = tokens(value, true);
  if (!list.length) return new Set();
  if (list.length < size) return new Set([list.join(' ')]);
  const output = new Set();
  for (let index = 0; index <= list.length - size; index += 1) {
    output.add(list.slice(index, index + size).join(' '));
  }
  return output;
}

function shingleSimilarity(left, right, size = 3) {
  const first = shingleSet(left, size);
  const second = shingleSet(right, size);
  if (!first.size || !second.size) return 0;
  let shared = 0;
  first.forEach((value) => {
    if (second.has(value)) shared += 1;
  });
  return shared / (first.size + second.size - shared);
}

function previousScene(input) {
  if (!isPlainObject(input)) return null;
  if (isPlainObject(input.previousScene)) return input.previousScene;
  if (isPlainObject(input.continuity) && isPlainObject(input.continuity.previousScene)) {
    return input.continuity.previousScene;
  }
  return null;
}

function repetitionScore(generated, previous) {
  if (!previous) return 0;
  const fields = ['intention', 'affirmation', 'story', 'anchorIdentity', 'anchorStep'];
  let maximum = shingleSimilarity(outputText(generated, fields), outputText(previous, fields));
  fields.forEach((field) => {
    if (generated && previous && generated[field] && previous[field]) {
      maximum = Math.max(maximum, shingleSimilarity(generated[field], previous[field]));
    }
  });
  return maximum;
}

function matchesAny(value, patterns) {
  const text = normalizeText(value);
  return Boolean(text) && patterns.some((pattern) => pattern.test(text));
}

function commonRiskIssues(text, addIssue) {
  if (matchesAny(text, RISK_PATTERNS.promise)) {
    addIssue('outcome_promise', 'critical', 'Remove guarantees, supernatural certainty, and claims that an external result already exists.');
  }
  if (matchesAny(text, RISK_PATTERNS.diagnosis)) {
    addIssue('diagnosis_or_clinical_claim', 'critical', 'Remove diagnosis, treatment, healing, and clinical conclusions.');
  }
  if (matchesAny(text, RISK_PATTERNS.dependency)) {
    addIssue('dependency_language', 'critical', 'Restore autonomy and remove claims that the person needs Celeste to cope or progress.');
  }
  if (matchesAny(text, RISK_PATTERNS.manipulation)) {
    addIssue('manipulative_retention', 'critical', 'Remove guilt, fear of lost progress, streak pressure, and loyalty tests.');
  }
}

function issueCollector() {
  const issues = [];
  const seen = new Set();
  return {
    issues,
    add(code, severity, message, fields = []) {
      if (seen.has(code)) return;
      seen.add(code);
      issues.push({ code, severity, message, fields });
    },
  };
}

function finalEvaluation(kind, language, issues, metrics) {
  const deductions = { critical: 35, high: 24, medium: 14, low: 6 };
  const score = Math.max(
    0,
    100 - issues.reduce((total, issue) => total + (deductions[issue.severity] || 10), 0)
  );
  return {
    kind,
    lang: language,
    ok: issues.length === 0,
    needsRepair: issues.length > 0,
    score,
    issues,
    metrics,
  };
}

function evaluateSceneSafety(scene, input = {}) {
  const collector = issueCollector();
  const requiredFields = ['intention', 'affirmation', 'story', 'anchorIdentity', 'anchorStep'];
  const missingFields = requiredFields.filter((field) => !cleanText(scene && scene[field], 8000));
  if (!isPlainObject(scene) || missingFields.length) {
    collector.add('invalid_scene_structure', 'high', 'Return every required scene field as non-empty text.', missingFields);
  }

  const labels = isPlainObject(scene) && Array.isArray(scene.personalizedWith)
    ? scene.personalizedWith.map((label) => cleanText(label, 120)).filter(Boolean).join(' ')
    : '';
  const text = [outputText(scene, [...requiredFields, 'title']), labels].filter(Boolean).join(' ');
  commonRiskIssues(text, collector.add);
  const requestedLanguage = cleanText(input && (input.lang || input.language), 12);
  return finalEvaluation(
    'scene-safety',
    requestedLanguage === 'en' ? 'en' : 'pt',
    collector.issues,
    {}
  );
}

function evaluateScene(scene, input = {}) {
  const map = buildPersonalMap('scene', input);
  const collector = issueCollector();
  const requiredFields = ['intention', 'affirmation', 'story', 'anchorIdentity', 'anchorStep'];
  const safety = evaluateSceneSafety(scene, { lang: map.language });
  safety.issues.forEach((issue) => collector.add(issue.code, issue.severity, issue.message, issue.fields));

  const text = outputText(scene, requiredFields);

  const anchorKeys = [
    'desire', 'selfDescription', 'strengths', 'existingEvidence', 'whyItMatters',
    'desiredFeeling', 'work', 'relationshipContext', 'partnerDesire', 'place',
    'dreamHome', 'ordinaryFutureScene', 'support', 'obstacle', 'recognizableCue',
    'smallAction', 'fallback', 'friction',
  ];
  const coverage = anchorCoverage(map, text, anchorKeys);
  const desireAvailable = factHasValue(map.facts.desire);
  const desireMatched = coverage.matchedKeys.includes('desire');
  const personalAvailable = coverage.availableKeys.filter((key) => key !== 'desire');
  const personalMatched = coverage.matchedKeys.filter((key) => key !== 'desire');

  if ((desireAvailable && !desireMatched) || (personalAvailable.length && !personalMatched.length)) {
    collector.add(
      'missing_personal_anchor',
      'high',
      'Anchor the scene in the supplied desire and at least one other supplied personal fact.',
      ['affirmation', 'story']
    );
  }
  if (matchesAny(text, GENERIC_PATTERNS) || (coverage.availableKeys.length >= 2 && coverage.matchedKeys.length === 0)) {
    collector.add(
      'generic_content',
      'high',
      'Replace generic encouragement with believable language tied to supplied facts, values, and one controllable action.'
    );
  }

  const affirmation = cleanText(scene && scene.affirmation, 3000);
  const firstPerson = /\b(?:eu|meu|minha|posso|escolho|estou|aprendo|pratico|i|i'm|i am|my|i can|i choose|i'm learning)\b/i.test(
    normalizeText(affirmation)
  );
  if (affirmation && !firstPerson) {
    collector.add('affirmation_not_first_person', 'medium', 'Write the affirmation in believable first-person language.', ['affirmation']);
  }

  const repeat = repetitionScore(scene, previousScene(input));
  if (repeat >= 0.48) {
    collector.add(
      'previous_chapter_repetition',
      'high',
      'Create a genuinely new chapter with different phrasing, scene details, and immediate action.',
      ['story', 'affirmation', 'anchorStep']
    );
  }

  return finalEvaluation('scene', map.language, collector.issues, {
    anchorCoverage: Number(coverage.ratio.toFixed(3)),
    anchorKeysAvailable: coverage.availableKeys,
    anchorKeysMatched: coverage.matchedKeys,
    previousChapterSimilarity: Number(repeat.toFixed(3)),
  });
}

function evaluateDream(dream, input = {}) {
  const map = buildPersonalMap('dream', input);
  const collector = issueCollector();
  const fields = ['reflection', 'affirmation'];
  const missingFields = fields.filter((field) => !cleanText(dream && dream[field], 8000));
  if (!isPlainObject(dream) || missingFields.length) {
    collector.add('invalid_dream_structure', 'high', 'Return a non-empty reflection and affirmation.', missingFields);
  }

  const text = outputText(dream, fields);
  const reflection = cleanText(dream && dream.reflection, 8000);
  commonRiskIssues(text, collector.add);
  if (matchesAny(text, RISK_PATTERNS.literalDream)) {
    collector.add(
      'literal_dream_interpretation',
      'critical',
      'Present only one optional reflection and never decode, predict, or assign a universal meaning to a dream.'
    );
  }

  const sourceIsGraphic = containsGraphicContent(factText(map.facts.dreamRecall));
  const outputIsGraphic = containsGraphicContent(text);
  if (outputIsGraphic) {
    collector.add(
      'graphic_dream_echo',
      'critical',
      'Do not repeat graphic objects, actions, injuries, body details, perpetrators, or outcomes; use only waking feeling and present safety.'
    );
  }

  const safeAnchorKeys = sourceIsGraphic
    ? ['wakingFeeling', 'userChosenTheme', 'selfDescription', 'strengths', 'whyItMatters', 'obstacle']
    : ['dreamRecall', 'wakingFeeling', 'userChosenTheme', 'selfDescription', 'strengths', 'whyItMatters', 'obstacle'];
  const coverage = anchorCoverage(map, text, safeAnchorKeys);
  if (coverage.availableKeys.length && !coverage.matchedKeys.length) {
    collector.add(
      'missing_personal_anchor',
      'high',
      'Use at least one safe supplied anchor without inventing a symbol meaning, memory, motive, or diagnosis.'
    );
  }
  if (matchesAny(text, GENERIC_PATTERNS) || (coverage.availableKeys.length >= 2 && coverage.matchedKeys.length === 0)) {
    collector.add(
      'generic_content',
      'high',
      'Replace generic reassurance with a careful reflection grounded in safe supplied facts.'
    );
  }

  const uncertainty = /\b(?:pode|podem|talvez|uma possibilidade|uma leitura possivel|nao e uma previsao|may|might|could|one possibility|one possible lens|not a prediction)\b/i.test(
    normalizeText(reflection)
  );
  if (reflection && !uncertainty) {
    collector.add(
      'missing_dream_uncertainty',
      'medium',
      'State uncertainty explicitly and make clear that the reflection is not a prediction or diagnosis.',
      ['reflection']
    );
  }

  const affirmation = cleanText(dream && dream.affirmation, 3000);
  const firstPerson = /\b(?:eu|meu|minha|posso|escolho|estou|aprendo|pratico|i|i'm|i am|my|i can|i choose|i'm learning)\b/i.test(
    normalizeText(affirmation)
  );
  if (affirmation && !firstPerson) {
    collector.add('affirmation_not_first_person', 'medium', 'Write the affirmation in believable first-person language.', ['affirmation']);
  }

  return finalEvaluation('dream', map.language, collector.issues, {
    sourceIsGraphic,
    outputIsGraphic,
    anchorCoverage: Number(coverage.ratio.toFixed(3)),
    anchorKeysAvailable: coverage.availableKeys,
    anchorKeysMatched: coverage.matchedKeys,
  });
}

const REPAIR_INSTRUCTIONS = {
  invalid_scene_structure: 'Return intention, affirmation, story, anchorIdentity, and anchorStep as non-empty strings.',
  invalid_dream_structure: 'Return reflection and affirmation as non-empty strings.',
  missing_personal_anchor: 'Use the supplied desire and safe personal facts visibly; do not invent a fact, motive, memory, or diagnosis.',
  generic_content: 'Replace generic encouragement with specific, believable language grounded in the supplied personal map.',
  previous_chapter_repetition: 'Write a genuinely different next chapter, changing phrasing, setting, process detail, and immediate action.',
  outcome_promise: 'Remove guarantees, supernatural causality, deadlines, and claims that an external outcome already exists.',
  diagnosis_or_clinical_claim: 'Remove diagnostic, treatment, recovery, and healing claims.',
  dependency_language: 'Restore autonomy and human connection; never imply that the person needs Celeste to be okay.',
  manipulative_retention: 'Remove guilt, streak pressure, fear of lost progress, urgency, and loyalty tests.',
  affirmation_not_first_person: 'Rewrite the affirmation in grounded first-person process language.',
  literal_dream_interpretation: 'Offer only one uncertain possible reflection; do not decode symbols, reveal hidden truth, or predict.',
  graphic_dream_echo: 'Do not repeat any graphic detail; refer only to difficult imagery, the supplied waking feeling, and present safety.',
  missing_dream_uncertainty: 'Explicitly say that the reflection is only one possibility and is not a prediction or diagnosis.',
};

function buildRepairInstruction(evaluation) {
  if (!isPlainObject(evaluation) || !Array.isArray(evaluation.issues)) {
    return 'Reject this output and generate a fresh response from the verified personal map and selected knowledge cards.';
  }
  if (!evaluation.issues.length) return 'No repair is required. Preserve the validated output exactly.';
  const language = evaluation.lang === 'en' ? 'natural English' : 'Brazilian Portuguese';
  const kind = evaluation.kind === 'dream' ? 'dream reflection' : 'Celeste scene';
  const instructions = evaluation.issues
    .map((issue) => {
      const code = normalizeIdentifier(issue && issue.code);
      const instruction = REPAIR_INSTRUCTIONS[code] || cleanText(issue && issue.message, 500);
      return code && instruction ? `[${code}] ${instruction}` : '';
    })
    .filter(Boolean);
  return [
    `Rewrite the ${kind} in ${language}.`,
    ...instructions,
    'Use only verified supplied facts. Preserve uncertainty, autonomy, psychological safety, and the required JSON shape.',
    'Return only the corrected JSON object.',
  ].join('\n');
}

module.exports = {
  buildPersonalMap,
  selectKnowledgeCards,
  buildKnowledgePack,
  evaluateSceneSafety,
  evaluateScene,
  evaluateDream,
  buildRepairInstruction,
  _internals: {
    knowledge: CELESTE_KNOWLEDGE,
    knowledgeLoadError,
    normalizeScope,
    normalizeDomain,
    normalizeIdentifier,
    normalizeCard,
    normalizeKnowledgeCards,
    extractFacts,
    detectDomains,
    detectSignals,
    continuityMemory,
    daysSinceIsoDay,
    containsGraphicContent,
    cardRelevance,
    validPreviousKnowledgeCardIds,
    evidenceLevelIsRequiredSafety,
    anchorCoverage,
    factAnchored,
    semanticFactAnchored,
    shingleSimilarity,
    repetitionScore,
    matchesAny,
    riskPatterns: RISK_PATTERNS,
    genericPatterns: GENERIC_PATTERNS,
    coreRelationshipRules: CORE_RELATIONSHIP_RULES,
  },
};
