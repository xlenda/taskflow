// Legenda da narração: quanto do texto (0..1) a voz já disse. O renderizador mostra uma palavra assim que o progresso
// passa da 1ª letra dela, então o progresso aponta para o FIM da palavra falada. Na dúvida, o menor valor: a legenda
// nunca corre na frente da voz.
export const CAPTION_CHARS_PER_SECOND = 14; // o mesmo ritmo do tempo estimado do despertar

const clamp01 = (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

// voz da Celeste: o progress do NarrationContext (por letras de cada trecho e, dentro do trecho, pelo tempo do áudio)
export function captionProgressFromNarration({ progress }) {
  return clamp01(Number(progress));
}

// voz do aparelho (expo-speech onBoundary): a palavra que começa em charIndex está sendo dita até o fim dela
export function captionProgressFromBoundary({ charIndex, charLength = 0, textLength }) {
  return textLength > 0 ? clamp01((Number(charIndex) + (Number(charLength) || 0)) / textLength) : 0;
}

// sem aviso de palavra: proporcional ao tempo desde o começo da fala
export function captionProgressFromTime({ elapsedMs, text }) {
  const length = String(text || '').length;
  return length ? clamp01(((Number(elapsedMs) / 1000) * CAPTION_CHARS_PER_SECOND) / length) : 0;
}

// o Safari só diz onde a palavra começa (charLength 0): ela vai até o próximo espaço
export function wordLengthAt(text, charIndex) {
  return /^\S*/.exec(String(text || '').slice(Math.max(0, Number(charIndex) || 0)))[0].length;
}
