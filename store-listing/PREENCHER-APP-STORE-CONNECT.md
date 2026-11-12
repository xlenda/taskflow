# App Store Connect — o que colar em cada campo

Ficha: **Celeste: Manifestação** (ASC App ID 6833663415) na equipe
**VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA** (Team ID 68VRL5BCA7).
Preparado em 11/11/2026 a partir de `store-listing/`. Os textos abaixo são os
mesmos arquivos validados por `npm run verify:store`; não edite só aqui.

Ordem sugerida: 1) Informações do app → 2) Preços → 3) Privacidade do app →
4) Página da versão 1.0 → 5) Compilação (depois do build) → 6) Adicionar para revisão.

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
| Compras dentro do app / anúncios | Não |

Se aparecer pergunta sobre "tópicos de saúde ou bem-estar", marcar a opção
mais leve: o app é reflexão e bem-estar, sem diagnóstico nem tratamento.

---

## 2. Monetização → Preços e disponibilidade

| Campo | Valor |
|---|---|
| Preço | Gratuito (BRL 0) |
| Disponibilidade | Todos os países e regiões |
| Pré-encomenda | Não |
| Distribuição em Mac com Apple Silicon | **Desmarcar** (app só de iPhone, não validado no Mac) |
| Disponível no Apple Vision Pro | **Desmarcar** |

Compras dentro do app e Assinaturas: não criar nada agora. Quando entrar
cobrança, ela tem que ser pela Apple (In-App Purchase), nunca por link externo.

---

## 3. Confiança e segurança → Privacidade do app

"Este app coleta dados?" → **Sim**. Marcar só estes tipos:

| Tipo (categoria Apple) | Por quê | Uso | Vinculado à identidade | Rastreamento |
|---|---|---|---|---|
| Identificadores → **ID do usuário** | sessão técnica pseudônima que autoriza denúncias de IA e limita abuso | Funcionalidade do app | Não | Não |
| Conteúdo do usuário → **Outro conteúdo do usuário** | desejo, respostas do questionário, relato de sonho e texto para narrar, enviados ao servidor **só** depois que a pessoa liga a nuvem | Funcionalidade do app | Não | Não |
| Informações de contato → **Nome** | primeiro nome do questionário, enviado junto com os textos quando a nuvem está ligada | Funcionalidade do app | Não | Não |

Tudo o mais: **não coletado** (saúde e fitness, áudio, localização, contatos,
compras, histórico de navegação, dados de uso, diagnóstico). O microfone do
Plano Celeste reconhece a fala no aparelho e descarta áudio e transcrição; não
é coleta. Não existe SDK de analytics, crash ou anúncios no app.
"Este app rastreia?" → **Não**.

Essas respostas seguem `store-listing/privacy-review.md` e
`console-declarations.md`; quem assina é o titular. Em dúvida, prefira
declarar a mais (Apple reprova por declarar a menos, nunca por declarar a mais).

Acessibilidade do app (rótulos novos): opcional, pode pular nesta versão.

---

## 4. App para iOS → Versão 1.0 (a página "Preparar para envio")

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

### Texto promocional (170)

```
Conte o que deseja. Receba uma Cena-Âncora feita das suas palavras, ouça na voz escolhida e encontre um pequeno passo possível para hoje.
```

### Descrição (4.000)

```
Suas afirmações deveriam soar como você, não como uma frase pronta.

Celeste transforma seus desejos, sonhos e palavras em uma prática pessoal de manifestação. Você recebe uma Cena-Âncora para ler ou ouvir, uma afirmação criada a partir das suas respostas e uma Ponte de Hoje: um passo pequeno, concreto e sob seu controle.

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

UMA HISTÓRIA QUE EVOLUI COM VOCÊ

O Espelho Vivo conecta seus desejos, capítulos anteriores e o progresso que você escolheu levar adiante. Assim, cada novo capítulo pode acompanhar sua trajetória sem apagar o que veio antes.

COM A CELESTE, VOCÊ PODE:

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

Celeste é uma ferramenta de reflexão e bem-estar. Não prevê acontecimentos, não substitui terapia e não garante dinheiro, relacionamentos, saúde ou qualquer resultado.
```

### Palavras-chave (100 bytes, sem espaço depois da vírgula)

