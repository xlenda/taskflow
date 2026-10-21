# Google Play Console — preenchimento preparado da v1 Android

Este documento vale somente para a versão Android `1.0.0` criada com o perfil
EAS `production` e o package `com.celesteapp.affirmations`. Ele separa o que está
comprovado no repositório do que ainda depende da titular ou da inspeção do AAB
assinado. O projeto Supabase de produção já foi validado; nenhuma credencial ou
segredo é registrado neste documento.

Conferido diretamente no Play Console em 04/09/2026: a nova conta de
organização ainda está em criação e parou na etapa do perfil para pagamentos,
que exige o D-U-N-S de nove dígitos. O titular deve informar o número somente
no Google e conferir os dados legais retornados pela Dun & Bradstreet; não
registrar esse identificador no repositório. Nome legal público e demais
escolhas sem evidência continuam pendentes.

Não reutilize estas respostas para o site ou para o iOS. A v1 Android tem uma
fronteira mais restrita: não oferece Comunidade pública, conta visível,
compras, anúncios, despertador nem geração paga de cena, imagem, sonho ou
tradução em nuvem. Desde 21/10, a única exceção é a narração com a voz
escolhida (ElevenLabs): só depois do consentimento adulto e só quando o servidor
confirma a verificação Play Integrity. Depois do consentimento, sem a verificação
ou sem internet, toca a voz do aparelho com aviso; sem o consentimento, a
narração não toca e a tela oferece o texto (o despertar e a prática do Plano
Celeste usam a voz do aparelho).

## 1. Escopo técnico auditado

### Comprovado no código e na configuração

| Comportamento da v1 Android | Resposta | Evidência |
|---|---|---|
| Comunidade pública | Não aparece | `constants/releaseFeatures.js`, `App.js` e `screens/HomeScreen.js` |
| Conta, cadastro ou login visível | Não existe | não há fluxo de autenticação para a pessoa; o app funciona localmente |
| Sessão técnica | Sim, ao enviar uma denúncia ou pedir a voz em nuvem | `services/aiContentReports.js` e `services/celesteApiSession.js` criam uma sessão anônima Supabase sem nome, e-mail ou senha; ela autoriza o pedido e aplica os limites de gasto; a exclusão apenas consulta a sessão existente e não cria outra |
| Anúncios | Não | nenhum SDK de anúncios identificado em `package.json` |
| Compras ou assinaturas | Não | nenhum SDK de billing nem produto ativo identificado |
| Despertador Android | Não aparece e não entra no binário | módulo autoligado apenas para Apple; permissões de alarme exato bloqueadas em `app.json` |
| Lembrete comum | Sim, opcional | `expo-notifications`; não é despertador nem alarme exato |
| Plano Celeste | Sim, opcional | um a quatro lembretes comuns; imagem e texto da visão ou Cena-Âncora visíveis; narração completa iniciada por toque; depois, duas repetições da afirmação para registrar a prática |
| Microfone | Sim, somente após toque | `RECORD_AUDIO` atende ao reconhecimento no dispositivo do Plano Celeste; sem fallback para nuvem e com conclusão manual acessível |
| Narração (voz) | Sim, somente após toque | com consentimento adulto e Play Integrity confirmado no servidor, a voz escolhida vem da ElevenLabs pelo backend (Vercel); caso contrário, `expo-speech` usa o sintetizador do sistema, sem permissão sensível nova, e não deve ser descrito como necessariamente offline sem validar a engine/voz do aparelho |
| Reprodução em segundo plano / lockscreen | Não | `enableBackgroundPlayback=false`; `FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_MEDIA_PLAYBACK` bloqueadas na v1 |
| APIs pagas de cena, tradução, imagem e sonho | Bloqueadas no Android | `services/celesteApiSession.js` falha antes de criar sessão ou chamar o backend |
| API de voz (ElevenLabs) | Liberada no Android desde 21/10, com trava | o servidor só aceita o pedido nativo com token Play Integrity verificado no Google (pacote do pedido e do app, `PLAY_RECOGNIZED`, `MEETS_DEVICE_INTEGRITY`, hash do pedido e da sessão, token recente); cada pessoa gasta a própria cota diária, e todas dividem o teto global do servidor (o mesmo do site); sem a verificação, 403 `native_attestation_required` |
| Conteúdo local | Sim | cenas, afirmações, ritual, sonhos e jornada possuem implementação local |
| Denúncia de conteúdo gerado | Sim, dentro do app | as telas de conteúdo gerado, e toda tela onde a voz da ElevenLabs toca, enviam somente a saída gerada escolhida (ou referência visual) pelo gateway; o Perfil oferece exclusão confirmada; migrations `013`/`014` limitam retenção a 180 dias e fecham a RPC legada |
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
de `CelestePracticeSpeech`, `expo-speech` e `@expo/app-integrity`, `RECORD_AUDIO`, a consulta ao serviço
TTS e a ausência de alarme exato, overlay, armazenamento legado e foreground
service. O AAB final deve repetir essa inspeção antes do envio.

