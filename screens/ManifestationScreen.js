import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import { Screen, Header, Card, pct } from '../ui/kit';
import { confirmAsync } from '../utils/confirm';
import { useTheme } from '../ui/theme';
import { useApp } from '../context/AppContext';
import { categoryMeta, localized, FOR_YOU, findForYouById } from '../constants/content';
import { txt } from '../constants/i18n';
import { useT } from '../utils/useT';
import { accentAt, alpha } from '../utils/colors';
import { todayISO, formatTime, lastNDays } from '../utils/date';
import {
  speak,
  narrate,
  stopSpeaking,
  isSpeechAvailable,
  hasNeuralAudio,
  splitScript,
} from '../utils/speech';
import { audioDur } from '../utils/audioBank';
import {
  DEFAULT_AFFIRMATION_ALARM_ID,
  cancelAffirmationAlarm,
  getAffirmationAlarmCapability,
  scheduleAffirmationAlarm,
} from '../services/affirmationAlarm';

import GradientCover from '../components/GradientCover';
import PrimaryButton from '../components/PrimaryButton';
import SectionHeading from '../components/SectionHeading';

// Dicionário local da tela (padrão useT: t(S.chave) / t(S.chave, { vars })).
const S = {
  screenTitle: { en: 'Manifestation', pt: 'Manifestação' },
  gone: { en: 'This manifestation is no longer here.', pt: 'Esta manifestação não está mais aqui.' },
  goBack: { en: 'Go back', pt: 'Voltar' },

  startedOn: {
    en: 'Started {date} · day {day} of {goal}',
    pt: 'Começou em {date} · dia {day} de {goal}',
  },
  suggested: {
    en: 'Suggested for you · {goal} day practice',
    pt: 'Escolhida para você · prática de {goal} dias',
  },

  progressTitle: { en: 'Practice progress', pt: 'Sua constância' },
  daysDone: { en: '{done} of {goal} days', pt: '{done} de {goal} dias' },

  audioTitle: { en: 'Your audio narrative', pt: 'Sua narrativa em áudio' },
  hintEyes: { en: 'Listen with your eyes closed.', pt: 'Ouça de olhos fechados.' },
  hintLogs: {
    en: 'Finishing the narrative logs today’s practice.',
    pt: 'Ao chegar ao fim da narrativa, o dia entra na sua prática.',
  },
  nowPlaying: { en: 'Sentence {i} of {n}', pt: 'Frase {i} de {n}' },
  playingAll: { en: 'Playing the recorded narrative', pt: 'Tocando a narrativa gravada' },
  noVoice: {
    en: 'Your device has no voice available — read the story slowly, out loud.',
    pt: 'Seu aparelho não tem voz disponível — leia a história devagar, em voz alta.',
  },
  listen: { en: 'Listen to the narrative', pt: 'Ouvir a narrativa' },
  pause: { en: 'Pause the narrative', pt: 'Pausar a narrativa' },
  stop: { en: 'Stop the narrative', pt: 'Parar a narrativa' },
  audioFail: {
    en: 'The narration did not play here — read the story below at your own pace.',
    pt: 'A narração não tocou aqui — leia a história abaixo no seu ritmo.',
  },
  prevLine: { en: 'Previous sentence', pt: 'Frase anterior' },
  nextLine: { en: 'Next sentence', pt: 'Próxima frase' },

  ritual: { en: 'Daily ritual', pt: 'Ritual diário' },
  step1: { en: 'Read the affirmation out loud', pt: 'Leia a afirmação em voz alta' },
  step1Note: { en: 'Morning', pt: 'De manhã' },
  step2: { en: 'Step into the narrative for 3 minutes', pt: 'Entre na narrativa por 3 minutos' },
  step2Note: { en: 'Anytime', pt: 'A qualquer hora' },
  step3: { en: 'Fall asleep replaying one detail', pt: 'Adormeça revivendo um detalhe' },
  step3Note: { en: 'Night', pt: 'À noite' },

  practiceDone: { en: 'Today’s practice complete', pt: 'Prática de hoje concluída' },
  markPractice: { en: 'Mark today’s practice', pt: 'Marcar a prática de hoje' },
  startThis: { en: 'Start this manifestation', pt: 'Começar esta manifestação' },

  undoTitle: { en: 'Undo today’s practice?', pt: 'Desfazer a prática de hoje?' },
  undoBody: {
    en: 'Today will no longer count as practised for this manifestation.',
    pt: 'Hoje deixa de contar como praticado nesta manifestação.',
  },
  undoConfirm: { en: 'Undo', pt: 'Desfazer' },
  keep: { en: 'Keep it', pt: 'Manter' },

  releaseTitle: { en: 'Release this manifestation?', pt: 'Deixar esta manifestação ir?' },
  releaseBody: {
    en: 'Its practice history and {n} private traces will be permanently removed.',
    pt: 'O histórico de prática e {n} Rastros privados serão apagados para sempre.',
  },
  releaseConfirm: { en: 'Release', pt: 'Deixar ir' },
  releaseAction: { en: 'Release this manifestation', pt: 'Deixar esta manifestação ir' },
  releaseAlarmFailed: {
    en: 'The manifestation was kept because its alarm could not be turned off. Try again.',
    pt: 'A manifestação foi mantida porque o despertador não pôde ser desligado. Tente novamente.',
  },
  editAlarmFailed: {
    en: 'The change was not saved because the alarm could not be updated. Try again.',
    pt: 'A alteração não foi salva porque o despertador não pôde ser atualizado. Tente novamente.',
  },

  storyTitle: { en: 'Your story', pt: 'Sua história' },

  // Recibo do dia feito — números vêm do estado, nunca inventados.
  receipt: {
    en: 'Done — day {done} logged ✓ · {done} of {goal}',
    pt: 'Pronto — dia {done} registrado ✓ · {done} de {goal}',
  },
  constancyInvite: {
    en: 'Your first practice opens your constancy record here.',
    pt: 'Sua primeira prática abre aqui o seu registro de constância.',
  },
  completedBanner: { en: '{goal} of {goal} — cycle complete', pt: '{goal} de {goal} — ciclo concluído' },

  markDayTitle: { en: 'Mark the practice for {date}?', pt: 'Marcar a prática de {date}?' },
  unmarkDayTitle: { en: 'Undo the practice for {date}?', pt: 'Desfazer a prática de {date}?' },
  markConfirm: { en: 'Mark', pt: 'Marcar' },

  edit: { en: 'Edit title, affirmation and bridge', pt: 'Editar título, afirmação e ponte' },
  editTitle: { en: 'Title', pt: 'Título' },
  editAffirmation: { en: 'Affirmation', pt: 'Afirmação' },
  editStep: { en: 'Bridge to today', pt: 'Ponte para hoje' },
  anchorTitle: { en: 'Your bridge to today', pt: 'Sua ponte para hoje' },
  anchorNote: {
    en: 'A small action you control. You can edit it with the pencil above.',
    pt: 'Uma ação pequena que está nas suas mãos. Você pode editá-la no lápis acima.',
  },
  evidenceTitle: { en: 'Traces of change', pt: 'Rastros de mudança' },
  evidencePrompt: {
    en: 'What happened, did not happen, or would you like to adjust?',
    pt: 'O que aconteceu, não aconteceu ou você quer ajustar?',
  },
  evidencePlaceholder: {
    en: 'Write an honest observation, including when nothing changed…',
    pt: 'Registre uma observação honesta, inclusive quando nada mudou…',
  },
  evidenceSave: { en: 'Save this trace', pt: 'Guardar este rastro' },
  evidenceSaved: { en: 'Saved in your private journey.', pt: 'Guardado na sua jornada privada.' },
  save: { en: 'Save', pt: 'Salvar' },
  cancel: { en: 'Cancel', pt: 'Cancelar' },
};

