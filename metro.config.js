// Configuração do empacotador.
//
// A pasta api/ é código de SERVIDOR: a função de locução sob demanda, que usa
// msedge-tts (websocket + módulos de Node). O app nunca a importa, mas o Metro
// varre a árvore do projeto e tenta processá-la — e o `expo export` morre com
// "JavaScript heap out of memory" perto do fim do bundle. Comprovado em 10/08:
// com api/ fora do projeto o export termina em segundos; com ela dentro, estoura.
//
// Sem require de caminho interno do metro-config: no Windows, o carregador ESM
// recusa caminho absoluto ("Only URLs with a scheme in: file, data, and node").
// blockList aceita um RegExp direto, que é tudo o que precisamos aqui.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// aceita as duas barras (Windows e POSIX)
config.resolver.blockList = /[\\/]api[\\/].+\.js$/;

module.exports = config;
