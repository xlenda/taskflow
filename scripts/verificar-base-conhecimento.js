const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const knowledgePath = path.join(root, 'knowledge', 'celeste-core-v2.json');
const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
const sceneEndpoint = require('../api/gerar-cena');
const dreamEndpoint = require('../api/transformar-sonho');
const brain = require('../api/_celeste-brain');
const { CLOUD_CONSENT_VERSION } = require('../constants/cloudConsent');

assert.strictEqual(knowledge.version, 'celeste-knowledge-v2');
assert.strictEqual(knowledge.schemaVersion, '2.0.0');
assert.match(knowledge.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(knowledge.positioning.length > 100, 'posicionamento da V2 esta raso');

const sourceIds = Object.keys(knowledge.sourceRegistry || {});
assert.strictEqual(sourceIds.length, 27, 'a Base V2 auditada precisa manter 27 fontes');
for (const id of sourceIds) {
  const source = knowledge.sourceRegistry[id];
  assert.ok(source && source.type && source.label && source.locator && source.role, `${id}: fonte incompleta`);
}

const cards = knowledge.knowledgeCards;
assert.ok(Array.isArray(cards), 'knowledgeCards precisa ser uma colecao');
assert.strictEqual(cards.length, 39, 'a Base V2 auditada precisa manter 39 cartoes');
const cardIds = cards.map((card) => card.id);
assert.strictEqual(new Set(cardIds).size, cardIds.length, 'cartao duplicado');
const sourceUse = new Set();
const scopeCount = { affirmation: 0, scene: 0, dream: 0, check_in: 0 };
for (const card of cards) {
  assert.match(card.id, /^[a-z0-9][a-z0-9_-]{1,79}$/, `${card.id}: id invalido`);
  assert.match(card.version, /^\d+\.\d+\.\d+$/, `${card.id}: versao invalida`);
  assert.ok(Array.isArray(card.scopes) && card.scopes.length, `${card.id}: escopo ausente`);
  assert.ok(Array.isArray(card.domains) && card.domains.length, `${card.id}: dominios ausentes`);
  assert.ok(Array.isArray(card.signals) && card.signals.length, `${card.id}: sinais ausentes`);
  assert.ok(card.principle.length > 45, `${card.id}: principio raso`);
  assert.ok(Array.isArray(card.apply) && card.apply.length >= 2, `${card.id}: aplicacao rasa`);
  assert.ok(Array.isArray(card.limits) && card.limits.length >= 2, `${card.id}: limites rasos`);
  assert.ok(Array.isArray(card.avoid) && card.avoid.length >= 2, `${card.id}: bloqueios rasos`);
  assert.ok(card.promptCue.length > 30, `${card.id}: promptCue ausente`);
  assert.ok(Array.isArray(card.sources) && card.sources.length, `${card.id}: fontes ausentes`);
  for (const sourceId of card.sources) {
    assert.ok(knowledge.sourceRegistry[sourceId], `${card.id}: fonte inexistente ${sourceId}`);
    sourceUse.add(sourceId);
  }
  for (const scope of Object.keys(scopeCount)) {
    if (card.scopes.includes(scope)) scopeCount[scope] += 1;
  }
}
assert.deepStrictEqual([...sourceUse].sort(), [...sourceIds].sort(), 'ha fonte registrada que nenhum cartao usa');
assert.ok(scopeCount.affirmation >= 20, 'cobertura de afirmacao insuficiente');
assert.ok(scopeCount.scene >= 20, 'cobertura de cena insuficiente');
assert.ok(scopeCount.dream >= 12, 'cobertura de sonho insuficiente');
assert.ok(scopeCount.check_in >= 20, 'cobertura de check-in insuficiente');

for (const scope of ['affirmation', 'scene', 'dream', 'check_in']) {
  const contract = knowledge.generationContracts && knowledge.generationContracts[scope];
  assert.ok(contract && contract.required.length >= 3, `${scope}: contrato incompleto`);
  assert.ok(contract.rejectWhen.length >= 2, `${scope}: rejeicoes incompletas`);
}
assert.ok(knowledge.qualityRubric.dimensions.length >= 6, 'regua de qualidade incompleta');
assert.ok(knowledge.editorialRules.length >= 10, 'regras editoriais incompletas');
assert.ok(knowledge.forbiddenClaims.length >= 8, 'bloqueios incompletos');
assert.match(knowledge.sourcePolicy.books, /Never store or reproduce long copyrighted passages/i);

const authorizedInternalArtifacts = sourceIds
  .map((id) => knowledge.sourceRegistry[id])
  .filter((source) => source.type.startsWith('internal_'))
  .map((source) => source.locator)
  .sort();
assert.deepStrictEqual(authorizedInternalArtifacts, [
  '../docs/DOSSIE-MESTRE-PRODUTO-CELESTE.md',
  '../docs/PESQUISA-CIENTIFICA-PERSONALIZACAO-CELESTE.md',
]);

assert.strictEqual(sceneEndpoint._internals.knowledgeVersion, knowledge.version);
assert.strictEqual(dreamEndpoint._internals.knowledgeVersion, knowledge.version);
assert.strictEqual(brain._internals.knowledge.version, knowledge.version);
const sceneInput = sceneEndpoint._internals.validateInput({
  desire: 'construir uma rotina criativa com calma',
  category: 'Career',
  lang: 'pt',
  profile: {
    aboutYou: 'sou uma designer curiosa',
    whyMatters: 'quero ter autonomia para criar',
    obstacle: 'medo de comecar errado',
  },
  cloudConsent: true,
  cloudConsentVersion: CLOUD_CONSENT_VERSION,
  adultConfirmed: true,
}).value;
const request = sceneEndpoint._internals.buildGeminiRequest(sceneInput, 17);
const systemText = request.systemInstruction.parts[0].text;
const pack = sceneEndpoint._internals.buildKnowledgePack('scene', sceneInput);
assert.match(systemText, /celeste-knowledge-v2/);
assert.match(systemText, /celeste-brain-v1/);
assert.ok(pack.selectionReceipt.cardIds.length >= 4 && pack.selectionReceipt.cardIds.length <= 8);
for (const id of pack.selectionReceipt.cardIds) assert.ok(systemText.includes(`[${id}]`), `${id}: nao chegou ao prompt`);
assert.ok(pack.selectionReceipt.selectedCount < cards.length, 'o prompt recebeu a base inteira');

const deploy = fs.readFileSync(path.join(root, 'scripts', 'deploy-celeste.js'), 'utf8');
assert.ok(deploy.includes('celeste-core-v2.json'), 'deploy nao empacota a V2');
assert.ok(!deploy.includes("knowledge', 'celeste-core-v1.json"), 'deploy ainda aponta para a V1');

process.stdout.write(
  `Base Celeste V2: ${cards.length} cartoes, ${sourceIds.length} fontes autorizadas, recuperacao e deploy aprovados\n`
);
