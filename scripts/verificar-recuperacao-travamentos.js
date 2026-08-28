const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const writerSource = read('utils/serialStorageWriter.js');
const writerExecutable = writerSource.replace(/\bexport\s+(?=function|const|class)/g, '');
const { createSerialStorageWriter } = Function(
  `${writerExecutable}\nreturn { createSerialStorageWriter };`
)();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

async function serializesLateWrites() {
  const first = deferred();
  const second = deferred();
  const operations = [first, second];
  const values = [];
  const statuses = [];
  let active = 0;
  let maxActive = 0;

  const writer = createSerialStorageWriter({
    timeoutMs: 20,
    onStatus: (event) => statuses.push(event.type),
    write: (value) => {
      const operation = operations[values.length];
      values.push(value);
      active += 1;
      maxActive = Math.max(maxActive, active);
      return operation.promise.finally(() => {
        active -= 1;
      });
    },
  });

  const oldRevision = writer.enqueue('old');
  assert.strictEqual(await writer.waitFor(oldRevision, 28), false, 'write pendente prendeu a UI');
  assert.ok(statuses.includes('timeout'), 'timeout da escrita nao ficou observavel');

  writer.enqueue('intermediate');
  const newestRevision = writer.enqueue('newest');
  writer.resume();
  await sleep(4);
  assert.deepStrictEqual(values, ['old'], 'timeout iniciou escrita concorrente');

  const newestAck = writer.waitFor(newestRevision, 120);
  first.resolve();
  await sleep(4);
  assert.deepStrictEqual(values, ['old', 'newest'], 'fila nao preservou somente o snapshot mais novo');
  second.resolve();
  assert.strictEqual(await newestAck, true, 'snapshot mais novo nao foi confirmado');
  assert.strictEqual(maxActive, 1, 'duas gravacoes ficaram ativas ao mesmo tempo');
  writer.dispose();
}

async function retriesAfterRejection() {
  const saved = [];
  let attempt = 0;
  const writer = createSerialStorageWriter({
    timeoutMs: 40,
    write: (value) => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error('blocked'));
      saved.push(value);
      return Promise.resolve();
    },
  });

  const failedRevision = writer.enqueue('old');
  assert.strictEqual(await writer.waitFor(failedRevision, 80), false, 'rejeicao nao liberou a UI');
  assert.strictEqual(writer.inspect().paused, true, 'fila nao pausou depois da rejeicao');

  const latestRevision = writer.enqueue('latest');
  await sleep(4);
  assert.strictEqual(attempt, 1, 'fila pausada escreveu antes da tentativa explicita');
  writer.resume();
  assert.strictEqual(await writer.waitFor(latestRevision, 80), true, 'nova tentativa nao confirmou');
  assert.deepStrictEqual(saved, ['latest'], 'nova tentativa regravou snapshot obsoleto');
  writer.dispose();
}

async function publishesResetOnlyAfterAck() {
  const delayed = deferred();
  let persisted = 'old-state';
  let memory = 'old-state';
  const writer = createSerialStorageWriter({
    timeoutMs: 20,
    write: async (value) => {
      await delayed.promise;
      persisted = value;
    },
  });

  const revision = writer.enqueue('reset-state');
  assert.strictEqual(await writer.waitFor(revision, 28), false, 'late reset should release the UI');
  assert.strictEqual(memory, 'old-state', 'reset sem ack nao pode desmontar a tela atual');
  delayed.resolve();
  assert.strictEqual(await writer.waitFor(revision, 80), true, 'late reset never completed');
  memory = 'reset-state';
  assert.strictEqual(persisted, memory, 'late reset left memory and disk describing different states');
  writer.dispose();
}

