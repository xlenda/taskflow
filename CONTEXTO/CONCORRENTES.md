# Buracos fechados — pesquisa de 15 apps

**Sessão de 26/08/2026.** Fecha os três buracos apontados pela auditoria adversarial (`auditoria15.json`) sobre as 15 fichas de `fichas15.json`.

## REGRA APLICADA NESTE DOCUMENTO
Todo número aqui foi **visto numa página aberta nesta sessão**, com URL e data ao lado. Onde não consegui, está escrito **"não verificado"** — e isso aparece muitas vezes de propósito. Nenhuma URL foi construída por dedução. Onde duas fontes divergem, as duas estão reportadas com a divergência explícita.

---

# BURACO 1 — Faturamento

**Situação inicial:** 9 dos 15 apps sem número (Seek, Merlin, Co-Star, The Pattern, Astrolink, Blossom, Gratitude, Manifest/Aya, Stella).

## O achado mais importante deste buraco (leia antes dos números)

**Consegui números para 8 dos 9 apps — e a conclusão honesta é que quase nenhum deles serve para decidir investimento.** Isso não é fracasso da busca; é o resultado dela, e é a informação mais valiosa da seção.

Praticamente toda a receita disponível para apps desse porte vem do **AppGoblin**, e eu submeti o AppGoblin a um teste que ele **reprovou**:

- **O que passa no teste:** os dados de LOJA do AppGoblin são bons. O `rating_count` dele bate com a Google Play ao vivo, medida por mim hoje (Astrolink 20.505 vs 20.5xx; PlantIn 135.182 vs 135.218 medido por mim). Os `installs` também convergem com o AppBrain (Astrolink: 3.858.630 vs 3.857.083).
- **O que reprova:** a RECEITA não sobrevive à aritmética. O AppGoblin estima US$ 10.655/mês de IAP para o Nebula no Android. Com o ticket semanal de US$ 7,99 (~US$ 34,60/mês), isso implica **~308 assinantes ativos em 8,4 milhões de instalações — 0,0037% de conversão**. Com o ticket mensal de US$ 24,99, ~426 assinantes. Nenhum app de assinatura desse volume opera com 300 assinantes. **A ordem de grandeza está errada.**
- **Contraprova independente:** nas 900 reviews brasileiras do Nebula que li nesta sessão (BURACO 3), **204 alegam cobrança indevida**, várias citando R$ 150–200 na fatura. Esse volume de cobrança é incompatível com US$ 10 mil/mês globais no Android.
- **A metodologia do AppGoblin não é publicada.** `/about` carrega e não explica; `/docs`, `/docs/api` e `/docs/datasets` retornam 404.
- **O modelo é cego para receita fora da loja.** Isso é decisivo no caso do Stella (abaixo).

**Regra que aplico daqui pra frente, a mesma que a auditoria exigiu para o ThinkUp:** fonte que erra fato conferível não sustenta fato não-conferível. **Os campos de INSTALAÇÃO e AVALIAÇÃO do AppGoblin são utilizáveis. Os campos de RECEITA não são.** Registro os valores porque foram vistos, sempre colados à reprovação no teste.

## 1. Seek by iNaturalist — DESTRAVADO (org); receita do app = zero confirmada
- **Receita do APP: US$ 0.** AppGoblin, Android `org.inaturalist.seek` e iOS id 1353224144 (abertos 26/08/2026): `monthly_iap_revenue: 0`, `monthly_ad_revenue: 0`, com o texto literal **"Revenue not available"**. Coerente com app gratuito de ONG.
- **Receita da ORG (dado fiscal REAL — melhor fonte do documento inteiro):** ProPublica Nonprofit Explorer, API v2, EIN 92-1296468, aberta em 26/08/2026 (`https://projects.propublica.org/nonprofits/api/v2/organizations/921296468.json`):
  - **FY2023: receita total US$ 5.551.048**; doações/grants US$ 4.987.614; **receita de serviço de programa US$ 158**; despesas US$ 1.383.778; ativos ao fim US$ 4.327.787.
  - Registro BMF mais recente: `revenue_amount` US$ 4.711.360, `tax_period` 2024-12.
  - A divergência 5,55 mi vs 4,71 mi é de **anos fiscais diferentes** (2023 vs 2024), não contradição.
- **O 990 de FY2024 existe mas NÃO foi lido:** consta em `filings_without_data`. **Tentei baixar o PDF e recebi HTTP 403.** Nenhum número de 2024 detalhado é reportado aqui.
- **Leitura:** o Seek não fatura, ele custa. US$ 158 de receita de programa num ano é a prova.

## 2. Merlin Bird ID — receita do app = zero confirmada; receita da unidade NÃO verificada
- **Receita do APP: US$ 0.** AppGoblin, Android `com.labs.merlinbirdid.app` (12,27 mi installs, 931k MAU) e iOS id 773457673 (7,42 mi installs, 520k MAU), abertos 26/08/2026: IAP 0, Ad 0, "Revenue not available".
- **ARMADILHA DE ENTIDADE — e é por isso que aqui não entra número:** o publisher iOS é "Cornell University", EIN 15-0532082, cuja receita no ProPublica é **US$ 7,48 bilhões** (tax_period 2025-06). **Esse número é inútil e não deve ser usado** — é a universidade inteira, com hospital e campus. Existe ainda "Friends Of The Cornell Lab Of Ornithology Inc" (EIN 46-1979945), receita US$ 2.805.198, mas é **fundo de apoio**, não a operação do Lab nem do app.
- **O Cornell Lab of Ornithology não tem EIN próprio na base.** Receita do Lab como unidade e do Merlin: **não verificado**.

