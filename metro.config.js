// Configuração padrão do Expo. O antigo endpoint de voz foi removido, então não
// há mais código de servidor para excluir do bundle.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
