import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCelesteSupabaseClient } from './celesteSupabase';

export const COMMUNITY_STORAGE_KEY = '@celeste_community_stories_v1';
export const COMMUNITY_BODY_MIN = 10;
export const COMMUNITY_BODY_MAX = 600;
export const COMMUNITY_STORAGE_ERROR_CODE = 'community_storage_unreadable';
export const COMMUNITY_BACKUP_MAX_ITEMS = 50;
export const COMMUNITY_REMOTE_TIMEOUT_MS = 4500;
export const COMMUNITY_REMOTE_ENABLED =
  process.env.EXPO_PUBLIC_CELESTE_COMMUNITY_REMOTE_ENABLED === '1';

const CATEGORY_CIRCLES = {
  Love: 'amor-reciproco',
  Wealth: 'prosperidade-consciente',
  Career: 'proposito-carreira',
  Health: 'corpo-cuidado',
  Confidence: 'coragem-confianca',
  Peace: 'paz-presenca',
};

export const COMMUNITY_CIRCLES = Object.freeze([
  { slug: 'amor-reciproco', category: 'Love', namePt: 'Amor recíproco', nameEn: 'Reciprocal love' },
  { slug: 'prosperidade-consciente', category: 'Wealth', namePt: 'Prosperidade consciente', nameEn: 'Mindful prosperity' },
  { slug: 'coragem-confianca', category: 'Confidence', namePt: 'Coragem e confiança', nameEn: 'Courage and confidence' },
  { slug: 'proposito-carreira', category: 'Career', namePt: 'Propósito e carreira', nameEn: 'Purpose and career' },
  { slug: 'corpo-cuidado', category: 'Health', namePt: 'Corpo e cuidado', nameEn: 'Body and care' },
  { slug: 'paz-presenca', category: 'Peace', namePt: 'Paz e presença', nameEn: 'Peace and presence' },
]);

export const COMMUNITY_POST_KINDS = Object.freeze(['action', 'evidence', 'celebration']);
export const COMMUNITY_REACTION_KINDS = Object.freeze(['with_you', 'rooting', 'celebrate']);

const CIRCLE_SLUGS = new Set(COMMUNITY_CIRCLES.map((circle) => circle.slug));
const CIRCLE_CATEGORIES = Object.fromEntries(COMMUNITY_CIRCLES.map((circle) => [circle.slug, circle.category]));

let localMutationTail = Promise.resolve();
let communityGeneration = 0;
let communityResetToken = 0;

function serializeLocalMutation(operation) {
  const result = localMutationTail.then(operation, operation);
  localMutationTail = result.then(() => undefined, () => undefined);
  return result;
}

function communityResetError() {
  const error = new Error('community_reset_in_progress');
  error.code = 'community_reset_in_progress';
  return error;
}

function assertCommunityGeneration(expectedGeneration) {
  if (communityResetToken || expectedGeneration !== communityGeneration) {
    throw communityResetError();
  }
}

export async function beginCommunityDataReset() {
  if (communityResetToken) throw communityResetError();
  communityGeneration += 1;
  const token = communityGeneration;
  communityResetToken = token;
  try {
    // Close the gate first, then wait for older mutations without deleting yet.
    // The caller removes all reset keys together; if that operation fails, it can
    // release this gate without having already erased the community receipts.
    await serializeLocalMutation(() => Promise.resolve());
    return token;
  } catch (error) {
    if (communityResetToken === token) communityResetToken = 0;
    throw error;
  }
}

export async function finishCommunityDataReset(token) {
  await restoreLocalCommunityStoriesFromBackup(token, []);
  return true;
}

export function cancelCommunityDataReset(token) {
  if (token && communityResetToken === token) communityResetToken = 0;
}

function makeId() {
  const random = Math.random().toString(36).slice(2, 9);
  return `community-${Date.now()}-${random}`;
}

function safeText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function safeCategory(value) {
  return Object.prototype.hasOwnProperty.call(CATEGORY_CIRCLES, value) ? value : null;
}

function safeCircleSlug(value) {
  const slug = safeText(value, 80);
  return CIRCLE_SLUGS.has(slug) ? slug : null;
}

