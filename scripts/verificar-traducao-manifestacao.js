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
let repairLegacyLocalManifestation;
let localInterpretedUpgradeCandidate;
try {
  ({
    localizeManifestation,
    applyTranslatedManifestationVariant,
    manifestationVariantFromScene,
    shouldTranslateManifestationVariant,
    repairLegacyLocalManifestation,
    localInterpretedUpgradeCandidate,
  } = require(path.join(root, 'utils', 'manifestationLanguage.js')));
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
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(preparedPt, 'templateId'),
  false,
  'manifestacao pessoal ganhou identificador de template editorial'
);
assert.doesNotMatch(
  JSON.stringify(preparedPt),
  /(?:editorial|catalog-v1)/i,
  'manifestacao pessoal herdou proveniencia de catalogo'
);
assert.strictEqual(
  preparedPt.contentByLang.pt.generation.source,
  'gemini',
  'variante original perdeu a geracao pessoal'
);
assert.strictEqual(
  preparedPt.contentByLang.en.generation.source,
  'local-language-fallback',
  'variante alternativa nao recebeu fallback pessoal seguro'
);

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
  withExactRemote.contentByLang.en.generation.source,
  'gemini-translation',
  'traducao pessoal nao preservou sua proveniencia'
);
assert.doesNotMatch(
  JSON.stringify(withExactRemote),
  /(?:editorial|catalog-v1|"templateId")/i,
  'traducao pessoal reintroduziu template ou catalogo'
);
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
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(migratedPt, 'templateId'),
  false,
  'item pessoal legado ganhou template durante a migracao'
);
assert.doesNotMatch(
  JSON.stringify(migratedPt),
  /(?:editorial|catalog-v1)/i,
  'item pessoal legado caiu em conteudo editorial'
);

const legacyRawCopy = {
  id: 'm-legacy-raw-copy',
  title: 'construir uma familia nova',
  category: 'Love',
  lang: 'pt',
  intention: 'Construir uma familia nova.',
  affirmation: 'Eu honro o que sei sobre mim: pro ativo bondoso.',
  story: 'Eu reconheco o que contei sobre mim: pro ativo bondoso.',
  anchorIdentity: 'Eu ajo com presenca.',
  anchorStep: 'Quando eu hesitar, entao vou escolher um passo possivel.',
  personalizedWith: ['quem voce e'],
  generation: { source: 'local', promptVersion: 'local-v1' },
  sessions: ['2026-08-27'],
  evidence: [{ id: 'e-1', text: 'Uma conversa honesta.' }],
  visual: { cacheKey: 'pv2:kept', mimeType: 'image/jpeg' },
  contentByLang: {
    pt: {
      affirmation: 'Eu honro o que sei sobre mim: pro ativo bondoso.',
      story: 'Eu reconheco o que contei sobre mim: pro ativo bondoso.',
      generation: { source: 'local', promptVersion: 'local-v1' },
    },
  },
};
const repairedLegacyCopy = repairLegacyLocalManifestation(
  legacyRawCopy,
  { aboutYou: 'pro ativo bondoso', obstacle: 'medo de recomecar' }
);
assert.match(repairedLegacyCopy.affirmation, /minha proatividade e minha bondade/i);
assert.doesNotMatch(repairedLegacyCopy.affirmation, /pro ativo bondoso|sei sobre mim\s*:/i);
assert.strictEqual(repairedLegacyCopy.generation.promptVersion, 'local-interpreted-v2');
assert.deepStrictEqual(repairedLegacyCopy.sessions, legacyRawCopy.sessions, 'migracao apagou pratica');
assert.deepStrictEqual(repairedLegacyCopy.evidence, legacyRawCopy.evidence, 'migracao apagou evidencia');
assert.strictEqual(repairedLegacyCopy.visual, legacyRawCopy.visual, 'migracao apagou imagem');
assert.deepStrictEqual(
  localInterpretedUpgradeCandidate(repairedLegacyCopy),
  { id: legacyRawCopy.id, lang: 'pt' },
  'copia local reparada nao entrou na fila de aprimoramento remoto'
);

const repairedBackgroundLanguage = repairLegacyLocalManifestation(
  {
    ...legacyRawCopy,
    lang: 'en',
    title: 'build a new family',
    generation: { source: 'user-edited', promptVersion: 'user-edit-v1' },
    contentByLang: {
      pt: {
        title: 'construir uma familia nova',
        affirmation: 'Eu honro o que sei sobre mim: pro ativo bondoso.',
        story: 'Eu reconheco o que contei sobre mim: pro ativo bondoso.',
        generation: { source: 'local', promptVersion: 'local-v1' },
      },
    },
  },
  { aboutYou: 'pro ativo bondoso' }
);
assert.strictEqual(
  repairedBackgroundLanguage.contentByLang.pt.title,
  'construir uma familia nova',
  'reparo em segundo plano nao pode trocar o titulo PT pelo titulo visivel EN'
);
assert.strictEqual(
  repairedBackgroundLanguage.title,
  'build a new family',
  'reparo de outra variante nao pode mudar o idioma atualmente visivel'
);

