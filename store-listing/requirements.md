# Requisitos oficiais das lojas

Conferidos em 26/08/2026. Revalidar antes do envio porque as regras das lojas mudam.

## App Store

- Nome: 2 a 30 caracteres.
- Subtitulo: ate 30 caracteres.
- Texto promocional: ate 170 caracteres.
- Descricao: ate 4.000 caracteres, texto simples.
- Keywords: ate 100 bytes.
- Screenshots: 1 a 10 por localizacao, JPG ou PNG sem transparencia.
- iPhone 6,9 pol.: usar `1290 x 2796` neste pacote.
- App Preview: opcional, ate 3 por tamanho e idioma, 15 a 30 segundos.
- Politica de privacidade publica: obrigatoria.
- Support URL com contato real: obrigatoria.

Fontes:

- https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/
- https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications/
- https://developer.apple.com/app-store/search/

## Google Play

- Nome: ate 30 caracteres.
- Descricao curta: ate 80 caracteres.
- Descricao completa: ate 4.000 caracteres.
- Icone: PNG 32-bit com alpha, `512 x 512`, ate 1.024 KB.
- Feature graphic: JPG ou PNG sem alpha, `1024 x 500`.
- Screenshots: 2 a 8 por tipo; para distribuicao, pelo menos 4 em `1080 x 1920`.
- Texto alternativo recomendado: ate 140 caracteres.
- Video: um link YouTube publico ou nao listado, incorporavel e sem anuncios.
- Email de suporte: obrigatorio.
- Data Safety e politica de privacidade: obrigatorios.

Fontes:

- https://support.google.com/googleplay/android-developer/answer/9859152
- https://support.google.com/googleplay/android-developer/answer/9866151
- https://support.google.com/googleplay/android-developer/answer/13393723
- https://support.google.com/googleplay/android-developer/answer/10787469

## Regras especificas da Celeste

- A Comunidade so entra na ficha quando autenticacao, moderacao continua,
  denuncia, bloqueio e termos proprios estiverem ativos.
- Conteudo gerado por IA precisa de mecanismo interno de denuncia antes do envio
  ao Google Play.
- O despertador real atual depende de iPhone compativel. Ele nao aparece nos
  materiais Android.
- O conjunto final deve ser recapturado no build nativo. Os assets automatizados
  deste repositorio sao rascunhos de alta resolucao baseados na UI real da web.
- Como `supportsTablet` esta desativado, nao preparar screenshots de iPad nesta versao.
