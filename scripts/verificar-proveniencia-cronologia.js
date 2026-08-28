const assert = require('assert');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const { transformSync } = require('@babel/core');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');

const root = path.join(__dirname, '..');
const originalLoader = Module._extensions['.js'];

Module._extensions['.js'] = function compileProjectModule(mod, filename) {
  if (!filename.startsWith(root) || filename.includes(`${path.sep}node_modules${path.sep}`)) {
    return originalLoader(mod, filename);
  }
  const compiled = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename,
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  }).code;
  mod._compile(compiled, filename);
};

let chronology;
let language;
let mirror;
let sceneService;
let dreamService;
try {
  const paidSessionPath = require.resolve('../services/celesteApiSession');
  const paidSession = new Module(paidSessionPath, module);
  paidSession.filename = paidSessionPath;
  paidSession.loaded = true;
  paidSession.exports = { celestePaidApiHeaders: async () => ({}) };
  require.cache[paidSessionPath] = paidSession;
  chronology = require(path.join(root, 'utils', 'celesteChronology.js'));
  language = require(path.join(root, 'utils', 'manifestationLanguage.js'));
  mirror = require(path.join(root, 'utils', 'livingMirror.js'));
  sceneService = require(path.join(root, 'services', 'generatePersonalizedScene.js'));
  dreamService = require(path.join(root, 'services', 'transformDream.js'));
} finally {
  Module._extensions['.js'] = originalLoader;
}

const sceneEndpoint = require('../api/gerar-cena');
const pack = (name) => Array.from({ length: 8 }, (_, index) => `${name}_card_${index + 1}`);
const packA = pack('pack_a');
const packB = pack('pack_b');
const packC = pack('pack_c');
const packD = pack('pack_d');

const profile = {
  name: 'Ana',
  aboutYou: 'criativa e cuidadosa',
  cloudPersonalization: true,
  cloudAdultConfirmed: true,
  cloudConsentVersion: CLOUD_CONSENT_VERSION,
};
const scene = {
  intention: 'Criar com calma e consistencia.',
  affirmation: 'Eu escolho criar com calma e consistencia todos os dias.',
  story: 'Eu abro o caderno perto da janela e dedico dez minutos ao projeto que importa.',
  anchorIdentity: 'Eu sou uma pessoa que protege tempo para criar.',
  anchorStep: 'Quando eu sentir pressa, entao vou abrir o caderno por dez minutos.',
  personalizedWith: ['aboutYou'],
};

async function verifyRemoteProvenance() {
  let requestBody;
  const full = await sceneService.generatePersonalizedScene({
    desire: 'ter uma rotina criativa',
    category: 'Career',
    lang: 'pt',
    profile,
    continuity: {
      chapter: 4,
      previousKnowledgeCardIds: [...packC, ...packB, ...packA],
    },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          scene,
          generation: {
            source: 'celeste-ai',
            provider: 'openai',
            fallbackUsed: true,
            model: 'test-model',
            promptVersion: 'scene-test-v1',
            knowledgeVersion: 'knowledge-test-v2',
            brainVersion: 'brain-test-v1',
            knowledgeCardIds: packC,
            seed: 73,
          },
        }),
      };
    },
  });
  assert.deepStrictEqual(requestBody.continuity.previousKnowledgeCardIds, [
    ...packC,
    ...packB,
    ...packA,
  ]);
  assert.deepStrictEqual(full.generation.knowledgeCardIds, packC);
  assert.strictEqual(full.generation.knowledgeVersion, 'knowledge-test-v2');
  assert.strictEqual(full.generation.source, 'celeste-ai');
  assert.strictEqual(full.generation.provider, 'openai');
  assert.strictEqual(full.generation.fallbackUsed, true);
  assert.strictEqual(full.generation.seed, 73);

  const legacy = await sceneService.generatePersonalizedScene({
    desire: 'ter uma rotina criativa',
    category: 'Career',
    lang: 'pt',
    profile,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ scene, generation: {} }),
    }),
  });
  assert.strictEqual(legacy.generation.source, 'legacy-remote');
  assert.strictEqual(legacy.generation.promptVersion, 'legacy-unknown');
  assert.strictEqual(legacy.generation.knowledgeVersion, 'unknown');
  assert.strictEqual(legacy.generation.brainVersion, 'unknown');
  assert.deepStrictEqual(legacy.generation.knowledgeCardIds, []);
}

