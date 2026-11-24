# Celeste — Sessão de 7 minutos, Jornadas semanais e Assinatura no iPhone (24/11/2026)

## 1. Intenção e porquê

A Celeste 1.0.1 está na App Store de graça e não tem motivo forte para alguém voltar todo dia nem para pagar.
Esta entrega cria os dois:

- **Sessão de 7 minutos 🎧** — um toque, fone no ouvido, e a Celeste conduz o que já existe (respiração, desejo,
  Cena-Âncora, afirmações, jornada do dia, Ponte de Hoje, fechamento). É o hábito diário.
- **Jornadas semanais** — um tema novo a cada semana, com uma frase, uma afirmação e uma micro-ação por dia. É o
  motivo para continuar pagando.
- **Assinatura só no iPhone** — "7 dias grátis, depois cobra", pela Apple, via RevenueCat. Site e Android seguem
  de graça.

Tudo isto entra no MESMO build iOS, que sai como **1.0.2** (a 1.0.2 com voz ElevenLabs por App Attest já está
commitada e ainda não foi construída).

## 2. O que já existe (lido no código, base 7be0598)

| Peça | Onde | O que aproveito |
|---|---|---|
| Motor do despertar | `screens/WakeSequenceScreen.js` (666 linhas) | Itens em sequência, voz da Celeste com queda para a voz do aparelho e aviso, Traço Celeste (3 estrelas) no toque inicial, legenda que acompanha a voz, regras do toque do iPhone (nada é aguardado antes de a voz começar), tela acesa (`expo-keep-awake`), pausa/continuar/próximo/parar |
| Itens do despertar | `utils/wakeSequence.js` | Formato de item `{kind,id,title,text,lang,visualKey,category,manifestationId}` e `estimateListeningSeconds` (14 letras/s) |
| Voz | `utils/usePersonalNarration.js` → `context/NarrationContext.js` → `services/generateNarrationAudio.js` → `api/gerar-audio.js` | `playPersonal` (nuvem, ElevenLabs `eleven_multilingual_v2`, PCM 24 kHz em WAV) e `playPreview` (WAV **embutido** no app, carregado por `Asset.fromModule`) |
| Cache de voz no aparelho | `services/narrationAudioStorage.js` | Por texto+voz+idioma; 40 itens, 64 MB, expira com 30 dias sem uso |
| Vozes oferecidas | `constants/narrators.js` | **6** (aurora, rio, atlas, serena, luma, nilo) × PT/EN = **12** combinações |
| Cota do servidor | `api/_paid-access.js` | Cota diária por pessoa e global; iPhone só passa com App Attest |
| Prática e sequência de dias | `context/AppContext.js` | `logSession(id)` (marca o dia; a ofensiva sai de `sessions`), `toggleBridgeCompletion(id, dia)`, `addEvidence(id, texto)` (diário de sinais, 280 caracteres) |
| Ponte de Hoje | `utils/livingMirror.js` | `bridgeDoneOn`, `bridgeCompletions` |
| Afirmações dela | `utils/personalAffirmations.js` | `personalAffirmationsForState(state)` |
| Portão do app | `App.js` `RootNav` | `state.onboardingDone` decide entre a entrada e o app |
| Paywall atual | `screens/onboarding/PaywallScreen.js`, `constants/i18n.js` (pwP1–pwP3) | Diz que a assinatura não está ativa; o botão só conclui a entrada |
| Fronteira por plataforma | `constants/releaseFeatures.js` | `releaseFeaturesForPlatform(Platform.OS)` |
| Publicação iOS | `scripts/publicar-app-store.ps1` + `scripts/celeste-release-lib.ps1` | Confere login, projectId e variáveis do EAS (`Assert-CelesteEasProductionEnv`) antes do build |
| Termos e privacidade | `constants/legal.js`, `public/privacy`, `public/privacidade` | Hoje dizem "esta versão não cria assinatura paga"; não existe página pública de Termos |

Atenção a dois nomes que já existem: a aba **Jornada** (`JourneyScreen`, progresso e sinais) e
`utils/personalJourney.js` (a suíte 6+6). As jornadas novas se chamam **"Jornada da semana"** na tela e
`weeklyJourney` no código, para não colidir.

