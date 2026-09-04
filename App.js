import React from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  NavigationContainer,
  getStateFromPath as getNavigationStateFromPath,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { ThemeProvider, useSetTheme, useTheme } from './ui/theme';
import { AppProvider, useApp } from './context/AppContext';
import { NarrationProvider, useNarration } from './context/NarrationContext';
import { useT } from './utils/useT';
import { confirmAsync } from './utils/confirm';
import { wavBytesToBase64 } from './utils/audioBase64';
import { resolvePersonalAlarmContent } from './utils/personalAffirmations';
import { detectLang } from './constants/i18n';
import {
  CLOUD_CONSENT_VERSION,
  hasCurrentAdultCloudConsent,
} from './constants/cloudConsent';
import { RELEASE_FEATURES } from './constants/releaseFeatures';
import { initCelesteBotProtection } from './utils/botProtection';
import { redactThirdPartyNames, thirdPartyNames } from './services/generatePersonalizedScene';
import NarrationPlaybackControls from './components/NarrationPlaybackControls';
import {
  cancelOrphanedDailyRitualReminders,
  configureDailyRitualNotifications,
  initialDailyRitualNotificationUrl,
  subscribeDailyRitualNotificationUrls,
} from './services/dailyRitualReminder';
import {
  cancelPracticePlanReminders,
  configurePracticePlanNotifications,
  initialPracticePlanNotificationUrl,
  subscribePracticePlanNotificationUrls,
} from './services/practicePlanReminders';

import HomeScreen from './screens/HomeScreen';
import ManifestationScreen from './screens/ManifestationScreen';
import VisionsScreen from './screens/VisionsScreen';
import VisionPlayerScreen from './screens/VisionPlayerScreen';
import AffirmationsScreen from './screens/AffirmationsScreen';
import JourneyScreen from './screens/JourneyScreen';
import CommunityScreen from './screens/CommunityScreen';
import MorningRitualScreen from './screens/MorningRitualScreen';
import AffirmationAlarmScreen from './screens/AffirmationAlarmScreen';
import DailyRitualScreen from './screens/DailyRitualScreen';
import PracticePlanScreen from './screens/PracticePlanScreen';
import PracticeRitualScreen from './screens/PracticeRitualScreen';
import ProfileScreen from './screens/ProfileScreen';

import WelcomeScreen from './screens/onboarding/WelcomeScreen';
import ReferralScreen from './screens/onboarding/ReferralScreen';
import NotificationsScreen from './screens/onboarding/NotificationsScreen';
import GrowScreen from './screens/onboarding/GrowScreen';
import ChatOnboardingScreen from './screens/onboarding/ChatOnboardingScreen';
import RevealScreen from './screens/onboarding/RevealScreen';
import PaywallScreen from './screens/onboarding/PaywallScreen';

import { APP_NAME, APP_URL } from './constants/brand';
import {
  isSafeNavigationPath,
  safeNavigationStateFromPath,
} from './utils/navigationPathSafety';
import {
  DEFAULT_AFFIRMATION_ALARM_ID,
  cancelAffirmationAlarm,
  getAffirmationAlarmCapability,
  replaceScheduledAffirmationAlarm,
  scheduleAffirmationAlarm,
} from './services/affirmationAlarm';

// O Google Tradutor do Chrome reescreve os nós de texto do DOM e quebra o React
// no meio da digitação (texto trocado/cortado, chips e inputs que nunca chegam
// a aparecer). O app já é bilíngue nativo — tradução automática só destrói.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  initCelesteBotProtection();
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
  tabCommunity: { en: 'Community', pt: 'Comunidade' },
};

const Tab = createBottomTabNavigator();
const HomeStack = createStackNavigator();
const VisionStack = createStackNavigator();
const Root = createStackNavigator();

