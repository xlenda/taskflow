# Vozes da Celeste (ElevenLabs) no Android — plano

> Para agentes: executar com superpowers:subagent-driven-development. Passos com caixas (`- [ ]`).

**Objetivo:** no app Android, toda narração toca com a voz da ElevenLabs que ela escolhe, igual ao site (decisão do Lenda, 21/10: "usar tudo a voz da ElevenLabs como já está no app").

**Arquitetura:** a narração em nuvem ganha uma bandeira própria (`cloudNarration`: web + android), separada de `paidCloudProcessing` (imagens e o resto continuam só no site). O servidor só aceita pedido nativo de voz com a verificação do Google (Play Integrity, `@expo/app-integrity` ~57.0.2 no app + `decodeIntegrityToken` no servidor). Sem verificação válida, o servidor recusa como hoje e o app toca a voz do celular com aviso honesto.

**Base:** master c0309d1. Branch `feat/vozes-android`.

## Global Constraints
- Mesmo fluxo do site: mesma lista de vozes (`components/NarratorSelector.js`), mesma geração (`api/gerar-audio.js`), mesmo consentimento de nuvem, mesmo guarda de gasto (Supabase `celeste_reserve_generation_credit`).
- Android: só VOZ na nuvem. Imagens, sonho em nuvem, Espelho Vivo e o resto de `paidCloudProcessing` continuam desligados no Android. iOS fica como está.
- O servidor nunca confia no cabeçalho `X-Celeste-Client`: pedido nativo só passa com token Play Integrity verificado no servidor (pacote `com.celesteapp.affirmations`, `PLAY_RECOGNIZED`, `MEETS_DEVICE_INTEGRITY`, hash do pedido amarrado, token recente). Sem credencial do Google configurada → fechado (403 `native_attestation_required`), como hoje.
- Teto diário próprio para pedidos nativos (além do teto por pessoa), para limitar o custo no pior caso.
- Áudio no mesmo toque: nenhum `await` entre o toque e o início da voz (o pedido do token não pode atrasar o início; usar o caminho já existente de "primeiro toque destrava, depois toca").
- Regra de IA da Play: toda tela onde a voz gerada toca no Android tem o botão de denunciar conteúdo de IA (`components/AiContentReportAction.js`).
- Bilíngue PT/EN (dicionário `S` local + `scripts/i18n-parity.js`). Sem permissão Android nova. Portões de fronteira Android atualizados de propósito (não afrouxados): imagem/nuvem paga continuam bloqueadas, só a voz verificada passa.
- Commit só no TaskFlow, `git commit -F`, deploy só pelo `scripts/deploy-web-from-vercel.ps1`; AAB novo pelo `scripts/publicar-google-play.ps1 -StartBuild`.

### Task V1: Voz da ElevenLabs no app Android (cliente)
**Arquivos:** `constants/releaseFeatures.js`, `context/NarrationContext.js` (se preciso), `screens/onboarding/RevealScreen.js`, `screens/ProfileScreen.js`, `screens/ManifestationScreen.js`, `screens/VisionPlayerScreen.js`, `screens/AffirmationsScreen.js`, `screens/MorningRitualScreen.js`, `screens/WakeSequenceScreen.js`, telas que tocam narração e não têm o botão de denúncia; portões `scripts/verificar-fronteira-release-android.js` e afins.
- [ ] Teste que falha: no Android, `cloudNarration` ligado e `paidCloudProcessing` desligado; escolha de voz aparece na revelação e no Perfil; "Ouvir minha cena", história em vídeo (▶), visões, afirmações, ritual e despertar usam a voz escolhida; sem verificação → voz do celular com aviso; botão de denúncia em toda tela com voz gerada; imagem em nuvem continua indisponível.
- [ ] Implementar (consome `celesteCloudAccessCapability`/cabeçalhos da Task V2; o caminho de toque continua síncrono).
- [ ] Passar; commit `feat: vozes da Celeste no app Android`.

### Task V2: Verificação do Google (Play Integrity)
**Arquivos:** `package.json`/lock (`@expo/app-integrity` ~57.0.2), `app.json` (plugin, se exigido), `services/appIntegrity.js` (novo), `services/celesteApiSession.js`, `api/_paid-access.js`, `api/_play-integrity.js` (novo), `scripts/verificar-fronteira-api-nativa.js` e o portão do guarda de gasto.
- [ ] Ler a doc oficial (docs.expo.dev/versions/latest/sdk/app-integrity e developer.android.com/google/play/integrity) antes de codar; nada de API adivinhada.
- [ ] Teste que falha: pedido nativo sem token → 403; token com pacote/veredito/hash errado ou velho → 403; token válido → passa pelo guarda de gasto com teto nativo; cabeçalho falso sem token → 403; sem credencial do Google no servidor → 403.
- [ ] Implementar (token "standard request" amarrado ao hash do corpo do pedido; servidor decodifica via Google com conta de serviço em variável de ambiente; nunca imprimir segredo).
- [ ] Passar; commit `feat: voz no Android só com verificação do Google`.

### Task V3: Textos, política e Play Console
**Arquivos:** `public/privacidade/index.html`, `public/privacy/index.html`, `constants/legal.js`, `store-listing/*` (descrição, notas ao revisor, `console-fields.json` se houver), `docs/AUDITORIA-PLAY-STORE-2026-10-20.md` (respostas do Console), `docs/PLAY-INTEGRITY-PASSO-A-PASSO.md` (novo, para o Lenda).
- [ ] Política pt/en e no app: no Android, o texto que ela pede para ouvir vai ao nosso servidor e à ElevenLabs (processadora) só para gerar a voz; nada de imagem.
- [ ] Respostas do Console atualizadas: Data safety, declaração de IA ("gera voz com IA a partir do texto da própria pessoa; denúncia dentro do app"), notas ao revisor, ficha ("ouça na voz que você escolher").
- [ ] Passo a passo do Lenda: vincular projeto do Google Cloud no Play Console, ativar Play Integrity API, criar conta de serviço, colocar o JSON na Vercel (variável secreta).
- [ ] `verify-store-listing` passa; commit `docs: vozes da Celeste no Android na política e no Console`.
