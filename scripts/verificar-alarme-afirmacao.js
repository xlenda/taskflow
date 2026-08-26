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
const neuralWriterSwiftFile = path.join(iosRoot, 'NeuralWavSoundWriter.swift');
const podspecFile = path.join(iosRoot, 'CelesteAffirmationAlarm.podspec');

function makePCM16WavBase64({ sampleRate = 24_000, frameCount = 240 } = {}) {
  const dataBytes = frameCount * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataBytes, 40);
  return wav.toString('base64');
}

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

  const serializedEvents = [];
  let releaseFirst;
  const firstOperation = new Promise((resolve) => { releaseFirst = resolve; });
  const serialized = service.createSerializedAlarmController({
    getCapability: async () => {
      serializedEvents.push('get');
      return { supported: true };
    },
    schedule: async () => {
      serializedEvents.push('schedule:start');
      await firstOperation;
      serializedEvents.push('schedule:end');
      return { ok: true };
    },
    cancel: async () => {
      serializedEvents.push('cancel');
      return { ok: true };
    },
    test: async () => ({ ok: true }),
  });
  const scheduling = serialized.schedule({});
  const cancelling = serialized.cancel();
  const inspecting = serialized.getCapability();
  await Promise.resolve();
  assert.deepStrictEqual(serializedEvents, ['schedule:start'], 'operacoes nativas iniciaram em paralelo');
  releaseFirst();
  await Promise.all([scheduling, cancelling, inspecting]);
  assert.deepStrictEqual(
    serializedEvents,
    ['schedule:start', 'schedule:end', 'cancel', 'get'],
    'a ultima intencao precisa vencer e a leitura deve observar a fila concluida'
  );

  let absentScheduleCalls = 0;
  const absent = service.createSerializedAlarmController({
    getCapability: async () => ({ supported: true, scheduledAlarmIds: [] }),
    schedule: async () => {
      absentScheduleCalls += 1;
      return { ok: true };
    },
    cancel: async () => ({ ok: true }),
    test: async () => ({ ok: true }),
  });
  const absentReplacement = await absent.replaceScheduled({
    time: '07:00',
    affirmation: 'I wake calmly.',
  });
  assert.strictEqual(absentReplacement.reason, 'alarm_not_scheduled');
  assert.strictEqual(absentScheduleCalls, 0, 'content sync recriou um alarme nativo ausente');

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
      return { supported: true, authorization, apiVersion: '2', scheduledAlarmIds };
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
        soundFileName: payload.audioBase64Wav
          ? 'celeste-affirmation.wav'
          : 'celeste-affirmation.caf',
        soundSource: payload.audioBase64Wav ? 'neural_wav' : 'local_speech',
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
  assert.strictEqual(scheduled.capability.nativeApiVersion, '2');
  assert.deepStrictEqual(calls[1][1].weekdays, [1, 3, 5]);
  assert.strictEqual(calls[1][1].hour, 6);
  assert.strictEqual(calls[1][1].affirmation, 'I wake with calm and purpose.');
  assert.strictEqual(calls[1][1].stopLabel, 'Stop', 'English alarm button must be localized');
  assert.strictEqual(calls[1][1].audioBase64Wav, undefined, 'fallback local deve omitir o WAV');
  assert.strictEqual(scheduled.soundSource, 'local_speech');

  const invalid = await ios.schedule({ time: '25:10', affirmation: 'A valid phrase.' });
  assert.strictEqual(invalid.reason, 'invalid_time');
  assert.strictEqual(calls.filter(([name]) => name === 'schedule').length, 1);

  for (const audioBase64Wav of [
    '',
    'data:audio/wav;base64,UklGRg==',
    Buffer.from('not a wave').toString('base64'),
    'UklGRg===',
  ]) {
    const rejectedAudio = await ios.schedule({
      time: '06:31',
      affirmation: 'A valid phrase.',
      audioBase64Wav,
    });
    assert.strictEqual(rejectedAudio.reason, 'invalid_audio_base64_wav');
  }
  assert.strictEqual(
    calls.filter(([name]) => name === 'schedule').length,
    1,
    'WAV neural invalido nunca deve atravessar a ponte nativa'
  );

  const oversizedAudio = await ios.schedule({
    time: '06:32',
    affirmation: 'A valid phrase.',
    audioBase64Wav: 'A'.repeat(service.AFFIRMATION_ALARM_MAX_WAV_BASE64_CHARS + 4),
  });
  assert.strictEqual(oversizedAudio.reason, 'audio_base64_wav_too_large');

  const neuralWav = makePCM16WavBase64();
  const neuralScheduled = await ios.schedule({
    time: '06:35',
    weekdays: [7, 1, 7],
    affirmation: 'I wake with my chosen voice.',
    audioBase64Wav: neuralWav,
  });
  assert.strictEqual(neuralScheduled.ok, true);
  assert.strictEqual(neuralScheduled.soundSource, 'neural_wav');
  assert.match(neuralScheduled.soundFileName, /\.wav$/);
  const neuralPayload = calls.filter(([name]) => name === 'schedule').at(-1)[1];
  assert.strictEqual(neuralPayload.audioBase64Wav, neuralWav);
  assert.deepStrictEqual(neuralPayload.weekdays, [1, 7]);

  let legacyScheduleCalls = 0;
  const legacyNativeModule = {
    ...nativeModule,
    async getCapability() {
      return { supported: true, authorization: 'authorized', apiVersion: '1' };
    },
    async schedule() {
      legacyScheduleCalls += 1;
      return { ok: true };
    },
  };
  const legacyIOS = service.createAffirmationAlarmAdapter({
    platform: { OS: 'ios', Version: 26 },
    getNativeModule: () => legacyNativeModule,
  });
  const unsupportedNeural = await legacyIOS.schedule({
    time: '06:40',
    affirmation: 'I wake with my chosen voice.',
    audioBase64Wav: neuralWav,
  });
  assert.strictEqual(unsupportedNeural.reason, 'neural_audio_unsupported');
  assert.strictEqual(legacyScheduleCalls, 0, 'bridge v1 nao pode degradar para fala local');

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
  assert.match(moduleSwift, /@Field var audioBase64Wav: String\?/);
  assert.match(moduleSwift, /"apiVersion": "2"/);

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
  assert.match(coordinatorSwift, /let localizedStopLabel = LocalizedStringResource/);
  assert.match(coordinatorSwift, /text: localizedStopLabel/);
  assert.match(coordinatorSwift, /appendingPathComponent\("Sounds"/);
  assert.match(coordinatorSwift, /if let audioBase64Wav/);
  assert.match(coordinatorSwift, /NeuralWavSoundWriter\.write/);
  assert.match(coordinatorSwift, /usesNeuralWav \? "wav" : "caf"/);
  assert.match(coordinatorSwift, /source: "neural_wav"/);
  assert.match(coordinatorSwift, /source: "local_speech"/);
  assert.match(coordinatorSwift, /"apiVersion": "2"/);
  assert.doesNotMatch(coordinatorSwift, /UNUserNotificationCenter|UNNotificationRequest/);

  const soundWriterSwift = fs.readFileSync(soundWriterSwiftFile, 'utf8');
  assert.match(soundWriterSwift, /AVSpeechSynthesizer\(\)/);
  assert.match(soundWriterSwift, /synthesizer\.write\(utterance\)/);
  assert.match(soundWriterSwift, /maximumDuration: TimeInterval = 29/);
  assert.match(soundWriterSwift, /kAudioFormatLinearPCM/);

  const neuralWriterSwift = fs.readFileSync(neuralWriterSwiftFile, 'utf8');
  assert.match(neuralWriterSwift, /maximumEncodedCharacters = 2_000_000/);
  assert.match(neuralWriterSwift, /maximumDecodedBytes = 1_500_000/);
  assert.match(neuralWriterSwift, /maximumDuration: TimeInterval = 29/);
  assert.match(neuralWriterSwift, /Data\(base64Encoded: base64Wav, options: \[\]\)/);
  assert.match(neuralWriterSwift, /ascii\(data, at: 0\) == "RIFF"/);
  assert.match(neuralWriterSwift, /ascii\(data, at: 8\) == "WAVE"/);
  assert.match(neuralWriterSwift, /audioFormat == 1/);
  assert.match(neuralWriterSwift, /bitsPerSample == 16/);
  assert.match(neuralWriterSwift, /wavData\.write\(to: destinationURL, options: \.atomic\)/);
  assert.match(neuralWriterSwift, /AVAudioFile\(forReading: destinationURL\)/);
  assert.match(neuralWriterSwift, /decodedDuration <= maximumDuration/);

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
