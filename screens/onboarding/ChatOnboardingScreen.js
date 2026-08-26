import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Typewriter from '../../components/Typewriter';
import { OnbScreen, ContinueButton, OptionPill, serifStyle } from './onboardingUI';
import { APP_NAME, ONB } from '../../constants/brand';
import { UI, txt, tr } from '../../constants/i18n';
import { FLOW, ageConfirmsAdult, fill, stepLines, inferCategory } from './flow';
import { useApp } from '../../context/AppContext';

// Draft of in-progress answers so a reload mid-chat never loses them.
// v: 4 = roteiro completo com respostas rápidas. Rascunhos anteriores podem
// apontar para um campo de texto que agora é uma escolha e são descartados.
const DRAFT_KEY = '@celeste_onb_draft';
const DRAFT_V = 4;
const DRAFT_READ_TIMEOUT_MS = 1500;
const CUSTOM_OPTION = '__custom__';
const initialReduceMotion = () =>
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Strings locais da tela (padrão do app: {en,pt} + tr()).
const S = {
  counter: { en: '{n} of {total}', pt: '{n} de {total}' },
  creating: {
    en: 'Turning your answers into a scene made for you…',
    pt: 'Transformando suas respostas em uma cena feita para você…',
  },
  creationFailed: {
    en: 'Your answers are safe. We could not finish the scene this time.',
    pt: 'Suas respostas estão salvas. Não conseguimos terminar a cena desta vez.',
  },
  retryCreation: { en: 'Try again', pt: 'Tentar novamente' },
  restoringDraft: { en: 'Restoring your conversation…', pt: 'Retomando sua conversa…' },
  other: { en: 'Something else', pt: 'Outra resposta' },
};

function normalizeCloudConsent(profile) {
  const source = profile && typeof profile === 'object' ? profile : {};
  const allowed = ageConfirmsAdult(source.age) && source.cloudPersonalization === true;
  return {
    ...source,
    cloudPersonalization: allowed,
    cloudAdultConfirmed: allowed,
    cloudNarrationConsent: allowed,
    cloudDreamConsent: allowed,
  };
}

