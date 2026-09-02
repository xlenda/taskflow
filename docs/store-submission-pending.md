# Pendencias externas para submissao

O repositorio esta configurado para gerar builds de preview e producao, mas os
itens abaixo dependem dos titulares das contas ou de evidencia do binario final.
Nenhum identificador, URL ou segredo foi presumido.

As migrations Supabase e a fronteira funcional da v1 Android ja foram
concluidas e estao registradas mais abaixo; nao sao bloqueios externos.

## EAS e assinatura

- Fazer login na conta Expo correta e vincular o projeto com `eas init`. O
  `extra.eas.projectId` so deve ser gravado depois que a conta proprietaria for
  confirmada.
- Confirmar se `1` e o ultimo `android.versionCode` e `ios.buildNumber` usados.
  Se ja houver uma versao publicada, sincronizar o valor real com
  `eas build:version:set` antes do primeiro build de producao.
- Gerar ou selecionar credenciais de assinatura Android e certificados/perfis
  Apple na conta proprietaria. Nao armazenar esses segredos no repositorio.

## App Store Connect

- Informar Apple Team ID, Apple ID da conta de submissao, ASC App ID numerico,
  SKU e dados de contato da revisao.
- Publicar e confirmar as URLs HTTPS de privacidade e suporte.
- Validar o AlarmKit em iPhone compativel e anexar instrucoes de revisao.
- Validar o Plano Celeste em iPhone fisico: permissao pedida somente depois do
  toque, indicador de escuta, frase sempre visivel, progresso `1/2` e `2/2`,
  cancelamento, adiamento e conclusao manual acessivel. O reconhecimento deve
  permanecer no aparelho quando o modelo/idioma oferecer suporte e nunca usar
  a nuvem como fallback silencioso.
- Conferir no binario final as descricoes de uso de microfone e reconhecimento
  de fala. Nas notas da revisao, explicar que audio e transcricao do Plano
  Celeste sao efemeros, nao saem do aparelho e nao sao armazenados; somente o
  recibo minimo da pratica fica localmente.
- Confirmar a declaracao de criptografia, App Privacy, direitos dos assets,
  territorios, categoria e screenshots capturados do build nativo final. A
  resposta de App Privacy deve ser conferida contra o binario: o fluxo local do
  Plano Celeste, por si so, nao coleta Audio Data fora do aparelho.

## Google Play Console

- Criar ou confirmar o app `com.celesteapp.affirmations`, a Play App Signing e a conta de
  servico usada pelo EAS Submit.
- Informar email de suporte, URLs HTTPS de privacidade e suporte, territorios e
  trilha inicial.
- Preencher Data Safety, declaracoes de conteudo, classificacao etaria e acesso
  ao app a partir do AAB final.
- Recapturar os screenshots no build Android final. O recurso de AlarmKit nao
  deve ser anunciado na ficha Android.
- Revisar a declaracao do microfone no Play Console e anexar instrucoes claras
  para o revisor chegar ao Plano Celeste. `RECORD_AUDIO` serve apenas a escuta
  iniciada por toque; o audio e a transcricao nao sao coletados nem
  compartilhados. Confirmar essa afirmacao novamente no AAB final.
- Nao preencher declaracao de alarme exato para o Plano Celeste: ele usa
  lembretes comuns, nao pede `SCHEDULE_EXACT_ALARM` ou `USE_EXACT_ALARM` e pode
  sofrer atraso imposto pelo sistema. A ficha nao deve prometer horario exato,
  bloqueio do aparelho ou desbloqueio condicionado a fala.

## Publicacao das URLs finais

- Preencher nas paginas publicas o nome legal, o email publico de suporte e o
  prazo de retencao confirmado nos contratos dos provedores.
- Manter saldo operacional nos provedores pagos. O canario da publicacao de
  31/08/2026 aprovou Anthropic, Gemini, geracao visual e ElevenLabs no navegador
  real; uma publicacao futura deve continuar respeitando esse mesmo portao.
- Reexecutar `npm run deploy:web:vercel-env` e confirmar os quatro caminhos
  HTTPS antes de cadastra-los no Google Play.

## Atestacao das chamadas nativas pagas e limite da v1

- A arquitetura do site esta pronta: Origin permitido, BotID, WAF e cota global
  continuam protegendo as cinco funcoes pagas. A publicacao final depende dos
  dados da titular e do saldo do provedor listados acima.
