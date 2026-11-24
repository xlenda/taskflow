# Sessão de 7 minutos, Jornadas semanais e Assinatura no iPhone — plano

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: superpowers:subagent-driven-development (recomendada) ou
> superpowers:executing-plans, tarefa por tarefa. Os passos usam caixas (`- [ ]`).

**Goal:** um toque na Home abre uma sessão guiada de ~7 minutos; toda semana há uma jornada nova; no iPhone o app
fica atrás de um paywall honesto com 7 dias grátis (RevenueCat). Tudo no build iOS 1.0.2.

**Arquitetura:** a sessão é um **modo** do `WakeSequenceScreen` (itens novos vindos de `utils/guidedSession.js`,
clipes embutidos tocados pela narração que já existe, pausa por item). As jornadas são texto embutido girado pela
data. A assinatura é um contexto separado do estado salvo (`EntitlementProvider`), com um único portão em
`RootNav`; só `services/purchases.ios.js` conhece o SDK.

**Stack:** Expo SDK 57, React Native 0.86.3, RN Web, JS. Única dependência nova: `react-native-purchases@10.16.0`
(exata). Portões em node (`scripts/`), no molde de `scripts/verificar-despertar-sequencia.js` (Babel nos arquivos
do projeto, leitura normalizando `\r\n`).

**Desenho:** `docs/superpowers/specs/2026-11-24-celeste-sessao-7min-jornadas-assinatura-design.md` (ler antes).

