// O modulo nativo de compras fica so no iPhone: no Android ele nao e ligado, para a permissao de cobranca do
// Google nao entrar no AAB (o portao scripts/verificar-assinatura.js confere).
module.exports = { dependencies: { 'react-native-purchases': { platforms: { android: null } } } };
