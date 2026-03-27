import { useRef, useState, useCallback } from 'react';

export interface FpsDrop {
  timestamp: string;
  fps: number;
  baseline: number;
  dropPercent: number;
}

export function useFpsMonitor() {
  const [fps, setFps] = useState<number | null>(null);
  const [drops, setDrops] = useState<FpsDrop[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);
  const fpsHistoryRef = useRef<number[]>([]);

  const start = useCallback(() => {
    fpsHistoryRef.current = [];
    lastTimeRef.current = performance.now();
    frameCountRef.current = 0;

    const tick = (now: number) => {
      frameCountRef.current++;
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / elapsed);
        setFps(currentFps);

        const history = fpsHistoryRef.current;
        history.push(currentFps);
        if (history.length > 10) history.shift();

        // 절대값(30fps) 기준 X — 베이스라인 대비 20% 이상 드랍 시 기록
        if (history.length >= 5) {
          const baseline =
            history.slice(0, -1).reduce((a, b) => a + b, 0) / (history.length - 1);
          const dropRatio = (baseline - currentFps) / baseline;
          if (dropRatio > 0.2) {
            setDrops(prev => [
              ...prev.slice(-19),
              {
                timestamp: new Date().toLocaleTimeString(),
                fps: currentFps,
                baseline: Math.round(baseline),
                dropPercent: Math.round(dropRatio * 100),
              },
            ]);
          }
        }

        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    setDrops([]);
    fpsHistoryRef.current = [];
  }, []);

  return { fps, drops, start, stop, reset };
}