## 3. Co-Star — estimativa obtida; receita real NÃO verificada
- AppGoblin (26/08/2026): iOS id 1264782561 → `monthly_iap_revenue` US$ 13.435,36, ad 0 (13,9 mi installs, 546k MAU). Android `com.costarastrology` → US$ 9.061,67, ad 0 (8,48 mi installs, 126k MAU).
- **Imprensa aberta:** TechCrunch sobre a aquisição pela Midjourney (`https://techcrunch.com/2026/07/24/midjourney-acquired-the-astrology-app-co-star/`, aberta 26/08/2026). **Termos do negócio NÃO divulgados. Nenhuma receita do Co-Star informada.** Confirma ~4,3 mi de MAU e ~2 dezenas de funcionários.
- **⚠️ ALERTA:** um resumo de busca associou "~US$ 500 mi de receita anual" ao contexto Co-Star. **Esse número é da MIDJOURNEY (a compradora), não do Co-Star, e não foi confirmado em página aberta. NÃO use como proxy.**

## 4. The Pattern — estimativa obtida; receita real NÃO verificada
- AppGoblin (26/08/2026): iOS id 1071085727 → US$ 4.442,91 IAP, ad 0 (1,09 mi installs, 59k MAU). Android `com.thepattern.app` → US$ 2.679,99, ad 0 (4,19 mi installs, 44k MAU).
- Nenhuma fonte fiscal ou de imprensa com número. **Receita da empresa: não verificado.**

## 5. Astrolink — estimativa obtida; faturamento da empresa BR NÃO verificado
- AppGoblin (26/08/2026): Android `com.astrolink.webapp` → US$ 4.128,34 IAP, ad 0 (3,86 mi installs, 77k MAU). iOS id 1598327566 (publisher ESAPIENS TECNOLOGIA S.A.) → **US$ 53,02**, apenas 42,5k installs e 2,1k MAU.
- **Achado estrutural que vale mais que o número:** o Astrolink é um negócio **essencialmente Android/Brasil**; o iOS é residual (42,5 mil instalações contra 3,86 milhões). Qualquer leitura do app pelo iOS engana.
- **AppBrain** (`https://www.appbrain.com/app/com.astrolink.webapp`, aberta 26/08/2026): 3.857.083 downloads totais, 829/dia, nota 4,18 com 20.232 avaliações, rank 11 em Lifestyle. **AppBrain não expõe receita** (recurso pago).
- **Faturamento da ESAPIENS/ORBE: não verificado.** Econodata retornou 404. Buscas em português não acharam reportagem com número. CNPJs apareceram só em snippet de busca — **não confirmados, não reportados como fato**.

## 6. Blossom — estimativa obtida; receita real NÃO verificada
- AppGoblin (26/08/2026): iOS id 1487453649 (publisher Mosaic S.r.l.) → `monthly_ad_revenue` US$ 7.984,92 + `monthly_iap_revenue` US$ 2.478,03 ≈ **US$ 10,46 mil/mês** (5,67 mi installs, 100k MAU). Android `com.conceptivapps.blossom` → US$ 1.039,59 IAP, ad 0 (7,68 mi installs, **apenas 19k MAU**).
- **Divergência com a ficha antiga, reportada explicitamente:** a ficha trazia ScreensDesign com **US$ 95.000/mês**. O AppGoblin dá **~US$ 11,5 mil/mês somando as duas lojas**. **Diferença de ~8x entre duas estimativas de terceiro, nenhuma auditável.** Não escolho nenhuma.
- Receita da Mosaic Srl / Bending Spoons: **não verificado**.

## 7. Gratitude — estimativa obtida; receita real NÃO verificada
- AppGoblin (26/08/2026): iOS id 1372575227 (Hapjoy Technologies) → US$ 4.420,76 IAP, ad 0 (4,07 mi installs, 183k MAU). Android `com.northstar.gratitude` → US$ 6.955,22 IAP, ad 0 (5,94 mi installs, 123k MAU). Usa RevenueCat.
- Receita da empresa: **não verificado** (Tracxn mantém o campo atrás de paywall).

## 8. Manifest / Aya — DESTRAVADO, com o maior IAP estimado da lista
- **Manifest (Adhikari Studio)** segue **morto** (24 instalações) — sem alteração.
- **Aya: Manifest Your Dream Self (Lit Apps LLC)**, AppGoblin iOS id 6760195623, aberto 26/08/2026: **`monthly_iap_revenue` US$ 17.970,06**, ad 0 — o maior IAP estimado dos 9. 653k installs, **110k MAU**, lançado **15/04/2026** (4 meses de vida), **+160.200 instalações em 4 semanas**.
- **Sem versão Android** (`com.litapps.periodtracker` no AppGoblin → 404). É iOS-only.
- Sem Stripe nem Superwall nos SDKs — menos indício de receita fora da loja que o Stella.
- **Leitura:** é o app mais em ACELERAÇÃO do recorte. O número absoluto herda a desconfiança do AppGoblin, mas a **velocidade** (160 mil instalações em 4 semanas) é dado de loja, que é justamente a parte confiável da fonte.

## 9. Stella — NÃO DESTRAVADO: divergência de ~70x, e agora sei POR QUÊ
Este é o caso mais importante da seção. **Reporto as duas fontes e não escolho nenhuma.**

- **FONTE A — AppGoblin (estimativa modelada), aberta por mim em 26/08/2026** (`https://appgoblin.info/apps/6757347283`): `monthly_iap_revenue` **US$ 4.744,44**, ad 0. 398.850 installs, 46.882 MAU, lançado 28/01/2026. Sem Android.
- **FONTE B — Starter Story (auto-declarado pela fundadora)**, `https://www.starterstory.com/stories/she-built-this-300k-month-app-in-60-days`, aberta 26/08/2026: **"In JUST 2 months she hit $340K/Month"**. **A própria Starter Story rotula isso no HTML como "Self-reported by the founder in a Starter Story case study."** — a "verificação" do site é a palavra da fundadora, não auditoria.
- **DIVERGÊNCIA: US$ 4,7 mil/mês vs US$ 340 mil/mês. Fator ~70x.**
- **ACHADO TÉCNICO QUE EXPLICA A DIVERGÊNCIA — verificado por mim diretamente no HTML da página:** os SDKs do Stella incluem **Superwall, Stripe e RevenueCat**. **A presença do Stripe indica cobrança de assinatura FORA do IAP da App Store** — receita que um modelo baseado em loja **não consegue enxergar**. Isso torna plausível que o AppGoblin subestime muito o Stella, e é a explicação mais provável do 70x. *(Inferência minha a partir de um dado verificado, não um número confirmado.)*
- **Nenhuma confirmação independente dos US$ 340 mil.** `starterstory.com/stella` → 404. Os demais resultados (LinkedIn, BigGo, YouTube) apenas ecoam a mesma fonte auto-declarada.
- **Veredito: não há número confiável para o Stella.** Se a decisão depender dele, o próximo passo é prova primária (print do RevenueCat ou do App Store Connect) — só a fundadora pode fornecer.
- **Reforço vindo do BURACO 3:** o Stella no Android tem **0+ instalações e 23 reviews no total**. O negócio é 100% iOS, o que é consistente com receita concentrada e invisível para agregador de Play.

