import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { ThemeProvider, useSetTheme, useTheme } from './ui/theme';
import { AppProvider, useApp } from './context/AppContext';
import { useT } from './utils/useT';
import { warmUpVoices } from './utils/speech';
import { detectLang } from './constants/i18n';

import HomeScreen from './screens/HomeScreen';
import ManifestationScreen from './screens/ManifestationScreen';
import VisionsScreen from './screens/VisionsScreen';
import VisionPlayerScreen from './screens/VisionPlayerScreen';
import AffirmationsScreen from './screens/AffirmationsScreen';
import JourneyScreen from './screens/JourneyScreen';
import CommunityScreen from './screens/CommunityScreen';
import MorningRitualScreen from './screens/MorningRitualScreen';
import ProfileScreen from './screens/ProfileScreen';

import WelcomeScreen from './screens/onboarding/WelcomeScreen';
import ReferralScreen from './screens/onboarding/ReferralScreen';
import NotificationsScreen from './screens/onboarding/NotificationsScreen';
import GrowScreen from './screens/onboarding/GrowScreen';
import ChatOnboardingScreen from './screens/onboarding/ChatOnboardingScreen';
import RevealScreen from './screens/onboarding/RevealScreen';
import PaywallScreen from './screens/onboarding/PaywallScreen';

import { APP_NAME, APP_URL } from './constants/brand';

// O Google Tradutor do Chrome reescreve os nós de texto do DOM e quebra o React
// no meio da digitação (texto trocado/cortado, chips e inputs que nunca chegam
// a aparecer). O app já é bilíngue nativo — tradução automática só destrói.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.documentElement.setAttribute('translate', 'no');
  document.documentElement.classList.add('notranslate');
  const meta = document.createElement('meta');
  meta.name = 'google';
  meta.content = 'notranslate';
  document.head.appendChild(meta);
  if (!document.getElementById('celeste-viewport-lock')) {
    const viewportLock = document.createElement('style');
    viewportLock.id = 'celeste-viewport-lock';
    viewportLock.textContent =
      'html,body,#root,#root>div{height:100dvh!important;max-height:100dvh!important;min-height:0!important;overflow:hidden!important}';
    document.head.appendChild(viewportLock);
  }
}

// Rótulos das abas. O `name` de cada Tab.Screen é chave técnica usada em
// navigate() e NUNCA muda — só o `title`, que é o que a pessoa lê.
const S = {
  tabManifest: { en: 'Manifest', pt: 'Manifestar' },
  tabVisions: { en: 'Visions', pt: 'Visões' },
  tabAffirm: { en: 'Affirmations', pt: 'Afirmações' },
  tabJourney: { en: 'Journey', pt: 'Jornada' },
};

const Tab = createBottomTabNavigator();
const HomeStack = createStackNavigator();
const VisionStack = createStackNavigator();
const Root = createStackNavigator();

