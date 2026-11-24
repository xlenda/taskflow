# App Store Connect — o que colar em cada campo

Ficha: **Celeste: Manifestação** (ASC App ID 6833663415) na equipe
**VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA** (Team ID 68VRL5BCA7).
Preparado em 11/11/2026 a partir de `store-listing/`; atualizado em 24/11/2026
para a 1.0.2 com a assinatura do iPhone. Os textos abaixo são os mesmos
arquivos validados por `npm run verify:store` (o portão confere bloco a bloco)
e os mesmos do kit do dono em
`C:\Users\Sanches\Downloads\Celeste - assinatura iPhone\`; não edite só aqui.

Ordem sugerida: 1) Informações do app → 2) Preços e Assinaturas → 3) Privacidade
do app → 4) Página da versão 1.0.2 → 5) Compilação (depois do build) →
6) Adicionar para revisão. O passo a passo das assinaturas e do RevenueCat
(contrato de apps pagos, produtos, teste de 7 dias, chave `appl_...`) está no
`PASSO A PASSO.txt` do kit.

---

## 1. Geral → Informações do app

| Campo | Valor |
|---|---|
| Nome | `Celeste: Manifestação` (já criado) |
| Subtítulo | `Afirmações diárias e sonhos` |
| Categoria primária | Saúde e fitness |
| Categoria secundária | Estilo de vida |
| Direitos de conteúdo | **Não** contém, mostra nem acessa conteúdo de terceiros |
| Classificação etária | responder o questionário com a tabela abaixo (resultado esperado: 4+) |
| URL da política de privacidade | `https://celeste-jet-two.vercel.app/privacidade` |
| URL de opções de privacidade do usuário | deixar em branco |
| Idioma principal | Português (Brasil) |

Localização **Inglês (EUA)** (botão de idioma no topo da página da versão):
Nome `Celeste: Manifestation`, subtítulo `Daily affirmations & dreams`.

### Questionário de classificação etária (respostas)

| Pergunta | Resposta |
|---|---|
| Violência (desenho, realista, sangue), terror | Nenhum |
| Conteúdo sexual ou nudez, temas maduros/sugestivos | Nenhum |
| Palavrões ou humor grosseiro | Nenhum |
| Álcool, tabaco, drogas | Nenhum |
| Jogos de azar simulados, cassino, loot boxes | Nenhum / Não |
| Concursos | Não |
| Informações médicas ou de tratamento | Nenhuma |
| Acesso irrestrito à web | Não |
| Conteúdo gerado por usuários visível a outros | Não (não existe comunidade pública nesta versão) |
| Mensagens, chat ou encontros entre usuários | Não |
| Compras dentro do app | Sim (assinatura Celeste Premium, só no iPhone) |
| Anúncios | Não |

Se aparecer pergunta sobre "tópicos de saúde ou bem-estar", marcar a opção
mais leve: o app é reflexão e bem-estar, sem diagnóstico nem tratamento.

### Blocos de baixo da mesma página (vistos em 11/11/2026)

| Bloco | O que fazer |
|---|---|
| Documentação sobre a criptografia do app | **Nada.** `app.json` já declara `usesNonExemptEncryption: false` (vira a chave do Info.plist). O app só usa HTTPS do sistema, que é isento. Não clicar em "Carregar". |
| Regulamento dos Serviços Digitais (DSA) | Decisão do titular. "Não comerciante" (padrão) = o app **não aparece nos 27 países da União Europeia**, Portugal incluído; o resto do mundo segue normal. "Começar" = declarar a VenuzPay como comerciante: a Apple verifica telefone e e-mail por código e **mostra endereço, telefone e e-mail na página do app na UE**. Pode ser feito depois, sem nova revisão. |
| Dispositivos médicos regulamentados | Aparece porque a categoria é Saúde e fitness. Clicar em "Declarar dispositivo médico regulamentado" e responder que o app **não** é dispositivo médico regulamentado (sem diagnóstico nem tratamento). Obrigatório para continuar em alguns países. |
| Notificações do servidor da App Store | Colar a URL de notificações que o RevenueCat mostra (kit, `PASSO A PASSO.txt`). |
| Segredo compartilhado específico do app | Nada: o RevenueCat usa a chave de Compra no App (.p8), não o segredo compartilhado. |
| Informações adicionais | Nada. |

