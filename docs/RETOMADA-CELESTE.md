# Retomada da Celeste

Atualizado em 27/08/2026. Este arquivo registra investigações e publicações
anteriores para que os problemas não precisem ser redescobertos. IDs de deploy e
resultados ao vivo abaixo são históricos; a arquitetura vigente no código usa
`celeste-knowledge-v2`, `celeste-scene-v7` e `celeste-dream-v2`. Isso não prova,
por si só, que uma nova publicação já tenha ocorrido.

## Conteúdo pessoal e narradores

Produção validada: `https://celeste-jet-two.vercel.app`

Deployment: `dpl_DmQVkysrRN9hMgCU9WRXKXtf5bGV`

- Não existe mais catálogo de afirmações, visões ou práticas prontas. A fonte
  canônica das telas é a manifestação criada com as respostas da própria pessoa
  e os relatos pessoais salvos no diário de sonhos.
- Ao terminar o questionário ou criar um novo desejo, o Celeste gera e salva a
  cena, a afirmação, a história e a ponte prática. Com consentimento adulto, o
  Gemini pode enriquecer essa criação; sem consentimento ou sem rede, a criação
  local continua pessoal e utilizável.
- `Aurora`, `Rio`, `Atlas`, `Serena`, `Luma` e `Nilo` são seis vozes Gemini
  curadas. A escolha fica persistida no aparelho e é a mesma nos cards, cenas,
  visões, sonhos e prévia do despertador.
- Não há MP3 de narrador empacotado nem fallback para voz robótica. A prévia usa
  um texto fixo; a narração pessoal usa somente o texto final criado para aquela
  pessoa e mantém o conteúdo legível quando a voz neural está indisponível.
- Narração pessoal exige confirmação adulta e consentimento explícito para voz
  neural. O cliente envia apenas texto final, idioma e identificador da voz para
  `/api/gerar-audio`; a chave Gemini permanece somente no backend.
- A função exige `Origin` permitido e BotID, usa allowlist de campos, envia
  `store: false` ao Gemini e responde com `no-store` também nos caches de CDN.
- O WAV pode ser reutilizado apenas na memória privada da sessão, por texto,
  idioma e voz. Não existe cache público, URL pessoal, arquivo persistente no
  servidor ou geração automática de um catálogo de áudios.

## Revisão Zeus final — publicada

Produção atual: `https://celeste-jet-two.vercel.app`

Deployment: `dpl_Ac4gFaCQqsn7iuYaXYHtj8wKrhvb`

### Correção mais recente: tradução e diário de sonhos

- Ao trocar o app entre português e inglês, a manifestação criada ao fim do
  questionário agora acompanha o idioma escolhido e volta ao texto original sem
  perder detalhes nem edições da pessoa.
- A tradução remota só ocorre depois do consentimento adulto explícito e envia
  apenas a cena salva e minimizada; sem consentimento, o app usa conteúdo local
  no idioma escolhido.
- A página inicial ganhou o atalho visível `Conte seu sonho`. Um toque abre o
  campo do diário, posiciona o teclado e permite transformar e salvar o relato
  como afirmação personalizada.
- O fluxo foi validado em `320x480`, `390x844` e desktop, inclusive após reload.
- A publicação foi vinculada e validada contra a organização identificada no
  arquivo local da Vercel e o
  projeto `celeste` antes do envio para impedir deploy no projeto errado.

Portões desta publicação:

- tradução local PT/EN, legado e edições preservadas;
- API privada de tradução: `6/6`;
- contrato atual do Gemini: `gemini-3.7-flash` com `celeste-knowledge-v2`;
- tradução ao vivo preservando o detalhe sentinela `blue mug 27`;
- E2E completo local e em produção;
- QA responsivo local e em produção: sonho em um toque, manifestação PT/EN
  persistente e Comunidade rolável;
- auditoria bilíngue sem vazamentos entre português e inglês.

Uma auditoria dirigida, seguida de correção e reauditoria adversarial, fechou
os seguintes bugs confirmados:

