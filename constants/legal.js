// Textos locais da versao atual. Eles descrevem apenas o que o produto faz
// hoje; conta, assinatura e comunidade devem ganhar termos proprios antes de
// serem ativados.
export const SUPPORT_EMAIL = 'suporte@celestegroup.biz';

export const LEGAL_UPDATED = {
  en: 'Updated September 4, 2026',
  pt: 'Atualizado em 4 de setembro de 2026',
};

export const PRIVACY_SECTIONS = [
  {
    title: { en: 'In short', pt: 'Em resumo' },
    paragraphs: [
      {
        en: 'Celeste stores your practice on this device. There is no personal sign-in or active subscription in this version. Optional cloud requests and AI-content reports use a pseudonymous technical session to authorize requests, enforce limits and prevent abuse; this is not a personal account.',
        pt: 'O Celeste guarda sua prática neste aparelho. Não há login pessoal nem assinatura ativa nesta versão. Solicitações opcionais em nuvem e denúncias de conteúdo de IA usam uma sessão técnica pseudônima para autorizar pedidos, aplicar limites e prevenir abuso; ela não é uma conta pessoal.',
      },
      {
        en: 'Your onboarding answers personalize the experience. Onboarding creates the first practice on the device and leaves cloud processing off. After onboarding, a single adult cloud control covers optional requests through Celeste\'s backend. Anthropic normally generates personalized scene text and OpenAI is its failover; if neither text provider is configured and approved Gemini processing is available, Google Gemini may generate the scene. Gemini also handles translations, images and dream interpretations, while ElevenLabs handles text-to-speech. Profiles marked Under 18 always use the on-device options.',
        pt: 'Suas respostas do questionário personalizam a experiência. O questionário cria a primeira prática no aparelho e deixa o processamento em nuvem desligado. Depois do questionário, um único controle adulto de nuvem abrange solicitações opcionais pelo backend do Celeste. A Anthropic normalmente gera textos de cenas personalizadas e a OpenAI é sua alternativa; se nenhum desses provedores de texto estiver configurado e o processamento aprovado do Gemini estiver disponível, o Google Gemini poderá gerar a cena. O Gemini também faz traduções, imagens e interpretações de sonhos, enquanto a ElevenLabs faz texto para fala. Perfis marcados como Menos de 18 sempre usam as opções no aparelho.',
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
        en: 'On a compatible iPhone, the time and sound for your selected alarm content: an affirmation, vision, Anchor Scene, dream phrase or your own phrase. On Android, only ordinary reminder times and days are available in this release. Dream notes and locally generated affirmations you choose to save also stay on the device.',
        pt: 'Em iPhone compatível, o horário e o som do conteúdo escolhido para o despertador: uma afirmação, visão, Cena-Âncora, frase de sonho ou frase própria. No Android, somente horários e dias de lembretes comuns estão disponíveis nesta versão. Sonhos e afirmações geradas localmente que você decidir guardar também ficam no aparelho.',
      },
    ],
  },
  {
    title: { en: 'Cloud personalization and processors', pt: 'Personalização e processadores em nuvem' },
    paragraphs: [
      {
        en: 'Celeste presents one cloud-processing control for personal scenes, dream reflection, images, translations and neural narration. With adult permission, personalized scene text normally goes to Anthropic; OpenAI may receive the same minimized request as failover. If neither text provider is configured and approved Gemini processing is available, Google Gemini may receive that minimized request to generate the scene. Gemini also receives only the content needed for a translation, personal image or dream interpretation. ElevenLabs receives only the selected text, language and narrator needed for text-to-speech. Turning the control off prevents new cloud requests and does not change content already saved.',
        pt: 'O Celeste apresenta um único controle de processamento em nuvem para cenas pessoais, reflexão de sonhos, imagens, traduções e narração neural. Com permissão adulta, o texto da cena personalizada normalmente vai para a Anthropic; a OpenAI pode receber a mesma solicitação reduzida como alternativa. Se nenhum desses provedores de texto estiver configurado e o processamento aprovado do Gemini estiver disponível, o Google Gemini poderá receber essa solicitação reduzida para gerar a cena. O Gemini também recebe somente o conteúdo necessário para tradução, imagem pessoal ou interpretação de sonho. A ElevenLabs recebe apenas o texto selecionado, o idioma e o narrador necessários para texto para fala. Desligar o controle impede novas solicitações em nuvem e não altera o conteúdo já salvo.',
      },
      {
        en: 'Age range, gender and sexuality are not sent for scene generation. Names entered in the dedicated fields for children, important people or a specific person also stay on this device. Celeste removes those known names if they reappear in a selected free-text answer; still, avoid entering another person\'s name in free text. Without current consent, Celeste keeps or creates the on-device version.',
        pt: 'Faixa etária, gênero e sexualidade não são enviados para gerar cenas. Nomes cadastrados nos campos de filhos, pessoas importantes ou de uma pessoa específica também ficam neste aparelho. O Celeste remove esses nomes conhecidos caso reapareçam numa resposta livre selecionada; ainda assim, evite escrever o nome de outra pessoa em textos livres. Sem consentimento atual, o Celeste mantém ou cria a versão no aparelho.',
      },
      {
        en: 'When you request a new Living Mirror chapter, Celeste sends the prior generated scene and structured progress counts through the same disclosed scene-provider path. Private trace text and full dream reports are never included. A dream contributes only its selected theme and waking feeling after you turn on that choice for the individual dream.',
        pt: 'Quando você pede um novo capítulo do Espelho Vivo, o Celeste envia a cena anterior já gerada e contagens estruturadas do progresso pelo mesmo caminho de provedores de cena informado acima. O texto dos Rastros privados e o relato completo dos sonhos nunca são incluídos. Um sonho contribui somente com o tema escolhido e como você acordou depois que você ativa essa opção naquele sonho.',
      },
    ],
  },
  {
    title: { en: 'AI-content reports', pt: 'Denúncias de conteúdo de IA' },
    paragraphs: [
      {
        en: 'Reporting is optional. Celeste sends only the generated output you select, or its visual reference, together with the reason, an optional note, language, minimum generation provenance, platform and app version. The prompt, original onboarding answers and raw dream report are not included. Because generated output can repeat personal details, review the exact preview before sending and do not add personal data to the note.',
        pt: 'A denúncia é opcional. O Celeste envia somente a saída gerada que você selecionar, ou sua referência visual, junto com o motivo, uma nota opcional, idioma, procedência técnica mínima da geração, plataforma e versão do app. O prompt, as respostas originais do questionário e o relato bruto do sonho não são incluídos. Como a saída gerada pode repetir detalhes pessoais, confira a prévia exata antes de enviar e não acrescente dados pessoais à nota.',
      },
      {
        en: `A pseudonymous technical identifier authorizes the report and helps rate-limit, deduplicate and prevent abuse. Submitted report records, including that identifier in the report row, are kept for no more than 180 days. While this installation still has its session, use “Delete submitted AI-content reports” in Profile to remove all report rows linked to the current identifier sooner. If app data is cleared or the app is uninstalled first, that local link may be lost and any remaining rows expire within 180 days. The anonymous technical session itself may remain for abuse prevention and is not a personal account. ${SUPPORT_EMAIL} can help with questions, but cannot promise to locate a lost pseudonymous session.`,
        pt: `Um identificador técnico pseudônimo autoriza a denúncia e ajuda a limitar frequência, evitar duplicidade e prevenir abuso. Os registros enviados, incluindo esse identificador na linha da denúncia, ficam guardados por no máximo 180 dias. Enquanto esta instalação ainda tiver sua sessão, use “Excluir denúncias de conteúdo de IA enviadas” no Perfil para remover antes todas as linhas vinculadas ao identificador atual. Se os dados do app forem limpos ou ele for desinstalado antes, esse vínculo local poderá ser perdido e os registros restantes expirarão em até 180 dias. A sessão técnica anônima em si pode permanecer para prevenção de abuso e não é uma conta pessoal. ${SUPPORT_EMAIL} pode ajudar com dúvidas, mas não garante localizar uma sessão pseudônima perdida.`,
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
        en: 'Only the installed app on a compatible iPhone offers the personal-content system alarm in this release. It may request Alarm access and create a private on-device audio file for the selected affirmation, vision, Anchor Scene, dream phrase or personal phrase. Android does not offer this exact alarm; it offers ordinary notifications only. The website cannot schedule either system alarm or reminder.',
        pt: 'Somente o app instalado em um iPhone compatível oferece o despertador do sistema com conteúdo pessoal nesta versão. Ele pode pedir acesso aos Alarmes e criar um áudio privado no aparelho para a afirmação, visão, Cena-Âncora, frase de sonho ou frase própria escolhida. O Android não oferece esse despertador exato; oferece apenas notificações comuns. O site não agenda alarmes nem lembretes do sistema.',
      },
      {
        en: 'If you enable the daily ritual reminder in the installed app, Celeste asks for notification permission and schedules it on that device. The lock-screen text is deliberately generic and never includes your desire, dream, vision, Anchor Scene or affirmation. The website cannot schedule this system reminder.',
        pt: 'Se você ativar o lembrete do ritual diário no app instalado, o Celeste pede permissão para notificações e o agenda naquele aparelho. O texto na tela bloqueada é propositalmente genérico e nunca inclui seu desejo, sonho, visão, Cena-Âncora ou afirmação. O site não consegue agendar esse lembrete do sistema.',
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
      {
        en: 'Use Delete submitted AI-content reports in Profile to remove the remote report rows linked to your current pseudonymous reporting identifier before the 180-day limit.',
        pt: 'Use Excluir denúncias de conteúdo de IA enviadas no Perfil para remover os registros remotos vinculados ao seu identificador pseudônimo atual antes do limite de 180 dias.',
      },
      {
        en: 'A backup is a readable, unencrypted JSON file containing the local practice and local Community drafts. It excludes submitted AI-content reports, the pseudonymous reporting session, device consents, scheduled notifications and generated image files. On an installed app, Celeste opens the system share sheet; on the web, it downloads the file. Protect the file and share it only with a destination you trust.',
        pt: 'A cópia de segurança é um arquivo JSON legível e sem criptografia com a prática e os rascunhos locais da Comunidade. Ela não inclui denúncias de conteúdo de IA enviadas, a sessão pseudônima de denúncia, consentimentos do aparelho, notificações agendadas nem arquivos de imagens geradas. No app instalado, o Celeste abre a folha de compartilhamento do sistema; na web, baixa o arquivo. Proteja a cópia e compartilhe somente com um destino de confiança.',
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
        en: 'Optional cloud features depend on Anthropic for personalized scene text, OpenAI as scene-text failover, Google Gemini for translations, images and dream interpretations, and ElevenLabs for text-to-speech, as well as each provider\'s applicable terms and availability. If neither Anthropic nor OpenAI text processing is configured and approved Gemini processing is available, Gemini may generate scene text instead. Celeste may use the on-device version when a service fails or a response cannot be used safely.',
        pt: 'Os recursos opcionais em nuvem dependem da Anthropic para textos de cenas personalizadas, da OpenAI como alternativa do texto da cena, do Google Gemini para traduções, imagens e interpretações de sonhos, e da ElevenLabs para texto para fala, além dos termos aplicáveis e da disponibilidade de cada fornecedor. Se nem o processamento de texto da Anthropic nem o da OpenAI estiver configurado e o processamento aprovado do Gemini estiver disponível, o Gemini poderá gerar o texto da cena. O Celeste pode usar a versão no aparelho quando um serviço falhar ou uma resposta não puder ser usada com segurança.',
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