function safePostKind(value) {
  return COMMUNITY_POST_KINDS.includes(value) ? value : null;
}

function safeReactionKind(value) {
  return COMMUNITY_REACTION_KINDS.includes(value) ? value : null;
}

function boundedTimeout(value, fallback = COMMUNITY_REMOTE_TIMEOUT_MS) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(15_000, Math.max(500, Math.floor(parsed))) : fallback;
}

function settleWithin(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ settled: false, value: null });
    }, boundedTimeout(timeoutMs));
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ settled: true, value });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ settled: true, value: null });
      }
    );
  });
}

function stableLegacyId(raw, body, index) {
  const seed = JSON.stringify([
    body,
    safeText(raw && raw.createdAt, 40),
    safeText(raw && raw.manifestationId, 120),
    safeText(raw && raw.manifestationTitle, 160),
    Number.isInteger(index) ? index : 0,
  ]);
  let hash = 2166136261;
  for (let offset = 0; offset < seed.length; offset += 1) {
    hash ^= seed.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  return `community-legacy-${(hash >>> 0).toString(36)}`;
}

export function normalizeCommunityStory(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateCommunityStory(value) {
  const body = normalizeCommunityStory(value);
  if (body.length < COMMUNITY_BODY_MIN) return { ok: false, reason: 'too_short', body };
  if (body.length > COMMUNITY_BODY_MAX) return { ok: false, reason: 'too_long', body };
  if (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(body) ||
    /(?:https?:\/\/|www\.)\S+/i.test(body) ||
    /(^|\s)@[a-z0-9_.]{3,}/i.test(body) ||
    (body.match(/[+\d][\d\s().-]{7,}\d/g) || []).some(
      (candidate) => (candidate.match(/\d/g) || []).length >= 8
    )
  ) {
    return { ok: false, reason: 'personal_data', body };
  }
  if (
    /\b(?:chave\s+pix|paypal|venmo|cash\s*app|vaquinha)\b/i.test(body) ||
    /\b(?:mande|envie|transfira|doe)\b[\s\S]{0,40}\b(?:dinheiro|reais|pix|valor)\b/i.test(body)
  ) {
    return { ok: false, reason: 'money_request', body };
  }
  return { ok: true, body };
}

function sanitizeLocalItem(raw, index = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const body = normalizeCommunityStory(raw.body).slice(0, COMMUNITY_BODY_MAX);
  if (body.length < COMMUNITY_BODY_MIN) return null;
  const status = ['local_draft', 'draft', 'pending', 'published', 'hidden', 'removed'].includes(raw.status)
    ? raw.status
    : 'local_draft';
  const category = safeCategory(raw.category);
  const circleSlug = safeCircleSlug(raw.circleSlug) || (category && CATEGORY_CIRCLES[category]) || null;
  return {
    id: safeText(raw.id, 160) || stableLegacyId(raw, body, index),
    remoteId: safeText(raw.remoteId, 160) || null,
    body,
    status,
    locale: raw.locale === 'en' ? 'en' : 'pt',
    manifestationId: safeText(raw.manifestationId, 120) || null,
    manifestationTitle: safeText(raw.manifestationTitle, 160) || null,
    category,
    circleSlug,
    kind: safePostKind(raw.kind) || 'celebration',
    authorHandle: safeText(raw.authorHandle, 24) || null,
    publicationConsentAt: safeText(raw.publicationConsentAt, 40) || null,
    createdAt: safeText(raw.createdAt, 40) || new Date(0).toISOString(),
    updatedAt: safeText(raw.updatedAt, 40) || safeText(raw.createdAt, 40) || new Date(0).toISOString(),
    syncReason: safeText(raw.syncReason, 80) || null,
  };
}

export function validateLocalCommunityStoriesBackup(value) {
  if (!Array.isArray(value) || value.length > COMMUNITY_BACKUP_MAX_ITEMS) return null;
  const safe = value.map((item, index) => sanitizeLocalItem(item, index));
  return safe.every(Boolean) ? safe : null;
}

export async function loadLocalCommunityStories() {
  try {
    const raw = await AsyncStorage.getItem(COMMUNITY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('invalid_community_storage_shape');
    return parsed.map((item, index) => sanitizeLocalItem(item, index)).filter(Boolean);
  } catch (error) {
    const storageError = new Error(COMMUNITY_STORAGE_ERROR_CODE);
    storageError.code = COMMUNITY_STORAGE_ERROR_CODE;
    storageError.cause = error;
    throw storageError;
  }
}

async function persistLocalCommunityStories(items) {
  const safe = (Array.isArray(items) ? items : [])
    .map((item, index) => sanitizeLocalItem(item, index))
    .filter(Boolean)
    .slice(0, COMMUNITY_BACKUP_MAX_ITEMS);
  await AsyncStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(safe));
  return safe;
}

export async function exportLocalCommunityStoriesForBackup() {
  const expectedGeneration = communityGeneration;
  return serializeLocalMutation(async () => {
    assertCommunityGeneration(expectedGeneration);
    const safe = validateLocalCommunityStoriesBackup(await loadLocalCommunityStories());
    if (!safe) {
      const error = new Error('community_backup_invalid');
      error.code = 'community_backup_invalid';
      throw error;
    }
    return safe;
  });
}

export async function restoreLocalCommunityStoriesFromBackup(token, items) {
  const safe = validateLocalCommunityStoriesBackup(items);
  if (!safe) {
    const error = new Error('community_backup_invalid');
    error.code = 'community_backup_invalid';
    throw error;
  }
  if (!token || communityResetToken !== token) throw communityResetError();
  return serializeLocalMutation(async () => {
    if (communityResetToken !== token) throw communityResetError();
    if (safe.length) {
      await AsyncStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(safe));
    } else {
      await AsyncStorage.removeItem(COMMUNITY_STORAGE_KEY);
    }
    if (communityResetToken === token) communityResetToken = 0;
    return safe;
  });
}

async function upsertLocalCommunityStory(item, expectedGeneration = communityGeneration) {
  return serializeLocalMutation(async () => {
    assertCommunityGeneration(expectedGeneration);
    const safe = sanitizeLocalItem(item);
    if (!safe) throw new Error('INVALID_STORY');
    const items = await loadLocalCommunityStories();
    const match = (candidate) =>
      candidate.id === safe.id || (safe.remoteId && candidate.remoteId === safe.remoteId);
    const next = [safe, ...items.filter((candidate) => !match(candidate))];
    await persistLocalCommunityStories(next);
    return safe;
  });
}

export async function removeLocalCommunityStory(id, remoteId = null) {
  const expectedGeneration = communityGeneration;
  return serializeLocalMutation(async () => {
    assertCommunityGeneration(expectedGeneration);
    const target = safeText(id, 160);
    const remoteTarget = safeText(remoteId, 160);
    const items = await loadLocalCommunityStories();
    await persistLocalCommunityStories(
      items.filter(
        (item) => item.id !== target && (!remoteTarget || item.remoteId !== remoteTarget)
      )
    );
  });
}

async function getAuthenticatedUser(supabase) {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data || !data.session || !data.session.user) return null;
    return data.session.user;
  } catch (error) {
    return null;
  }
}

