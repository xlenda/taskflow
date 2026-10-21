// Cenas prontas: quem ainda não tem imagem pessoal vê uma cena escolhida pelas respostas do onboarding
// (lugar dos sonhos × área do desejo). Prova o mapeamento das respostas e as 42 imagens empacotadas.
const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');

// Babel nos arquivos do projeto (inclusive imports aninhados). No Metro um .jpg vira id de asset;
// aqui vira o caminho do arquivo, para o teste provar qual imagem cada cena aponta.
function load(relative) {
  const originalJs = Module._extensions['.js'];
  Module._extensions['.js'] = (loaded, filename) => {
    if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
      originalJs(loaded, filename);
      return;
    }
    const code = transformSync(fs.readFileSync(filename, 'utf8'), {
      filename,
      presets: ['babel-preset-expo'],
      sourceType: 'module',
    }).code;
    loaded._compile(code, filename);
  };
  Module._extensions['.jpg'] = (loaded, filename) => {
    loaded.exports = filename;
  };
  try {
    return require(path.join(root, relative));
  } finally {
    Module._extensions['.js'] = originalJs;
    delete Module._extensions['.jpg'];
  }
}

function jpegSize(bytes) {
  for (let offset = 2; offset + 9 < bytes.length; offset += 2 + bytes.readUInt16BE(offset + 2)) {
    const marker = bytes[offset + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return [bytes.readUInt16BE(offset + 7), bytes.readUInt16BE(offset + 5)];
    }
  }
  return null;
}

const { placeFromDreamLocation, pickReadyScene } = load('utils/readyScene.js');
const { READY_SCENES, READY_SCENE_PLACES } = load('constants/readyScenes.js');

// Chips do onboarding (flow.js, dreamPlace) nos dois idiomas, mais texto livre.
const ANSWERS = {
  home: ['Onde moro hoje, mas do meu jeito', 'Where I live now, but better'],
  city: ['Em uma cidade grande', 'In a big city'],
  beach: [
    'Na praia ou no litoral', 'By the beach or coast', 'Uma casa perto do mar', 'Viajando pelo litoral',
    'Morar nas ilhas', 'Near quiet beaches',
  ],
  countryside: [
    'No campo ou nas montanhas', 'In the countryside or mountains', 'Uma casinha na serra',
    'Quero morar no interior', 'Perto dos campos', 'Entre fazendas', 'Interior de Minas',
  ],
  abroad: [
    'Em outro país', 'In another country', 'Em outros países', 'Morar fora', 'Morar no exterior', 'Exterior',
    'Quero morar fora do Brasil',
  ],
  traveling: ['Viajando, sem lugar fixo', 'Traveling with no fixed base'],
  // "interior"/"exterior" no meio da frase descrevem a casa: só contam como "no interior"/"no exterior"
  // ou abrindo a resposta. "Morar fora de São Paulo" é sair da cidade, não do país.
  neutral: [
    'Ainda não sei', "I'm not sure yet", 'Perto de quem eu amo', 'A home with a cozy interior',
    'Uma casa com área exterior', 'Quero morar fora de São Paulo', '', undefined, null,
  ],
};
for (const [place, answers] of Object.entries(ANSWERS)) {
  for (const answer of answers) {
    assert.strictEqual(placeFromDreamLocation(answer), place, `"${answer}" deveria virar ${place}`);
  }
}

const PLACES = ['home', 'city', 'beach', 'countryside', 'abroad', 'traveling', 'neutral'];
const CATEGORIES = ['Love', 'Wealth', 'Career', 'Health', 'Confidence', 'Peace'];
const sceneFile = (id) => path.join(root, 'assets', 'scenes', `${id}.jpg`);

const beachLove = pickReadyScene({ dreamLocation: 'Na praia ou no litoral', category: 'Love' });
assert.deepStrictEqual(beachLove, {
  id: 'beach-Love',
  source: sceneFile('beach-Love'),
  place: 'beach',
  category: 'Love',
});
for (const category of ['Personal', 'toString', '', undefined]) {
  assert.strictEqual(
    pickReadyScene({ dreamLocation: 'In a big city', category }).id,
    'city-Peace',
    `categoria fora das 6 (${category}) precisa cair em Peace`
  );
}
assert.strictEqual(pickReadyScene().id, 'neutral-Peace', 'sem respostas: cena neutra de paz');
assert.strictEqual(pickReadyScene(null).id, 'neutral-Peace', 'null conta como sem respostas');

assert.deepStrictEqual(READY_SCENE_PLACES, PLACES);
const constantsSource = fs.readFileSync(path.join(root, 'constants', 'readyScenes.js'), 'utf8');
for (const place of PLACES) {
  assert.strictEqual(Object.keys(READY_SCENES[place]).length, CATEGORIES.length, `${place}: 6 áreas`);
  for (const category of CATEGORIES) {
    const id = `${place}-${category}`;
    const file = sceneFile(id);
    assert.ok(fs.existsSync(file), `cena ausente: ${id}`);
    const bytes = fs.readFileSync(file);
    assert.ok(bytes.length <= 220 * 1024, `${id} passa de 220 KB (${bytes.length} bytes)`);
    assert.ok(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff, `${id} não é JPEG`);
    assert.deepStrictEqual(jpegSize(bytes), [720, 900], `${id} precisa ser 720x900 (4:5)`);
    // O Metro só empacota require com caminho literal.
    assert.ok(constantsSource.includes(`require('../assets/scenes/${id}.jpg')`), `${id} sem require estático`);
    assert.strictEqual(READY_SCENES[place][category], file, `${id} aponta para a imagem errada`);
  }
}

process.stdout.write('Cenas prontas: 42 cenas 720x900 e escolha por lugar dos sonhos e área aprovadas\n');