```
positivas,visualização,prosperidade,amor,autoestima,metas,bem-estar,gratidão,rotina,motivação
```

### URLs, versão e copyright

| Campo | Valor |
|---|---|
| URL de suporte | `https://celeste-jet-two.vercel.app/suporte` |
| URL de marketing | `https://celeste-jet-two.vercel.app` |
| Versão | `1.0.0` (trocar o `1.0` que a Apple pôs: tem que ser igual ao `version` do app.json, senão o build não aparece na lista) |
| Copyright | `2026 VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA` |
| Arquivo de cobertura de roteamento | nenhum |
| Clipe de app / App para iMessage / Game Center | nada |

### Compilação

Aparece só depois que o build do EAS termina e o TestFlight processa
(10 a 30 min após o envio). Clique em "Adicionar compilação" e escolha a
`1.0.0 (1)`. A pergunta de criptografia não aparece: o app já declara
`usesNonExemptEncryption: false`.

### Informações para a equipe de revisão

| Campo | Valor |
|---|---|
| Início de sessão obrigatório | **Desmarcado** (o app inteiro funciona sem conta) |
| Nome / Sobrenome | quem atende o telefone durante a revisão (você) |
| Telefone | número com DDI que você atende, ex.: +55 77 99133-8581 |
| E-mail | um que você lê todo dia (`payvenuz@gmail.com` é o da conta) |
| Anexo | nenhum |

Notas (colar as duas, inglês primeiro; a revisão da Apple lê em inglês):

```
Celeste is a personal reflection and well-being app: affirmations, "Anchor Scene" visualizations, a one-minute ritual and a dream journal.

- No account or sign-in. The whole flow works without login, so no demo credentials are needed. Open the app, answer the short onboarding and the first Anchor Scene is created on the device.
- All personal content stays on the device. Optional cloud features (AI-written texts, the chosen neural voice, cloud dream reflection) only run after an explicit adult consent toggle inside the app; without it, Celeste uses texts assembled on the device and the system voice.
- Microphone: used only in the "Celeste Plan" practice, after a separate tap, for on-device speech recognition of two repetitions of the affirmation shown on screen. Audio and transcript are discarded; nothing is stored or uploaded.
- Wake-up: on iOS 26+ the app can schedule a wake-up through AlarmKit (the permission prompt explains it); reminders use local notifications.
- No purchases, no ads, no third-party analytics or tracking SDKs.
- Celeste makes no medical, financial or predictive claims; it does not replace therapy.

Privacy policy: https://celeste-jet-two.vercel.app/privacy
Support: https://celeste-jet-two.vercel.app/support (suporte@celestegroup.biz)
Data controller: VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA (Brazil).
```

```
A Celeste é um app de reflexão e bem-estar: afirmações, visualizações ("Cena-Âncora"), ritual de um minuto e diário de sonhos.

- Sem conta nem login. O fluxo inteiro funciona sem cadastro; não há credenciais de demonstração. Abra o app, responda ao questionário curto e a primeira Cena-Âncora é criada no aparelho.
- Todo o conteúdo pessoal fica no aparelho. Os recursos em nuvem (textos escritos por IA, voz neural escolhida, reflexão de sonho na nuvem) só rodam depois de um consentimento adulto explícito dentro do app; sem ele, a Celeste usa textos montados no aparelho e a voz do sistema.
- Microfone: só na prática "Plano Celeste", após um toque separado, para reconhecer no aparelho duas repetições da afirmação exibida. Áudio e transcrição são descartados.
- Despertar: no iOS 26+ o app pode agendar pelo AlarmKit (o pedido de permissão explica); lembretes usam notificações locais.
- Sem compras, sem anúncios, sem SDK de analytics ou rastreamento.
- Sem alegação médica, financeira ou de previsão; não substitui terapia.
```

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
  ID) e confira voz, despertar e prática. É a validação nativa que a ficha
  ainda não tem.
- Capturas: as de `assets/final/apple` vêm do app web no tamanho do iPhone.
  Se quiser, troque por capturas reais do TestFlight (Fotos → compartilhar →
  arrastar no ASC); o tamanho do iPhone 16 Pro Max (1320 × 2868) é aceito direto.
