# Despertar em sequência, Compartilhar em tudo e Cena Viva — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a pessoa monta o próprio despertar (Cena-Âncora + visões + afirmações), compartilha qualquer conteúdo como cartão 9:16 ou vídeo curto com link, e vê a Cena-Âncora ganhar vida depois do Traço Celeste — no site e no app Android, sem custo novo por usuária.

**Architecture:** um único renderizador canvas 2D (`installCenaViva`) serve para exibir a cena viva e gravar o vídeo; na web roda num `<canvas>` real, no app roda dentro de `react-native-webview` com a mesma fonte (gerada por script e travada por portão). Uma biblioteca de cenas prontas (grátis, empacotada) cobre quem ainda não tem imagem pessoal. O despertar vira uma lista `morningRitual.wakeSequence`, com lembrete Android via `expo-notifications` e tela de ouvir aberta pelo Traço Celeste.

**Tech Stack:** Expo SDK 57, react-native 0.86, react-native-web, expo-notifications, expo-speech, expo-sharing, react-native-view-shot, expo-file-system, **react-native-webview (novo)**, **expo-store-review (novo)**, MediaRecorder (navegador/WebView), scripts Node de verificação com babel-preset-expo, puppeteer-core (E2E).

**Spec:** `docs/superpowers/specs/2026-10-20-celeste-despertar-compartilhar-cena-viva-design.md`

## Global Constraints

- Bilíngue PT/EN em todo texto novo (dicionário `S = { chave: { pt, en } }` local da tela; portão `scripts/i18n-parity.js`).
- Encantamento honesto: nenhum número inventado, promessa de resultado ou prova social falsa.
- Áudio no iPhone/web: o som começa no MESMO toque; nenhum `await` entre o toque e o início da voz.
- Android store boundary: módulo nativo de alarme continua `platforms: ['apple']`; SCHEDULE_EXACT_ALARM, USE_EXACT_ALARM, FOREGROUND_SERVICE e FOREGROUND_SERVICE_MEDIA_PLAYBACK continuam bloqueadas.
- Avaliação na loja: só a API nativa (`expo-store-review`), sem pergunta antes, sem botão que dispare, sem prova social inventada (Google In-App Review + App Store 5.6.1).
- "Reduzir movimento" ligado → imagem parada, sem canvas animado.
- Link compartilhado: `https://celeste-jet-two.vercel.app/?utm_source=compartilhar&utm_medium=<imagem|video>&utm_campaign=<afirmacao|visao|ancora|pratica|sonho>` — sem nenhum dado pessoal.
- Vídeo: 8 s, 720×1280, 30 fps, sem áudio; preferência de mime `video/mp4;codecs=avc1.42E01E` → `video/mp4` → `video/webm;codecs=vp9` → `video/webm`.
- Sequência do despertar: no máximo 6 itens; tempo estimado = caracteres ÷ 14 por segundo.
- Cenas prontas: 4:5, 720×900 JPEG, sem pessoas, sem texto, corredor central calmo; rótulo "Cena inspirada nas suas respostas" / "Scene inspired by your answers".
- Verificadores rodam com cwd = `C:\projetos\TaskFlow`; commit só no TaskFlow; mensagem de commit via `git commit -F <arquivo>` (PowerShell 5 quebra aspas).
- Deploy só por `scripts/deploy-web-from-vercel.ps1` com `CELESTE_NODE_HOME=C:\tmp\celeste-node24\node-v24.20.0-win-x64`.

## Review Focus

1. **Despertar no iPhone/web**: tocar a 3ª estrela precisa iniciar a voz dentro do toque — `CelestialTrace` ganha `onFinalStar` síncrono e o E2E prova que a voz começou (Task 7).
2. **Vídeo que o WhatsApp não abre**: navegador que só grava webm → avisar e oferecer o cartão, nunca entregar webm calado como se fosse mp4 (Task 2 teste `pickRecorderMime`, Task 5 UI).
3. **Conteúdo apagado na sequência**: manifestação/visão removida some da sequência e a primeira frase do alarme do iPhone é recalculada (Task 6 teste `normalizeWakeSequence`).
4. **Ponte nativa com vídeo grande**: base64 de ~3 MB pelo `postMessage` precisa ir em pedaços e ser remontado igual (Task 3 teste `joinChunks`).
5. **Sem imagem pessoal**: revelação, vídeo e cartão precisam usar a cena pronta das respostas (Task 1 teste `pickReadyScene`, Task 4 e Task 5 com estado sem `visual`).

