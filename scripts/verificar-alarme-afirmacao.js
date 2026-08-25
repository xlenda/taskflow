const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const serviceFile = path.join(root, 'services', 'affirmationAlarm.js');
const appConfigFile = path.join(root, 'app.json');
const moduleRoot = path.join(root, 'modules', 'celeste-affirmation-alarm');
const moduleConfigFile = path.join(moduleRoot, 'expo-module.config.json');
const iosRoot = path.join(moduleRoot, 'ios');
const moduleSwiftFile = path.join(iosRoot, 'CelesteAffirmationAlarmModule.swift');
const coordinatorSwiftFile = path.join(iosRoot, 'AffirmationAlarmCoordinator.swift');
const soundWriterSwiftFile = path.join(iosRoot, 'SpeechSoundWriter.swift');
const podspecFile = path.join(iosRoot, 'CelesteAffirmationAlarm.podspec');

function loadService() {
  const source = fs.readFileSync(serviceFile, 'utf8');
  const compiled = transformSync(source, {
    filename: serviceFile,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  const loaded = new Module(serviceFile, module);
  loaded.filename = serviceFile;
  loaded.paths = Module._nodeModulePaths(path.dirname(serviceFile));
  const originalLoad = Module._load;
  Module._load = (request, parent, isMain) => {
    if (request === 'expo-modules-core') {
      return { requireOptionalNativeModule: () => null };
    }
    if (request === 'react-native') {
      return { NativeModules: {}, Platform: { OS: 'web', Version: undefined } };
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    loaded._compile(compiled, serviceFile);
  } finally {
    Module._load = originalLoad;
  }
  return loaded.exports;
}

async function main() {
  const service = loadService();

  const web = service.createAffirmationAlarmAdapter({
    platform: { OS: 'web' },
    getNativeModule: () => null,
  });
  const webCapability = await web.getCapability();
  assert.strictEqual(webCapability.supported, false);
  assert.strictEqual(webCapability.reason, 'web_unsupported');
  const webSchedule = await web.schedule({ time: '07:00', affirmation: 'I begin calmly.' });
  assert.deepStrictEqual(
    { ok: webSchedule.ok, scheduled: webSchedule.scheduled, reason: webSchedule.reason },
    { ok: false, scheduled: false, reason: 'web_unsupported' },
    'web must never claim that an alarm was scheduled'
  );

  const oldIOS = service.createAffirmationAlarmAdapter({
    platform: { OS: 'ios', Version: '25.4' },
    getNativeModule: () => null,
  });
  assert.strictEqual((await oldIOS.getCapability()).reason, 'ios_version_unsupported');

  const missingBridge = service.createAffirmationAlarmAdapter({
    platform: { OS: 'ios', Version: '26.0' },
    getNativeModule: () => null,
  });
  assert.strictEqual((await missingBridge.getCapability()).status, 'native_module_missing');

  const calls = [];
  let authorization = 'notDetermined';
  let scheduledAlarmIds = [];
  const nativeModule = {
    async getCapability() {
      return { supported: true, authorization, apiVersion: '1', scheduledAlarmIds };
    },
    async requestAuthorization() {
      calls.push(['requestAuthorization']);
      authorization = 'authorized';
      return { authorization };
    },
    async schedule(payload) {
      calls.push(['schedule', payload]);
      scheduledAlarmIds = [payload.alarmId];
      return {
        ok: true,
        alarmId: payload.alarmId,
        scheduledFor: '2026-08-25T07:00:00-03:00',
        soundFileName: 'celeste-affirmation.caf',
      };
    },
    async cancel(payload) {
      calls.push(['cancel', payload]);
      scheduledAlarmIds = scheduledAlarmIds.filter((alarmId) => alarmId !== payload.alarmId);
      return { ok: true, alarmId: payload.alarmId };
    },
    async test(payload) {
      calls.push(['test', payload]);
      return { ok: true, alarmId: payload.alarmId };
    },
  };
  const ios = service.createAffirmationAlarmAdapter({
    platform: { OS: 'ios', Version: 26 },
    getNativeModule: () => nativeModule,
  });

  const waiting = await ios.getCapability();
  assert.strictEqual(waiting.status, 'authorization_required');
  assert.strictEqual(waiting.canRequestAuthorization, true);
  assert.deepStrictEqual(waiting.scheduledAlarmIds, []);

  const scheduled = await ios.schedule({
    time: '06:30',
    weekdays: [5, 1, 3, 1],
    affirmation: '  I wake with calm and purpose.  ',
    locale: 'en-US',
  });
  assert.strictEqual(scheduled.ok, true);
  assert.strictEqual(scheduled.scheduled, true);
  assert.deepStrictEqual(calls[1][1].weekdays, [1, 3, 5]);
  assert.strictEqual(calls[1][1].hour, 6);
  assert.strictEqual(calls[1][1].affirmation, 'I wake with calm and purpose.');

  const invalid = await ios.schedule({ time: '25:10', affirmation: 'A valid phrase.' });
  assert.strictEqual(invalid.reason, 'invalid_time');
  assert.strictEqual(calls.filter(([name]) => name === 'schedule').length, 1);

  const cancelled = await ios.cancel(scheduled.alarmId);
  assert.deepStrictEqual(
    { ok: cancelled.ok, cancelled: cancelled.cancelled },
    { ok: true, cancelled: true }
  );

  const tested = await ios.test({ affirmation: 'I am awake.', delaySeconds: 30 });
  assert.strictEqual(tested.ok, true);
  assert.strictEqual(tested.test, true);

  const unconfirmedModule = { ...nativeModule, schedule: async () => undefined };
  const unconfirmed = service.createAffirmationAlarmAdapter({
    platform: { OS: 'ios', Version: 26 },
    getNativeModule: () => unconfirmedModule,
  });
  const unconfirmedResult = await unconfirmed.schedule({
    time: '07:00',
    affirmation: 'I begin calmly.',
  });
  assert.strictEqual(unconfirmedResult.ok, false);
  assert.strictEqual(unconfirmedResult.reason, 'native_result_unconfirmed');

  const removedBeforeFailureModule = {
    ...nativeModule,
    async schedule(payload) {
      return {
        ok: false,
        alarmId: payload.alarmId,
        reason: 'alarm_schedule_failed',
        scheduledAlarmIds: [],
      };
    },
  };
  const removedBeforeFailure = service.createAffirmationAlarmAdapter({
    platform: { OS: 'ios', Version: 26 },
    getNativeModule: () => removedBeforeFailureModule,
  });
  const failedReplacement = await removedBeforeFailure.schedule({
    time: '07:15',
    affirmation: 'I begin calmly.',
  });
  assert.strictEqual(failedReplacement.ok, false);
  assert.strictEqual(failedReplacement.reason, 'alarm_schedule_failed');
  assert.deepStrictEqual(
    failedReplacement.scheduledAlarmIds,
    [],
    'a UI precisa receber a verdade quando a troca removeu o alarme anterior'
  );

  const appConfig = JSON.parse(fs.readFileSync(appConfigFile, 'utf8'));
  assert.match(
    appConfig.expo.ios.infoPlist.NSAlarmKitUsageDescription,
    /\S/,
    'AlarmKit requires a non-empty usage description'
  );

  const moduleConfig = JSON.parse(fs.readFileSync(moduleConfigFile, 'utf8'));
  assert.deepStrictEqual(moduleConfig.platforms, ['apple']);
  assert.deepStrictEqual(moduleConfig.apple.modules, ['CelesteAffirmationAlarmModule']);
  assert.strictEqual(moduleConfig.apple.podspecPath, './ios/CelesteAffirmationAlarm.podspec');

  const moduleSwift = fs.readFileSync(moduleSwiftFile, 'utf8');
  for (const method of ['getCapability', 'requestAuthorization', 'schedule', 'cancel', 'test']) {
    assert.match(moduleSwift, new RegExp(`AsyncFunction\\(\"${method}\"\\)`));
  }
  assert.match(moduleSwift, /#if canImport\(AlarmKit\)/);
  assert.match(moduleSwift, /#available\(iOS 26\.0, \*\)/);

  const coordinatorSwift = fs.readFileSync(coordinatorSwiftFile, 'utf8');
  assert.match(coordinatorSwift, /AlarmManager\.shared/);
  assert.match(coordinatorSwift, /scheduledAlarmIds/);
  assert.match(coordinatorSwift, /Alarm\.Schedule\.relative/);
  assert.match(coordinatorSwift, /\.weekly\(weekdays\)/);
  assert.match(coordinatorSwift, /Alarm\.Schedule\.fixed/);
  assert.match(coordinatorSwift, /try await alarmManager\.schedule/);
  assert.match(coordinatorSwift, /try alarmManager\.cancel/);
  assert.match(coordinatorSwift, /result\["scheduledAlarmIds"\]/);
  assert.match(coordinatorSwift, /sound: \.named\(soundFileName\)/);
  assert.match(coordinatorSwift, /appendingPathComponent\("Sounds"/);
  assert.doesNotMatch(coordinatorSwift, /UNUserNotificationCenter|UNNotificationRequest/);

  const soundWriterSwift = fs.readFileSync(soundWriterSwiftFile, 'utf8');
  assert.match(soundWriterSwift, /AVSpeechSynthesizer\(\)/);
  assert.match(soundWriterSwift, /synthesizer\.write\(utterance\)/);
  assert.match(soundWriterSwift, /maximumDuration: TimeInterval = 29/);
  assert.match(soundWriterSwift, /kAudioFormatLinearPCM/);

  const podspec = fs.readFileSync(podspecFile, 'utf8');
  assert.match(podspec, /s\.dependency 'ExpoModulesCore'/);
  assert.match(podspec, /:ios => '15\.1'/);

  const serviceSource = fs.readFileSync(serviceFile, 'utf8');
  assert.match(serviceSource, /requireOptionalNativeModule/);
  assert.doesNotMatch(serviceSource, /setTimeout|UNUserNotificationCenter/);

  process.stdout.write('Alarme de afirmacao: contrato JS e scaffold iOS aprovados\n');
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
