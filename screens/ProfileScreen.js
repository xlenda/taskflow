import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useApp } from '../context/AppContext';
import { useTheme, useSetTheme } from '../ui/theme';
import { useT } from '../utils/useT';
import { accentAt, alpha } from '../utils/colors';
import { confirmAsync } from '../utils/confirm';
import { APP_NAME } from '../constants/brand';
import {
  CLOUD_CONSENT_VERSION,
  hasCurrentAdultCloudConsent,
} from '../constants/cloudConsent';
import { RELEASE_FEATURES } from '../constants/releaseFeatures';
import { LEGAL_UPDATED, PRIVACY_SECTIONS, TERMS_SECTIONS } from '../constants/legal';
import NarratorSelector from '../components/NarratorSelector';
import { isUnder18Age } from './onboarding/flow';

const S = {
  title: { en: 'Profile', pt: 'Perfil' },
  subtitle: { en: 'Your space, your choices', pt: 'Seu espaço, suas escolhas' },
  back: { en: 'Go back', pt: 'Voltar' },
  identity: { en: 'How Celeste calls you', pt: 'Como o Celeste chama você' },
  nameLabel: { en: 'Your name', pt: 'Seu nome' },
  nameHint: { en: 'Used inside your personal stories', pt: 'Usado dentro das suas histórias pessoais' },
  namePlaceholder: { en: 'Name', pt: 'Nome' },
  saveName: { en: 'Save name', pt: 'Salvar nome' },
  saved: { en: 'Saved', pt: 'Salvo' },
  preferences: { en: 'Experience', pt: 'Experiência' },
  language: { en: 'App language', pt: 'Idioma do app' },
  languageHint: { en: 'Changes menus and your saved scenes', pt: 'Altera menus e suas cenas salvas' },
  portuguese: { en: 'Portuguese', pt: 'Português' },
  english: { en: 'English', pt: 'Inglês' },
  narrator: { en: 'Narration voice', pt: 'Voz da narração' },
  narratorHint: {
    en: 'Choose how your personal scenes should sound',
    pt: 'Escolha como suas cenas pessoais devem soar',
  },
  mood: { en: 'Visual mood', pt: 'Clima visual' },
  moodHint: { en: 'Choose the atmosphere that feels like you', pt: 'Escolha a atmosfera que combina com você' },
  themeBlossom: { en: 'Blossom', pt: 'Florada' },
  themePaper: { en: 'Paper', pt: 'Papel' },
  themeCloud: { en: 'Cloud', pt: 'Nuvem' },
  themeViolet: { en: 'Midnight rose', pt: 'Rosa de meia-noite' },
  geminiTitle: { en: 'Cloud processing', pt: 'Processamento em nuvem' },
  geminiOn: {
    en: 'Scene text uses Anthropic, with OpenAI as failover. Translations, images and dream interpretations use Google Gemini. On-demand narration uses ElevenLabs. Only data needed for the requested feature is sent.',
    pt: 'Textos de cenas usam Anthropic, com OpenAI como alternativa em caso de falha. Traduções, imagens e interpretações de sonhos usam Google Gemini. A narração sob demanda usa ElevenLabs. Só os dados necessários ao recurso solicitado são enviados.',
  },
  geminiOff: {
    en: 'New content uses Celeste\'s on-device options. No new cloud request is sent.',
    pt: 'Novos conteúdos usam as opções no aparelho do Celeste. Nenhuma nova solicitação é enviada à nuvem.',
  },
  geminiPartial: {
    en: 'One or more earlier cloud permissions remain active. Depending on that permission, scenes use Anthropic/OpenAI, translations, images or dreams use Gemini, and narration uses ElevenLabs.',
    pt: 'Uma ou mais permissões de nuvem anteriores continuam ativas. Conforme a permissão, cenas usam Anthropic/OpenAI, traduções, imagens ou sonhos usam Gemini, e a narração usa ElevenLabs.',
  },
  geminiConfirmTitle: { en: 'Allow cloud processing?', pt: 'Permitir processamento em nuvem?' },
  geminiConfirmBody: {
    en: 'Confirm that you are 18 or older and allow Celeste to send only the data needed for features you request. Anthropic generates personalized scene text, with OpenAI used only when failover is needed. Google Gemini translates text, creates images and interprets dreams you choose to send. ElevenLabs narrates selected text on demand. Requests pass through Celeste\'s backend. Saved names of children, important people or a specific person stay on this device. Avoid names and confidential data in free text. You can turn this off at any time.',
    pt: 'Confirme que você tem 18 anos ou mais e permite que o Celeste envie somente os dados necessários aos recursos que você solicitar. A Anthropic gera o texto das cenas personalizadas, com a OpenAI usada apenas quando a alternativa em caso de falha for necessária. O Google Gemini traduz textos, cria imagens e interpreta sonhos que você escolher enviar. A ElevenLabs narra o texto selecionado sob demanda. As solicitações passam pelo backend do Celeste. Nomes cadastrados de filhos, pessoas importantes ou de uma pessoa específica ficam neste aparelho. Evite nomes e dados confidenciais em textos livres. Você pode desligar quando quiser.',
  },
  geminiConfirmAllow: { en: 'I am 18+ · Allow', pt: 'Tenho 18+ · Permitir' },
  geminiUnder18: {
    en: 'Cloud processing is unavailable for profiles marked Under 18. New content is created on this device.',
    pt: 'O processamento em nuvem não está disponível para perfis marcados como Menos de 18. Novos conteúdos são criados neste aparelho.',
  },
  notNow: { en: 'Not now', pt: 'Agora não' },
  privacyAndData: { en: 'Privacy and data', pt: 'Privacidade e dados' },
  localData: { en: 'Saved on this device', pt: 'Salvo neste aparelho' },
  localDataHint: {
    en: 'No account or active subscription in this version',
    pt: 'Sem conta ou assinatura ativa nesta versão',
  },
  privacy: { en: 'Privacy policy', pt: 'Política de privacidade' },
  privacyHint: { en: 'What is stored and when data leaves the device', pt: 'O que é guardado e quando dados saem do aparelho' },
  terms: { en: 'Terms of use', pt: 'Termos de uso' },
  termsHint: { en: 'Rules and limits of the current experience', pt: 'Regras e limites da experiência atual' },
  privacyIntro: {
    en: 'A plain-language explanation of how the current version handles your information.',
    pt: 'Uma explicação direta sobre como a versão atual trata suas informações.',
  },
  termsIntro: {
    en: 'The agreement for using the current version of Celeste.',
    pt: 'O acordo para usar a versão atual do Celeste.',
  },
  bullet: { en: 'Item', pt: 'Item' },
};