---

### Task 1: Biblioteca de cenas prontas

**Files:**
- Create: `assets/scenes/<place>-<category>.jpg` (7 lugares × 6 áreas = 42 imagens 720×900)
- Create: `constants/readyScenes.js` (mapa `{ [place]: { [category]: require(...) } }` + `READY_SCENE_PLACES`)
- Create: `utils/readyScene.js`
- Test: `scripts/verificar-cenas-prontas.js`

**Interfaces:**
- Produces: `placeFromDreamLocation(text: string|undefined) -> 'home'|'city'|'beach'|'countryside'|'abroad'|'traveling'|'neutral'`; `pickReadyScene({ dreamLocation, category }) -> { id: string, source: number /* require */, place, category }` (categoria fora das 6 → `Peace`).

- [ ] **Step 1: Gerar as 42 cenas grátis** com `node C:\Users\sanches\.claude\zeus-imagem.js "<prompt>"` (Cloudflare). Prompt = regras de `api/gerar-visual.js` (`buildPrompt`: sem pessoas, sem texto, corredor central ~45%, `CATEGORY_ART_DIRECTIONS[cat]`, lugar). Lugares: home = "the person's current home, improved", city, beach, countryside/mountains, abroad (non-specific foreign architecture, no landmark), traveling (journey in motion, no vehicle brand), neutral (light/material/weather only). Até 3 tentativas por cena; olhar cada imagem (Read) e descartar pessoas, texto, deformação. Converter para 720×900 JPEG q80 (`ffmpeg -vf scale=720:900`).
- [ ] **Step 2: Escrever o teste** `scripts/verificar-cenas-prontas.js` (padrão `load()` de `verificar-plano-celeste-utils.js`):
  - `placeFromDreamLocation('Na praia ou no litoral') === 'beach'`, `'By the beach or coast'` → beach, `'Em uma cidade grande'` → city, `'No campo ou nas montanhas'` → countryside, `'Em outro país'` → abroad, `'Viajando, sem lugar fixo'` → traveling, `'Onde moro hoje, mas do meu jeito'` → home, `'Ainda não sei'`/texto livre/`undefined` → neutral.
  - `pickReadyScene({ dreamLocation: 'Na praia ou no litoral', category: 'Love' }).id === 'beach-Love'`; categoria inválida → `'-Peace'`.
  - Cada um dos 42 arquivos existe, ≤ 220 KB, começa com `FF D8 FF`, e `constants/readyScenes.js` referencia todos.
- [ ] **Step 3: Rodar e ver falhar** — `node scripts/verificar-cenas-prontas.js` → falha "Cannot find module utils/readyScene".
- [ ] **Step 4: Implementar** `constants/readyScenes.js` e `utils/readyScene.js` (regex PT/EN por lugar, ordem: praia, cidade, campo/montanha, outro país, viajando, moro hoje).
- [ ] **Step 5: Rodar e passar**; commit `feat: biblioteca de cenas prontas da Celeste`.

### Task 2: Renderizador da cena viva (núcleo)

**Files:**
- Create: `components/cenaViva/renderer.js` (sem imports; exporta só `installCenaViva`)
- Create: `scripts/gerar-cena-viva-webview.js` (gera `components/cenaViva/rendererSource.generated.js`)
- Test: `scripts/verificar-cena-viva.js`

