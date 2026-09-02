> **Como usar:** cole este arquivo no inicio de qualquer conversa sobre o Celeste.
> Ele descreve o ESTADO do app. A doutrina de produto comum aos tres apps vive em
> `CONTEXTO/MERCADO.md`, e as armadilhas tecnicas em `CONTEXTO/ARMADILHAS.md`.
> Quando codigo e documento discordarem, o CODIGO manda.
> Ultima verificacao: 27/08/2026. Ver tambem `CONTEXTO/RELEASE-2026-08-27.md`.

# Celeste — estado verificado em 26/08/2026

Levantamento somente leitura. Toda afirmação abaixo tem caminho de arquivo e linha.
Onde um documento do repositório discorda do código, vale o código.

---

## A) Identidade e stack

- **Nome do produto:** Celeste (`app.json:3` → `"name": "Celeste"`; `package.json:2` → `"name": "celeste"`).
- **O que faz:** app de manifestação pessoal — a pessoa responde um questionário em formato de chat e o app gera, com a IA Gemini, uma cena sensorial, uma afirmação, uma história e um passo prático, tudo escrito a partir das respostas dela.
- **Expo:** `~54.0.37` (`package.json:23`). **React Native:** `0.81.5` (`package.json:33`). **React:** `19.1.0`.
- **Produção:** `https://celeste-jet-two.vercel.app`
  - Definida como constante única em `scripts/deploy-celeste.js:12` (`const PROD = ...`).
  - Confirmada em `.env.example:7` (`EXPO_PUBLIC_CELESTE_API_URL`) e em `docs/RETOMADA-CELESTE.md:8`.
  - Projeto Vercel: organização validada pelo ID técnico, projeto `celeste` (`scripts/deploy-celeste.js:13-16`).
- **Repositório local canônico:** `D:\Projetos\TaskFlow` (a pasta `C:\Users\XuXa\Downloads\TaskFlow` é junction para o mesmo lugar). `docs/RETOMADA-CELESTE.md:223` diz explicitamente: "Trabalhar sempre em `D:\Projetos\TaskFlow`".

---

## B) Como se publica

### Comando certo

```
npm run deploy:web
```

Que é `node scripts/deploy-celeste.js` (`package.json:9`).

**Existe também `scripts/deploy-web.sh`, e ele NÃO é um script alternativo — é só um invólucro.** Conteúdo integral (`scripts/deploy-web.sh:1-5`):

```bash
#!/usr/bin/env bash
# Wrapper Bash. A esteira autoritativa e scripts/deploy-celeste.js.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node scripts/deploy-celeste.js
```

Ou seja: o `.sh` termina chamando o `.js`. Os dois levam ao mesmo lugar. **Não existe nenhum `.ps1` de deploy neste repositório** — procurei por `*.ps1` em toda a árvore fora de `node_modules` e o resultado foi vazio. Se algum agente ou nota antiga mencionar um `deploy .ps1` da Celeste, essa informação está desatualizada; a esteira é uma só.

### O que o deploy executa, na ordem (`scripts/deploy-celeste.js:458-486`)

