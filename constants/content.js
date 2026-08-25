// Conteúdo do produto — bilíngue EN / PT-BR.
// Todo campo que o usuário LÊ é um objeto { en, pt } resolvido por txt()/localized().
// Chaves técnicas (id, category, accent, icon, duration, goalDays) continuam em inglês:
// elas são usadas como identificador em várias telas e no estado salvo.
import { txt } from './i18n';

export const TRENDING = [
  { en: 'Dream job offer', pt: 'Emprego dos sonhos' },
  { en: '$10k months', pt: '10 mil por mês' },
  { en: 'Soulmate love', pt: 'Amor de alma gêmea' },
  { en: 'Euro summer', pt: 'Verão na Europa' },
  { en: 'Glowing health', pt: 'Saúde radiante' },
  { en: 'Debt free life', pt: 'Vida sem dívidas' },
  { en: 'Unshakeable confidence', pt: 'Confiança inabalável' },
];

// `key` é o identificador (fica sempre em inglês, casa com item.category).
// `label` é o que aparece na tela.
export const CATEGORIES = [
  { key: 'Love', icon: 'heart', accent: 1, label: { en: 'Love', pt: 'Amor' } },
  { key: 'Wealth', icon: 'diamond', accent: 0, label: { en: 'Wealth', pt: 'Prosperidade' } },
  { key: 'Career', icon: 'briefcase', accent: 3, label: { en: 'Career', pt: 'Carreira' } },
  { key: 'Health', icon: 'leaf', accent: 4, label: { en: 'Health', pt: 'Saúde' } },
  { key: 'Confidence', icon: 'flame', accent: 2, label: { en: 'Confidence', pt: 'Confiança' } },
  { key: 'Peace', icon: 'moon', accent: 5, label: { en: 'Peace', pt: 'Paz' } },
];

export const categoryMeta = (key) =>
  CATEGORIES.find((c) => c.key === key) || {
    key: 'Wealth',
    icon: 'sparkles',
    accent: 0,
    label: { en: 'Wealth', pt: 'Prosperidade' },
  };

