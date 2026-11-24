#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PROD = 'https://celeste-jet-two.vercel.app';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(relative) {
  const file = path.join(ROOT, relative);
  assert(fs.existsSync(file), `Arquivo público ausente: ${relative}`);
  return fs.readFileSync(file, 'utf8');
}

function publicPage({ route, directory, marker, language }) {
  const html = read(path.join('public', directory, 'index.html'));
  assert(html.includes(`<html lang="${language}">`), `${route}: idioma HTML incorreto`);
  assert(
    html.includes(`data-celeste-public-page="${marker}"`),
    `${route}: marcador público ausente`
  );
  assert(
    html.includes(`<link rel="canonical" href="${PROD}${route}"`),
    `${route}: canonical incorreto`
  );
  assert(html.includes('href="/legal.css"'), `${route}: CSS compartilhado ausente`);
  assert(html.includes('com.celesteapp.affirmations'), `${route}: pacote do app ausente`);
  assert(!/example\.(?:com|org)|support@celeste|contato@celeste|TODO|TBD/i.test(html), `${route}: contato ou placeholder inventado`);
  return html;
}

const privacyPt = publicPage({
  route: '/privacidade',
  directory: 'privacidade',
  marker: 'privacy-pt',
  language: 'pt-BR',
});
const privacyEn = publicPage({
  route: '/privacy',
  directory: 'privacy',
  marker: 'privacy-en',
  language: 'en-US',
});
const supportPt = publicPage({
  route: '/suporte',
  directory: 'suporte',
  marker: 'support-pt',
  language: 'pt-BR',
});
const supportEn = publicPage({
  route: '/support',
  directory: 'support',
  marker: 'support-en',
  language: 'en-US',
});

