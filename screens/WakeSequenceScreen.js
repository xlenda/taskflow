import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import * as Speech from 'expo-speech';

import CelestialTrace from '../components/CelestialTrace';
import PrimaryButton from '../components/PrimaryButton';
import NarratedScene from '../components/NarratedScene';
import { imageUriForCenaViva } from '../components/cenaViva/imageSource';
import { SERIF } from '../constants/brand';
import { useApp } from '../context/AppContext';
import { useTheme } from '../ui/theme';
import {
  captionProgressFromBoundary,
  captionProgressFromNarration,
  captionProgressFromTime,
  wordLengthAt,
} from '../utils/captionProgress';
import { accentAt, alpha } from '../utils/colors';
import { pickReadyScene } from '../utils/readyScene';
import { hasUnifiedCloudMediaConsent } from '../utils/useCloudMediaConsent';
import { usePersonalNarration } from '../utils/usePersonalNarration';
import { usePersonalVisual } from '../utils/usePersonalVisual';
import { useT } from '../utils/useT';
import { wakeSequenceItemsForState } from '../utils/wakeSequence';

const GAP_MS = 900; // a breath between items
const START_WATCHDOG_MS = 4000;

const S = {
  title: { pt: 'Ouvir meu despertar', en: 'Hear my wake-up' },
  back: { pt: 'Voltar', en: 'Back' },
  intro: {
    pt: 'Acenda as três estrelas para começar. Depois é só ouvir: sem microfone e sem tarefa.',
    en: 'Light the three stars to begin. Then just listen: no microphone, no task.',
  },
  traceReady: { pt: 'Seu despertar começou.', en: 'Your wake-up has begun.' },
  start: { pt: 'Começar', en: 'Start' },
  position: { pt: '{n} de {total}', en: '{n} of {total}' },
  anchor: { pt: 'Cena-Âncora', en: 'Anchor Scene' },
  vision: { pt: 'Visão', en: 'Vision' },
  affirmation: { pt: 'Afirmação', en: 'Affirmation' },
  personalScene: { pt: 'Criada para você', en: 'Created for you' },
  readyScene: { pt: 'Cena inspirada nas suas respostas', en: 'Scene inspired by your answers' },
  pause: { pt: 'Pausar', en: 'Pause' },
  resume: { pt: 'Continuar', en: 'Continue' },
  startOver: { pt: 'Recomeçar', en: 'Start over' },
  next: { pt: 'Próximo', en: 'Next' },
  stop: { pt: 'Parar', en: 'Stop' },
  voiceFailed: {
    pt: 'A voz não tocou neste aparelho. O texto continua aqui para você ler.',
    en: 'The voice did not play on this device. The text stays here for you to read.',
  },
  retryVoice: { pt: 'Tocar de novo', en: 'Play again' },
  doneTitle: { pt: 'Seu despertar terminou', en: 'Your wake-up is complete' },
  doneBody: {
    pt: 'Leve com você o que ficou. Você pode ouvir de novo quando quiser.',
    en: 'Take with you what stayed. You can listen again whenever you like.',
  },
  stoppedTitle: { pt: 'Despertar parado', en: 'Wake-up stopped' },
  stoppedBody: { pt: 'Você pode recomeçar quando quiser.', en: 'You can start again whenever you like.' },
  again: { pt: 'Ouvir de novo', en: 'Listen again' },
  close: { pt: 'Fechar', en: 'Close' },
  emptyTitle: { pt: 'Sua sequência está vazia', en: 'Your sequence is empty' },
  emptyBody: {
    pt: 'Monte em Meu despertar o que você quer ouvir ao acordar.',
    en: 'Build what you want to hear when you wake up in My wake-up.',
  },
  build: { pt: 'Montar meu despertar', en: 'Build my wake-up' },
};

const KIND_LABEL = { anchor: S.anchor, vision: S.vision, affirmation: S.affirmation };
const KIND_ACCENT = { anchor: 0, vision: 2, affirmation: 3 };

