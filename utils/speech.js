import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { audioUrl } from './audioBank';
import { pickVoiceURI, getVoiceAsync, TOM } from './voicePicker';

// Narração do app, em duas camadas:
//
// 1. ÁUDIO NEURAL PRÉ-GERADO (voz Grady, escolhida pelo dono em 09/08). O texto
//    do conteúdo fixo — afirmações e visões — tem MP3 pronto em /audio/<lang>/.
//    Toca instantâneo, soa como locução de verdade e não custa nada por play.
// 2. VOZ DO SISTEMA (Web Speech / expo-speech) para conteúdo fixo sem MP3.
//    Histórias pessoais usam `localOnly`: no navegador, só uma voz marcada
//    explicitamente como local; no app nativo, onde essa prova não existe,
//    mantemos o texto e recusamos a narração.
//
// Contratos:
// - speak/playId SEMPRE param o que estiver tocando antes de começar.
// - São SÍNCRONAS de propósito: o Safari só autoriza áudio nascido direto de um
//   gesto do usuário, e qualquer `await` antes de iniciar quebra essa cadeia.
// - onDone dispara no fim natural; parar manualmente NÃO chama onDone.

let currentAudio = null; // HTMLAudioElement em uso na web

export function isSpeechAvailable() {
  if (Platform.OS !== 'web') return true;
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopSpeaking() {
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.onended = null;
      currentAudio.onerror = null;
    } catch (e) {}
    currentAudio = null;
  }
  try {
    Speech.stop();
  } catch (e) {
    // navegador sem suporte — silêncio é o fallback honesto
  }
}

// Toca o áudio neural de um item do conteúdo (ex.: 'a-1', 'v-3').
// Devolve false quando não há arquivo para esse id/idioma — quem chama então
// cai em speak() com a voz do aparelho.
export function playId(id, { lang = 'pt', onDone, onError } = {}) {
  if (Platform.OS !== 'web' || typeof Audio === 'undefined') return false;
  const url = audioUrl(id, lang);
  if (!url) return false;
  stopSpeaking();
  try {
    const el = new Audio(url);
    el.preload = 'auto';
    el.onended = () => {
      currentAudio = null;
      onDone && onDone();
    };
    el.onerror = () => {
      currentAudio = null;
      onError && onError(new Error('audio-failed'));
    };
    currentAudio = el;
    const p = el.play();
    if (p && p.catch) p.catch(() => onError && onError(new Error('autoplay-blocked')));
    return true;
  } catch (e) {
    currentAudio = null;
    return false;
  }
}

export function hasNeuralAudio(id, lang = 'pt') {
  return !!audioUrl(id, lang);
}

export function speak(text, { lang = 'pt', rate, pitch, localOnly = false, onDone, onError } = {}) {
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
  const opts = {
    language: lang === 'pt' ? 'pt-BR' : 'en-US',
    rate: rate != null ? rate : tom.rate,
    pitch: pitch != null ? pitch : tom.pitch,
    onDone: () => onDone && onDone(),
    onError: (e) => onError && onError(e),
  };
  // O expo-speech web casa por voiceURI (não por nome) e, se não achar, cai
  // silenciosamente na PRIMEIRA voz do sistema — geralmente feminina. Passar o
  // URI é o que garante a voz masculina escolhida.
  if (Platform.OS === 'web') {
    const uri = pickVoiceURI(lang, { localOnly });
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

// Catálogo fixo usa arquivo gravado. Chamadores com texto pessoal precisam
// passar `localOnly: true`; nada entra em endpoint, URL ou cache da Celeste.
export function narrate(id, text, opts = {}) {
  if (id && playId(id, opts)) return 'neural';
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
