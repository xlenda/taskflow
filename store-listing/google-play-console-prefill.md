# Google Play Console — preenchimento preparado da v1 Android

Este documento vale somente para a versão Android `1.0.0` criada com o perfil
EAS `production` e o package `com.celesteapp.affirmations`. Ele separa o que está
comprovado no repositório do que ainda depende da titular ou da inspeção do AAB
assinado. O projeto Supabase de produção já foi validado; nenhuma credencial ou
segredo é registrado neste documento.

A verificação da organização foi concluída em 03/09/2026 segundo relato do
titular. Conferir visualmente no Play Console quando houver login disponível,
sem solicitar nem registrar novamente o D-U-N-S. Nome legal público, nome do
desenvolvedor e demais escolhas sem evidência continuam pendentes.

Não reutilize estas respostas para o site ou para o iOS. A v1 Android tem uma
fronteira mais restrita: não oferece Comunidade pública, conta visível,
compras, anúncios, despertador nem geração/narração paga em nuvem.

## 1. Escopo técnico auditado

### Comprovado no código e na configuração

| Comportamento da v1 Android | Resposta | Evidência |
|---|---|---|
| Comunidade pública | Não aparece | `constants/releaseFeatures.js`, `App.js` e `screens/HomeScreen.js` |
| Conta, cadastro ou login visível | Não existe | não há fluxo de autenticação para a pessoa; o app funciona localmente |
| Sessão técnica | Sim, somente ao enviar uma denúncia | `services/aiContentReports.js` cria uma sessão anônima Supabase sem nome, e-mail ou senha; a exclusão apenas consulta a sessão existente e não cria outra |
| Anúncios | Não | nenhum SDK de anúncios identificado em `package.json` |
| Compras ou assinaturas | Não | nenhum SDK de billing nem produto ativo identificado |
| Despertador Android | Não aparece e não entra no binário | módulo autoligado apenas para Apple; permissões de alarme exato bloqueadas em `app.json` |
| Lembrete comum | Sim, opcional | `expo-notifications`; não é despertador nem alarme exato |
| Plano Celeste | Sim, opcional | um a quatro lembretes comuns; visão e afirmação visíveis; duas repetições para registrar a prática |
| Microfone | Sim, somente após toque | `RECORD_AUDIO` atende ao reconhecimento no dispositivo do Plano Celeste; sem fallback para nuvem e com conclusão manual acessível |
| Reprodução em segundo plano / lockscreen | Não | `enableBackgroundPlayback=false`; `FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_MEDIA_PLAYBACK` bloqueadas na v1 |
| APIs pagas de cena, tradução, imagem, sonho e voz | Bloqueadas no Android | `services/celesteApiSession.js` falha antes de criar sessão ou chamar o backend |
| Conteúdo local | Sim | cenas, afirmações, ritual, sonhos e jornada possuem implementação local |
| Denúncia de conteúdo gerado | Sim, dentro do app | quatro telas enviam somente a saída gerada escolhida (ou referência visual) pelo gateway; o Perfil oferece exclusão confirmada; migrations `013`/`014` limitam retenção a 180 dias e fecham a RPC legada |
| Conteúdo público criado por usuários | Não | Comunidade e seus deep links ficam fora da v1 Android |
| Dados principais da prática | Locais | AsyncStorage; backup automático Android desativado em `app.json`; exportação manual produz JSON legível pela folha de compartilhamento |

A sessão Supabase da denúncia é uma identidade técnica pseudônima persistida no
aparelho. Ela não oferece nome de usuário, senha, login, sincronização entre
aparelhos ou perfil remoto. Pela definição do Google, isso não é uma **conta
visível do app**, mas o identificador precisa aparecer no formulário Data
Safety.

Em 31/08/2026, as migrations `001` a `011` foram conferidas e sincronizadas no
Supabase de produção. O smoke live criou uma sessão anônima, enviou uma denúncia
pela RPC e confirmou a gravação; em seguida, a denúncia e o usuário de teste
foram removidos. As políticas da Comunidade continuam desabilitadas por padrão.