**Fontes lidas (24/11/2026):** changelog oficial do `react-native-purchases` (11.0.0: "Expo apps should stay on
10.x for now"; mínimo RN 0.73 na 10.x), registro do npm (10.16.0 de 27/10; 10.16.1 de hoje; 11.0.4 de 18/11),
revenuecat.com/docs/getting-started/installation/expo (Expo SDK 54+, build de desenvolvimento, `npx expo install
react-native-purchases`). **Nenhuma chamada do SDK neste plano foi adivinhada para valer:** a Tarefa 8 confere
cada nome no `.d.ts` do pacote instalado e o portão trava se algum não existir.

## Regras para todas as tarefas

- Ramo `feat/sessao-7min-assinatura`. Commit com caminhos explícitos e `git commit -F <arquivo>`; a mensagem termina
  com a linha `Co-Authored-By` do modelo que implementou. Nunca `git add -A` (há capturas de tela modificadas no
  diretório de trabalho que não são desta entrega). Nunca push, deploy ou build: são do coordenador.
- Textos sempre `{ pt, en }`. Tela limpa: ícone, foto, número, rótulo curto; explicação só atrás do botão ⓘ.
- Menor mudança que funciona. Nenhuma abstração com uma implementação só. Nenhuma dependência além do RevenueCat.
- Todo portão novo entra em `package.json` e é provado por mutação: aplicar cada mutação listada, ver o portão
  cair, desfazer. Colar no relato a saída de cada queda.
- Antes de declarar pronto: rodar o portão da tarefa **e** `node scripts/i18n-parity.js` e `node scripts/caca-ingles.js`.

## Mapa de arquivos

| Arquivo | Papel | Tarefa |
|---|---|---|
| `utils/weeklyJourney.js` (novo) | Semana, dia e tema pela data | 1 |
| `constants/weeklyJourneys.js` (novo) | Biblioteca de temas | 1 (molde), 2 (conteúdo) |
| `constants/sessionGuide.js` (novo) | 6 falas fixas do guia | 1 (molde), 2 (conteúdo) |
| `scripts/gerar-audio-sessao.js` (novo) | Gera os MP3 uma vez | 3 |
| `constants/sessionAudio.js` (gerado) | Mapa `require()` dos clipes | 3 |
| `services/generateNarrationAudio.js`, `context/NarrationContext.js` | Tocar clipe embutido, WAV ou MP3 | 4 |
| `utils/guidedSession.js` (novo) | Itens, tempos, afirmações do dia, registro | 5 |
| `screens/WakeSequenceScreen.js`, `context/AppContext.js` | Modo sessão, cartão final, `registerGuidedSession` | 6 |
| `screens/HomeScreen.js`, `screens/AffirmationAlarmScreen.js`, `services/wakeReminders.js`, `App.js` (linking) | Entradas | 7 |
| `utils/entitlement.js`, `services/purchases.js`, `services/purchases.ios.js`, `react-native.config.js` (novos) | Compra e permissão | 8 |
| `context/EntitlementContext.js` (novo), `App.js` (`RootNav`), `constants/releaseFeatures.js` | Portão | 9 |
| `screens/onboarding/SubscriptionPaywall.js` (novo), `screens/onboarding/PaywallScreen.js`, `screens/ProfileScreen.js` | Paywall | 10 |
| `constants/legal.js`, `public/terms`, `public/termos`, `public/privacy`, `public/privacidade`, `vercel.json` | Legal | 11 |
| `scripts/publicar-app-store.ps1`, `scripts/celeste-release-lib.ps1`, `store-listing/` | Build e ficha | 12 |

Frentes que não se pisam: **A** (Tarefas 1→2→3/4→5→6→7) e **B** (8→9→10→11→12). `App.js` é tocado pela 7
(só `linking`) e pela 9 (só `RootNav` e provedores): quem chegar depois rebaseia.

---

## Frente A — Sessão e jornadas

### Tarefa 1 — Jornada semanal: lógica, moldes e portão · **Opus**

**Arquivos:** criar `utils/weeklyJourney.js`, `constants/weeklyJourneys.js`, `constants/sessionGuide.js`,
`scripts/verificar-jornada-semanal.js`; alterar `package.json` (`"verify:weekly-journey"`).

**Interfaces**

```js
// utils/weeklyJourney.js  ('YYYY-MM-DD' lido como data pura, via Date.UTC; sem fuso)
export const JOURNEY_LIMITS = { line: 80, affirmation: 70, action: 90 };
export function daysSinceEpoch(dayISO)            // 1970-01-01 -> 0; inválido -> null
export function weekSerial(dayISO)                // floor((dias - 4) / 7); 1970-01-05 é segunda
export function weekdayIndex(dayISO)              // segunda 0 ... domingo 6
export function journeyClipId(themeId, dayIndex)  // `j_${themeId}_${dayIndex + 1}`
export function journeyForDay(dayISO, journeys = WEEKLY_JOURNEYS)
// -> { theme, dayIndex, day: { line, affirmation, action }, clipId } | null (biblioteca vazia ou dia inválido)

// constants/weeklyJourneys.js
export const WEEKLY_JOURNEYS = [{ id, icon, title: {pt,en}, days: [{ line:{pt,en}, affirmation:{pt,en}, action:{pt,en} } /* x7 */] }];
// id: /^[a-z0-9_]+$/ ; icon: nome do Ionicons

// constants/sessionGuide.js
export const SESSION_GUIDE_CLIPS = ['breath', 'desire', 'scene', 'affirm', 'bridge', 'close'];
export const SESSION_GUIDE = { breath: {pt,en}, desire: {pt,en}, scene: {pt,en}, affirm: {pt,en}, bridge: {pt,en}, close: {pt,en} };
export const SESSION_GUIDE_MAX_CHARS = 450;   // soma por idioma; cada fala <= 160
```

- [ ] **Passo 1 — portão que falha.** `scripts/verificar-jornada-semanal.js` com duas partes; `--logica` roda só a
  primeira.
  - Lógica (com uma biblioteca de teste de 8 temas feita no próprio portão):
    `daysSinceEpoch('2026-11-23') === 20780`; `weekSerial('2026-11-23') === 2968`;
    `weekdayIndex` de 23/11/2026 = 0, 24/11 = 1, 29/11 = 6; `journeyForDay('2026-11-23')` → tema de índice 0,
    `dayIndex` 0, `clipId` `j_<id>_1`; 29/11 → mesmo tema, `dayIndex` 6; 30/11 → tema 1;
    virada de ano: 28/12/2026 e 03/01/2027 → mesmo tema (índice 5); 04/01/2027 → índice 6;
    dia inválido (`'2026-13-40'`, `null`) → `null`; biblioteca vazia → `null`.
  - Conteúdo (biblioteca real): 8 a 12 temas; ids únicos em `/^[a-z0-9_]+$/`; 7 dias cada; os três campos em `pt`
    e `en`, não vazios, dentro de `JOURNEY_LIMITS`; nenhuma frase repetida na biblioteca; nenhuma palavra proibida
    (`/\bcur[ae]r?\b|doença|emagre|renda garantida|garantid|guarantee|\bcure\b|\bheal|R\$|US\$|\$\d/i`);
    guia: as 6 falas em `pt` e `en`, cada uma ≤ 160, soma por idioma ≤ 450.
- [ ] **Passo 2 — rodar e ver falhar:** `node scripts/verificar-jornada-semanal.js --logica` → erro de módulo ausente.
- [ ] **Passo 3 — implementar** `utils/weeklyJourney.js`; criar `constants/weeklyJourneys.js` com `[]` e
  `constants/sessionGuide.js` com as chaves e textos vazios (o conteúdo é da Tarefa 2).
- [ ] **Passo 4 — rodar:** `node scripts/verificar-jornada-semanal.js --logica` → `jornada semanal (logica): ok`.
  Sem `--logica` ainda falha em "8 a 12 temas" (esperado até a Tarefa 2).
- [ ] **Passo 5 — mutações** (cada uma derruba `--logica`): M1 `- 4` vira `- 3` em `weekSerial`; M2
  `% journeys.length` vira `% 7`; M3 `weekdayIndex` devolve domingo 0; M4 `journeyClipId` sem o `+ 1`.
- [ ] **Passo 6 — commit:** `feat(jornada): giro semanal por data e moldes do conteudo`.

### Tarefa 2 — Conteúdo: 8 jornadas e as falas do guia · **Opus (copy)**

**Arquivos:** alterar `constants/weeklyJourneys.js`, `constants/sessionGuide.js`.

- 8 temas, nesta ordem: `prosperidade`, `amor`, `autoconfianca`, `calma`, `foco`, `gratidao`, `proposito`, `lar`
  (títulos: Prosperidade/Prosperity, Amor/Love, Autoconfiança/Self-confidence, Calma/Calm, Foco/Focus,
  Gratidão/Gratitude, Propósito/Purpose, Lar/Home).
- Cada dia: `line` (falada, ≤ 80; abre o tema do dia, segunda pessoa, presente), `affirmation` (≤ 70, primeira
  pessoa, presente), `action` (≤ 90, um gesto que cabe em 5 minutos **hoje**, começando por verbo).
- Os 7 dias de um tema formam um arco (do notar ao agir), não sete frases soltas.
- Inglês escrito como inglês nativo, não tradução ao pé da letra.
- Guia (≤ 450 caracteres por idioma no total): `breath` conduz a respiração e avisa o silêncio; `desire`, `scene`,
  `affirm`, `bridge` são passagens de uma frase; `close` fecha e convida a registrar. Nada de enchimento: quem
  segura o tempo é o silêncio.
- Proibido: promessa de resultado, de saúde, de dinheiro; "universo vai te dar"; urgência. Prosperidade fala de
  relação com abundância e atenção, nunca de ganho.

- [ ] **Passo 1 — rodar e ver falhar:** `node scripts/verificar-jornada-semanal.js` → falha em "8 a 12 temas".
- [ ] **Passo 2 — escrever** o conteúdo.
- [ ] **Passo 3 — rodar:** `node scripts/verificar-jornada-semanal.js` → `jornada semanal: ok (8 temas, 56 dias)`.
- [ ] **Passo 4 — mutações de conteúdo:** M5 uma `line` com 81 caracteres; M6 "cura" numa `affirmation`; M7 apagar
  o `en` de uma `action`; M8 repetir uma `line`; M9 fala do guia que leva a soma a 451.
- [ ] **Passo 5 — commit:** `feat(jornada): oito jornadas semanais e falas do guia em pt e en`.

> **Parada do coordenador (C1):** ler o conteúdo inteiro. Só depois de aprovado o texto a Tarefa 3 gera áudio
> (texto mudado depois = áudio pago de novo).

### Tarefa 3 — Áudio embutido: script, mapa e portão · **Sonnet**

**Arquivos:** criar `scripts/gerar-audio-sessao.js`, `scripts/verificar-audio-sessao.js`,
`constants/sessionAudio.js` (gerado), `assets/audio/sessao/manifest.json` (gerado); alterar `package.json`
(`"verify:session-audio"`).

**Contrato**

```
assets/audio/sessao/<narrador>/<pt|en>/<clipe>.mp3      clipe: breath|desire|scene|affirm|bridge|close|j_<tema>_<1..7>
assets/audio/sessao/manifest.json   { model, format: 'mp3-48k-mono-24000', entries: { '<narrador>/<lang>/<clipe>': { textSha256, chars, bytes } } }
constants/sessionAudio.js           // GERADO. export function sessionClipModule(narratorId, lang, clipId) -> módulo do require() | null
```

`gerar-audio-sessao.js`:
- Fonte dos textos: `SESSION_GUIDE` e `WEEKLY_JOURNEYS[*].days[*].line`. Narradores: `NARRATORS` de
  `constants/narrators.js` (6). Total esperado: 62 clipes × 12 = **744**.
- `--dry-run`: sem rede; imprime caracteres por narrador/idioma, total a gerar (só entradas faltando ou com
  `textSha256` diferente) e `total: <N>`.
- Gerar exige `ELEVENLABS_API_KEY` no ambiente e `--confirm-chars <N>` igual ao total do `--dry-run`; diferente → sai
  sem chamar a rede.
- Usa `requestElevenLabs(input, configuredModel(), apiKey, false)` e a validação de entrada de
  `api/gerar-audio.js` (mesma voz e ajustes do app). O WAV devolvido passa por
  `ffmpeg -i pipe:0 -ac 1 -ar 24000 -b:a 48k -f mp3 pipe:1`. Dois pedidos por vez; 429 espera e repete; retoma de
  onde parou. Nunca imprime a chave.
- Ao fim reescreve o manifesto e `constants/sessionAudio.js` (um `require()` literal por arquivo existente).
- Sem áudio gerado, `sessionClipModule` devolve `null` para tudo (o app cai na voz do aparelho).

- [ ] **Passo 1 — portão que falha.** `verificar-audio-sessao.js`:
  conjunto esperado (6 narradores × 2 idiomas × 62 clipes) = arquivos existentes = entradas do manifesto =
  `require()` do mapa; cada arquivo começa com `ID3` ou com sincronismo MP3 (`0xFF`, `(b1 & 0xE0) === 0xE0`);
  `textSha256` do manifesto = sha256 do texto atual; nomes em `/^[a-z0-9_]+\.mp3$/`; soma dos bytes ≤ 28.000.000;
  `--estrutura` confere só o script e o mapa (dry-run soma até 59.160; sem `--confirm-chars` não gera).
- [ ] **Passo 2 — rodar e ver falhar:** `node scripts/verificar-audio-sessao.js --estrutura` → módulo ausente.
- [ ] **Passo 3 — implementar** o script e gerar o mapa vazio.
- [ ] **Passo 4 — rodar:** `node scripts/gerar-audio-sessao.js --dry-run` → `total: <N>` com N ≤ 59160;
  `node scripts/verificar-audio-sessao.js --estrutura` → `audio da sessao (estrutura): ok`.
- [ ] **Passo 5 — commit:** `feat(sessao): script e portao do audio embutido`.

> **Parada do coordenador (C2):** conferir saldo do ElevenLabs, rodar a geração (diz ao Lenda quanto gastou),
> ouvir uma amostra de cada voz, rodar `node scripts/verificar-audio-sessao.js` → `audio da sessao: ok (744 clipes,
> <MB>)`, provar as mutações M1 trocar um caractere de uma fala do guia; M2 apagar um MP3; M3 renomear um arquivo
> com hífen; M4 pôr bytes de WAV num `.mp3`; M5 tirar um `require()` do mapa. Commit dos MP3, manifesto e mapa.
> Se o saldo não cobrir: é dinheiro novo, parar e perguntar ao Lenda.

### Tarefa 4 — Tocador aceita clipe embutido (WAV ou MP3) · **Opus**

Pode correr em paralelo com a 3 (depende só do contrato de `sessionClipModule`).

**Arquivos:** alterar `services/generateNarrationAudio.js`, `context/NarrationContext.js`,
`scripts/verificar-audio-sessao.js` (parte "tocador"); manter verdes `verify:audio-playback` e `verify:narrators`.

**Interfaces**

```js
// services/generateNarrationAudio.js
export function audioKindOf(bytes)   // 'wav' | 'mp3' | null  (RIFF....WAVE; 'ID3' ou sincronismo MP3)
// requestNarrationAudio aceita mode: 'bundled' com { narratorId, lang, clipId, clipLoaderImpl }:
//   carrega o módulo de sessionClipModule pelo MESMO caminho de loadNarratorPreview (Asset.fromModule + bytes);
//   sem módulo -> NarrationRequestError('clip_unavailable'); chave de memória inclui clipId; nunca usa a rede.

// context/NarrationContext.js
playBundled({ clipId, narratorId, lang, playbackId })   // irmão de playPreview: start({ mode: 'bundled', ... })
// temporaryAudioSource: tipo 'audio/mpeg' e extensão .mp3 quando audioKindOf(bytes) === 'mp3'; WAV como hoje.
```

- [ ] **Passo 1 — teste que falha** (parte "tocador" do portão): `audioKindOf` em bytes WAV, MP3 com `ID3`, MP3
  sem etiqueta e lixo → `'wav'`, `'mp3'`, `'mp3'`, `null`; `requestNarrationAudio({ mode: 'bundled', clipId:
  'breath', clipLoaderImpl })` devolve os bytes do carregador **sem** chamar `fetchImpl`; clipe inexistente →
  `clip_unavailable`; dois clipes diferentes não dividem cache; `mode: 'personal'` continua recusando resposta que
  não é WAV; o fonte do contexto exporta `playBundled` e escolhe tipo/extensão por `audioKindOf`.
- [ ] **Passo 2 — ver falhar:** `node scripts/verificar-audio-sessao.js --tocador`.
- [ ] **Passo 3 — implementar.**
- [ ] **Passo 4 — rodar:** `--tocador` → `audio da sessao (tocador): ok`; `npm run verify:audio-playback` e
  `npm run verify:narrators` → verdes.
- [ ] **Passo 5 — mutações:** M6 `audioKindOf` devolve sempre `'wav'`; M7 chave de memória sem `clipId`; M8 modo
  `bundled` chamando `fetchImpl`; M9 `personal` aceitando MP3.
- [ ] **Passo 6 — commit:** `feat(voz): narracao toca clipe embutido em wav ou mp3`.

### Tarefa 5 — Sessão: itens, tempos e registro (lógica pura) · **Opus**

**Arquivos:** criar `utils/guidedSession.js`, `scripts/verificar-sessao-7min.js`; alterar `package.json`
(`"verify:session"`).

**Interfaces**

```js
export const SESSION_TARGET_SECONDS = 420;
export const SESSION_PAUSE_MS = { breath: 60000, desire: 20000, affirmation: 20000, journey: 30000, bridge: 30000 };
export const SCENE_PAUSE_RANGE_MS = [30000, 120000];
export const SESSION_AFFIRMATIONS = 3;
export const SESSION_AFFIRMATION_POOL = 12;

export function pickDailyAffirmations(pool, dayISO, count = SESSION_AFFIRMATIONS)
// n <= count -> pool inteira; senão começa em (daysSinceEpoch(dia) * count) % n e segue em roda.

export function sessionItemsForState(state, lang, dayISO)
// [] sem Cena-Âncora. Senão, nesta ordem:
// guide:breath, guide:desire, desire, guide:scene, anchor, guide:affirm, affirmation x(até 3), journey, guide:bridge, guide:close
// item: { kind: 'guide'|'desire'|'anchor'|'affirmation'|'journey', id, title, text, lang,
//         clipId?,                       // guide e journey
//         pauseMs?,                      // ausente = respiro normal do motor
//         still?: { kind: 'breath'|'text'|'scene', label: {pt,en}, text? },
//         visualKey?, category?, manifestationId? }   // anchor: os mesmos campos do item do despertar
// O item 'anchor' reusa a opção de wakeSequenceOptionsForState (mesmo id, mesma história, mesma imagem).
// 'desire'.text = título da Cena-Âncora no idioma; 'journey'.still.text = afirmação do tema;
// 'guide:bridge'.still.text = micro-ação do dia. Sem jornada (biblioteca vazia): sem item 'journey' e a ponte sem still.

export function sessionSeconds(items)   // falas (text.length / 14) + pausas + 0,9 s por item sem pauseMs (menos o último)
// A pausa do item 'anchor' é calculada aqui dentro de sessionItemsForState:
// limitar(420 s - tudo o mais, 30 s, 120 s).

export function applyGuidedSessionDone(state, { day, note, bridge, now })
// Uma transformação pura: na manifestação âncora acrescenta `day` a sessions (sem duplicar); com bridge === true
// e ponte ainda não feita no dia, acrescenta a conclusão no mesmo formato de toggleBridgeCompletion; com note
// não vazia (trim, 280) põe { id, text, createdAt } no início de evidence; grava guidedSession.lastDoneOn = day.
// Sem âncora devolve o mesmo state.
```

- [ ] **Passo 1 — portão que falha** (estado de referência montado no portão: âncora com história de 700
  caracteres, título de 40, 6 afirmações de 60, biblioteca real):
  ordem dos `kind` exatamente a da interface; todo `guide` e `journey` tem `clipId` e texto não vazio;
  `sessionSeconds` entre 400 e 440; com história de 1.500 → entre 400 e 440; com história de 200 → pausa da cena =
  120.000 e total entre 330 e 440; `pickDailyAffirmations` com 6 itens: 23/11/2026 (dia 20780, par) → índices
  0,1,2; 24/11 → 3,4,5; mesmo dia duas vezes → igual; com 2 itens → os 2; com 7 itens → 3 distintos;
  sem âncora → `[]`; `applyGuidedSessionDone` duas vezes no mesmo dia → uma entrada só em `sessions`, uma ponte só,
  `guidedSession.lastDoneOn === day`; `note` só com espaços não cria evidência; `bridge: false` não cria ponte.
- [ ] **Passo 2 — ver falhar:** `node scripts/verificar-sessao-7min.js --logica`.
- [ ] **Passo 3 — implementar.**
- [ ] **Passo 4 — rodar:** `--logica` → `sessao de 7 minutos (logica): ok`.
- [ ] **Passo 5 — mutações:** M1 trocar a ordem de `journey` e `guide:bridge`; M2 `count` vira 2; M3 início das
  afirmações fixo em 0; M4 teto da cena 300.000; M5 `sessions` duplicando o dia; M6 evidência criada com nota vazia.
- [ ] **Passo 6 — commit:** `feat(sessao): roteiro, tempos e registro da sessao de 7 minutos`.

### Tarefa 6 — Modo sessão no motor e registro do dia · **Fable**

**Arquivos:** alterar `screens/WakeSequenceScreen.js`, `context/AppContext.js`,
`scripts/verificar-sessao-7min.js` (parte "motor"); manter verde `node scripts/verificar-despertar-sequencia.js`.

**O que muda (e só isto)**

- `const session = route.params?.mode === 'session'` (via `useRoute`). Itens:
  `session ? sessionItemsForState(state, lang, todayISO()) : wakeSequenceItemsForState(state, lang)`.
- `playItem`: com `cloudVoice`, sem quebra anterior e `item.clipId` → `narration.playBundled({ clipId, narratorId,
  lang, playbackId })`, tratado como o `playPersonal` (mesmo `cloudIdRef`, mesma queda `deviceFallback`). Sem
  `clipId` → caminho de hoje. Sem `cloudVoice` → voz do aparelho lê `item.text` (uma voz só por sessão).
- `itemFinished`: o respiro passa a ser `item.pauseMs ?? GAP_MS`. Durante a pausa: estado `rest = { until, total }`
  para o anel e `item.still` na tela. "Próximo" encerra a pausa; "Pausar" durante a pausa segue o caminho que já
  existe (continua no item seguinte). Tela acesa durante a pausa (a fase continua `playing`).
- Tela do item: `guide` mostra ícone e a legenda; `desire`/`affirmation` mostram o texto em serifa; `journey`
  mostra título do tema e "dia n de 7"; `anchor` é a cena viva de hoje, sem mudança.
- Textos do modo sessão (título "Sua sessão de 7 minutos" / "Your 7-minute session", introdução curta, estado
  vazio "Crie sua Cena-Âncora" / "Create your Anchor Scene"). Os do despertar ficam como estão.
- Cartão final no modo sessão (`testID="session-complete"`): botão `session-register` ("Registrar meu dia" /
  "Log my day"), interruptor `session-bridge` ("Fiz a ponte" / "Bridge done"), campo `session-note` de uma linha
  (opcional, 280), e depois de registrar um visto com a ofensiva em número e "Fechar". Registrar é idempotente no dia.
- `AppContext`: `registerGuidedSession({ note, bridge })` = `setState((s) => applyGuidedSessionDone(s, { day:
  todayISO(), note, bridge, now: new Date().toISOString() }))`; normalização de `guidedSession.lastDoneOn` (dia
  válido ou `null`) ao carregar; exposto no valor do contexto.
- Não criar outro arquivo de tela nem copiar o motor.

- [ ] **Passo 1 — teste que falha** (parte "motor", por leitura do fonte e por função): o arquivo importa
  `sessionItemsForState`, chama `playBundled`, usa `pauseMs` no respiro, tem os `testID` `session-complete`,
  `session-register`, `session-bridge`, `session-note`; não existe `screens/SessionScreen.js` nem segundo
  `Speech.speak(item.text` fora do motor; `AppContext` expõe `registerGuidedSession` e usa
  `applyGuidedSessionDone`; estado salvo com `guidedSession.lastDoneOn = 'x'` carrega como `null`.
- [ ] **Passo 2 — ver falhar:** `node scripts/verificar-sessao-7min.js`.
- [ ] **Passo 3 — implementar.**
- [ ] **Passo 4 — rodar:** `node scripts/verificar-sessao-7min.js` → `sessao de 7 minutos: ok`;
  `node scripts/verificar-despertar-sequencia.js` → verde.
- [ ] **Passo 5 — ver com os olhos:** `npx expo export -p web` + `node scripts/serve-export.js`, navegador a
  390×844, abrir `/despertar/ouvir/session` com estado semeado: nenhum corte, controles na tela, anel da pausa,
  cartão final. Guardar capturas em `output/`.
- [ ] **Passo 6 — mutações:** M7 respiro volta a `GAP_MS` fixo; M8 `playBundled` trocado por `playPersonal` nos
  itens do guia; M9 tirar `session-register`; M10 normalização aceitando `lastDoneOn` inválido.
- [ ] **Passo 7 — commit:** `feat(sessao): modo sessao no despertar e registro do dia`.

### Tarefa 7 — Entradas: cartão da Home, despertar e link · **Fable**

**Arquivos:** alterar `screens/HomeScreen.js`, `screens/AffirmationAlarmScreen.js`, `services/wakeReminders.js`,
`App.js` (só `linking`), `context/AppContext.js` (normalizar `morningRitual.wakeOpensSession`); criar
`scripts/e2e-sessao.js`; alterar `package.json` (`"verify:session-e2e"`).

- Home: cartão `testID="open-session"` como primeiro cartão do conteúdo, antes de `open-anchor-scene`, só com
  Cena-Âncora. Foto da cena (mesma fonte do cartão da âncora), ícone `headset`, "7 min", rótulo, tema da semana +
  "dia n de 7" (de `journeyForDay(todayISO())`), ofensiva em número (`derived.streak`). Feito hoje
  (`state.guidedSession.lastDoneOn === todayISO()`): visto e rótulo "Feita hoje" / "Done today"; o toque continua
  abrindo. Botão ⓘ `session-info` abre a explicação (o que é, fone, 7 minutos, o que entra). Um toque:
  `navigation.navigate('WakeSequence', { mode: 'session' })`.
- Link: `WakeSequence: 'despertar/ouvir/:mode?'` (o caminho antigo continua valendo).
- Despertar: interruptor `wake-opens-session` em `AffirmationAlarmScreen` ("Abrir com a sessão de 7 minutos" /
  "Open with the 7-minute session"), gravado por `saveMorningRitualPreferences({ wakeOpensSession })`. Onde o
  lembrete/alarme abre o despertar hoje (`WAKE_URL` e a abertura por notificação), usar
  `celeste://despertar/ouvir/session` quando ligado. No cartão final do despertar comum, botão secundário
  "Sessão de 7 minutos".
- [ ] **Passo 1 — teste que falha:** `scripts/e2e-sessao.js` (puppeteer-core, export local, estado semeado como em
  `scripts/verificar-paywall.js`, 390×844, usuária com Cena-Âncora e 6 afirmações): `open-session` é visível sem
  rolar e vem antes de `open-anchor-scene`; toque abre a sessão; acender as três estrelas; `wake-next` até
  `session-complete`; escrever uma linha; `session-register`; voltar à Home: cartão em "feito hoje" e o
  `localStorage` tem o dia em `sessions`, a linha em `evidence` e `guidedSession.lastDoneOn`; nenhum erro de página;
  largura do documento = 390 (sem rolagem lateral, medida, não calculada).
- [ ] **Passo 2 — ver falhar.**
- [ ] **Passo 3 — implementar.**
- [ ] **Passo 4 — rodar:** `node scripts/e2e-sessao.js` (com `TARGET_URL` do export local) → `e2e sessao: ok`;
  `npm run verify:alarm`, `npm run verify:alarm-screen`, `npm run verify:deep-links` → verdes.
- [ ] **Passo 5 — mutações:** M1 cartão depois do da âncora; M2 `navigate` sem `mode`; M3 registro sem gravar
  `lastDoneOn`.
- [ ] **Passo 6 — commit:** `feat(sessao): cartao na home e despertar abrindo a sessao`.

---

## Frente B — Assinatura no iPhone

### Tarefa 8 — RevenueCat: dependência, fronteira e lógica da permissão · **Fable**

**Arquivos:** alterar `package.json` e `package-lock.json`; criar `react-native.config.js`,
`utils/entitlement.js`, `services/purchases.ios.js`, `services/purchases.js`, `scripts/verificar-assinatura.js`;
alterar `package.json` (`"verify:subscription"`).

- [ ] **Passo 0 — fontes.** Instalar com `npm install --save-exact react-native-purchases@10.16.0`. Abrir os
  `.d.ts` em `node_modules/react-native-purchases/dist/` e as páginas da documentação oficial do RevenueCat para
  React Native/Expo (instalação Expo, configurar o SDK, exibir produtos, comprar, restaurar, CustomerInfo, direito
  à oferta introdutória). Nomes esperados, **a confirmar no `.d.ts`**: `Purchases.configure({ apiKey })`,
  `getCustomerInfo`, `getOfferings`, `purchasePackage`, `restorePurchases`, `addCustomerInfoUpdateListener`,
  `removeCustomerInfoUpdateListener`, `checkTrialOrIntroductoryPriceEligibility`,
  `INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE`, erro com `userCancelled`,
  `product.priceString`, `product.introPrice { price, periodUnit, periodNumberOfUnits }`, `packageType`,
  `customerInfo.entitlements.active`. Se um nome divergir, vale o `.d.ts`; anotar no relato.

**Interfaces**

```js
// utils/entitlement.js  (puro; não importa react-native nem o SDK)
export const ENTITLEMENT_ID = 'premium';
export const ENTITLEMENT_TIMEOUT_MS = 8000;
export function accessFor({ subscription, onboarded, status })
// -> 'onboarding' | 'checking' | 'paywall' | 'app'   (tabela D.2 do desenho; status desconhecido = 'paywall')
export function entitlementFromCustomerInfo(info, id = ENTITLEMENT_ID)
// -> { active: boolean, expiresAt: string|null, willRenew: boolean }   (info nulo ou torto -> active false)
export function planFromPackage(pkg, eligible)
// -> { id, period: 'year'|'month'|'week'|'other', priceString, trialDays, pkg } | null (sem priceString)
// trialDays > 0 só com introPrice.price === 0 E eligible === true; DAY 1, WEEK 7, MONTH 30, YEAR 365 x número.
export function paywallDisclosure(plan, lang)    // linha legal completa, com preço e período vindos de plan
export function isRevenueCatIosKey(value)        // /^appl_[A-Za-z0-9]{16,}$/

// services/purchases.ios.js  (ÚNICO arquivo que importa 'react-native-purchases')
// services/purchases.js      (site e Android: mesmas exportações, sem importar o SDK)
export const purchasesSupported                   // true no .ios, false no outro (true na prévia, ver Tarefa 9)
export async function configurePurchases()        // idempotente -> { ok } | { ok: false, reason: 'missing_key'|'configure_failed'|'unsupported' }
export async function readEntitlement()           // -> { ok: true, ...entitlementFromCustomerInfo } | { ok: false, reason }
export async function loadPlans()                 // -> { ok: true, plans: [plan] } | { ok: false, reason: 'unavailable'|'no_products' }
export async function buyPlan(plan)               // -> { ok: true, active } | { ok: false, reason: 'cancelled'|'pending'|'failed' }
export async function restorePurchases()          // -> { ok: true, active } | { ok: false, reason: 'failed' }
export function onEntitlementChange(listener)     // -> função para cancelar; listener({ active, expiresAt, willRenew })
// Nenhuma função lança: todo erro vira { ok: false, reason }. A chave vem de
// process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY e só é aceita se isRevenueCatIosKey.
```

`react-native.config.js`: `module.exports = { dependencies: { 'react-native-purchases': { platforms: { android: null } } } };`

- [ ] **Passo 1 — portão que falha.** `scripts/verificar-assinatura.js`:
  - `accessFor`: as seis linhas da tabela D.2, mais `status: undefined` e `status: 'qualquer'` → `'paywall'`.
  - `entitlementFromCustomerInfo`: ativo com `premium`; inativo com outra permissão; `null`/`{}` → inativo.
  - `planFromPackage`: anual com teste de 7 dias (`DAY`×7 e `WEEK`×1) e `eligible` → `trialDays 7`; mesmo pacote
    com `eligible: false` → 0; `introPrice.price` 0,99 → 0; sem `priceString` → `null`.
  - `paywallDisclosure`: em `pt` e `en`, com teste, contém o número de dias, o `priceString` recebido, o período,
    renovação automática, o caminho de cancelamento e "24"; sem teste não contém "grátis"/"free"; nunca contém
    dígito de preço que não veio de `plan`.
  - `isRevenueCatIosKey`: `appl_` + 20 letras → sim; `test_…`, `goog_…`, vazio → não.
  - Fronteira: `package.json` tem `"react-native-purchases": "10.16.0"` (sem `^`/`~`); em todo o projeto (fora
    `node_modules`) só `services/purchases.ios.js` contém `react-native-purchases`; `services/purchases.js` não;
    `react-native.config.js` desliga o Android; cada método `Purchases.<nome>(` usado em `purchases.ios.js` aparece
    nos `.d.ts` instalados; `purchases.ios.js` não contém `throw` fora de `try`; `utils/entitlement.js` não importa
    `react-native`.
  - Estado: `context/AppContext.js` não contém `entitlement` nem `premium` (a permissão não entra no estado salvo).
- [ ] **Passo 2 — ver falhar:** `node scripts/verificar-assinatura.js`.
- [ ] **Passo 3 — implementar.**
- [ ] **Passo 4 — rodar:** → `assinatura (logica e fronteira): ok`; `npm run verify:android-release` → verde;
  `npx expo-modules-autolinking react-native-config --platform android --json` não lista `react-native-purchases`
  (se o subcomando tiver outro nome nesta versão, usar o equivalente e anotar).
- [ ] **Passo 5 — mutações:** M1 `accessFor` devolve `'app'` para `unavailable`; M2 `status` desconhecido vira
  `'app'`; M3 `trialDays` sem olhar `eligible`; M4 `paywallDisclosure` sem a frase de cancelamento; M5 versão com
  `^`; M6 importar o SDK em `services/purchases.js`; M7 tirar o `android: null`; M8 `isRevenueCatIosKey` aceitando
  `test_`.
- [ ] **Passo 6 — commit:** `feat(assinatura): revenuecat 10.16.0 isolado no iphone e regra de acesso`.

### Tarefa 9 — Portão na raiz e provedor da permissão · **Fable**

**Arquivos:** criar `context/EntitlementContext.js`; alterar `App.js` (`RootNav` e provedores),
`constants/releaseFeatures.js`, `services/purchases.js` (prévia), `scripts/deploy-celeste.js` (trava da prévia),
`scripts/verificar-assinatura.js`.

- `releaseFeaturesForPlatform(platformOS, androidStoreRelease, paywallPreview =
  process.env.EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW)` ganha
  `subscription: platformOS === 'ios' || (platformOS === 'web' && paywallPreview === '1')`.
- `EntitlementProvider` / `useEntitlement()` → `{ status, refresh, setActive }`.
  Sem `RELEASE_FEATURES.subscription`: `status: 'active'` fixo, nenhum efeito, nenhuma chamada.
  Com: começa `checking`; `configurePurchases()` → `readEntitlement()` com limite de `ENTITLEMENT_TIMEOUT_MS`
  (estourou → `unavailable`); assina `onEntitlementChange`; consulta de novo quando o app volta ao primeiro plano
  (`AppState`); `refresh()` refaz tudo (botão "Tentar de novo").
- `RootNav`: `const access = accessFor({ subscription: RELEASE_FEATURES.subscription, onboarded, status })`.
  `'checking'` → `<AppBootState />`; `'paywall'` → navegador só com `Paywall` (`initialParams: { locked: true }`);
  `'onboarding'` e `'app'` → os dois ramos de hoje, sem mudança.
- Prévia: em `services/purchases.js`, com `EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW === '1'`, `purchasesSupported` é
  `true`, `loadPlans` devolve dois planos de mentira (`priceString` "0,00" e marca `preview: true`), `buyPlan` e
  `restorePurchases` ativam em memória. `scripts/deploy-celeste.js` lança erro antes do export se a variável
  estiver ligada no ambiente ou em arquivo `.env*`.
- [ ] **Passo 1 — teste que falha** (acrescentar ao portão): `releaseFeaturesForPlatform('ios').subscription ===
  true`; `('android')` e `('web')` → `false`; `('web', undefined, '1')` → `true`; `('android', undefined, '1')` →
  `false`; `App.js` usa `accessFor` e monta o ramo `'paywall'` só com a tela `Paywall`; `EntitlementContext` não
  chama `configurePurchases` quando a assinatura está desligada (teste com dublê de `services/purchases`); limite
  de tempo → `unavailable` (dublê que nunca responde, relógio falso); `deploy-celeste.js` recusa a prévia (rodar a
  função de guarda com a variável ligada → erro).
- [ ] **Passo 2 — ver falhar.**
- [ ] **Passo 3 — implementar.**
- [ ] **Passo 4 — rodar:** `node scripts/verificar-assinatura.js` → verde; `npm run verify:deploy-pipeline` →
  verde; `npm run verify:recovery` → verde.
- [ ] **Passo 5 — mutações:** M9 `subscription: true` no Android; M10 ramo `'paywall'` mostrando `Main`; M11
  provedor sem limite de tempo; M12 guarda do deploy removida.
- [ ] **Passo 6 — commit:** `feat(assinatura): portao unico na raiz separado da entrada`.

### Tarefa 10 — Paywall honesto do iPhone · **Fable**

**Arquivos:** criar `screens/onboarding/SubscriptionPaywall.js`; alterar `screens/onboarding/PaywallScreen.js`
(escolhe a variante), `screens/ProfileScreen.js` (linha "Gerenciar assinatura"), `scripts/verificar-assinatura.js`;
criar `scripts/e2e-paywall-previa.js`. `constants/i18n.js` (pwP1–pwP3) fica como está: são os textos da variante
aberta do site e do Android.

- `PaywallScreen`: `RELEASE_FEATURES.subscription ? <SubscriptionPaywall locked={route.params?.locked} /> : <tela de hoje>`.
- `SubscriptionPaywall` — estados: `loading` (botão desligado), `ready`, `buying`, `error`. `testID`:
  `paywall-plan-<id>`, `paywall-cta`, `paywall-disclosure`, `paywall-restore`, `paywall-terms`, `paywall-privacy`,
  `paywall-retry`, `paywall-info`.
  - Topo: foto da Cena-Âncora dela (mesma fonte da Home) e o título dela; em `locked`, a linha "Seu conteúdo
    continua guardado neste iPhone." / "Your content stays saved on this iPhone."
  - Três linhas de ícone + rótulo: `headset` Sessão de 7 minutos / 7-minute session; `calendar` Jornada nova toda
    semana / A new journey every week; `alarm` Despertar com a sua cena / Wake up to your scene.
  - Cartões de plano: `plan.priceString` em número grande, rótulo "por ano"/"per year" ou "por mês"/"per month",
    selo "{n} dias grátis"/"{n} days free" só com `plan.trialDays > 0`. Pré-selecionado: o primeiro.
  - Botão: "Começar {n} dias grátis" / "Start {n}-day free trial"; sem teste, "Assinar por {preço}/{ano|mês}" /
    "Subscribe for {price}/{year|month}".
  - `paywall-disclosure`: `paywallDisclosure(planoSelecionado, lang)`, sempre visível abaixo do botão.
  - Links sempre visíveis, em todos os estados: Restaurar compras / Restore purchases · Termos / Terms ·
    Privacidade / Privacy (abrem `https://celeste-jet-two.vercel.app/termos|terms` e `/privacidade|privacy`).
  - `error`: "Não foi possível carregar os planos." / "Plans could not be loaded." + `paywall-retry` (chama
    `refresh()` e `loadPlans()`); Restaurar continua disponível.
  - Compra: `buyPlan` → `active` → `setActive()` e, se a entrada não terminou, `completeOnboarding()` (e
    `trackSignup()` como hoje). `cancelled` → volta a `ready` sem mensagem. `pending` → "Compra aguardando
    aprovação." / "Purchase awaiting approval." Restaurar sem assinatura → "Nenhuma assinatura ativa nesta conta
    da Apple." / "No active subscription on this Apple account."
  - ⓘ `paywall-info`: folha "Como funciona o teste" (hoje: tudo liberado; fim do teste: a cobrança do plano
    escolhido; cancelar antes: nada é cobrado), com os mesmos números vindos de `plan`.
  - Sem cronômetro, sem "só hoje", sem contagem de vagas, sem promessa de resultado.
- Perfil: linha `manage-subscription` (só com `RELEASE_FEATURES.subscription`) abre
  `https://apps.apple.com/account/subscriptions`.
- [ ] **Passo 1 — teste que falha.** Portão (fonte): `SubscriptionPaywall.js` tem todos os `testID`; não contém
  `/(R\$|US\$|€|£|\$)\s?\d/` (nenhum preço escrito; não confunde com `${...}` nem com medidas de estilo); não contém
  `/só hoje|últimas|restam|vagas|countdown|timer|garant|guarantee|only today|spots left/i`; usa
  `paywallDisclosure` e `plan.priceString`; `paywall-restore`, `paywall-terms` e `paywall-privacy` estão fora de
  qualquer ramo condicional de estado. `scripts/e2e-paywall-previa.js` (export local com a prévia ligada, 390×844,
  usuária nova): depois da revelação aparece o paywall; `paywall-cta`, `paywall-disclosure` e os três links
  visíveis sem rolar; o texto da linha legal contém o preço do plano selecionado e muda ao trocar de plano; marca
  "PRÉVIA" visível; comprar leva ao app; recarregar com `onboardingDone` e sem permissão cai no paywall `locked`;
  largura do documento = 390.
- [ ] **Passo 2 — ver falhar.**
- [ ] **Passo 3 — implementar.**
- [ ] **Passo 4 — rodar:** `node scripts/verificar-assinatura.js` e `node scripts/e2e-paywall-previa.js` → verdes;
  `npm run verify:paywall` contra o export **sem** a prévia → verde (o paywall aberto do site não mudou).
- [ ] **Passo 5 — ver com os olhos** a 390×844 e a 320×480: estados `ready` (com e sem teste), `error`, `locked`.
  Capturas em `output/`.
- [ ] **Passo 6 — mutações:** M13 escrever "R$ 99,90" na tela; M14 esconder Restaurar no estado `error`; M15 tirar
  `paywall-disclosure`; M16 selo de teste sem olhar `trialDays`; M17 "só hoje" num rótulo.
- [ ] **Passo 7 — commit:** `feat(assinatura): paywall honesto do iphone com teste de 7 dias`.

### Tarefa 11 — Termos, privacidade e páginas públicas · **Fable**

**Arquivos:** alterar `constants/legal.js` (e `LEGAL_UPDATED`), `public/privacy/index.html`,
`public/privacidade/index.html`, `vercel.json`, `scripts/verificar-paginas-publicas.js`; criar
`public/terms/index.html`, `public/termos/index.html`.

- Termos, seção "Acesso atual e pagamentos" → "Assinatura no iPhone": o app do iPhone exige assinatura depois da
  entrada; teste grátis quando a Apple oferece; preço e período mostrados antes da compra; renovação automática;
  cancelamento em Ajustes > nome > Assinaturas até 24 h antes; cobrança e reembolso pela Apple; site e Android sem
  cobrança nesta versão; sem promessa de resultado (já existe seção).
- Privacidade: tirar "pagamentos não estão ativos"; acrescentar que a compra é processada pela Apple e que o
  RevenueCat recebe um identificador anônimo do app e o histórico de compra para confirmar a assinatura — nenhum
  conteúdo dela, nenhum nome ou e-mail.
- Páginas `terms`/`termos` no molde das de privacidade (`public/legal.css`), geradas do mesmo texto de
  `constants/legal.js`; reescritas `/terms` e `/termos` no `vercel.json`.
- [ ] **Passo 1 — teste que falha:** `verificar-paginas-publicas.js` exige as duas páginas novas, as reescritas, a
  menção a RevenueCat nas páginas de privacidade e que nenhum texto legal diga mais "não cria uma assinatura paga"
  / "does not create a paid subscription" / "pagamentos não estão ativos" / "payments are not active".
- [ ] **Passo 2 — ver falhar. Passo 3 — implementar.**
- [ ] **Passo 4 — rodar:** `npm run verify:public-pages`, `npm run verify:store`, `npm run verify:deploy-pipeline`,
  `node scripts/caca-ingles.js` → verdes.
- [ ] **Passo 5 — mutações:** M1 apagar `public/termos/index.html`; M2 tirar a reescrita `/terms`; M3 devolver
  "does not create a paid subscription" à página.
- [ ] **Passo 6 — commit:** `docs(legal): termos e privacidade com a assinatura do iphone`.

### Tarefa 12 — Trava do build e ficha no repositório · **Opus**

**Arquivos:** alterar `scripts/publicar-app-store.ps1`, `scripts/celeste-release-lib.ps1`,
`scripts/verificar-assinatura.js`, `store-listing/` (en-US, pt-BR, `review-notes.md`, `privacy-review.md`,
`PREENCHER-APP-STORE-CONNECT.md`), `scripts/verify-store-listing.js` se alguma regra precisar acompanhar.

- `celeste-release-lib.ps1`: função `Assert-CelesteRevenueCatIosKey` — lê `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` do
  ambiente `production` do EAS (pelo mesmo `Get-PublicEnvironmentValue`), exige `^appl_[A-Za-z0-9]{16,}$`; senão
  `throw 'RevenueCat: falta a chave publica do iOS (EXPO_PUBLIC_REVENUECAT_IOS_API_KEY, formato appl_...) no
  ambiente production do EAS. O build do iPhone nao sai sem ela.'` Nunca imprime o valor.
- `publicar-app-store.ps1`: chama a função logo depois de `Assert-CelesteEasProductionEnv` (vale para
  `-CheckOnly`, `-StartBuild` e `-Submit`) e roda `Invoke-NpmGate -Name 'verify:subscription'`. Só ASCII.
- Ficha: descrição em inglês e português falando da sessão de 7 minutos, da jornada semanal e da assinatura
  (preço mostrado no app, teste, renovação, link dos Termos e da Privacidade); notas de revisão explicando onde o
  paywall aparece e onde fica Restaurar; revisão de privacidade com "Compras".
- [ ] **Passo 1 — teste que falha** (portão): os dois `.ps1` só têm bytes ≤ 0x7F; a lib tem
  `Assert-CelesteRevenueCatIosKey` com o padrão `appl_`; o script a chama **antes** de qualquer `eas build`; o
  script roda `verify:subscription`; a função não tem `Write-Host` com o valor.
- [ ] **Passo 2 — ver falhar. Passo 3 — implementar.**
- [ ] **Passo 4 — rodar:** `node scripts/verificar-assinatura.js` → verde; `npm run verify:store` → verde;
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publicar-app-store.ps1 -Help` → mostra a ajuda sem erro.
- [ ] **Passo 5 — mutações:** M18 tirar a chamada da função; M19 aceitar `test_`; M20 pôr um "ç" no `.ps1`.
- [ ] **Passo 6 — commit:** `build(ios): build recusa sair sem a chave do revenuecat; ficha com a assinatura`.

---

## Tarefa 13 — Kit do dono · **Opus**

**Arquivos (fora do repositório):** criar em `C:\Users\Sanches\Downloads\Celeste - assinatura iPhone\`:
`PASSO A PASSO.txt`, `PRODUTOS E PRECOS.txt`, `TEXTOS APP STORE - INGLES.txt`, `TEXTOS APP STORE - PORTUGUES.txt`,
`NOTAS PARA A REVISAO DA APPLE.txt`; atualizar `C:\Users\Sanches\Downloads\Celeste - ficha em ingles App Store\`
(`DESCRICAO.txt` e `PASSO A PASSO.txt`). UTF-8, PT-BR, um passo por linha, nome exato de cada tela e campo, sem
jargão. Conferir os nomes de tela na documentação atual da Apple e do RevenueCat antes de escrever.

`PASSO A PASSO.txt`, na ordem em que ele faz:

1. **App Store Connect → Negócios:** Contrato de Apps Pagos aceito, conta bancária e formulários fiscais ativos
   (sem isso nenhum produto carrega no app).
2. **Assinaturas → criar o grupo** `Celeste Premium`; nome do grupo localizado em inglês e português.
3. **Produto anual** `celeste_premium_annual` (1 ano) e **mensal** `celeste_premium_monthly` (1 mês): nome e
   descrição em EN e PT (textos prontos no kit), preço (sugerido US$ 29,99 e US$ 6,99; Brasil R$ 99,90 e
   R$ 19,90), disponibilidade em todos os países.
4. Em cada produto, **Oferta introdutória → Teste grátis → 7 dias**, novos assinantes, todos os países.
5. Em cada produto, **informações para revisão**: captura do paywall (o coordenador entrega) e a nota pronta.
6. **Período de carência de cobrança** ligado (16 dias).
7. Na versão **1.0.2**, seção de compras no app e assinaturas: anexar os dois produtos (a primeira assinatura só
   é revisada junto com uma versão).
8. **Privacidade do app:** acrescentar "Compras" (histórico de compras), não vinculado à identidade, para
   funcionalidade do app.
9. Textos da ficha (descrição, novidades da versão, notas para a revisão) em inglês e português, com o link dos
   Termos (`https://celeste-jet-two.vercel.app/terms`) e da Privacidade.
10. **Usuários e acesso → Integrações → Compra no app:** gerar a chave (.p8), anotar ID da chave e ID do emissor.
11. **RevenueCat:** criar conta grátis → projeto `Celeste` → app iOS com o bundle `com.celesteapp.affirmations` →
    enviar a chave .p8 → permissão `premium` → importar os dois produtos e ligar à permissão → oferta `default`
    com os pacotes anual (primeiro) e mensal → copiar a URL de notificações do servidor da Apple para o App Store
    Connect → **copiar a chave pública do iOS (começa com `appl_`) e mandar para o Claude**.
12. Depois do build: instalar pelo TestFlight, fazer uma compra de teste, restaurar, cancelar; só então enviar
    para revisão.

- [ ] **Passo 1:** escrever os arquivos. **Passo 2:** conferir que todo ID, preço e link bate com o desenho (D.5)
  e com o que o app usa (`premium`, `default`). **Passo 3:** nada a commitar (fora do repositório); relatar os
  caminhos completos.

---

## Tarefa 14 — Fechamento · **Coordenador** (revisão final: **Fable**; segunda revisão: **Codex**)

- [ ] C1 e C2 feitos (conteúdo aprovado, áudio gerado e commitado, gasto informado ao Lenda).
- [ ] Todos os portões novos verdes: `verify:weekly-journey`, `verify:session-audio`, `verify:session`,
  `verify:session-e2e`, `verify:subscription`, `e2e-paywall-previa.js`.
- [ ] Portões antigos verdes: `verify:store`, `verify:public-pages`, `verify:android-release`, `verify:narrators`,
  `verify:audio-playback`, `verify:alarm`, `verify:deploy-pipeline`, `verificar-despertar-sequencia.js`,
  `i18n-parity.js`, `caca-ingles.js`. Rodar também num `git archive` com CRLF.
- [ ] Reaplicar por amostragem uma mutação de cada portão (relato de agente não basta).
- [ ] Publicar o site: `scripts/deploy-web-from-vercel.ps1` com `CELESTE_NODE_HOME` (Node 24).
- [ ] Playwright em produção como **usuária nova**, 390×844: entrada → revelação → paywall aberto do site → Home →
  cartão da sessão → sessão até o fim → registrar → cartão "feito hoje"; `/terms` e `/termos` no ar;
  `npm run verify:paywall` em produção.
- [ ] Ouvir a sessão inteira num iPhone (Safari) com fone: voz não some depois das pausas longas. Se sumir,
  aplicar o conserto previsto no desenho (A, risco conhecido) e repetir.
- [ ] `/code-review` no diff inteiro (Fable) + segunda revisão do Codex; corrigir o que for real.
- [ ] Juntar no master (sem force-push), anotar no quadro `QUADRO-CLAUDE-CODEX.md` (feito, hash, próximo passo).
- [ ] Quando o Lenda entregar a chave `appl_…`: criar `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` no ambiente `production`
  do EAS (visível, não secreta) e rodar `scripts/publicar-app-store.ps1 -CheckOnly`. O build é dele.

## Autoconferência do plano

- Cobertura do desenho: A → Tarefas 5, 6, 7; B → 3, 4, C2; C → 1, 2; D → 8, 9, 10, 12; E → sem código (decisão
  registrada); F → 11, 12; G → 13.
- Nomes iguais em todas as tarefas: `sessionClipModule`, `playBundled`, `audioKindOf`, `sessionItemsForState`,
  `applyGuidedSessionDone`, `registerGuidedSession`, `guidedSession.lastDoneOn`, `accessFor`, `ENTITLEMENT_ID`,
  `planFromPackage`, `paywallDisclosure`, `RELEASE_FEATURES.subscription`, `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`,
  `EXPO_PUBLIC_CELESTE_PAYWALL_PREVIEW`.
- Contas conferidas: 23/11/2026 = dia 20.780 = semana 2.968 (segunda); 6 falas + 56 frases = 62 clipes × 12 = 744;
  (450 + 56 × 80) × 12 = 59.160 caracteres.
