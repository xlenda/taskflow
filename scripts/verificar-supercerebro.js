const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const brain = require('../api/_celeste-brain');
const sceneEndpoint = require('../api/gerar-cena');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');

function loadChronology() {
  const source = fs.readFileSync(path.join(root, 'utils', 'celesteChronology.js'), 'utf8');
  const executable = source.replace(/\bexport\s+(?=(?:async\s+)?function|const)/g, '');
  return Function(`${executable}\nreturn { buildCelesteChronology, summarizeChronologyMemory };`)();
}

const profileInput = {
  desire: 'construir uma rotina criativa com calma',
  category: 'Career',
  lang: 'pt',
  profile: {
    name: 'Ana',
    aboutYou: 'sou uma designer curiosa e cuidadosa',
    whyMatters: 'quero ter autonomia para criar',
    obstacle: 'medo de comecar errado',
    work: 'designer de produto',
    injectedSecret: 'nao deve entrar',
  },
};

const map = brain.buildPersonalMap('scene', profileInput);
assert.ok(map.factKeys.includes('desire'));
assert.ok(map.factKeys.includes('selfDescription'));
assert.ok(!map.factKeys.includes('injectedSecret'));
assert.ok(!JSON.stringify(map).includes('nao deve entrar'));

const firstPack = brain.buildKnowledgePack('scene', profileInput);
assert.ok(firstPack.cards.length >= 4 && firstPack.cards.length <= 8);
assert.strictEqual(firstPack.cards.length, firstPack.selectionReceipt.cardIds.length);
assert.ok(firstPack.selectionReceipt.availableCount >= 30);
assert.ok(
  firstPack.editorialRules.some((rule) => /real human relationships or community/.test(rule)),
  'pertencimento saudavel deve ser regra constante do pack'
);
assert.ok(
  firstPack.editorialRules.some((rule) => /invitation to return optional/.test(rule)),
  'retorno sem culpa deve ser regra constante do pack'
);

const rotatedPack = brain.buildKnowledgePack('scene', {
  ...profileInput,
  continuity: { previousKnowledgeCardIds: firstPack.selectionReceipt.cardIds },
});
assert.ok(
  rotatedPack.selectionReceipt.cardIds.some((id) => !firstPack.selectionReceipt.cardIds.includes(id)),
  'o proximo capitulo nao variou nenhuma lente'
);

const emptyMemoryMap = brain.buildPersonalMap('scene', profileInput);
assert.deepStrictEqual(emptyMemoryMap.continuity, {});
assert.ok(!emptyMemoryMap.signals.includes('consented_memory_present'));
assert.ok(!emptyMemoryMap.signals.some((signal) => signal.startsWith('consented_dream_')));

const practiceMemoryInput = {
  ...profileInput,
  continuity: {
    chapter: 3,
    practiceDays: 8,
    lastPracticeDay: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
  },
};
const practiceMemoryPack = brain.buildKnowledgePack('scene', practiceMemoryInput);
assert.ok(practiceMemoryPack.personalMap.signals.includes('repeated_action'));
assert.ok(practiceMemoryPack.selectionReceipt.cardIds.includes('stable_habit_context'));

const progressMemoryInput = {
  ...profileInput,
  continuity: {
    chapter: 3,
    evidenceCount: 3,
    stepCompletions: 2,
    previousStepCompleted: true,
  },
};
const progressMemoryPack = brain.buildKnowledgePack('scene', progressMemoryInput);
assert.ok(progressMemoryPack.personalMap.signals.includes('change_trace'));
assert.ok(progressMemoryPack.personalMap.signals.includes('completed_step'));
assert.ok(progressMemoryPack.selectionReceipt.cardIds.includes('honest_progress_evidence'));
assert.notDeepStrictEqual(
  practiceMemoryPack.selectionReceipt.cardIds,
  progressMemoryPack.selectionReceipt.cardIds,
  'pratica e progresso real recuperaram o mesmo pack sem considerar a memoria'
);

