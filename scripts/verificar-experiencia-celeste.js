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
const manifestation = read('screens/ManifestationScreen.js');
const visionPlayer = read('screens/VisionPlayerScreen.js');
const visions = read('screens/VisionsScreen.js');
const affirmations = read('screens/AffirmationsScreen.js');
const context = read('context/AppContext.js');
const gradientCover = read('components/GradientCover.js');
const affirmationCard = read('components/AffirmationCard.js');
const visualStorage = read('services/personalVisualStorage.js');
const legal = read('constants/legal.js');
const chat = read('screens/onboarding/ChatOnboardingScreen.js');
const reveal = read('screens/onboarding/RevealScreen.js');

for (const file of [
  'App.js',
  'screens/HomeScreen.js',
  'screens/JourneyScreen.js',
  'screens/MorningRitualScreen.js',
  'screens/CommunityScreen.js',
  'screens/ProfileScreen.js',
  'screens/ManifestationScreen.js',
  'screens/VisionPlayerScreen.js',
  'screens/VisionsScreen.js',
  'screens/AffirmationsScreen.js',
  'context/AppContext.js',
  'components/GradientCover.js',
  'components/AffirmationCard.js',
  'services/personalVisualStorage.js',
  'utils/usePersonalVisual.js',
  'screens/AffirmationAlarmScreen.js',
  'screens/onboarding/ChatOnboardingScreen.js',
  'screens/onboarding/RevealScreen.js',
  'services/affirmationAlarm.js',
  'services/communityStories.js',
]) {
  compile(file);
}

assert.strictEqual((app.match(/<Tab\.Screen/g) || []).length, 5, 'app deve ter cinco abas principais');
assert.ok(app.includes('<Root.Screen name="MorningRitual"'), 'sonhos devem ser rota raiz');
assert.ok(app.includes('<Root.Screen name="AffirmationAlarm"'), 'despertador deve ser rota raiz separada');
assert.ok(/<Tab\.Screen\s+name="Community"/.test(app), 'comunidade deve ser uma aba principal');
for (const tabId of ['tab-manifest', 'tab-visions', 'tab-affirmations', 'tab-journey', 'tab-community']) {
  assert.ok(app.includes(`tabBarTestID: '${tabId}'`), `aba sem identificador estavel: ${tabId}`);
}
assert.ok(!app.includes('<Root.Screen name="Community"'), 'comunidade nao pode ter rota raiz duplicada');
assert.ok(app.includes('tabBarHideOnKeyboard: true'), 'teclado deve liberar o compositor da comunidade');
assert.ok(app.includes('<Root.Screen name="Profile"'), 'perfil deve ser rota raiz');
assert.ok(app.includes("MorningRitual: 'sonhos'"), 'deep link dos sonhos ausente');
assert.ok(app.includes("AffirmationAlarm: 'despertar'"), 'deep link do despertador ausente');
assert.ok(app.includes("Community: 'comunidade'"), 'deep link da comunidade ausente');
assert.ok(app.includes("Profile: 'perfil'"), 'deep link do perfil ausente');

assert.ok(
  home.includes('testID="open-dream-journal"') &&
    home.includes("navigation.navigate('MorningRitual', { focus: 'dream' })"),
  'Home precisa abrir o relato de sonho diretamente'
);
assert.ok(home.includes('testID="open-profile"'), 'Home precisa abrir o perfil');
assert.ok(
  home.includes('sentRef.current === title') &&
    home.includes('sentRef.current = title') &&
    home.indexOf('sentRef.current = title') < home.indexOf('const id = await addManifestation'),
  'toque duplo nao pode iniciar duas geracoes do mesmo desejo pessoal'
);
assert.ok(
  !/\b(?:TRENDING|FOR_YOU|templateId)\b/.test(home) &&
    !/\b(?:TRENDING|FOR_YOU|templateId|findForYouById|addManifestation)\b/.test(manifestation) &&
    manifestation.includes('state.manifestations.find((m) => m.id === routeId)'),
  'Home e detalhe devem usar somente manifestacoes pessoais salvas por id'
);
assert.ok(
  visionPlayer.includes('usePersonalNarration') &&
    visionPlayer.includes('playPersonal') &&
    !visionPlayer.includes('utils/speech'),
  'player de visao pessoal precisa usar a voz neural escolhida no contexto'
);
assert.ok(
  manifestation.includes('await getAffirmationAlarmCapability()') &&
    manifestation.includes('await cancelAffirmationAlarm()') &&
    manifestation.indexOf('await cancelAffirmationAlarm()') <
      manifestation.indexOf('removeManifestation(saved.id)'),
  'apagar manifestacao usada no despertador deve cancelar o AlarmKit primeiro'
);
assert.ok(
  manifestation.includes('afirmacao !== state.morningRitual?.wakeAffirmationText') &&
    manifestation.includes('lang !== state.morningRitual?.wakeAffirmationLang'),
  'editar manifestacao deve comparar com o conteudo realmente gravado no despertador'
);
assert.ok(
  app.includes('<NativeAlarmContentSync />') &&
    app.includes('function NativeAlarmContentSync()') &&
    app.includes('replaceScheduledAffirmationAlarm'),
  'idioma e afirmacao do despertador devem sincronizar no nivel global do app'
);
assert.ok(
  context.includes('const usedAsAlarm = s.morningRitual?.wakeAffirmationId === alarmId') &&
    context.includes("wakeAffirmationText: ''"),
  'provider deve remover a copia privada da afirmacao apagada'
);
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
  journey.includes('await getAffirmationAlarmCapability()') &&
    journey.includes('alarmCapability?.supported === true'),
  'recomecar deve consultar o AlarmKit mesmo se o estado local disser que o alarme esta desligado'
);
assert.ok(
  journey.includes('const reset = await resetAll()') && journey.includes('if (!reset)'),
  'recomecar deve esperar e conferir a limpeza local antes de confirmar sucesso'
);
assert.ok(
  journey.includes('CELESTE_BACKUP_MAX_BYTES, useApp') &&
    journey.includes('file.size > CELESTE_BACKUP_MAX_BYTES') &&
    journey.includes('const serialized = await exportStateJson()'),
  'backup gigante deve ser recusado antes do FileReader'
);
assert.ok(
  journey.includes('stopNarration();') && journey.includes('clearAudioCache();'),
  'recomecar deve interromper e apagar o audio pessoal em memoria'
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
assert.ok(!community.includes('testID="community-back"'), 'aba Comunidade nao deve exibir seta Voltar');
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
  affirmations.includes('const populatedCategories = useMemo') &&
    affirmations.includes('...populatedCategories.map'),
  'afirmacoes devem mostrar apenas categorias com conteudo pessoal'
);
assert.ok(
  visions.includes('const populatedCategories = useMemo') &&
    visions.includes("activeFilter === 'All'") &&
    !visions.includes("category: item.category || 'Wealth'"),
  'visoes devem filtrar categorias pessoais sem fallback silencioso para prosperidade'
);
assert.ok(
  profile.includes("navigation.addListener('beforeRemove'") && profile.includes('setDocument(null)'),
  'Voltar deve fechar o documento legal antes de sair do Perfil'
);
assert.ok(
  chat.includes('DRAFT_READ_TIMEOUT_MS') &&
    chat.includes('if (!draftLoaded)') &&
    chat.includes('draftInteractionRef.current') &&
    chat.includes('!draftInteractionRef.current'),
  'quiz deve liberar com seguranca e aceitar rascunho tardio apenas antes da interacao'
);

