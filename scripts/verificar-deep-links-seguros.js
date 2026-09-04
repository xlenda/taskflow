const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');
// Load the pure parser directly so this Node verifier does not initialize the
// React Native runtime. App.js imports the same public function from native.
const getStateFromPath = require('../node_modules/@react-navigation/core/lib/commonjs/getStateFromPath.js').default;

const root = path.resolve(__dirname, '..');
const utilityPath = path.join(root, 'utils', 'navigationPathSafety.js');
const compiled = transformSync(fs.readFileSync(utilityPath, 'utf8'), {
  filename: utilityPath,
  presets: ['babel-preset-expo'],
  sourceType: 'module',
}).code;
const loaded = new Module(utilityPath, module);
loaded.filename = utilityPath;
loaded.paths = Module._nodeModulePaths(path.dirname(utilityPath));
loaded._compile(compiled, utilityPath);

const {
  MAX_NAVIGATION_PATH_LENGTH,
  MAX_NAVIGATION_QUERY_PARTS,
  isSafeNavigationPath,
  safeNavigationStateFromPath,
} = loaded.exports;

assert.strictEqual(MAX_NAVIGATION_PATH_LENGTH, 2048);
assert.strictEqual(MAX_NAVIGATION_QUERY_PARTS, 32);
for (const malformed of [
  'm/%',
  'm/%E0%A4%A',
  `m/ok?bad=${'%80'.repeat(500)}`,
  `ritual?bad=${'%C0'.repeat(320)}`,
  `m/ok?bad=${'%'.repeat(500)}`,
  `m/ok?${Array(33).fill('x=1').join('&')}`,
  `m/${'a'.repeat(MAX_NAVIGATION_PATH_LENGTH)}`,
  'm/ok?value=%00hidden',
]) {
  assert.strictEqual(isSafeNavigationPath(malformed), false, `deep link perigoso aceito: ${malformed.slice(0, 40)}`);
  let parserCalls = 0;
  assert.strictEqual(
    safeNavigationStateFromPath(malformed, {}, () => {
      parserCalls += 1;
      throw new Error('parser nao deveria executar');
    }),
    undefined
  );
  assert.strictEqual(parserCalls, 0, 'entrada rejeitada chegou ao parser vulneravel');
}

const config = {
  screens: {
    Manifestation: 'm/:id?',
    Vision: 'visao/:visionId',
    Practice: 'pratica/:slotId',
  },
};
const valid = safeNavigationStateFromPath(
  'm/cena-segura?lang=pt&source=share',
  config,
  getStateFromPath
);
assert.strictEqual(valid.routes[0].name, 'Manifestation');
assert.strictEqual(valid.routes[0].params.id, 'cena-segura');
assert.strictEqual(valid.routes[0].params.lang, 'pt');

assert.strictEqual(
  safeNavigationStateFromPath('m/%', config, getStateFromPath),
  undefined,
  'excecao de decode nao pode escapar para a thread de UI'
);

const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
assert.ok(app.includes('safeNavigationStateFromPath(path, options, getNavigationStateFromPath)'));
assert.ok(app.includes('filter(url)') && app.includes('return isSafeNavigationPath(url)'));
assert.ok(app.includes("prefixes: [APP_URL, 'celeste://']"));

console.log('Deep links Celeste: tamanho, parametros e UTF-8 malformado bloqueados antes do parser.');