function PersistenceNotice() {
  const { state, storageError, retryPersist } = useApp();
  const insets = useSafeAreaInsets();
  const [retrying, setRetrying] = React.useState(false);

  if (!state || !storageError) return null;
  const pt = state.lang === 'pt';
  const retry = async () => {
    setRetrying(true);
    await retryPersist();
    setRetrying(false);
  };

  return (
    <View pointerEvents="box-none" style={[styles.persistenceLayer, { top: Math.max(insets.top, 8) + 8 }]}>
      <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.persistenceNotice}>
        <Ionicons name="cloud-offline-outline" size={21} color="#FFFFFF" />
        <Text style={styles.persistenceText}>
          {pt
            ? 'Não conseguimos guardar suas últimas mudanças neste aparelho.'
            : 'We could not save your latest changes on this device.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={retrying}
          onPress={retry}
          style={({ pressed }) => [styles.persistenceButton, pressed && styles.persistencePressed]}
        >
          <Ionicons name="refresh" size={17} color="#20314F" />
          <Text style={styles.persistenceButtonText}>
            {retrying ? (pt ? 'Tentando…' : 'Retrying…') : pt ? 'Tentar novamente' : 'Try again'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function PersistedTheme() {
  const { state } = useApp();
  const setTheme = useSetTheme();

  React.useEffect(() => {
    if (state && state.mood) setTheme(state.mood);
  }, [state && state.mood, setTheme]);

  return null;
}

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="Manifestation" component={ManifestationScreen} />
    </HomeStack.Navigator>
  );
}

function VisionStackNav() {
  return (
    <VisionStack.Navigator screenOptions={{ headerShown: false }}>
      <VisionStack.Screen name="VisionsMain" component={VisionsScreen} />
      <VisionStack.Screen name="VisionPlayer" component={VisionPlayerScreen} />
    </VisionStack.Navigator>
  );
}

function Tabs() {
  const theme = useTheme();
  // Tabs é componente, então pode ler o idioma pelo hook — é assim que os
  // rótulos das abas ficam em português sem tocar no `name` das rotas.
  const { t } = useT();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border || 'rgba(0,0,0,0.06)',
          borderTopWidth: 1,
          height: 84,
          paddingTop: 8,
          paddingBottom: 26,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => {
          const map = {
            Manifest: focused ? 'sparkles' : 'sparkles-outline',
            Visions: focused ? 'play-circle' : 'play-circle-outline',
            Affirm: focused ? 'heart' : 'heart-outline',
            Journey: focused ? 'stats-chart' : 'stats-chart-outline',
          };
          return <Ionicons name={map[route.name]} size={size ? size - 2 : 22} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Manifest" component={HomeStackNav} options={{ title: t(S.tabManifest) }} />
      <Tab.Screen name="Visions" component={VisionStackNav} options={{ title: t(S.tabVisions) }} />
      <Tab.Screen name="Affirm" component={AffirmationsScreen} options={{ title: t(S.tabAffirm) }} />
      <Tab.Screen name="Journey" component={JourneyScreen} options={{ title: t(S.tabJourney) }} />
    </Tab.Navigator>
  );
}

function AppBootState({ failed = false, onRetry }) {
  const pt = detectLang() === 'pt';
  return (
    <View
      testID={failed ? 'celeste-storage-recovery' : 'celeste-storage-loading'}
      accessibilityRole={failed ? 'alert' : undefined}
      style={styles.bootScreen}
    >
      <View style={styles.bootMark}>
        <Ionicons name={failed ? 'cloud-offline-outline' : 'sparkles'} size={30} color="#315F9E" />
      </View>
      <Text style={styles.bootName}>{APP_NAME}</Text>
      {failed ? (
        <>
          <Text style={styles.bootMessage}>
            {pt
              ? 'Não conseguimos acessar seus dados agora. Nada foi apagado.'
              : 'We could not access your data right now. Nothing was deleted.'}
          </Text>
          <Pressable
            testID="celeste-storage-retry"
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.bootButton, pressed && styles.persistencePressed]}
          >
            <Ionicons name="refresh" size={19} color="#FFFFFF" />
            <Text style={styles.bootButtonText}>{pt ? 'Tentar novamente' : 'Try again'}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="small" color="#315F9E" style={styles.bootSpinner} />
          <Text style={styles.bootMessage}>{pt ? 'Abrindo…' : 'Opening…'}</Text>
        </>
      )}
    </View>
  );
}