A configuração e as dependências instaladas fixam SDK 57 com
`compileSdk`/`targetSdk` 36, package `com.celesteapp.affirmations` e `versionCode` local 1.
Um novo prebuild a partir da árvore final ainda precisa confirmar o autolinking
de `CelestePracticeSpeech`, `RECORD_AUDIO` e a ausência de alarme exato, overlay,
armazenamento legado e foreground service. O AAB final deve repetir essa inspeção
antes do envio.

### Ainda não comprovado sem o AAB final

- manifest final, permissões e SDKs efetivamente empacotados;
- presença das variáveis públicas Supabase no perfil EAS `production`;
- funcionamento da denúncia, da notificação e do armazenamento no AAB instalado
  em um Android físico;
- funcionamento do Plano Celeste com a afirmação visível, progresso `1/2` e
  `2/2`, permissão concedida/negada, reconhecedor local disponível/ausente,
  conclusão manual, cancelamento e adiamento;
- tráfego de rede do binário confirmando que, fora uma denúncia escolhida pela
  pessoa, nenhuma API paga é contatada;
- screenshots capturados desse mesmo build.

## 2. Configuração principal da ficha

Preencher em **Grow users > Store presence > Main store listing** e nos campos
iniciais do app:

| Campo do Play Console | Resposta preparada | Estado |
|---|---|---|
| App ou jogo | **App** | comprovado |
| Nome | **Celeste: Afirmações Diárias** | pronto em `pt-BR` |
| Idioma padrão | **Português (Brasil)** | comprovado |
| Idioma adicional | **English (United States)** | comprovado |
| Categoria | **Health & Fitness / Saúde e fitness** | coerente com o produto |
| Aplicativo gratuito ou pago | **Gratuito** | titular precisa confirmar antes da publicação |
| Contém anúncios | **Não** | comprovado no código-fonte; reconfirmar no AAB |
| E-mail de suporte | **suporte@celestegroup.biz** | confirmado pelo titular |
| Site | `https://celeste-jet-two.vercel.app` | preparado |
| Política de privacidade | `https://celeste-jet-two.vercel.app/privacidade` | página preparada; falta identidade e contato reais |

Tags candidatas, escolhendo somente as que o console oferecer: `Personal
growth`, `Mindfulness`, `Journal`, `Meditation` e `Well-being`.

## 3. App content — respostas prontas

### App access

- **Todas as funcionalidades estão disponíveis sem acesso especial:** Sim.
- **Login, conta de demonstração, código ou instrução restrita:** Não se aplica.
- Nota opcional para revisão:

> A versão Android não exige cadastro nem login. Conclua o onboarding usando a
> opção de criação no aparelho. O Plano Celeste usa lembretes comuns e pode
> pedir o microfone somente quando você tocar para iniciar uma prática. A
> Comunidade, o despertador exato e os recursos pagos em nuvem não fazem parte
> desta versão.

### Ads

- **Does your app contain ads? / O app contém anúncios?** **Não**.

### Target audience and content

- Seleção recomendada: **18 and over / 18 anos ou mais**.
- Não selecionar faixas infantis.
- A escolha final é da titular e precisa coincidir com a apresentação pública
  e com o onboarding.

### App account deletion

- **Does your app allow users to create an account?** **Não**.
- Não informar URL de exclusão de conta nesta v1.
- Motivo: não há identidade apresentada à pessoa nem autenticação para uso em
  outros aparelhos. A sessão anônima existe apenas como autorização técnica da
  denúncia e não pode ser acessada como conta.
- A pergunta separada sobre **exclusão de dados** no Data Safety continua sendo
  obrigatória; a resposta atual está na seção 4.

### News, government and financial features

| Declaração | Resposta |
|---|---|
| News app / aplicativo de notícias | **Não** |
| Government app / aplicativo governamental | **Não** |
| Financial features / recursos financeiros | **Nenhum** |
| Ads ID / ID de publicidade | **Não usa** |

### Content rating (IARC)

