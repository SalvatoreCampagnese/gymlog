"use client";
import { useEffect, useRef, useState } from "react";
import { fmtSec } from "@/lib/resolve";

export type RestState = { endAt: number; total: number; label: string; next: string } | null;

let audioCtx: AudioContext | null = null;
export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {}
}
export function beep(times = 3) {
  try {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "square";
      o.frequency.value = i === times - 1 ? 1320 : 880;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.35);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.35 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.22);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0 + i * 0.35);
      o.stop(t0 + i * 0.35 + 0.25);
    }
  } catch {}
}

export function RestTimer({
  rest,
  onAdjust,
  onClose,
}: {
  rest: NonNullable<RestState>;
  onAdjust: (deltaSec: number) => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const fired = useRef(false);
  const warned = useRef(false);
  const left = Math.max(0, (rest.endAt - now) / 1000);
  const done = left <= 0;

  useEffect(() => {
    fired.current = rest.endAt <= Date.now();
    warned.current = rest.endAt - Date.now() < 10_000;
  }, [rest.endAt]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!warned.current && left > 0 && left <= 10) {
      warned.current = true;
      beep(1);
      navigator.vibrate?.(120);
    }
    if (!fired.current && done) {
      fired.current = true;
      beep(3);
      navigator.vibrate?.([300, 150, 300, 150, 300]);
    }
  }, [left, done]);

  const R = 21;
  const C = 2 * Math.PI * R;
  const frac = rest.total ? left / rest.total : 0;

  return (
    <div className={`rest-dock ${done ? "done" : ""}`} role="timer" aria-live="polite" aria-label="Recupero">
      <div className="rest-main">
        <svg viewBox="0 0 50 50" className="rest-ring" aria-hidden>
          <circle cx="25" cy="25" r={R} fill="none" stroke="var(--line)" strokeWidth="5" />
          <circle
            cx="25" cy="25" r={R} fill="none"
            stroke={done ? "var(--green)" : "var(--red)"} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - frac)}
            transform="rotate(-90 25 25)"
            style={{ transition: "stroke-dashoffset .2s linear" }}
          />
        </svg>
        <span className="rest-t">{done ? "Vai" : fmtSec(left)}</span>
        <div className="rest-info">
          <span className="muted tiny">{done ? "Recupero finito" : rest.label}</span>
          <span className="rest-next">{rest.next}</span>
        </div>
      </div>
      <div className="rest-actions">
        {!done ? (
          <>
            <button className="btn sm" onClick={() => onAdjust(-15)}>−15 s</button>
            <button className="btn sm" onClick={() => onAdjust(15)}>+15 s</button>
          </>
        ) : null}
        <button className={`btn sm grow ${done ? "go" : "ghost"}`} onClick={onClose}>
          {done ? "Chiudi" : "Salta"}
        </button>
      </div>
    </div>
  );
}
