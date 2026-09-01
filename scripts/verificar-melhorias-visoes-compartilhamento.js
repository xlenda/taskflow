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
  'components/AffirmationShareCard.js',
  'components/GradientCover.js',
  'utils/shareAffirmationCard.js',
  'utils/personalJourney.js',
  'context/AppContext.js',
];
files.forEach(parse);

const player = read('screens/VisionPlayerScreen.js');
const affirmations = read('screens/AffirmationsScreen.js');
const shareCard = read('components/AffirmationShareCard.js');
const shareHelper = read('utils/shareAffirmationCard.js');
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

assert.match(shareCard, /AFFIRMATION_SHARE_ASPECT_RATIO = 9 \/ 16/);
assert.match(shareCard, /AFFIRMATION_SHARE_LAYOUT_SIZE = Object\.freeze\(\{ width: 360, height: 640 \}\)/);
assert.match(shareCard, /APP_NAME/);
assert.match(shareCard, /APP_URL/);
assert.match(shareCard, /visualKey=\{visualKey\}/);
assert.match(shareCard, /imageTransition=\{0\}/);
assert.ok((shareCard.match(/maxFontSizeMultiplier=\{1\}/g) || []).length >= 4);
assert.match(affirmations, /<Modal/);
assert.match(affirmations, /affirmation-share-preview-submit/);
assert.match(affirmations, /sharePreviewScale/);
assert.match(affirmations, /createAffirmationShareFile/);
assert.match(affirmations, /shareAffirmationCard/);
assert.match(affirmations, /shareTextFallback/);
assert.match(affirmations, /shareCardSignature/);
assert.match(affirmations, /shareCardSignatureRef\.current !== captureSignature/);
assert.match(affirmations, /preparedShareSignature === shareCardSignature/);
assert.match(affirmations, /testID="affirmation-share-capture-card"/);
assert.match(affirmations, /left: -10000/);
assert.match(shareHelper, /format: 'jpg'/);
assert.match(shareHelper, /width: AFFIRMATION_SHARE_CAPTURE_SIZE\.width \/ scale/);
assert.match(shareHelper, /height: AFFIRMATION_SHARE_CAPTURE_SIZE\.height \/ scale/);
assert.match(shareHelper, /Platform\.OS === 'ios'/);
assert.match(shareHelper, /`file:\/\/\$\{temporaryUri\}`/);
assert.match(shareHelper, /Sharing\.isAvailableAsync\(\)/);
assert.match(shareHelper, /Sharing\.shareAsync/);
assert.match(shareHelper, /releaseCapture/);
assert.match(shareHelper, /setTimeout\(releaseTemporaryCapture, 90_000\)/);
assert.match(shareHelper, /new File/);
assert.match(shareHelper, /nav\.share/);
assert.match(shareHelper, /nav\.canShare\(\{ files: \[jpeg\] \}\) === true/);
assert.match(shareHelper, /downloadFile/);
assert.match(shareHelper, /AFFIRMATION_SHARE_STATUS\.CANCELLED/);

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
