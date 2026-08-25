// Escolha da melhor voz local disponível para cada estilo de narrador.
//
// Duas armadilhas que já custaram caro aqui (10/08):
//
// 1. O expo-speech web casa a voz por `voiceURI`, NÃO por `name`
//    (node_modules/expo-speech/build/ExponentSpeech.web.js:42-45). Pior: quando
//    não encontra, ele faz Math.max(0, -1) e cai na PRIMEIRA voz da lista — que
//    costuma ser feminina. Por isso sempre devolvemos o voiceURI.
// 2. Cada aparelho oferece um conjunto diferente de vozes. Aurora e Atlas
//    tentam preservar o timbre escolhido; Rio prioriza clareza e neutralidade.
//    Quando o timbre não existe, o idioma correto sempre vence.

// Vozes masculinas conhecidas por plataforma, em ordem de qualidade.
const MASC_PREFERIDAS = {
  pt: [
    'Microsoft Antonio Online (Natural) - Portuguese (Brazil)',
    'Microsoft Antonio',
    'Microsoft Daniel',
    'Google português do Brasil masculino',
    'Joaquim',
    'Felipe',
    'Ricardo',
  ],
  en: [
    'Microsoft Guy Online (Natural) - English (United States)',
    'Microsoft Christopher Online (Natural) - English (United States)',
    'Microsoft Brian Online (Natural) - English (United States)',
    'Google UK English Male',
    'Microsoft David',
    'Daniel',
    'Alex',
    'Aaron',
    'Fred',
  ],
};

const FEM_PREFERIDAS = {
  pt: [
    'Microsoft Francisca Online (Natural) - Portuguese (Brazil)',
    'Microsoft Francisca',
    'Google português do Brasil',
    'Luciana',
    'Joana',
  ],
  en: [
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Microsoft Aria Online (Natural) - English (United States)',
    'Google US English',
    'Samantha',
    'Victoria',
  ],
};

// Nomes próprios masculinos comuns em vozes de sistema (iOS/macOS/Android).
const MASC = /\b(antonio|ant[oó]nio|daniel|david|guy|christopher|brian|eric|roger|steffan|alex|aaron|fred|thomas|ricardo|felipe|joaquim|rocko|reed|male|homem|masculino)\b/i;
const FEM = /\b(maria|luciana|joana|francisca|zira|aria|jenny|michelle|ana|clara|samantha|karen|victoria|female|mulher|feminin[ao]|helena|camila|leila|ines|in[eê]s|catarina|fernanda|paulina|monica|m[oó]nica)\b/i;

function tag(lang) {
  return lang === 'pt' ? 'pt' : 'en';
}

function ehMasculina(v) {
  const n = v.name || '';
  if (FEM.test(n)) return false;
  return MASC.test(n);
}

function ehFeminina(v) {
  const n = v.name || '';
  if (MASC.test(n)) return false;
  return FEM.test(n);
}

function preferredByName(pool, names) {
  for (const name of names || []) {
    const exact = pool.find((voice) => voice.name === name);
    if (exact) return exact;
    const partial = pool.find((voice) => (voice.name || '').startsWith(name));
    if (partial) return partial;
  }
  return null;
}

// Devolve o objeto SpeechSynthesisVoice escolhido (ou null).
export function pickVoice(lang = 'pt', { localOnly = false, narratorId = 'atlas' } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const disponiveis = window.speechSynthesis.getVoices() || [];
  // Histórias pessoais só podem usar uma voz que o navegador marque
  // explicitamente como local. `undefined` não é prova de processamento local.
  const todas = localOnly ? disponiveis.filter((v) => v.localService === true) : disponiveis;
  if (!todas.length) return null;

  const t = tag(lang);
  const doIdioma = todas.filter((v) => String(v.lang || '').toLowerCase().startsWith(t));
  const pool = doIdioma.length ? doIdioma : todas;

  if (narratorId === 'aurora') {
    const named = preferredByName(pool, FEM_PREFERIDAS[t]);
    if (named) return named;
    const feminine = pool.filter(ehFeminina);
    if (feminine.length) return feminine.find((v) => v.localService === false) || feminine[0];
  }

  if (narratorId === 'atlas') {
    const named = preferredByName(pool, MASC_PREFERIDAS[t]);
    if (named) return named;
    const masculine = pool.filter(ehMasculina);
    if (masculine.length) return masculine.find((v) => v.localService === false) || masculine[0];
  }

  // Rio intentionally follows the clearest voice installed for the language.
  // If a requested timbre is unavailable, language correctness wins.
  return pool.find((v) => v.localService === false) || pool[0] || null;
}

// É ISSO que deve ir para expo-speech (voice: <voiceURI>).
export function pickVoiceURI(lang = 'pt', options = {}) {
  const v = pickVoice(lang, options);
  return v && v.voiceURI ? v.voiceURI : null;
}

// O Chrome popula as vozes de forma assíncrona; resolve assim que existirem.
export function getVoiceAsync(lang = 'pt', timeoutMs = 1500, options = {}) {
  return new Promise((resolve) => {
    const agora = pickVoice(lang, options);
    if (agora) return resolve(agora);
    if (typeof window === 'undefined' || !window.speechSynthesis) return resolve(null);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(pickVoice(lang, options));
    };
    window.speechSynthesis.addEventListener('voiceschanged', finish);
    setTimeout(finish, timeoutMs);
  });
}

// Tom mais grave e pausado: é o que separa "robô lendo" de "alguém afirmando".
export const TOM = {
  pt: { rate: 0.88, pitch: 0.85 },
  en: { rate: 0.9, pitch: 0.85 },
};
