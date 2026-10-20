// Cenas prontas (4:5, 720x900, geradas de graça com as regras de api/gerar-visual.js) para quem
// ainda não tem imagem pessoal: lugar dos sonhos × área do desejo. Escolha em utils/readyScene.js.
// Cada require precisa ser literal: o Metro só empacota caminhos estáticos.
export const READY_SCENE_PLACES = ['home', 'city', 'beach', 'countryside', 'abroad', 'traveling', 'neutral'];

export const READY_SCENES = {
  home: {
    Love: require('../assets/scenes/home-Love.jpg'),
    Wealth: require('../assets/scenes/home-Wealth.jpg'),
    Career: require('../assets/scenes/home-Career.jpg'),
    Health: require('../assets/scenes/home-Health.jpg'),
    Confidence: require('../assets/scenes/home-Confidence.jpg'),
    Peace: require('../assets/scenes/home-Peace.jpg'),
  },
  city: {
    Love: require('../assets/scenes/city-Love.jpg'),
    Wealth: require('../assets/scenes/city-Wealth.jpg'),
    Career: require('../assets/scenes/city-Career.jpg'),
    Health: require('../assets/scenes/city-Health.jpg'),
    Confidence: require('../assets/scenes/city-Confidence.jpg'),
    Peace: require('../assets/scenes/city-Peace.jpg'),
  },
  beach: {
    Love: require('../assets/scenes/beach-Love.jpg'),
    Wealth: require('../assets/scenes/beach-Wealth.jpg'),
    Career: require('../assets/scenes/beach-Career.jpg'),
    Health: require('../assets/scenes/beach-Health.jpg'),
    Confidence: require('../assets/scenes/beach-Confidence.jpg'),
    Peace: require('../assets/scenes/beach-Peace.jpg'),
  },
  countryside: {
    Love: require('../assets/scenes/countryside-Love.jpg'),
    Wealth: require('../assets/scenes/countryside-Wealth.jpg'),
    Career: require('../assets/scenes/countryside-Career.jpg'),
    Health: require('../assets/scenes/countryside-Health.jpg'),
    Confidence: require('../assets/scenes/countryside-Confidence.jpg'),
    Peace: require('../assets/scenes/countryside-Peace.jpg'),
  },
  abroad: {
    Love: require('../assets/scenes/abroad-Love.jpg'),
    Wealth: require('../assets/scenes/abroad-Wealth.jpg'),
    Career: require('../assets/scenes/abroad-Career.jpg'),
    Health: require('../assets/scenes/abroad-Health.jpg'),
    Confidence: require('../assets/scenes/abroad-Confidence.jpg'),
    Peace: require('../assets/scenes/abroad-Peace.jpg'),
  },
  traveling: {
    Love: require('../assets/scenes/traveling-Love.jpg'),
    Wealth: require('../assets/scenes/traveling-Wealth.jpg'),
    Career: require('../assets/scenes/traveling-Career.jpg'),
    Health: require('../assets/scenes/traveling-Health.jpg'),
    Confidence: require('../assets/scenes/traveling-Confidence.jpg'),
    Peace: require('../assets/scenes/traveling-Peace.jpg'),
  },
  neutral: {
    Love: require('../assets/scenes/neutral-Love.jpg'),
    Wealth: require('../assets/scenes/neutral-Wealth.jpg'),
    Career: require('../assets/scenes/neutral-Career.jpg'),
    Health: require('../assets/scenes/neutral-Health.jpg'),
    Confidence: require('../assets/scenes/neutral-Confidence.jpg'),
    Peace: require('../assets/scenes/neutral-Peace.jpg'),
  },
};
