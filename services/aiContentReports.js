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

function cleanText(value, maxLength) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
    : '';
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
  const content = cleanText(source.content, 4000);
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
  const message = cleanText(error && error.message, 300).toLowerCase();
  if (message.includes('ai_report_rate_limited')) return 'ai_report_rate_limited';
  if (message.includes('ai_report_identity_required')) return 'ai_report_identity_required';
  if (message.includes('ai_report_invalid')) return 'ai_report_invalid';
  return 'ai_report_unavailable';
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

export async function submitAiContentReport(input, dependencies = {}) {
  const report = normalizeAiContentReport(input);
  const supabase = dependencies.supabase || getCelesteSupabaseClient();
  if (!supabase) throw reportError('ai_report_not_configured');

  try {
    if (dependencies.ensureSession) await dependencies.ensureSession();
    else await ensureReportingSession(supabase);
  } catch (error) {
    throw reportError('ai_report_identity_unavailable', error);
  }

  let response;
  try {
    response = await supabase.rpc('celeste_submit_ai_content_report', {
      p_content_type: report.contentType,
      p_content_ref: report.contentRef,
      p_reason: report.reason,
      p_content_text: report.content,
      p_visual_ref: report.visualRef,
      p_user_note: report.note,
      p_locale: report.lang,
      p_generation_source: report.generation.source,
      p_generation_model: report.generation.model,
      p_prompt_version: report.generation.promptVersion,
      p_platform: report.platform,
      p_app_version: report.appVersion,
    });
  } catch (error) {
    throw reportError('ai_report_unavailable', error);
  }

  if (response && response.error) {
    throw reportError(normalizedRemoteError(response.error), response.error);
  }

  const reportId = cleanText(response && response.data, 80).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(reportId)) {
    throw reportError('ai_report_unavailable');
  }
  return { ok: true, reportId };
}

export const _aiContentReportInternals = {
  cleanText,
  ensureReportingSession,
  normalizedRemoteError,
};