// Rótulo das categorias (a chave guardada continua em inglês — é ela que liga
// ícone, cor e filtro; só o texto na tela muda de idioma).
const CAT = {
  Love: { en: 'Love', pt: 'Amor' },
  Wealth: { en: 'Wealth', pt: 'Prosperidade' },
  Career: { en: 'Career', pt: 'Carreira' },
  Health: { en: 'Health', pt: 'Saúde' },
  Confidence: { en: 'Confidence', pt: 'Confiança' },
  Peace: { en: 'Peace', pt: 'Paz' },
};

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
};

const WEEK_LETTERS = {
  en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
  pt: ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'],
};

// Sem áudio gravado: a narração é a voz do aparelho (utils/speech). A barra usa
// uma estimativa de ~140 palavras/min (rate 0.82) só para acompanhar a leitura —
// e por ser estimativa o tempo total NÃO aparece na tela (só quem tem MP3 mostra
// duração, que aí vem medida do arquivo).
const SECONDS_PER_WORD = 0.42;
const FALLBACK_SECONDS = 168;

const estimateSeconds = (text) => {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (!words) return FALLBACK_SECONDS;
  return Math.max(40, Math.round(words * SECONDS_PER_WORD));
};

const categoryLabel = (key, lang) => txt(CAT[key], lang) || String(key || '');

// Comparação de texto para reconhecer a mesma sugestão (caixa e espaço nas
// pontas não contam).
const norm = (s) => String(s || '').trim().toLowerCase();

const prettyDateIn = (iso, lang) => {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  const months = MONTHS[lang] || MONTHS.en;
  return lang === 'pt' ? `${d.getDate()} de ${months[d.getMonth()]}` : `${months[d.getMonth()]} ${d.getDate()}`;
};

const weekdayLetterIn = (iso, lang) => {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return '';
  return (WEEK_LETTERS[lang] || WEEK_LETTERS.en)[d.getDay()];
};

