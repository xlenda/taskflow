// Biblioteca da Jornada da semana (8 a 12 temas). Cada tema:
// { id: /^[a-z0-9_]+$/, icon: nome do Ionicons, title: { pt, en },
//   days: 7 x { line: { pt, en }, affirmation: { pt, en }, action: { pt, en } } }
// Limites em utils/weeklyJourney.js (JOURNEY_LIMITS). Conferido por scripts/verificar-jornada-semanal.js.
// `line` é falada (áudio gravado uma vez: mudar o texto exige gerar o áudio de novo); `affirmation` e `action`
// aparecem na tela durante o silêncio. Os 7 dias de cada tema vão do notar ao agir.
export const WEEKLY_JOURNEYS = [
  {
    id: 'prosperidade',
    icon: 'leaf',
    title: { pt: 'Prosperidade', en: 'Prosperity' },
    days: [
      {
        line: {
          pt: 'Prosperidade começa no olhar. Hoje, você repara em quanta coisa já está aqui.',
          en: 'Prosperity starts with seeing. Today, you notice how much is already here.',
        },
        affirmation: {
          pt: 'Eu vejo a fartura que já existe ao meu redor.',
          en: 'I see the plenty that is already around me.',
        },
        action: {
          pt: 'Anote cinco coisas que você tem hoje e que um dia desejou.',
          en: 'Write down five things you have today that you once wished for.',
        },
      },
      {
        line: {
          pt: 'Hoje, você acha fartura no pequeno: água quente, copo cheio, luz da manhã.',
          en: 'Today, you find plenty in small things: warm water, a full glass, sunlight.',
        },
        affirmation: { pt: 'Eu dou valor às pequenas alegrias.', en: 'I let small good things count.' },
        action: {
          pt: 'Sirva seu café ou chá na sua xícara preferida e beba devagar.',
          en: 'Serve your coffee or tea in your favorite cup and drink it slowly.',
        },
      },
      {
        line: {
          pt: 'Hoje, você se permite receber. Um simples obrigada já basta.',
          en: 'Today, you let yourself receive. A simple thank you is enough.',
        },
        affirmation: { pt: 'Eu recebo de mãos abertas.', en: 'I receive with open hands.' },
        action: {
          pt: 'Peça uma pequena ajuda a alguém hoje e apenas agradeça.',
          en: 'Ask someone for one small favor today, and just say thank you.',
        },
      },
      {
        line: {
          pt: 'Hoje, você repara nas palavras de falta e escolhe outras, mais gentis.',
          en: 'Today, you catch the words of lack, and choose gentler ones.',
        },
        affirmation: { pt: 'Eu falo do que tenho com carinho.', en: 'I speak about what I have with kindness.' },
        action: {
          pt: 'Escreva uma frase de falta que você costuma dizer e reescreva com gentileza.',
          en: 'Write one sentence of lack you often say, then rewrite it kindly.',
        },
      },
      {
        line: {
          pt: 'Hoje, você cuida de algo que já tem como se tivesse acabado de chegar.',
          en: 'Today, you care for something you already have, as if it just arrived.',
        },
        affirmation: { pt: 'Eu cuido com amor do que é meu.', en: 'I take loving care of what is mine.' },
        action: {
          pt: 'Limpe, dobre ou conserte uma coisa sua, devagar e com cuidado.',
          en: 'Clean, fold, or mend one thing you own, slowly and with care.',
        },
      },
      {
        line: {
          pt: 'A fartura circula. Hoje, você deixa algo bom passar pelas suas mãos.',
          en: 'Plenty moves. Today, you let something good pass through your hands.',
        },
        affirmation: { pt: 'Eu compartilho com alegria o que tenho.', en: 'I give freely from what I have.' },
        action: {
          pt: 'Doe algo hoje: um livro, uma refeição, seu tempo, uma palavra gentil.',
          en: 'Give something away today: a book, a meal, your time, a kind word.',
        },
      },
      {
        line: {
          pt: 'Hoje, você atravessa o dia como quem tem o bastante.',
          en: 'Today, you move through the world like someone who has enough.',
        },
        affirmation: { pt: 'Eu abro espaço para o prazer na minha vida.', en: 'I make room for pleasure in my life.' },
        action: {
          pt: 'Marque na agenda um pequeno prazer para esta semana.',
          en: 'Plan one small pleasure for this week and put it on your calendar.',
        },
      },
    ],
  },
  {
    id: 'amor',
    icon: 'heart',
    title: { pt: 'Amor', en: 'Love' },
    days: [
      {
        line: {
          pt: 'O amor já está em algum lugar do seu dia. Hoje, você repara onde.',
          en: 'Love is already somewhere in your day. Today, you notice where.',
        },
        affirmation: { pt: 'Eu percebo o amor que já está aqui.', en: 'I notice the love that is already here.' },
        action: {
          pt: 'Anote três momentos desta semana em que você se sentiu cuidada.',
          en: 'Write down three moments this week when you felt cared for.',
        },
      },
      {
        line: {
          pt: 'Hoje, você fala consigo do jeito que fala com quem ama.',
          en: 'Today, you speak to yourself the way you speak to someone you love.',
        },
        affirmation: { pt: 'Eu sou gentil comigo mesma.', en: 'I am gentle with myself.' },
        action: {
          pt: 'Coloque a mão no peito e diga o seu nome com carinho, três vezes.',
          en: 'Put your hand on your heart and say your own name kindly, three times.',
        },
      },
      {
        line: {
          pt: 'Hoje, você se deixa amar como é, e não como um dia vai ser.',
          en: "Today, you let yourself be loved as you are, not as you'll be someday.",
        },
        affirmation: { pt: 'Eu mereço amor exatamente como sou.', en: 'I am worthy of love exactly as I am.' },
        action: {
          pt: 'Olhe no espelho por um minuto e diga uma coisa que você ama em você.',
          en: 'Look in the mirror for one minute and name one thing you love about yourself.',
        },
      },
      {
        line: {
          pt: 'O amor também sabe soltar. Hoje, você deixa uma mágoa antiga mais leve.',
          en: 'Love knows how to let go. Today, you set down one old hurt.',
        },
        affirmation: { pt: 'Eu abro espaço no coração quando solto.', en: 'I make room in my heart by letting go.' },
        action: {
          pt: 'Escreva uma mágoa antiga num papel, depois rasgue e jogue fora.',
          en: 'Write one old hurt on a piece of paper, then tear it up and throw it away.',
        },
      },
      {
        line: {
          pt: 'Hoje, você diz a alguém, com palavras simples, o quanto essa pessoa importa.',
          en: 'Today, you tell someone, in plain words, how much they matter to you.',
        },
        affirmation: { pt: 'Eu amo em voz alta.', en: 'I love out loud.' },
        action: {
          pt: 'Mande para alguém que você ama uma coisa específica que admira nessa pessoa.',
          en: 'Text someone you love one specific thing you admire about them.',
        },
      },
      {
        line: {
          pt: 'Hoje, você deixa o amor entrar. Quando ele chega, você não desvia.',
          en: "Today, you let love in. When it comes, you don't wave it away.",
        },
        affirmation: { pt: 'Eu me permito ser amada.', en: 'I let myself be loved.' },
        action: {
          pt: 'Peça a alguém próximo um abraço ou uma ligação hoje, e deixe durar.',
          en: 'Ask someone close for a hug or a call today, and let it last.',
        },
      },
      {
        line: {
          pt: 'Amor é algo que se faz. Hoje, você escolhe um gesto de carinho e faz.',
          en: 'Love is something you do. Today, you choose one tender act and do it.',
        },
        affirmation: { pt: 'Eu vivo de coração aberto.', en: 'I live with an open heart.' },
        action: {
          pt: 'Faça uma gentileza para alguém hoje sem contar para ninguém.',
          en: 'Do one kind thing for someone today without telling anyone.',
        },
      },
    ],
  },
  {
    id: 'autoconfianca',
    icon: 'star',
    title: { pt: 'Autoconfiança', en: 'Self-confidence' },
    days: [
      {
        line: {
          pt: 'Você já fez coisas difíceis. Hoje, você se lembra de algumas delas.',
          en: "You've done hard things before. Today, you remember a few of them.",
        },
        affirmation: {
          pt: 'Eu já fiz coisas difíceis, e posso fazer de novo.',
          en: 'I have done hard things, and I can do them again.',
        },
        action: {
          pt: 'Liste três vezes em que você foi mais corajosa do que imaginava.',
          en: 'List three times you were braver than you thought you could be.',
        },
      },
      {
        line: {
          pt: 'Hoje, você diz em voz alta aquilo em que é boa, sem se diminuir.',
          en: "Today, you say out loud what you're good at, without shrinking it.",
        },
        affirmation: { pt: 'Eu assumo os meus dons sem pedir desculpas.', en: 'I own my gifts without apology.' },
        action: {
          pt: 'Escreva três coisas que você faz bem e leia em voz alta uma vez.',
          en: 'Write down three things you do well, and read them aloud once.',
        },
      },
      {
        line: {
          pt: 'A confiança mora no corpo também. Hoje, você se ergue e respira fundo.',
          en: 'Confidence lives in the body too. Today, you stand tall and breathe deep.',
        },
        affirmation: { pt: 'Eu ocupo o meu lugar com tranquilidade.', en: 'I take up space with ease.' },
        action: {
          pt: 'Fique de pé, pés firmes e ombros abertos, por dois minutos, sem pressa.',
          en: 'Stand with your feet planted and shoulders open for two slow minutes.',
        },
      },
      {
        line: {
          pt: 'Hoje, você para de medir a sua vida pelos melhores momentos dos outros.',
          en: "Today, you stop measuring your life against someone else's highlights.",
        },
        affirmation: { pt: 'O meu caminho é meu, e o meu ritmo também.', en: 'My path is mine, and so is my pace.' },
        action: {
          pt: 'Silencie um perfil que faz você se sentir menor, sem culpa.',
          en: 'Mute one account that makes you feel small, without guilt.',
        },
      },
      {
        line: {
          pt: 'Confiança nasce de promessa cumprida. Hoje, você cumpre uma com você mesma.',
          en: 'Trust grows from kept promises. Today, you keep a small one to yourself.',
        },
        affirmation: { pt: 'Eu cumpro a palavra que dou a mim mesma.', en: 'I keep my word to myself.' },
        action: {
          pt: 'Escolha uma tarefa pequena que você vem adiando e termine em cinco minutos.',
          en: "Pick one tiny task you've been putting off and finish it in five minutes.",
        },
      },
      {
        line: {
          pt: 'Hoje, a sua voz tem lugar. Você diz o que pensa, com gentileza.',
          en: 'Today, your voice belongs in the room. You say what you think, kindly.',
        },
        affirmation: { pt: 'A minha voz importa, e eu falo.', en: 'My voice matters, and I use it.' },
        action: {
          pt: 'Dê uma opinião sincera hoje, numa reunião, numa conversa ou à mesa.',
          en: 'Share one honest opinion today, in a meeting, a chat, or at the table.',
        },
      },
      {
        line: {
          pt: 'Hoje, você dá um passo pequeno e corajoso, antes de se sentir pronta.',
          en: 'Today, you take one small brave step, before you feel ready.',
        },
        affirmation: { pt: 'Eu não espero me sentir pronta. Eu começo.', en: "I don't wait to feel ready. I begin." },
        action: {
          pt: 'Envie a mensagem, faça a ligação ou a pergunta que você vem guardando.',
          en: "Send the message, make the call, or ask the question you've been holding back.",
        },
      },
    ],
  },
  {
    id: 'calma',
    icon: 'water',
    title: { pt: 'Calma', en: 'Calm' },
    days: [
      {
        line: {
          pt: 'A calma já está debaixo do barulho. Hoje, você repara onde guarda tensão.',
          en: 'Calm is already under the noise. Today, you notice where you hold tension.',
        },
        affirmation: {
          pt: 'Debaixo de todo barulho, existe calma em mim.',
          en: 'Under all the noise, there is calm in me.',
        },
        action: {
          pt: 'Percorra o corpo da mandíbula aos pés e solte o primeiro ponto tenso.',
          en: 'Scan from your jaw down to your feet and soften the first tight spot.',
        },
      },
      {
        line: {
          pt: 'A respiração está sempre com você. Hoje, você solta o ar bem devagar.',
          en: 'Your breath is always with you. Today, you let each exhale run long.',
        },
        affirmation: { pt: 'Cada respiração me traz de volta para mim.', en: 'Each breath brings me back to myself.' },
        action: {
          pt: 'Inspire contando até quatro e solte contando até seis, dez vezes, onde estiver.',
          en: 'Breathe in for a count of four and out for six, ten times, wherever you are.',
        },
      },
      {
        line: {
          pt: 'Hoje, você faz uma coisa comum na metade da velocidade, e repara em tudo.',
          en: 'Today, you do one ordinary thing at half speed, and notice everything.',
        },
        affirmation: { pt: 'Eu tenho tempo para este momento.', en: 'I have time for this moment.' },
        action: {
          pt: 'Lave uma xícara, penteie o cabelo ou sirva água devagar, como um ritual.',
          en: 'Wash a cup, brush your hair, or pour water slowly, like a small ritual.',
        },
      },
      {
        line: {
          pt: 'Pensamentos passam como nuvens. Hoje, você só olha, sem ir atrás.',
          en: 'Thoughts drift by like clouds. Today, you watch without chasing them.',
        },
        affirmation: {
          pt: 'Eu observo meus pensamentos e continuo em paz.',
          en: 'I can watch my thoughts and stay at peace.',
        },
        action: {
          pt: "Sente por três minutos e chame cada pensamento de 'nuvem' quando ele passar.",
          en: "Sit for three minutes and call each thought 'cloud' as it drifts by.",
        },
      },
      {
        line: {
          pt: 'A calma precisa de espaço. Hoje, você se dá permissão para pausar.',
          en: 'Calm needs room. Today, you give yourself permission to pause.',
        },
        affirmation: { pt: 'Eu posso ir mais devagar.', en: 'I am allowed to slow down.' },
        action: {
          pt: 'Vire o celular para baixo por cinco minutos e só olhe pela janela.',
          en: 'Turn your phone face down for five minutes and just look out a window.',
        },
      },
      {
        line: {
          pt: 'Hoje, você deixa o espaço ao seu redor um pouco mais aconchegante.',
          en: 'Today, you make the space around you a little softer.',
        },
        affirmation: { pt: 'Eu crio calma onde eu estiver.', en: 'I create calm wherever I am.' },
        action: {
          pt: 'Coloque uma música suave, diminua uma luz e fique ali dois minutos em silêncio.',
          en: 'Put on soft music, dim one light, and sit there for two quiet minutes.',
        },
      },
      {
        line: {
          pt: 'Hoje, antes de responder qualquer coisa, você respira uma vez.',
          en: 'Today, before you answer anything, you take one breath first.',
        },
        affirmation: { pt: 'Eu respondo com calma, não com pressa.', en: 'I respond from calm, not from rush.' },
        action: {
          pt: "Escreva 'respire primeiro' num papel e deixe onde você vai ver hoje.",
          en: "Write 'breathe first' on a note and put it where you'll see it today.",
        },
      },
    ],
  },
  {
    id: 'foco',
    icon: 'eye',
    title: { pt: 'Foco', en: 'Focus' },
    days: [
      {
        line: {
          pt: 'A sua atenção desenha o seu dia. Hoje, você repara para onde ela vai.',
          en: 'Your attention shapes your day. Today, you notice where it wanders.',
        },
        affirmation: {
          pt: 'Minha atenção é preciosa, e eu escolho onde ela fica.',
          en: 'My attention is precious, and I choose where it goes.',
        },
        action: {
          pt: 'Veja o tempo de tela de hoje e só repare no número, sem julgamento.',
          en: "Check today's screen time and just notice the number, without judgment.",
        },
      },
      {
        line: {
          pt: 'Nem tudo importa hoje. Você escolhe a única coisa que importa.',
          en: 'Not everything matters today. You choose the one thing that does.',
        },
        affirmation: { pt: 'Eu sei o que mais importa hoje.', en: 'I know what matters most today.' },
        action: {
          pt: 'Escreva a única coisa que faria o dia de hoje valer a pena.',
          en: 'Write down the one thing that would make today feel well spent.',
        },
      },
      {
        line: {
          pt: 'Hoje, você tira do caminho uma coisa pequena que vive puxando a sua atenção.',
          en: 'Today, you clear away one small thing that keeps pulling you off course.',
        },
        affirmation: { pt: 'Eu abro caminho para o que importa para mim.', en: 'I clear the way for what matters to me.' },
        action: {
          pt: 'Desligue as notificações de um aplicativo que rouba o seu foco.',
          en: 'Turn off notifications for one app that steals your focus.',
        },
      },
      {
        line: {
          pt: 'Hoje, você faz uma coisa de cada vez, e se entrega inteira a ela.',
          en: 'Today, you do one thing at a time, and give it all of you.',
        },
        affirmation: { pt: 'Eu estou inteira no que estou fazendo.', en: "I am fully here for what I'm doing." },
        action: {
          pt: 'Marque cinco minutos no relógio e dê atenção total a uma única tarefa.',
          en: 'Set a five-minute timer and give one single task your full attention.',
        },
      },
      {
        line: {
          pt: 'Todo sim custa tempo. Hoje, você diz um não gentil a uma coisa pequena.',
          en: 'Every yes costs time. Today, you say a kind no to one small thing.',
        },
        affirmation: { pt: 'Eu protejo o meu tempo com gentileza.', en: 'I protect my time with kindness.' },
        action: {
          pt: 'Reserve na agenda de amanhã quinze minutos para o que mais importa.',
          en: "Block fifteen minutes on tomorrow's calendar for what matters most.",
        },
      },
      {
        line: {
          pt: 'Hoje, você fecha uma pendência e sente a leveza que vem depois.',
          en: 'Today, you close one open loop and feel the lightness that follows.',
        },
        affirmation: { pt: 'Eu termino o que começo, um passo de cada vez.', en: 'I finish what I start, one step at a time.' },
        action: {
          pt: 'Termine uma coisa que ficou pela metade: um e-mail, uma gaveta, uma página.',
          en: 'Finish one half-done thing: an email, a drawer, a page.',
        },
      },
      {
        line: {
          pt: 'Hoje, você termina o dia sabendo por onde o amanhã começa.',
          en: 'Today, you end the day knowing where tomorrow begins.',
        },
        affirmation: {
          pt: 'Eu sigo em direção ao que importa, um dia de cada vez.',
          en: 'I move toward what matters, one day at a time.',
        },
        action: {
          pt: 'Escreva a prioridade de amanhã num papel e deixe onde o seu dia começa.',
          en: "Write tomorrow's one thing on a note and leave it where your day starts.",
        },
      },
    ],
  },
  {
    id: 'gratidao',
    icon: 'flower',
    title: { pt: 'Gratidão', en: 'Gratitude' },
    days: [
      {
        line: {
          pt: 'A gratidão começa no pequeno. Hoje, você pega um momento bom no ar.',
          en: 'Gratitude starts small. Today, you catch one good moment as it happens.',
        },
        affirmation: { pt: 'Eu percebo o que é bom enquanto está aqui.', en: 'I notice the good while it is here.' },
        action: {
          pt: 'Fotografe uma coisa boa e pequena de hoje, só para você.',
          en: 'Take a photo of one small good thing today, just for you.',
        },
      },
      {
        line: {
          pt: "Hoje, você agradece nos detalhes: não 'a família', mas aquela risada no jantar.",
          en: "Today, your thanks get specific: not 'family,' but that laugh at dinner.",
        },
        affirmation: {
          pt: 'Eu enxergo os detalhes que deixam a minha vida bonita.',
          en: 'I see the details that make my life beautiful.',
        },
        action: {
          pt: 'Escreva três agradecimentos hoje, cada um sobre um detalhe pequeno.',
          en: 'Write three thank-yous today, each one about a tiny detail.',
        },
      },
      {
        line: {
          pt: 'Hoje, você agradece pelos sentidos: algo que você prova, ouve e toca.',
          en: 'Today, you thank your senses: something you taste, hear, and touch.',
        },
        affirmation: {
          pt: 'Eu sou grata por estar aqui, sentindo tudo isso.',
          en: 'I am grateful to be here, feeling all of this.',
        },
        action: {
          pt: 'Coma algo devagar hoje e diga três sabores que você sente.',
          en: 'Eat one thing slowly today and name three flavors you can taste.',
        },
      },
      {
        line: {
          pt: 'Alguém deixou a sua vida mais leve esta semana. Hoje, você lembra quem.',
          en: 'Someone made your life easier this week. Today, you remember who.',
        },
        affirmation: {
          pt: 'Eu sou amparada por mais pessoas do que imagino.',
          en: 'I am held by more people than I realize.',
        },
        action: {
          pt: 'Escreva o nome de três pessoas que ajudaram você, mesmo em coisas pequenas.',
          en: 'Write down the names of three people who helped you lately, even in small ways.',
        },
      },
      {
        line: {
          pt: 'Hoje, a sua gratidão deixa de ser segredo e chega até alguém.',
          en: 'Today, your gratitude stops being a secret and reaches someone.',
        },
        affirmation: { pt: 'Eu digo obrigada e sinto cada palavra.', en: 'I say thank you and mean every word.' },
        action: {
          pt: 'Mande um agradecimento de duas linhas a quem não está esperando.',
          en: "Send a two-line thank-you to someone who isn't expecting it.",
        },
      },
      {
        line: {
          pt: 'Hoje, você agradece a quem trouxe você até aqui: você mesma.',
          en: 'Today, you thank the one who brought you this far: you.',
        },
        affirmation: { pt: 'Eu sou grata pela mulher que sou.', en: 'I am grateful for the woman I am.' },
        action: {
          pt: 'Escreva um bilhete de agradecimento a si mesma por algo que enfrentou este ano.',
          en: 'Write yourself a short thank-you note for something you got through this year.',
        },
      },
      {
        line: {
          pt: 'Gratidão é um jeito de olhar. Hoje, você leva esse olhar para todo lugar.',
          en: 'Gratitude is a way of seeing. Today, you carry it into every room.',
        },
        affirmation: { pt: 'Eu vivo o meu dia com olhos de gratidão.', en: 'I move through my day with grateful eyes.' },
        action: {
          pt: 'Agradeça à próxima pessoa que ajudar você, olhando nos olhos dela.',
          en: 'Thank the next person who helps you, and look them in the eye as you do.',
        },
      },
    ],
  },
  {
    id: 'proposito',
    icon: 'compass',
    title: { pt: 'Propósito', en: 'Purpose' },
    days: [
      {
        line: {
          pt: 'O propósito se esconde no que faz o tempo sumir. Hoje, você repara nisso.',
          en: 'Purpose hides in what makes time disappear. Today, you notice what does.',
        },
        affirmation: {
          pt: 'O que me acende está me mostrando um caminho.',
          en: 'What lights me up is pointing the way.',
        },
        action: {
          pt: 'Anote a última vez em que você perdeu a noção do tempo e o que fazia.',
          en: 'Write down the last time you lost track of time, and what you were doing.',
        },
      },
      {
        line: {
          pt: 'A menina que você foi já sabia de muita coisa. Hoje, você ouve o que ela diz.',
          en: 'The girl you once were already knew things. Today, you listen to her.',
        },
        affirmation: {
          pt: 'Eu honro o que amava antes de me dizerem quem ser.',
          en: 'I honor what I loved before anyone told me who to be.',
        },
        action: {
          pt: 'Escreva três coisas que você amava fazer quando criança, sem parar para julgar.',
          en: 'Write three things you loved doing as a child, without stopping to judge.',
        },
      },
      {
        line: {
          pt: 'Hoje, você dá nome ao que importa para você, ao que não troca por nada.',
          en: "Today, you name what matters to you, the things you won't trade away.",
        },
        affirmation: { pt: 'Eu sei o que é inegociável para mim.', en: 'I know what I stand for.' },
        action: {
          pt: 'Escolha três palavras que são você: liberdade, beleza, família, verdade, alegria.',
          en: 'Choose three words that feel like you: freedom, beauty, family, truth, joy.',
        },
      },
      {
        line: {
          pt: 'Seus dons foram feitos para circular. Hoje, você repara em quem eles ajudam.',
          en: 'Your gifts are meant to be shared. Today, you notice who they help.',
        },
        affirmation: { pt: 'O que eu dou de coração faz diferença.', en: 'What I give from the heart makes a difference.' },
        action: {
          pt: 'Pergunte a uma amiga o que ela costuma buscar em você e anote a resposta.',
          en: 'Ask a friend what they come to you for, and write down the answer.',
        },
      },
      {
        line: {
          pt: 'Propósito não é uma grande resposta. Hoje, é uma escolha pequena que você faz.',
          en: "Purpose isn't a grand answer. Today, it's one small choice you make.",
        },
        affirmation: { pt: 'As minhas escolhas de todo dia mostram quem eu sou.', en: 'My everyday choices show who I am.' },
        action: {
          pt: 'Mude uma coisa pequena hoje para que ela combine com o que importa para você.',
          en: 'Change one small thing today so it matches what matters to you.',
        },
      },
      {
        line: {
          pt: 'Hoje, você oferece a uma pessoa o melhor que sabe fazer, de coração.',
          en: 'Today, you offer what you do best to one person, freely.',
        },
        affirmation: { pt: 'Eu compartilho os meus dons com generosidade.', en: 'I share my gifts generously.' },
        action: {
          pt: 'Ensine a alguém algo pequeno que você sabe, ou mande uma dica que possa ajudar.',
          en: 'Teach someone one small thing you know, or send a tip that could help them.',
        },
      },
      {
        line: {
          pt: 'Hoje, você dá o primeiro passo pequeno rumo à vida que tem a sua cara.',
          en: 'Today, you take the first small step toward a life that feels like yours.',
        },
        affirmation: { pt: 'Eu caminho em direção a uma vida que é minha.', en: 'I am walking toward a life that is mine.' },
        action: {
          pt: 'Dedique cinco minutos ao primeiro passo de algo com que você sonha.',
          en: "Spend five minutes on the first step of something you've been dreaming about.",
        },
      },
    ],
  },
  {
    id: 'lar',
    icon: 'home',
    title: { pt: 'Lar', en: 'Home' },
    days: [
      {
        line: {
          pt: 'O lar começa onde você está. Hoje, você olha para o seu com olhos novos.',
          en: 'Home starts where you are. Today, you see yours with new eyes.',
        },
        affirmation: { pt: 'Eu pertenço ao lugar onde estou agora.', en: 'I belong where I am right now.' },
        action: {
          pt: 'Ande pela sua casa, encontre um canto que você ama e sente ali um minuto.',
          en: 'Walk through your home, find one spot you love, and sit there for a minute.',
        },
      },
      {
        line: {
          pt: 'Hoje, você sente a sua casa: a luz, o cheiro, os sons de cada canto.',
          en: 'Today, you notice how your home feels: the light, the smell, the sounds.',
        },
        affirmation: { pt: 'A minha casa me acolhe com carinho.', en: 'My home holds me gently.' },
        action: {
          pt: 'Abra as janelas por cinco minutos e deixe o ar novo entrar.',
          en: 'Open the windows for five minutes and let fresh air move through.',
        },
      },
      {
        line: {
          pt: 'Hoje, você dá um pouco de carinho a um cantinho da sua casa.',
          en: 'Today, you give one small corner of your home a little love.',
        },
        affirmation: { pt: 'Eu cuido do lugar que cuida de mim.', en: 'I care for the place that cares for me.' },
        action: {
          pt: 'Arrume uma gaveta, uma prateleira ou uma mesa em cinco minutos, com calma.',
          en: 'Tidy one drawer, shelf, or tabletop in five unhurried minutes.',
        },
      },
      {
        line: {
          pt: 'O que não se usa pesa por dentro também. Hoje, você solta uma coisa.',
          en: "What you don't use weighs on you too. Today, you let one thing go.",
        },
        affirmation: { pt: 'Eu fico com o que amo e libero o resto.', en: 'I keep what I love and release the rest.' },
        action: {
          pt: 'Escolha uma coisa que você não usa mais e coloque numa sacola para doar.',
          en: 'Pick one thing you no longer use and put it in a bag to donate.',
        },
      },
      {
        line: {
          pt: 'Hoje, você leva uma coisa pequena e bonita para dentro de casa.',
          en: 'Today, you bring one small, beautiful thing into your home.',
        },
        affirmation: { pt: 'Eu deixo a beleza morar no meu dia a dia.', en: 'I let beauty live in my everyday.' },
        action: {
          pt: 'Coloque uma flor, uma vela ou uma foto que você ama onde vai ver sempre.',
          en: "Put a flower, a candle, or a photo you love somewhere you'll see it often.",
        },
      },
      {
        line: {
          pt: 'Lar também é gente. Hoje, você faz alguém se sentir em casa.',
          en: 'Home is people, too. Today, you make someone feel at home.',
        },
        affirmation: { pt: 'A minha casa tem espaço para o afeto.', en: 'There is room for warmth in my home.' },
        action: {
          pt: 'Faça um chá ou café para alguém, ou ligue para quem é casa para você.',
          en: 'Make tea or coffee for someone, or call a person who feels like home.',
        },
      },
      {
        line: {
          pt: 'Aonde você for hoje, leva o seu lar por dentro.',
          en: 'Wherever you go today, you carry home inside you.',
        },
        affirmation: { pt: 'O lar é um lugar dentro de mim, e eu volto para ele.', en: 'Home is a place inside me, and I return to it.' },
        action: {
          pt: 'Crie um pequeno ritual de chegada: respirar na porta, tirar os sapatos, sorrir.',
          en: 'Create a small ritual for coming home: a breath at the door, shoes off, a smile.',
        },
      },
    ],
  },
];