## Dado PRIMÁRIO de loja coletado por mim (não é estimativa)
Google Play ao vivo via `google-play-scraper`, 26/08/2026. Isto **a loja publica**:

| App | Pacote | Instalações | Faixa de IAP | Tem anúncio? |
|---|---|---|---|---|
| PlantIn | com.myplantin.app | 10.000.000+ | US$ 0,99 – 199,99/item | **Sim** |
| Nebula | genesis.nebula | 5.000.000+ | US$ 0,99 – 299,99/item | Não |
| Blossom | com.conceptivapps.blossom | 5.000.000+ | US$ 0,99 – 86,99/item | Não |
| Astrolink | com.astrolink.webapp | 1.000.000+ | US$ 1,99 – 59,90/item | Não |
| Stella | com.priestess.manifestation | **0+** | — | Não |

Isso **fecha um buraco que a auditoria apontou**: a faixa de IAP do Blossom (US$ 0,99–86,99) e a do Astrolink (US$ 1,99–59,90) agora são **preço confirmado em fonte primária**, no lugar dos preços "de relato de review" que a auditoria criticou.

## Estimativas AppGoblin consolidadas (⚠️ reprovadas no teste de plausibilidade — não usar para decisão)

| App | iOS (est./mês) | Android (est./mês) | Fonte fiscal real? |
|---|---|---|---|
| Aya | US$ 17.970 | não existe | não |
| Co-Star | US$ 13.435 | US$ 9.062 | não (termos não divulgados) |
| Blossom | US$ 10.463 | US$ 1.040 | não |
| Gratitude | US$ 4.421 | US$ 6.955 | não |
| Stella | US$ 4.744 (vs 340k declarado) | não existe | não |
| The Pattern | US$ 4.443 | US$ 2.680 | não |
| Astrolink | US$ 53 | US$ 4.128 | não |
| Seek | US$ 0 | US$ 0 | **sim** — org US$ 5,55 mi (FY2023) |
| Merlin | US$ 0 | US$ 0 | só a Cornell inteira (inútil) |

Servem para **ranquear** os apps entre si (a ordem é provavelmente informativa). **Não servem para estimar faturamento absoluto.**

## O que continua não verificado no BURACO 1
- Receita real de empresa para **Co-Star, The Pattern, Astrolink, Blossom, Gratitude** — nenhuma tem fonte primária.
- **Merlin**: receita do Cornell Lab como unidade (não tem EIN próprio na base).
- **Stella**: qual dos dois números (4,7 mil ou 340 mil) é o real.
- **Seek**: o 990 de FY2024 (PDF deu 403).
- Rotas não esgotadas: CNPJ na Receita/JusBrasil/Jucesp para ESAPIENS e ORBE; Bloomberg sobre o Co-Star (paywall provável); Diandian Data e agregadores chineses.

---

# BURACO 2 - Midia paga

**Situacao inicial:** 12 dos 15 apps sem confirmacao. So o "I am" foi confirmado em biblioteca oficial (com IDs, datas e copy).


> ## ⚠️ CORRECAO DE 26/08/2026 — leia antes da secao BURACO 2
>
> **A conclusao "ads confirmados: zero" abaixo esta SUPERADA.** Ela veio de uma primeira
> rodada em que as bibliotecas foram consultadas por `curl`. Uma segunda rodada, com
> navegador real e a rota correta, **confirmou anuncio em 5 apps**:
>
> | App | Meta | Google |
> |---|---|---|
> | PictureThis (Glority) | CONFIRMADO ~2K | CONFIRMADO |
> | PlantIn (Vortemol) | CONFIRMADO (todos **inativos**, conta desativada pela Meta) | CONFIRMADO ~2K |
> | Seek (iNaturalist) | CONFIRMADO (institucional) | CONFIRMADO (Ad Grants, 74) |
> | Merlin (Cornell Lab) | CONFIRMADO ~220 (doacao) | nao encontrado |
> | Astrolink (ORBE VENTURES) | bloqueado | CONFIRMADO ~200 |
> | Co-Star | **NAO ENCONTRADO** (pagina carregou, zero) | nao encontrado |
> | The Pattern | **NAO ENCONTRADO** (pagina carregou, zero) | nao encontrado |
>
> **O que mudou foi a ROTA, nao o alvo:**
> - Meta: `search_type=page` e reescrito em silencio para busca por palavra-chave e devolve
>   resultado falso. A rota valida e `view_all_page_id=<ID>`, que renderiza o nome do anunciante.
> - Google: `SearchAdvertisers` esta quebrado (devolve `{}` ate para Nike e Coca-Cola). O que
>   funciona e `SearchSuggestions`, sem login — endpoint documentado em `MERCADO.md` secao 9.3.
>
> **O que continua valido da secao abaixo:** o TikTok segue bloqueado; o teste de controle
> continua sendo obrigatorio antes de aceitar qualquer vazio; e para os apps marcados
> BLOQUEADO na Meta nao ha conclusao nenhuma, porque nem a pagina do anunciante foi
> identificada. A tabela detalhada e as provas (ID, data e copy de cada criativo) estao
> em `MERCADO.md`, secoes 9.3 e 9.3.1.

## Resultado desta sessao, dito sem rodeio

**Nao confirmei nenhum anuncio novo. E o achado que importa e METODOLOGICO: as tres bibliotecas oficiais estao BLOQUEADAS deste ambiente - nenhuma delas produz "NAO ENCONTRADO".** Isso significa que **nenhuma das 15 fichas pode afirmar que um app NAO roda midia paga.**

