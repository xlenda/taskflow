const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

function load(relative) {
  const file = path.join(root, relative);
  const code = transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(code, file);
  return loaded.exports;
}

const plan = load('utils/practicePlan.js');
const speech = load('utils/speechMatch.js');
const journey = load('utils/personalJourney.js');

const anchorStory = `Eu entro na minha Cena-Âncora. ${'Cada detalhe continua visível e pessoal. '.repeat(12)}`;
const visionOptions = journey.personalVisionOptionsForState({
  lang: 'pt',
  anchorSceneId: 'm-anchor',
  manifestations: [{
    id: 'm-anchor',
    title: 'Meu próximo capítulo',
    story: anchorStory,
    lang: 'pt',
    journeySuiteByLang: {
      pt: {
        visions: [{ category: 'Peace', title: 'Visão pessoal', story: 'Uma visão criada para mim.' }],
      },
    },
  }],
}, 'pt');
const anchorOption = visionOptions.find((item) => item.id === 'anchor:m-anchor');
assert.ok(anchorOption, 'Cena-Âncora precisa entrar no catálogo de visões do Plano');
assert.strictEqual(anchorOption.source, 'anchor');
assert.ok(anchorOption.story.length > 280, 'Plano precisa manter mais que o resumo falado pelo despertador');
assert.strictEqual(anchorOption.story, anchorStory.trim().slice(0, 1200));

assert.deepStrictEqual(
  plan.suggestPracticeSlots('07:00', '22:30', 3),
  ['07:30', '13:00', '21:30'],
  'sugestao principal precisa respeitar os tres momentos uteis'
);
assert.strictEqual(plan.suggestPracticeSlots('07:00', '22:30', 99).length, 4, 'limite de quatro horarios');
assert.strictEqual(new Set(plan.suggestPracticeSlots('23:00', '06:00', 4)).size, 4, 'horarios noturnos precisam ser unicos');
assert.strictEqual(plan.adjustPracticeTime('13:00', 90), '13:30', 'ajuste deve ser limitado a +30 minutos');
assert.strictEqual(plan.adjustPracticeSlotTime('13:00', -1), '12:30', 'atalho anterior deve retirar 30 minutos');
assert.strictEqual(
  plan.adjustPracticeTime('07:10', -30, { wakeTime: '07:00', sleepTime: '22:30' }),
  '07:00',
  'ajuste nao deve sair da janela acordada'
);
assert.deepStrictEqual(plan.normalizePracticeWeekdays([0, 1, 6]), [1, 6, 7], 'dias JS devem virar ISO');
assert.deepStrictEqual(plan.practiceWeekdaysToJs([1, 7]), [1, 0], 'dias ISO devem voltar ao formato JS');

const catalogues = {
  affirmationIds: ['affirmation:one', 'affirmation:two'],
  visionIds: ['vision:one'],
};
const normalized = plan.normalizePracticePlan({
  active: true,
  wake: '7:00',
  sleep: '22:30',
  days: ['segunda', 'quarta-feira'],
  times: [
    { id: 'morning', at: '07:30', affirmationId: 'affirmation:one', visionId: 'vision:one' },
    { id: 'lunch', at: '13:00', affirmationId: 'affirmation:two', visionId: 'vision:one' },
    { id: 'duplicate', at: '13:00', affirmationId: 'affirmation:one', visionId: 'vision:one' },
    { id: 'night', at: '21:30', affirmationId: 'affirmation:one', visionId: 'vision:one' },
    { id: 'extra', at: '22:00', affirmationId: 'affirmation:two', visionId: 'vision:one' },
  ],
  history: [{
    reminderId: 'morning',
    affirmationId: 'affirmation:one',
    visionId: 'vision:one',
    createdAt: '2026-09-01T10:00:00-03:00',
    completionMethod: 'microphone',
    score: 88.7,
    transcript: 'isto nunca pode ser persistido',
    normalizedTranscript: 'nem isto',
  }],
  identifiersBySlot: {
    morning: ['notification-a', 'notification-a', 'notification-b'],
    deleted: ['notification-c'],
  },
  permission: 'granted',
  syncError: true,
}, catalogues);
assert.strictEqual(normalized.version, 1);
assert.strictEqual(normalized.enabled, true);
assert.deepStrictEqual(normalized.weekdays, [1, 3]);
assert.strictEqual(normalized.slots.length, 4, 'duplicado sai e limite de quatro permanece');
assert.strictEqual(normalized.slots[0].affirmationId, 'affirmation:one', 'afirmacao valida precisa ser preservada');
assert.strictEqual(normalized.slots[1].visionId, 'vision:one', 'visao valida precisa ser preservada');
assert.deepStrictEqual(Object.keys(normalized.receipts[0]), [
  'slotId', 'affirmationId', 'visionId', 'completedAt', 'day', 'method', 'score',
  'contentFingerprint',
]);
assert.strictEqual(normalized.receipts[0].method, 'speech');
assert.strictEqual(normalized.receipts[0].score, 89);
assert.ok(!JSON.stringify(normalized.receipts).includes('persistido'), 'historico vazou a transcricao');
assert.deepStrictEqual(normalized.notificationIdsBySlot, {
  morning: ['notification-a', 'notification-b'],
});
assert.strictEqual(normalized.permission, 'granted');
assert.strictEqual(normalized.syncError, true);

