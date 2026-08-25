import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { pickVoiceURI, getVoiceAsync, TOM } from './voicePicker';
import { DEFAULT_NARRATOR_ID, narratorById } from '../constants/narrators';

// Todo texto narrado pelo produto e pessoal. Enquanto a narracao dinamica em
// nuvem nao estiver contratualmente habilitada, apenas uma voz que o aparelho
// identifica como local pode receber esse conteudo.
//
// Contratos:
// - speak() sempre para o que estiver tocando antes de começar.
// - E sincrona de proposito: o Safari so autoriza audio nascido direto de um
//   gesto do usuário, e qualquer `await` antes de iniciar quebra essa cadeia.
// - onDone dispara no fim natural; parar manualmente NÃO chama onDone.

export function isSpeechAvailable() {
  if (Platform.OS !== 'web') return true;
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopSpeaking() {
  try {
    Speech.stop();
  } catch (e) {
    // navegador sem suporte — silêncio é o fallback honesto
  }
}

export function speak(
  text,
  {
    lang = 'pt',
    narratorId = DEFAULT_NARRATOR_ID,
    rate,
    pitch,
    localOnly = false,
    onDone,
    onError,
  } = {}
) {
  const body = String(text || '').trim();
  if (!body) return false;
  if (!isSpeechAvailable()) {
    onError && onError(new Error('speech-unavailable'));
    return false;
  }
  // expo-speech não informa se uma voz nativa processa o texto offline. Sem
  // essa evidência, não enviamos uma história pessoal para o sintetizador.
  if (localOnly && Platform.OS !== 'web') {
    onError && onError(new Error('local-speech-unverified'));
    return false;
  }
  stopSpeaking();
  const tom = TOM[lang] || TOM.en;
  const localTone = narratorById(narratorId).localTone || {};
  const opts = {
    language: lang === 'pt' ? 'pt-BR' : 'en-US',
    rate: rate != null ? rate : localTone.rate || tom.rate,
    pitch: pitch != null ? pitch : localTone.pitch || tom.pitch,
    onDone: () => onDone && onDone(),
    onError: (e) => onError && onError(e),
  };
  // O expo-speech web casa por voiceURI (não por nome) e, se não achar, cai
  // silenciosamente na PRIMEIRA voz do sistema — geralmente feminina. Passar o
  // URI é o que garante a voz masculina escolhida.
  if (Platform.OS === 'web') {
    const uri = pickVoiceURI(lang, { localOnly, narratorId });
    if (localOnly && !uri) {
      onError && onError(new Error('local-speech-unavailable'));
      return false;
    }
    if (uri) opts.voice = uri;
  }
  try {
    Speech.speak(body, opts);
    return true;
  } catch (e) {
    onError && onError(e);
    return false;
  }
}

export function narrate(_id, text, opts = {}) {
  return speak(text, opts) ? 'device' : false;
}

// Aquece a lista de vozes cedo, para o primeiro toque já sair com a voz certa.
export function warmUpVoices(lang = 'pt', options = {}) {
  if (Platform.OS === 'web') getVoiceAsync(lang, 1500, options).catch(() => {});
}

// Quebra um roteiro longo em falas curtas para o player acompanhar o progresso
// frase a frase e permitir avançar/voltar.
export function splitScript(text) {
  return String(text || '')
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
