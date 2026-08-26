import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { OnbScreen, ContinueButton, serifStyle } from './onboardingUI';
import { ONB, SERIF } from '../../constants/brand';
import { useT } from '../../utils/useT';
import { useApp } from '../../context/AppContext';
import { usePersonalNarration } from '../../utils/usePersonalNarration';
import CelestialTrace from '../../components/CelestialTrace';
import NarratorSelector from '../../components/NarratorSelector';

const BRIDGE_MIN_HEIGHT = 118;

// A recompensa do onboarding nasce antes de qualquer oferta. A Cena-Âncora une
// quatro coisas verificáveis: detalhe pessoal, narrativa audível, identidade de
// processo e uma ação curta no presente. É reflexão guiada, não previsão.

const S = {
  kicker: { en: 'YOUR FIRST ANCHOR SCENE', pt: 'SUA PRIMEIRA CENA-ÂNCORA' },
  title: {
    en: 'Three points of light. A scene made from your words.',
    pt: 'Três pontos de luz. Uma cena feita das suas palavras.',
  },
  listen: { en: 'Listen to my scene', pt: 'Ouvir minha cena' },
  stop: { en: 'Stop narration', pt: 'Parar narração' },
  listening: { en: 'Your scene is playing', pt: 'Sua cena está tocando' },
  voiceTitle: { en: 'Choose your narrator', pt: 'Escolha sua voz' },
  voiceHint: {
    en: 'This choice stays with your personal scenes.',
    pt: 'Essa escolha acompanha suas cenas pessoais.',
  },
  audioFail: {
    en: 'Audio is unavailable here. Read the scene slowly and keep one detail with you.',
    pt: 'O áudio não está disponível aqui. Leia a cena devagar e guarde um detalhe com você.',
  },
  identity: { en: 'The identity you practise', pt: 'A identidade que você pratica' },
  bridge: { en: 'Your bridge to today', pt: 'Sua ponte para hoje' },
  bridgeNote: {
    en: 'No guarantees or giant leaps. Just one action you control.',
    pt: 'Sem garantia nem salto gigante. Só uma ação que está nas suas mãos.',
  },
  bridgeEdit: {
    en: 'Keep the suggestion or rewrite it so it fits your real day.',
    pt: 'Aceite a sugestão ou reescreva para caber no seu dia real.',
  },
  receipt: { en: 'Personalized with', pt: 'Personalizada com' },
  yourWish: { en: 'your stated intention', pt: 'sua intenção declarada' },
  cta: { en: 'Keep my anchor scene', pt: 'Guardar minha Cena-Âncora' },
  missingTitle: { en: 'This scene is no longer available.', pt: 'Esta cena não está mais disponível.' },
  missingBody: {
    en: 'Let’s return to the beginning and create a new one from your words.',
    pt: 'Vamos voltar ao início e criar uma nova a partir das suas palavras.',
  },
  restart: { en: 'Return to the beginning', pt: 'Voltar ao início' },
};

// personalizedWith é dado salvo em PT por compatibilidade com versões antigas.
const RECIBO = {
  'onde quer morar': { en: 'where you want to live', pt: 'onde quer morar' },
  'casa dos sonhos': { en: 'your dream home', pt: 'casa dos sonhos' },
  'quem importa pra você': { en: 'who matters to you', pt: 'quem importa para você' },
  'o que travava você': { en: 'what was holding you back', pt: 'o que travava você' },
  'por que isso importa': { en: 'why this matters', pt: 'por que isso importa' },
};

