import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { useT } from '../utils/useT';
import { confirmAsync } from '../utils/confirm';
import {
  COMMUNITY_BODY_MAX,
  COMMUNITY_BODY_MIN,
  deleteCommunityStory,
  loadCommunityState,
  loadLocalCommunityState,
  normalizeCommunityStory,
  submitCommunityStory,
} from '../services/communityStories';

const S = {
  title: { en: 'Community', pt: 'Comunidade' },
  subtitle: { en: 'Real stories, reviewed before they appear', pt: 'Relatos reais, analisados antes de aparecer' },
  realTitle: { en: 'Real experiences only', pt: 'Só experiências reais' },
  realBody: {
    en: 'This space is never filled with made-up testimonials. Personal stories are not a promise of the same result.',
    pt: 'Este espaço nunca é preenchido com depoimentos inventados. Relatos pessoais não prometem o mesmo resultado.',
  },
  feedTab: { en: 'Published', pt: 'Publicados' },
  mineTab: { en: 'My stories', pt: 'Meus relatos' },
  create: { en: 'Share what happened', pt: 'Contar o que aconteceu' },
  emptyFeedTitle: { en: 'No published stories yet', pt: 'Ainda não há relatos publicados' },
  emptyFeedBody: {
    en: 'When a real story passes review, it will appear here. We do not use placeholders disguised as testimonials.',
    pt: 'Quando um relato real passar pela análise, ele aparecerá aqui. Não usamos exemplos disfarçados de depoimentos.',
  },
  emptyMineTitle: { en: 'Your story can begin here', pt: 'Seu relato pode começar aqui' },
  emptyMineBody: {
    en: 'Tell the community what changed for you. It stays private until the review is complete.',
    pt: 'Conte à comunidade o que mudou para você. Ele continua privado até a análise terminar.',
  },
  member: { en: 'Community member', pt: 'Pessoa da comunidade' },
  personalExperience: { en: 'Personal experience', pt: 'Experiência pessoal' },
  composeTitle: { en: 'Tell your story', pt: 'Conte seu relato' },
  composeBody: {
    en: 'Write what happened in your own words. Avoid phone numbers, addresses and other personal information.',
    pt: 'Escreva com suas palavras o que aconteceu. Evite telefone, endereço e outras informações pessoais.',
  },
  storyLabel: { en: 'Your story', pt: 'Seu relato' },
  placeholder: {
    en: 'What did you notice, receive or accomplish?',
    pt: 'O que você percebeu, recebeu ou conquistou?',
  },
  optionalManifestation: { en: 'Related manifestation (optional)', pt: 'Manifestação relacionada (opcional)' },
  noLink: { en: 'No link', pt: 'Sem vínculo' },
  noManifestations: {
    en: 'You do not have a manifestation to link yet.',
    pt: 'Você ainda não tem uma manifestação para vincular.',
  },
  consent: {
    en: 'I confirm I am 18 or older and authorize Celeste to publish this story if it passes review.',
    pt: 'Confirmo que tenho 18 anos ou mais e autorizo o Celeste a publicar este relato se ele passar pela análise.',
  },
  reviewNotice: {
    en: 'Sending does not publish it now. The story first enters the moderation queue.',
    pt: 'Enviar não publica agora. O relato entra primeiro na fila de moderação.',
  },
  submit: { en: 'Send for review', pt: 'Enviar para análise' },
  cancel: { en: 'Cancel', pt: 'Cancelar' },
  tooShort: {
    en: `Write at least ${COMMUNITY_BODY_MIN} characters.`,
    pt: `Escreva pelo menos ${COMMUNITY_BODY_MIN} caracteres.`,
  },
  consentNeeded: { en: 'Confirm the publication permission.', pt: 'Confirme a autorização de publicação.' },
  sent: {
    en: 'Story sent. It will only appear after review.',
    pt: 'Relato enviado. Ele só aparecerá depois da análise.',
  },
  localSaved: {
    en: 'Draft saved on this device. It has not been sent or published.',
    pt: 'Rascunho salvo neste aparelho. Ele não foi enviado nem publicado.',
  },
  loadError: { en: 'Could not refresh stories right now.', pt: 'Não foi possível atualizar os relatos agora.' },
  retry: { en: 'Try again', pt: 'Tentar novamente' },
  statusLocal: { en: 'On this device', pt: 'Neste aparelho' },
  statusDraft: { en: 'Draft', pt: 'Rascunho' },
  statusPending: { en: 'In review', pt: 'Em análise' },
  statusPublished: { en: 'Published', pt: 'Publicado' },
  statusHidden: { en: 'Hidden by review', pt: 'Oculto pela análise' },
  statusRemoved: { en: 'Removed', pt: 'Removido' },
  linked: { en: 'Linked to {title}', pt: 'Vinculado a {title}' },
  genericLinked: { en: 'Linked to a manifestation', pt: 'Vinculado a uma manifestação' },
  unsentNote: {
    en: 'This draft remains only on this device until community accounts are available.',
    pt: 'Este rascunho fica apenas neste aparelho até as contas da comunidade estarem disponíveis.',
  },
  deleteStory: { en: 'Delete this story', pt: 'Apagar este relato' },
  deleteTitle: { en: 'Delete this story?', pt: 'Apagar este relato?' },
  deleteBody: {
    en: 'A local draft is removed from this device. A submitted story is withdrawn from review or publication.',
    pt: 'Um rascunho local é apagado deste aparelho. Um relato enviado é retirado da análise ou publicação.',
  },
  deleteConfirm: { en: 'Delete', pt: 'Apagar' },
  deleteFailed: {
    en: 'The story could not be deleted right now. It remains visible in My stories.',
    pt: 'Não foi possível apagar o relato agora. Ele continua visível em Meus relatos.',
  },
};