## 3. Objetivos, não-objetivos e anti-objetivos

**Objetivos**

1. Um cartão no topo da Home abre a sessão com um toque; ela dura cerca de 7 minutos e termina com um toque que
   registra o dia.
2. A sessão funciona na web, no iPhone e no Android, com a voz escolhida por ela ou, sem ela, com a voz do aparelho.
3. Toda semana um tema novo; todo dia uma frase falada, uma afirmação e uma micro-ação.
4. No iPhone, depois da revelação da Cena-Âncora, aparece o paywall honesto com 7 dias grátis; sem assinatura ou
   teste ativo o app fica atrás dele. Restaurar sempre ao alcance.
5. Nenhuma geração nova de ElevenLabs por pessoa por dia.

**Não-objetivos (fora desta entrega)**

- Assinatura no site ou no Android (ficam de graça).
- Checagem da assinatura no servidor (ver 6.E: teto conhecido, com caminho de subida).
- Lembrete local "seu teste termina em 2 dias" (boa ideia; fica para depois de medir cancelamentos).
- Tela própria para explorar jornadas passadas ou futuras; a jornada vive no cartão da Home e dentro da sessão.
- Áudio em segundo plano (a sessão segura a tela acesa, como o despertar hoje).
- Paywall remoto do RevenueCat (`react-native-purchases-ui`): a tela é nossa.

**Anti-objetivos (seria fracasso mesmo funcionando)**

- Segundo tocador copiado do despertar.
- Preço escrito no código. O app mostra o preço que a loja devolve, na moeda da pessoa.
- Contagem regressiva falsa, "só hoje", "restam 3 vagas", promessa de resultado, de saúde ou de dinheiro.
- Tela branca, travamento ou pessoa presa sem saída se o RevenueCat não responder.
- O módulo de compra entrar no build do Android (levaria a permissão de cobrança para a Play Store).
- Tela "cheia de escrita": é ícone, foto, número e rótulo curto; explicação só atrás do botão de informação.

## 4. Restrições

- JS (sem TypeScript), Expo SDK 57, React Native 0.86.3, RN Web. Textos sempre `{ en, pt }`.
- Única dependência nova: `react-native-purchases`.
- Todo portão é um script node em `scripts/` provado por **mutação** (cada mutação precisa derrubar o portão).
- Site publicado só por `scripts/deploy-web-from-vercel.ps1` (com `CELESTE_NODE_HOME`, Node 24); iPhone só por
  `scripts/publicar-app-store.ps1`. Quem publica é o coordenador. Arquivos `.ps1` ficam só em ASCII.
- Este PC grava CRLF no checkout: portões que procuram trecho de código normalizam `\r\n`.
- A chave da API do App Store Connect devolve 401: tudo no App Store Connect é feito pelo Lenda na tela.

## 5. Decisões do Lenda (literais, valem como lei)

1. Sessão de 7 minutos 🎧 com um toque, nesta ordem: ~1 min de respiração (guia), o desejo dela, a Cena-Âncora,
   3 afirmações que giram a cada dia (pela data, das afirmações dela), o trecho da jornada do dia, a Ponte de Hoje,
   fechamento. Pausas de silêncio honestas ("fique nesta cena") em vez de texto de enchimento. No fim, um toque
   registra o dia e oferece uma linha opcional de diário.
2. Reusar o motor do `WakeSequenceScreen`; não criar segundo tocador se um modo de sessão resolve.
3. Custo: nenhuma geração nova por pessoa por dia; as falas do guia são texto fixo.
4. Entradas: cartão no topo da Home; o despertar/alarme pode abrir a sessão.
5. Jornadas semanais de 7 dias, girando pela semana ISO, biblioteca embutida de 8 a 12 temas, sem promessa de saúde
   ou de resultado financeiro. Conteúdo escrito depois por uma tarefa de copy, em PT e EN.
6. Assinatura só no iPhone, teste grátis de 7 dias da Apple, via RevenueCat, uma permissão (`premium`). Quem já
   tem a 1.0.1 vê o mesmo paywall. Modelo de referência: a Stella (paywall logo depois da entrada).
7. Kit do dono com o que ele faz à mão no App Store Connect e no RevenueCat.

## 6. Desenho por parte

### A. Sessão de 7 minutos

