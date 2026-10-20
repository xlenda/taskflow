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
const notificationsFile = path.join(root, 'screens', 'onboarding', 'NotificationsScreen.js');
const revealFile = path.join(root, 'screens', 'onboarding', 'RevealScreen.js');
const storeReviewFile = path.join(root, 'utils', 'storeReview.js');
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
assert.strictEqual(FLOW.length, 27, 'o roteiro completo deve manter 27 etapas');
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
  historicalQuestionIds,
  'FLOW deve conter somente as 21 perguntas historicas, na ordem'
);
assert.ok(
  !FLOW.some((step) => step.id === 'cloudPersonalization' || step.key === 'cloudPersonalization'),
  'onboarding nao deve pedir consentimento dos processadores em nuvem'
);
assert.strictEqual(questionIds.length, 21, 'devem existir somente as 21 perguntas historicas');

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
const notificationsSource = fs.readFileSync(notificationsFile, 'utf8');
const revealSource = fs.readFileSync(revealFile, 'utf8');
const appSource = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const contextSource = fs.readFileSync(path.join(root, 'context', 'AppContext.js'), 'utf8');

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

// Decisão do Lenda (20/10/2026): a pergunta de código de indicação saiu do
// funil e não pode voltar sem pedido dele.
assert.ok(
  welcomeSource.includes("navigation.navigate('Notifications')"),
  'Continuar da Celeste precisa abrir Notificacoes direto, sem a pergunta de indicacao'
);
assert.ok(
  !fs.existsSync(path.join(root, 'screens', 'onboarding', 'ReferralScreen.js')),
  'a tela de codigo de indicacao foi removida do funil e nao pode voltar'
);
assert.ok(
  notificationsSource.includes("navigation.navigate('ChatOnboarding')"),
  'Notificacoes precisa abrir a conversa completa direto'
);

// Decisão do Lenda (20/10/2026): o pedido de avaliação vem depois da revelação,
// só pela API nativa da loja (Google In-App Review e App Store 5.6.1): nenhuma
// pergunta antes, nenhum botão que dispare, nenhuma prova social inventada.
assert.ok(
  !fs.existsSync(path.join(root, 'screens', 'onboarding', 'GrowScreen.js')),
  'a tela Crescer saiu do funil; a avaliação é nativa depois da Cena-Âncora'
);
assert.ok(
  !/\bGrow\b|GrowScreen|'crescer'/.test(appSource),
  'App.js nao pode manter rota, import ou link da tela Crescer'
);
const { UI } = requireProjectModule(path.join(root, 'constants', 'i18n.js'));
assert.ok(!('grow' in UI.en) && !('grow' in UI.pt), 'o texto da tela Crescer precisa sair do i18n');