**Interfaces:**
- Produces: `installCenaViva(root)` define `root.CenaViva = { createRenderer, recordVideo, pickRecorderMime, splitChunks, joinChunks }`:
  - `createRenderer(canvas, { image: HTMLImageElement, phrase?: string, format: '4:5'|'9:16', mode: 'intro'|'loop', reducedMotion: boolean, signature: boolean, linkText?: string, seed?: number }) -> { start(), stop(), drawFrame(tMs: number), setCaption({ text: string, progress: number /* 0..1 */ }), destroy() }` — `setCaption` desenha só as palavras até `progress` (legenda serifada no terço inferior); `recordVideo` usa `progress = t / durationMs`.
  - `recordVideo({ image, phrase, linkText, durationMs = 8000, width = 720, height = 1280, fps = 30 }) -> Promise<{ blob: Blob, mimeType: string }>`
  - `pickRecorderMime(isTypeSupported: (m) => boolean) -> string|null` (ordem das Global Constraints)
  - `splitChunks(base64: string, size = 512 * 1024) -> string[]`, `joinChunks(parts: string[]) -> string`
- Produces: `CENA_VIVA_RENDERER_SOURCE: string` em `rendererSource.generated.js` (fonte de `renderer.js` sem `export`, seguida de `installCenaViva(window);`).

- [ ] **Step 1: Teste que falha** `scripts/verificar-cena-viva.js`:
  - `pickRecorderMime((m) => m === 'video/webm')` → `'video/webm'`; com tudo suportado → `'video/mp4;codecs=avc1.42E01E'`; nada → `null`.
  - `joinChunks(splitChunks(x, 10)) === x` para string de 1 MB; `splitChunks('', 10)` → `[]`.
  - `createRenderer` com canvas falso (objeto que grava chamadas de `getContext('2d')`) desenha em `drawFrame(0)` e `drawFrame(4000)` sem lançar; `mode: 'intro'` desenha 3 estrelas em t=0 e o sol em t=2400; `reducedMotion: true` desenha um único `drawImage` sem partículas.
  - `rendererSource.generated.js` == saída atual de `node scripts/gerar-cena-viva-webview.js --check` (fonte sincronizada).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar `renderer.js`**: canvas 2D; câmera = escala 1.00→1.08 em 8 s + travelling horizontal ±2%; raios dourados com `globalCompositeOperation = 'lighter'`; 60 partículas com PRNG semeado (mulberry32); grão via padrão de ruído 128×128 gerado uma vez; vinheta radial; intro 0–2400 ms: 3 estrelas nas posições relativas do `CelestialTrace` (`{46,112}`, `{w/2,45}`, `{w-46,112}` sobre 320×168, escalado), linhas se conectam, voam ao sol (canto superior direito do terço) com flare; 9:16 = imagem 4:5 nítida centralizada sobre a mesma imagem borrada (`filter: blur(24px)`) cobrindo o quadro; texto serifado (Georgia) no terço inferior, assinatura das 3 estrelas + "Celeste" + `linkText` no rodapé quando `signature`. `recordVideo` = canvas fora da tela + `canvas.captureStream(fps)` + `MediaRecorder` com `pickRecorderMime(MediaRecorder.isTypeSupported)`; rejeita com `code: 'recorder_unsupported'` se `null`.
- [ ] **Step 4: Implementar o gerador** e rodar `node scripts/gerar-cena-viva-webview.js`.
- [ ] **Step 5: Rodar o teste e passar**; commit `feat: renderizador da cena viva`.

### Task 3: Componentes CenaViva (web e nativo) + gravador

**Files:**
- Create: `components/cenaViva/CenaViva.web.js`, `components/cenaViva/CenaViva.js` (nativo, WebView)
- Create: `components/cenaViva/CenaVivaRecorder.web.js`, `components/cenaViva/CenaVivaRecorder.js` (nativo, WebView oculta 2×2 px)
- Create: `components/cenaViva/imageSource.js` (`imageUriForCenaViva`)
- Modify: `package.json` (`npx expo install react-native-webview`)
- Test: `scripts/verificar-cena-viva.js` (acrescentar)

**Interfaces:**
- Consumes: `installCenaViva`, `CENA_VIVA_RENDERER_SOURCE` (Task 2); `pickReadyScene` (Task 1).
- Produces:
  - `<CenaViva imageUri: string, phrase?: string, format?: '4:5'|'9:16', mode?: 'intro'|'loop', active?: boolean /* false = poster parado */, caption?: { text: string, progress: number }, reducedMotion?: boolean, style, testID = 'cena-viva', onReady?: () => void />`
  - `CenaVivaRecorder` com ref `{ record({ imageUri, phrase, linkText }) -> Promise<{ uri?: string /* nativo, file:// */, file?: File /* web */, mimeType: string }> }`
  - `imageUriForCenaViva({ personalUri: string|null, readyScene }) -> Promise<string>` — web: blob/asset URL; nativo: `data:image/jpeg;base64,...` lido com `expo-file-system` (`File(uri).base64()`; asset pronto via `Asset.fromModule(src).downloadAsync()`).