async function findOrJoinCircle(supabase, userId, { circleSlug, category } = {}) {
  const preferred = safeCircleSlug(circleSlug) || CATEGORY_CIRCLES[safeCategory(category)];
  if (!preferred) return null;
  const { data: memberships, error: membershipError } = await supabase
    .from('circle_members')
    .select('circle_id, joined_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true });

  if (!membershipError && memberships && memberships.length) {
    const ids = memberships.map((item) => item.circle_id);
    const { data: circles } = await supabase.from('circles').select('id, slug').in('id', ids).eq('active', true);
    const preferredCircle = (circles || []).find((circle) => circle.slug === preferred);
    if (preferredCircle) return preferredCircle;
  }

  const { data: profile } = await supabase
    .from('community_profiles')
    .select('id, age_confirmed_at')
    .eq('id', userId)
    .maybeSingle();
  if (!profile || !profile.age_confirmed_at) return null;

  const { data: circle } = await supabase
    .from('circles')
    .select('id, slug')
    .eq('slug', preferred)
    .eq('active', true)
    .maybeSingle();
  if (!circle) return null;

  const { error: joinError } = await supabase.from('circle_members').insert({
    circle_id: circle.id,
    user_id: userId,
  });
  return joinError ? null : circle;
}

function remotePostToItem(post, localReceipt, context = {}) {
  const circleSlug = context.circleSlugs && context.circleSlugs.get(post.circle_id);
  return {
    id: localReceipt ? localReceipt.id : post.id,
    remoteId: post.id,
    userId: post.user_id,
    isOwn: context.viewerUserId === post.user_id,
    authorHandle: context.authorHandles && context.authorHandles.get(post.user_id) || null,
    body: normalizeCommunityStory(post.body),
    kind: safePostKind(post.kind) || 'celebration',
    circleId: post.circle_id,
    circleSlug: safeCircleSlug(circleSlug) || (localReceipt && localReceipt.circleSlug) || null,
    myReactions: context.myReactions && context.myReactions.get(post.id) || [],
    status: post.status,
    locale: post.locale === 'en' ? 'en' : 'pt',
    manifestationId: localReceipt ? localReceipt.manifestationId : null,
    manifestationTitle: localReceipt ? localReceipt.manifestationTitle : null,
    category: localReceipt ? localReceipt.category : null,
    publicationConsentAt: localReceipt ? localReceipt.publicationConsentAt : null,
    createdAt: post.created_at,
    updatedAt: post.updated_at || post.created_at,
    syncReason: null,
  };
}

function localCommunityState(local, reason) {
  return { feed: [], own: local, mode: 'local', reason, viewerHandle: null };
}

export async function loadLocalCommunityState() {
  return localCommunityState(await loadLocalCommunityStories(), 'refreshing');
}

async function loadRemoteCommunityState(local, supabase) {
  const user = await getAuthenticatedUser(supabase);
  if (!user) return localCommunityState(local, 'sign_in_required');

  // RLS returns only the caller's own work and posts that moderation published.
  const { data, error } = await supabase
    .from('community_posts')
    .select('id, user_id, circle_id, body, kind, locale, status, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;

  const remotePosts = data || [];
  const publishedIds = remotePosts.filter((post) => post.status === 'published').map((post) => post.id);
  const { data: circleRows, error: circlesError } = await supabase
    .from('circles')
    .select('id, slug')
    .eq('active', true);
  if (circlesError) throw circlesError;

  const { data: profile, error: profileError } = await supabase
    .from('community_profiles')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  const viewerHandle = safeText(profile && profile.handle, 24) || null;

  const myReactions = new Map();
  if (publishedIds.length) {
    try {
      const { data: reactionRows, error: reactionsError } = await supabase
        .from('community_reactions')
        .select('post_id, kind')
        .eq('user_id', user.id)
        .in('post_id', publishedIds);
      if (!reactionsError) {
        (reactionRows || []).forEach((reaction) => {
          const kind = safeReactionKind(reaction.kind);
          if (!kind) return;
          const current = myReactions.get(reaction.post_id) || [];
          myReactions.set(reaction.post_id, [...current, kind]);
        });
      }
    } catch (_error) {
      // Reactions are optional decoration; a feed remains useful without them.
    }
  }

  const authorHandles = new Map();
  if (viewerHandle) authorHandles.set(user.id, viewerHandle);
  const publicAuthorIds = [...new Set(
    remotePosts
      .filter((post) => post.status === 'published' && post.user_id !== user.id)
      .map((post) => post.user_id)
  )];
  const publicProfiles = await Promise.all(publicAuthorIds.map(async (authorId) => {
    try {
      const { data: profileRows, error: profileError } = await supabase.rpc('community_public_profile', {
        target_user: authorId,
      });
      if (profileError) return null;
      const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;
      const handle = safeText(profile && profile.handle, 24);
      return handle ? [authorId, handle] : null;
    } catch (_error) {
      return null;
    }
  }));
  publicProfiles.filter(Boolean).forEach(([authorId, handle]) => authorHandles.set(authorId, handle));

  const circleSlugs = new Map((circleRows || []).map((circle) => [circle.id, circle.slug]));
  const receipts = new Map(local.filter((item) => item.remoteId).map((item) => [item.remoteId, item]));
  const posts = remotePosts.map((post) => remotePostToItem(post, receipts.get(post.id), {
    authorHandles,
    circleSlugs,
    myReactions,
    viewerUserId: user.id,
  }));
  const feed = posts.filter((post) => post.status === 'published');
  const cloudOwn = posts.filter((post) => post.userId === user.id);
  const cloudIds = new Set(cloudOwn.map((post) => post.remoteId));
  const own = [...cloudOwn, ...local.filter((item) => !item.remoteId || !cloudIds.has(item.remoteId))];
  return { feed, own, mode: 'cloud', reason: null, viewerHandle };
}

export async function loadCommunityState(options = {}) {
  const suppliedLocal = Array.isArray(options.localStories)
    ? options.localStories.map((item, index) => sanitizeLocalItem(item, index)).filter(Boolean)
    : null;
  const local = suppliedLocal || await loadLocalCommunityStories();
  if (!COMMUNITY_REMOTE_ENABLED) return localCommunityState(local, 'remote_disabled');
  const supabase = getCelesteSupabaseClient();
  if (!supabase) return localCommunityState(local, 'not_configured');

  try {
    const outcome = await settleWithin(
      loadRemoteCommunityState(local, supabase),
      options.timeoutMs
    );
    return outcome.settled && outcome.value
      ? outcome.value
      : localCommunityState(local, outcome.settled ? 'unavailable' : 'timeout');
  } catch (error) {
    return localCommunityState(local, 'unavailable');
  }
}

export async function submitCommunityStory(input) {
  const operationGeneration = communityGeneration;
  assertCommunityGeneration(operationGeneration);
  const validation = validateCommunityStory(input && input.body);
  if (!validation.ok) {
    const error = new Error(validation.reason);
    error.code = validation.reason;
    throw error;
  }
  if (COMMUNITY_REMOTE_ENABLED && (!input || input.consent !== true)) {
    const error = new Error('consent_required');
    error.code = 'consent_required';
    throw error;
  }

  const kind = safePostKind(input && input.kind);
  if (!kind) {
    const error = new Error('kind_required');
    error.code = 'kind_required';
    throw error;
  }
  const circleSlug = safeCircleSlug(input && input.circleSlug)
    || CATEGORY_CIRCLES[safeCategory(input && input.category)];
  if (!circleSlug) {
    const error = new Error('circle_required');
    error.code = 'circle_required';
    throw error;
  }
  const category = CIRCLE_CATEGORIES[circleSlug];

  const now = new Date().toISOString();
  const localDraft = {
    id: makeId(),
    remoteId: null,
    body: validation.body,
    status: 'local_draft',
    locale: input.locale === 'en' ? 'en' : 'pt',
    manifestationId: safeText(input.manifestationId, 120) || null,
    manifestationTitle: safeText(input.manifestationTitle, 160) || null,
    category,
    circleSlug,
    kind,
    authorHandle: safeText(input.authorHandle, 24) || null,
    publicationConsentAt: input && input.consent === true ? now : null,
    createdAt: now,
    updatedAt: now,
    syncReason: null,
  };

  // A readable, durable local receipt is required before any private text is
  // sent to the community backend. Corruption therefore fails closed.
  await upsertLocalCommunityStory(localDraft, operationGeneration);

  if (!COMMUNITY_REMOTE_ENABLED) {
    const item = await upsertLocalCommunityStory(
      { ...localDraft, syncReason: 'remote_disabled' },
      operationGeneration
    );
    return { item, synced: false, reason: 'remote_disabled' };
  }

  const supabase = getCelesteSupabaseClient();
  if (!supabase) {
    const item = await upsertLocalCommunityStory(
      { ...localDraft, syncReason: 'not_configured' },
      operationGeneration
    );
    return { item, synced: false, reason: 'not_configured' };
  }

  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    const item = await upsertLocalCommunityStory(
      { ...localDraft, syncReason: 'sign_in_required' },
      operationGeneration
    );
    return { item, synced: false, reason: 'sign_in_required' };
  }

  let created = null;
  try {
    const circle = await findOrJoinCircle(supabase, user.id, { circleSlug, category });
    if (!circle) {
      const item = await upsertLocalCommunityStory(
        { ...localDraft, syncReason: 'profile_required' },
        operationGeneration
      );
      return { item, synced: false, reason: 'profile_required' };
    }

    const { data: createdPost, error: createError } = await supabase
      .from('community_posts')
      .insert({
        user_id: user.id,
        circle_id: circle.id,
        kind,
        body: validation.body,
        locale: localDraft.locale,
        manifestation_ref: localDraft.manifestationId,
        publication_consent_at: now,
      })
      .select('id, content_revision, status, created_at, updated_at')
      .single();
    if (createError || !createdPost) throw createError || new Error('CREATE_FAILED');
    created = createdPost;

    const { data: submitted, error: submitError } = await supabase.rpc('community_submit_post', {
      target_post: created.id,
      expected_revision: created.content_revision,
    });

    const pending = submitted === true && !submitError;
    let item;
    try {
      item = await upsertLocalCommunityStory(
        {
          ...localDraft,
          remoteId: created.id,
          status: pending ? 'pending' : 'draft',
          createdAt: created.created_at || now,
          updatedAt: created.updated_at || now,
          syncReason: pending ? null : 'submit_failed',
        },
        operationGeneration
      );
    } catch (localError) {
      // Do not leave a remote story without a local receipt the author can use
      // to find and delete it.
      const rollback = await supabase
        .rpc('community_delete_own_post', { target_post: created.id })
        .catch(() => null);
      if (rollback && rollback.data === true && !rollback.error) created = null;
      throw localError;
    }
    return { item, synced: pending, reason: pending ? null : 'submit_failed' };
  } catch (error) {
    const item = await upsertLocalCommunityStory(
      {
        ...localDraft,
        ...(created
          ? {
              remoteId: created.id,
              status: 'pending',
              createdAt: created.created_at || now,
              updatedAt: created.updated_at || now,
            }
          : {}),
        syncReason: created ? 'remote_cleanup_required' : 'unavailable',
      },
      operationGeneration
    );
    return { item, synced: false, reason: 'unavailable' };
  }
}

async function ensureCircleMembership(supabase, userId, circleId) {
  const { data: membership } = await supabase
    .from('circle_members')
    .select('circle_id, status')
    .eq('circle_id', circleId)
    .eq('user_id', userId)
    .maybeSingle();
  if (membership && membership.status === 'active') return true;
  if (membership) return false;

  const { data: profile } = await supabase
    .from('community_profiles')
    .select('age_confirmed_at')
    .eq('id', userId)
    .maybeSingle();
  if (!profile || !profile.age_confirmed_at) return false;

  const { error } = await supabase.from('circle_members').insert({
    circle_id: circleId,
    user_id: userId,
  });
  return !error;
}

export async function toggleCommunityReaction(item, reactionKind) {
  const remoteId = safeText(item && item.remoteId, 160);
  const circleId = safeText(item && item.circleId, 160);
  const kind = safeReactionKind(reactionKind);
  if (!remoteId || !circleId || !kind) return { ok: false, reason: 'invalid_reaction' };
  if (!COMMUNITY_REMOTE_ENABLED) return { ok: false, reason: 'remote_disabled' };

  const supabase = getCelesteSupabaseClient();
  if (!supabase) return { ok: false, reason: 'not_configured' };
  const user = await getAuthenticatedUser(supabase);
  if (!user) return { ok: false, reason: 'sign_in_required' };
  if (safeText(item && item.userId, 160) === user.id) return { ok: false, reason: 'own_story' };

  try {
    const { data: existing, error: existingError } = await supabase
      .from('community_reactions')
      .select('post_id')
      .eq('post_id', remoteId)
      .eq('user_id', user.id)
      .eq('kind', kind)
      .maybeSingle();
    if (existingError) return { ok: false, reason: 'unavailable' };

    if (existing) {
      const { error: deleteError } = await supabase
        .from('community_reactions')
        .delete()
        .eq('post_id', remoteId)
        .eq('user_id', user.id)
        .eq('kind', kind);
      return deleteError ? { ok: false, reason: 'unavailable' } : { ok: true, active: false, kind };
    }

    if (!await ensureCircleMembership(supabase, user.id, circleId)) {
      return { ok: false, reason: 'profile_required' };
    }
    const { error: insertError } = await supabase.from('community_reactions').insert({
      post_id: remoteId,
      user_id: user.id,
      kind,
    });
    return insertError ? { ok: false, reason: 'unavailable' } : { ok: true, active: true, kind };
  } catch (_error) {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function reportCommunityStory(item, reason = 'other') {
  const remoteId = safeText(item && item.remoteId, 160);
  const safeReason = ['harassment', 'scam', 'personal_data', 'self_harm', 'hate', 'spam', 'other'].includes(reason)
    ? reason
    : 'other';
  if (!remoteId) return { ok: false, reason: 'invalid_story' };
  if (!COMMUNITY_REMOTE_ENABLED) return { ok: false, reason: 'remote_disabled' };

  const supabase = getCelesteSupabaseClient();
  if (!supabase) return { ok: false, reason: 'not_configured' };
  const user = await getAuthenticatedUser(supabase);
  if (!user) return { ok: false, reason: 'sign_in_required' };
  if (safeText(item && item.userId, 160) === user.id) return { ok: false, reason: 'own_story' };

  try {
    const { data, error } = await supabase.rpc('community_report_post', {
      target_post: remoteId,
      target_reason: safeReason,
      target_detail: null,
    });
    return error || !data ? { ok: false, reason: 'unavailable' } : { ok: true, reportId: data };
  } catch (_error) {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function blockCommunityMember(item) {
  const blockedId = safeText(item && item.userId, 160);
  if (!blockedId) return { ok: false, reason: 'invalid_story' };
  if (!COMMUNITY_REMOTE_ENABLED) return { ok: false, reason: 'remote_disabled' };

  const supabase = getCelesteSupabaseClient();
  if (!supabase) return { ok: false, reason: 'not_configured' };
  const user = await getAuthenticatedUser(supabase);
  if (!user) return { ok: false, reason: 'sign_in_required' };
  if (blockedId === user.id) return { ok: false, reason: 'own_story' };

  try {
    const { data: existing, error: existingError } = await supabase
      .from('community_blocks')
      .select('blocked_id')
      .eq('blocker_id', user.id)
      .eq('blocked_id', blockedId)
      .maybeSingle();
    if (existingError) return { ok: false, reason: 'unavailable' };
    if (existing) return { ok: true, alreadyBlocked: true };
    const { error } = await supabase.from('community_blocks').insert({
      blocker_id: user.id,
      blocked_id: blockedId,
    });
    return error ? { ok: false, reason: 'unavailable' } : { ok: true, alreadyBlocked: false };
  } catch (_error) {
    return { ok: false, reason: 'unavailable' };
  }
}

export async function deleteCommunityStory(item) {
  const localId = safeText(item && item.id, 160);
  const remoteId = safeText(item && item.remoteId, 160);
  if (!localId) return { ok: false, reason: 'invalid_story' };

  if (!remoteId) {
    await removeLocalCommunityStory(localId, remoteId);
    return { ok: true, remoteDeleted: false };
  }

  if (!COMMUNITY_REMOTE_ENABLED) return { ok: false, reason: 'remote_disabled' };

  const supabase = getCelesteSupabaseClient();
  if (!supabase) return { ok: false, reason: 'not_configured' };
  const user = await getAuthenticatedUser(supabase);
  if (!user) return { ok: false, reason: 'sign_in_required' };

  try {
    const { data, error } = await supabase.rpc('community_delete_own_post', {
      target_post: remoteId,
    });
    if (error || data !== true) return { ok: false, reason: 'delete_unconfirmed' };
    await removeLocalCommunityStory(localId, remoteId);
    return { ok: true, remoteDeleted: true };
  } catch (error) {
    return { ok: false, reason: 'unavailable' };
  }
}