### Ainda não comprovado sem o AAB final

- manifest final, permissões e SDKs efetivamente empacotados;
- presença das variáveis públicas Supabase e de
  `EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER` no perfil EAS `production`;
- funcionamento da denúncia, da notificação e do armazenamento no AAB instalado
  em um Android físico;
- funcionamento do Plano Celeste com imagem e texto da visão ou Cena-Âncora e a
  afirmação visíveis; narração completa iniciada por toque e concluída, ou
  leitura integral confirmada pela alternativa acessível, antes de liberar o
  progresso `1/2` e `2/2`; permissão concedida/negada, reconhecedor
  local disponível/ausente, conclusão manual, cancelamento e adiamento;
- comportamento do sintetizador com e sem rede, voz instalada/indisponível e
  inspeção de tráfego para identificar se a engine padrão transmite o texto;
- tráfego de rede do binário confirmando que, fora uma denúncia ou um pedido de
  voz autorizado pela pessoa, nenhuma API paga é contatada;
- voz da ElevenLabs no app instalado pela trilha interna (Play Integrity
  aprovado) e voz do aparelho com aviso fora da Play ou sem internet;
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

> A versão Android não exige cadastro nem login. Conclua o onboarding; a primeira
> Cena-Âncora é criada automaticamente no aparelho, com a nuvem desligada. Ao
> tocar para ouvir, a Celeste pede uma vez a confirmação de 18+ e a permissão da
> voz em nuvem; com ela, o texto escolhido é narrado com a voz de IA da
> ElevenLabs; sem ela, a narração não toca e o texto fica na tela (o despertar e
> o Plano Celeste usam o sintetizador do sistema). O Plano Celeste usa
> lembretes comuns, mostra imagem e texto e narra a visão somente depois de um
> toque. Após a narração, pode pedir o microfone somente quando você tocar para
> iniciar as duas repetições. A Comunidade, o despertador exato e a geração de
> imagens ou textos em nuvem não fazem parte desta versão.

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
  pergunta; no Android a IA gera somente a voz da narração, a partir do texto da
  própria pessoa; existe denúncia dentro do app;
- compartilhamento de dados pessoais com terceiros: responder igual ao Data
  Safety (seção 4): **Não** se Vercel, ElevenLabs, Supabase e Google forem
  confirmados como prestadores de serviço; **Sim** se a titular marcar
  "compartilhado" lá;
- a classificação final é calculada pelo IARC e não deve ser escolhida
  manualmente.

### AI-generated content

- Se o formulário perguntar se o produto apresenta conteúdo gerado ou
  personalizado: **Sim**.
- Se perguntar se o app gera conteúdo com IA: **Sim**. Desde 21/10, o Android
  gera voz de narração com IA (ElevenLabs) a partir do texto da própria pessoa,
  depois do consentimento adulto; imagens e textos do Android continuam locais.
  Isso coloca o app na política de conteúdo gerado por IA, que exige denúncia
  "without needing to exit the app": o botão fica em toda tela onde essa voz toca.
- Caminho de denúncia para o revisor: concluir o onboarding, abrir uma Cena-
  Âncora, visão, afirmação ou resultado de sonho (ou qualquer tela onde a voz
  gerada toque), tocar em **Denunciar este conteúdo de IA**, escolher o motivo e
  enviar.
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
compostos que incluam esse material também precisam ser avaliados pela titular,
assim como as capturas com cenas prontas (FLUX) e qualquer vídeo de prévia com
voz da ElevenLabs.

## 4. Data Safety — preenchimento conservador da v1

O Google define coleta como transmissão para fora do aparelho e exige declarar
dados pseudônimos. Portanto, **não** marcar “nenhum dado coletado”: ao enviar
uma denúncia, o app grava a evidência no Supabase para moderação; desde 21/10,
ao pedir a voz em nuvem, o texto escolhido também sai do aparelho para virar
áudio.