### Verificações que EU fiz nas bibliotecas (26/08/2026)

**Meta Ads Library — BLOQUEADO em todas as rotas testadas:**
- `https://www.facebook.com/ads/library/api/` → **HTTP 403**, devolvendo um desafio JS de bot (`executeChallenge()` / `/__rd_verif`).
- Busca por PÁGINA (`?...&search_type=page`) e por `view_all_page_id` → **HTTP 403**.
- API oficial `https://graph.facebook.com/v20.0/ads_archive` → **HTTP 500 com `OAuthException`**. Essa API exige token de acesso vinculado a conta verificada; sem token não responde nada.
- **Portanto, para todos os apps, Meta = BLOQUEADO.** Nenhuma conclusão de ausência de anúncio pode ser tirada daqui.

**Google Ads Transparency Center — BLOQUEADO, e o teste de controle é o que prova:**
- Endpoint RPC interno: `POST https://adstransparency.google.com/anji/_/rpc/SearchService/SearchAdvertisers`.
- Payload malformado → **HTTP 400** citando a classe protobuf real (`com.google.ads.integrity.transparency.reporting.SearchAdvertisersRequest`), o que prova que cheguei ao serviço verdadeiro.
- Payload aceito (`f.req={"1":"<termo>","2":30}`) → **HTTP 200 com `{}`**, conjunto vazio.
- **TESTE DE CONTROLE (impede a conclusão errada):** rodei o mesmo payload com **Nike, Adobe, Spotify e Duolingo** — anunciantes que comprovadamente compram mídia no Google. **Os quatro retornaram `{}` também.**
- **Conclusão: `{}` NÃO significa "não tem anúncio".** Significa que a consulta não é atendida sem token de sessão do navegador. **Google = BLOQUEADO para todos**, jamais "NÃO ENCONTRADO". Sem esse controle, os 15 apps teriam sido marcados como "sem anúncio no Google" — exatamente o erro de método que a auditoria apontou no Gratitude.

**TikTok Creative Center — BLOQUEADO, com mensagem explícita:**
- `https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list` (listagem geral e busca por keyword) → **`{"code":40101,"msg":"no permission"}`**. A própria API declara falta de permissão. Não é resultado vazio, é recusa.

**Achado colateral sobre a ficha do Merlin:** a ficha existente afirma que os anúncios do Cornell Lab levavam a `give.birds.cornell.edu/donate`. **Abri essa URL hoje e ela retorna HTTP 404.** Não invalida a observação original (a página pode ter mudado), mas o link, como está na ficha, **não é mais verificável** e não deve ser apresentado como ativo.


## Tabela de status por app (BURACO 2)

Os tres status sao diferentes e nao se misturam. Nesta sessao, **nenhuma consulta chegou a "NAO ENCONTRADO"** - porque nenhuma biblioteca respondeu.

| App | Meta | Google ATC | TikTok CC |
|---|---|---|---|
| PictureThis | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| PlantIn | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Seek | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Merlin | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Blossom | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Nebula | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Co-Star | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| The Pattern | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Labyrinthos | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Astrolink | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Stella | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Gratitude | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| ThinkUp | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| Aya | BLOQUEADO | BLOQUEADO | BLOQUEADO |
| **I am** | **CONFIRMADO** (sessao anterior, com IDs/data/copy) | BLOQUEADO | BLOQUEADO |

**Consequencia direta para as fichas:** toda frase do tipo "cresce sem midia paga" (Gratitude) ou "TikTok Ad Library retornou Total ads: 0" (PictureThis) **precisa ser rebaixada para "inconclusivo - a consulta capaz de responder nao foi completada"**. A auditoria ja tinha apontado isso no Gratitude; esta sessao confirma que vale para os 14.


---

## BURACO 3 — Reviews da Google Play

**Método:** biblioteca `google-play-scraper` (npm) via Node, executada em 26/08/2026 nesta sessão. Coleta paginada, ordenação por mais recentes (`sort:2`), deduplicada por ID de review. Cada pacote foi confirmado pela API (`app()`) antes da coleta — título e desenvolvedor conferidos contra a ficha, para não coletar homônimo.

**Correção de pacote:** a ficha do PlantIn não trazia o pacote Android. O palpite `com.planta_identify.plant_identifier` retornou ZERO reviews; o pacote real, confirmado por busca na Play (`PlantIn Plant Identifier, Care`, dev "PlantIn", 10.000.000+ instalações, nota 4,047474 com 135.218 avaliações, atualizado 06/08/2026) é **`com.myplantin.app`**.

**Stella — achado que vale por si só:** o pacote `com.priestess.manifestation` existe e É o Stella (título "Stella - Manifest Anything", dev "Priestess"), mas a Play declara **`0+` instalações** e o app tem **apenas 23 reviews no total** (não é falha de coleta — é o acervo inteiro), 269 avaliações-nota. A busca por "Stella manifest" na Play americana **não retorna esse app** na primeira página. O Android do Stella é praticamente inexistente: o negócio dela é iOS. Isso é consistente com a leitura de que o faturamento declarado de ~US$340 mil/mês, se real, vem todo do iOS.

### Astrolink — `com.astrolink.webapp` (BR, pt)
- **900 reviews lidas**, janela 26/05/2024 → 24/08/2026. Média da amostra: **4,34**.
- Distribuição: 5★ 685 · 4★ 51 · 3★ 45 · 2★ 23 · 1★ 96. Negativas (1-2★): **119**.
- Temas dominantes nas negativas: **cobrança/preço 33** · **bug/travamento 32** · **login/conta 24** · **paywall "não é grátis" 15** · suporte 4.
- Leitura: o padrão do Astrolink NÃO é revolta com cobrança indevida (só 3 das 119 citam golpe/cobrança não autorizada). É **falha de entrega do que foi pago**: "paguei pelo premium, descontou do meu cartão e não consta no aplicativo", "mesmo pagando Premium fica cortando o acesso e oferecendo nova assinatura". O problema é operacional, não de má-fé percebida.

