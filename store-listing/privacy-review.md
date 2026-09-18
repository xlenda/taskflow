# App Privacy e Data Safety

Esta e uma matriz de engenharia, nao uma declaracao juridica final. Conferir com
os contratos dos provedores e com a versao exata enviada para as lojas.

## Fluxos observados no produto

| Fluxo | Origem | Destino | Finalidade | Controle atual |
|---|---|---|---|---|
| Cena personalizada | respostas selecionadas | backend Celeste e Anthropic; OpenAI como failover; Gemini somente se nenhum dos dois estiver configurado e o processamento aprovado estiver disponível | gerar Cena-Âncora e capítulos do Espelho Vivo | controle único de nuvem com confirmação adulta; uma chamada de texto por vez |
| Traducao | cena salva e idioma de destino | backend Celeste e Google Gemini | traduzir a cena solicitada | controle único de nuvem; fallback local neutro |
| Imagem personalizada | contexto visual reduzido | backend Celeste e Google Gemini | criar a imagem da cena, visão ou afirmação | controle único de nuvem; imagem privada no aparelho |
| Narracao | texto final, idioma e narrador | backend Celeste e ElevenLabs TTS | devolver audio solicitado | play manual e controle único de nuvem |
| Sonho em nuvem | transcricao, sentimento, tema e contexto reduzido | backend Celeste e Google Gemini | interpretar o sonho e criar reflexao e afirmacao | controle único de nuvem; fallback local |
| Espelho Vivo | cena anterior e progresso estruturado | backend Celeste e Anthropic; OpenAI somente como failover | criar novo capitulo | acao explicita; rastros completos ficam fora |
| Pratica local | manifestacoes, sonhos e historico | aparelho | continuidade do produto | edicao, exclusao e reset local |
| Plano Celeste | visão ou Cena-Âncora, imagem pessoal quando existente, afirmação escolhida e áudio temporário captado pelo microfone | tela do aparelho; ElevenLabs somente quando o consentimento de nuvem já estiver ativo; caso contrário, sintetizador do sistema ou navegador; reconhecedor no dispositivo quando suportado | apresentar e narrar a visão completa após toque, liberar e comparar duas repetições da afirmação e registrar a prática | imagem e texto visíveis; narração iniciada somente por toque; microfone separado e explícito; áudio/transcrição da leitura descartados; conclusão manual acessível |
| Comunidade | rascunho escolhido | local hoje; Supabase planejado | envio moderado futuro | nao anunciar como publico nesta versao |
| Denuncia de IA | somente saída gerada ou referência visual, motivo, nota opcional e metadados mínimos | gateway Celeste e Supabase | análise de segurança/moderação | identificador pseudônimo antiabuso; retenção máxima de 180 dias; exclusão no Perfil enquanto a sessão local existir |
| Backup pessoal | prática e rascunhos locais da Comunidade | destino escolhido pela pessoa | cópia pessoal | JSON legível sem criptografia; share sheet no app e download na web; exclui denúncias, consentimentos, notificações e arquivos de imagem |

## Pontos a declarar ou confirmar

- Conteudo do usuario enviado para gerar cenas, sonhos e voz.
- Nome e dados de perfil que permanecem locais versus campos realmente enviados.
- Retencao e uso dos dados por Anthropic, OpenAI, Google Gemini e ElevenLabs
  conforme os contratos ativos de cada finalidade.
- Supabase, autenticacao e dados sociais somente quando forem habilitados.
- A retenção das linhas de denúncia é limitada a 180 dias; confirmar separadamente
  a retenção da sessão técnica anônima e dos registros próprios do Supabase.
- Logs operacionais, IP, protecao contra abuso e prazos de retencao na Vercel.
- Qualquer analytics, crash reporting ou attribution adicionado ao build nativo.
- Permissoes de notificacao, microfone/reconhecimento de fala e AlarmKit.
- No Plano Celeste, `RECORD_AUDIO` nao significa coleta: confirmar no binario e
  no trafego que audio e transcricao permanecem efemeros e locais, enquanto o
  recibo minimo sem texto reconhecido fica somente no aparelho.
- A narração completa da visão é um fluxo separado do microfone. Ela usa
  ElevenLabs somente quando o consentimento de nuvem já está ativo; sem esse
  consentimento, usa o sintetizador do sistema ou navegador. Não presumir que
  toda voz de sistema funciona offline: conferir a voz efetiva e o tráfego do
  binário final. `expo-speech` não acrescenta uma nova permissão sensível.

## Respostas que nao podem ser presumidas

- `Dados nao coletados`: nao marcar sem revisar a definicao especifica de cada loja.
- `Dados nao compartilhados`: processamento por provedor precisa ser classificado
  conforme finalidade, retencao e papel contratual.
- `Criptografado em transito`: confirmar em todos os endpoints do build final.
- `Exclusao disponivel`: o reset remove dados locais; a ação no Perfil remove as
  linhas de denúncia ligadas à sessão pseudônima atual. Ela não exclui a sessão
  técnica anônima e não funciona depois que o vínculo local é perdido. Se contas
  pessoais forem ativadas, as lojas exigirão exclusão da conta e dos dados associados.
- `Audio Data nao coletado`: para o microfone do Plano Celeste, marcar assim
  somente depois de provar no build assinado que nao ha fallback de
  reconhecimento em rede, log, backup ou SDK que transmita a leitura.
- `Conteúdo da visão não transmitido pelo sintetizador`: não presumir. Em
  especial no Android e na web, a voz selecionada pelo sistema ou navegador
  pode depender de serviço de rede. Classificar o texto transmitido conforme o
  comportamento observado e os termos do fornecedor.

## Bloqueios antes da revisao

- publicar e conferir em HTTPS as páginas preparadas de privacidade e suporte;
- validar no build final o envio e a exclusão de denúncias pelo Perfil;
- validar permissoes e manifests do build nativo;
- testar em Android e iPhone fisicos imagem e texto visíveis, narração completa
  iniciada somente por toque, liberação das duas repetições após a narração
  ou confirmação acessível da leitura integral,
  reconhecimento local, progresso (`1/2` e `2/2`), cancelamento, adiamento e
  fallback manual;
- testar o sintetizador com e sem rede, voz instalada/indisponível e, no iPhone,
  com o modo silencioso; inspecionar o tráfego antes de concluir que o TTS não
  transmite texto;
- preencher App Privacy e Data Safety a partir do binario final;
- se Comunidade for ativada, publicar regras, moderacao, denuncia e bloqueio;
- se contas forem ativadas, oferecer exclusao dentro do app e pela web.

Fontes:

- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- https://developer.apple.com/app-store/review/guidelines/
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/13985936
- https://support.google.com/googleplay/android-developer/answer/9876937