function PersistenceNotice() {
  const { state, storageError, storageMutation, retryPersist } = useApp();
  const insets = useSafeAreaInsets();
  const [retrying, setRetrying] = React.useState(false);

  if (!state || !storageError || storageMutation) return null;
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
          testID="celeste-storage-persist-retry"
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

function StorageMutationGuard() {
  const { state, storageError, storageMutation, retryPersist } = useApp();
  const [retrying, setRetrying] = React.useState(false);
  if (!state || !storageMutation) return null;

  const pt = state.lang === 'pt';
  const isReset = storageMutation === 'reset';
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    const completed = await retryPersist();
    if (!completed) setRetrying(false);
  };

  return (
    <View
      testID="celeste-storage-mutation-guard"
      accessibilityRole="alert"
      accessibilityViewIsModal
      style={styles.storageMutationLayer}
    >
      <View style={styles.storageMutationPanel}>
        <ActivityIndicator size="small" color="#315F9E" />
        <Text style={styles.storageMutationTitle}>
          {isReset
            ? pt
              ? 'Finalizando seu recomeço'
              : 'Finishing your reset'
            : pt
            ? 'Restaurando sua cópia'
            : 'Restoring your backup'}
        </Text>
        <Text style={styles.storageMutationText}>
          {storageError
            ? pt
              ? 'O aparelho ainda não confirmou a gravação. Mantenha o Celeste aberto e tente novamente.'
              : 'The device has not confirmed the write yet. Keep Celeste open and try again.'
            : pt
            ? 'Aguarde a confirmação do aparelho antes de continuar.'
            : 'Wait for the device to confirm before continuing.'}
        </Text>
        {storageError ? (
          <Pressable
            testID="celeste-storage-mutation-retry"
            accessibilityRole="button"
            disabled={retrying}
            onPress={retry}
            style={({ pressed }) => [
              styles.storageMutationButton,
              (pressed || retrying) && styles.persistencePressed,
            ]}
          >
            <Ionicons name="refresh" size={18} color="#FFFFFF" />
            <Text style={styles.storageMutationButtonText}>
              {retrying ? (pt ? 'Tentando…' : 'Retrying…') : pt ? 'Tentar novamente' : 'Try again'}
            </Text>
          </Pressable>
        ) : null}
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

function alarmContentForState(state) {
  return resolvePersonalAlarmContent(state);
}

function hasSavedNarrationConsent(state) {
  const profile = state && state.profile;
  return (
    hasCurrentAdultCloudConsent(profile) &&
    profile?.cloudNarrationConsent === true
  );
}

function alarmTextWithoutSavedNames(text, state, lang) {
  const profile = state?.profile || {};
  return redactThirdPartyNames(text, thirdPartyNames(profile), lang);
}

async function prepareNeuralAlarm({ preparePersonal, state, desired, narratorId }) {
  if (!hasSavedNarrationConsent(state) || !desired || !narratorId) {
    return { ok: false, error: 'cloud_consent_required' };
  }
  const prepared = await preparePersonal({
    text: alarmTextWithoutSavedNames(desired.text, state, desired.lang),
    narratorId,
    lang: desired.lang,
    cloudConsent: true,
    cloudConsentVersion: CLOUD_CONSENT_VERSION,
    adultConfirmed: true,
  });
  if (!prepared?.ok) return prepared || { ok: false, error: 'audio_generation_failed' };
  try {
    return { ok: true, audioBase64Wav: wavBytesToBase64(prepared.bytes) };
  } catch (_error) {
    return { ok: false, error: 'invalid_wav_bytes' };
  }
}

function alarmSyncSignature(desired, ritual, narratorId) {
  return JSON.stringify([
    desired.id,
    desired.text,
    desired.lang,
    ritual && ritual.reminderTime,
    ritual && ritual.weekdays,
    narratorId,
  ]);
}

function NativeAlarmContentSync() {
  const { state, saveMorningRitualPreferences } = useApp();
  const { preparePersonal } = useNarration();
  const lastQueuedRef = React.useRef('');
  const latestDesiredRef = React.useRef('');
  const confirmedNativeRef = React.useRef('');
  const failedDesiredRef = React.useRef('');
  const pendingRef = React.useRef(0);
  const stateRef = React.useRef(state);
  const capabilityAttemptRef = React.useRef(0);
  const [retryEpoch, setRetryEpoch] = React.useState(0);
  stateRef.current = state;

  React.useEffect(() => {
    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !state) return undefined;
    let alive = true;
    const reconcile = async () => {
      const attempt = capabilityAttemptRef.current + 1;
      capabilityAttemptRef.current = attempt;
      const capability = await getAffirmationAlarmCapability().catch(() => null);
      if (!alive || capabilityAttemptRef.current !== attempt) return;
      if (!Array.isArray(capability?.scheduledAlarmIds)) return;
      let scheduled = capability.scheduledAlarmIds.includes(DEFAULT_AFFIRMATION_ALARM_ID);
      const currentState = stateRef.current;
      const ritual = currentState && currentState.morningRitual;
      const desired = alarmContentForState(currentState);

      // A legacy catalog alarm can outlive the local card that created it.
      // Never resurrect that orphan from native state: cancel it, or surface a
      // sync error honestly if the native platform refuses the cancellation.
      if (scheduled && !desired) {
        const cancelled = await cancelAffirmationAlarm().catch(() => null);
        if (!alive || capabilityAttemptRef.current !== attempt) return;
        const latestDesired = alarmContentForState(stateRef.current);
        if (latestDesired) {
          const latestState = stateRef.current;
          const latestRitual = latestState && latestState.morningRitual;
          const latestNarratorId = latestState?.narration?.narratorId;
          const restoreSignature = alarmSyncSignature(
            latestDesired,
            latestRitual,
            latestNarratorId
          );
          const neuralAudio = await prepareNeuralAlarm({
            preparePersonal,
            state: latestState,
            desired: latestDesired,
            narratorId: latestNarratorId,
          });
          if (!alive || capabilityAttemptRef.current !== attempt) return;
          const currentRestoreState = stateRef.current;
          const currentRestoreDesired = alarmContentForState(currentRestoreState);
          const currentRestoreSignature = currentRestoreDesired
            ? alarmSyncSignature(
                currentRestoreDesired,
                currentRestoreState.morningRitual,
                currentRestoreState?.narration?.narratorId
              )
            : '';
          if (currentRestoreSignature !== restoreSignature) return;
          if (!neuralAudio.ok) {
            failedDesiredRef.current = restoreSignature;
            saveMorningRitualPreferences({ alarmSyncError: true });
            return;
          }
          const restored = await scheduleAffirmationAlarm({
            time: latestRitual && latestRitual.reminderTime,
            weekdays: latestRitual && latestRitual.weekdays,
            affirmation: latestDesired.text,
            locale: latestDesired.lang === 'pt' ? 'pt-BR' : 'en-US',
            audioBase64Wav: neuralAudio.audioBase64Wav,
            requestAuthorization: true,
          }).catch(() => null);
          if (!alive || capabilityAttemptRef.current !== attempt) return;
          if (
            !restored ||
            !restored.ok ||
            !['neural_wav', 'local_speech'].includes(restored.soundSource)
          ) {
            failedDesiredRef.current = restoreSignature;
            saveMorningRitualPreferences({ alarmSyncError: true });
            return;
          }
          confirmedNativeRef.current = restoreSignature;
          failedDesiredRef.current = '';
          lastQueuedRef.current = '';
          saveMorningRitualPreferences({
            wakeAffirmationId: latestDesired.id,
            wakeAffirmationText: latestDesired.text,
            wakeAffirmationLang: latestDesired.lang,
            wakeNarratorId: latestNarratorId,
            wakeSoundSource: restored.soundSource,
            reminderEnabled: true,
            alarmSyncError: false,
          });
          return;
        }
        if (!cancelled || !cancelled.ok) {
          saveMorningRitualPreferences({ reminderEnabled: true, alarmSyncError: true });
          return;
        }
        scheduled = false;
      }
      if (!scheduled) {
        confirmedNativeRef.current = '';
        failedDesiredRef.current = '';
        lastQueuedRef.current = '';
      }
      if (
        ritual &&
        (ritual.reminderEnabled !== scheduled || (!scheduled && ritual.alarmSyncError))
      ) {
        saveMorningRitualPreferences({
          reminderEnabled: scheduled,
          ...(!scheduled ? { alarmSyncError: false } : {}),
        });
      }
    };
    void reconcile();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        if (failedDesiredRef.current) {
          lastQueuedRef.current = '';
          setRetryEpoch((value) => value + 1);
        }
        void reconcile();
      }
    });
    return () => {
      alive = false;
      capabilityAttemptRef.current += 1;
      if (subscription && subscription.remove) subscription.remove();
    };
  }, [!!state, preparePersonal, saveMorningRitualPreferences]);

  React.useEffect(() => {
    const ritual = state && state.morningRitual;
    const desired = alarmContentForState(state);
    if (
      (Platform.OS !== 'ios' && Platform.OS !== 'android') ||
      !ritual?.reminderEnabled ||
      !desired
    ) {
      latestDesiredRef.current = '';
      return;
    }
    const narratorId = state?.narration?.narratorId;
    const savedSoundSource = ritual.wakeSoundSource;
    const soundSourceConfirmed = ['neural_wav', 'local_speech'].includes(savedSoundSource);
    const signatureNarratorId = savedSoundSource === 'local_speech' ? 'local_speech' : narratorId;
    const signature = alarmSyncSignature(desired, ritual, signatureNarratorId);
    latestDesiredRef.current = signature;
    const cachedSignature =
      ritual.wakeAffirmationId &&
      ritual.wakeAffirmationText &&
      soundSourceConfirmed
      ? alarmSyncSignature(
          {
            id: ritual.wakeAffirmationId,
            text: ritual.wakeAffirmationText,
            lang: ritual.wakeAffirmationLang,
          },
          ritual,
          savedSoundSource === 'local_speech' ? 'local_speech' : ritual.wakeNarratorId
        )
      : '';
    if (!ritual.alarmSyncError && !confirmedNativeRef.current && cachedSignature) {
      confirmedNativeRef.current = cachedSignature;
    }
    const localMatches =
      ritual.wakeAffirmationId === desired.id &&
      ritual.wakeAffirmationText === desired.text &&
      ritual.wakeAffirmationLang === desired.lang &&
      soundSourceConfirmed &&
      (savedSoundSource === 'local_speech' || ritual.wakeNarratorId === narratorId);
    if (localMatches && pendingRef.current === 0) {
      confirmedNativeRef.current = signature;
      failedDesiredRef.current = '';
      if (ritual.alarmSyncError) {
        saveMorningRitualPreferences({ alarmSyncError: false });
      }
      return;
    }
    if (lastQueuedRef.current === signature) return;
    lastQueuedRef.current = signature;
    pendingRef.current += 1;

    void prepareNeuralAlarm({ preparePersonal, state, desired, narratorId })
      .then((neuralAudio) => {
        if (latestDesiredRef.current !== signature) return null;
        if (!neuralAudio.ok) {
          failedDesiredRef.current = signature;
          saveMorningRitualPreferences({ alarmSyncError: true });
          return null;
        }
        return replaceScheduledAffirmationAlarm({
          time: ritual.reminderTime,
          weekdays: ritual.weekdays,
          affirmation: desired.text,
          locale: desired.lang === 'pt' ? 'pt-BR' : 'en-US',
          audioBase64Wav: neuralAudio.audioBase64Wav,
          requestAuthorization: true,
        });
      })
      .then(async (response) => {
        if (!response) return;
        if (!response.ok) {
          // A newer replacement is already queued in the same native FIFO.
          // Cleanup from this stale attempt must never run after it and win.
          if (latestDesiredRef.current !== signature) return;
          let scheduledIds = response.scheduledAlarmIds;
          if (!Array.isArray(scheduledIds)) {
            const capability = await getAffirmationAlarmCapability().catch(() => null);
            if (latestDesiredRef.current !== signature) return;
            scheduledIds = capability && capability.scheduledAlarmIds;
          }
          if (latestDesiredRef.current !== signature) return;
          if (!Array.isArray(scheduledIds)) {
            failedDesiredRef.current = signature;
            saveMorningRitualPreferences({ alarmSyncError: true });
            return;
          }
          const scheduled =
            scheduledIds.includes(DEFAULT_AFFIRMATION_ALARM_ID);
          if (!scheduled) {
            confirmedNativeRef.current = '';
            failedDesiredRef.current = '';
            lastQueuedRef.current = '';
            saveMorningRitualPreferences({
              reminderEnabled: false,
              alarmSyncError: false,
            });
            return;
          }
          if (
            confirmedNativeRef.current &&
            confirmedNativeRef.current === latestDesiredRef.current
          ) {
            failedDesiredRef.current = '';
            if (latestDesiredRef.current === signature) {
              saveMorningRitualPreferences({ alarmSyncError: false });
            }
            return;
          }

          // Keep the last confirmed alarm alive. An automatic cancellation can
          // race with a newer replacement and leave the person with no alarm.
          // The visible sync error offers a retry without an irreversible step.
          failedDesiredRef.current = signature;
          if (latestDesiredRef.current !== signature) return;
          saveMorningRitualPreferences({ alarmSyncError: true });
          return;
        }
        if (!['neural_wav', 'local_speech'].includes(response.soundSource)) {
          if (latestDesiredRef.current !== signature) return;
          failedDesiredRef.current = signature;
          saveMorningRitualPreferences({ alarmSyncError: true });
          return;
        }
        confirmedNativeRef.current = signature;
        failedDesiredRef.current = '';
        if (latestDesiredRef.current !== signature) return;
        saveMorningRitualPreferences({
          wakeAffirmationId: desired.id,
          wakeAffirmationText: desired.text,
          wakeAffirmationLang: desired.lang,
          wakeNarratorId: narratorId,
          wakeSoundSource: response.soundSource,
          alarmSyncError: false,
        });
      })
      .catch(() => {
        if (latestDesiredRef.current === signature) {
          failedDesiredRef.current = signature;
          saveMorningRitualPreferences({ alarmSyncError: true });
        }
      })
      .finally(() => {
        pendingRef.current = Math.max(0, pendingRef.current - 1);
      });
  }, [state, retryEpoch, preparePersonal, saveMorningRitualPreferences]);

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
  const { width } = useWindowDimensions();
  const compactTabs = width < 360;
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border || 'rgba(0,0,0,0.06)',
          borderTopWidth: 1,
          height: 84,
          paddingTop: compactTabs ? 7 : 8,
          paddingBottom: 26,
        },
        tabBarItemStyle: { minWidth: 0 },
        tabBarLabelStyle: {
          fontSize: compactTabs ? 9.5 : 10.5,
          lineHeight: compactTabs ? 12 : 14,
          fontWeight: '600',
          letterSpacing: 0,
        },
        tabBarIcon: ({ color, size, focused }) => {
          const map = {
            Manifest: focused ? 'sparkles' : 'sparkles-outline',
            Visions: focused ? 'play-circle' : 'play-circle-outline',
            Affirm: focused ? 'heart' : 'heart-outline',
            Journey: focused ? 'stats-chart' : 'stats-chart-outline',
            Community: focused ? 'people' : 'people-outline',
          };
          return (
            <Ionicons
              name={map[route.name]}
              size={compactTabs ? 19 : size ? size - 2 : 22}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen
        name="Manifest"
        component={HomeStackNav}
        options={{ title: t(S.tabManifest), tabBarTestID: 'tab-manifest' }}
      />
      <Tab.Screen
        name="Visions"
        component={VisionStackNav}
        options={{ title: t(S.tabVisions), tabBarTestID: 'tab-visions' }}
      />
      <Tab.Screen
        name="Affirm"
        component={AffirmationsScreen}
        options={{ title: t(S.tabAffirm), tabBarTestID: 'tab-affirmations' }}
      />
      <Tab.Screen
        name="Journey"
        component={JourneyScreen}
        options={{ title: t(S.tabJourney), tabBarTestID: 'tab-journey' }}
      />
      {RELEASE_FEATURES.publicCommunity ? (
        <Tab.Screen
          name="Community"
          component={CommunityScreen}
          options={{ title: t(S.tabCommunity), tabBarTestID: 'tab-community' }}
        />
      ) : null}
    </Tab.Navigator>
  );
}

