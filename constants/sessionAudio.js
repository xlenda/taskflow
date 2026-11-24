// GERADO por scripts/gerar-audio-sessao.js - nao editar. Um require() literal por MP3 existente.
const CLIPS = {};

// modulo do require() do clipe, ou null (o app cai na voz do aparelho)
export function sessionClipModule(narratorId, lang, clipId) {
  return CLIPS[`${narratorId}/${lang}/${clipId}`] || null;
}