**Um modo do mesmo motor.** `WakeSequenceScreen` recebe `route.params.mode === 'session'`. Nesse modo os itens
vêm de `sessionItemsForState(state, lang, dia)` (arquivo novo `utils/guidedSession.js`) em vez de
`wakeSequenceItemsForState`. O motor ganha só três coisas:

1. **Item com clipe embutido** (`item.clipId`): toca o arquivo do app pela mesma narração
   (`narration.playBundled`, irmão do `playPreview` que já existe). Se o clipe faltar ou falhar, a voz do aparelho
   lê `item.text` com o aviso que o motor já mostra.
2. **Pausa depois do item** (`item.pauseMs`): onde hoje há o respiro fixo de 900 ms (`GAP_MS`), entra a pausa do
   item, com um anel de contagem e o conteúdo parado na tela (`item.still`). "Próximo" pula a pausa; "Pausar" no
   silêncio já funciona (o motor continua do item seguinte).
3. **Cartão final da sessão**: registra o dia (abaixo).

**Roteiro e tempos** (alvo: 420 s). Falas do guia somam no máximo 450 caracteres por idioma.

| # | Item | Voz | Na tela | Pausa depois |
|---|---|---|---|---|
| 1 | `guide:breath` | clipe embutido | Anel de respiração | 60 s |
| 2 | `guide:desire` | clipe embutido | Ícone | respiro |
| 3 | O desejo dela (título da Cena-Âncora) | voz dela (cache) | O desejo, em serifa | 20 s |
| 4 | `guide:scene` | clipe embutido | Ícone | respiro |
| 5 | Cena-Âncora (a história) | voz dela (cache) | Cena viva com as palavras, como no despertar | **ajustável: 30 a 120 s** ("fique nesta cena") |
| 6 | `guide:affirm` | clipe embutido | Ícone | respiro |
| 7–9 | 3 afirmações do dia | voz dela (cache) | A afirmação | 20 s cada |
| 10 | Frase da jornada do dia | clipe embutido | Tema + "dia n de 7"; na pausa, a **afirmação do tema** | 30 s |
| 11 | `guide:bridge` | clipe embutido | Na pausa, a **micro-ação do dia** | 30 s |
| 12 | `guide:close` | clipe embutido | Ícone | fim |

A pausa da Cena-Âncora é a mola: `pausa = limitar(420 − (falas + outras pausas + respiros), 30, 120)`. Com uma
história de 700 caracteres dá ~114 s e a sessão fecha em 420 s; com 1.500 caracteres, ~57 s. O número que aparece
no cartão é sempre "7 min".

**Afirmações do dia.** `pickDailyAffirmations(lista, dia, 3)`: a lista são as afirmações dela
(`personalAffirmationsForState`, as 12 primeiras), o início é `(diasDesde1970 × 3) mod n`. Com 6 afirmações, dias
pares tocam 1–3 e ímpares 4–6. Mesmo dia, mesmas três; nada de sorteio.

**Uma voz só por sessão.** Com a voz da Celeste liberada (mesma regra do despertar: recurso disponível +
consentimento de nuvem), clipes e trechos pessoais saem na voz que ela escolheu. Sem ela, a voz do aparelho lê
tudo, inclusive o texto fixo do guia. Nunca misturo as duas de propósito; se a nuvem cair no meio, vale a queda
com aviso que já existe.

**Ponte de Hoje dentro da sessão** = a micro-ação do dia da jornada (muda todo dia, é o "passo pequeno de hoje").
Marcar "fiz" usa o mesmo `toggleBridgeCompletion` de sempre. A ponte fixa dela (`anchorStep`) continua onde está,
no ritual de 1 minuto.

**Fim: um toque registra o dia.** Cartão final com o botão "Registrar meu dia", um interruptor "Fiz a ponte" e
um campo de uma linha, opcional. O toque chama uma ação nova do contexto, `registerGuidedSession({ note, bridge })`,
que numa única gravação: marca a prática de hoje na Cena-Âncora (mesmo efeito de `logSession`), marca a ponte se
ela disse que fez, guarda a linha em `evidence` (mesmo formato de `addEvidence`) e grava
`state.guidedSession.lastDoneOn = hoje` (é o que deixa o cartão da Home em "feito hoje").

