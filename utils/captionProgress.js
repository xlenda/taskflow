// Legenda da narração: quanto do texto (0..1) a voz já disse. O renderizador mostra uma palavra assim que o progresso
// passa da 1ª letra dela, então o progresso aponta para o FIM da palavra falada. Na dúvida, o menor valor: a legenda
// nunca corre na frente da voz.

// O ritmo da fala no rate 1: o tempo estimado do despertar (utils/wakeSequence) e o relógio da legenda usam este.
export const CHARS_PER_SECOND = 14;

const clamp01 = (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);

// voz da Celeste: o progress do NarrationContext (pelo tempo de cada letra que o servidor manda com a voz; áudio
// guardado antes disso, por letras do trecho e, dentro dele, pelo tempo do áudio)
export function captionProgressFromNarration({ progress }) {
  return clamp01(Number(progress));
}

// O WAV da voz da Celeste traz, depois do som, o pedaço 'ctim' (api/gerar-audio.js): JSON com o ms em que a voz começa
// cada letra do trecho. Sem ele (áudio guardado antes) ou com tempos de outro texto: null.
export function letterTimesFromWav(bytes, textLength) {
  if (!bytes || bytes.length < 12 || ascii(bytes, 0) !== 'RIFF' || ascii(bytes, 8) !== 'WAVE') return null;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = (bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24)) >>> 0;
    if (ascii(bytes, offset) === 'ctim') {
      let json = '';
      const end = Math.min(bytes.length, offset + 8 + size);
      for (let i = offset + 8; i < end; i += 1) json += String.fromCharCode(bytes[i]);
      try {
        const times = JSON.parse(json);
        return Array.isArray(times) && times.length === textLength && times.every((ms) => Number.isFinite(ms) && ms >= 0)
          ? times
          : null;
      } catch (_error) {
        return null;
      }
    }
    offset += 8 + size + (size % 2);
  }
  return null;
}

const ascii = (bytes, at) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

// Quantas letras do trecho a voz já disse aos `seconds` do áudio dele: até o FIM da palavra cuja 1ª letra ela começou
// (o renderizador mostra a palavra inteira quando ela é dita); entre palavras, até o espaço (a próxima ainda não).
export function lettersSpoken({ letters, text, seconds }) {
  const ms = Number(seconds) * 1000;
  let low = 0;
  let high = letters.length; // a 1ª letra que a voz ainda não começou
  while (low < high) {
    const mid = (low + high) >> 1;
    if (letters[mid] <= ms) low = mid + 1;
    else high = mid;
  }
  let end = low;
  if (end > 0 && !/\s/.test(text[end - 1])) {
    while (end < text.length && !/\s/.test(text[end])) end += 1;
  }
  return end;
}

// voz do aparelho (expo-speech onBoundary): a palavra que começa em charIndex está sendo dita até o fim dela
export function captionProgressFromBoundary({ charIndex, charLength = 0, textLength }) {
  return textLength > 0 ? clamp01((Number(charIndex) + (Number(charLength) || 0)) / textLength) : 0;
}

// sem aviso de palavra: proporcional ao tempo desde o começo da fala, no ritmo acima vezes o rate que a voz recebeu
// (0.9 fala 90% das letras por segundo)
export function captionProgressFromTime({ elapsedMs, text, rate = 1 }) {
  const length = String(text || '').length;
  return length ? clamp01(((Number(elapsedMs) / 1000) * CHARS_PER_SECOND * Number(rate)) / length) : 0;
}

// o Safari só diz onde a palavra começa (charLength 0): ela vai até o próximo espaço
export function wordLengthAt(text, charIndex) {
  return /^\S*/.exec(String(text || '').slice(Math.max(0, Number(charIndex) || 0)))[0].length;
}