1. **Reinício com certificados do Windows.** No Windows, se `NODE_OPTIONS` não tiver `--use-system-ca`, o script se re-executa com essa flag (`scripts/deploy-celeste.js:459-468`). Isso existe porque o SSL desta máquina é interceptado.
2. **24 portões estáticos** (lista `STATIC_GATES`, `scripts/deploy-celeste.js:20-41`), cada um um `scripts/verificar-*.js`, rodados um a um. Cobrem: API Gemini, proteção de custo Gemini, WAF ativo da Vercel, voz, transformação de sonho, base de conhecimento, vídeo de abertura, recuperação de travamentos, privacidade de voz, narradores, háptica, roteiro da Stella, cena-âncora, ritual matinal, alarme, comunidade, integração das telas, tradução, API de tradução e rota de sugestão.
3. **Export web do Expo** para `dist/` com `--clear` (`scripts/deploy-celeste.js:471`).
4. **Subset de fontes** (`scripts/enxugar-fontes.js`) e **verificação de ícones** (`scripts/verificar-icones.js`) — o segundo existe para pegar quando o subset apagou um glifo que o app usa (`scripts/deploy-celeste.js:474-476`).
5. **Cópia dos insumos do deploy** (`copyDeployInputs`, linhas 100-129): copia `vercel.json`, `.vercelignore`, as 4 funções de `api/` e a base `knowledge/celeste-core-v1.json` para dentro de `dist/`, e afirma que as quatro funções chegaram lá.
6. **Patch do HTML** (`patchExportHtml`, linhas 131-172): injeta `notranslate` em duas camadas, `viewport-fit=cover`, a correção de altura `100dvh`, a splash e as tags Open Graph — e depois confere marcador por marcador que os cinco patches ficaram no arquivo.
7. **Paridade EN/PT** (`scripts/i18n-parity.js`, linha 478).
8. **Preflight local** (`localPreflight`, linhas 208-246): sobe um servidor local do `dist/`, roda o E2E completo e o QA responsivo **antes** de publicar. Este é o portão que impede publicar quebrado.
9. **Vínculo Vercel + validação do vínculo** (`validateVercelLink`, linhas 79-92): confere `orgId`, `projectId` e `projectName` contra as constantes fixas antes de enviar. Existe para impedir deploy no projeto errado.
10. **`vercel deploy --prod`**.
11. **Validação pós-deploy em produção** (`productionChecks`, linhas 425-441):
    - o bundle ao vivo tem que bater com o bundle local (até 12 tentativas, `waitForLiveBundle`);
    - rota profunda `/rota-interna-f5` tem que responder 200 (pega o F5 quebrado);
    - hash SHA-256 da fonte ao vivo tem que bater com a local;
    - vídeo tem que responder 206 com `video/mp4`;
    - as 4 rotas Gemini têm que responder **403 `automated_request_blocked`** para um cliente sem BotID (`liveGeminiChecks`, linhas 324-338);
    - um Chrome real (não headless, janela posicionada fora da tela) tem que conseguir gerar e traduzir de verdade;
    - depois: paywall, mascote, recuperação em navegador, E2E com Gemini ligado, app em PT, auditoria de vazamento de idioma, QA das telas novas e medição de performance em 4G.

### Revalidar sem publicar

```
node scripts/deploy-celeste.js --validate-production
```

Roda só o bloco `productionChecks` (`scripts/deploy-celeste.js:463-467`).

---

## C) O que está implementado de verdade

### Telas (11 arquivos em `screens/`, mais 7 no fluxo de entrada)

`screens/`: `HomeScreen`, `JourneyScreen`, `ManifestationScreen`, `AffirmationsScreen`, `AffirmationAlarmScreen`, `MorningRitualScreen`, `VisionsScreen`, `VisionPlayerScreen`, `CommunityScreen`, `ProfileScreen`.

`screens/onboarding/`: `WelcomeScreen`, `ChatOnboardingScreen`, `RevealScreen`, `PaywallScreen`, `GrowScreen`, `NotificationsScreen`, `ReferralScreen`, além de `flow.js` e `onboardingUI.js`.

### Componentes (11 arquivos em `components/`)

`AffirmationCard`, `CelesteMascot`, `CelestialTrace`, `GradientCover`, `ManifestCard`, `NarratorSelector`, `PrimaryButton`, `SectionHeading`, `Typewriter`, `WeekChart`, `WelcomeVideo`.

### Endpoints (4 Vercel Functions em `api/`)

| Arquivo | O que faz | Proteção |
|---|---|---|
| `api/gerar-cena.js` | gera a cena/afirmação/história pelo Gemini | Origin allowlist + BotID |
| `api/traduzir-cena.js` | traduz a cena salva entre PT e EN | Origin allowlist + BotID |
| `api/transformar-sonho.js` | transforma o relato de sonho em afirmação | Origin allowlist + BotID |
| `api/gerar-audio.js` | narração neural (voz Gemini TTS) | Origin allowlist + BotID |

