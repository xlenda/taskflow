# Notas para revisao

Modelo interno. Completar dados de contato e caminhos exatos no build final.

## Acesso

- A versao atual nao exige conta para concluir o onboarding e usar a pratica local.
- Se login for ativado antes do envio, fornecer uma conta de demonstracao que nao expire.

## Conteudo personalizado

- A Celeste funciona sem personalizacao em nuvem por meio do gerador local.
- O onboarding cria a primeira Cena-Âncora no aparelho e deixa o processamento
  em nuvem desligado; não existe pergunta de consentimento no fim do questionário.
- Os textos de cenas usam Anthropic, com OpenAI como failover; se nenhum deles
  estiver configurado e o processamento aprovado do Gemini estiver disponível,
  o Gemini também poderá gerar a cena. Traducoes, imagens e interpretacoes de
  sonhos usam Google Gemini; narracoes neurais sob demanda usam ElevenLabs.
- Esses processadores so sao usados depois de confirmacao adulta e ativação do
  controle único de processamento em nuvem.
- No Android (desde 21/10), a nuvem cobre dois recursos, os dois só depois do
  mesmo consentimento adulto. A narração com a voz escolhida: o texto que a
  pessoa pediu para ouvir, o idioma e a voz vão ao backend (Vercel), que repassa
  só o texto e a voz à ElevenLabs. E os textos com IA: o desejo, a área, o idioma
  e as respostas selecionadas do questionário vão ao backend, que os repassa ao
  provedor de texto de cena (Anthropic; OpenAI como failover; Gemini só se nenhum
  dos dois estiver configurado) para escrever a Cena-Âncora e as visões e
  afirmações das seis áreas. O servidor só aceita esses pedidos com a verificação
  Play Integrity aprovada; sem ela ou sem internet, toca a voz do aparelho com
  aviso e os textos ficam os montados no aparelho com as respostas, sem IA e sem
  aviso de erro. Sem o consentimento, a narração não toca e a tela oferece o
  texto; o despertar e a prática do Plano Celeste usam a voz do aparelho. O
  pedido de consentimento aparece no primeiro toque para ouvir ou ao criar um
  desejo novo na Início, como no site. Quando a pessoa troca o idioma, a cena
  escrita pela IA vai, pelo mesmo backend e com a mesma verificação, ao Google
  Gemini para ser traduzida. Imagens, sonhos e Espelho Vivo em nuvem continuam
  só no site.
- Toda tela do Android que mostra por inteiro texto escrito pela IA (visões,
  afirmações, Cena-Âncora/manifestação, revelação e rituais) ou onde a voz gerada
  toca tem `Denunciar este conteúdo de IA`.
- O app nao apresenta afirmacoes ou sonhos como previsao, diagnostico ou garantia.

## Dados locais

- Manifestacoes, afirmacoes, sonhos e Rastros ficam armazenados no aparelho.
- A pessoa pode editar itens individuais e usar `Recomeçar minha jornada` para
  remover a pratica local.
- No Plano Celeste, audio e transcricao captados pelo microfone sao descartados.
  Somente um recibo minimo da pratica fica localmente, sem o texto reconhecido.
- O backup é um JSON legível e sem criptografia. O app abre a folha de
  compartilhamento do sistema e a web baixa o arquivo; ele não inclui denúncias
  enviadas, consentimentos do aparelho, notificações agendadas nem arquivos de imagem.
- A denúncia contém somente a saída gerada escolhida (ou referência visual),
  motivo, nota opcional e metadados mínimos. Usa identificador pseudônimo
  antiabuso, fica por no máximo 180 dias e pode ser excluída no Perfil enquanto
  a sessão da instalação existir.

## Recursos por plataforma

- O despertador com conteúdo pessoal usa AlarmKit e so deve ser revisado em
  iPhone compativel. Ele aceita afirmação, visão, Cena-Âncora, frase de sonho ou
  frase própria. A web e o Android nao anunciam nem simulam esse alarme do sistema.
- O lembrete do Ritual de Um Minuto usa notificacao local quando permitido.
- O Plano Celeste usa de um a quatro lembretes locais comuns; nao e alarme exato
  e pode sofrer atraso do sistema. Ele nao bloqueia o aparelho.
