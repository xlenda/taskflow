const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

function requireProjectModule(file) {
  const originalLoader = Module._extensions['.js'];
  Module._extensions['.js'] = (loaded, filename) => {
    if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
      originalLoader(loaded, filename);
      return;
    }
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = transformSync(source, {
      filename,
      presets: ['babel-preset-expo'],
      sourceType: 'module',
    }).code;
    loaded._compile(compiled, filename);
  };

  try {
    return require(file);
  } finally {
    Module._extensions['.js'] = originalLoader;
  }
}

const flowFile = path.join(root, 'screens', 'onboarding', 'flow.js');
const multiChoiceFile = path.join(root, 'utils', 'onboardingMultiChoice.js');
const sceneServiceFile = path.join(root, 'services', 'generatePersonalizedScene.js');
const chatFile = path.join(root, 'screens', 'onboarding', 'ChatOnboardingScreen.js');
const onboardingUiFile = path.join(root, 'screens', 'onboarding', 'onboardingUI.js');
const welcomeFile = path.join(root, 'screens', 'onboarding', 'WelcomeScreen.js');
const referralFile = path.join(root, 'screens', 'onboarding', 'ReferralScreen.js');
const notificationsFile = path.join(root, 'screens', 'onboarding', 'NotificationsScreen.js');
const growFile = path.join(root, 'screens', 'onboarding', 'GrowScreen.js');
const { FLOW } = requireProjectModule(flowFile);
const {
  CUSTOM_CHOICE_KEY,
  hasMeaningfulCustomValue,
  restoreMultiChoice,
  serializeMultiChoice,
  toggleMultiChoice,
} = requireProjectModule(multiChoiceFile);
const { minimizeProfile } = requireProjectModule(sceneServiceFile);

assert.ok(Array.isArray(FLOW), 'FLOW precisa ser uma lista');
assert.strictEqual(FLOW.length, 28, 'o roteiro completo deve manter 28 etapas');
assert.strictEqual(new Set(FLOW.map((step) => step.id)).size, FLOW.length, 'cada etapa precisa de id unico');

// The 21 questions documented in the historical Stella clone. Narrative/value
// screens remain in FLOW, but they are intentionally not counted as questions.
const historicalQuestionIds = [
  'hope',
  'why',
  'obstacle',
  'name',
  'city',
  'age',
  'gender',
  'sexuality',
  'hasKids',
  'kids',
  'people',
  'work',
  'workFeel',
  'rel',
  'past',
  'about',
  'dreamPlace',
  'dreamHome',
  'partner',
  'specific',
  'personName',
];
const questionIds = FLOW.filter((step) => step.question).map((step) => step.id);
assert.deepStrictEqual(
  questionIds,
  [...historicalQuestionIds, 'cloudPersonalization'],
  'FLOW deve conter as 21 perguntas historicas, na ordem, mais o consentimento de nuvem'
);

const cloud = FLOW.find((step) => step.id === 'cloudPersonalization');
assert.ok(cloud, 'pergunta de personalizacao em nuvem ausente');
assert.strictEqual(cloud.key, 'cloudPersonalization', 'consentimento deve gravar a chave correta');
assert.strictEqual(cloud.type, 'boolean', 'consentimento deve aceitar Sim ou Nao explicitamente');
assert.ok(cloud.question.en && cloud.question.pt, 'consentimento deve existir em ingles e portugues');
for (const [lang, copy] of Object.entries(cloud.question)) {
  for (const provider of ['Anthropic', 'OpenAI', 'Gemini', 'ElevenLabs']) {
    assert.match(copy, new RegExp(provider), `${lang}: consentimento nao declara ${provider}`);
  }
}
assert.match(cloud.question.en, /Anthropic[\s\S]*OpenAI (?:only )?as failover/);
assert.match(cloud.question.pt, /Anthropic[\s\S]*OpenAI (?:apenas )?como alternativa(?: em caso de falha)?/);
assert.match(cloud.question.en, /Gemini[\s\S]*translates[\s\S]*images[\s\S]*dreams/);
assert.match(cloud.question.pt, /Gemini[\s\S]*traduz[\s\S]*imagens[\s\S]*sonhos/);
assert.match(cloud.question.en, /ElevenLabs[\s\S]*narrates/);
assert.match(cloud.question.pt, /ElevenLabs[\s\S]*narra/);
assert.strictEqual(cloud.yesLabel.pt, 'Permitir', 'consentimento deve usar uma acao clara');
assert.strictEqual(cloud.noLabel.pt, 'Criar no aparelho', 'recusa deve explicar a alternativa local');
assert.strictEqual(questionIds.length, 22, 'devem existir 21 perguntas historicas e 1 consentimento');

