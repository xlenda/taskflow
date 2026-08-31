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
- Confirmar a declaracao de criptografia, App Privacy, direitos dos assets,
  territorios, categoria e screenshots capturados do build nativo final.

## Google Play Console

- Criar ou confirmar o app `com.lenda.celeste`, a Play App Signing e a conta de
  servico usada pelo EAS Submit.
- Informar email de suporte, URLs HTTPS de privacidade e suporte, territorios e
  trilha inicial.
- Preencher Data Safety, declaracoes de conteudo, classificacao etaria e acesso
  ao app a partir do AAB final.
- Recapturar os screenshots no build Android final. O recurso de AlarmKit nao
  deve ser anunciado na ficha Android.

## Publicacao das URLs finais

- Preencher nas paginas publicas o nome legal, o email publico de suporte e o
  prazo de retencao confirmado nos contratos dos provedores.
- Recarregar os creditos da API Anthropic ou configurar outro provedor pago e
  validado. O ultimo canario recebeu saldo insuficiente e a esteira reverteu o
  candidato automaticamente; nao contornar esse portao.
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
  `com.lenda.celeste`, enviar atestacao/assertion por chamada e guardar no
  servidor a chave publica e o contador de cada instalacao.
- Antes de habilitar nuvem paga numa versao Android futura, vincular
  `com.lenda.celeste` e a Play App Signing a um projeto Google Cloud com Play
  Integrity, enviar Standard Integrity Token e valida-lo no backend com uma
  conta de servico autorizada.
- Nunca substituir atestacao por segredo embutido, identificador do aparelho ou
  apenas conta anonima.

## Concluido no banco e na fronteira Android

- As migrations Supabase `001` a `011` estao sincronizadas no projeto de
  producao.
- O smoke live criou uma sessao anonima, enviou uma denuncia pela RPC e confirmou
  a persistencia. A denuncia e o usuario de teste foram removidos ao final.
- As politicas remotas da Comunidade continuam desabilitadas por padrao; aba,
  atalho e deep link nao entram na v1 Android.
- A v1 Android exclui o despertador exato, seu modulo e suas permissoes, e
  bloqueia as APIs pagas de cena, traducao, imagem, sonho e voz.
- O prebuild confirmou `compileSdk`/`targetSdk` 36, package
  `com.lenda.celeste`, `versionCode` 1, ausencia do modulo de despertador no
  autolinking e remocao de alarme exato, microfone, overlay e storage legado.
- `verify:ai-report`, `verify:native-api-boundary`, `verify:android-release` e a
  verificacao Android do autolinking passaram.

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

Referencias oficiais:

- https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/
- https://docs.expo.dev/build-reference/app-versions/
- https://docs.expo.dev/submit/eas-json/
- https://developer.apple.com/help/app-store-connect/
- https://support.google.com/googleplay/android-developer/