- A imagem e o texto da visão ou Cena-Âncora ficam visíveis durante a prática.
  A narração completa começa somente quando a pessoa toca em ouvir. Se o
  consentimento de nuvem já estiver ativo (no Android, também com a verificação
  Play Integrity aprovada), a Celeste pode usar ElevenLabs; caso contrário, usa
  o sintetizador do sistema ou navegador, que não deve ser descrito como
  necessariamente offline sem validação do ambiente.
- Depois da narração, ou da confirmação acessível de leitura integral da visão,
  a afirmação permanece visível e são liberadas duas
  repetições, com progresso `1/2` e `2/2`. O microfone começa somente após outro
  toque e o app aceita apenas reconhecimento no dispositivo quando suportado;
  caso contrário, oferece conclusão manual acessível. Áudio e transcrição
  captados pelo microfone não são salvos.
- `Agora nao` e `Adiar 10 min` permanecem disponiveis sem exigir fala.

## Comunidade

- Nao declarar comunidade publica nesta submissao enquanto o backend moderado
  nao estiver ativado. A tela atual preserva rascunhos locais e explica esse estado.

## Passos sugeridos ao revisor

1. Abrir o app e escolher portugues ou ingles.
2. Concluir o questionario; a primeira Cena-Âncora é criada no aparelho, com a
   nuvem desligada e sem pergunta de consentimento no onboarding.
3. Abrir a Cena-Âncora, a Ponte de Hoje e o Ritual de Um Minuto.
4. Em Sonhos, registrar um relato curto e gerar a afirmacao local.
5. Em Perfil, conferir privacidade, reset e `Voz da narração`. No Android, o
   conteúdo gerado com IA é o texto (Cena-Âncora, visões e afirmações das seis
   áreas, escritos a partir do desejo e das respostas da própria pessoa) e a voz
   (ElevenLabs), criada a partir do texto da própria pessoa, os dois depois do
   consentimento adulto; imagens e os outros recursos em nuvem não aparecem.
   Tocar para ouvir uma afirmação, visão ou a história (ou criar um desejo novo
   na Início); na primeira vez, confirmar 18+ e permitir a voz e os textos com
   IA; conferir a voz escolhida,
   os textos das Visões e Afirmações trocados pela versão escrita pela IA e o
   botão `Denunciar este conteúdo de IA` nessas telas. Fora da Play (sem a
   verificação Play Integrity) ou sem internet, toca a voz do aparelho com aviso
   e os textos continuam os montados no aparelho.
6. Abrir o Plano Celeste pela Inicio, escolher uma visao ou Cena-Âncora e uma afirmacao e
   testar um lembrete comum.
7. Conferir a imagem e o texto, tocar em `Ouvir visão completa` e esperar a
   narração terminar. Se o áudio não estiver disponível, ler a visão inteira e
   usar `Li a visão completa`. Depois, tocar para iniciar o microfone, ler a frase
   visível duas vezes e conferir o progresso `1/2` e `2/2`; testar também falha
   de narração, cancelamento, adiamento e conclusão manual.

## Caminhos de teste

- Voz: `Perfil > Voz da narração`; escolher um narrador e tocar a prévia (amostra
  incluída no app, sem nuvem). No Android, a voz escolhida toca em afirmações,
  visões, história/Cena-Âncora, ritual e despertar depois do consentimento; sem a
  verificação Play Integrity ou sem internet, toca a voz do aparelho com aviso.
- Textos com IA (Android): depois do consentimento, abrir `Visões` e
  `Afirmações`; os textos das seis áreas e a Cena-Âncora passam a ser os
  escritos pela IA a partir das respostas. Sem a verificação Play Integrity, sem
  internet ou sem consentimento, continuam os textos montados no aparelho. Trocar
  o idioma do app traduz a Cena-Âncora escrita pela IA (Google Gemini).
- Cena: `Manifestar > abrir manifestacao > Sua narrativa em audio`.
- Sonhos: `Inicio > Conte seu sonho`; escrever, escolher sentimento e tema e
  tocar `Transformar em afirmacao`.
- Ritual: `Inicio > Seu minuto Celeste`; o lembrete local aparece nas opcoes do
  ritual quando o build suporta notificacoes.