---

## 2. Monetização → Preços e disponibilidade

| Campo | Valor |
|---|---|
| Preço | Gratuito (BRL 0) |
| Disponibilidade | Todos os países e regiões |
| Pré-encomenda | Não |
| Distribuição em Mac com Apple Silicon | **Desmarcar** (app só de iPhone, não validado no Mac) |
| Disponível no Apple Vision Pro | **Desmarcar** |

O app continua gratuito para baixar; a cobrança é a assinatura dentro do app,
sempre pela Apple (In-App Purchase), nunca por link externo. Em
**Monetização → Assinaturas** (detalhe no `PASSO A PASSO.txt` do kit):

| Item | Valor |
|---|---|
| Grupo | `Celeste Premium` |
| Produto anual | `celeste_premium_annual`, 1 ano, oferta introdutória **teste grátis de 7 dias** |
| Produto mensal | `celeste_premium_monthly`, 1 mês, oferta introdutória **teste grátis de 7 dias** |
| Preço | definido só aqui (o app mostra o preço que a loja devolve; nenhum preço fica escrito no app nem na ficha) |
| Nome, descrição e notas de revisão de cada produto | textos prontos no kit (`TEXTOS APP STORE - INGLES/PORTUGUES.txt` e `NOTAS PARA A REVISAO DA APPLE.txt`) |

A primeira assinatura só é revisada junto com uma versão: anexe os dois
produtos na página da versão 1.0.2 (seção 4).

---

## 3. Confiança e segurança → Privacidade do app

"Este app coleta dados?" → **Sim**. Marcar só estes tipos:

| Tipo (categoria Apple) | Por quê | Uso | Vinculado à identidade | Rastreamento |
|---|---|---|---|---|
| Identificadores → **ID do usuário** | sessão técnica pseudônima que autoriza denúncias de IA e limita abuso | Funcionalidade do app | Não | Não |
| Conteúdo do usuário → **Outro conteúdo do usuário** | desejo, respostas do questionário, relato de sonho e texto para narrar, enviados ao servidor **só** depois que a pessoa liga a nuvem | Funcionalidade do app | Não | Não |
| Informações de contato → **Nome** | primeiro nome do questionário, enviado junto com os textos quando a nuvem está ligada | Funcionalidade do app | Não | Não |
| Compras → **Histórico de compras** | o RevenueCat recebe o histórico da assinatura (plano, datas, situação) com um ID anônimo da instalação, para confirmar a assinatura (só iPhone) | Funcionalidade do app **e** Análise (o RevenueCat manda marcar as duas) | Não | Não |

Tudo o mais: **não coletado** (saúde e fitness, áudio, localização, contatos,
histórico de navegação, dados de uso, diagnóstico). O microfone do
Plano Celeste reconhece a fala no aparelho e descarta áudio e transcrição; não
é coleta. Não existe SDK de analytics, crash ou anúncios no app.
"Este app rastreia?" → **Não**.

Essas respostas seguem `store-listing/privacy-review.md` e
`console-declarations.md`; quem assina é o titular. Em dúvida, prefira
declarar a mais (Apple reprova por declarar a menos, nunca por declarar a mais).

Acessibilidade do app (rótulos novos): opcional, pode pular nesta versão.

---

## 4. App para iOS → Versão 1.0.2 (a página "Preparar para envio")

### Prévias e capturas de tela

- Tamanho exigido (App Store Connect de 11/11/2026): a aba padrão é
  **"iPhone com Dynamic Island (tela média)"** e só aceita **1179 × 2556 px**
  ou 1206 × 2622 px (retrato). Os 1290 × 2796 px de `assets/final/apple` são
  recusados nessa aba ("As dimensões do arquivo são inválidas"); eles só entram
  pelo "Gerenciador de mídia", no slot de 6,9". Para gerar o tamanho da aba a
  partir dos finais (proporção idêntica, sem corte):
  `ffmpeg -i 01-anchor-scene.jpg -vf scale=1179:2556:flags=lanczos -q:v 2 saida.jpg`
  (uma vez por arquivo). Abas iPhone Duo, iPad e Apple Watch ficam vazias
  (`supportsTablet: false`).