const THEMES = [
  { key: 'blossom', color: '#D9548C', label: S.themeBlossom },
  { key: 'paper', color: '#C56A3F', label: S.themePaper },
  { key: 'cloud', color: '#4A80C9', label: S.themeCloud },
  { key: 'violet', color: '#8B6CFF', label: S.themeViolet },
];

const tap = () => Haptics.selectionAsync().catch(() => {});
const success = () =>
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

function BackButton({ label, onPress, theme }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.backButton,
        { backgroundColor: theme.surfaceAlt },
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name="chevron-back" size={22} color={theme.text} />
    </Pressable>
  );
}

function ScreenHeading({ title, subtitle, onBack, theme, backLabel }) {
  return (
    <View style={styles.headingRow}>
      <BackButton label={backLabel} onPress={onBack} theme={theme} />
      <View style={styles.headingCopy}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
          {title}
        </Text>
        {subtitle ? <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

function SectionTitle({ children, theme }) {
  return (
    <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textMuted }]}>
      {children}
    </Text>
  );
}

function SettingRow({ icon, iconColor, title, note, children, theme, divider = false }) {
  return (
    <View style={[styles.settingRow, divider && [styles.rowDivider, { borderTopColor: theme.border }]]}>
      <View style={[styles.rowIcon, { backgroundColor: alpha(iconColor, 0.13) }]}>
        <Ionicons name={icon} size={19} color={iconColor} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={[styles.settingTitle, { color: theme.text }]}>{title}</Text>
        {note ? <Text style={[styles.settingNote, { color: theme.textMuted }]}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function LegalLink({ testID, icon, iconColor, title, note, onPress, theme, divider }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={note}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.linkPressed]}
    >
      <SettingRow
        divider={divider}
        icon={icon}
        iconColor={iconColor}
        title={title}
        note={note}
        theme={theme}
      >
        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
      </SettingRow>
    </Pressable>
  );
}