function verifyTranslationEditAndRotation() {
  const original = {
    id: 'manifestation-1',
    title: 'ter uma rotina criativa',
    category: 'Career',
    lang: 'pt',
    originLang: 'pt',
    ...scene,
    generation: {
      source: 'celeste-ai',
      provider: 'openai',
      fallbackUsed: true,
      promptVersion: 'scene-test-v1',
      knowledgeVersion: 'knowledge-test-v2',
      brainVersion: 'brain-test-v1',
      knowledgeCardIds: packA,
    },
    createdAt: '2026-08-20',
    sessions: ['2026-08-21'],
    livingMirror: mirror.emptyLivingMirror(),
  };

  const prepared = language.localizeManifestation(original, profile, 'pt');
  assert.strictEqual(prepared.contentByLang.pt.generation.provider, 'openai');
  assert.strictEqual(prepared.contentByLang.pt.generation.fallbackUsed, true);
  assert.deepStrictEqual(
    prepared.contentByLang.en.generation.knowledgeCardIds,
    packA,
    'o fallback EN perdeu o recibo da cena original'
  );

  const visibleEn = language.localizeManifestation(prepared, profile, 'en');
  const translatedVariant = language.manifestationVariantFromScene({
    title: 'a creative routine',
    scene: {
      ...scene,
      affirmation: 'I choose to create with calm and consistency every day.',
      story: 'I open the notebook by the window and give ten minutes to the project that matters.',
    },
    generation: {
      source: 'gemini-translation',
      promptVersion: 'translation-test-v1',
    },
  });
  const translated = language.applyTranslatedManifestationVariant(visibleEn, {
    sourceLang: 'pt',
    targetLang: 'en',
    sourceVariant: visibleEn.contentByLang.pt,
    expectedTargetVariant: visibleEn.contentByLang.en,
    translatedVariant,
  });
  assert.deepStrictEqual(
    translated.generation.knowledgeCardIds,
    packA,
    'a traducao perdeu o recibo da geracao original'
  );

  const edited = {
    ...translated,
    affirmation: 'I rewrote this affirmation myself.',
    generation: { source: 'user-edited', promptVersion: 'user-edit-v1' },
    contentByLang: {
      ...translated.contentByLang,
      en: {
        ...translated.contentByLang.en,
        affirmation: 'I rewrote this affirmation myself.',
        generation: { source: 'user-edited', promptVersion: 'user-edit-v1' },
      },
    },
  };
  const restoredEdit = language.localizeManifestation(edited, profile, 'en');
  assert.strictEqual(restoredEdit.generation.source, 'user-edited');
  assert.deepStrictEqual(
    restoredEdit.generation.knowledgeCardIds,
    packA,
    'a edicao perdeu o recibo herdado da cena que a originou'
  );

  const editedSnapshot = mirror.snapshotLivingMirrorChapter(
    restoredEdit,
    ['desire'],
    '2026-08-22T10:00:00.000Z'
  );
  assert.deepStrictEqual(editedSnapshot.generation.knowledgeCardIds, packA);

  const chapterB = {
    ...editedSnapshot,
    chapter: 2,
    generation: {
      source: 'celeste-ai',
      provider: 'anthropic',
      fallbackUsed: false,
      promptVersion: 'scene-test-v2',
      knowledgeCardIds: packB,
    },
    createdAt: '2026-08-23T10:00:00.000Z',
  };
  const chapterA = {
    ...editedSnapshot,
    chapter: 1,
    createdAt: '2026-08-22T10:00:00.000Z',
  };
  const olderChapter = {
    ...editedSnapshot,
    chapter: 4,
    generation: { source: 'gemini', promptVersion: 'old', knowledgeCardIds: packD },
    createdAt: '2026-08-21T10:00:00.000Z',
  };
  const evolved = {
    ...restoredEdit,
    generation: { source: 'user-edited', promptVersion: 'user-edit-v1' },
    livingMirror: {
      ...mirror.emptyLivingMirror(),
      chapter: 3,
      chapters: [chapterB, chapterA, olderChapter],
    },
  };
  const continuity = chronology.summarizeChronologyMemory({ manifestation: evolved });
  assert.deepStrictEqual(
    continuity.previousKnowledgeCardIds,
    [...packA, ...packB, ...packD],
    'a cena ativa/variante e os capitulos nao foram recuperados na ordem esperada'
  );
  assert.ok(
    continuity.chronology.recentChapters.every((chapter) => !chapter.generation),
    'o recibo detalhado do capitulo deve ficar local; so o agregado cruza a rede'
  );

  const threePacks = chronology.summarizeChronologyMemory({
    manifestation: {
      ...evolved,
      generation: { source: 'gemini', promptVersion: 'scene-test-v3', knowledgeCardIds: packC },
      contentByLang: {
        pt: { ...evolved.contentByLang.pt, generation: { knowledgeCardIds: packC } },
        en: { ...evolved.contentByLang.en, generation: { knowledgeCardIds: packC } },
      },
    },
  });
  assert.deepStrictEqual(
    threePacks.previousKnowledgeCardIds,
    [...packC, ...packB, ...packA]
  );
  assert.strictEqual(threePacks.previousKnowledgeCardIds.length, 24);
  assert.ok(!threePacks.previousKnowledgeCardIds.includes(packD[0]));

  const normalized = mirror.normalizeLivingMirror({
    chapter: 2,
    chapters: [chapterB, { ...chapterA, generation: undefined }],
  });
  assert.deepStrictEqual(normalized.chapters[0].generation.knowledgeCardIds, packB);
  assert.strictEqual(normalized.chapters[0].generation.provider, 'anthropic');
  assert.strictEqual(normalized.chapters[0].generation.fallbackUsed, false);
  assert.strictEqual(normalized.chapters[1].generation.source, 'legacy');
  assert.strictEqual(normalized.chapters[1].generation.promptVersion, 'legacy-unknown');
}