- [ ] **Step 1: Teste que falha**: estático — `CenaViva.js` importa `react-native-webview` e injeta `CENA_VIVA_RENDERER_SOURCE`; `CenaViva.web.js` não importa WebView; o protocolo de mensagens usa `{ type: 'chunk', index, total, data }` e `{ type: 'done', mimeType }`; `package.json` tem `react-native-webview`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar**; WebView com `originWhitelist={['*']}`, `javaScriptEnabled`, `allowsInlineMediaPlayback`, HTML inline (`source={{ html }}`); `postMessage` em pedaços com `splitChunks`; nativo grava com `expo-file-system` em `Paths.cache/celeste-share-<ts>.mp4|webm`.
- [ ] **Step 4: Rodar e passar**; commit `feat: cena viva no site e no app`.

### Task 4: Cena viva na revelação (Traço Celeste → sol)

**Files:**
- Modify: `screens/onboarding/RevealScreen.js:340-410`
- Modify: `components/CelestialTrace.js` (prop `onFinalStar`)
- Test: `scripts/e2e-prod.js` (bloco da revelação, após "Sua Cena-Âncora está aberta")

**Interfaces:**
- Consumes: `CenaViva`, `imageUriForCenaViva`, `pickReadyScene`, `usePersonalVisual(cacheKey)`.
- Produces: `CelestialTrace` aceita `onFinalStar?: () => void` chamado **sincronamente** no toque da 3ª estrela (antes do `onComplete` de 440 ms).

- [ ] **Step 1: E2E que falha**: depois das 3 estrelas, `[data-testid="reveal-cena-viva"]` visível (com a cena pronta, porque o onboarding não liga nuvem) e o texto "Cena inspirada nas suas respostas".
- [ ] **Step 2: Rodar o E2E local e ver falhar.**
- [ ] **Step 3: Implementar**: aberta a cena, `<CenaViva testID="reveal-cena-viva" mode="intro" imageUri=... phrase={m.affirmation} />`; imagem pessoal quando `m.visual?.cacheKey` (rótulo "Criada para você" / "Created for you"), senão cena pronta (rótulo honesto); o botão existente "Ativar minha imagem pessoal" continua quando `consent_required`/`error`.
- [ ] **Step 4: E2E local passa**; commit `feat: cena viva depois do Traço Celeste`.

### Task 5: Compartilhar em tudo

**Files:**
- Create: `components/ShareCard.js` (generaliza `AffirmationShareCard`; este vira wrapper mantendo seus testIDs)
- Create: `components/ShareSheet.js`
- Create: `utils/shareContent.js`
- Modify: `screens/VisionsScreen.js`, `screens/VisionPlayerScreen.js`, `screens/onboarding/RevealScreen.js`, `screens/ManifestationScreen.js`, `screens/PracticeRitualScreen.js` (tela concluída), `screens/MorningRitualScreen.js` (afirmação do sonho), `screens/AffirmationsScreen.js` (prévia ganha "Vídeo")
- Test: `scripts/verificar-compartilhar.js`

**Interfaces:**
- Consumes: `CenaVivaRecorder`, `imageUriForCenaViva`, `pickReadyScene`, `shareAffirmationCard`/`createAffirmationShareFile`.
- Produces:
  - `shareUrl(medium: 'imagem'|'video', campaign: 'afirmacao'|'visao'|'ancora'|'pratica'|'sonho') -> string`
  - `shareVideoFile({ file?: File, uri?: string, mimeType, title, text }) -> Promise<{ status: 'shared'|'downloaded'|'cancelled' }>`
  - `<ShareSheet visible, onClose, content: { campaign, phrase: string, kindLabel: string, visualKey?: string|null, readyScene, lang } />` com testIDs `share-sheet`, `share-image`, `share-video`, `share-link`; botão de abrir em cada tela: `share-open-<campaign>`.

