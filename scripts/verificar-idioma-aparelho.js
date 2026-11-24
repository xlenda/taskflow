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
const { detectLang, resolveSavedLang } = require(i18nFile);
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

// Idioma salvo: vale se a pessoa escolheu, já entrou no app ou tem conteúdo; senão o celular
// decide de novo (a 1.0.1 gravou 'en' em iPhone em português antes de a pessoa terminar a entrada).
function saved(st) {
  reactNative = { Platform: { OS: 'ios' }, Settings: apple(['pt-BR']) };
  return resolveSavedLang(st);
}
const savedCases = [
  ['1.0.1 gravou en sem escolha nem entrada → celular pt', { lang: 'en', manifestations: [] }, 'pt'],
  ['escolheu en no app → en', { lang: 'en', langChosen: true }, 'en'],
  ['já entrou no app em en → en', { lang: 'en', onboardingDone: true }, 'en'],
  ['já tem conteúdo em en → en (não mistura línguas)', { lang: 'en', manifestations: [{ id: 'a' }] }, 'en'],
  ['langChosen texto não vale', { lang: 'en', langChosen: 'true' }, 'pt'],
  ['idioma salvo inválido → celular', { lang: 'es', langChosen: true }, 'pt'],
  ['sem estado → celular', null, 'pt'],
];
for (const [name, st, expected] of savedCases) {
  assert.strictEqual(saved(st), expected, name);
}

// O app usa essa regra no load (depois de normalizar onboardingDone), e escolher marca a escolha.
const ctx = fs.readFileSync(path.join(root, 'context', 'AppContext.js'), 'utf8');
const resolveAt = ctx.indexOf('st.lang = resolveSavedLang(st);');
const chosenAt = ctx.indexOf('st.langChosen = st.langChosen === true || st.onboardingDone === true;');
const doneAt = ctx.indexOf("st.onboardingDone = st.onboardingDone === true || st.onboardingDone === 'true';");
assert.ok(resolveAt > 0, 'load não usa resolveSavedLang');
assert.ok(chosenAt > 0 && chosenAt < resolveAt, 'terminar a entrada não fixa o idioma antes de resolver');
assert.ok(doneAt > 0 && doneAt < chosenAt, 'onboardingDone precisa ser normalizado antes do idioma');
assert.match(ctx, /lang: nextLang,\s*langChosen: true,/, 'setLang não marca a escolha');
assert.match(
  ctx,
  /if \(requestedLang === nextLang\) \{\s*\/\/[^\n]*\n\s*setState\(\(s\) => \(s\.langChosen \? s : \{ \.\.\.s, langChosen: true \}\)\);/,
  'confirmar o idioma que já aparece não marca a escolha'
);
assert.match(
  ctx,
  /lang: current\.lang,\s*langChosen: current\.langChosen === true \|\| current\.onboardingDone === true,/,
  'reset perde o idioma escolhido'
);

process.stdout.write(`Idioma do aparelho aprovado (${cases.length + savedCases.length} casos)\n`);