const quickChoiceIds = ['hope', 'obstacle', 'age', 'sexuality', 'work', 'dreamPlace', 'partner'];
quickChoiceIds.forEach((id) => {
  const step = FLOW.find((item) => item.id === id);
  assert.strictEqual(step.type, 'chips', `${id} deve oferecer respostas rapidas`);
  assert.ok(step.options.length >= 6, `${id} precisa oferecer alternativas suficientes`);
  assert.strictEqual(
    new Set(step.options.map((option) => option.en)).size,
    step.options.length,
    `${id} nao pode repetir valores canonicos`
  );
});

['hope', 'obstacle', 'work', 'dreamPlace', 'partner'].forEach((id) => {
  const step = FLOW.find((item) => item.id === id);
  assert.strictEqual(step.allowCustom, true, `${id} precisa manter a alternativa de escrever`);
  assert.strictEqual(step.storeLocalized, true, `${id} precisa alimentar a cena no idioma escolhido`);
  assert.ok(step.customPlaceholder.en && step.customPlaceholder.pt, `${id} precisa orientar a resposta livre`);
});

const multiChoiceIds = ['hope', 'obstacle', 'partner'];
multiChoiceIds.forEach((id) => {
  const step = FLOW.find((item) => item.id === id);
  assert.strictEqual(step.multiSelect, true, `${id} deve permitir combinar respostas`);
  assert.ok(step.selectionHint.en && step.selectionHint.pt, `${id} precisa explicar a multipla escolha`);
  assert.strictEqual(step.needsContinue, undefined, `${id} nao deve depender do fluxo antigo de escolha unica`);

  for (let mask = 1; mask < 2 ** step.options.length; mask += 1) {
    const keys = step.options
      .filter((_, index) => mask & (1 << index))
      .map((option) => option.en);
    const serialized = serializeMultiChoice(step, keys, '', 'pt');
    assert.deepStrictEqual(
      restoreMultiChoice(step, serialized, 'pt'),
      { selectedKeys: keys, customValue: '' },
      `${id} precisa restaurar toda combinacao de chips conhecida`
    );

    const customValue = 'gentil, presente e capaz de dialogar';
    const serializedWithCustom = serializeMultiChoice(
      step,
      [...keys, CUSTOM_CHOICE_KEY],
      customValue,
      'pt'
    );
    assert.deepStrictEqual(
      restoreMultiChoice(step, serializedWithCustom, 'pt'),
      { selectedKeys: [...keys, CUSTOM_CHOICE_KEY], customValue },
      `${id} precisa restaurar chips junto de texto livre com virgula`
    );
  }
});
['age', 'gender', 'sexuality', 'relationshipStatus', 'dreamLocation', 'dreamHome'].forEach((key) => {
  const step = FLOW.find((item) => item.key === key);
  assert.notStrictEqual(step.multiSelect, true, `${key} deve continuar sendo escolha exclusiva`);
});

const hope = FLOW.find((item) => item.id === 'hope');
assert.strictEqual(hope.capitalizeAnswer, true, 'o primeiro objetivo precisa continuar servindo como titulo');
const combinedHope = serializeMultiChoice(
  hope,
  ['Find love or strengthen a relationship', 'Have more money and financial freedom'],
  '',
  'pt'
);
assert.strictEqual(
  combinedHope,
  'Viver um amor ou fortalecer uma relação, além de ter mais dinheiro e liberdade financeira',
  'objetivo combinado deve ter maiuscula somente no inicio da frase'
);
assert.ok(!combinedHope.includes('além de Ter'), 'segundo objetivo nao pode manter capitalizacao de rotulo');
assert.deepStrictEqual(
  restoreMultiChoice(hope, combinedHope, 'pt'),
  {
    selectedKeys: [
      'Find love or strengthen a relationship',
      'Have more money and financial freedom',
    ],
    customValue: '',
  },
  'titulo combinado precisa voltar aos dois chips originais'
);
assert.strictEqual(
  serializeMultiChoice(
    hope,
    ['Find love or strengthen a relationship', 'Have more money and financial freedom'],
    '',
    'en'
  ),
  'Find love or strengthen a relationship, as well as have more money and financial freedom',
  'titulo em ingles tambem deve capitalizar apenas o inicio'
);

