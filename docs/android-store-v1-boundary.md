# Fronteira da primeira release Android

A versão Android enviada ao Google Play nasce com uma fronteira explícita e
fail-closed. Os perfis EAS `preview` e `production` fixam
`EXPO_PUBLIC_CELESTE_ANDROID_STORE_RELEASE=1`; se a variável estiver ausente em
um runtime Android, a mesma fronteira continua ativa.

## O que aparece no Android

- abas Manifestar, Visões, Afirmações e Jornada;
- Perfil no cabeçalho da Home;
- diário de sonhos e Ritual de Um Minuto;
- lembretes comuns do Ritual de Um Minuto via `expo-notifications`;
- Plano Celeste opcional, com um a quatro lembretes comuns por dia. Ao abrir a
  prática, a visão e a afirmação escolhidas ficam visíveis em texto grande; a
  afirmação precisa ser lida e repetida duas vezes para registrar a conclusão
  por voz (`1/2` e `2/2`).

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
permissões `SCHEDULE_EXACT_ALARM`, `USE_EXACT_ALARM`, `FOREGROUND_SERVICE` e
`FOREGROUND_SERVICE_MEDIA_PLAYBACK`. O plugin `expo-audio` também mantém
`enableBackgroundPlayback=false`: reprodução em segundo plano e controles na
tela bloqueada ficaram fora da v1 Android. Permissões compartilhadas por recursos
que continuam ativos não são removidas: `POST_NOTIFICATIONS`,
`RECEIVE_BOOT_COMPLETED` e `WAKE_LOCK` podem atender aos lembretes comuns.
Nenhuma delas reativa o despertador exato ou seu módulo nativo.

Os lembretes do Plano Celeste também usam `expo-notifications`: não são alarmes
exatos e podem sofrer atraso por regras do sistema, economia de bateria ou
restrições do fabricante. O plano não usa tela sobreposta, Acessibilidade,
modo quiosque nem administração do aparelho e nunca bloqueia o restante do
celular. `Agora não` e `Adiar 10 min` permanecem disponíveis sem exigir fala.

## Microfone no Plano Celeste

`RECORD_AUDIO` é pedido somente quando a pessoa toca para iniciar a prática por
voz. A frase continua visível enquanto o microfone escuta; não é necessário
decorá-la. Em Android compatível, a Celeste aceita apenas o reconhecedor no
dispositivo e não troca silenciosamente para reconhecimento em nuvem. Se o
recurso local ou o idioma não estiver disponível, se a permissão for negada ou
se as duas tentativas assistidas falharem, a interface oferece uma conclusão
manual acessível.

O áudio e a transcrição produzidos durante essa verificação não são guardados,
enviados ao backend nem escritos em logs. Fica no aparelho somente um recibo
mínimo da prática, como dia, horário, método e pontuação de correspondência, sem
o texto reconhecido. A pessoa pode cancelar a escuta a qualquer momento.

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