- [ ] **Step 1: Teste que falha** `scripts/verificar-compartilhar.js`: `shareUrl('video','visao')` igual ao link das Global Constraints; os 7 arquivos de tela contêm `share-open-`; `ShareSheet` mostra prévia antes de enviar (`share-sheet-preview`); webm → `share-video-webm-warning` aparece e o cartão é oferecido.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** (web: pré-captura do cartão para preservar o gesto, como em `AffirmationsScreen.js:337-363`; vídeo gravado ao abrir a folha e compartilhado no toque; nativo: `expo-sharing` com `mimeType` do vídeo).
- [ ] **Step 4: Rodar e passar**; commit `feat: compartilhar imagem e vídeo em tudo`.

### Task 6: Despertar em sequência — modelo, montagem e atalhos

**Files:**
- Create: `utils/wakeSequence.js`
- Modify: `context/AppContext.js:672-794` (normalizar `wakeSequence` + migração), `:2986-3021` (`saveMorningRitualPreferences` aceita `wakeSequence`), novo `addToWakeSequence`
- Modify: `screens/AffirmationAlarmScreen.js` (título "Meu despertar", lista + seletor 3 abas)
- Modify: `screens/VisionsScreen.js`, `screens/AffirmationsScreen.js`, `screens/ManifestationScreen.js`, `screens/MorningRitualScreen.js:879-883` (atalho acrescenta)
- Test: `scripts/verificar-despertar-sequencia.js`

**Interfaces:**
- Consumes: `personalAlarmContentForState`, `personalVisionOptionsForState`.
- Produces:
  - `normalizeWakeSequence(value, { validIds: Set<string> }) -> Array<{ kind: 'anchor'|'vision'|'affirmation', id: string }>` (≤ 6, sem duplicata, sem id inexistente)
  - `wakeSequenceItemsForState(state, lang) -> Array<{ kind, id, title, text, lang, visualKey: string|null, category, manifestationId }>`
  - `estimateListeningSeconds(items) -> number` (`Math.ceil(total chars / 14)`)
  - `firstPhraseForAlarm(items, state) -> { id, text, lang }|null` (1ª afirmação; senão afirmação da Cena-Âncora; senão null)
  - `addToWakeSequence({ kind, id }) -> { ok: true }|{ ok: false, reason: 'full'|'duplicate'|'unknown' }` (AppContext)
  - testIDs: `wake-sequence-list`, `wake-sequence-item-<i>`, `wake-sequence-up-<i>`, `wake-sequence-down-<i>`, `wake-sequence-remove-<i>`, `wake-sequence-add`, `wake-picker-tab-anchor|vision|affirmation`, `wake-picker-item-<id>`, `wake-listen-now`, `add-to-wake-<campaign>`.

- [ ] **Step 1: Teste que falha**: id antigo `ritual:x` e `custom` viram `kind: 'affirmation'`; 7º item é recusado (`full`); id apagado sai na normalização; migração: `wakeAffirmationId='anchor:m1'` sem `wakeSequence` → `[{ kind: 'anchor', id: 'anchor:m1' }]`; `estimateListeningSeconds([{text:'a'.repeat(140)}]) === 10`; `firstPhraseForAlarm` sem afirmações usa a da Cena-Âncora.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** utilitário, contexto, tela e atalhos (confirmação "Adicionado ao seu despertar" / "Added to your wake-up").
- [ ] **Step 4: Rodar e passar**; commit `feat: despertar em sequência`.

### Task 7: Ouvir o despertar + lembrete Android

**Files:**
- Create: `screens/WakeSequenceScreen.js`
- Create: `services/wakeReminders.js`
- Modify: `App.js:821-848` (rota `WakeSequence`), `:856-924` (`linking` `WakeSequence: 'despertar/ouvir'`, `getInitialURL`/`subscribe` incluem o despertar), `:927-930` (`configureWakeNotifications()`)
- Modify: `constants/releaseFeatures.js` (`wakeSequence: true`), `screens/HomeScreen.js:741-780` (cartão sob `wakeSequence`)
- Modify: `scripts/verificar-fronteira-release-android.js:19-122` (permite rota/cartão sob `wakeSequence`; mantém 217-219 e 238-246)
- Test: `scripts/verificar-despertar-sequencia.js` (acrescentar) + `scripts/e2e-prod.js`