export default function RevealScreen({ navigation, route }) {
  const { state, setNarrator, updateManifestation } = useApp();
  const narration = usePersonalNarration();
  const { t } = useT();
  const [audioFailed, setAudioFailed] = useState(false);
  const [bridgeDraft, setBridgeDraft] = useState('');
  const [bridgeInputHeight, setBridgeInputHeight] = useState(BRIDGE_MIN_HEIGHT);
  const [unlocked, setUnlocked] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  const sceneReveal = useRef(new Animated.Value(0)).current;

  const id = route.params && route.params.id;
  const list = (state && state.manifestations) || [];
  // Nunca usar list[0] como fallback: um link inválido não pode revelar a
  // história íntima de outra manifestação.
  const m = id ? list.find((x) => x.id === id) : null;

  const returnToWelcome = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
  };

  useEffect(() => {
    narration.stop();
    setAudioFailed(false);
    const alreadyOpened = !!(m && m.anchorOpenedAt);
    setUnlocked(alreadyOpened);
    sceneReveal.setValue(alreadyOpened ? 1 : 0);
    setBridgeInputHeight(BRIDGE_MIN_HEIGHT);
    if (m) setBridgeDraft(m.anchorStep || '');
    // O conteúdo só deve ser reposto quando muda a manifestação, não enquanto
    // a pessoa edita o campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m && m.id, narration.stop, sceneReveal]);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (!alive || reduced) {
          reveal.setValue(1);
          return;
        }
        Animated.spring(reveal, {
          toValue: 1,
          damping: 18,
          stiffness: 90,
          mass: 0.8,
          useNativeDriver: true,
        }).start();
      })
      .catch(() => reveal.setValue(1));
    return () => {
      alive = false;
      narration.stop();
    };
  }, [narration.stop, reveal]);

  if (!m) {
    return (
      <OnbScreen>
        <View testID="missing-anchor-scene" style={styles.missingShell}>
          <View style={styles.mark}>
            <Ionicons name="sparkles" size={30} color={ONB.heart} />
          </View>
          <Text style={serifStyle(29, styles.missingTitle)}>{t(S.missingTitle)}</Text>
          <Text style={styles.missingBody}>{t(S.missingBody)}</Text>
          <ContinueButton label={t(S.restart)} onPress={returnToWelcome} style={styles.cta} />
        </View>
      </OnbScreen>
    );
  }

  const personalizedWith = Array.isArray(m.personalizedWith) ? m.personalizedWith : [];
  const itens = [t(S.yourWish)].concat(
    personalizedWith.map((label) => (RECIBO[label] ? t(RECIBO[label]) : label))
  );
  const lang = m.lang || (state && state.lang) || 'pt';
  const playbackId = `reveal:${m.id}`;
  const playing =
    narration.activePlaybackId === playbackId &&
    (narration.isLoading || narration.isPlaying || narration.isPaused);

  const toggleAudio = async () => {
    if (playing) {
      narration.stop();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAudioFailed(false);
    const result = await narration.playPersonal({
      text: m.story,
      lang,
      playbackId,
    });
    if (!result.ok && result.error !== 'audio_cancelled') setAudioFailed(true);
  };

  const continueFlow = () => {
    narration.stop();
    const bridge = bridgeDraft.trim();
    if (bridge !== m.anchorStep) updateManifestation(m.id, { anchorStep: bridge });
    navigation.replace('Paywall');
  };

  const openScene = ({ reducedMotion } = {}) => {
    setUnlocked(true);
    if (!m.anchorOpenedAt) updateManifestation(m.id, { anchorOpenedAt: new Date().toISOString() });
    if (reducedMotion) {
      sceneReveal.setValue(1);
      return;
    }
    Animated.timing(sceneReveal, {
      toValue: 1,
      duration: 680,
      useNativeDriver: true,
    }).start();
  };

  return (
    <OnbScreen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <Animated.View
          style={[
            styles.shell,
            {
              opacity: reveal,
              transform: [
                { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
              ],
            },
          ]}
        >
          <View style={styles.mark}>
            <Ionicons name="sparkles" size={30} color={ONB.heart} />
          </View>
          <Text style={styles.kicker}>{t(S.kicker)}</Text>
          <Text style={serifStyle(31, styles.title)}>{t(S.title)}</Text>

          <CelestialTrace key={m.id} initialComplete={!!m.anchorOpenedAt} onComplete={openScene} />

          {unlocked ? (
            <Animated.View
              testID="anchor-scene-content"
              style={{
                opacity: sceneReveal,
                transform: [
                  {
                    translateY: sceneReveal.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }),
                  },
                ],
              }}
            >
              <View style={styles.voiceBlock}>
                <Text style={styles.sectionLabel}>{t(S.voiceTitle)}</Text>
                <Text style={styles.voiceHint}>{t(S.voiceHint)}</Text>
                <NarratorSelector
                  value={state && state.narration && state.narration.narratorId}
                  onChange={setNarrator}
                  lang={lang}
                  variant="compact"
                />
              </View>

              <Pressable
                onPress={toggleAudio}
                accessibilityRole="button"
                accessibilityLabel={playing ? t(S.stop) : t(S.listen)}
                accessibilityState={{
                  busy: narration.activePlaybackId === playbackId && narration.isLoading,
                }}
                style={({ pressed }) => [styles.audioButton, pressed && styles.pressed]}
              >
                <View style={styles.audioIcon}>
                  <Ionicons name={playing ? 'stop' : 'play'} size={20} color={ONB.ctaInk} />
                </View>
                <View style={styles.audioCopy}>
                  <Text style={styles.audioLabel}>{playing ? t(S.stop) : t(S.listen)}</Text>
                  <Text style={styles.audioState}>{playing ? t(S.listening) : m.title}</Text>
                </View>
                <Ionicons name="headset-outline" size={21} color={ONB.surfaceSoft} />
              </Pressable>
              {audioFailed ? <Text style={styles.audioFail}>{t(S.audioFail)}</Text> : null}

              <View style={styles.scene}>
                <View style={styles.sceneRule} />
                <Text style={styles.sceneText}>{m.story}</Text>
                <Text style={styles.affirmation}>“{m.affirmation}”</Text>
              </View>

              <View style={styles.processBlock}>
                <Text style={styles.sectionLabel}>{t(S.identity)}</Text>
                <Text style={styles.identity}>{m.anchorIdentity}</Text>
                <View style={styles.divider} />
                <View style={styles.bridgeRow}>
                  <View style={styles.bridgeIcon}>
                    <Ionicons name="footsteps-outline" size={19} color={ONB.badgeText} />
                  </View>
                  <View style={styles.bridgeCopy}>
                    <Text style={styles.sectionLabel}>{t(S.bridge)}</Text>
                  </View>
                </View>
                <TextInput
                  testID="anchor-bridge-input"
                  value={bridgeDraft}
                  onChangeText={setBridgeDraft}
                  onContentSizeChange={(event) => {
                    const measured = Math.ceil(event.nativeEvent.contentSize.height || 0);
                    if (measured > 0) setBridgeInputHeight(Math.max(BRIDGE_MIN_HEIGHT, measured));
                  }}
                  multiline
                  scrollEnabled={false}
                  maxLength={280}
                  accessibilityLabel={t(S.bridge)}
                  style={[styles.bridgeInput, { height: bridgeInputHeight }]}
                />
                <Text style={styles.bridgeEdit}>{t(S.bridgeEdit)}</Text>
                <Text style={styles.bridgeNote}>{t(S.bridgeNote)}</Text>
              </View>

              <View style={styles.receipt}>
                <Text style={styles.receiptTitle}>{t(S.receipt)}</Text>
                {itens.map((item) => (
                  <View key={item} style={styles.receiptRow}>
                    <Ionicons name="checkmark" size={16} color={ONB.badgeText} />
                    <Text style={styles.receiptText}>{item}</Text>
                  </View>
                ))}
              </View>

              <ContinueButton
                dark
                label={t(S.cta)}
                disabled={!bridgeDraft.trim()}
                onPress={continueFlow}
                style={styles.cta}
              />
            </Animated.View>
          ) : null}
        </Animated.View>
      </ScrollView>
    </OnbScreen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 20, paddingVertical: 30 },
  shell: { width: '100%', maxWidth: 560 },
  missingShell: {
    flex: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  missingTitle: { marginTop: 22 },
  missingBody: { color: ONB.inkSoft, fontSize: 16, lineHeight: 24, marginTop: 10 },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: ONB.bubble,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ONB.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 3,
  },
  kicker: { color: ONB.inkSoft, fontSize: 12, fontWeight: '800', marginTop: 22, letterSpacing: 0 },
  title: { marginTop: 8, maxWidth: 520 },
  voiceBlock: { marginTop: 22 },
  voiceHint: { color: ONB.inkSoft, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 10 },
  audioButton: {
    minHeight: 64,
    borderRadius: 18,
    backgroundColor: ONB.pillStrong,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginTop: 24,
    borderWidth: 1,
    borderColor: 'rgba(36,64,110,0.10)',
  },
  pressed: { opacity: 0.84, transform: [{ scale: 0.99 }] },
  audioIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: ONB.cta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioCopy: { flex: 1, paddingHorizontal: 12 },
  audioLabel: { color: ONB.surfaceInk, fontSize: 15, fontWeight: '700' },
  audioState: { color: ONB.surfaceSoft, fontSize: 12, marginTop: 3 },
  audioFail: { color: ONB.surfaceSoft, fontSize: 13, lineHeight: 19, marginTop: 9 },
  scene: {
    backgroundColor: ONB.card,
    borderRadius: 22,
    padding: 22,
    marginTop: 18,
    shadowColor: ONB.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 3,
  },
  sceneRule: { width: 42, height: 3, borderRadius: 2, backgroundColor: ONB.heart, marginBottom: 17 },
  sceneText: { color: ONB.surfaceInk, fontSize: 16, lineHeight: 25 },
  affirmation: {
    color: ONB.surfaceInk,
    fontFamily: SERIF,
    fontStyle: 'italic',
    fontSize: 20,
    lineHeight: 29,
    marginTop: 20,
  },
  processBlock: { paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: 'rgba(36,64,110,0.14)' },
  sectionLabel: { color: ONB.inkSoft, fontSize: 12, fontWeight: '800', letterSpacing: 0 },
  identity: { color: ONB.ink, fontFamily: SERIF, fontSize: 21, lineHeight: 29, marginTop: 7 },
  divider: { height: 1, backgroundColor: 'rgba(36,64,110,0.14)', marginVertical: 18 },
  bridgeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  bridgeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: ONB.badgeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bridgeCopy: { flex: 1, marginLeft: 12 },
  bridgeInput: {
    minHeight: 78,
    borderWidth: 1,
    borderColor: 'rgba(36,64,110,0.18)',
    borderRadius: 14,
    backgroundColor: ONB.pillStrong,
    color: ONB.ink,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '600',
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginTop: 12,
    textAlignVertical: 'top',
    overflow: 'hidden',
  },
  bridgeEdit: { color: ONB.inkSoft, fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  bridgeNote: { color: ONB.inkSoft, fontSize: 13, lineHeight: 19, marginTop: 12 },
  receipt: { paddingTop: 21 },
  receiptTitle: { color: ONB.ink, fontSize: 14, fontWeight: '700', marginBottom: 9 },
  receiptRow: { flexDirection: 'row', alignItems: 'center', minHeight: 28 },
  receiptText: { color: ONB.inkSoft, fontSize: 14, marginLeft: 8, flex: 1 },
  cta: { marginTop: 24 },
});
