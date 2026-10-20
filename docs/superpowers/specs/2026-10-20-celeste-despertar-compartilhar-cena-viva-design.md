# Celeste — Despertar em sequência, Compartilhar em tudo e Cena Viva (20/10/2026)

## 1. Intenção e porquê

O Lenda quer que a Celeste vire hábito diário e se espalhe sozinha. Três peças:

1. **Despertar em sequência** — a pessoa monta o que quer ouvir ao acordar
   (Cena-Âncora, visões e afirmações, na ordem que quiser). Hoje o despertador
   só aceita UMA afirmação e no Android nem aparece.
2. **Compartilhar em tudo** — hoje só afirmações têm compartilhar. Visões,
   Cena-Âncora e prática concluída não têm. Ele quer cartão 9:16 + link E
   vídeo curto + link, no site e no app Android, já nesta versão.
3. **Gatilho de encantamento** — o **Traço Celeste** (acender 3 estrelas, uma por
   vez) é o gesto proprietário da marca (dossiê, seção 7). Ele deve estar:
   na revelação da Cena-Âncora (as 3 estrelas viram o sol e a cena ganha vida),
   no início da sequência do despertar e como assinatura no que é compartilhado.

Encantamento honesto (doutrina da casa): nada de promessa de resultado, número
inventado ou "sua sorte melhorou X%".

## 2. O que já existe (construir em cima)

- `components/CelestialTrace.js` — as 3 estrelas da revelação (RevealScreen).
- `components/GradientCover.js` — imagem pessoal 4:5 com texto por cima.
- `components/AffirmationShareCard.js` + `utils/shareAffirmationCard.js` —
  cartão 1080×1920 via `react-native-view-shot`; web usa `navigator.share` com
  arquivo ou download; nativo usa `expo-sharing`. Hoje só para afirmações.
- `context/NarrationContext.js` + `utils/usePersonalNarration.js` — voz da
  Celeste (ElevenLabs) só na web (`RELEASE_FEATURES.paidCloudProcessing`);
  no app a voz é a do aparelho (`expo-speech`).
- Despertador: `screens/AffirmationAlarmScreen.js`, `services/affirmationAlarm.js`
  (AlarmKit iOS 26+, nunca testado em aparelho), estado em
  `state.morningRitual` (`reminderEnabled`, `reminderTime`, `weekdays`,
  `wakeAffirmationId/Text/Lang`, `wakeNarratorId`). Android desligado em
  `constants/releaseFeatures.js` (`affirmationAlarm: platformOS !== 'android'`).
- Lembretes do Plano Celeste: `services/practicePlanReminders.js` já agenda
  DAILY/WEEKLY com `expo-notifications` no Android (canal mudo).
- Dependências já instaladas: expo-sharing, react-native-view-shot, expo-video,
  expo-file-system, expo-notifications, expo-speech, expo-audio.
- Referência visual da cena viva (teste local Remotion, R$0):
  `Downloads\CELESTE-ANCORA-CINEMATOGRAFICO.mp4` (componentes `CinemaGL`/
  `CenaAncora` no repo do Zeus, commit 05a3de8).

## 3. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
- Despertar: montar a sequência (até 6 itens), reordenar, remover; atalho
  "Pôr no meu despertar" a partir de visões, afirmações e Cena-Âncora; ao abrir,
  Traço Celeste → a sequência toca item a item, só ouvir.
- Android: lembrete com som no horário/dias escolhidos (expo-notifications);
  tocar na notificação abre a sequência.
- Compartilhar: cartão 9:16 (imagem + frase + assinatura das 3 estrelas + link)
  e vídeo curto 9:16 da cena viva (+ frase + assinatura + link), em afirmações,
  visões, Cena-Âncora e prática concluída — web e app Android.
- Cena viva na revelação: depois das 3 estrelas, elas viram o sol e a imagem da
  pessoa ganha movimento cinematográfico (câmera lenta, luz, partículas, grão).
- AAB novo pela Expo/EAS com tudo isso.

