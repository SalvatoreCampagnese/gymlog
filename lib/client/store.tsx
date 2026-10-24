"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { applyOp, type Op } from "../ops";
import { emptyState, type AppState, type ProgramFile } from "../types";

type Ctx = {
  program: ProgramFile | null;
  state: AppState;
  loading: boolean;
  error: string | null;
  pending: number;
  online: boolean;
  syncError: string | null;
  syncNow: () => Promise<void>;
  /** re-read the saved data from the server (e.g. after Apple Health sent new numbers) */
  refresh: () => Promise<AppState | null>;
  dispatch: (...ops: Op[]) => void;
  reloadProgram: () => Promise<void>;
};

const StoreCtx = createContext<Ctx | null>(null);

// local copies are per user, so two people on the same phone never see each other's data
const keysFor = (userId: string) => ({ state: `gl.${userId}.state`, queue: `gl.${userId}.queue`, program: `gl.${userId}.program` });
function dropOtherUsers(userId: string) {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("gl.") && !k.startsWith(`gl.${userId}.`))
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}

function lsGet<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function lsSet(k: string, v: unknown) {
  if ((window as any).__glSignedOut) return; // a late response must not write data back after logout
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
}

export function StoreProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const K = keysFor(userId);
  const LS_STATE = K.state, LS_QUEUE = K.queue, LS_PROGRAM = K.program;
  const [program, setProgram] = useState<ProgramFile | null>(null);
  const [state, setState] = useState<AppState>(emptyState());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const queue = useRef<Op[]>([]);
  const [pending, setPending] = useState(0);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current || !queue.current.length) return;
    flushing.current = true;
    const batch = queue.current.slice();
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: batch }),
      });
      if (res.status === 401) {
        if (!location.pathname.startsWith("/login")) location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const server = (await res.json()) as AppState;
      queue.current = queue.current.slice(batch.length);
      lsSet(LS_QUEUE, queue.current);
      // re-apply anything queued meanwhile on top of the server copy
      const merged = structuredClone(server);
      queue.current.forEach((op) => applyOp(merged, op));
      setState(merged);
      lsSet(LS_STATE, merged);
      setOnline(true);
      setError(null);
      setSyncError(null);
    } catch (e: any) {
      const network = e instanceof TypeError || !navigator.onLine;
      setOnline(!network);
      setSyncError(network ? "Nessuna connessione al server" : String(e?.message ?? e));
    } finally {
      flushing.current = false;
      setPending(queue.current.length);
      if (queue.current.length) setTimeout(flush, online ? 4000 : 10000);
    }
  }, [online]);

  const refresh = useCallback(async (): Promise<AppState | null> => {
    if (flushing.current) return null;
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) return null;
      const server = (await res.json()) as AppState;
      const merged = structuredClone({ ...emptyState(), ...server });
      queue.current.forEach((op) => applyOp(merged, op));
      setState(merged);
      lsSet(LS_STATE, merged);
      setOnline(true);
      return merged;
    } catch {
      return null;
    }
  }, []);

  const syncNow = useCallback(async () => {
    flushing.current = false;
    await flush();
  }, [flush]);

  const dispatch = useCallback(
    (...ops: Op[]) => {
      setState((prev) => {
        const next = structuredClone(prev);
        ops.forEach((op) => applyOp(next, op));
        lsSet(LS_STATE, next);
        return next;
      });
      queue.current.push(...ops);
      lsSet(LS_QUEUE, queue.current);
      setPending(queue.current.length);
      setTimeout(flush, 50);
    },
    [flush]
  );

  const reloadProgram = useCallback(async () => {
    const res = await fetch("/api/program", { cache: "no-store" });
    if (res.status === 401) {
      if (!location.pathname.startsWith("/login")) location.href = "/login";
      return;
    }
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Errore scheda");
    setProgram(j);
    lsSet(LS_PROGRAM, j);
  }, []);

  useEffect(() => {
    dropOtherUsers(userId);
    // instant start from cache, then refresh from server
    const cachedP = lsGet<ProgramFile>(LS_PROGRAM);
    const cachedS = lsGet<AppState>(LS_STATE);
    queue.current = lsGet<Op[]>(LS_QUEUE) ?? [];
    setPending(queue.current.length);
    if (cachedP) setProgram(cachedP);
    if (cachedS) setState({ ...emptyState(), ...cachedS });
    if (cachedP) setLoading(false);

    (async () => {
      try {
        await reloadProgram();
        const res = await fetch("/api/state", { cache: "no-store" });
        if (res.ok) {
          const server = (await res.json()) as AppState;
          const merged = structuredClone({ ...emptyState(), ...server });
          queue.current.forEach((op) => applyOp(merged, op));
          setState(merged);
          lsSet(LS_STATE, merged);
          setOnline(true);
        }
        if (queue.current.length) flush();
      } catch (e: any) {
        setOnline(false);
        if (!cachedP) setError(e?.message ?? "Connessione assente");
      } finally {
        setLoading(false);
      }
    })();

    const on = () => {
      setOnline(true);
      flush();
    };
    // coming back to the app (e.g. from Comandi Rapidi): send what is queued, then pull fresh data
    let last = 0;
    const vis = async () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 2000) return;
      last = Date.now();
      await flush();
      if (!queue.current.length) refresh();
    };
    window.addEventListener("online", on);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pageshow", vis);
    return () => {
      window.removeEventListener("online", on);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("pageshow", vis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <StoreCtx.Provider value={{ program, state, loading, error, pending, online, syncError, syncNow, refresh, dispatch, reloadProgram }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