function AppBootState({ failed = false, corrupt = false, onRetry, onRepair }) {
  const pt = detectLang() === 'pt';
  const [repairing, setRepairing] = React.useState(false);
  const repair = async () => {
    const confirmed = await confirmAsync({
      title: pt ? 'Remover arquivo danificado?' : 'Remove damaged file?',
      message: pt
        ? 'As respostas desse arquivo não podem ser lidas e serão apagadas somente deste aparelho.'
        : 'The answers in this file cannot be read and will be removed only from this device.',
      confirmLabel: pt ? 'Remover e recomeçar' : 'Remove and restart',
      cancelLabel: pt ? 'Cancelar' : 'Cancel',
      lang: pt ? 'pt' : 'en',
    });
    if (!confirmed) return;
    setRepairing(true);
    const repaired = await onRepair();
    if (!repaired) setRepairing(false);
  };
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
            {corrupt
              ? pt
                ? 'O arquivo local está danificado. Nada será removido sem sua confirmação.'
                : 'The local file is damaged. Nothing will be removed without your confirmation.'
              : pt
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
          {corrupt ? (
            <Pressable
              testID="celeste-storage-repair"
              accessibilityRole="button"
              disabled={repairing}
              onPress={repair}
              style={({ pressed }) => [
                styles.bootRepairButton,
                (pressed || repairing) && styles.persistencePressed,
              ]}
            >
              <Ionicons name="trash-outline" size={18} color="#7E3548" />
              <Text style={styles.bootRepairText}>
                {repairing
                  ? pt
                    ? 'Removendo…'
                    : 'Removing…'
                  : pt
                  ? 'Remover arquivo e recomeçar'
                  : 'Remove file and restart'}
              </Text>
            </Pressable>
          ) : null}
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
  const {
    state,
    loading,
    storageLoadError,
    storageCorrupt,
    retryLoad,
    repairCorruptedStorage,
  } = useApp();
  const repairStorageAndAlarm = React.useCallback(async () => {
    if (
      RELEASE_FEATURES.affirmationAlarm &&
      (Platform.OS === 'ios' || Platform.OS === 'android')
    ) {
      const capability = await getAffirmationAlarmCapability().catch(() => null);
      const scheduledIds = capability && capability.scheduledAlarmIds;
      if (!Array.isArray(scheduledIds)) {
        // Unsupported OS versions cannot have created this native alarm. Every
        // other unknown capability state stays fail-closed so a real alarm is
        // never orphaned when the corrupt local record is repaired.
        const unsupportedReason =
          Platform.OS === 'ios' ? 'ios_version_unsupported' : 'android_version_unsupported';
        if (capability?.reason !== unsupportedReason) return false;
      } else if (scheduledIds.includes(DEFAULT_AFFIRMATION_ALARM_ID)) {
        const cancelled = await cancelAffirmationAlarm();
        if (!cancelled.ok) return false;
      }
    }
    const reminders = await cancelOrphanedDailyRitualReminders();
    if (!reminders.ok) return false;
    if (RELEASE_FEATURES.practicePlan) {
      const practiceReminders = await cancelPracticePlanReminders();
      if (!practiceReminders.ok) return false;
    }
    return repairCorruptedStorage();
  }, [repairCorruptedStorage]);
  // O <html lang> vem "en" do export do Expo. Com o app em português isso faz
  // leitor de tela ler com fonética errada e o navegador oferecer tradução
  // (que quebra o React). Segue o idioma real do app.
  React.useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && state && state.lang) {
      document.documentElement.lang = state.lang === 'pt' ? 'pt-BR' : 'en';
    }
  }, [state && state.lang]);
  if (loading) return <AppBootState />;
  if (storageLoadError || !state) {
    return (
      <AppBootState
        failed
        corrupt={storageCorrupt}
        onRetry={retryLoad}
        onRepair={repairStorageAndAlarm}
      />
    );
  }
  const onboarded = state.onboardingDone === true;
  return (
    <Root.Navigator screenOptions={{ headerShown: false }}>
      {onboarded ? (
        <>
          <Root.Screen name="Main" component={Tabs} />
          <Root.Screen name="MorningRitual" component={MorningRitualScreen} />
          {RELEASE_FEATURES.affirmationAlarm ? (
            <Root.Screen name="AffirmationAlarm" component={AffirmationAlarmScreen} />
          ) : null}
          <Root.Screen name="DailyRitual" component={DailyRitualScreen} />
          {RELEASE_FEATURES.practicePlan ? (
            <>
              <Root.Screen name="PracticePlan" component={PracticePlanScreen} />
              <Root.Screen name="PracticeRitual" component={PracticeRitualScreen} />
            </>
          ) : null}
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
  prefixes: [APP_URL, 'celeste://'],
  // Native React Navigation evaluates filter before extracting a path. Web v6
  // does not, so getStateFromPath below repeats the mandatory guard.
  filter(url) {
    return isSafeNavigationPath(url);
  },
  getStateFromPath(path, options) {
    return safeNavigationStateFromPath(path, options, getNavigationStateFromPath);
  },
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    if (url) return url;
    const practicePlanUrl = RELEASE_FEATURES.practicePlan
      ? await initialPracticePlanNotificationUrl()
      : null;
    return practicePlanUrl || initialDailyRitualNotificationUrl();
  },
  subscribe(listener) {
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => listener(url));
    const unsubscribeNotifications = subscribeDailyRitualNotificationUrls(listener);
    const unsubscribePracticePlanNotifications = RELEASE_FEATURES.practicePlan
      ? subscribePracticePlanNotificationUrls(listener)
      : () => {};
    return () => {
      linkingSubscription.remove();
      unsubscribeNotifications();
      unsubscribePracticePlanNotifications();
    };
  },
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
          ...(RELEASE_FEATURES.publicCommunity ? { Community: 'comunidade' } : {}),
        },
      },
      MorningRitual: 'sonhos',
      ...(RELEASE_FEATURES.affirmationAlarm ? { AffirmationAlarm: 'despertar' } : {}),
      DailyRitual: 'ritual',
      ...(RELEASE_FEATURES.practicePlan
        ? { PracticePlan: 'plano', PracticeRitual: 'pratica/:slotId' }
        : {}),
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
  React.useEffect(() => {
    configureDailyRitualNotifications();
    if (RELEASE_FEATURES.practicePlan) configurePracticePlanNotifications();
  }, []);
  return (
    <GestureHandlerRootView style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <SafeAreaProvider style={{ flex: 1, minHeight: 0 }}>
        <ThemeProvider
          theme="cloud"
          accent="#4A80C9"
          accents={['#5E93D8', '#8B7ED8', '#4DB6A4', '#E8B04E', '#E38B67', '#7FA88F']}
        >
          <AppProvider>
            <NarrationProvider>
              <PersistedTheme />
              {RELEASE_FEATURES.affirmationAlarm ? <NativeAlarmContentSync /> : null}
              <StatusBar style="dark" />
              <View testID="celeste-application-layout" style={styles.applicationLayout}>
                <View testID="celeste-navigation-frame" style={styles.navigationFrame}>
                  <NavigationContainer linking={linking}>
                    <RootNav />
                  </NavigationContainer>
                </View>
                <NarrationPlaybackControls />
                <StorageMutationGuard />
                <PersistenceNotice />
              </View>
            </NarrationProvider>
          </AppProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  applicationLayout: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  navigationFrame: {
    flex: 1,
    minHeight: 0,
  },
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
  bootRepairButton: {
    minHeight: 46,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D7A8B4',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF7F9',
  },
  bootRepairText: {
    marginLeft: 8,
    color: '#7E3548',
    fontSize: 14,
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
  storageMutationLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    elevation: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(220, 233, 248, 0.96)',
  },
  storageMutationPanel: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 26,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#20314F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
  },
  storageMutationTitle: {
    marginTop: 15,
    color: '#20314F',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  storageMutationText: {
    marginTop: 8,
    color: '#526783',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  storageMutationButton: {
    minHeight: 44,
    marginTop: 18,
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#315F9E',
  },
  storageMutationButtonText: {
    marginLeft: 7,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
