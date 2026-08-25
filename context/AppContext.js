import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initialState } from '../constants/content';
import { detectLang } from '../constants/i18n';
import { isNarratorId } from '../constants/narrators';
import { todayISO, streakFrom } from '../utils/date';
import { dreamToAffirmation } from '../utils/dreamToAffirmation';
import {
  applyTranslatedManifestationVariant,
  localizeManifestation,
  manifestationVariantFromScene,
  shouldTranslateManifestationVariant,
  snapshotManifestationContent,
} from '../utils/manifestationLanguage';
import { generatePersonalizedScene } from '../services/generatePersonalizedScene';
import { translateManifestationScene } from '../services/translateManifestationScene';
import { createSerialStorageWriter } from '../utils/serialStorageWriter';
import {
  beginCommunityDataReset,
  cancelCommunityDataReset,
  finishCommunityDataReset,
} from '../services/communityStories';

const STORAGE_KEY = '@stella_state_v2';
const AUXILIARY_STORAGE_KEYS = [
  '@celeste_community_stories_v1',
  '@celeste_onb_draft',
  '@celeste_home_invite_dismissed_v1',
];
const STORAGE_READ_TIMEOUT_MS = 6000;
const STORAGE_WRITE_TIMEOUT_MS = 6000;
const TRANSLATION_BATCH_SIZE = 8;
const TRANSLATION_BATCH_DELAY_MS = 61000;
const TRANSLATION_START_DELAY_MS = 350;
const AppCtx = createContext(null);

function settleWithin(promise, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ settled: false, value: null, error: null });
    }, Math.max(1, timeoutMs));
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ settled: true, value, error: null });
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ settled: true, value: null, error });
      }
    );
  });
}

const RITUAL_THEMES = ['clarity', 'courage', 'peace', 'connection', 'abundance', 'renewal'];
const RITUAL_FEELINGS = ['calm', 'joyful', 'curious', 'anxious', 'confused', 'powerful'];
const RITUAL_DETAIL_KEYS = ['dream_anchor', 'feeling', 'theme'];
const VISUAL_MOODS = ['midnight', 'violet', 'ember', 'forest', 'paper', 'cloud', 'blossom', 'mono'];
const validTime = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  return !!match && Number(match[1]) < 24 && Number(match[2]) < 60;
};
const shortText = (value, max) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const validDay = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const uniqueShortStrings = (values, maxLength, maxItems) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => shortText(value, maxLength))
        .filter(Boolean)
    )
  ).slice(0, maxItems);
const isKnownMinor = (profile) => {
  const age = shortText(profile && profile.age, 40)
    .toLocaleLowerCase('en-US')
    .replace(/[\s\u2013\u2014\u2212-]+/g, '');
  return age === 'under18' || age === 'menosde18';
};

