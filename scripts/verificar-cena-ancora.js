const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const file = path.join(__dirname, '..', 'utils', 'dreamToAffirmation.js');
const source = fs.readFileSync(file, 'utf8');
const compiled = transformSync(source, {
  filename: file,
  presets: ['babel-preset-expo'],
  sourceType: 'module',
}).code;
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
loaded._compile(compiled, file);

const { dreamToAffirmation } = loaded.exports;
assert.strictEqual(typeof dreamToAffirmation, 'function');

const profile = {
  name: 'Ana',
  dreamLocation: 'Lisboa',
  dreamHome: 'Modern Loft',
  aboutYou: 'sou curiosa e persistente',
  obstacle: 'medo de come\u00e7ar',
  whyMatters: 'ter liberdade para cuidar da minha fam\u00edlia',
  people: [{ name: 'Bia' }],
};

const categories = ['Love', 'Wealth', 'Career', 'Health', 'Confidence', 'Peace'];
const steps = categories.map((category) => {
  const result = dreamToAffirmation('construir meu pr\u00f3prio neg\u00f3cio', profile, 'pt', category);
  assert.ok(result.story.includes('Lisboa'), `${category}: cidade nao entrou na cena`);
  assert.ok(result.story.includes('Bia'), `${category}: pessoa importante nao entrou na cena`);
  assert.ok(result.anchorIdentity.length > 20, `${category}: identidade vazia`);
  assert.ok(result.anchorStep.length > 20, `${category}: ponte vazia`);
  assert.ok(/\bSe\b.+\bentão vou\b/i.test(result.anchorStep), `${category}: plano se-entao ausente`);
  assert.ok(/medo.+começar/i.test(result.anchorStep), `${category}: plano nao preservou o obstaculo real`);
  assert.ok(!JSON.stringify(result).includes('undefined'), `${category}: texto corrompido`);
  return result.anchorStep;
});
assert.strictEqual(new Set(steps).size, categories.length, 'categorias devem produzir pontes distintas');

const pt = dreamToAffirmation('perder peso com sa\u00fade', {}, 'pt', 'Health');
assert.ok(!pt.affirmation.includes('tem perder'), 'frase verbal invalida em PT');
assert.ok(pt.anchorStep.includes('cuidado'), 'ponte de saude incorreta');
assert.ok(
  !/já sou a pessoa que tem|vindo na minha direção|já é seu/i.test(pt.affirmation),
  'afirmacao sem perfil nao pode prometer que o resultado ja existe'
);

const en = dreamToAffirmation('a peaceful home', { dreamLocation: 'Dublin' }, 'en', 'Peace');
assert.ok(en.story.includes('Dublin'), 'English scene did not use location');
assert.ok(en.anchorIdentity.startsWith('I '), 'English identity was not localized');
assert.ok(en.usouDoPerfil.includes('where you want to live'), 'English receipt did not localize location');
assert.ok(!en.usouDoPerfil.includes('onde quer morar'), 'English receipt leaked a Portuguese label');

const vague = dreamToAffirmation(
  'a calmer life',
  { dreamLocation: "I'm not sure yet" },
  'en',
  'Peace'
);
assert.ok(!vague.affirmation.includes("I'm not sure yet"), 'vague answer became a personal anchor');
assert.ok(!vague.story.includes("I'm not sure yet"), 'vague answer leaked into the story');
assert.ok(!vague.usouDoPerfil.includes('where you want to live'), 'vague answer entered the receipt');

const sameA = dreamToAffirmation('um trabalho criativo', profile, 'pt', 'Career');
const sameB = dreamToAffirmation('um trabalho criativo', profile, 'pt', 'Career');
assert.deepStrictEqual(sameA, sameB, 'a mesma entrada deve gerar a mesma Cena-Ancora');
assert.ok(sameA.usouDoPerfil.includes('onde quer morar'), 'recibo deve listar a cidade usada');
assert.ok(sameA.usouDoPerfil.includes('casa dos sonhos'), 'recibo deve listar a casa usada');
assert.ok(
  sameA.affirmation.includes('sou curiosa e persistente'),
  'afirmacao deve incorporar uma ancora pessoal segura'
);
assert.strictEqual(
  new Set(sameA.usouDoPerfil).size,
  sameA.usouDoPerfil.length,
  'recibo nao pode repetir um campo usado na historia e na afirmacao'
);

