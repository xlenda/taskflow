const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

// Babel nos arquivos do projeto, inclusive nos imports aninhados (utils em ESM).
function load(relative) {
  const originalJs = Module._extensions['.js'];
  Module._extensions['.js'] = (loaded, filename) => {
    if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
      originalJs(loaded, filename);
      return;
    }
    const code = transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      presets: ['babel-preset-expo'],
      sourceType: 'module',
    }).code;
    loaded._compile(code, filename);
  };
  try {
    return require(path.join(root, relative));
  } finally {
    Module._extensions['.js'] = originalJs;
  }
}

// fim de linha do checkout (core.autocrlf=true grava CRLF no Windows): os trechos procurados abaixo usam \n
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8').replace(/\r\n/g, '\n');

const {
  WAKE_SEQUENCE_MAX,
  alarmPhraseForState,
  appendToWakeSequence,
  estimateListeningSeconds,
  firstPhraseForAlarm,
  normalizeWakeSequence,
  pendingAlarmSound,
  reminderRitualAfterDeletion,
  restoreWakeSequence,
  ritualWithWakeSequence,
  wakeSequenceItemsForState,
  wakeSequenceOptionsForState,
} = load('utils/wakeSequence.js');

const CATS = ['Love', 'Wealth', 'Career', 'Health', 'Confidence', 'Peace'];
// Histórias maiores que o corte de 280 caracteres da frase do alarme.
const longStory = (lead) =>
  [lead, ...Array.from({ length: 9 }, () => 'Cada detalhe continua visível, possível e pessoal.')].join(' ');
const baseState = {
  lang: 'pt',
  anchorSceneId: 'm1',
  manifestations: [{
    id: 'm1',
    title: 'Meu caminho',
    category: 'Peace',
    story: longStory('Eu entro na minha Cena-Âncora com calma.'),
    affirmation: 'Eu sigo com presença.',
    lang: 'pt',
    visual: { cacheKey: 'anchor-visual' },
    journeyVisuals: { 'vision:Peace': { cacheKey: 'vision-peace-visual' } },
    journeySuiteByLang: {
      pt: {
        visions: CATS.map((category) => ({
          category,
          title: `Visão ${category}`,
          story: longStory(`Eu vivo um dia possível de ${category}.`),
        })),
        affirmations: CATS.map((category) => ({
          category,
          text: `Eu cultivo ${category} no próximo passo.`,
        })),
      },
    },
  }],
  morningRitual: {
    reminderEnabled: false,
    reminderTime: '07:00',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    wakeAffirmationId: null,
    wakeAffirmationText: '',
    wakeAffirmationLang: 'pt',
    wakeCustomText: 'Minha frase própria para acordar.',
    wakeCustomLang: 'pt',
    wakeSequence: [],
    entries: [{ id: 'x', affirmation: 'Eu recebo a manhã.', lang: 'pt' }],
  },
};
const withSequence = (sequence, ritualPatch = {}, state = baseState) => ({
  ...state,
  morningRitual: { ...state.morningRitual, ...ritualPatch, wakeSequence: sequence },
});

// 1. Toda opção do despertador tem tipo pela origem (regra fechada no plano).
const options = wakeSequenceOptionsForState(baseState, 'pt');
const expectedKind = { anchor: 'anchor', vision: 'vision' };
const sources = new Set(options.map((option) => option.source));
for (const source of ['anchor', 'vision', 'affirmation', 'dream', 'custom', 'manifestation']) {
  assert.ok(sources.has(source), `opção de origem ${source} ausente do despertador`);
}
for (const option of options) {
  assert.strictEqual(
    option.kind,
    expectedKind[option.source] || 'affirmation',
    `${option.id} (${option.source}) recebeu tipo errado`
  );
}
const validIds = new Set(options.map((option) => option.id));
const anchorOption = options.find((option) => option.id === 'anchor:m1');
assert.ok(anchorOption.text.length > 280, 'fixture precisa de história maior que a frase do alarme');
assert.strictEqual(anchorOption.text, baseState.manifestations[0].story, 'Cena-Âncora narra a história inteira');
assert.strictEqual(anchorOption.visualKey, 'anchor-visual');
assert.strictEqual(anchorOption.manifestationId, 'm1');
const peaceVision = options.find((option) => option.id === 'm1:vision:Peace');
assert.strictEqual(peaceVision.text, longStory('Eu vivo um dia possível de Peace.'), 'visão narra a história inteira');
assert.strictEqual(peaceVision.title, 'Visão Peace');
assert.strictEqual(peaceVision.visualKey, 'vision-peace-visual');
assert.strictEqual(peaceVision.category, 'Peace');
assert.strictEqual(options.find((option) => option.id === 'ritual:x').text, 'Eu recebo a manhã.');

// 2. IDs antigos de frase (sonho e frase própria) viram afirmação; tipo salvo não é confiável.
assert.deepStrictEqual(
  normalizeWakeSequence(['ritual:x', { kind: 'vision', id: 'custom' }], { validIds }),
  [
    { kind: 'affirmation', id: 'ritual:x' },
    { kind: 'affirmation', id: 'custom' },
  ]
);

// 3. No máximo 6, sem duplicata, sem id que não existe mais.
const many = [
  'anchor:m1',
  'anchor:m1',
  'manifestation:apagada',
  ...CATS.map((category) => `m1:vision:${category}`),
];
const normalized = normalizeWakeSequence(many, { validIds });
assert.strictEqual(normalized.length, WAKE_SEQUENCE_MAX);
assert.strictEqual(WAKE_SEQUENCE_MAX, 6);
assert.deepStrictEqual(normalized[0], { kind: 'anchor', id: 'anchor:m1' });
assert.ok(!normalized.some((item) => item.id === 'manifestation:apagada'), 'id inexistente sobreviveu');
assert.strictEqual(new Set(normalized.map((item) => item.id)).size, normalized.length, 'duplicata sobreviveu');
assert.deepStrictEqual(normalizeWakeSequence(['anchor:m1'], {}), [], 'sem lista de ids válidos nada entra');
assert.deepStrictEqual(normalizeWakeSequence('anchor:m1', { validIds }), []);

// 4. Conteúdo apagado sai da sequência e a frase do alarme é recalculada.
const dreamDeleted = withSequence(
  [{ kind: 'affirmation', id: 'ritual:x' }, { kind: 'anchor', id: 'anchor:m1' }],
  { entries: [] }
);
const remaining = wakeSequenceItemsForState(dreamDeleted, 'pt');
assert.deepStrictEqual(remaining.map((item) => item.id), ['anchor:m1'], 'sonho apagado continuou na sequência');
assert.deepStrictEqual(
  firstPhraseForAlarm(remaining, dreamDeleted),
  { id: 'manifestation:m1', text: 'Eu sigo com presença.', lang: 'pt' },
  'alarme do iPhone não foi recalculado depois de apagar a frase'
);

// 5. Migração: alarme antigo de um item vira sequência de um item; sequência esvaziada não ressuscita.
assert.deepStrictEqual(restoreWakeSequence({ wakeAffirmationId: 'anchor:m1' }, validIds), [
  { kind: 'anchor', id: 'anchor:m1' },
]);
assert.deepStrictEqual(restoreWakeSequence({ wakeAffirmationId: 'ritual:x' }, validIds), [
  { kind: 'affirmation', id: 'ritual:x' },
]);
assert.deepStrictEqual(restoreWakeSequence({ wakeAffirmationId: 'custom' }, validIds), [
  { kind: 'affirmation', id: 'custom' },
]);
assert.deepStrictEqual(restoreWakeSequence({ wakeAffirmationId: 'anchor:m1', wakeSequence: [] }, validIds), []);
assert.deepStrictEqual(restoreWakeSequence({ wakeAffirmationId: null }, validIds), []);
assert.deepStrictEqual(restoreWakeSequence(undefined, validIds), []);