- links antigos de sugestões prontas não criam mais cards genéricos nem abrem
  conteúdo de outra pessoa; somente ids pessoais persistidos são aceitos;
- respostas Gemini que chegam depois de reset/importação são descartadas;
- o reset limpa as chaves auxiliares, aplica o mesmo estado em memória antes de
  um ACK tardio e mostra erro quando o armazenamento não confirma a operação;
- troca de frase, horário ou sonho do despertador reconcilia o estado real do
  AlarmKit após falha, sem exibir alarme fantasma;
- cancelamento/agendamento concluído depois de sair da tela continua atualizando
  o estado real, e o reconhecimento de voz é abortado no unmount;
- a Comunidade ignora respostas assíncronas antigas, preserva erro de exclusão e
  o compositor agora rola até consentimento e envio em `320×480`;
- o quiz espera a restauração do rascunho e ignora leituras atrasadas;
- Voltar fecha Política/Termos antes de sair do Perfil;
- o Gemini recebe somente campos relevantes à categoria, e a produção passou a
  enviar uma Content Security Policy restritiva.

Portões aprovados no deployment:

- Expo Doctor: `18/18`;
- contrato atual dos testes Gemini: `celeste-knowledge-v2`;
- Cena-Âncora: `25` casos;
- paridade PT/EN: `46` arquivos e auditoria visual sem vazamentos;
- QA Zeus da Comunidade: `99` verificações, zero falhas e zero erros de console,
  página ou rede;
- E2E completo: abertura, 28 etapas, paywall, persistência, sonho, Perfil,
  Comunidade e app principal;
- responsividade aprovada em `320×480`, `390×844` e desktop.

Pendências que exigem infraestrutura ou migração separada, e não devem ser
tratadas como resolvidas por um patch local:

- rate limit distribuído para a Function Gemini (KV/Firewall, não memória de uma
  única instância serverless);
- armazenamento nativo criptografado para respostas íntimas;
- atualização principal do Expo/Metro para encerrar advisories da cadeia de
  build sem fazer upgrade arriscado junto desta correção.

## Pedido mais recente

O usuário não encontrou a parte em que pode contar o sonho. A função existia,
mas aparecia somente depois da configuração do despertador e ficava fora do
alcance em telas pequenas. A correção foi concluída e publicada em
`https://celeste-jet-two.vercel.app` no deployment
`dpl_ES5X86UuMX7Ak8UWV9bVFVJagVtv`.

## Situação atual: resolvido

- O cartão da página inicial agora se chama “Sonhos e despertador”.
- A tela “Meu despertar” mostra “Conte seu sonho” no primeiro viewport, antes
  de qualquer configuração de alarme.
- Um toque leva diretamente ao campo em que a pessoa pode falar ou escrever o
  sonho e transformá-lo numa afirmação personalizada.
- A tela ganhou uma área de rolagem real e alcançável em `320×480` e `390×844`.
- O fluxo completo em produção transformou o relato e persistiu tanto a âncora
  do sonho quanto a cena local, sem erros de console.

### Correção de Perfil, Jornada e Comunidade preservada

- O `ScrollView` de Perfil é limitado à altura dinâmica da tela e responde ao
  gesto no navegador do celular.
- A Jornada possui um único dono da rolagem; o `ScrollView` aninhado foi removido.
- Comunidade saiu do cartão de Perfil/configurações e ganhou uma entrada própria,
  inteira e visível no começo da Jornada.
- O QA exige `overflow: auto/scroll`, simula wheel e confirma que “Termos de uso”
  e o rodapé entram no viewport.
- Produção passou em `320×480`, `390×844` e desktop, além do E2E completo,
  persistência, recuperação, PT/EN, ícones e abertura da Comunidade.

### Correções anteriores preservadas

- A abertura sai automaticamente ao terminar, avança diante de autoplay/mídia
  bloqueada e mantém a seta de pular.
