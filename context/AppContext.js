import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initialState } from '../constants/content';
import { detectLang } from '../constants/i18n';
import { todayISO, streakFrom } from '../utils/date';
import { dreamToAffirmation } from '../utils/dreamToAffirmation';

const STORAGE_KEY = '@stella_state_v2';
const AppCtx = createContext(null);

export function AppProvider({ children }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const base = initialState();
        const st = parsed && Array.isArray(parsed.manifestations) ? { ...base, ...parsed } : base;
        // Defensive: any array field missing/corrupted in the stored blob falls back to the default.
        ['manifestations', 'favoriteAffirmations', 'affirmationDates', 'savedVisions', 'visionPlays'].forEach(
          (key) => {
            if (!Array.isArray(st[key])) st[key] = base[key];
          }
        );
        if (!st.lang) st.lang = detectLang();
        if (alive) setState(st);
      } catch (e) {
        if (alive) setState(initialState());
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  // O desejo digitado vira afirmação + cena montadas com as respostas do
  // onboarding (utils/dreamToAffirmation). Antes disso, todo desejo virava a
  // MESMA frase de template em inglês e o state.profile nunca era lido — o app
  // prometia conteúdo "criado a partir das suas respostas" e não cumpria.
  const addManifestation = useCallback((data) => {
    const id = `m-${Date.now()}`;
    setState((s) => {
      const lang = (s && s.lang) || 'pt';
      const gerado = dreamToAffirmation(data.title, (s && s.profile) || {}, lang);
      const item = {
        id,
        title: data.title,
        category: data.category || 'Wealth',
        accent: typeof data.accent === 'number' ? data.accent : 0,
        // Origem: quando nasce de um card sugerido, guarda o id do template.
        // É o que liga a locução gravada (fy-3.mp3) e o que impede criar uma
        // segunda cópia ao reabrir o mesmo card.
        templateId: data.templateId || null,
        lang, // idioma em que foi criada (o texto não se traduz sozinho depois)
        intention: data.intention || gerado.intention,
        affirmation: data.affirmation || gerado.affirmation,
        story: data.story || gerado.story,
        // o que do perfil foi usado — a tela mostra isso como recibo honesto
        personalizedWith: data.story ? [] : gerado.usouDoPerfil,
        goalDays: data.goalDays || 21,
        createdAt: todayISO(),
        sessions: [],
      };
      return { ...s, manifestations: [item, ...s.manifestations] };
    });
    return id;
  }, []);

  const logSession = useCallback((id) => {
    const day = todayISO();
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) =>
        m.id === id && !m.sessions.includes(day) ? { ...m, sessions: [...m.sessions, day] } : m
      ),
    }));
  }, []);

  const undoSession = useCallback((id) => {
    const day = todayISO();
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) =>
        m.id === id ? { ...m, sessions: m.sessions.filter((d) => d !== day) } : m
      ),
    }));
  }, []);

  const removeManifestation = useCallback((id) => {
    setState((s) => ({ ...s, manifestations: s.manifestations.filter((m) => m.id !== id) }));
  }, []);

  const toggleFavoriteAffirmation = useCallback((id) => {
    setState((s) => ({
      ...s,
      favoriteAffirmations: s.favoriteAffirmations.includes(id)
        ? s.favoriteAffirmations.filter((x) => x !== id)
        : [id, ...s.favoriteAffirmations],
    }));
  }, []);

  const markAffirmationRead = useCallback(() => {
    const day = todayISO();
    setState((s) =>
      s.affirmationDates.includes(day) ? s : { ...s, affirmationDates: [day, ...s.affirmationDates] }
    );
  }, []);

  const toggleSavedVision = useCallback((id) => {
    setState((s) => ({
      ...s,
      savedVisions: s.savedVisions.includes(id)
        ? s.savedVisions.filter((x) => x !== id)
        : [id, ...s.savedVisions],
    }));
  }, []);

  const logVisionPlay = useCallback((visionId) => {
    setState((s) => ({
      ...s,
      visionPlays: [{ visionId, date: todayISO() }, ...s.visionPlays].slice(0, 200),
    }));
  }, []);

  const setName = useCallback((name) => {
    setState((s) => ({ ...s, name: name.trim() || s.name }));
  }, []);

  const resetAll = useCallback(() => {
    setState(initialState());
  }, []);

  // ── Onboarding ────────────────────────────────────────────────────────────
  const saveProfile = useCallback((patch) => {
    setState((s) => ({
      ...s,
      profile: { ...(s.profile || {}), ...patch },
      name: patch && patch.name ? String(patch.name).trim() : s.name,
    }));
  }, []);

  const completeOnboarding = useCallback(() => {
    setState((s) => ({ ...s, onboardingDone: true }));
  }, []);

  const resetOnboarding = useCallback(() => {
    setState((s) => ({ ...s, onboardingDone: false }));
  }, []);

  const setLang = useCallback((lang) => {
    setState((s) => ({ ...s, lang: lang === 'pt' ? 'pt' : 'en' }));
  }, []);

  const derived = useMemo(() => {
    if (!state) {
      return { allSessionDates: [], streak: 0, totalSessions: 0, completed: 0 };
    }
    const allSessionDates = state.manifestations.flatMap((m) => m.sessions);
    const unique = Array.from(new Set([...allSessionDates, ...state.affirmationDates]));
    return {
      allSessionDates,
      uniqueDays: unique,
      streak: streakFrom(unique),
      totalSessions: allSessionDates.length + state.visionPlays.length,
      completed: state.manifestations.filter((m) => m.sessions.length >= m.goalDays).length,
    };
  }, [state]);

  const value = useMemo(
    () => ({
      state,
      loading,
      derived,
      addManifestation,
      logSession,
      undoSession,
      removeManifestation,
      toggleFavoriteAffirmation,
      markAffirmationRead,
      toggleSavedVision,
      logVisionPlay,
      setName,
      resetAll,
      saveProfile,
      completeOnboarding,
      resetOnboarding,
      setLang,
    }),
    [
      state,
      loading,
      derived,
      addManifestation,
      logSession,
      undoSession,
      removeManifestation,
      toggleFavoriteAffirmation,
      markAffirmationRead,
      toggleSavedVision,
      logVisionPlay,
      setName,
      resetAll,
      saveProfile,
      completeOnboarding,
      resetOnboarding,
      setLang,
    ]
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