export default function ManifestationScreen() {
  const th = useTheme();
  const { t, lang } = useT();
  const navigation = useNavigation();
  const route = useRoute();
  // Regra única: toda marcação/desmarcação de prática passa pelo togglePractice
  // do contexto (mesmo caminho da Home) — quem confirma é quem chama.
  const {
    state,
    addManifestation,
    togglePractice,
    updateManifestation,
    addEvidence,
    removeManifestation,
    saveMorningRitualPreferences,
  } = useApp();

  // Vindo da aba Jornada, o React Navigation REAPROVEITA esta tela (mesma key,
  // sem remontar) e só troca os params — sem isto, tocar num segundo card abria
  // a manifestação anterior.
  const routeId = typeof route.params?.id === 'string' && route.params.id ? route.params.id : null;
  const routeTemplateId =
    typeof route.params?.templateId === 'string' && route.params.templateId ? route.params.templateId : null;
  const template = useMemo(() => findForYouById(routeTemplateId), [routeTemplateId]);
  const [localId, setLocalId] = useState(routeId);
  useEffect(() => {
    // Trocar de uma manifestação salva para uma sugestão remove imediatamente
    // o id local anterior; nenhum conteúdo pessoal pode atravessar de rota.
    setLocalId((current) => (current === routeId ? current : routeId));
  }, [routeId, routeTemplateId]);

  // routeId ganha imediatamente. Assim, quando o navigator reutiliza a tela,
  // nem um único frame continua apontando para a manifestação anterior.
  const effectiveId = routeId || (routeTemplateId ? null : localId);
  const saved = useMemo(
    () => (state ? state.manifestations.find((m) => m.id === effectiveId) : null),
    [state, effectiveId]
  );
  // Um id salvo sempre exige item salvo. Sem id, um template só é exibido se o
  // templateId existir de verdade em FOR_YOU; valores inventados mostram "gone".
  const data = routeId ? saved : routeTemplateId ? template : saved;

  // Sugestões usam o catálogo bilíngue. Cenas pessoais já chegam do contexto na
  // variante ativa; o título livre continua exatamente como a pessoa escreveu.
  const item = useMemo(() => {
    if (!data) return null;
    const base = typeof localized === 'function' ? localized(data, lang) : data;
    return {
      ...base,
      title: txt(base.title, lang),
      intention: txt(base.intention, lang),
      affirmation: txt(base.affirmation, lang),
      story: txt(base.story, lang),
    };
  }, [data, lang]);

  const speechOn = useMemo(() => isSpeechAvailable(), []);
  const lines = useMemo(() => (item ? splitScript(item.story) : []), [item]);

  // Id do áudio: só a história das SUGESTÕES tem MP3 (fy-N). Manifestação escrita
  // a partir do desejo da pessoa não tem gravação — ali a voz do aparelho, frase
  // a frase, é o caminho certo. Para as sugestões começadas antes de existir o
  // campo templateId, o vínculo volta pelo texto idêntico ao do card.
  const templateId = useMemo(() => {
    if (!saved) return template ? template.id : null;
    const savedTemplate = findForYouById(saved.templateId);
    if (savedTemplate) return savedTemplate.id;
    const alvo = norm(saved.story);
    if (!alvo) return null;
    const achado = FOR_YOU.find(
      (f) => norm(txt(f.story, 'pt')) === alvo || norm(txt(f.story, 'en')) === alvo
    );
    return achado ? achado.id : null;
  }, [template, saved]);

  // O MP3 é a locução daquele texto naquele idioma: só toca quando o que está na
  // tela é exatamente o que o arquivo diz (manifestação criada em outra língua
  // continua na voz do aparelho, lendo o texto que a pessoa está vendo).
  const neural = useMemo(() => {
    if (!templateId || !item) return false;
    if (Platform.OS !== 'web' || typeof Audio === 'undefined') return false;
    const fonte = findForYouById(templateId);
    if (!fonte || norm(txt(fonte.story, lang)) !== norm(item.story)) return false;
    return hasNeuralAudio(templateId, lang);
  }, [templateId, item, lang]);

  // Só o texto idêntico ao catálogo é público. Qualquer história criada ou
  // alterada pela pessoa exige uma voz comprovadamente local.
  const personalNarration = useMemo(() => {
    if (!item || !templateId) return true;
    const fonte = findForYouById(templateId);
    if (!fonte) return true;
    return !['pt', 'en'].some((code) => norm(txt(fonte.story, code)) === norm(item.story));
  }, [item, templateId]);

  // Duração de verdade só existe quando existe arquivo; senão é estimativa e o
  // mostrador de tempo total some (número inventado na tela, não).
  const realDuration = neural ? audioDur(templateId, lang) : null;
  const estimated = useMemo(() => (item ? estimateSeconds(item.story) : FALLBACK_SECONDS), [item]);
  const duration = realDuration != null ? realDuration : estimated;
  // Catálogo usa arquivo gravado. Texto pessoal usa somente a voz do aparelho:
  // a história pode conter nomes, local e desejo e não deve entrar numa URL.
  const audioOn =
    neural || (speechOn && lines.length > 0 && (!personalNarration || Platform.OS === 'web'));

  const [playing, setPlaying] = useState(false);
  const [audioFailed, setAudioFailed] = useState(false);
  const [position, setPosition] = useState(0);
  const [lineIndex, setLineIndex] = useState(0);
  const timer = useRef(null);
  const lineRef = useRef(0);
  // Id da manifestação salva lido no MOMENTO de finalizar: quem aperta "Começar
  // esta manifestação" no meio da narração já tem prática para marcar, e a
  // variável capturada no closure ainda estava null.
  const savedIdRef = useRef(saved ? saved.id : null);
  // Prática de hoje no MOMENTO de finalizar a narrativa: togglePractice é
  // toggle — sem este espelho, terminar a narração com o dia já feito DESFARIA.
  const doneTodayRef = useRef([]);
  // Edição pelo lápis do cabeçalho: título + afirmação, sem regenerar a história.
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftAffirmation, setDraftAffirmation] = useState('');
  const [draftAnchorStep, setDraftAnchorStep] = useState('');
  const [evidenceDraft, setEvidenceDraft] = useState('');
  const [evidenceSaved, setEvidenceSaved] = useState(false);
  const [starting, setStarting] = useState(false);
  const startBusyRef = useRef(false);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [releaseError, setReleaseError] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState(false);
  // Token da reprodução atual: qualquer onDone de uma sessão antiga é ignorado
  // (evita duas vozes ou um "fim" fantasma depois de pausar).
  const runRef = useRef(0);
  const isFocused = useIsFocused();
  const focusRef = useRef(isFocused);
  focusRef.current = isFocused;

  const contentKey = routeId || (template && template.id) || effectiveId || null;
  useEffect(() => {
    // React Navigation pode manter esta instância e apenas trocar os params.
    // Nenhum rascunho, recibo ou áudio de A pode atravessar para B.
    runRef.current += 1;
    stopSpeaking();
    setPlaying(false);
    setPosition(0);
    setLineIndex(0);
    setEditing(false);
    setDraftTitle('');
    setDraftAffirmation('');
    setDraftAnchorStep('');
    setEvidenceDraft('');
    setEvidenceSaved(false);
  }, [contentKey]);

  useEffect(() => {
    savedIdRef.current = saved ? saved.id : null;
    // Espelha as SESSÕES e avalia o "hoje" na hora do uso — virada de
    // meia-noite durante a narração não congela o dia de ontem.
    doneTodayRef.current = saved ? saved.sessions : [];
  }, [saved]);

  // Relógio só da barra de progresso — quem manda no áudio é a voz.
  useEffect(() => {
    if (!playing) return undefined;
    timer.current = setInterval(() => {
      // Aba escondida: o navegador segura a FALA, então o tempo também espera.
      // O MP3, ao contrário, continua tocando em aba oculta — congelar a barra
      // nesse caso deixaria o número atrasado em relação ao que se ouve.
      if (!neural && Platform.OS === 'web' && typeof document !== 'undefined' && document.hidden) return;
      setPosition((p) => Math.min(duration, p + 1));
    }, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, duration]);

  // Sair da tela cala a voz na hora.
  useEffect(() => {
    if (isFocused) return;
    runRef.current += 1;
    stopSpeaking();
    setPlaying(false);
  }, [isFocused]);

  // Trocar de idioma no meio da narração: cala a voz antiga em vez de misturar
  // as duas línguas na mesma história.
  useEffect(() => {
    runRef.current += 1;
    stopSpeaking();
    setPlaying(false);
  }, [lang]);

  useEffect(
    () => () => {
      runRef.current += 1;
      stopSpeaking();
      if (timer.current) clearInterval(timer.current);
    },
    []
  );

  const finishNarrative = useCallback(() => {
    runRef.current += 1;
    lineRef.current = 0;
    setLineIndex(0);
    setPlaying(false);
    setPosition(duration);
    const id = savedIdRef.current;
    // Fim da narrativa só MARCA o dia — se já estava feito, fica como está.
    if (id && !doneTodayRef.current.includes(todayISO())) {
      togglePractice(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
  }, [duration, togglePractice]);

  // Fala frase a frase e encadeia a próxima no onDone da anterior.
  const playFrom = (index, run) => {
    if (run !== runRef.current) return;
    if (index >= lines.length) {
      finishNarrative();
      return;
    }
    lineRef.current = index;
    setLineIndex(index);
    const mark = Math.round((index / lines.length) * duration);
    setPosition((p) => Math.max(p, mark));
    speak(lines[index], {
      lang,
      localOnly: personalNarration,
      onDone: () => playFrom(index + 1, run),
      // Só reage ao erro da fala ATUAL: parar uma fala dispara o evento de erro
      // da anterior, e incrementar o token aqui matava a narração que acabou de
      // começar (sintoma: pular frase parava tudo e a prática nunca era logada).
      onError: () => {
        if (run !== runRef.current) return;
        setPlaying(false);
      },
    });
  };

  if (!item) {
    return (
      <Screen>
        <Header title={t(S.screenTitle)} />
        <View style={styles.center}>
          <Ionicons name="cloud-outline" size={42} color={th.textMuted} />
          <Text style={{ color: th.textMuted, marginTop: 10 }}>{t(S.gone)}</Text>
          <PrimaryButton label={t(S.goBack)} onPress={() => navigation.goBack()} style={{ marginTop: 20 }} />
        </View>
      </Screen>
    );
  }

  const meta = categoryMeta(item.category);
  const color = accentAt(th, item.accent);
  const done = saved ? saved.sessions.length : 0;
  const goal = item.goalDays || 21;
  const percent = pct(done, goal);
  const doneToday = saved ? saved.sessions.includes(todayISO()) : false;
  // Ciclo fechado: chegou na meta — a tela celebra e para de cobrar check-in.
  const completed = done >= goal;

  const week = lastNDays(7).map((iso) => ({
    iso,
    label: weekdayLetterIn(iso, lang),
    hit: saved ? saved.sessions.includes(iso) : false,
  }));

  // A mesma sugestão aberta duas vezes não pode virar duas manifestações. O
  // vínculo é somente o id escalar do catálogo; título editável não é identidade.
  const findExisting = () => {
    const list = (state && state.manifestations) || [];
    return templateId ? list.find((m) => m.templateId === templateId) : null;
  };

  // O templateId permanece na rota depois de salvar: é dele que sai o id do
  // áudio gravado (fy-N) e F5 retoma a mesma origem sem serializar o card inteiro.
  const openSaved = (id) => {
    if (!id) return;
    savedIdRef.current = id;
    setLocalId(id);
    navigation.setParams(templateId ? { id, templateId } : { id });
  };

  const start = async () => {
    if (startBusyRef.current) return;
    startBusyRef.current = true;
    setStarting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const existing = findExisting();
      if (existing) {
        openSaved(existing.id);
        return;
      }
      const id = await addManifestation({
        title: item.title,
        category: item.category,
        lang,
        accent: item.accent,
        intention: item.intention,
        affirmation: item.affirmation,
        story: item.story,
        goalDays: item.goalDays,
        // marca de origem: é ela que evita a segunda cópia no próximo toque
        templateId,
      });
      if (!id) return;
      openSaved(id);
    } finally {
      startBusyRef.current = false;
      setStarting(false);
    }
  };

  // Safari só deixa falar dentro do gesto: narrate()/speak() saem daqui, do
  // próprio onPress.
  const togglePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (playing) {
      runRef.current += 1;
      stopSpeaking();
      setPlaying(false);
      // O MP3 não tem pausa aqui: parar volta ao começo, e a barra mostra isso em
      // vez de fingir que guardou o ponto.
      if (neural) setPosition(0);
      return;
    }
    if (neural) {
      // Arquivo único com a história inteira: toca de uma vez e o fim dele vale
      // como fim da narrativa (marca a prática do dia, quando já é sua).
      const run = runRef.current + 1;
      runRef.current = run;
      lineRef.current = 0;
      setLineIndex(0);
      setPosition(0);
      setPlaying(true);
      narrate(templateId, item.story, {
        lang,
        onDone: () => {
          if (run !== runRef.current) return;
          finishNarrative();
        },
        // Se o arquivo falhar (404, autoplay barrado, celular no silencioso),
        // narra com a voz do aparelho em vez de deixar um botão que não faz
        // nada — mesmo caminho da tela de visões.
        onError: () => {
          if (run !== runRef.current) return;
          if (lines.length && isSpeechAvailable()) {
            playFrom(0, run);
            return;
          }
          setPlaying(false);
          setPosition(0);
          setAudioFailed(true);
        },
      });
      return;
    }
    const restart = position >= duration || lineRef.current >= lines.length;
    const startAt = restart ? 0 : lineRef.current;
    if (restart) {
      lineRef.current = 0;
      setLineIndex(0);
      setPosition(0);
    }
    setPlaying(true);
    const run = runRef.current + 1;
    runRef.current = run;
    playFrom(startAt, run);
  };

  const jumpLine = (delta) => {
    if (!lines.length) return;
    const next = Math.min(lines.length - 1, Math.max(0, lineRef.current + delta));
    lineRef.current = next;
    setLineIndex(next);
    setPosition(Math.round((next / lines.length) * duration));
    if (playing) {
      const run = runRef.current + 1;
      runRef.current = run;
      playFrom(next, run);
    } else {
      stopSpeaking();
    }
  };

  const onTogglePractice = async () => {
    if (!saved) return;
    // Desfazer sempre confirma antes; marcar hoje é direto.
    if (doneToday) {
      const ok = await confirmAsync({
        title: t(S.undoTitle),
        message: t(S.undoBody),
        confirmLabel: t(S.undoConfirm),
        cancelLabel: t(S.keep),
      });
      if (!ok) return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    togglePractice(saved.id);
  };

  // Bolinha da semana: marca/desfaz o dia que ela mostra (últimos 7), sempre
  // com confirmação datada — é edição de histórico, não enfeite.
  const onToggleDay = async (d) => {
    if (!saved) return;
    // Dia anterior à criação não existe pra marcar — número honesto.
    if (saved.createdAt && d.iso < String(saved.createdAt).slice(0, 10)) return;
    const date = prettyDateIn(d.iso, lang);
    const ok = await confirmAsync({
      title: d.hit ? t(S.unmarkDayTitle, { date }) : t(S.markDayTitle, { date }),
      confirmLabel: d.hit ? t(S.undoConfirm) : t(S.markConfirm),
      cancelLabel: t(S.keep),
      destructive: d.hit,
    });
    if (!ok) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    togglePractice(saved.id, d.iso);
  };

  const startEdit = () => {
    if (!saved) return;
    setEditError(false);
    setDraftTitle(item.title || '');
    setDraftAffirmation(item.affirmation || '');
    setDraftAnchorStep(item.anchorStep || '');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (editBusy) return;
    const titulo = draftTitle.trim();
    const afirmacao = draftAffirmation.trim();
    const ponte = draftAnchorStep.trim();
    if (!titulo || !afirmacao || !ponte) return;
    if (!saved) return;
    setEditBusy(true);
    setEditError(false);
    try {
      const usedAsAlarm =
        state.morningRitual?.wakeAffirmationId === `manifestation:${saved.id}`;
      const alarmContentChanged =
        afirmacao !== state.morningRitual?.wakeAffirmationText ||
        lang !== state.morningRitual?.wakeAffirmationLang;
      if (usedAsAlarm && state.morningRitual?.reminderEnabled && alarmContentChanged) {
        const capability = await getAffirmationAlarmCapability().catch(() => null);
        if (!capability) {
          setEditError(true);
          return;
        }
        if (
          Platform.OS === 'ios' &&
          (capability.supported === true || capability.nativeModuleAvailable === true)
        ) {
          const scheduled = await scheduleAffirmationAlarm({
            time: state.morningRitual.reminderTime,
            affirmation: afirmacao,
            locale: lang === 'pt' ? 'pt-BR' : 'en-US',
            requestAuthorization: true,
          });
          if (!scheduled.ok) {
            const currentCapability = await getAffirmationAlarmCapability().catch(() => null);
            const scheduledIds = Array.isArray(scheduled.scheduledAlarmIds)
              ? scheduled.scheduledAlarmIds
              : currentCapability && currentCapability.scheduledAlarmIds;
            if (Array.isArray(scheduledIds)) {
              saveMorningRitualPreferences({
                reminderEnabled: scheduledIds.includes(DEFAULT_AFFIRMATION_ALARM_ID),
                alarmSyncError: scheduledIds.includes(DEFAULT_AFFIRMATION_ALARM_ID),
              });
            }
            setEditError(true);
            return;
          }
        }
      }
      if (usedAsAlarm) {
        saveMorningRitualPreferences({
          wakeAffirmationText: afirmacao,
          wakeAffirmationLang: lang,
          alarmSyncError: false,
        });
      }
      updateManifestation(saved.id, {
        title: titulo,
        affirmation: afirmacao,
        anchorStep: ponte,
      });
      setEditing(false);
    } finally {
      setEditBusy(false);
    }
  };

  const saveEvidence = () => {
    if (!saved || !evidenceDraft.trim()) return;
    const ok = addEvidence(saved.id, evidenceDraft);
    if (!ok) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setEvidenceDraft('');
    setEvidenceSaved(true);
  };

  const confirmDelete = async () => {
    if (!saved || releaseBusy) return;
    setReleaseError(false);
    const ok = await confirmAsync({
      title: t(S.releaseTitle),
      message: t(S.releaseBody, { n: (saved.evidence || []).length }),
      confirmLabel: t(S.releaseConfirm),
      cancelLabel: t(S.keep),
    });
    if (!ok) return;
    setReleaseBusy(true);
    try {
      const usedAsAlarm =
        state.morningRitual?.wakeAffirmationId === `manifestation:${saved.id}`;
      if (usedAsAlarm && Platform.OS === 'ios') {
        const capability = await getAffirmationAlarmCapability().catch(() => null);
        if (!capability) {
          setReleaseError(true);
          return;
        }
        if (capability.supported === true || capability.nativeModuleAvailable === true) {
          const cancelled = await cancelAffirmationAlarm();
          if (!cancelled.ok) {
            setReleaseError(true);
            return;
          }
        }
      }
      runRef.current += 1;
      stopSpeaking();
      removeManifestation(saved.id);
      if (focusRef.current) navigation.goBack();
    } finally {
      setReleaseBusy(false);
    }
  };

  const playPct = pct(position, duration);

  const steps = [
    { icon: 'sunny-outline', label: t(S.step1), note: t(S.step1Note) },
    { icon: 'headset-outline', label: t(S.step2), note: t(S.step2Note) },
    { icon: 'moon-outline', label: t(S.step3), note: t(S.step3Note) },
  ];

  const audioHint = playing
    ? neural
      ? t(S.playingAll)
      : t(S.nowPlaying, { i: lineIndex + 1, n: lines.length })
    : t(S.hintEyes);

  return (
    <Screen>
      <View style={styles.navRow}>
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={releaseBusy}
          onPress={() => {
            if (!releaseBusy) navigation.goBack();
          }}
          style={[
            styles.navBtn,
            { backgroundColor: alpha(color, 0.14) },
            releaseBusy && { opacity: 0.5 },
          ]}
        >
          <Ionicons name="chevron-back" size={20} color={color} />
        </TouchableOpacity>
        {/* A lixeira saiu daqui: apagar tudo não merece o melhor canto da
            tela — ela vive discreta no fim do scroll. */}
        <View style={styles.navBtn} />
      </View>

      <Header
        title={item.title}
        subtitle={item.intention}
        right={
          saved ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={startEdit}
              accessibilityRole="button"
              accessibilityLabel={t(S.edit)}
              style={[styles.navBtn, { backgroundColor: alpha(color, 0.14) }]}
            >
              <Ionicons name="pencil" size={17} color={color} />
            </TouchableOpacity>
          ) : null
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {editing ? (
          // Modo de ajuste (lápis do cabeçalho): título e afirmação viram
          // campos, prefill com o valor atual. Salvar NÃO regenera a história —
          // o que a pessoa já ouviu continua igual.
          <Card style={[styles.card, { backgroundColor: th.surface, marginTop: 4 }]}>
            <Text style={[styles.inputLabel, { color: th.textMuted }]}>{t(S.editTitle)}</Text>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              accessibilityLabel={t(S.editTitle)}
              style={[
                styles.input,
                { color: th.text, borderColor: th.border, backgroundColor: alpha(th.textMuted, 0.06) },
              ]}
            />
            <Text style={[styles.inputLabel, { color: th.textMuted }]}>{t(S.editAffirmation)}</Text>
            <TextInput
              value={draftAffirmation}
              onChangeText={setDraftAffirmation}
              accessibilityLabel={t(S.editAffirmation)}
              multiline
              style={[
                styles.input,
                styles.inputMulti,
                { color: th.text, borderColor: th.border, backgroundColor: alpha(th.textMuted, 0.06) },
              ]}
            />
            <Text style={[styles.inputLabel, { color: th.textMuted }]}>{t(S.editStep)}</Text>
            <TextInput
              value={draftAnchorStep}
              onChangeText={setDraftAnchorStep}
              accessibilityLabel={t(S.editStep)}
              multiline
              maxLength={280}
              style={[
                styles.input,
                styles.inputMulti,
                { color: th.text, borderColor: th.border, backgroundColor: alpha(th.textMuted, 0.06) },
              ]}
            />
            <View style={styles.editRow}>
              <PrimaryButton
                label={t(S.cancel)}
                variant="ghost"
                accent={item.accent}
                onPress={() => setEditing(false)}
                style={{ flex: 1, marginRight: 10 }}
              />
              <PrimaryButton
                label={t(S.save)}
                icon="checkmark"
                accent={item.accent}
                onPress={saveEdit}
                disabled={
                  editBusy ||
                  !draftTitle.trim() ||
                  !draftAffirmation.trim() ||
                  !draftAnchorStep.trim()
                }
                style={{ flex: 1 }}
              />
            </View>
            {editError ? (
              <Text style={[styles.releaseError, { color: accentAt(th, 1) }]}>
                {t(S.editAlarmFailed)}
              </Text>
            ) : null}
          </Card>
        ) : (
          <GradientCover accent={item.accent} radius={22} style={styles.hero}>
            <View style={styles.heroInner}>
              <View style={[styles.badge, { backgroundColor: alpha('#FFFFFF', 0.28) }]}>
                <Ionicons name={meta.icon} size={13} color="#FFFFFF" />
                <Text style={styles.badgeText}>{categoryLabel(item.category, lang)}</Text>
              </View>
              <Text style={styles.heroQuote}>{item.affirmation}</Text>
              {saved ? (
                <Text style={styles.heroMeta}>
                  {t(S.startedOn, {
                    date: prettyDateIn(saved.createdAt, lang),
                    day: Math.min(done, goal),
                    goal,
                  })}
                </Text>
              ) : (
                <Text style={styles.heroMeta}>{t(S.suggested, { goal })}</Text>
              )}
            </View>
          </GradientCover>
        )}

        {item.anchorStep ? (
          <>
            <SectionHeading title={t(S.anchorTitle)} />
            <Card style={[styles.card, { backgroundColor: th.surface }]}>
              <View style={styles.anchorRow}>
                <View style={[styles.anchorIcon, { backgroundColor: alpha(color, 0.14) }]}>
                  <Ionicons name="footsteps-outline" size={20} color={color} />
                </View>
                <View style={styles.anchorCopy}>
                  <Text style={[styles.anchorIdentity, { color }]}>{item.anchorIdentity}</Text>
                  <Text style={[styles.anchorStep, { color: th.text }]}>{item.anchorStep}</Text>
                </View>
              </View>
              <Text style={[styles.anchorNote, { color: th.textMuted }]}>{t(S.anchorNote)}</Text>
            </Card>
          </>
        ) : null}

        {/* Player logo depois da afirmação: é a ação principal da tela e fica
            antes da dobra — não atrás de um boletim de números. A história em
            texto desceu para o fim; a constância, para depois do botão. */}
        <SectionHeading title={t(S.audioTitle)} />
        <Card style={[styles.card, { backgroundColor: th.surface }]}>
          {audioOn ? (
            <View>
              <View style={[styles.playerTrack, { backgroundColor: alpha(color, 0.15) }]}>
                <View style={[styles.playerFill, { width: `${playPct}%`, backgroundColor: color }]} />
              </View>
              {/* Relógio só quando a duração é medida do arquivo. Na voz do aparelho
                  o tempo é chute — aí a barra e o "frase X de Y" contam o progresso,
                  sem número inventado na tela. */}
              {realDuration != null ? (
                <View style={styles.rowBetween}>
                  <Text style={[styles.time, { color: th.textMuted }]}>{formatTime(position)}</Text>
                  <Text style={[styles.time, { color: th.textMuted }]}>{formatTime(realDuration)}</Text>
                </View>
              ) : null}

              <View style={[styles.playerRow, realDuration == null && styles.playerRowNoTime]}>
                {/* Áudio gravado é um arquivo só: frase anterior/próxima não teriam
                    o que fazer, então nem aparecem. */}
                {neural ? null : (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => jumpLine(-1)}
                    accessibilityRole="button"
                    accessibilityLabel={t(S.prevLine)}
                    style={[styles.smallBtn, { backgroundColor: alpha(color, 0.12) }]}
                  >
                    <Ionicons name="play-back" size={18} color={color} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={togglePlay}
                  accessibilityRole="button"
                  accessibilityLabel={playing ? (neural ? t(S.stop) : t(S.pause)) : t(S.listen)}
                  style={[styles.playBtn, { backgroundColor: color }]}
                >
                  {/* No modo gravado não existe pausa: parar volta ao início,
                      então o botão diz "parar" em vez de prometer pausa. */}
                  <Ionicons name={playing ? (neural ? 'stop' : 'pause') : 'play'} size={26} color="#FFFFFF" />
                </TouchableOpacity>

                {neural ? null : (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => jumpLine(1)}
                    accessibilityRole="button"
                    accessibilityLabel={t(S.nextLine)}
                    style={[styles.smallBtn, { backgroundColor: alpha(color, 0.12) }]}
                  >
                    <Ionicons name="play-forward" size={18} color={color} />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={[styles.hint, { color: th.textMuted }]}>
                {audioFailed ? t(S.audioFail) : audioHint}
                {/* Depois do feito, a frase futura vira recibo: o dia JÁ entrou. */}
                {saved && !audioFailed
                  ? ` ${
                      doneToday
                        ? t(S.receipt, { done: Math.min(done, goal), goal })
                        : t(S.hintLogs)
                    }`
                  : ''}
              </Text>
            </View>
          ) : (
            <Text style={[styles.hint, { color: th.textMuted }]}>{t(S.noVoice)}</Text>
          )}
        </Card>

        {saved ? (
          completed ? (
            // Ciclo fechado: celebração no lugar do botão — sem cobrar check-in
            // de quem já chegou lá. Desfazer um dia segue pelas bolinhas abaixo.
            <View style={[styles.doneBanner, { backgroundColor: alpha(color, 0.14) }]}>
              <Ionicons name="checkmark-circle" size={20} color={color} />
              <Text style={[styles.doneBannerText, { color }]}>{t(S.completedBanner, { goal })}</Text>
            </View>
          ) : (
            <PrimaryButton
              label={doneToday ? t(S.practiceDone) : t(S.markPractice)}
              icon={doneToday ? 'checkmark-circle' : 'sparkles'}
              accent={item.accent}
              variant={doneToday ? 'soft' : 'solid'}
              onPress={onTogglePractice}
              style={{ marginTop: 16 }}
            />
          )
        ) : (
          <PrimaryButton
            testID="start-manifestation"
            label={t(S.startThis)}
            icon="add-circle-outline"
            accent={item.accent}
            onPress={start}
            disabled={starting}
            style={{ marginTop: 16 }}
          />
        )}

        {/* Constância só existe depois da 1ª prática — boletim de zeros não
            recebe ninguém. Antes disso, um convite de uma linha. */}
        {saved && done === 0 ? (
          <Text style={[styles.hint, { color: th.textMuted }]}>{t(S.constancyInvite)}</Text>
        ) : null}
        {saved && done > 0 ? (
          <Card style={[styles.card, { backgroundColor: th.surface }]}>
            <View style={styles.rowBetween}>
              <Text style={[styles.cardTitle, { color: th.text }]}>{t(S.progressTitle)}</Text>
              <Text style={[styles.pctText, { color }]}>{percent}%</Text>
            </View>
            <View style={[styles.track, { backgroundColor: alpha(color, 0.15) }]}>
              <View style={[styles.fill, { width: `${percent}%`, backgroundColor: color }]} />
            </View>
            <Text style={[styles.trackLabel, { color: th.textMuted }]}>
              {t(S.daysDone, { done: Math.min(done, goal), goal })}
            </Text>
            <View style={styles.weekRow}>
              {/* Bolinhas tocáveis: marcam/desfazem o dia que mostram (últimos
                  7), sempre com confirmação datada — quem esqueceu ontem
                  conserta aqui, em vez de perder a sequência sem apelação. */}
              {week.map((d, i) => (
                <TouchableOpacity
                  key={d.iso}
                  activeOpacity={0.7}
                  onPress={() => onToggleDay(d)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    d.hit
                      ? t(S.unmarkDayTitle, { date: prettyDateIn(d.iso, lang) })
                      : t(S.markDayTitle, { date: prettyDateIn(d.iso, lang) })
                  }
                  style={styles.weekCol}
                >
                  <View
                    style={[
                      styles.weekDot,
                      {
                        backgroundColor: d.hit ? accentAt(th, item.accent + i) : alpha(th.textMuted, 0.12),
                      },
                    ]}
                  >
                    {d.hit ? <Ionicons name="checkmark" size={13} color="#FFFFFF" /> : null}
                  </View>
                  <Text style={[styles.weekLabel, { color: th.textMuted }]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Card>
        ) : null}

        {saved ? (
          <>
            <SectionHeading title={t(S.evidenceTitle)} />
            <Card style={[styles.card, { backgroundColor: th.surface }]}>
              <Text style={[styles.evidencePrompt, { color: th.text }]}>{t(S.evidencePrompt)}</Text>
              <TextInput
                value={evidenceDraft}
                onChangeText={(value) => {
                  setEvidenceDraft(value);
                  setEvidenceSaved(false);
                }}
                placeholder={t(S.evidencePlaceholder)}
                accessibilityLabel={t(S.evidencePrompt)}
                placeholderTextColor={alpha(th.textMuted, 0.7)}
                multiline
                maxLength={280}
                style={[
                  styles.evidenceInput,
                  { color: th.text, borderColor: th.border, backgroundColor: alpha(th.textMuted, 0.06) },
                ]}
              />
              <PrimaryButton
                label={t(S.evidenceSave)}
                icon="bookmark-outline"
                accent={item.accent}
                variant="soft"
                disabled={!evidenceDraft.trim()}
                onPress={saveEvidence}
                style={{ marginTop: 10 }}
              />
              {evidenceSaved ? <Text style={[styles.evidenceSaved, { color }]}>{t(S.evidenceSaved)}</Text> : null}
              {(saved.evidence || []).slice(0, 3).map((entry) => (
                <View key={entry.id} style={[styles.evidenceEntry, { borderTopColor: th.border }]}>
                  <Ionicons name="reader-outline" size={15} color={color} />
                  <Text style={[styles.evidenceText, { color: th.textMuted }]}>{entry.text}</Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <SectionHeading title={t(S.ritual)} />
        <Card style={[styles.card, { backgroundColor: th.surface }]}>
          {steps.map((step, i) => (
            <View
              key={step.icon}
              style={[styles.stepRow, i < 2 && [styles.stepDivider, { borderBottomColor: th.border }]]}
            >
              <View style={[styles.stepIcon, { backgroundColor: alpha(accentAt(th, item.accent + i), 0.15) }]}>
                <Ionicons name={step.icon} size={17} color={accentAt(th, item.accent + i)} />
              </View>
              <Text style={[styles.stepLabel, { color: th.text }]}>{step.label}</Text>
              <Text style={[styles.stepNote, { color: th.textMuted }]}>{step.note}</Text>
            </View>
          ))}
        </Card>

        <SectionHeading title={t(S.storyTitle)} />
        <Card style={[styles.card, { backgroundColor: th.surface }]}>
          <Text style={[styles.story, { color: th.text }]}>{item.story}</Text>
        </Card>

        {saved ? (
          <>
            {/* Apagar é raro: item discreto no fim, longe do caminho do dedo. */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={confirmDelete}
              disabled={releaseBusy}
              accessibilityRole="button"
              accessibilityLabel={t(S.releaseAction)}
              accessibilityState={{ disabled: releaseBusy }}
              style={[styles.releaseRow, releaseBusy && { opacity: 0.5 }]}
            >
              <Ionicons name="trash-outline" size={15} color={th.textMuted} />
              <Text style={[styles.releaseText, { color: th.textMuted }]}>{t(S.releaseAction)}</Text>
            </TouchableOpacity>
            {releaseError ? (
              <Text style={[styles.releaseError, { color: accentAt(th, 1) }]}>
                {t(S.releaseAlarmFailed)}
              </Text>
            ) : null}
          </>
        ) : null}
        <View style={{ height: 32 }} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  navBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  hero: { padding: 20, marginTop: 4 },
  heroInner: { alignItems: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '700', marginLeft: 5 },
  heroQuote: {
    color: '#FFFFFF',
    fontSize: 18,
    lineHeight: 27,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 14,
    fontWeight: '500',
  },
  heroMeta: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 12, fontWeight: '600' },
  card: { padding: 16, borderRadius: 18, marginTop: 16 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15.5, fontWeight: '700' },
  pctText: { fontSize: 16, fontWeight: '800' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
  fill: { height: 8, borderRadius: 4 },
  trackLabel: { fontSize: 11.5, fontWeight: '600', marginTop: 8 },
  weekRow: { flexDirection: 'row', marginTop: 16 },
  // Tocável de verdade: altura mínima real (hitSlop não aumenta toque na web).
  weekCol: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  weekDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekLabel: { fontSize: 11, marginTop: 6, fontWeight: '600' },
  story: { fontSize: 15, lineHeight: 24 },
  playerTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  playerFill: { height: 5, borderRadius: 3 },
  time: { fontSize: 11.5, marginTop: 6, fontWeight: '600' },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  // Sem o relógio em cima, os botões respiram o espaço que era do tempo.
  playerRowNoTime: { marginTop: 22 },
  smallBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 18,
  },
  playBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 18 },
  // Celebração do ciclo fechado — mesma silhueta do botão que ela substitui.
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 26,
    marginTop: 16,
  },
  doneBannerText: { fontSize: 15.5, fontWeight: '700', marginLeft: 8 },
  inputLabel: { fontSize: 12, fontWeight: '700', marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 6 },
  inputMulti: { minHeight: 84, textAlignVertical: 'top' },
  anchorRow: { flexDirection: 'row', alignItems: 'flex-start' },
  anchorIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  anchorCopy: { flex: 1, marginLeft: 13 },
  anchorIdentity: { fontSize: 12.5, lineHeight: 18, fontWeight: '700' },
  anchorStep: { fontSize: 16, lineHeight: 23, fontWeight: '600', marginTop: 5 },
  anchorNote: { fontSize: 12.5, lineHeight: 18, marginTop: 13 },
  evidencePrompt: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
  evidenceInput: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 10,
    textAlignVertical: 'top',
  },
  evidenceSaved: { fontSize: 12.5, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  evidenceEntry: { flexDirection: 'row', alignItems: 'flex-start', borderTopWidth: 1, paddingTop: 12, marginTop: 12 },
  evidenceText: { flex: 1, fontSize: 13.5, lineHeight: 20, marginLeft: 9 },
  editRow: { flexDirection: 'row', marginTop: 18 },
  // Lixeira discreta do fim da tela — altura mínima real para o toque.
  releaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: 20,
  },
  releaseText: { fontSize: 13, fontWeight: '600', marginLeft: 6 },
  releaseError: { fontSize: 12.5, lineHeight: 18, marginTop: 8, textAlign: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  stepDivider: { borderBottomWidth: StyleSheet.hairlineWidth },
  stepIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { flex: 1, fontSize: 14, fontWeight: '600', marginLeft: 12 },
  stepNote: { fontSize: 11.5, fontWeight: '600' },
});