Responder pelo build Android, não por recursos existentes no site ou no iOS:

- violência, conteúdo sexual, drogas, apostas e linguagem imprópria editorial:
  **Não**;
- comunicação direta entre pessoas: **Não**;
- conteúdo público compartilhado por usuários: **Não**;
- compartilhamento de localização: **Não**;
- acesso irrestrito à web: **Não**;
- compras de bens digitais: **Não**;
- conteúdo personalizado/gerado: **Sim**, se o questionário atual fizer essa
  pergunta; existe denúncia dentro do app;
- a classificação final é calculada pelo IARC e não deve ser escolhida
  manualmente.

### AI-generated content

- Se o formulário perguntar se o produto apresenta conteúdo gerado ou
  personalizado: **Sim**.
- Caminho de denúncia para o revisor: concluir o onboarding, abrir uma Cena-
  Âncora, visão, afirmação ou resultado de sonho, tocar em **Denunciar este
  conteúdo de IA**, escolher o motivo e enviar.
- A denúncia acontece sem sair do app e informa o conteúdo exato que será
  enviado: somente a saída gerada (ou referência visual), motivo, nota opcional
  e metadados mínimos, com identificador pseudônimo antiabuso.
- As linhas de denúncia expiram em até 180 dias. A pessoa pode usar
  **Perfil → Excluir denúncias de conteúdo de IA enviadas** enquanto esta
  instalação ainda tiver a sessão pseudônima.
- A titular precisa manter uma rotina real de análise da fila
  `ai_content_reports`; implementar o botão sem analisar denúncias não encerra
  a obrigação de moderação.

Para os assets enviados à ficha, declarar individualmente o uso de IA quando
aplicável. O inventário atual registra que o ícone Celeste v2 foi criado com
OpenAI ImageGen e que a feature graphic deriva desse ícone. Screenshots
compostos que incluam esse material também precisam ser avaliados pela titular.

## 4. Data Safety — preenchimento conservador da v1

O Google define coleta como transmissão para fora do aparelho e exige declarar
dados pseudônimos. Portanto, **não** marcar “nenhum dado coletado”: ao enviar
uma denúncia, o app grava a evidência no Supabase para moderação.

O Plano Celeste pede `RECORD_AUDIO`, mas seu fluxo de voz não transmite áudio ou
transcrição para fora do aparelho. A frase permanece visível, a pessoa toca
para iniciar e a repete duas vezes; o reconhecimento local só é usado quando
suportado. A Celeste descarta áudio e texto reconhecido e guarda apenas um
recibo local sem a transcrição. Assim, esse fluxo, isoladamente, não acrescenta
`Audio files` nem um novo tipo coletado ao Data Safety. Confirmar por inspeção
de tráfego e do AAB final antes de copiar essa conclusão para o console.

### Data collection and security

| Pergunta | Resposta preparada | Condição |
|---|---|---|
| Does your app collect or share required user data types? | **Sim** | comprovado pelo fluxo de denúncia |
| Is all collected user data encrypted in transit? | **Sim** | o endpoint Supabase usado no smoke de produção é HTTPS; reconfirmar no tráfego do AAB que ele aponta para o mesmo projeto |
| Do you provide a way for users to request deletion of their data? | **Sim** | ação confirmada no Perfil exclui todas as linhas de denúncia vinculadas ao `reporter_id` atual; não é exclusão de conta |
| Is data shared? | **Não** | somente se o contrato da titular confirmar que Supabase atua como prestador que processa dados em seu nome; caso contrário, marcar **Sim** |

O reset no app apaga os registros locais, mas não apaga uma denúncia já enviada.
Ele não deve ser apresentado como mecanismo de exclusão dos dados remotos. A
exclusão deve ser feita pelo Perfil antes de limpar dados ou desinstalar; se o
vínculo local for perdido, os registros restantes expiram em até 180 dias. A
sessão técnica anônima pode permanecer para prevenção de abuso.

### Tipos que devem ser selecionados

