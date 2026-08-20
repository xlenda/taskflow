import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

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
  onDone,
}) {
  const [shown, setShown] = useState(() => lines.map(() => ''));
  const doneRef = useRef(false);
  const timer = useRef(null);
  const hardStop = useRef(null);

  useEffect(() => {
    doneRef.current = false;
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
      {shown.map((s, i) =>
        s ? (
          <Text key={i} style={[textStyle, i > 0 && { marginTop: lineGap }]}>
            {s}
          </Text>
        ) : null
      )}
    </View>
  );
}
