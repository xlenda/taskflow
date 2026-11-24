// Sessão de 7 minutos: o roteiro que o motor do despertar toca, o tempo dele e o registro do dia.
// Quem segura os 7 minutos é o silêncio depois da Cena-Âncora (a mola): o resto tem tempo fixo.
import { SESSION_GUIDE } from '../constants/sessionGuide';
import { WEEKLY_JOURNEYS } from '../constants/weeklyJourneys';
import { CHARS_PER_SECOND } from './captionProgress';
import { bridgeDoneOn, normalizeLivingMirror } from './livingMirror';
import { personalAffirmationsForState } from './personalAffirmations';
import { anchorManifestationForState } from './personalJourney';
import { wakeSequenceOptionsForState } from './wakeSequence';
import { daysSinceEpoch, journeyForDay } from './weeklyJourney';

export const SESSION_TARGET_SECONDS = 420;
export const SESSION_PAUSE_MS = { breath: 60000, desire: 20000, affirmation: 20000, journey: 30000, bridge: 30000 };
export const SCENE_PAUSE_RANGE_MS = [30000, 120000];
export const SESSION_AFFIRMATIONS = 3;
export const SESSION_AFFIRMATION_POOL = 12;

const GAP_SECONDS = 0.9; // respiro do motor entre itens sem pausa (GAP_MS de WakeSequenceScreen)

// Rótulo do que fica parado na tela durante a pausa.
const STILL_LABELS = {
  breath: { pt: 'Respire', en: 'Breathe' },
  desire: { pt: 'Seu desejo', en: 'Your desire' },
  scene: { pt: 'Fique nesta cena', en: 'Stay in this scene' },
  affirmation: { pt: 'Repita baixinho', en: 'Say it softly' },
  journey: { pt: 'Afirmação da semana', en: "This week's affirmation" },
  bridge: { pt: 'Seu passo de hoje', en: 'Your step for today' },
};

/** Roda pela data, nada de sorteio: com n > count começa em (dias desde 1970 × count) mod n. */
export function pickDailyAffirmations(pool, dayISO, count = SESSION_AFFIRMATIONS) {
  const list = Array.isArray(pool) ? pool : [];
  const n = list.length;
  if (n <= count) return [...list];
  const start = ((daysSinceEpoch(dayISO) || 0) * count) % n;
  return Array.from({ length: count }, (_, i) => list[(start + i) % n]);
}

/** Falas a 14 letras/s + pausas + o respiro do motor em cada item sem pausa (menos o último). */
export function sessionSeconds(items) {
  const list = Array.isArray(items) ? items : [];
  return list.reduce((total, item, index) => {
    const speech = (item && typeof item.text === 'string' ? item.text.length : 0) / CHARS_PER_SECOND;
    const rest =
      item && typeof item.pauseMs === 'number' ? item.pauseMs / 1000 : index < list.length - 1 ? GAP_SECONDS : 0;
    return total + speech + rest;
  }, 0);
}

const guide = (clip, lang, extra) => ({
  kind: 'guide',
  id: `guide:${clip}`,
  title: '',
  text: SESSION_GUIDE[clip][lang],
  lang,
  clipId: clip,
  ...extra,
});

const textStill = (key, text) => ({ kind: 'text', label: STILL_LABELS[key], text });

