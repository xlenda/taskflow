import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useT } from '../utils/useT';
import { confirmAsync } from '../utils/confirm';
import {
  COMMUNITY_BODY_MAX,
  COMMUNITY_BODY_MIN,
  COMMUNITY_CIRCLES,
  COMMUNITY_POST_KINDS,
  COMMUNITY_REACTION_KINDS,
  COMMUNITY_REMOTE_ENABLED,
  blockCommunityMember,
  deleteCommunityStory,
  loadCommunityState,
  loadLocalCommunityState,
  normalizeCommunityStory,
  reportCommunityStory,
  submitCommunityStory,
  toggleCommunityReaction,
  validateCommunityStory,
} from '../services/communityStories';

const S = {
  title: { en: 'Circles', pt: 'Círculos' },
  subtitle: { en: 'Real actions, traces and celebrations', pt: 'Ações, rastros e celebrações reais' },
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
  composeTitle: { en: 'Share with care', pt: 'Compartilhe com cuidado' },
  composeBody: {
    en: 'Only the preview below may enter review. Your wish, profile and private history stay out.',
    pt: 'Só a prévia abaixo pode entrar em análise. Seu desejo, perfil e histórico privado ficam de fora.',
  },
  composeBodyLocal: {
    en: 'Only the preview below is saved on this device. Nothing is sent or published.',
    pt: 'Só a prévia abaixo é salva neste aparelho. Nada é enviado ou publicado.',
  },
  kindLabel: { en: 'What are you sharing?', pt: 'O que você vai compartilhar?' },
  kindAction: { en: 'Action', pt: 'Ação' },
  kindEvidence: { en: 'Trace', pt: 'Rastro' },
  kindCelebration: { en: 'Celebration', pt: 'Celebração' },
  kindActionHint: { en: 'A step you chose or completed.', pt: 'Um passo que você escolheu ou concluiu.' },
  kindEvidenceHint: { en: 'Something you noticed, did or learned.', pt: 'Algo que você percebeu, fez ou aprendeu.' },
  kindCelebrationHint: { en: 'A real milestone from your journey.', pt: 'Um marco real da sua jornada.' },
  circlesLabel: { en: 'Circles', pt: 'Círculos' },
  circleLabel: { en: 'Choose the Circle', pt: 'Escolha o Círculo' },
  allCircles: { en: 'All', pt: 'Todos' },
  storyLabel: { en: 'Public text', pt: 'Texto público' },
  storyLabelLocal: { en: 'Text saved on this device', pt: 'Texto salvo neste aparelho' },
  placeholder: {
    en: 'Write only what you want other people to read.',
    pt: 'Escreva apenas o que você quer que outras pessoas leiam.',
  },
  previewTitle: { en: 'Exact publication preview', pt: 'Prévia exata da publicação' },
  previewTitleLocal: { en: 'Exact saved preview', pt: 'Prévia exata do que será salvo' },
  previewPending: { en: 'Choose a type and a Circle, then write your text.', pt: 'Escolha um tipo e um Círculo, depois escreva seu texto.' },
  consent: {
    en: 'I am 18 or older and authorize Celeste to publish exactly this preview in {circle} if it passes review.',
    pt: 'Tenho 18 anos ou mais e autorizo a Celeste a publicar exatamente esta prévia em {circle}, se ela passar pela análise.',
  },
  reviewNotice: {
    en: 'Sending does not publish it now. The story first enters the moderation queue.',
    pt: 'Enviar não publica agora. O relato entra primeiro na fila de moderação.',
  },
  localNotice: {
    en: 'This story will stay only on this device. It will not be sent for review or published.',
    pt: 'Este relato ficará apenas neste aparelho. Ele não será enviado para análise nem publicado.',
  },
  submit: { en: 'Send for review', pt: 'Enviar para análise' },
  submitLocal: { en: 'Save on this device', pt: 'Salvar neste aparelho' },
  cancel: { en: 'Cancel', pt: 'Cancelar' },
  tooShort: {
    en: `Write at least ${COMMUNITY_BODY_MIN} characters.`,
    pt: `Escreva pelo menos ${COMMUNITY_BODY_MIN} caracteres.`,
  },
  consentNeeded: { en: 'Confirm the publication permission.', pt: 'Confirme a autorização de publicação.' },
  kindNeeded: { en: 'Choose Action, Trace or Celebration.', pt: 'Escolha Ação, Rastro ou Celebração.' },
  circleNeeded: { en: 'Choose one of the six Circles.', pt: 'Escolha um dos seis Círculos.' },
  personalData: {
    en: 'Remove phone numbers, emails, links or social handles before sending.',
    pt: 'Remova telefones, e-mails, links ou perfis sociais antes de enviar.',
  },
  moneyRequest: {
    en: 'Requests for money or payment details cannot be published.',
    pt: 'Pedidos de dinheiro ou dados de pagamento não podem ser publicados.',
  },
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
  withYou: { en: 'I am with you', pt: 'Estou com você' },
  rooting: { en: 'Rooting for you', pt: 'Torço por você' },
  celebrate: { en: 'Celebrating with you', pt: 'Celebro com você' },
  reactionsLabel: { en: 'Support this person', pt: 'Apoiar esta pessoa' },
  report: { en: 'Report', pt: 'Denunciar' },
  reportTitle: { en: 'Report this post?', pt: 'Denunciar esta publicação?' },
  reportBody: {
    en: 'The moderation team will review the exact published text. The author is not notified by Celeste.',
    pt: 'A moderação analisará exatamente o texto publicado. A Celeste não avisa a pessoa autora.',
  },
  reportConfirm: { en: 'Send report', pt: 'Enviar denúncia' },
  reportSent: { en: 'Report sent for review.', pt: 'Denúncia enviada para análise.' },
  block: { en: 'Block person', pt: 'Bloquear pessoa' },
  blockTitle: { en: 'Block this person?', pt: 'Bloquear esta pessoa?' },
  blockBody: {
    en: 'Their posts will stop appearing for you. They will not be notified by Celeste.',
    pt: 'As publicações dela deixarão de aparecer para você. A Celeste não enviará aviso.',
  },
  blockConfirm: { en: 'Block', pt: 'Bloquear' },
  blocked: { en: 'Person blocked. Their posts are now hidden.', pt: 'Pessoa bloqueada. As publicações dela foram ocultadas.' },
  cloudActionFailed: {
    en: 'This action needs a connected community account. Try again later.',
    pt: 'Esta ação precisa de uma conta da comunidade conectada. Tente novamente mais tarde.',
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

const KIND_COPY = {
  action: { label: S.kindAction, hint: S.kindActionHint },
  evidence: { label: S.kindEvidence, hint: S.kindEvidenceHint },
  celebration: { label: S.kindCelebration, hint: S.kindCelebrationHint },
};

const REACTION_COPY = {
  with_you: S.withYou,
  rooting: S.rooting,
  celebrate: S.celebrate,
};

function circleLabel(slug, lang) {
  const circle = COMMUNITY_CIRCLES.find((candidate) => candidate.slug === slug);
  if (!circle) return '';
  return lang === 'pt' ? circle.namePt : circle.nameEn;
}

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

function StoryCard({
  item,
  mine,
  t,
  lang,
  theme,
  onDelete,
  deleting,
  onReact,
  reacting,
  onReport,
  onBlock,
  safetyBusy,
}) {
  const linked = mine && item.manifestationTitle
    ? t(S.linked, { title: item.manifestationTitle })
    : mine && item.manifestationId
      ? t(S.genericLinked)
      : '';
  const kindCopy = KIND_COPY[item.kind] || KIND_COPY.celebration;
  const circle = circleLabel(item.circleSlug, lang);
  const author = item.authorHandle ? `@${item.authorHandle}` : mine ? t(S.personalExperience) : t(S.member);
  const canInteract = !mine && !item.isOwn && item.remoteId;
  return (
    <View style={[styles.storyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.storyMetaRow}>
        <View style={[styles.avatar, { backgroundColor: theme.accents[2] + '22' }]}>
          <Ionicons name="sparkles" size={17} color={theme.accents[2]} />
        </View>
        <View style={styles.storyMetaText}>
          <Text style={[styles.storyAuthor, { color: theme.text }]}>
            {author}
          </Text>
          <Text style={[styles.storyDate, { color: theme.textMuted }]}>{formatDate(item.createdAt, lang)}</Text>
        </View>
        {mine ? <StatusBadge item={item} t={t} theme={theme} /> : null}
      </View>
      <View style={styles.storyTaxonomy}>
        <Text style={[styles.storyTaxonomyText, { color: theme.accent }]}>{t(kindCopy.label)}</Text>
        {circle ? <Text style={[styles.storyTaxonomyText, { color: theme.textMuted }]}>{circle}</Text> : null}
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
      {canInteract ? (
        <View style={[styles.interactionArea, { borderTopColor: theme.border }]}>
          <Text style={[styles.interactionLabel, { color: theme.textMuted }]}>{t(S.reactionsLabel)}</Text>
          <View style={styles.reactionWrap}>
            {COMMUNITY_REACTION_KINDS.map((reactionKind) => {
              const selected = (item.myReactions || []).includes(reactionKind);
              const busy = reacting === `${item.id}:${reactionKind}`;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected, busy }}
                  disabled={Boolean(reacting)}
                  key={reactionKind}
                  onPress={() => onReact(item, reactionKind)}
                  style={({ pressed }) => [
                    styles.reactionChoice,
                    {
                      borderColor: selected ? theme.accent : theme.border,
                      backgroundColor: selected ? theme.accentSoft : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <Text style={[styles.reactionText, { color: selected ? theme.accent : theme.text }]}>
                      {t(REACTION_COPY[reactionKind])}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
          <View style={styles.safetyActions}>
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(safetyBusy)}
              onPress={() => onReport(item)}
              style={({ pressed }) => [styles.safetyAction, pressed && styles.pressed]}
            >
              <Text style={[styles.safetyActionText, { color: theme.textMuted }]}>{t(S.report)}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={Boolean(safetyBusy)}
              onPress={() => onBlock(item)}
              style={({ pressed }) => [styles.safetyAction, pressed && styles.pressed]}
            >
              <Text style={[styles.safetyActionText, { color: theme.textMuted }]}>{t(S.block)}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function CommunityScreen() {
  const theme = useTheme();
  const { t, lang } = useT();
  const [tab, setTab] = useState('feed');
  const [composer, setComposer] = useState(false);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState(null);
  const [circleSlug, setCircleSlug] = useState(null);
  const [feedCircle, setFeedCircle] = useState('all');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [reactingKey, setReactingKey] = useState(null);
  const [safetyKey, setSafetyKey] = useState(null);
  const [community, setCommunity] = useState({ feed: [], own: [], mode: 'local', reason: null, viewerHandle: null });
  const refreshRequestRef = useRef(0);
  const localHydratedRef = useRef(false);
  const submitRef = useRef(false);
  const deleteRef = useRef(false);
  const safetyRef = useRef(false);

  const normalizedBody = normalizeCommunityStory(body);
  const validation = useMemo(() => validateCommunityStory(body), [body]);
  const selectedCircleLabel = circleLabel(circleSlug, lang);
  const previewReady = Boolean(kind && circleSlug && validation.ok);
  const canSubmit = previewReady && (COMMUNITY_REMOTE_ENABLED ? consent : true) && !submitting;
  const visibleFeed = useMemo(
    () => feedCircle === 'all'
      ? community.feed
      : community.feed.filter((item) => item.circleSlug === feedCircle),
    [community.feed, feedCircle]
  );

  useEffect(() => {
    if (composer) setConsent(false);
  }, [community.viewerHandle, composer]);

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
    setConsent(false);
    setComposer(true);
  };

  const changeBody = (value) => {
    setBody(value);
    setConsent(false);
    setError(null);
  };

  const chooseKind = (value) => {
    setKind(value);
    setConsent(false);
    setError(null);
  };

  const chooseCircle = (value) => {
    setCircleSlug(value);
    setConsent(false);
    setError(null);
  };

  const closeComposer = () => {
    if (submitting || submitRef.current) return;
    setComposer(false);
    setError(null);
  };

  const submit = async () => {
    if (submitRef.current) return;
    if (!kind) {
      setError(t(S.kindNeeded));
      return;
    }
    if (!circleSlug) {
      setError(t(S.circleNeeded));
      return;
    }
    if (!validation.ok) {
      const validationErrors = {
        too_short: S.tooShort,
        personal_data: S.personalData,
        money_request: S.moneyRequest,
      };
      setError(t(validationErrors[validation.reason] || S.loadError));
      return;
    }
    if (COMMUNITY_REMOTE_ENABLED && !consent) {
      setError(t(S.consentNeeded));
      return;
    }
    submitRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await submitCommunityStory({
        body: normalizedBody,
        consent: COMMUNITY_REMOTE_ENABLED ? consent : false,
        locale: lang,
        kind,
        circleSlug,
        authorHandle: community.viewerHandle,
      });
      setResult(response.synced ? t(S.sent) : t(S.localSaved));
      setBody('');
      setKind(null);
      setCircleSlug(null);
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

  const reactToStory = async (item, reactionKind) => {
    if (reactingKey) return;
    const key = `${item.id}:${reactionKind}`;
    setReactingKey(key);
    setError(null);
    try {
      const response = await toggleCommunityReaction(item, reactionKind);
      if (!response.ok) {
        setError(t(S.cloudActionFailed));
        return;
      }
      setCommunity((current) => ({
        ...current,
        feed: current.feed.map((story) => {
          if (story.id !== item.id) return story;
          const reactions = new Set(story.myReactions || []);
          if (response.active) reactions.add(reactionKind);
          else reactions.delete(reactionKind);
          return { ...story, myReactions: [...reactions] };
        }),
      }));
    } catch (_error) {
      setError(t(S.cloudActionFailed));
    } finally {
      setReactingKey(null);
    }
  };

  const reportStory = async (item) => {
    if (safetyRef.current) return;
    safetyRef.current = true;
    try {
      const allowed = await confirmAsync({
        title: t(S.reportTitle),
        message: t(S.reportBody),
        confirmLabel: t(S.reportConfirm),
        cancelLabel: t(S.cancel),
        destructive: false,
        lang,
      });
      if (!allowed) return;
      setSafetyKey(`report:${item.id}`);
      setError(null);
      const response = await reportCommunityStory(item);
      if (response.ok) setResult(t(S.reportSent));
      else setError(t(S.cloudActionFailed));
    } catch (_error) {
      setError(t(S.cloudActionFailed));
    } finally {
      safetyRef.current = false;
      setSafetyKey(null);
    }
  };

  const blockStory = async (item) => {
    if (safetyRef.current) return;
    safetyRef.current = true;
    try {
      const allowed = await confirmAsync({
        title: t(S.blockTitle),
        message: t(S.blockBody),
        confirmLabel: t(S.blockConfirm),
        cancelLabel: t(S.cancel),
        destructive: true,
        lang,
      });
      if (!allowed) return;
      setSafetyKey(`block:${item.id}`);
      setError(null);
      const response = await blockCommunityMember(item);
      if (!response.ok) {
        setError(t(S.cloudActionFailed));
        return;
      }
      setCommunity((current) => ({
        ...current,
        feed: current.feed.filter((story) => story.userId !== item.userId),
      }));
      setResult(t(S.blocked));
    } catch (_error) {
      setError(t(S.cloudActionFailed));
    } finally {
      safetyRef.current = false;
      setSafetyKey(null);
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
              <Text style={[styles.composerBody, { color: theme.textMuted }]}>
                {t(COMMUNITY_REMOTE_ENABLED ? S.composeBody : S.composeBodyLocal)}
              </Text>
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

          <Text style={[styles.fieldLabel, { color: theme.text }]}>{t(S.kindLabel)}</Text>
          <View accessibilityRole="radiogroup" style={styles.choiceWrap}>
            {COMMUNITY_POST_KINDS.map((postKind) => {
              const selected = kind === postKind;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={postKind}
                  onPress={() => chooseKind(postKind)}
                  style={[
                    styles.choice,
                    { borderColor: selected ? theme.accent : theme.border, backgroundColor: theme.bg },
                  ]}
                >
                  <Text style={[styles.choiceText, { color: selected ? theme.accent : theme.text }]}>
                    {t(KIND_COPY[postKind].label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {kind ? (
            <Text style={[styles.helperText, { color: theme.textMuted }]}>{t(KIND_COPY[kind].hint)}</Text>
          ) : null}

          <Text style={[styles.fieldLabel, styles.compactFieldLabel, { color: theme.text }]}>{t(S.circleLabel)}</Text>
          <View accessibilityRole="radiogroup" style={styles.choiceWrap}>
            {COMMUNITY_CIRCLES.map((circle) => {
              const selected = circleSlug === circle.slug;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={circle.slug}
                  onPress={() => chooseCircle(circle.slug)}
                  style={[
                    styles.choice,
                    { borderColor: selected ? theme.accent : theme.border, backgroundColor: theme.bg },
                  ]}
                >
                  <Text style={[styles.choiceText, { color: selected ? theme.accent : theme.text }]}>
                    {lang === 'pt' ? circle.namePt : circle.nameEn}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, styles.compactFieldLabel, { color: theme.text }]}>
            {t(COMMUNITY_REMOTE_ENABLED ? S.storyLabel : S.storyLabelLocal)}
          </Text>
          <TextInput
            testID="community-story-input"
            accessibilityLabel={t(COMMUNITY_REMOTE_ENABLED ? S.storyLabel : S.storyLabelLocal)}
            multiline
            maxLength={COMMUNITY_BODY_MAX}
            onChangeText={changeBody}
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

          <View style={[styles.previewSection, { borderColor: theme.border }]}>
            <Text style={[styles.previewTitle, { color: theme.text }]}>
              {t(COMMUNITY_REMOTE_ENABLED ? S.previewTitle : S.previewTitleLocal)}
            </Text>
            {previewReady ? (
              <>
                <Text style={[styles.previewAuthor, { color: theme.text }]}>
                  {community.viewerHandle ? `@${community.viewerHandle}` : t(S.member)}
                </Text>
                <View style={styles.storyTaxonomy}>
                  <Text style={[styles.storyTaxonomyText, { color: theme.accent }]}>{t(KIND_COPY[kind].label)}</Text>
                  <Text style={[styles.storyTaxonomyText, { color: theme.textMuted }]}>{selectedCircleLabel}</Text>
                </View>
                <Text style={[styles.previewBody, { color: theme.text }]}>{normalizedBody}</Text>
              </>
            ) : (
              <Text style={[styles.helperText, { color: theme.textMuted }]}>{t(S.previewPending)}</Text>
            )}
          </View>

          {COMMUNITY_REMOTE_ENABLED && previewReady ? (
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
              <Text style={[styles.consentText, { color: theme.text }]}>
                {t(S.consent, { circle: selectedCircleLabel })}
              </Text>
            </Pressable>
          ) : null}

          <View testID="community-submit-notice" style={[styles.reviewNotice, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="shield-checkmark-outline" size={20} color={theme.accent} />
            <Text style={[styles.reviewText, { color: theme.text }]}>
              {t(COMMUNITY_REMOTE_ENABLED ? S.reviewNotice : S.localNotice)}
            </Text>
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
            <Text style={styles.submitText}>
              {t(COMMUNITY_REMOTE_ENABLED ? S.submit : S.submitLocal)}
            </Text>
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

          {tab === 'feed' ? (
            <View style={styles.circleFilterSection}>
              <Text style={[styles.circleFilterLabel, { color: theme.text }]}>{t(S.circlesLabel)}</Text>
              <View accessibilityRole="radiogroup" style={styles.circleFilterWrap}>
                {[{ slug: 'all', namePt: t(S.allCircles), nameEn: t(S.allCircles) }, ...COMMUNITY_CIRCLES].map((circle) => {
                  const selected = feedCircle === circle.slug;
                  const label = circle.slug === 'all'
                    ? t(S.allCircles)
                    : lang === 'pt' ? circle.namePt : circle.nameEn;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={circle.slug}
                      onPress={() => setFeedCircle(circle.slug)}
                      style={[
                        styles.circleFilter,
                        {
                          borderColor: selected ? theme.accent : theme.border,
                          backgroundColor: selected ? theme.accentSoft : 'transparent',
                        },
                      ]}
                    >
                      <Text style={[styles.circleFilterText, { color: selected ? theme.accent : theme.text }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

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
            visibleFeed.length ? (
              <View>
                {visibleFeed.map((item) => (
                  <StoryCard
                    key={item.id}
                    item={item}
                    mine={false}
                    t={t}
                    lang={lang}
                    theme={theme}
                    onReact={reactToStory}
                    reacting={reactingKey}
                    onReport={reportStory}
                    onBlock={blockStory}
                    safetyBusy={safetyKey}
                  />
                ))}
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
  circleFilterSection: { marginBottom: 16 },
  circleFilterLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', marginBottom: 7, letterSpacing: 0 },
  circleFilterWrap: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  circleFilter: { minHeight: 36, borderWidth: 1, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7, margin: 3 },
  circleFilterText: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0 },
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
  storyTaxonomy: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, marginHorizontal: -4 },
  storyTaxonomyText: { fontSize: 11, lineHeight: 16, fontWeight: '700', marginHorizontal: 4, letterSpacing: 0 },
  storyBody: { marginTop: 14, fontSize: 16, lineHeight: 24, letterSpacing: 0 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 9, marginLeft: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusText: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0 },
  linkedRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, marginTop: 14, paddingTop: 11 },
  linkedText: { flex: 1, marginLeft: 7, fontSize: 12, lineHeight: 17, letterSpacing: 0 },
  localNote: { fontSize: 12, lineHeight: 17, marginTop: 10, letterSpacing: 0 },
  deleteStory: { minHeight: 40, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginTop: 10 },
  deleteStoryText: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginLeft: 7, letterSpacing: 0 },
  interactionArea: { borderTopWidth: 1, marginTop: 15, paddingTop: 13 },
  interactionLabel: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 0 },
  reactionWrap: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginTop: 6 },
  reactionChoice: { minHeight: 38, minWidth: 92, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7, margin: 3 },
  reactionText: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0 },
  safetyActions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 7, marginHorizontal: -8 },
  safetyAction: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 },
  safetyActionText: { fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 0 },
  composer: { borderWidth: 1, borderRadius: 8, padding: 16, marginBottom: 24 },
  composerHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  composerHeadingWrap: { flex: 1, minWidth: 0 },
  composerTitle: { fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: 0 },
  composerBody: { fontSize: 13, lineHeight: 19, marginTop: 4, letterSpacing: 0 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  fieldLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 20, marginBottom: 7, letterSpacing: 0 },
  compactFieldLabel: { marginTop: 15 },
  textInput: { minHeight: 138, borderWidth: 1, borderRadius: 8, padding: 13, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  counter: { alignSelf: 'flex-end', fontSize: 11, lineHeight: 16, marginTop: 5, letterSpacing: 0 },
  choiceWrap: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  choice: { maxWidth: '100%', minHeight: 38, borderWidth: 1, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 8, margin: 4 },
  choiceText: { maxWidth: 260, fontSize: 12, lineHeight: 17, fontWeight: '600', letterSpacing: 0 },
  helperText: { fontSize: 12, lineHeight: 18, marginTop: 4, letterSpacing: 0 },
  previewSection: { borderTopWidth: 1, borderBottomWidth: 1, marginTop: 18, paddingVertical: 14 },
  previewTitle: { fontSize: 13, lineHeight: 18, fontWeight: '800', letterSpacing: 0 },
  previewAuthor: { fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 11, letterSpacing: 0 },
  previewBody: { fontSize: 15, lineHeight: 22, marginTop: 11, letterSpacing: 0 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 21 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  consentText: { flex: 1, minWidth: 0, marginLeft: 11, fontSize: 13, lineHeight: 19, letterSpacing: 0 },
  reviewNotice: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, borderRadius: 8, marginTop: 17 },
  reviewText: { flex: 1, minWidth: 0, marginLeft: 9, fontSize: 12, lineHeight: 18, letterSpacing: 0 },
  feedback: { fontSize: 12, lineHeight: 17, marginTop: 11, fontWeight: '600', letterSpacing: 0 },
  submitButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 8, marginTop: 18, paddingHorizontal: 18 },
  submitText: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '700', marginLeft: 8, letterSpacing: 0 },
});
