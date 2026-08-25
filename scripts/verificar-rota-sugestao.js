const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const compile = (file) =>
  transformSync(read(file), {
    filename: path.join(root, file),
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  });

const app = read('App.js');
const home = read('screens/HomeScreen.js');
const manifestation = read('screens/ManifestationScreen.js');

for (const file of ['App.js', 'constants/content.js', 'screens/HomeScreen.js', 'screens/ManifestationScreen.js']) {
  compile(file);
}

assert.match(app, /Manifestation:\s*'m\/:id\?'/, 'rota de sugestao deve aceitar ausencia de id salvo');
assert.match(
  home,
  /navigate\('Manifestation',\s*\{\s*templateId:\s*card\.id\s*\}\)/,
  'Home deve enviar somente o templateId escalar'
);
assert.doesNotMatch(home, /\{\s*template:\s*card\s*\}/, 'Home nao pode serializar o objeto inteiro na URL');
assert.match(
  manifestation,
  /findForYouById\(routeTemplateId\)/,
  'destino deve validar o templateId no catalogo FOR_YOU'
);
assert.match(
  manifestation,
  /setParams\(templateId\s*\?\s*\{\s*id,\s*templateId\s*\}/,
  'salvar deve preservar templateId ao acrescentar o id pessoal'
);

const addCall = home.indexOf('const id = await addManifestation');
const homeNavigate = home.indexOf("navigation.navigate('Manifestation', { id })", addCall);
assert.ok(addCall >= 0 && homeNavigate > addCall, 'fluxo de criacao da Home nao encontrado');
assert.ok(
  home.slice(addCall, homeNavigate).includes('if (!id)'),
  'Home nao pode navegar quando uma geracao obsoleta retorna null'
);
assert.match(
  manifestation,
  /const id = await addManifestation\([\s\S]*?if \(!id\) return;\s*openSaved\(id\)/,
  'sugestao nao pode abrir uma manifestacao quando a criacao retorna null'
);

// Carrega a funcao real do catalogo com Babel, sem envolver React Native.
const originalLoader = Module._extensions['.js'];
Module._extensions['.js'] = (module, filename) => {
  const isProjectFile = filename.startsWith(`${root}${path.sep}`) && !filename.includes(`${path.sep}node_modules${path.sep}`);
  if (!isProjectFile) return originalLoader(module, filename);
  const output = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  module._compile(output, filename);
};

let findForYouById;
try {
  ({ findForYouById } = require('../constants/content'));
} finally {
  Module._extensions['.js'] = originalLoader;
}

assert.strictEqual(findForYouById('fy-1').id, 'fy-1');
assert.strictEqual(findForYouById('[object Object]'), null, 'objeto serializado nao pode virar sugestao');
assert.strictEqual(findForYouById({ id: 'fy-1' }), null, 'somente id escalar pode resolver sugestao');
assert.strictEqual(findForYouById('fy-inexistente'), null, 'id fora do FOR_YOU deve ser rejeitado');

const getPathFromState = require('../node_modules/@react-navigation/core/lib/commonjs/getPathFromState.js').default;
const getStateFromPath = require('../node_modules/@react-navigation/core/lib/commonjs/getStateFromPath.js').default;
const config = {
  screens: {
    Main: {
      screens: {
        Manifest: {
          screens: {
            HomeMain: '',
            Manifestation: 'm/:id?',
          },
        },
      },
    },
  },
};

const stateFor = (params) => ({
  routes: [
    {
      name: 'Main',
      state: {
        routes: [
          {
            name: 'Manifest',
            state: { routes: [{ name: 'Manifestation', params }] },
          },
        ],
      },
    },
  ],
});

const deepestRoute = (state) => {
  let current = state;
  let route = null;
  while (current && Array.isArray(current.routes) && current.routes.length) {
    route = current.routes[typeof current.index === 'number' ? current.index : current.routes.length - 1];
    current = route.state;
  }
  return route;
};

// Regressao original: abrir card gerava /m/undefined?template=[object Object]
// e F5 perdia a sugestao. Agora a URL contem apenas fy-1 e o parser recupera o
// mesmo item do catalogo ao reconstruir o estado de navegacao.
const suggestionPath = getPathFromState(stateFor({ templateId: 'fy-1' }), config);
assert.ok(!suggestionPath.includes('undefined'));
assert.ok(!suggestionPath.includes('%5Bobject') && !suggestionPath.includes('[object'));
assert.match(suggestionPath, /^\/m\/?\?templateId=fy-1$/);
const suggestionReload = deepestRoute(getStateFromPath(suggestionPath, config));
assert.strictEqual(suggestionReload.params.id, undefined);
assert.strictEqual(suggestionReload.params.templateId, 'fy-1');
assert.strictEqual(findForYouById(suggestionReload.params.templateId).id, 'fy-1');

// Depois de comecar, o id pessoal ocupa o segmento e a origem do audio fica na
// query. Um novo reload precisa recuperar os dois valores.
const savedPath = getPathFromState(stateFor({ id: 'm-route-regression', templateId: 'fy-1' }), config);
assert.match(savedPath, /^\/m\/m-route-regression\?templateId=fy-1$/);
const savedReload = deepestRoute(getStateFromPath(savedPath, config));
assert.strictEqual(savedReload.params.id, 'm-route-regression');
assert.strictEqual(savedReload.params.templateId, 'fy-1');

console.log('OK: sugestao usa templateId escalar e sobrevive a URL, salvamento e reload');