// Portão de onboarding: enquanto a pessoa não termina o fluxo, o stack raiz
// mostra o onboarding; concluir o paywall vira state.onboardingDone.
function RootNav() {
  const { state, loading, storageLoadError, retryLoad } = useApp();
  // O <html lang> vem "en" do export do Expo. Com o app em português isso faz
  // leitor de tela ler com fonética errada e o navegador oferecer tradução
  // (que quebra o React). Segue o idioma real do app.
  React.useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && state && state.lang) {
      document.documentElement.lang = state.lang === 'pt' ? 'pt-BR' : 'en';
    }
  }, [state && state.lang]);
  React.useEffect(() => {
    if (state && state.lang) warmUpVoices(state.lang, { localOnly: true });
  }, [state && state.lang]);
  if (loading) return <AppBootState />;
  if (storageLoadError || !state) return <AppBootState failed onRetry={retryLoad} />;
  const onboarded = state.onboardingDone === true;
  return (
    <Root.Navigator screenOptions={{ headerShown: false }}>
      {onboarded ? (
        <>
          <Root.Screen name="Main" component={Tabs} />
          <Root.Screen name="MorningRitual" component={MorningRitualScreen} />
          <Root.Screen name="Community" component={CommunityScreen} />
          <Root.Screen name="Profile" component={ProfileScreen} />
        </>
      ) : (
        <>
          <Root.Screen name="Welcome" component={WelcomeScreen} />
          <Root.Screen name="Referral" component={ReferralScreen} />
          <Root.Screen name="Notifications" component={NotificationsScreen} />
          <Root.Screen name="Grow" component={GrowScreen} />
          <Root.Screen name="ChatOnboarding" component={ChatOnboardingScreen} />
          <Root.Screen name="Reveal" component={RevealScreen} />
          <Root.Screen name="Paywall" component={PaywallScreen} />
        </>
      )}
    </Root.Navigator>
  );
}

// Sem linking, a URL nunca muda e o voltar do navegador sai do app inteiro
// (history.back() vai pro site anterior). Com um path por tela, o voltar anda
// tela a tela e F5 recarrega na mesma tela — o fallback SPA do Vercel já manda
// qualquer path pro index.html. Paths são chaves técnicas, não passam por i18n.
const linking = {
  prefixes: [APP_URL],
  config: {
    screens: {
      Main: {
        screens: {
          Manifest: {
            screens: {
              HomeMain: '',
              Manifestation: 'm/:id?',
            },
          },
          Visions: {
            screens: {
              VisionsMain: 'visoes',
              VisionPlayer: 'visao/:visionId',
            },
          },
          Affirm: 'afirmacoes',
          Journey: 'jornada',
        },
      },
      MorningRitual: 'despertar',
      Community: 'comunidade',
      Profile: 'perfil',
      Welcome: 'bem-vindo',
      Referral: 'convite',
      Notifications: 'notificacoes',
      Grow: 'crescer',
      ChatOnboarding: 'conversa',
      // O id faz parte do endereço para que F5 retome exatamente a cena certa;
      // sem ele, a tela se recusa a adivinhar qual história pessoal mostrar.
      Reveal: 'revelacao/:id',
      Paywall: 'oferta',
    },
  },
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <SafeAreaProvider style={{ flex: 1, minHeight: 0 }}>
        <ThemeProvider
          theme="cloud"
          accent="#4A80C9"
          accents={['#5E93D8', '#8B7ED8', '#4DB6A4', '#E8B04E', '#E38B67', '#7FA88F']}
        >
          <AppProvider>
            <PersistedTheme />
            <StatusBar style="dark" />
            <NavigationContainer linking={linking}>
              <RootNav />
            </NavigationContainer>
            <PersistenceNotice />
          </AppProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#DCE9F8',
  },
  bootMark: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#20314F',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 4,
  },
  bootName: {
    marginTop: 18,
    color: '#20314F',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  bootSpinner: { marginTop: 20 },
  bootMessage: {
    maxWidth: 360,
    marginTop: 14,
    color: '#526783',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  bootButton: {
    minWidth: 190,
    minHeight: 48,
    marginTop: 22,
    borderRadius: 8,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#315F9E',
  },
  bootButtonText: {
    marginLeft: 8,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  persistenceLayer: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 50,
    alignItems: 'center',
  },
  persistenceNotice: {
    width: '100%',
    maxWidth: 640,
    minHeight: 58,
    borderRadius: 8,
    backgroundColor: '#20314F',
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#101A2B',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  persistenceText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginHorizontal: 10,
  },
  persistenceButton: {
    minHeight: 38,
    borderRadius: 7,
    paddingHorizontal: 10,
    backgroundColor: '#F5F8FC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  persistencePressed: { opacity: 0.8 },
  persistenceButtonText: {
    color: '#20314F',
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 5,
  },
});