const gapMemoryPack = brain.buildKnowledgePack('scene', {
  ...profileInput,
  continuity: {
    chapter: 3,
    practiceDays: 4,
    lastPracticeDay: new Date(Date.now() - 4 * 86_400_000).toISOString().slice(0, 10),
  },
});
assert.ok(gapMemoryPack.personalMap.signals.includes('practice_gap_present'));
assert.ok(gapMemoryPack.selectionReceipt.cardIds.includes('missed_day_recovery'));

const consentedDreamMemoryInput = {
  ...profileInput,
  continuity: {
    chapter: 3,
    dreamCount: 2,
    latestDreamTheme: 'clarity',
    latestDreamFeeling: 'curious',
  },
};
const consentedDreamMemoryPack = brain.buildKnowledgePack('scene', consentedDreamMemoryInput);
assert.strictEqual(consentedDreamMemoryPack.personalMap.continuity.latestDreamTheme, 'clarity');
assert.strictEqual(consentedDreamMemoryPack.personalMap.continuity.latestDreamFeeling, 'curious');
assert.ok(consentedDreamMemoryPack.personalMap.signals.includes('consented_dream_memory_present'));
assert.ok(consentedDreamMemoryPack.selectionReceipt.cardIds.includes('structured_person_memory'));
assert.ok(!consentedDreamMemoryPack.personalMap.signals.includes('user_chosen_meaning_present'));
assert.ok(!consentedDreamMemoryPack.selectionReceipt.cardIds.includes('dream_user_chosen_meaning'));
assert.ok(!consentedDreamMemoryPack.personalMap.factKeys.includes('userChosenTheme'));

const recentChapterMemoryMap = brain.buildPersonalMap('scene', {
  ...profileInput,
  continuity: {
    chapter: 4,
    chronology: {
      recentChapters: [{
        chapter: 3,
        occurredAt: '2026-08-26T10:00:00.000Z',
        lang: 'pt',
        anchorStep: 'texto anterior que nao pode virar biografia',
        memoryReceipt: ['practice_days', 'private_trace_count', 'invalid_receipt'],
      }],
    },
  },
});
assert.ok(recentChapterMemoryMap.signals.includes('recent_language_present'));
assert.ok(recentChapterMemoryMap.signals.includes('next_open_thread_present'));
assert.ok(recentChapterMemoryMap.signals.includes('practice_history_present'));
assert.ok(recentChapterMemoryMap.signals.includes('change_trace'));
assert.ok(!JSON.stringify(recentChapterMemoryMap.continuity).includes('texto anterior'));
assert.ok(!JSON.stringify(recentChapterMemoryMap.continuity).includes('invalid_receipt'));

const allCards = brain._internals.normalizeKnowledgeCards();
const dreamIrrelevantIds = allCards
  .filter((card) =>
    !card.scopes.includes('dream') &&
    !card.scopes.includes('all') &&
    !card.scopes.includes('global')
  )
  .map((card) => card.id);
const threePreviousPacks = [
  ...dreamIrrelevantIds,
  'dream_waking_continuity',
  'dream_user_chosen_meaning',
];
assert.strictEqual(threePreviousPacks.length, 24);
const threePackRotation = brain.buildKnowledgePack('dream', {
  dream: 'caminhei em um jardim e acordei tranquila',
  feeling: 'calm',
  theme: 'peace',
  continuity: { previousKnowledgeCardIds: threePreviousPacks },
});
assert.deepStrictEqual(
  threePackRotation.selectionReceipt.previousCardIdsConsidered,
  threePreviousPacks,
  'o cerebro deixou de considerar parte dos tres packs anteriores'
);
assert.ok(
  threePackRotation.selectionReceipt.cardIds.every((id) => !threePreviousPacks.includes(id)),
  'o cerebro repetiu uma lente dos tres packs mesmo com alternativas relevantes novas'
);

const goodScene = {
  intention: 'Construir uma rotina criativa com calma e autonomia.',
  affirmation: 'Eu escolho construir minha rotina criativa com calma, respeitando minha curiosidade e meu desejo de autonomia.',
  story: 'Como designer de produto, eu abro um rascunho e escolho apenas uma parte pequena. O medo de comecar errado ainda pode aparecer, mas eu o reconheco sem transforma-lo em identidade. Minha curiosidade cuidadosa orienta dez minutos de trabalho possivel, e a autonomia que importa para mim aparece na decisao de comecar pequeno.',
  anchorIdentity: 'Eu pratico escolhas criativas pequenas, curiosas e cuidadosas.',
  anchorStep: 'Quando o medo de comecar errado aparecer, entao vou abrir um rascunho por dez minutos.',
};
const goodEvaluation = brain.evaluateScene(goodScene, profileInput);
assert.strictEqual(goodEvaluation.ok, true, JSON.stringify(goodEvaluation.issues));
assert.strictEqual(goodEvaluation.score, 100);