- A geração da primeira cena tem limite de 15 segundos, fallback local e tela
  de nova tentativa sem perder as respostas.
- A leitura local pendente mostra recuperação em seis segundos sem criar nem
  gravar um estado vazio.
- As gravações são seriais e coalescidas; uma escrita antiga nunca pode terminar
  depois e sobrescrever a versão mais recente.
- Produção passou no teste de leitura que nunca resolve, autoplay bloqueado,
  armazenamento rejeitado, onboarding completo com Gemini e três famílias de
  viewport.

## Estado confirmado

- Produção: https://celeste-jet-two.vercel.app
- A raiz, `/bem-vindo` e a base de conhecimento responderam HTTP 200.
- Uma abertura nova chegou a `/bem-vindo` sem erros de página ou console.
- No código atual, a API de cena usa `celeste-scene-v7` com
  `celeste-knowledge-v2`; o prompt de sonho em nuvem usa `celeste-dream-v2`.
- O problema não é uma queda geral do servidor.

## Pontos que podem parecer ou ficar travados

### 1. Abertura em tela cheia

O vídeo tem aproximadamente 10 segundos, mas o fallback da tela espera 13
segundos. Quando autoplay ou carregamento demora, a pessoa vê apenas o pôster e
a seta e pode achar que o app congelou.

Arquivos: `screens/onboarding/WelcomeScreen.js` e
`components/WelcomeVideo.js`.

Correção aplicada:

- fazer a abertura sempre sair logo após a duração real do vídeo;
- tratar explicitamente autoplay bloqueado, erro e mídia que não progride;
- manter a seta de pular funcionando e acessível;
- não remover o vídeo nem seu som opcional.

### 2. “Transformando suas respostas”

`goNext` liga `creating=true` e aguarda `addManifestation`, mas não possui
`catch/finally`. Uma exceção inesperada pode deixar a tela carregando para
sempre. O Gemini também pode levar de alguns segundos até o timeout atual de 22
segundos, embora exista fallback local dentro de `addManifestation`.

Arquivos: `screens/onboarding/ChatOnboardingScreen.js`,
`context/AppContext.js` e `services/generatePersonalizedScene.js`.

Correção aplicada:

- proteger a conclusão com `try/catch/finally`;
- garantir que `creating` e `finishingRef` sempre sejam liberados em falha;
- oferecer tentativa novamente sem perder as respostas;
- manter o fallback local e nunca registrar respostas íntimas em logs.

### 3. Leitura e gravação locais

A hidratação inicial espera `AsyncStorage.getItem` sem limite de tempo. A
entrada final espera `AsyncStorage.setItem` da mesma forma. Em navegador ou
aparelho com armazenamento preso, o splash ou o botão de entrada podem esperar
indefinidamente.

Arquivos: `context/AppContext.js` e
`screens/onboarding/PaywallScreen.js`.

Correção aplicada:

- adicionar timeout controlado às operações que bloqueiam a interface;
- mostrar recuperação clara em vez de uma tela vazia;
- preservar os dados existentes e não sobrescrever um estado que ainda possa
  chegar atrasado;
- manter o requisito atual de confirmar a gravação antes de liberar o app.

## Testes executados antes e depois da publicação

1. Simular vídeo que não inicia e confirmar avanço automático.
2. Simular `addManifestation` rejeitado e confirmar botão de tentar novamente.
3. Simular `AsyncStorage.getItem` e `setItem` que nunca resolvem.
4. Verificar abertura nova e estado já existente em viewport de iPhone.
5. Rodar contratos locais, exportação, smoke da API e E2E completo em produção.

## Cuidado com o repositório

O worktree já contém muitas mudanças anteriores e arquivos do usuário. Não
reverter nem limpar alterações fora desses pontos. Trabalhar sempre em
`D:\Projetos\TaskFlow` e manter artefatos grandes no drive D:.

## Auditoria Zeus e publicacao de 25/08/2026

- Producao publicada em `https://celeste-jet-two.vercel.app` pelo deployment
  `dpl_EFcnmxMWxe92j3RiGg5eS4bQ7upj`.