**Não-objetivos (fora desta entrega)**
- Publicar na Play Store / App Store (depende da verificação das contas).
- Build e teste em iPhone (sem conta Apple ativa nesta etapa).
- Vídeo de IA gerado por usuária (pago) — só a cena viva grátis no aparelho.
- Paralaxe 3D com mapa de profundidade no app (fase 2).
- Voz da Celeste (ElevenLabs) no app instalado — só depois da Play Store +
  Play Integrity (decisão do Lenda: voz do celular por ora).

**Anti-objetivos (seria fracasso mesmo funcionando)**
- Prometer resultado, inventar número ou prova social.
- Compartilhar sem a pessoa ver antes o que vai sair (privacidade: nomes de
  terceiros podem estar no texto).
- Ligar permissão de alarme exato/serviço em primeiro plano no Android (quebra
  a fronteira da Play Store).
- Qualquer custo novo por usuária (API paga).
- Vídeo que não abre no WhatsApp.

## 4. Restrições

- Só grátis/barato; deploy só por `scripts/deploy-web-from-vercel.ps1` com
  `CELESTE_NODE_HOME` = Node 24 (`C:\tmp\celeste-node24\node-v24.20.0-win-x64`).
- Bilíngue PT/EN em tudo (portão `i18n-parity.js`).
- Acessibilidade: rótulos, "reduzir movimento" desliga a animação (imagem parada).
- Testar como usuária nova; `/code-review` antes de pronto; commit no TaskFlow.
- Gesto de áudio no iPhone: nada de `await` antes de iniciar som num toque.

## 5. Decisões do Lenda (literais)

1. Despertar: **ela monta a sequência** (Cena-Âncora + visões + afirmações na
   ordem que quiser).
2. Android: **lembrete com som**; a voz toca ao abrir.
3. Compartilhar: **os dois** — cartão 9:16 + link e vídeo curto + link.
4. Vídeo para compartilhar **também no app Android já nesta versão**.
5. No app Android, **voz do celular por ora**.
6. **Pode gerar o AAB** pela Expo.
7. Traço Celeste como gatilho de encantamento (revelação, início do despertar,
   assinatura do compartilhado).

## 6. Desenho por parte

### A. Renderizador único da cena viva (`CenaViva`)
Um único desenho em canvas 2D (HTML/JS puro) usado para EXIBIR e para GRAVAR,
para que o que ela vê seja o que ela compartilha:
- Entrada: imagem da pessoa (data URI/URL), frase (opcional), formato (4:5 para
  exibir no cartão; 9:16 720×1280 para vídeo), modo (`intro` com estrelas →
  sol, ou `loop`), idioma.
- Desenho: imagem com movimento lento de câmera (escala ~1.00→1.08 + leve
  travelling), raios de luz dourada (gradientes com mistura aditiva), poeira de
  luz em profundidade, grão sutil, vinheta; paleta Nuvens de Pérola + dourado
  #F2B25C. Intro: 3 estrelas no mesmo arco do `CelestialTrace`, se conectam e
  voam até a posição do sol com flare; depois a cena "respira".
- Vídeo: 8 s, 9:16, 30 fps, com frase serifada, assinatura das 3 estrelas +
  "Celeste" + link no rodapé. Gravação com `MediaRecorder` sobre
  `canvas.captureStream(30)`, preferindo `video/mp4` (H.264); se o navegador só
  gravar webm, avisar e oferecer o cartão (WhatsApp não abre webm).
- **Web**: componente `.web.js` com `<canvas>` real.
- **Android/iOS**: componente `.native.js` com `react-native-webview` rodando o
  MESMO HTML/JS (string empacotada), imagem passada como data URI; o vídeo volta
  em base64 por `postMessage` → `expo-file-system` grava no cache →
  `expo-sharing` abre o menu. Dependência nova: `react-native-webview`.
- "Reduzir movimento": mostra a imagem parada (sem canvas animado).

### B. Cena viva + Traço Celeste na revelação
`RevealScreen`: ao completar o `CelestialTrace`, a imagem da Cena-Âncora entra
como `CenaViva` em modo `intro` (estrelas → sol → cena ganha vida) e depois
`loop`.

**Sem imagem pessoal** (sempre no app Android; na web até ela ativar a imagem)
— decisão do Lenda: **cena pronta escolhida pelas respostas dela**.
- Biblioteca de cenas empacotada no app, feita de graça (Flux/Cloudflare do
  Zeus, `node C:\Users\sanches\.claude\zeus-imagem.js`), seguindo as regras do
  `api/gerar-visual.js` (sem pessoas, sem texto, corredor central calmo para a
  frase, direção de arte por área sem clichês).
