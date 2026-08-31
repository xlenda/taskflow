# Fronteira da primeira release Android

A versão Android enviada ao Google Play nasce com uma fronteira explícita e
fail-closed. Os perfis EAS `preview` e `production` fixam
`EXPO_PUBLIC_CELESTE_ANDROID_STORE_RELEASE=1`; se a variável estiver ausente em
um runtime Android, a mesma fronteira continua ativa.

## O que aparece no Android

- abas Manifestar, Visões, Afirmações e Jornada;
- Perfil no cabeçalho da Home;
- diário de sonhos e Ritual de Um Minuto;
- lembretes comuns do Ritual de Um Minuto via `expo-notifications`.

## O que não aparece no Android

- aba, atalho e deep link da Comunidade pública;
- card, CTA de sonho, tela e deep link do despertador com afirmação;
- sincronização em segundo plano do despertador nativo;
- pergunta, controle e chamadas de processamento pago em nuvem. A criação usa
  o caminho local nesta primeira versão.

A Comunidade e o despertador continuam disponíveis no site e no iOS. Uma build
Android local dedicada pode definir a flag como `0` para exercitar apenas a UI
da Comunidade. O despertador permanece indisponível em Android até que módulo,
permissões e declaração do Google Play sejam reativados juntos.

## Limite nativo

O módulo `celeste-affirmation-alarm` é autoligado somente na plataforma Apple.
O código-fonte Android foi preservado para uma versão futura, mas não participa
do projeto Android gerado. Como defesa adicional, o `app.json` bloqueia as
permissões `SCHEDULE_EXACT_ALARM` e `USE_EXACT_ALARM`. Permissões compartilhadas
por recursos que continuam ativos não são removidas: `POST_NOTIFICATIONS`,
`RECEIVE_BOOT_COMPLETED` e `WAKE_LOCK` podem atender aos lembretes comuns;
`FOREGROUND_SERVICE_MEDIA_PLAYBACK` pode atender à reprodução normal de áudio.
Nenhuma delas reativa o despertador exato ou seu módulo nativo.

A interface nativa acompanha a mesma fronteira do backend: onboarding, Home e
Perfil não oferecem consentimento de nuvem quando a sessão nativa não pode ser
atestada. O site preserva a experiência de nuvem existente.

Antes de testar uma build v1 em aparelho que recebeu protótipos Android antigos
do despertador, desinstale a versão anterior para que nenhum alarme do protótipo
fique órfão no sistema.

Validação local:

```powershell
npm run verify:android-release
```
