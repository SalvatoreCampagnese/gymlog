"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { dietFor, resolveDate, todayISO } from "../resolve";
import type { FoodEntry } from "../types";

export function useToday() {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);
  return today;
}

export function useDay(date: string) {
  const { program, state } = useStore();
  return useMemo(() => {
    const r = program ? resolveDate(program, date) : null;
    const target = r ? dietFor(r.week, date) : undefined;
    const entries = state.food[date] ?? [];
    const eaten = sumEntries(entries);
    return { resolved: r, target, entries, eaten };
  }, [program, state, date]);
}

export function sumEntries(entries: FoodEntry[]) {
  return entries.reduce(
    (a, e) => ({ kcal: a.kcal + e.kcal, protein: a.protein + e.protein, carbs: a.carbs + e.carbs, fat: a.fat + e.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

export function useLocal<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s) setV(JSON.parse(s));
    } catch {}
  }, [key]);
  return [
    v,
    (nv: T) => {
      setV(nv);
      try {
        localStorage.setItem(key, JSON.stringify(nv));
      } catch {}
    },
  ];
}

/** After launching the Apple Health shortcut: keep re-reading the data for a while,
 * until the new numbers arrive (the shortcut sends them a few seconds later). */
export function useHealthRefresh() {
  const { state, refresh } = useStore();
  const [waiting, setWaiting] = useState(false);
  const stamp = (h: typeof state.health) => Object.values(h ?? {}).reduce((a, d: any) => (d?.updatedAt > a ? d.updatedAt : a), "");
  const start = () => {
    if (waiting) return;
    const before = stamp(state.health);
    setWaiting(true);
    let n = 0;
    const tick = async () => {
      n++;
      const s = document.visibilityState === "visible" ? await refresh() : null;
      if ((s && stamp(s.health) !== before) || n >= 20) return setWaiting(false);
      setTimeout(tick, 3000);
    };
    setTimeout(tick, 3000);
  };
  return { start, waiting };
}