const partner = FLOW.find((item) => item.id === 'partner');
const partnerAnswer = serializeMultiChoice(
  partner,
  ['Loving and affectionate', 'Loyal and trustworthy', CUSTOM_CHOICE_KEY],
  'companheiro(a) no dia a dia',
  'pt'
);
assert.strictEqual(
  partnerAnswer,
  'afeto e carinho; lealdade e confiança; e companheiro(a) no dia a dia',
  'qualidades combinadas precisam continuar como uma frase natural no profile'
);
assert.strictEqual(typeof partnerAnswer, 'string', 'APIs existentes devem continuar recebendo string');
assert.deepStrictEqual(
  restoreMultiChoice(partner, partnerAnswer, 'pt'),
  {
    selectedKeys: ['Loving and affectionate', 'Loyal and trustworthy', CUSTOM_CHOICE_KEY],
    customValue: 'companheiro(a) no dia a dia',
  },
  'voltar ou restaurar o draft deve recuperar chips e resposta livre'
);
assert.deepStrictEqual(
  restoreMultiChoice(partner, 'Amoroso(a) e carinhoso(a)', 'pt'),
  { selectedKeys: ['Loving and affectionate'], customValue: '' },
  'rascunho antigo com o rotulo visual precisa continuar editavel'
);

const answerWithComma = serializeMultiChoice(
  partner,
  ['Loyal and trustworthy', CUSTOM_CHOICE_KEY],
  'gentil, presente e capaz de conversar',
  'pt'
);
assert.strictEqual(
  answerWithComma,
  'lealdade e confiança, além de gentil, presente e capaz de conversar',
  'virgulas da resposta livre nao podem ser descartadas'
);
assert.deepStrictEqual(
  restoreMultiChoice(partner, answerWithComma, 'pt'),
  {
    selectedKeys: ['Loyal and trustworthy', CUSTOM_CHOICE_KEY],
    customValue: 'gentil, presente e capaz de conversar',
  },
  'virgulas e conjuncoes da resposta livre precisam sobreviver ao voltar'
);

const duplicateChoice = serializeMultiChoice(
  partner,
  ['Loving and affectionate', 'Loving and affectionate', CUSTOM_CHOICE_KEY],
  'Leal e confiavel',
  'pt'
);
assert.strictEqual(
  duplicateChoice,
  'afeto e carinho, além de lealdade e confiança',
  'chaves repetidas e uma resposta livre igual a um chip nao podem duplicar qualidades'
);
assert.deepStrictEqual(
  restoreMultiChoice(partner, duplicateChoice, 'pt'),
  { selectedKeys: ['Loving and affectionate', 'Loyal and trustworthy'], customValue: '' },
  'resposta livre igual a um chip deve voltar como o chip equivalente'
);

const englishAnswer = serializeMultiChoice(
  partner,
  ['Emotionally mature', CUSTOM_CHOICE_KEY],
  'and kind, present, and curious',
  'en'
);
assert.strictEqual(
  englishAnswer,
  'emotional maturity, as well as kind, present, and curious',
  'conjuncao repetida no inicio da resposta livre deve ser normalizada em ingles'
);
assert.deepStrictEqual(
  restoreMultiChoice(partner, englishAnswer, 'en'),
  {
    selectedKeys: ['Emotionally mature', CUSTOM_CHOICE_KEY],
    customValue: 'kind, present, and curious',
  },
  'round-trip em ingles precisa preservar a resposta livre'
);
assert.strictEqual(hasMeaningfulCustomValue(' , ; '), false, 'pontuacao sozinha nao deve liberar Continuar');
assert.strictEqual(hasMeaningfulCustomValue('leal'), true, 'uma qualidade escrita deve liberar Continuar');