const sameDesireA = dreamToAffirmation(
  'uma vida mais leve',
  { aboutYou: 'sou criativa e aprendo fazendo' },
  'pt',
  'Peace'
);
const sameDesireB = dreamToAffirmation(
  'uma vida mais leve',
  { aboutYou: 'sou paciente e gosto de planejar' },
  'pt',
  'Peace'
);
assert.notStrictEqual(
  sameDesireA.affirmation,
  sameDesireB.affirmation,
  'o mesmo desejo com perfis diferentes precisa gerar afirmacoes diferentes'
);
assert.ok(
  sameDesireA.affirmation.includes('sou criativa e aprendo fazendo'),
  'perfil A precisa aparecer somente na propria afirmacao'
);
assert.ok(
  !sameDesireA.affirmation.includes('sou paciente e gosto de planejar'),
  'afirmacao A nao pode misturar o perfil B'
);
assert.ok(
  sameDesireB.affirmation.includes('sou paciente e gosto de planejar'),
  'perfil B precisa aparecer somente na propria afirmacao'
);
assert.ok(sameDesireA.affirmation.startsWith('Eu '), 'afirmacao pessoal PT deve estar em primeira pessoa');
assert.ok(!JSON.stringify([sameDesireA, sameDesireB]).includes('undefined'), 'perfil pessoal nao pode corromper texto');

// New Stella answers can personalize a scene by context. Demographics and the
// name of a person being manifested must never be echoed back into the result.
const neverRepeat = {
  age: 'IDADE_SENTINELA_731',
  gender: 'GENERO_SENTINELA_842',
  sexuality: 'SEXUALIDADE_SENTINELA_953',
  manifestingName: 'NOME_MANIFESTADO_SENTINELA_164',
};
const assertPrivateFieldsAbsent = (result, label) => {
  const serialized = JSON.stringify(result);
  Object.values(neverRepeat).forEach((privateValue) => {
    assert.ok(!serialized.includes(privateValue), `${label}: dado privado foi repetido na cena`);
  });
};

const career = dreamToAffirmation(
  'crescer na carreira',
  {
    work: 'arquitetura regenerativa',
    workFeeling: "I'm building something on the side",
    ...neverRepeat,
  },
  'pt',
  'Career'
);
assert.ok(career.affirmation.includes('arquitetura regenerativa'), 'Career: trabalho deve ancorar a afirmacao');
assert.ok(career.story.includes('arquitetura regenerativa'), 'Career: trabalho nao entrou na cena');
assert.ok(career.story.includes('construindo algo em paralelo'), 'Career: sentimento do trabalho nao entrou na cena');
assert.ok(career.usouDoPerfil.includes('seu trabalho'), 'Career: recibo nao registrou trabalho');
assertPrivateFieldsAbsent(career, 'Career');

const love = dreamToAffirmation(
  'viver um amor tranquilo',
  {
    relationshipStatus: 'Single',
    partnerDesire: 'seguranca, humor e parceria verdadeira',
    ...neverRepeat,
  },
  'pt',
  'Love'
);
assert.ok(
  love.affirmation.includes('seguranca, humor e parceria verdadeira'),
  'Love: parceria desejada deve ancorar a afirmacao'
);
assert.ok(love.story.includes('estar solteiro(a)'), 'Love: estado do relacionamento nao entrou na cena');
assert.ok(love.story.includes('seguranca, humor e parceria verdadeira'), 'Love: desejo de parceria nao entrou na cena');
assert.ok(love.usouDoPerfil.includes('o que busca no amor'), 'Love: recibo nao registrou contexto afetivo');
assertPrivateFieldsAbsent(love, 'Love');

const personal = dreamToAffirmation(
  'uma vida mais leve',
  {
    aboutYou: 'sou curiosa e persistente',
    pastInfluence: 'uma mudanca dificil me ensinou a recomecar',
    ...neverRepeat,
  },
  'pt',
  'Peace'
);
assert.ok(personal.story.includes('sou curiosa e persistente'), 'Perfil: descricao pessoal nao entrou na cena');
assert.ok(personal.story.includes('uma mudanca dificil me ensinou a recomecar'), 'Perfil: passado nao entrou na cena');
assert.ok(personal.usouDoPerfil.includes('como voc\u00ea se descreve'), 'Perfil: recibo nao registrou descricao pessoal');
assert.ok(
  personal.usouDoPerfil.includes('o que do passado ainda influencia'),
  'Perfil: recibo nao registrou influencia do passado'
);
assertPrivateFieldsAbsent(personal, 'Perfil');

