# Despertador com afirmacao no Android

O modulo `celeste-affirmation-alarm` usa um `AlarmManager` do Android para
agendar o proximo horario escolhido, um `BroadcastReceiver` para reagendar a
proxima ocorrencia semanal e um foreground service curto para reproduzir a
afirmacao. Ele funciona apenas em development builds e builds Android
instalados que incorporam o modulo local. Expo Go e web nao possuem o modulo e
respondem com `supported: false`; nao existe timer JavaScript de substituicao.

## Permissoes e comportamento

- Android 13+: a pessoa precisa permitir `POST_NOTIFICATIONS`.
- Android 12+: a pessoa precisa habilitar o acesso especial
  `SCHEDULE_EXACT_ALARM` na tela do sistema que o app abre. O Android nao envia
  uma concessao imediata para essa tela, portanto a primeira chamada pode
  responder `exact_alarm_permission_required` com honestidade; depois da volta
  ao app, a proxima tentativa verifica novamente a concessao.
- O modulo usa `setAlarmClock`, nao um job em background ou timer. Ele so
  inicia o foreground service quando o alarme escolhido dispara, encerra o
  service ao fim do WAV/TTS ou ao tocar em `Parar`, e restaura somente alarmes
  que a pessoa ja havia escolhido apos reboot, atualizacao ou mudanca de fuso.
- A notificacao e classificada como alarme, mas nao pede permissao de acesso a
  notificacoes, sobreposicao, tela cheia ou bypass de Nao Perturbe. O sistema e
  o usuario ainda controlam volume, Foco/DND e a apresentacao visual.

## Audio e privacidade

Quando a tela fornece `audioBase64Wav`, o modulo valida RIFF/WAVE PCM16,
tamanho e duracao novamente e grava o WAV em `filesDir/affirmation-alarms`.
Esse diretorio e privado ao app. A escrita usa arquivo temporario e rename; o
novo `PendingIntent` e confirmado antes de o alarme e o WAV anteriores serem
removidos. O token da versao impede que um alarme antigo toque uma frase nova.

Sem WAV selecionado, o service usa `TextToSpeech` local como alternativa. Nem
o texto nem os bytes do audio sao enviados pelo modulo a qualquer servidor.

## Limites para Play e validacao em aparelho

`SCHEDULE_EXACT_ALARM` deve permanecer limitado a este despertador iniciado
explicitamente pela pessoa; nao o use para lembretes promocionais, polling ou
execucao periodica. A experiencia deve ser validada em aparelho real com o app
encerrado, tela bloqueada, permissao de notificacao negada/concedida, acesso de
alarme revogado/concedido, reboot, fuso horario e WAV selecionado. Em especial,
fabricantes podem aplicar regras adicionais de bateria e o app nao promete
contornar DND, modo silencioso ou politicas do aparelho.