// Merge defensivo sobre o estado default — usado no load e no import.
// Campo novo entra sempre com default AQUI (estado salvo antigo continua válido).
function mergeDefensivo(parsed) {
  const base = initialState();
  const st = parsed && Array.isArray(parsed.manifestations) ? { ...base, ...parsed } : base;
  // Defensive: any array field missing/corrupted in the stored blob falls back to the default.
  ['manifestations', 'favoriteAffirmations', 'affirmationDates', 'savedVisions', 'visionPlays'].forEach(
    (key) => {
      if (!Array.isArray(st[key])) st[key] = base[key];
    }
  );
  st.favoriteAffirmations = uniqueShortStrings(st.favoriteAffirmations, 160, 500);
  st.savedVisions = uniqueShortStrings(st.savedVisions, 160, 200);
  st.affirmationDates = Array.from(new Set(st.affirmationDates.filter(validDay))).slice(0, 3650);
  st.visionPlays = st.visionPlays
    .filter((play) => play && typeof play === 'object' && !Array.isArray(play))
    .map((play) => ({
      visionId: shortText(play.visionId, 160),
      date: validDay(play.date) ? play.date : null,
    }))
    .filter((play) => play.visionId && play.date)
    .slice(0, 200);
  // Estados antigos podem trazer strings. Somente true real (ou seu legado
  // serializado) libera o app; `"false"` e `"0"` nunca podem ser truthy aqui.
  st.onboardingDone = st.onboardingDone === true || st.onboardingDone === 'true';
  if (st.lang !== 'pt' && st.lang !== 'en') st.lang = detectLang();
  st.name = shortText(st.name, 80);
  st.mood = VISUAL_MOODS.includes(st.mood) ? st.mood : null;
  const savedNarration =
    st.narration && typeof st.narration === 'object' && !Array.isArray(st.narration)
      ? st.narration
      : {};
  st.narration = {
    narratorId: isNarratorId(savedNarration.narratorId)
      ? savedNarration.narratorId
      : base.narration.narratorId,
  };
  st.profile = st.profile && typeof st.profile === 'object' && !Array.isArray(st.profile)
    ? { ...st.profile }
    : {};
  const cloudAllowed =
    !isKnownMinor(st.profile) &&
    st.profile.cloudPersonalization === true &&
    st.profile.cloudAdultConfirmed === true;
  st.profile.cloudPersonalization = cloudAllowed;
  st.profile.cloudAdultConfirmed = cloudAllowed;
  // Item importado/antigo sem sessions derrubaria derived e setPractice —
  // normalizar aqui protege load e import de uma vez.
  st.manifestations = st.manifestations
    .filter((raw) => raw && typeof raw === 'object' && !Array.isArray(raw))
    .map((raw, manifestationIndex) => {
    const m = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const itemLang = m.lang === 'pt' || m.lang === 'en' ? m.lang : st.lang;
    const categories = ['Love', 'Wealth', 'Career', 'Health', 'Confidence', 'Peace'];
    const category = categories.includes(m.category) ? m.category : 'Wealth';
    const titleFallback = itemLang === 'pt' ? 'Minha manifestação' : 'My manifestation';
    const textOr = (value, fallback, max) =>
      typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;
    const title = textOr(m.title, titleFallback, 160);
    const generated = dreamToAffirmation(title, st.profile || {}, itemLang, category);
    // Older releases could create a manifestation from an editorial card.
    // Rebuild those entries from the person's own title and profile so the
    // removed catalog cannot return after an update.
    const cameFromCatalog = !!shortText(m.templateId, 120);
    const { templateId: _legacyTemplateId, ...manifestationFields } = m;
    const evidence = (Array.isArray(m.evidence) ? m.evidence : [])
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.text === 'string' && entry.text.trim())
      .map((entry, index) => ({
        ...entry,
        id: typeof entry.id === 'string' && entry.id ? entry.id : `e-${m.id || 'legacy'}-${index}`,
        text: entry.text.trim().slice(0, 280),
      }));
    const normalized = {
      ...manifestationFields,
      id: textOr(m.id, `m-legacy-${manifestationIndex}`, 120),
      title,
      category,
      lang: itemLang,
      intention: textOr(cameFromCatalog ? null : m.intention, generated.intention, 600),
      affirmation: textOr(cameFromCatalog ? null : m.affirmation, generated.affirmation, 1200),
      story: textOr(cameFromCatalog ? null : m.story, generated.story, 12000),
      sessions: Array.from(
        new Set(
          (Array.isArray(m.sessions) ? m.sessions : []).filter(
            (day) =>
              typeof day === 'string' &&
              /^\d{4}-\d{2}-\d{2}$/.test(day) &&
              !Number.isNaN(Date.parse(`${day}T00:00:00Z`))
          )
        )
      ),
      evidence,
      personalizedWith: (Array.isArray(cameFromCatalog ? generated.usouDoPerfil : m.personalizedWith)
        ? (cameFromCatalog ? generated.usouDoPerfil : m.personalizedWith)
        : [])
        .filter((label) => typeof label === 'string' && label.trim())
        .map((label) => label.trim().slice(0, 80))
        .slice(0, 12),
      anchorOpenedAt:
        typeof m.anchorOpenedAt === 'string' && !Number.isNaN(Date.parse(m.anchorOpenedAt))
          ? m.anchorOpenedAt
          : undefined,
      anchorIdentity: textOr(cameFromCatalog ? null : m.anchorIdentity, generated.anchorIdentity, 600),
      anchorStep: textOr(cameFromCatalog ? null : m.anchorStep, generated.anchorStep, 280),
      generation: cameFromCatalog
        ? { source: 'local', promptVersion: 'personal-catalog-migration-v1' }
        : m.generation,
      goalDays:
        Number.isInteger(m.goalDays) && m.goalDays > 0 && m.goalDays <= 365 ? m.goalDays : 21,
    };
      return localizeManifestation(normalized, st.profile, st.lang);
    });
  const savedRitual = st.morningRitual && typeof st.morningRitual === 'object' ? st.morningRitual : {};
  const defaultRitual = base.morningRitual;
  st.morningRitual = {
    alarmStatus: 'native_integration_required',
    reminderEnabled: savedRitual.reminderEnabled === true,
    alarmSyncError: savedRitual.alarmSyncError === true,
    reminderTime: validTime(savedRitual.reminderTime)
      ? savedRitual.reminderTime
      : defaultRitual.reminderTime,
    wakeAffirmationId: shortText(savedRitual.wakeAffirmationId, 160) || null,
    wakeAffirmationText: shortText(savedRitual.wakeAffirmationText, 800),
    wakeAffirmationLang: savedRitual.wakeAffirmationLang === 'en' ? 'en' : 'pt',
    entries: (Array.isArray(savedRitual.entries) ? savedRitual.entries : [])
      .filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          shortText(entry.id, 160) &&
          shortText(entry.dream, 1600) &&
          shortText(entry.affirmation, 800)
      )
      .map((entry) => ({
        id: shortText(entry.id, 160),
        dream: shortText(entry.dream, 1600),
        feeling: RITUAL_FEELINGS.includes(entry.feeling) ? entry.feeling : '',
        theme: RITUAL_THEMES.includes(entry.theme) ? entry.theme : 'clarity',
        affirmation: shortText(entry.affirmation, 800),
        reflection: shortText(entry.reflection, 800),
        dreamAnchor: shortText(entry.dreamAnchor, 120),
        usedDetails: (Array.isArray(entry.usedDetails) ? entry.usedDetails : [])
          .filter((key) => RITUAL_DETAIL_KEYS.includes(key))
          .filter((key, index, values) => values.indexOf(key) === index),
        generatorVersion: shortText(entry.generatorVersion, 40) || 'dream-local-v1',
        lang: entry.lang === 'en' ? 'en' : 'pt',
        createdAt:
          typeof entry.createdAt === 'string' && !Number.isNaN(Date.parse(entry.createdAt))
            ? entry.createdAt
            : new Date(0).toISOString(),
        practiceCount:
          Number.isInteger(entry.practiceCount) && entry.practiceCount > 0
            ? Math.min(entry.practiceCount, 10000)
            : 0,
        lastPracticedAt:
          typeof entry.lastPracticedAt === 'string' && !Number.isNaN(Date.parse(entry.lastPracticedAt))
            ? entry.lastPracticedAt
            : null,
      }))
      .slice(0, 90),
  };

  // Fixed catalog IDs from older builds are no longer valid. Every collection
  // below may point only to content created from this person's own answers.
  const manifestationIds = new Set(st.manifestations.map((item) => item.id));
  const personalAffirmationIds = new Set(
    st.manifestations.map((item) => `manifestation:${item.id}`)
  );
  const ritualIds = new Set(
    (st.morningRitual.entries || []).map((entry) => `ritual:${entry.id}`)
  );
  st.favoriteAffirmations = st.favoriteAffirmations.filter(
    (id) => personalAffirmationIds.has(id) || ritualIds.has(id)
  );
  st.savedVisions = st.savedVisions.filter((id) => manifestationIds.has(id));
  st.visionPlays = st.visionPlays.filter((play) => manifestationIds.has(play.visionId));

  const wakeId = st.morningRitual.wakeAffirmationId;
  const validWakeId =
    !wakeId ||
    wakeId === 'custom' ||
    personalAffirmationIds.has(wakeId) ||
    ritualIds.has(wakeId);
  if (!validWakeId) {
    const fallbackManifestation = st.manifestations.find(
      (item) => typeof item.affirmation === 'string' && item.affirmation.trim()
    );
    const fallbackDream = (st.morningRitual.entries || []).find(
      (entry) => typeof entry.affirmation === 'string' && entry.affirmation.trim()
    );
    const fallbackWake = fallbackManifestation
      ? {
          id: `manifestation:${fallbackManifestation.id}`,
          text: fallbackManifestation.affirmation.trim(),
          lang: fallbackManifestation.lang === 'en' ? 'en' : 'pt',
        }
      : fallbackDream
        ? {
            id: `ritual:${fallbackDream.id}`,
            text: fallbackDream.affirmation.trim(),
            lang: fallbackDream.lang === 'en' ? 'en' : 'pt',
          }
        : null;
    st.morningRitual.wakeAffirmationId = fallbackWake ? fallbackWake.id : null;
    st.morningRitual.wakeAffirmationText = fallbackWake ? fallbackWake.text : '';
    st.morningRitual.wakeAffirmationLang = fallbackWake ? fallbackWake.lang : st.lang;
    if (fallbackWake) {
      // The native AlarmKit may still contain the removed catalog narration.
      // Keep the alarm visible, but force NativeAlarmContentSync to replace it
      // before treating the personal text as confirmed.
      st.morningRitual.alarmSyncError = st.morningRitual.reminderEnabled;
    } else {
      st.morningRitual.reminderEnabled = false;
      st.morningRitual.alarmSyncError = false;
    }
  }
  return st;
}