- Arquivos: `store-listing/assets/final/apple/pt-BR/` (8 imagens, nesta ordem):
  1. `anchor-scene` — Uma cena feita das suas palavras
  2. `chosen-voice` — Ouça na voz que combina com você
  3. `personal-affirmations` — Afirmações feitas com suas respostas
  4. `bridge-today` — Um passo possível para hoje
  5. `one-minute-ritual` — Seu ritual em apenas um minuto
  6. `dream-affirmation` — Transforme sonhos em afirmações
  7. `living-mirror` — Veja seu caminho evoluir
  8. `private-traces` — Registre o que mudou de verdade
- Inglês: `store-listing/assets/final/apple/en-US/`, mesma ordem.
- Cabeçalho (5244 × 2950) e prévia em vídeo: opcionais, deixar vazios.
- iPad: não aparece (o app não suporta tablet).

### Textos em Português (Brasil), idioma principal

Texto promocional (170):

```
Coloque o fone: uma sessão guiada de 7 minutos com a sua cena e as suas afirmações, e uma jornada nova de 7 dias toda semana.
```

O que há de novo nesta versão (4.000):

```
Novidades da Celeste 1.0.2:

- Sessão guiada de 7 minutos: coloque o fone e a Celeste conduz a respiração, o seu desejo, a sua Cena-Âncora, três das suas afirmações e o passo de hoje.
- Uma jornada nova de 7 dias toda semana, com uma frase, uma afirmação e uma pequena ação para cada dia.
- A voz da Celeste no iPhone: com o seu consentimento, ouça o seu conteúdo na voz que você escolheu. O app agora também segue o idioma do seu iPhone.
- Celeste Premium no iPhone: 7 dias grátis para quem assina pela primeira vez; depois, renova automaticamente pelo preço mostrado no app, anual ou mensal. Cancele quando quiser em Ajustes, até 24 horas antes da renovação.

Se você usava a Celeste de graça: depois desta atualização, a Celeste no iPhone passa a pedir a assinatura. Você pode começar com 7 dias grátis, e as suas cenas, afirmações e registros continuam guardados no seu iPhone. Que bom ter você aqui desde o começo.
```

Descrição (4.000):

