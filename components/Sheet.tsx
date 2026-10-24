"use client";
import { useEffect, useRef, useState } from "react";
import { IconClose } from "./Icons";

/**
 * Bottom sheet with a fixed header and its own scrolling body.
 * - Header never scrolls away (tabs, title, close button stay visible).
 * - Sized to the visual viewport, so it sits above the iOS keyboard.
 * - Drag the header down (or pull the list down when it is at the top) to close.
 * - Scrolling the list hides the keyboard so the results are visible.
 */
export function Sheet({
  head,
  children,
  onClose,
  tall = true,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  onClose: () => void;
  tall?: boolean;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number; from: "head" | "body" } | null>(null);
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);
  const [closing, setClosing] = useState(false);

  // lock page scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // follow the visual viewport (keyboard open/close on iOS)
  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return;
    const upd = () => setVv({ h: v.height, top: v.offsetTop });
    upd();
    v.addEventListener("resize", upd);
    v.addEventListener("scroll", upd);
    return () => {
      v.removeEventListener("resize", upd);
      v.removeEventListener("scroll", upd);
    };
  }, []);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 160);
  };

  const setY = (y: number, animate = false) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = animate ? "transform .18s ease" : "none";
    el.style.transform = y ? `translateY(${y}px)` : "";
  };

  const start = (from: "head" | "body") => (e: React.TouchEvent) => {
    if (from === "body" && (bodyRef.current?.scrollTop ?? 0) > 0) return;
    drag.current = { y0: e.touches[0].clientY, dy: 0, from };
  };
  const move = (e: React.TouchEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.touches[0].clientY - d.y0;
    if (d.from === "body" && (dy < 0 || (bodyRef.current?.scrollTop ?? 0) > 0)) {
      drag.current = null;
      setY(0, true);
      return;
    }
    d.dy = Math.max(0, dy);
    setY(d.dy);
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.dy > 110) close();
    else setY(0, true);
  };

  const height = vv ? vv.h : undefined;

  return (
    <div
      className={`sheet-backdrop ${closing ? "closing" : ""}`}
      style={vv ? { top: vv.top, height, bottom: "auto" } : undefined}
      onClick={close}
    >
      <div
        ref={sheetRef}
        className={`sheet sheet-split ${tall ? "tall" : ""}`}
        style={height ? { maxHeight: height - 12, ...(tall ? { height: height - 12 } : {}) } : undefined}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="sheet-head" onTouchStart={start("head")} onTouchMove={move} onTouchEnd={end}>
          <div className="grab" />
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="grow">{head}</div>
            <button className="btn icon-btn ghost" style={{ width: 40, height: 40, minHeight: 40 }} aria-label="Chiudi" onClick={close}>
              <IconClose />
            </button>
          </div>
        </div>
        <div
          ref={bodyRef}
          className="sheet-body"
          onTouchStart={start("body")}
          onTouchMove={(e) => {
            // scrolling the results hides the keyboard
            const a = document.activeElement as HTMLElement | null;
            if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && sheetRef.current?.contains(a)) a.blur();
            move(e);
          }}
          onTouchEnd={end}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
