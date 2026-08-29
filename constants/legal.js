// Textos locais da versao atual. Eles descrevem apenas o que o produto faz
// hoje; conta, assinatura e comunidade devem ganhar termos proprios antes de
// serem ativados.
export const LEGAL_UPDATED = {
  en: 'Updated August 28, 2026',
  pt: 'Atualizado em 28 de agosto de 2026',
};

export const PRIVACY_SECTIONS = [
  {
    title: { en: 'In short', pt: 'Em resumo' },
    paragraphs: [
      {
        en: 'Celeste stores your practice on this device. There is no personal sign-in or active subscription in this version. When cloud personalization is enabled, Celeste creates an anonymous technical session used only to authorize requests and enforce generation limits.',
        pt: 'O Celeste guarda sua prática neste aparelho. Não há login pessoal nem assinatura ativa nesta versão. Quando a personalização em nuvem é ativada, o Celeste cria uma sessão técnica anônima usada somente para autorizar pedidos e aplicar limites de geração.',
      },
      {
        en: 'Your onboarding answers personalize the experience. Only after explicit adult permission, selected data may go through Celeste\'s backend to Anthropic for personalized scene text, OpenAI only as scene-text failover, Google Gemini for translations, images and dream interpretations, and ElevenLabs for text-to-speech. Profiles marked Under 18 always use the on-device options.',
        pt: 'Suas respostas do questionário personalizam a experiência. Somente após permissão adulta expressa, dados selecionados podem passar pelo backend do Celeste para a Anthropic gerar textos de cenas personalizadas, para a OpenAI apenas como alternativa do texto da cena em caso de falha, para o Google Gemini fazer traduções, imagens e interpretações de sonhos, e para a ElevenLabs fazer texto para fala. Perfis marcados como Menos de 18 sempre usam as opções no aparelho.',
      },
    ],
  },
  {
    title: { en: 'Data stored on your device', pt: 'Dados guardados no seu aparelho' },
    bullets: [
      {
        en: 'Your name, language, visual preference and onboarding answers.',
        pt: 'Seu nome, idioma, preferência visual e respostas do questionário.',
      },
      {
        en: 'Manifestations, personal scenes and earlier chapters, affirmations, private traces and completed daily bridges.',
        pt: 'Manifestações, cenas pessoais e capítulos anteriores, afirmações, rastros privados e pontes diárias concluídas.',
      },
      {
        en: 'Favorites and practice history used to calculate your journey and streak.',
        pt: 'Favoritos e histórico de práticas usados para calcular sua jornada e sequência.',
      },
      {
        en: 'Your chosen alarm time and affirmation, plus any dream notes and locally generated affirmations you decide to save.',
        pt: 'O horário e a afirmação escolhidos para o despertador, além dos sonhos e afirmações geradas localmente que você decidir guardar.',
      },
    ],
  },
  {
    title: { en: 'Cloud personalization and processors', pt: 'Personalização e processadores em nuvem' },
    paragraphs: [
      {
        en: 'Celeste stores separate permissions for personal scenes, dream reflection and neural narration. Enabling voice alone never authorizes a dream upload. With the corresponding adult permission, personalized scene text is sent to Anthropic; OpenAI may receive the same minimized scene request only when failover is needed. Google Gemini receives only the content needed for a translation, personal image or dream interpretation. ElevenLabs receives only the selected text, language and narrator needed for text-to-speech. Saved content does not change when you turn a permission off.',
        pt: 'O Celeste guarda permissões separadas para cenas pessoais, reflexão de sonhos e narração neural. Ativar apenas a voz nunca autoriza o envio de um sonho. Com a permissão adulta correspondente, o texto da cena personalizada é enviado à Anthropic; a OpenAI pode receber a mesma solicitação reduzida da cena somente quando a alternativa em caso de falha for necessária. O Google Gemini recebe apenas o conteúdo necessário para uma tradução, imagem pessoal ou interpretação de sonho. A ElevenLabs recebe apenas o texto selecionado, o idioma e o narrador necessários para texto para fala. O conteúdo já salvo não muda quando você desativa uma permissão.',
      },
      {
        en: 'Age range, gender and sexuality are not sent for scene generation. Names entered in the dedicated fields for children, important people or a specific person also stay on this device. Celeste removes those known names if they reappear in a selected free-text answer; still, avoid entering another person\'s name in free text. If the required processor is unavailable or consent is incomplete, Celeste keeps or creates the local version instead of sending the request elsewhere.',
        pt: 'Faixa etária, gênero e sexualidade não são enviados para gerar cenas. Nomes cadastrados nos campos de filhos, pessoas importantes ou de uma pessoa específica também ficam neste aparelho. O Celeste remove esses nomes conhecidos caso reapareçam numa resposta livre selecionada; ainda assim, evite escrever o nome de outra pessoa em textos livres. Se o processador necessário estiver indisponível ou o consentimento estiver incompleto, o Celeste mantém ou cria a versão local em vez de enviar a solicitação a outro lugar.',
      },
      {
        en: 'When you request a new Living Mirror chapter, Celeste sends the prior generated scene and structured progress counts to Anthropic for the chapter text; OpenAI may receive that same minimized request only as failover. Private trace text and full dream reports are never included. A dream contributes only its selected theme and waking feeling after you turn on that choice for the individual dream.',
        pt: 'Quando você pede um novo capítulo do Espelho Vivo, o Celeste envia à Anthropic a cena anterior já gerada e contagens estruturadas do progresso para criar o texto do capítulo; a OpenAI pode receber essa mesma solicitação reduzida somente como alternativa em caso de falha. O texto dos Rastros privados e o relato completo dos sonhos nunca são incluídos. Um sonho contribui somente com o tema escolhido e como você acordou depois que você ativa essa opção naquele sonho.',
      },
    ],
  },
  {
    title: { en: 'Voice and media', pt: 'Voz e mídia' },
    paragraphs: [
      {
        en: 'With explicit adult consent, pressing Play sends the selected personal text, language and narrator choice through Celeste\'s backend to ElevenLabs text-to-speech. ElevenLabs returns audio for that request; Celeste does not publish it or use it as a shared voice catalog. Personal audio may be cached privately on that device so replaying it does not require another paid generation; items unused for 30 days are removed periodically, and resetting the journey clears the cache. Narrator previews are fixed samples bundled with the app, contain no questionnaire answers and do not make a cloud request when played.',
        pt: 'Com consentimento adulto explícito, tocar em Reproduzir envia pelo backend do Celeste à ElevenLabs de texto para fala o texto pessoal selecionado, o idioma e a voz escolhida. A ElevenLabs devolve o áudio daquela solicitação; o Celeste não o publica nem o usa como catálogo compartilhado. O áudio pessoal pode ficar em cache privado naquele aparelho para que uma nova reprodução não exija outra geração paga; itens sem uso por 30 dias são removidos periodicamente, e recomeçar a jornada limpa o cache. As prévias dos narradores são amostras fixas incluídas no app, não contêm respostas do questionário e não fazem uma solicitação à nuvem quando são reproduzidas.',
      },
      {
        en: 'If you dictate a dream, speech recognition is provided by your browser or operating system and may be processed under that provider\'s rules. Celeste receives only the transcript, never uploads the recording itself, and sends the transcript to Gemini only when you request cloud reflection with consent; otherwise it uses the local fallback.',
        pt: 'Se você ditar um sonho, o reconhecimento de voz é fornecido pelo navegador ou sistema operacional e pode ser processado conforme as regras desse fornecedor. O Celeste recebe apenas a transcrição, nunca envia a gravação por conta própria e só envia o texto ao Gemini quando você pedir a reflexão em nuvem com consentimento; caso contrário, usa a alternativa local.',
      },
      {
        en: 'In a compatible installed iPhone or Android app, Celeste may request Alarm and Notification access and create a private on-device audio file so the selected affirmation can be the alarm sound. The website cannot schedule this system alarm.',
        pt: 'No app instalado em um iPhone ou Android compatível, o Celeste pode pedir acesso aos Alarmes e às Notificações e criar um áudio privado no aparelho para usar a afirmação escolhida como som do despertador. O site não consegue agendar esse alarme do sistema.',
      },
      {
        en: 'If you enable the daily ritual reminder in the installed app, Celeste asks for notification permission and schedules it on that device. The lock-screen text is deliberately generic and never includes your desire, dream or affirmation. The website cannot schedule this system reminder.',
        pt: 'Se você ativar o lembrete do ritual diário no app instalado, o Celeste pede permissão para notificações e o agenda naquele aparelho. O texto na tela bloqueada é propositalmente genérico e nunca inclui seu desejo, sonho ou afirmação. O site não consegue agendar esse lembrete do sistema.',
      },
    ],
  },
  {
    title: { en: 'Your controls', pt: 'Seus controles' },
    bullets: [
      {
        en: 'Turn cloud processing off at any time in your profile. Turning it off also clears the saved adult confirmation for new cloud generation.',
        pt: 'Desative o processamento em nuvem a qualquer momento no seu perfil. Ao desligar, a confirmação adulta salva para novas gerações em nuvem também é removida.',
      },
      {
        en: 'Edit or delete private traces and manifestations from the app.',
        pt: 'Edite ou exclua rastros privados e manifestações dentro do app.',
      },
      {
        en: 'Delete an individual dream and its generated affirmation from the Dreams area, or use Reset my journey to remove all locally saved entries.',
        pt: 'Apague um sonho e sua afirmação gerada na área Sonhos, ou use Recomeçar minha jornada para remover todos os registros salvos localmente.',
      },
      {
        en: 'Use Reset my journey to remove the saved practice and redo onboarding. Clearing this site or app data from the device also removes the local copy.',
        pt: 'Use Recomeçar minha jornada para apagar a prática salva e refazer o questionário. Limpar os dados deste site ou app no aparelho também remove a cópia local.',
      },
    ],
  },
  {
    title: { en: 'Future services', pt: 'Serviços futuros' },
    paragraphs: [
      {
        en: 'Accounts and payments are not active in this release. Community publication requires its own explicit consent and moderation. Before any materially different data use is enabled, Celeste must explain what is collected, why it is needed, who receives it and how it can be deleted.',
        pt: 'Contas e pagamentos não estão ativos nesta versão. A publicação na comunidade exige consentimento próprio e moderação. Antes de qualquer uso de dados materialmente diferente ser habilitado, o Celeste deverá explicar o que é coletado, por que é necessário, quem recebe e como apagar.',
      },
      {
        en: 'A community story created without an authenticated account and configured community service remains a private draft on this device; it is not a public testimonial.',
        pt: 'Um relato de comunidade criado sem conta autenticada e serviço de comunidade configurado continua como rascunho privado neste aparelho; ele não é um depoimento público.',
      },
    ],
  },
];