```
Suas afirmações deveriam soar como você, não como uma frase pronta.

Celeste transforma seus desejos, sonhos e palavras em uma prática pessoal de manifestação. Você recebe uma Cena-Âncora para ler ou ouvir, uma afirmação criada a partir das suas respostas e uma Ponte de Hoje: um passo pequeno, concreto e sob seu controle.

UMA SESSÃO DE 7 MINUTOS, UM TOQUE

Coloque o fone e toque uma vez. A Celeste conduz um minuto de respiração, o seu desejo, a sua Cena-Âncora, três das suas afirmações (diferentes a cada dia) e o passo de hoje da jornada da semana. Pausas em silêncio dão tempo para ficar na cena. No fim, um toque registra o seu dia.

UMA JORNADA NOVA TODA SEMANA

Toda semana chega um tema novo de 7 dias, como calma, foco, gratidão ou autoconfiança. Cada dia traz uma frase para ouvir, uma afirmação e uma pequena ação possível.

UMA CENA FEITA COM AS SUAS RESPOSTAS

Conte o que deseja, o que importa e como imagina esse futuro. A Celeste combina apenas detalhes relevantes para criar uma narrativa sensorial e pessoal. Você vê quais elementos foram usados e pode editar o título, a afirmação e a Ponte de Hoje.

OUÇA NA VOZ QUE COMBINA COM VOCÊ

Escolha o estilo de voz para narrar suas cenas e afirmações. A reprodução começa quando você toca em ouvir, e a mesma escolha acompanha seu conteúdo pessoal.

UM RITUAL QUE CABE NO SEU DIA

Volte ao que importa com o Ritual de Um Minuto. Leia ou ouça sua afirmação, escolha uma intenção e siga sem transformar autocuidado em mais uma tarefa pesada.

DA VISUALIZAÇÃO PARA A AÇÃO

Cada Cena-Âncora termina com uma Ponte de Hoje: uma ação curta e possível. Você pode ajustá-la à sua realidade e registrar o que aconteceu, não aconteceu ou precisa mudar nos Rastros de Mudança.

SONHOS TRANSFORMADOS COM CUIDADO

Conte um sonho, registre como acordou e escolha o que ele significa para você. A Celeste usa esses elementos para criar uma afirmação pessoal, sem dicionário de símbolos, previsão ou diagnóstico.

ACORDE COM AS SUAS PALAVRAS

Monte a sequência que você quer ouvir ao acordar: sua Cena-Âncora, visões e afirmações, na ordem que preferir. No iPhone com iOS 26 ou mais recente, a Celeste pode tocar a sua afirmação como despertador.

COM A CELESTE, VOCÊ PODE:

- fazer uma sessão guiada de 7 minutos com fone;
- começar uma jornada nova de 7 dias toda semana;
- criar Cena-Âncora, história e afirmação personalizadas;
- ouvir seu conteúdo na voz escolhida;
- praticar em um ritual diário de um minuto;
- seguir uma jornada pessoal de 21 dias;
- escolher e editar sua Ponte de Hoje;
- registrar Rastros de Mudança privados;
- transformar relatos de sonhos em novas afirmações;
- rever sua jornada e seus conteúdos favoritos;
- usar o app em português ou inglês.

VOCÊ MANTÉM O CONTROLE

A Celeste mostra os detalhes usados na personalização. Você pode editar ou excluir seus registros e decidir o que deseja guardar. Conteúdo pessoal não é publicado automaticamente.

CELESTE PREMIUM

Sua primeira Cena-Âncora é grátis. Para continuar usando a Celeste no iPhone, comece o Celeste Premium: quem assina pela primeira vez tem 7 dias grátis. Escolha anual ou mensal; o app mostra o preço na sua moeda antes de você confirmar. A cobrança é feita na sua conta Apple quando o teste termina. A assinatura renova automaticamente, a menos que você cancele até 24 horas antes do fim do período atual. Gerencie ou cancele quando quiser em Ajustes > seu nome > Assinaturas. Seu conteúdo continua guardado no seu iPhone.

Celeste é uma ferramenta de reflexão e bem-estar. Não prevê acontecimentos, não substitui terapia e não garante dinheiro, relacionamentos, saúde ou qualquer resultado.

Termos de Uso: https://celeste-jet-two.vercel.app/termos
Política de Privacidade: https://celeste-jet-two.vercel.app/privacidade
```

Palavras-chave (100 bytes, sem espaço depois da vírgula; não mudam):

```
positivas,visualização,prosperidade,amor,autoestima,metas,bem-estar,gratidão,rotina,motivação
```

### Textos em English (U.S.), botão de idioma no topo da página

Texto promocional (170):

```
Put on your headphones: a 7-minute guided session with your own scene and affirmations, plus a new 7-day journey every week.
```

O que há de novo nesta versão (4.000):

```
What's new in Celeste 1.0.2:

- 7-minute guided session: put on your headphones and Celeste guides you through breathing, your wish, your Anchor Scene, three of your affirmations and today's step.
- A new 7-day journey every week, with one line, one affirmation and one small action for each day.
- Celeste's voice on iPhone: with your consent, hear your content in the voice you chose. The app now also follows your iPhone's language.
- Celeste Premium on iPhone: 7 days free for new subscribers, then it renews automatically at the price shown in the app, yearly or monthly. Cancel anytime in Settings, at least 24 hours before the renewal.

If you have been using Celeste for free: after this update, Celeste on iPhone asks for a subscription. You can start with 7 free days, and your scenes, affirmations and records stay saved on your iPhone. We're glad you've been here from the start.
```

Descrição (4.000):