const STATUS_COLORS = {
  local_draft: '#667085',
  draft: '#667085',
  pending: '#B7791F',
  published: '#247A52',
  hidden: '#9B3D55',
  removed: '#9B3D55',
};

function formatDate(value, lang) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch (error) {
    return date.toISOString().slice(0, 10);
  }
}

function StatusBadge({ item, t, theme }) {
  const labels = {
    local_draft: S.statusLocal,
    draft: S.statusDraft,
    pending: S.statusPending,
    published: S.statusPublished,
    hidden: S.statusHidden,
    removed: S.statusRemoved,
  };
  const color = STATUS_COLORS[item.status] || theme.textMuted;
  return (
    <View style={[styles.statusBadge, { backgroundColor: `${color}18`, borderColor: `${color}44` }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusText, { color }]}>{t(labels[item.status] || S.statusDraft)}</Text>
    </View>
  );
}

function StoryCard({ item, mine, t, lang, theme, onDelete, deleting }) {
  const linked = item.manifestationTitle
    ? t(S.linked, { title: item.manifestationTitle })
    : item.manifestationId
      ? t(S.genericLinked)
      : '';
  return (
    <View style={[styles.storyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.storyMetaRow}>
        <View style={[styles.avatar, { backgroundColor: theme.accents[2] + '22' }]}>
          <Ionicons name="sparkles" size={17} color={theme.accents[2]} />
        </View>
        <View style={styles.storyMetaText}>
          <Text style={[styles.storyAuthor, { color: theme.text }]}>
            {mine ? t(S.personalExperience) : t(S.member)}
          </Text>
          <Text style={[styles.storyDate, { color: theme.textMuted }]}>{formatDate(item.createdAt, lang)}</Text>
        </View>
        {mine ? <StatusBadge item={item} t={t} theme={theme} /> : null}
      </View>
      <Text style={[styles.storyBody, { color: theme.text }]}>{item.body}</Text>
      {linked ? (
        <View style={[styles.linkedRow, { borderTopColor: theme.border }]}>
          <Ionicons name="link-outline" size={15} color={theme.accent} />
          <Text numberOfLines={2} style={[styles.linkedText, { color: theme.textMuted }]}>
            {linked}
          </Text>
        </View>
      ) : null}
      {mine && item.status === 'local_draft' ? (
        <Text style={[styles.localNote, { color: theme.textMuted }]}>{t(S.unsentNote)}</Text>
      ) : null}
      {mine ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(S.deleteStory)}
          disabled={deleting}
          onPress={() => onDelete(item)}
          style={({ pressed }) => [styles.deleteStory, pressed && styles.pressed]}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={theme.danger} />
          ) : (
            <Ionicons name="trash-outline" size={16} color={theme.danger} />
          )}
          <Text style={[styles.deleteStoryText, { color: theme.danger }]}>{t(S.deleteStory)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function CommunityScreen() {
  const theme = useTheme();
  const { state } = useApp();
  const { t, lang } = useT();
  const [tab, setTab] = useState('feed');
  const [composer, setComposer] = useState(false);
  const [body, setBody] = useState('');
  const [manifestationId, setManifestationId] = useState(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [community, setCommunity] = useState({ feed: [], own: [], mode: 'local', reason: null });
  const refreshRequestRef = useRef(0);
  const localHydratedRef = useRef(false);
  const submitRef = useRef(false);
  const deleteRef = useRef(false);

  const manifestations = (state && Array.isArray(state.manifestations) ? state.manifestations : []).slice(0, 12);
  const selectedManifestation = useMemo(
    () => manifestations.find((item) => item.id === manifestationId) || null,
    [manifestations, manifestationId]
  );
  const normalizedBody = normalizeCommunityStory(body);
  const canSubmit = normalizedBody.length >= COMMUNITY_BODY_MIN && consent && !submitting;

  const refresh = useCallback(async ({ clearError = true } = {}) => {
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;
    if (!localHydratedRef.current) setLoading(true);
    if (clearError) setError(null);
    try {
      const local = await loadLocalCommunityState();
      if (refreshRequestRef.current !== requestId) return false;
      setCommunity(local);
      localHydratedRef.current = true;
      setLoading(false);

      const next = await loadCommunityState({ localStories: local.own });
      if (refreshRequestRef.current !== requestId) return false;
      setCommunity(next);
      return true;
    } catch (loadFailure) {
      if (refreshRequestRef.current !== requestId) return false;
      setError(t(S.loadError));
      return false;
    } finally {
      if (refreshRequestRef.current === requestId) setLoading(false);
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      return () => {
        refreshRequestRef.current += 1;
      };
    }, [refresh])
  );

  const openComposer = () => {
    setResult(null);
    setError(null);
    setComposer(true);
  };

  const closeComposer = () => {
    if (submitting || submitRef.current) return;
    setComposer(false);
    setError(null);
  };

  const submit = async () => {
    if (submitRef.current) return;
    if (normalizedBody.length < COMMUNITY_BODY_MIN) {
      setError(t(S.tooShort));
      return;
    }
    if (!consent) {
      setError(t(S.consentNeeded));
      return;
    }
    submitRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await submitCommunityStory({
        body: normalizedBody,
        consent,
        locale: lang,
        manifestationId: selectedManifestation && selectedManifestation.id,
        manifestationTitle: selectedManifestation && selectedManifestation.title,
        category: selectedManifestation && selectedManifestation.category,
      });
      setResult(response.synced ? t(S.sent) : t(S.localSaved));
      setBody('');
      setManifestationId(null);
      setConsent(false);
      setComposer(false);
      setTab('mine');
      await refresh();
    } catch (submitFailure) {
      setError(submitFailure && submitFailure.code === 'consent_required' ? t(S.consentNeeded) : t(S.loadError));
    } finally {
      submitRef.current = false;
      setSubmitting(false);
    }
  };

  const removeStory = async (item) => {
    if (deleteRef.current) return;
    deleteRef.current = true;
    try {
      const allowed = await confirmAsync({
        title: t(S.deleteTitle),
        message: t(S.deleteBody),
        confirmLabel: t(S.deleteConfirm),
        cancelLabel: t(S.cancel),
        destructive: true,
        lang,
      });
      if (!allowed) return;
      setDeletingId(item.id);
      setError(null);
      const response = await deleteCommunityStory(item);
      await refresh({ clearError: response.ok });
      if (!response.ok) setError(t(S.deleteFailed));
    } catch (_error) {
      setError(t(S.deleteFailed));
    } finally {
      deleteRef.current = false;
      setDeletingId(null);
    }
  };

  return (
    <SafeAreaView
      testID="community-screen"
      style={[styles.safe, Platform.OS === 'web' && styles.webViewport, { backgroundColor: theme.bg }]}
      edges={['top']}
    >
      <ScrollView
        testID="community-scroll"
        style={styles.scrollView}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, styles.screenContent]}
      >
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>{t(S.title)}</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>{t(S.subtitle)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(S.create)}
          hitSlop={8}
          onPress={openComposer}
          style={({ pressed }) => [styles.createIcon, { backgroundColor: theme.accent }, pressed && styles.pressed]}
        >
          <Ionicons name="create-outline" size={21} color="#FFFFFF" />
        </Pressable>
      </View>

      {composer ? (
        <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.composerHeader}>
            <View style={styles.composerHeadingWrap}>
              <Text accessibilityRole="header" style={[styles.composerTitle, { color: theme.text }]}>{t(S.composeTitle)}</Text>
              <Text style={[styles.composerBody, { color: theme.textMuted }]}>{t(S.composeBody)}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t(S.cancel)}
              hitSlop={10}
              onPress={closeComposer}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Ionicons name="close" size={21} color={theme.textMuted} />
            </Pressable>
          </View>

          <Text style={[styles.fieldLabel, { color: theme.text }]}>{t(S.storyLabel)}</Text>
          <TextInput
            testID="community-story-input"
            accessibilityLabel={t(S.storyLabel)}
            multiline
            maxLength={COMMUNITY_BODY_MAX}
            onChangeText={setBody}
            placeholder={t(S.placeholder)}
            placeholderTextColor={theme.textMuted}
            textAlignVertical="top"
            value={body}
            style={[
              styles.textInput,
              { backgroundColor: theme.bg, borderColor: error ? theme.danger : theme.border, color: theme.text },
            ]}
          />
          <Text style={[styles.counter, { color: theme.textMuted }]}>
            {normalizedBody.length}/{COMMUNITY_BODY_MAX}
          </Text>

          <Text style={[styles.fieldLabel, styles.manifestationLabel, { color: theme.text }]}>
            {t(S.optionalManifestation)}
          </Text>
          {manifestations.length ? (
            <View accessibilityRole="radiogroup" style={styles.choiceWrap}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: manifestationId === null }}
                onPress={() => setManifestationId(null)}
                style={[
                  styles.choice,
                  { borderColor: manifestationId === null ? theme.accent : theme.border, backgroundColor: theme.bg },
                ]}
              >
                <Text style={[styles.choiceText, { color: manifestationId === null ? theme.accent : theme.textMuted }]}>
                  {t(S.noLink)}
                </Text>
              </Pressable>
              {manifestations.map((item) => {
                const selected = manifestationId === item.id;
                return (
                  <Pressable
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={item.title}
                    key={item.id}
                    onPress={() => setManifestationId(item.id)}
                    style={[
                      styles.choice,
                      { borderColor: selected ? theme.accent : theme.border, backgroundColor: theme.bg },
                    ]}
                  >
                    <Text numberOfLines={2} style={[styles.choiceText, { color: selected ? theme.accent : theme.text }]}>
                      {item.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.helperText, { color: theme.textMuted }]}>{t(S.noManifestations)}</Text>
          )}

          <Pressable
            testID="community-consent"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            onPress={() => setConsent((value) => !value)}
            style={({ pressed }) => [styles.consentRow, pressed && styles.pressed]}
          >
            <View
              style={[
                styles.checkbox,
                { borderColor: consent ? theme.accent : theme.textMuted, backgroundColor: consent ? theme.accent : 'transparent' },
              ]}
            >
              {consent ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
            </View>
            <Text style={[styles.consentText, { color: theme.text }]}>{t(S.consent)}</Text>
          </Pressable>

          <View style={[styles.reviewNotice, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.accent} />
            <Text style={[styles.reviewText, { color: theme.text }]}>{t(S.reviewNotice)}</Text>
          </View>

          {error ? (
            <Text accessibilityRole="alert" style={[styles.feedback, { color: theme.danger }]}>{error}</Text>
          ) : null}
          <Pressable
            testID="community-submit"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={submit}
            style={({ pressed }) => [
              styles.submitButton,
              { backgroundColor: theme.accent, opacity: canSubmit ? 1 : 0.45 },
              pressed && canSubmit && styles.pressed,
            ]}
          >
            {submitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={17} color="#FFFFFF" />}
            <Text style={styles.submitText}>{t(S.submit)}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={[styles.truthBand, { borderColor: theme.border }]}>
            <View style={[styles.truthIcon, { backgroundColor: theme.accents[2] + '1C' }]}>
              <Ionicons name="people-outline" size={22} color={theme.accents[2]} />
            </View>
            <View style={styles.truthCopy}>
              <Text style={[styles.truthTitle, { color: theme.text }]}>{t(S.realTitle)}</Text>
              <Text style={[styles.truthBody, { color: theme.textMuted }]}>{t(S.realBody)}</Text>
            </View>
          </View>

          <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: theme.surfaceAlt }]}>
            {[
              { id: 'feed', label: t(S.feedTab) },
              { id: 'mine', label: t(S.mineTab) },
            ].map((item) => {
              const selected = tab === item.id;
              return (
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  key={item.id}
                  onPress={() => setTab(item.id)}
                  style={[styles.tab, selected && { backgroundColor: theme.surface, borderColor: theme.border }]}
                >
                  <Text style={[styles.tabText, { color: selected ? theme.text : theme.textMuted }]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {result ? (
            <View accessibilityLiveRegion="polite" style={[styles.result, { backgroundColor: theme.success + '14' }]}>
              <Ionicons name="checkmark-circle-outline" size={20} color={theme.success} />
              <Text style={[styles.resultText, { color: theme.text }]}>{result}</Text>
            </View>
          ) : null}

          {error ? (
            <View accessibilityRole="alert" style={[styles.result, { backgroundColor: theme.danger + '12' }]}>
              <Ionicons name="alert-circle-outline" size={20} color={theme.danger} />
              <Text style={[styles.resultText, { color: theme.text }]}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={refresh}>
                <Text style={[styles.retryText, { color: theme.accent }]}>{t(S.retry)}</Text>
              </Pressable>
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator style={styles.loader} size="large" color={theme.accent} />
          ) : tab === 'feed' ? (
            community.feed.length ? (
              <View>
                {community.feed.map((item) => <StoryCard key={item.id} item={item} mine={false} t={t} lang={lang} theme={theme} />)}
              </View>
            ) : (
              <View style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons name="chatbubbles-outline" size={29} color={theme.accent} />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>{t(S.emptyFeedTitle)}</Text>
                <Text style={[styles.emptyBody, { color: theme.textMuted }]}>{t(S.emptyFeedBody)}</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={openComposer}
                  style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.accent }, pressed && styles.pressed]}
                >
                  <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryText}>{t(S.create)}</Text>
                </Pressable>
              </View>
            )
          ) : community.own.length ? (
            <View>
              <Pressable
                accessibilityRole="button"
                onPress={openComposer}
                style={({ pressed }) => [styles.primaryButton, styles.mineCreate, { backgroundColor: theme.accent }, pressed && styles.pressed]}
              >
                <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryText}>{t(S.create)}</Text>
              </Pressable>
              {community.own.map((item) => (
                <StoryCard
                  key={item.id}
                  item={item}
                  mine
                  t={t}
                  lang={lang}
                  theme={theme}
                  onDelete={removeStory}
                  deleting={deletingId === item.id}
                />
              ))}
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="book-outline" size={29} color={theme.accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t(S.emptyMineTitle)}</Text>
              <Text style={[styles.emptyBody, { color: theme.textMuted }]}>{t(S.emptyMineBody)}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={openComposer}
                style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.accent }, pressed && styles.pressed]}
              >
                <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryText}>{t(S.create)}</Text>
              </Pressable>
            </View>
          )}
        </>
      )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, minHeight: 0 },
  webViewport: { height: '100dvh', maxHeight: '100dvh', overflow: 'hidden' },
  scrollView: { flex: 1, minHeight: 0 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 96, alignItems: 'center' },
  screenContent: { width: '100%', maxWidth: 720, alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 14, paddingBottom: 18 },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: 0 },
  subtitle: { marginTop: 3, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  createIcon: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  pressed: { opacity: 0.76 },
  truthBand: { flexDirection: 'row', paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, marginBottom: 16 },
  truthIcon: { width: 42, height: 42, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  truthCopy: { flex: 1, minWidth: 0 },
  truthTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: 0 },
  truthBody: { fontSize: 13, lineHeight: 19, marginTop: 3, letterSpacing: 0 },
  tabs: { flexDirection: 'row', padding: 3, borderRadius: 8, marginBottom: 16 },
  tab: { flex: 1, minHeight: 42, borderRadius: 6, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 14, fontWeight: '700', letterSpacing: 0 },
  loader: { marginTop: 54 },
  result: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 8, marginBottom: 14 },
  resultText: { flex: 1, marginLeft: 9, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  retryText: { fontSize: 13, fontWeight: '700', marginLeft: 8, letterSpacing: 0 },
  empty: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 52 },
  emptyIcon: { width: 58, height: 58, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { marginTop: 18, fontSize: 20, lineHeight: 25, fontWeight: '700', textAlign: 'center', letterSpacing: 0 },
  emptyBody: { maxWidth: 440, marginTop: 8, fontSize: 14, lineHeight: 21, textAlign: 'center', letterSpacing: 0 },
  primaryButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 18, marginTop: 22 },
  mineCreate: { alignSelf: 'flex-start', marginTop: 0, marginBottom: 14 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginLeft: 8, letterSpacing: 0 },
  storyCard: { borderRadius: 8, borderWidth: 1, padding: 16, marginBottom: 12 },
  storyMetaRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  storyMetaText: { flex: 1, minWidth: 0, marginLeft: 10 },
  storyAuthor: { fontSize: 13, lineHeight: 18, fontWeight: '700', letterSpacing: 0 },
  storyDate: { fontSize: 11, lineHeight: 16, letterSpacing: 0 },
  storyBody: { marginTop: 14, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 9, marginLeft: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0 },
  linkedRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, marginTop: 14, paddingTop: 11 },
  linkedText: { flex: 1, marginLeft: 7, fontSize: 12, lineHeight: 17, letterSpacing: 0 },
  localNote: { fontSize: 12, lineHeight: 17, marginTop: 10, letterSpacing: 0 },
  deleteStory: { minHeight: 40, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 10 },
  deleteStoryText: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginLeft: 7, letterSpacing: 0 },
  composer: { borderWidth: 1, borderRadius: 8, padding: 16, marginBottom: 24 },
  composerHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  composerHeadingWrap: { flex: 1, minWidth: 0 },
  composerTitle: { fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: 0 },
  composerBody: { fontSize: 13, lineHeight: 19, marginTop: 4, letterSpacing: 0 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 20, marginBottom: 7, letterSpacing: 0 },
  textInput: { minHeight: 138, borderWidth: 1, borderRadius: 8, padding: 13, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  counter: { alignSelf: 'flex-end', fontSize: 11, lineHeight: 16, marginTop: 5, letterSpacing: 0 },
  manifestationLabel: { marginTop: 15 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  choice: { maxWidth: '100%', minHeight: 38, borderWidth: 1, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 8, margin: 4 },
  choiceText: { maxWidth: 260, fontSize: 12, lineHeight: 17, fontWeight: '600', letterSpacing: 0 },
  helperText: { fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 21 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  consentText: { flex: 1, minWidth: 0, marginLeft: 11, fontSize: 13, lineHeight: 19, letterSpacing: 0 },
  reviewNotice: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 8, marginTop: 17 },
  reviewText: { flex: 1, minWidth: 0, marginLeft: 9, fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  feedback: { fontSize: 12, lineHeight: 17, marginTop: 11, fontWeight: '600', letterSpacing: 0 },
  submitButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginTop: 18, paddingHorizontal: 18 },
  submitText: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '700', marginLeft: 8, letterSpacing: 0 },
});