function LegalDocument({ type, onBack }) {
  const theme = useTheme();
  const { t } = useT();
  const isPrivacy = type === 'privacy';
  const title = t(isPrivacy ? S.privacy : S.terms);
  const intro = t(isPrivacy ? S.privacyIntro : S.termsIntro);
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;

  return (
    <SafeAreaView
      testID={`legal-${type}`}
      style={[styles.safe, Platform.OS === 'web' && styles.webViewport, { backgroundColor: theme.bg }]}
      edges={['top', 'bottom']}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.column}>
          <ScreenHeading
            title={title}
            subtitle={t(LEGAL_UPDATED)}
            onBack={onBack}
            theme={theme}
            backLabel={t(S.back)}
          />
          <View style={[styles.legalIntro, { backgroundColor: alpha(accentAt(theme, isPrivacy ? 2 : 3), 0.12) }]}>
            <Ionicons
              name={isPrivacy ? 'shield-checkmark-outline' : 'document-text-outline'}
              size={22}
              color={accentAt(theme, isPrivacy ? 2 : 3)}
            />
            <Text style={[styles.legalIntroText, { color: theme.text }]}>{intro}</Text>
          </View>

          {sections.map((section, sectionIndex) => (
            <View
              key={`${type}-${sectionIndex}`}
              style={[styles.legalSection, { borderBottomColor: theme.border }]}
            >
              <Text accessibilityRole="header" style={[styles.legalHeading, { color: theme.text }]}>
                {t(section.title)}
              </Text>
              {(section.paragraphs || []).map((paragraph, index) => (
                <Text key={`p-${index}`} style={[styles.legalBody, { color: theme.textMuted }]}>
                  {t(paragraph)}
                </Text>
              ))}
              {(section.bullets || []).map((bullet, index) => (
                <View
                  key={`b-${index}`}
                  accessible
                  accessibilityLabel={`${t(S.bullet)} ${index + 1}: ${t(bullet)}`}
                  style={styles.bulletRow}
                >
                  <View style={[styles.bulletDot, { backgroundColor: accentAt(theme, sectionIndex) }]} />
                  <Text style={[styles.bulletText, { color: theme.textMuted }]}>{t(bullet)}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function ProfileScreen({ navigation }) {
  const theme = useTheme();
  const setTheme = useSetTheme();
  const { t, lang } = useT();
  const { state, loading, setName, setLang, setMood, setNarrator, saveProfile } = useApp();
  const [nameDraft, setNameDraft] = useState('');
  const [savedName, setSavedName] = useState(false);
  const [document, setDocument] = useState(null);

  useEffect(() => {
    if (state) setNameDraft(state.name || '');
  }, [state && state.name]);

  useEffect(() => {
    if (state && state.mood && state.mood !== theme.name) setTheme(state.mood);
    // The selected mood is the persisted source of truth when this screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const profile = state && state.profile;
    if (
      profile &&
      (profile.cloudPersonalization === true ||
        profile.cloudNarrationConsent === true ||
        profile.cloudDreamConsent === true) &&
      (!RELEASE_FEATURES.paidCloudProcessing ||
        !hasCurrentAdultCloudConsent(profile) ||
        isUnder18Age(profile.age))
    ) {
      saveProfile({
        cloudPersonalization: false,
        cloudAdultConfirmed: false,
        cloudNarrationConsent: false,
        cloudDreamConsent: false,
      });
    }
  }, [
    saveProfile,
    state?.profile?.age,
    state?.profile?.cloudAdultConfirmed,
    state?.profile?.cloudConsentVersion,
    state?.profile?.cloudPersonalization,
    state?.profile?.cloudNarrationConsent,
    state?.profile?.cloudDreamConsent,
  ]);

  useEffect(() => {
    if (!document || !navigation || !navigation.addListener) return undefined;
    return navigation.addListener('beforeRemove', (event) => {
      const type = event && event.data && event.data.action && event.data.action.type;
      if (type !== 'GO_BACK' && type !== 'POP' && type !== 'POP_TO_TOP') return;
      event.preventDefault();
      setDocument(null);
    });
  }, [document, navigation]);

  const initials = useMemo(() => {
    const parts = String((state && state.name) || APP_NAME)
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return parts
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }, [state && state.name]);

  if (document) return <LegalDocument type={document} onBack={() => setDocument(null)} />;

  if (loading || !state) {
    return (
      <SafeAreaView style={[styles.safe, styles.loading, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} size="large" />
      </SafeAreaView>
    );
  }

  const goBack = () => {
    if (!navigation) return;
    if (navigation.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    if (navigation.navigate) navigation.navigate('Main');
  };
  const cleanName = nameDraft.trim();
  const canSaveName = !!cleanName && cleanName !== state.name;
  const under18 = isUnder18Age(state.profile && state.profile.age);
  const cloudPartiallyEnabled =
    RELEASE_FEATURES.paidCloudProcessing &&
    !under18 &&
    hasCurrentAdultCloudConsent(state.profile) &&
    (state.profile?.cloudPersonalization === true ||
      state.profile?.cloudNarrationConsent === true ||
      state.profile?.cloudDreamConsent === true);
  const cloudEnabled =
    RELEASE_FEATURES.paidCloudProcessing &&
    !under18 &&
    state.profile &&
    state.profile.cloudPersonalization === true &&
    hasCurrentAdultCloudConsent(state.profile) &&
    state.profile.cloudNarrationConsent === true &&
    state.profile.cloudDreamConsent === true;

  const saveDisplayName = () => {
    if (!canSaveName) return;
    setName(cleanName);
    setNameDraft(cleanName);
    setSavedName(true);
    success();
    setTimeout(() => setSavedName(false), 1600);
  };

  const changeCloudPersonalization = async (nextValue) => {
    if (nextValue && !RELEASE_FEATURES.paidCloudProcessing) return;
    if (!nextValue) {
      saveProfile({
        cloudConsentVersion: CLOUD_CONSENT_VERSION,
        cloudPersonalization: false,
        cloudAdultConfirmed: false,
        cloudNarrationConsent: false,
        cloudDreamConsent: false,
      });
      tap();
      return;
    }
    if (under18) {
      saveProfile({
        cloudConsentVersion: null,
        cloudPersonalization: false,
        cloudAdultConfirmed: false,
        cloudNarrationConsent: false,
        cloudDreamConsent: false,
      });
      tap();
      return;
    }
    const allowed = await confirmAsync({
      title: t(S.geminiConfirmTitle),
      message: t(S.geminiConfirmBody),
      confirmLabel: t(S.geminiConfirmAllow),
      cancelLabel: t(S.notNow),
      destructive: false,
      lang,
    });
    if (!allowed) return;
    saveProfile({
      cloudConsentVersion: CLOUD_CONSENT_VERSION,
      cloudPersonalization: true,
      cloudAdultConfirmed: true,
      cloudNarrationConsent: true,
      cloudDreamConsent: true,
    });
    success();
  };

  return (
    <SafeAreaView
      testID="profile-screen"
      style={[styles.safe, Platform.OS === 'web' && styles.webViewport, { backgroundColor: theme.bg }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          testID="profile-scroll"
          style={styles.scrollView}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.column}>
            <ScreenHeading
              title={t(S.title)}
              subtitle={t(S.subtitle)}
              onBack={goBack}
              theme={theme}
              backLabel={t(S.back)}
            />

            <SectionTitle theme={theme}>{t(S.identity)}</SectionTitle>
            <View style={[styles.identityCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.avatar, { backgroundColor: alpha(accentAt(theme, 1), 0.16) }]}>
                <Text style={[styles.avatarText, { color: accentAt(theme, 1) }]}>{initials}</Text>
              </View>
              <View style={styles.nameArea}>
                <Text style={[styles.inputLabel, { color: theme.text }]}>{t(S.nameLabel)}</Text>
                <Text style={[styles.inputHint, { color: theme.textMuted }]}>{t(S.nameHint)}</Text>
                <View style={styles.nameControls}>
                  <TextInput
                    testID="profile-name-input"
                    accessibilityLabel={t(S.nameLabel)}
                    autoCapitalize="words"
                    autoComplete="name"
                    maxLength={60}
                    onChangeText={(value) => {
                      setSavedName(false);
                      setNameDraft(value);
                    }}
                    onSubmitEditing={saveDisplayName}
                    placeholder={t(S.namePlaceholder)}
                    placeholderTextColor={alpha(theme.textMuted, 0.75)}
                    returnKeyType="done"
                    style={[
                      styles.nameInput,
                      { color: theme.text, borderColor: theme.border, backgroundColor: theme.bg },
                    ]}
                    value={nameDraft}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(S.saveName)}
                    accessibilityState={{ disabled: !canSaveName }}
                    disabled={!canSaveName}
                    onPress={saveDisplayName}
                    style={({ pressed }) => [
                      styles.saveButton,
                      { backgroundColor: canSaveName ? theme.accent : theme.surfaceAlt },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={savedName ? 'checkmark' : 'save-outline'}
                      size={18}
                      color={canSaveName ? '#FFFFFF' : theme.textMuted}
                    />
                  </Pressable>
                </View>
                {savedName ? (
                  <Text accessibilityLiveRegion="polite" style={[styles.savedText, { color: theme.success }]}>
                    {t(S.saved)}
                  </Text>
                ) : null}
              </View>
            </View>

            <SectionTitle theme={theme}>{t(S.preferences)}</SectionTitle>
            <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <SettingRow
                icon="language-outline"
                iconColor={accentAt(theme, 0)}
                title={t(S.language)}
                note={t(S.languageHint)}
                theme={theme}
              />
              <View accessibilityRole="radiogroup" style={styles.segmented}>
                {[
                  { key: 'pt', label: S.portuguese, short: 'PT' },
                  { key: 'en', label: S.english, short: 'EN' },
                ].map((option) => {
                  const selected = lang === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      testID={`profile-language-${option.key}`}
                      accessibilityRole="radio"
                      accessibilityLabel={t(option.label)}
                      accessibilityState={{ checked: selected }}
                      onPress={() => {
                        setLang(option.key);
                        tap();
                      }}
                      style={({ pressed }) => [
                        styles.segment,
                        { backgroundColor: selected ? theme.accent : theme.surfaceAlt },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={[styles.segmentText, { color: selected ? '#FFFFFF' : theme.text }]}>
                        {option.short}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {RELEASE_FEATURES.paidCloudProcessing ? (
                <View style={[styles.preferenceBlock, { borderTopColor: theme.border }]}>
                  <Text style={[styles.preferenceLabel, { color: theme.text }]}>{t(S.narrator)}</Text>
                  <Text style={[styles.preferenceNote, { color: theme.textMuted }]}>
                    {t(S.narratorHint)}
                  </Text>
                  <View style={styles.narratorSelector}>
                    <NarratorSelector
                      value={state.narration?.narratorId}
                      onChange={(narratorId) => {
                        setNarrator(narratorId);
                        tap();
                      }}
                      lang={lang}
                      theme={theme}
                      variant="compact"
                    />
                  </View>
                </View>
              ) : null}

              <View style={[styles.preferenceBlock, { borderTopColor: theme.border }]}>
                <Text style={[styles.preferenceLabel, { color: theme.text }]}>{t(S.mood)}</Text>
                <Text style={[styles.preferenceNote, { color: theme.textMuted }]}>{t(S.moodHint)}</Text>
                <View style={styles.themeGrid}>
                  {THEMES.map((option) => {
                    const selected = (state.mood || theme.name) === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        accessibilityRole="radio"
                        accessibilityLabel={t(option.label)}
                        accessibilityState={{ checked: selected }}
                        onPress={() => {
                          setMood(option.key);
                          setTheme(option.key);
                          tap();
                        }}
                        style={({ pressed }) => [
                          styles.themeChoice,
                          {
                            backgroundColor: selected ? alpha(option.color, 0.13) : theme.bg,
                            borderColor: selected ? option.color : theme.border,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={[styles.swatch, { backgroundColor: option.color }]}>
                          {selected ? <Ionicons name="checkmark" color="#FFFFFF" size={13} /> : null}
                        </View>
                        <Text numberOfLines={2} style={[styles.themeLabel, { color: theme.text }]}>
                          {t(option.label)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {RELEASE_FEATURES.paidCloudProcessing ? (
                <Pressable
                  testID="profile-gemini-switch"
                  accessibilityRole="switch"
                  accessibilityLabel={t(S.geminiTitle)}
                  accessibilityHint={t(
                    under18
                      ? S.geminiUnder18
                      : cloudEnabled
                        ? S.geminiOn
                        : cloudPartiallyEnabled
                          ? S.geminiPartial
                          : S.geminiOff
                  )}
                  accessibilityState={{ checked: cloudEnabled, disabled: under18 }}
                  disabled={under18}
                  onPress={() => changeCloudPersonalization(!cloudEnabled)}
                  style={({ pressed }) => [
                    styles.geminiRow,
                    { borderTopColor: theme.border },
                    under18 && styles.geminiDisabled,
                    pressed && styles.linkPressed,
                  ]}
                >
                  <View style={styles.geminiCopy}>
                    <Text style={[styles.settingTitle, { color: theme.text }]}>{t(S.geminiTitle)}</Text>
                    <Text style={[styles.settingNote, { color: theme.textMuted }]}>
                      {t(
                        under18
                          ? S.geminiUnder18
                          : cloudEnabled
                            ? S.geminiOn
                            : cloudPartiallyEnabled
                              ? S.geminiPartial
                              : S.geminiOff
                      )}
                    </Text>
                  </View>
                  <Switch
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    disabled={under18}
                    ios_backgroundColor={alpha(theme.textMuted, 0.24)}
                    pointerEvents="none"
                    thumbColor={cloudEnabled ? theme.accent : '#FFFFFF'}
                    trackColor={{ false: alpha(theme.textMuted, 0.24), true: alpha(theme.accent, 0.58) }}
                    value={cloudEnabled}
                  />
                </Pressable>
              ) : null}
            </View>

            <SectionTitle theme={theme}>{t(S.privacyAndData)}</SectionTitle>
            <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <SettingRow
                icon="phone-portrait-outline"
                iconColor={accentAt(theme, 2)}
                title={t(S.localData)}
                note={t(S.localDataHint)}
                theme={theme}
              >
                <Ionicons name="checkmark-circle" size={20} color={theme.success} />
              </SettingRow>
              <LegalLink
                testID="profile-privacy-link"
                divider
                icon="shield-checkmark-outline"
                iconColor={accentAt(theme, 2)}
                title={t(S.privacy)}
                note={t(S.privacyHint)}
                onPress={() => {
                  setDocument('privacy');
                  tap();
                }}
                theme={theme}
              />
              <LegalLink
                testID="profile-terms-link"
                divider
                icon="document-text-outline"
                iconColor={accentAt(theme, 3)}
                title={t(S.terms)}
                note={t(S.termsHint)}
                onPress={() => {
                  setDocument('terms');
                  tap();
                }}
                theme={theme}
              />
            </View>

            <Text testID="profile-footer" style={[styles.footer, { color: theme.textMuted }]}>
              {APP_NAME} · 1.0.0
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0 },
  webViewport: { height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' },
  flex: { flex: 1, minHeight: 0 },
  scrollView: { flex: 1, minHeight: 0 },
  loading: { alignItems: 'center', justifyContent: 'center' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 48, alignItems: 'center' },
  column: { width: '100%', maxWidth: 720 },
  headingRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, paddingBottom: 22 },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headingCopy: { flex: 1, minWidth: 0, marginLeft: 14 },
  title: { fontSize: 26, lineHeight: 31, fontWeight: '800' },
  subtitle: { fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 8,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 16,
    marginBottom: 18,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontWeight: '800' },
  nameArea: { flex: 1, minWidth: 0, marginLeft: 13 },
  inputLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  inputHint: { fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  nameControls: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  nameInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderWidth: 1,
    borderRadius: 7,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  saveButton: {
    width: 44,
    height: 44,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  savedText: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 14,
    marginBottom: 18,
    overflow: 'hidden',
  },
  settingRow: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  settingCopy: { flex: 1, minWidth: 0, paddingHorizontal: 12 },
  settingTitle: { fontSize: 14.5, lineHeight: 20, fontWeight: '700' },
  settingNote: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  segmented: { flexDirection: 'row', marginBottom: 14 },
  segment: {
    flex: 1,
    height: 40,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
  },
  segmentText: { fontSize: 13, fontWeight: '800' },
  preferenceBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 14 },
  preferenceLabel: { fontSize: 14.5, lineHeight: 20, fontWeight: '700' },
  preferenceNote: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  narratorSelector: { marginTop: 10 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 10 },
  themeChoice: {
    flexBasis: '46%',
    flexGrow: 1,
    minWidth: 122,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 7,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    margin: 4,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  themeLabel: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 16, fontWeight: '700', marginLeft: 8 },
  geminiRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 13,
  },
  geminiCopy: { flex: 1, minWidth: 0, paddingRight: 14 },
  geminiDisabled: { opacity: 0.62 },
  linkPressed: { opacity: 0.7 },
  pressed: { opacity: 0.76 },
  footer: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 3 },
  legalIntro: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 8,
    padding: 15,
    marginBottom: 8,
  },
  legalIntroText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 21, marginLeft: 11 },
  legalSection: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 19 },
  legalHeading: { fontSize: 18, lineHeight: 23, fontWeight: '800', marginBottom: 8 },
  legalBody: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 },
  bulletDot: { width: 6, height: 6, borderRadius: 3, marginTop: 8, marginRight: 11, flexShrink: 0 },
  bulletText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 22 },
});