As quatro seguem exatamente o mesmo desenho de guarda. Em `api/gerar-cena.js`:
- `setResponseHeaders` (linha 635) devolve `false` quando o header `Origin` está ausente ou fora da lista;
- `handler` (linha 678-679) recusa com **403 `origin_not_allowed`** antes de validar qualquer coisa;
- `verifyHumanRequest` (linhas 649-670) exige BotID; bot detectado vira **403 `automated_request_blocked`**, verificador fora do ar vira **503 `bot_verification_unavailable`**;
- só depois disso o corpo é lido e a chave Gemini é usada (linha 695).
Espelhos: `api/gerar-audio.js:377,391`; `api/traduzir-cena.js:292,306`; `api/transformar-sonho.js:345,359`.

### Testes / portões

Este repositório **não tem `npm test` nem framework de teste**. A garantia vem de 25 scripts `scripts/verificar-*.js` mais `scripts/e2e-prod.js` e `scripts/qa-novos-recursos.js`, todos rodados pelo deploy. Contagem verificada:

- `scripts/verificar-*.js` no disco: **25 arquivos**;
- referenciados na lista `STATIC_GATES` do deploy: **24 linhas** (`scripts/deploy-celeste.js:20-41`);
- os demais (`verificar-icones.js`, `verificar-paywall.js`, `verificar-mascote.js`, `verificar-recuperacao-browser.js`, `verificar-waf-vercel.js` etc.) entram em outros pontos da esteira, não na lista estática.

Isso importa na prática: **não existe `npm test` para rodar antes de commitar.** A única forma de exercitar os contratos é rodar cada `node scripts/verificar-*.js` individualmente (todos têm alvo em `package.json:11-32` no formato `verify:*`), ou rodar o deploy inteiro.

### Idiomas

**Dois: inglês e português.** Um único arquivo, `constants/i18n.js` (82 linhas), com os blocos `en:` (linha 34) e `pt:` (linha 58). O portão `scripts/i18n-parity.js` compara os dois e reprova o deploy se divergirem; `scripts/auditoria-idiomas.js` caça texto em inglês vazando no app em português.

### Backend de dados

Supabase, com 3 migrations versionadas em `supabase/migrations/`:
`001_constelacao_celeste.sql`, `002_community_story_consent.sql`, `003_community_delete_idempotent.sql`.
Consumido só por `services/communityStories.js` (a Comunidade). O resto do app é local no aparelho.

### Módulo nativo

`modules/celeste-affirmation-alarm/` — módulo Expo em Swift para o alarme de afirmação no iOS (AlarmKit): `CelesteAffirmationAlarmModule.swift`, `AffirmationAlarmCoordinator.swift`, `NeuralWavSoundWriter.swift`, `SpeechSoundWriter.swift`. Só iOS, sem contraparte Android.

### Analytics

**Zero.** Procurei por `analytics`, `gtag`, `pixel`, `posthog`, `GA_ID` em `App.js`, `screens/`, `components/`, `services/`, `utils/` e `context/`: nenhuma ocorrência. Não há nenhuma medição de funil neste app.

---

## D) O destravamento conhecido

**A Celeste não tem cobrança nenhuma. Não há um bloqueador técnico esperando conserto — o produto simplesmente ainda não pede dinheiro a ninguém.**

A tela que deveria vender diz o contrário, em código, sem ambiguidade — `screens/onboarding/PaywallScreen.js:10-11`:

```js
// Tela de acesso enquanto o billing não está ligado. Ela não promete trial nem
// mostra preço fictício: o CTA apenas conclui o onboarding, sem cobrança.
```

E o texto que a pessoa lê (`screens/onboarding/PaywallScreen.js:21-24`):