const continueFlowStart = revealSource.indexOf('const continueFlow');
const continueFlowEnd = revealSource.indexOf('const openScene');
assert.ok(continueFlowStart >= 0 && continueFlowEnd > continueFlowStart, 'continueFlow da revelacao nao encontrado');
const continueFlowBlock = revealSource.slice(continueFlowStart, continueFlowEnd);
assert.ok(
  revealSource.includes("import { maybeRequestStoreReview } from '../../utils/storeReview';") &&
    continueFlowBlock.includes(
      'void maybeRequestStoreReview({ state, markRequested: markStoreReviewRequested })'
    ),
  'Guardar minha Cena-Âncora precisa pedir a avaliação nativa sem esperar por ela'
);
assert.ok(
  continueFlowBlock.indexOf('maybeRequestStoreReview(') <
    continueFlowBlock.indexOf("navigation.replace('Paywall')") &&
    !/\bawait\b|\.then\(/.test(continueFlowBlock),
  'a avaliação nativa nunca pode segurar a ida para a oferta'
);

const sourceFiles = (entries) =>
  entries
    .flatMap((entry) => {
      const full = path.join(root, entry);
      return fs.statSync(full).isDirectory()
        ? fs.readdirSync(full, { recursive: true }).map((file) => path.join(full, String(file)))
        : [full];
    })
    .filter((file) => /\.(js|jsx|ts|tsx)$/.test(file));
const RATING_PRE_QUESTION =
  /\b(gostou|gostando|avalie|enjoying|rate us|help us grow)\b|\b(5|cinco|five) (estrelas|stars)\b|do you (like|love|enjoy)|ajude a gente a crescer/i;
sourceFiles(['App.js', 'screens', 'components', 'constants']).forEach((file) => {
  assert.ok(
    !RATING_PRE_QUESTION.test(fs.readFileSync(file, 'utf8')),
    `${path.relative(root, file)} nao pode perguntar se gostou nem pedir estrelas antes da avaliação`
  );
});
sourceFiles(['App.js', 'screens', 'components', 'constants', 'utils', 'context', 'services']).forEach(
  (file) => {
    const relative = path.relative(root, file);
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(
      file === storeReviewFile || !source.includes('expo-store-review'),
      `${relative}: só utils/storeReview.js pode chamar a API de avaliação`
    );
    assert.ok(
      file === storeReviewFile || file === revealFile || !source.includes('maybeRequestStoreReview'),
      `${relative}: nenhum botão ou tela além da revelação pode disparar a avaliação`
    );
  }
);
const mergeBlock = contextSource.slice(
  contextSource.indexOf('function mergeDefensivo'),
  contextSource.indexOf('export function AppProvider')
);
assert.ok(
  /st\.storeReviewRequestedAt\s*=[\s\S]{0,80}Date\.parse\(st\.storeReviewRequestedAt\)[\s\S]{0,80}:\s*null;/.test(
    mergeBlock
  ),
  'estado salvo precisa normalizar storeReviewRequestedAt como data ISO ou null'
);
assert.ok(
  /const markStoreReviewRequested = useCallback\(/.test(contextSource) &&
    (contextSource.match(/^\s+markStoreReviewRequested,$/gm) || []).length === 2,
  'o contexto precisa expor markStoreReviewRequested'
);
assert.ok(
  /"expo-store-review":\s*"~57\./.test(fs.readFileSync(path.join(root, 'package.json'), 'utf8')),
  'expo-store-review precisa estar instalado na versao do SDK 57'
);

const draftVersion = chatSource.match(/const\s+DRAFT_V\s*=\s*(\d+)\s*;/);
assert.ok(draftVersion, 'DRAFT_V nao encontrado');
assert.strictEqual(Number(draftVersion[1]), 7, 'DRAFT_V deve ser 7 para descartar rascunhos com consentimento no onboarding');
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

function loadStoreReview(platform, storeReview) {
  const loaded = new Module(storeReviewFile, module);
  loaded.filename = storeReviewFile;
  loaded.paths = Module._nodeModulePaths(path.dirname(storeReviewFile));
  loaded.require = (request) => {
    if (request === 'react-native') return { Platform: { OS: platform } };
    if (request === 'expo-store-review') return storeReview;
    return require(request);
  };
  const compiled = transformSync(fs.readFileSync(storeReviewFile, 'utf8'), {
    filename: storeReviewFile,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  loaded._compile(compiled, storeReviewFile);
  return loaded.exports;
}

function storeReviewHarness(platform, { available = true, availableError, requestError } = {}) {
  const calls = { isAvailable: 0, requestReview: 0, marked: 0 };
  const { maybeRequestStoreReview } = loadStoreReview(platform, {
    async isAvailableAsync() {
      calls.isAvailable += 1;
      if (availableError) throw availableError;
      return available;
    },
    async requestReview() {
      calls.requestReview += 1;
      if (requestError) throw requestError;
    },
  });
  const markRequested = () => {
    calls.marked += 1;
  };
  return { calls, ask: (state) => maybeRequestStoreReview({ state, markRequested }) };
}

async function runStoreReview(platform, state, options) {
  const harness = storeReviewHarness(platform, options);
  return { result: await harness.ask(state), calls: harness.calls };
}

async function verifyStoreReview() {
  const openedAnchor = {
    anchorSceneId: 'm-anchor',
    manifestations: [{ id: 'm-anchor', anchorOpenedAt: '2026-10-20T12:00:00.000Z' }],
    storeReviewRequestedAt: null,
  };
  const untouched = { isAvailable: 0, requestReview: 0, marked: 0 };

  for (const platform of ['android', 'ios']) {
    const asked = await runStoreReview(platform, openedAnchor);
    assert.strictEqual(asked.result, 'requested', `${platform}: avaliação nativa disponível precisa ser pedida`);
    assert.deepStrictEqual(
      asked.calls,
      { isAvailable: 1, requestReview: 1, marked: 1 },
      `${platform}: requestReview uma vez e o pedido registrado no estado`
    );
  }

  const web = await runStoreReview('web', openedAnchor);
  assert.strictEqual(web.result, 'skipped', 'web nao tem avaliação de loja');
  assert.deepStrictEqual(web.calls, untouched, 'web nao pode tocar na API de avaliação');

  const again = await runStoreReview('android', {
    ...openedAnchor,
    storeReviewRequestedAt: '2026-10-20T12:01:00.000Z',
  });
  assert.strictEqual(again.result, 'skipped', 'a avaliação só pode ser pedida uma vez por instalação');
  assert.deepStrictEqual(again.calls, untouched, 'pedido já feito nao pode consultar a loja de novo');

  const closedAnchor = await runStoreReview('android', {
    ...openedAnchor,
    manifestations: [{ id: 'm-anchor' }],
  });
  assert.strictEqual(closedAnchor.result, 'skipped', 'nunca pedir avaliação antes de abrir a Cena-Âncora');
  assert.deepStrictEqual(closedAnchor.calls, untouched, 'Cena-Âncora fechada nao pode tocar na loja');
  assert.strictEqual((await runStoreReview('android', { ...openedAnchor, anchorSceneId: null })).result, 'skipped');
  assert.strictEqual((await runStoreReview('android', undefined)).result, 'skipped', 'sem estado nao pede');

  const unavailable = await runStoreReview('android', openedAnchor, { available: false });
  assert.strictEqual(unavailable.result, 'skipped', 'loja indisponível nao pede avaliação');
  assert.deepStrictEqual(
    unavailable.calls,
    { isAvailable: 1, requestReview: 0, marked: 0 },
    'loja indisponível nao pode registrar pedido'
  );

  const availabilityFails = await runStoreReview('ios', openedAnchor, {
    availableError: new Error('store_unavailable'),
  });
  assert.strictEqual(availabilityFails.result, 'skipped', 'erro ao consultar a loja vira skipped');
  assert.strictEqual(availabilityFails.calls.requestReview, 0);

  const requestFails = await runStoreReview('android', openedAnchor, {
    requestError: new Error('review_failed'),
  });
  assert.strictEqual(requestFails.result, 'skipped', 'erro da API nativa vira skipped, nunca exceção');
  assert.strictEqual(requestFails.calls.requestReview, 1);

  // Toque duplo em "Guardar minha Cena-Âncora": o segundo toque ainda vê o estado
  // antigo (sem storeReviewRequestedAt), mas a loja só pode ser chamada uma vez.
  const doubleTap = storeReviewHarness('android');
  assert.deepStrictEqual(
    await Promise.all([doubleTap.ask(openedAnchor), doubleTap.ask(openedAnchor)]),
    ['requested', 'skipped'],
    'segundo toque nao pode pedir avaliação de novo'
  );
  assert.strictEqual(await doubleTap.ask(openedAnchor), 'skipped', 'toque tardio também fica de fora');
  assert.deepStrictEqual(
    doubleTap.calls,
    { isAvailable: 1, requestReview: 1, marked: 1 },
    'toque duplo chama a loja uma vez só'
  );
}

verifyStoreReview()
  .then(() => {
    process.stdout.write(
      'Perguntas Stella: sem indicacao nem Crescer + 27 etapas, 21 historicas, avaliacao nativa so depois da Cena-Ancora, nuvem local por padrao e draft aprovados\n'
    );
  })
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