- Plano Celeste: `Inicio > Plano Celeste`; a imagem, a visão ou Cena-Âncora e a
  afirmação permanecem na tela. A narração é iniciada por toque e precisa
  terminar, ou a leitura integral precisa ser confirmada pela alternativa
  acessível, antes das duas repetições. O áudio e a transcrição do microfone não
  são retidos nem enviados. O sintetizador do sistema ou navegador pode seguir
  as regras do respectivo fornecedor e deve ser validado no binário final.
- Meu despertar: `Inicio > Meu despertar`; adicionar a Cena-Âncora, uma visão ou
  afirmação, escolher o horário e ligar o lembrete. No Android é uma notificação
  comum com som, sem alarme exato, que abre a sequência; depois de um toque, toca
  a voz escolhida (ou a do aparelho, sem consentimento, internet ou verificação).
  No iPhone compatível, o despertador do sistema usa AlarmKit,
  aceita afirmação, visão, Cena-Âncora, frase de sonho ou frase própria e pede
  permissão de Alarmes.
- Compartilhar: abrir uma afirmação, visão ou a Cena-Âncora, tocar em Compartilhar,
  conferir a prévia do cartão e enviar a imagem ou o vídeo de 8 segundos pela folha
  de compartilhamento do sistema.
- Avaliação: depois da revelação da Cena-Âncora, a janela padrão de avaliação da
  Google Play pode aparecer uma vez; não há pergunta antes nem botão próprio.
- Privacidade: `Perfil > Privacidade e dados`.
- Denunciar: em qualquer tela que mostra por inteiro texto escrito pela IA ou
  onde a voz gerada toca, `Denunciar este conteúdo de IA`, escolher o motivo e
  enviar, sem sair do app.
- Denúncias: `Perfil > Excluir denúncias de conteúdo de IA enviadas`.
- Backup: `Jornada > Cópia de segurança`; no app, conferir a share sheet.
- Reset: `Jornada > Recomeçar minha jornada`.

## Nota em inglês para o revisor (Play Console > Acesso ao app)

Texto atualizado em 21/10, o mesmo da auditoria
`docs/AUDITORIA-PLAY-STORE-2026-10-20.md`:

> No sign-in or credentials are required. Select a language and complete onboarding; the first Anchor Scene is created on the device with cloud processing off. This Android version has no Community, purchases, ads or exact alarm, and it does not generate images with AI. Its AI features are text and voice, both made from the user's own content and only after consent. The first time the user taps to listen, or creates a new desire on Home, a dialog asks them to confirm they are 18 or older and to allow the AI voice and AI-written texts. Texts: Celeste's server then has an AI text model rewrite the Anchor Scene and the visions and affirmations for six life areas from the user's desire and selected onboarding answers (Visions and Affirmations tabs); before consent, or without a connection, these texts are assembled on the device from the same answers. When the user switches the app language, the AI-written scene is translated by Google Gemini through Celeste's server, with the same Play Integrity check. Voice: when the user taps to listen to their own affirmation, vision, story or Anchor Scene, Celeste can read that text aloud with an AI voice from ElevenLabs, in the narrator chosen at the reveal or in Profile > Narration voice; only the text they asked to hear, its language and the chosen voice are sent, through Celeste's server, to create the audio. The server accepts AI text and voice requests only from the app installed from Google Play (Play Integrity); otherwise, or offline, the texts stay the on-device versions and the device's built-in voice plays with a notice. Reporting: on every screen that shows AI-written text in full or plays the AI voice, tap "Report this AI content", choose a reason and submit without leaving the app. After the scene is revealed, the standard Google Play in-app review dialog may appear once. "My wake-up": Home > My wake-up, add an Anchor Scene, vision or affirmation, choose a time and turn the reminder on; it is an ordinary notification with sound (no exact alarm) that opens the sequence, which plays after a tap. Sharing: open an affirmation, vision or the Anchor Scene, tap Share, preview the card, then share the image or the 8-second video through the system share sheet. Celeste Plan: Home > Celeste Plan, select a vision or Anchor Scene and an affirmation, tap Listen to full vision, then tap to start the microphone (on-device recognition only; nothing is stored or uploaded); Not now, Snooze 10 min and manual completion are available.
