import type { AppState, FoodEntry, PantryItem, SavedFood, Session } from "./types";

export type Op =
  | { type: "upsertSession"; session: Session }
  | { type: "deleteSession"; id: string }
  | { type: "addFood"; date: string; entry: FoodEntry }
  | { type: "updateFood"; date: string; entry: FoodEntry }
  | { type: "deleteFood"; date: string; id: string }
  | { type: "setWeight"; date: string; kg: number | null }
  | { type: "setWeightOffset"; kg: number }
  | { type: "upsertSavedFood"; food: SavedFood }
  | { type: "deleteSavedFood"; key: string }
  | { type: "upsertPantry"; items: PantryItem[] }
  | { type: "deletePantry"; id: string };

export function applyOp(s: AppState, op: Op) {
  switch (op.type) {
    case "upsertSession": {
      const i = s.sessions.findIndex((x) => x.id === op.session.id);
      if (i >= 0) s.sessions[i] = op.session;
      else s.sessions.push(op.session);
      break;
    }
    case "deleteSession":
      s.sessions = s.sessions.filter((x) => x.id !== op.id);
      break;
    case "addFood":
      (s.food[op.date] ??= []).push(op.entry);
      break;
    case "updateFood": {
      const list = s.food[op.date] ?? [];
      const i = list.findIndex((x) => x.id === op.entry.id);
      if (i >= 0) list[i] = op.entry;
      break;
    }
    case "deleteFood":
      s.food[op.date] = (s.food[op.date] ?? []).filter((x) => x.id !== op.id);
      if (!s.food[op.date].length) delete s.food[op.date];
      break;
    case "setWeight":
      if (op.kg === null) delete s.weight[op.date];
      else s.weight[op.date] = op.kg;
      break;
    case "setWeightOffset":
      s.settings = { ...(s.settings ?? {}), weightOffset: op.kg || undefined };
      break;
    case "upsertSavedFood": {
      const i = s.savedFoods.findIndex((x) => x.key === op.food.key);
      if (i >= 0) {
        const prev = s.savedFoods[i];
        s.savedFoods[i] = { ...op.food, uses: prev.uses + 1 };
      } else s.savedFoods.push({ ...op.food, uses: 1 });
      s.savedFoods = s.savedFoods.sort((a, b) => (b.lastUsed > a.lastUsed ? 1 : -1)).slice(0, 300);
      break;
    }
    case "deleteSavedFood":
      s.savedFoods = s.savedFoods.filter((x) => x.key !== op.key);
      break;
    case "upsertPantry": {
      s.pantry ??= [];
      for (const it of op.items) {
        const i = s.pantry.findIndex((x) => x.id === it.id);
        if (i >= 0) s.pantry[i] = it;
        else s.pantry.push(it);
      }
      break;
    }
    case "deletePantry":
      s.pantry = (s.pantry ?? []).filter((x) => x.id !== op.id);
      break;
  }
}