**Entradas.**
- Home: cartão no topo, antes da Cena-Âncora — foto da cena dela, ícone de fone, "7 min", rótulo "Sua sessão de 7
  minutos", tema da semana com "dia n de 7" e a ofensiva em número. Um toque abre a sessão. Botão de informação
  abre a explicação.
- Despertar: um interruptor em `AffirmationAlarmScreen`, "Abrir com a sessão de 7 minutos"
  (`morningRitual.wakeOpensSession`). Ligado, o lembrete/alarme abre `despertar/ouvir/session`; o cartão final do
  despertar comum também oferece a sessão.
- Sem Cena-Âncora (ela apagou): o cartão não aparece e o link direto mostra o estado vazio que já existe.

**Risco conhecido (iPhone no Safari).** Depois de uma pausa longa sem toque, o Safari pode recusar a voz do
aparelho; o motor já detecta em 4 s e oferece "Tocar de novo". O clipe embutido e a voz da nuvem usam o elemento
de áudio já destravado, que não sofre disso. Se a medição no iPhone real mostrar falha também ali, o conserto
previsto é tocar silêncio pelo mesmo elemento durante a pausa (`WEB_UNLOCK_WAVE` já existe).

### B. Áudio do guia — decisão: (a) arquivos gerados UMA vez e embutidos

**Por que não (b)** (texto fixo pela narração, cada aparelho paga uma vez): a frase da jornada muda todo dia
durante 8 semanas e o cache do aparelho guarda 40 itens por 30 dias. Na prática cada pessoa geraria uma frase
nova por dia para sempre — exatamente o que o Lenda proibiu — e ainda gastaria a cota diária dela no servidor.
Com mil pessoas ativas seriam ~2,8 milhões de caracteres por mês.

**O que é gerado:** por voz e por idioma, 6 falas do guia (≤ 450 caracteres) + 56 frases de jornada (8 temas × 7
dias, ≤ 80 caracteres cada). A afirmação do tema e a micro-ação **não** são faladas: aparecem na tela durante o
silêncio, que é a pausa honesta pedida.

| Conta | Valor |
|---|---|
| Caracteres por voz e idioma | até 450 + 56 × 80 = **4.930** |
| Combinações | 6 vozes × 2 idiomas = 12 |
| **Total, uma única vez** | **até 59.160 caracteres** (≈ 59 mil créditos; `eleven_multilingual_v2` cobra 1 crédito por caractere) |
| Custo | **US$ 0 de dinheiro novo** se a conta ainda tiver o saldo do plano Pro (a memória registra ~215 mil caracteres sobrando); a preço de plano equivale a ~US$ 12 |
| Arquivos | 62 por combinação = **744** |
| Peso no app | MP3 mono 48 kbps: até ~25 MB no total (portão trava em 28 MB) |

O script mostra a conta exata em `--dry-run` antes de gastar e só gera com `--confirm-chars <total>`. O
coordenador confere o saldo (`GET /v1/user/subscription`) e roda. Se o saldo não cobrir, é dinheiro novo: para e
pergunta ao Lenda.

**Por que MP3 e não WAV:** o tocador hoje só aceita WAV (PCM 24 kHz = 48 KB por segundo). As 744 falas em WAV
pesariam ~200 MB; o app inteiro tem 9 MB de arquivos. Em MP3 ficam em ~25 MB. O tocador ganha um reconhecimento
simples pelos primeiros bytes (WAV ou MP3) para dar o tipo e a extensão certos ao arquivo temporário.

**Como é gerado:** `scripts/gerar-audio-sessao.js` chama `requestElevenLabs` de `api/gerar-audio.js` (mesmas vozes,
mesmo modelo, mesmos ajustes da voz que ela já ouve) e converte o WAV para MP3 com o `ffmpeg` local. Nada de API
nova. Grava `assets/audio/sessao/<voz>/<idioma>/<clipe>.mp3`, um manifesto com o hash de cada texto e o mapa
`constants/sessionAudio.js` (gerado). Nomes só com `a-z0-9_` (no build de release do Android o caminho vira nome de
recurso).

**Texto mudou, áudio envelhece:** o portão compara o hash do texto atual com o do manifesto. Trocar uma vírgula
sem gerar de novo derruba o portão.