export default function ChatOnboardingScreen({ navigation }) {
  const { saveProfile, addManifestation, state } = useApp();
  const { height: viewportHeight } = useWindowDimensions();
  const lang = (state && state.lang) || 'en';
  const T = UI[lang];

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [typing, setTyping] = useState(true);
  const [instant, setInstant] = useState(false);
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [mName, setMName] = useState('');
  const [mExtra, setMExtra] = useState('');
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(initialReduceMotion);
  const autoTimer = useRef(null);
  const finishingRef = useRef(false);
  const finalAnswersRef = useRef(null);
  const lastTypingPulse = useRef(0);
  const draftInteractionRef = useRef(false);

  const step = FLOW[idx];
  const shortCompactStep = step.compact && viewportHeight <= 520;
  const lines = useMemo(() => stepLines(step, answers, APP_NAME, lang), [idx, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Labels follow the active language. Keys stay stable for selection state,
  // while scene-facing answers can be stored in the reader's language.
  const storedOptionValue = (option) =>
    step.storeLocalized ? txt(option.answer || option, lang) : option.en;
  const opts =
    step.type === 'boolean'
      ? [
          { key: true, value: true, label: step.yesLabel ? txt(step.yesLabel, lang) : T.yes },
          { key: false, value: false, label: step.noLabel ? txt(step.noLabel, lang) : T.no },
        ]
      : step.type === 'chips'
      ? [
          ...step.options.map((o) => ({ key: o.en, label: txt(o, lang), value: storedOptionValue(o) })),
          ...(step.allowCustom ? [{ key: CUSTOM_OPTION, label: tr(S.other, lang), custom: true }] : []),
        ]
      : [];

  // Reset per-step UI state, prefilling previous answers when going back.
  useEffect(() => {
    setTyping(step.type !== 'intro'); // telas de valor não digitam — botão na hora
    // Um toque conclui somente a frase atual. A pergunta seguinte volta a ser
    // digitada e mantém o ritmo sensorial letra por letra.
    setInstant(false);
    const prev = answers[step.key];
    const matchedOption =
      step.type === 'chips' &&
      step.options.find((option) => option.en === prev || storedOptionValue(option) === prev);
    const customAnswer =
      step.type === 'chips' && step.allowCustom && typeof prev === 'string' && !matchedOption;
    setValue((step.type === 'text' || customAnswer) && typeof prev === 'string' ? prev : '');
    setSelected(
      step.type === 'chips' || step.type === 'boolean'
        ? customAnswer
          ? CUSTOM_OPTION
          : matchedOption
          ? matchedOption.en
          : prev !== undefined
          ? prev
          : null
        : null
    );
    setItems(step.type === 'list' && Array.isArray(prev) ? prev : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  useEffect(() => () => clearTimeout(autoTimer.current), []);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (alive) setReduceMotion(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      alive = false;
      if (subscription && subscription.remove) subscription.remove();
    };
  }, []);

  const pulseForCharacter = (character) => {
    // Letters and numbers get a tiny pulse; spaces and punctuation stay quiet.
    // The 18 ms guard only suppresses timer catch-up bursts after a background
    // tab or stalled frame. At the normal 26 ms typing cadence every letter fires.
    if (!character || !/[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(character) || reduceMotion) return;
    const now = Date.now();
    if (now - lastTypingPulse.current < 18) return;
    lastTypingPulse.current = now;
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(8);
      }
      return;
    }
    if (Platform.OS === 'android') {
      Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap).catch(() => {});
      return;
    }
    Haptics.selectionAsync().catch(() => {});
  };

  // Restore a saved draft (reload / tab killed mid-chat resumes where the user stopped).
  useEffect(() => {
    let alive = true;
    let readSettled = false;
    const timer = setTimeout(() => {
      if (!alive || readSettled) return;
      setDraftLoaded(true);
    }, DRAFT_READ_TIMEOUT_MS);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        const draft = raw ? JSON.parse(raw) : null;
        if (
          alive &&
          !draftInteractionRef.current &&
          draft &&
          typeof draft === 'object' &&
          draft.v === DRAFT_V &&
          Number.isInteger(draft.idx) &&
          draft.idx > 0 &&
          draft.idx < FLOW.length &&
          draft.answers &&
          typeof draft.answers === 'object'
        ) {
          setAnswers(normalizeCloudConsent(draft.answers));
          setIdx(draft.idx);
        }
      } catch (e) {
        // Corrupt draft — start fresh.
      } finally {
        readSettled = true;
        if (alive) {
          clearTimeout(timer);
          setDraftLoaded(true);
        }
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const goNext = async (ans) => {
    draftInteractionRef.current = true;
    clearTimeout(autoTimer.current);
    // Reset before changing `idx`: child effects run before the parent's step
    // effect, so a new Typewriter must never mount carrying `instant=true` from
    // a tap that completed the previous sentence.
    setInstant(false);
    let i = idx + 1;
    while (i < FLOW.length && FLOW[i].when && !FLOW[i].when(ans)) i += 1;
    if (i >= FLOW.length) {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setCreationError(false);
      setCreating(true);
      const finalAnswers = normalizeCloudConsent(ans);
      finalAnswersRef.current = finalAnswers;
      // Keep the final answer recoverable until the scene exists. Reloading
      // during a provider or device failure must not erase the questionnaire.
      AsyncStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ v: DRAFT_V, idx, answers: finalAnswers })
      ).catch(() => {});
      saveProfile(finalAnswers);
      // Recompensa antes da cobrança: o desejo dela vira a 1ª manifestação e a
      // tela Reveal mostra o resultado ANTES do paywall. Os setState do contexto
      // são funcionais e em ordem — o addManifestation já enxerga o profile.
      try {
        const id = await addManifestation({
          title: String(ans.hopedChange || '').trim(),
          category: inferCategory(ans.hopedChange),
          lang,
          profile: finalAnswers,
        });
        if (!id) throw new Error('scene_not_created');
        AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
        navigation.replace('Reveal', { id });
      } catch (_error) {
        // No answer or exception is logged: questionnaire content can be
        // intimate. The retry reuses the in-memory and persisted final draft.
        finishingRef.current = false;
        setCreating(false);
        setCreationError(true);
      }
    } else {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ v: DRAFT_V, idx: i, answers: ans })).catch(() => {});
      setIdx(i);
    }
  };

  const retryCreation = () => {
    const finalAnswers = finalAnswersRef.current;
    if (!finalAnswers) {
      setCreationError(false);
      return;
    }
    finishingRef.current = false;
    goNext(finalAnswers);
  };

  // Pular pergunta não essencial: some a resposta anterior (se houver) e avança.
  const skipStep = () => {
    clearTimeout(autoTimer.current);
    const next = { ...answers };
    if (step.key) delete next[step.key];
    if (step.key === 'age' || step.key === 'cloudPersonalization') {
      next.cloudPersonalization = false;
      next.cloudAdultConfirmed = false;
      next.cloudNarrationConsent = false;
      next.cloudDreamConsent = false;
    }
    for (const s of FLOW) {
      if (s.key && s.when && !s.when(next)) delete next[s.key];
    }
    setAnswers(next);
    goNext(next);
  };

  const goBack = () => {
    draftInteractionRef.current = true;
    clearTimeout(autoTimer.current);
    setInstant(false);
    let i = idx - 1;
    // Skip statements and gated-off steps so back never lands on an auto-advancing screen.
    while (i >= 0 && (FLOW[i].type === 'statement' || (FLOW[i].when && !FLOW[i].when(answers)))) i -= 1;
    if (i < 0) navigation.goBack();
    else setIdx(i);
  };

  const commit = (val) => {
    const next = { ...answers, [step.key]: val };
    if (step.key === 'age' && !ageConfirmsAdult(val)) {
      next.cloudPersonalization = false;
      next.cloudAdultConfirmed = false;
      next.cloudNarrationConsent = false;
      next.cloudDreamConsent = false;
    }
    if (step.key === 'cloudPersonalization') {
      const allowed = val === true && ageConfirmsAdult(next.age);
      next.cloudPersonalization = allowed;
      next.cloudAdultConfirmed = allowed;
      next.cloudNarrationConsent = allowed;
      next.cloudDreamConsent = allowed;
    }
    // Drop answers from gated steps that became unreachable (e.g. kids after hasKids -> No).
    for (const s of FLOW) {
      if (s.key && s.when && !s.when(next)) delete next[s.key];
    }
    setAnswers(next);
    goNext(next);
  };

  const onTyped = () => {
    setTyping(false);
    if (step.type === 'statement' && !step.needsContinue) {
      autoTimer.current = setTimeout(() => goNext(answers), step.pause || 1500);
    }
  };

  const customChoiceActive = step.type === 'chips' && selected === CUSTOM_OPTION;
  const canSend =
    (step.type === 'text' && (!!value.trim() || step.optional)) ||
    (customChoiceActive && !!value.trim());
  const submitText = () => {
    if (!canSend) return;
    commit(value.trim());
  };

  const pickOption = (o) => {
    draftInteractionRef.current = true;
    clearTimeout(autoTimer.current);
    setSelected(o.key);
    if (o.custom) {
      setValue('');
      return;
    }
    if (step.needsContinue) return;
    autoTimer.current = setTimeout(() => commit(o.value), 220);
  };

  const openModal = () => {
    draftInteractionRef.current = true;
    // Fresh fields on every open so nothing leaks between kids/people entries.
    setMName('');
    setMExtra('');
    setModalOpen(true);
  };

  const addItem = () => {
    draftInteractionRef.current = true;
    if (!mName.trim()) return;
    setItems((arr) => [...arr, { name: mName.trim(), extra: mExtra.trim() }]);
    setMName('');
    setMExtra('');
    setModalOpen(false);
  };

  if (!draftLoaded) {
    return (
      <OnbScreen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}>
          <ActivityIndicator size="small" color={ONB.heart} />
          <Text style={[serifStyle(20), { textAlign: 'center', marginTop: 18 }]}>
            {tr(S.restoringDraft, lang)}
          </Text>
        </View>
      </OnbScreen>
    );
  }

  if (creating || creationError) {
    return (
      <OnbScreen>
        <View
          accessibilityRole={creationError ? 'alert' : undefined}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 }}
        >
          {creationError ? (
            <>
              <Ionicons name="cloud-offline-outline" size={42} color={ONB.heart} />
              <Text style={[serifStyle(25), { textAlign: 'center', marginTop: 22 }]}>
                {tr(S.creationFailed, lang)}
              </Text>
              <Pressable
                testID="retry-scene-creation"
                accessibilityRole="button"
                onPress={retryCreation}
                style={({ pressed }) => ({
                  minWidth: 210,
                  minHeight: 52,
                  marginTop: 26,
                  borderRadius: 8,
                  paddingHorizontal: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: ONB.cta,
                  opacity: pressed ? 0.82 : 1,
                })}
              >
                <Ionicons name="refresh" size={19} color={ONB.ctaInk} />
                <Text style={{ marginLeft: 8, color: ONB.ctaInk, fontSize: 16, fontWeight: '700' }}>
                  {tr(S.retryCreation, lang)}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={ONB.heart} />
              <Text style={[serifStyle(26), { textAlign: 'center', marginTop: 24 }]}>
                {tr(S.creating, lang)}
              </Text>
            </>
          )}
        </View>
      </OnbScreen>
    );
  }

  const centered = step.type === 'statement' || step.type === 'text';

  return (
    <OnbScreen>
      <KeyboardAvoidingView
        style={{ flex: 1, minHeight: 0 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Top bar: back + progress */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 }}>
          <Pressable
            onPress={goBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={txt({ en: 'Go back', pt: 'Voltar' }, lang)}
          >
            <Ionicons name="arrow-back" size={24} color={ONB.inkSoft} />
          </Pressable>
          <View
            style={{ flex: 1, marginLeft: 16, height: 5, borderRadius: 3, backgroundColor: ONB.track, overflow: 'hidden' }}
          >
            <View
              style={{
                width: `${Math.round(((idx + 1) / FLOW.length) * 100)}%`,
                height: '100%',
                borderRadius: 3,
                backgroundColor: ONB.trackFill,
              }}
            />
          </View>
          {/* Contador honesto: posição no roteiro (mesma conta da barra) */}
          <Text style={{ marginLeft: 10, fontSize: 13, color: ONB.inkSoft, fontVariant: ['tabular-nums'] }}>
            {tr(S.counter, lang, { n: idx + 1, total: FLOW.length })}
          </Text>
          {step.skippable ? (
            <Pressable
              onPress={skipStep}
              accessibilityRole="button"
              // hitSlop não aumenta área de toque no RN-web — dimensão real
              style={{ marginLeft: 12, minWidth: 48, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ fontSize: 15, fontWeight: '600', color: ONB.inkSoft }}>{T.skip}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Question area — tap anywhere to finish typing instantly */}
        <Pressable
          testID="onboarding-question-area"
          style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
          onPress={() => setInstant(true)}
        >
          <View
            style={{
              flex: 1,
              minHeight: 0,
              paddingHorizontal: 26,
              justifyContent: centered ? 'center' : 'flex-start',
              paddingTop: centered ? 0 : shortCompactStep ? 12 : step.compact ? 32 : 100,
              paddingBottom: centered ? 60 : shortCompactStep ? 8 : step.compact ? 16 : 0,
            }}
          >
            {step.type === 'intro' ? (
              <View>
                <View
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 30,
                    backgroundColor: ONB.bubble,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 26,
                    shadowColor: ONB.shadow,
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.18,
                    shadowRadius: 16,
                    elevation: 3,
                  }}
                >
                  <Ionicons name={step.icon} size={44} color={ONB.heart} />
                </View>
                <Text style={serifStyle(30)}>{txt(step.title, lang)}</Text>
                {step.sub ? (
                  <Text style={{ fontSize: 16, lineHeight: 24, color: ONB.inkSoft, marginTop: 14 }}>
                    {txt(step.sub, lang)}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Typewriter
                key={`${step.id}-${lang}`}
                lines={lines}
                instant={instant}
                textStyle={serifStyle(shortCompactStep ? step.shortTextSize || 19 : step.textSize || 29)}
                onCharacter={pulseForCharacter}
                characterMotion={!reduceMotion}
                onDone={onTyped}
              />
            )}

            {/* Chips / boolean options */}
            {!typing && opts.length ? (
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ marginTop: shortCompactStep ? 10 : step.compact ? 18 : 28, flex: 1, minHeight: 0 }}
                contentContainerStyle={[
                  { paddingBottom: 8 },
                  step.wrap && { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
                ]}
              >
                {opts.map((o) => (
                  <OptionPill
                    key={String(o.key)}
                    label={o.label}
                    active={selected === o.key}
                    onPress={() => pickOption(o)}
                    style={step.compact ? { paddingVertical: 11, marginBottom: 8 } : null}
                  />
                ))}
              </ScrollView>
            ) : null}

            {/* List (kids / people) */}
            {!typing && step.type === 'list' ? (
              <ScrollView
                style={{ marginTop: 24, flex: 1, minHeight: 0 }}
                showsVerticalScrollIndicator={false}
              >
                {items.map((it, i) => (
                  <View
                    key={`${it.name}-${i}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: ONB.pillStrong,
                      borderRadius: 18,
                      paddingHorizontal: 18,
                      paddingVertical: 14,
                      marginBottom: 10,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, color: ONB.surfaceInk, fontWeight: '600' }}>{it.name}</Text>
                      {it.extra ? <Text style={{ fontSize: 13, color: ONB.surfaceSoft, marginTop: 2 }}>{it.extra}</Text> : null}
                    </View>
                    <Pressable
                      onPress={() => {
                        draftInteractionRef.current = true;
                        setItems((arr) => arr.filter((_, j) => j !== i));
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`${txt({ en: 'Remove', pt: 'Remover' }, lang)} ${it.name}`}
                    >
                      <Ionicons name="close" size={18} color={ONB.surfaceSoft} />
                    </Pressable>
                  </View>
                ))}
                <Pressable
                  onPress={openModal}
                  style={({ pressed }) => [
                    {
                      borderWidth: 1.5,
                      borderStyle: 'dashed',
                      borderColor: ONB.inkFaint,
                      backgroundColor: ONB.pillSoft,
                      borderRadius: 18,
                      paddingVertical: 18,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Ionicons name="add" size={20} color={ONB.inkSoft} />
                  <Text style={{ fontSize: 16, color: ONB.inkSoft, marginLeft: 8 }}>
                    {txt(step.addLabel, lang)}
                  </Text>
                </Pressable>
              </ScrollView>
            ) : null}
          </View>
        </Pressable>

        {/* Bottom action area */}
        {!typing && (step.type === 'text' || customChoiceActive) ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: 24 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: ONB.pill,
                borderRadius: 999,
                paddingLeft: 24,
                paddingRight: 8,
                height: 58,
              }}
            >
              <TextInput
                key={step.id}
                value={value}
                onChangeText={(nextValue) => {
                  draftInteractionRef.current = true;
                  setValue(nextValue);
                }}
                placeholder={fill(txt(customChoiceActive ? step.customPlaceholder : step.placeholder, lang), answers, APP_NAME)}
                placeholderTextColor={ONB.surfaceFaint}
                keyboardType={step.keyboard}
                autoFocus
                style={[{ flex: 1, fontSize: 16, color: ONB.surfaceInk }, Platform.OS === 'web' ? { outlineStyle: 'none' } : null]}
                onSubmitEditing={submitText}
              />
              <Pressable
                onPress={submitText}
                disabled={!canSend}
                accessibilityRole="button"
                accessibilityLabel={txt({ en: 'Send', pt: 'Enviar' }, lang)}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="send" size={20} color={canSend ? ONB.surfaceInk : ONB.surfaceFaint} />
              </Pressable>
            </View>
          </View>
        ) : null}

        {step.type === 'intro' ||
        (!typing &&
          ((step.type === 'statement' && step.needsContinue) ||
            (step.type === 'chips' && step.needsContinue && !customChoiceActive) ||
            step.type === 'list')) ? (
          <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
            <ContinueButton
              label={T.continue}
              onPress={() =>
                step.type === 'statement' || step.type === 'intro'
                  ? goNext(answers)
                  : commit(step.type === 'list' ? items : selected)
              }
              disabled={
                (step.type === 'chips' && !selected) || (step.type === 'list' && step.requireOne && items.length === 0)
              }
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* Add child / person modal */}
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(30,10,20,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 22, paddingBottom: 36 }}>
            <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#E4DDE1', marginBottom: 14 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text style={serifStyle(24, { color: ONB.surfaceInk })}>{txt(step.modalTitle, lang)}</Text>
              <Pressable
                onPress={() => setModalOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={txt({ en: 'Close', pt: 'Fechar' }, lang)}
              >
                <Ionicons name="close" size={22} color={ONB.surfaceSoft} />
              </Pressable>
            </View>
            <TextInput
              value={mName}
              onChangeText={(nextValue) => {
                draftInteractionRef.current = true;
                setMName(nextValue);
              }}
              placeholder={T.namePh}
              placeholderTextColor="#B9AEB5"
              style={[
                { backgroundColor: '#F7F3F5', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: ONB.surfaceInk, marginBottom: 12 },
                Platform.OS === 'web' ? { outlineStyle: 'none' } : null,
              ]}
            />
            <TextInput
              value={mExtra}
              onChangeText={(nextValue) => {
                draftInteractionRef.current = true;
                setMExtra(nextValue);
              }}
              placeholder={txt(step.extraPlaceholder, lang)}
              placeholderTextColor="#B9AEB5"
              keyboardType={step.extraKeyboard}
              onSubmitEditing={addItem}
              style={[
                { backgroundColor: '#F7F3F5', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: ONB.surfaceInk, marginBottom: 18 },
                Platform.OS === 'web' ? { outlineStyle: 'none' } : null,
              ]}
            />
            <ContinueButton dark label={T.add} onPress={addItem} disabled={!mName.trim()} />
          </View>
        </View>
      </Modal>
    </OnbScreen>
  );
}