export const FOR_YOU = [
  {
    id: 'fy-1',
    title: { en: 'Abundant partnership', pt: 'Uma parceria que transborda' },
    category: 'Love',
    accent: 1,
    tagline: {
      en: 'When Daniel leaned over to sign our first lease together',
      pt: 'Quando o Daniel se debruçou para assinar nosso primeiro contrato juntos',
    },
    intention: {
      en: 'A love that feels safe, playful and completely mutual.',
      pt: 'Um amor seguro, leve e completamente recíproco.',
    },
    affirmation: {
      en: 'I am deeply loved, chosen daily, and safe in the arms of a partner who matches my energy.',
      pt: 'Vivo um amor profundo. Me escolhem todos os dias e, ao lado de quem vibra na minha frequência, eu descanso.',
    },
    story: {
      en: 'It is a Sunday morning and the light is coming through the kitchen window. You hear him humming while the coffee brews. He leans over the counter, taps the pen twice the way he always does, and signs the lease for the apartment you both fell in love with. You feel it in your chest — this is the ease you asked for. Nothing about this love feels like effort.',
      pt: 'Domingo de manhã, e a luz entra pela janela da cozinha. Você escuta ele cantarolando enquanto o café passa. Ele se apoia na bancada, bate a caneta duas vezes — do jeito que sempre faz — e assina o contrato daquele apartamento que vocês dois amaram de cara. Você sente no peito: é essa leveza que você pediu. Nada nesse amor parece esforço.',
    },
    goalDays: 21,
  },
  {
    id: 'fy-2',
    title: { en: 'Unstoppable personal brand', pt: 'Marca pessoal imparável' },
    category: 'Career',
    accent: 3,
    tagline: {
      en: 'Closing your laptop at dawn after finishing the launch',
      pt: 'Fechando o notebook de madrugada, com o lançamento no ar',
    },
    intention: {
      en: 'Work that pays me generously and feels like play.',
      pt: 'Um trabalho que me paga muito bem e ainda parece brincadeira.',
    },
    affirmation: {
      en: 'My work is magnetic. The right people find me, pay me well, and tell everyone about me.',
      pt: 'Meu trabalho é magnético. As pessoas certas me encontram, pagam bem e falam de mim para todo mundo.',
    },
    story: {
      en: 'The launch page is live. You close the laptop at 6:04am and the first notification lands before you even stand up. Then another. Then twelve. Your name is being repeated in rooms you have never walked into. You make tea, sit by the window, and let yourself feel how normal this success has become.',
      pt: 'A página do lançamento está no ar. Você fecha o notebook às 6h04 e a primeira notificação chega antes de você levantar da cadeira. Depois outra. Depois doze. Seu nome está sendo repetido em salas onde você nunca pôs os pés. Você faz um chá, senta perto da janela e se deixa sentir o quanto esse sucesso já virou rotina.',
    },
    goalDays: 21,
  },
  {
    id: 'fy-3',
    title: { en: '$10k weeks on autopilot', pt: 'Semanas de 10 mil no automático' },
    category: 'Wealth',
    accent: 0,
    tagline: {
      en: 'Watching the deposit land while you were still asleep',
      pt: 'O depósito caindo enquanto você ainda dormia',
    },
    intention: {
      en: 'Money that arrives while I rest.',
      pt: 'Dinheiro que chega enquanto eu descanso.',
    },
    affirmation: {
      en: 'Money flows to me from expected and unexpected sources. My income multiplies while I rest.',
      pt: 'O dinheiro chega até mim por caminhos esperados e inesperados. Minha renda se multiplica enquanto eu descanso.',
    },
    story: {
      en: 'You wake up slowly. No alarm. The phone lights up on the nightstand: a deposit notification, then a second one from a client you never had to chase. You do the math without flinching — that is the week covered before Tuesday. Abundance is not a surprise anymore. It is your baseline.',
      pt: 'Você acorda devagar. Sem despertador. O celular acende na mesa de cabeceira: aviso de depósito e, logo depois, outro — de um cliente que você nunca precisou correr atrás. Você faz a conta sem se assustar: a semana inteira já está paga e nem chegou terça-feira. Abundância deixou de ser surpresa. Virou o seu normal.',
    },
    goalDays: 30,
  },
  {
    id: 'fy-4',
    title: { en: 'Euro summer, no budget stress', pt: 'Verão na Europa, sem olhar o saldo' },
    category: 'Wealth',
    accent: 2,
    tagline: {
      en: 'Getting paid while you were on vacation in Mykonos',
      pt: 'Recebendo enquanto você estava de férias em Mykonos',
    },
    intention: {
      en: 'Freedom to move through the world without checking the balance.',
      pt: 'Liberdade de circular pelo mundo sem conferir o extrato.',
    },
    affirmation: {
      en: 'I live a spacious, well-funded life. I go where I want, when I want, and it always works out.',
      pt: 'Minha vida é larga e bem financiada. Vou aonde eu quero, na hora que eu quero, e sempre dá certo.',
    },
    story: {
      en: 'Salt in your hair, white walls, a blue that does not look real. Your phone buzzes on the towel beside you — an invoice paid, in full, early. You put it face down and go back into the water. The trip paid for itself, exactly like you said it would.',
      pt: 'Sal no cabelo, paredes brancas, um azul que nem parece real. O celular vibra na toalha ao seu lado: nota paga, valor cheio, antes do prazo. Você vira a tela para baixo e volta para a água. A viagem se pagou sozinha, exatamente como você disse que ia acontecer.',
    },
    goalDays: 30,
  },
  {
    id: 'fy-5',
    title: { en: 'Body that feels like home', pt: 'Um corpo que é lar' },
    category: 'Health',
    accent: 4,
    tagline: {
      en: 'Catching your reflection and genuinely smiling',
      pt: 'Se ver no espelho e sorrir de verdade',
    },
    intention: {
      en: 'Strength, energy and peace with the mirror.',
      pt: 'Força, energia e paz com o espelho.',
    },
    affirmation: {
      en: 'My body is strong, healthy and healing. I treat it with love and it answers me with energy.',
      pt: 'Meu corpo é forte, saudável e está se curando. Cuido dele com carinho e ele me responde com energia.',
    },
    story: {
      en: 'Morning light, bare feet on cool floors. You stretch and something that used to ache simply does not. You catch your reflection on the way past and — without deciding to — you smile. Not because of a number. Because you feel like yourself again.',
      pt: 'Luz da manhã, pés descalços no chão frio. Você se espreguiça e aquilo que sempre doía simplesmente não dói. Passa pelo espelho, se vê de relance e — sem decidir nada — sorri. Não por causa de um número na balança. Por se reconhecer de novo.',
    },
    goalDays: 21,
  },
  {
    id: 'fy-6',
    title: { en: 'Quiet, unbothered mind', pt: 'Mente quieta, sem ruído' },
    category: 'Peace',
    accent: 5,
    tagline: {
      en: 'The night you stopped rehearsing conversations in your head',
      pt: 'A noite em que você parou de ensaiar conversas na cabeça',
    },
    intention: {
      en: 'A nervous system that trusts life.',
      pt: 'Um sistema nervoso que confia na vida.',
    },
    affirmation: {
      en: 'I am calm, grounded and protected. What is meant for me cannot pass me by.',
      pt: 'Tenho calma, tenho chão e tenho proteção. O que é meu não passa longe de mim.',
    },
    story: {
      en: 'It is late and the house is quiet. You notice something missing: the loop. The rehearsing, the what-ifs, the imaginary arguments. Your shoulders are down. Your breath is low and slow. You are not waiting for something to go wrong. You are just here, and here is enough.',
      pt: 'É tarde e a casa está em silêncio. Você percebe que falta alguma coisa: o loop. O ensaio das conversas, os "e se", as brigas imaginárias. Seus ombros estão baixos. Sua respiração, funda e lenta. Você não está esperando algo dar errado. Você está só aqui — e aqui basta.',
    },
    goalDays: 14,
  },
  {
    id: 'fy-7',
    title: { en: 'Him, completely obsessed', pt: 'Ele, completamente encantado' },
    category: 'Love',
    accent: 1,
    tagline: {
      en: 'The double text he sent before you even answered the first',
      pt: 'A segunda mensagem que ele mandou antes de você responder a primeira',
    },
    intention: {
      en: 'Being chosen loudly, consistently, without games.',
      pt: 'Amor declarado em voz alta, todo dia, sem joguinho.',
    },
    affirmation: {
      en: 'I am unforgettable. The right person thinks about me, chooses me and shows up for me every day.',
      pt: 'Sou inesquecível. A pessoa certa pensa em mim, me escolhe e aparece por mim todos os dias.',
    },
    story: {
      en: 'Your phone buzzes twice before you have even opened the first message. He is not playing it cool anymore — dinner booked, playlist named after the night you met. You did not shrink, you did not chase. You became the standard, and he rose to meet it.',
      pt: 'O celular vibra duas vezes antes de você abrir a primeira mensagem. Ele parou de fingir indiferença: jantar reservado, playlist com o nome da noite em que vocês se conheceram. Você não se diminuiu, não correu atrás. Você virou o padrão — e ele subiu até ali.',
    },
    goalDays: 21,
  },
  {
    id: 'fy-8',
    title: { en: 'Dream job, real offer', pt: 'Emprego dos sonhos, proposta real' },
    category: 'Career',
    accent: 3,
    tagline: {
      en: 'The call that changed the whole year in four minutes',
      pt: 'A ligação que mudou o ano inteiro em quatro minutos',
    },
    intention: {
      en: 'Work that recognizes me before I have to ask.',
      pt: 'Um trabalho que me reconhece antes de eu precisar pedir.',
    },
    affirmation: {
      en: 'Doors open for me. The right rooms want me in them, and the offer always exceeds the ask.',
      pt: 'As portas se abrem para mim. Os lugares certos me querem por perto, e a proposta sempre vem acima do que eu pedi.',
    },
    story: {
      en: 'You see the recruiter’s name light up the screen and your heartbeat stays even. The number they say first is higher than the one you practised asking for. You thank them, hang up, and stand in the kitchen grinning at absolutely nothing. Four minutes. Whole new year.',
      pt: 'O nome da recrutadora acende na tela e o seu coração nem acelera. O número que ela fala primeiro é maior do que aquele que você treinou pedir. Você agradece, desliga e fica de pé na cozinha, sorrindo para absolutamente nada. Quatro minutos. Um ano inteiro novo.',
    },
    goalDays: 30,
  },
  {
    id: 'fy-9',
    title: { en: 'Unshakeable in every room', pt: 'Inabalável em qualquer sala' },
    category: 'Confidence',
    accent: 2,
    tagline: {
      en: 'Saying no once, softly, and not explaining it twice',
      pt: 'Dizer não uma vez, com calma, e não explicar duas',
    },
    intention: {
      en: 'A self-respect that does not negotiate.',
      pt: 'Um respeito próprio que não entra em negociação.',
    },
    affirmation: {
      en: 'My voice is calm and my boundaries are clean. I do not perform confidence — I rest in it.',
      pt: 'Minha voz é calma e meus limites são claros. Não enceno confiança — eu descanso nela.',
    },
    story: {
      en: 'Someone pushes, the old you would have folded with a smile. The new you says no — once, softly, final. The silence after does not scare you; you let it sit. Later you realise you never once rehearsed the conversation. That is what safe inside yourself feels like.',
      pt: 'Alguém insiste. Quem você era antes teria cedido com um sorriso. Quem você é agora diz não — uma vez, com calma, ponto final. O silêncio que vem depois não te assusta; você deixa ele existir. Mais tarde percebe que não ensaiou aquela conversa nenhuma vez. É essa a sensação de ter segurança dentro de si.',
    },
    goalDays: 21,
  },
  {
    id: 'fy-10',
    title: { en: 'Camera-ready self love', pt: 'Amor próprio sem filtro' },
    category: 'Confidence',
    accent: 2,
    tagline: {
      en: 'Posting the photo without zooming in first',
      pt: 'Postar a foto sem dar zoom antes',
    },
    intention: {
      en: 'Looking at myself with kind eyes, in every light.',
      pt: 'Me olhar com olhos gentis, em qualquer luz.',
    },
    affirmation: {
      en: 'I speak to myself like someone I love. My reflection is a friend, not a judge.',
      pt: 'Falo comigo como falo com quem eu amo. Meu reflexo é companhia, não é tribunal.',
    },
    story: {
      en: 'Golden hour, someone snaps a photo of you laughing before you can pose. You look at it once and post it — no zoom, no filter debate, no asking the group chat. The caption comes easy. Somewhere along the way the war with the mirror just quietly ended.',
      pt: 'Fim de tarde dourado, alguém te fotografa rindo antes que você tenha tempo de posar. Você olha uma vez e posta — sem zoom, sem debate de filtro, sem mandar no grupo pedindo opinião. A legenda sai fácil. Em algum ponto do caminho, a guerra com o espelho terminou sem fazer barulho.',
    },
    goalDays: 14,
  },
  {
    id: 'fy-11',
    title: { en: 'Mornings that heal me', pt: 'Manhãs que me curam' },
    category: 'Health',
    accent: 4,
    tagline: {
      en: 'Waking up before the alarm, actually rested',
      pt: 'Acordar antes do despertador, com descanso de verdade',
    },
    intention: {
      en: 'Energy that starts full and stays steady.',
      pt: 'Energia que começa cheia e se mantém firme.',
    },
    affirmation: {
      en: 'Rest repairs me. Every morning my body wakes lighter, clearer and stronger than the day before.',
      pt: 'O descanso me reconstrói. Toda manhã meu corpo acorda mais leve, mais claro e mais forte que na véspera.',
    },
    story: {
      en: 'Your eyes open two minutes before the alarm and there is no dread, just daylight. Water first, window open, the stretch that used to click now flows. By the time the coffee is ready you have already moved your body and it thanked you for it. You are not dragging through your life anymore — you are meeting it.',
      pt: 'Seus olhos abrem dois minutos antes do despertador e não tem peso nenhum, só a luz do dia. Água primeiro, janela aberta, e aquele alongamento que estalava agora desliza. Quando o café fica pronto, você já mexeu o corpo — e ele agradeceu. Você não está mais se arrastando pela sua vida. Você está indo ao encontro dela.',
    },
    goalDays: 21,
  },
  {
    id: 'fy-12',
    title: { en: 'Slow life, full heart', pt: 'Vida devagar, peito cheio' },
    category: 'Peace',
    accent: 5,
    tagline: {
      en: 'Phone face down, tulips on the counter, nowhere to be',
      pt: 'Celular virado, tulipas na bancada, nenhum compromisso',
    },
    intention: {
      en: 'A life that does not need escaping from.',
      pt: 'Uma vida da qual eu não preciso fugir.',
    },
    affirmation: {
      en: 'I am allowed to live slowly. Peace is not a pause in my life — peace is the life.',
      pt: 'Tenho permissão para viver devagar. A paz não é uma pausa na minha vida — a paz é a vida.',
    },
    story: {
      en: 'Sunday, late morning. Bread warming, tulips leaning toward the window, your phone face down and forgotten. Nobody needs you for a few hours and the thought lands soft, not lonely. You built a life you do not need a vacation from — this is what it feels like from the inside.',
      pt: 'Domingo, fim da manhã. Pão esquentando, tulipas se inclinando para a janela, o celular virado e esquecido. Ninguém precisa de você nas próximas horas, e esse pensamento chega macio, não solitário. Você construiu uma vida da qual não precisa tirar férias — é assim que ela se sente por dentro.',
    },
    goalDays: 14,
  },
];