const draftRoundTrip = JSON.parse(JSON.stringify({ profile: { partnerDesire: partnerAnswer } }));
assert.strictEqual(
  draftRoundTrip.profile.partnerDesire,
  partnerAnswer,
  'o rascunho deve manter a resposta combinada como string'
);
const obstacle = FLOW.find((item) => item.id === 'obstacle');
assert.deepStrictEqual(
  obstacle.exclusiveOptions,
  ['Nothing specific'],
  'Nada especifico deve permanecer incompatível com outros obstaculos'
);
assert.deepStrictEqual(
  toggleMultiChoice(['Fear or self-doubt', 'Lack of clarity'], 'Nothing specific', obstacle.exclusiveOptions),
  ['Nothing specific'],
  'Nada especifico deve limpar obstaculos combinados'
);
assert.deepStrictEqual(
  toggleMultiChoice(['Nothing specific'], 'Time or energy', obstacle.exclusiveOptions),
  ['Time or energy'],
  'um obstaculo real deve limpar Nada especifico'
);
assert.deepStrictEqual(
  toggleMultiChoice(['Nothing specific'], CUSTOM_CHOICE_KEY, obstacle.exclusiveOptions),
  [CUSTOM_CHOICE_KEY],
  'Outra resposta deve limpar Nada especifico antes de abrir o campo livre'
);
assert.strictEqual(
  serializeMultiChoice(obstacle, ['Nothing specific'], '', 'pt'),
  'nada específico',
  'Nada especifico deve chegar sozinho e em linguagem natural ao perfil'
);
const obstacleAnswer = serializeMultiChoice(
  obstacle,
  ['Fear or self-doubt', 'Lack of clarity'],
  '',
  'pt'
);
assert.strictEqual(
  obstacleAnswer,
  'medo ou insegurança, além de falta de clareza',
  'obstaculos combinados devem formar uma frase sem capitalizacao de rotulo'
);
assert.deepStrictEqual(
  restoreMultiChoice(obstacle, obstacleAnswer, 'pt'),
  { selectedKeys: ['Fear or self-doubt', 'Lack of clarity'], customValue: '' },
  'obstaculos precisam sobreviver ao rascunho e ao botao Voltar'
);

const minimizedProfile = minimizeProfile(
  {
    name: 'Ana',
    partnerDesire: partnerAnswer,
    obstacle: obstacleAnswer,
  },
  'Love',
  'pt'
);
assert.strictEqual(
  minimizedProfile.partnerDesire,
  partnerAnswer,
  'cliente da API deve preservar a lista natural de qualidades'
);
assert.strictEqual(
  minimizedProfile.obstacle,
  obstacleAnswer,
  'cliente da API deve preservar os obstaculos combinados'
);

const sensitiveKeys = [
  'whyMatters',
  'obstacle',
  'city',
  'age',
  'gender',
  'sexuality',
  'work',
  'workFeeling',
  'relationshipStatus',
  'pastInfluence',
  'aboutYou',
  'dreamLocation',
  'dreamHome',
  'partnerDesire',
  'manifestingSomeone',
  'manifestingName',
];
const byKey = new Map(FLOW.filter((step) => step.key).map((step) => [step.key, step]));
sensitiveKeys.forEach((key) => {
  const step = byKey.get(key);
  assert.ok(step, `pergunta sensivel ausente: ${key}`);
  assert.strictEqual(step.skippable, true, `pergunta sensivel deve poder ser pulada: ${key}`);
});
FLOW.filter((step) => step.optional).forEach((step) => {
  assert.strictEqual(step.skippable, true, `pergunta opcional deve poder ser pulada: ${step.id}`);
});

const kids = FLOW.find((step) => step.id === 'kids');
const personName = FLOW.find((step) => step.id === 'personName');
assert.strictEqual(kids.when({ hasKids: true }), true, 'nomes dos filhos devem aparecer quando ha filhos');
assert.strictEqual(kids.when({ hasKids: false }), false, 'nomes dos filhos devem ficar ocultos quando nao ha filhos');
assert.strictEqual(
  personName.when({ manifestingSomeone: true }),
  true,
  'nome especifico deve aparecer somente apos confirmacao'
);
assert.strictEqual(
  personName.when({ manifestingSomeone: false }),
  false,
  'nome especifico deve ficar oculto sem confirmacao'
);

const chatSource = fs.readFileSync(chatFile, 'utf8');
const onboardingUiSource = fs.readFileSync(onboardingUiFile, 'utf8');
const welcomeSource = fs.readFileSync(welcomeFile, 'utf8');
const referralSource = fs.readFileSync(referralFile, 'utf8');
const notificationsSource = fs.readFileSync(notificationsFile, 'utf8');
const growSource = fs.readFileSync(growFile, 'utf8');

