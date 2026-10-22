# Auditoria Play Store — Celeste (20/10/2026)

Auditoria somente de leitura, feita antes de enviar a Celeste para a Google Play. Não alterei código e não fiz commit.

## Execução — 20/10, noite (atualizado depois da auditoria)

O que já foi corrigido no código e o que continua com você. As seções abaixo ficam como foram escritas, como registro.

| Item | Situação | Commit |
|---|---|---|
| B1 Conta Google Play / D-U-N-S | **Pendente — você**, no Play Console | — |
| B2 Política com "nome legal pendente" | **Pendente — falta o nome legal e a regra de retenção da sessão anônima.** O link da política pública dentro do app já foi feito | 57f7a9f |
| B3 Ficha prometia o Espelho Vivo | **Corrigido.** A descrição cita só o que o Android tem: cena viva, Meu despertar, Jornada e compartilhar em imagem ou vídeo | 57c57f7, 7264833 |
| B4 Fotos da ficha tiradas do site | **Pendente:** refazer as 8 no Android, pela trilha interna | — |
| B5 AAB desta versão | Gerado depois do merge; **teste em aparelho real pendente** | — |
| R1 Avaliação logo depois da Cena-Âncora | **Mantido** por decisão do Lenda (não é violação) | — |
| R2 WebView | **Parcial:** `setSupportMultipleWindows={false}` nas duas WebViews; filtro de navegação adiado porque só dá para testar em aparelho | 4493b7b |
| R3 Público 18+ | **Console — você** | — |
| R4 Privacidade e notas ao revisor | **Corrigido:** política v1.7.0 de 21/10 (voz da ElevenLabs e textos com IA no Android) e notas ao revisor atualizadas | 57f7a9f, 2f76feb, docs de 21/10 |
| R5 Denúncia de IA em mais telas | **Agora obrigatório:** desde 21/10 o Android gera voz e textos com IA; o botão entra em toda tela onde essa voz toca (tarefa V1 do plano das vozes) e em toda tela que mostra texto escrito pela IA (tarefa T1 do plano dos textos) | — |
| R6/R7 Supabase | **Painel — você:** limite de login anônimo, avisos de segurança e migrations 013/014 | — |
| R8 npm audit | Sem ação: são ferramentas de build | — |
| R9 Vídeo de abertura pela internet | **Adiado** (opcional) | — |
| R10 Direitos e IA dos materiais | **Registrado.** Falta confirmar se a ElevenLabs estava em plano pago em 27/08; com a voz no Android, a conta precisa estar em plano pago (o grátis não permite uso comercial) | 57f7a9f |
| R11 Botão "Restaurar" | **Removido** | 57f7a9f |
| R12 Target 36, 16 KB e permissões | Conferir no Explorador de pacotes depois do 1º upload | — |
| Revisão final: cena viva e vídeo no Android release | **Corrigido:** no AAB a cena pronta não chegava à animação | 9a2a383 |
| Revisão final: despertar parava quando a tela apagava | **Corrigido:** a tela fica acesa enquanto a voz fala, sem permissão nova | 9a2a383 |
| Vozes da ElevenLabs no Android (sua decisão de 21/10) | **Textos prontos:** política v1.6.0, ficha, nota ao revisor, Data safety e declarações de IA. **Falta você:** configurar a Play Integrity (`docs/PLAY-INTEGRITY-PASSO-A-PASSO.md`) e testar a voz pela trilha interna | docs de 21/10 |
| Textos com IA no Android (sua decisão de 21/10): Cena-Âncora e visões e afirmações das seis áreas | **Textos prontos:** política v1.7.0, ficha, nota ao revisor, Data safety (agora com nome, cidade e outras informações) e declarações de IA. **Falta você:** a mesma Play Integrity da voz, sem passo extra, e testar os textos pela trilha interna | docs de 21/10 |

**Atenção (21/10):** o Android passou a gerar voz e textos com IA. Nas seções abaixo, frases como "não usa IA no Android", "o Android não gera conteúdo com IA" e "Play Integrity não necessário na v1" descrevem a versão auditada em 20/10. O que vale agora é esta tabela e a seção "O que o Lenda faz no Play Console".

- **Versão auditada:** commit `411d645` da branch `feat/despertar-compartilhar-cena-viva`. A branch ainda está em construção e não tem cópia no GitHub.
- **O que eu conferi:**
  - o código e a configuração, inclusive o manifesto gerado pelos plugins (`npx expo config --type introspect`);
  - os manifestos das bibliotecas nativas;
  - o site em produção: páginas, cabeçalhos de segurança e o JS publicado;
  - as APIs, testadas ao vivo sem credencial;
  - o histórico do git e o `npm audit`;
  - as regras do Google, lidas hoje nas páginas oficiais.
- **O que eu não consegui conferir:**
  - **Play Console:** não tenho acesso.
  - **Supabase ao vivo:** o MCP respondeu "You do not have permission". O projeto `etufsftzgietvhaiubcz` pertence à integração da Vercel e não aparece na conta conectada.
  - **AAB final:** o AAB desta branch não existe. Pela regra desta auditoria, não rodei `prebuild` nem `export`.
  - **Aparelho Android físico:** não há nenhum disponível.

  Tudo o que depende disso aparece como **não verificado**.

---

## Veredito

**Pode enviar hoje? NÃO.**

**Contagem: 5 bloqueadores · 12 riscos · 24 itens OK.**

O app está bem comportado diante das regras do Google:
- não usa IA no Android;
- não tem alarme exato, serviço em primeiro plano, anúncios nem compras;
- não vaza nenhum segredo;
- pede só duas permissões sensíveis, o microfone e as notificações.

O que trava o envio não é o código, e sim cinco pendências:
1. a conta do Google;
2. a política de privacidade, que ainda diz "pendente";
3. a ficha da loja, que promete um recurso que o Android não tem;
4. as fotos da ficha, que foram tiradas do site;
5. o AAB desta versão, que ainda não existe nem foi testado num Android de verdade.

**Ordem para destravar:**
1. **Você:** terminar a verificação da conta (B1).
2. **Você:** informar o nome legal e o prazo de retenção, para um agente corrigir a política (B2).
3. Tirar o "Espelho Vivo" da descrição da Play. Leva 5 minutos (B3).
4. Fechar a branch, gerar o AAB, instalar num Android, testar e tirar as fotos (B4 e B5).
5. Preencher o Console com as respostas da seção "O que o Lenda faz no Play Console".

---

## BLOQUEADORES

