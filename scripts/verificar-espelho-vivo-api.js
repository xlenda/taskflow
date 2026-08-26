const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const endpoint = require('../api/gerar-cena');

function loadClientModule() {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'services', 'generatePersonalizedScene.js'),
    'utf8'
  );
  const executable = source.replace(/\bexport\s+(?=(?:async\s+)?function|const)/g, '');
  return Function(`${executable}\nreturn { sanitizeContinuity, generatePersonalizedScene };`)();
}

function baseBody(overrides = {}) {
  return {
    desire: 'construir uma vida criativa e tranquila',
    category: 'Career',
    lang: 'pt',
    profile: { name: 'Ana', work: 'designer de produto' },
    cloudConsent: true,
    adultConfirmed: true,
    ...overrides,
  };
}

function continuity(overrides = {}) {
  return {
    chapter: 2,
    practiceDays: 8,
    evidenceCount: 3,
    stepCompletions: 2,
    dreamCount: 1,
    latestDreamTheme: 'clarity',
    latestDreamFeeling: 'curious',
    lastPracticeDay: '2026-08-25',
    previousStepCompleted: true,
    previousScene: {
      intention: 'Criar com mais constancia.',
      affirmation: 'Eu escolho criar com calma e constancia.',
      story: 'Eu termino uma pequena tarefa criativa e reconheco o processo que estou construindo.',
      anchorIdentity: 'Eu sou uma pessoa que retorna ao processo.',
      anchorStep: 'Vou dedicar dez minutos ao primeiro rascunho.',
    },
    ...overrides,
  };
}

function generatedPayload(overrides = {}) {
  return {
    candidates: [{
      finishReason: 'STOP',
      content: { parts: [{ text: JSON.stringify({
        intention: 'Viver meu trabalho criativo com presenca e constancia.',
        affirmation: 'Eu construo uma vida criativa e tranquila enquanto meu trabalho como designer de produto cresce com constancia.',
        story: 'A manha entra pela janela enquanto voce conclui uma pagina do projeto. A vida criativa e tranquila aparece no ritmo possivel do trabalho como designer de produto. Em vez de repetir a cena anterior, voce muda de ambiente, caminha por alguns minutos e volta com uma decisao pequena. O progresso registrado serve apenas como contexto para reconhecer a pratica, sem provar nenhum resultado externo. Voce abre o arquivo certo, escolhe uma unica tarefa e protege alguns minutos para realiza-la com presenca.',
        anchorIdentity: 'Eu retorno ao trabalho criativo com constancia e curiosidade.',
        anchorStep: 'Vou dedicar dez minutos a uma unica pagina do projeto hoje.',
        affirmationFieldsUsed: ['desire', 'work'],
        storyFieldsUsed: ['desire', 'work'],
        ...overrides,
      }) }] },
    }],
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    end() { return this; },
  };
}

async function invoke(body) {
  const res = response();
  await endpoint({
    method: 'POST',
    body,
    headers: { origin: 'https://celeste.example', 'x-is-human': 'test' },
  }, res);
  return res;
}

