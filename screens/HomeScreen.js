import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Screen, Header, Card, EmptyState, Button } from '../ui/kit';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { CATEGORIES, categoryMeta } from '../constants/content';
import { APP_NAME } from '../constants/brand';
import {
  CLOUD_CONSENT_VERSION,
  hasCurrentCloudConsentVersion,
} from '../constants/cloudConsent';
import { RELEASE_FEATURES } from '../constants/releaseFeatures';
import { accentAt, alpha } from '../utils/colors';
import { todayISO } from '../utils/date';
import { confirmAsync } from '../utils/confirm';
import { useT } from '../utils/useT';
import { txt, tr, detectLang } from '../constants/i18n';
import { isUnder18Age } from './onboarding/flow';
import { selectDailyRitual } from '../utils/dailyRitual';

import GradientCover from '../components/GradientCover';
import CelesteMascot from '../components/CelesteMascot';
import ManifestCard from '../components/ManifestCard';
import SectionHeading from '../components/SectionHeading';

// Dicionário local da tela — toda string visível passa por t(S.chave).
const S = {
  loading: { en: 'Tuning into your frequency…', pt: 'Sintonizando na sua frequência…' },
  subtitle: {
    en: '{name}, your practice is compounding',
    pt: '{name}, sua prática cresce a cada dia',
  },
  heroLead: { en: '{name}, what do you want to', pt: '{name}, o que você quer' },
  heroAccent: { en: 'manifest?', pt: 'manifestar?' },
  // Forma nominal: o texto digitado entra direto na afirmação, então o exemplo
  // não pode trazer verbo ("Eu quero manifestar…" quebrava o português dela).
  placeholder: {
    en: 'true love, an extra $1,000 a month…',
    pt: 'um amor de verdade, 10 mil por mês…',
  },
  sendDesire: { en: 'Send your desire', pt: 'Enviar seu desejo' },
  creating: { en: 'Creating your scene…', pt: 'Criando sua cena…' },
  consentTitle: { en: 'Allow optional cloud processing?', pt: 'Permitir processamento opcional em nuvem?' },
  consentBody: {
    en: 'If you are 18 or older, this single control allows optional cloud processing. Celeste sends only what is needed: Anthropic normally creates scene text and OpenAI is its failover; if neither is configured, approved Google Gemini processing may create the scene. Gemini also creates images, translates text and interprets dreams, and ElevenLabs narrates selected text. Choose local to keep all new processing on this device.',
    pt: 'Se você tem 18 anos ou mais, este controle único permite o processamento opcional em nuvem. O Celeste envia somente o necessário: a Anthropic normalmente cria o texto da cena e a OpenAI é sua alternativa; se nenhuma estiver configurada, o processamento aprovado do Google Gemini poderá criar a cena. O Gemini também cria imagens, traduz textos e interpreta sonhos, e a ElevenLabs narra o texto selecionado. Escolha local para manter todo novo processamento neste aparelho.',
  },
  consentAllow: { en: 'I am 18+ · Allow', pt: 'Tenho 18+ · Permitir' },
  consentLocal: { en: 'Use local', pt: 'Usar local' },
  inviteTitle: { en: 'Start a 21-day practice', pt: 'Comece uma prática de 21 dias' },
  // Só o que a pessoa escreve AQUI nasce com 21 dias; os cards sugeridos têm
  // metas próprias (14, 21 ou 30). O texto fala apenas do que ele faz.
  inviteSub: {
    en: 'The manifestation you write here runs for 21 days of daily practice. Tap to write yours.',
    pt: 'A manifestação que você escrever aqui roda 21 dias de prática diária. Toque para escrever a sua.',
  },
  inviteDismiss: { en: 'Dismiss this invite', pt: 'Fechar este convite' },
  streakOne: { en: '1 day streak', pt: '1 dia seguido' },
  streakMany: { en: '{n} day streak', pt: '{n} dias seguidos' },
  // Meta do dia = 1 prática, qualquer uma. Nada de "0 de 8 · 0%": a faixa diz
  // se hoje já foi e quantas seguem ativas — número honesto, sem denominador.
  newManifest: { en: 'New manifestation', pt: 'Nova manifestação' },
  // Mesmo texto da tela interna: desfazer pede confirmação, marcar não.
  undoTitle: { en: 'Undo today’s practice?', pt: 'Desfazer a prática de hoje?' },
  undoBody: {
    en: 'Today will no longer count as practised for this manifestation.',
    pt: 'Hoje deixa de contar como praticado nesta manifestação.',
  },
  undoConfirm: { en: 'Undo', pt: 'Desfazer' },
  keep: { en: 'Keep it', pt: 'Manter' },
  yours: { en: 'Your manifestations', pt: 'Suas manifestações' },
  emptyTitle: { en: 'Nothing in motion yet', pt: 'Nada em movimento ainda' },
  emptyBody: {
    en: 'Type a desire above and {app} will build your practice around it.',
    pt: 'Escreva um desejo aí em cima e o {app} monta sua prática em volta dele.',
  },
  morningTitle: { en: 'Share your dream', pt: 'Conte seu sonho' },
  morningEmpty: {
    en: 'Turn what stayed with you into a personal affirmation',
    pt: 'Transforme o que ficou dele numa afirmação só sua',
  },
  morningSaved: { en: '{n} dream affirmations saved', pt: '{n} afirmações de sonhos salvas' },
  alarmTitle: { en: 'Affirmation alarm', pt: 'Despertador com afirmação' },
  alarmEmpty: {
    en: 'Choose your phrase, time, and days of the week',
    pt: 'Escolha sua frase, horário e dias da semana',
  },
  morningPrepared: { en: 'Affirmation chosen for {time}', pt: 'Afirmação escolhida para {time}' },
  morningActive: { en: 'Alarm active at {time}', pt: 'Despertador ativo às {time}' },
  practicePlanTitle: { en: 'Celeste Plan', pt: 'Plano Celeste' },
  practicePlanEmpty: {
    en: 'Choose your vision, affirmation, and moments of the day',
    pt: 'Escolha sua visão, afirmação e momentos do dia',
  },
  practicePlanActive: {
    en: 'Reminders at {times}',
    pt: 'Lembretes às {times}',
  },
  openMorning: { en: 'Share your dream', pt: 'Contar meu sonho' },
  openProfile: { en: 'Open profile and settings', pt: 'Abrir perfil e configurações' },
  yourDay: { en: 'Your day', pt: 'Seu dia' },
  anchorScene: { en: 'My Anchor Scene', pt: 'Minha Cena-Âncora' },
  anchorSceneHint: {
    en: 'Return to the scene created from your answers',
    pt: 'Volte à cena criada a partir das suas respostas',
  },
  minuteTitle: { en: 'Your Celeste minute', pt: 'Seu minuto Celeste' },
  minuteReady: {
    en: 'One affirmation and one possible step for today',
    pt: 'Uma afirmação e um passo possível para hoje',
  },
  minuteDone: { en: 'Today complete · {streak}', pt: 'Hoje concluído · {streak}' },
  minuteStart: { en: 'Start my minute', pt: 'Começar meu minuto' },
  minuteRepeat: { en: 'Repeat my minute', pt: 'Repetir meu minuto' },
  chapter: { en: 'Chapter {n}', pt: 'Capítulo {n}' },
};