| Categoria > tipo | Coletado | Compartilhado | Efêmero | Obrigatório | Finalidades |
|---|---:|---:|---:|---:|---|
| Personal info > **User IDs** | Sim | Não* | Não | Não; a pessoa escolhe denunciar | App functionality; Fraud prevention, security, and compliance |
| App activity > **Other user-generated content** | Sim | Não* | Não | Não | App functionality; Fraud prevention, security, and compliance |
| App activity > **Other actions** | Sim | Não* | Não | Não | App functionality; Fraud prevention, security, and compliance |

`*` A resposta “não compartilhado” usa a exceção de service provider do Google
e depende da confirmação contratual da titular.

O que cada linha representa:

- **User IDs:** UUID pseudônimo criado pelo Supabase Auth e guardado como
  `reporter_id`; ele autoriza, limita e deduplica denúncias.
- **Other user-generated content:** nota opcional digitada pela pessoa e o
  conteúdo gerado que ela escolheu encaminhar para análise.
- **Other actions:** tipo do conteúdo e motivo escolhido no diálogo de denúncia.

Para os três tipos:

- `Collected`: **Yes**;
- `Shared`: **No**, sob a condição contratual acima;
- `Processed ephemerally`: **No**, pois a tabela de moderação retém o registro;
- `Retention`: no máximo **180 dias** para as linhas de denúncia;
- `Required or optional`: **Users can choose whether this data is collected**;
- não selecionar Analytics, Advertising or marketing, Personalization,
  Developer communications ou Account management como finalidade.

### Conteúdo derivado que exige uma decisão final

O schema não possui colunas estruturadas de nome, cidade, saúde ou finanças,
mas `content_text` guarda o texto gerado que a pessoa viu e escolheu denunciar.
Esse texto local pode repetir cidade, trabalho, relacionamento, desejo de
saúde/finanças ou nomes de filhos e pessoas importantes. A normalização da
denúncia não remove esses trechos; o diálogo mostra uma prévia para a pessoa.

Antes de enviar o Data Safety, a titular precisa decidir, com base no AAB e na
orientação jurídica aplicável, se **Other user-generated content** cobre o
texto opaco de moderação ou se também deve selecionar `Name`, `Other info`,
`Approximate location`, `Health info`, `Other financial info` e `Contacts`
quando esses dados puderem aparecer no conteúdo denunciado. Não marcar esses
tipos como ausentes sem fazer essa análise.

Não há campos nem fluxos intencionais para:

- e-mail, telefone, endereço, raça/etnia, crenças ou orientação sexual;
- mensagens, fotos, vídeos, arquivos, calendário ou acesso ao catálogo de
  contatos do sistema;
- áudio transmitido ou coletado: a permissão de microfone existe somente para o
  reconhecimento local e efêmero do Plano Celeste;
- histórico de busca, lista de apps instalados;
- crash logs, diagnostics ou outros dados de desempenho;
- Device or other IDs.

`Contacts` na lista acima significa acesso ao catálogo de contatos do sistema.
Nomes digitados manualmente que reapareçam no texto denunciado continuam
sujeitos à decisão de classificação do parágrafo anterior.

O SDK pode transmitir IP e user-agent como parte normal de HTTPS. Não selecionar
localização apenas pela existência do IP; selecionar localização se o contrato,
logs ou configuração mostrarem que o IP é usado para inferi-la. Reavaliar a
lista caso analytics, crash reporting, Play Integrity ou outro SDK seja
adicionado ao AAB.

## 5. Health Apps Declaration

### Seleção preparada

- **Does the app offer health features?** **Sim**.
- Grupo: **Health and fitness**.
- Recurso: **Stress management, relaxation, mental acuity**.
- Não selecionar `Sleep management`: registrar sonhos não mede nem gerencia o
  sono.
- Não selecionar `Mental and behavioural health`: a Celeste não oferece
  terapia, aconselhamento, diagnóstico ou tratamento.
- Não selecionar categorias médicas, atividade física, nutrição, ciclo
  menstrual ou Health Connect.

### Descrição segura se o console pedir detalhes

