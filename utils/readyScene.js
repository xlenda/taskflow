import { READY_SCENES } from '../constants/readyScenes';

// profile.dreamLocation guarda o chip no idioma dela (flow.js, dreamPlace) ou texto livre.
// A ordem decide empates: "viajando pelo litoral" é praia.
const PLACE_PATTERNS = [
  ['beach', /\b(praias?|litoral|beira-mar|mar|ilha|beach|coast|coastal|seaside|ocean|sea|island)\b/],
  ['city', /\b(cidades?|metropole|urbano|urbana|city|urban|downtown)\b/],
  ['countryside', /\b(campo|montanhas?|serra|fazenda|sitio|chacara|interior|roca|countryside|mountains?|farm|ranch|rural)\b/],
  ['abroad', /\b(outro pais|exterior|fora do pais|fora do brasil|another country|abroad|overseas)\b/],
  ['traveling', /\b(viajando|viajar|viagem|nomade|sem lugar fixo|traveling|travelling|travel|nomad|no fixed)\b/],
  ['home', /\b(onde moro|moro hoje|minha casa|where i live|my home|my house)\b/],
];

export function placeFromDreamLocation(text) {
  if (typeof text !== 'string') return 'neutral';
  const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const match = PLACE_PATTERNS.find(([, pattern]) => pattern.test(plain));
  return match ? match[0] : 'neutral';
}

export function pickReadyScene({ dreamLocation, category } = {}) {
  const place = placeFromDreamLocation(dreamLocation);
  const area = Object.prototype.hasOwnProperty.call(READY_SCENES[place], category) ? category : 'Peace';
  return { id: `${place}-${area}`, source: READY_SCENES[place][area], place, category: area };
}