test('Espelho Vivo scene continuity contract', async (t) => {
  const originalFetch = global.fetch;
  const originalEnv = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_PAID_DATA_TERMS_ACCEPTED: process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED,
    CELESTE_ALLOWED_ORIGINS: process.env.CELESTE_ALLOWED_ORIGINS,
  };
  t.after(() => {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    endpoint._internals.resetSecurityForTests();
  });

  await t.test('client sends only bounded structured continuity', async () => {
    const { generatePersonalizedScene } = loadClientModule();
    let sent;
    const oversizedStory = `  ${'capitulo '.repeat(400)}  `;
    await generatePersonalizedScene({
      desire: 'uma vida criativa',
      category: 'Career',
      lang: 'pt',
      profile: {
        name: 'Ana',
        manifestingName: 'Joao',
        work: 'designer',
        cloudPersonalization: true,
        cloudAdultConfirmed: true,
      },
      continuity: continuity({
        latestDreamTheme: 'private-dream-theme',
        dreamCount: -2,
        rawDream: 'private raw dream must not leave device',
        traces: [{ text: 'private trace must not leave device' }],
        previousScene: {
          ...continuity().previousScene,
          affirmation: 'Eu e Joao seguimos juntos.',
          anchorStep: 'Vou conversar com Joao por dez minutos.',
          story: `${oversizedStory} Joao aparece na cena.`,
          hiddenPrompt: 'private injected prompt',
        },
      }),
      fetchImpl: async (_url, options) => {
        sent = JSON.parse(options.body);
        return {
          ok: true,
          json: async () => ({
            scene: {
              intention: 'Uma intencao valida.',
              affirmation: 'Eu escolho uma vida criativa com calma.',
              story: 'Uma historia valida e suficientemente completa para o contrato do cliente.',
              anchorIdentity: 'Eu retorno ao meu processo criativo.',
              anchorStep: 'Vou escrever por dez minutos.',
            },
            generation: { promptVersion: 'celeste-scene-v6' },
          }),
        };
      },
    });

    assert.strictEqual(sent.continuity.chapter, 2);
    assert.strictEqual(sent.continuity.dreamCount, undefined);
    assert.strictEqual(sent.continuity.latestDreamTheme, undefined);
    assert.strictEqual(sent.continuity.rawDream, undefined);
    assert.strictEqual(sent.continuity.traces, undefined);
    assert.strictEqual(sent.continuity.previousScene.hiddenPrompt, undefined);
    assert.ok(sent.continuity.previousScene.story.length <= 2400);
    assert.ok(!JSON.stringify(sent).includes('private raw dream'));
    assert.ok(!JSON.stringify(sent).includes('private trace'));
    assert.ok(!JSON.stringify(sent).includes('private injected prompt'));
    assert.ok(!JSON.stringify(sent).includes('Joao'), 'nome de terceiro editado nao pode sair do aparelho');
    assert.ok(JSON.stringify(sent).includes('uma pessoa próxima'));
  });

  await t.test('server strictly rejects malformed or expanded continuity', () => {
    const invalid = [
      null,
      [],
      { chapter: 1 },
      { chapter: 366 },
      { chapter: 2.5 },
      { chapter: '2' },
      { chapter: 2, rawDream: 'must be rejected' },
      { chapter: 2, practiceDays: -1 },
      { chapter: 2, evidenceCount: 10001 },
      { chapter: 2, stepCompletions: 1.5 },
      { chapter: 2, latestDreamTheme: 'prophecy' },
      { chapter: 2, latestDreamFeeling: 'destined' },
      { chapter: 2, lastPracticeDay: '2026-02-30' },
      { chapter: 2, previousStepCompleted: 'yes' },
      { chapter: 2, previousScene: [] },
      { chapter: 2, previousScene: {} },
      { chapter: 2, previousScene: { story: 'x'.repeat(2401) } },
      { chapter: 2, previousScene: { story: 'valid', rawDream: 'hidden' } },
    ];
    for (const value of invalid) {
      const result = endpoint._internals.validateInput(baseBody({ continuity: value }));
      assert.strictEqual(result.error, 'continuity_invalid', JSON.stringify(value));
      assert.strictEqual(result.status, 400);
    }
    assert.ok(endpoint._internals.validateInput(baseBody()).value, 'legacy body must remain valid');
  });

  await t.test('continuity changes seed and produces an isolated evolution prompt', () => {
    const legacy = endpoint._internals.validateInput(baseBody()).value;
    const evolved = endpoint._internals.validateInput(baseBody({ continuity: continuity() })).value;
    const nextChapter = endpoint._internals.validateInput(baseBody({
      continuity: continuity({ chapter: 3 }),
    })).value;
    const legacySeed = endpoint._internals.deterministicSeed(legacy);
    const evolvedSeed = endpoint._internals.deterministicSeed(evolved);
    assert.notStrictEqual(evolvedSeed, legacySeed);
    assert.notStrictEqual(endpoint._internals.deterministicSeed(nextChapter), evolvedSeed);

    const request = endpoint._internals.buildGeminiRequest(evolved, evolvedSeed);
    const userJson = JSON.parse(request.contents[0].parts[0].text);
    const system = request.systemInstruction.parts[0].text;
    assert.strictEqual(userJson.task, 'evolve_anchor_scene');
    assert.deepStrictEqual(userJson.continuity, evolved.continuity);
    assert.match(system, /continuing chapter/i);
    assert.match(system, /never as proof/i);
    assert.match(system, /Do not promise results/i);
    assert.ok(!JSON.stringify(request).includes('rawDream'));
    assert.ok(!JSON.stringify(request).includes('traces'));
    assert.strictEqual(
      JSON.parse(endpoint._internals.buildGeminiRequest(legacy, legacySeed).contents[0].parts[0].text).task,
      'create_anchor_scene'
    );
  });

  await t.test('a repeated chapter is rejected once and retried with a new seed', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = '1';
    process.env.CELESTE_ALLOWED_ORIGINS = 'https://celeste.example';
    endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
    const repeated = JSON.parse(generatedPayload().candidates[0].content.parts[0].text);
    const previousScene = Object.fromEntries(
      ['intention', 'affirmation', 'story', 'anchorIdentity', 'anchorStep'].map((key) => [key, repeated[key]])
    );
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return {
        ok: true,
        json: async () =>
          calls === 1
            ? generatedPayload()
            : generatedPayload({
                story: 'Em uma biblioteca clara, voce organiza tres notas do projeto e escolhe a primeira decisao do dia. A vida criativa e tranquila ganha forma quando o trabalho como designer de produto recebe um limite simples. Depois de uma pausa junto a janela, voce fecha as abas extras, registra o proximo ponto e encerra esse pequeno ciclo com presenca.',
                anchorIdentity: 'Eu protejo espaco para escolhas criativas pequenas e consistentes.',
                anchorStep: 'Vou organizar tres notas do projeto antes do almoco.',
              }),
      };
    };

    const inputBody = baseBody({ continuity: continuity({ previousScene }) });
    const baseSeed = endpoint._internals.deterministicSeed(
      endpoint._internals.validateInput(inputBody).value
    );
    const res = await invoke(inputBody);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(calls, 2);
    assert.notStrictEqual(res.body.generation.seed, baseSeed);
  });

  await t.test('evolved responses identify prompt v6', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED = '1';
    process.env.CELESTE_ALLOWED_ORIGINS = 'https://celeste.example';
    endpoint._internals.setBotVerifierForTests(async () => ({ isHuman: true, isBot: false }));
    global.fetch = async () => ({ ok: true, json: async () => generatedPayload() });

    const res = await invoke(baseBody({ continuity: continuity() }));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.generation.promptVersion, 'celeste-scene-v6');
  });
});