### C. Jornadas semanais

- Biblioteca em `constants/weeklyJourneys.js`: **8 temas no lançamento** (prosperidade, amor, autoconfiança, calma,
  foco, gratidão, propósito, lar). Cada tema: `id`, ícone, título `{pt,en}` e 7 dias de
  `{ line, affirmation, action }` em `{pt,en}`. Limites: frase 80, afirmação 70, micro-ação 90 caracteres.
  Crescer para 12 é só acrescentar texto e rodar o script de áudio; nenhum código muda.
- Giro: `weekSerial(dia)` = semanas inteiras desde a segunda-feira 05/01/1970; tema = `serial mod nº de temas`;
  dia da jornada = dia da semana ISO (segunda = 1). Conta contínua: não pula na virada do ano. Exemplo fixo do
  portão: 23/11/2026 (segunda) é a semana 2968 → tema 0, dia 1; 30/11/2026 → tema 1.
- Regras de conteúdo (o portão recusa): promessa de cura, doença, emagrecimento, ganho ou renda garantida,
  valores em dinheiro, "garantido"/"guaranteed", "cure", "heal".
- Vale em todas as plataformas. No iPhone está atrás da assinatura junto com o resto do app.

### D. Assinatura no iPhone

**D.1 Fronteira grátis × pago — decisão: paywall duro depois da revelação.**

No iPhone ficam de graça a entrada (boas-vindas, perguntas) e a **revelação da primeira Cena-Âncora**. Logo
depois vem o paywall com o teste de 7 dias. Sem teste ou assinatura ativa, o app inteiro fica atrás do paywall;
"Restaurar compras" está sempre na tela. Por quê:

1. É o modelo que o Lenda escolheu (Stella) e ela vê a cena dela **antes** de decidir: sabe o que está assinando.
2. **Um único portão** na raiz da navegação. Liberar "um pouco" de cada tela criaria dezenas de pontos para vazar
   conteúdo pago; um ponto só é auditável e testável.
3. A Apple aceita paywall duro com teste desde que preço, prazo, renovação, cancelamento, Restaurar, Termos e
   Privacidade estejam claros — e estão.
4. Os dados dela nunca saem do aparelho por causa do bloqueio; o paywall de quem volta diz isso.

Consequência assumida: quem usa a 1.0.1 de graça e atualiza encontra o paywall (decisão 6 do Lenda). Pode gerar
avaliação ruim de quem já usava; o texto de novidades da versão avisa com honestidade. O alarme do iPhone já
agendado continua tocando; abrir o app leva ao paywall.

**D.2 "Permissão" separada de "entrada concluída".**

`state.onboardingDone` continua significando só "terminou a entrada". A permissão **não** entra no estado salvo
nem no arquivo de exportar/importar (importar um arquivo nunca libera nada). Ela vive num contexto próprio
(`EntitlementProvider`), alimentado pelo RevenueCat:

| `status` | Quando |
|---|---|
| `active` | plataforma sem assinatura (site, Android) — fixo, sem carregar SDK; ou iPhone com `premium` ativo |
| `checking` | iPhone, consulta em andamento (no máximo 8 s) |
| `inactive` | iPhone, RevenueCat respondeu e não há `premium` ativo |
| `unavailable` | iPhone, chave ausente, SDK não configurou, sem resposta em 8 s ou sem internet e sem cache |

`accessFor({ subscription, onboarded, status })` decide a tela raiz:

| Plataforma com assinatura | Entrada concluída | `status` | Mostra |
|---|---|---|---|
| não | não | — | entrada |
| não | sim | — | app |
| sim | não | qualquer | entrada (o paywall é o último passo) |
| sim | sim | `checking` | tela de abertura que já existe (`AppBootState`) |
| sim | sim | `active` | app |
| sim | sim | `inactive` ou `unavailable` | paywall (só ele) |

No iPhone o botão do paywall só conclui a entrada (`completeOnboarding`) depois de compra ou restauração com
`premium` ativo. Se a permissão vencer com o app aberto, o ouvinte do RevenueCat troca para o paywall na hora.
Ao voltar para o primeiro plano o app consulta de novo.

**D.3 Se o RevenueCat falhar ou a chave faltar.**

