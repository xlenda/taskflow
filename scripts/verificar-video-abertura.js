const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const videoPath = path.join(root, 'public', 'video', 'celeste-abertura.mp4');
const posterPath = path.join(root, 'public', 'video', 'celeste-abertura-poster.jpg');
const componentPath = path.join(root, 'components', 'WelcomeVideo.js');
const brandPath = path.join(root, 'constants', 'brand.js');
const welcomePath = path.join(root, 'screens', 'onboarding', 'WelcomeScreen.js');
const onboardingUiPath = path.join(root, 'screens', 'onboarding', 'onboardingUI.js');
const deployScriptPath = path.join(root, 'scripts', 'deploy-celeste.js');
const deployBashPath = path.join(root, 'scripts', 'deploy-web.sh');

const video = fs.readFileSync(videoPath);
const poster = fs.readFileSync(posterPath);
const component = fs.readFileSync(componentPath, 'utf8');
const brand = fs.readFileSync(brandPath, 'utf8');
const welcome = fs.readFileSync(welcomePath, 'utf8');
const onboardingUi = fs.readFileSync(onboardingUiPath, 'utf8');
const deployScript = fs.readFileSync(deployScriptPath, 'utf8');
const deployBash = fs.readFileSync(deployBashPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const binary = video.toString('latin1');

assert.ok(video.length > 100_000, 'video de abertura parece vazio');
assert.ok(video.length < 750_000, `video de abertura pesado: ${video.length} bytes`);
assert.ok(binary.includes('avc1'), 'video precisa estar em H.264/avc1');
assert.ok(binary.includes('mp4a'), 'video precisa ter audio AAC/mp4a');
assert.ok(binary.indexOf('moov') > 0, 'atom moov ausente');
assert.ok(binary.indexOf('mdat') > 0, 'atom mdat ausente');
assert.ok(binary.indexOf('moov') < binary.indexOf('mdat'), 'faststart ausente: moov vem depois de mdat');
assert.ok(poster.length < 100_000, 'poster da abertura esta pesado');
assert.strictEqual(poster[0], 0xff, 'poster nao e JPEG');
assert.strictEqual(poster[1], 0xd8, 'poster nao e JPEG');
assert.ok(packageJson.dependencies && packageJson.dependencies['expo-video'], 'expo-video nao instalado');
assert.ok(component.includes('nativeControls={false}'), 'abertura nao pode exibir controles nativos');
assert.ok(component.includes('fullscreenOptions={{ enable: false }}'), 'abertura precisa usar o contrato atual de fullscreen');
assert.ok(!component.includes('allowsFullscreen='), 'prop removida allowsFullscreen voltou para a abertura');
assert.ok(component.includes('reduceMotion'), 'abertura precisa respeitar reduzir movimento');
assert.ok(component.includes("Platform.OS === 'web' || firstFrame"), 'cache web pode esconder o video atras do poster');
assert.ok(component.includes('[150, 700, 1800]'), 'repeticao de autoplay mobile ausente');
assert.ok(component.includes('videoViewRef.current?.nativeRef?.current'), 'play web nao captura a Promise nativa');
assert.ok(component.includes('setMotionOverride(true)'), 'toque nao recupera autoplay bloqueado');
assert.ok(component.includes('celeste-opening-video'), 'testID da abertura ausente');
assert.ok(component.includes('celeste-opening-sound'), 'controle de som da abertura ausente');
assert.ok(component.includes("const startsWithSound = Platform.OS !== 'web'"), 'app instalado deve iniciar a abertura com som');
assert.ok(component.includes('instance.muted = !startsWithSound'), 'web e app instalado nao separam a regra de autoplay');
assert.ok(component.includes('player.muted = !nextSoundOn'), 'controle de som nao atualiza o player');
assert.ok(component.includes('video.muted = !nextSoundOn'), 'controle de som nao atualiza o video web');
assert.ok(component.includes('if (nextSoundOn) player.currentTime = 0'), 'ao liberar o som, a abertura precisa recomecar');
assert.ok(component.includes('accessibilityLabel={soundLabel}'), 'controle de som precisa ser um botao acessivel');
assert.ok(component.includes("player.addListener('playToEnd', onFinished)"), 'fim do video nao avanca a abertura');
assert.ok(component.includes('player.loop = loop'), 'configuracao de loop nao chega ao player');
assert.ok(component.includes('fullBleed && styles.fullBleed'), 'modo de abertura sem bordas ausente');
assert.ok(component.includes("const mediaFit = 'contain'"), 'abertura nao pode recortar o personagem');
assert.ok(component.includes("width: '100%'"), 'video precisa preencher a largura responsiva');
assert.ok(component.includes("height: '100%'"), 'video precisa preencher a altura responsiva');
assert.ok(brand.includes("welcomeBackground: '#759ACE'"), 'cor medida da abertura esta ausente');
assert.ok(component.includes('ONB.welcomeBackground'), 'fundo do video nao acompanha a abertura');
assert.ok(welcome.includes('colors={[ONB.welcomeBackground, ONB.welcomeBackground]}'), 'tela inicial nao usa a cor do video');
assert.ok(welcome.includes('useWindowDimensions()'), 'abertura nao acompanha as dimensoes da tela');
assert.ok(welcome.includes('width={width}'), 'abertura nao ocupa a largura da tela');
assert.ok(welcome.includes('height={height}'), 'abertura nao ocupa a altura da tela');
assert.ok(welcome.includes('fullBleed'), 'video nao esta configurado como abertura em tela inteira');
assert.ok(welcome.includes('loop={false}'), 'video de abertura nao pode repetir');
assert.ok(welcome.includes('onFinished={finishOpening}'), 'tela nao avanca quando o video termina');
assert.ok(welcome.includes('testID="celeste-opening-skip"'), 'botao de pular abertura ausente');
assert.ok(welcome.includes('onPress={finishOpening}'), 'botao de pular nao avanca a abertura');
assert.ok(welcome.includes("setPhase('welcome')"), 'transicao para o restante do app ausente');
assert.ok(welcome.includes('OPENING_FALLBACK_MS'), 'fallback da transicao de abertura ausente');
assert.ok(onboardingUi.includes('colors = ONB.gradient'), 'OnbScreen perdeu o fundo padrao das outras telas');
assert.ok(deployScript.includes('background:#759ACE'), 'deploy nao usa a cor do video no splash');
assert.ok(deployBash.includes('deploy-celeste.js'), 'wrapper Bash nao usa a esteira unica');
assert.strictEqual(
  packageJson.scripts && packageJson.scripts['deploy:web'],
  'node scripts/deploy-celeste.js',
  'npm deploy:web nao usa a esteira JavaScript autoritativa'
);

console.log(
  `Abertura aprovada: ${(video.length / 1024).toFixed(0)} KB, H.264 + AAC faststart, poster ${(poster.length / 1024).toFixed(0)} KB`
);
