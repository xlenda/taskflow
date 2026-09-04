import { Platform } from 'react-native';

import { getCelesteSupabaseClient } from './celesteSupabase';

export const AI_REPORT_CONTENT_TYPES = Object.freeze([
  'scene',
  'dream',
  'vision',
  'affirmation',
]);

export const AI_REPORT_REASONS = Object.freeze([
  'unsafe_harmful',
  'hate_harassment',
  'sexual',
  'violence_self_harm',
  'privacy',
  'misleading',
  'other',
]);

const CONTENT_TYPE_SET = new Set(AI_REPORT_CONTENT_TYPES);
const REASON_SET = new Set(AI_REPORT_REASONS);
const REFERENCE_PATTERN = /^[A-Za-z0-9._:-]{1,180}$/;
const VISUAL_REFERENCE_PATTERN = /^[A-Za-z0-9._:-]{1,180}$/;
const APP_VERSION = '1.0.0';
const API_TIMEOUT_MS = 15000;
const PROD_API_URL = 'https://celeste-jet-two.vercel.app';
const REPORT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
    : '';
}

export function normalizeAiReportEvidenceText(value) {
  return cleanText(value, 4000);
}

function cleanReference(value, pattern) {
  const reference = cleanText(value, 180);
  return pattern.test(reference) ? reference : '';
}

function cleanGeneration(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    source: cleanText(source.source, 40) || 'unknown',
    model: cleanText(source.model, 100) || 'unknown',
    promptVersion: cleanText(source.promptVersion, 80) || 'unknown',
  };
}

export function normalizeAiContentReport(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const contentType = CONTENT_TYPE_SET.has(source.contentType) ? source.contentType : '';
  const reason = REASON_SET.has(source.reason) ? source.reason : '';
  const contentRef = cleanReference(source.contentRef, REFERENCE_PATTERN);
  const visualRef = cleanReference(source.visualRef, VISUAL_REFERENCE_PATTERN);
  const content = normalizeAiReportEvidenceText(source.content);
  const note = cleanText(source.note, 500);
  const lang = source.lang === 'en' ? 'en' : 'pt';
  const generation = cleanGeneration(source.generation);
  const platform = ['android', 'ios', 'web'].includes(Platform.OS) ? Platform.OS : 'native';

  if (!contentType) throw new Error('ai_report_content_type_required');
  if (!reason) throw new Error('ai_report_reason_required');
  if (!contentRef) throw new Error('ai_report_reference_required');
  if (!content && !visualRef) throw new Error('ai_report_evidence_required');

  return {
    contentType,
    contentRef,
    reason,
    content,
    visualRef,
    note,
    lang,
    generation,
    platform,
    appVersion: APP_VERSION,
  };
}

function reportError(code, original) {
  const error = new Error(code);
  error.code = code;
  if (original) error.cause = original;
  return error;
}

function normalizedRemoteError(error) {
  const message = cleanText(
    typeof error === 'string' ? error : error && (error.error || error.message),
    300
  ).toLowerCase();
  if (message.includes('ai_report_rate_limited')) return 'ai_report_rate_limited';
  if (message.includes('identity')) return 'ai_report_identity_required';
  if (message.includes('ai_report_invalid')) return 'ai_report_invalid';
  if (message.includes('ai_report_not_configured')) return 'ai_report_not_configured';
  return 'ai_report_unavailable';
}

function apiEndpoint() {
  const configured = cleanText(process.env.EXPO_PUBLIC_CELESTE_API_URL, 500).replace(/\/$/, '');
  if (configured) return `${configured}/api/denunciar-conteudo-ia`;
  if (typeof window !== 'undefined' && window.location) return '/api/denunciar-conteudo-ia';
  return `${PROD_API_URL}/api/denunciar-conteudo-ia`;
}

function reportingPlatform() {
  return ['android', 'ios', 'web'].includes(Platform.OS) ? Platform.OS : 'native';
}

async function ensureReportingSession(supabase) {
  // Reporting is a safety channel, not a paid generation capability. It must
  // remain available in the Android/iOS store build while those generation
  // APIs stay closed until Play Integrity / App Attest is verified end to end.
  const { data: current, error: currentError } = await supabase.auth.getSession();
  if (currentError) throw currentError;
  if (current && current.session && current.session.access_token) return current.session;

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data || !data.session || !data.session.access_token) {
    throw error || new Error('ai_report_identity_unavailable');
  }
  return data.session;
}

async function reportingSession(dependencies, allowAnonymousSignIn) {
  if (cleanText(dependencies.accessToken, 4096)) {
    return { access_token: cleanText(dependencies.accessToken, 4096) };
  }
  if (allowAnonymousSignIn && dependencies.ensureSession) return dependencies.ensureSession();
  const supabase = dependencies.supabase || getCelesteSupabaseClient();
  if (!supabase) throw reportError('ai_report_not_configured');
  if (allowAnonymousSignIn) return ensureReportingSession(supabase);
  const getSession = dependencies.getSession || (() => supabase.auth.getSession());
  const { data, error } = await getSession();
  if (error) throw error;
  return data && data.session && data.session.access_token ? data.session : null;
}

async function responsePayload(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

async function requestReportApi(method, report, dependencies) {
  let session;
  try {
    session = await reportingSession(dependencies, method === 'POST');
  } catch (error) {
    if (error && error.code === 'ai_report_not_configured') throw error;
    throw reportError('ai_report_identity_unavailable', error);
  }
  if (!session && method === 'DELETE') return null;
  const accessToken = cleanText(session && session.access_token, 4096);
  if (!accessToken) throw reportError('ai_report_identity_unavailable');

  const request =
    dependencies.fetchImpl ||
    dependencies.fetch ||
    (typeof fetch === 'function' ? fetch : null);
  if (!request) throw reportError('ai_report_unavailable');

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), API_TIMEOUT_MS) : null;
  let response;
  try {
    response = await request(apiEndpoint(), {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Celeste-Client': report && report.platform
          ? report.platform
          : reportingPlatform(),
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
      ...(method === 'POST' ? { body: JSON.stringify(report) } : {}),
    });
  } catch (error) {
    throw reportError('ai_report_unavailable', error);
  } finally {
    if (timer) clearTimeout(timer);
  }

  if (!response || !response.ok) {
    const payload = response ? await responsePayload(response) : null;
    throw reportError(normalizedRemoteError(payload));
  }
  return response;
}

export async function submitAiContentReport(input, dependencies = {}) {
  const report = normalizeAiContentReport(input);
  const response = await requestReportApi('POST', report, dependencies);
  const payload = await responsePayload(response);
  const reportId = cleanText(payload && payload.reportId, 80).toLowerCase();
  if (
    !payload ||
    payload.ok !== true ||
    typeof payload.duplicate !== 'boolean' ||
    !REPORT_ID_PATTERN.test(reportId)
  ) {
    throw reportError('ai_report_unavailable');
  }
  return { ok: true, reportId, duplicate: payload.duplicate };
}

export async function deleteAllAiContentReports(dependencies = {}) {
  const response = await requestReportApi('DELETE', null, dependencies);
  if (!response) return { ok: true, nothingToDelete: true };
  if (response.status !== 204) throw reportError('ai_report_unavailable');
  return { ok: true };
}

export const _aiContentReportInternals = {
  apiEndpoint,
  cleanText,
  ensureReportingSession,
  normalizedRemoteError,
  requestReportApi,
};