```
Your affirmations should sound like you, not like a stock phrase.

Celeste turns your wishes, dreams, and words into a personal manifestation practice. You receive an Anchor Scene to read or listen to, an affirmation shaped by your answers, and a Bridge for Today: one small, concrete step within your control.

A 7-MINUTE SESSION, ONE TAP

Put on your headphones and tap once. Celeste guides you through a minute of breathing, your wish, your Anchor Scene, three of your affirmations (a different set each day), and today's step from your weekly journey. Quiet pauses give you time to stay in the scene. At the end, one tap marks your day.

A NEW JOURNEY EVERY WEEK

Every week brings a new 7-day theme, such as calm, focus, gratitude, or self-confidence. Each day has one line to hear, one affirmation, and one small action you can actually do.

A SCENE MADE FROM YOUR ANSWERS

Share what you want, what matters, and how you imagine that future. Celeste combines only relevant details to create a personal sensory narrative. You can see which elements were used and edit the title, affirmation, and Bridge for Today.

LISTEN IN A VOICE THAT FEELS RIGHT

Choose a voice style for your scenes and affirmations. Playback starts when you tap play, and that same choice follows your personal content.

A RITUAL THAT FITS YOUR DAY

Return to what matters with the One-Minute Ritual. Read or listen to your affirmation, choose an intention, and move on without turning self-care into another heavy task.

FROM VISUALIZATION TO ACTION

Each Anchor Scene ends with a Bridge for Today: a short, possible action. Adapt it to your reality and record what happened, what did not, or what needs to change in Traces of Change.

DREAMS HANDLED WITH CARE

Share a dream, record how you felt when you woke up, and choose what it means to you. Celeste uses those elements to create a personal affirmation without symbol dictionaries, predictions, or diagnoses.

WAKE UP TO YOUR OWN WORDS

Build the sequence you want to hear when you wake up: your Anchor Scene, visions, and affirmations, in any order. On iPhone with iOS 26 or later, Celeste can play your affirmation as your alarm.

WITH CELESTE, YOU CAN:

- follow a 7-minute guided session with headphones;
- start a new 7-day journey every week;
- create a personalized Anchor Scene, story, and affirmation;
- listen to your content in your chosen voice;
- practice with a one-minute daily ritual;
- follow a personal 21-day journey;
- choose and edit your Bridge for Today;
- keep private Traces of Change;
- turn dream reflections into new affirmations;
- revisit your journey and favorite content;
- use the app in English or Portuguese.

YOU STAY IN CONTROL

Celeste shows which details were used for personalization. You can edit or delete your records and decide what to keep. Personal content is never posted automatically.

CELESTE PREMIUM

Your first Anchor Scene is free. To keep using Celeste on iPhone, start Celeste Premium: new subscribers get a 7-day free trial. Choose yearly or monthly; the app shows the price in your currency before you confirm. Payment is charged to your Apple Account when the trial ends. The subscription renews automatically unless you cancel at least 24 hours before the end of the current period. Manage or cancel anytime in Settings > your name > Subscriptions. Your content stays saved on your iPhone.

Celeste is a reflection and well-being tool. It does not predict events, replace therapy, or guarantee money, relationships, health, or any outcome.

Terms of Use: https://celeste-jet-two.vercel.app/terms
Privacy Policy: https://celeste-jet-two.vercel.app/privacy
```

Palavras-chave (100 bytes, sem espaço depois da vírgula; não mudam):

```
positive,visualization,prosperity,love,selfcare,goals,wellbeing,journal,mindset,routine,motivation
```

### URLs, versão e copyright

| Campo | Valor |
|---|---|
| URL de suporte | `https://celeste-jet-two.vercel.app/suporte` |
| URL de marketing | `https://celeste-jet-two.vercel.app` |
| Versão | `1.0.2` (igual ao `version` do app.json, senão o build não aparece na lista) |
| Compras dentro do app e assinaturas | anexar **Celeste Premium Anual** e **Celeste Premium Mensal** (a primeira assinatura só é revisada junto com a versão) |
| Copyright | `2026 VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA` |
| Arquivo de cobertura de roteamento | nenhum |
| Clipe de app / App para iMessage / Game Center | nada |

### Compilação

Gere e envie numa sessão só, num PowerShell aberto pelo titular, com o iPhone
na mão (código de 2 fatores):

```powershell
$env:CELESTE_NODE_HOME = 'C:\tmp\celeste-node24\node-v24.20.0-win-x64'
cd C:\projetos\TaskFlow
.\scripts\publicar-app-store.ps1 -StartBuild -Submit
```