const healthyBelongingScene = {
  ...goodScene,
  story: `${goodScene.story} Eu reconheco que esta historia e minha e posso dividir pequenos avancos com pessoas em quem confio. Posso voltar amanha se eu escolher continuar esta reflexao.`,
};
const healthyBelongingEvaluation = brain.evaluateScene(healthyBelongingScene, profileInput);
assert.strictEqual(
  healthyBelongingEvaluation.ok,
  true,
  `pertencimento e retorno opcionais foram bloqueados: ${JSON.stringify(healthyBelongingEvaluation.issues)}`
);

const unsafeRelationshipExamples = [
  {
    text: 'Celeste e quem realmente entende voce e sabe do que voce precisa.',
    expected: ['dependency_language'],
    lang: 'pt',
  },
  {
    text: 'Celeste e o unico lugar que realmente me compreende; minha evolucao depende de voltar aqui a cada manha.',
    expected: ['dependency_language', 'manipulative_retention'],
    lang: 'pt',
  },
  {
    text: 'Celeste is the only place that really understands me; my growth depends on coming back here every morning.',
    expected: ['dependency_language', 'manipulative_retention'],
    lang: 'en',
  },
  {
    text: "Without Celeste you can't progress.",
    expected: ['dependency_language'],
    lang: 'en',
  },
];
unsafeRelationshipExamples.forEach(({ text, expected, lang }) => {
  const evaluation = brain.evaluateSceneSafety({ ...goodScene, story: text }, { lang });
  const codes = evaluation.issues.map((issue) => issue.code);
  assert.strictEqual(evaluation.ok, false, `parafrase perigosa aceita: ${text}`);
  expected.forEach((code) => assert.ok(codes.includes(code), `${code} ausente para: ${text}`));
});

const badScene = {
  intention: 'Tudo vai dar certo.',
  affirmation: 'Eu sou capaz e tudo ja e meu.',
  story: 'So a Celeste me entende e eu preciso voltar todos os dias para nao perder meu progresso.',
  anchorIdentity: 'Sou minha melhor versao.',
  anchorStep: 'Basta acreditar.',
};
const badEvaluation = brain.evaluateScene(badScene, profileInput);
const badCodes = badEvaluation.issues.map((issue) => issue.code);
assert.strictEqual(badEvaluation.ok, false);
assert.ok(badCodes.includes('generic_content'));
assert.ok(badCodes.includes('dependency_language'));
assert.ok(badCodes.includes('manipulative_retention'));
assert.match(brain.buildRepairInstruction(badEvaluation), /Brazilian Portuguese/);

