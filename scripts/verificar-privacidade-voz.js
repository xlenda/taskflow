const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const file = path.join(__dirname, '..', 'utils', 'voicePicker.js');
const source = fs.readFileSync(file, 'utf8');
const affirmationsSource = fs.readFileSync(
  path.join(__dirname, '..', 'screens', 'AffirmationsScreen.js'),
  'utf8'
);
const compiled = transformSync(source, {
  filename: file,
  presets: ['babel-preset-expo'],
  sourceType: 'module',
}).code;
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
loaded._compile(compiled, file);

const { pickVoice, pickVoiceURI } = loaded.exports;
const remote = {
  name: 'Microsoft Antonio Online (Natural) - Portuguese (Brazil)',
  lang: 'pt-BR',
  voiceURI: 'remote-antonio',
  localService: false,
};
const local = {
  name: 'Ricardo',
  lang: 'pt-BR',
  voiceURI: 'local-ricardo',
  localService: true,
};

global.window = {
  speechSynthesis: {
    getVoices: () => [remote, local],
  },
};

assert.strictEqual(pickVoice('pt').voiceURI, remote.voiceURI, 'catalog may use the preferred system voice');
assert.strictEqual(
  pickVoice('pt', { localOnly: true }).voiceURI,
  local.voiceURI,
  'personal text must skip remote voices'
);
assert.strictEqual(pickVoiceURI('pt', { localOnly: true }), local.voiceURI);

window.speechSynthesis.getVoices = () => [remote];
assert.strictEqual(pickVoice('pt', { localOnly: true }), null, 'remote-only devices must use text fallback');
assert.strictEqual(pickVoiceURI('pt', { localOnly: true }), null);

// O picker seguro não basta se a tela esquecer de pedi-lo. Este portão prende
// o contrato no callsite que recebe o texto pessoal.
assert.match(
  affirmationsSource,
  /narrate\(currentPersonal\s*\?\s*null\s*:\s*current\.id/,
  'personal affirmations must never reuse a catalogue audio id'
);
assert.match(
  affirmationsSource,
  /localOnly:\s*currentPersonal/,
  'personal affirmations must request verified local speech'
);
assert.match(
  affirmationsSource,
  /lang:\s*currentPersonal\s*\?\s*current\.speechLang\s*\|\|\s*lang\s*:\s*lang/,
  'personal affirmations must keep the language in which the dream was created'
);

delete global.window;
process.stdout.write('Voice privacy: local-only selection approved\n');