const protectedLegacyEdit = {
  ...legacyRawCopy,
  affirmation: 'Eu escrevi esta frase e quero preserva-la.',
  generation: { source: 'user-edited', promptVersion: 'user-edit-v1' },
  contentByLang: {
    pt: {
      affirmation: 'Eu escrevi esta frase e quero preserva-la.',
      generation: { source: 'user-edited', promptVersion: 'user-edit-v1' },
    },
  },
};
assert.strictEqual(
  repairLegacyLocalManifestation(protectedLegacyEdit, { aboutYou: 'pro ativo bondoso' }),
  protectedLegacyEdit,
  'edicao da pessoa nao pode ser tratada como copia local antiga'
);

const contextSource = fs.readFileSync(path.join(root, 'context', 'AppContext.js'), 'utf8');
const chatSource = fs.readFileSync(path.join(root, 'screens', 'onboarding', 'ChatOnboardingScreen.js'), 'utf8');
const addManifestationSource = contextSource.match(
  /const addManifestation = useCallback\(async \(data\) => \{[\s\S]*?\n  \}, \[translateAndStoreVariant\]\);/
);
assert.ok(addManifestationSource, 'nao foi possivel localizar addManifestation');
assert.doesNotMatch(
  addManifestationSource[0],
  /(?:findForYouById|templateId\s*:|source\s*:\s*['"]editorial['"]|catalog-v1)/,
  'nova manifestacao ainda aceita template ou fallback editorial'
);
assert.ok(contextSource.includes('contentByLang'), 'contexto nao preserva variantes bilingues');
assert.ok(contextSource.includes('translateManifestationScene'), 'contexto nao aciona traducao privada');
assert.ok(contextSource.includes('generationEpoch'), 'traducao tardia nao respeita reset/import');
assert.ok(
  contextSource.includes('localInterpretedUpgradeCandidate') &&
    contextSource.includes('localSceneUpgradeEpochRef') &&
    contextSource.includes('manifestations[index] = localizeManifestation') &&
    contextSource.includes('desire: candidateTitle') &&
    contextSource.includes('currentVariant && currentVariant.title'),
  'card local reparado precisa ser aprimorado no mesmo id sem duplicar a jornada'
);
assert.ok(
  contextSource.includes('const profileFingerprint = JSON.stringify(state.profile || {})') &&
    contextSource.includes('JSON.stringify(currentState.profile || {}) !== profileFingerprint'),
  'aprimoramento remoto tardio nao pode sobrescrever conteudo criado antes de uma edicao de perfil'
);
assert.ok(
  addManifestationSource[0].includes('localSceneUpgradeEpochRef.current = generationEpoch'),
  'fallback local novo nao pode disparar uma segunda geracao remota na mesma abertura do app'
);
assert.ok(
  contextSource.includes('TRANSLATION_BATCH_SIZE') &&
    contextSource.includes('TRANSLATION_BATCH_DELAY_MS') &&
    !contextSource.includes('.slice(0, 6)'),
  'fila de traducao nao pode abandonar manifestacoes depois do sexto item'
);
assert.ok(
  /const translateBatch[\s\S]*const latest = stateRef\.current[\s\S]*latest\.profile\.cloudPersonalization !== true/.test(
    contextSource
  ),
  'lote atrasado precisa revalidar consentimento antes de enviar dados'
);
assert.ok(
  contextSource.includes('translationLanguageEpochRef.current') &&
    contextSource.includes('latest.lang !== nextLang') &&
    contextSource.includes('TRANSLATION_START_DELAY_MS'),
  'troca de idioma precisa cancelar lotes antigos e agrupar alternancias rapidas'
);
const translateStoreBlock = contextSource.slice(
  contextSource.indexOf('const translateAndStoreVariant'),
  contextSource.indexOf('const addManifestation')
);
assert.ok(
  contextSource.includes('const translationRequestsRef = useRef(new Map())') &&
    translateStoreBlock.includes('translationRequestsRef.current.get(requestKey)') &&
    translateStoreBlock.includes('translationRequestsRef.current.set(requestKey, request)'),
  'alternancia rapida precisa deduplicar a mesma traducao paga em voo'
);
assert.ok(
  !translateStoreBlock.includes('languageEpoch !== translationLanguageEpochRef.current') &&
    !translateStoreBlock.includes('currentState.lang !== targetLang'),
  'resultado pago valido precisa ser salvo como variante mesmo se a tela voltou ao outro idioma'
);
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

process.stdout.write('Manifestacoes pessoais: PT/EN, traducao e edicoes preservadas sem catalogo\n');