const safeDreamInput = {
  dream: 'eu estava em uma sala escura e acordei assustada',
  feeling: 'anxious',
  theme: 'peace',
  lang: 'pt',
  profile: { aboutYou: 'estou aprendendo a respeitar meu ritmo' },
};
const safeDream = {
  reflection: 'Uma possibilidade e que a inquietacao ao acordar esteja pedindo um pouco de cuidado; isso nao e uma previsao nem um diagnostico.',
  affirmation: 'Eu posso respeitar meu ritmo e escolher um passo que me ajude a recuperar calma agora.',
};
assert.strictEqual(brain.evaluateDream(safeDream, safeDreamInput).ok, true);
const echoedDreamEvaluation = brain.evaluateDream({
  reflection: 'Uma possibilidade e que eu estava em uma sala escura e isso pede cuidado, sem ser uma previsao.',
  affirmation: 'Eu estava em uma sala escura e agora escolho recuperar calma.',
}, safeDreamInput);
const echoedDreamCodes = echoedDreamEvaluation.issues.map((issue) => issue.code);
assert.strictEqual(echoedDreamEvaluation.ok, false, 'o cerebro aceitou uma recontagem do relato');
assert.ok(echoedDreamCodes.includes('dream_recall_echo'));
assert.ok(echoedDreamEvaluation.metrics.dreamRecallLongestSharedPhrase >= 3);
assert.match(
  brain.buildRepairInstruction(echoedDreamEvaluation),
  /Discard the wording and narrative of the recall/,
  'o reparo nao orienta uma reescrita sem eco do sonho'
);
const inventedDreamMeanings = [
  'A sala azul demonstra um trauma reprimido que precisa de atencao.',
  'Talvez seu sonho indique que voce reprime uma verdade e exista um conflito escondido.',
];
inventedDreamMeanings.forEach((reflection) => {
  const evaluation = brain.evaluateDream(
    { reflection, affirmation: safeDream.affirmation },
    safeDreamInput
  );
  const codes = evaluation.issues.map((issue) => issue.code);
  assert.strictEqual(evaluation.ok, false, `inferencia de sonho aceita: ${reflection}`);
  assert.ok(codes.includes('literal_dream_interpretation'));
  assert.ok(codes.includes('diagnosis_or_clinical_claim'));
});
const unsafeDream = {
  reflection: 'Seu sonho revela que a escuridao preve um perigo real.',
  affirmation: 'So a Celeste entende o que isso significa para voce.',
};
const unsafeDreamCodes = brain.evaluateDream(unsafeDream, safeDreamInput).issues.map((issue) => issue.code);
assert.ok(unsafeDreamCodes.includes('literal_dream_interpretation'));
assert.ok(unsafeDreamCodes.includes('dependency_language'));

const { buildCelesteChronology } = loadChronology();
const sentinel = 'RELATO_PRIVADO_NAO_PODE_SAIR';
const chronology = buildCelesteChronology({
  manifestation: {
    title: profileInput.desire,
    category: 'Career',
    lang: 'pt',
    createdAt: '2026-08-20',
    sessions: ['2026-08-21', '2026-08-22'],
    evidence: [{ text: 'privado' }],
    affirmation: goodScene.affirmation,
    intention: goodScene.intention,
    story: goodScene.story,
    anchorIdentity: goodScene.anchorIdentity,
    anchorStep: goodScene.anchorStep,
    generation: { knowledgeCardIds: firstPack.selectionReceipt.cardIds },
    livingMirror: {
      chapter: 2,
      lastEvolvedOn: '2026-08-22',
      bridgeCompletions: [{
        date: '2026-08-22',
        step: goodScene.anchorStep,
        chapter: 2,
        completedAt: '2026-08-22T10:00:00.000Z',
      }],
      chapters: [],
    },
  },
  dreamEntries: [{
    dream: sentinel,
    reflection: sentinel,
    affirmation: sentinel,
    theme: 'peace',
    feeling: 'anxious',
    useInLivingMirror: true,
    createdAt: '2026-08-22T08:00:00.000Z',
    lang: 'pt',
  }],
});
assert.ok(chronology.events.length >= 4);
assert.ok(chronology.size.memoryBytes <= 12 * 1024);
assert.ok(!JSON.stringify(chronology).includes(sentinel));
assert.strictEqual(chronology.memory.version, undefined);
assert.deepStrictEqual(chronology.memory.previousKnowledgeCardIds, firstPack.selectionReceipt.cardIds);
assert.strictEqual(chronology.memory.chronology.rawDreamTextIncluded, false);
assert.strictEqual(chronology.version, 1);

const validated = sceneEndpoint._internals.validateInput({
  ...profileInput,
  cloudConsent: true,
  cloudConsentVersion: CLOUD_CONSENT_VERSION,
  adultConfirmed: true,
  continuity: chronology.memory,
});
assert.ok(validated.value, validated.error);
const request = sceneEndpoint._internals.buildGeminiRequest(validated.value, 31);
const requestText = JSON.stringify(request);
assert.ok(requestText.includes('previousKnowledgeCardIds'));
assert.ok(requestText.includes('recentDreamSignals'));
assert.ok(!requestText.includes(sentinel));

process.stdout.write(
  `Supercerebro Celeste: mapa factual, ${firstPack.cards.length} lentes, rotacao, qualidade e cronologia aprovados\n`
);