// Assinatura do iPhone (24/11): os termos viram pagina publica (o paywall aponta para /termos e /terms) e sao
// GERADOS do mesmo texto de constants/legal.js que o app mostra no Perfil. Depois de mudar os termos em legal.js:
//   node scripts/verificar-paginas-publicas.js --escrever-termos
const legalSource = read(path.join('constants', 'legal.js'));
const legalData = {};
Object.assign(legalData, new Function(`${legalSource.replace(/export const/g, 'const')}\nreturn { SUPPORT_EMAIL, LEGAL_UPDATED, TERMS_SECTIONS };`)());
const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TERMS_PAGES = {
  pt: {
    route: '/termos', directory: 'termos', marker: 'terms-pt', language: 'pt-BR', anchor: 'conteudo',
    other: { route: '/terms', language: 'en-US', label: 'English' },
    description: 'Termos de uso da Celeste: uso do app, assinatura no iPhone, renovação, cancelamento e reembolso pela Apple.',
    title: 'Termos de uso', skip: 'Ir para o conteúdo', home: 'Celeste — início', eyebrow: 'Documento público',
    lead: 'Estes termos valem para o site e para o aplicativo identificado pelo pacote',
    noticeLabel: 'Quem oferece a Celeste', noticeTitle: 'Responsável',
    notice: 'VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA, CNPJ 56.970.099/0001-09, Ibipitanga, BA, Brasil, titular da conta da Celeste na App Store e no Google Play. Contato:',
    footerLabel: 'Links do rodapé',
    links: [['/privacidade', 'Privacidade'], ['/suporte', 'Suporte']], open: 'Abrir Celeste',
  },
  en: {
    route: '/terms', directory: 'terms', marker: 'terms-en', language: 'en-US', anchor: 'content',
    other: { route: '/termos', language: 'pt-BR', label: 'Português' },
    description: 'Celeste terms of use: using the app, the iPhone subscription, renewal, cancellation and refunds through Apple.',
    title: 'Terms of use', skip: 'Skip to content', home: 'Celeste — home', eyebrow: 'Public document',
    lead: 'These terms apply to the website and to the application identified by package',
    noticeLabel: 'Who offers Celeste', noticeTitle: 'Publisher',
    notice: 'VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA, Brazilian company registry (CNPJ) 56.970.099/0001-09, Ibipitanga, BA, Brazil, holder of the Celeste account on the App Store and Google Play. Contact:',
    footerLabel: 'Footer links',
    links: [['/privacy', 'Privacy'], ['/support', 'Support']], open: 'Open Celeste',
  },
};
function renderTerms(lang) {
  const page = TERMS_PAGES[lang];
  const mail = legalData.SUPPORT_EMAIL;
  const sections = legalData.TERMS_SECTIONS.map((section, index) => [
    `          <section class="section" aria-labelledby="s${index + 1}">`,
    `            <h2 id="s${index + 1}">${index + 1}. ${escapeHtml(section.title[lang])}</h2>`,
    ...(section.paragraphs || []).map((item) => `            <p>${escapeHtml(item[lang])}</p>`),
    '          </section>',
  ].join('\n')).join('\n\n');
  return `<!doctype html>
<html lang="${page.language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${page.description}" />
    <title>${page.title} — Celeste</title>
    <link rel="canonical" href="${PROD}${page.route}" />
    <link rel="alternate" hreflang="pt-BR" href="${PROD}/termos" />
    <link rel="alternate" hreflang="en-US" href="${PROD}/terms" />
    <link rel="stylesheet" href="/legal.css" />
  </head>
  <body data-celeste-public-page="${page.marker}">
    <a class="skip-link" href="#${page.anchor}">${page.skip}</a>
    <div class="shell">
      <header class="site-header">
        <a class="brand" href="/" aria-label="${page.home}">Celeste</a>
        <a class="language-link" href="${page.other.route}" lang="${page.other.language}" hreflang="${page.other.language}">${page.other.label}</a>
      </header>

      <main id="${page.anchor}">
        <header class="hero">
          <p class="eyebrow">${page.eyebrow}</p>
          <h1>${page.title}</h1>
          <p class="lead">${page.lead} <code>com.celesteapp.affirmations</code>.</p>
          <p class="updated">${escapeHtml(legalData.LEGAL_UPDATED[lang])}.</p>
        </header>

        <div class="content">
          <aside class="notice" aria-label="${page.noticeLabel}">
            <strong>${page.noticeTitle}</strong>
            ${page.notice} <a href="mailto:${mail}">${mail}</a>.
          </aside>

${sections}
        </div>

        <footer class="site-footer">
          <span>Celeste · <code>com.celesteapp.affirmations</code></span>
          <nav class="footer-links" aria-label="${page.footerLabel}">
${page.links.map(([href, label]) => `            <a href="${href}">${label}</a>`).join('\n')}
            <a href="${page.other.route}" lang="${page.other.language}">${page.other.label}</a>
            <a href="/">${page.open}</a>
          </nav>
        </footer>
      </main>
    </div>
  </body>
</html>
`;
}
if (process.argv.includes('--escrever-termos')) {
  for (const lang of Object.keys(TERMS_PAGES)) {
    const directory = path.join(ROOT, 'public', TERMS_PAGES[lang].directory);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'index.html'), renderTerms(lang));
  }
}
const termsHtml = {};
for (const lang of Object.keys(TERMS_PAGES)) {
  const page = TERMS_PAGES[lang];
  termsHtml[lang] = publicPage(page);
  assert(
    termsHtml[lang].replace(/\r\n/g, '\n') === renderTerms(lang),
    `${page.route}: a página diverge de constants/legal.js (rode: node scripts/verificar-paginas-publicas.js --escrever-termos)`
  );
}
for (const [label, text, required] of [
  ['termos PT', termsHtml.pt, ['Assinatura no iPhone', 'teste grátis de 7 dias', 'renova automaticamente', 'Ajustes &gt; seu nome &gt; Assinaturas', '24 horas', 'reembolso', 'O site e o app de Android são gratuitos nesta versão', 'Sem promessa de resultado']],
  ['terms EN', termsHtml.en, ['Subscription on iPhone', '7-day free trial', 'renews automatically', 'Settings &gt; your name &gt; Subscriptions', '24 hours', 'refund', 'The website and the Android app are free in this version', 'No guaranteed outcome']],
]) {
  for (const sentence of required) assert(text.includes(sentence), `${label}: assinatura do iPhone não declarada: ${sentence}`);
}
// nenhum texto legal (app ou site) pode continuar dizendo que nao ha assinatura nem pagamento
for (const [label, text] of [
  ['constants/legal.js', legalSource],
  ['privacidade PT', privacyPt],
  ['privacy EN', privacyEn],
  ['termos PT', termsHtml.pt],
  ['terms EN', termsHtml.en],
]) {
  const stale = /não cria uma assinatura paga|does not create a paid subscription|pagamentos não estão ativos|payments are not active|nem assinatura ativa nesta versão|or active subscription in this version|não oferece assinatura ou compra ativa|offer an active subscription or purchase/i.exec(text.replace(/\s+/g, ' '));
  assert(!stale, `${label}: ainda nega a assinatura ou o pagamento: "${stale && stale[0]}"`);
}
for (const [label, text, required] of [
  ['privacidade PT', privacyPt.replace(/\s+/g, ' '), ['A compra é processada pela Apple', 'identificador anônimo do app', 'histórico de compra', 'nem seu nome ou e-mail', 'href="/termos"']],
  ['privacy EN', privacyEn.replace(/\s+/g, ' '), ['The purchase is processed by Apple', 'anonymous app identifier', 'purchase history', 'nor your name or e-mail', 'href="/terms"']],
  ['constants/legal.js', legalSource, ['A compra é processada pela Apple', 'identificador anônimo do app', 'histórico de compra', 'nem seu nome ou e-mail', 'The purchase is processed by Apple', 'anonymous app identifier', 'purchase history', 'nor your name or e-mail', 'RevenueCat']],
]) {
  for (const sentence of required) assert(text.includes(sentence), `${label}: compra pela Apple e RevenueCat não declarados: ${sentence}`);
}