- Site e Android: nunca carregam o SDK; seguem abertos (`active` fixo).
- iPhone: o paywall aparece com "Não foi possível carregar os planos", **Tentar de novo** e **Restaurar
  compras**. Nunca tela branca, nunca erro solto. Quem já assinou e está sem internet entra normalmente: o SDK
  guarda a última resposta no aparelho.
- Chave ausente em build de loja não deve existir: `publicar-app-store.ps1` recusa o build sem
  `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` no ambiente `production` do EAS, no formato `appl_…` (recusa também a chave
  de teste `test_…`).

**D.4 O paywall (Diretriz 3.1.2 da App Store).** Um arquivo novo, `screens/onboarding/SubscriptionPaywall.js`,
que `PaywallScreen` mostra quando `RELEASE_FEATURES.subscription`; fora do iPhone a tela de hoje continua igual.

Tela limpa: foto da Cena-Âncora dela no topo; três linhas de ícone + rótulo curto (🎧 Sessão de 7 minutos · 📅
Jornada nova toda semana · 🔔 Despertar com a sua cena); dois cartões de plano com **o preço da loja** em número
grande e o rótulo "por ano" / "por mês"; selo "7 dias grátis" só quando a loja diz que há teste **e** que ela tem
direito; botão; uma linha legal; três links. O botão de informação abre "Como funciona o teste".

O que a tela sempre mostra (o portão confere cada item):

| Exigência | Como aparece |
|---|---|
| Nome e duração do plano | "Anual" / "Mensal" (vêm do período do produto) |
| Preço | `product.priceString` da loja, nunca do código |
| Duração do teste | Lida do produto (`introPrice` grátis); só com direito confirmado |
| O que acontece depois | "{n} dias grátis, depois {preço} por {ano\|mês}." |
| Renovação automática | "Renova automaticamente até você cancelar." |
| Como cancelar | "Cancele quando quiser em Ajustes > seu nome > Assinaturas, até 24 h antes da renovação." |
| Restaurar | Link "Restaurar compras", em todos os estados da tela |
| Termos e Privacidade | Links para `/terms` (`/termos`) e `/privacy` (`/privacidade`) do site |

Sem direito ao teste (já usou): some o selo, o botão vira "Assinar por {preço}/{período}" e a linha legal começa
no preço. Compra cancelada por ela volta à tela sem mensagem de erro. Restaurar sem assinatura diz "Nenhuma
assinatura ativa nesta conta da Apple." Quem volta bloqueado lê "Seu conteúdo continua guardado neste iPhone."
Plano pré-selecionado: o primeiro da oferta do RevenueCat (o Lenda controla a ordem sem novo build).

Encantamento honesto: sem cronômetro, sem procura inventada, sem promessa de resultado. O portão procura e recusa
essas palavras na tela.

Para quem já assina: uma linha "Gerenciar assinatura" no Perfil abre `https://apps.apple.com/account/subscriptions`.

**D.5 Produtos, permissão e preço sugerido.** O app não conhece IDs de produto: mostra os pacotes da oferta atual
do RevenueCat. No código só existe o ID da permissão.

| Item | Valor |
|---|---|
| Permissão (RevenueCat) | `premium` |
| Oferta (RevenueCat) | `default`, com os pacotes `$rc_annual` e `$rc_monthly`, anual primeiro |
| Grupo de assinatura (Apple) | `Celeste Premium` |
| Produto anual | `celeste_premium_annual` — 1 ano, teste grátis de 7 dias — sugerido **US$ 29,99** (Brasil **R$ 99,90**) |
| Produto mensal | `celeste_premium_monthly` — 1 mês, teste grátis de 7 dias — sugerido **US$ 6,99** (Brasil **R$ 19,90**) |

Anual + mensal em vez de semanal: plano semanal converte, mas concentra pedido de reembolso e reclamação, e pesa
contra a doutrina do encantamento honesto. Preço é sugestão de partida; mudar não exige build.

