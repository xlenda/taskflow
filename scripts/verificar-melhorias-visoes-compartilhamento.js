const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const parse = (file) => parser.parse(read(file), {
  sourceType: 'module',
  plugins: ['jsx', 'optionalChaining'],
});

const files = [
  'screens/VisionPlayerScreen.js',
  'screens/AffirmationsScreen.js',
  'components/ShareCard.js',
  'components/ShareSheet.js',
  'components/GradientCover.js',
  'utils/shareAffirmationCard.js',
  'utils/shareContent.js',
  'utils/personalJourney.js',
  'context/AppContext.js',
];
files.forEach(parse);

const player = read('screens/VisionPlayerScreen.js');
const affirmations = read('screens/AffirmationsScreen.js');
// o compartilhar de Afirmações virou a folha de tudo que é compartilhado: cartão 9:16 (ShareCard), folha com prévia,
// imagem, vídeo e link (ShareSheet), captura do cartão (shareAffirmationCard) e envio (shareContent)
const genericShareCard = read('components/ShareCard.js');
const shareSheet = read('components/ShareSheet.js');
const shareHelper = read('utils/shareAffirmationCard.js');
const shareContent = read('utils/shareContent.js');
const gradientCover = read('components/GradientCover.js');
const context = read('context/AppContext.js');
const deployGuard = read('scripts/deploy-celeste-guards.js');
const migration = read('supabase/migrations/012_secondary_vision_visual_capacity.sql');

assert.match(player, /const caption = lines\[safeIdx\]/);
assert.match(player, /buildNarrationTimeline/);
assert.match(player, /timeline\.ends\.findIndex/);
assert.match(player, /Animated\.timing\(captionOpacity/);
assert.match(player, /duration: 260/);
assert.match(player, /secondaryVisualKey/);
assert.match(player, /secondaryStatusRelevant/);
assert.match(player, /vision-player-secondary-visual/);
assert.match(player, /duration: 420/);
assert.match(player, /visualRef=\{activeVisualKey\}/);
assert.match(player, /updateJourneyVisionStory/);
assert.match(player, /vision-player-story-input/);
assert.match(player, /navigation\.replace\('VisionPlayer'/);
assert.match(player, /vision-player-next-up/);

assert.match(context, /`vision:\$\{category\}:secondary`/);
assert.match(context, /const updateJourneyVisionStory = useCallback/);
assert.match(context, /journeyStoryEditsByLang/);
assert.match(
  context,
  /itemChangesVisualSubject[\s\S]{0,900}journeyVisuals: \{\},[\s\S]{0,120}journeyStoryEditsByLang: \{\}/
);
assert.match(context, /journeyKey\.endsWith\(':secondary'\)/);
assert.match(gradientCover, /transition=\{imageTransition\}/);

// cartão 9:16: tamanho, marca e link, imagem pessoal pela chave, captura nítida, fonte do sistema travada
assert.match(genericShareCard, /SHARE_CARD_ASPECT_RATIO = 9 \/ 16/);
assert.match(genericShareCard, /SHARE_CARD_LAYOUT_SIZE = Object\.freeze\(\{ width: 360, height: 640 \}\)/);
assert.match(genericShareCard, /APP_NAME/);
assert.match(genericShareCard, /APP_URL/);
assert.match(genericShareCard, /acquirePersonalVisual\(visualKey\)/);
assert.match(genericShareCard, /transition=\{0\}/);
assert.ok((genericShareCard.match(/maxFontSizeMultiplier=\{1\}/g) || []).length >= 4);
// Afirmações abre a folha nova (prévia, imagem, vídeo e link)
assert.match(affirmations, /useShareSheet\(\)/);
assert.match(affirmations, /testID="share-open-afirmacao"/);
assert.match(affirmations, /campaign: 'afirmacao'/);
// folha: Modal com a prévia escalada; no site o cartão em tamanho real fora da tela, capturado antes do toque
assert.match(shareSheet, /<Modal/);
assert.match(shareSheet, /testID="share-sheet-preview"/);
assert.match(shareSheet, /scale: previewWidth \/ SHARE_CARD_LAYOUT_SIZE\.width/);
assert.match(shareSheet, /testID="share-capture-card"/);
assert.match(shareSheet, /left: -10000/);
assert.match(shareSheet, /createAffirmationShareFile\(\{ viewRef: captureRef/);
assert.match(shareSheet, /captureShareImage\(\{ viewRef: previewRef/);
// captura: JPEG 1080×1920 (pontos no iOS)
assert.match(shareHelper, /format: 'jpg'/);
assert.match(shareHelper, /width: AFFIRMATION_SHARE_CAPTURE_SIZE\.width \/ scale/);
assert.match(shareHelper, /height: AFFIRMATION_SHARE_CAPTURE_SIZE\.height \/ scale/);
assert.match(shareHelper, /Platform\.OS === 'ios'/);
assert.match(shareHelper, /new File/);
// envio: navigator.share com arquivo (site) ou download + link; expo-sharing com mime (app); cancelar = cancelled;
// o arquivo do app sai do cache depois (Android 90 s)
assert.match(shareContent, /nav\.share/);
assert.match(shareContent, /nav\.canShare\(\{ files: \[file\] \}\) === true/);
assert.match(shareContent, /downloadWithLink/);
assert.match(shareContent, /Sharing\.isAvailableAsync\(\)/);
assert.match(shareContent, /Sharing\.shareAsync/);
assert.match(shareContent, /STATUS\.CANCELLED/);
assert.match(shareContent, /ANDROID_GRACE_MS = 90_000/);

assert.match(deployGuard, /JOURNEY_VISUAL_COUNT = 19/);
assert.match(migration, /\('visual', 176, 352, array\[8\]::smallint\[\], true\)/i);
assert.doesNotMatch(migration.slice(migration.indexOf('on conflict')), /enabled\s*=\s*true/i);

const personalJourney = require(path.join(root, 'utils', 'personalJourney'));
const manifestationId = 'm-test';
const journeySuiteByLang = personalJourney.buildPersonalJourneySuites({
  desire: 'Uma vida serena',
  profile: {},
  originLang: 'pt',
});
const state = {
  lang: 'pt',
  anchorSceneId: manifestationId,
  manifestations: [{
    id: manifestationId,
    journeySuiteByLang,
    journeyVisuals: {
      'vision:Love': { cacheKey: 'visual-primary-test-1234' },
      'vision:Love:secondary': { cacheKey: 'visual-secondary-test-1234' },
    },
    journeyStoryEditsByLang: {
      pt: { 'vision:Love': 'Primeira frase pessoal. Segunda frase pessoal.' },
    },
  }],
};
const vision = personalJourney.personalJourneyItemsForState(state, 'vision', 'pt')[0];
assert.strictEqual(vision.story, 'Primeira frase pessoal. Segunda frase pessoal.');
assert.strictEqual(vision.userEdited, true);
assert.strictEqual(vision.visualKey, 'visual-primary-test-1234');
assert.strictEqual(vision.secondaryVisualKey, 'visual-secondary-test-1234');
assert.match(vision.secondaryVisualStatusKey, /vision:Love:secondary$/);

console.log('OK: frases sincronizadas, duas imagens, edicao, Proximo e share 9:16 verificados');
