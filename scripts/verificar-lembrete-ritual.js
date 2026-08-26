const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

function compile(file) {
  return transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
}

function loadService(platform) {
  const file = path.join(root, 'services', 'dailyRitualReminder.js');
  const loaded = new Module(file, module);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  loaded.require = (request) => {
    if (request === 'react-native') return { Platform: { OS: platform } };
    return require(request);
  };
  loaded._compile(compile(file), file);
  return loaded.exports;
}

async function main() {
  const service = loadService('ios');
  const scheduled = [];
  const cancelled = [];
  let handler = null;
  let permission = { status: 'undetermined', granted: false };
  const mock = {
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    SchedulableTriggerInputTypes: { DAILY: 'daily' },
    setNotificationHandler(value) { handler = value; },
    async getPermissionsAsync() { return permission; },
    async requestPermissionsAsync() {
      permission = { status: 'granted', granted: true };
      return permission;
    },
    async scheduleNotificationAsync(request) {
      scheduled.push(request);
      return `notification-${scheduled.length}`;
    },
    async getAllScheduledNotificationsAsync() {
      return scheduled.map((request, index) => ({ ...request, identifier: `notification-${index + 1}` }));
    },
    async cancelScheduledNotificationAsync(id) { cancelled.push(id); },
    getLastNotificationResponse() { return null; },
    addNotificationResponseReceivedListener() { return { remove() {} }; },
  };
  service._dailyRitualReminderTest.setApiForTests(mock);
  assert.strictEqual(service.configureDailyRitualNotifications(), true);
  assert.ok(handler && typeof handler.handleNotification === 'function');

  const result = await service.scheduleDailyRitualReminder({
    time: '20:30',
    previousId: 'old-reminder',
    lang: 'pt',
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.identifier, 'notification-1');
  assert.deepStrictEqual(cancelled, ['old-reminder'], 'lembrete antigo deve sair somente depois do novo');
  assert.strictEqual(scheduled[0].trigger.type, 'daily');
  assert.strictEqual(scheduled[0].trigger.hour, 20);
  assert.strictEqual(scheduled[0].trigger.minute, 30);
  assert.strictEqual(scheduled[0].content.data.url, 'celeste://ritual');
  assert.deepStrictEqual(
    await service.getDailyRitualReminderStatus('notification-1'),
    { ok: true, supported: true, scheduled: true, permission: 'granted' },
    'tela precisa reconciliar o lembrete salvo com o sistema'
  );
  const visibleNotification = JSON.stringify(scheduled[0].content);
  for (const privateText of ['MEU_DESEJO_PRIVADO', 'MEU_SONHO_PRIVADO', 'MINHA_AFIRMACAO_PRIVADA']) {
    assert.ok(!visibleNotification.includes(privateText), 'notificacao bloqueada nunca pode expor texto pessoal');
  }

  const deniedMock = {
    ...mock,
    async getPermissionsAsync() { return { status: 'denied', granted: false }; },
    async requestPermissionsAsync() { return { status: 'denied', granted: false }; },
    async scheduleNotificationAsync() { throw new Error('nao deveria agendar'); },
  };
  service._dailyRitualReminderTest.setApiForTests(deniedMock);
  const denied = await service.scheduleDailyRitualReminder({ time: '08:00', lang: 'pt' });
  assert.deepStrictEqual(denied, { ok: false, error: 'permission_denied' });
  assert.deepStrictEqual(
    await service.getDailyRitualReminderStatus('notification-1'),
    { ok: true, supported: true, scheduled: false, permission: 'denied' },
    'permissao revogada fora do app precisa desligar o controle visual'
  );
  assert.strictEqual(service._dailyRitualReminderTest.parseTime('25:00'), null);
  assert.strictEqual(
    service._dailyRitualReminderTest.responseUrl({
      notification: { request: { content: { data: { url: 'https://attacker.invalid' } } } },
    }),
    null,
    'notificacao nao pode abrir URL arbitraria'
  );

  const rollbackCancelled = [];
  const cancelFailureMock = {
    ...mock,
    async getPermissionsAsync() { return { status: 'granted', granted: true }; },
    async scheduleNotificationAsync() { return 'replacement-reminder'; },
    async cancelScheduledNotificationAsync(id) {
      rollbackCancelled.push(id);
      if (id === 'old-reminder') throw new Error('cancel failed');
    },
  };
  service._dailyRitualReminderTest.setApiForTests(cancelFailureMock);
  const rolledBack = await service.scheduleDailyRitualReminder({
    time: '12:30',
    previousId: 'old-reminder',
    lang: 'pt',
  });
  assert.deepStrictEqual(rolledBack, { ok: false, error: 'previous_cancel_failed' });
  assert.deepStrictEqual(
    rollbackCancelled,
    ['old-reminder', 'replacement-reminder'],
    'falha ao remover o antigo precisa desfazer o novo lembrete'
  );

  let clearedResponse = 0;
  service._dailyRitualReminderTest.setApiForTests({
    ...mock,
    getLastNotificationResponse() {
      return { notification: { request: { content: { data: { url: 'celeste://ritual' } } } } };
    },
    clearLastNotificationResponse() { clearedResponse += 1; },
  });
  assert.strictEqual(await service.initialDailyRitualNotificationUrl(), 'celeste://ritual');
  assert.strictEqual(clearedResponse, 1, 'resposta consumida nao pode reabrir o ritual no proximo mount');

  const web = loadService('web');
  const unsupported = await web.scheduleDailyRitualReminder({ time: '20:30', lang: 'pt' });
  assert.deepStrictEqual(unsupported, { ok: false, error: 'unsupported' });
  assert.deepStrictEqual(
    await web.cancelDailyRitualReminder(null),
    { ok: true },
    'runtime sem modulo nao deve bloquear reset quando nenhum lembrete existe'
  );

  for (const relative of ['screens/DailyRitualScreen.js', 'screens/JourneyScreen.js', 'App.js']) {
    compile(path.join(root, relative));
  }
  const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
  const screen = fs.readFileSync(path.join(root, 'screens', 'DailyRitualScreen.js'), 'utf8');
  const journey = fs.readFileSync(path.join(root, 'screens', 'JourneyScreen.js'), 'utf8');
  const context = fs.readFileSync(path.join(root, 'context', 'AppContext.js'), 'utf8');
  const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.ok(app.includes('initialDailyRitualNotificationUrl'), 'cold start da notificacao precisa abrir o ritual');
  assert.ok(app.includes('subscribeDailyRitualNotificationUrls'), 'toque com app aberto precisa abrir o ritual');
  assert.ok(screen.includes('daily-ritual-reminder-toggle'), 'permissao deve nascer de um gesto explicito');
  assert.ok(screen.includes('getDailyRitualReminderStatus'), 'estado visual precisa acompanhar a permissao nativa');
  assert.ok(screen.includes("Platform.OS === 'web'"), 'site precisa falhar de forma honesta');
  assert.ok(screen.includes('navigation.canGoBack?.()'), 'deep link frio precisa de saida para a Home');
  assert.ok(journey.includes('cancelDailyRitualReminder'), 'reset nao pode deixar lembrete orfao');
  assert.ok(
    context.includes('reminderEnabled: false') &&
      context.includes("permission: 'unknown'") &&
      context.includes('await cancelDailyRitualReminder('),
    'backup nao pode reativar nem deixar a permissao nativa orfa'
  );
  assert.ok(appConfig.expo.plugins.includes('expo-notifications'), 'config plugin nativo ausente');

  process.stdout.write('Lembrete do Ritual: permissao, privacidade e deep link aprovados\n');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