export function AppProvider({ children }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [storageLoadError, setStorageLoadError] = useState(false);
  const [storageCorrupt, setStorageCorrupt] = useState(false);
  const [storageMutation, setStorageMutation] = useState(null);
  const stateRef = useRef(null);
  const pendingOnboardingRef = useRef(false);
  const mountedRef = useRef(true);
  const hydratedRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const readAttemptRef = useRef(0);
  const storageRepairRef = useRef(false);
  const generationEpochRef = useRef(0);
  const translationLanguageEpochRef = useRef(0);
  const desiredLanguageRef = useRef(null);
  const lastDreamSaveRef = useRef({ epoch: -1, signature: '', id: null, at: 0 });
  const resetInProgressRef = useRef(false);
  const storageMutationRef = useRef(null);
  const pendingResetRevisionRef = useRef(0);
  const pendingResetFinalizeRef = useRef(null);
  const pendingImportRevisionRef = useRef(0);
  const pendingImportFinalizeRef = useRef(null);
  const pendingStoragePreparationRef = useRef(null);
  const writerRef = useRef(null);
  stateRef.current = state;

  if (!writerRef.current) {
    writerRef.current = createSerialStorageWriter({
      write: (value) => AsyncStorage.setItem(STORAGE_KEY, value),
      timeoutMs: STORAGE_WRITE_TIMEOUT_MS,
      onStatus: ({ type, revision }) => {
        if (!mountedRef.current) return;
        if (type === 'ok') {
          if (
            pendingResetRevisionRef.current &&
            revision === pendingResetRevisionRef.current &&
            pendingResetFinalizeRef.current
          ) {
            void pendingResetFinalizeRef.current();
          } else if (
            pendingImportRevisionRef.current &&
            revision === pendingImportRevisionRef.current &&
            pendingImportFinalizeRef.current
          ) {
            void pendingImportFinalizeRef.current();
          } else if (!pendingResetRevisionRef.current && !pendingImportRevisionRef.current) {
            setStorageError(false);
          }
        }
        if (type === 'timeout' || type === 'failed') setStorageError(true);
      },
    });
  }

  const loadStoredState = useCallback(() => {
    const attempt = readAttemptRef.current + 1;
    readAttemptRef.current = attempt;
    hydratedRef.current = false;
    setLoading(true);
    setStorageLoadError(false);
    setStorageCorrupt(false);

    let finished = false;
    const timer = setTimeout(() => {
      if (!mountedRef.current || readAttemptRef.current !== attempt || finished) return;
      // Do not create or persist a blank state here. The original read remains
      // observed and may still recover without overwriting saved user data.
      setLoading(false);
      setStorageLoadError(true);
    }, STORAGE_READ_TIMEOUT_MS);

    Promise.resolve()
      .then(() => AsyncStorage.getItem(STORAGE_KEY))
      .then((raw) => {
        if (!mountedRef.current || readAttemptRef.current !== attempt) return;
        finished = true;
        clearTimeout(timer);
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch (_error) {
          const invalid = new Error('invalid_stored_state');
          invalid.code = 'invalid_stored_state';
          throw invalid;
        }
        if (
          parsed !== null &&
          (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.manifestations))
        ) {
          const invalid = new Error('invalid_stored_state');
          invalid.code = 'invalid_stored_state';
          throw invalid;
        }
        const merged = mergeDefensivo(parsed);
        const needsRepair = !!raw && JSON.stringify(parsed) !== JSON.stringify(merged);
        hydratedRef.current = true;
        desiredLanguageRef.current = merged.lang;
        // A valid old/corrupted shape is upgraded once. A genuinely empty
        // storage remains untouched until the person changes something.
        skipNextPersistRef.current = !needsRepair;
        setState(merged);
        setStorageError(false);
        setStorageLoadError(false);
        setStorageCorrupt(false);
        setLoading(false);
      })
      .catch((error) => {
        if (!mountedRef.current || readAttemptRef.current !== attempt) return;
        finished = true;
        clearTimeout(timer);
        hydratedRef.current = false;
        setLoading(false);
        setStorageLoadError(true);
        setStorageCorrupt(error && error.code === 'invalid_stored_state');
      });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadStoredState();
    return () => {
      mountedRef.current = false;
      readAttemptRef.current += 1;
      if (writerRef.current) writerRef.current.dispose();
    };
  }, [loadStoredState]);

  const retryLoad = useCallback(() => {
    loadStoredState();
  }, [loadStoredState]);

  const repairCorruptedStorage = useCallback(async () => {
    if (!storageCorrupt || storageRepairRef.current) return false;
    storageRepairRef.current = true;
    let timeoutId;
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('storage_repair_timeout')),
        STORAGE_WRITE_TIMEOUT_MS
      );
    });
    try {
      await Promise.race([AsyncStorage.removeItem(STORAGE_KEY), timeout]);
      if (!mountedRef.current) return false;
      generationEpochRef.current += 1;
      setStorageCorrupt(false);
      setStorageLoadError(false);
      loadStoredState();
      return true;
    } catch (_error) {
      if (mountedRef.current) setStorageLoadError(true);
      return false;
    } finally {
      clearTimeout(timeoutId);
      storageRepairRef.current = false;
    }
  }, [loadStoredState, storageCorrupt]);

  useEffect(() => {
    if (!state || !hydratedRef.current || !writerRef.current) return;
    if (
      storageMutationRef.current ||
      pendingResetRevisionRef.current ||
      pendingImportRevisionRef.current
    ) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const snapshot = pendingOnboardingRef.current
      ? { ...state, onboardingDone: true }
      : state;
    writerRef.current.enqueue(JSON.stringify(snapshot));
  }, [state]);

  const retryPersist = useCallback(async () => {
    if (!state || !hydratedRef.current || !writerRef.current) return false;
    if (pendingStoragePreparationRef.current) {
      const preparation = pendingStoragePreparationRef.current;
      const outcome = await settleWithin(preparation.promise, STORAGE_WRITE_TIMEOUT_MS);
      if (!outcome.settled || outcome.error || outcome.value !== true) {
        if (mountedRef.current) setStorageError(true);
        return false;
      }
    }
    if (pendingResetRevisionRef.current) {
      const pendingRevision = pendingResetRevisionRef.current;
      writerRef.current.resume();
      const saved = await writerRef.current.waitFor(pendingRevision, STORAGE_WRITE_TIMEOUT_MS);
      if (saved && pendingResetFinalizeRef.current) {
        const finalized = await settleWithin(
          pendingResetFinalizeRef.current(),
          STORAGE_WRITE_TIMEOUT_MS
        );
        if (finalized.settled && !finalized.error) return finalized.value === true;
      }
      if (mountedRef.current) setStorageError(true);
      return false;
    }
    if (pendingImportRevisionRef.current) {
      const pendingRevision = pendingImportRevisionRef.current;
      writerRef.current.resume();
      const saved = await writerRef.current.waitFor(pendingRevision, STORAGE_WRITE_TIMEOUT_MS);
      if (saved && pendingImportFinalizeRef.current) {
        const finalized = await settleWithin(
          pendingImportFinalizeRef.current(),
          STORAGE_WRITE_TIMEOUT_MS
        );
        if (finalized.settled && !finalized.error) return finalized.value === true;
      }
      if (mountedRef.current) setStorageError(true);
      return false;
    }
    const completesOnboarding = pendingOnboardingRef.current;
    const next = completesOnboarding ? { ...state, onboardingDone: true } : state;
    const revision = writerRef.current.enqueue(JSON.stringify(next));
    writerRef.current.resume();
    const saved = await writerRef.current.waitFor(revision, STORAGE_WRITE_TIMEOUT_MS);
    if (saved) {
      if (completesOnboarding) {
        pendingOnboardingRef.current = false;
        setState((current) => ({ ...current, onboardingDone: true }));
      }
      setStorageError(false);
      return true;
    }
    if (mountedRef.current) setStorageError(true);
    return false;
  }, [state]);

  /*
   * State persistence is intentionally serialized above. A timeout releases
   * the interface but does not start a competing write: AsyncStorage promises
   * cannot be cancelled, and a late older write must never overwrite a newer
   * one.
   */

  // O desejo digitado vira afirmação + cena montadas com as respostas do
  // onboarding (utils/dreamToAffirmation). Antes disso, todo desejo virava a
  // MESMA frase de template em inglês e o state.profile nunca era lido — o app
  // prometia conteúdo "criado a partir das suas respostas" e não cumpria.
  const translateAndStoreVariant = useCallback(async ({
    id,
    sourceLang,
    targetLang,
    sourceVariant,
    expectedTargetVariant,
    profile,
    generationEpoch,
    languageEpoch,
  }) => {
    let remote;
    try {
      remote = await translateManifestationScene({
        sourceLang,
        targetLang,
        scene: sourceVariant,
        profile,
      });
    } catch (_error) {
      // The language-native local fallback remains usable. Personal text and
      // network errors are deliberately never logged.
      return;
    }
    if (
      !mountedRef.current ||
      generationEpoch !== generationEpochRef.current ||
      languageEpoch !== translationLanguageEpochRef.current
    ) return;

    const translated = manifestationVariantFromScene({
      title: remote.scene.title,
      scene: remote.scene,
      generation: remote.generation,
    });
    setState((currentState) => {
      if (
        !currentState ||
        currentState.lang !== targetLang ||
        generationEpoch !== generationEpochRef.current ||
        languageEpoch !== translationLanguageEpochRef.current
      ) return currentState;
      const index = currentState.manifestations.findIndex((item) => item.id === id);
      if (index < 0) return currentState;
      const current = currentState.manifestations[index];
      const nextItem = applyTranslatedManifestationVariant(current, {
        sourceLang,
        targetLang,
        sourceVariant,
        expectedTargetVariant,
        translatedVariant: translated,
      });
      if (nextItem === current) return currentState;
      const manifestations = [...currentState.manifestations];
      manifestations[index] = nextItem;
      return { ...currentState, manifestations };
    });
  }, []);

  const addManifestation = useCallback(async (data) => {
    const generationEpoch = generationEpochRef.current;
    const snapshot = stateRef.current || initialState();
    const lang = data.lang === 'en' || data.lang === 'pt' ? data.lang : snapshot.lang || 'pt';
    // Onboarding saves the profile immediately before creating the first scene.
    // Passing it explicitly avoids a React state race on that final transition.
    const profile = { ...(snapshot.profile || {}), ...(data.profile || {}) };
    const local = dreamToAffirmation(data.title, profile, lang, data.category);
    let generated = local;
    let generation = {
      source: 'local',
      promptVersion: 'local-v1',
    };

    // The personal profile only leaves the device after explicit 18+ consent.
    // A network/configuration/safety failure falls back to the tested local
    // generator, so the reward screen never becomes a dead end.
    if (
      !isKnownMinor(profile) &&
      profile.cloudPersonalization === true &&
      profile.cloudAdultConfirmed === true
    ) {
      try {
        const remote = await generatePersonalizedScene({
          desire: data.title,
          category: data.category || 'Wealth',
          lang,
          profile,
        });
        generated = { ...local, ...remote.scene, usouDoPerfil: remote.scene.personalizedWith };
        generation = remote.generation;
      } catch (e) {
        // No payload/error logging: onboarding answers can be intimate.
      }
    }

    // Reset/import may happen while Gemini is answering. A result born in the
    // previous state must never reappear inside the replacement state.
    if (generationEpoch !== generationEpochRef.current) return null;

    const id = `m-${Date.now()}`;
    const item = {
      id,
      title: data.title,
      category: data.category || 'Wealth',
      accent: typeof data.accent === 'number' ? data.accent : 0,
      lang, // variante visível; contentByLang preserva PT e EN sem perder edições
      intention: generated.intention,
      affirmation: generated.affirmation,
      story: generated.story,
      anchorIdentity: generated.anchorIdentity,
      anchorStep: generated.anchorStep,
      // o que do perfil foi usado — a tela mostra isso como recibo honesto
      personalizedWith: generated.usouDoPerfil || [],
      generation,
      goalDays: data.goalDays || 21,
      createdAt: todayISO(),
      sessions: [],
      evidence: [],
    };
    const bilingualItem = localizeManifestation(item, profile, lang);
    setState((s) => {
      if (!s || generationEpoch !== generationEpochRef.current) return s;
      // The app language may have changed while the first Gemini request was
      // running. Insert the item in the language that is active now.
      const visibleItem = localizeManifestation(bilingualItem, profile, s.lang);
      return { ...s, manifestations: [visibleItem, ...s.manifestations] };
    });

    return id;
  }, [translateAndStoreVariant]);

  // Regra ÚNICA de marcar/desmarcar prática por data (sessions = lista de ISO).
  // `on`: true marca, false desmarca, undefined alterna. Não confirma nada —
  // quem chama confirma (confirmAsync) ANTES de desfazer. Ao cruzar goalDays
  // pela 1ª vez grava completedAt (e não apaga se desmarcar depois — honesto).
  const setPractice = useCallback((id, day, on) => {
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) => {
        if (m.id !== id) return m;
        const marcado = m.sessions.includes(day);
        const quer = on === undefined ? !marcado : on;
        if (quer === marcado) return m;
        const sessions = quer ? [...m.sessions, day] : m.sessions.filter((d) => d !== day);
        const next = { ...m, sessions };
        if (quer && !m.completedAt && sessions.length >= m.goalDays) next.completedAt = todayISO();
        return next;
      }),
    }));
  }, []);

  const togglePractice = useCallback((id, dateIso) => setPractice(id, dateIso || todayISO()), [setPractice]);
  // Atalhos de hoje: logSession só marca (2ª prática no dia não desmarca), undo só desmarca.
  const logSession = useCallback((id) => setPractice(id, todayISO(), true), [setPractice]);
  const undoSession = useCallback((id) => setPractice(id, todayISO(), false), [setPractice]);

  const updateManifestation = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) => {
        if (m.id !== id) return m;
        const next = { ...m, ...patch };
        const contentFields = [
          'title',
          'intention',
          'affirmation',
          'story',
          'anchorIdentity',
          'anchorStep',
          'personalizedWith',
        ];
        const editsContent = contentFields.some((field) =>
          Object.prototype.hasOwnProperty.call(patch, field)
        );
        if (!editsContent) return next;
        const editedVariant = {
          ...snapshotManifestationContent(next),
          generation: {
            source: 'user-edited',
            promptVersion: 'user-edit-v1',
          },
        };
        return {
          ...next,
          ...editedVariant,
          originLang: m.originLang === 'en' || m.originLang === 'pt' ? m.originLang : m.lang,
          contentByLang: {
            ...(m.contentByLang || {}),
            [m.lang]: editedVariant,
          },
        };
      }),
    }));
  }, []);

  const addEvidence = useCallback((id, text) => {
    const body = String(text || '').trim().slice(0, 280);
    if (!body) return false;
    const entry = { id: `e-${Date.now()}`, text: body, createdAt: new Date().toISOString() };
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) =>
        m.id === id ? { ...m, evidence: [entry, ...(Array.isArray(m.evidence) ? m.evidence : [])] } : m
      ),
    }));
    return true;
  }, []);

  const updateEvidence = useCallback((manifestationId, evidenceId, text) => {
    const body = String(text || '').trim().slice(0, 280);
    if (!body) return false;
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) =>
        m.id !== manifestationId
          ? m
          : {
              ...m,
              evidence: (Array.isArray(m.evidence) ? m.evidence : []).map((entry) =>
                entry.id === evidenceId ? { ...entry, text: body, updatedAt: new Date().toISOString() } : entry
              ),
            }
      ),
    }));
    return true;
  }, []);

  const removeEvidence = useCallback((manifestationId, evidenceId) => {
    setState((s) => ({
      ...s,
      manifestations: s.manifestations.map((m) =>
        m.id !== manifestationId
          ? m
          : { ...m, evidence: (Array.isArray(m.evidence) ? m.evidence : []).filter((entry) => entry.id !== evidenceId) }
      ),
    }));
  }, []);

  const removeManifestation = useCallback((id) => {
    setState((s) => {
      const alarmId = `manifestation:${id}`;
      const usedAsAlarm = s.morningRitual?.wakeAffirmationId === alarmId;
      return {
        ...s,
        manifestations: s.manifestations.filter((m) => m.id !== id),
        favoriteAffirmations: s.favoriteAffirmations.filter(
          (favoriteId) => favoriteId !== alarmId
        ),
        ...(usedAsAlarm
          ? {
              morningRitual: {
                ...s.morningRitual,
                reminderEnabled: false,
                wakeAffirmationId: null,
                wakeAffirmationText: '',
                wakeAffirmationLang: s.lang === 'en' ? 'en' : 'pt',
              },
            }
          : {}),
      };
    });
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
    setState((s) => ({ ...s, name: shortText(name, 80) || s.name }));
  }, []);

  const resetAll = useCallback(async () => {
    if (
      resetInProgressRef.current ||
      storageMutationRef.current ||
      pendingResetRevisionRef.current ||
      pendingImportRevisionRef.current ||
      !hydratedRef.current ||
      !writerRef.current
    ) return false;
    resetInProgressRef.current = true;
    storageMutationRef.current = 'reset';
    setStorageMutation('reset');
    generationEpochRef.current += 1;
    pendingOnboardingRef.current = false;
    const current = stateRef.current || initialState();
    // Reset apaga os dados, não as preferências: idioma e clima ficam
    // (senão quem tem celular em inglês volta pro inglês do detectLang).
    const next = { ...initialState(), lang: current.lang, mood: current.mood };
    let communityToken = null;
    let preparationPromise = null;
    try {
      preparationPromise = (async () => {
        communityToken = await beginCommunityDataReset();
        // Privacy-sensitive auxiliary records must be gone before the empty
        // onboarding can ever become visible again.
        await AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS);
        const revision = writerRef.current.enqueue(JSON.stringify(next));
        if (!revision) throw new Error('storage_writer_unavailable');
        pendingResetRevisionRef.current = revision;

        let finalizePromise = null;
        const finalizeReset = () => {
          if (pendingResetRevisionRef.current !== revision) return Promise.resolve(false);
          if (finalizePromise) return finalizePromise;
          finalizePromise = (async () => {
            const slowTimer = setTimeout(() => {
              if (mountedRef.current) setStorageError(true);
            }, STORAGE_WRITE_TIMEOUT_MS);
            try {
              // The generation barrier rejects submits that started before reset;
              // this final pass waits for their local writes before unlocking.
              await AsyncStorage.multiRemove(AUXILIARY_STORAGE_KEYS);
              await finishCommunityDataReset(communityToken);
              if (mountedRef.current) {
                skipNextPersistRef.current = true;
                desiredLanguageRef.current = next.lang;
                setState(next);
                setStorageError(false);
                setStorageMutation(null);
              }
              storageMutationRef.current = null;
              pendingResetRevisionRef.current = 0;
              pendingResetFinalizeRef.current = null;
              return true;
            } catch (_error) {
              finalizePromise = null;
              if (mountedRef.current) setStorageError(true);
              return false;
            } finally {
              clearTimeout(slowTimer);
            }
          })();
          return finalizePromise;
        };
        pendingResetFinalizeRef.current = finalizeReset;
        writerRef.current.resume();
        return true;
      })();
      const preparation = { kind: 'reset', promise: preparationPromise };
      pendingStoragePreparationRef.current = preparation;
      void preparationPromise.then(
        () => {
          if (pendingStoragePreparationRef.current === preparation) {
            pendingStoragePreparationRef.current = null;
          }
        },
        () => {
          if (pendingStoragePreparationRef.current === preparation) {
            pendingStoragePreparationRef.current = null;
          }
          if (!pendingResetRevisionRef.current && storageMutationRef.current === 'reset') {
            cancelCommunityDataReset(communityToken);
            storageMutationRef.current = null;
            if (mountedRef.current) {
              setStorageError(true);
              setStorageMutation(null);
            }
          }
        }
      );

      const prepared = await settleWithin(preparationPromise, STORAGE_WRITE_TIMEOUT_MS);
      if (!prepared.settled || prepared.error || prepared.value !== true) {
        if (mountedRef.current) setStorageError(true);
        if (prepared.error && !pendingResetRevisionRef.current) {
          cancelCommunityDataReset(communityToken);
          storageMutationRef.current = null;
          if (mountedRef.current) setStorageMutation(null);
        }
        return false;
      }
      const revision = pendingResetRevisionRef.current;
      const saved = await writerRef.current.waitFor(revision, STORAGE_WRITE_TIMEOUT_MS);
      if (!saved) {
        if (mountedRef.current) setStorageError(true);
        return false;
      }
      const finalized = await settleWithin(
        pendingResetFinalizeRef.current(),
        STORAGE_WRITE_TIMEOUT_MS
      );
      if (!finalized.settled || finalized.error) {
        if (mountedRef.current) setStorageError(true);
        return false;
      }
      return finalized.value === true;
    } catch (_error) {
      if (mountedRef.current) {
        setStorageError(true);
        if (!pendingResetRevisionRef.current) {
          cancelCommunityDataReset(communityToken);
          storageMutationRef.current = null;
          setStorageMutation(null);
        }
      }
      return false;
    } finally {
      resetInProgressRef.current = false;
    }
  }, []);

  // Clima escolhido na Jornada — persiste junto com o resto do estado.
  const setMood = useCallback((m) => {
    if (!VISUAL_MOODS.includes(m)) return;
    setState((s) => ({ ...s, mood: m }));
  }, []);

  const setNarrator = useCallback((narratorId) => {
    if (!isNarratorId(narratorId)) return;
    setState((s) => ({ ...s, narration: { narratorId } }));
  }, []);

  const saveMorningRitualPreferences = useCallback((patch) => {
    setState((s) => {
      const current = s.morningRitual || initialState().morningRitual;
      const next = { ...current };
      if (patch && typeof patch.reminderEnabled === 'boolean') {
        next.reminderEnabled = patch.reminderEnabled;
      }
      if (patch && typeof patch.alarmSyncError === 'boolean') {
        next.alarmSyncError = patch.alarmSyncError;
      }
      if (patch && validTime(patch.reminderTime)) next.reminderTime = patch.reminderTime;
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'wakeAffirmationId')) {
        next.wakeAffirmationId = shortText(patch.wakeAffirmationId, 160) || null;
      }
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'wakeAffirmationText')) {
        next.wakeAffirmationText = shortText(patch.wakeAffirmationText, 800);
      }
      if (patch && (patch.wakeAffirmationLang === 'pt' || patch.wakeAffirmationLang === 'en')) {
        next.wakeAffirmationLang = patch.wakeAffirmationLang;
      }
      return { ...s, morningRitual: next };
    });
  }, []);

  const saveDreamRitual = useCallback((data) => {
    const dream = shortText(data && data.dream, 1600);
    const affirmation = shortText(data && data.affirmation, 800);
    if (!dream || !affirmation) return null;

    const feeling = RITUAL_FEELINGS.includes(data.feeling) ? data.feeling : '';
    const theme = RITUAL_THEMES.includes(data.theme) ? data.theme : 'clarity';
    const reflection = shortText(data.reflection, 800);
    const dreamAnchor = shortText(data.dreamAnchor, 120);
    const lang = data.lang === 'en' ? 'en' : 'pt';
    const signature = JSON.stringify({ dream, affirmation, feeling, theme, reflection, dreamAnchor, lang });
    const nowMs = Date.now();
    const previous = lastDreamSaveRef.current;
    if (
      previous.epoch === generationEpochRef.current &&
      previous.signature === signature &&
      nowMs - previous.at < 1500
    ) {
      return previous.id;
    }

    const now = new Date(nowMs).toISOString();
    const id = `dream-${nowMs}-${Math.random().toString(36).slice(2, 7)}`;
    lastDreamSaveRef.current = {
      epoch: generationEpochRef.current,
      signature,
      id,
      at: nowMs,
    };
    const item = {
      id,
      dream,
      feeling,
      theme,
      affirmation,
      reflection,
      dreamAnchor,
      usedDetails: (Array.isArray(data.usedDetails) ? data.usedDetails : [])
        .filter((key) => RITUAL_DETAIL_KEYS.includes(key))
        .filter((key, index, values) => values.indexOf(key) === index),
      generatorVersion: shortText(data.generatorVersion, 40) || 'dream-local-v2',
      lang,
      createdAt: now,
      practiceCount: 0,
      lastPracticedAt: null,
    };
    setState((s) => {
      const ritual = s.morningRitual || initialState().morningRitual;
      return {
        ...s,
        morningRitual: { ...ritual, entries: [item, ...(ritual.entries || [])].slice(0, 90) },
      };
    });
    return id;
  }, []);

  const markDreamRitualPracticed = useCallback((id) => {
    const practicedAt = new Date().toISOString();
    const day = todayISO();
    setState((s) => {
      const ritual = s.morningRitual || initialState().morningRitual;
      return {
        ...s,
        affirmationDates: Array.from(new Set([...(s.affirmationDates || []), day])),
        morningRitual: {
          ...ritual,
          entries: (ritual.entries || []).map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  practiceCount: (Number(entry.practiceCount) || 0) + 1,
                  lastPracticedAt: practicedAt,
                }
              : entry
          ),
        },
      };
    });
  }, []);

  const removeDreamRitual = useCallback((id) => {
    const target = shortText(id, 160);
    if (!target) return;
    if (lastDreamSaveRef.current.id === target) {
      lastDreamSaveRef.current = { epoch: -1, signature: '', id: null, at: 0 };
    }
    setState((s) => {
      const ritual = s.morningRitual || initialState().morningRitual;
      const usedAsAlarm = ritual.wakeAffirmationId === `ritual:${target}`;
      return {
        ...s,
        morningRitual: {
          ...ritual,
          entries: (ritual.entries || []).filter((entry) => entry.id !== target),
          ...(usedAsAlarm
            ? {
                reminderEnabled: false,
                wakeAffirmationId: null,
                wakeAffirmationText: '',
              }
            : {}),
        },
      };
    });
  }, []);

  const exportStateJson = useCallback(() => JSON.stringify(state || initialState()), [state]);

  // Import valida (JSON parseável + shape mínimo) e passa pelo mesmo merge
  // defensivo do load. `erro` é código de máquina — a tela traduz via i18n.
  const importStateJson = useCallback(async (str) => {
    let parsed;
    try {
      parsed = JSON.parse(str);
    } catch (e) {
      return { ok: false, erro: 'invalid_json' };
    }
    if (!parsed || !Array.isArray(parsed.manifestations)) {
      return { ok: false, erro: 'invalid_shape' };
    }
    const restored = mergeDefensivo(parsed);
    // Consentimento para enviar respostas ao Gemini pertence a este aparelho e
    // a esta instalação. Um arquivo de backup nunca pode reativá-lo sozinho.
    restored.profile = {
      ...(restored.profile || {}),
      cloudPersonalization: false,
      cloudAdultConfirmed: false,
    };
    if (
      pendingResetRevisionRef.current ||
      pendingImportRevisionRef.current ||
      storageMutationRef.current ||
      !hydratedRef.current ||
      !writerRef.current
    ) {
      return { ok: false, erro: 'storage_unavailable' };
    }
    generationEpochRef.current += 1;
    storageMutationRef.current = 'import';
    setStorageMutation('import');
    const revision = writerRef.current.enqueue(JSON.stringify(restored));
    if (!revision) {
      storageMutationRef.current = null;
      setStorageMutation(null);
      return { ok: false, erro: 'storage_unavailable' };
    }
    pendingImportRevisionRef.current = revision;
    writerRef.current.resume();

    let finalizePromise = null;
    const finalizeImport = () => {
      if (pendingImportRevisionRef.current !== revision) return Promise.resolve(false);
      if (finalizePromise) return finalizePromise;
      finalizePromise = Promise.resolve().then(() => {
        if (mountedRef.current) {
          skipNextPersistRef.current = true;
          desiredLanguageRef.current = restored.lang;
          setState(restored);
          setStorageError(false);
          setStorageMutation(null);
        }
        storageMutationRef.current = null;
        pendingImportRevisionRef.current = 0;
        pendingImportFinalizeRef.current = null;
        return true;
      });
      return finalizePromise;
    };
    pendingImportFinalizeRef.current = finalizeImport;

    const saved = await writerRef.current.waitFor(revision, STORAGE_WRITE_TIMEOUT_MS);
    if (!saved) {
      if (mountedRef.current) setStorageError(true);
      return { ok: false, erro: 'storage_unavailable' };
    }
    const finalized = await finalizeImport();
    return finalized
      ? { ok: true, erro: null }
      : { ok: false, erro: 'storage_unavailable' };
  }, []);

  // ── Onboarding ────────────────────────────────────────────────────────────
  const saveProfile = useCallback((patch) => {
    setState((s) => {
      const profile = { ...(s.profile || {}), ...(patch || {}) };
      if (
        isKnownMinor(profile) ||
        profile.cloudPersonalization !== true ||
        profile.cloudAdultConfirmed !== true
      ) {
        profile.cloudPersonalization = false;
        profile.cloudAdultConfirmed = false;
      }
      return {
        ...s,
        profile,
        name: patch && patch.name ? String(patch.name).trim() : s.name,
      };
    });
  }, []);

  const completeOnboarding = useCallback(async () => {
    const current = stateRef.current;
    if (
      !current ||
      !hydratedRef.current ||
      !writerRef.current ||
      storageMutationRef.current
    ) return false;
    const next = { ...current, onboardingDone: true };
    pendingOnboardingRef.current = true;
    // Confirma a gravacao antes de desmontar o paywall. A fila impede que uma
    // escrita antiga termine depois e devolva onboardingDone para false.
    const revision = writerRef.current.enqueue(JSON.stringify(next));
    writerRef.current.resume();
    const saved = await writerRef.current.waitFor(revision, STORAGE_WRITE_TIMEOUT_MS);
    if (saved) {
      pendingOnboardingRef.current = false;
      // Preserva qualquer mudanca que tenha ocorrido enquanto a gravacao nativa
      // estava pendente; concluir o onboarding altera somente este campo.
      setState((latest) => ({ ...latest, onboardingDone: true }));
      setStorageError(false);
      return true;
    }
    if (mountedRef.current) setStorageError(true);
    return false;
  }, []);

  const resetOnboarding = useCallback(() => {
    generationEpochRef.current += 1;
    setState((s) => ({ ...s, onboardingDone: false }));
  }, []);

  const setLang = useCallback((lang) => {
    const nextLang = lang === 'pt' ? 'pt' : 'en';
    const snapshot = stateRef.current;
    const requestedLang = desiredLanguageRef.current || (snapshot && snapshot.lang);
    if (requestedLang === nextLang) return;
    desiredLanguageRef.current = nextLang;
    const languageEpoch = translationLanguageEpochRef.current + 1;
    translationLanguageEpochRef.current = languageEpoch;
    const generationEpoch = generationEpochRef.current;
    setState((s) => ({
      ...s,
      lang: nextLang,
      manifestations: s.manifestations.map((item) =>
        localizeManifestation(item, s.profile, nextLang)
      ),
    }));

    if (
      !snapshot ||
      isKnownMinor(snapshot.profile) ||
      snapshot.profile.cloudPersonalization !== true ||
      snapshot.profile.cloudAdultConfirmed !== true
    ) {
      return;
    }

    const localizedItems = snapshot.manifestations.map((item) =>
      localizeManifestation(item, snapshot.profile, nextLang)
    );
    const pending = localizedItems.filter((item) =>
      shouldTranslateManifestationVariant(item, nextLang)
    );
    const translateBatch = (offset) => {
      if (
        !mountedRef.current ||
        generationEpoch !== generationEpochRef.current ||
        languageEpoch !== translationLanguageEpochRef.current
      ) return;
      const latest = stateRef.current;
      if (
        !latest ||
        latest.lang !== nextLang ||
        isKnownMinor(latest.profile) ||
        latest.profile.cloudPersonalization !== true ||
        latest.profile.cloudAdultConfirmed !== true
      ) {
        return;
      }
      pending.slice(offset, offset + TRANSLATION_BATCH_SIZE).forEach((queuedItem) => {
        const current = latest.manifestations.find((item) => item.id === queuedItem.id);
        if (!current) return;
        const item = localizeManifestation(current, latest.profile, nextLang);
        if (!shouldTranslateManifestationVariant(item, nextLang)) return;
        void translateAndStoreVariant({
          id: item.id,
          sourceLang: item.originLang,
          targetLang: nextLang,
          sourceVariant: item.contentByLang[item.originLang],
          expectedTargetVariant: item.contentByLang[nextLang],
          profile: latest.profile,
          generationEpoch,
          languageEpoch,
        });
      });
      const nextOffset = offset + TRANSLATION_BATCH_SIZE;
      if (nextOffset < pending.length) {
        setTimeout(() => translateBatch(nextOffset), TRANSLATION_BATCH_DELAY_MS);
      }
    };
    setTimeout(() => translateBatch(0), TRANSLATION_START_DELAY_MS);
  }, [translateAndStoreVariant]);

  const derived = useMemo(() => {
    if (!state) {
      return { allSessionDates: [], streak: 0, totalSessions: 0, completed: 0 };
    }
    const allSessionDates = state.manifestations.flatMap((m) => m.sessions);
    const visionDates = state.visionPlays.map((play) => play && play.date).filter(Boolean);
    const unique = Array.from(new Set([...allSessionDates, ...visionDates, ...state.affirmationDates]));
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
      storageError,
      storageMutation,
      storageLoadError,
      storageCorrupt,
      retryLoad,
      repairCorruptedStorage,
      retryPersist,
      derived,
      addManifestation,
      updateManifestation,
      addEvidence,
      updateEvidence,
      removeEvidence,
      togglePractice,
      logSession,
      undoSession,
      removeManifestation,
      toggleFavoriteAffirmation,
      markAffirmationRead,
      toggleSavedVision,
      logVisionPlay,
      setName,
      setMood,
      setNarrator,
      saveMorningRitualPreferences,
      saveDreamRitual,
      markDreamRitualPracticed,
      removeDreamRitual,
      resetAll,
      exportStateJson,
      importStateJson,
      saveProfile,
      completeOnboarding,
      resetOnboarding,
      setLang,
    }),
    [
      state,
      loading,
      storageError,
      storageMutation,
      storageLoadError,
      storageCorrupt,
      retryLoad,
      repairCorruptedStorage,
      retryPersist,
      derived,
      addManifestation,
      updateManifestation,
      addEvidence,
      updateEvidence,
      removeEvidence,
      togglePractice,
      logSession,
      undoSession,
      removeManifestation,
      toggleFavoriteAffirmation,
      markAffirmationRead,
      toggleSavedVision,
      logVisionPlay,
      setName,
      setMood,
      setNarrator,
      saveMorningRitualPreferences,
      saveDreamRitual,
      markDreamRitualPracticed,
      removeDreamRitual,
      resetAll,
      exportStateJson,
      importStateJson,
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
