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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Typewriter from '../../components/Typewriter';
import { OnbScreen, ContinueButton, OptionPill, serifStyle } from './onboardingUI';
import { APP_NAME, ONB } from '../../constants/brand';
import { UI, txt, tr } from '../../constants/i18n';
import { FLOW, fill, stepLines, inferCategory } from './flow';
import { useApp } from '../../context/AppContext';

// Draft of in-progress answers so a reload mid-chat never loses them.
// v: 2 = fluxo enxuto de 20/08 — rascunho de versão antiga é descartado
// (o idx apontaria pra outra pergunta e as respostas cortadas virariam órfãs).
const DRAFT_KEY = '@celeste_onb_draft';
const DRAFT_V = 2;

// Strings locais da tela (padrão do app: {en,pt} + tr()).
const S = {
  counter: { en: '{n} of {total}', pt: '{n} de {total}' },
};

export default function ChatOnboardingScreen({ navigation }) {
  const { saveProfile, addManifestation, state } = useApp();
  const lang = (state && state.lang) || 'en';
  const T = UI[lang];

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [typing, setTyping] = useState(true);
  const [instant, setInstant] = useState(false);
  // Depois do 1º toque pra pular a digitação, TODAS as próximas perguntas já
  // nascem reveladas (a preferência é lembrada — ninguém pula duas vezes à toa).
  const [fastMode, setFastMode] = useState(false);
  const [value, setValue] = useState('');
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [mName, setMName] = useState('');
  const [mExtra, setMExtra] = useState('');
  const autoTimer = useRef(null);

  const step = FLOW[idx];
  const lines = useMemo(() => stepLines(step, answers, APP_NAME, lang), [idx, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Options resolved for the active language; `key` is the canonical stored value.
  const opts =
    step.type === 'boolean'
      ? [
          { key: true, label: T.yes },
          { key: false, label: T.no },
        ]
      : step.type === 'chips'
      ? step.options.map((o) => ({ key: o.en, label: txt(o, lang) }))
      : [];

  // Reset per-step UI state, prefilling previous answers when going back.
  useEffect(() => {
    setTyping(step.type !== 'intro'); // telas de valor não digitam — botão na hora
    // fastMode: o Typewriter recebe instant e dispara onDone na hora, então a
    // lógica de statements/auto-avanço continua a mesma, só sem a espera.
    setInstant(fastMode);
    const prev = answers[step.key];
    setValue(step.type === 'text' && typeof prev === 'string' ? prev : '');
    setSelected(step.type === 'chips' || step.type === 'boolean' ? (prev !== undefined ? prev : null) : null);
    setItems(step.type === 'list' && Array.isArray(prev) ? prev : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  useEffect(() => () => clearTimeout(autoTimer.current), []);

  // Restore a saved draft (reload / tab killed mid-chat resumes where the user stopped).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        const draft = raw ? JSON.parse(raw) : null;
        if (
          alive &&
          draft &&
          typeof draft === 'object' &&
          draft.v === DRAFT_V &&
          Number.isInteger(draft.idx) &&
          draft.idx > 0 &&
          draft.idx < FLOW.length &&
          draft.answers &&
          typeof draft.answers === 'object'
        ) {
          setAnswers(draft.answers);
          setIdx(draft.idx);
        }
      } catch (e) {
        // Corrupt draft — start fresh.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const goNext = (ans) => {
    clearTimeout(autoTimer.current);
    let i = idx + 1;
    while (i < FLOW.length && FLOW[i].when && !FLOW[i].when(ans)) i += 1;
    if (i >= FLOW.length) {
      AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      saveProfile(ans);
      // Recompensa antes da cobrança: o desejo dela vira a 1ª manifestação e a
      // tela Reveal mostra o resultado ANTES do paywall. Os setState do contexto
      // são funcionais e em ordem — o addManifestation já enxerga o profile.
      const id = addManifestation({
        title: String(ans.hopedChange || '').trim(),
        category: inferCategory(ans.hopedChange),
      });
      navigation.replace('Reveal', { id });
    } else {
      AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ v: DRAFT_V, idx: i, answers: ans })).catch(() => {});
      setIdx(i);
    }
  };

  // Pular pergunta não essencial: some a resposta anterior (se houver) e avança.
  const skipStep = () => {
    clearTimeout(autoTimer.current);
    const next = { ...answers };
    if (step.key) delete next[step.key];
    for (const s of FLOW) {
      if (s.key && s.when && !s.when(next)) delete next[s.key];
    }
    setAnswers(next);
    goNext(next);
  };

  const goBack = () => {
    clearTimeout(autoTimer.current);
    let i = idx - 1;
    // Skip statements and gated-off steps so back never lands on an auto-advancing screen.
    while (i >= 0 && (FLOW[i].type === 'statement' || (FLOW[i].when && !FLOW[i].when(answers)))) i -= 1;
    if (i < 0) navigation.goBack();
    else setIdx(i);
  };

  const commit = (val) => {
    const next = { ...answers, [step.key]: val };
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

  const canSend = step.type === 'text' && (!!value.trim() || step.optional);
  const submitText = () => {
    if (!canSend) return;
    commit(value.trim());
  };

  const pickOption = (o) => {
    clearTimeout(autoTimer.current);
    setSelected(o.key);
    if (step.needsContinue) return;
    autoTimer.current = setTimeout(() => commit(o.key), 220);
  };

  const openModal = () => {
    // Fresh fields on every open so nothing leaks between kids/people entries.
    setMName('');
    setMExtra('');
    setModalOpen(true);
  };

  const addItem = () => {
    if (!mName.trim()) return;
    setItems((arr) => [...arr, { name: mName.trim(), extra: mExtra.trim() }]);
    setMName('');
    setMExtra('');
    setModalOpen(false);
  };

  const centered = step.type === 'statement' || step.type === 'text';

  return (
    <OnbScreen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
          style={{ flex: 1 }}
          onPress={() => {
            setInstant(true);
            setFastMode(true); // 1º toque desliga a máquina de escrever pro resto do fluxo
          }}
        >
          <View
            style={{
              flex: 1,
              paddingHorizontal: 26,
              justifyContent: centered ? 'center' : 'flex-start',
              paddingTop: centered ? 0 : 100,
              paddingBottom: centered ? 60 : 0,
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
              <Typewriter key={`${step.id}-${lang}`} lines={lines} instant={instant} textStyle={serifStyle(29)} onDone={onTyped} />
            )}

            {/* Chips / boolean options */}
            {!typing && opts.length ? (
              <View
                style={[
                  { marginTop: 28 },
                  step.wrap && { flexDirection: 'row', flexWrap: 'wrap', columnGap: 10 },
                ]}
              >
                {opts.map((o) => (
                  <OptionPill key={String(o.key)} label={o.label} active={selected === o.key} onPress={() => pickOption(o)} />
                ))}
              </View>
            ) : null}

            {/* List (kids / people) */}
            {!typing && step.type === 'list' ? (
              <ScrollView style={{ marginTop: 24 }} showsVerticalScrollIndicator={false}>
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
                      onPress={() => setItems((arr) => arr.filter((_, j) => j !== i))}
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
        {!typing && step.type === 'text' ? (
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
                onChangeText={setValue}
                placeholder={fill(txt(step.placeholder, lang), answers, APP_NAME)}
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
          ((step.type === 'statement' && step.needsContinue) || (step.type === 'chips' && step.needsContinue) || step.type === 'list')) ? (
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
              onChangeText={setMName}
              placeholder={T.namePh}
              placeholderTextColor="#B9AEB5"
              style={[
                { backgroundColor: '#F7F3F5', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: ONB.surfaceInk, marginBottom: 12 },
                Platform.OS === 'web' ? { outlineStyle: 'none' } : null,
              ]}
            />
            <TextInput
              value={mExtra}
              onChangeText={setMExtra}
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