const invalidActiveSelection = plan.normalizePracticePlan({
  enabled: true,
  syncError: false,
  slots: [{
    id: 'stale-active',
    time: '08:00',
    enabled: true,
    affirmationId: 'affirmation:deleted',
    visionId: 'vision:one',
  }],
}, catalogues);
assert.strictEqual(
  invalidActiveSelection.enabled,
  false,
  'plano ativo com selecao apagada precisa falhar fechado'
);
assert.strictEqual(
  invalidActiveSelection.syncError,
  true,
  'selecao ativa invalida precisa ficar observavel para reconciliacao'
);
assert.strictEqual(
  invalidActiveSelection.slots[0].affirmationId,
  null,
  'selecao ativa apagada nao pode ser redirecionada para outra afirmacao'
);
assert.strictEqual(invalidActiveSelection.slots[0].visionId, 'vision:one');

const disabled = plan.normalizePracticePlan({
  enabled: true,
  slots: [{ time: '08:00', affirmationId: 'gone', visionId: 'gone' }],
}, { affirmationIds: [], visionIds: [] });
assert.strictEqual(disabled.enabled, false, 'conteudo corrompido nao pode armar lembretes');
assert.strictEqual(plan.normalizePracticePlan(null).enabled, false, 'padrao precisa ser desativado');

const targetContent = {
  affirmationText: 'Eu avanço com presença e coragem.',
  visionText: 'Meu projeto concluído serve pessoas reais.',
};
const targetFingerprint = plan.practiceContentFingerprint(targetContent);
assert.match(targetFingerprint, /^v1-[0-9a-f]{16}$/, 'fingerprint precisa ser opaco e versionado');
assert.strictEqual(
  plan.practiceContentFingerprint({ ...targetContent, transcript: 'fala capturada que deve ser ignorada' }),
  targetFingerprint,
  'fingerprint nunca pode depender da transcricao'
);
assert.notStrictEqual(
  plan.practiceContentFingerprint({ ...targetContent, affirmationText: `${targetContent.affirmationText} Hoje.` }),
  targetFingerprint,
  'editar a afirmacao precisa invalidar uma conclusao antiga'
);
assert.notStrictEqual(
  plan.practiceContentFingerprint({ ...targetContent, visionText: `${targetContent.visionText} Em paz.` }),
  targetFingerprint,
  'editar a visao precisa invalidar uma conclusao antiga'
);
assert.ok(!targetFingerprint.includes('presenca'), 'fingerprint nao pode conter o texto-alvo');

const fingerprintReceipt = plan.createPracticeReceipt({
  slotId: 'morning',
  affirmationId: 'affirmation:one',
  visionId: 'vision:one',
  completedAt: '2026-09-01T13:00:00.000Z',
  method: 'speech',
  score: 94,
  contentFingerprint: targetFingerprint,
  transcript: 'segredo que nao pode entrar no recibo',
  normalizedTranscript: 'segredo normalizado',
}, { ...catalogues, slots: normalized.slots });
assert.strictEqual(fingerprintReceipt.contentFingerprint, targetFingerprint);
assert.ok(!Object.prototype.hasOwnProperty.call(fingerprintReceipt, 'transcript'));
assert.ok(!JSON.stringify(fingerprintReceipt).includes('segredo'), 'recibo vazou transcricao');
assert.ok(
  !JSON.stringify(fingerprintReceipt).includes(targetContent.affirmationText),
  'recibo guardou texto-alvo em vez do fingerprint opaco'
);

const moved = plan.mergePracticeSlotsWithTimes(normalized.slots, ['08:00', '14:00']);
assert.strictEqual(moved[0].id, normalized.slots[0].id);
assert.strictEqual(moved[0].affirmationId, normalized.slots[0].affirmationId);
assert.strictEqual(moved[1].visionId, normalized.slots[1].visionId);

