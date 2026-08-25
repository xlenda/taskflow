import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';

function TypeLine({ value, textStyle, marginTop, characterMotion }) {
  const entrance = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!value || !characterMotion) {
      entrance.setValue(1);
      return undefined;
    }

    entrance.stopAnimation();
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [characterMotion, entrance, value]);

  if (!value) return null;
  if (!characterMotion) {
    return <Text style={[textStyle, marginTop && { marginTop }]}>{value}</Text>;
  }

  return (
    <Text style={[textStyle, marginTop && { marginTop }]}>
      {value.slice(0, -1)}
      <Animated.Text
        testID="typing-character-pulse"
        style={{
          opacity: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.58, 1] }),
          transform: [
            { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [2, 0] }) },
            { scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [1.12, 1] }) },
          ],
        }}
      >
        {value.slice(-1)}
      </Animated.Text>
    </Text>
  );
}

// Types out an array of lines, pausing between lines. Progress is computed from
// ELAPSED TIME, not one-char-per-timer — browsers throttle timers in background
// tabs, and an incremental chain would stall and never fire onDone (real bug:
// chips never appeared). Any single tick self-corrects, and a hard-stop timer
// guarantees completion + onDone no matter what.
// Pass `instant` to reveal everything at once (used for "tap to skip").
// IMPORTANT: memoize `lines` in the parent — a new array identity restarts typing.
export default function Typewriter({
  lines,
  textStyle,
  lineGap = 18,
  speed = 26,
  linePause = 550,
  startDelay = 250,
  instant = false,
  onCharacter,
  characterMotion = false,
  onDone,
}) {
  const [shown, setShown] = useState(() => lines.map(() => ''));
  const doneRef = useRef(false);
  const timer = useRef(null);
  const hardStop = useRef(null);
  const notifiedChars = useRef(0);
  const onCharacterRef = useRef(onCharacter);

  useEffect(() => {
    onCharacterRef.current = onCharacter;
  }, [onCharacter]);

  useEffect(() => {
    doneRef.current = false;
    notifiedChars.current = 0;
    setShown(lines.map(() => ''));
    const t0 = Date.now() + startDelay;

    const finish = () => {
      if (!doneRef.current) {
        doneRef.current = true;
        setShown(lines.slice());
        onDone && onDone();
      }
    };

    const render = () => {
      if (doneRef.current) return;
      let rem = Date.now() - t0;
      if (rem < 0) {
        timer.current = setTimeout(render, -rem);
        return;
      }
      const next = lines.map(() => '');
      let complete = true;
      for (let i = 0; i < lines.length; i++) {
        const dur = lines[i].length * speed;
        if (rem >= dur + linePause) {
          next[i] = lines[i];
          rem -= dur + linePause;
        } else {
          const chars = Math.max(0, Math.floor(rem / speed));
          next[i] = lines[i].slice(0, Math.min(chars, lines[i].length));
          complete = false;
          break;
        }
      }
      const visibleCount = next.reduce((total, line) => total + line.length, 0);
      if (visibleCount > notifiedChars.current && onCharacterRef.current) {
        const fullText = lines.join('');
        for (let index = notifiedChars.current; index < visibleCount; index += 1) {
          onCharacterRef.current(fullText[index], index);
        }
      }
      notifiedChars.current = visibleCount;
      setShown(next);
      if (complete) {
        finish();
        return;
      }
      timer.current = setTimeout(render, speed);
    };

    timer.current = setTimeout(render, startDelay);
    // Garantia absoluta: mesmo que todos os ticks atrasem, conclui no tempo total.
    const totalMs =
      startDelay + lines.reduce((acc, l) => acc + l.length * speed + linePause, 0) + 600;
    hardStop.current = setTimeout(finish, totalMs);

    return () => {
      clearTimeout(timer.current);
      clearTimeout(hardStop.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  useEffect(() => {
    if (instant && !doneRef.current) {
      clearTimeout(timer.current);
      clearTimeout(hardStop.current);
      doneRef.current = true;
      setShown(lines.slice());
      onDone && onDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instant]);

  return (
    <View>
      {shown.map((line, index) => (
        <TypeLine
          key={index}
          value={line}
          textStyle={textStyle}
          marginTop={index > 0 ? lineGap : 0}
          characterMotion={characterMotion}
        />
      ))}
    </View>
  );
}
