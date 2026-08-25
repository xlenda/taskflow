const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const typewriter = fs.readFileSync(path.join(root, 'components', 'Typewriter.js'), 'utf8');
const onboarding = fs.readFileSync(
  path.join(root, 'screens', 'onboarding', 'ChatOnboardingScreen.js'),
  'utf8'
);

assert.ok(typewriter.includes('onCharacterRef.current(fullText[index], index)'), 'Typewriter nao avisa cada caractere');
assert.ok(onboarding.includes('onCharacter={pulseForCharacter}'), 'perguntas nao ligaram a haptica');
assert.ok(!typewriter.includes('fastMode') && !onboarding.includes('fastMode'), 'fastMode persistente voltou ao fluxo');
assert.match(
  onboarding,
  /useEffect\(\(\) => \{[\s\S]*?setInstant\(false\);[\s\S]*?\}, \[idx\]\);/,
  'cada etapa precisa restaurar a digitacao normal'
);
assert.match(
  onboarding,
  /const goNext = async \(ans\) => \{[\s\S]*?setInstant\(false\);[\s\S]*?setIdx\(i\);/,
  'instant precisa ser limpo antes da proxima etapa montar'
);
assert.ok(onboarding.includes('navigator.vibrate(8)'), 'pulso web de 8 ms ausente');
assert.ok(
  onboarding.includes("Platform.OS === 'android'") &&
    onboarding.includes('Haptics.AndroidHaptics.Keyboard_Tap'),
  'Android nao usa Keyboard_Tap'
);
assert.ok(onboarding.includes('Haptics.selectionAsync()'), 'pulso iOS selectionAsync ausente');
assert.ok(onboarding.includes('lastTypingPulse'), 'protecao contra rajadas de vibracao ausente');
assert.ok(typewriter.includes('testID="typing-character-pulse"'), 'micro movimento da letra ausente');
assert.ok(
  typewriter.includes('translateY: entrance.interpolate') &&
    typewriter.includes('scale: entrance.interpolate') &&
    typewriter.includes('opacity: entrance.interpolate'),
  'micro movimento nao combina deslocamento, escala e opacidade'
);
assert.ok(onboarding.includes('characterMotion={!reduceMotion}'), 'movimento nao respeita reduzir movimento');
assert.ok(onboarding.includes('|| reduceMotion) return;'), 'haptica nao respeita reduzir movimento');
assert.ok(
  onboarding.includes('AccessibilityInfo.isReduceMotionEnabled()') &&
    onboarding.includes("AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)"),
  'preferencia de movimento reduzido nao e acompanhada'
);

console.log('Haptica de digitacao aprovada: reinicio por etapa, web 8 ms, Android/iOS e movimento reduzido');