const existingMoments = [
  { id: 'custom-morning', time: '08:15', enabled: false, affirmationId: 'affirmation:two', visionId: 'vision:one' },
  { id: 'custom-lunch', time: '13:20', enabled: true, affirmationId: 'affirmation:one', visionId: 'vision:one' },
  { id: 'custom-night', time: '20:45', enabled: true, affirmationId: 'affirmation:two', visionId: 'vision:one' },
];
const withFourthMoment = plan.appendSuggestedPracticeSlot(
  existingMoments,
  { wakeTime: '07:00', sleepTime: '22:30' },
  catalogues
);
assert.strictEqual(withFourthMoment.length, 4, 'adicionar momento precisa chegar ao limite de quatro');
assert.deepStrictEqual(
  withFourthMoment.slice(0, existingMoments.length),
  existingMoments,
  'adicionar momento nao pode recalcular nem alterar momentos existentes'
);
assert.ok(
  !new Set(existingMoments.map((slot) => slot.time)).has(withFourthMoment[3].time),
  'novo momento precisa ter horario unico'
);
assert.strictEqual(
  withFourthMoment[3].affirmationId,
  existingMoments[1].affirmationId,
  'novo momento precisa herdar o conteudo do primeiro momento ativo'
);
assert.deepStrictEqual(
  plan.appendSuggestedPracticeSlot(withFourthMoment, { wakeTime: '07:00', sleepTime: '22:30' }, catalogues),
  withFourthMoment,
  'adicionar no limite nao pode apagar nem alterar os quatro momentos'
);
const resuggestedFourMoments = plan.mergePracticeSlotsWithTimes(
  withFourthMoment,
  plan.suggestPracticeSlots('07:00', '22:30', withFourthMoment.length),
  catalogues
);
assert.strictEqual(resuggestedFourMoments.length, 4, 'sugerir novamente nao pode apagar o quarto momento');
assert.deepStrictEqual(
  resuggestedFourMoments.map((slot) => slot.id),
  withFourthMoment.map((slot) => slot.id),
  'sugerir novamente precisa preservar a identidade dos quatro momentos'
);

const oldReceipts = Array.from({ length: 150 }, (_, index) => ({
  slotId: 'morning',
  affirmationId: 'affirmation:one',
  visionId: 'vision:one',
  completedAt: `2026-08-${String((index % 28) + 1).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
  method: 'speech',
  score: index,
}));
assert.strictEqual(plan.sanitizePracticeReceipts(oldReceipts).length, 120, 'historico precisa ter limite');

assert.strictEqual(
  speech.normalizeSpeechText('Eu estou PRONTA, coração!', 'pt'),
  'eu estou pronta coracao',
  'acentos e pontuacao PT precisam ser normalizados'
);
assert.strictEqual(
  speech.normalizeSpeechText("I'm calm — and ready!", 'en'),
  'im calm and ready',
  'pontuacao EN precisa ser normalizada'
);

const exact = speech.evaluateSpeechMatch(
  'Eu avanço com calma e confiança todos os dias',
  'Agora eu repito: eu avanço com calma e confiança todos os dias. Obrigada.',
  { lang: 'pt' }
);
assert.strictEqual(exact.matched, true, 'frase completa com contexto deveria passar');
assert.strictEqual(exact.score, 100);
assert.ok(!Object.values(exact).some((value) => typeof value === 'string' && value.includes('avanço')), 'resultado vazou texto bruto');

const accent = speech.evaluateSpeechMatch(
  'Minha conexão floresce com presença',
  'minha conexao floresce com presenca',
  { lang: 'pt' }
);
assert.strictEqual(accent.matched, true, 'ASR sem acentos deveria passar');

const missingOne = speech.evaluateSpeechMatch(
  'Eu construo meu caminho com coragem presença clareza e constância',
  'eu construo meu caminho com coragem presenca e constancia',
  { lang: 'pt' }
);
assert.strictEqual(missingOne.matched, true, 'uma pequena omissao em frase longa deveria passar');

const reordered = speech.evaluateSpeechMatch(
  'Eu escolho calma coragem presença e direção',
  'direcao presenca coragem calma eu escolho',
  { lang: 'pt' }
);
assert.strictEqual(reordered.matched, false, 'palavras soltas fora de ordem nao podem concluir');

const partial = speech.evaluateSpeechMatch(
  'Eu escolho calma coragem presença e direção para avançar hoje',
  'eu escolho calma hoje',
  { lang: 'pt' }
);
assert.strictEqual(partial.matched, false, 'trecho curto nao pode concluir');

const short = speech.evaluateSpeechMatch('Eu consigo', 'eu consigo mesmo', { lang: 'pt' });
assert.strictEqual(short.matched, true, 'frase curta exata pode aparecer com contexto');
assert.strictEqual(speech.evaluateSpeechMatch('Eu consigo', 'eu posso', { lang: 'pt' }).matched, false);

process.stdout.write('Plano Celeste utils: horarios, legado, privacidade e voz aprovados\n');
