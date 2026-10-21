# Textos da Celeste com IA no Android — plano

> Para agentes: executar com superpowers:subagent-driven-development.

**Objetivo:** no app Android, a Cena-Âncora e o conjunto de visões e afirmações (as 6 áreas) passam a ser escritos pela IA a partir das respostas dela, igual ao site — cada pessoa recebe textos bem diferentes (decisão do Lenda, 21/10: "pode gastar crédito, tem bastante").

**Arquitetura:** o caminho do site já existe: `services/generatePersonalizedScene.js` → `api/gerar-cena.js` (Gemini) devolve a cena e a `journeySuite` (`source: 'remote'`), e `context/AppContext.js` faz o upgrade da suíte local (~:930-1000, ~:1150-1200). No Android ele está desligado (`paidCloudProcessing` só web; servidor só aceita a operação `audio` de nativo verificado). Este plano libera SÓ o texto (cena + suíte, e a tradução da cena se o fluxo de idioma precisar) para Android com Play Integrity verificada, reaproveitando a infraestrutura das vozes (`api/_play-integrity.js`, `services/appIntegrity.js`, `celesteApiSession.js`). Imagens (`gerar-visual`) continuam só no site.

**Base:** master 19be59f (inclui vozes no Android). Branch `feat/textos-ia-android`.

## Global Constraints
- Mesmo fluxo do site (mesma validação da suíte, mesmo guarda de gasto).
- **O máximo diferente possível, nada robótico** (pedido do Lenda, 21/10): o prompt da suíte/cena no servidor passa a exigir variedade real — detalhes concretos das respostas dela em cada área, aberturas e estruturas diferentes entre as 6 áreas e entre as visões/afirmações, sem clichês repetidos, voz natural de pessoa, sem promessa de resultado. A suíte LOCAL (sem IA: sem consentimento ou sem verificação) também ganha bancos de variação por área (aberturas, estruturas, imagens) escolhidos de forma determinística pelas respostas dela, para duas pessoas raramente receberem o mesmo esqueleto de frase. Medir: gerar a suíte local para ~20 perfis diferentes e mostrar a taxa de frases/esqueletos repetidos antes e depois.
- Android: texto (cena + suíte [+ tradução se necessária]) e voz na nuvem; imagens, sonho em nuvem/Espelho Vivo e o resto continuam fora. iOS igual.
- Servidor: operação nativa só com Play Integrity verificada (hash amarrado à sessão/corpo, como `audio`); lista explícita de operações nativas permitidas; o resto 403.
- Consentimento: no Android o texto do consentimento passa a citar voz E textos com IA, com versão própria do Android (sem forçar novo consentimento no site).
- Sem verificação → a suíte local (montada no aparelho com as respostas) continua valendo, sem erro na cara dela.
- Regra de IA da Play: denúncia dentro do app em toda tela com texto gerado (visões, afirmações, manifestação/Cena-Âncora, revelação, ritual).
- Bilíngue (S local + i18n-parity), sem permissão nova, portões de fronteira atualizados de propósito.

### Task T1: Liberar o texto com IA no Android (servidor + app)
- [ ] Teste que falha: nativo verificado pode `gerar-cena` (e `traduzir-cena` se o app usa) e recebe a suíte remota; `gerar-visual` e as demais continuam 403; sem token → 403; app Android com `cloudText` liga o upgrade da suíte e a cena por IA depois do consentimento (voz + textos); sem verificação → suíte local, sem aviso de erro; imagens indisponíveis.
- [ ] Implementar; passar; commit `feat: visões e afirmações escritas pela IA no Android`.

### Task T2: Política, Console e loja
- [ ] Política pt/en/app: no Android, as respostas e o desejo dela vão ao nosso servidor e ao Google Gemini (processador) para escrever a cena e as visões/afirmações; nada de imagem.
- [ ] Data safety / declarações de IA / notas ao revisor / ficha atualizadas; `verify-store-listing` passa; commit `docs: textos com IA no Android na política e no Console`.
