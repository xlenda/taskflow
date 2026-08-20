import React from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { ThemeProvider, useTheme } from './ui/theme';
import { AppProvider, useApp } from './context/AppContext';
import { useT } from './utils/useT';

import HomeScreen from './screens/HomeScreen';
import ManifestationScreen from './screens/ManifestationScreen';
import VisionsScreen from './screens/VisionsScreen';
import VisionPlayerScreen from './screens/VisionPlayerScreen';
import AffirmationsScreen from './screens/AffirmationsScreen';
import JourneyScreen from './screens/JourneyScreen';

import WelcomeScreen from './screens/onboarding/WelcomeScreen';
import ReferralScreen from './screens/onboarding/ReferralScreen';
import NotificationsScreen from './screens/onboarding/NotificationsScreen';
import GrowScreen from './screens/onboarding/GrowScreen';
import ChatOnboardingScreen from './screens/onboarding/ChatOnboardingScreen';
import PaywallScreen from './screens/onboarding/PaywallScreen';

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

// Portão de onboarding: enquanto a pessoa não termina o fluxo, o stack raiz
// mostra o onboarding; concluir o paywall vira state.onboardingDone.
// Enquanto o estado carrega não renderizamos NENHUM texto (return null), então
// não existe string de loading para traduzir aqui.
function RootNav() {
  const { state, loading } = useApp();
  // O <html lang> vem "en" do export do Expo. Com o app em português isso faz
  // leitor de tela ler com fonética errada e o navegador oferecer tradução
  // (que quebra o React). Segue o idioma real do app.
  React.useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && state && state.lang) {
      document.documentElement.lang = state.lang === 'pt' ? 'pt-BR' : 'en';
    }
  }, [state && state.lang]);
  if (loading || !state) return null;
  const onboarded = !!state.onboardingDone;
  return (
    <Root.Navigator screenOptions={{ headerShown: false }}>
      {onboarded ? (
        <Root.Screen name="Main" component={Tabs} />
      ) : (
        <>
          <Root.Screen name="Welcome" component={WelcomeScreen} />
          <Root.Screen name="Referral" component={ReferralScreen} />
          <Root.Screen name="Notifications" component={NotificationsScreen} />
          <Root.Screen name="Grow" component={GrowScreen} />
          <Root.Screen name="ChatOnboarding" component={ChatOnboardingScreen} />
          <Root.Screen name="Paywall" component={PaywallScreen} />
        </>
      )}
    </Root.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider
          theme="cloud"
          accent="#4A80C9"
          accents={['#5E93D8', '#8B7ED8', '#4DB6A4', '#E8B04E', '#E38B67', '#7FA88F']}
        >
          <AppProvider>
            <StatusBar style="dark" />
            <NavigationContainer>
              <RootNav />
            </NavigationContainer>
          </AppProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