- botão: "Acesso aberto nesta versão"
- nota: "Nenhum teste começa e nenhuma cobrança é feita."
- restaurar: "Assinatura entra em breve — ainda não há nada para restaurar."

O `onPress` do botão principal chama `completeOnboarding()` (linha 39-47) e entra no app. Não existe checkout, nem Hotmart, nem Stripe, nem RevenueCat: procurei os quatro termos em `constants/`, `screens/`, `components/`, `context/`, `services/`, `utils/` e `App.js` — as únicas ocorrências de "subscription" são a palavra em inglês para *listener* de evento (`MorningRitualScreen.js:411`, `WelcomeVideo.js:73`) e os textos legais dizendo que não há assinatura.

O documento legal confirma e transforma isso em requisito — `constants/legal.js:164-165`:

> "Esta versão não cria uma assinatura paga. Antes de qualquer compra ser oferecida, o Celeste deverá mostrar o preço exato, o período de cobrança, as condições de renovação e o caminho de cancelamento."

**Então o destravamento é uma decisão de produto, não um conserto:** escolher o modelo de cobrança e o provedor, e construir a tela de venda de verdade. Enquanto isso não acontece, cada geração de cena, tradução, sonho e voz é um custo de Gemini que sai do bolso e não volta. Ao contrário do Cosmic Guide, aqui não existe um "link vazio" para preencher — existe uma tela inteira para escrever.

### Segundo destravamento, para loja

Publicar nas lojas exige resolver o modelo de autenticação das APIs. Está escrito em `docs/RETOMADA-CELESTE.md:280-283`:

> "Antes de distribuir binarios iOS/Android, substituir a ausencia natural de `Origin` do fetch nativo por sessao/atestacao verificavel. Nunca reabrir requisicoes sem Origin anonimas usando um segredo embutido no aplicativo."

O motivo é concreto: o app nativo não manda header `Origin`, e as quatro funções recusam com 403 exatamente quem não manda `Origin`. Ou seja, **hoje um build iOS/Android não conseguiria falar com o próprio backend.** O caminho tentador (embutir um segredo no app para pular a checagem) está proibido pelo próprio documento.

### Pendências fora desta máquina (`docs/RETOMADA-CELESTE.md:250-256`)

- Validar o AlarmKit num aparelho com iOS 26 — o Windows não roda o framework da Apple.
- Aplicar `supabase/migrations/003_community_delete_idempotent.sql` no projeto Supabase. A migration está validada no repositório mas nunca foi aplicada: esta máquina não tem CLI do Supabase, projeto vinculado nem credencial de banco.

---

## E) O que NÃO fazer neste repositório

Esta é a seção mais importante. Cada item custou tempo ou dinheiro pelo menos uma vez.

### 1. Nunca publique com `vercel deploy` na mão

O comando é `npm run deploy:web` (ou o `.sh`, que chama o mesmo `.js`). Um `vercel deploy` avulso pula, entre outras coisas:

- os 24 portões estáticos;
- a cópia das 4 funções de `api/` e da base `knowledge/` para dentro de `dist/` — **sem isso o site sobe sem backend**, porque o deploy é feito de dentro de `dist/`, não da raiz (`copyDeployInputs`, `scripts/deploy-celeste.js:100-129`);
- os 5 patches do `index.html` — sem eles o Google Tradutor reescreve o DOM, a altura quebra em `dvh`, some a splash e somem as tags Open Graph (`patchExportHtml`, linhas 131-172);
- a validação de que o projeto Vercel é o certo (`validateVercelLink`, linhas 79-92) — esta trava existe porque publicar no projeto errado já foi um risco real, e está registrada em `docs/RETOMADA-CELESTE.md:52-53`;
- toda a verificação pós-deploy.

### 2. Não trate a proteção das APIs Gemini como opcional

As quatro rotas queimam cota paga do Gemini a cada chamada. A defesa tem três camadas e **as três são verificadas no deploy**:

