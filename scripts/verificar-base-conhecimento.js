const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const knowledgePath = path.join(root, 'knowledge', 'celeste-core-v1.json');
const knowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
const endpoint = require('../api/gerar-cena');

assert.strictEqual(knowledge.version, 'celeste-knowledge-v1');
assert.match(knowledge.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
assert.ok(knowledge.positioning.length > 80, 'posicionamento da base esta raso');

const expectedConcepts = [
  'values_affirmation',
  'mental_contrasting',
  'implementation_intention',
  'self_determination',
  'habit_context',
  'self_compassion',
  'narrative_identity',
  'process_imagery',
  'dream_reflection',
  'optional_positive_practices',
];
const conceptIds = knowledge.concepts.map((concept) => concept.id);
assert.deepStrictEqual(conceptIds, expectedConcepts);
assert.strictEqual(new Set(conceptIds).size, conceptIds.length, 'conceito duplicado');

for (const concept of knowledge.concepts) {
  assert.ok(concept.principle.length > 40, `${concept.id}: principio ausente`);
  assert.ok(Array.isArray(concept.apply) && concept.apply.length >= 2, `${concept.id}: aplicacao rasa`);
  assert.ok(Array.isArray(concept.limits) && concept.limits.length >= 2, `${concept.id}: limites rasos`);
  assert.ok(Array.isArray(concept.evidence) && concept.evidence.length >= 1, `${concept.id}: fonte ausente`);
  concept.evidence.forEach((url) => assert.match(url, /^https:\/\//, `${concept.id}: fonte invalida`));
}

assert.ok(knowledge.editorialRules.length >= 10, 'regras editoriais incompletas');
assert.ok(knowledge.forbiddenClaims.length >= 8, 'alegacoes proibidas incompletas');
assert.ok(knowledge.examples.length >= 4, 'pares bons/ruins insuficientes');
assert.ok(knowledge.generationContracts.scene.length >= 4, 'contrato de cena incompleto');
assert.ok(knowledge.generationContracts.dream.length >= 3, 'contrato de sonho incompleto');
assert.ok(knowledge.generationContracts.check_in.length >= 2, 'contrato de retorno incompleto');

assert.strictEqual(endpoint._internals.knowledgeVersion, knowledge.version);
const sceneKnowledge = endpoint._internals.buildKnowledgeInstructions('scene').join('\n');
for (const id of [
  'values_affirmation',
  'mental_contrasting',
  'implementation_intention',
  'self_determination',
  'narrative_identity',
  'process_imagery',
]) {
  assert.ok(sceneKnowledge.includes(`[${id}]`), `${id}: nao chegou ao motor de cenas`);
}
assert.ok(!sceneKnowledge.includes('[dream_reflection]'), 'regra de sonho vazou para o escopo de cena');
assert.ok(sceneKnowledge.includes('Forbidden claims:'), 'bloqueios nao chegaram ao prompt');

const validated = endpoint._internals.validateInput({
  desire: 'construir uma rotina criativa',
  category: 'Career',
  lang: 'pt',
  profile: { whyMatters: 'ter autonomia para criar' },
  cloudConsent: true,
  adultConfirmed: true,
});
assert.ok(validated.value, 'entrada de contrato invalida');
const request = endpoint._internals.buildGeminiRequest(validated.value, 17);
const systemText = request.systemInstruction.parts[0].text;
assert.ok(systemText.includes(knowledge.version), 'versao da base nao esta no prompt real');
assert.ok(systemText.includes('Never say an unachieved result already exists'), 'regra de credibilidade ausente');
assert.ok(systemText.includes('explicit grounded if-then plan'), 'contrato se-entao ausente');

const deploy = fs.readFileSync(path.join(root, 'scripts', 'deploy-celeste.js'), 'utf8');
assert.ok(deploy.includes('celeste-core-v1.json'), 'deploy nao empacota a base de conhecimento');

process.stdout.write(
  `Base de conhecimento: ${knowledge.version}, ${knowledge.concepts.length} conceitos, prompt e deploy aprovados\n`
);