// 6. Tempo de escuta honesto: caracteres ÷ 14 por segundo, arredondado para cima.
assert.strictEqual(estimateListeningSeconds([{ text: 'a'.repeat(140) }]), 10);
assert.strictEqual(estimateListeningSeconds([{ text: 'a'.repeat(141) }]), 11);
assert.strictEqual(estimateListeningSeconds([{ text: 'a'.repeat(70) }, { text: 'b'.repeat(70) }]), 10);
assert.strictEqual(estimateListeningSeconds([]), 0);
// Um ritmo só: o tempo estimado usa a mesma constante do relógio da legenda do despertar (sem aviso de palavra).
assert.ok(
  /export const CHARS_PER_SECOND = 14;/.test(read('utils/captionProgress.js')) &&
    /import \{ CHARS_PER_SECOND \} from '\.\/captionProgress';/.test(read('utils/wakeSequence.js')) &&
    !/CHARS_PER_SECOND\s*=|\b14\b/.test(read('utils/wakeSequence.js').replace(/^\s*\/\/.*$/gm, '')),
  'letras por segundo duplicadas: o tempo estimado precisa importar a constante de utils/captionProgress.js'
);

// 7. Frase do AlarmKit: 1ª afirmação; senão a afirmação da Cena-Âncora; senão nada.
const mixed = withSequence([
  { kind: 'anchor', id: 'anchor:m1' },
  { kind: 'vision', id: 'm1:vision:Love' },
  { kind: 'affirmation', id: 'ritual:x' },
  { kind: 'affirmation', id: 'custom' },
]);
assert.deepStrictEqual(firstPhraseForAlarm(wakeSequenceItemsForState(mixed, 'pt'), mixed), {
  id: 'ritual:x',
  text: 'Eu recebo a manhã.',
  lang: 'pt',
});
const anchorPhrase = { id: 'manifestation:m1', text: 'Eu sigo com presença.', lang: 'pt' };
assert.deepStrictEqual(
  firstPhraseForAlarm([{ kind: 'anchor', id: 'anchor:m1' }, { kind: 'vision', id: 'm1:vision:Peace' }], baseState),
  anchorPhrase,
  'sem afirmação, o alarme deve usar a afirmação da Cena-Âncora'
);
assert.deepStrictEqual(firstPhraseForAlarm([], baseState), anchorPhrase, 'sequência vazia usa a afirmação da Cena-Âncora');
// Sem Cena-Âncora e sem afirmação na sequência não há frase: o alarme fica desligado.
const noAnchorState = {
  lang: 'pt',
  anchorSceneId: null,
  manifestations: [],
  morningRitual: { ...baseState.morningRitual, wakeCustomText: '', wakeSequence: [] },
};
assert.strictEqual(firstPhraseForAlarm([], noAnchorState), null, 'sem nada, o alarme não tem frase');
assert.deepStrictEqual(
  firstPhraseForAlarm([{ kind: 'affirmation', id: 'ritual:x' }], noAnchorState),
  { id: 'ritual:x', text: 'Eu recebo a manhã.', lang: 'pt' }
);

// 8. Acrescentar: 7º item recusado, duplicata e id desconhecido avisados, id apagado não ocupa vaga.
let growing = withSequence([]);
const sixIds = CATS.map((category) => `m1:vision:${category}`);
for (const id of sixIds) {
  const added = appendToWakeSequence(growing, { kind: 'vision', id });
  assert.strictEqual(added.ok, true, `não acrescentou ${id}`);
  growing = withSequence(added.sequence);
}
assert.strictEqual(growing.morningRitual.wakeSequence.length, 6);
assert.deepStrictEqual(appendToWakeSequence(growing, { kind: 'anchor', id: 'anchor:m1' }), {
  ok: false,
  reason: 'full',
});
assert.deepStrictEqual(appendToWakeSequence(growing, { kind: 'vision', id: 'm1:vision:Love' }), {
  ok: false,
  reason: 'duplicate',
});
assert.deepStrictEqual(appendToWakeSequence(baseState, { kind: 'vision', id: 'm1:vision:Nada' }), {
  ok: false,
  reason: 'unknown',
});
assert.deepStrictEqual(appendToWakeSequence(baseState, { kind: 'vision', id: 'anchor:m1' }), {
  ok: false,
  reason: 'unknown',
}, 'tipo trocado não pode entrar');
const staleFull = withSequence([
  { kind: 'affirmation', id: 'ritual:apagado' },
  ...sixIds.slice(0, 5).map((id) => ({ kind: 'vision', id })),
]);
const afterStale = appendToWakeSequence(staleFull, { kind: 'anchor', id: 'anchor:m1' });
assert.strictEqual(afterStale.ok, true, 'item apagado continuou ocupando vaga');
assert.strictEqual(afterStale.sequence[afterStale.sequence.length - 1].id, 'anchor:m1');

// 9. Salvar a sequência reaponta o alarme sem fingir que o áudio nativo mudou.
const offRitual = ritualWithWakeSequence(baseState, [
  { kind: 'vision', id: 'm1:vision:Peace' },
  { kind: 'affirmation', id: 'm1:affirmation:Love' },
]);
assert.deepStrictEqual(offRitual.wakeSequence, [
  { kind: 'vision', id: 'm1:vision:Peace' },
  { kind: 'affirmation', id: 'm1:affirmation:Love' },
]);
assert.strictEqual(offRitual.wakeAffirmationId, 'm1:affirmation:Love');
assert.strictEqual(offRitual.wakeAffirmationText, 'Eu cultivo Love no próximo passo.');
assert.strictEqual(offRitual.wakeAffirmationLang, 'pt');
const activeState = withSequence([{ kind: 'affirmation', id: 'ritual:x' }], {
  reminderEnabled: true,
  wakeAffirmationId: 'ritual:x',
  wakeAffirmationText: 'Texto confirmado no aparelho',
  wakeAffirmationLang: 'pt',
});
const activeRitual = ritualWithWakeSequence(activeState, [
  { kind: 'affirmation', id: 'custom' },
  { kind: 'affirmation', id: 'ritual:x' },
]);
assert.strictEqual(activeRitual.wakeAffirmationId, 'custom', 'alarme ativo precisa apontar para a nova frase');
assert.strictEqual(
  activeRitual.wakeAffirmationText,
  'Texto confirmado no aparelho',
  'texto confirmado pelo AlarmKit só muda depois da troca nativa'
);
assert.strictEqual(
  ritualWithWakeSequence(activeState, []).wakeAffirmationId,
  'manifestation:m1',
  'sequência esvaziada com alarme ativo passa a usar a afirmação da Cena-Âncora'
);
const activeNoAnchor = {
  ...noAnchorState,
  morningRitual: {
    ...noAnchorState.morningRitual,
    reminderEnabled: true,
    wakeAffirmationId: 'ritual:x',
    wakeAffirmationText: 'Texto confirmado no aparelho',
    wakeSequence: [{ kind: 'affirmation', id: 'ritual:x' }],
  },
};
// Android (sem AlarmKit): o lembrete não tem áudio para trocar, então id, texto e idioma andam juntos — senão o
// carregamento (mergeDefensivo) acha a diferença e grava alarmSyncError=true para sempre (ninguém o resolve ali).
const androidRitual = ritualWithWakeSequence(
  activeState,
  [{ kind: 'affirmation', id: 'custom' }, { kind: 'affirmation', id: 'ritual:x' }],
  { nativeAlarm: false }
);
assert.strictEqual(androidRitual.wakeAffirmationId, 'custom', 'Android: o lembrete aponta para a nova frase');
assert.strictEqual(androidRitual.wakeAffirmationText, 'Minha frase própria para acordar.', 'Android: o texto anda com o id');
assert.strictEqual(androidRitual.wakeAffirmationLang, 'pt');
const { resolvePersonalAlarmContent } = load('utils/personalAffirmations.js');
const androidLoaded = resolvePersonalAlarmContent({ ...activeState, morningRitual: androidRitual });
assert.ok(
  androidLoaded.text === androidRitual.wakeAffirmationText && androidLoaded.lang === androidRitual.wakeAffirmationLang,
  'Android: carregar o estado salvo não pode achar diferença de frase (alarmSyncError falso)'
);
assert.strictEqual(
  ritualWithWakeSequence(activeState, [{ kind: 'affirmation', id: 'custom' }]).wakeAffirmationText,
  'Texto confirmado no aparelho',
  'iPhone (padrão): o texto confirmado pelo AlarmKit continua até a troca nativa'
);
const emptiedNoAnchor = { ...activeNoAnchor, morningRitual: ritualWithWakeSequence(activeNoAnchor, []) };
assert.strictEqual(
  ritualWithWakeSequence(activeNoAnchor, [], { nativeAlarm: false }).wakeAffirmationText,
  'Texto confirmado no aparelho',
  'Android: lembrete ativo sem frase nova mantém a frase que tinha'
);
assert.strictEqual(emptiedNoAnchor.morningRitual.wakeAffirmationId, 'ritual:x', 'alarme ativo nunca pode ficar sem frase');
assert.strictEqual(alarmPhraseForState(emptiedNoAnchor, [])?.id, 'ritual:x', 'tela não pode perder a frase do alarme ativo');
const clearedOff = ritualWithWakeSequence(withSequence([{ kind: 'affirmation', id: 'ritual:x' }]), []);
assert.strictEqual(clearedOff.wakeAffirmationId, 'manifestation:m1');
assert.strictEqual(clearedOff.wakeAffirmationText, 'Eu sigo com presença.');
const clearedNoAnchor = ritualWithWakeSequence(
  { ...noAnchorState, morningRitual: { ...noAnchorState.morningRitual, wakeSequence: [{ kind: 'affirmation', id: 'ritual:x' }] } },
  []
);
assert.strictEqual(clearedNoAnchor.wakeAffirmationId, null);
assert.strictEqual(clearedNoAnchor.wakeAffirmationText, '');
const customSecond = { ...baseState, morningRitual: ritualWithWakeSequence(baseState, ['ritual:x', 'custom']) };
assert.deepStrictEqual(
  wakeSequenceItemsForState(customSecond, 'pt').map((item) => item.id),
  ['ritual:x', 'custom'],
  'frase própria fora da 1ª posição não pode sumir'
);
assert.strictEqual(customSecond.morningRitual.wakeAffirmationId, 'ritual:x');