### B1. A conta de organização da Google Play ainda não está confirmada
- **O que é:** sem conta verificada, não dá para criar o app nem enviar nada.
- **Evidência:** a última conferência registrada é de 04/09/2026. A conta estava "parada no perfil para pagamentos, aguardando o D-U-N-S" (`docs/store-submission-pending.md:59-63`, `store-listing/PREENCHER-PARA-PUBLICAR-PLAY-STORE.md:27`). A situação de hoje **não foi verificada**, porque não tenho acesso ao Play Console.
- **Regra:** desde 30/09/2026, todo pacote da Play precisa estar registrado por um desenvolvedor verificado. O Brasil está entre os primeiros países. Trecho oficial: "Effective September 30, 2026, all Play packages must be registered to meet Android developer verification requirements." (https://support.google.com/googleplay/android-developer/answer/16984799)
- **Menor correção:**
  1. Você informa o D-U-N-S e conclui a verificação direto no Play Console.
  2. Depois de criar o app, confira no Painel se o pacote `com.celesteapp.affirmations` aparece como registrado. O Google tenta registrar sozinho, mas alguns casos exigem registro manual.

### B2. A política de privacidade publicada ainda diz "pendente"
- **O que é:** a página que vai no Console avisa que o responsável e os prazos ainda não foram definidos.
- **Evidência:**
  - Ao vivo, em https://celeste-jet-two.vercel.app/privacidade: "**Nome legal do controlador pendente de confirmação.**" e "**Prazo externo a confirmar.**"
  - No código, `public/privacidade/index.html:37`, `:238` e `:325`. A versão em inglês faz o mesmo em `public/privacy/index.html:37`, `:234` e `:317`.
  - A política que aparece dentro do app (`constants/legal.js`) também não tem o nome do responsável. Ela está datada de 04/09 (`constants/legal.js:6-9`) e a do site de 17/09.
- **Regra:** a política precisa trazer "Developer information and a privacy point of contact or a mechanism to submit inquiries" e "The developer's data retention and deletion policy." (User Data, https://support.google.com/googleplay/android-developer/answer/10144311, conferido hoje). A exigência de nomear o app já está cumprida: a página cita "Celeste" e o pacote.
- **Menor correção:**
  1. Trocar os 3 trechos "pendente", nas versões pt e en, pelo nome legal da organização. Use exatamente o nome que vai aparecer como desenvolvedor na Play.
  2. Trocar "Prazo externo a confirmar" por prazos reais do que o Android envia:
     - linhas de denúncia: até 180 dias (já está escrito);
     - sessão técnica anônima: a regra que você decidir;
     - logs técnicos da Vercel e do Supabase: conforme a política de cada provedor, com o link.
  3. Pôr o mesmo nome em `constants/legal.js` e um link para a URL pública na tela "Política de privacidade" do app.
  4. Publicar pelo script oficial de deploy.

### B3. A descrição da Play promete o "Espelho Vivo", que não existe no Android v1
- **O que é:** a ficha diz que a história ganha "novos capítulos", mas no Android esse botão não aparece.
- **Evidência:**
  - A promessa está em `store-listing/pt-BR/google-play/full_description.txt:23-25` ("UMA HISTÓRIA QUE EVOLUI COM VOCÊ … cada novo capítulo pode acompanhar sua trajetória") e em `store-listing/en-US/google-play/full_description.txt:23-25`.
  - No app, o botão só existe quando a nuvem paga está ligada: `screens/DailyRitualScreen.js:293` e `:574` (`RELEASE_FEATURES.paidCloudProcessing && …`).
  - A geração exige consentimento de nuvem (`context/AppContext.js:2336-2342`), e a nuvem paga só existe no site (`constants/releaseFeatures.js:33`, `paidCloudProcessing: platformOS === 'web'`).
  - A foto 7, "Veja seu caminho evoluir" (`store-listing/screenshots.json:135-151`), reforça a mesma promessa.
- **Regra:** "We don't allow apps that contain false or misleading information or claims, including in the description, title, icon, and screenshots." e "Apps must not misrepresent their functionality" (Deceptive Behavior, https://support.google.com/googleplay/android-developer/answer/9888077).
- **Menor correção:**
  1. Apagar essa seção de 3 linhas nos 2 arquivos da Google Play, pt e en. Outra opção é trocá-la por algo que existe no Android, como "Acompanhe sua jornada de 21 dias e seus Rastros de Mudança".
  2. Na foto 7, usar a tela da Jornada.

### B4. As fotos da ficha são rascunhos tirados do site
- **O que é:** as 8 capturas foram feitas na versão web, que tem recursos que o Android não tem: controle de nuvem, escolha de voz e Espelho Vivo.
- **Evidência:**
  - `store-listing/screenshots.json:5-6` traz `"native_capture_required"` e `"controlled_web_draft_not_for_submission"`.
  - Em `store-listing/submission-readiness.json`, `nativeScreenshots.ready` está `false`.
  - `node scripts/verify-store-listing.js` rodado hoje avisa "WARN: submission evidence pending: nativeScreenshots".
- **Regra:** a mesma de Deceptive Behavior. As capturas não podem mostrar o que o app não faz (https://support.google.com/googleplay/android-developer/answer/9888077).
- **Menor correção:** instalar o AAB num Android ou num emulador e refazer as 8 telas. Os scripts `capture:store` e `render:store` já montam as artes. Marcar como "IA" as que mostrarem as cenas prontas (ver R10).

### B5. O AAB desta versão ainda não existe e nada foi testado num Android de verdade
- **O que é:** a versão nova traz três peças nativas que nunca rodaram num celular:
  - uma WebView com animação e gravação de vídeo (`react-native-webview` 13.16.1, `package.json:104`; `components/cenaViva/CenaVivaRecorder.js`);
  - o lembrete "Meu despertar" com som (`services/wakeReminders.js`);
  - o compartilhamento, que ainda está sendo construído.
- **Evidência:**
  - A branch não tem cópia no GitHub: `git rev-parse @{u}` responde "no upstream configured".
  - O script oficial para quando o commit não é igual ao do GitHub ou quando há arquivo fora de `scripts/e2e-shots` sem commit (`scripts/publicar-google-play.ps1:281-304`). **Atenção:** este relatório não foi commitado e também trava o script até ser commitado ou movido.
  - A própria spec admite: "sem aparelho Android, o vídeo via WebView e o lembrete com som no app não terão teste em aparelho real" (`docs/superpowers/specs/2026-10-20-celeste-despertar-compartilhar-cena-viva-design.md:244-245`).
  - Em `store-listing/submission-readiness.json`, `nativeFeatureValidation.ready` está `false`.
- **Regra:** "We don't allow apps that crash, force close, freeze, or otherwise function abnormally." (Minimum Functionality, https://support.google.com/googleplay/android-developer/answer/9898783)
- **Menor correção:**
  1. Terminar a branch, fazer o commit e enviar ao GitHub.
  2. Rodar `.\scripts\publicar-google-play.ps1 -StartBuild`. Depois do B1, rodar com `-SubmitInternal -ConfirmPlayPrerequisites` para cair só na trilha interna.
  3. Instalar pela trilha interna num Android real e testar:
     - onboarding, revelação com cena viva e a janela de avaliação;
     - "Meu despertar" com o app fechado e com a tela bloqueada;
     - compartilhar imagem e vídeo no WhatsApp;
     - Plano Celeste com microfone;
     - denúncia.
  4. Ler o "relatório de pré-lançamento" da trilha interna, que testa em aparelhos do Google.

---

## RISCOS
Vale corrigir antes se for barato.

### R1. A avaliação é pedida cedo demais
- **Evidência:** `screens/onboarding/RevealScreen.js:253-260` chama `maybeRequestStoreReview` dentro do "Continuar", logo depois da Cena-Âncora. Em seguida vai para a tela de acesso.
- **O que já está certo:** o app usa a janela oficial, pede uma vez por instalação e não faz pergunta antes (`utils/storeReview.js:4-26`).
- **Regra:** o Google pede que não haja pergunta antes, nem botão próprio, e lembra que a janela tem cota: "Google Play enforces a time-bound quota on how often a user can be shown the review dialog" (https://developer.android.com/guide/playcore/in-app-review). Isso não é violação. Mas no fim do onboarding a pessoa só usou o questionário, e o pedido gasta a cota cedo.
- **Correção (cerca de 5 linhas):** mover a chamada para depois do 2º Ritual de Um Minuto ou da 1ª prática do Plano.

### R2. A WebView da cena viva aceita qualquer origem
- **Evidência:** `components/cenaViva/CenaViva.js:201` e `components/cenaViva/CenaVivaRecorder.js:137` usam `originWhitelist={['*']}` com JavaScript ligado e sem bloqueio de navegação.
- **O que já é seguro:**
  - o HTML é local (`CenaViva.js:16-24`);
  - o texto é escapado (`CenaViva.js:14`);
  - não há toque na WebView (`pointerEvents="none"`, `:192`);
  - a biblioteca já desliga acesso a arquivos e conteúdo misto (`node_modules/react-native-webview/android/.../RNCWebViewManagerImpl.kt:80-84`).
- **Regra:** o Google recomenda não carregar conteúdo de fora com ponte JavaScript (https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion, https://developer.android.com/docs/quality-guidelines/core-app-quality). App com vulnerabilidade não corrigida pode ser removido (https://support.google.com/googleplay/android-developer/answer/10768383).
- **Correção:**
  1. Adicionar `onShouldStartLoadWithRequest` que só aceite `about:blank`/`data:`.
  2. Adicionar `setSupportMultipleWindows={false}`.
  3. Se possível, restringir o `originWhitelist`, testando no aparelho.

### R3. O público-alvo é 18+, mas o questionário tem a opção "Menos de 18"
- **Evidência:**
  - `screens/onboarding/flow.js:223` traz "Menos de 18".
  - A política do app diz que esses perfis ficam só no aparelho (`constants/legal.js:20`).
  - A recomendação para o Console é 18+ (`store-listing/console-fields.json:52`).
  - O ícone traz a mascote Celi.
- **Regra:** o Google pode revisar se o público declarado está correto e pede para remover da ficha o que atraia crianças (https://support.google.com/googleplay/android-developer/answer/9867159).
- **Correção:**
  - Declarar só "18 anos ou mais".
  - Responder "Não" para "atrai crianças sem querer".
  - Manter a opção "Menos de 18" como proteção.
  - Não usar arte infantil na ficha.

### R4. Os textos de privacidade e as notas para o revisor estão desatualizados para as novidades
- **Evidência:**
  - Nem o texto do app (04/09) nem o do site (17/09, v1.4.0) mencionam:
    - o compartilhar com cartão e vídeo, que cria arquivo no cache e manda um link só com UTM;
    - o "Meu despertar" no Android, cuja sequência fica guardada no aparelho;
    - a janela de avaliação da Google Play.
  - `store-listing/review-notes.md:95-97` diz "Despertador … Nao testar como recurso Android".
  - O passo 5 (`:71`) manda conferir controles de voz que o Android não mostra, porque ficam atrás de `paidCloudProcessing` em `screens/ProfileScreen.js:669`.
- **Correção:**
  - Acrescentar um parágrafo pt/en no site e no app.
  - No Console, usar a nota de revisão da seção "O que o Lenda faz", que já está atualizada.

### R5. O botão de denúncia de IA só existe em 4 telas
- **Evidência:**
  - `components/AiContentReportAction.js` é usado em `screens/AffirmationsScreen.js:792`, `screens/VisionPlayerScreen.js:946`, `screens/ManifestationScreen.js:1183` e `screens/MorningRitualScreen.js:1481`.
  - Não aparece em RevealScreen, nos cards da Home, em WakeSequenceScreen, PracticeRitualScreen e DailyRitualScreen, nem na prévia do compartilhar.
- **No Android v1 isso não é problema:**
  - a geração por IA está desligada (`constants/releaseFeatures.js:33`; `services/celesteApiSession.js:8-26`);
  - a política não cobre apps que "merely host AI-generated content and are unable to create content using AI" (https://support.google.com/googleplay/android-developer/answer/14094294, conferido hoje).
- **Quando vira problema:** no site, onde a IA está ligada, e numa futura versão Android com nuvem. Aí vale "Apps that generate content using AI must contain in-app user reporting or flagging features" (https://support.google.com/googleplay/android-developer/answer/13985936).
- **Correção:** antes de ligar a nuvem no app, pôr o botão nessas telas.

### R6. O login anônimo do Supabase não tem captcha no app
- **Evidência:**
  - `services/aiContentReports.js:120-133` cria uma sessão anônima ao denunciar.
  - O BotID só existe no site (`utils/botProtection.web.js:10-37`; o nativo é vazio em `utils/botProtection.js:1`).
  - Há cotas só para as linhas de denúncia (`supabase/migrations/013_ai_content_report_gateway.sql:185-250`).
- **Risco:** quem tiver a chave pública pode criar usuários anônimos à vontade. Não é regra da Play; é segurança (item 12 do Zeus).
- **Correção:** conferir no painel do Supabase o limite de logins anônimos. Mais tarde, usar Play Integrity. **Não verificado**, porque não tenho acesso.

### R7. O Supabase de produção não foi conferido ao vivo hoje
- **Evidência:**
  - O MCP respondeu "You do not have permission to perform this action" em `list_tables` e `get_advisors`.
  - `list_projects` mostra 5 outros projetos e não este.
  - No código das migrations está tudo certo:
    - as 21 tabelas criadas nas migrations 001-014 ligam RLS;
    - a tabela de denúncias e as de cota têm `revoke all … from public, anon, authenticated` (`011_ai_content_reports.sql:45`; `013_…:59-62`);
    - as funções de denúncia são só do `service_role` (`013_…:313-343`).
  - Não sei se as migrations 013 e 014 estão aplicadas ao vivo.
- **Correção:**
  1. Abrir o Supabase pela Vercel (Storage → celeste-data → Open in Supabase).
  2. Em Advisors → Security, conferir que não há aviso de RLS.
  3. Em Database → Migrations, conferir se 013 e 014 constam.

### R8. As dependências têm alertas no `npm audit`
- **Evidência:** `npm audit --omit=dev`, rodado hoje, deu **27** alertas: 1 crítico (`shell-quote`), 19 altos e 7 moderados.
  - Quase todos estão em ferramentas de build que não vão para o app: Metro, `@expo/cli`, `braces`, `micromatch`, `node-forge`, `source-map-js`.
  - O único que roda no app é `decode-uri-component`, que permite derrubar o app com uma URL malformada e entra pelo react-navigation. Ele já é barrado pelo guarda de deep links (`scripts/verificar-deep-links-seguros.js`, que passou hoje).
  - O "fix" que o npm sugere é rebaixar Expo e React Native, o que não se aplica.
  - O `supply-chain-risk-auditor` não foi rodado.
- **Correção:** aplicar `npx expo install --fix` quando sair patch do SDK 57. Nada disso bloqueia.

### R9. O vídeo de abertura vem da internet no Android
- **Evidência:** em `components/WelcomeVideo.js:8-10` e `:35`, o app nativo usa `https://celeste-jet-two.vercel.app/video/celeste-abertura.mp4`.
- **Risco:**
  - sem internet na primeira abertura, o vídeo não aparece (há tratamento de falha);
  - a abertura faz uma chamada de rede, e o IP chega à Vercel. Isso já está coberto no item "Vercel e BotID" da política.
- **Correção (opcional):** empacotar no app o mp4, que tem 577 KB.

### R10. Faltam direitos de uso e a declaração de IA dos materiais
- **Evidência:**
  - `store-listing/asset-rights.md` não lista as 42 cenas prontas (`assets/scenes/`, 3,4 MB; `constants/readyScenes.js:1-2`, "geradas de graça").
  - Também não lista as 12 prévias de voz (`assets/audio/previews/*.wav`).
  - O script de imagem usa por padrão o FLUX.1 [schnell] (`C:\Users\Sanches\.claude\zeus-imagem.js:19`). Qual modelo gerou cada cena **não foi verificado**.
  - O ícone foi feito com OpenAI ImageGen (`asset-rights.md:9`).
- **Regra:** a Play exige autodeclaração de IA nas imagens e vídeos da ficha: "You must provide a self-declaration for any submitted assets" (https://support.google.com/googleplay/android-developer/answer/17262077, conferido hoje).
- **Correção:**
  - Acrescentar as duas linhas ao `asset-rights.md`.
  - No Console, marcar "gerado por IA" no ícone, no feature graphic e nas capturas que mostrem cenas prontas.

### R11. O botão "Restaurar" aparece sem compra nenhuma
- **Evidência:** `screens/onboarding/PaywallScreen.js:94-109` e `constants/i18n.js:52`/`:72`. A resposta exibida é "ainda não há nada para restaurar".
- **Risco:** baixo. O revisor pode procurar compras que não existem.
- **Correção:** esconder o botão enquanto não houver cobrança.

### R12. Algumas coisas só o AAB ou o Console confirmam
- **Target API 36:** é obrigatório para app novo desde 31/08/2026 ("New apps and app updates must target Android 16 (API level 36) or higher", https://support.google.com/googleplay/android-developer/answer/11926878, conferido hoje). O esperado é 36, porque `node_modules/react-native/gradle/libs.versions.toml` traz `targetSdk = "36"` e o Expo lê esse catálogo (`node_modules/expo-modules-autolinking/.../ExpoRootProjectPlugin.kt:54-55`). Ainda não vi isso num AAB.
- **Páginas de 16 KB:** o React Native 0.86 e o Expo 57 trazem bibliotecas nativas, então o app está no escopo (https://developer.android.com/guide/practices/page-sizes). **Não verificado** no binário.
- **Permissões finais:** as únicas sensíveis esperadas são `RECORD_AUDIO` e `POST_NOTIFICATIONS`. Não há `AD_ID` no `firebase-messaging` 25.0.1, que vem do expo-notifications; conferi o manifesto oficial baixado hoje do Maven do Google. Também não há `FOREGROUND_SERVICE` no `media3` 1.9.0.
- **Registro do pacote:** ver B1.
- **Correção:** depois do 1º upload na trilha interna, abrir o "Explorador de pacotes de apps" e o Painel. Se algo divergir, parar.

---

## OK (verificado, uma linha cada)

1. **IA desligada no Android** — **substituído em 21/10, não vale mais:** no Android, a voz (ElevenLabs), os textos com IA (Cena-Âncora, visões e afirmações das seis áreas e cenas novas) e a tradução da cena (Google Gemini) vão ao backend depois do consentimento adulto e só com token Play Integrity verificado no servidor (`api/_play-integrity.js`, `NATIVE_OPERATIONS` = `audio`, `scene`, `translation`; `services/celesteApiSession.js`, `ANDROID_VERIFIED_OPERATIONS`). Imagem, sonho em nuvem e Espelho Vivo continuam só no site: o app recusa antes de criar sessão e o servidor responde 403 `native_attestation_required` (`scripts/verificar-fronteira-api-nativa.js` e `scripts/verificar-vozes-android.js`). O registro de 20/10, como foi escrito:
   - as 5 funções pagas passam por `celestePaidApiHeaders`, que recusa android/ios antes de criar sessão (`services/celesteApiSession.js:8-26`, `:62-70`; `generatePersonalizedScene.js:413-414`; `generatePersonalizedVisual.js:112-113`; `transformDream.js:196`; `translateManifestationScene.js:108`; `generateNarrationAudio.js:272`);
   - o servidor recusa o app nativo: `POST /api/gerar-cena` como android → 403, testado hoje;
   - `scripts/verificar-fronteira-api-nativa.js` passou hoje.
2. **Alarme exato:**
   - `SCHEDULE_EXACT_ALARM` e `USE_EXACT_ALARM` estão bloqueadas (`app.json:33`, `:35`; o introspect mostra `tools:node="remove"`);
   - sem essa permissão, o expo-notifications cai para lembrete comum (`node_modules/expo-notifications/.../ExpoSchedulingDelegate.kt:106-114`);
   - o módulo do despertador é só Apple (`modules/celeste-affirmation-alarm/expo-module.config.json:2`).
3. **Serviço em primeiro plano:**
   - `FOREGROUND_SERVICE` e `FOREGROUND_SERVICE_MEDIA_PLAYBACK` estão bloqueadas (`app.json:30-31`);
   - não há nenhum `<service>` no manifesto do app (introspect);
   - o expo-video só cria serviço com `supportsBackgroundPlayback` (`node_modules/expo-video/plugin/build/withExpoVideo.js:33-53`), que não é usado;
   - o expo-audio está com `enableBackgroundPlayback: false` (`app.json:48`).
4. **Fotos e vídeos:** o app não usa nenhuma `READ_MEDIA_*`, e as permissões de armazenamento estão bloqueadas (`app.json:32`, `:36`). O compartilhar usa o FileProvider do expo-sharing, que não pede permissão.
5. **Notificações:**
   - a permissão só é pedida no toque "Ativar" (`services/wakeReminders.js:127-146`);
   - o texto é genérico (`:56-66`);
   - o aviso é honesto: "Pode atrasar alguns minutos" (`screens/AffirmationAlarmScreen.js:187-190`).
6. **Microfone:**
   - usa só o reconhecedor do aparelho (`modules/celeste-practice-speech/android/.../CelestePracticeSpeechModule.kt:101`, `:117`, `:134`, `:278-279`);
   - avisa antes (`screens/PracticeRitualScreen.js:47-48`);
   - oferece uma alternativa sem microfone (`:111-112`).
7. **Anúncios e analytics:** não há SDK nenhum (`package.json:71-105`; a busca por sentry, amplitude, mixpanel, posthog, gtag e pixel deu 0). O `firebase-messaging` não declara `AD_ID`.
8. **Pagamentos:**
   - não há billing nem link externo de compra;
   - a tela de acesso diz "A assinatura não está ativa nesta versão" (`constants/i18n.js:67`; `screens/onboarding/PaywallScreen.js:10-11`);
   - o único link de saída é o e-mail de suporte (`screens/ProfileScreen.js:876`).
9. **Sem promessa de resultado:**
   - a ficha diz "não garante dinheiro, relacionamentos, saúde ou qualquer resultado" (`full_description.txt:44`, pt e en);
   - os termos do app dizem o mesmo (`constants/legal.js:152-156`);
   - a revelação diz "Sem garantia nem salto gigante" (`RevealScreen.js:67-68`);
   - a busca por promessa no texto do app (garantido, universo vai, científico, cura) não achou nada.
10. **Avaliação:**
    - só aparece a janela oficial, uma vez, sem pergunta e sem prêmio (`utils/storeReview.js`);
    - `scripts/verificar-perguntas-stella.js` passou hoje;
    - a biblioteca é a nova `com.google.android.play:review:2.0.1`, não a Play Core antiga.
11. **WebView:**
    - o conteúdo é local, e a biblioteca já desliga por padrão o acesso a arquivos e o conteúdo misto (`RNCWebViewManagerImpl.kt:80-84`);
    - o texto é escapado e não há toque (`CenaViva.js:14`, `:192`).
12. **Conta:**
    - não há cadastro nem login;
    - a sessão anônima da denúncia não é "app account" pela definição do Google: "a unique user identity that developers provide as a user-facing feature", com um mecanismo para a pessoa se autenticar (https://support.google.com/googleplay/android-developer/answer/13327111, conferido hoje). A página não fala de contas anônimas; isto é uma leitura minha.
13. **Exclusão de dados:**
    - "Perfil → Excluir denúncias de conteúdo de IA enviadas" (`services/aiContentReports.js:221-226` → `api/denunciar-conteudo-ia.js:329-338`);
    - as linhas expiram em até 180 dias (`013_…:65-99`; cron em `:383-386`).
14. **Política no ar e no app:**
    - `/privacidade`, `/privacy`, `/suporte` e `/support` deram HTTP 200 hoje;
    - no app, o caminho é Perfil → Política de privacidade (`screens/ProfileScreen.js:842-854`);
    - o conteúdo ainda tem pendência (ver B2).
15. **Backup do Android:** desligado (`app.json:28`, `allowBackup: false`).
16. **Deep links:** tamanho, parâmetros e UTF-8 malformado são barrados (`scripts/verificar-deep-links-seguros.js`, que passou hoje).
17. **Fronteira Android v1:** `verificar-fronteira-release-android.js`, rodado hoje como parte do `verify:android-release`, respondeu "lembrete do despertar ativos; audio em segundo plano e alarmes exatos bloqueados".
18. **Limites da ficha:** `verify:store` mostrou hoje título 27/30 e descrição curta 72/80, em pt e en.
19. **Pacote e versão:**
    - o pacote é `com.celesteapp.affirmations` (`app.json:42`);
    - o versionCode é remoto, com autoIncrement (`eas.json:4`, `:17`);
    - a flag da fronteira está nos dois perfis (`eas.json:11`, `:19`).
20. **Segredos:**
    - o JS do site (2,98 MB) não tem chave secreta, só a chave publicável do Supabase;
    - o histórico do git (86 commits) não tem chave real;
    - nenhum `.env` foi commitado.
21. **Login no servidor, testado ao vivo hoje:**
    - sem token → 401;
    - token falso → 401;
    - origem estranha → 403;
    - app nativo nas rotas pagas → 403;
    - cron sem segredo → 401.
22. **IDOR e campos extras na denúncia:**
    - o id da pessoa vem do token conferido no servidor, nunca do corpo do pedido;
    - os campos aceitos estão em lista branca (`api/denunciar-conteudo-ia.js:20-32`, `:96-131`, `:303-305`, `:329-332`).
23. **HTTPS e cabeçalhos de segurança, conferidos com curl hoje:**
    - `http://` redireciona com 308 para `https://`;
    - HSTS de 2 anos com preload;
    - CSP, X-Frame-Options DENY e nosniff.
24. **Bilíngue:** `scripts/i18n-parity.js` respondeu hoje "Paridade EN/PT ok em 88 arquivos".

---

## O que o Lenda faz no Play Console

O passo 0 é seu. Os passos 2 a 4 só valem depois de B2 e B3 corrigidos. O passo 7 (Play Integrity, para a voz e os textos com IA no Android) vem logo depois de criar o app.

### 0. Conta
Concluir o D-U-N-S e a verificação da organização.

### 1. Criar o app
- **Nome:** `Celeste: Afirmações Diárias`.
- **Idioma padrão:** Português (Brasil).
- **Tipo:** App, **Gratuito**.
- Aceitar as declarações do Google.

### 2. "Conteúdo do app" (App content)

| Pergunta | Resposta |
|---|---|
| Política de privacidade | `https://celeste-jet-two.vercel.app/privacidade`, depois de corrigir o B2 |
| Acesso ao app | "Todas as funcionalidades estão disponíveis sem acesso especial" + a nota em inglês abaixo |
| Anúncios | **Não**, o app não contém anúncios |
| ID de publicidade | **Não usa**. Se o Console acusar `AD_ID` no AAB, parar e me chamar |
| Público-alvo | **Somente 18 anos ou mais**. "Pode atrair crianças sem querer?" → **Não** |
| App de notícias | Não |
| App governamental | Não |
| Recursos financeiros | "Meu app não oferece recursos financeiros" |
| Apps de saúde (obrigatório para todos) | **Gerenciamento de estresse, relaxamento e acuidade mental** (escolha A, já feita). Não é dispositivo médico; sem Health Connect |
| Criação de conta | **"Meu app não permite criar conta"**; sem URL de exclusão de conta |
| Alarme exato / serviço em primeiro plano / fotos e vídeos / todos os arquivos | **Não devem aparecer.** Se o Console pedir alguma dessas declarações, o AAB trouxe permissão proibida: parar |

**Classificação de conteúdo (IARC; no Brasil é a ClassInd).**
- **Categoria:** a que não é jogo nem rede social. Os rótulos exatos só aparecem logado e **não foram verificados**.
- **Respostas:**
  - violência, sexo, palavrões, drogas e apostas: **Não**;
  - pessoas conversam ou trocam conteúdo dentro do app: **Não**;
  - compartilha dados pessoais com terceiros: **Não**. A ElevenLabs (voz), os provedores de texto (Anthropic; OpenAI como alternativa; Gemini só se nenhum dos dois estiver configurado), a Vercel (servidor), o Supabase (sessão) e o Google (Play Integrity) só processam em nosso nome. Se no Data safety você marcar "compartilhado", responda **Sim** aqui também, para as duas respostas baterem;
  - compartilha localização: **Não**;
  - compras digitais: **Não**;
  - acesso livre à internet: **Não**.
- **Se perguntar sobre IA (atualizado em 21/10):**
  - "o app gera conteúdo com IA?" → **Sim**: textos com IA (a Cena-Âncora e as visões e afirmações das seis áreas, escritas a partir do desejo e das respostas da própria pessoa) e voz de narração com IA (ElevenLabs, criada a partir do texto dela), os dois só depois do consentimento. As imagens do Android continuam as prontas, empacotadas;
  - "contém conteúdo criado com IA?" → **Sim**: imagens prontas e prévias de voz dos narradores, criadas por nós e empacotadas;
  - "tem denúncia dentro do app?" → **Sim**: "Denunciar este conteúdo de IA" em toda tela que mostra texto escrito pela IA e em toda tela onde a voz gerada toca, sem sair do app, como a política de IA exige (https://support.google.com/googleplay/android-developer/answer/13985936).
  - **Não verificado** se essas perguntas existem hoje no questionário.

**Segurança dos dados (Data safety)** — atualizado em 21/10 com a voz e os textos com IA no Android.

O que sai do celular agora, só depois que a pessoa permite a voz e os textos em nuvem ou envia uma denúncia:
- o texto que ela pediu para ouvir, o idioma e a voz escolhida → nosso servidor (Vercel); dele, só o texto e a voz → ElevenLabs, para criar o áudio;
- o desejo, a área, o idioma e as respostas selecionadas do questionário (nome, cidade, estado civil, trabalho e respostas livres; nomes de filhos e de pessoas importantes saem trocados, e faixa etária, gênero e sexualidade não vão) → nosso servidor; dele → o provedor de texto (Anthropic; OpenAI como alternativa; Gemini só se nenhum dos dois estiver configurado), para escrever a Cena-Âncora e as visões e afirmações. O servidor não grava as respostas nem os textos; os textos ficam no celular;
- a sessão anônima (um código do Supabase, sem nome nem e-mail) → para autorizar o pedido e aplicar o limite de gasto;
- a verificação do Google (Play Integrity) → para recusar pedidos que não venham do app oficial;
- a denúncia, como antes.

Respostas:
- Coleta ou compartilha dados obrigatórios? **Sim**.
- Tudo criptografado em trânsito? **Sim** (HTTPS no servidor, na ElevenLabs, nos provedores de texto, no Supabase e no Google).
- Oferece pedido de exclusão? **Sim**: "Perfil → Excluir denúncias de conteúdo de IA enviadas". O texto da voz, as respostas e os textos escritos pela IA não ficam guardados no nosso servidor.
- Tipos a marcar:
  - **Informações pessoais → IDs de usuário** (a sessão anônima);
  - **Informações pessoais → Nome** (o nome digitado no questionário, enviado para os textos com IA);
  - **Local → Local aproximado** (a resposta "Onde você mora?"; o Google cita "a cidade onde a pessoa está" como exemplo; não há GPS);
  - **Informações pessoais → Outras informações** (estado civil e trabalho);
  - **Atividade no app → Outros conteúdos gerados pelo usuário** (o desejo e as respostas livres, o texto que vira voz e o texto denunciado);
  - **Atividade no app → Outras ações** (os pedidos de voz e de textos e o motivo da denúncia);
  - **Dispositivo ou outros IDs** → **decisão sua**, por causa da Play Integrity. Recomendo marcar (opção conservadora): o Google diz que, para gerar a verificação, a Play coleta dados do app e do celular (https://developer.android.com/google/play/integrity/terms). Não marcar também é defensável, porque o resultado que chega ao nosso servidor não traz identificador do celular nem da pessoa.
- Para todos os tipos marcados:
  - Coletado: **Sim**;
  - Compartilhado: **Não**. Para o Google, passar dados a um "prestador de serviço" que processa em seu nome e sob suas instruções não é compartilhar. A Vercel hospeda nosso servidor, a ElevenLabs só cria o áudio que pedimos, os provedores de texto só escrevem os textos que pedimos, o Supabase guarda a sessão e o limite, e o Google só confere a verificação. Condição: os termos ou contratos de cada um confirmarem esse papel. Se algum não confirmar, marque **Sim** no tipo afetado;
  - Processado de forma efêmera: **Não**. Não dá para provar que a ElevenLabs, os provedores de texto e o Google apagam na hora; o Google diz que apaga os dados da verificação "após um período fixo";
  - **Opcional**. O Google chama de opcional o dado que a pessoa pode escolher não fornecer e ainda usar o app. A voz e os textos em nuvem só ligam com o consentimento; sem ele, o app funciona com a voz do celular e os textos montados no celular. A denúncia também é escolha dela;
  - Finalidades: **Funcionalidade do app** e **Prevenção de fraudes, segurança e conformidade** (em "Nome", "Local aproximado" e "Outras informações", só a primeira; em "Dispositivo ou outros IDs", só a segunda).
- **Decisão sua (vale para a voz, os textos e a denúncia):** o desejo e as respostas livres podem citar saúde, dinheiro ou dívidas; o texto que vira voz e o texto denunciado também, e podem repetir nomes de filhos e de pessoas importantes. A opção conservadora é marcar também "Informações de saúde" e "Outras informações financeiras" (`store-listing/google-play-console-prefill.md`, seção 4).
- **Não marcar** áudio (a voz criada não é gravação da pessoa, e o microfone continua só no celular), local exato, contatos, fotos, crash ou analytics.
- Compartilhar cartão ou vídeo é iniciado pela pessoa, e a avaliação é do próprio Google: **não mudam** as respostas.

**Nota de revisão em inglês, para colar em "Acesso ao app"** (atualizada em 21/10; a mesma de `store-listing/review-notes.md`):
> No sign-in or credentials are required. Select a language and complete onboarding; the first Anchor Scene is created on the device with cloud processing off. This Android version has no Community, purchases, ads or exact alarm, and it does not generate images with AI. Its AI features are text and voice, both made from the user's own content and only after consent. The first time the user taps to listen, or creates a new desire on Home, a dialog asks them to confirm they are 18 or older and to allow the AI voice and AI-written texts. Texts: Celeste's server then has an AI text model rewrite the Anchor Scene and the visions and affirmations for six life areas from the user's desire and selected onboarding answers (Visions and Affirmations tabs); before consent, or without a connection, these texts are assembled on the device from the same answers. When the user switches the app language, the scene is translated by Google Gemini through Celeste's server, with the same Play Integrity check: the AI-written scene or, if the AI has not rewritten it, the on-device one (title, intention, affirmation, story, identity phrase, bridge step and the labels of the answers it used), with saved names of the user's children and other people replaced by "someone close to me". Voice: when the user taps to listen to their own affirmation, vision, story or Anchor Scene, Celeste can read that text aloud with an AI voice from ElevenLabs, in the narrator chosen at the reveal or in Profile > Narration voice; only the text they asked to hear, its language and the chosen voice are sent, through Celeste's server, to create the audio. The server accepts AI text and voice requests only from the app installed from Google Play (Play Integrity); otherwise, or offline, the texts stay the on-device versions and the device's built-in voice plays with a notice. Reporting: on every screen that shows AI-written text in full or plays the AI voice, tap "Report this AI content", choose a reason and submit without leaving the app. After the scene is revealed, the standard Google Play in-app review dialog may appear once. "My wake-up": Home > My wake-up, add an Anchor Scene, vision or affirmation, choose a time and turn the reminder on; it is an ordinary notification with sound (no exact alarm) that opens the sequence, which plays after a tap. Sharing: open an affirmation, vision or the Anchor Scene, tap Share, preview the card, then share the image or the 8-second video through the system share sheet. Celeste Plan: Home > Celeste Plan, select a vision or Anchor Scene and an affirmation, tap Listen to full vision, then tap to start the microphone (on-device recognition only; nothing is stored or uploaded); Not now, Snooze 10 min and manual completion are available.

### 3. Ficha da loja (Presença na loja → Ficha principal)
- **Título, descrição curta e descrição completa:** copiar dos arquivos em `store-listing/pt-BR/google-play/` e `store-listing/en-US/google-play/`. O Espelho Vivo já saiu (B3) e, desde 21/10, a descrição tem a seção "Na voz que você escolher": voz criada com IA, com autorização, que precisa de internet. Também desde 21/10, "Uma cena feita com as suas respostas" diz que, com autorização e com internet, a IA escreve a Cena-Âncora e as visões e afirmações a partir das respostas; sem isso, os textos são montados no aparelho.
- **Ícone 512, feature graphic e 8 capturas do AAB (B4):** marcar a caixa **"gerado por IA"** no ícone, no feature graphic, nas capturas que mostrarem as cenas prontas (R10) e no vídeo de prévia, se ele tiver voz ou imagem de IA.
- **Categoria:** Saúde e fitness.
- **Tags:** só as que o Console oferecer entre Personal growth, Mindfulness, Journal, Meditation e Well-being.
- **E-mail:** `suporte@celestegroup.biz`.
- **Site:** `https://celeste-jet-two.vercel.app`.

### 4. Preço, países e testes
- **Preço:** Gratuito.
- **Países:** os que você escolher.
- **Testes:** primeiro a trilha **interna**. A regra de teste fechado com 12 pessoas por 14 dias vale só para conta **pessoal** criada depois de 13/11/2023 (https://support.google.com/googleplay/android-developer/answer/14151465). Conta de organização não precisa.

### 5. Depois do 1º upload
No "Explorador de pacotes de apps", conferir:
- **target 36**;
- **compatível com 16 KB**;
- permissões: só microfone e notificações como sensíveis.

Conferir também no Painel o **registro do pacote**, e ler o relatório de pré-lançamento.

### 6. Rotina
Definir quem lê a fila de denúncias e com que frequência. Já é exigido para o site e, desde 21/10, também para o Android, que gera voz e textos com IA.

### 7. Play Integrity (para a voz e os textos com IA no Android)
Depois de criar o app (passo 1), siga `docs/PLAY-INTEGRITY-PASSO-A-PASSO.md`: vincular um projeto do Google Cloud, criar a chave, colocá-la na Vercel e pôr o número do projeto no EAS. A mesma configuração libera a voz e os textos com IA, sem passo extra. Sem isso o app funciona, mas toca sempre a voz do celular e os textos ficam os montados no celular com as respostas.

---

## Status de cada item de `docs/store-submission-pending.md`

| Item do documento | Status hoje | Evidência |
|---|---|---|
| Organização Expo `@celestegroup` + projectId | **Feito** | `app.json:68-73` (owner `celestegroup`, projectId `77a85252…`) |
| Variáveis públicas no EAS `production` | **Não verificado** | Não tenho login no EAS; o doc diz concluído em 04/09 |
| `versionCode`/`buildNumber` | **Resolvido pelo versionamento remoto** | `eas.json:4` (`appVersionSource: remote`) e `:17` (`autoIncrement`); a spec diz que o versionCode 4 já foi gerado, o que não verifiquei |
| Credenciais de assinatura Android | **Provável feito, não verificado** | A spec (§6.1) diz que as credenciais do EAS já existem; Apple continua pendente |
| App Store Connect (Team ID, URLs, AlarmKit, Plano no iPhone, narração, descrições, App Privacy) | **Pendente, fora do escopo (iOS)** | Não avaliado nesta auditoria |
| Conta de organização no Play Console (D-U-N-S) | **Pendente / não verificado hoje** | B1 |
| Criar app, Play App Signing, conta de serviço do EAS Submit | **Pendente** | Depende do B1 |
| E-mail de suporte, URLs, territórios, trilha | **Parcial** | As 4 URLs deram 200 hoje e o e-mail está nas páginas; cadastro no Console e territórios pendentes; trilha interna em `eas.json:26` |
| Data Safety, declarações, classificação, acesso | **Pendente (respostas prontas acima)** | Seção "O que o Lenda faz" |
| Recapturar screenshots no build Android | **Pendente** | B4 |
| Declaração do microfone + instruções ao revisor | **Parcial** | Não existe formulário de microfone no Console (pesquisa de hoje, item 19). A nota de revisão foi atualizada acima |
| expo-speech: conferir se a voz do sistema usa rede | **Pendente** | Precisa de aparelho; não verificado |
| Não preencher declaração de alarme exato | **Continua certo, agora também para o "Meu despertar"** | `app.json:33`, `:35`; `ExpoSchedulingDelegate.kt:106-114`; `services/wakeReminders.js:5-6` |
| Nome legal na página e prazo de retenção dos provedores | **Pendente** | B2: página ao vivo com "pendente" |
| Retenção da sessão técnica e contratos | **Pendente** | B2 |
| Saldo dos provedores pagos | **Não afeta o Android v1** | A nuvem está desligada no app (`constants/releaseFeatures.js:33`); vale só para o site |
| Reexecutar deploy e confirmar 4 caminhos HTTPS | **Caminhos OK; deploy não reexecutado** | `curl` hoje: 200 nos 4; não fiz deploy (auditoria só de leitura) |
| Fronteira do site (Origin, BotID, WAF, cota) | **OK** | Ao vivo hoje: origem estranha → 403 |
| Chamadas nativas sem Origin fechadas | **OK** | `POST /api/gerar-cena` como android → 403 hoje |
| v1 Android bloqueia geração e narração pagas antes de criar sessão | **OK** | `services/celesteApiSession.js:8-26`; script de fronteira passou hoje |
| App Attest no iOS | **Pendente (iOS)** | Fora do escopo |
| Play Integrity antes de ligar a nuvem no Android | **Não necessário na v1** | Fica pendente para uma versão futura com nuvem |
| Nunca usar segredo embutido | **OK** | JS do site limpo; `EXPO_PUBLIC_*` só tem URL, chave publicável e flags |
| Migrations 001-012 sincronizadas | **Não verificado hoje** | MCP sem permissão (R7); o repositório já tem 013 e 014, e não sei se estão aplicadas ao vivo |
| Produção web ativa | **No ar** | 200 hoje; não conferi qual deployment está ativo |
| Smoke live da denúncia | **Não refeito** | Criaria usuário em produção. O endpoint responde 401 sem token |
| Políticas da Comunidade desligadas por padrão | **OK no código; ao vivo não verificado** | Migration `007_community_remote_kill_switch.sql` |
| v1 Android sem despertador exato, sem o módulo e sem as permissões | **OK** | `modules/celeste-affirmation-alarm/expo-module.config.json:2`; `app.json:29-37`; introspect |
| Exportação JSON pela folha de compartilhamento | **OK, não retestado** | `screens/JourneyScreen.js:382-386` |
| SDK 57, compileSdk/targetSdk 36, pacote, versionCode | **OK no código; confirmar no AAB** | R12 |
| `verify:practice-plan`, `verify:android-release`, `verify:store`, autolinking | **Parcial** | Hoje passaram: android-release, deep-links, store (com 5 avisos), fronteira nativa, denúncia de IA, perguntas Stella, privacidade de voz e i18n. Não rodei o `verify:practice-plan` |
| `verify:store:submission` com as 5 evidências | **Pendente** | Os 5 avisos de hoje: nativeScreenshots, nativeFeatureValidation, privacyFormsFinal, ownerAndReviewFields, assetRightsRecorded |
| Builds nativos novos depois do upgrade do Expo | **Parcial** | Houve AAB (versionCode 4, segundo a spec), mas esta branch exige um novo (B5) |
| Vídeo de abertura em aparelho | **Pendente** | Também depende de internet (R9) |
| Testes em Android real (Plano, lembretes, permissões, fuso, bateria etc.) | **Pendente** | B5 |
| Legibilidade, nenhum bloqueio, nenhum vazamento de áudio | **Pendente** | Precisa de aparelho |

---

## Checklist Zeus — 20 itens

| # | Item | Status | Evidência |
|---|---|---|---|
| 1 | Chaves de API escondidas | **OK** | JS do site baixado hoje: 0 `sb_secret_`, 0 JWT, 0 `sk-ant`/`sk-proj`, 0 `AIza`, 0 `sk_` (ElevenLabs); 1 `sb_publishable_`, que é pública por definição. `EXPO_PUBLIC_*` só tem URLs, chave publicável e flags (`services/celesteSupabase.js:4-8`) |
| 2 | Segredos no histórico do git | **OK, com ressalva** | 86 commits varridos com padrões de chave real. A única ocorrência é o texto falso `sb_secret_marketplace` em testes (`scripts/verificar-acesso-pago.js:225`, `scripts/verificar-esteira-deploy.js:311`). Nenhum `.env` commitado. `gitleaks` não está instalado |
| 3 | Só chave pública no cliente | **OK** | `services/celesteSupabase.js:5-8`; o service role só aparece no servidor (`api/_paid-access.js:212-224`) |
| 4 | RLS | **OK no código / não verificado ao vivo** | As 21 tabelas ligam RLS; denúncia e cotas revogadas para anon/authenticated (`011:45`, `013:59-62`); MCP sem permissão (R7) |
| 5 | Criptografia | **OK / não se aplica** | Sem CPF, cartão ou senha; HTTPS + HSTS; dados locais com `allowBackup: false` |
| 6 | Autorização no servidor | **OK (ao vivo)** | 401/403 nos testes de hoje; `api/denunciar-conteudo-ia.js:225-241`, `api/_paid-access.js:182-210` |
| 7 | IDOR | **OK (código)** | O id da pessoa vem do token (`api/denunciar-conteudo-ia.js:303-305`, `:329-332`). Não testei com 2 sessões: criaria usuários em produção |
| 8 | Mass assignment | **OK** | Lista branca `BODY_KEYS` e `GENERATION_KEYS` (`api/denunciar-conteudo-ia.js:20-32`, `:97`, `:129`) |
| 9 | Cookies | **Não se aplica** | Nenhum `Set-Cookie` em `/` e `/privacidade`; a sessão fica no AsyncStorage (`services/celesteSupabase.js:21`) |
| 10 | Hash de senha | **Não se aplica** | Não há senha, só sessão anônima |
| 11 | Rate limit | **OK (código)** | Cotas por usuário, ator e global (`013:185-250`) + WAF (`ops/vercel-firewall-gemini-rate-limit.json`) |
| 12 | Proteção contra bot | **Parcial** | BotID nas 5 rotas pagas do site; login anônimo sem captcha no app (R6) |
| 13 | Queries parametrizadas | **OK** | Nenhum SQL montado na mão em `api/` (grep); só RPC com JSON |
| 14 | Validação de entrada | **OK** | `api/denunciar-conteudo-ia.js:67-173` (24 KB, tipos, limites) |
| 15 | Conteúdo pago vazando | **Não se aplica** | Não há conteúdo pago (`screens/onboarding/PaywallScreen.js:10-11`) |
| 16 | Uploads | **Não se aplica** | Nenhuma rota recebe arquivo |
| 17 | Resposta da API cortada | **OK** | Devolve só `{ok, reportId, duplicate}` (`api/denunciar-conteudo-ia.js:322-326`) |
| 18 | Headers de segurança | **OK (ao vivo)** | CSP, HSTS, X-Frame-Options DENY e nosniff em `/` e `/privacidade` |
| 19 | Forçar HTTPS | **OK (ao vivo)** | `http://` → 308 |
| 20 | Scan de dependências | **Risco baixo** | `npm audit`: 27 alertas, quase todos de build (R8); `supply-chain-risk-auditor` não foi rodado |

---

## Regras do Google conferidas hoje (20/10/2026)

Fontes oficiais. As linhas marcadas com ✔ eu reli pessoalmente hoje; as demais vêm da pesquisa feita hoje com citação literal.

| Tema | O que vale | Situação da Celeste | Link |
|---|---|---|---|
| Target API ✔ | App novo e atualização: **API 36** desde 31/08/2026 | Esperado 36 (R12) | https://support.google.com/googleplay/android-developer/answer/11926878 |
| 16 KB | Obrigatório para app com código nativo e target 35+; atualização bloqueada a partir de 01/02/2027 | Não verificado no AAB (R12) | https://developer.android.com/guide/practices/page-sizes |
| Notificações | Permissão na hora do uso; sem formulário no Console | OK | https://developer.android.com/develop/ui/views/notifications/notification-permission |
| Alarme exato | `USE_EXACT_ALARM` só para app de alarme, timer ou calendário | OK, bloqueado | https://support.google.com/googleplay/android-developer/answer/16558241 |
| Serviço em 1º plano | Declarar cada tipo com vídeo | OK, não usa | https://support.google.com/googleplay/android-developer/answer/13392821 |
| Fotos e vídeos | `READ_MEDIA_*` só com declaração | OK, não usa | https://support.google.com/googleplay/android-developer/answer/14115180 |
| Conteúdo gerado por IA ✔ | Quem gera com IA precisa de denúncia dentro do app; quem só exibe está fora | Android não gera (OK); site precisa (R5) | https://support.google.com/googleplay/android-developer/answer/14094294 |
| Comportamento enganoso | Nada falso na descrição ou nas capturas | **B3, B4** | https://support.google.com/googleplay/android-developer/answer/9888077 |
| Avaliação no app | Sem pergunta antes, sem prêmio, sem botão próprio; há cota | OK, com R1 | https://developer.android.com/guide/playcore/in-app-review |
| Pagamentos | Billing só para venda digital; nada a fazer sem compras | OK | https://support.google.com/googleplay/android-developer/answer/9858738 |
| Exclusão de conta ✔ | Só se o app cria "app account" visível e com login | OK, não cria | https://support.google.com/googleplay/android-developer/answer/13327111 |
| Data safety | "Coletar" = sair do aparelho; service provider não é "compartilhar" | Respostas acima | https://support.google.com/googleplay/android-developer/answer/10787469 |
| Política de privacidade ✔ | No Console e no app; com desenvolvedor, contato e retenção | **B2** | https://support.google.com/googleplay/android-developer/answer/10144311 |
| Público-alvo | 18+; o Google revisa se a declaração é correta | R3 | https://support.google.com/googleplay/android-developer/answer/9867159 |
| WebView | Sem acesso a arquivos; sem ponte JS com conteúdo de fora | OK, com R2 | https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion |
| Classificação (IARC/ClassInd) | Obrigatória; app sem classificação é removido | Respostas acima; pergunta de IA não verificada | https://support.google.com/googleplay/android-developer/answer/9898843 |
| Conta nova / teste fechado | 12 testadores por 14 dias só para conta pessoal | Conta de organização: não se aplica | https://support.google.com/googleplay/android-developer/answer/14151465 |
| Verificação de desenvolvedor | Pacote registrado desde 30/09/2026 (Brasil primeiro) | B1 | https://support.google.com/googleplay/android-developer/answer/16984799 |
| Apps de saúde | Declaração obrigatória para todo app | Responder "estresse, relaxamento" | https://support.google.com/googleplay/android-developer/answer/14738291 |
| Assets de IA na ficha ✔ | Autodeclaração em cada imagem ou vídeo enviado | R10 | https://support.google.com/googleplay/android-developer/answer/17262077 |

**Próximo passo:**
1. Você conclui a conta (B1) e me passa o nome legal e a regra de retenção da sessão anônima (B2).
2. Um agente corrige B2 e B3 no mesmo dia.
3. Depois da branch fechada, gera o AAB, instala num Android, faz B4 e B5 e só então envia para a trilha interna.