O Plano Celeste pede `RECORD_AUDIO`, mas o fluxo de reconhecimento não transmite
áudio ou transcrição para fora do aparelho. A afirmação permanece visível; após
a narração completa da visão, a pessoa toca para iniciar o microfone e repete a
frase duas vezes. O reconhecimento local só é usado quando suportado. A Celeste
descarta áudio e texto reconhecido e guarda apenas um recibo local sem a
transcrição. Assim, esse fluxo de entrada, isoladamente, não acrescenta `Audio
files` nem um novo tipo coletado ao Data Safety.

A narração de saída é separada do microfone. Com consentimento adulto e Play
Integrity confirmado no servidor, o texto que a pessoa pediu para ouvir, o idioma
e a voz vão ao backend (Vercel), que repassa só o texto e a voz à ElevenLabs;
esse texto entra em `Other user-generated content` (tabela abaixo). O backend da
Celeste não grava o texto: o registro de limite guarda só a sessão anônima, o id
do pedido, a operação e, no Android, um HMAC (resumo com chave secreta do
servidor) do id da sessão anônima, que conta o teto diário da própria pessoa.
Depois do consentimento, sem a verificação ou sem internet, `expo-speech` entrega
o texto ao sintetizador escolhido pelo sistema, com aviso na tela; sem o
consentimento, só o despertar e a prática do Plano Celeste fazem isso (nas outras
telas a narração não toca e o texto fica na tela). A biblioteca não adiciona uma
nova permissão sensível, mas a engine ou voz pode usar rede. Antes de preencher o
console, confirmar no AAB e no tráfego se esse caminho mantém o texto no aparelho.

### Data collection and security

| Pergunta | Resposta preparada | Condição |
|---|---|---|
| Does your app collect or share required user data types? | **Sim** | fluxos de denúncia e de voz em nuvem |
| Is all collected user data encrypted in transit? | **Sim** | o endpoint Supabase usado no smoke de produção é HTTPS; reconfirmar no tráfego do AAB que ele aponta para o mesmo projeto |
| Do you provide a way for users to request deletion of their data? | **Sim** | ação confirmada no Perfil exclui todas as linhas de denúncia vinculadas ao `reporter_id` atual; não é exclusão de conta |
| Is data shared? | **Não** | somente se os contratos/termos da titular confirmarem que Supabase, Vercel, ElevenLabs e Google (Play Integrity) atuam como prestadores que processam dados em seu nome e sob suas instruções; caso contrário, marcar **Sim** para o tipo afetado |

O reset no app apaga os registros locais, mas não apaga uma denúncia já enviada.
Ele não deve ser apresentado como mecanismo de exclusão dos dados remotos. A
exclusão deve ser feita pelo Perfil antes de limpar dados ou desinstalar; se o
vínculo local for perdido, os registros restantes expiram em até 180 dias. A
sessão técnica anônima pode permanecer para prevenção de abuso.

### Tipos que devem ser selecionados

| Categoria > tipo | Coletado | Compartilhado | Efêmero | Obrigatório | Finalidades |
|---|---:|---:|---:|---:|---|
| Personal info > **User IDs** | Sim | Não* | Não | Não; a pessoa escolhe denunciar ou ligar a voz | App functionality; Fraud prevention, security, and compliance |
| App activity > **Other user-generated content** | Sim | Não* | Não | Não | App functionality; Fraud prevention, security, and compliance |
| App activity > **Other actions** | Sim | Não* | Não | Não | App functionality; Fraud prevention, security, and compliance |
| Device or other IDs (decisão da titular) | Sim | Não* | Não | Não | Fraud prevention, security, and compliance |

`*` A resposta “não compartilhado” usa a exceção de service provider do Google
e depende da confirmação contratual da titular.

O que cada linha representa:

- **User IDs:** UUID pseudônimo criado pelo Supabase Auth, guardado como
  `reporter_id` nas denúncias e usado no registro de limite dos pedidos de voz;
  ele autoriza, limita e deduplica.
- **Other user-generated content:** nota opcional digitada pela pessoa, o
  conteúdo gerado que ela escolheu encaminhar para análise e, desde 21/10, o
  texto que ela pediu para ouvir (enviado à ElevenLabs para virar voz).
- **Other actions:** tipo do conteúdo e motivo escolhido no diálogo de denúncia,
  e o pedido de narração registrado no limite de gasto.
