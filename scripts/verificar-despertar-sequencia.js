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

const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const {
  WAKE_SEQUENCE_MAX,
  alarmPhraseForState,
  appendToWakeSequence,
  estimateListeningSeconds,
  firstPhraseForAlarm,
  normalizeWakeSequence,
  pendingAlarmSound,
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
const emptiedNoAnchor = { ...activeNoAnchor, morningRitual: ritualWithWakeSequence(activeNoAnchor, []) };
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

process.stdout.write('Despertar em sequência: tipos, limite, migração, frase do alarme e atalhos aprovados\n');