// Parâmetros de rota não são conteúdo confiável. Uma sugestão só existe quando
// o identificador escalar recebido corresponde exatamente a um item do catálogo.
export const findForYouById = (id) =>
  typeof id === 'string' ? FOR_YOU.find((item) => item.id === id) || null : null;

export const VISIONS = [
  {
    id: 'v-1',
    title: { en: 'The text you were waiting for', pt: 'A mensagem que você esperava' },
    category: 'Love',
    accent: 1,
    duration: 171,
    caption: {
      en: 'Waking up to the text I’d been waiting months for',
      pt: 'Acordar com a mensagem que eu esperava havia meses',
    },
    script: {
      en: 'Feel the phone buzz face-down on the sheets. You do not lunge for it — you already know. Your name in his mouth, an apology with no excuses in it, and a question about tonight. Notice how steady your hands are. You were never chasing. You were waiting to be met.',
      pt: 'Sinta o celular vibrar virado sobre o lençol. Você não se joga em cima dele — você já sabe. Seu nome na boca dele, um pedido de desculpas sem nenhuma desculpa dentro, e uma pergunta sobre hoje à noite. Repare como suas mãos estão firmes. Você nunca correu atrás. Você só estava esperando alguém chegar na sua altura.',
    },
  },
  {
    id: 'v-2',
    title: { en: 'Paid while you were away', pt: 'Pagamento enquanto você viajava' },
    category: 'Wealth',
    accent: 0,
    duration: 194,
    caption: {
      en: 'Getting paid while I was on vacation in Mykonos',
      pt: 'Receber enquanto eu estava de férias em Mykonos',
    },
    script: {
      en: 'The sun is on your shoulders and the water is impossibly blue. Your phone lights up with a number that would have made you gasp a year ago. Today you simply nod. Money finds you wherever you are, whether you are working or floating.',
      pt: 'O sol está nos seus ombros e a água é de um azul impossível. O celular acende com um número que, um ano atrás, teria te feito prender a respiração. Hoje você só balança a cabeça, com calma. O dinheiro te encontra onde você estiver — trabalhando ou boiando.',
    },
  },
  {
    id: 'v-3',
    title: { en: 'Signing for the keys', pt: 'Assinando pelas chaves' },
    category: 'Career',
    accent: 3,
    duration: 208,
    caption: {
      en: 'The morning I signed for the place I always pictured',
      pt: 'A manhã em que eu assinei pelo lugar que sempre imaginei',
    },
    script: {
      en: 'Sunlight across an empty floor. The agent hands you the pen and you sign your full name, slowly. The keys are heavier than you expected. You walk to the window of the room that will be your office and say it out loud: this is mine, and I am not surprised.',
      pt: 'O sol atravessando um piso vazio. O corretor te entrega a caneta e você assina seu nome completo, devagar. As chaves pesam mais do que você imaginava. Você caminha até a janela do cômodo que vai virar seu escritório e fala em voz alta: isso aqui é meu — e não me surpreende nem um pouco.',
    },
  },
  {
    id: 'v-4',
    title: { en: 'The tulip morning', pt: 'A manhã das tulipas' },
    category: 'Peace',
    accent: 5,
    duration: 156,
    caption: {
      en: 'Tulips on the counter and nowhere to be',
      pt: 'Tulipas na bancada e nenhum compromisso',
    },
    script: {
      en: 'You bought yourself flowers on a Tuesday because you could. Steam off the mug, tulips leaning toward the window, no alarm set for tomorrow. Your life is slow now on purpose. This softness is not a reward for finishing — it is how you live.',
      pt: 'Você se deu flores numa terça-feira, só porque podia. O vapor subindo da xícara, as tulipas inclinadas para a janela, nenhum despertador marcado para amanhã. Sua vida é devagar agora, de propósito. Essa suavidade não é prêmio por ter terminado alguma coisa — é o jeito como você vive.',
    },
  },
  {
    id: 'v-5',
    title: { en: 'Strong on the last mile', pt: 'Forte no último quilômetro' },
    category: 'Health',
    accent: 4,
    duration: 182,
    caption: {
      en: 'Finishing the run with more left in me',
      pt: 'Terminar a corrida com energia sobrando',
    },
    script: {
      en: 'Cold air in your lungs, the sky going pink over the water. Your legs answer every time you ask. The last mile is the strongest one. You finish and you are not wrecked — you are lit up, laughing at how easy your body made it.',
      pt: 'Ar frio nos pulmões, o céu ficando rosa sobre a água. Suas pernas respondem toda vez que você pede. O último quilômetro é o mais forte de todos. Você termina e não sobra cansaço — sobra brilho, e um riso de como o seu corpo fez isso parecer fácil.',
    },
  },
  {
    id: 'v-6',
    title: { en: 'Walking in like you own it', pt: 'Entrar como se o lugar fosse seu' },
    category: 'Confidence',
    accent: 2,
    duration: 165,
    caption: {
      en: 'Walking into the room without shrinking',
      pt: 'Entrar na sala sem me encolher',
    },
    script: {
      en: 'The doors open and the room turns. You do not rush, you do not apologise for the space you take. Your voice comes out lower and slower than you planned and people lean in. You have stopped auditioning for a life that is already yours.',
      pt: 'As portas se abrem e a sala inteira se vira. Você não acelera o passo, não pede desculpa pelo espaço que ocupa. Sua voz sai mais grave e mais devagar do que você tinha planejado, e as pessoas se inclinam para ouvir. Você parou de fazer teste para uma vida que já é sua.',
    },
  },
];

