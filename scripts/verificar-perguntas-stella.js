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
const chatFile = path.join(root, 'screens', 'onboarding', 'ChatOnboardingScreen.js');
const welcomeFile = path.join(root, 'screens', 'onboarding', 'WelcomeScreen.js');
const referralFile = path.join(root, 'screens', 'onboarding', 'ReferralScreen.js');
const notificationsFile = path.join(root, 'screens', 'onboarding', 'NotificationsScreen.js');
const growFile = path.join(root, 'screens', 'onboarding', 'GrowScreen.js');
const { FLOW } = requireProjectModule(flowFile);

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
assert.ok(cloud, 'pergunta de personalizacao Gemini ausente');
assert.strictEqual(cloud.key, 'cloudPersonalization', 'consentimento deve gravar a chave correta');
assert.strictEqual(cloud.type, 'boolean', 'consentimento deve aceitar Sim ou Nao explicitamente');
assert.ok(cloud.question.en && cloud.question.pt, 'consentimento deve existir em ingles e portugues');
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
const welcomeSource = fs.readFileSync(welcomeFile, 'utf8');
const referralSource = fs.readFileSync(referralFile, 'utf8');
const notificationsSource = fs.readFileSync(notificationsFile, 'utf8');
const growSource = fs.readFileSync(growFile, 'utf8');

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
assert.strictEqual(Number(draftVersion[1]), 4, 'DRAFT_V deve ser 4 para invalidar controles do roteiro antigo');
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
