import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../ui/theme';
import { alpha } from '../utils/colors';
import { submitAiContentReport } from '../services/aiContentReports';

const COPY = {
  pt: {
    action: 'Denunciar este conteúdo de IA',
    title: 'Denunciar conteúdo de IA',
    intro:
      'Escolha o problema. Enviaremos somente este conteúdo gerado, o motivo e a nota abaixo. Suas respostas originais e o relato do sonho não serão enviados.',
    preview: 'Conteúdo que será analisado',
    note: 'Detalhes adicionais (opcional)',
    notePlaceholder: 'Explique brevemente o problema, sem incluir dados pessoais.',
    cancel: 'Cancelar',
    send: 'Enviar denúncia',
    sending: 'Enviando…',
    sentTitle: 'Denúncia enviada',
    sentBody: 'Obrigada. O conteúdo foi encaminhado para análise.',
    done: 'Concluir',
    retry: 'Tentar novamente',
    error: 'A denúncia não foi enviada. Verifique a conexão e tente novamente.',
    rate: 'O limite de denúncias deste período foi atingido. Tente novamente mais tarde.',
    reasons: {
      unsafe_harmful: 'Perigoso ou prejudicial',
      hate_harassment: 'Ódio ou assédio',
      sexual: 'Sexual ou impróprio',
      violence_self_harm: 'Violência ou automutilação',
      privacy: 'Expõe informação pessoal',
      misleading: 'Enganoso ou incorreto',
      other: 'Outro problema',
    },
  },
  en: {
    action: 'Report this AI content',
    title: 'Report AI content',
    intro:
      'Choose the problem. We will send only this generated content, the reason, and your note below. Your original answers and dream report will not be sent.',
    preview: 'Content that will be reviewed',
    note: 'Additional details (optional)',
    notePlaceholder: 'Briefly explain the problem without adding personal information.',
    cancel: 'Cancel',
    send: 'Send report',
    sending: 'Sending…',
    sentTitle: 'Report sent',
    sentBody: 'Thank you. The content was sent for review.',
    done: 'Done',
    retry: 'Try again',
    error: 'The report was not sent. Check your connection and try again.',
    rate: 'The reporting limit for this period was reached. Try again later.',
    reasons: {
      unsafe_harmful: 'Dangerous or harmful',
      hate_harassment: 'Hate or harassment',
      sexual: 'Sexual or inappropriate',
      violence_self_harm: 'Violence or self-harm',
      privacy: 'Exposes personal information',
      misleading: 'Misleading or incorrect',
      other: 'Another problem',
    },
  },
};

const REASONS = [
  'unsafe_harmful',
  'hate_harassment',
  'sexual',
  'violence_self_harm',
  'privacy',
  'misleading',
  'other',
];

function previewText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > 360 ? `${text.slice(0, 357)}…` : text;
}