- O relato de sonho abre em um toque, persiste e revela a afirmacao inteira em
  `320x480`; o campo nao recupera mais o foco por cima do resultado.
- A Comunidade fica visivel na Jornada, rola corretamente e protege recibos
  locais contra toque duplo, reset concorrente e exclusao remota repetida.
- Falha ao trocar o audio do despertador preserva o ultimo alarme confirmado e
  oferece nova tentativa; uma operacao antiga nunca cancela uma escolha nova.
- Reset, importacao e reparo de armazenamento bloqueiam interacoes ate a
  confirmacao real e nao anunciam sucesso antes da gravacao.
- Varredura de codigo: 51/51 modulos runtime alcancaveis, 87/87 arquivos JS
  compilando, nenhum import sem uso e Expo Doctor 18/18.
- Codigo morto removido: exports internos sem consumidores, dependencia raiz
  redundante `expo-constants`, script antigo de splash e tres capturas orfas.
- Pipeline local e em producao aprovado: contratos Gemini/traducao, PT/EN em 47
  arquivos, icones, recuperacao, QA responsivo e E2E completo.
- Medicao de producao em 4G com CPU 4x: primeiro pixel 524 ms, 652 KB baixados e
  resultado dentro do limite definido pelo projeto.

### Pendente fora deste computador

- Validar o AlarmKit em um aparelho com iOS 26; o bridge e os contratos JS/iOS
  passaram, mas Windows nao executa o framework nativo da Apple.
- Aplicar `supabase/migrations/003_community_delete_idempotent.sql` no projeto
  Supabase conectado. A migration esta validada no repositorio, mas esta maquina
  nao possui Supabase CLI, projeto vinculado ou credencial de banco para aplica-la.

## Protecao da cota Gemini em 25/08/2026

- Producao publicada em `https://celeste-jet-two.vercel.app` pelo deployment
  `dpl_HX2Knze3Z69cwzQdotCBjbwvfsPe`.
- As quatro funções Gemini (`gerar-cena`, `traduzir-cena`, `transformar-sonho` e
  `gerar-audio`) rejeitam `Origin` ausente ou fora da lista antes de qualquer
  validação ou chamada ao provedor.
- As quatro rotas exigem BotID Basic. Bot detectado retorna
  `automated_request_blocked`; falha no verificador retorna
  `bot_verification_unavailable`. Os dois casos fecham antes do Gemini.
- O `Map()` por instancia foi removido. A protecao distribuida esta no Vercel
  WAF, regra `rule_celeste_gemini_api_rate_limit_o1N0Tn`. O contrato versionado
  limita os quatro POSTs em conjunto a 12 requisições por 60 segundos, por IP +
  JA4, com HTTP 429. Doze comporta as seis prévias e o fluxo pessoal sem deixar
  a cota aberta para rajadas grandes.
- A auditoria somente leitura de 25/08/2026 encontrou primeiro a regra antiga,
  cobrindo apenas cena e tradução. A atualização idempotente versionada como
  `rules.update` foi aplicada; o gate ao vivo confirmou os quatro caminhos e o
  limite de 12/min na configuração ativa.
- `scripts/verificar-protecao-gemini.js` valida o contrato local e
  `scripts/verificar-waf-vercel.js` lê a configuração ativa da Vercel. O deploy
  agora é bloqueado quando os quatro caminhos ou o limite 12/min não estão ativos.
- Validacao real aprovada: cliente sem prova foi bloqueado; Chrome normal gerou
  e traduziu com `gemini-3.7-flash`; Chrome headless foi bloqueado e o app usou
  o fallback local; E2E, PT/EN, QA e performance passaram.
- Antes de distribuir binarios iOS/Android, substituir a ausencia natural de
  `Origin` do fetch nativo por sessao/atestacao verificavel. Nunca reabrir
  requisicoes sem Origin anonimas usando um segredo embutido no aplicativo.
