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

for (const [label, html] of [
  ['privacidade PT', privacyPt],
  ['privacy EN', privacyEn],
]) {
  for (const provider of ['Supabase', 'Anthropic', 'OpenAI', 'Google Gemini', 'ElevenLabs', 'Vercel', 'BotID']) {
    assert(html.includes(provider), `${label}: processador real ausente: ${provider}`);
  }
  assert(/30 (?:dias|days)/i.test(html), `${label}: retenção do cache de áudio ausente`);
  assert(/(?:Denunciar este conteúdo de IA|Report this AI content)/.test(html), `${label}: fluxo de denúncia de IA ausente`);
  assert(/(?:relato bruto do sonho|raw dream report)/i.test(html), `${label}: minimização da denúncia de IA ausente`);
  assert(/data-owner-required="legal-contact"/.test(html), `${label}: nome legal pendente não sinalizado`);
  assert(html.includes('mailto:suporte@celestegroup.biz'), `${label}: e-mail público confirmado ausente`);
  assert(/data-owner-required="provider-retention"/.test(html), `${label}: retenção contratual pendente não sinalizada`);
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
for (const route of ['/privacidade', '/privacy', '/suporte', '/support']) {
  assert(rewriteMap.get(route) === `${route}/index.html`, `Rewrite público ausente: ${route}`);
}

const profile = read(path.join('screens', 'ProfileScreen.js'));
assert(profile.includes('testID="profile-privacy-link"'), 'Link de privacidade dentro do app ausente');
assert(profile.includes("setDocument('privacy')"), 'Link interno não abre o documento de privacidade');

console.log('Páginas públicas PT/EN, URLs da loja e link interno de privacidade validados.');
console.warn('PENDENTE DO TITULAR: nome legal e retenção contratual dos provedores.');
