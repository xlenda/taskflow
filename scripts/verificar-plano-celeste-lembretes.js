const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const serviceFile = path.join(root, 'services', 'practicePlanReminders.js');

function compile(file) {
  return transformSync(fs.readFileSync(file, 'utf8'), {
    filename: file,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
}

function loadService(platform) {
  const loaded = new Module(serviceFile, module);
  loaded.filename = serviceFile;
  loaded.paths = Module._nodeModulePaths(path.dirname(serviceFile));
  loaded.require = (request) => {
    if (request === 'react-native') return { Platform: { OS: platform } };
    return require(request);
  };
  loaded._compile(compile(serviceFile), serviceFile);
  return loaded.exports;
}

function notificationRequest(identifier, slotId, trigger = { type: 'daily', hour: 8, minute: 0 }) {
  return {
    identifier,
    content: {
      title: 'Celeste',
      body: 'Texto genérico',
      data: {
        kind: 'practice_plan',
        slotId,
        url: `celeste://pratica/${slotId}`,
      },
    },
    trigger,
  };
}

function baseMock(overrides = {}) {
  return {
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    AndroidImportance: { DEFAULT: 3 },
    SchedulableTriggerInputTypes: {
      DAILY: 'daily',
      WEEKLY: 'weekly',
      TIME_INTERVAL: 'timeInterval',
    },
    async getPermissionsAsync() {
      return { status: 'granted', granted: true };
    },
    async requestPermissionsAsync() {
      return { status: 'granted', granted: true };
    },
    async scheduleNotificationAsync() {
      return 'new-notification';
    },
    async getAllScheduledNotificationsAsync() {
      return [];
    },
    async cancelScheduledNotificationAsync() {},
    setNotificationHandler() {},
    async setNotificationChannelAsync() {},
    getLastNotificationResponse() {
      return null;
    },
    addNotificationResponseReceivedListener() {
      return { remove() {} };
    },
    ...overrides,
  };
}

async function verifyPermissionAndSchedules() {
  const service = loadService('ios');
  let requestCount = 0;
  let scheduleCount = 0;
  service._practicePlanRemindersTest.setApiForTests(
    baseMock({
      async getPermissionsAsync() {
        return { status: 'undetermined', granted: false, canAskAgain: true };
      },
      async requestPermissionsAsync() {
        requestCount += 1;
        return { status: 'granted', granted: true };
      },
      async scheduleNotificationAsync() {
        scheduleCount += 1;
        return `created-${scheduleCount}`;
      },
    })
  );

  const passive = await service.schedulePracticePlanReminders({
    slots: [{ slotId: 'manha', enabled: true, time: '08:15' }],
  });
  assert.deepStrictEqual(passive, {
    ok: false,
    error: 'permission_required',
    permission: 'undetermined',
  });
  assert.strictEqual(requestCount, 0, 'agendamento passivo não pode abrir prompt de permissão');
  assert.strictEqual(scheduleCount, 0, 'sem permissão não pode criar lembrete');

  const scheduled = [];
  service._practicePlanRemindersTest.setApiForTests(
    baseMock({
      async getPermissionsAsync() {
        return { status: 'undetermined', granted: false, canAskAgain: true };
      },
      async requestPermissionsAsync(options) {
        requestCount += 1;
        assert.strictEqual(options.ios.allowSound, false);
        return { status: 'granted', granted: true };
      },
      async scheduleNotificationAsync(request) {
        scheduled.push(request);
        return `plan-${scheduled.length}`;
      },
    })
  );

  const result = await service.schedulePracticePlanReminders({
    requestPermission: true,
    lang: 'pt',
    slots: [
      {
        slotId: 'manha',
        enabled: true,
        time: '08:15',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        affirmation: 'MINHA_AFIRMACAO_PRIVADA',
        vision: 'MEU_OBJETIVO_PRIVADO',
      },
      { slotId: 'foco-2', enabled: true, time: '14:05', weekdays: [5, 1, 3, 3] },
    ],
  });
  assert.deepStrictEqual(result, {
    ok: true,
    identifiersBySlot: {
      manha: ['plan-1'],
      'foco-2': ['plan-2', 'plan-3', 'plan-4'],
    },
    permission: 'granted',
  });
  assert.strictEqual(requestCount, 1, 'apenas a chamada explicitamente autorizada deve pedir permissão');
  assert.strictEqual(scheduled[0].trigger.type, 'daily');
  assert.strictEqual(scheduled[0].trigger.hour, 8);
  assert.strictEqual(scheduled[0].trigger.minute, 15);
  assert.deepStrictEqual(
    scheduled.slice(1).map((request) => request.trigger.weekday),
    [2, 4, 6],
    'dias ISO do plano precisam ser convertidos para os weekdays do Expo'
  );
  assert.ok(scheduled.slice(1).every((request) => request.trigger.type === 'weekly'));
  assert.ok(scheduled.every((request) => request.content.data.kind === 'practice_plan'));
  assert.ok(scheduled.every((request) => /^celeste:\/\/pratica\/[A-Za-z0-9_-]+$/.test(request.content.data.url)));
  const visibleContent = JSON.stringify(scheduled.map((request) => request.content));
  assert.ok(!visibleContent.includes('MINHA_AFIRMACAO_PRIVADA'));
  assert.ok(!visibleContent.includes('MEU_OBJETIVO_PRIVADO'));
}

async function verifyAndroidChannel() {
  const service = loadService('android');
  let handler;
  let channel;
  const scheduled = [];
  service._practicePlanRemindersTest.setApiForTests(
    baseMock({
      setNotificationHandler(value) {
        handler = value;
      },
      async setNotificationChannelAsync(id, value) {
        channel = { id, ...value };
      },
      async scheduleNotificationAsync(request) {
        scheduled.push(request);
        return 'android-plan';
      },
    })
  );
  assert.strictEqual(service.configurePracticePlanNotifications(), true);
  const foreground = await handler.handleNotification();
  assert.strictEqual(foreground.shouldPlaySound, false);
  const result = await service.schedulePracticePlanReminders({
    slots: [{ slotId: 'tarde', time: '16:40' }],
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(channel.id, 'celeste-practice-plan');
  assert.strictEqual(channel.sound, null);
  assert.strictEqual(channel.enableVibrate, false);
  assert.strictEqual(scheduled[0].trigger.channelId, 'celeste-practice-plan');
}

async function verifyScheduleRollback() {
  const service = loadService('ios');
  const cancelled = [];
  let scheduleCall = 0;
  service._practicePlanRemindersTest.setApiForTests(
    baseMock({
      async scheduleNotificationAsync() {
        scheduleCall += 1;
        if (scheduleCall === 2) throw new Error('second schedule failed');
        return 'new-first';
      },
      async cancelScheduledNotificationAsync(identifier) {
        cancelled.push(identifier);
      },
    })
  );
  const result = await service.schedulePracticePlanReminders({
    slots: [{ slotId: 'semana', time: '09:30', weekdays: [1, 3] }],
  });
  assert.deepStrictEqual(result, {
    ok: false,
    error: 'schedule_failed',
    permission: 'granted',
    identifiersBySlot: {},
  });
  assert.deepStrictEqual(cancelled, ['new-first'], 'falha parcial precisa remover tudo que acabou de criar');
}

async function verifyReplacementRollbackAndIsolation() {
  const service = loadService('ios');
  const cancelled = [];
  const scheduledItems = [
    notificationRequest('old-plan', 'manha'),
    {
      identifier: 'unrelated',
      content: { data: { kind: 'daily_ritual', url: 'celeste://ritual' } },
      trigger: { type: 'daily', hour: 7, minute: 0 },
    },
  ];
  service._practicePlanRemindersTest.setApiForTests(
    baseMock({
      async getAllScheduledNotificationsAsync() {
        return scheduledItems;
      },
      async scheduleNotificationAsync() {
        return 'replacement-plan';
      },
      async cancelScheduledNotificationAsync(identifier) {
        cancelled.push(identifier);
        if (identifier === 'old-plan') throw new Error('cancel old failed');
      },
    })
  );
  const result = await service.schedulePracticePlanReminders({
    slots: [{ slotId: 'manha', time: '08:45' }],
    previousIdentifiersBySlot: {
      manha: ['old-plan'],
      attacker: ['unrelated'],
    },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'previous_cancel_failed');
  assert.deepStrictEqual(
    cancelled,
    ['old-plan', 'replacement-plan'],
    'rollback deve remover o novo sem tocar em notificações alheias'
  );
  assert.ok(!cancelled.includes('unrelated'));

  const isolated = [];
  service._practicePlanRemindersTest.setApiForTests(
    baseMock({
      async getAllScheduledNotificationsAsync() {
        return [notificationRequest('plan-a', 'manha'), scheduledItems[1]];
      },
      async cancelScheduledNotificationAsync(identifier) {
        isolated.push(identifier);
      },
    })
  );
  const cancellation = await service.cancelPracticePlanReminders();
  assert.deepStrictEqual(cancellation, {
    ok: true,
    supported: true,
    cancelled: 1,
    identifiersBySlot: {},
  });
  assert.deepStrictEqual(isolated, ['plan-a'], 'cancelamento amplo deve continuar restrito ao plano');

  isolated.length = 0;
  const emptyFilter = await service.cancelPracticePlanReminders({});
  assert.strictEqual(emptyFilter.ok, true);
  assert.strictEqual(emptyFilter.cancelled, 0);
  assert.deepStrictEqual(isolated, [], 'filtro vazio não deve ser interpretado como cancelar tudo');
}

async function verifyPartialCancelRestoration() {
  const service = loadService('ios');
  const cancelled = [];
  const recreated = [];
  let newSchedules = 0;
  service._practicePlanRemindersTest.setApiForTests(
    baseMock({
      async getAllScheduledNotificationsAsync() {
        return [notificationRequest('old-a', 'manha'), notificationRequest('old-b', 'tarde')];
      },
      async scheduleNotificationAsync(request) {
        newSchedules += 1;
        if (newSchedules === 1) return 'replacement';
        recreated.push(request);
        return 'restored-old-a';
      },
      async cancelScheduledNotificationAsync(identifier) {
        cancelled.push(identifier);
        if (identifier === 'old-b') throw new Error('second old cancellation failed');
      },
    })
  );
  const result = await service.schedulePracticePlanReminders({
    slots: [{ slotId: 'manha', time: '10:30' }],
    previousIdentifiersBySlot: { manha: ['old-a'], tarde: ['old-b'] },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, 'previous_cancel_failed');
  assert.deepStrictEqual(cancelled, ['old-a', 'old-b', 'replacement']);
  assert.strictEqual(recreated.length, 1, 'lembrete antigo já removido precisa ser restaurado');
  assert.strictEqual(recreated[0].content.data.slotId, 'manha');
  assert.deepStrictEqual(result.restoredIdentifiersBySlot, { manha: ['restored-old-a'] });
}

async function verifyReconciliation() {
  const service = loadService('ios');
  service._practicePlanRemindersTest.setApiForTests(
    baseMock({
      async getAllScheduledNotificationsAsync() {
        return [
          notificationRequest('native-a', 'manha'),
          notificationRequest('native-b', 'manha', { type: 'weekly', weekday: 2, hour: 8, minute: 0 }),
          notificationRequest('native-c', 'tarde'),
          {
            identifier: 'injected',
            content: {
              data: {
                kind: 'practice_plan',
                slotId: 'manha',
                url: 'celeste://pratica/manha?redirect=https://attacker.invalid',
              },
            },
            trigger: { type: 'daily', hour: 8, minute: 0 },
          },
        ];
      },
    })
  );
  const status = await service.reconcilePracticePlanReminders({
    manha: ['native-a', 'missing-a'],
  });
  assert.strictEqual(status.ok, true);
  assert.strictEqual(status.permission, 'granted');
  assert.deepStrictEqual(status.identifiersBySlot, {
    manha: ['native-a', 'native-b'],
    tarde: ['native-c'],
  });
  assert.deepStrictEqual(status.missingIdentifiers, ['missing-a']);
  assert.deepStrictEqual(status.orphanIdentifiers, ['native-b', 'native-c']);
  assert.deepStrictEqual(status.statusBySlot.manha, {
    scheduled: true,
    count: 2,
    identifiers: ['native-a', 'native-b'],
  });
}

async function verifySnooze() {
  const service = loadService('ios');
  const scheduled = [];
  let permissionRequests = 0;
  service._practicePlanRemindersTest.setApiForTests(
    baseMock({
      async requestPermissionsAsync() {
        permissionRequests += 1;
        return { status: 'granted', granted: true };
      },
      async scheduleNotificationAsync(request) {
        scheduled.push(request);
        return 'snooze-once';
      },
    })
  );
  const result = await service.snoozePracticePlanReminder('manha');
  assert.deepStrictEqual(result, {
    ok: true,
    identifier: 'snooze-once',
    slotId: 'manha',
    minutes: 10,
    permission: 'granted',
  });
  assert.strictEqual(permissionRequests, 0);
  assert.strictEqual(scheduled[0].trigger.type, 'timeInterval');
  assert.strictEqual(scheduled[0].trigger.seconds, 600);
  assert.strictEqual(scheduled[0].trigger.repeats, false);
  assert.strictEqual(scheduled[0].content.data.kind, 'practice_plan');
  assert.strictEqual(scheduled[0].content.data.snooze, true);
  assert.strictEqual(scheduled[0].content.data.url, 'celeste://pratica/manha');
  assert.deepStrictEqual(
    await service.snoozePracticePlanReminder('manha', { minutes: 11 }),
    { ok: false, error: 'invalid_snooze' },
    'adiamento deve ser fixo e único por dez minutos'
  );
}

async function verifyDeepLinkAllowlist() {
  const service = loadService('ios');
  const hooks = service._practicePlanRemindersTest;
  const response = (data) => ({ notification: { request: { content: { data } } } });
  assert.strictEqual(
    hooks.responseUrl(
      response({ kind: 'practice_plan', slotId: 'foco-2', url: 'celeste://pratica/foco-2' })
    ),
    'celeste://pratica/foco-2'
  );
  for (const data of [
    { kind: 'practice_plan', slotId: 'foco-2', url: 'https://attacker.invalid' },
    { kind: 'practice_plan', slotId: 'foco-2', url: 'celeste://pratica/foco-2?next=evil' },
    { kind: 'practice_plan', slotId: 'foco-2', url: 'celeste://pratica/../segredo' },
    { kind: 'practice_plan', slotId: 'outro', url: 'celeste://pratica/foco-2' },
    { kind: 'daily_ritual', slotId: 'foco-2', url: 'celeste://pratica/foco-2' },
    { kind: 'practice_plan', slotId: 'foco-2', url: 'celeste://pratica/foco%2F2' },
  ]) {
    assert.strictEqual(hooks.responseUrl(response(data)), null, 'deep link injetado deve ser ignorado');
  }

  let cleared = 0;
  let callback;
  let removed = 0;
  service._practicePlanRemindersTest.setApiForTests(
    baseMock({
      getLastNotificationResponse() {
        return response({ kind: 'practice_plan', slotId: 'noite', url: 'celeste://pratica/noite' });
      },
      clearLastNotificationResponse() {
        cleared += 1;
      },
      addNotificationResponseReceivedListener(listener) {
        callback = listener;
        return { remove: () => { removed += 1; } };
      },
    })
  );
  assert.strictEqual(await service.initialPracticePlanNotificationUrl(), 'celeste://pratica/noite');
  assert.strictEqual(cleared, 1);
  const received = [];
  const unsubscribe = service.subscribePracticePlanNotificationUrls((url) => received.push(url));
  callback(response({ kind: 'practice_plan', slotId: 'x', url: 'https://attacker.invalid' }));
  callback(response({ kind: 'practice_plan', slotId: 'tarde', url: 'celeste://pratica/tarde' }));
  await Promise.resolve();
  assert.deepStrictEqual(received, ['celeste://pratica/tarde']);
  unsubscribe();
  assert.strictEqual(removed, 1);
}

async function verifyValidationAndWeb() {
  const native = loadService('ios');
  native._practicePlanRemindersTest.setApiForTests(baseMock());
  assert.strictEqual(
    (await native.schedulePracticePlanReminders({ slots: [] })).error,
    'invalid_slots'
  );
  assert.strictEqual(
    (
      await native.schedulePracticePlanReminders({
        slots: [1, 2, 3, 4, 5].map((number) => ({ slotId: `slot-${number}`, time: '10:00' })),
      })
    ).error,
    'invalid_slots'
  );
  assert.strictEqual(
    (
      await native.schedulePracticePlanReminders({
        slots: [{ slotId: 'slot', time: '10:00', weekdays: [0, 2] }],
      })
    ).error,
    'invalid_weekdays'
  );
  assert.strictEqual(
    (
      await native.schedulePracticePlanReminders({
        slots: [
          { slotId: 'slot', time: '10:00' },
          { slotId: 'slot', time: '11:00' },
        ],
      })
    ).error,
    'invalid_slot_id'
  );
  assert.strictEqual(native._practicePlanRemindersTest.isoWeekdayToExpo(1), 2);
  assert.strictEqual(native._practicePlanRemindersTest.isoWeekdayToExpo(7), 1);
  const weekdayRequests = native._practicePlanRemindersTest.scheduleRequestsForSlot(
    baseMock(),
    { slotId: 'dias', enabled: true, hour: 10, minute: 0, weekdays: [1, 7] },
    'pt'
  );
  assert.deepStrictEqual(
    weekdayRequests.map((entry) => entry.request.trigger.weekday),
    [2, 1],
    'segunda ISO 1 deve virar Expo 2 e domingo ISO 7 deve virar Expo 1'
  );

  const web = loadService('web');
  assert.deepStrictEqual(
    await web.schedulePracticePlanReminders({ slots: [{ slotId: 'manha', time: '08:00' }] }),
    { ok: false, error: 'unsupported', permission: 'unsupported' }
  );
  assert.deepStrictEqual(await web.requestPracticePlanNotificationPermission(), {
    ok: false,
    error: 'unsupported',
    permission: 'unsupported',
  });
  assert.deepStrictEqual(await web.cancelPracticePlanReminders(), {
    ok: true,
    supported: false,
    cancelled: 0,
    identifiersBySlot: {},
  });
  assert.deepStrictEqual(await web.reconcilePracticePlanReminders(), {
    ok: true,
    supported: false,
    permission: 'unsupported',
    identifiersBySlot: {},
    statusBySlot: {},
    missingIdentifiers: [],
    orphanIdentifiers: [],
  });
  assert.deepStrictEqual(await web.snoozePracticePlanReminder('manha'), {
    ok: false,
    error: 'unsupported',
    permission: 'unsupported',
  });
  assert.strictEqual(await web.initialPracticePlanNotificationUrl(), null);
}

async function main() {
  assert.ok(fs.existsSync(serviceFile), 'serviço de lembretes do plano ausente');
  await verifyPermissionAndSchedules();
  await verifyAndroidChannel();
  await verifyScheduleRollback();
  await verifyReplacementRollbackAndIsolation();
  await verifyPartialCancelRestoration();
  await verifyReconciliation();
  await verifySnooze();
  await verifyDeepLinkAllowlist();
  await verifyValidationAndWeb();
  process.stdout.write(
    'Plano Celeste: lembretes, privacidade, rollback, reconciliação, deep link e snooze aprovados\n'
  );
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