Na 1ª vez o EAS pergunta: login Apple (payvenuz@gmail.com, senha, código),
o time (VENUZPAY, 68VRL5BCA7) se houver mais de um, certificado (Y), perfil
(Y), chave de push (Y) e, depois que o build entra na fila, a chave da API do
App Store Connect usada no envio (`[Add a new key]`). Não feche o terminal no
link do build: essa última pergunta vem depois, e o fim é "Build iOS
enfileirado com envio automatico ao TestFlight". As perguntas exigem um
terminal de verdade (o Claude Code não responde prompts do EAS). Da 2ª versão
em diante as credenciais e a chave ficam na Expo e
`-StartBuild -Submit -NonInteractive` roda sem perguntas.

Se o envio automático não acontecer: na 1ª release (12/11/2026) o build
terminou, a chave "[Expo] EAS Submit ..." foi criada na Apple, mas nenhum envio
foi agendado. Logo depois a Expo ainda não achava o app com a chave nova;
minutos depois achou. Conferir com `eas submit:list -p ios --json` (lista vazia
= não enviou) e `eas submit:status -p ios --json` (mostra os builds do
TestFlight). Com a chave já na Expo, o envio sai sem login:
`.\scripts\publicar-app-store.ps1 -Submit -NonInteractive` (manda o build
concluído do próprio commit).

A compilação aparece aqui depois que o build termina (15 a 30 min) e a Apple
processa o envio (mais 10 a 30 min). Clique em "Adicionar compilação" e
escolha a `1.0.2` nova. A pergunta de criptografia não aparece: o app já
declara `usesNonExemptEncryption: false`.

Aviso vermelho que não some em outra página (por exemplo "URL da Política de
privacidade - Este campo é obrigatório" em Privacidade do app, com a URL já
preenchida): é a lista da última tentativa de "Adicionar para revisão". Ela só
se refaz quando o botão é clicado de novo (confirmado em 11/11/2026).

### Informações para a equipe de revisão

| Campo | Valor |
|---|---|
| Início de sessão obrigatório | **Desmarcado** (o app inteiro funciona sem conta) |
| Nome / Sobrenome | quem atende o telefone durante a revisão (você) |
| Telefone | número com DDI que você atende, ex.: +55 77 99133-8581 |
| E-mail | um que você lê todo dia (`payvenuz@gmail.com` é o da conta) |
| Anexo | nenhum |

Notas (colar SÓ o inglês: a revisão da Apple lê em inglês e o campo tem limite
de 4.000 caracteres; apague o texto antigo inteiro, que dizia "No purchases"):

```
Celeste is a personal reflection and well-being app: affirmations, "Anchor Scene" visualizations, a one-minute ritual and a dream journal. New in 1.0.2: a 7-minute guided audio session and a new 7-day journey every week.

SUBSCRIPTION (new in 1.0.2, iPhone only)
- Celeste Premium: yearly and monthly auto-renewable subscriptions in one group, each with a 7-day free trial for new subscribers. Purchases use StoreKit through the RevenueCat SDK.
- Where to find it: open the app, answer the short onboarding and tap "Keep my anchor scene" on the reveal screen. The subscription screen appears right after. The onboarding and the first Anchor Scene are free; the rest of the app requires an active trial or subscription.
- The subscription screen shows the plan name, the App Store price in the user's currency, the trial length, what happens after the trial, auto-renewal, how to cancel (Settings > your name > Subscriptions, at least 24 hours before renewal) and links to Restore purchases, Terms of Use and Privacy Policy, visible in every state. The (i) button explains how the trial works.
- No account or sign-in is needed. Please test with a Sandbox Apple Account. "Restore purchases" is on the subscription screen; Profile > "Manage subscription" opens Apple's subscription settings.
- Version 1.0.1 was free and had no purchases, so nobody loses anything they paid for. People updating from 1.0.1 see the same subscription screen, and their content stays saved on the device.
- Ongoing value: a new 7-day journey every week (one line, one affirmation and one small action per day) and the daily 7-minute session.

OTHER NOTES
- All personal content stays on the device. Optional cloud features (AI-written texts and the chosen neural voice) run only after an explicit adult consent inside the app; on iPhone the server also requires App Attest. Without consent, Celeste uses texts assembled on the device and the system voice.
- The 7-minute session uses guide audio bundled in the app (headphones recommended) and keeps the screen on while it plays.
- Microphone: only in the "Celeste Plan" practice, after a separate tap, for on-device recognition of two repetitions of the affirmation shown on screen. Audio and transcript are discarded.
- Wake-up: on iOS 26+ the app can schedule a wake-up through AlarmKit; reminders use local notifications.
- No ads, no tracking and no analytics SDKs. The only new SDK is RevenueCat, which receives an anonymous app user ID and the purchase history to confirm the subscription.
- Celeste makes no medical, financial or predictive claims; it does not replace therapy.

Terms of Use: https://celeste-jet-two.vercel.app/terms
Privacy Policy: https://celeste-jet-two.vercel.app/privacy
Support: https://celeste-jet-two.vercel.app/support (suporte@celestegroup.biz)
Data controller: VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA (Brazil).
```