for (const [label, html] of [
  ['privacidade PT', privacyPt],
  ['privacy EN', privacyEn],
]) {
  for (const provider of ['Supabase', 'Anthropic', 'OpenAI', 'Google Gemini', 'ElevenLabs', 'Vercel', 'BotID', 'RevenueCat']) {
    assert(html.includes(provider), `${label}: processador real ausente: ${provider}`);
  }
  assert(/30 (?:dias|days)/i.test(html), `${label}: retenção do cache de áudio ausente`);
  assert(/(?:Denunciar este conteúdo de IA|Report this AI content)/.test(html), `${label}: fluxo de denúncia de IA ausente`);
  assert(/(?:relato bruto do sonho|raw dream report)/i.test(html), `${label}: minimização da denúncia de IA ausente`);
  // 11/11/2026: a Celeste e publicada pela conta de organizacao da VenuzPay nas duas lojas;
  // nenhum item pode continuar marcado como pendente do titular na politica.
  assert(!/data-owner-required=/.test(html), `${label}: ainda há item marcado como pendente do titular`);
  assert(
    html.includes('VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA') && html.includes('56.970.099/0001-09'),
    `${label}: controlador (razão social e CNPJ) ausente`
  );
  assert(html.includes('mailto:suporte@celestegroup.biz'), `${label}: e-mail público confirmado ausente`);
  assert(
    /(?:seguem os termos e contratos de cada provedor|follow each provider's terms and contracts)/.test(html),
    `${label}: prazos de retenção dos provedores ausentes`
  );
}

assert(
  privacyPt.includes('O questionário inicial cria a primeira prática no aparelho') &&
    privacyPt.includes('afirmação, visão, Cena-Âncora, frase de sonho ou frase própria') &&
    privacyPt.includes('imagem e o texto da visão ou Cena-Âncora') &&
    privacyPt.includes('narração completa só começa') &&
    privacyPt.includes('confirmação acessível de que a visão foi lida') &&
    privacyPt.includes('liberadas duas repetições') &&
    privacyPt.includes('síntese de voz fornecida pelo'),
  'Privacidade PT não descreve onboarding local, despertador completo e Plano com Cena-Âncora'
);
assert(
  privacyEn.includes('Onboarding creates the first practice on the device') &&
    privacyEn.includes('affirmation, vision, Anchor Scene, dream phrase or personal phrase') &&
    privacyEn.includes('vision or Anchor Scene image and text') &&
    privacyEn.includes('Full narration begins only') &&
    privacyEn.includes('accessible confirmation that the vision was') &&
    privacyEn.includes('repetitions are enabled') &&
    privacyEn.includes('speech synthesis supplied by'),
  'Privacy EN não descreve onboarding local, despertador completo e Plano com Anchor Scene'
);

// Android (21/10): when she changes the language, the scene being translated goes to Google Gemini: the AI-written one
// or, if the AI has not rewritten it, the one assembled on the device, with the identity phrase, the bridge step and
// the labels of the answers it used (services/translateManifestationScene.js). The policies (site and app) say exactly
// that, and no public, store or guide text still says translation stays on the website or lists only part of it.
const oneLine = (text) => text.replace(/\s+/g, ' ');
const legal = read(path.join('constants', 'legal.js'));
// the in-app policy carries the date printed on the public pages (both change together)
const publicDatePt = (/Atualizada em (\d{1,2} de [a-zç]+ de \d{4})\./.exec(privacyPt) || [])[1];
const publicDateEn = (/Updated ([A-Z][a-z]+ \d{1,2}, \d{4})\./.exec(privacyEn) || [])[1];
assert(
  publicDatePt &&
    publicDateEn &&
    legal.includes('VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA') &&
    legal.includes('56.970.099/0001-09') &&
    legal.includes(`pt: 'Atualizado em ${publicDatePt}'`) &&
    legal.includes(`en: 'Updated ${publicDateEn}'`),
  'constants/legal.js: a política dentro do app não traz o controlador e a data da política pública'
);

// iPhone (19/11): the voice and the AI texts pass there too, checked by Apple's App Attest; the policies (site and app)
// say so, with what the server keeps for that check, and none still says they are an Android-only feature. Personal
// images are still never generated in the apps.
const legalText = oneLine(legal.replace(/\\'/g, "'"));
for (const [label, text, required] of [
  ['privacidade PT', oneLine(privacyPt), [
    'Nos aplicativos de iPhone e Android, esse controle libera a narração neural',
    'Apple App Attest',
    'um identificador da chave do aparelho, a chave pública e o recibo da Apple, ligados à sessão técnica anônima',
    'Nenhuma imagem é gerada nos aplicativos',
  ]],
  ['privacy EN', oneLine(privacyEn), [
    'In the iPhone and Android apps, that control enables neural narration',
    'Apple App Attest',
    "an identifier of the device's key, its public key and Apple's receipt, linked to the anonymous technical session",
    'No images are generated in the apps',
  ]],
  ['constants/legal.js', legalText, [
    'Nos apps de iPhone e Android, esse controle libera a narração da ElevenLabs',
    'In the iPhone and Android apps, that control enables ElevenLabs narration',
    'No iPhone, é o App Attest da Apple',
    "On iPhone it is Apple's App Attest",
    'um identificador da chave do aparelho, a chave pública e o recibo da Apple, ligados à sessão técnica pseudônima',
    "an identifier of the device's key, its public key and Apple's receipt, linked to the pseudonymous technical session",
    'Nenhuma imagem é gerada nos apps',
    'No images are generated in the apps',
  ]],
]) {
  for (const sentence of required) assert(text.includes(sentence), `${label}: iPhone com App Attest não declarado: ${sentence}`);
  assert(
    !/(?:No app|No aplicativo) Android, (?:esse controle|o mesmo consentimento|imagens pessoais)|In the Android app, (?:that control|the same adult consent|personal images)|(?:Narração|Textos com IA) no aplicativo Android|(?:Narration|AI-written texts) in the Android app/.test(text),
    `${label}: ainda diz que voz e textos da nuvem são só do Android`
  );
}
assert(
  oneLine(privacyPt).includes('quando você troca o idioma do app, a cena que vai ser traduzida (a escrita pela IA ou, se a IA não chegou a reescrevê-la, a montada no aparelho com as suas respostas) é enviada') &&
    oneLine(privacyPt).includes('a frase de identidade e o passo da ponte para hoje e os rótulos das respostas usadas nela') &&
    oneLine(privacyEn).includes('when you change the app language, the scene being translated (the AI-written one or, if the AI has not rewritten it, the one assembled on the device from your answers) is sent') &&
    oneLine(privacyEn).includes('the identity phrase and step of the bridge to today, and the labels of the answers it used') &&
    legal.includes('a cena que vai ser traduzida (a escrita pela IA ou, se a IA não chegou a reescrevê-la, a montada no celular com as suas respostas)') &&
    legal.includes('a frase de identidade e o passo da ponte para hoje e os rótulos das respostas usadas nela') &&
    legal.includes('the scene being translated (the AI-written one or, if the AI has not rewritten it, the one assembled on your phone from your answers)') &&
    legal.includes('the identity phrase and step of the bridge to today, and the labels of the answers it used') &&
    legal.includes('the Google Gemini translation of the scene when you change the language') &&
    legal.includes('a tradução da cena pelo Google Gemini quando você troca o idioma'),
  'Privacidade: a tradução da cena pelo Google Gemini no Android não está declarada por inteiro'
);
for (const [label, text] of [
  ['privacidade PT', privacyPt],
  ['privacy EN', privacyEn],
  ['constants/legal.js', legal],
  ['review-notes.md', read(path.join('store-listing', 'review-notes.md'))],
  ['console-declarations.md', read(path.join('store-listing', 'console-declarations.md'))],
  ['google-play-console-prefill.md', read(path.join('store-listing', 'google-play-console-prefill.md'))],
  ['submission-readiness.json', read(path.join('store-listing', 'submission-readiness.json'))],
  ['PLAY-INTEGRITY-PASSO-A-PASSO.md', read(path.join('docs', 'PLAY-INTEGRITY-PASSO-A-PASSO.md'))],
]) {
  assert(
    !/sonhos?, traduç(?:ão|ões) e Espelho|dreams, translations and the Living Mirror|(?:imagem, sonho, tradução|tradução, imagem, sonho) (?:e|ou) Espelho|image, dream, translation and Living Mirror/i.test(oneLine(text)),
    `${label}: ainda diz que a tradução fica só no site no Android`
  );
  assert(
    !/\((?:título, intenção, afirmação e história|title, intention, affirmation and story)\b|tradução (?:da|dessa) cena escrita pela IA|tradução dessa cena|translation of (?:the AI-written|that) scene|AI-written scene is translated|traduz a Cena-Âncora escrita pela IA/i.test(oneLine(text)),
    `${label}: a tradução no Android aparece menor que no código (só a cena da IA, sem identidade, passo e rótulos)`
  );
}
// the Android boundary docs no longer say the app has no cloud, no AI or no ElevenLabs (voices, texts and translation
// pass with Play Integrity since 21/10; images, dream and the Living Mirror stay on the website)
for (const [label, file] of [
  ['android-store-v1-boundary.md', path.join('docs', 'android-store-v1-boundary.md')],
  ['store-submission-pending.md', path.join('docs', 'store-submission-pending.md')],
]) {
  assert(
    !/não ElevenLabs|bloqueia ElevenLabs|bloqueia as APIs pagas de cena|bloqueia geracao e narracao pagas|chamadas de processamento pago em nuvem\. A criação usa\s+o caminho local/i.test(oneLine(read(file))),
    `${label}: ainda diz que o Android não tem nuvem, IA ou ElevenLabs`
  );
}

assert(privacyPt.includes('href="/suporte"'), 'Privacidade PT não aponta para suporte');
assert(privacyPt.includes('href="/privacy"'), 'Privacidade PT não aponta para inglês');
assert(privacyEn.includes('href="/support"'), 'Privacy EN não aponta para suporte');
assert(privacyEn.includes('href="/privacidade"'), 'Privacy EN não aponta para português');

for (const [label, html, privacyRoute] of [
  ['suporte PT', supportPt, '/privacidade'],
  ['support EN', supportEn, '/privacy'],
]) {
  assert(html.includes(`href="${privacyRoute}"`), `${label}: link de privacidade ausente`);
  assert(!/data-owner-required="support-email"/.test(html), `${label}: e-mail confirmado ainda marcado como pendente`);
  assert(html.includes('mailto:suporte@celestegroup.biz'), `${label}: e-mail público confirmado ausente`);
  assert(/(?:emergência|emergency)/i.test(html), `${label}: orientação de emergência ausente`);
}

assert(
  supportPt.includes('deixa a nuvem desligada') &&
    supportPt.includes('afirmação, visão, Cena-Âncora, frase de sonho ou frase') &&
    supportPt.includes('imagem e o texto da visão ou Cena-Âncora') &&
    supportPt.includes('Ouvir visão completa') &&
    supportPt.includes('duas repetições são liberados'),
  'Suporte PT não acompanha o onboarding local e os conteúdos novos'
);
assert(
  supportEn.includes('leaves cloud processing off') &&
    supportEn.includes('affirmation, vision, Anchor Scene, dream phrase or personal') &&
    supportEn.includes('vision or Anchor Scene image and text') &&
    supportEn.includes('Play full vision') &&
    supportEn.includes('repetitions are enabled'),
  'Support EN não acompanha o onboarding local e os conteúdos novos'
);

const css = read(path.join('public', 'legal.css'));
assert(css.includes(':focus-visible'), 'Páginas públicas sem foco de teclado visível');
assert(css.includes('prefers-reduced-motion'), 'Páginas públicas sem redução de movimento');

const urls = JSON.parse(read(path.join('store-listing', 'urls.json')));
assert(urls.privacy === `${PROD}/privacidade`, 'URL de privacidade da loja diverge');
assert(urls.support === `${PROD}/suporte`, 'URL de suporte da loja diverge');

const consoleFields = JSON.parse(read(path.join('store-listing', 'console-fields.json')));
assert(consoleFields.apple.privacyUrl === urls.privacy, 'Apple privacyUrl diverge');
assert(consoleFields.apple.supportUrl === urls.support, 'Apple supportUrl diverge');
assert(consoleFields.googlePlay.privacyUrl === urls.privacy, 'Google Play privacyUrl diverge');
assert(consoleFields.googlePlay.supportEmail === 'suporte@celestegroup.biz', 'Google Play supportEmail diverge');

const vercel = JSON.parse(read('vercel.json'));
const rewriteMap = new Map((vercel.rewrites || []).map((item) => [item.source, item.destination]));
for (const route of ['/privacidade', '/privacy', '/suporte', '/support', '/termos', '/terms']) {
  assert(rewriteMap.get(route) === `${route}/index.html`, `Rewrite público ausente: ${route}`);
}

const profile = read(path.join('screens', 'ProfileScreen.js'));
assert(profile.includes('testID="profile-privacy-link"'), 'Link de privacidade dentro do app ausente');
assert(profile.includes("setDocument('privacy')"), 'Link interno não abre o documento de privacidade');

console.log('Páginas públicas PT/EN (privacidade, suporte e termos), URLs da loja e link interno de privacidade validados.');
console.log('Controlador publicado: VENUZPAY TECNOLOGIA EM VENDAS ONLINE LTDA (CNPJ 56.970.099/0001-09).');
