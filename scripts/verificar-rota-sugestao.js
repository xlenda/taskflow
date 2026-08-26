const assert = require('assert');
const fs = require('fs');
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

for (const file of ['App.js', 'screens/HomeScreen.js', 'screens/ManifestationScreen.js']) {
  compile(file);
}

assert.match(app, /Manifestation:\s*'m\/:id\??'/, 'rota deve transportar o id da manifestacao pessoal');
assert.match(
  app,
  /prefixes:\s*\[APP_URL,\s*'celeste:\/\/'\]/,
  'build instalado deve reconhecer deep links celeste://'
);

// A Home nao oferece nem abre catalogo. Toda entrada no detalhe carrega somente
// o id de uma manifestacao que ja existe no estado da propria pessoa.
for (const token of ['TRENDING', 'FOR_YOU', 'templateId']) {
  assert.doesNotMatch(home, new RegExp(`\\b${token}\\b`), `Home nao pode depender de ${token}`);
  assert.doesNotMatch(
    manifestation,
    new RegExp(`\\b${token}\\b`),
    `detalhe pessoal nao pode depender de ${token}`
  );
}
assert.doesNotMatch(manifestation, /findForYouById|localized\(/, 'detalhe nao pode resolver conteudo de catalogo');
assert.doesNotMatch(manifestation, /\baddManifestation\b/, 'detalhe nao pode criar sugestao pronta');
assert.match(
  manifestation,
  /const routeId = typeof route\.params\?\.id === 'string'[\s\S]*?state\.manifestations\.find\(\(m\) => m\.id === routeId\)/,
  'detalhe deve resolver somente um id pessoal salvo no estado'
);

const detailNavigations = home.match(/navigation\.navigate\('Manifestation',\s*\{[^}]*\}\)/g) || [];
assert.ok(
  detailNavigations.length >= 2,
  'Home deve abrir a manifestacao criada e cada manifestacao pessoal salva'
);
for (const call of detailNavigations) {
  assert.match(call, /\{\s*id(?:\s*[:,}])/, `navegacao sem id pessoal: ${call}`);
}
assert.match(
  home,
  /navigation\.navigate\('DailyRitual'\)/,
  'Home deve manter o Ritual como entrada diaria principal'
);

// O ref e gravado antes de qualquer await: dois toques no mesmo desejo nao
// conseguem abrir duas geracoes enquanto o consentimento ou o Gemini respondem.
const submitStart = home.indexOf('const submit = async () =>');
const addCall = home.indexOf('const id = await addManifestation');
const homeNavigate = home.indexOf("navigation.navigate('Manifestation', { id })", addCall);
assert.ok(submitStart >= 0 && addCall > submitStart && homeNavigate > addCall, 'fluxo pessoal da Home nao encontrado');
const submitBeforeAdd = home.slice(submitStart, addCall);
assert.match(
  submitBeforeAdd,
  /if \(!title \|\| generating \|\| sentRef\.current === title\) return;/,
  'Home deve bloquear desejo vazio, geracao ativa e segundo envio do mesmo texto'
);
assert.match(submitBeforeAdd, /sentRef\.current = title;/, 'Home deve travar o desejo antes da geracao assincrona');
assert.ok(
  home.slice(addCall, homeNavigate).includes('if (!id)'),
  'Home nao pode navegar quando uma geracao obsoleta retorna null'
);

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

// O unico estado navegavel e o item pessoal salvo. O id ocupa o segmento e
// sobrevive ao reload sem objeto, template ou query de catalogo.
const savedPath = getPathFromState(stateFor({ id: 'm-personal-regression' }), config);
assert.match(savedPath, /^\/m\/m-personal-regression$/);
assert.ok(!savedPath.includes('?'), 'rota pessoal nao deve carregar query de catalogo');
const savedReload = deepestRoute(getStateFromPath(savedPath, config));
assert.strictEqual(savedReload.params.id, 'm-personal-regression');
assert.strictEqual(Object.prototype.hasOwnProperty.call(savedReload.params, 'templateId'), false);

console.log('OK: Home e detalhe usam apenas manifestacoes pessoais salvas por id');
