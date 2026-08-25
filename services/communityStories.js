import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const COMMUNITY_STORAGE_KEY = '@celeste_community_stories_v1';
export const COMMUNITY_BODY_MIN = 10;
export const COMMUNITY_BODY_MAX = 600;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const CATEGORY_CIRCLES = {
  Love: 'amor-reciproco',
  Wealth: 'prosperidade-consciente',
  Career: 'proposito-carreira',
  Health: 'corpo-cuidado',
  Confidence: 'coragem-confianca',
  Peace: 'paz-presenca',
};

let client;

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

function makeId() {
  const random = Math.random().toString(36).slice(2, 9);
  return `community-${Date.now()}-${random}`;
}

function safeText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
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
  return { ok: true, body };
}

function sanitizeLocalItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const body = normalizeCommunityStory(raw.body).slice(0, COMMUNITY_BODY_MAX);
  if (body.length < COMMUNITY_BODY_MIN) return null;
  const status = ['local_draft', 'draft', 'pending', 'published', 'hidden', 'removed'].includes(raw.status)
    ? raw.status
    : 'local_draft';
  return {
    id: safeText(raw.id, 160) || makeId(),
    remoteId: safeText(raw.remoteId, 160) || null,
    body,
    status,
    locale: raw.locale === 'en' ? 'en' : 'pt',
    manifestationId: safeText(raw.manifestationId, 120) || null,
    manifestationTitle: safeText(raw.manifestationTitle, 160) || null,
    publicationConsentAt: safeText(raw.publicationConsentAt, 40) || null,
    createdAt: safeText(raw.createdAt, 40) || new Date().toISOString(),
    updatedAt: safeText(raw.updatedAt, 40) || safeText(raw.createdAt, 40) || new Date().toISOString(),
    syncReason: safeText(raw.syncReason, 80) || null,
  };
}

