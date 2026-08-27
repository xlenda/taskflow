# Pendencias externas para submissao

O repositorio esta configurado para gerar builds de preview e producao, mas os
itens abaixo dependem dos titulares das contas ou de evidencia do binario final.
Nenhum identificador, URL ou segredo foi presumido.

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

## Atestacao das chamadas nativas pagas

- O site pode ser publicado agora: Origin permitido, BotID, WAF e cota global
  continuam protegendo as cinco funcoes pagas.
- Chamadas iOS/Android sem Origin estao fechadas no backend. O cabecalho
  `X-Celeste-Client` identifica apenas uma alegacao do cliente e nunca prova que
  a requisicao veio do app oficial.
- No iOS, habilitar App Attest para o Team ID e o bundle
  `com.lenda.celeste`, enviar atestacao/assertion por chamada e guardar no
  servidor a chave publica e o contador de cada instalacao.
- No Android, vincular `com.lenda.celeste` e a Play App Signing a um projeto
  Google Cloud com Play Integrity, enviar Standard Integrity Token e valida-lo
  no backend com uma conta de servico autorizada.
- Ate os dois verificadores existirem, builds das lojas podem usar o app local,
  mas geracao pessoal paga permanece indisponivel. Nunca substituir atestacao
  por segredo embutido, identificador do aparelho ou apenas conta anonima.

## Validacao final

- Executar `npm run verify:store:submission` somente depois de atualizar
  `store-listing/urls.json` e `store-listing/submission-readiness.json` com
  evidencia aprovada pelo titular.
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