- **Origin allowlist** — `api/gerar-cena.js:628-646`, e espelhos nos outros três arquivos.
- **BotID** — `api/gerar-cena.js:649-670`.
- **Rate limit no WAF da Vercel** — 12 POSTs por 60 segundos somando as quatro rotas, por IP + JA4, regra `rule_celeste_gemini_api_rate_limit_o1N0Tn`, versionada em `ops/vercel-firewall-gemini-rate-limit.json`.

Dois detalhes que já pegaram alguém:

- **O `Map()` em memória foi removido de propósito.** Está registrado em `docs/RETOMADA-CELESTE.md:270`: "O `Map()` por instancia foi removido. A protecao distribuida esta no Vercel WAF". Não reintroduza contador em memória achando que é proteção — em serverless cada instância tem o seu, e ele não protege nada contra abuso distribuído.
- **A regra do WAF vive no painel da Vercel, não no código.** `ops/vercel-firewall-gemini-rate-limit.json` é o contrato versionado; `scripts/verificar-waf-vercel.js` lê a configuração *ativa* e reprova o deploy se ela divergir. Uma auditoria de 25/08 encontrou a regra ativa cobrindo só duas das quatro rotas (`docs/RETOMADA-CELESTE.md:274-276`). **Se você mudar as rotas protegidas, mude o JSON E aplique no painel** — senão o deploy trava, corretamente.

### 3. Não afrouxe a checagem de `Origin` para fazer o app nativo funcionar

Já explicado em (D). A proibição é explícita em `docs/RETOMADA-CELESTE.md:282-283`. O caminho certo é sessão ou atestação verificável, não um segredo dentro do bundle.

### 4. Não confunda `dist/` com fonte

O deploy é executado **de dentro de `dist/`** (`cwd: DIST` nas chamadas da CLI, `scripts/deploy-celeste.js:481-484`), e `dist/` recebe cópias de `vercel.json`, `.vercelignore`, `api/*.js`, `package.json` reduzido e `knowledge/`. Editar qualquer coisa dentro de `dist/` é jogar trabalho fora: o próximo export com `--clear` apaga tudo. A fonte é a raiz.

### 5. Não limpe nem reverta o worktree

`docs/RETOMADA-CELESTE.md:221-224`, seção "Cuidado com o repositório":

> "O worktree já contém muitas mudanças anteriores e arquivos do usuário. Não reverter nem limpar alterações fora desses pontos. Trabalhar sempre em `D:\Projetos\TaskFlow` e manter artefatos grandes no drive D:."

### 6. Não mexa no `.vercelignore` sem entender a inversão

`.vercelignore` tem duas linhas que parecem erradas e não são:

```
!**/node_modules
!**/node_modules/**
```

O comentário logo acima explica (`.vercelignore:1-2`): "A Vercel ignora node_modules por padrão — mas o export web do Expo coloca as fontes dos ícones em assets/node_modules/@expo/... Sem isso, ícone vira ▯." Apagar essas duas linhas quebra todos os ícones em produção.

### 7. Não invente conteúdo social nem depoimento

É regra de produto com portão automático. `screens/CommunityScreen.js:35`: "Este espaço nunca é preenchido com depoimentos inventados." O E2E confere (`scripts/e2e-prod.js:541`): "Comunidade começa vazia e nunca inventa depoimentos."

### 8. Não rode o deploy sem Chrome instalado no caminho padrão

`liveGeminiChecks` sobe um Chrome **real, não headless** (`scripts/deploy-celeste.js:361-378`), porque o BotID reprova headless de propósito. O caminho vem de `CHROME_PATH` ou cai no padrão `C:\Program Files\Google\Chrome\Application\chrome.exe` (`scripts/deploy-celeste.js:18`). Sem isso, o deploy publica e depois falha na validação.

---

## F) Segredos e configuração

**Nenhum valor de chave aparece neste documento e nenhum segredo em texto puro foi encontrado no repositório.**

### Variáveis, e onde cada uma vive

