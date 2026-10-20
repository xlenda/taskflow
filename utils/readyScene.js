import { READY_SCENES } from '../constants/readyScenes';

// profile.dreamLocation guarda o chip no idioma dela (flow.js, dreamPlace) ou texto livre.
// A ordem decide empates: "viajando pelo litoral" é praia. "Interior"/"exterior" soltos descrevem a casa
// ("cozy interior", "área exterior"); só viram lugar como "no interior" / "no exterior".
const PLACE_PATTERNS = [
  ['beach', /\b(praias?|litoral|beira-mar|mar|ilhas?|beach(?:es)?|coasts?|coastal|seaside|ocean|sea|islands?)\b/],
  ['city', /\b(cidades?|metropole|urbano|urbana|city|cities|urban|downtown)\b/],
  [
    'countryside',
    /\b(campos?|montanhas?|serras?|fazendas?|sitios?|chacaras?|(?:no|do|pro|para o) interior|roca|countryside|mountains?|farms?|ranch(?:es)?|rural)\b/,
  ],
  [
    'abroad',
    /\b(outros? pais(?:es)?|(?:no|do|pro|para o) exterior|fora do pais|fora do brasil|morar fora|another country|other countries|abroad|overseas)\b/,
  ],
  ['traveling', /\b(viajando|viajar|viage(?:m|ns)|nomades?|sem lugar fixo|traveling|travelling|travel|nomads?|no fixed)\b/],
  ['home', /\b(onde moro|moro hoje|minha casa|where i live|my home|my house)\b/],
];

export function placeFromDreamLocation(text) {
  if (typeof text !== 'string') return 'neutral';
  const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const match = PLACE_PATTERNS.find(([, pattern]) => pattern.test(plain));
  return match ? match[0] : 'neutral';
}

export function pickReadyScene(input) {
  const { dreamLocation, category } = input || {};
  const place = placeFromDreamLocation(dreamLocation);
  const area = Object.prototype.hasOwnProperty.call(READY_SCENES[place], category) ? category : 'Peace';
  return { id: `${place}-${area}`, source: READY_SCENES[place][area], place, category: area };
}