// expo-speech speaks asynchronously on the web, so a missing speech engine would
// surface as an unhandled rejection that no try/catch here can see: check first.
const webSpeechAvailable = () =>
  Platform.OS !== 'web' ||
  (typeof globalThis.SpeechSynthesisUtterance === 'function' && !!globalThis.speechSynthesis);

export default function WakeSequenceScreen() {
  const theme = useTheme();
  const navigation = useNavigation();
  const focused = useIsFocused();
  const { t, lang } = useT();
  const { state } = useApp();
  const narration = usePersonalNarration();
  // The 4:5 scene stays under half the window height, keeping the controls on screen.
  const sceneSize = { maxWidth: Math.min(420, Math.round(useWindowDimensions().height * 0.38)) };
  const items = useMemo(() => wakeSequenceItemsForState(state, lang), [state, lang]);
  // Site: the Celeste voice when she already allowed the cloud; otherwise (and
  // always in the app) the device voice.
  const cloudVoice = narration.personalNarrationAvailable && hasUnifiedCloudMediaConsent(state?.profile);

  const [index, setIndex] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | playing | paused | done | stopped
  const [traceDone, setTraceDone] = useState(false);
  const [voiceFailed, setVoiceFailed] = useState(false);
  // Paused mid-item with a voice that cannot resume: Continue replays the item, so it says so.
  const [restartOnResume, setRestartOnResume] = useState(false);
  // How much of the item the voice has said (0..1): the words of the scene follow it.
  const [spoken, setSpoken] = useState(0);

  const latest = useRef(null);
  latest.current = { items, narration, cloudVoice };
  const scrollRef = useRef(null);
  const sessionRef = useRef(Date.now().toString(36));
  const epochRef = useRef(0);
  const positionRef = useRef(0); // the item on screen
  const resumeAtRef = useRef(0); // what Continue plays: this item, or the next one during the breath
  const cloudIdRef = useRef(null);
  const cloudBrokenRef = useRef(false);
  const deviceActiveRef = useRef(false);
  const gapRef = useRef(null);
  const watchdogRef = useRef(null);
  const deviceStartRef = useRef(null); // { epoch, at, text }: when the device voice began this item
  const deviceWordsRef = useRef(null); // the epoch whose device voice reports each word (onBoundary)

  // Stops whatever this screen started; every pending callback becomes stale.
  function silence() {
    epochRef.current += 1;
    clearTimeout(gapRef.current);
    clearTimeout(watchdogRef.current);
    if (deviceActiveRef.current) {
      deviceActiveRef.current = false;
      Speech.stop().catch(() => {});
    }
    const playbackId = cloudIdRef.current;
    cloudIdRef.current = null;
    if (playbackId) latest.current.narration.stop(playbackId);
  }

  function itemFinished(epoch) {
    if (epochRef.current !== epoch) return;
    setSpoken(1); // the whole text stays on the scene during the breath
    const next = positionRef.current + 1;
    if (next >= latest.current.items.length) {
      silence();
      setPhase('done');
      return;
    }
    // A pause during this breath continues with the next item, not this one again.
    resumeAtRef.current = next;
    gapRef.current = setTimeout(() => {
      if (epochRef.current === epoch) playItem(next);
    }, GAP_MS);
  }

  function voiceDidNotPlay(epoch) {
    if (epochRef.current !== epoch) return;
    deviceActiveRef.current = false;
    clearTimeout(watchdogRef.current);
    setVoiceFailed(true);
  }

  function speakWithDevice(item, epoch) {
    // A browser without a speech engine: say so now instead of an unseen rejection.
    if (!webSpeechAvailable()) {
      voiceDidNotPlay(epoch);
      return;
    }
    deviceActiveRef.current = true;
    setSpoken(0); // the device voice always starts the item from its first word
    if (Platform.OS === 'web') {
      // O Safari do iPhone descarta calado a fala pedida fora do toque: sem início, oferece tocar de novo.
      watchdogRef.current = setTimeout(() => {
        if (epochRef.current !== epoch) return;
        Speech.stop().catch(() => {});
        voiceDidNotPlay(epoch);
      }, START_WATCHDOG_MS);
    }
    try {
      Speech.speak(item.text, {
        language: item.lang === 'en' ? 'en-US' : 'pt-BR',
        rate: 0.9,
        onStart: () => {
          clearTimeout(watchdogRef.current);
          deviceStartRef.current = { epoch, at: Date.now(), text: item.text };
        },
        onBoundary: (event) => wordSpoken(epoch, item.text, event),
        onDone: () => {
          if (epochRef.current !== epoch) return;
          deviceActiveRef.current = false;
          itemFinished(epoch);
        },
        onError: () => voiceDidNotPlay(epoch),
      });
    } catch (_error) {
      voiceDidNotPlay(epoch);
    }
  }

  // The device voice is about to say the word at charIndex: the scene shows up to the END of that word (the
  // renderer reveals a word once the progress passes its first letter). Without charLength (Safari) the word runs
  // to the next space; a browser 'sentence' boundary names no word and would run ahead of the voice.
  function wordSpoken(epoch, text, event) {
    if (epochRef.current !== epoch || !event || event.name === 'sentence') return;
    const charIndex = Number(event.charIndex) || 0;
    const charLength = Number(event.charLength) || wordLengthAt(text, charIndex);
    deviceWordsRef.current = epoch;
    setSpoken(captionProgressFromBoundary({ charIndex, charLength, textLength: text.length }));
  }

  // The Celeste voice did not start, or broke midway: the device voice takes the rest.
  function deviceFallback(playbackId, epoch) {
    if (cloudIdRef.current !== playbackId || epochRef.current !== epoch) return;
    cloudIdRef.current = null;
    cloudBrokenRef.current = true;
    latest.current.narration.stop(playbackId);
    const item = latest.current.items[positionRef.current];
    if (item) speakWithDevice(item, epoch);
  }

  // Runs inside the tap (3rd star, Next, Continue, Play again): nothing is
  // awaited before the voice starts, or the iPhone drops the sound.
  function playItem(position) {
    const item = latest.current.items[position];
    silence();
    if (!item) {
      setPhase('done');
      return;
    }
    const epoch = epochRef.current;
    positionRef.current = position;
    resumeAtRef.current = position;
    setIndex(position);
    setPhase('playing');
    setVoiceFailed(false);
    setSpoken(0);
    if (latest.current.cloudVoice && !cloudBrokenRef.current) {
      // Silent utterance in this same tap: unlocks the device voice so a later
      // fallback can speak on the iPhone without asking for another tap.
      if (webSpeechAvailable()) Speech.speak(' ', { volume: 0 });
      const playbackId = `wake:${sessionRef.current}:${epoch}`;
      cloudIdRef.current = playbackId;
      latest.current.narration
        .playPersonal({ text: item.text, lang: item.lang, playbackId })
        .then((result) => {
          // Playing: the end arrives as lastCompletedPlaybackId (effect below).
          if (result && result.ok && !result.ready) return;
          if (result && result.error === 'audio_cancelled') {
            // Stopped elsewhere (the global player): this item waits for Continue.
            if (cloudIdRef.current === playbackId && epochRef.current === epoch) {
              cloudIdRef.current = null;
              setRestartOnResume(true);
              setPhase('paused');
            }
            return;
          }
          deviceFallback(playbackId, epoch);
        })
        .catch(() => deviceFallback(playbackId, epoch));
      return;
    }
    speakWithDevice(item, epoch);
  }

  // ponytail: the device voice cannot pause (Android), so holding stops it and
  // Continue replays this item ("Recomeçar"), or plays the next one when the
  // pause fell in the breath between items.
  function holdForContinue() {
    setRestartOnResume(resumeAtRef.current === positionRef.current);
    silence();
    setPhase((current) => (current === 'playing' ? 'paused' : current));
  }

  function pause() {
    const playbackId = cloudIdRef.current;
    if (playbackId && narration.activePlaybackId === playbackId && narration.pause()) {
      setRestartOnResume(false);
      setPhase('paused');
      return;
    }
    holdForContinue();
  }

  function resume() {
    const playbackId = cloudIdRef.current;
    if (playbackId && narration.activePlaybackId === playbackId && (narration.isPaused || narration.isReady)) {
      setPhase('playing');
      narration.resume().catch(() => {});
      return;
    }
    playItem(resumeAtRef.current);
  }

  function stop() {
    silence();
    setPhase('stopped');
  }

  function leave() {
    silence();
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate('Main');
  }

  // Each item starts at its top.
  useEffect(() => {
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [index]);

  // Celeste voice: the end of an item, or a failure midway.
  useEffect(() => {
    const playbackId = cloudIdRef.current;
    if (!playbackId) return;
    if (narration.lastCompletedPlaybackId === playbackId) {
      cloudIdRef.current = null;
      itemFinished(epochRef.current);
    } else if (narration.phase === 'error' && !narration.activePlaybackId) {
      deviceFallback(playbackId, epochRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration.lastCompletedPlaybackId, narration.phase, narration.activePlaybackId]);

  // The words on the scene follow the voice: the Celeste voice by its narration progress; the device voice by
  // its words (wordSpoken) or, on a device that never reports them, by time since it began (14 letters/s).
  useEffect(() => {
    const playbackId = cloudIdRef.current;
    if (playbackId && narration.activePlaybackId === playbackId) {
      setSpoken(captionProgressFromNarration({ progress: narration.progress }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration.progress, narration.activePlaybackId]);
  useEffect(() => {
    if (phase !== 'playing') return undefined;
    const timer = setInterval(() => {
      const start = deviceStartRef.current;
      const epoch = epochRef.current;
      if (!start || start.epoch !== epoch || deviceWordsRef.current === epoch) return;
      setSpoken(captionProgressFromTime({ elapsedMs: Date.now() - start.at, text: start.text }));
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  // Leaving the screen or the app stops the voice (no background audio in this version).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => silence(), []);
  useEffect(() => {
    if (!focused) holdForContinue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused]);
  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') holdForContinue();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cena viva for the Anchor Scene and visions: the personal image when it loads,
  // otherwise the ready scene picked from her answers (honest label below it).
  const current = index == null ? null : items[index] || null;
  const sceneItem = current && current.kind !== 'affirmation' ? current : null;
  const personalUri = usePersonalVisual(sceneItem ? sceneItem.visualKey : null);
  const [brokenUri, setBrokenUri] = useState(null);
  const [scene, setScene] = useState(null);
  const [shown, setShown] = useState(null);
  const personalSource = personalUri && personalUri !== brokenUri ? personalUri : null;
  const dreamLocation = state?.profile?.dreamLocation;
  const sceneId = sceneItem ? sceneItem.id : null;
  const sceneCategory = sceneItem ? sceneItem.category : null;
  const dropScene = (source) => (source ? setBrokenUri(source) : setScene(null));

  useEffect(() => {
    if (!sceneId) return undefined;
    let alive = true;
    imageUriForCenaViva({
      personalUri: personalSource,
      readyScene: pickReadyScene({ dreamLocation, category: sceneCategory }),
    })
      .then((uri) => alive && setScene({ id: sceneId, uri, source: personalSource }))
      .catch(() => alive && dropScene(personalSource));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, sceneCategory, personalSource, dreamLocation]);

  const ended = phase === 'done' || phase === 'stopped';
  const currentScene = scene && current && scene.id === current.id ? scene : null;
  const controls = [
    phase === 'playing'
      ? { testID: 'wake-pause', icon: 'pause', label: S.pause, onPress: pause }
      : {
          testID: 'wake-resume',
          icon: restartOnResume ? 'refresh' : 'play',
          label: restartOnResume ? S.startOver : S.resume,
          onPress: resume,
        },
    { testID: 'wake-next', icon: 'play-skip-forward', label: S.next, onPress: () => playItem(positionRef.current + 1) },
    { testID: 'wake-stop', icon: 'stop', label: S.stop, onPress: stop },
  ];

  let body;
  if (items.length === 0) {
    body = (
      <View testID="wake-empty" style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Ionicons name="moon-outline" size={30} color={theme.textMuted} />
        <Text style={[styles.cardTitle, { color: theme.text }]}>{t(S.emptyTitle)}</Text>
        <Text style={[styles.body, styles.centered, { color: theme.textMuted }]}>{t(S.emptyBody)}</Text>
        <PrimaryButton
          testID="wake-build"
          label={S.build}
          icon="add"
          onPress={() => navigation.navigate('AffirmationAlarm')}
          style={styles.cardAction}
        />
      </View>
    );
  } else if (ended) {
    body = (
      <View
        testID="wake-complete"
        accessibilityLiveRegion="polite"
        style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
      >
        <Ionicons name={phase === 'done' ? 'sunny-outline' : 'stop-circle-outline'} size={32} color={accentAt(theme, 3)} />
        <Text style={[styles.cardTitle, { color: theme.text }]}>
          {t(phase === 'done' ? S.doneTitle : S.stoppedTitle)}
        </Text>
        <Text style={[styles.body, styles.centered, { color: theme.textMuted }]}>
          {t(phase === 'done' ? S.doneBody : S.stoppedBody)}
        </Text>
        <PrimaryButton testID="wake-restart" label={S.again} icon="refresh" onPress={() => playItem(0)} style={styles.cardAction} />
        <PrimaryButton testID="wake-close" label={S.close} icon="close" variant="ghost" onPress={leave} style={styles.cardAction} />
      </View>
    );
  } else if (!traceDone) {
    body = (
      <>
        <Text style={[styles.body, { color: theme.textMuted }]}>{t(S.intro)}</Text>
        <CelestialTrace
          onFinalStar={() => playItem(0)}
          onComplete={() => setTraceDone(true)}
          readyTitle={t(S.traceReady)}
        />
      </>
    );
  } else if (!current) {
    body = <PrimaryButton testID="wake-start" label={S.start} icon="play" onPress={() => playItem(0)} />;
  } else {
    const accent = accentAt(theme, KIND_ACCENT[current.kind] || 0);
    // Controls sit right under the visual, so a long story never pushes them off screen.
    body = (
      <View testID="wake-player">
        <Text testID="wake-position" accessibilityLiveRegion="polite" style={[styles.position, { color: accent }]}>
          {`${t(S.position, { n: index + 1, total: items.length })} · ${t(KIND_LABEL[current.kind] || S.affirmation)}`}
        </Text>
        {current.kind === 'affirmation' ? (
          <View
            testID="wake-phrase-card"
            style={[styles.phraseCard, { backgroundColor: alpha(accent, 0.1), borderColor: alpha(accent, 0.28) }]}
          >
            <Text selectable style={[styles.phrase, { color: theme.text }]}>{current.text}</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.itemTitle, { color: theme.text }]}>{current.title}</Text>
            {currentScene ? (
              // The scene tells the story word by word with the voice. If the device cannot keep the live
              // scene (webview_gone), CenaViva leaves the words as text; only a broken image is swapped.
              <NarratedScene
                imageUri={currentScene.uri}
                text={current.text}
                progress={spoken}
                active={phase === 'playing'}
                onReady={(uri) => setShown(uri)}
                onError={(code) => code === 'image_error' && dropScene(currentScene.source)}
                style={[styles.scene, sceneSize]}
              />
            ) : (
              <View style={[styles.scene, sceneSize, { backgroundColor: theme.surfaceAlt }]} />
            )}
            <Text style={[styles.sceneSource, { color: theme.textMuted }]}>
              {currentScene && shown === currentScene.uri
                ? t(currentScene.source ? S.personalScene : S.readyScene)
                : null}
            </Text>
          </>
        )}
        {voiceFailed ? (
          <View accessibilityLiveRegion="polite" style={[styles.notice, { backgroundColor: alpha(theme.warning, 0.12) }]}>
            <Text style={[styles.noticeText, { color: theme.text }]}>{t(S.voiceFailed)}</Text>
            <PrimaryButton
              testID="wake-retry-voice"
              label={S.retryVoice}
              icon="volume-high-outline"
              variant="soft"
              onPress={() => playItem(positionRef.current)}
              style={styles.noticeAction}
            />
          </View>
        ) : null}
        <View style={styles.controls}>
          {controls.map((control) => (
            <Pressable
              key={control.testID}
              testID={control.testID}
              accessibilityRole="button"
              accessibilityLabel={t(control.label)}
              onPress={control.onPress}
              style={({ pressed }) => [styles.control, { backgroundColor: theme.surfaceAlt }, pressed && styles.pressed]}
            >
              <Ionicons name={control.icon} size={20} color={theme.accent} />
              <Text style={[styles.controlText, { color: theme.accent }]}>{t(control.label)}</Text>
            </Pressable>
          ))}
        </View>
        {/* While the voice tells the story on the scene, the words are there; the text returns when it pauses. */}
        {current.kind === 'affirmation' || (currentScene && phase === 'playing') ? null : (
          <Text selectable style={[styles.story, { color: theme.text }]}>{current.text}</Text>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView
      testID="wake-sequence-screen"
      edges={['top']}
      style={[styles.safe, Platform.OS === 'web' && styles.webViewport, { backgroundColor: theme.bg }]}
    >
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable
          testID="wake-back"
          accessibilityRole="button"
          accessibilityLabel={t(S.back)}
          onPress={leave}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Ionicons name="arrow-back" size={23} color={theme.text} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{t(S.title)}</Text>
      </View>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>{body}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0 },
  webViewport: { height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' },
  flex: { flex: 1, minHeight: 0 },
  pressed: { opacity: 0.72 },
  header: {
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, paddingRight: 48, fontSize: 20, lineHeight: 26, fontWeight: '800', textAlign: 'center', letterSpacing: -0.2 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 96 },
  content: { width: '100%', maxWidth: 560, alignSelf: 'center' },
  body: { fontSize: 15, lineHeight: 23, letterSpacing: 0 },
  centered: { textAlign: 'center', marginTop: 6 },
  card: { borderWidth: 1, borderRadius: 22, padding: 22, alignItems: 'center' },
  cardTitle: { fontSize: 21, lineHeight: 27, fontWeight: '800', textAlign: 'center', marginTop: 10, letterSpacing: -0.2 },
  cardAction: { alignSelf: 'stretch', marginTop: 14 },
  position: { fontSize: 11, lineHeight: 16, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1 },
  itemTitle: { fontFamily: SERIF, fontSize: 23, lineHeight: 30, marginTop: 6 },
  scene: { width: '100%', aspectRatio: 4 / 5, alignSelf: 'center', marginTop: 14, borderRadius: 22, overflow: 'hidden' },
  sceneSource: { fontSize: 12.5, lineHeight: 18, minHeight: 18, fontWeight: '600', marginTop: 8, textAlign: 'center' },
  story: { fontSize: 16, lineHeight: 25, marginTop: 18, letterSpacing: 0 },
  phraseCard: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 22, paddingVertical: 30, marginTop: 12 },
  phrase: { fontFamily: SERIF, fontSize: 25, lineHeight: 34, textAlign: 'center' },
  notice: { borderRadius: 16, padding: 14, marginTop: 14 },
  noticeText: { fontSize: 13.5, lineHeight: 20, letterSpacing: 0 },
  noticeAction: { marginTop: 10 },
  controls: { flexDirection: 'row', marginHorizontal: -5, marginTop: 14 },
  control: {
    flex: 1,
    minHeight: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginHorizontal: 5,
  },
  controlText: { fontSize: 12.5, fontWeight: '800', marginTop: 3, letterSpacing: 0 },
});
