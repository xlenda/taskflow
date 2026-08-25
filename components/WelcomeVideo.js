import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Image, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

import { APP_URL, ONB } from '../constants/brand';

const VIDEO_PATH = '/video/celeste-abertura.mp4';
const POSTER_PATH = '/video/celeste-abertura-poster.jpg';
const mediaUrl = (path) => (Platform.OS === 'web' ? path : `${APP_URL}${path}`);
const initialReduceMotion = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export default function WelcomeVideo({
  width,
  height,
  lang = 'en',
  style,
  fullBleed = false,
  loop = true,
  onFinished,
  onPlaybackIssue,
}) {
  const [firstFrame, setFirstFrame] = useState(false);
  const [motionOverride, setMotionOverride] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const videoViewRef = useRef(null);
  // Native resolves this preference asynchronously. The source stays loaded so
  // a late preference result never has to recreate the web player.
  const [reduceMotion, setReduceMotion] = useState(initialReduceMotion);
  const player = useVideoPlayer(mediaUrl(VIDEO_PATH), (instance) => {
    instance.loop = loop;
    instance.muted = true;
    instance.keepScreenOnWhilePlaying = false;
  });
  const shouldPlay = reduceMotion === false || motionOverride;
  const mediaFit = fullBleed && height >= width ? 'cover' : 'contain';
  const reportPlaybackIssue = useCallback(() => {
    setPlaybackBlocked(true);
    if (onPlaybackIssue) onPlaybackIssue();
  }, [onPlaybackIssue]);
  const requestPlayback = useCallback(() => {
    if (Platform.OS === 'web') {
      const video = videoViewRef.current?.nativeRef?.current;
      if (!video) return false;
      let request;
      try {
        request = video.play();
      } catch (_error) {
        reportPlaybackIssue();
        return false;
      }
      if (request && typeof request.then === 'function') {
        request.then(() => setPlaybackBlocked(false)).catch(reportPlaybackIssue);
      }
      return true;
    }
    try {
      player.play();
      return true;
    } catch (_error) {
      reportPlaybackIssue();
      return false;
    }
  }, [player, reportPlaybackIssue]);

  useEffect(() => {
    player.loop = loop;
    if (!onFinished) return undefined;
    const subscription = player.addListener('playToEnd', onFinished);
    return () => subscription.remove();
  }, [loop, onFinished, player]);

  useEffect(() => {
    if (reduceMotion !== true || motionOverride || !onFinished) return undefined;
    const reducedMotionFinish = setTimeout(onFinished, 900);
    return () => clearTimeout(reducedMotionFinish);
  }, [motionOverride, onFinished, reduceMotion]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      if (subscription && subscription.remove) subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!shouldPlay) {
      player.pause();
      return undefined;
    }

    let cancelled = false;
    let playerFound = false;
    player.currentTime = 0;
    const startPlayback = () => {
      if (cancelled) return;
      playerFound = requestPlayback() || playerFound;
    };
    startPlayback();
    // Some mobile browsers mount the underlying <video> after the parent
    // effect. Retrying is harmless and closes that autoplay race.
    const retries = [150, 700, 1800].map((delay) => setTimeout(startPlayback, delay));
    const missingPlayerFallback = setTimeout(() => {
      if (!cancelled && !playerFound) reportPlaybackIssue();
    }, 2600);
    return () => {
      cancelled = true;
      retries.forEach(clearTimeout);
      clearTimeout(missingPlayerFallback);
      player.pause();
    };
  }, [player, reportPlaybackIssue, requestPlayback, shouldPlay]);

  // expo-video can miss onFirstFrameRender when a cached web video loads before
  // its effect listener is attached. The poster underneath covers load time.
  const revealVideo = shouldPlay && (Platform.OS === 'web' || firstFrame);
  const showPlayButton = (reduceMotion === true && !motionOverride) || playbackBlocked;
  const retryLabel = lang === 'pt' ? 'Reproduzir abertura da Celeste' : 'Play Celeste opening';
  const soundLabel = soundOn
    ? lang === 'pt'
      ? 'Desativar som da abertura'
      : 'Mute opening sound'
    : lang === 'pt'
      ? 'Ativar som da abertura'
      : 'Turn on opening sound';

  const toggleSoundAndPlay = () => {
    const nextSoundOn = !soundOn;
    setMotionOverride(true);
    setPlaybackBlocked(false);
    setSoundOn(nextSoundOn);
    player.muted = !nextSoundOn;
    if (Platform.OS === 'web') {
      const video = videoViewRef.current?.nativeRef?.current;
      if (video) video.muted = !nextSoundOn;
    }
    requestPlayback();
  };

  return (
    <Pressable
      testID="celeste-opening-video"
      accessibilityRole="button"
      accessibilityLabel={showPlayButton ? retryLabel : soundLabel}
      onPress={toggleSoundAndPlay}
      style={[styles.frame, fullBleed && styles.fullBleed, { width, height }, style]}
    >
      <Image
        source={{ uri: mediaUrl(POSTER_PATH) }}
        resizeMode={fullBleed ? mediaFit : 'cover'}
        style={StyleSheet.absoluteFillObject}
      />
      <VideoView
        ref={videoViewRef}
        player={player}
        nativeControls={false}
        contentFit={fullBleed ? mediaFit : 'cover'}
        playsInline
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        onFirstFrameRender={() => setFirstFrame(true)}
        pointerEvents="none"
        style={[styles.video, { opacity: revealVideo ? 1 : 0 }]}
      />
      {showPlayButton ? (
        <View testID="celeste-video-play-retry" pointerEvents="none" style={styles.playButton}>
          <Ionicons name="play" size={22} color={ONB.inkOn} />
        </View>
      ) : null}
      <View testID="celeste-opening-sound" pointerEvents="none" style={styles.soundButton}>
        <Ionicons name={soundOn ? 'volume-high' : 'volume-mute'} size={20} color={ONB.inkOn} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderRadius: 8,
    backgroundColor: ONB.welcomeBackground,
  },
  fullBleed: {
    borderRadius: 0,
  },
  // expo-video renders a raw <video> on web. Explicit dimensions keep the
  // intrinsic 720x1280 media size from overflowing the responsive frame.
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  playButton: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 48,
    height: 48,
    marginLeft: -24,
    marginTop: -24,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,46,79,0.82)',
  },
  soundButton: {
    position: 'absolute',
    right: 20,
    bottom: 22,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28,46,79,0.72)',
  },
});