export const AFFIRMATIONS = [
  {
    id: 'a-1',
    category: 'Wealth',
    text: {
      en: 'I deserve every bit of luxury and success I am building for my future self.',
      pt: 'Mereço cada pedaço de luxo e de sucesso que estou construindo para quem eu vou ser.',
    },
  },
  {
    id: 'a-2',
    category: 'Wealth',
    text: {
      en: 'Money is drawn to me easily, repeatedly, and in amounts that surprise me.',
      pt: 'O dinheiro vem até mim com facilidade, de novo e de novo, em valores que me surpreendem.',
    },
  },
  {
    id: 'a-3',
    category: 'Love',
    text: {
      en: 'I am effortlessly magnetic to a love that is warm, loyal and unhurried.',
      pt: 'Atraio sem esforço um amor caloroso, leal e sem pressa.',
    },
  },
  {
    id: 'a-4',
    category: 'Love',
    text: {
      en: 'I no longer chase. What is meant for me moves toward me.',
      pt: 'Não corro mais atrás. O que é meu vem na minha direção.',
    },
  },
  {
    id: 'a-5',
    category: 'Career',
    text: {
      en: 'My work speaks for me in rooms I have never entered.',
      pt: 'Meu trabalho fala por mim em salas onde eu nunca entrei.',
    },
  },
  {
    id: 'a-6',
    category: 'Career',
    text: {
      en: 'Opportunities find me because I am ready, not because I am lucky.',
      pt: 'As oportunidades me encontram porque eu me preparei, não por sorte.',
    },
  },
  {
    id: 'a-7',
    category: 'Health',
    text: {
      en: 'My body is healing, strong, and generous with its energy.',
      pt: 'Meu corpo está se curando, está forte e é generoso com a minha energia.',
    },
  },
  {
    id: 'a-8',
    category: 'Health',
    text: {
      en: 'I take care of myself the way I would take care of someone I adore.',
      pt: 'Cuido de mim do jeito que eu cuidaria de alguém que eu amo demais.',
    },
  },
  {
    id: 'a-9',
    category: 'Confidence',
    text: {
      en: 'I take up space without apologising for it.',
      pt: 'Ocupo o meu espaço sem pedir desculpa por isso.',
    },
  },
  {
    id: 'a-10',
    category: 'Confidence',
    text: {
      en: 'I speak slowly, I think clearly, and I trust my own decisions.',
      pt: 'Falo devagar, penso com clareza e confio nas minhas próprias decisões.',
    },
  },
  {
    id: 'a-11',
    category: 'Peace',
    text: {
      en: 'I release what I cannot control and my body softens instantly.',
      pt: 'Solto o que não está no meu controle e meu corpo relaxa na hora.',
    },
  },
  {
    id: 'a-12',
    category: 'Peace',
    text: {
      en: 'My nervous system is safe. Nothing is chasing me.',
      pt: 'Meu sistema nervoso está em paz. Nada está me perseguindo.',
    },
  },
];