// 9b. Regra fechada: alarme antigo apontando para Cena-Âncora ou visão mantém som e
// ponteiro até a 1ª edição da sequência; carregar e abrir a tela não mudam nada.
const { personalAlarmContentForState } = load('utils/personalAffirmations.js');
for (const legacyId of ['anchor:m1', 'm1:vision:Peace']) {
  const confirmed = personalAlarmContentForState(baseState).find((option) => option.id === legacyId);
  const { wakeSequence: _none, ...legacyRitual } = {
    ...baseState.morningRitual,
    reminderEnabled: true,
    wakeAffirmationId: legacyId,
    wakeAffirmationText: confirmed.text,
    wakeAffirmationLang: confirmed.lang,
  };
  // Carregar: mergeDefensivo só acrescenta a sequência migrada.
  const loaded = {
    ...baseState,
    morningRitual: { ...legacyRitual, wakeSequence: restoreWakeSequence(legacyRitual, validIds) },
  };
  assert.deepStrictEqual(loaded.morningRitual.wakeSequence, [
    { kind: legacyId.startsWith('anchor:') ? 'anchor' : 'vision', id: legacyId },
  ]);
  // Abrir a tela: o som continua o confirmado e nada é anunciado como pendente.
  const playing = alarmPhraseForState(loaded, wakeSequenceItemsForState(loaded, 'pt'));
  assert.deepStrictEqual(
    playing,
    { id: legacyId, text: confirmed.text, lang: confirmed.lang },
    `${legacyId}: abrir a tela trocou o som do alarme`
  );
  assert.strictEqual(pendingAlarmSound(loaded, playing), null, `${legacyId}: abrir a tela anunciou troca de som`);
  // 1ª edição: a frase passa a vir da sequência e a troca de som é anunciada.
  const edited = {
    ...loaded,
    morningRitual: ritualWithWakeSequence(loaded, [
      ...loaded.morningRitual.wakeSequence,
      { kind: 'affirmation', id: 'm1:affirmation:Love' },
    ]),
  };
  assert.strictEqual(edited.morningRitual.wakeAffirmationId, 'm1:affirmation:Love');
  assert.strictEqual(edited.morningRitual.wakeAffirmationText, confirmed.text, 'texto nativo só muda depois da troca');
  assert.deepStrictEqual(
    pendingAlarmSound(edited, alarmPhraseForState(edited, wakeSequenceItemsForState(edited, 'pt'))),
    { id: 'm1:affirmation:Love', text: 'Eu cultivo Love no próximo passo.', lang: 'pt' },
    `${legacyId}: troca de som depois da edição não foi anunciada`
  );
}
assert.strictEqual(
  pendingAlarmSound(withSequence([], { reminderEnabled: false, wakeAffirmationText: 'antigo' }), anchorPhrase),
  null,
  'sem alarme ativo não existe som para trocar'
);
const legacyNoLang = withSequence([{ kind: 'anchor', id: 'anchor:m1' }], {
  reminderEnabled: true,
  wakeAffirmationId: 'anchor:m1',
  wakeAffirmationText: personalAlarmContentForState(baseState).find((option) => option.id === 'anchor:m1').text,
  wakeAffirmationLang: undefined,
});
assert.strictEqual(
  pendingAlarmSound(legacyNoLang, alarmPhraseForState(legacyNoLang, wakeSequenceItemsForState(legacyNoLang, 'pt'))),
  null,
  'idioma salvo ausente vale pt, como no carregamento'
);
const withDream = withSequence([{ kind: 'affirmation', id: 'ritual:x' }]);
assert.deepStrictEqual(
  alarmPhraseForState(withDream, wakeSequenceItemsForState(withDream, 'pt')),
  { id: 'ritual:x', text: 'Eu recebo a manhã.', lang: 'pt' },
  'sem ponteiro salvo, a frase vem da sequência'
);

