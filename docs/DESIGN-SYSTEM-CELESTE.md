# Design System Celeste

## Objetivo

Aplicar à Celeste uma linguagem visual premium, minimalista e celestial inspirada
nos fundamentos do material ÉCLIPSE, sem importar a outra marca nem alterar a
identidade, o mascote Celi, os textos ou a arquitetura funcional do produto.
Nenhum nome, logotipo, ativo ou fonte comercial da ÉCLIPSE entra no aplicativo.

## Contrato de preservação

O redesign é apenas de apresentação. Devem permanecer intactos:

- questionário e Cena-Âncora;
- geração de texto por Anthropic, com OpenAI e Gemini nos fallbacks já definidos;
- imagens pessoais pelo Gemini;
- narração sob demanda pela ElevenLabs, seus seis narradores e cache privado;
- traduções, sonhos, alarmes, Plano Celeste, rituais e compartilhamento;
- consentimentos, privacidade, denúncias, cotas, feature flags e limites por loja;
- dados salvos, rotas, deep links, testIDs e idiomas PT-BR/EN.

## Fundação implementada

`ui/tokens.js` concentra tipografia, espaçamento em grade de quatro pontos,
raios, dimensões, breakpoints, movimento, opacidade e elevação. `ui/theme.js`
mantém os oito temas existentes e expõe os novos tokens sem mudar os valores
anteriores. `ui/kit.js` aplica largura de leitura de até 720 px, estados de
interação, foco visível na web e alvos mínimos de toque.

O texto secundário sobre superfícies alternativas usa o token
`textMutedOnAlt`, mais forte que o antigo `textMuted` quando necessário para
contraste WCAG 2.2 AA.

## Linguagem visual

- superfícies claras e calmas, com hierarquia por espaço e escala;
- cards de 18 a 24 px e CTAs arredondados;
- azul celeste como ação principal e dourado apenas como detalhe de valor;
- tipografia serifada somente em momentos emocionais, não em controles;
- uma ação principal evidente por bloco;
- nenhuma função escondida ou botão decorativo sem ação real.

## Imagens pessoais V3

O gerador continua usando o mesmo endpoint, contrato privado, consentimento,
cota e modelo Gemini. A versão `celeste-visual-v3` acrescenta:

- direção artística distinta para Amor, Prosperidade, Carreira, Saúde,
  Confiança e Paz;
- doze composições e doze ganchos visuais determinísticos;
- luz cinematográfica plausível, textura tátil, ponto de vista específico e
  leitura forte em miniatura;
- uma área central segura para a frase sem transformar a imagem em fundo vazio;
- bloqueio explícito de clichês de banco de imagens, luxo, “vision board” e
  bem-estar genérico;
- as mesmas proibições de pessoas identificáveis, texto, marca, fatos inventados
  e reconstrução de sonhos.

Os testes do prompt usam respostas simuladas e não consomem créditos.

## Ordem de migração

1. Fundação de tokens e componentes.
2. Home, Jornada e Perfil.
3. Manifestação, Visões, Player e Afirmações.
4. Plano Celeste e rituais.
5. Onboarding por último, preservando o fluxo e a Celi.

Cada etapa deve passar pelos verificadores funcionais correspondentes e por uma
exportação Expo antes de publicação.