O que diz, em português (não colar):

> A Celeste é um app de reflexão e bem-estar. Novo na 1.0.2: sessão guiada de 7 minutos e uma jornada nova de 7 dias toda semana.
>
> ASSINATURA: Celeste Premium, anual e mensal, num grupo só, cada uma com 7 dias grátis para quem assina pela primeira vez, pela Apple, via RevenueCat. Onde achar: abrir o app, responder o questionário curto e tocar em "Guardar minha Cena-Âncora" na tela da revelação; a tela de assinatura aparece logo depois. O questionário e a primeira Cena-Âncora são grátis; o resto do app pede teste ou assinatura ativa. A tela mostra nome do plano, preço da App Store na moeda da pessoa, duração do teste, o que acontece depois, renovação automática, como cancelar e os links Restaurar compras, Termos e Privacidade, sempre visíveis. O botão (i) explica o teste. Não precisa de conta; testar com conta Sandbox da Apple. "Gerenciar assinatura" no Perfil abre os ajustes de assinatura da Apple. A 1.0.1 era grátis e não tinha compra: ninguém perde nada que pagou; quem atualiza vê a mesma tela e o conteúdo continua no aparelho. Valor contínuo: jornada nova toda semana e a sessão diária.
>
> OUTRAS NOTAS: conteúdo pessoal fica no aparelho; nuvem (textos por IA e voz neural) só com consentimento adulto e, no iPhone, com App Attest. A sessão usa áudio do guia embutido no app e mantém a tela acesa. Microfone só no Plano Celeste, reconhecimento no aparelho, nada salvo. Despertar pelo AlarmKit no iOS 26+. Sem anúncios, sem rastreamento, sem SDK de análise; o único SDK novo é o RevenueCat, que recebe um ID anônimo e o histórico de compra para confirmar a assinatura. Sem promessa médica, financeira ou de previsão.

As notas de revisão de cada produto (anual e mensal) estão em
`review-notes.md` e no `NOTAS PARA A REVISAO DA APPLE.txt` do kit.

### Lançamento da versão na App Store

**Lançar esta versão manualmente.** Assim a aprovação não publica sozinha e
você escolhe o dia (combinando com os criativos). Depois, "Lançar" leva
minutos para aparecer na loja.

---

## 5. Depois de "Adicionar para revisão"

- Prazo típico da Apple: 24 a 48 h. Rejeição comum nesta categoria: política
  de privacidade sem a empresa responsável (já resolvido) e alegação de
  resultado (a descrição não promete nada).
- TestFlight: antes de enviar para revisão, instale o build no seu iPhone pelo
  app TestFlight (aba TestFlight → Testadores internos → adicionar seu Apple
  ID) e confira voz, despertar, prática e a sessão de 7 minutos com fone. No
  TestFlight a compra é de teste (não cobra): assine, confira o teste de 7
  dias, toque em Restaurar compras e cancele. É a validação nativa que a ficha
  ainda não tem.
- Capturas: as de `assets/final/apple` vêm do app web no tamanho do iPhone.
  Se quiser, troque por capturas reais do TestFlight (Fotos → compartilhar →
  arrastar no ASC); o tamanho do iPhone 16 Pro Max (1320 × 2868) é aceito direto.