**Interfaces:**
- Consumes: `wakeSequenceItemsForState`, `CenaViva`, `CelestialTrace.onFinalStar`, `usePersonalNarration`, `expo-speech`.
- Produces: `scheduleWakeReminders({ time: 'HH:MM', weekdays: number[], lang }) -> Promise<{ ok, identifiers: string[], permission }>`, `cancelWakeReminders() -> Promise<{ ok }>`, `configureWakeNotifications()`, `initialWakeNotificationUrl() -> Promise<string|null>`, `subscribeWakeNotificationUrls(listener) -> () => void`; canal Android `celeste-despertar` (importância HIGH, som padrão); `data.url = 'celeste://despertar/ouvir'`; web → `{ ok: false, error: 'unsupported' }`.

- [ ] **Step 1: Testes que falham**: triggers DAILY com 7 dias e WEEKLY (domingo = 1) por dia; canal com som; web devolve `unsupported`; texto da tela sem `await` entre `onFinalStar` e o início da voz (fatia de código sem comentários); E2E: Home → `open-affirmation-alarm` → monta 3 itens → `wake-listen-now` → 3 estrelas → `speechSynthesis.speak` ou `media.play()` registrado em até 1 s após a 3ª.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** (iOS: AlarmKit continua com `firstPhraseForAlarm`; Android: `scheduleWakeReminders`; web: salva + explica + "Ouvir agora"). Texto honesto Android: "Pode atrasar alguns minutos; a voz toca quando você abrir."
- [ ] **Step 4: Rodar tudo e passar**; commit `feat: ouvir o despertar com Traço Celeste e lembrete Android`.

### Task 8: Avaliação nativa depois da revelação

**Files:**
- Create: `utils/storeReview.js`
- Modify: `screens/onboarding/RevealScreen.js` (`continueFlow` → `maybeRequestStoreReview()` antes do Paywall)
- Modify: `screens/onboarding/NotificationsScreen.js` (vai direto para `ChatOnboarding`); Delete: `screens/onboarding/GrowScreen.js`; Modify: `App.js` (rota/linking `Grow`), `constants/i18n.js` (`grow`)
- Modify: `scripts/verificar-perguntas-stella.js` (Notifications → ChatOnboarding; Grow não existe), `scripts/e2e-prod.js` (sem "Ajude a gente a crescer")
- Modify: `package.json` (`npx expo install expo-store-review`)
- Test: `scripts/verificar-perguntas-stella.js`

**Interfaces:**
- Produces: `maybeRequestStoreReview({ state, markRequested }) -> Promise<'requested'|'skipped'>` — só Android/iOS, uma vez (`state.storeReviewRequestedAt`), `StoreReview.isAvailableAsync()` → `requestReview()`; nunca antes de a Cena-Âncora ser aberta.

- [ ] **Step 1: Teste que falha**: `RevealScreen` chama `maybeRequestStoreReview` dentro de `continueFlow`; nenhuma tela tem texto perguntando "gostou"/"5 estrelas"; Grow removido.
- [ ] **Step 2: Rodar e ver falhar.** — [ ] **Step 3: Implementar.** — [ ] **Step 4: Passar**; commit `feat: avaliação nativa depois da Cena-Âncora`.

### Task 11: Cena viva em todos os cards

**Files:**
- Modify: `components/GradientCover.js` (prop `live?: boolean` → `CenaViva` com `active={live}`; sem `live` continua imagem)
- Modify: `screens/AffirmationsScreen.js` (card da vez), `screens/VisionsScreen.js` (card em foco/tocando), `screens/HomeScreen.js` (card da Cena-Âncora), `screens/ManifestationScreen.js`, `screens/PracticeRitualScreen.js`, `screens/MorningRitualScreen.js`
- Test: `scripts/verificar-cena-viva.js` (acrescentar) + E2E