/** Itens da sessão na ordem em que tocam; [] sem Cena-Âncora. `journeys` só muda em teste. */
export function sessionItemsForState(state, lang, dayISO, journeys = WEEKLY_JOURNEYS) {
  // A mesma opção do despertar: mesmo id, mesma história, mesma imagem.
  const anchor = wakeSequenceOptionsForState(state, lang).find((option) => option.kind === 'anchor');
  if (!anchor) return [];
  const L = lang === 'en' ? 'en' : 'pt';
  const manifestation = anchorManifestationForState(state);
  const desire = (typeof manifestation.title === 'string' && manifestation.title.trim()) || anchor.title;
  const journey = journeyForDay(dayISO, journeys);
  const affirmations = pickDailyAffirmations(
    personalAffirmationsForState(state).slice(0, SESSION_AFFIRMATION_POOL),
    dayISO
  );
  const scene = { ...anchor, pauseMs: 0, still: { kind: 'scene', label: STILL_LABELS.scene } };

  const items = [
    guide('breath', L, { pauseMs: SESSION_PAUSE_MS.breath, still: { kind: 'breath', label: STILL_LABELS.breath } }),
    guide('desire', L),
    {
      kind: 'desire',
      id: `desire:${anchor.manifestationId}`,
      title: desire,
      text: desire,
      lang: anchor.lang,
      pauseMs: SESSION_PAUSE_MS.desire,
      still: textStill('desire', desire),
    },
    guide('scene', L),
    scene,
    guide('affirm', L),
    ...affirmations.map((item) => ({
      kind: 'affirmation',
      id: item.id,
      title: item.text,
      text: item.text,
      lang: item.lang,
      pauseMs: SESSION_PAUSE_MS.affirmation,
      still: textStill('affirmation', item.text),
    })),
    ...(journey
      ? [{
          kind: 'journey',
          id: `journey:${journey.clipId}`,
          title: journey.theme.title[L],
          text: journey.day.line[L],
          lang: L,
          clipId: journey.clipId,
          pauseMs: SESSION_PAUSE_MS.journey,
          still: textStill('journey', journey.day.affirmation[L]),
        }]
      : []),
    guide('bridge', L, {
      pauseMs: SESSION_PAUSE_MS.bridge,
      ...(journey && { still: textStill('bridge', journey.day.action[L]) }),
    }),
    guide('close', L),
  ];

  // Mola: o silêncio da cena completa os 420 s, entre 30 e 120 s.
  const [minMs, maxMs] = SCENE_PAUSE_RANGE_MS;
  const restMs = Math.round((SESSION_TARGET_SECONDS - sessionSeconds(items)) * 1000);
  scene.pauseMs = Math.min(maxMs, Math.max(minMs, restMs));
  return items;
}

/**
 * Registro do dia numa transformação só, na manifestação âncora: marca a prática (como logSession), a ponte com a
 * micro-ação do dia (formato de toggleBridgeCompletion; uma por dia) e a nota (formato de addEvidence).
 * Sem âncora devolve o mesmo state.
 */
export function applyGuidedSessionDone(state, { day, note, bridge, now } = {}) {
  const anchor = anchorManifestationForState(state);
  if (!anchor) return state;
  const journey = journeyForDay(day);
  const step =
    bridge === true && journey && !bridgeDoneOn(anchor, day) ? journey.day.action[state.lang === 'en' ? 'en' : 'pt'] : '';
  const body = String(note || '').trim().slice(0, 280);

  const manifestations = state.manifestations.map((m) => {
    if (m !== anchor) return m;
    const sessions = m.sessions.includes(day) ? m.sessions : [...m.sessions, day];
    const next = { ...m, sessions };
    if (!m.completedAt && sessions.length >= m.goalDays) next.completedAt = day;
    if (step) {
      const mirror = normalizeLivingMirror(m.livingMirror);
      next.livingMirror = {
        ...mirror,
        bridgeCompletions: [
          { id: `bridge-${m.id}-${mirror.chapter}-${day}`, date: day, step, chapter: mirror.chapter, completedAt: now },
          ...mirror.bridgeCompletions,
        ].slice(0, 90),
      };
    }
    if (body) {
      next.evidence = [
        { id: `e-${Date.parse(now)}`, text: body, createdAt: now },
        ...(Array.isArray(m.evidence) ? m.evidence : []),
      ];
    }
    return next;
  });
  return { ...state, manifestations, guidedSession: { ...state.guidedSession, lastDoneOn: day } };
}
