// Falas da guia da sessão de 7 minutos, na ordem em que tocam.
// Cada fala <= 160 caracteres; soma por idioma <= SESSION_GUIDE_MAX_CHARS. Conferido por scripts/verificar-jornada-semanal.js.
// Áudio gravado uma vez: mudar o texto exige gerar o áudio de novo. Quem segura o tempo é o silêncio depois de cada fala.
export const SESSION_GUIDE_CLIPS = ['breath', 'desire', 'scene', 'affirm', 'bridge', 'close'];

export const SESSION_GUIDE = {
  breath: {
    pt: 'Feche os olhos. Inspire devagar pelo nariz e solte pela boca. Agora eu fico em silêncio por um minuto. Só respire.',
    en: "Let your eyes close. Breathe in slowly through your nose, and out through your mouth. I'll be quiet for a minute now. Just breathe.",
  },
  desire: {
    pt: 'Traga para perto o que você mais deseja.',
    en: 'Hold close what you long for most.',
  },
  scene: {
    pt: 'Entre na sua cena. Quando as palavras acabarem, fique nela, em silêncio.',
    en: 'Step into your scene. When the words end, stay there, in the quiet.',
  },
  affirm: {
    pt: 'Agora, as suas afirmações. Depois de cada uma, repita baixinho.',
    en: 'Now, your affirmations. After each one, say it back softly.',
  },
  bridge: {
    pt: 'Abra os olhos devagar. Aqui está o seu pequeno passo de hoje.',
    en: 'Open your eyes slowly. Here is your small step for today.',
  },
  close: {
    pt: 'Pronto. Estes sete minutos foram seus. Registre o seu dia e, se quiser, deixe uma linha.',
    en: "That's your seven minutes. Tap to mark your day, and add a line if you like.",
  },
};

export const SESSION_GUIDE_MAX_CHARS = 450;