async function run() {
  await serializesLateWrites();
  await retriesAfterRejection();
  await publishesResetOnlyAfterAck();

  const context = read('context/AppContext.js');
  const app = read('App.js');
  const community = read('services/communityStories.js');
  const chat = read('screens/onboarding/ChatOnboardingScreen.js');
  const welcome = read('screens/onboarding/WelcomeScreen.js');
  const video = read('components/WelcomeVideo.js');
  const sceneClient = read('services/generatePersonalizedScene.js');
  const deploy = read('scripts/deploy-celeste.js');
  const journey = read('screens/JourneyScreen.js');

  assert.ok(context.includes('createSerialStorageWriter'), 'AppContext nao usa fila serial');
  assert.ok(context.includes('storageLoadError'), 'falha de leitura continua invisivel');
  assert.ok(context.includes('hydratedRef.current'), 'gravacao nao esta bloqueada antes da leitura');
  assert.ok(context.includes('retryLoad'), 'leitura local nao oferece nova tentativa');
  assert.ok(!context.includes('await AsyncStorage.setItem'), 'gravacao bloqueante escapou da fila serial');
  assert.ok(context.includes('generationEpochRef'), 'geracoes antigas nao sao invalidadas');
  assert.ok(
    context.includes('if (!mountedRef.current || generationEpoch !== generationEpochRef.current) return;') &&
      context.includes('if (!currentState || generationEpoch !== generationEpochRef.current) return currentState;'),
    'resposta remota antiga pode reaparecer depois de reset ou importacao'
  );
  assert.ok(
    (context.match(/generationEpochRef\.current \+= 1/g) || []).length >= 3,
    'reset, importacao e reinicio do onboarding devem invalidar geracoes em voo'
  );
  assert.ok(
    context.includes('AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS)'),
    'reset nao limpa rascunho, comunidade e convite locais'
  );
  assert.ok(
    context.includes('.filter((play) => play && typeof play === \'object\'') &&
      context.includes('.filter((play) => play.visionId && play.date)'),
    'visionPlays malformado precisa ser removido no load e no import'
  );
  const resetBlock = context.slice(context.indexOf('const resetAll'), context.indexOf('const setMood'));
  const firstAuxiliaryClear = resetBlock.indexOf('await AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS)');
  const resetEnqueue = resetBlock.indexOf('writerRef.current.enqueue(JSON.stringify(next))');
  const finalizeBlock = resetBlock.slice(resetBlock.indexOf('const finalizeReset'));
  assert.ok(
    firstAuxiliaryClear >= 0 &&
      firstAuxiliaryClear < resetEnqueue &&
      finalizeBlock.includes('await AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS)') &&
      finalizeBlock.indexOf('await AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS)') <
        finalizeBlock.indexOf('setState(next)'),
    'reset precisa limpar auxiliares antes da escrita e novamente antes de liberar a tela'
  );
  assert.ok(
    resetBlock.includes('let finalizePromise = null') &&
      resetBlock.includes('if (finalizePromise) return finalizePromise') &&
      resetBlock.indexOf('await writerRef.current.waitFor(revision') <
        resetBlock.lastIndexOf('pendingResetFinalizeRef.current()'),
    'finalizacao deve ser idempotente e a tela so pode mudar apos o ack'
  );
  assert.ok(
    resetBlock.includes('catch (_error)') && resetBlock.includes('return false'),
    'rejeicao da limpeza auxiliar escapa do reset sem mostrar falha de armazenamento'
  );
  assert.ok(
    resetBlock.includes('await writerRef.current.waitFor(revision'),
    'reset confirma sucesso antes da gravacao principal terminar'
  );
  assert.ok(
    context.includes('storageMutationRef.current ||') &&
      context.includes('pendingResetRevisionRef.current ||') &&
      context.includes('pendingImportRevisionRef.current'),
    'mudancas antigas nao podem entrar na fila enquanto um reset aguarda confirmacao'
  );
  assert.ok(
    app.includes('celeste-storage-mutation-guard') && app.includes('<StorageMutationGuard />'),
    'timeout de reset/import precisa bloquear interacoes ate a confirmacao real'
  );
  assert.ok(
    app.includes('celeste-storage-persist-retry') &&
      app.includes('celeste-storage-mutation-retry'),
    'acoes de recuperacao precisam ter alvos unicos para acessibilidade e testes'
  );
  assert.ok(
    resetBlock.includes('beginCommunityDataReset') && resetBlock.includes('finishCommunityDataReset'),
    'reset precisa invalidar relatos que ja estavam sendo enviados'
  );
  assert.ok(
    community.includes('serializeLocalMutation(() => Promise.resolve())') &&
      !community.slice(
        community.indexOf('export async function beginCommunityDataReset'),
        community.indexOf('export async function finishCommunityDataReset')
      ).includes('removeItem(COMMUNITY_STORAGE_KEY)'),
    'barreira de reset nao pode apagar relatos antes da limpeza principal confirmar'
  );
  assert.ok(app.includes('celeste-storage-recovery'), 'tela de recuperacao local ausente');
  assert.ok(app.includes('Nada foi apagado'), 'recuperacao nao protege a confianca da pessoa');

  const importBlock = context.slice(context.indexOf('const importStateJson'), context.indexOf('// â”€â”€ Onboarding'));
  assert.ok(
    importBlock.includes('useCallback(async (str)') &&
      importBlock.indexOf('writerRef.current.enqueue') < importBlock.indexOf('await writerRef.current.waitFor') &&
      importBlock.indexOf('await writerRef.current.waitFor') < importBlock.lastIndexOf('await finalizeImport()') &&
      importBlock.includes('if (finalizePromise) return finalizePromise'),
    'restauracao de backup precisa aguardar o ack antes de confirmar sucesso'
  );
  const importFinalizeBlock = importBlock.slice(
    importBlock.indexOf('const finalizeImport'),
    importBlock.indexOf('pendingImportFinalizeRef.current = finalizeImport')
  );
  assert.ok(
    !importBlock
      .slice(0, importBlock.indexOf('const finalizeImport'))
      .includes('await clearPersonalVisuals()') &&
      importFinalizeBlock.includes('await clearPersonalVisuals()') &&
      importFinalizeBlock.indexOf('await clearPersonalVisuals()') <
        importFinalizeBlock.indexOf('setState(restored)'),
    'importacao so pode limpar os visuais antigos depois do ack e antes de publicar o novo estado'
  );
  assert.ok(
    journey.includes("const r = await importStateJson(String(reader.result || ''))"),
    'Jornada precisa aguardar a restauracao persistida'
  );
  assert.ok(
    context.includes("export const CELESTE_BACKUP_FORMAT = 'celeste-backup'") &&
      context.includes('export const CELESTE_BACKUP_VERSION = 2') &&
      context.includes('exportLocalCommunityStoriesForBackup') &&
      context.includes("restorePolicy: CELESTE_BACKUP_RESTORE_POLICY") &&
      context.includes("replaceCommunityStories: false"),
    'backup precisa ser versionado, incluir Comunidade e manter compatibilidade legada'
  );
  assert.ok(
    context.includes('utf8ByteLength(serialized) > CELESTE_BACKUP_MAX_BYTES') &&
      context.includes('utf8ByteLength(str) > CELESTE_BACKUP_MAX_BYTES') &&
      journey.includes('blob.size > CELESTE_BACKUP_MAX_BYTES') &&
      journey.includes('file.size > CELESTE_BACKUP_MAX_BYTES'),
    'exportacao e importacao precisam compartilhar a mesma quota em bytes'
  );
  assert.ok(
    importBlock.includes('communityToken = await beginCommunityDataReset()') &&
      importBlock.includes('await restoreLocalCommunityStoriesFromBackup(') &&
      importBlock.indexOf('await restoreLocalCommunityStoriesFromBackup(') <
        importBlock.indexOf('setState(restored)'),
    'relatos locais precisam ser substituidos antes de confirmar a restauracao v2'
  );
  assert.ok(
    importBlock.includes("Platform.OS === 'android'") &&
      importBlock.includes('await getAffirmationAlarmCapability()') &&
      importBlock.indexOf('await cancelAffirmationAlarm()') <
        importBlock.indexOf('writerRef.current.enqueue') &&
      importBlock.includes("erro: 'alarm_cancel_failed'"),
    'importacao precisa confirmar o cancelamento do despertador Android antes de persistir o backup'
  );
  for (const resetField of [
    'reminderEnabled: false',
    'alarmSyncError: false',
    'wakeAffirmationId: null',
    "wakeAffirmationText: ''",
    'wakeNarratorId: null',
    'wakeSoundSource: null',
  ]) {
    assert.ok(
      importBlock.indexOf(resetField) >= 0 &&
        importBlock.indexOf(resetField) < importBlock.indexOf('writerRef.current.enqueue'),
      `backup importado nao pode restaurar agenda nativa: ${resetField}`
    );
  }

  assert.ok(chat.includes('try {') && chat.includes('catch (_error)'), 'criacao nao captura falha');
  assert.ok(chat.includes('retry-scene-creation'), 'criacao falha nao oferece nova tentativa');
  assert.ok(chat.includes('finalAnswersRef'), 'respostas finais nao sobrevivem a nova tentativa');
  assert.ok(chat.includes('AsyncStorage.removeItem(DRAFT_KEY)'), 'rascunho nao e removido depois do sucesso');
  assert.ok(chat.includes('DRAFT_READ_TIMEOUT_MS'), 'leitura do rascunho pode prender o quiz');
  assert.ok(chat.includes('if (!draftLoaded)'), 'quiz aceita resposta antes de restaurar o rascunho');
  assert.ok(
    chat.includes('draftInteractionRef.current') &&
      chat.includes('!draftInteractionRef.current') &&
      !chat.includes('!finished'),
    'rascunho atrasado deve ser aceito somente antes da primeira interacao'
  );

  assert.ok(welcome.includes('OPENING_FALLBACK_MS = 11000'), 'abertura ainda espera alem do video');
  assert.ok(welcome.includes('onPlaybackIssue={finishOpening}'), 'falha do video nao avanca a abertura');
  assert.ok(video.includes('reportPlaybackIssue'), 'player nao reporta autoplay ou midia bloqueada');
  const addManifestationBlock = context.slice(
    context.indexOf('const addManifestation'),
    context.indexOf('// Regra ÚNICA', context.indexOf('const addManifestation'))
  );
  assert.ok(
    addManifestationBlock.indexOf('setState((s) =>') <
      addManifestationBlock.indexOf('void generatePersonalizedScene({'),
    'cena remota ainda bloqueia a recompensa local do onboarding'
  );
  assert.ok(
    sceneClient.includes('API_TIMEOUT_MS = 56000'),
    'cliente precisa cobrir geracao e finalizacao sem bloquear a recompensa local'
  );
  assert.ok(deploy.includes('verificar-recuperacao-travamentos.js'), 'deploy ignora teste de travamento');

  console.log('Recuperacao aprovada: leitura segura, escrita serial, abertura e cena nunca ficam presas');
}

run().catch((error) => {
  console.error(`FALHOU: ${String(error).slice(0, 600)}`);
  process.exit(1);
});