> Celeste is a reflection and well-being app for adults. It provides personal
> affirmations, short mindfulness-style rituals, dream reflections and small
> self-directed daily steps. It does not diagnose, treat, prevent or monitor a
> medical or mental-health condition and is not a substitute for professional
> care.

A versão Android não possui um campo remoto dedicado a dados de saúde.
Respostas do onboarding, sonhos e registros de prática permanecem locais; um
conteúdo gerado escolhido para denúncia pode, porém, mencionar um desejo de
saúde. Classificar esse caso conforme a seção Data Safety.

## 6. Metadados e imagens específicos da v1 Android

Os arquivos em `pt-BR/google-play` e `en-US/google-play` não prometem voz
escolhida, narração paga, geração em nuvem, Comunidade pública nem despertador.
Os textos e materiais Apple permanecem inalterados.

Os rascunhos visuais da Google Play seguem o plano `googlePlayV1` de
`screenshots.json`: o screenshot 2 mostra os controles de privacidade, o
screenshot 3 mantém a afirmação em texto e a opção de denúncia, e a feature
graphic fala somente em afirmação, ritual curto e passo possível. O enquadramento
da Ponte de Hoje preserva o título completo e o exemplo da Jornada usa um nome
curto sem reticências.

Esses arquivos continuam marcados como `controlled_web_draft_not_for_submission`:
foram renderizados da interface web com dados sintéticos controlados, não do AAB
assinado. Antes da submissão, recapturar as mesmas oito telas no build Android
final e manter `nativeScreenshots` como pendente até essa evidência existir.

## 7. Acesso para revisão

Texto preparado para o campo de notas, se aparecer:

> No sign-in or review credentials are required. On first launch, select a
> language and complete onboarding. Choose on-device creation; the first Anchor
> Scene is available locally. To test Celeste Plan, open it from Home, select a
> vision and affirmation, enable an ordinary reminder, then tap to start the
> microphone and read the visible affirmation twice. Audio and transcripts are
> not retained or uploaded; Not now, Snooze 10 min and an accessible manual
> completion remain available. Community, exact affirmation alarm, purchases,
> ads and paid cloud generation are not included in this Android release. To test
> in-app AI content reporting, open a generated scene, vision, affirmation or
> dream result, tap “Report this AI content”, select a reason and submit.

## 8. O que somente a titular pode preencher ou confirmar

1. nome legal do responsável/controlador e nome público do desenvolvedor;
2. e-mail público real para suporte e privacidade;
3. país, endereço e telefone exigidos pela conta Play;
4. preço **gratuito**, países de distribuição e forma de rollout;
5. seleção final de público **18 anos ou mais**;
6. contrato/DPA e papel do Supabase como service provider, subprocessadores e
   prazo de retenção da sessão técnica e registros próprios do provedor (as
   linhas de denúncia já têm limite máximo de 180 dias);
7. classificação Data Safety do conteúdo derivado que pode aparecer numa
   denúncia;
8. comprovantes de uso comercial da Celi, vídeo, ícone e demais assets;
9. declaração individual de IA para cada asset enviado ao Play Console;
10. rotina e responsável por analisar as denúncias recebidas;
11. tipo/data da conta Play para saber se o teste fechado de 12 pessoas por 14
    dias é obrigatório;
12. aprovação do AAB, screenshots nativos e teste em aparelho antes do rollout;
13. confirmação em Android físico de que o Plano Celeste nunca bloqueia o
    aparelho, mantém o texto visível, descarta áudio/transcrição e usa somente
    lembretes comuns e reconhecimento local quando suportado.

## Fontes oficiais consultadas

- [Google Play — Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play — definição de conta e exclusão](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Google Play — Health Apps Declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en-GB)
- [Google Play — conteúdo e serviços de saúde](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)
- [Google Play — conteúdo gerado por IA](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en)
- [Google Play — declaração de assets gerados por IA](https://support.google.com/googleplay/android-developer/answer/17262077?hl=en)
- [Google Play — requisito de teste para contas pessoais novas](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