assert.ok(
  chatSource.includes('testID="onboarding-progress"') &&
    chatSource.includes('accessibilityRole="progressbar"') &&
    chatSource.includes('accessibilityValue={{ min: 0, max: 100, now: progressPercent') &&
    chatSource.includes('aria-valuenow={progressPercent}') &&
    chatSource.includes('aria-valuetext={`${progressPercent}%`}'),
  'o funil deve manter uma barra de progresso acessivel sem expor o total de perguntas'
);
assert.ok(!chatSource.includes('S.counter'), 'o total de etapas nao deve ser renderizado no funil');
assert.ok(!chatSource.includes("'{n} of {total}'"), 'o contador total em ingles nao deve voltar ao funil');
assert.ok(!chatSource.includes("'{n} de {total}'"), 'o contador total em portugues nao deve voltar ao funil');

assert.ok(chatSource.includes('serializeMultiChoice'), 'Continuar deve serializar as escolhas combinadas');
assert.ok(chatSource.includes('multiple={isMultiSelect}'), 'chips combinaveis devem expor estado de checkbox');
assert.ok(
  onboardingUiSource.includes("aria-checked={multiple ? !!active : undefined}"),
  'checkbox multiplo precisa expor aria-checked no web'
);
assert.ok(chatSource.includes('hasMeaningfulCustomValue'), 'resposta livre precisa de validacao antes de Continuar');
assert.ok(
  chatSource.includes('saveProfile(finalAnswers)'),
  'perfil final deve receber a mesma string serializada pelo onboarding'
);
assert.ok(
  onboardingUiSource.includes("accessibilityRole={multiple ? 'checkbox' : 'button'}") &&
    onboardingUiSource.includes('accessibilityState={multiple ? { checked: !!active } : undefined}'),
  'chips combinaveis devem anunciar checkbox marcado ou desmarcado ao leitor de tela'
);
assert.ok(
  onboardingUiSource.includes('importantForAccessibility="no-hide-descendants"'),
  'icone visual de check nao deve ser lido como texto separado'
);

assert.ok(
  welcomeSource.includes("navigation.navigate('Referral')"),
  'Continuar da Celeste precisa abrir a pergunta de codigo de indicacao'
);
assert.ok(
  referralSource.includes("navigation.navigate('Notifications')"),
  'a pergunta de indicacao precisa continuar para Notificacoes ao responder ou pular'
);
assert.ok(
  notificationsSource.includes("navigation.navigate('Grow')"),
  'Notificacoes precisa continuar para a tela Crescer'
);
assert.ok(
  growSource.includes("navigation.navigate('ChatOnboarding')"),
  'Crescer precisa abrir a conversa completa'
);
assert.ok(referralSource.includes('T.referralTitle'), 'pergunta de codigo de indicacao ausente do caminho');

const draftVersion = chatSource.match(/const\s+DRAFT_V\s*=\s*(\d+)\s*;/);
assert.ok(draftVersion, 'DRAFT_V nao encontrado');
assert.strictEqual(Number(draftVersion[1]), 5, 'DRAFT_V deve ser 5 para invalidar consentimentos e controles antigos');
assert.ok(chatSource.includes('draft.v === DRAFT_V'), 'restauracao deve validar DRAFT_V');
assert.ok(chatSource.includes('DRAFT_READ_TIMEOUT_MS'), 'restauracao do rascunho precisa de limite de espera');
assert.ok(chatSource.includes('if (!draftLoaded)'), 'quiz nao pode aceitar resposta antes de restaurar o rascunho');
assert.ok(
  chatSource.includes('draftInteractionRef.current') &&
    chatSource.includes('!draftInteractionRef.current') &&
    !chatSource.includes('!finished'),
  'leitura atrasada do rascunho nao pode apagar uma resposta atual'
);
assert.ok(
  /JSON\.stringify\(\{\s*v:\s*DRAFT_V,\s*idx:\s*i,\s*answers:\s*ans\s*\}\)/.test(chatSource),
  'rascunho deve salvar DRAFT_V'
);

process.stdout.write(
  'Perguntas Stella: indicacao + 28 etapas, 21 historicas + consentimento, privacidade e draft aprovados\n'
);
