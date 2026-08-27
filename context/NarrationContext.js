import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';

import {
  clearNarrationAudioMemoryCache,
  normalizeNarrationText,
  requestNarrationAudio,
  splitNarrationText,
} from '../services/generateNarrationAudio';

const NarrationCtx = createContext(null);
let nativeFileSequence = 0;
let playbackSequence = 0;
let narrationAudioModePromise = null;
const WEB_PLAY_START_TIMEOUT_MS = 1800;

const NARRATION_AUDIO_MODE = Object.freeze({
  playsInSilentMode: true,
  allowsRecording: false,
  interruptionMode: 'doNotMix',
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
});

export const NARRATION_PLAYBACK_RATES = Object.freeze([0.75, 1, 1.25, 1.5]);

function configureNarrationAudioMode(
  setMode = setAudioModeAsync,
  platform = Platform.OS
) {
  if (platform === 'web') return Promise.resolve(true);
  if (!narrationAudioModePromise) {
    narrationAudioModePromise = Promise.resolve()
      .then(() => setMode(NARRATION_AUDIO_MODE))
      .then(() => true)
      .catch(() => {
        // A later playback can retry a transient native audio-session failure.
        narrationAudioModePromise = null;
        return false;
      });
  }
  return narrationAudioModePromise;
}

function supportedPlaybackRate(value) {
  const requested = Number(value);
  return NARRATION_PLAYBACK_RATES.includes(requested) ? requested : 1;
}

function aggregatePlaybackMetrics(chunkProgress, localTime, localDuration) {
  const totalWeight = Math.max(0, Number(chunkProgress.totalWeight) || 0);
  const completedWeight = Math.max(0, Number(chunkProgress.completedWeight) || 0);
  const currentWeight = Math.max(0, Number(chunkProgress.currentWeight) || 0);
  const safeLocalTime = Math.max(0, Number(localTime) || 0);
  const safeLocalDuration = Math.max(0, Number(localDuration) || 0);
  const localRatio = safeLocalDuration
    ? Math.max(0, Math.min(1, safeLocalTime / safeLocalDuration))
    : 0;
  const progress = totalWeight
    ? Math.max(
        0,
        Math.min(1, (completedWeight + currentWeight * localRatio) / totalWeight)
      )
    : 0;
  const totalDuration = safeLocalDuration && currentWeight
    ? (safeLocalDuration * totalWeight) / currentWeight
    : 0;

  return {
    progress,
    elapsedTime: totalDuration * progress,
    totalDuration,
  };
}

function errorCode(error) {
  return error && typeof error.code === 'string' ? error.code : 'audio_unavailable';
}

function narrationError(code) {
  return Object.assign(new Error(code), { code });
}

function webPlaybackFailure(error) {
  const blocked = error && error.name === 'NotAllowedError';
  return {
    ok: false,
    error: blocked ? 'audio_autoplay_blocked' : 'audio_playback_failed',
    recoverable: blocked,
  };
}

function attemptWebPlayback(audio, timeoutMs = WEB_PLAY_START_TIMEOUT_MS) {
  let started;
  try {
    started = audio.play();
  } catch (error) {
    return Promise.resolve(webPlaybackFailure(error));
  }

  if (!started || typeof started.then !== 'function') {
    return Promise.resolve(
      audio.paused === false
        ? { ok: true, error: null, recoverable: false }
        : { ok: false, error: 'audio_playback_start_timeout', recoverable: true }
    );
  }

  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    timer = setTimeout(
      () =>
        finish({
          ok: false,
          error: 'audio_playback_start_timeout',
          recoverable: true,
        }),
      Math.max(1, Number(timeoutMs) || WEB_PLAY_START_TIMEOUT_MS)
    );

    Promise.resolve(started).then(
      () => finish({ ok: true, error: null, recoverable: false }),
      (error) => finish(webPlaybackFailure(error))
    );
  });
}

function nextPlaybackId() {
  playbackSequence += 1;
  return `celeste-narration-${Date.now()}-${playbackSequence}`;
}

function selectedPlaybackId(value) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 160) : nextPlaybackId();
}