// Dispensar o convite é preferência de interface, não dado de conta: guardamos
// em chave própria para a escolha sobreviver ao reload sem inchar o contexto.
const INVITE_KEY = '@celeste_home_invite_dismissed_v1';

export default function HomeScreen() {
  const th = useTheme();
  const navigation = useNavigation();
  const { state, loading, derived, addManifestation, togglePractice, saveProfile } = useApp();
  const { t, lang } = useT();
  const [desire, setDesire] = useState('');
  const [category, setCategory] = useState('Wealth');
  // Com manifestações na lista o campo de desejo recolhe: a Home do décimo dia
  // abre na prática do dia, não no funil de novata.
  const [composerOpen, setComposerOpen] = useState(false);
  // null = ainda lendo do storage; assim o convite não pisca antes de sabermos
  // se a pessoa já o dispensou.
  const [inviteDismissed, setInviteDismissed] = useState(null);
  // Só com o campo focado o envio precisa sair na descida do dedo (ver o botão).
  const [inputFocused, setInputFocused] = useState(false);
  const [generating, setGenerating] = useState(false);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  // O envio dispara no onPressIn (ver `submit`); o onPress que vem logo atrás
  // cairia de novo no mesmo texto — este ref segura o segundo disparo.
  const sentRef = useRef('');

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(INVITE_KEY)
      .then((v) => {
        if (alive) setInviteDismissed(v === '1');
      })
      .catch(() => {
        if (alive) setInviteDismissed(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading || !state) {
    // Ainda não temos state.lang — cai no idioma do aparelho para não piscar em inglês.
    const bootLang = state && state.lang ? state.lang : detectLang();
    return (
      <Screen>
        <Header title={APP_NAME} />
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={th.accent} />
          <Text style={{ color: th.textMuted, marginTop: 12 }}>{tr(S.loading, bootLang)}</Text>
        </View>
      </Screen>
    );
  }

  // Todo lugar que escreve no campo passa por aqui: além de setar o texto,
  // libera o envio de novo (senão o guarda de duplo disparo bloquearia).
  const writeDesire = (text) => {
    sentRef.current = '';
    setDesire(text);
  };

  // Sugestão que preenche um campo fora da tela parece que não fez nada:
  // voltamos ao topo e deixamos o cursor no campo.
  const focusDesire = () => {
    // O composer pode estar recolhido — abre primeiro e foca depois do render.
    setComposerOpen(true);
    if (scrollRef.current && scrollRef.current.scrollTo) {
      scrollRef.current.scrollTo({ y: 0, animated: true });
    }
    setTimeout(() => {
      if (inputRef.current && inputRef.current.focus) inputRef.current.focus();
    }, 0);
  };

  // Chamado no onPressIn do botão: com o teclado aberto, o toque que fecha o
  // teclado engolia o clique e obrigava a tocar duas vezes. Disparando na
  // descida do dedo, o primeiro toque já envia.
  const submit = async () => {
    const title = desire.trim();
    if (!title || generating || sentRef.current === title) return;
    sentRef.current = title;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const meta = categoryMeta(category);
    const currentProfile = state.profile || {};
    const knownMinor = isUnder18Age(currentProfile.age);
    const currentConsentDecision =
      RELEASE_FEATURES.paidCloudProcessing &&
      !knownMinor &&
      hasCurrentCloudConsentVersion(currentProfile);
    let cloudConsentVersion = currentConsentDecision ? CLOUD_CONSENT_VERSION : null;
    let cloudPersonalization =
      currentConsentDecision && currentProfile.cloudPersonalization === true;
    let cloudAdultConfirmed = cloudPersonalization && currentProfile.cloudAdultConfirmed === true;
    let cloudNarrationConsent =
      currentConsentDecision && currentProfile.cloudNarrationConsent === true;
    let cloudDreamConsent =
      currentConsentDecision && currentProfile.cloudDreamConsent === true;
    if (!RELEASE_FEATURES.paidCloudProcessing) {
      cloudConsentVersion = null;
      cloudPersonalization = false;
      cloudAdultConfirmed = false;
      if (
        currentProfile.cloudConsentVersion ||
        currentProfile.cloudPersonalization === true ||
        currentProfile.cloudAdultConfirmed === true ||
        currentProfile.cloudNarrationConsent === true ||
        currentProfile.cloudDreamConsent === true
      ) {
        saveProfile({
          cloudConsentVersion: null,
          cloudPersonalization: false,
          cloudAdultConfirmed: false,
          cloudNarrationConsent: false,
          cloudDreamConsent: false,
        });
      }
    } else if (!knownMinor && !currentConsentDecision) {
      cloudPersonalization = await confirmAsync({
        title: t(S.consentTitle),
        message: t(S.consentBody),
        confirmLabel: t(S.consentAllow),
        cancelLabel: t(S.consentLocal),
        destructive: false,
        lang,
      });
      cloudAdultConfirmed = cloudPersonalization;
      cloudNarrationConsent = cloudPersonalization;
      cloudDreamConsent = cloudPersonalization;
      cloudConsentVersion = CLOUD_CONSENT_VERSION;
      saveProfile({
        cloudConsentVersion,
        cloudPersonalization,
        cloudAdultConfirmed,
        cloudNarrationConsent,
        cloudDreamConsent,
      });
    } else if (!cloudPersonalization || !cloudAdultConfirmed) {
      cloudPersonalization = false;
      cloudAdultConfirmed = false;
    }

    setGenerating(true);
    try {
      // A categoria escolhida no chip vai junto e fica gravada no item: o card
      // nasce com o rótulo, o ícone e o acento dela.
      const id = await addManifestation({
        title,
        category,
        lang,
        accent: meta.accent,
        goalDays: 21,
        profile: {
          ...currentProfile,
          cloudConsentVersion,
          cloudPersonalization,
          cloudAdultConfirmed,
          cloudNarrationConsent,
          cloudDreamConsent,
        },
      });
      if (!id) {
        // Reset/import pode invalidar uma geração remota ainda em voo. Nesse
        // caso o texto continua no campo para a pessoa tentar novamente.
        sentRef.current = '';
        return;
      }
      setDesire('');
      setComposerOpen(false);
      Keyboard.dismiss();
      navigation.navigate('Manifestation', { id });
    } catch (e) {
      sentRef.current = '';
    } finally {
      setGenerating(false);
    }
  };

  const dismissInvite = () => {
    setInviteDismissed(true);
    AsyncStorage.setItem(INVITE_KEY, '1').catch(() => {});
  };

  // Mesma regra da tela interna: desfazer apaga registro e pede confirmação;
  // marcar não pede. O togglePractice do contexto não confirma nada — quem
  // chama (aqui) segura o gesto destrutivo.
  const toggleToday = async (m) => {
    if (m.sessions.includes(todayISO())) {
      const ok = await confirmAsync({
        title: t(S.undoTitle),
        message: t(S.undoBody),
        confirmLabel: t(S.undoConfirm),
        cancelLabel: t(S.keep),
      });
      if (!ok) return;
    }
    Haptics.selectionAsync().catch(() => {});
    togglePractice(m.id);
  };

  // completedAt preserva o marco histórico da primeira conclusão. O estado
  // atual do ciclo, porém, vem sempre da contagem atual e pode voltar a ativo
  // quando a pessoa desfaz um dia.
  const isComplete = (m) => m.sessions.length >= m.goalDays;
  const morningRitual = state.morningRitual || {};
  const hasWakeAffirmation = !!morningRitual.wakeAffirmationText;
  const dreamCount = Array.isArray(morningRitual.entries) ? morningRitual.entries.length : 0;
  const practicePlan = state.practicePlan || {};
  const practicePlanTimes = Array.isArray(practicePlan.slots)
    ? practicePlan.slots
        .filter((slot) => slot && slot.enabled !== false && typeof slot.time === 'string')
        .map((slot) => slot.time)
    : [];
  const practicePlanActive = practicePlan.enabled === true && practicePlanTimes.length > 0;
  const hasItems = state.manifestations.length > 0;
  const anchorScene =
    state.manifestations.find((item) => item.id === state.anchorSceneId) ||
    state.manifestations.find((item) => item.origin === 'onboarding-anchor') ||
    state.manifestations.find((item) => item.anchorOpenedAt) ||
    state.manifestations[state.manifestations.length - 1] ||
    null;
  const dailyRitual = selectDailyRitual(state, todayISO());
  // Lista: pendentes de hoje primeiro, ativas já praticadas no meio,
  // concluídas por último (sort estável preserva a ordem de criação).
  const rankOf = (m) => (isComplete(m) ? 2 : m.sessions.includes(todayISO()) ? 1 : 0);
  const sorted = [...state.manifestations].sort((a, b) => rankOf(a) - rankOf(b));

  const streakLabel =
    derived.streak === 1 ? t(S.streakOne) : t(S.streakMany, { n: derived.streak });

  // O hero de escrever desejo. Com a lista vazia fica sempre aberto; com itens
  // recolhe em "Nova manifestação" e só expande quando pedirem.
  const composer = (
    <GradientCover accent={0} radius={24} style={styles.hero} intensity={0.9}>
      <View style={styles.heroInner}>
        <View style={[styles.avatar, { borderColor: alpha('#FFFFFF', 0.6) }]}>
          <Ionicons name="person" size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.heroTitle}>
          {t(S.heroLead, { name: state.name })}{' '}
          <Text style={styles.heroItalic}>{t(S.heroAccent)}</Text>
        </Text>

        {/* Chips ANTES do campo: ela escolhe o assunto e depois escreve.
            Abaixo do campo, o teclado aberto os escondia e quase toda
            manifestação nascia 'Wealth' sem ninguém ter escolhido. */}
        <View style={styles.catRow}>
          {CATEGORIES.map((c) => {
            const active = c.key === category;
            const label = c.label ? txt(c.label, lang) : c.key;
            return (
              <TouchableOpacity
                key={c.key}
                activeOpacity={0.8}
                onPress={() => setCategory(c.key)}
                disabled={generating}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityState={{ selected: active }}
                style={[
                  styles.catChip,
                  {
                    backgroundColor: active ? '#FFFFFF' : alpha('#FFFFFF', 0.25),
                  },
                ]}
              >
                <Ionicons
                  name={c.icon}
                  size={12}
                  color={active ? accentAt(th, c.accent) : '#FFFFFF'}
                />
                <Text
                  style={[
                    styles.catText,
                    { color: active ? accentAt(th, c.accent) : '#FFFFFF' },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* A pílula INTEIRA leva o foco pro campo: o TextInput ocupava 20px no
            meio dos 52 e clicar perto da borda deixava o foco no body. */}
        <Pressable
          onPress={() => {
            if (inputRef.current && inputRef.current.focus) inputRef.current.focus();
          }}
          style={[styles.inputRow, { backgroundColor: alpha('#FFFFFF', 0.92) }]}
        >
          <TextInput
            ref={inputRef}
            value={desire}
            onChangeText={writeDesire}
            editable={!generating}
            placeholder={t(S.placeholder)}
            placeholderTextColor={alpha(th.text, 0.4)}
            style={[styles.input, { color: th.text }]}
            returnKeyType="done"
            onSubmitEditing={submit}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
          <TouchableOpacity
            activeOpacity={0.8}
            // Com o teclado ABERTO o clique se perde no reflow do blur, e
            // só o onPressIn salva. Com o teclado fechado, disparar na
            // descida do dedo criaria a manifestação num simples arrastar —
            // então lá o onPress normal (cancelável) é quem atende.
            onPressIn={() => {
              if (inputFocused) submit();
            }}
            onPress={submit}
            disabled={generating || !desire.trim()}
            accessibilityRole="button"
            accessibilityLabel={t(S.sendDesire)}
            style={[
              styles.sendBtn,
              { backgroundColor: desire.trim() ? accentAt(th, 0) : alpha(th.text, 0.2) },
            ]}
          >
            {generating ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </Pressable>
        {generating ? <Text style={styles.generatingText}>{t(S.creating)}</Text> : null}
      </View>
    </GradientCover>
  );

  return (
    // scroll={false}: a rolagem passa a ser a ScrollView daqui de dentro.
    // Aninhada na do Screen, o primeiro toque com o teclado aberto era gasto
    // para fechá-lo e o scrollTo das sugestões não saía do lugar. O cabeçalho
    // vem junto, dentro da rolagem, para a tela continuar rolando inteira.
    <Screen scroll={false}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroller}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        {/* O Screen já afasta 16 das bordas; o cabeçalho desconta o recuo
            extra do conteúdo para ficar onde sempre esteve. */}
        <View style={styles.headerHold}>
          <Header
            title={APP_NAME}
            subtitle={t(S.subtitle, { name: state.name })}
            right={(
              <View style={styles.headerActions}>
                {RELEASE_FEATURES.publicCommunity ? (
                  <Pressable
                    testID="open-community-home"
                    accessibilityRole="button"
                    accessibilityLabel={lang === 'en' ? 'Open community' : 'Abrir comunidade'}
                    onPress={() => {
                      const tabs = navigation.getParent && navigation.getParent();
                      if (tabs && tabs.navigate) tabs.navigate('Community');
                      else navigation.navigate('Community');
                    }}
                    style={({ pressed }) => [
                      styles.communityHeaderButton,
                      { backgroundColor: th.surface, borderColor: th.border },
                      pressed && styles.actionPressed,
                    ]}
                  >
                    <Ionicons name="people-outline" size={22} color={th.accent} />
                  </Pressable>
                ) : null}
                <Pressable
                  testID="open-profile"
                  accessibilityRole="button"
                  accessibilityLabel={t(S.openProfile)}
                  onPress={() => navigation.navigate('Profile')}
                  style={({ pressed }) => [styles.mascotProfile, pressed && styles.actionPressed]}
                >
                  <CelesteMascot size={46} testID="celeste-mascot-home" />
                  <View style={[styles.profileBadge, { backgroundColor: th.surface, borderColor: th.border }]}>
                    <Ionicons name="person" size={11} color={th.text} />
                  </View>
                </Pressable>
              </View>
            )}
          />
        </View>

        {anchorScene ? (
          <Card
            testID="open-anchor-scene"
            onPress={() => navigation.navigate('Manifestation', { id: anchorScene.id })}
            accessibilityRole="button"
            accessibilityLabel={`${t(S.anchorScene)}. ${txt(anchorScene.title, lang)}`}
            style={[
              styles.anchorSceneCard,
              { backgroundColor: th.surface, borderColor: alpha(th.accent, 0.28) },
            ]}
          >
            <View style={[styles.anchorSceneIcon, { backgroundColor: alpha(th.accent, 0.13) }]}>
              <Ionicons name="sparkles" size={22} color={th.accent} />
            </View>
            <View style={styles.anchorSceneCopy}>
              <Text style={[styles.anchorSceneTitle, { color: th.text }]}>{t(S.anchorScene)}</Text>
              <Text numberOfLines={1} style={[styles.anchorSceneName, { color: th.textMuted }]}>
                {txt(anchorScene.title, lang) || t(S.anchorSceneHint)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={th.textMuted} />
          </Card>
        ) : null}

        <View testID="home-your-day">
          <SectionHeading title={t(S.yourDay)} style={styles.dayHeading} />

        {dailyRitual ? (
          <Card
            style={[
              styles.minuteCard,
              { backgroundColor: th.surface, borderColor: alpha(th.accent, 0.28) },
            ]}
          >
            <View style={styles.minuteHeader}>
              <View style={[styles.minuteIcon, { backgroundColor: alpha(th.accent, 0.13) }]}>
                <Ionicons name="sparkles" size={22} color={th.accent} />
              </View>
              <View style={styles.minuteCopy}>
                <Text style={[styles.minuteTitle, { color: th.text }]}>{t(S.minuteTitle)}</Text>
                <Text style={[styles.minuteSub, { color: th.textMuted }]}>
                  {dailyRitual.completedToday
                    ? t(S.minuteDone, { streak: streakLabel })
                    : t(S.minuteReady)}
                </Text>
              </View>
              {dailyRitual.chapter ? (
                <Text style={[styles.minuteChapter, { color: th.accent }]}>
                  {t(S.chapter, { n: dailyRitual.chapter })}
                </Text>
              ) : null}
            </View>
            <Text numberOfLines={2} style={[styles.minuteAffirmation, { color: th.text }]}>
              {dailyRitual.affirmation}
            </Text>
            <Button
              testID="open-daily-ritual"
              icon={dailyRitual.completedToday ? 'refresh' : 'play'}
              label={dailyRitual.completedToday ? t(S.minuteRepeat) : t(S.minuteStart)}
              onPress={() => navigation.navigate('DailyRitual')}
              style={styles.minuteButton}
            />
          </Card>
        ) : null}

        <Card
          testID="open-dream-journal"
          onPress={() => navigation.navigate('MorningRitual', { focus: 'dream' })}
          accessibilityRole="button"
          accessibilityLabel={t(S.openMorning)}
          style={[styles.morningCard, { backgroundColor: th.surface }]}
        >
          <View style={[styles.morningIcon, { backgroundColor: alpha(accentAt(th, 3), 0.14) }]}>
            <Ionicons name="moon-outline" size={22} color={accentAt(th, 3)} />
          </View>
          <View style={styles.morningCopy}>
            <Text style={[styles.morningTitle, { color: th.text }]}>{t(S.morningTitle)}</Text>
            <Text numberOfLines={1} style={[styles.morningSub, { color: th.textMuted }]}>
              {dreamCount > 0 ? t(S.morningSaved, { n: dreamCount }) : t(S.morningEmpty)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={th.textMuted} />
        </Card>

        {RELEASE_FEATURES.practicePlan ? (
          <Card
            testID="open-practice-plan"
            onPress={() => navigation.navigate('PracticePlan')}
            accessibilityRole="button"
            accessibilityLabel={t(S.practicePlanTitle)}
            style={[styles.morningCard, { backgroundColor: th.surface }]}
          >
            <View style={[styles.morningIcon, { backgroundColor: alpha(accentAt(th, 1), 0.14) }]}>
              <Ionicons name="notifications-outline" size={22} color={accentAt(th, 1)} />
            </View>
            <View style={styles.morningCopy}>
              <Text style={[styles.morningTitle, { color: th.text }]}>
                {t(S.practicePlanTitle)}
              </Text>
              <Text numberOfLines={1} style={[styles.morningSub, { color: th.textMuted }]}>
                {practicePlanActive
                  ? t(S.practicePlanActive, { times: practicePlanTimes.join(' · ') })
                  : t(S.practicePlanEmpty)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={th.textMuted} />
          </Card>
        ) : null}

        {RELEASE_FEATURES.affirmationAlarm ? (
          <Card
            testID="open-affirmation-alarm"
            onPress={() => navigation.navigate('AffirmationAlarm')}
            accessibilityRole="button"
            accessibilityLabel={t(S.alarmTitle)}
            style={[styles.morningCard, { backgroundColor: th.surface }]}
          >
            <View style={[styles.morningIcon, { backgroundColor: alpha(accentAt(th, 2), 0.14) }]}>
              <Ionicons name="alarm-outline" size={22} color={accentAt(th, 2)} />
            </View>
            <View style={styles.morningCopy}>
              <Text style={[styles.morningTitle, { color: th.text }]}>{t(S.alarmTitle)}</Text>
              <Text numberOfLines={1} style={[styles.morningSub, { color: th.textMuted }]}>
                {morningRitual.reminderEnabled
                  ? t(S.morningActive, { time: morningRitual.reminderTime || '07:00' })
                  : hasWakeAffirmation
                  ? t(S.morningPrepared, { time: morningRitual.reminderTime || '07:00' })
                  : t(S.alarmEmpty)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={th.textMuted} />
          </Card>
        ) : null}
        </View>

        {hasItems ? (
          <>
            {/* Campo compacto: quem já pratica só abre o composer se quiser. */}
            {composerOpen ? (
              composer
            ) : (
              <Button
                icon="add"
                variant="soft"
                label={t(S.newManifest)}
                onPress={() => setComposerOpen(true)}
                style={{ marginTop: 12 }}
              />
            )}

            {/* Pendentes de hoje primeiro, concluídas por último. */}
            <SectionHeading title={t(S.yours)} />
            {sorted.map((m) => (
              <ManifestCard
                key={m.id}
                item={m}
                onPress={() => navigation.navigate('Manifestation', { id: m.id })}
                onToggleToday={() => toggleToday(m)}
              />
            ))}
          </>
        ) : (
          <>
            {composer}

            {/* ---- Convite de novata: só com a lista vazia (não anuncia
                 recurso que não existe: explica que a prática padrão dura
                 21 dias e leva de volta ao campo) ---- */}
            {inviteDismissed === false ? (
              <Card
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  focusDesire();
                }}
                style={[styles.todayCard, { backgroundColor: th.surface }]}
              >
                <View style={styles.todayRow}>
                  <View
                    style={[styles.todayIcon, { backgroundColor: alpha(accentAt(th, 1), 0.16) }]}
                  >
                    <Ionicons name="sparkles" size={20} color={accentAt(th, 1)} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={[styles.todayTitle, { color: th.text }]}>{t(S.inviteTitle)}</Text>
                    <Text style={[styles.todaySub, { color: th.textMuted }]}>{t(S.inviteSub)}</Text>
                  </View>
                  {/* hitSlop não aumenta área de toque no RN-web: o alvo de 44
                      é real, via minWidth/minHeight. */}
                  <TouchableOpacity
                    onPress={dismissInvite}
                    accessibilityRole="button"
                    accessibilityLabel={t(S.inviteDismiss)}
                    style={styles.inviteClose}
                  >
                    <Ionicons name="close" size={18} color={th.textMuted} />
                  </TouchableOpacity>
                </View>
              </Card>
            ) : null}
          </>
        )}

        {/* Com itens, a lista pessoal já apareceu acima. */}
        {!hasItems ? (
          <>
            <SectionHeading title={t(S.yours)} />
            <EmptyState
              icon="sparkles-outline"
              title={t(S.emptyTitle)}
              body={t(S.emptyBody, { app: APP_NAME })}
            />
          </>
        ) : null}
        <View style={{ height: 24 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroller: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 96 },
  headerHold: { marginHorizontal: -16 },
  dayHeading: { marginTop: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  communityHeaderButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  mascotProfile: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  profileBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: { opacity: 0.72 },
  anchorSceneCard: {
    minHeight: 76,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 8,
  },
  anchorSceneIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anchorSceneCopy: { flex: 1, minWidth: 0, marginHorizontal: 12 },
  anchorSceneTitle: { fontSize: 16, lineHeight: 21, fontWeight: '800', letterSpacing: 0 },
  anchorSceneName: { fontSize: 12.5, lineHeight: 18, marginTop: 2, letterSpacing: 0 },
  morningCard: {
    minHeight: 72,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
  },
  morningIcon: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  morningCopy: { flex: 1, minWidth: 0, marginHorizontal: 12 },
  morningTitle: { fontSize: 15.5, lineHeight: 20, fontWeight: '800', letterSpacing: 0 },
  morningSub: { fontSize: 12.5, lineHeight: 18, marginTop: 2, letterSpacing: 0 },
  minuteCard: { borderRadius: 8, padding: 16, marginTop: 4, marginBottom: 12 },
  minuteHeader: { flexDirection: 'row', alignItems: 'center' },
  minuteIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minuteCopy: { flex: 1, minWidth: 0, marginLeft: 12 },
  minuteTitle: { fontSize: 17, lineHeight: 22, fontWeight: '800', letterSpacing: 0 },
  minuteSub: { marginTop: 2, fontSize: 12, lineHeight: 17, fontWeight: '600', letterSpacing: 0 },
  minuteChapter: { marginLeft: 8, fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 0 },
  minuteAffirmation: {
    marginTop: 15,
    fontFamily: 'Georgia',
    fontSize: 17,
    lineHeight: 25,
    fontStyle: 'italic',
    letterSpacing: 0,
  },
  minuteButton: { marginTop: 12, marginBottom: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { paddingVertical: 22, paddingHorizontal: 18, marginTop: 4 },
  heroInner: { alignItems: 'center' },
  generatingText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', marginTop: 10 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 14,
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  heroItalic: { fontStyle: 'italic', fontWeight: '500' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 26,
    paddingLeft: 18,
    paddingRight: 6,
    height: 52,
    width: '100%',
    marginTop: 12,
  },
  // height 100%: o campo preenche a pílula inteira — antes tinha ~20px no
  // meio de 52 e clique a 6px do topo deixava o foco no body.
  input: { flex: 1, fontSize: 15, height: '100%' },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    margin: 4,
  },
  catText: { fontSize: 11.5, fontWeight: '700', marginLeft: 5 },
  todayCard: { marginTop: 16, padding: 16, borderRadius: 18 },
  todayRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  todayIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  todayTitle: { fontSize: 16, fontWeight: '700' },
  todaySub: { fontSize: 12.5, marginTop: 2 },
  inviteClose: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