// 10. Ligações: provider, tela "Meu despertar", atalhos e botão do sonho.
const context = read('context/AppContext.js');
const content = read('constants/content.js');
const alarmScreen = read('screens/AffirmationAlarmScreen.js');
const addButton = read('components/AddToWakeButton.js');
const morning = read('screens/MorningRitualScreen.js');
const personal = read('utils/personalAffirmations.js');
assert.ok(content.includes('wakeSequence: []'), 'estado inicial sem sequência');
assert.ok(
  /restoreWakeSequence\(\s*st\.morningRitual,/.test(context) &&
    context.includes('wakeCustomText: shortText(') &&
    context.includes("hasOwnProperty.call(patch, 'wakeSequence')") &&
    context.includes('ritualWithWakeSequence(') &&
    context.includes('appendToWakeSequence(stateRef.current, entry)') &&
    (context.match(/\baddToWakeSequence,/g) || []).length >= 2,
  'provider precisa migrar, salvar e acrescentar a sequência'
);
assert.strictEqual(
  (context.match(/ritualWithWakeSequence\([^;]*?, \{ nativeAlarm: RELEASE_FEATURES\.affirmationAlarm \}\)/g) || []).length,
  2,
  'provider precisa dizer ao ritualWithWakeSequence se existe alarme nativo (salvar e acrescentar)'
);
assert.ok(
  personal.includes('ritual.wakeCustomText'),
  'frase própria precisa existir sem depender de ser a frase do alarme'
);
for (const testID of [
  'testID="wake-sequence-list"',
  'testID={`wake-sequence-item-${index}`}',
  'testID: `wake-sequence-up-${index}`',
  'testID: `wake-sequence-down-${index}`',
  'testID: `wake-sequence-remove-${index}`',
  'testID="wake-sequence-add"',
  'testID={`wake-picker-tab-${tab.kind}`}',
  'testID={`wake-picker-item-${item.id}`}',
  'testID="wake-listen-now"',
]) {
  assert.ok(alarmScreen.includes(testID), `tela do despertar sem ${testID}`);
}
for (const kind of ['anchor', 'vision', 'affirmation']) {
  assert.ok(alarmScreen.includes(`{ kind: '${kind}'`), `seletor sem a aba ${kind}`);
}
assert.ok(
  alarmScreen.includes("title: { pt: 'Meu despertar', en: 'My wake-up' }") &&
    alarmScreen.includes('estimateListeningSeconds(items)') &&
    alarmScreen.includes('alarmPhraseForState(state, items)') &&
    alarmScreen.includes('pendingAlarmSound(state, selected)'),
  'tela precisa se chamar Meu despertar, mostrar o tempo estimado e usar a frase do alarme compartilhada'
);
const dirtyStart = alarmScreen.indexOf('const dirty =');
const dirtyExpr = alarmScreen.slice(dirtyStart, alarmScreen.indexOf(';', dirtyStart));
assert.ok(
  dirtyStart >= 0 &&
    dirtyExpr.includes('time !==') &&
    dirtyExpr.includes('sameDays(weekdays') &&
    dirtyExpr.includes('narration.narratorId') &&
    !/selected|wakeAffirmationText|soundUpdate/.test(dirtyExpr),
  '"alterações não salvas" só pode vir de horário, dias e voz'
);
assert.ok(
  alarmScreen.includes("pt: 'O som do alarme será atualizado para: “{phrase}”'") &&
    alarmScreen.includes("en: 'The alarm sound will update to: “{phrase}”'") &&
    alarmScreen.includes('Sem uma frase, o alarme fica desligado.'),
  'troca de som pendente e falta de frase precisam de aviso próprio'
);
assert.ok(
  alarmScreen.includes("moveUp: { pt: 'Subir “{title}”', en: 'Move “{title}” up' }") &&
    alarmScreen.includes("remove: { pt: 'Tirar “{title}” da sequência', en: 'Remove “{title}” from the sequence' }") &&
    alarmScreen.includes('t(control.label, { title: shortTitle })'),
  'subir, descer e tirar precisam dizer qual item'
);
assert.ok(!alarmScreen.includes('preselectId'), 'pré-seleção antiga ainda ativa');
assert.ok(
  addButton.includes('testID={`add-to-wake-${campaign}`}') &&
    addButton.includes("{ pt: 'Adicionado ao seu despertar.', en: 'Added to your wake-up.' }") &&
    addButton.includes('accessibilityLiveRegion="polite"') &&
    addButton.includes('appendToWakeSequence(state, { kind, id })'),
  'atalho precisa acrescentar, confirmar e se esconder quando o conteúdo não existe'
);
for (const [file, campaign] of [
  ['screens/VisionsScreen.js', 'campaign="visao"'],
  ['screens/AffirmationsScreen.js', 'campaign="afirmacao"'],
  ['screens/ManifestationScreen.js', "campaign: 'ancora'"],
]) {
  const screen = read(file);
  assert.ok(screen.includes('<AddToWakeButton') && screen.includes(campaign), `${file} sem atalho ${campaign}`);
}
const resultWake = morning.slice(morning.indexOf('const useResultAsWake'), morning.indexOf('const deleteCurrentDream'));
assert.ok(
  resultWake.includes("addToWakeSequence({ kind: 'affirmation', id: `ritual:${entryId}` })") &&
    resultWake.includes("navigation.navigate('AffirmationAlarm')") &&
    morning.includes('testID="add-to-wake-sonho"'),
  'frase do sonho precisa acrescentar à sequência e abrir Meu despertar'
);

// 11. Ligações do ouvir: rota, link do lembrete, atalhos no Android e ativação por lembrete comum.
const app = read('App.js');
const features = read('constants/releaseFeatures.js');
const home = read('screens/HomeScreen.js');
assert.ok(features.includes('wakeSequence: true'), 'Meu despertar precisa existir em todas as plataformas');
assert.ok(
  app.includes('RELEASE_FEATURES.wakeSequence ? (') &&
    app.includes('<Root.Screen name="AffirmationAlarm" component={AffirmationAlarmScreen} />') &&
    app.includes('<Root.Screen name="WakeSequence" component={WakeSequenceScreen} />') &&
    app.includes("{ AffirmationAlarm: 'despertar', WakeSequence: 'despertar/ouvir' }") &&
    app.includes('await initialWakeNotificationUrl()') &&
    app.includes('subscribeWakeNotificationUrls(listener)') &&
    app.includes('configureWakeNotifications()'),
  'rota despertar/ouvir, toque no lembrete e configuração das notificações do despertar ausentes'
);
assert.ok(
  addButton.includes('!RELEASE_FEATURES.wakeSequence') && !addButton.includes('RELEASE_FEATURES.affirmationAlarm'),
  'atalho "Pôr no meu despertar" precisa aparecer também no Android'
);
assert.ok(morning.includes('{RELEASE_FEATURES.wakeSequence ? ('), 'botão do sonho precisa aparecer no Android');
assert.ok(
  home.includes('RELEASE_FEATURES.wakeSequence ? (') &&
    home.includes("alarmTitle: { en: 'My wake-up', pt: 'Meu despertar' }") &&
    home.includes('wakeSequenceItemsForState(state, lang)'),
  'cartão da Home precisa se chamar Meu despertar e olhar a sequência'
);
const homeWakeMemo =
  /const hasWakeSequence = useMemo\(\s*\(\) => !!state && wakeSequenceItemsForState\(state, lang\)\.length > 0,\s*\[state, lang\]\s*\);/.exec(home);
assert.ok(
  homeWakeMemo && homeWakeMemo.index < home.indexOf('if (loading || !state) {'),
  'Home: a sequência do despertar só é recalculada quando o estado ou o idioma mudam (useMemo antes do retorno de carregamento)'
);
// Android: ao abrir e a cada volta para a frente, com o lembrete ligado e a sequência com itens, os lembretes que
// sumiram (backup restaurado, reinstalação, force-stop) ou que não batem com horário, dias e idioma são refeitos —
// sem pedir permissão. Desligado, nada é refeito e os órfãos saem como antes.
const wakeSync = app.slice(app.indexOf('function WakeReminderSync()'), app.indexOf('function HomeStackNav()'));
assert.ok(
  wakeSync.includes('if (loaded && (!enabled || !hasSequence)) void cancelWakeReminders();') &&
    /\}, \[loaded, enabled, hasSequence\]\);/.test(wakeSync) &&
    /if \(!enabled \|\| !hasSequence\) return undefined;/.test(wakeSync) &&
    /syncWakeReminders\(\{ time, weekdays: days\.split\(','\)\.map\(Number\), lang \}\)/.test(wakeSync) &&
    /AppState\.addEventListener\('change', \(next\) => \{\s*if \(next === 'active'\) sync\(\);/.test(wakeSync) &&
    /\}, \[enabled, hasSequence, time, days, lang\]\);/.test(wakeSync) &&
    /useMemo\(\s*\(\) => !!state && wakeSequenceItemsForState\(state, lang\)\.length > 0/.test(wakeSync) &&
    !/requestPermissionsAsync|scheduleWakeReminders/.test(wakeSync),
  'Android: o lembrete ligado precisa ser refeito ao abrir e ao voltar (horário, dias e idioma), sem pedir permissão'
);
const reminderActivation = alarmScreen.slice(
  alarmScreen.indexOf('const activateReminder = useCallback'),
  alarmScreen.indexOf('const saveWebChoice = useCallback')
);
assert.ok(
  reminderActivation.indexOf('await confirmAsync') >= 0 &&
    reminderActivation.indexOf('await confirmAsync') < reminderActivation.indexOf('await scheduleWakeReminders({ time, weekdays, lang })') &&
    reminderActivation.indexOf('await scheduleWakeReminders') < reminderActivation.indexOf('reminderEnabled: true') &&
    !/scheduleAffirmationAlarm|preparePersonal|requestAffirmationAlarmAuthorization/.test(reminderActivation),
  'Android: confirmar, pedir permissão no agendamento e só então marcar ativo, sem AlarmKit nem voz paga'
);
assert.ok(
  alarmScreen.includes('reminderMode ? await cancelWakeReminders() : await cancelAffirmationAlarm()') &&
    alarmScreen.includes("Platform.OS === 'web' ? saveWebChoice : reminderMode ? activateReminder : activate") &&
    alarmScreen.includes('Pode atrasar alguns minutos; a voz toca quando você abrir.') &&
    alarmScreen.includes('It may arrive a few minutes late; the voice plays when you open it.'),
  'Android precisa desligar pelo lembrete e avisar com honestidade que pode atrasar'
);