### Blossom — `com.conceptivapps.blossom`
**BR (pt): 258 reviews**, janela 18/02/2021 → 25/03/2026. Média **3,12**. Dist.: 5★ 101 · 4★ 27 · 3★ 18 · 2★ 26 · 1★ 86. Negativas: **112**.
- Temas: **cobrança/preço 41** · **tradução/idioma 27** · paywall 7 · login 6 · conteúdo raso 5 · precisão 4.
- O tema "idioma" é quase exclusivo do Brasil e é literal: "o aplicativo é só em inglês, não tem português", "não entendi nada, pq é tudo em inglês". **Um quarto das negativas brasileiras é o app não falar português.**

**US (en): 900 reviews**, janela 20/10/2023 → 18/07/2026. Média **2,99**. Dist.: 5★ 327 · 4★ 87 · 3★ 71 · 2★ 82 · 1★ 333. Negativas: **415**.
- Temas: **cobrança/preço 232** (56% das negativas) · bug 61 · login 45 · suporte 32 · paywall 21 · precisão 13.

### PlantIn — `com.myplantin.app`
**US (en): 900 reviews**, janela 05/08/2025 → 24/08/2026. Média **2,13** — a pior das cinco. Dist.: 5★ 181 · 4★ 37 · 3★ 61 · 2★ 62 · **1★ 559**. Negativas: **621 de 900 (69%)**.
- Temas: **cobrança/preço 428** (69% das negativas) · login 113 · suporte 33 · precisão 30 · conteúdo raso 26 · paywall 18.
- Dentro das negativas: **238 citam cancelamento/reembolso** e 83 citam golpe/cobrança não autorizada.

**BR (pt): 498 reviews**, janela 24/03/2021 → 08/08/2026. Média **2,70**. Dist.: 5★ 183 · 4★ 14 · 3★ 23 · 2★ 26 · 1★ 252. Negativas: **278**.
- Temas: **cobrança/preço 129** · **tradução/idioma 45** · login 22 · bug 19 · precisão 18 · anúncio 15.

### Nebula — `genesis.nebula`
**BR (pt): 900 reviews**, janela 25/09/2025 → 15/08/2026. Média **3,02**. Dist.: 5★ 405 · 4★ 49 · 3★ 20 · 2★ 15 · **1★ 411**. Negativas: **426**.
- Temas: **cobrança/preço 309** (73% das negativas) · login 90 · tradução 64 · paywall 31 · anúncio 28 · suporte 20.
- **ACHADO MAIS GRAVE DE TODA A COLETA:** **204 das 426 negativas (48%) alegam cobrança INDEVIDA, assinatura que a pessoa nega ter feito, ou usam a palavra golpe/fraude.** Amostra literal, com data: *"Há meses aparece uma cobrança estranha no meu cartão e agora descobri que é desse app. Nunca fiz assinatura nem autorizei cobrança"* (20/07/2026); *"golpe não entrem nessa, tive que cancelar meu cartão pq todo mês cobrava indevidamente 150,00 200,00 na fatura"* (10/06/2026); *"This app is a scam, I don't have account subscription and try to withdraw money from my revolut account every day"* (20/07/2026). Outras 115 negativas citam cancelamento/reembolso.
- **Distribuição bimodal (405 cinco-estrelas contra 411 uma-estrela, quase nada no meio) merece cautela:** as 5★ têm comprimento médio de **56 caracteres** e são genéricas ("Está aprovado.", "Best support team ever!"); as 1★ têm **169 caracteres** e são circunstanciadas com valor, data e meio de pagamento. O padrão é compatível com solicitação/incentivo de avaliação positiva no app, mas **não confirmei manipulação** — é indício de forma, não prova.

**US (en): 900 reviews**, janela 07/06/2026 → 25/08/2026. Média **3,96**. Dist.: 5★ 577 · 4★ 99 · 3★ 25 · 2★ 11 · 1★ 188. Negativas: **199**.
- Temas: **cobrança/preço 141** · login 31 · suporte 9 · conteúdo raso 6.
- Cobrança indevida/golpe: 48 das 199 (24%) — **metade da taxa brasileira**. O problema de cobrança do Nebula é sensivelmente pior no Brasil que nos EUA.

### Stella — `com.priestess.manifestation` (US, en)
- **23 reviews — o acervo COMPLETO da Play**, janela 13/08/2026 → 23/08/2026. Média 4,13. Dist.: 5★ 17 · 4★ 0 · 3★ 2 · 2★ 0 · 1★ 4.
- Amostra pequena demais para tema dominante. Das 4 negativas, 4 citam cobrança. **Não tratar como medição** — registrar como "Android irrelevante para este app".
- Coleta BR (pt) retornou 0 reviews.

### O que a Play mostrou que a Apple tinha escondido
1. **O eixo brasileiro é idioma.** Blossom BR (27 de 112 negativas) e PlantIn BR (45 de 278) levam nota por não falar português. Esse tema não aparecia na amostra da Apple e é exatamente a brecha do recorte BR.
2. **Cobrança é o tema #1 em todos os cinco**, mas por motivos diferentes: no PlantIn e Blossom é *preço/dificuldade de cancelar*; no Nebula BR é *acusação de cobrança não autorizada*; no Astrolink é *pagou e não recebeu*. Tratar como um tema só apaga a distinção que importa.
3. **PlantIn no Android está em colapso reputacional** (69% das 900 mais recentes são 1-2★, média 2,13) — bem pior do que a nota agregada de 4,047 da ficha da loja sugere, porque a nota agregada carrega anos de histórico.

### Contraprova: a nota da loja ESCONDE a deterioracao recente
Puxei tambem o **histograma de vida toda** de cada ficha da Play (mesma chamada `app()`, 26/08/2026) e comparei com a fatia de negativas da minha amostra RECENTE. A nota agregada que aparece na loja carrega anos de historico e mascara o presente:

| App | 1-2 estrelas VIDA TODA | 1-2 estrelas NA AMOSTRA RECENTE | diferenca | nota agregada exibida |
|---|---|---|---|---|
| PlantIn US | 19,2% | **69,0%** | **+49,8 pp** | 4,047 (135.218 avaliacoes) |
| Blossom BR | 6,6% | **43,4%** | **+36,8 pp** | 4,457 (186.415 avaliacoes) |
| Nebula BR | 31,4% | **47,3%** | **+15,9 pp** | 3,669 (84.205 avaliacoes) |
| Astrolink BR | 10,5% | 13,2% | +2,7 pp | 4,480 (20.511 avaliacoes) |

**Como ler isso:** o PlantIn exibe 4,05 na loja, mas 69% das 900 avaliacoes mais recentes sao 1-2 estrelas. O Blossom exibe 4,46 e esta em 43% de negativas recentes. **Quem olhar so a nota da loja conclui o oposto do que os dados recentes mostram.** O Astrolink e o unico dos quatro cuja nota agregada ainda descreve o presente (+2,7 pp) - ou seja, e o unico que NAO esta se deteriorando.

Histogramas de vida toda coletados (fonte primaria, Play, 26/08/2026):
- Astrolink BR: 5*16.580 / 4*1.181 / 3*590 / 2*319 / 1*1.835
- Blossom BR: 5*133.247 / 4*27.638 / 3*13.091 / 2*2.181 / 1*10.182
- PlantIn US: 5*88.219 / 4*13.308 / 3*7.653 / 2*3.943 / 1*22.084
- Nebula BR: 5*52.048 / 4*4.523 / 3*1.130 / 2*550 / 1*25.864

---

# TABELA FINAL — ANTES / DEPOIS

## Buraco 1 — Faturamento (9 apps sem número no início)

| App | ANTES | DEPOIS | Mudou de status? |
|---|---|---|---|
| **Seek** | "não verificado" para o app; org só FY2023 por leitura indireta | **Receita do app = US$ 0 CONFIRMADO** (AppGoblin, 2 lojas, "Revenue not available"); **org FY2023 US$ 5.551.048 relido direto na API do ProPublica** (EIN 92-1296468), com program service de **US$ 158** | **SIM** — app confirmado em zero; org agora tem fonte fiscal primária relida |
| **Merlin** | "não verificado" | **Receita do app = US$ 0 CONFIRMADO** (AppGoblin, 2 lojas). Receita da unidade Cornell Lab: **continua não verificado** (não tem EIN próprio) | **PARCIAL** — o app sim, a unidade não |
| **Co-Star** | "não verificado", só pistas de snippet | Estimativa: **iOS US$ 13.435 + Android US$ 9.062/mês** (AppGoblin). TechCrunch aberto: **termos NÃO divulgados**. Alerta: os "US$ 500 mi" são da Midjourney, não do Co-Star | **PARCIAL** — só estimativa reprovada; receita real segue não verificada |
| **The Pattern** | "não verificado"; fontes divergiam ~100x | Estimativa: **iOS US$ 4.443 + Android US$ 2.680/mês** (AppGoblin) | **PARCIAL** — só estimativa |
| **Astrolink** | "não verificado" | Estimativa: **Android US$ 4.128 + iOS US$ 53/mês**. **Achado estrutural: negócio é Android/Brasil, iOS é residual (42,5k vs 3,86M installs)**. **Faixa de IAP confirmada em fonte primária: US$ 1,99–59,90** | **PARCIAL** — preço e estrutura agora primários; faturamento da empresa não |
| **Blossom** | "não verificado"; ScreensDesign US$ 95 mil/mês | **Divergência explícita: ScreensDesign US$ 95 mil/mês vs AppGoblin ~US$ 11,5 mil/mês (~8x)**. **Faixa de IAP confirmada em fonte primária: US$ 0,99–86,99** (antes era "relato de review") | **PARCIAL** — preço virou primário; receita segue em divergência não resolvida |
| **Gratitude** | "não verificado" | Estimativa: **iOS US$ 4.421 + Android US$ 6.955/mês** (AppGoblin) | **PARCIAL** — só estimativa |
| **Manifest / Aya** | "não verificado", só faixa "$10K+" | **Aya iOS US$ 17.970/mês — o maior IAP estimado dos 9**; 110k MAU; lançado 15/04/2026; **+160.200 instalações em 4 semanas** (velocidade é dado de loja = parte confiável) | **SIM** — de faixa vaga para número + trajetória |
| **Stella** | Divergência de 40x sem explicação | **Divergência agora de ~70x, MAS COM CAUSA IDENTIFICADA: Stripe + Superwall + RevenueCat nos SDKs = cobrança fora da loja, invisível ao AppGoblin.** Android confirmado irrelevante (0+ installs, 23 reviews) | **SIM em entendimento, NÃO em número** — sei por que divergem; segue sem número confiável |

**Placar do Buraco 1:** 8 dos 9 saíram de "nada" para algum número com fonte e data. **Mas apenas 2 são verificação de qualidade decisória** (Seek e Merlin = receita do app confirmada em zero; Seek com declaração fiscal real). Os outros 6 ganharam estimativa que **reprovou no meu teste de plausibilidade** e serve para ranquear, não para decidir. O Stella ganhou a explicação, não o número.

## Buraco 2 — Mídia paga (12 apps sem confirmação)

| Rota | ANTES | DEPOIS |
|---|---|---|
| Meta Ads Library | "bloqueada" sem detalhe; busca por keyword usada como se provasse ausência (erro do Gratitude) | **BLOQUEADO comprovado em 3 rotas**: página 403 com desafio JS; busca por página 403; **API oficial `ads_archive` → OAuthException**, exige token |
| Google Ads Transparency | **nunca tentado** | **BLOQUEADO comprovado com TESTE DE CONTROLE**: endpoint real alcançado (400 cita a classe protobuf), mas payload aceito devolve `{}` — **e Nike, Adobe, Spotify e Duolingo também devolvem `{}`**. O vazio não é ausência |
| TikTok Creative Center | "Total ads: 0" tratado como ausência no PictureThis | **BLOQUEADO explícito**: API responde **`{"code":40101,"msg":"no permission"}`** |