export default function AiContentReportAction({
  contentType,
  contentRef,
  content,
  visualRef,
  generation,
  lang = 'pt',
  style,
}) {
  const theme = useTheme();
  const copy = COPY[lang === 'en' ? 'en' : 'pt'];
  const [visible, setVisible] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('idle');
  const [errorCode, setErrorCode] = useState('');
  const submittingRef = useRef(false);
  const preview = previewText(content);

  const open = () => {
    setReason('');
    setNote('');
    setStatus('idle');
    setErrorCode('');
    setVisible(true);
  };

  const close = () => {
    if (submittingRef.current) return;
    setVisible(false);
  };

  const submit = async () => {
    if (!reason || submittingRef.current) return;
    submittingRef.current = true;
    setStatus('submitting');
    setErrorCode('');
    try {
      await submitAiContentReport({
        contentType,
        contentRef,
        content,
        visualRef,
        generation,
        reason,
        note,
        lang,
      });
      setStatus('sent');
    } catch (error) {
      setErrorCode(error && (error.code || error.message));
      setStatus('error');
    } finally {
      submittingRef.current = false;
    }
  };

  const errorText = errorCode === 'ai_report_rate_limited' ? copy.rate : copy.error;

  return (
    <>
      <Pressable
        testID={`ai-report-open-${contentType}`}
        accessibilityRole="button"
        accessibilityLabel={copy.action}
        onPress={open}
        style={({ pressed }) => [
          styles.action,
          { borderColor: theme.border },
          pressed && styles.pressed,
          style,
        ]}
      >
        <Ionicons name="flag-outline" size={16} color={theme.textMuted} />
        <Text style={[styles.actionText, { color: theme.textMuted }]}>{copy.action}</Text>
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
          style={styles.backdrop}
        >
          <View
            testID="ai-report-dialog"
            accessibilityViewIsModal
            style={[styles.dialog, { backgroundColor: theme.surface, borderColor: theme.border }]}
          >
            {status === 'sent' ? (
              <View accessibilityLiveRegion="polite" style={styles.sentWrap}>
                <View style={[styles.sentIcon, { backgroundColor: alpha(theme.accent, 0.12) }]}>
                  <Ionicons name="checkmark-circle" size={28} color={theme.accent} />
                </View>
                <Text style={[styles.title, { color: theme.text }]}>{copy.sentTitle}</Text>
                <Text style={[styles.centerText, { color: theme.textMuted }]}>{copy.sentBody}</Text>
                <Pressable
                  testID="ai-report-done"
                  accessibilityRole="button"
                  onPress={close}
                  style={[styles.primaryButton, styles.sentButton, { backgroundColor: theme.accent }]}
                >
                  <Text style={[styles.primaryButtonText, styles.sentButtonText]}>{copy.done}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View style={styles.header}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.text }]}>{copy.title}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={copy.cancel}
                    disabled={status === 'submitting'}
                    hitSlop={10}
                    onPress={close}
                    style={({ pressed }) => [styles.close, pressed && styles.pressed]}
                  >
                    <Ionicons name="close" size={22} color={theme.textMuted} />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.scrollView}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.scroll}
                >
                  <Text style={[styles.body, { color: theme.textMuted }]}>{copy.intro}</Text>

                  {preview ? (
                    <View style={[styles.preview, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}>
                      <Text style={[styles.previewLabel, { color: theme.textMuted }]}>{copy.preview}</Text>
                      <Text style={[styles.previewText, { color: theme.text }]}>{preview}</Text>
                    </View>
                  ) : null}

                  <View accessibilityRole="radiogroup" style={styles.reasons}>
                    {REASONS.map((key) => {
                      const selected = reason === key;
                      return (
                        <Pressable
                          key={key}
                          testID={`ai-report-reason-${key}`}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          onPress={() => {
                            setReason(key);
                            if (status === 'error') setStatus('idle');
                          }}
                          style={({ pressed }) => [
                            styles.reason,
                            {
                              borderColor: selected ? theme.accent : theme.border,
                              backgroundColor: selected ? alpha(theme.accent, 0.08) : theme.surface,
                            },
                            pressed && styles.pressed,
                          ]}
                        >
                          <Ionicons
                            name={selected ? 'radio-button-on' : 'radio-button-off'}
                            size={20}
                            color={selected ? theme.accent : theme.textMuted}
                          />
                          <Text style={[styles.reasonText, { color: theme.text }]}>{copy.reasons[key]}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Text style={[styles.noteLabel, { color: theme.text }]}>{copy.note}</Text>
                  <TextInput
                    testID="ai-report-note"
                    value={note}
                    onChangeText={setNote}
                    editable={status !== 'submitting'}
                    multiline
                    maxLength={500}
                    placeholder={copy.notePlaceholder}
                    placeholderTextColor={alpha(theme.textMuted, 0.7)}
                    style={[
                      styles.note,
                      { color: theme.text, borderColor: theme.border, backgroundColor: theme.surfaceAlt },
                    ]}
                  />

                  {status === 'error' ? (
                    <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
                      {errorText}
                    </Text>
                  ) : null}
                </ScrollView>

                <View style={[styles.footer, { borderTopColor: theme.border }]}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={status === 'submitting'}
                    onPress={close}
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      { borderColor: theme.border },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.secondaryButtonText, { color: theme.textMuted }]}>{copy.cancel}</Text>
                  </Pressable>
                  <Pressable
                    testID="ai-report-submit"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !reason || status === 'submitting', busy: status === 'submitting' }}
                    disabled={!reason || status === 'submitting'}
                    onPress={submit}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: theme.accent },
                      (!reason || status === 'submitting') && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {status === 'submitting' ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Ionicons name="flag" size={16} color="#FFFFFF" />
                    )}
                    <Text style={styles.primaryButtonText}>
                      {status === 'submitting' ? copy.sending : status === 'error' ? copy.retry : copy.send}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  action: {
    minHeight: 42,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  actionText: { fontSize: 12.5, lineHeight: 18, fontWeight: '600', marginLeft: 7 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 13, 25, 0.68)',
    padding: 18,
  },
  dialog: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    borderWidth: 1,
    borderRadius: 22,
    overflow: 'hidden',
  },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingBottom: 10 },
  title: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
  close: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 20, paddingBottom: 18 },
  scrollView: { flexShrink: 1 },
  body: { fontSize: 13.5, lineHeight: 20 },
  preview: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 14 },
  previewLabel: { fontSize: 11, lineHeight: 16, fontWeight: '700', textTransform: 'uppercase' },
  previewText: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  reasons: { marginTop: 14 },
  reason: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  reasonText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '600', marginLeft: 9 },
  noteLabel: { fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 8, marginBottom: 7 },
  note: {
    minHeight: 88,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  error: { fontSize: 12.5, lineHeight: 18, fontWeight: '600', marginTop: 10 },
  footer: { flexDirection: 'row', borderTopWidth: 1, padding: 14, gap: 10 },
  secondaryButton: {
    minHeight: 46,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  primaryButton: {
    minHeight: 46,
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginLeft: 7 },
  sentButton: { flex: 0, width: '100%', maxWidth: 260 },
  sentButtonText: { marginLeft: 0 },
  sentWrap: { alignItems: 'center', padding: 26 },
  sentIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  centerText: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 20 },
});
