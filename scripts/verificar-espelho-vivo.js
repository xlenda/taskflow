const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

function compile(file) {
  const source = fs.readFileSync(file, 'utf8');
  return transformSync(source, {
    filename: file,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
}

function load(file) {
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded._compile(compile(file), file);
  return loaded.exports;
}

const utilityFile = path.join(root, 'utils', 'livingMirror.js');
const {
  bridgeDoneOn,
  buildEvolutionContinuity,
  emptyLivingMirror,
  livingMirrorMemorySignature,
  livingMirrorStatus,
  normalizeLivingMirror,
  snapshotLivingMirrorChapter,
} = load(utilityFile);

assert.deepStrictEqual(normalizeLivingMirror(null), emptyLivingMirror());

const corrupted = normalizeLivingMirror({
  chapter: 999,
  lastEvolvedOn: 'tomorrow-ish',
  bridgeCompletions: [
    { date: '2026-08-26', step: 'Abrir o caderno', chapter: 1, completedAt: '2026-08-26T09:00:00.000Z' },
    { date: '2026-08-26', step: 'Duplicada', chapter: 1, completedAt: '2026-08-26T10:00:00.000Z' },
    { date: 'invalid', step: 'Descartar', completedAt: 'invalid' },
  ],
  chapters: [{ chapter: 1, title: '', affirmation: '', story: '' }],
});
assert.strictEqual(corrupted.chapter, 1, 'capitulo corrompido precisa voltar ao primeiro');
assert.strictEqual(corrupted.bridgeCompletions.length, 1, 'ponte diaria duplicada precisa ser removida');
assert.strictEqual(corrupted.chapters.length, 0, 'snapshot vazio nao pode sobreviver');

const manifestation = {
  id: 'm-1',
  title: 'Minha rotina criativa',
  lang: 'pt',
  intention: 'Criar com calma.',
  affirmation: 'Eu pratico criatividade com calma.',
  story: 'A luz entra pela janela enquanto eu abro meu caderno.',
  anchorIdentity: 'Eu protejo minha atencao.',
  anchorStep: 'Quando eu sentir pressa, entao vou escrever por dez minutos.',
  sessions: ['2026-08-25', '2026-08-26'],
  evidence: [{ id: 'e-1', text: 'RASTRO_PRIVADO_SENTINELA', createdAt: '2026-08-26T08:00:00.000Z' }],
  livingMirror: {
    ...emptyLivingMirror(),
    bridgeCompletions: [{
      id: 'b-1',
      date: '2026-08-26',
      step: 'Abrir o caderno',
      chapter: 1,
      completedAt: '2026-08-26T09:00:00.000Z',
    }],
  },
};
const dreams = [{
  id: 'dream-1',
  dream: 'SONHO_BRUTO_SENTINELA',
  reflection: 'REFLEXAO_PRIVADA_SENTINELA',
  theme: 'clarity',
  feeling: 'curious',
  createdAt: '2026-08-26T07:00:00.000Z',
  useInLivingMirror: true,
}];

assert.strictEqual(bridgeDoneOn(manifestation, '2026-08-26'), true);
const status = livingMirrorStatus(manifestation, dreams, '2026-08-27');
assert.strictEqual(status.canEvolve, true, 'progresso novo deve liberar um proximo capitulo');
assert.strictEqual(status.memory.practiceDays, 2);
assert.strictEqual(status.memory.stepCompletions, 1);
assert.strictEqual(status.memory.evidenceCount, 1);
assert.strictEqual(status.memory.latestDreamTheme, 'clarity');

const continuity = buildEvolutionContinuity(manifestation, dreams);
const serialized = JSON.stringify(continuity);
assert.ok(continuity.previousScene.story.includes('janela'), 'cena anterior gerada deve sustentar continuidade');
assert.ok(!serialized.includes('RASTRO_PRIVADO_SENTINELA'), 'texto do Rastro nunca pode sair do aparelho');
assert.ok(!serialized.includes('SONHO_BRUTO_SENTINELA'), 'relato bruto do sonho nunca pode sair do aparelho');
assert.ok(!serialized.includes('REFLEXAO_PRIVADA_SENTINELA'), 'reflexao privada nao pertence ao payload continuo');

const noConsent = buildEvolutionContinuity(manifestation, [{ ...dreams[0], useInLivingMirror: false }]);
assert.strictEqual(noConsent.dreamCount, 0, 'sonho sem opt-in nao pode entrar na memoria enviada');
assert.strictEqual(noConsent.latestDreamTheme, '', 'tema sem opt-in deve permanecer local');

const signature = livingMirrorMemorySignature(status.memory);
const caughtUp = {
  ...manifestation,
  livingMirror: { ...manifestation.livingMirror, lastMemorySignature: signature },
};
assert.strictEqual(
  livingMirrorStatus(caughtUp, dreams, '2026-08-27').canEvolve,
  false,
  'a mesma memoria nao pode cobrar Gemini outra vez'
);

const snapshot = snapshotLivingMirrorChapter(manifestation, ['desire', 'practice_days'], '2026-08-26T12:00:00.000Z');
assert.strictEqual(snapshot.chapter, 1);
assert.deepStrictEqual(snapshot.memoryReceipt, ['desire', 'practice_days']);
assert.ok(!JSON.stringify(snapshot).includes('RASTRO_PRIVADO_SENTINELA'));

for (const relative of [
  'context/AppContext.js',
  'screens/DailyRitualScreen.js',
  'screens/HomeScreen.js',
  'screens/ManifestationScreen.js',
  'screens/MorningRitualScreen.js',
  'App.js',
]) {
  compile(path.join(root, relative));
}

const context = fs.readFileSync(path.join(root, 'context', 'AppContext.js'), 'utf8');
const dreamScreen = fs.readFileSync(path.join(root, 'screens', 'MorningRitualScreen.js'), 'utf8');
const manifestationScreen = fs.readFileSync(path.join(root, 'screens', 'ManifestationScreen.js'), 'utf8');
assert.ok(context.includes('normalizeLivingMirror(m.livingMirror)'), 'backup antigo precisa de merge defensivo');
assert.ok(context.includes('evolutionRequestsRef.current.has(requestKey)'), 'clique duplo nao pode gerar duas cenas');
assert.ok(context.includes('generationEpoch !== generationEpochRef.current'), 'reset durante geracao deve descartar resposta');
assert.ok(
  context.includes("error: 'memory_changed'") && context.includes('const commitResult = new Promise'),
  'evolucao descartada por estado novo nao pode anunciar capitulo pronto'
);
assert.ok(context.includes('lastMemorySignature: status.memorySignature'), 'cache de memoria precisa sobreviver ao reload');
assert.ok(
  context.includes('useInLivingMirror: false'),
  'backup restaurado precisa pedir novo opt-in individual para temas de sonhos'
);
assert.ok(dreamScreen.includes('dream-living-mirror-consent'), 'sonho precisa de opt-in individual');
assert.ok(manifestationScreen.includes('toggle-bridge-completion'), 'Seguir precisa registrar a Ponte real');

process.stdout.write('Espelho Vivo: memoria, privacidade e continuidade aprovadas\n');