**Placar do Buraco 2: 0 novos CONFIRMADOS. E o resultado principal é metodológico:** as três bibliotecas oficiais são **BLOQUEADAS** deste ambiente, nenhuma delas produz "NÃO ENCONTRADO". **Isso invalida qualquer afirmação de ausência de mídia paga nas 15 fichas.** O teste de controle no Google é a peça que impede o erro: sem ele, os 15 apps teriam sido marcados como "sem anúncio", conclusão falsa.

## Buraco 3 — Reviews da Google Play (quase nada lido antes)

| App | ANTES | DEPOIS |
|---|---|---|
| **Astrolink** | 0 reviews da Play | **900 lidas** (26/05/2024→24/08/2026), média 4,34; negativas: cobrança 33, bug 32, login 24 |
| **Blossom** | 0 reviews da Play | **258 BR + 900 US = 1.158 lidas**; BR média 3,12 / US 2,99; **idioma = 27 das 112 negativas BR** |
| **PlantIn** | 0 reviews da Play (pacote errado na ficha) | **900 US + 498 BR = 1.398 lidas**; **US média 2,13 com 69% de negativas**; pacote corrigido para `com.myplantin.app` |
| **Nebula** | 0 reviews da Play | **900 BR + 900 US = 1.800 lidas**; **204 das 426 negativas BR (48%) alegam cobrança indevida/golpe** |
| **Stella** | 0 reviews da Play | **23 lidas = acervo COMPLETO**; Android tem 0+ instalações — achado que reforça o Buraco 1 |

**Placar do Buraco 3: 5 de 5 apps prioritários com review da Play lida — 4.279 reviews no total**, todas com data, nota e texto. Mais o histograma de vida toda das 4 fichas principais, que revelou a **deterioração recente escondida pela nota agregada** (PlantIn +49,8 pp, Blossom +36,8 pp).

---

# O QUE CONTINUA "NÃO VERIFICADO"

**Faturamento (receita real, fonte primária):**
1. **Co-Star** — termos da aquisição não divulgados
2. **The Pattern** — nenhuma fonte fiscal ou de imprensa
3. **Astrolink** — empresa BR; Econodata 404; CNPJ só em snippet
4. **Blossom** — Mosaic Srl / Bending Spoons; divergência de 8x não resolvida
5. **Gratitude** — Hapjoy; Tracxn atrás de paywall
6. **Stella** — os dois números (US$ 4,7 mil vs US$ 340 mil) seguem irreconciliados
7. **Merlin** — receita do Cornell Lab como unidade (sem EIN próprio)
8. **Seek** — 990 de FY2024 (PDF deu 403)
9. **Aya, Co-Star, The Pattern, Gratitude, Blossom, Astrolink** — todos os números disponíveis são estimativa AppGoblin, que **reprovou no teste de plausibilidade**

**Mídia paga — TODOS os 14 apps (exceto "I am"):** nenhum CONFIRMADO nesta sessão. As 3 bibliotecas oficiais estão BLOQUEADAS deste ambiente. **Nenhum app pode ser declarado "sem mídia paga".**

**Reviews da Play:** os 10 apps fora da lista de prioridade (PictureThis, Seek, Merlin, Co-Star, The Pattern, Labyrinthos, Manifest/Aya, I am, Gratitude, ThinkUp) seguem sem amostra da Play — a rota está pronta e funciona, é só rodar.

# COMO DESTRAVAR O QUE FALTOU (próximo passo concreto)
- **Mídia paga:** as 3 bibliotecas exigem sessão de navegador. O caminho é o **MCP do Playwright** (já instalado), abrindo `facebook.com/ads/library` e `adstransparency.google.com` logado como usuário real. É a única rota que produz CONFIRMADO com ID, data e copy.
- **Meta API oficial:** funciona com token de acesso de conta verificada — exige cadastro no Meta for Developers.
- **Astrolink (empresa BR):** consulta de CNPJ na Receita Federal / JusBrasil / Jucesp.
- **Stella:** só prova primária da fundadora (print do RevenueCat ou App Store Connect).
- **Seek FY2024:** o PDF do 990 deu 403 por curl; tentar pelo navegador.
- **Reviews restantes:** rodar `google-play-scraper` nos 10 apps que faltam (script já pronto em `gpscrape/`).

---

# ANEXO — Fonte: extensão do Claude no Chrome logado, consultando a Biblioteca de Anúncios da Meta (país = Tudo, categoria = Todos, status = Todos) e a Central de Transparência de Anúncios do Google (região = qualquer lugar). Aqui "não encontrado" significa busca completada por nome, empresa e domínio sem resultado — é ausência real, não bloqueio.

Ressalva de método da Meta: "ativos/inativos" são contagens dos cards carregados ao rolar a página (~70 a 125 por anunciante), não do total. O total é a aproximação que a própria biblioteca mostra no topo.