Modelo documentado em `.env.example` (arquivo versionado, só com nomes e comentários — sem valores).

**Podem entrar no bundle (prefixo `EXPO_PUBLIC_`, são públicas por definição):**

| Variável | Onde | Para quê |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env.example:4` | projeto Supabase da Comunidade |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env.example:5` | chave anon, só leitura conforme RLS |
| `EXPO_PUBLIC_CELESTE_API_URL` | `.env.example:8` | base do backend para builds nativos |

**Só no backend / painel da Vercel — nunca com prefixo `EXPO_PUBLIC_`:**

| Variável | Onde | Para quê |
|---|---|---|
| `GEMINI_API_KEY` | `.env.example:11`, lida em `api/gerar-cena.js:693` | chave paga do Gemini |
| `GEMINI_MODEL` | `.env.example:12` | padrão `gemini-3.7-flash` |
| `GEMINI_TTS_MODEL` | `.env.example:13` | modelo de voz |
| `GEMINI_TTS_TIMEOUT_MS` | `.env.example:14` | tempo limite da voz |
| `GEMINI_PAID_DATA_TERMS_ACCEPTED` | `.env.example:16` | trava de privacidade, ver abaixo |
| `CELESTE_ALLOWED_ORIGINS` | `.env.example:17`, lida em `api/gerar-cena.js:629` | allowlist de origem |
| `CELESTE_ALLOW_LOCAL_BOT_BYPASS` | `.env.example:19` | bypass do BotID só em `vercel dev` |

### Duas travas que valem entender antes de mexer

**`GEMINI_PAID_DATA_TERMS_ACCEPTED`** — `api/gerar-cena.js:690-696`:

```js
// Personal profile fields may only leave the app after the owner explicitly
// confirms that this key belongs to a paid Gemini project under paid terms.
if (!apiKey || process.env.GEMINI_PAID_DATA_TERMS_ACCEPTED !== '1') {
  return sendJson(res, 503, 'generation_not_configured');
}
```

Não é configuração de conveniência: é a trava que impede dado íntimo de sair do app rumo a um projeto Google gratuito, onde o conteúdo pode ser usado para treino. Ligar isso sem faturamento ativo é um problema de privacidade, não de build.

**`CELESTE_ALLOW_LOCAL_BOT_BYPASS`** — só surte efeito quando `VERCEL_ENV` não é `production` nem `preview` (`api/gerar-cena.js:652-657`). Preview e produção fecham no BotID de qualquer jeito, mesmo com a variável em `1`.

### Cobertura do `.gitignore`

`.gitignore` cobre `.env`, `.env.local` e `.env.*`, com exceção explícita `!.env.example`. Também ignora `node_modules/`, `dist/`, `.vercel/` e `.expo/`. Nenhum arquivo `.env` real existe no disco hoje.

### Identificadores não secretos, mas fixos no código

`scripts/deploy-celeste.js:13-16` traz escopo, nome, `orgId` e `projectId` da Vercel em texto puro. **Isso é intencional e não é segredo** — são os valores contra os quais `validateVercelLink` compara para impedir deploy no projeto errado. Trocar esses valores por variável de ambiente destruiria a proteção.

---

## G) Estado de versionamento

- **Último commit:** `eecb0b77a77cbc589dd67fcdf15c26b9a7ac7a36` — "Corrige privacidade e cancelamento das geracoes Gemini", 26/08/2026 00:48.
- **Modificados:** 0. **Não rastreados:** 0. `git status --porcelain` volta vazio: **worktree limpo, nada de trabalho importante fora do versionamento.**
- **Remote:** `origin` configurado para fetch e push; confirme o endereço real com `git remote get-url origin`. O produto chama Celeste.
- **Branch:** `master`, sincronizada com `origin/master` (mesmo SHA nas duas pontas — nada pendente de push).
- **Ritmo:** 8 commits desde 20/08, sete deles entre 25 e 26/08. Repositório em atividade intensa e recente.