- Escolha determinística: lugar dos sonhos (resposta do onboarding: praia,
  outro país, campo, cidade, montanha/serra, etc.) × área do desejo (Love,
  Wealth, Career, Health, Confidence, Peace), com uma cena neutra por área
  quando o lugar não foi respondido.
- Rótulo honesto: "Cena inspirada nas suas respostas" (a imagem pessoal mostra
  "Criada para você"). Quando a imagem pessoal chegar, ela substitui a pronta.
- A mesma cena pronta serve para o vídeo e o cartão compartilhado.

### C. Compartilhar em tudo
- Generalizar o cartão atual para um `ShareCard` 9:16: imagem da pessoa (ou o
  gradiente da marca se não houver), frase (afirmação, título da visão, frase da
  Cena-Âncora ou "Prática concluída" + afirmação do dia), assinatura das 3
  estrelas + "Celeste" + link.
- Um botão "Compartilhar" que abre uma **prévia** com duas opções: "Imagem" e
  "Vídeo". Superfícies: Afirmações (já tem — trocar pelo novo fluxo), Visões
  (lista e player), Cena-Âncora (revelação e tela da manifestação), prática
  concluída (PracticeRitual), afirmação do sonho (MorningRitual).
- Link: `https://celeste-jet-two.vercel.app/?utm_source=compartilhar&utm_medium=<imagem|video>&utm_campaign=<afirmacao|visao|ancora|pratica|sonho>` — sem nenhum dado pessoal.
- Web: `navigator.share({ files, text })` quando o navegador aceitar o arquivo;
  senão baixar o arquivo e copiar o link. Nativo: `expo-sharing` (arquivo) — o
  link vai no texto da prévia/mensagem quando o app de destino aceitar.

### D. Despertar em sequência
- **Modelo**: `state.morningRitual.wakeSequence = [{ kind: 'anchor'|'vision'|'affirmation', id }]`,
  até 6 itens, normalizado no carregamento (itens que não existem mais saem).
  `wakeAffirmation*` continua existindo (primeira afirmação da sequência) para
  não quebrar o alarme do iPhone.
- **Montar** (tela do despertador, renomeada "Meu despertar"): lista com tipo,
  título, ↑ ↓ ✕; "Adicionar" abre seletor com 3 abas (Cena-Âncora, Visões,
  Afirmações); tempo estimado de escuta calculado pelo texto (honesto).
- **Atalhos**: "Pôr no meu despertar" em visões, afirmações e Cena-Âncora →
  acrescenta e confirma.
- **Tocar** (rota nova `despertar/ouvir`): Traço Celeste → itens em ordem:
  Cena-Âncora/visão = `CenaViva` + narração da história; afirmação = frase em
  tela + narração. Só ouvir, sem microfone. Controles: pausar, próximo, parar.
  Voz: web = voz da Celeste escolhida (com consentimento de nuvem; senão voz do
  aparelho); app = voz do aparelho.
- **Android**: lembrete com som via `expo-notifications` num canal próprio
  ("Meu despertar", importância alta, som padrão), WEEKLY por dia escolhido (ou
  DAILY com todos os dias); tocar abre `despertar/ouvir`. Nada de
  SCHEDULE_EXACT_ALARM/USE_EXACT_ALARM/FOREGROUND_SERVICE. Texto honesto:
  "pode atrasar alguns minutos; a voz toca quando você abrir".
- **iOS**: mantém o AlarmKit atual (toca a primeira afirmação); ao abrir, a
  sequência. **Web**: salva a sequência, explica que o site não acorda ninguém e
  oferece "Ouvir agora".
- Fronteira de release: o módulo nativo de alarme e as permissões especiais
  continuam desligados no Android; atualizar `verificar-fronteira-release-android.js`
  para permitir o lembrete comum + a tela da sequência.

### E. AAB
Depois do code review e do deploy web: `eas build -p android --profile production`
(nuvem da Expo, cota grátis), versionCode automático. Entregar o link do build.
Não enviar para a Play Store.

