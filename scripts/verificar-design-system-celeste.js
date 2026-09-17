const assert = require('assert');
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function parse(relativePath) {
  parser.parse(read(relativePath), {
    sourceType: 'unambiguous',
    plugins: ['jsx'],
  });
}

function includes(source, pattern, message) {
  assert.match(source, pattern, message);
}

const designFiles = [
  'App.js',
  'ui/tokens.js',
  'ui/theme.js',
  'ui/kit.js',
  'components/AffirmationCard.js',
  'components/AiContentReportAction.js',
  'components/ManifestCard.js',
  'components/NarrationPlaybackControls.js',
  'components/NarratorSelector.js',
  'components/PrimaryButton.js',
  'components/SectionHeading.js',
  'screens/HomeScreen.js',
  'screens/JourneyScreen.js',
  'screens/ProfileScreen.js',
  'screens/ManifestationScreen.js',
  'screens/VisionsScreen.js',
  'screens/VisionPlayerScreen.js',
  'screens/AffirmationsScreen.js',
  'screens/PracticePlanScreen.js',
  'screens/PracticeRitualScreen.js',
  'screens/MorningRitualScreen.js',
  'screens/DailyRitualScreen.js',
  'screens/AffirmationAlarmScreen.js',
  'screens/CommunityScreen.js',
  'screens/onboarding/onboardingUI.js',
  'screens/onboarding/WelcomeScreen.js',
  'screens/onboarding/ChatOnboardingScreen.js',
];

designFiles.forEach(parse);

const tokens = read('ui/tokens.js');
for (const token of [
  'typography',
  'spacing',
  'radius',
  'dimensions',
  'breakpoints',
  'motion',
  'opacity',
  'elevation',
  'textMutedStrongByTheme',
]) {
  includes(tokens, new RegExp(`export const ${token}\\b`), `token ausente: ${token}`);
}
includes(tokens, /touchAndroid:\s*48/, 'Android precisa de alvo minimo de 48 px');
includes(tokens, /contentMax:\s*720/, 'conteudo precisa manter largura de leitura de 720 px');

const theme = read('ui/theme.js');
for (const name of ['midnight', 'violet', 'ember', 'forest', 'paper', 'cloud', 'blossom', 'mono']) {
  includes(theme, new RegExp(`\\b${name}:`), `tema original ausente: ${name}`);
}
includes(theme, /textMutedOnAlt/, 'tema precisa expor texto secundario AA em superficie alternativa');
includes(theme, /m\.semantic\s*=\s*\{/, 'tema precisa expor aliases semanticos');

const kit = read('ui/kit.js');
includes(kit, /maxWidth:\s*theme\.spacing\.contentMax/, 'Screen precisa limitar a largura de leitura');
includes(kit, /outlineColor:\s*theme\.accent/, 'controles web precisam de foco visivel');
includes(kit, /touchAndroid/, 'componentes precisam consumir o alvo Android');

const touchFiles = {
  'components/AffirmationCard.js': [/minWidth:\s*48/, /minHeight:\s*48/],
  'components/AiContentReportAction.js': [/minHeight:\s*48/, /width:\s*48,\s*height:\s*48/],
  'components/ManifestCard.js': [/minWidth:\s*48/, /minHeight:\s*48/],
  'components/NarrationPlaybackControls.js': [/width:\s*44,\s*\n\s*height:\s*44/, /height:\s*44/],
  'components/NarratorSelector.js': [/width:\s*48,\s*\n\s*height:\s*48/],
  'components/PrimaryButton.js': [/height:\s*52/, /outlineColor:\s*th\.accent/],
  'components/SectionHeading.js': [/minHeight:\s*48/],
  'screens/onboarding/onboardingUI.js': [/minHeight:\s*48/],
  'screens/onboarding/WelcomeScreen.js': [/width:\s*48,\s*\n\s*height:\s*48/],
  'screens/onboarding/ChatOnboardingScreen.js': [/width:\s*48,\s*height:\s*48/],
};
for (const [relativePath, patterns] of Object.entries(touchFiles)) {
  const source = read(relativePath);
  patterns.forEach((pattern) => includes(source, pattern, `alvo de toque insuficiente em ${relativePath}`));
}

const visual = read('api/gerar-visual.js');
includes(visual, /celeste-visual-v3/, 'prompt visual V3 precisa estar ativo');
includes(visual, /CATEGORY_ART_DIRECTIONS/, 'imagens precisam de direcao por categoria');
includes(visual, /VISUAL_HOOK_DIRECTIONS/, 'imagens precisam de ganchos visuais variados');
includes(visual, /gemini-3\.1-flash-image/, 'geracao de imagem Gemini precisa ser preservada');

const audio = read('api/gerar-audio.js');
includes(audio, /api\.elevenlabs\.io/, 'ElevenLabs precisa continuar no backend');
includes(audio, /eleven_multilingual_v2/, 'modelo ElevenLabs original precisa ser preservado');

const textProviders = read('api/_text-provider.js');
includes(textProviders, /api\.anthropic\.com/, 'Anthropic precisa continuar como provedor de texto');
includes(textProviders, /api\.openai\.com/, 'OpenAI precisa continuar como fallback de texto');

process.stdout.write(
  `Design System Celeste OK: ${designFiles.length} modulos, 8 temas, tokens, acessibilidade, Gemini e ElevenLabs preservados.\n`
);