assert.ok(
  context.includes('cloudPersonalization: false') &&
    context.includes('cloudAdultConfirmed: false') &&
    context.includes('cloudDreamConsent: false') &&
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
assert.ok(
  context.includes('const ensurePersonalVisual = useCallback') &&
    context.includes('personalVisualRequestsRef') &&
    context.includes('personalVisualFailuresRef') &&
    context.includes('await acquirePersonalVisual(existingKey)') &&
    context.includes("phase: 'pending'") &&
    context.includes("phase: 'error'") &&
    context.includes('savePersonalVisual') &&
    context.includes('createPersonalVisualCacheKey') &&
    context.includes('base64: visual.image.data') &&
    context.includes('generationEpoch !== generationEpochRef.current'),
  'visual pessoal precisa reparar cache, deduplicar, expor estado e respeitar reset tardio'
);
assert.ok(
  context.includes('const editedSnapshot = snapshotManifestationContent(next)') &&
    context.includes('...editedSnapshot.generation') &&
    context.includes("source: 'user-edited'") &&
    context.includes('changesVisualSubject') &&
    context.includes('deletePersonalVisual(saved.visual.cacheKey)'),
  'edicao pessoal deve preservar o recibo da base sem fingir que o texto continua remoto'
);
assert.ok(
  context.includes('clearPersonalVisuals()') &&
    context.includes("'generated-image-files'") &&
    context.includes('visual: sanitizePersonalVisualReceipt(m.visual)'),
  'reset, backup e hidratacao precisam tratar a imagem pessoal como arquivo privado do aparelho'
);
assert.ok(
  visualStorage.includes("new Directory(Paths.document, NATIVE_DIRECTORY)") &&
    visualStorage.includes("file.write(base64, { encoding: 'base64' })") &&
    visualStorage.includes('indexedDB.open') &&
    !visualStorage.includes('AsyncStorage'),
  'imagem pessoal deve morar em arquivo/IndexedDB, nunca dentro do estado textual'
);
assert.ok(
  gradientCover.includes("import { Image } from 'expo-image'") &&
    gradientCover.includes('visualKey') &&
    gradientCover.includes("'rgba(4,10,18,0.56)'") &&
    affirmationCard.includes('visualKey={visualKey}') &&
    affirmationCard.includes('personal-visual-retry') &&
    affirmationCard.includes('textShadowColor'),
  'cards pessoais precisam usar a foto com veu central, texto legivel e retry visivel'
);
assert.ok(
  visions.includes('visualKey={vision.visualKey}') &&
    visionPlayer.includes('visualKey={vision.visualKey}') &&
    affirmations.includes('visualKey={current.visualKey}') &&
    affirmations.includes('ensurePersonalVisual(current.manifestationId)') &&
    reveal.includes('testID="reveal-personal-visual"') &&
    reveal.includes('visualKey={m.visual.cacheKey}'),
  'visual pessoal precisa aparecer e se autorreparar em afirmacoes, visoes e Reveal'
);
assert.ok(legal.includes('reconhecimento de voz') && legal.includes('afirmação escolhida como som do despertador'));

console.log('OK: despertador, bônus de sonho, Perfil, Comunidade, privacidade e navegação integrados');