- Chamadas iOS/Android sem Origin estao fechadas no backend. O cabecalho
  `X-Celeste-Client` identifica apenas uma alegacao do cliente e nunca prova que
  a requisicao veio do app oficial.
- Na v1 Android, o cliente tambem bloqueia geracao e narracao pagas antes de
  criar sessao Supabase ou chamar o backend. A experiencia usa o fallback local.
- No iOS, habilitar App Attest para o Team ID e o bundle
  `com.celesteapp.affirmations`, enviar atestacao/assertion por chamada e guardar no
  servidor a chave publica e o contador de cada instalacao.
- Antes de habilitar nuvem paga numa versao Android futura, vincular
  `com.celesteapp.affirmations` e a Play App Signing a um projeto Google Cloud com Play
  Integrity, enviar Standard Integrity Token e valida-lo no backend com uma
  conta de servico autorizada.
- Nunca substituir atestacao por segredo embutido, identificador do aparelho ou
  apenas conta anonima.

## Concluido no banco e na fronteira Android

- As migrations Supabase `001` a `012` estao sincronizadas no projeto de
  producao.
- A producao web `dpl_GZjA2uRmhmiFgGjZ4CxbBtFBL62h` passou pelos portoes e esta
  ativa em `https://celeste-jet-two.vercel.app`.
- O smoke live criou uma sessao anonima, enviou uma denuncia pela RPC e confirmou
  a persistencia. A denuncia e o usuario de teste foram removidos ao final.
- As politicas remotas da Comunidade continuam desabilitadas por padrao; aba,
  atalho e deep link nao entram na v1 Android.
- A v1 Android exclui o despertador exato, seu modulo e suas permissoes, e
  bloqueia as APIs pagas de cena, traducao, imagem, sonho e voz.
- A configuração e as dependências instaladas fixam SDK 57 com
  `compileSdk`/`targetSdk` 36, package `com.celesteapp.affirmations` e `versionCode` local 1.
  O novo prebuild da árvore final ainda precisa confirmar autolinking,
  `RECORD_AUDIO` e a ausência de alarme exato, overlay, armazenamento legado e
  foreground service de áudio.
- `verify:practice-plan`, `verify:android-release`, `verify:store` e a
  verificacao Android do autolinking passaram depois da integracao. A
  compilacao Kotlin e o AAB assinado ainda dependem do ambiente Android/EAS.

## Validacao final

- `store-listing/urls.json` ja contem os caminhos preparados e
  `submission-readiness.json` ja registra a fronteira Android e a denuncia.
  Executar `npm run verify:store:submission` depois de concluir as cinco
  evidencias restantes: screenshots nativos, teste do AAB em aparelho,
  formularios finais de privacidade, dados da titular/revisao e comprovantes dos
  direitos dos assets.
- Criar builds nativos novos depois do upgrade do Expo; SDK 55+ nao suporta a
  Legacy Architecture e projetos CNG precisam regenerar `ios/` e `android/`.
- Conferir o comportamento e o som do video de abertura em um dispositivo do
  build final; o componente ja usa o contrato `fullscreenOptions` do SDK 57.
- Em Android e iOS reais, testar os lembretes com app aberto, em segundo plano e
  encerrado; permissao concedida/negada; reconhecedor local disponivel/ausente;
  dois acertos consecutivos; duas falhas; `Agora nao`; `Adiar 10 min`; tela
  bloqueada; reinicio; economia de bateria; mudanca de idioma, horario e fuso.
- Confirmar que a frase fica legivel durante toda a escuta, que o app nunca
  exige memorizacao, que o restante do aparelho nao e bloqueado e que nenhum
  audio ou texto reconhecido aparece em backup, log ou trafego de rede.

Referencias oficiais:

- https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/
- https://docs.expo.dev/build-reference/app-versions/
- https://docs.expo.dev/submit/eas-json/
- https://developer.apple.com/help/app-store-connect/
- https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app
- https://developer.apple.com/documentation/speech/asking-permission-to-use-speech-recognition
- https://developer.apple.com/app-store/user-privacy-and-data-use/
- https://developer.android.com/develop/background-work/services/alarms
- https://developer.android.com/reference/android/speech/SpeechRecognizer
- https://support.google.com/googleplay/android-developer/