export const TERMS_SECTIONS = [
  {
    title: { en: 'Using Celeste', pt: 'Uso do Celeste' },
    paragraphs: [
      {
        en: 'Celeste is a tool for personal reflection, visualization and building a consistent practice. By using this version, you agree to use it lawfully and without harming other people.',
        pt: 'O Celeste é uma ferramenta de reflexão pessoal, visualização e construção de uma prática consistente. Ao usar esta versão, você concorda em utilizá-la de forma legal e sem prejudicar outras pessoas.',
      },
    ],
  },
  {
    title: { en: 'No guaranteed outcome', pt: 'Sem promessa de resultado' },
    paragraphs: [
      {
        en: 'Affirmations, stories and suggested actions do not guarantee money, relationships, health, contact from another person or any result within a deadline. Your choices and actions remain your responsibility.',
        pt: 'Afirmações, histórias e ações sugeridas não garantem dinheiro, relacionamentos, saúde, contato de outra pessoa nem qualquer resultado dentro de um prazo. Suas escolhas e ações continuam sendo sua responsabilidade.',
      },
    ],
  },
  {
    title: { en: 'Well-being notice', pt: 'Aviso de bem-estar' },
    paragraphs: [
      {
        en: 'Celeste does not provide medical, psychological, legal or financial advice and is not a substitute for qualified professional support. Seek appropriate help when a situation involves health, safety, crisis or important financial and legal decisions.',
        pt: 'O Celeste não oferece aconselhamento médico, psicológico, jurídico ou financeiro e não substitui apoio profissional qualificado. Procure ajuda adequada quando uma situação envolver saúde, segurança, crise ou decisões financeiras e jurídicas importantes.',
      },
    ],
  },
  {
    title: { en: 'Your content', pt: 'Seu conteúdo' },
    paragraphs: [
      {
        en: 'You remain responsible for the information you enter. Do not include passwords, financial credentials, document numbers, another person\'s name in free-text answers, or information you are not comfortable keeping on this device or, when enabled, sending to the cloud processor identified for that feature.',
        pt: 'Você continua responsável pelas informações que insere. Não inclua senhas, credenciais financeiras, números de documentos, o nome de outra pessoa em respostas livres nem informações que não queira manter neste aparelho ou, quando ativado, enviar ao processador em nuvem identificado para aquele recurso.',
      },
      {
        en: 'Community drafts are private by default. Sending a story requires explicit publication consent, and it can become visible to other people only after moderation. Without an authenticated account and configured community service, it remains only on this device.',
        pt: 'Rascunhos da comunidade são privados por padrão. Enviar um relato exige autorização expressa de publicação, e ele só pode ficar visível para outras pessoas depois da moderação. Sem conta autenticada e serviço de comunidade configurado, ele permanece apenas neste aparelho.',
      },
    ],
  },
  {
    title: { en: 'Third-party services', pt: 'Serviços de terceiros' },
    paragraphs: [
      {
        en: 'Optional cloud features depend on Anthropic and OpenAI for personalized scene text, Google Gemini for translations, images and dream interpretations, and ElevenLabs for text-to-speech, as well as each provider\'s applicable terms and availability. OpenAI is the scene-text failover, not an additional routine call. Celeste may use the local version when a service fails or a response cannot be used safely.',
        pt: 'Os recursos opcionais em nuvem dependem da Anthropic e da OpenAI para textos de cenas personalizadas, do Google Gemini para traduções, imagens e interpretações de sonhos, e da ElevenLabs para texto para fala, além dos termos aplicáveis e da disponibilidade de cada fornecedor. A OpenAI é a alternativa do texto da cena em caso de falha, não uma chamada adicional de rotina. O Celeste pode usar a versão local quando um serviço falhar ou uma resposta não puder ser usada com segurança.',
      },
    ],
  },
  {
    title: { en: 'Current access and payments', pt: 'Acesso atual e pagamentos' },
    paragraphs: [
      {
        en: 'This version does not create a paid subscription. Before any purchase is offered, Celeste must show the exact price, billing period, renewal conditions and cancellation path.',
        pt: 'Esta versão não cria uma assinatura paga. Antes de qualquer compra ser oferecida, o Celeste deverá mostrar o preço exato, o período de cobrança, as condições de renovação e o caminho de cancelamento.',
      },
    ],
  },
  {
    title: { en: 'Availability and changes', pt: 'Disponibilidade e mudanças' },
    paragraphs: [
      {
        en: 'Features may change while Celeste is being developed, and uninterrupted availability cannot be guaranteed. Material changes to data use, payments or community features must be presented before they take effect.',
        pt: 'Os recursos podem mudar enquanto o Celeste está em desenvolvimento, e não é possível garantir disponibilidade sem interrupções. Mudanças relevantes no uso de dados, pagamentos ou comunidade deverão ser apresentadas antes de entrarem em vigor.',
      },
    ],
  },
];