const safeAffirmation = dreamToAffirmation(
  'crescer com serenidade',
  {
    aboutYou: 'sou consistente e cuidadosa',
    age: 'IDADE_NAO_USAR_411',
    gender: 'GENERO_NAO_USAR_522',
    sexuality: 'SEXUALIDADE_NAO_USAR_633',
    pastInfluence: 'PASSADO_NAO_USAR_744',
    obstacle: 'OBSTACULO_NAO_USAR_855',
    people: [{ name: 'TERCEIRO_NAO_USAR_966' }],
    kids: [{ name: 'FILHO_NAO_USAR_177' }],
  },
  'pt',
  'Confidence'
);
for (const unsafe of [
  'IDADE_NAO_USAR_411',
  'GENERO_NAO_USAR_522',
  'SEXUALIDADE_NAO_USAR_633',
  'PASSADO_NAO_USAR_744',
  'OBSTACULO_NAO_USAR_855',
  'TERCEIRO_NAO_USAR_966',
  'FILHO_NAO_USAR_177',
]) {
  assert.ok(!safeAffirmation.affirmation.includes(unsafe), `afirmacao repetiu campo sensivel: ${unsafe}`);
}
assert.ok(
  safeAffirmation.affirmation.includes('sou consistente e cuidadosa'),
  'afirmacao deve preferir descricao pessoal segura'
);
assert.ok(
  safeAffirmation.story.includes('ainda pode aparecer') &&
    !safeAffirmation.story.includes('não tem mais tamanho'),
  'contraste mental nao pode apagar ou minimizar o obstaculo'
);

const valueAnchored = dreamToAffirmation(
  'abrir meu próprio negócio',
  { whyMatters: 'ter liberdade para cuidar da minha família' },
  'pt',
  'Career'
);
assert.ok(
  valueAnchored.affirmation.includes('ter liberdade para cuidar da minha família'),
  'afirmacao deve usar o valor pessoal quando ele e a ancora disponivel'
);
assert.ok(
  valueAnchored.usouDoPerfil.includes('por que isso importa'),
  'recibo deve registrar o valor pessoal usado na afirmacao'
);

const thirdPartyInsideAnchor = dreamToAffirmation(
  'viver com mais calma',
  {
    aboutYou: 'sou dedicada a Marina e estou aprendendo a cuidar de mim',
    people: [{ name: 'Marina' }],
  },
  'pt',
  'Peace'
);
assert.ok(
  !thirdPartyInsideAnchor.affirmation.includes('Marina'),
  'nome de terceiro dentro de resposta livre nao pode entrar na afirmacao'
);
assert.ok(
  thirdPartyInsideAnchor.affirmation.includes('alguém importante'),
  'nome de terceiro deve virar referencia neutra na afirmacao'
);

const englishPersonal = dreamToAffirmation(
  'a calmer routine',
  { dreamLocation: 'Dublin' },
  'en',
  'Peace'
);
assert.ok(englishPersonal.affirmation.startsWith('I '), 'personal English affirmation must be first person');
assert.ok(englishPersonal.affirmation.includes('Dublin'), 'English affirmation must retain its personal anchor');

const oversized = dreamToAffirmation(
  'ter equilibrio',
  { aboutYou: `INICIO_SEGURO_${'x'.repeat(260)}_FIM_NAO_DEVE_ENTRAR`, ...neverRepeat },
  'pt',
  'Peace'
);
assert.ok(oversized.story.includes('inicio_seguro'), 'Perfil longo: inicio foi perdido');
assert.ok(!oversized.story.includes('fim_nao_deve_entrar'), 'Perfil longo: limite de seguranca nao foi aplicado');
assert.ok(oversized.affirmation.length <= 290, 'afirmacao pessoal precisa continuar concisa');
assert.ok(!oversized.affirmation.includes('fim_nao_deve_entrar'), 'afirmacao nao pode exceder o limite da ancora');
assertPrivateFieldsAbsent(oversized, 'Perfil longo');

const revealFile = path.join(__dirname, '..', 'screens', 'onboarding', 'RevealScreen.js');
const revealSource = fs.readFileSync(revealFile, 'utf8');
transformSync(revealSource, {
  filename: revealFile,
  presets: ['babel-preset-expo'],
  sourceType: 'module',
});
assert.ok(
  revealSource.includes('testID="missing-anchor-scene"') &&
    revealSource.includes("navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] })"),
  'deep link de cena inexistente nao pode ficar em branco'
);
assert.ok(
  !revealSource.includes('setTimeout(returnToWelcome, 0)'),
  'mensagem de cena inexistente precisa permanecer visivel ate a pessoa escolher voltar'
);

process.stdout.write(`Cena-Ancora: ${categories.length + 19} casos aprovados\n`);
