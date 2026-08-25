const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { transformSync } = require('@babel/core');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const compile = (file) =>
  transformSync(read(file), {
    filename: path.join(root, file),
    presets: ['babel-preset-expo'],
    sourceType: 'module',
  });

const app = read('App.js');
const home = read('screens/HomeScreen.js');
const journey = read('screens/JourneyScreen.js');
const morning = read('screens/MorningRitualScreen.js');
const community = read('screens/CommunityScreen.js');
const profile = read('screens/ProfileScreen.js');
const context = read('context/AppContext.js');
const legal = read('constants/legal.js');
const chat = read('screens/onboarding/ChatOnboardingScreen.js');

for (const file of [
  'App.js',
  'screens/HomeScreen.js',
  'screens/JourneyScreen.js',
  'screens/MorningRitualScreen.js',
  'screens/CommunityScreen.js',
  'screens/ProfileScreen.js',
  'screens/onboarding/ChatOnboardingScreen.js',
  'services/affirmationAlarm.js',
  'services/communityStories.js',
]) {
  compile(file);
}

assert.strictEqual((app.match(/<Tab\.Screen/g) || []).length, 4, 'app deve manter quatro abas principais');
assert.ok(app.includes('<Root.Screen name="MorningRitual"'), 'despertador deve ser rota raiz');
assert.ok(app.includes('<Root.Screen name="Community"'), 'comunidade deve ser rota raiz');
assert.ok(app.includes('<Root.Screen name="Profile"'), 'perfil deve ser rota raiz');
assert.ok(app.includes("MorningRitual: 'despertar'"), 'deep link do despertador ausente');
assert.ok(app.includes("Community: 'comunidade'"), 'deep link da comunidade ausente');
assert.ok(app.includes("Profile: 'perfil'"), 'deep link do perfil ausente');

assert.ok(
  home.includes('testID="open-dream-journal"') &&
    home.includes("navigation.navigate('MorningRitual', { focus: 'dream' })"),
  'Home precisa abrir o relato de sonho diretamente'
);
assert.ok(home.includes('testID="open-profile"'), 'Home precisa abrir o perfil');
assert.ok(
  home.includes('isUnder18Age(currentProfile.age)') &&
    home.includes('cloudAdultConfirmed = cloudPersonalization') &&
    home.includes('cloudPersonalization, cloudAdultConfirmed'),
  'nova manifestacao na Home deve respeitar idade e consentimento adulto completo'
);
assert.ok(journey.includes('testID="journey-open-community"'), 'Jornada precisa abrir a comunidade');
assert.ok(journey.includes('testID="journey-open-profile"'), 'Jornada precisa abrir o perfil');
assert.ok(!journey.includes('gemini-personalization-switch'), 'configuracao Gemini duplicada na Jornada');
assert.ok(
  journey.includes('await cancelAffirmationAlarm()') && journey.includes('if (!cancelled.ok)'),
  'recomecar deve desligar o despertador nativo antes de apagar os dados'
);
assert.ok(
  journey.includes('const reset = await resetAll()') && journey.includes('if (!reset)'),
  'recomecar deve esperar e conferir a limpeza local antes de confirmar sucesso'
);

assert.ok(morning.includes('custom-wake-affirmation'), 'afirmacao livre para o despertador ausente');
assert.ok(morning.includes('scheduleAffirmationAlarm'), 'tela nao esta ligada ao alarme nativo');
assert.ok(morning.includes('response.ok === true'), 'alarme ativo exige confirmacao nativa');
assert.ok(morning.includes('removeDreamRitual'), 'sonho precisa de exclusao individual');
assert.ok(
  morning.includes("route?.params?.focus !== 'dream'") && morning.includes('openDreamSection()'),
  'rota do sonho precisa abrir o formulario em um toque'
);
assert.ok(community.includes('deleteCommunityStory'), 'relato precisa de exclusao pela autora');
assert.ok(profile.includes('profile-privacy-link') && profile.includes('profile-terms-link'), 'documentos legais ausentes');
assert.ok(
  community.includes('refreshRequestRef.current !== requestId'),
  'uma resposta antiga da Comunidade nao pode substituir uma atualizacao nova'
);
assert.ok(
  community.includes('await refresh({ clearError: response.ok })') &&
    community.includes('if (!response.ok) setError(t(S.deleteFailed))'),
  'falha ao apagar relato nao pode ser apagada pelo refresh'
);
assert.ok(
  profile.includes("navigation.addListener('beforeRemove'") && profile.includes('setDocument(null)'),
  'Voltar deve fechar o documento legal antes de sair do Perfil'
);
assert.ok(
  chat.includes('DRAFT_READ_TIMEOUT_MS') && chat.includes('if (!draftLoaded)') && chat.includes('!finished'),
  'quiz deve bloquear interacao ate restaurar o rascunho, sem aplicar leitura atrasada'
);

assert.ok(
  context.includes('cloudPersonalization: false') &&
    context.includes('cloudAdultConfirmed: false') &&
    context.includes('!isKnownMinor(profile)') &&
    context.includes('Consentimento para enviar respostas'),
  'backup importado nunca pode reativar Gemini'
);
assert.ok(
  context.includes('generationEpochRef') &&
    context.includes('AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS)') &&
    context.includes('await writerRef.current.waitFor(revision'),
  'reset precisa invalidar geracoes, limpar chaves auxiliares e confirmar a gravacao principal'
);
assert.ok(legal.includes('reconhecimento de voz') && legal.includes('afirmação escolhida como som do despertador'));

console.log('OK: despertador, bônus de sonho, Perfil, Comunidade, privacidade e navegação integrados');