- **Device or other IDs:** verificação Play Integrity. O token sai do aparelho e
  o Google o confere; o resultado que o servidor recebe traz selos (app
  reconhecido, aparelho certificado), não um identificador do aparelho ou da
  pessoa. O Google informa que, para gerar o token, a Play coleta dados do app e
  do aparelho (inclusive certificado de atestação) e não os repassa a terceiros
  (https://developer.android.com/google/play/integrity/terms). Marcar é a opção
  conservadora; não marcar é defensável porque essa coleta é feita pela própria
  Play, sob os termos da Google Play.

Para todos os tipos marcados:

- `Collected`: **Yes**;
- `Shared`: **No**, sob a condição contratual acima;
- `Processed ephemerally`: **No**, pois a tabela de moderação retém o registro e
  não há como provar que ElevenLabs e Google descartam o dado na hora;
- `Retention`: no máximo **180 dias** para as linhas de denúncia; o texto da voz
  não é gravado pelo backend, e a retenção da ElevenLabs segue o aviso de prazo
  externo da política;
- `Required or optional`: **Users can choose whether this data is collected**:
  a voz em nuvem só liga com o consentimento e, sem ele, o app funciona com a
  voz do aparelho; a denúncia também é escolha da pessoa;
- não selecionar Analytics, Advertising or marketing, Personalization,
  Developer communications ou Account management como finalidade.

### Conteúdo derivado que exige uma decisão final

O schema não possui colunas estruturadas de nome, cidade, saúde ou finanças,
mas `content_text` guarda o texto gerado que a pessoa viu e escolheu denunciar.
Esse texto local pode repetir cidade, trabalho, relacionamento, desejo de
saúde/finanças ou nomes de filhos e pessoas importantes. A normalização da
denúncia não remove esses trechos; o diálogo mostra uma prévia para a pessoa.
O mesmo vale para o texto enviado à ElevenLabs para virar voz: é o texto da
tela, e as afirmações locais de sonho podem citar até dois nomes de filhos ou
pessoas importantes (`utils/dreamToAffirmation.js`).

Antes de enviar o Data Safety, a titular precisa decidir, com base no AAB e na
orientação jurídica aplicável, se **Other user-generated content** cobre o
texto opaco de moderação e da voz ou se também deve selecionar `Name`, `Other info`,
`Approximate location`, `Health info`, `Other financial info` e `Contacts`
quando esses dados puderem aparecer no conteúdo denunciado ou narrado. Não marcar esses
tipos como ausentes sem fazer essa análise.

Não há campos nem fluxos intencionais para:

- e-mail, telefone, endereço, raça/etnia, crenças ou orientação sexual;
- mensagens, fotos, vídeos, arquivos, calendário ou acesso ao catálogo de
  contatos do sistema;
- áudio do microfone transmitido ou coletado: a permissão existe somente para o
  reconhecimento local e efêmero do Plano Celeste;
- histórico de busca, lista de apps instalados;
- crash logs, diagnostics ou outros dados de desempenho;
- Device or other IDs fora da verificação Play Integrity descrita acima;
- `Audio`: a voz gerada pela ElevenLabs não é gravação da pessoa e o áudio
  devolvido fica só em cache privado no aparelho.

`Contacts` na lista acima significa acesso ao catálogo de contatos do sistema.
Nomes digitados manualmente que reapareçam no texto denunciado ou narrado
continuam sujeitos à decisão de classificação do parágrafo anterior.

O SDK pode transmitir IP e user-agent como parte normal de HTTPS. Não selecionar
localização apenas pela existência do IP; selecionar localização se o contrato,
logs ou configuração mostrarem que o IP é usado para inferi-la. Reavaliar a
lista caso analytics, crash reporting ou outro SDK seja adicionado ao AAB; a
Play Integrity (`@expo/app-integrity`) já está avaliada acima desde 21/10.

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
conteúdo gerado escolhido para denúncia, ou o texto enviado para virar voz,
pode, porém, mencionar um desejo de saúde. Classificar esse caso conforme a
seção Data Safety.

## 6. Metadados e imagens específicos da v1 Android

Desde 21/10, os arquivos em `pt-BR/google-play` e `en-US/google-play` citam
ouvir a história, as visões e as afirmações na voz escolhida, criada com IA com
autorização, só ao tocar para ouvir e com internet (sem conexão, voz do
aparelho). Eles não prometem geração de imagem ou texto em nuvem, Comunidade
pública nem despertador exato. Os textos e materiais Apple permanecem
inalterados.

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

Texto preparado para o campo de notas, se aparecer (o mesmo de
`review-notes.md`, atualizado em 21/10):

> No sign-in or credentials are required. Select a language and complete onboarding; the first Anchor Scene is created on the device with cloud processing off. This Android version has no Community, purchases, ads or exact alarm, and it does not generate images or text with AI. Its only AI feature is voice narration: when the user taps to listen to their own affirmation, vision, story or Anchor Scene, Celeste can read that text aloud with an AI voice from ElevenLabs, in the narrator chosen at the reveal or in Profile > Narration voice. The first time, a dialog asks the user to confirm they are 18 or older and to allow the cloud voice; only the text they asked to hear, its language and the chosen voice are sent, through Celeste's server, to create the audio. The server accepts these requests only from the app installed from Google Play (Play Integrity); otherwise, or offline, the device's built-in voice plays with a notice. Reporting: on every screen where the AI voice plays, tap "Report this AI content", choose a reason and submit without leaving the app. After the scene is revealed, the standard Google Play in-app review dialog may appear once. "My wake-up": Home > My wake-up, add an Anchor Scene, vision or affirmation, choose a time and turn the reminder on; it is an ordinary notification with sound (no exact alarm) that opens the sequence, which plays after a tap. Sharing: open an affirmation, vision or the Anchor Scene, tap Share, preview the card, then share the image or the 8-second video through the system share sheet. Celeste Plan: Home > Celeste Plan, select a vision or Anchor Scene and an affirmation, tap Listen to full vision, then tap to start the microphone (on-device recognition only; nothing is stored or uploaded); Not now, Snooze 10 min and manual completion are available.

## 8. O que somente a titular pode preencher ou confirmar

1. nome legal do responsável/controlador e nome público do desenvolvedor;
2. e-mail público real para suporte e privacidade;
3. país, endereço e telefone exigidos pela conta Play;
4. preço **gratuito**, países de distribuição e forma de rollout;
5. seleção final de público **18 anos ou mais**;
6. contrato/DPA e papel de Supabase, Vercel e ElevenLabs como service providers,
   subprocessadores e prazo de retenção da sessão técnica e registros próprios
   de cada provedor (as linhas de denúncia já têm limite máximo de 180 dias);
7. classificação Data Safety do conteúdo derivado que pode aparecer numa
   denúncia ou no texto enviado para virar voz, e a marcação (ou não) de
   `Device or other IDs` pela Play Integrity;
8. comprovantes de uso comercial da Celi, vídeo, ícone e demais assets;
9. declaração individual de IA para cada asset enviado ao Play Console;
10. rotina e responsável por analisar as denúncias recebidas;
11. tipo/data da conta Play para saber se o teste fechado de 12 pessoas por 14
    dias é obrigatório;
12. aprovação do AAB, screenshots nativos e teste em aparelho antes do rollout;
13. confirmação em Android físico de que o Plano Celeste nunca bloqueia o
    aparelho, mantém imagem, visão ou Cena-Âncora e afirmação visíveis, inicia a
    narração somente por toque, libera as duas repetições depois dela, descarta
    áudio/transcrição do microfone e usa somente lembretes comuns e reconhecimento
    local quando suportado;
14. confirmação, por tráfego do AAB e termos da engine efetiva, se o sintetizador
    do sistema processa o texto da visão apenas no aparelho ou usa rede;
15. configuração da Play Integrity (projeto do Google Cloud vinculado, chave na
    Vercel e número do projeto no EAS), conforme
    `docs/PLAY-INTEGRITY-PASSO-A-PASSO.md`, e teste da voz pela trilha interna;
16. plano pago da ElevenLabs: pelos termos registrados em `asset-rights.md`, o
    plano grátis não permite uso comercial.

## Fontes oficiais consultadas

- [Google Play — Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en)
- [Google Play — definição de conta e exclusão](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en)
- [Google Play — Health Apps Declaration](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en-GB)
- [Google Play — conteúdo e serviços de saúde](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)
- [Google Play — conteúdo gerado por IA](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en)
- [Google Play — declaração de assets gerados por IA](https://support.google.com/googleplay/android-developer/answer/17262077?hl=en)
- [Google Play — requisito de teste para contas pessoais novas](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Play Integrity — termos e dados (Data safety)](https://developer.android.com/google/play/integrity/terms)
- [Play Integrity — veredictos](https://developer.android.com/google/play/integrity/verdicts)
