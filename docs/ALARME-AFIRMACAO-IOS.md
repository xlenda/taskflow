# Despertador com conteudo pessoal no iOS

> Este documento descreve o despertador AlarmKit. O Plano Celeste e separado:
> usa lembretes locais comuns, mostra a visao ou Cena-Ancora e a afirmacao para
> leitura, pede duas repeticoes da afirmacao por voz quando o reconhecimento no dispositivo esta
> disponivel e nunca bloqueia o aparelho.

Esta integracao agenda um despertador real do AlarmKit cuja faixa de alerta e a
conteudo pessoal sintetizado no aparelho. A pessoa pode escolher uma afirmacao,
visao, Cena-Ancora, frase de sonho ou frase propria. Nao e um lembrete posterior
ao despertar.

## O que esta implementado

- `services/affirmationAlarm.js`: limite JavaScript usado pelo app.
- `modules/celeste-affirmation-alarm`: modulo Expo local para Apple e Android.
- `CelesteAffirmationAlarmModule.swift`: contrato Expo com capability,
  autorizacao, agendamento, cancelamento e teste.
- `AffirmationAlarmCoordinator.swift`: agenda recorrencia semanal ou um alarme
  pontual de teste com `AlarmManager.shared`.
- `SpeechSoundWriter.swift`: renderiza a voz instalada para CAF Linear PCM e
  grava o resultado em `Library/Sounds` antes de chamar o AlarmKit.
- `app.json`: declara `NSAlarmKitUsageDescription` para o `Info.plist` gerado.

O alarme recorrente usa um horario local e dias ISO (`1` para segunda-feira ate
`7` para domingo). Assim, o AlarmKit pode acompanhar mudancas de fuso horario.
O teste cria um alarme AlarmKit descartavel entre 10 e 300 segundos no futuro;
nao e apenas um preview de audio.

Arquivos de audio recebem nomes unicos. O modulo guarda somente a associacao
entre UUID e nome do arquivo em `UserDefaults`, remove o audio substituido ao
reagendar e remove o audio conhecido ao cancelar. Texto e audio nao saem do
aparelho.

## Requisitos reais

- iOS ou iPadOS 26 ou posterior.
- Xcode com o SDK do AlarmKit (Xcode 26 ou posterior).
- Development build ou build de distribuicao; o modulo nao existe no Expo Go.
- Autorizacao de alarmes concedida pela pessoa no prompt do sistema.

O pod mantem deployment target 15.1 para nao elevar o minimo do app inteiro. O
codigo do AlarmKit usa `#if canImport(AlarmKit)` e `#available(iOS 26.0, *)`;
em versoes antigas o modulo responde como indisponivel e nao agenda nada.

Web retorna `supported: false` e `scheduled: false`. Nao ha fallback por timer
de JavaScript. O Android usa uma implementacao nativa separada, documentada em
`docs/ALARME-AFIRMACAO-ANDROID.md`, com permissao de notificacao, acesso especial
a alarmes exatos e um foreground service curto no momento do alarme. Nenhuma
plataforma promete atravessar preferencias de Foco/DND ou modo silencioso.

## Contrato JavaScript

Todos os metodos sao assincronos:

```text
getCapability() -> { supported, authorization, apiVersion, reason? }
requestAuthorization() -> { supported, authorization, apiVersion, reason? }
schedule(payload) -> { ok, alarmId, scheduledFor?, soundFileName?, reason? }
cancel({ alarmId }) -> { ok, alarmId, reason? }
test(payload) -> { ok, alarmId, scheduledFor?, soundFileName?, reason? }
```

`schedule` recebe UUID, `time` (`HH:mm`), `hour`, `minute`, dias ISO, titulo,
conteudo no campo tecnico legado `affirmation`, locale, identificador opcional
de voz, nome-base opcional de som e a opcao de pedir autorizacao. `test` usa os mesmos dados de audio e
`delaySeconds`. O adaptador JavaScript considera sucesso somente uma resposta
nativa explicita com `{ ok: true }` depois de `AlarmManager.schedule` retornar.

## TTS e arquivo de som

`AVSpeechSynthesizer.write(_:toBufferCallback:)` gera o audio usando uma voz
instalada. O escritor cria um CAF Linear PCM de 16 bits no diretorio
`Library/Sounds`, e o AlarmKit recebe apenas o nome por
`AlertConfiguration.AlertSound.named(...)`, conforme a orientacao da Apple.

O scaffold limita a faixa a 29 segundos, mantendo margem abaixo da regra de 30
segundos usada por sons personalizados do sistema. Esse limite e conservador:
o comportamento final do AlarmKit, o formato CAF gerado por cada voz e a
entrega com o aparelho bloqueado ainda precisam de validacao em hardware. Um
conteudo longo falha com `affirmation_audio_too_long`; ele nao e cortado sem
avisar.

O alarme e somente do tipo alert. Nao ha countdown, pausa ou soneca customizada,
portanto este scaffold nao exige uma Widget Extension/Live Activity.

## Validacao em um Mac

Use uma arvore limpa ou revise alteracoes nativas existentes antes de executar
um prebuild com `--clean`, pois esse comando regenera `ios/`:

```bash
npx expo prebuild --platform ios
npx expo run:ios --device
```

No Xcode 26, confirme que o pod `CelesteAffirmationAlarm` foi incorporado e que
o `Info.plist` final contem `NSAlarmKitUsageDescription`. Em um iPhone com iOS
26, valide pelo menos:

1. concessao, negacao e alteracao posterior da permissao em Ajustes;
2. alarme de teste com tela bloqueada, app encerrado, modo silencioso e Foco;
3. voz pt-BR e en-US, incluindo identificador de voz indisponivel;
4. afirmacao, visao, Cena-Ancora, frase de sonho e frase propria proximas do
   limite de 29 segundos;
5. recorrencia, troca de fuso e horario de verao;
6. reagendamento do mesmo UUID e cancelamento apos reiniciar o app;
7. ausencia de arquivos CAF antigos depois de substituir ou cancelar.

Este ambiente Windows validou Babel, JSON/configuracao Expo, testes do adaptador
e descoberta pelo Expo autolinking. Ele nao possui Xcode nem o SDK da Apple;
portanto os arquivos Swift nao foram compilados nem o despertador foi executado
em um aparelho daqui.

## Referencias Apple

- https://developer.apple.com/documentation/alarmkit/scheduling-an-alarm-with-alarmkit
- https://developer.apple.com/documentation/alarmkit/alarmmanager
- https://developer.apple.com/documentation/alarmkit/alarmmanager/alarmconfiguration/alarm(schedule:attributes:stopintent:secondaryintent:sound:)
- https://developer.apple.com/documentation/avfaudio/avspeechsynthesizer/write(_:tobuffercallback:)
- https://developer.apple.com/videos/play/wwdc2025/230/
