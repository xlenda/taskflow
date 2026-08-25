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

async function keepsLateResetConsistent() {
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
  memory = 'reset-state';
  assert.strictEqual(await writer.waitFor(revision, 28), false, 'late reset should release the UI');
  assert.strictEqual(memory, 'reset-state', 'memory cannot keep data that a late reset may erase on disk');
  delayed.resolve();
  assert.strictEqual(await writer.waitFor(revision, 80), true, 'late reset never completed');
  assert.strictEqual(persisted, memory, 'late reset left memory and disk describing different states');
  writer.dispose();
}

async function run() {
  await serializesLateWrites();
  await retriesAfterRejection();
  await keepsLateResetConsistent();

  const context = read('context/AppContext.js');
  const app = read('App.js');
  const chat = read('screens/onboarding/ChatOnboardingScreen.js');
  const welcome = read('screens/onboarding/WelcomeScreen.js');
  const video = read('components/WelcomeVideo.js');
  const sceneClient = read('services/generatePersonalizedScene.js');
  const deploy = read('scripts/deploy-celeste.js');

  assert.ok(context.includes('createSerialStorageWriter'), 'AppContext nao usa fila serial');
  assert.ok(context.includes('storageLoadError'), 'falha de leitura continua invisivel');
  assert.ok(context.includes('hydratedRef.current'), 'gravacao nao esta bloqueada antes da leitura');
  assert.ok(context.includes('retryLoad'), 'leitura local nao oferece nova tentativa');
  assert.ok(!context.includes('await AsyncStorage.setItem'), 'gravacao bloqueante escapou da fila serial');
  assert.ok(context.includes('generationEpochRef'), 'geracoes antigas nao sao invalidadas');
  assert.ok(
    context.includes('if (generationEpoch !== generationEpochRef.current) return null'),
    'resposta Gemini antiga pode reaparecer depois de reset ou importacao'
  );
  assert.ok(
    (context.match(/generationEpochRef\.current \+= 1/g) || []).length >= 3,
    'reset, importacao e reinicio do onboarding devem invalidar geracoes em voo'
  );
  assert.ok(
    context.includes('AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS)'),
    'reset nao limpa rascunho, comunidade e convite locais'
  );
  const resetBlock = context.slice(context.indexOf('const resetAll'), context.indexOf('const setMood'));
  assert.ok(
    resetBlock.indexOf('AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS)') <
      resetBlock.indexOf('writerRef.current.enqueue'),
    'reset abre o onboarding antes de limpar os registros auxiliares antigos'
  );
  assert.ok(
    resetBlock.indexOf('setState(next)') < resetBlock.indexOf('await writerRef.current.waitFor'),
    'timeout do reset pode manter dados na memoria e apaga-los somente no reload'
  );
  assert.ok(
    resetBlock.includes('catch (_error)') && resetBlock.includes('return false'),
    'rejeicao da limpeza auxiliar escapa do reset sem mostrar falha de armazenamento'
  );
  assert.ok(
    resetBlock.includes('await writerRef.current.waitFor(revision'),
    'reset confirma sucesso antes da gravacao principal terminar'
  );
  assert.ok(app.includes('celeste-storage-recovery'), 'tela de recuperacao local ausente');
  assert.ok(app.includes('Nada foi apagado'), 'recuperacao nao protege a confianca da pessoa');

  assert.ok(chat.includes('try {') && chat.includes('catch (_error)'), 'criacao nao captura falha');
  assert.ok(chat.includes('retry-scene-creation'), 'criacao falha nao oferece nova tentativa');
  assert.ok(chat.includes('finalAnswersRef'), 'respostas finais nao sobrevivem a nova tentativa');
  assert.ok(chat.includes('AsyncStorage.removeItem(DRAFT_KEY)'), 'rascunho nao e removido depois do sucesso');
  assert.ok(chat.includes('DRAFT_READ_TIMEOUT_MS'), 'leitura do rascunho pode prender o quiz');
  assert.ok(chat.includes('if (!draftLoaded)'), 'quiz aceita resposta antes de restaurar o rascunho');
  assert.ok(chat.includes('alive &&') && chat.includes('!finished'), 'leitura atrasada pode sobrescrever respostas atuais');

  assert.ok(welcome.includes('OPENING_FALLBACK_MS = 11000'), 'abertura ainda espera alem do video');
  assert.ok(welcome.includes('onPlaybackIssue={finishOpening}'), 'falha do video nao avanca a abertura');
  assert.ok(video.includes('reportPlaybackIssue'), 'player nao reporta autoplay ou midia bloqueada');
  assert.ok(sceneClient.includes('API_TIMEOUT_MS = 15000'), 'Gemini ainda prende o onboarding por tempo demais');
  assert.ok(deploy.includes('verificar-recuperacao-travamentos.js'), 'deploy ignora teste de travamento');

  console.log('Recuperacao aprovada: leitura segura, escrita serial, abertura e cena nunca ficam presas');
}

run().catch((error) => {
  console.error(`FALHOU: ${String(error).slice(0, 600)}`);
  process.exit(1);
});
