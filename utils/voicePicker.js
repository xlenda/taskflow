// Escolha da melhor voz MASCULINA disponível no aparelho.
//
// Duas armadilhas que já custaram caro aqui (10/08):
//
// 1. O expo-speech web casa a voz por `voiceURI`, NÃO por `name`
//    (node_modules/expo-speech/build/ExponentSpeech.web.js:42-45). Pior: quando
//    não encontra, ele faz Math.max(0, -1) e cai na PRIMEIRA voz da lista — que
//    costuma ser feminina. Por isso sempre devolvemos o voiceURI.
// 2. Priorizar "qualidade" antes de "gênero" escolhia a Google português do
//    Brasil, que é feminina. Afirmação pede voz masculina e firme (decisão do
//    dono), então gênero é o primeiro filtro, não o segundo.

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

// Devolve o objeto SpeechSynthesisVoice escolhido (ou null).
export function pickVoice(lang = 'pt') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const todas = window.speechSynthesis.getVoices() || [];
  if (!todas.length) return null;

  const t = tag(lang);
  const doIdioma = todas.filter((v) => String(v.lang || '').toLowerCase().startsWith(t));
  const pool = doIdioma.length ? doIdioma : todas;

  // 1) nome exato da lista de masculinas preferidas (casamento parcial serve:
  //    o Windows anexa sufixos como "(Natural) - Portuguese (Brazil)")
  for (const nome of MASC_PREFERIDAS[t] || []) {
    const achou = pool.find((v) => v.name === nome) || pool.find((v) => (v.name || '').startsWith(nome));
    if (achou) return achou;
  }
  // 2) qualquer masculina do idioma — remota (neural) na frente
  const masc = pool.filter(ehMasculina);
  const mascRemota = masc.find((v) => v.localService === false);
  if (mascRemota) return mascRemota;
  if (masc.length) return masc[0];

  // 3) sem masculina no idioma: tenta masculina em QUALQUER idioma antes de
  //    aceitar uma feminina — o timbre pesa mais que o sotaque numa afirmação.
  const mascQualquer = todas.filter(ehMasculina);
  if (mascQualquer.length) {
    return mascQualquer.find((v) => v.localService === false) || mascQualquer[0];
  }

  // 4) nada masculino instalado: melhor voz do idioma, sem mentir para o usuário
  return pool.find((v) => v.localService === false) || pool[0] || null;
}

// É ISSO que deve ir para expo-speech (voice: <voiceURI>).
export function pickVoiceURI(lang = 'pt') {
  const v = pickVoice(lang);
  return v && v.voiceURI ? v.voiceURI : null;
}

// O Chrome popula as vozes de forma assíncrona; resolve assim que existirem.
export function getVoiceAsync(lang = 'pt', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const agora = pickVoice(lang);
    if (agora) return resolve(agora);
    if (typeof window === 'undefined' || !window.speechSynthesis) return resolve(null);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(pickVoice(lang));
    };
    window.speechSynthesis.addEventListener('voiceschanged', finish);
    setTimeout(finish, timeoutMs);
  });
}

// Diagnóstico: usado pelo script que lista o que existe no aparelho.
export function listarVozes(lang = 'pt') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return [];
  const escolhida = pickVoice(lang);
  return (window.speechSynthesis.getVoices() || []).map((v) => ({
    name: v.name,
    lang: v.lang,
    uri: v.voiceURI,
    remota: v.localService === false,
    masculina: ehMasculina(v),
    escolhida: !!escolhida && v.voiceURI === escolhida.voiceURI,
  }));
}

// Tom mais grave e pausado: é o que separa "robô lendo" de "alguém afirmando".
export const TOM = {
  pt: { rate: 0.88, pitch: 0.85 },
  en: { rate: 0.9, pitch: 0.85 },
};
