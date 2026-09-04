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