| # | App | Meta — anunciante | Meta — total | Meta — ativos/inativos (na tela) | Meta — período | Google — anunciante | Google — nº | Google — idiomas |
|---|---|---|---|---|---|---|---|---|
| 1 | PictureThis | PictureThis (@PictureThisAI) | ~13.000 | 60 / 28 | 12/abr/2025 → 8/jul/2026 | Glority Global Group Limited (HK) | ~2 mil | inglês |
| 2 | PlantIn | PlantIn AI: Never Kill Your Plants — **página desabilitada pela Meta por violar Padrões de Publicidade** | ~50.000 (+ ~11.000 na 2ª página "PlantIn AI: Houseplants & Gardening", id 104799679152865) | 0 / 101 | 16/jun/2025 → 11/jul/2026 | Vortemol Limited (Chipre) | ~2 mil | inglês, polonês, azeri |
| 3 | Seek | **não encontrado** (testado iNaturalist, Seek by iNaturalist, Seek app) | — | — | — | iNaturalist (EUA) | 74 | espanhol, inglês — cadastro e doação |
| 4 | Merlin | Cornell Lab of Ornithology (@cornellbirds) | ~220 | 10 / 103 | 22/nov/2019 → 24/ago/2026 | Cornell University (institucional, misturado com Weill Cornell) | ~300 | inglês |
| 5 | Blossom | Blossom - Plant Identification (@blossom_plant, 262 mil IG) — **página certa, zero anúncios** | 0 | 0 / 0 | — | Bending Spoons (~9 mil) **sem anúncio do Blossom**; app é da Conceptiv Apps, não indexada | — | — |
| 6 | Nebula | Nebula: Horoscope & Compatibility (maior de 4 páginas, 4,3 mil) | ~1.300 | **0** / 67 | 4/jun/2025 → 7/mai/2026 | GM UNICORN CORPORATION LIMITED / OBRIO (Chipre) | **~90 mil** | francês, inglês, chinês trad., tcheco |
| 7 | Co-Star | Co - Star (@costarastrology, 2 mi IG) — zero | 0 | — | — | não encontrado | — | — |
| 8 | The Pattern | The Pattern (@thepatternapp, 352,7 mil IG) — zero | 0 | — | — | não encontrado | — | — |
| 9 | Labyrinthos | Labyrinthos (@labyrinthostarot) — zero | 0 | — | — | não encontrado | — | — |
| 10 | Astrolink | Astrolink Brasil (@astrolinkbrasil, 130,2 mil IG) — zero | 0 | — | — | ORBE VENTURES LTDA (Brasil) | ~200 | português BR |
| 11 | Stella | Stella - Manifest Anything | ~2 | 1 / 0 | 21/ago/2026 | não encontrado | — | — |
| 12 | Aya | **não encontrado** (Aya Manifest, Aya manifestation, Aya app, palavra-chave) | — | — | — | não encontrado | — | — |
| 13 | I am | I am (@iam.positive.affirmations, 1,8 mi IG) | ~1.200 | 56 / 69 | 4/set/2025 → 18/ago/2026 | Monkey Taps LLC — 1 anúncio, do **Bible Widgets**, não do I am | 1 | inglês |
| 14 | Gratitude | **não encontrado** (5 variações de nome + palavra-chave) | — | — | — | não encontrado | — | — |
| 15 | ThinkUp | **não encontrado** (só agências e o ThinkUp LTD de Israel) | — | — | — | não encontrado (idem) | — | — |

## Copies registradas

**PictureThis (Meta):** "¿Sabes cómo mantener tus plantas felices y saludables? Descubre los secretos para un jardín próspero con PictureThis! 🌺" · "¡Aprenda consejos sencillos y eficaces para el cuidado de las plantas con PictureThis!" — criativos em ES/EN/PT. **(Google):** "1# Plant Disease Identifier — identify plant diseases and get tailored care tips from one pic".

**PlantIn (Meta):** criativos não exibidos — página desabilitada. **(Google):** "Diagnose Your Plant by Photo - Plant Health Checker — Stop guessing"; versão polonesa "Identyfikator Roślin i Chorób".

**iNaturalist (Google):** "Regístrate en iNaturalist — Regístrate gratis y comparte tus observaciones" · "Apoya a iNaturalist hoy — Dona".

**Cornell (Meta):** "Help us supercharge bird conservation and habitat protection by making a gift today." · "One of the best ways to help birds like Black-capped Chickadees and Baltimore Orioles is by giving to the Cornell Lab today!" — doação, não instalação.

**Nebula (Meta):** "Are you a Wild Herbalist, a Storm Sorceress, or a Cosmic Seer? 🌑 Every woman carries a spiritual archetype…" · "Who were you before this life? 🕯️ Your palms hold the echoes of your past incarnations…" — ângulo dominante: leitura de mão e arquétipo. **(Google):** "JE TE JURE QUE TU PLEURERAS APRÈS AVOIR VU LA PERSONNE AVEC QUI TU VAS TE MARIER — FAIRE UN TEST" · "Let's scan your palm — Unlock your future" (appnebula.co).

**Astrolink (Google):** "Meu Mapa Astral Grátis - Astrologia e Autocuidado — Faça seu Mapa Astral e Tenha Acesso Agora Mesmo ao Seu Guia Pessoal de Autocuidado" · "Calcule o Ascendente - Meu Mapa Astral".

**Stella (Meta):** "i've been LOVING hearing everything you've manifested using my app Stella 💗 lmk in the comments what you think of Stella" — **conteúdo de marca com a criadora hothighpriestess**, 2 anúncios com o mesmo criativo.

**I am (Meta):** "Você vai amar este app! 🤗🙏🏻💛" / "You'll love this app!" — mesmo criativo localizado em PT/EN/ES. Segundo maior volume de ativos da lista.

## Leituras

1. **Meta é o canal de natureza; Google também.** PictureThis é o maior anunciante da lista na Meta (~13 mil, 60 ativos na tela, criativos em três idiomas incluindo português). PlantIn acumulou ~61 mil anúncios nas duas páginas e **teve as duas desabilitadas** pela Meta — hoje zero ativo. Isso bate com os 69% de negativas recentes na Play: o app está sangrando nos dois lados.

2. **Astrologia não compra Meta.** Co-Star, The Pattern, Labyrinthos e Astrolink têm a página oficial identificada e **zero anúncio**. O único de astrologia com Meta é o Nebula, e com 0 ativos hoje — o volume dele está no Google (~90 mil pela holding), em francês, inglês, chinês e tcheco. **Nenhum anunciante de astrologia compra mídia em português na Meta.** O Astrolink compra só no Google, com "meu mapa astral grátis".

3. **Manifestação cresce por criadora, não por anúncio.** Gratitude, ThinkUp e Aya: não encontrados em nenhuma das duas bibliotecas. O Stella tem 2 anúncios — e são conteúdo de marca com uma criadora, não anúncio de app. Confirma a tese: o nicho é defendido por audiência.

4. **O I am é a exceção que ensina.** ~1.200 anúncios, 56 ativos, mesmo criativo em PT/EN/ES, rodando desde set/2025 — e a copy é uma linha: "Você vai amar este app!". É o único do recorte de manifestação comprando mídia de verdade, e faz isso com um criativo só, localizado.

5. **Dois "não encontrados" são falsos negativos possíveis:** Seek e Aya não apareceram no menu de anunciantes da Meta — pode ser página sem anúncio, pode ser nome diferente. Ficam como "não encontrado", não como "não anuncia".