**D.6 O SDK.** `react-native-purchases` **10.16.0**, versão exata (sem `^`). Motivos, lidos no changelog oficial
em 24/11/2026: a 11.0.0 (28/10) diz textualmente "Expo apps should stay on 10.x for now" e as mudanças da 11 são
do Android (que não usa o módulo); a 10.16.0 tem quatro semanas de estrada; a 10.16.1 saiu hoje e a 11.0.4 há
seis dias (novas demais). Exige React Native ≥ 0.73 (temos 0.86) e build de desenvolvimento/EAS (não Expo Go),
que é como a Celeste já é construída; a documentação pede Expo SDK 54 ou mais novo. Não usa plugin de
configuração. IDs de usuário anônimos do RevenueCat (sem `logIn`).

Isolamento por plataforma:
- Só `services/purchases.ios.js` importa `react-native-purchases`. `services/purchases.js` (site e Android) tem as
  mesmas funções e nenhuma importação do SDK: o Metro nem leva o pacote para esses pacotes.
- `react-native.config.js` desliga o módulo nativo no Android
  (`dependencies['react-native-purchases'].platforms.android = null`), para a permissão de cobrança do Google não
  entrar no AAB.

**D.7 Ver o paywall sem iPhone.** `EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW=1` num export local liga a assinatura na
web com planos de mentira marcados "PRÉVIA" (preço "0,00"). Serve só para conferir a tela a 390×844 e para o teste
automático. `scripts/deploy-celeste.js` recusa publicar com essa variável ligada.

### E. Servidor — decisão: não checar a assinatura no servidor agora (teto conhecido)

Hoje, no iPhone, as rotas pagas (voz e textos) exigem App Attest (binário oficial) e passam pelas cotas diárias
por pessoa e global. A assinatura será conferida **só no app**. Sou explícito sobre o que isso significa:

- **O que o servidor entrega no iPhone é o mesmo que entrega de graça no site e no Android**, sob as mesmas
  cotas. Furar o paywall do iPhone não dá acesso a nada que o site já não dê sem pagar; o custo continua limitado
  pelas cotas. A assinatura protege o **produto no iPhone**, não o custo do servidor.
- **Teto:** um iPhone com jailbreak (ou binário instrumentado) pode pular o portão do app e ainda passar no App
  Attest. Perda: uma assinatura não cobrada daquela pessoa. Aceitável nesta fase.
- **Quando subir:** no dia em que existir algo pago que só o servidor entrega, ou quando site/Android deixarem de
  ser grátis. **Como:** o app passa a chamar `Purchases.logIn(<id do usuário Supabase>)`; o servidor confere a
  permissão no RevenueCat (REST com a chave secreta, com cache curto, ou webhook gravando numa tabela) dentro de
  `authorizePaidRequest` para `clientKind === 'ios'`. Não muda nada no app além do `logIn`.
- A permissão nunca vem de dado que a pessoa controla (estado salvo, arquivo importado, parâmetro de link).

### F. Textos legais e ficha

- `constants/legal.js`: a seção de Termos "Acesso atual e pagamentos" passa a descrever a assinatura do iPhone
  (teste, renovação, cancelamento, reembolso pela Apple; site e Android grátis). A Privacidade ganha o RevenueCat
  e a Apple como processadores da compra (ID anônimo e histórico de compra; nenhum conteúdo dela) e perde
  "pagamentos não estão ativos".
- Páginas públicas novas `public/terms/` e `public/termos/`, no molde das de privacidade, com reescrita no
  `vercel.json`; as de privacidade são atualizadas. É o link de Termos do paywall e da ficha.
- `store-listing/` (en-US e pt-BR, notas de revisão, revisão de privacidade, roteiro de preenchimento) passa a
  falar da sessão de 7 minutos e da assinatura, mantendo `verify:store` verde.

### G. Kit do dono

