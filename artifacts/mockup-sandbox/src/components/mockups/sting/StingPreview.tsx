import { useEffect, useRef, useState } from "react";
import "./sting.css";

const STING_DURATION_MS = 5000;
const NUM_RINGS = 9;
const RING_CYCLE_MS = 2200;
const RING_COLOR = "#e8400a";
const GLOW_COLOR = "#ff3300";

export function StingPreview() {
  const [progress, setProgress] = useState(0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const [key, setKey] = useState(0);

  useEffect(() => {
    startRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const pct = Math.min(1, elapsed / STING_DURATION_MS);
      setProgress(pct);
      if (pct < 1) rafRef.current = requestAnimationFrame(tick);
      else {
        setTimeout(() => {
          startRef.current = performance.now();
          setProgress(0);
          setKey((k) => k + 1);
          rafRef.current = requestAnimationFrame(tick);
        }, 800);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="sting-root">
      <div className="sting-bg" />

      {/* ── Ambient center glow ── */}
      <div className="sting-center-glow" />

      {/* ── Tunnel rings ── */}
      <div className="sting-rings-wrap">
        {Array.from({ length: NUM_RINGS }).map((_, i) => {
          const baseSize = 60 + i * 68;
          const delay = -(i * (RING_CYCLE_MS / NUM_RINGS));
          return (
            <div
              key={i}
              className="sting-ring"
              style={{
                width: baseSize,
                height: baseSize,
                borderRadius: baseSize / 2,
                animationDelay: `${delay}ms`,
                animationDuration: `${RING_CYCLE_MS}ms`,
                boxShadow: `0 0 ${6 + i * 2}px 1px ${GLOW_COLOR}88, inset 0 0 ${4 + i}px 0 ${GLOW_COLOR}44`,
                borderColor: RING_COLOR,
              }}
            />
          );
        })}
      </div>

      {/* ── Floor reflection (mirror glow beneath rings) ── */}
      <div className="sting-floor" />

      {/* ── Progress bar ── */}
      <div className="sting-bar-wrap">
        <div className="sting-bar-track">
          <div
            className="sting-bar-fill"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {/* ── Brand text ── */}
      <div className="sting-brand">
        <span className="sting-brand-net">NET</span>
        <span className="sting-brand-play">PLAY</span>
      </div>
    </div>
  );
}