// 12. Ouvir: a 3ª estrela inicia a voz no mesmo toque. Nada de await entre onFinalStar e o
// início da voz (o Safari do iPhone descarta o som pedido fora do gesto). Sem comentários.
const wakeScreen = read('screens/WakeSequenceScreen.js');
const wakeCode = transformSync(wakeScreen, {
  babelrc: false,
  configFile: false,
  comments: false,
  parserOpts: { plugins: ['jsx'] },
}).code;
const screenBlock = (marker) => {
  const start = wakeCode.indexOf(marker);
  assert.ok(start >= 0, `WakeSequenceScreen sem ${marker}`);
  const rest = wakeCode.slice(start + marker.length);
  const end = rest.search(/\n {2}(?:function |const |let |useEffect\(|return \()/);
  return marker + (end >= 0 ? rest.slice(0, end) : rest);
};
assert.ok(wakeCode.includes('onFinalStar={() => playItem(0)}'), 'a 3ª estrela precisa começar o 1º item direto');
const playItemBlock = screenBlock('function playItem(');
const speakBlock = screenBlock('function speakWithDevice(');
const silenceBlock = screenBlock('function silence(');
for (const [name, body] of [
  ['playItem', playItemBlock],
  ['speakWithDevice', speakBlock],
  ['silence', silenceBlock],
  // "Tocar de novo" / "Ouvir de novo": dá outra chance à voz da Celeste e toca no mesmo toque
  ['retryWithCeleste', screenBlock('function retryWithCeleste(')],
]) {
  assert.ok(
    !/\bawait\b|\basync\b/.test(body) && !new RegExp(`\\basync\\s+function\\s+${name}\\(`).test(wakeCode),
    `${name} não pode esperar nada antes de a voz começar`
  );
}
assert.ok(
  playItemBlock.indexOf('silence()') >= 0 &&
    /\.playPersonal\(\{[\s\S]*?\}\)[\s\S]*?\.catch\(/.test(playItemBlock) &&
    playItemBlock.includes('speakWithDevice(item, epoch)') &&
    speakBlock.includes('Speech.speak(item.text'),
  'voz da Celeste (com .catch) ou do aparelho precisa começar dentro de playItem'
);
assert.ok(
  wakeCode.includes('narration.personalNarrationAvailable && hasUnifiedCloudMediaConsent(state?.profile)'),
  'voz da nuvem só com consentimento já dado; senão a voz do aparelho'
);
assert.ok(
  !/practiceSpeech|recognize\(|getUserMedia|RECORD_AUDIO|useAudioRecorder/.test(wakeScreen),
  'ouvir o despertar é passivo: nada de microfone'
);
for (const testID of ['wake-sequence-screen', 'wake-player', 'wake-pause', 'wake-next', 'wake-stop', 'wake-complete']) {
  assert.ok(
    wakeScreen.includes(`testID="${testID}"`) || wakeScreen.includes(`testID: '${testID}'`),
    `tela de ouvir sem ${testID}`
  );
}

// 12b. Rodada de correção 1.
// (1) Android não ativa lembrete para uma sequência vazia (ele abriria "Sua sequência está vazia").
assert.ok(
  reminderActivation.includes('items.length === 0') &&
    alarmScreen.includes('const reminderEmpty = reminderMode && items.length === 0') &&
    alarmScreen.includes('disabled={busy || reminderEmpty ||') &&
    alarmScreen.includes(': reminderEmpty\n    ? t(COPY.emptySequence)'),
  'lembrete Android com sequência vazia precisa ficar desligado e dizer por quê'
);
// (4) No Android nenhum texto alcançável fala em alarme; a permissão só é anunciada quando falta.
assert.ok(
  alarmScreen.includes('t(reminderMode ? COPY.reminderNoPhrase : COPY.noPhrase)') &&
    alarmScreen.includes('t(reminderMode ? COPY.reminderUnsupported : COPY.unsupported)') &&
    alarmScreen.includes("!reminderMode && capability.reason === 'native_module_missing'") &&
    reminderActivation.includes("capability?.authorization === 'authorized' ? null : t(COPY.reminderPermissionNote)") &&
    !/reminder\w*:\s*\{\s*pt: '[^']*alarme/i.test(alarmScreen),
  'textos do lembrete Android não podem falar em alarme nem prometer pedido de permissão já concedida'
);
// (3) Voz do aparelho não pausa: o botão diz "Recomeçar"; pausa no intervalo segue para o próximo item.
assert.ok(
  wakeScreen.includes("startOver: { pt: 'Recomeçar', en: 'Start over' }") &&
    screenBlock('function itemFinished(').includes('resumeAtRef.current = next') &&
    screenBlock('function resume(').includes('playItem(resumeAtRef.current)') &&
    playItemBlock.includes('resumeAtRef.current = position') &&
    wakeCode.includes('label: restartOnResume ? S.startOver : S.resume'),
  '"Continuar" precisa ser honesto: recomeça o item ou segue para o próximo depois do intervalo'
);
// (7) No toque que inicia a voz da nuvem, a fala do aparelho é destravada (sem som) para a reserva.
assert.ok(
  /Speech\.speak\(' ', \{\s*volume: 0\s*\}\)/.test(playItemBlock) &&
    playItemBlock.indexOf("Speech.speak(' '") < playItemBlock.indexOf('.playPersonal('),
  'reserva da voz do aparelho precisa ser destravada no mesmo toque da voz da Celeste'
);
// Polimento: o expo-speech fala de forma assíncrona na web (um try/catch não pega a falha), então
// a fala do aparelho só é chamada quando o navegador tem síntese de voz; sem ela, aviso honesto.
assert.ok(
  wakeCode.includes(
    "Platform.OS !== 'web' || typeof globalThis.SpeechSynthesisUtterance === 'function' && !!globalThis.speechSynthesis"
  ) &&
    /if \(webSpeechAvailable\(\)\) Speech\.speak\(' '/.test(playItemBlock) &&
    !/try \{\s*Speech\.speak\(' '/.test(playItemBlock) &&
    speakBlock.indexOf('if (!webSpeechAvailable())') >= 0 &&
    speakBlock.indexOf('if (!webSpeechAvailable())') < speakBlock.indexOf('Speech.speak(item.text'),
  'sem síntese de voz no navegador, a fala do aparelho não pode virar promessa rejeitada sem dono'
);
// (6) Android: apagar o conteúdo da frase reaponta e mantém o lembrete; só a sequência vazia desliga.
const dreamAndCustomOn = withSequence(
  [{ kind: 'affirmation', id: 'ritual:x' }, { kind: 'affirmation', id: 'custom' }],
  { reminderEnabled: true, wakeAffirmationId: 'ritual:x', wakeAffirmationText: 'Eu recebo a manhã.' }
);
const afterDreamDeleted = reminderRitualAfterDeletion({
  ...dreamAndCustomOn,
  morningRitual: { ...dreamAndCustomOn.morningRitual, entries: [] },
});
assert.strictEqual(afterDreamDeleted.reminderEnabled, true, 'apagar a frase não pode desligar o lembrete inteiro');
assert.deepStrictEqual(afterDreamDeleted.wakeSequence, [{ kind: 'affirmation', id: 'custom' }]);
assert.strictEqual(afterDreamDeleted.wakeAffirmationId, 'custom', 'a frase precisa ser reapontada');
assert.strictEqual(afterDreamDeleted.wakeAffirmationText, 'Minha frase própria para acordar.');
const onlyAnchorOn = withSequence([{ kind: 'anchor', id: 'anchor:m1' }], {
  reminderEnabled: true,
  wakeAffirmationId: 'manifestation:m1',
});
const anchorDeleted = reminderRitualAfterDeletion({ ...onlyAnchorOn, anchorSceneId: null, manifestations: [] });
assert.strictEqual(anchorDeleted.reminderEnabled, false, 'sequência vazia desliga o lembrete');
assert.deepStrictEqual(anchorDeleted.wakeSequence, []);
const onlyDreamOn = withSequence([{ kind: 'affirmation', id: 'ritual:x' }], {
  reminderEnabled: true,
  wakeAffirmationId: 'ritual:x',
});
const onlyDreamDeleted = reminderRitualAfterDeletion({
  ...onlyDreamOn,
  morningRitual: { ...onlyDreamOn.morningRitual, entries: [] },
});
assert.strictEqual(
  onlyDreamDeleted.reminderEnabled,
  false,
  'sequência vazia desliga mesmo quando ainda existe a afirmação da Cena-Âncora'
);
const anchorAndDreamOn = withSequence(
  [{ kind: 'anchor', id: 'anchor:m1' }, { kind: 'affirmation', id: 'ritual:x' }],
  { reminderEnabled: true, wakeAffirmationId: 'ritual:x' }
);
const anchorGoneDreamStays = reminderRitualAfterDeletion({ ...anchorAndDreamOn, anchorSceneId: null, manifestations: [] });
assert.strictEqual(anchorGoneDreamStays.reminderEnabled, true);
assert.deepStrictEqual(anchorGoneDreamStays.wakeSequence, [{ kind: 'affirmation', id: 'ritual:x' }]);
assert.strictEqual(anchorGoneDreamStays.wakeAffirmationId, 'ritual:x');
const removeManifestationBlock = context.slice(
  context.indexOf('const removeManifestation = useCallback'),
  context.indexOf('const toggleFavoriteAffirmation = useCallback')
);
const removeDreamBlock = context.slice(
  context.indexOf('const removeDreamRitual = useCallback'),
  context.indexOf('const exportStateJson = useCallback')
);
for (const [name, block] of [
  ['removeManifestation', removeManifestationBlock],
  ['removeDreamRitual', removeDreamBlock],
]) {
  assert.ok(
    block.includes('usedAsAlarm && RELEASE_FEATURES.affirmationAlarm') &&
      block.includes('reminderEnabled: false') &&
      /if \(!RELEASE_FEATURES\.affirmationAlarm\)[\s\S]*reminderRitualAfterDeletion\(/.test(block),
    `${name}: iPhone desliga o alarme como antes; Android reaponta pelo reminderRitualAfterDeletion`
  );
}

// 13. Lembrete Android (expo-notifications falso + Platform falso): DAILY com os 7 dias,
// WEEKLY por dia (domingo = 1 no Expo), canal próprio com som e web honesta.
function loadService(relative, OS) {
  const target = path.join(root, relative);
  delete require.cache[target];
  const originalLoad = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === 'react-native') return { Platform: { OS } };
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    return load(relative);
  } finally {
    Module._load = originalLoad;
  }
}
const loadWakeReminders = (OS) => loadService('services/wakeReminders.js', OS);

const WAKE_DATA = { kind: 'wake_sequence', url: 'celeste://despertar/ouvir' };
const scheduledWake = (identifier) => ({ identifier, content: { data: { ...WAKE_DATA } }, trigger: {} });
const scheduledPlan = {
  identifier: 'plan-manha',
  content: { data: { kind: 'practice_plan', slotId: 'manha', url: 'celeste://pratica/manha' } },
  trigger: {},
};
const responseFor = (data) => ({ notification: { request: { content: { data } } } });

function notificationsMock(overrides = {}) {
  const calls = { channels: [], scheduled: [], cancelled: [], order: [], requests: 0, cleared: 0 };
  return {
    calls,
    AndroidImportance: { DEFAULT: 3, HIGH: 4 },
    SchedulableTriggerInputTypes: { DAILY: 'daily', WEEKLY: 'weekly' },
    async getPermissionsAsync() {
      return { status: 'granted', granted: true };
    },
    async requestPermissionsAsync() {
      calls.requests += 1;
      return { status: 'granted', granted: true };
    },
    async setNotificationChannelAsync(id, config) {
      calls.channels.push({ id, config });
    },
    async scheduleNotificationAsync(request) {
      calls.scheduled.push(request);
      calls.order.push('schedule');
      return `wake-${calls.scheduled.length}`;
    },
    async getAllScheduledNotificationsAsync() {
      return [];
    },
    async cancelScheduledNotificationAsync(identifier) {
      calls.cancelled.push(identifier);
      calls.order.push(`cancel:${identifier}`);
    },
    setNotificationHandler(handler) {
      calls.handler = handler;
    },
    getLastNotificationResponse() {
      return null;
    },
    clearLastNotificationResponse() {
      calls.cleared += 1;
    },
    addNotificationResponseReceivedListener(listener) {
      calls.listener = listener;
      return {
        remove() {
          calls.removed = true;
        },
      };
    },
    ...overrides,
  };
}

// Aparelho com estado: o que foi agendado fica lá até ser cancelado.
function deviceNotifications(initial = [], overrides = {}) {
  const live = new Map(initial.map((item) => [item.identifier, item]));
  let created = 0;
  const mock = notificationsMock({
    async scheduleNotificationAsync(request) {
      mock.calls.scheduled.push(request);
      created += 1;
      const identifier = `n-${created}`;
      live.set(identifier, { identifier, content: request.content, trigger: request.trigger });
      return identifier;
    },
    async getAllScheduledNotificationsAsync() {
      return [...live.values()];
    },
    async cancelScheduledNotificationAsync(identifier) {
      mock.calls.cancelled.push(identifier);
      live.delete(identifier);
    },
    ...overrides,
  });
  mock.live = live;
  return mock;
}
// Os lembretes do despertar que o aparelho vai entregar, pelo gatilho real e pelo título (o idioma).
const wakeOnDevice = (mock) =>
  [...mock.live.values()]
    .filter((item) => item.content && item.content.data && item.content.data.kind === 'wake_sequence')
    .map(({ content, trigger }) => `${content.title} | ${trigger.type} ${trigger.weekday || '-'} ${trigger.hour}:${trigger.minute}`)
    .sort();

async function verifyWakeReminders() {
  const service = loadWakeReminders('android');
  const useMock = (mock) => {
    service._wakeRemindersTest.setApiForTests(mock);
    return mock;
  };

  let mock = useMock(notificationsMock());
  assert.deepStrictEqual(
    await service.scheduleWakeReminders({ time: '06:30', weekdays: [7, 1, 2, 3, 4, 5, 6], lang: 'pt' }),
    { ok: true, identifiers: ['wake-1'], permission: 'granted' }
  );
  assert.deepStrictEqual(
    mock.calls.scheduled.map((request) => request.trigger),
    [{ type: 'daily', hour: 6, minute: 30, channelId: 'celeste-despertar' }],
    'os 7 dias viram um único lembrete DAILY no canal do despertar'
  );
  const wakeContent = mock.calls.scheduled[0].content;
  assert.ok(
    wakeContent.data.kind === WAKE_DATA.kind && wakeContent.data.url === WAKE_DATA.url,
    'tocar no lembrete precisa abrir despertar/ouvir'
  );
  assert.strictEqual(wakeContent.data.lang, 'pt', 'o idioma do agendamento fica gravado no lembrete');
  assert.strictEqual(wakeContent.sound, true, 'lembrete do despertar não pode chegar mudo');
  assert.strictEqual(wakeContent.title, 'Seu despertar está pronto');
  assert.strictEqual(mock.calls.channels.length, 1);
  const [{ id: channelId, config: channel }] = mock.calls.channels;
  assert.strictEqual(channelId, 'celeste-despertar');
  assert.strictEqual(channel.importance, mock.AndroidImportance.HIGH, 'canal do despertar precisa de importância alta');
  assert.ok(channel.sound !== null && channel.sound !== false, 'canal do despertar precisa tocar o som padrão');
  assert.notStrictEqual(channel.enableVibrate, false);
  assert.ok(channel.name, 'canal sem nome visível nos ajustes');

  mock = useMock(notificationsMock());
  const weekly = await service.scheduleWakeReminders({ time: '07:05', weekdays: [7, 1, 3, 3], lang: 'en' });
  assert.deepStrictEqual(weekly, { ok: true, identifiers: ['wake-1', 'wake-2', 'wake-3'], permission: 'granted' });
  assert.deepStrictEqual(
    mock.calls.scheduled.map((request) => request.trigger),
    [
      { type: 'weekly', weekday: 2, hour: 7, minute: 5, channelId: 'celeste-despertar' },
      { type: 'weekly', weekday: 4, hour: 7, minute: 5, channelId: 'celeste-despertar' },
      { type: 'weekly', weekday: 1, hour: 7, minute: 5, channelId: 'celeste-despertar' },
    ],
    'dias ISO (segunda = 1) viram WEEKLY do Expo (domingo = 1), um por dia'
  );
  assert.strictEqual(mock.calls.scheduled[0].content.title, 'Your wake-up is ready');

  // Trocar horário/dias: os novos nascem antes de os antigos saírem; outros lembretes ficam.
  mock = useMock(
    notificationsMock({
      async getAllScheduledNotificationsAsync() {
        return [scheduledWake('old-wake'), scheduledPlan];
      },
    })
  );
  assert.strictEqual((await service.scheduleWakeReminders({ time: '08:00', weekdays: [1], lang: 'pt' })).ok, true);
  assert.deepStrictEqual(mock.calls.order, ['schedule', 'cancel:old-wake']);

  // Falha no meio: desfaz só o que acabou de criar e mantém o lembrete antigo.
  mock = useMock(
    notificationsMock({
      async getAllScheduledNotificationsAsync() {
        return [scheduledWake('old-wake')];
      },
      async scheduleNotificationAsync() {
        mock.calls.order.push('schedule');
        if (mock.calls.order.length === 2) throw new Error('native_failure');
        return 'new-wake-1';
      },
    })
  );
  assert.deepStrictEqual(
    await service.scheduleWakeReminders({ time: '08:00', weekdays: [1, 2], lang: 'pt' }),
    { ok: false, error: 'schedule_failed', permission: 'granted' }
  );
  assert.deepStrictEqual(mock.calls.cancelled, ['new-wake-1'], 'falha no meio apagou o lembrete antigo ou deixou o novo');

  // Os novos já existem e cancelar um antigo falha (seg/qua/sex → 08:00, quarta falha): os
  // novos ficam, os outros antigos saem um a um e o lembrete segue ativo de verdade.
  const live = new Set(['old-mon', 'old-wed', 'old-fri']);
  let created = 0;
  useMock(
    notificationsMock({
      async getAllScheduledNotificationsAsync() {
        return [...live].map(scheduledWake);
      },
      async scheduleNotificationAsync() {
        created += 1;
        live.add(`new-${created}`);
        return `new-${created}`;
      },
      async cancelScheduledNotificationAsync(identifier) {
        if (identifier === 'old-wed') throw new Error('native_failure');
        live.delete(identifier);
      },
    })
  );
  assert.deepStrictEqual(
    await service.scheduleWakeReminders({ time: '08:00', weekdays: [1, 3, 5], lang: 'pt' }),
    { ok: true, identifiers: ['new-1', 'new-2', 'new-3'], permission: 'granted' }
  );
  assert.deepStrictEqual([...live].sort(), ['new-1', 'new-2', 'new-3', 'old-wed'], 'segunda e sexta novas sumiram');

  // Permissão: pedida só aqui (na ativação); negada não agenda nada.
  mock = useMock(
    notificationsMock({
      async getPermissionsAsync() {
        return { status: 'undetermined', granted: false, canAskAgain: true };
      },
      async requestPermissionsAsync() {
        mock.calls.requests += 1;
        return { status: 'denied', granted: false, canAskAgain: false };
      },
    })
  );
  assert.deepStrictEqual(
    await service.scheduleWakeReminders({ time: '07:00', weekdays: [1], lang: 'pt' }),
    { ok: false, error: 'permission_denied', permission: 'denied' }
  );
  assert.strictEqual(mock.calls.requests, 1);
  assert.strictEqual(mock.calls.scheduled.length, 0, 'sem permissão não pode agendar');

  mock = useMock(notificationsMock());
  for (const [input, error] of [
    [{ time: '7:00', weekdays: [1] }, 'invalid_time'],
    [{ time: '24:00', weekdays: [1] }, 'invalid_time'],
    [{ time: '07:00', weekdays: [] }, 'invalid_weekdays'],
    [{ time: '07:00', weekdays: [0, 1] }, 'invalid_weekdays'],
  ]) {
    assert.strictEqual((await service.scheduleWakeReminders(input)).error, error, JSON.stringify(input));
  }
  assert.strictEqual(mock.calls.scheduled.length, 0);

  // Desligar: só os lembretes do despertar saem, um a um. Um id que falha uma vez não segura
  // os outros e sai na nova tentativa; o lembrete do plano fica.
  const liveOff = new Set(['old-wake', 'plan-manha', 'old-wake-2', 'old-wake-3']);
  let refusedOnce = false;
  useMock(
    notificationsMock({
      async getAllScheduledNotificationsAsync() {
        return [...liveOff].map((identifier) => (identifier === 'plan-manha' ? scheduledPlan : scheduledWake(identifier)));
      },
      async cancelScheduledNotificationAsync(identifier) {
        if (identifier === 'old-wake-2' && !refusedOnce) {
          refusedOnce = true;
          throw new Error('native_failure');
        }
        liveOff.delete(identifier);
      },
    })
  );
  assert.deepStrictEqual(await service.cancelWakeReminders(), { ok: true });
  assert.deepStrictEqual([...liveOff], ['plan-manha'], 'desligar deixou lembrete do despertar ou apagou o do plano');
  // Um id que sempre falha: todos os outros saem e o resultado admite a falha.
  const liveStuck = new Set(['old-wake', 'stuck-wake', 'old-wake-3']);
  useMock(
    notificationsMock({
      async getAllScheduledNotificationsAsync() {
        return [...liveStuck].map(scheduledWake);
      },
      async cancelScheduledNotificationAsync(identifier) {
        if (identifier === 'stuck-wake') throw new Error('native_failure');
        liveStuck.delete(identifier);
      },
    })
  );
  assert.deepStrictEqual(await service.cancelWakeReminders(), { ok: false, error: 'cancel_failed' });
  assert.deepStrictEqual([...liveStuck], ['stuck-wake'], 'um id travado segurou os outros lembretes');

  // Tocar no lembrete abre despertar/ouvir; o toque de outro lembrete fica para o dono dele.
  mock = useMock(notificationsMock({ getLastNotificationResponse: () => responseFor(WAKE_DATA) }));
  assert.strictEqual(await service.initialWakeNotificationUrl(), 'celeste://despertar/ouvir');
  assert.strictEqual(mock.calls.cleared, 1);
  mock = useMock(notificationsMock({ getLastNotificationResponse: () => responseFor(scheduledPlan.content.data) }));
  assert.strictEqual(await service.initialWakeNotificationUrl(), null);
  assert.strictEqual(mock.calls.cleared, 0, 'não pode limpar a resposta de outro lembrete');
  const received = [];
  const unsubscribe = service.subscribeWakeNotificationUrls((url) => received.push(url));
  mock.calls.listener(responseFor(scheduledPlan.content.data));
  mock.calls.listener(responseFor(WAKE_DATA));
  assert.deepStrictEqual(received, ['celeste://despertar/ouvir']);
  unsubscribe();
  assert.strictEqual(mock.calls.removed, true);

  // App aberto: o handler é global; só o despertar toca som, os outros seguem silenciosos.
  assert.strictEqual(service.configureWakeNotifications(), true);
  const wakeBehavior = await mock.calls.handler.handleNotification(responseFor(WAKE_DATA).notification);
  const planBehavior = await mock.calls.handler.handleNotification(responseFor(scheduledPlan.content.data).notification);
  assert.strictEqual(wakeBehavior.shouldPlaySound, true);
  assert.strictEqual(planBehavior.shouldPlaySound, false);
  assert.strictEqual(planBehavior.shouldShowBanner, true);

  for (const [permission, expected] of [
    [{ status: 'granted', granted: true }, { supported: true, canSchedule: true, canRequestAuthorization: false, authorization: 'authorized' }],
    [{ status: 'undetermined', granted: false, canAskAgain: true }, { supported: true, canSchedule: false, canRequestAuthorization: true, authorization: 'not_determined' }],
    [{ status: 'denied', granted: false, canAskAgain: false }, { supported: true, canSchedule: false, canRequestAuthorization: false, authorization: 'denied' }],
  ]) {
    useMock(notificationsMock({ getPermissionsAsync: async () => permission }));
    assert.deepStrictEqual(await service.getWakeReminderCapability(), expected, permission.status);
  }

  // 13b. Sincronia (App ao abrir e ao voltar para a frente, lembrete ligado): idempotente, nunca pede permissão.
  const plan = { time: '07:05', weekdays: [1, 3], lang: 'pt' };
  const ptMonWed = ['Seu despertar está pronto | weekly 2 7:5', 'Seu despertar está pronto | weekly 4 7:5'];
  // Sumiram (backup restaurado, reinstalação, force-stop, limpeza de outro recurso): refeitos; o do plano fica.
  mock = useMock(deviceNotifications([scheduledPlan]));
  assert.strictEqual((await service.syncWakeReminders(plan)).ok, true);
  assert.deepStrictEqual(wakeOnDevice(mock), ptMonWed, 'lembretes que sumiram não foram refeitos');
  assert.strictEqual(mock.calls.requests, 0, 'a sincronia nunca pede permissão');
  assert.ok(mock.live.has('plan-manha'), 'a sincronia mexeu no lembrete do plano');
  // Já certos: nada muda.
  const settled = mock.calls.scheduled.length;
  assert.deepStrictEqual(
    await service.syncWakeReminders(plan),
    { ok: true, changed: false },
    'sincronia com os lembretes certos precisa dizer que nada mudou'
  );
  assert.ok(
    mock.calls.scheduled.length === settled && mock.calls.cancelled.length === 0,
    'lembretes certos não podem ser refeitos a cada abertura'
  );
  // Um dia sumiu: refeitos, sem duplicata.
  mock.live.delete([...mock.live.keys()].find((id) => id !== 'plan-manha'));
  assert.strictEqual((await service.syncWakeReminders(plan)).changed, true);
  assert.deepStrictEqual(wakeOnDevice(mock), ptMonWed, 'um dia que sumiu não voltou (ou ficou duplicado)');
  // Horário ou dias salvos diferentes do que está agendado: reagenda.
  await service.syncWakeReminders({ ...plan, time: '08:30', weekdays: [5] });
  assert.deepStrictEqual(wakeOnDevice(mock), ['Seu despertar está pronto | weekly 6 8:30'], 'horário/dias salvos não valeram');
  // O idioma do app mudou: título, texto e canal no novo idioma; os antigos saem.
  const channelsBefore = mock.calls.channels.length;
  await service.syncWakeReminders({ ...plan, time: '08:30', weekdays: [5], lang: 'en' });
  assert.deepStrictEqual(wakeOnDevice(mock), ['Your wake-up is ready | weekly 6 8:30'], 'lembrete continuou no idioma antigo');
  assert.strictEqual(mock.calls.channels.slice(channelsBefore).pop().config.name, 'My wake-up', 'canal no idioma antigo');
  assert.deepStrictEqual(
    await service.syncWakeReminders({ ...plan, time: '08:30', weekdays: [5], lang: 'en' }),
    { ok: true, changed: false },
    'depois de trocar o idioma, a sincronia volta a ser idempotente'
  );
  // Lembretes de antes desta versão (sem idioma gravado): refeitos uma vez.
  mock = useMock(deviceNotifications([scheduledWake('legacy-wake')]));
  await service.syncWakeReminders(plan);
  assert.ok(!mock.live.has('legacy-wake') && wakeOnDevice(mock).length === 2, 'lembrete antigo sem idioma ficou');
  // Abrir e voltar para a frente ao mesmo tempo: uma sincronia espera a outra, sem duplicar.
  mock = useMock(deviceNotifications());
  await Promise.all([service.syncWakeReminders(plan), service.syncWakeReminders(plan)]);
  assert.deepStrictEqual(wakeOnDevice(mock), ptMonWed, 'duas sincronias ao mesmo tempo duplicaram os lembretes');
  // Permissão que sumiu (negada ou ainda não decidida): não pede, não agenda, não apaga; a tela mostra o estado.
  for (const permission of [
    { status: 'denied', granted: false, canAskAgain: false },
    { status: 'undetermined', granted: false, canAskAgain: true },
  ]) {
    mock = useMock(deviceNotifications([scheduledWake('kept-wake')], { getPermissionsAsync: async () => permission }));
    const result = await service.syncWakeReminders(plan);
    assert.ok(result.ok === false && result.error === 'permission_denied', `sem permissão (${permission.status}) fingiu sincronizar`);
    assert.ok(
      mock.calls.requests === 0 && mock.calls.scheduled.length === 0 && mock.live.has('kept-wake'),
      `sem permissão (${permission.status}): a sincronia pediu permissão, agendou ou apagou`
    );
  }
  // Horário salvo inválido: nada é feito.
  mock = useMock(deviceNotifications());
  assert.strictEqual((await service.syncWakeReminders({ ...plan, time: '7h' })).error, 'invalid_time');
  assert.strictEqual(mock.calls.scheduled.length, 0);

  // 13c. Ritual diário: a limpeza de último recurso (troca de horário com os dois cancelamentos falhando) apaga só os
  // lembretes do próprio ritual — nunca os do despertar nem os do plano (antes: cancelAll).
  const daily = loadService('services/dailyRitualReminder.js', 'android');
  const dailyItem = (identifier) => ({ identifier, content: { data: { url: 'celeste://ritual', kind: 'daily_ritual' } }, trigger: {} });
  const refused = new Set();
  let wipedAll = false;
  const dailyMock = deviceNotifications([scheduledWake('wake-1'), scheduledPlan, dailyItem('old-daily')], {
    async cancelScheduledNotificationAsync(identifier) {
      if (!refused.has(identifier)) {
        refused.add(identifier);
        throw new Error('native_failure');
      }
      dailyMock.live.delete(identifier);
    },
    async cancelAllScheduledNotificationsAsync() {
      wipedAll = true;
      dailyMock.live.clear();
    },
  });
  daily._dailyRitualReminderTest.setApiForTests(dailyMock);
  assert.deepStrictEqual(
    await daily.scheduleDailyRitualReminder({ time: '08:00', previousId: 'old-daily', lang: 'pt' }),
    { ok: false, error: 'previous_cancel_failed' }
  );
  assert.strictEqual(wipedAll, false, 'a limpeza do ritual diário apagou os lembretes do app inteiro');
  assert.deepStrictEqual(
    [...dailyMock.live.keys()].sort(),
    ['plan-manha', 'wake-1'],
    'a limpeza do ritual diário precisa tirar os dois lembretes do ritual e deixar o despertar e o plano'
  );

  // Site: não finge lembrete.
  const web = loadWakeReminders('web');
  assert.deepStrictEqual(await web.scheduleWakeReminders({ time: '07:00', weekdays: [1], lang: 'pt' }), {
    ok: false,
    error: 'unsupported',
  });
  assert.deepStrictEqual(await web.cancelWakeReminders(), { ok: true });
  assert.deepStrictEqual(await web.syncWakeReminders({ time: '07:00', weekdays: [1], lang: 'pt' }), {
    ok: false,
    error: 'unsupported',
  });
  assert.strictEqual(await web.initialWakeNotificationUrl(), null);
  assert.strictEqual(web.configureWakeNotifications(), false);
}

verifyWakeReminders()
  .then(() => {
    process.stdout.write(
      'Despertar em sequência: tipos, limite, migração, frase do alarme, atalhos, ouvir e lembrete Android aprovados\n'
    );
  })
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
