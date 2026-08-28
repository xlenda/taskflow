const NON_INFORMATIVE_ANSWERS = new Set([
  'ainda nao sei',
  'i am not sure yet',
  'im not sure yet',
  'not sure yet',
  'nada especifico',
  'nothing specific',
  'prefer not to say',
  'prefiro nao responder',
]);

function semanticKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^0-9A-Za-z]+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function isNonInformativeProfileAnswer(value) {
  return NON_INFORMATIVE_ANSWERS.has(semanticKey(value));
}

module.exports = { isNonInformativeProfileAnswer };