function verifyDreamSeedAndLegacyReceipt() {
  const source = {
    dream: 'Eu caminhava perto de uma janela iluminada.',
    feeling: 'curious',
    theme: 'clarity',
  };
  const response = dreamService._dreamServiceInternals.validateResponse({
    dream: {
      reflection: 'Uma possibilidade e notar a curiosidade que ficou ao acordar.',
      affirmation: 'Eu posso acolher minha curiosidade e escolher um passo pequeno hoje.',
      basis: ['dream', 'feeling', 'theme'],
    },
    generation: {
      source: 'gemini-dream',
      promptVersion: 'dream-test-v1',
      knowledgeVersion: 'knowledge-test-v2',
      brainVersion: 'brain-test-v1',
      knowledgeCardIds: packA,
      seed: 119,
    },
  }, source);
  assert.strictEqual(response.generation.seed, 119);
  assert.deepStrictEqual(response.generation.knowledgeCardIds, packA);

  const legacy = dreamService._dreamServiceInternals.validateResponse({
    dream: {
      reflection: 'Uma possibilidade e cuidar da sensacao que ficou ao acordar.',
      affirmation: 'Eu posso cuidar de mim com um passo pequeno hoje.',
    },
    generation: {},
  }, source);
  assert.strictEqual(legacy.generation.source, 'legacy-remote');
  assert.strictEqual(legacy.generation.knowledgeVersion, 'unknown');
  assert.strictEqual(legacy.generatorVersion, 'legacy-dream-unknown');
}

function verifyServerLimit() {
  const body = {
    desire: 'ter uma rotina criativa',
    category: 'Career',
    lang: 'pt',
    profile: { name: 'Ana', aboutYou: 'criativa e cuidadosa' },
    cloudConsent: true,
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    adultConfirmed: true,
    continuity: {
      chapter: 4,
      previousKnowledgeCardIds: [...packC, ...packB, ...packA],
    },
  };
  assert.ok(sceneEndpoint._internals.validateInput(body).value);
  const tooMany = Array.from({ length: 25 }, (_, index) => `overflow_card_${index + 1}`);
  assert.strictEqual(
    sceneEndpoint._internals.validateInput({
      ...body,
      continuity: { ...body.continuity, previousKnowledgeCardIds: tooMany },
    }).error,
    'continuity_invalid'
  );
}

(async () => {
  await verifyRemoteProvenance();
  verifyTranslationEditAndRotation();
  verifyDreamSeedAndLegacyReceipt();
  verifyServerLimit();
  process.stdout.write(
    'Proveniencia: traducao, edicao, tres pacotes, legado e seed preservados\n'
  );
})().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