export async function loadLocalCommunityStories() {
  try {
    const raw = await AsyncStorage.getItem(COMMUNITY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return (Array.isArray(parsed) ? parsed : []).map(sanitizeLocalItem).filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function persistLocalCommunityStories(items) {
  const safe = (Array.isArray(items) ? items : []).map(sanitizeLocalItem).filter(Boolean).slice(0, 50);
  await AsyncStorage.setItem(COMMUNITY_STORAGE_KEY, JSON.stringify(safe));
  return safe;
}

async function upsertLocalCommunityStory(item) {
  const safe = sanitizeLocalItem(item);
  if (!safe) throw new Error('INVALID_STORY');
  const items = await loadLocalCommunityStories();
  const match = (candidate) =>
    candidate.id === safe.id || (safe.remoteId && candidate.remoteId === safe.remoteId);
  const next = [safe, ...items.filter((candidate) => !match(candidate))];
  await persistLocalCommunityStories(next);
  return safe;
}

export async function removeLocalCommunityStory(id) {
  const target = safeText(id, 160);
  const items = await loadLocalCommunityStories();
  await persistLocalCommunityStories(items.filter((item) => item.id !== target));
}

export function isCommunityCloudConfigured() {
  return !!getClient();
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

async function findOrJoinCircle(supabase, userId, category) {
  const preferred = CATEGORY_CIRCLES[category] || CATEGORY_CIRCLES.Confidence;
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

function remotePostToItem(post, localReceipt) {
  return {
    id: post.id,
    remoteId: post.id,
    userId: post.user_id,
    body: normalizeCommunityStory(post.body),
    status: post.status,
    locale: post.locale === 'en' ? 'en' : 'pt',
    manifestationId: localReceipt ? localReceipt.manifestationId : null,
    manifestationTitle: localReceipt ? localReceipt.manifestationTitle : null,
    publicationConsentAt: localReceipt ? localReceipt.publicationConsentAt : null,
    createdAt: post.created_at,
    updatedAt: post.updated_at || post.created_at,
    syncReason: null,
  };
}

export async function loadCommunityState() {
  const local = await loadLocalCommunityStories();
  const supabase = getClient();
  if (!supabase) return { feed: [], own: local, mode: 'local', reason: 'not_configured' };

  const user = await getAuthenticatedUser(supabase);
  if (!user) return { feed: [], own: local, mode: 'local', reason: 'sign_in_required' };

  try {
    // RLS returns only the caller's own work and posts that moderation published.
    const { data, error } = await supabase
      .from('community_posts')
      .select('id, user_id, body, kind, locale, status, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;

    const receipts = new Map(local.filter((item) => item.remoteId).map((item) => [item.remoteId, item]));
    const posts = (data || []).map((post) => remotePostToItem(post, receipts.get(post.id)));
    const feed = posts.filter((post) => post.status === 'published');
    const cloudOwn = posts.filter((post) => post.userId === user.id);
    const cloudIds = new Set(cloudOwn.map((post) => post.remoteId));
    const own = [...cloudOwn, ...local.filter((item) => !item.remoteId || !cloudIds.has(item.remoteId))];
    return { feed, own, mode: 'cloud', reason: null };
  } catch (error) {
    return { feed: [], own: local, mode: 'local', reason: 'unavailable' };
  }
}

export async function submitCommunityStory(input) {
  const validation = validateCommunityStory(input && input.body);
  if (!validation.ok) {
    const error = new Error(validation.reason);
    error.code = validation.reason;
    throw error;
  }
  if (!input || input.consent !== true) {
    const error = new Error('consent_required');
    error.code = 'consent_required';
    throw error;
  }

  const now = new Date().toISOString();
  const localDraft = {
    id: makeId(),
    remoteId: null,
    body: validation.body,
    status: 'local_draft',
    locale: input.locale === 'en' ? 'en' : 'pt',
    manifestationId: safeText(input.manifestationId, 120) || null,
    manifestationTitle: safeText(input.manifestationTitle, 160) || null,
    publicationConsentAt: now,
    createdAt: now,
    updatedAt: now,
    syncReason: null,
  };

  const supabase = getClient();
  if (!supabase) {
    const item = await upsertLocalCommunityStory({ ...localDraft, syncReason: 'not_configured' });
    return { item, synced: false, reason: 'not_configured' };
  }

  const user = await getAuthenticatedUser(supabase);
  if (!user) {
    const item = await upsertLocalCommunityStory({ ...localDraft, syncReason: 'sign_in_required' });
    return { item, synced: false, reason: 'sign_in_required' };
  }

  try {
    const circle = await findOrJoinCircle(supabase, user.id, input.category);
    if (!circle) {
      const item = await upsertLocalCommunityStory({ ...localDraft, syncReason: 'profile_required' });
      return { item, synced: false, reason: 'profile_required' };
    }

    const { data: created, error: createError } = await supabase
      .from('community_posts')
      .insert({
        user_id: user.id,
        circle_id: circle.id,
        kind: 'celebration',
        body: validation.body,
        locale: localDraft.locale,
        manifestation_ref: localDraft.manifestationId,
        publication_consent_at: now,
      })
      .select('id, content_revision, status, created_at, updated_at')
      .single();
    if (createError || !created) throw createError || new Error('CREATE_FAILED');

    const { data: submitted, error: submitError } = await supabase.rpc('community_submit_post', {
      target_post: created.id,
      expected_revision: created.content_revision,
    });

    const pending = submitted === true && !submitError;
    const item = await upsertLocalCommunityStory({
      ...localDraft,
      remoteId: created.id,
      status: pending ? 'pending' : 'draft',
      createdAt: created.created_at || now,
      updatedAt: created.updated_at || now,
      syncReason: pending ? null : 'submit_failed',
    });
    return { item, synced: pending, reason: pending ? null : 'submit_failed' };
  } catch (error) {
    const item = await upsertLocalCommunityStory({ ...localDraft, syncReason: 'unavailable' });
    return { item, synced: false, reason: 'unavailable' };
  }
}

export async function deleteCommunityStory(item) {
  const localId = safeText(item && item.id, 160);
  const remoteId = safeText(item && item.remoteId, 160);
  if (!localId) return { ok: false, reason: 'invalid_story' };

  if (!remoteId) {
    await removeLocalCommunityStory(localId);
    return { ok: true, remoteDeleted: false };
  }

  const supabase = getClient();
  if (!supabase) return { ok: false, reason: 'not_configured' };
  const user = await getAuthenticatedUser(supabase);
  if (!user) return { ok: false, reason: 'sign_in_required' };

  try {
    const { data, error } = await supabase.rpc('community_delete_own_post', {
      target_post: remoteId,
    });
    if (error || data !== true) return { ok: false, reason: 'delete_unconfirmed' };
    await removeLocalCommunityStory(localId);
    return { ok: true, remoteDeleted: true };
  } catch (error) {
    return { ok: false, reason: 'unavailable' };
  }
}
