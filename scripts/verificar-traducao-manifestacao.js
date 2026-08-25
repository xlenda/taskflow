const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const originalLoader = Module._extensions['.js'];

Module._extensions['.js'] = function compileProjectModule(mod, filename) {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
    return originalLoader(mod, filename);
  }
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = transformSync(source, {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  mod._compile(compiled, filename);
};

let localizeManifestation;
let applyTranslatedManifestationVariant;
let manifestationVariantFromScene;
let shouldTranslateManifestationVariant;
let findForYouById;
let localized;
try {
  ({
    localizeManifestation,
    applyTranslatedManifestationVariant,
    manifestationVariantFromScene,
    shouldTranslateManifestationVariant,
  } = require(path.join(root, 'utils', 'manifestationLanguage.js')));
  ({ findForYouById, localized } = require(path.join(root, 'constants', 'content.js')));
} finally {
  Module._extensions['.js'] = originalLoader;
}

assert.strictEqual(typeof localizeManifestation, 'function');

const profile = {
  name: 'Ana',
  aboutYou: 'criativa e persistente',
  obstacle: 'medo de comecar',
  whyMatters: 'ter liberdade para cuidar de mim',
  dreamLocation: 'Lisboa',
};

const personalPt = {
  id: 'm-personal',
  title: 'morar perto do mar',
  category: 'Peace',
  lang: 'pt',
  intention: 'Viver perto do mar como algo normal.',
  affirmation: 'Eu escolho construir uma vida perto do mar com calma.',
  story: 'E de manha e eu caminho perto do mar com tranquilidade.',
  anchorIdentity: 'Eu protejo minha atencao e escolho o que merece entrar no meu dia.',
  anchorStep: 'Quando o medo de comecar aparecer, entao vou respirar por dois minutos.',
  personalizedWith: ['onde quer morar'],
  generation: { source: 'gemini', model: 'test-model', promptVersion: 'test-v1' },
  sessions: [],
};

const preparedPt = localizeManifestation(personalPt, profile, 'pt');
assert.strictEqual(preparedPt.originLang, 'pt', 'idioma original nao foi marcado');
assert.ok(preparedPt.contentByLang.pt, 'variante PT nao foi salva');
assert.ok(preparedPt.contentByLang.en, 'variante EN nao foi criada');
assert.strictEqual(preparedPt.affirmation, personalPt.affirmation, 'conteudo original PT foi alterado');
assert.strictEqual(preparedPt.title, personalPt.title, 'texto livre do titulo foi alterado');

const translatedEn = localizeManifestation(preparedPt, profile, 'en');
assert.strictEqual(translatedEn.lang, 'en');
assert.strictEqual(translatedEn.title, personalPt.title, 'titulo livre nao deve ser traduzido ou perdido');
assert.notStrictEqual(translatedEn.story, personalPt.story, 'historia continuou congelada em PT');
assert.match(translatedEn.story, /\b(you|your)\b/i, 'historia EN nao usa linguagem inglesa');
assert.match(translatedEn.affirmation, /\b(I|my)\b/i, 'afirmacao EN nao usa primeira pessoa em ingles');
assert.match(translatedEn.anchorIdentity, /\b(I|my)\b/i, 'identidade EN nao foi localizada');
assert.match(translatedEn.anchorStep, /\b(if|when|take|choose|spend)\b/i, 'ponte EN nao foi localizada');
const generatedEn = [
  translatedEn.intention,
  translatedEn.affirmation,
  translatedEn.story,
  translatedEn.anchorIdentity,
  translatedEn.anchorStep,
].join(' ');
assert.doesNotMatch(
  generatedEn,
  /\b(viver|voce|você|eu|meu|minha|perto|medo|comecar|começar|liberdade|cuidar|criativa|persistente)\b/i,
  'fallback EN misturou respostas em portugues'
);
assert.strictEqual(
  translatedEn.generation.source,
  'local-language-fallback',
  'fallback local nao foi identificado para posterior traducao privada'
);

const editedEn = { ...translatedEn, affirmation: 'I edited this affirmation in English.' };
const backToPt = localizeManifestation(editedEn, profile, 'pt');
assert.strictEqual(backToPt.affirmation, personalPt.affirmation, 'voltar ao PT nao restaurou o original');
const enAgain = localizeManifestation(backToPt, profile, 'en');
assert.strictEqual(enAgain.affirmation, editedEn.affirmation, 'edicao EN foi perdida ao alternar idioma');

const partialEn = {
  ...preparedPt,
  contentByLang: {
    ...preparedPt.contentByLang,
    en: { affirmation: 'I keep this partial English edit.' },
  },
};
const repairedPartial = localizeManifestation(partialEn, profile, 'en');
assert.strictEqual(
  repairedPartial.affirmation,
  'I keep this partial English edit.',
  'variante parcial perdeu a edicao existente'
);
assert.ok(repairedPartial.anchorStep, 'variante parcial nao recebeu somente o campo ausente');
assert.strictEqual(
  repairedPartial.generation.source,
  'user-edited',
  'variante parcial importada sem metadados nao foi protegida como edicao'
);
assert.strictEqual(
  shouldTranslateManifestationVariant(repairedPartial, 'en'),
  false,
  'traducao remota substituiria uma edicao parcial importada'
);

const exactRemoteEn = manifestationVariantFromScene({
  title: 'Living near the sea',
  scene: {
    intention: 'Live near the sea with calm and consistency.',
    affirmation: 'I choose a calm life near the sea while honoring my creative nature.',
    story: 'In the blue mug beside the window, tea is still warm while you watch the morning light over the sea.',
    anchorIdentity: 'I protect my attention and make room for what matters.',
    anchorStep: 'When fear of starting appears, then I will breathe for two minutes.',
    personalizedWith: ['where you want to live'],
  },
  generation: { source: 'gemini-translation', model: 'test-model', promptVersion: 'celeste-translation-v1' },
});
const withExactRemote = applyTranslatedManifestationVariant(translatedEn, {
  sourceLang: 'pt',
  targetLang: 'en',
  sourceVariant: translatedEn.contentByLang.pt,
  expectedTargetVariant: translatedEn.contentByLang.en,
  translatedVariant: exactRemoteEn,
});
assert.strictEqual(withExactRemote.story, exactRemoteEn.story, 'traducao remota exata nao foi aplicada');
assert.match(withExactRemote.story, /blue mug/i, 'detalhe unico da cena original foi perdido');
assert.strictEqual(withExactRemote.contentByLang.pt.story, personalPt.story, 'traducao apagou a origem PT');
assert.strictEqual(
  shouldTranslateManifestationVariant(withExactRemote, 'pt'),
  false,
  'voltar ao idioma original tentaria retraduzir e apagar a origem'
);
assert.strictEqual(
  localizeManifestation(withExactRemote, profile, 'pt').story,
  personalPt.story,
  'voltar ao idioma original nao restaurou a cena exata'
);

const protectedEdit = {
  ...translatedEn,
  generation: { source: 'user-edited', promptVersion: 'user-edit-v1' },
  contentByLang: {
    ...translatedEn.contentByLang,
    en: {
      ...translatedEn.contentByLang.en,
      affirmation: 'I wrote and protected this sentence myself.',
      generation: { source: 'user-edited', promptVersion: 'user-edit-v1' },
    },
  },
};
assert.strictEqual(
  shouldTranslateManifestationVariant(protectedEdit, 'en'),
  false,
  'edicao da pessoa seria substituida por uma traducao posterior'
);

const editedWhileTranslating = { ...translatedEn, story: `${translatedEn.story} My live edit.` };
assert.strictEqual(
  applyTranslatedManifestationVariant(editedWhileTranslating, {
    sourceLang: 'pt',
    targetLang: 'en',
    sourceVariant: translatedEn.contentByLang.pt,
    expectedTargetVariant: translatedEn.contentByLang.en,
    translatedVariant: exactRemoteEn,
  }),
  editedWhileTranslating,
  'resposta tardia sobrescreveu uma edicao feita durante a traducao'
);

const legacyEn = {
  ...personalPt,
  id: 'm-legacy-en',
  lang: 'en',
  intention: 'Living near the sea as something ordinary.',
  affirmation: 'I choose to build a calm life near the sea.',
  story: 'It is morning and you walk near the sea with calm.',
  anchorIdentity: 'I protect my attention and choose what enters my day.',
  anchorStep: 'When fear appears, then I will breathe for two minutes.',
  contentByLang: undefined,
};
const migratedPt = localizeManifestation(legacyEn, profile, 'pt');
assert.strictEqual(migratedPt.lang, 'pt');
assert.match(migratedPt.story, /\b(voce|você|seu|sua)\b/i, 'item legado nao ganhou variante PT');
assert.strictEqual(
  migratedPt.contentByLang.en.story,
  legacyEn.story,
  'migracao apagou a historia original em ingles'
);

const template = findForYouById('fy-1');
const templateEn = localized(template, 'en');
const catalogItem = {
  ...templateEn,
  id: 'm-template',
  templateId: template.id,
  lang: 'en',
  anchorIdentity: 'I practise reciprocity, clarity and respect.',
  anchorStep: 'Write one reciprocal gesture for today.',
  generation: { source: 'editorial', promptVersion: 'catalog-v1' },
};
const catalogPt = localizeManifestation(catalogItem, profile, 'pt');
assert.strictEqual(catalogPt.title, localized(template, 'pt').title, 'titulo editorial PT incorreto');
assert.strictEqual(catalogPt.story, localized(template, 'pt').story, 'historia editorial PT incorreta');

const contextSource = fs.readFileSync(path.join(root, 'context', 'AppContext.js'), 'utf8');
const chatSource = fs.readFileSync(path.join(root, 'screens', 'onboarding', 'ChatOnboardingScreen.js'), 'utf8');
assert.ok(contextSource.includes('contentByLang'), 'contexto nao preserva variantes bilingues');
assert.ok(contextSource.includes('translateManifestationScene'), 'contexto nao aciona traducao privada');
assert.ok(contextSource.includes('generationEpoch'), 'traducao tardia nao respeita reset/import');
assert.ok(
  contextSource.includes("source: 'user-edited'") && contextSource.includes('shouldTranslateManifestationVariant'),
  'edicoes ou idioma original nao estao protegidos contra retraducao'
);
assert.ok(
  /setLang[\s\S]*localizeManifestation\(item, s\.profile, nextLang\)/.test(contextSource),
  'troca de idioma nao atualiza manifestacoes salvas'
);
assert.ok(
  /addManifestation\(\{[\s\S]*?category: inferCategory\(ans\.hopedChange\),\s*lang,/.test(chatSource),
  'onboarding nao fixa explicitamente o idioma da cena'
);

process.stdout.write('Traducao de manifestacoes: PT/EN, legado e edicoes preservadas\n');