function silentWaveBytes() {
  const sampleCount = 480;
  const bytes = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  ascii(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, sampleCount * 2, true);
  return bytes;
}

const WEB_UNLOCK_WAVE = silentWaveBytes();

function temporaryAudioSource(bytes) {
  if (Platform.OS === 'web') {
    if (
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      throw narrationError('audio_blob_unavailable');
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
    return {
      uri: url,
      dispose: () => {
        try {
          URL.revokeObjectURL(url);
        } catch (_error) {}
      },
    };
  }

  nativeFileSequence += 1;
  const file = new File(
    Paths.cache,
    `celeste-narration-${Date.now()}-${nativeFileSequence}.wav`
  );
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);
  return {
    uri: file.uri,
    dispose: () => {
      try {
        if (file.exists) file.delete();
      } catch (_error) {}
    },
  };
}

export function NarrationProvider({ children }) {
  const player = useAudioPlayer(null, { updateInterval: 200 });
  const status = useAudioPlayerStatus(player);
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState(null);
  const [activeNarratorId, setActiveNarratorId] = useState(null);
  const [activePlaybackId, setActivePlaybackId] = useState(null);
  const [lastCompletedPlaybackId, setLastCompletedPlaybackId] = useState(null);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [webProgress, setWebProgress] = useState({ currentTime: 0, duration: 0 });
  const [chunkProgress, setChunkProgress] = useState({
    index: 0,
    count: 0,
    completedWeight: 0,
    currentWeight: 0,
    totalWeight: 0,
  });
  const sourceRef = useRef(null);
  const unlockSourceRef = useRef(null);
  const webAudioRef = useRef(null);
  const webUnlockingRef = useRef(false);
  const webUnlockPromiseRef = useRef(null);
  const webEndedHandlerRef = useRef(null);
  const webFailureHandlerRef = useRef(null);
  const sequenceRef = useRef(null);
  const requestRef = useRef(null);
  const prepareRequestRef = useRef(null);
  const prepareEpochRef = useRef(0);
  const requestEpochRef = useRef(0);
  const playbackRateRef = useRef(1);
  const mountedRef = useRef(true);

  const ensureWebAudio = useCallback(() => {
    if (Platform.OS !== 'web' || typeof Audio === 'undefined') return null;
    if (!webAudioRef.current) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.playsInline = true;
      audio.playbackRate = playbackRateRef.current;
      if ('preservesPitch' in audio) audio.preservesPitch = true;
      audio.onplaying = () => {
        if (!mountedRef.current || webUnlockingRef.current || !sourceRef.current) return;
        setPhase('playing');
      };
      audio.onwaiting = () => {
        if (!mountedRef.current || webUnlockingRef.current || !sourceRef.current) return;
        setPhase('loading');
      };
      audio.ontimeupdate = () => {
        if (!mountedRef.current || webUnlockingRef.current || !sourceRef.current) return;
        setWebProgress({
          currentTime: Number(audio.currentTime) || 0,
          duration: Number(audio.duration) || 0,
        });
      };
      audio.ondurationchange = audio.ontimeupdate;
      audio.onended = () => {
        if (webUnlockingRef.current || !sourceRef.current) return;
        if (webEndedHandlerRef.current) webEndedHandlerRef.current();
      };
      audio.onerror = () => {
        if (webUnlockingRef.current || !sourceRef.current) return;
        if (webFailureHandlerRef.current) {
          webFailureHandlerRef.current('audio_playback_failed');
        }
      };
      webAudioRef.current = audio;
    }
    return webAudioRef.current;
  }, []);

  const releaseUnlockSource = useCallback(() => {
    const source = unlockSourceRef.current;
    unlockSourceRef.current = null;
    webUnlockPromiseRef.current = null;
    if (source) source.dispose();
  }, []);

  const releaseSource = useCallback(() => {
    const source = sourceRef.current;
    sourceRef.current = null;
    if (Platform.OS === 'web') {
      const audio = webAudioRef.current;
      if (audio) {
        try {
          audio.pause();
          audio.loop = false;
          audio.removeAttribute('src');
          audio.load();
        } catch (_error) {}
      }
      if (mountedRef.current) setWebProgress({ currentTime: 0, duration: 0 });
    } else {
      try {
        player.pause();
        player.replace(null);
      } catch (_error) {}
    }
    if (source) source.dispose();
  }, [player]);

  const cancelRequest = useCallback(() => {
    const controller = requestRef.current;
    requestRef.current = null;
    if (controller) controller.abort();
  }, []);

  const cancelPrepare = useCallback(() => {
    prepareEpochRef.current += 1;
    const controller = prepareRequestRef.current;
    prepareRequestRef.current = null;
    if (controller) controller.abort();
  }, []);

  const blessWebAudio = useCallback(() => {
    if (Platform.OS !== 'web') return Promise.resolve(true);
    const audio = ensureWebAudio();
    if (!audio) return Promise.resolve(false);

    releaseUnlockSource();
    try {
      const unlockSource = temporaryAudioSource(WEB_UNLOCK_WAVE);
      unlockSourceRef.current = unlockSource;
      webUnlockingRef.current = true;
      audio.loop = true;
      // The samples are all zero, so this is silent without using `muted`.
      // WebKit can otherwise allow only the muted playback and block the later voice.
      audio.muted = false;
      audio.src = unlockSource.uri;
      audio.load();
      const unlocking = attemptWebPlayback(audio).then((result) => {
        if (
          unlockSourceRef.current !== unlockSource ||
          webAudioRef.current !== audio
        ) {
          return false;
        }
        if (result.ok) return true;
        try {
          audio.pause();
        } catch (_error) {}
        webUnlockingRef.current = false;
        releaseUnlockSource();
        return false;
      });
      webUnlockPromiseRef.current = unlocking;
      return unlocking;
    } catch (_error) {
      webUnlockingRef.current = false;
      releaseUnlockSource();
      return Promise.resolve(false);
    }
  }, [ensureWebAudio, releaseUnlockSource]);

  const isCurrentSequence = useCallback(
    (sequence) =>
      mountedRef.current &&
      sequenceRef.current === sequence &&
      requestEpochRef.current === sequence.epoch,
    []
  );

  const failSequence = useCallback(
    (sequence, code) => {
      if (!isCurrentSequence(sequence)) return;
      sequenceRef.current = null;
      const controller = requestRef.current;
      requestRef.current = null;
      if (controller) controller.abort();
      releaseSource();
      releaseUnlockSource();
      webUnlockingRef.current = false;
      setPhase('error');
      setError(code);
      setActiveNarratorId(null);
      setActivePlaybackId(null);
    },
    [isCurrentSequence, releaseSource, releaseUnlockSource]
  );

  const finishSequence = useCallback(
    (sequence) => {
      if (!isCurrentSequence(sequence)) return;
      const completedId = sequence.playbackId;
      sequenceRef.current = null;
      requestRef.current = null;
      releaseSource();
      releaseUnlockSource();
      webUnlockingRef.current = false;
      setPhase('idle');
      setError(null);
      setActiveNarratorId(null);
      setActivePlaybackId(null);
      setLastCompletedPlaybackId(completedId);
      setChunkProgress({
        index: Math.max(0, sequence.chunks.length - 1),
        count: sequence.chunks.length,
        completedWeight: sequence.totalWeight,
        currentWeight: 0,
        totalWeight: sequence.totalWeight,
      });
    },
    [isCurrentSequence, releaseSource, releaseUnlockSource]
  );

  const requestChunk = useCallback((sequence, index) => {
    const existing = sequence.pending.get(index);
    if (existing) return existing;
    const promise = requestNarrationAudio({
      ...sequence.request,
      text: sequence.chunks[index],
      signal: sequence.controller ? sequence.controller.signal : undefined,
    });
    sequence.pending.set(index, promise);
    promise.catch(() => {});
    return promise;
  }, []);

  const playChunk = useCallback(
    async (sequence, index) => {
      const bytes = await requestChunk(sequence, index);
      sequence.pending.delete(index);
      if (!isCurrentSequence(sequence)) throw narrationError('audio_cancelled');

      if (Platform.OS === 'web' && sequence.webUnlockPromise) {
        await sequence.webUnlockPromise;
        if (!isCurrentSequence(sequence)) throw narrationError('audio_cancelled');
      }

      const keepsWebUnlock =
        Platform.OS === 'web' && webUnlockingRef.current && !sourceRef.current;
      if (!keepsWebUnlock) releaseSource();
      const source = temporaryAudioSource(bytes);
      if (!isCurrentSequence(sequence)) {
        source.dispose();
        throw narrationError('audio_cancelled');
      }

      sourceRef.current = source;
      sequence.index = index;
      sequence.nativePlayingIndex = null;
      setChunkProgress({
        index,
        count: sequence.chunks.length,
        completedWeight: sequence.weightOffsets[index],
        currentWeight: sequence.chunkWeights[index],
        totalWeight: sequence.totalWeight,
      });
      let readyForGesture = false;
      if (Platform.OS === 'web') {
        const audio = ensureWebAudio();
        if (!audio) throw narrationError('audio_playback_unavailable');
        webUnlockingRef.current = false;
        audio.loop = false;
        audio.muted = false;
        audio.src = source.uri;
        audio.load();
        audio.playbackRate = playbackRateRef.current;
        if ('preservesPitch' in audio) audio.preservesPitch = true;
        releaseUnlockSource();
        const playback = await attemptWebPlayback(audio);
        if (!isCurrentSequence(sequence)) throw narrationError('audio_cancelled');
        if (!playback.ok) {
          if (!playback.recoverable) throw narrationError(playback.error);
          try {
            audio.pause();
          } catch (_error) {}
          // Keep the generated blob and sequence alive for a fresh user gesture.
          setPhase('ready');
          setError(playback.error);
          readyForGesture = true;
        } else {
          setPhase('playing');
          setError(null);
        }
      } else {
        player.replace({ uri: source.uri });
        player.setPlaybackRate(playbackRateRef.current, 'high');
        player.play();
        setPhase('loading');
      }

      if (index + 1 < sequence.chunks.length) {
        requestChunk(sequence, index + 1);
      }
      return { ready: readyForGesture };
    },
    [ensureWebAudio, isCurrentSequence, player, releaseSource, releaseUnlockSource, requestChunk]
  );

  const advanceChunk = useCallback(
    async (expectedIndex) => {
      const sequence = sequenceRef.current;
      if (!sequence || !isCurrentSequence(sequence) || sequence.advancing) return;
      if (Number.isInteger(expectedIndex) && sequence.index !== expectedIndex) return;
      if (sequence.endedIndex === sequence.index) return;
      sequence.endedIndex = sequence.index;
      sequence.advancing = true;

      const nextIndex = sequence.index + 1;
      if (nextIndex >= sequence.chunks.length) {
        sequence.advancing = false;
        finishSequence(sequence);
        return;
      }

      setPhase('loading');
      try {
        await playChunk(sequence, nextIndex);
      } catch (playError) {
        if (isCurrentSequence(sequence)) failSequence(sequence, errorCode(playError));
      } finally {
        if (isCurrentSequence(sequence)) sequence.advancing = false;
      }
    },
    [failSequence, finishSequence, isCurrentSequence, playChunk]
  );

  webEndedHandlerRef.current = () => {
    const sequence = sequenceRef.current;
    if (sequence) advanceChunk(sequence.index);
  };
  webFailureHandlerRef.current = (code) => {
    const sequence = sequenceRef.current;
    if (sequence) failSequence(sequence, code);
  };

  const stop = useCallback(
    (expectedPlaybackId) => {
      const sequence = sequenceRef.current;
      if (
        typeof expectedPlaybackId === 'string' &&
        (!sequence || sequence.playbackId !== expectedPlaybackId)
      ) {
        return false;
      }
      requestEpochRef.current += 1;
      sequenceRef.current = null;
      cancelRequest();
      releaseSource();
      releaseUnlockSource();
      webUnlockingRef.current = false;
      if (mountedRef.current) {
        setPhase('idle');
        setError(null);
        setActiveNarratorId(null);
        setActivePlaybackId(null);
        setLastCompletedPlaybackId(null);
        setChunkProgress({
          index: 0,
          count: 0,
          completedWeight: 0,
          currentWeight: 0,
          totalWeight: 0,
        });
      }
      return true;
    },
    [cancelRequest, releaseSource, releaseUnlockSource]
  );

  const prime = useCallback(() => {
    if (Platform.OS !== 'web') return true;
    requestEpochRef.current += 1;
    sequenceRef.current = null;
    cancelRequest();
    releaseSource();
    releaseUnlockSource();
    webUnlockingRef.current = false;
    setPhase('idle');
    setError(null);
    setActiveNarratorId(null);
    setActivePlaybackId(null);
    setLastCompletedPlaybackId(null);
    return blessWebAudio();
  }, [blessWebAudio, cancelRequest, releaseSource, releaseUnlockSource]);

  const start = useCallback(
    async (request) => {
      if (Platform.OS !== 'web') {
        const audioModeReady = await configureNarrationAudioMode();
        if (!audioModeReady) {
          const code = 'audio_session_unavailable';
          if (mountedRef.current) {
            setPhase('error');
            setError(code);
            setActiveNarratorId(null);
            setActivePlaybackId(null);
            setLastCompletedPlaybackId(null);
          }
          return { ok: false, error: code };
        }
      }

      let chunks;
      try {
        chunks = request.mode === 'personal' ? splitNarrationText(request.text) : [undefined];
      } catch (requestError) {
        const code = errorCode(requestError);
        requestEpochRef.current += 1;
        sequenceRef.current = null;
        cancelRequest();
        releaseSource();
        releaseUnlockSource();
        webUnlockingRef.current = false;
        if (mountedRef.current) {
          setPhase('error');
          setError(code);
          setActiveNarratorId(null);
          setActivePlaybackId(null);
          setLastCompletedPlaybackId(null);
          setChunkProgress({
            index: 0,
            count: 0,
            completedWeight: 0,
            currentWeight: 0,
            totalWeight: 0,
          });
        }
        return { ok: false, error: code };
      }

      const epoch = requestEpochRef.current + 1;
      requestEpochRef.current = epoch;
      cancelRequest();
      sequenceRef.current = null;
      const hasPrimedWebAudio =
        Platform.OS === 'web' &&
        webUnlockingRef.current &&
        Boolean(unlockSourceRef.current) &&
        Boolean(webUnlockPromiseRef.current) &&
        !sourceRef.current;
      let webAudioReady = hasPrimedWebAudio ? webUnlockPromiseRef.current : Promise.resolve(true);
      if (!hasPrimedWebAudio) {
        releaseSource();
        releaseUnlockSource();
        // This runs in the original tap/click stack when start is called directly.
        webAudioReady = blessWebAudio();
      }
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const playbackId = selectedPlaybackId(request.playbackId);
      const { playbackId: _ignoredPlaybackId, text: _ignoredText, ...baseRequest } = request;
      const chunkWeights = chunks.map((chunk) => Math.max(1, String(chunk || '').length));
      const weightOffsets = chunkWeights.map((_, index) =>
        chunkWeights.slice(0, index).reduce((sum, weight) => sum + weight, 0)
      );
      const totalWeight = chunkWeights.reduce((sum, weight) => sum + weight, 0);
      const sequence = {
        epoch,
        playbackId,
        request: baseRequest,
        chunks,
        index: -1,
        endedIndex: -2,
        nativePlayingIndex: null,
        advancing: false,
        pending: new Map(),
        controller,
        webUnlockPromise: Platform.OS === 'web' ? Promise.resolve(webAudioReady) : null,
        chunkWeights,
        weightOffsets,
        totalWeight,
      };
      sequenceRef.current = sequence;
      requestRef.current = controller;
      setPhase('loading');
      setError(null);
      setActiveNarratorId(request.narratorId);
      setActivePlaybackId(playbackId);
      setLastCompletedPlaybackId(null);
      setChunkProgress({
        index: 0,
        count: chunks.length,
        completedWeight: 0,
        currentWeight: chunkWeights[0],
        totalWeight,
      });

      try {
        const playback = await playChunk(sequence, 0);
        if (!isCurrentSequence(sequence)) {
          return { ok: false, error: 'audio_cancelled', playbackId };
        }
        return { ok: true, playbackId, ready: Boolean(playback && playback.ready) };
      } catch (requestError) {
        const code = errorCode(requestError);
        const wasCurrent = isCurrentSequence(sequence);
        if (wasCurrent) failSequence(sequence, code);
        return {
          ok: false,
          error: wasCurrent ? code : 'audio_cancelled',
          playbackId,
        };
      }
    },
    [
      blessWebAudio,
      cancelRequest,
      failSequence,
      isCurrentSequence,
      playChunk,
      releaseSource,
      releaseUnlockSource,
    ]
  );

  const playPreview = useCallback(
    (narratorId, lang = 'pt', playbackId) =>
      start({ mode: 'preview', narratorId, lang, playbackId }),
    [start]
  );

  const playPersonal = useCallback(
    ({ text, narratorId, lang = 'pt', cloudConsent, adultConfirmed, playbackId }) =>
      start({
        mode: 'personal',
        text,
        narratorId,
        lang,
        cloudConsent,
        adultConfirmed,
        playbackId,
      }),
    [start]
  );

  const preparePersonal = useCallback(
    async ({ text, narratorId, lang = 'pt', cloudConsent, adultConfirmed }) => {
      const passage = normalizeNarrationText(text);
      if (!passage || passage.length > 280) return { ok: false, error: 'text_invalid' };

      cancelPrepare();
      const epoch = prepareEpochRef.current;
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      prepareRequestRef.current = controller;
      try {
        const bytes = await requestNarrationAudio({
          mode: 'personal',
          text: passage,
          narratorId,
          lang,
          cloudConsent,
          adultConfirmed,
          signal: controller ? controller.signal : undefined,
        });
        if (!mountedRef.current || prepareEpochRef.current !== epoch) {
          return { ok: false, error: 'audio_cancelled' };
        }
        return { ok: true, bytes };
      } catch (requestError) {
        const code = errorCode(requestError);
        return {
          ok: false,
          error:
            !mountedRef.current || prepareEpochRef.current !== epoch ? 'audio_cancelled' : code,
        };
      } finally {
        if (prepareEpochRef.current === epoch) prepareRequestRef.current = null;
      }
    },
    [cancelPrepare]
  );

  const pause = useCallback(() => {
    if (!sourceRef.current) return false;
    try {
      if (Platform.OS === 'web') {
        const audio = webAudioRef.current;
        if (!audio) return false;
        audio.pause();
      } else {
        player.pause();
      }
      setPhase('paused');
      return true;
    } catch (_error) {
      const sequence = sequenceRef.current;
      if (sequence) failSequence(sequence, 'audio_playback_failed');
      return false;
    }
  }, [failSequence, player]);

  const resume = useCallback(async () => {
    if (!sourceRef.current) return false;
    const sequence = sequenceRef.current;
    try {
      if (Platform.OS === 'web') {
        const audio = webAudioRef.current;
        if (!audio) return false;
        const playback = await attemptWebPlayback(audio);
        if (!sequence || !isCurrentSequence(sequence)) return false;
        if (!playback.ok) {
          if (playback.recoverable) {
            try {
              audio.pause();
            } catch (_error) {}
            setPhase('ready');
            setError(playback.error);
            return false;
          }
          throw narrationError(playback.error);
        }
      } else {
        player.play();
      }
      setPhase('playing');
      setError(null);
      return true;
    } catch (playError) {
      if (sequence) failSequence(sequence, errorCode(playError));
      return false;
    }
  }, [failSequence, isCurrentSequence, player]);

  const setPlaybackRate = useCallback(
    (rate) => {
      const nextRate = supportedPlaybackRate(rate);
      playbackRateRef.current = nextRate;
      setPlaybackRateState(nextRate);
      try {
        if (Platform.OS === 'web') {
          const audio = ensureWebAudio();
          if (audio) {
            audio.playbackRate = nextRate;
            if ('preservesPitch' in audio) audio.preservesPitch = true;
          }
        } else if (sourceRef.current) {
          player.setPlaybackRate(nextRate, 'high');
        }
        return true;
      } catch (_error) {
        return false;
      }
    },
    [ensureWebAudio, player]
  );

  const seek = useCallback(
    async (seconds) => {
      if (!sourceRef.current || !Number.isFinite(Number(seconds))) return false;
      const duration = Platform.OS === 'web'
        ? Number(webAudioRef.current && webAudioRef.current.duration) || 0
        : Number(status.duration) || 0;
      const target = Math.max(0, duration ? Math.min(Number(seconds), duration) : Number(seconds));
      try {
        if (Platform.OS === 'web') {
          const audio = webAudioRef.current;
          if (!audio) return false;
          audio.currentTime = target;
        } else {
          await player.seekTo(target);
        }
        return true;
      } catch (_error) {
        return false;
      }
    },
    [player, status.duration]
  );

  useEffect(() => {
    if (Platform.OS === 'web' || !sourceRef.current) return;
    const sequence = sequenceRef.current;
    if (!sequence) return;
    const playbackState = String(status.playbackState || '').toLowerCase();
    if (playbackState === 'failed') {
      failSequence(sequence, 'audio_playback_failed');
      return;
    }
    if (status.playing) {
      sequence.nativePlayingIndex = sequence.index;
      setPhase('playing');
      return;
    }
    if (
      (status.didJustFinish || playbackState === 'ended') &&
      sequence.nativePlayingIndex === sequence.index
    ) {
      sequence.nativePlayingIndex = null;
      advanceChunk(sequence.index);
    }
  }, [advanceChunk, failSequence, status.didJustFinish, status.playbackState, status.playing]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestEpochRef.current += 1;
      sequenceRef.current = null;
      cancelRequest();
      cancelPrepare();
      releaseSource();
      releaseUnlockSource();
      const audio = webAudioRef.current;
      if (audio) {
        audio.onplaying = null;
        audio.onwaiting = null;
        audio.ontimeupdate = null;
        audio.ondurationchange = null;
        audio.onended = null;
        audio.onerror = null;
      }
      webAudioRef.current = null;
    };
  }, [cancelPrepare, cancelRequest, releaseSource, releaseUnlockSource]);

  const value = useMemo(
    () => {
      const localTime = Platform.OS === 'web'
        ? webProgress.currentTime
        : Number(status.currentTime) || 0;
      const localDuration = Platform.OS === 'web'
        ? webProgress.duration
        : Number(status.duration) || 0;
      const aggregate = aggregatePlaybackMetrics(chunkProgress, localTime, localDuration);

      return {
        phase,
        error,
        activeNarratorId,
        activePlaybackId,
        playbackId: activePlaybackId,
        lastCompletedPlaybackId,
        chunkIndex: chunkProgress.index,
        chunkCount: chunkProgress.count,
        isLoading: phase === 'loading',
        isPlaying: phase === 'playing',
        isPaused: phase === 'paused',
        isReady: phase === 'ready',
        currentTime: localTime,
        duration: localDuration,
        elapsedTime: aggregate.elapsedTime,
        totalDuration: aggregate.totalDuration,
        progress: aggregate.progress,
        playbackRate,
        playPreview,
        playPersonal,
        preparePersonal,
        cancelPrepare,
        prime,
        pause,
        resume,
        seek,
        setPlaybackRate,
        stop,
        clearAudioCache: clearNarrationAudioMemoryCache,
        clearError: () => setError(null),
      };
    },
    [
      activeNarratorId,
      activePlaybackId,
      cancelPrepare,
      chunkProgress.completedWeight,
      chunkProgress.count,
      chunkProgress.currentWeight,
      chunkProgress.index,
      chunkProgress.totalWeight,
      error,
      lastCompletedPlaybackId,
      pause,
      phase,
      playbackRate,
      playPersonal,
      playPreview,
      preparePersonal,
      prime,
      resume,
      seek,
      setPlaybackRate,
      status.currentTime,
      status.duration,
      stop,
      webProgress.currentTime,
      webProgress.duration,
    ]
  );

  return <NarrationCtx.Provider value={value}>{children}</NarrationCtx.Provider>;
}

export function useNarration() {
  const context = useContext(NarrationCtx);
  if (!context) throw new Error('useNarration must be used inside NarrationProvider');
  return context;
}