// Campos de texto que o usuário lê. Chaves técnicas (id, category, accent,
// icon, duration, goalDays) ficam de fora de propósito.
const TEXT_FIELDS = ['title', 'tagline', 'intention', 'affirmation', 'story', 'caption', 'script', 'text', 'label'];

// Resolve o conteúdo para o idioma atual, para a tela não repetir txt() em todo campo.
//
//   const { lang } = useT();
//   const item = localized(FOR_YOU[0], lang);   // item.title / item.story já são string
//   const chip = localized(TRENDING[0], lang);  // campo solto { en, pt } vira string
//
// Aceita string (devolve como está), campo de tradução solto e objeto de conteúdo.
export function localized(item, lang) {
  if (item == null) return item;
  if (typeof item === 'string') return item;
  if (typeof item.en === 'string' || typeof item.pt === 'string') return txt(item, lang);
  const out = { ...item };
  for (const field of TEXT_FIELDS) {
    if (out[field] != null) out[field] = txt(out[field], lang);
  }
  return out;
}

// Every new user starts with a truly empty account — screens show their EmptyState.
export const initialState = () => ({
  name: '',
  onboardingDone: false,
  manifestations: [],
  favoriteAffirmations: [],
  savedVisions: [],
  visionPlays: [],
  affirmationDates: [],
  morningRitual: {
    alarmStatus: 'native_integration_required',
    reminderEnabled: false,
    alarmSyncError: false,
    reminderTime: '07:00',
    wakeAffirmationId: null,
    wakeAffirmationText: '',
    wakeAffirmationLang: 'pt',
    entries: [],
  },
});