**Interfaces:**
- Consumes: `CenaViva` (Task 3), `pickReadyScene`/`imageUriForCenaViva`.
- Produces: `GradientCover` prop `live`; regra "um card animado por vez" (`active` só no card em foco).

- [ ] **Step 1: Teste que falha**: no máximo 1 `[data-testid="cena-viva"][data-active="true"]` visível em Afirmações e Visões; card sem imagem pessoal usa cena pronta; reduzir movimento → nenhum ativo.
- [ ] **Step 2: Ver falhar.** — [ ] **Step 3: Implementar.** — [ ] **Step 4: Passar**; commit `feat: cena viva em todos os cards`.

### Task 12: Narração com vídeo e palavras

**Files:**
- Create: `components/NarratedScene.js` (`CenaViva` + legenda progressiva)
- Create: `utils/captionProgress.js`
- Modify: `screens/VisionPlayerScreen.js`, `screens/ManifestationScreen.js`, `screens/onboarding/RevealScreen.js` (Ouvir minha cena), `screens/AffirmationsScreen.js` (Ouvir), `screens/WakeSequenceScreen.js`
- Test: `scripts/verificar-cena-viva.js` (acrescentar)

**Interfaces:**
- Consumes: `useNarration()` (`progress`, `chunkIndex`, `chunkCount`, `isPlaying`), `expo-speech` `onBoundary` (`{ charIndex }`).
- Produces: `captionProgressFromNarration({ progress }) -> number` (clamp 0..1); `captionProgressFromBoundary({ charIndex, textLength }) -> number`; `captionProgressFromTime({ elapsedMs, text }) -> number` (14 chars/s); `<NarratedScene imageUri, text, progress, active, testID = 'narrated-scene' />`.

- [ ] **Step 1: Teste que falha**: `captionProgressFromTime({ elapsedMs: 5000, text: 'a'.repeat(140) }) === 0.5`; boundary 70/140 → 0.5; valores fora de 0..1 são limitados; nas 5 telas a narração renderiza `narrated-scene`.
- [ ] **Step 2: Ver falhar.** — [ ] **Step 3: Implementar.** — [ ] **Step 4: Passar**; commit `feat: narração com cena viva e palavras sincronizadas`.

### Task 9: Portões no deploy

**Files:**
- Modify: `scripts/deploy-celeste.js:39-76` (acrescentar `verificar-cenas-prontas.js`, `verificar-cena-viva.js`, `verificar-compartilhar.js`, `verificar-despertar-sequencia.js` ao `STATIC_GATES`)
- Modify: `scripts/verificar-esteira-deploy.js:415-423` (lista obrigatória)

- [ ] **Step 1:** acrescentar e rodar `node scripts/verificar-esteira-deploy.js` → passa.
- [ ] **Step 2: Prova por mutação** em cada portão novo (quebrar 1 regra → portão falha → restaurar → passa).
- [ ] **Step 3:** commit `test: portões do despertar, compartilhar e cena viva no deploy`.

### Task 10: Revisão, auditoria Zeus, deploy, GitHub e AAB

- [ ] **Step 1:** `/code-review` no diff completo; corrigir os achados confirmados; rodar de novo os portões afetados.
- [ ] **Step 2: Auditoria Zeus** (`C:\Users\Sanches\.claude\skills\lenda-strategy\references\checklist-lancamento.md`, 20 itens) + políticas Play (avaliação nativa, notificações, Data safety com fotos/vídeos compartilhados, classificação) → `docs/AUDITORIA-PLAY-STORE-2026-10-20.md` com evidência arquivo:linha e correções feitas.
- [ ] **Step 3: E2E local completo** (`serve-export.js` + `e2e-prod.js`) como usuária nova.
- [ ] **Step 4: Deploy** `powershell -File scripts\deploy-web-from-vercel.ps1` (Node 24) → "Deploy concluido e todos os portoes foram aprovados".
- [ ] **Step 5: GitHub**: `git push origin master`; árvore limpa (exceto `scripts/e2e-shots/`).
- [ ] **Step 6: AAB**: `powershell -File scripts\publicar-google-play.ps1 -StartBuild` → "AAB production enfileirado sem submissao automatica"; acompanhar até concluir e registrar o link do build.