Pasta `C:\Users\Sanches\Downloads\Celeste - assinatura iPhone\`, em PT-BR, passo a passo com o nome exato de cada
tela e campo: Contrato de Apps Pagos + banco + impostos; grupo de assinatura; os dois produtos com a oferta
introdutória de 7 dias grátis; preços; nome e descrição localizados (EN e PT); captura e notas de revisão de cada
assinatura; anexar as assinaturas à versão 1.0.2; período de carência de cobrança; rótulo de privacidade
(Compras); chave de Compra no App (.p8) para o RevenueCat; no RevenueCat: conta grátis, projeto, app iOS,
permissão `premium`, produtos, oferta `default`, URL de notificações da Apple, e a **chave pública do iOS
(`appl_…`) para entregar ao Claude**; teste de compra no TestFlight antes de enviar para revisão. Mais os textos
novos da ficha em inglês e português (o kit em inglês existente é atualizado).

## 7. Decisões que tomei (o Lenda pode corrigir)

1. **Paywall duro depois da revelação** no iPhone; nada de camada grátis (D.1).
2. **Áudio do guia embutido**, MP3, gerado uma vez: até 59 mil caracteres, sem dinheiro novo se o saldo do plano
   cobrir (B).
3. **Só a frase da jornada é falada**; a afirmação do tema e a micro-ação aparecem no silêncio (B).
4. **8 temas** no lançamento (o pedido aceitava 8 a 12): metade do áudio e do texto; cresce sem código (C).
5. **Ponte de Hoje na sessão = micro-ação da jornada** (A).
6. **Anual US$ 29,99 + mensal US$ 6,99**, os dois com 7 dias grátis; sem plano semanal (D.5).
7. **`react-native-purchases` 10.16.0** exata (D.6).
8. **Sem checagem no servidor agora**, com o caminho de subida escrito (E).
9. **Uma voz só por sessão** (A).
10. **Fora do iPhone o paywall de hoje não muda** (continua "acesso aberto").
11. **Sem lembrete de fim de teste** nesta entrega.

## 8. Verificação (prova, não afirmação)

| Portão (novo) | Prova |
|---|---|
| `scripts/verificar-jornada-semanal.js` | Giro por semana e dia com datas fixas, virada de ano, limites e palavras proibidas do conteúdo, orçamento de 450 caracteres do guia |
| `scripts/verificar-audio-sessao.js` | 744 arquivos, todos MP3, hash do texto = manifesto, nomes válidos, mapa completo, ≤ 28 MB; tocador reconhece WAV e MP3 |
| `scripts/verificar-sessao-7min.js` | Ordem dos itens, 3 afirmações determinísticas, tempo total entre 400 e 440 s no estado de referência, registro do dia numa gravação só, modo de sessão no motor sem segundo tocador |
| `scripts/verificar-assinatura.js` | Tabela de acesso inteira, permissão fora do estado salvo, só `purchases.ios.js` importa o SDK, Android desligado, versão exata, métodos usados existem no `.d.ts` instalado, itens da 3.1.2 nos textos, sem preço no código, palavras proibidas, checagem do `.ps1` (e ASCII), trava da prévia no deploy |
| `scripts/e2e-sessao.js` | Navegador, usuária nova, 390×844: cartão da Home → sessão → fim → registrar → cartão "feito hoje" |

Cada portão lista suas mutações no plano; uma mutação que não derruba o portão é defeito do portão.

Portões que já existem e precisam continuar verdes: `verify:store`, `verify:public-pages`, `verify:paywall`,
`verify:android-release`, `verify:narrators`, `verify:audio-playback`, `verify:deploy-pipeline`,
`verificar-despertar-sequencia.js`, `i18n-parity.js`, `caca-ingles.js`.

Fim da entrega (coordenador): todos os portões verdes → publicar o site → teste Playwright como usuária nova a
390×844 em produção → conferir com os próprios olhos o paywall na prévia local → revisão de código → juntar no
master. O build do iPhone é do Lenda, depois do kit; a compra é provada no TestFlight antes da revisão da Apple.

## 9. Riscos e tetos conhecidos

| Risco | Tratamento |
|---|---|
| CocoaPods fica só-leitura em 02/12/2026 | Os pods já publicados continuam instaláveis; a 10.16.0 depende de pods publicados em outubro |
| Safari do iPhone e pausa longa | Detectado pelo motor ("Tocar de novo"); conserto previsto em A |
| +25 MB no app | Portão de 28 MB; MP3 48 kbps mono |
| Clipe embutido no AAB de release | Reusa o carregador dos previews de voz; provar na trilha interna quando o Android for construído |
| Usuárias da 1.0.1 bloqueadas | Decisão do Lenda; texto de novidades honesto; dados preservados |
| Jailbreak pula o paywall | Teto aceito (E) |
| Preço e teste dependem do cadastro na Apple | A tela lê tudo da loja; sem produto aprovado mostra "Tentar de novo" |
