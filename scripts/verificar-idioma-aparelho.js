// O app segue o idioma do celular: português → 'pt'; qualquer outro → 'en'.
// No iPhone vale a lista AppleLanguages (Settings do RN) antes do Intl, que lá segue as
// localizações do app e abriu em inglês um iPhone em português (24/11/2026).
// Uso: node scripts/verificar-idioma-aparelho.js
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const i18nFile = path.join(root, 'constants', 'i18n.js');

let reactNative = null; // stub devolvido a cada require('react-native') do detectLang
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') {
    if (reactNative instanceof Error) throw reactNative;
    return reactNative;
  }
  return originalLoad.call(this, request, parent, isMain);
};
const originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = (loaded, filename) => {
  if (filename !== i18nFile) return originalLoader(loaded, filename);
  const code = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  loaded._compile(code, filename);
};
const { detectLang } = require(i18nFile);
Module._extensions['.js'] = originalLoader;

const realDateTimeFormat = Intl.DateTimeFormat;
function detect({ OS, Settings, intl = 'en-US', nav }) {
  reactNative = OS instanceof Error ? OS : { Platform: { OS }, Settings };
  Intl.DateTimeFormat = () => {
    if (intl instanceof Error) throw intl;
    return { resolvedOptions: () => ({ locale: intl }) };
  };
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  try {
    return detectLang();
  } finally {
    Intl.DateTimeFormat = realDateTimeFormat;
  }
}
const apple = (value) => ({
  get: (key) => {
    assert.strictEqual(key, 'AppleLanguages');
    if (value instanceof Error) throw value;
    return value;
  },
});

const cases = [
  ['iOS pt-BR primeiro vence o Intl em inglês', { OS: 'ios', Settings: apple(['pt-BR', 'en-US']) }, 'pt'],
  ['iOS en-US primeiro vence o Intl em português', { OS: 'ios', Settings: apple(['en-US', 'pt-BR']), intl: 'pt-BR' }, 'en'],
  ['iOS espanhol vira inglês', { OS: 'ios', Settings: apple(['es-ES', 'pt-BR']), intl: 'pt-BR' }, 'en'],
  ['iOS AppleLanguages como texto', { OS: 'ios', Settings: apple('pt-PT') }, 'pt'],
  ['iOS sem Settings cai no Intl', { OS: 'ios', Settings: undefined, intl: 'pt-BR' }, 'pt'],
  ['iOS sem AppleLanguages cai no Intl', { OS: 'ios', Settings: apple(null), intl: 'pt-BR' }, 'pt'],
  ['iOS lista vazia cai no Intl', { OS: 'ios', Settings: apple([]), intl: 'en-GB' }, 'en'],
  ['iOS com Settings quebrado cai no Intl', { OS: 'ios', Settings: apple(new Error('sem módulo')), intl: 'pt-BR' }, 'pt'],
  ['iOS sem Settings e Intl quebrado → en', { OS: 'ios', Settings: undefined, intl: new Error('sem Intl') }, 'en'],
  // No Android o Settings do RN só avisa "not supported"; se fosse lido, daria 'en' aqui.
  ['Android usa o Intl, nunca o Settings', { OS: 'android', Settings: apple(['en-US']), intl: 'pt-BR' }, 'pt'],
  ['Android em inglês', { OS: 'android', intl: 'en-US' }, 'en'],
  ['web pelo navigator.language', { OS: 'web', nav: { language: 'pt-BR' }, intl: 'en-US' }, 'pt'],
  ['web navigator em inglês vence Intl em português', { OS: 'web', nav: { language: 'en-US' }, intl: 'pt-BR' }, 'en'],
  ['web pelo navigator.languages', { OS: 'web', nav: { language: '', languages: ['pt-BR'] } }, 'pt'],
  ['web sem navigator → en', { OS: 'web', nav: undefined, intl: 'pt-BR' }, 'en'],
  ['sem react-native (erro) → en', { OS: new Error('sem react-native'), nav: { language: 'pt-BR' }, intl: 'pt-BR' }, 'en'],
];
for (const [name, input, expected] of cases) {
  assert.strictEqual(detect(input), expected, name);
}

// A API usada existe no React Native instalado (0.86): Settings.get lê o NSUserDefaults, onde
// fica a lista AppleLanguages do aparelho.
const rnSettings = path.join(root, 'node_modules', 'react-native', 'Libraries', 'Settings');
assert.match(fs.readFileSync(path.join(rnSettings, 'Settings.ios.js'), 'utf8'), /\bget\(key: string\)/);
assert.match(fs.readFileSync(path.join(rnSettings, 'RCTSettingsManager.mm'), 'utf8'), /dictionaryRepresentation/);

// Quem já escolheu o idioma no app continua com ele: o aparelho só decide quando não há escolha.
assert.ok(
  fs
    .readFileSync(path.join(root, 'context', 'AppContext.js'), 'utf8')
    .includes("if (st.lang !== 'pt' && st.lang !== 'en') st.lang = detectLang();"),
  'idioma salvo no app deixou de valer sobre o do aparelho'
);

process.stdout.write(`Idioma do aparelho aprovado (${cases.length} casos)\n`);