### F. Cena viva em todos os cards (pedido do Lenda, 20/10)
"Fazer isso em todos os cards agora em vez da imagem": todo card de conteúdo
com imagem (visões, afirmações, Cena-Âncora, prática, sonho, Home) usa a cena
viva no lugar da imagem parada. Para não pesar (sobretudo WebViews no Android),
**anima um card por vez** — o que está em foco (o da vez no carrossel, o que
está tocando, o aberto); os demais mostram o primeiro quadro da mesma cena
(poster). Referência visual aprovada: o vídeo das estrelas
(`Downloads\CELESTE-ANCORA-CINEMATOGRAFICO.mp4`).

### G. Narração com vídeo e palavras (pedido do Lenda, 20/10)
"Enquanto vem a narração vai aparecendo o vídeo e as palavras": quando a voz
toca (Ouvir minha cena, player de visão, manifestação, afirmação, despertar),
a cena viva aparece e o texto surge **palavra por palavra acompanhando a voz**.
Sincronia: pelo progresso do áudio (NarrationContext: progresso por trecho) e,
na voz do aparelho, pelos eventos de palavra (`onBoundary`) quando existirem;
sem eles, proporcional ao tempo estimado. O renderizador desenha a legenda
(mesma fonte serifada) — o vídeo compartilhado usa a mesma legenda progressiva.

## 6.1 Respostas da revisão do construtor (minhas decisões)

- **Origens da sequência**: o seletor atual já aceita 6 origens
  (`utils/personalAffirmations.js`). Frase de sonho (`ritual:<id>`), frase
  própria (`custom`) e afirmação antiga de manifestação entram como
  `kind: 'affirmation'` (são frases). Migração: quem já tem `wakeAffirmationId`
  ganha uma sequência com esse item como primeiro. O botão do sonho "Usar no
  próximo despertar" passa a ACRESCENTAR à sequência (igual aos atalhos).
- **iPhone (AlarmKit)**: o som do alarme é a primeira frase da sequência
  (afirmação/sonho/própria); sem nenhuma frase, usa a afirmação da Cena-Âncora;
  sem nada, mantém o alarme desligado e avisa na tela.
- **Início do despertar**: ela mesma acende as 3 estrelas; o 3º toque inicia a
  voz dentro do gesto (exigência do Safari/iPhone e da fronteira Android
  "narração só depois de um toque"). "A voz toca ao abrir" = no primeiro gesto
  depois de abrir.
- **AAB**: usar `scripts/publicar-google-play.ps1 -StartBuild` (credenciais
  congeladas do EAS — já existem: versionCode 4 foi gerado); árvore limpa e
  commit igual ao GitHub antes do build.

## 7. Decisões que tomei (o Lenda pode corrigir)

- Vídeo compartilhado sai **sem áudio** nesta versão (a voz do aparelho não pode
  ser gravada no app; no site daria, mas manter igual nas duas plataformas).
- Cena viva **2D** (câmera, luz, partículas, grão) — a paralaxe 3D com mapa de
  profundidade fica para a fase 2.
- Exibição no app usa o mesmo renderizador via WebView (paridade com o vídeo).
- Sequência com **até 6 itens**; cartão compartilhado usa a frase curta, nunca a
  história inteira; sempre com prévia antes.
- Vídeo de 8 s, 720×1280, 30 fps (leve para gravar no celular).

## 8. Verificação (prova, não afirmação)

- Checks unitários: normalização da sequência, tempo estimado, mime do vídeo.
- E2E (`scripts/e2e-prod.js`) como usuária nova na web: montar sequência com os
  3 tipos, reordenar, "Ouvir agora" passa pelo Traço Celeste e toca; compartilhar
  imagem e vídeo gera arquivo válido (JPEG 1080×1920; vídeo com bytes > 50 KB e
  tipo mp4/webm); revelação mostra a cena viva após as 3 estrelas.
- Prova por mutação nos portões novos.
- `/code-review` e correção do que for confirmado.
- Deploy pelo script oficial (portões + E2E local + produção + rollback).
- AAB: build EAS concluído. **Ressalva honesta**: sem aparelho Android, o vídeo
  via WebView e o lembrete com som no app não terão teste em aparelho real.
