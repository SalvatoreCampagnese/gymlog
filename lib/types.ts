export type Warmup = { sets: string; reps: string; load: string };

export type Exercise = {
  id: string; // `${workoutKey}-${row}` stable across weeks of the same program
  row: number;
  name: string;
  warmup?: Warmup;
  sets: number;
  reps: string[]; // per set target
  loads: string[]; // per set target
  loadPct?: string[]; // %1RM per set when given
  rest: string; // raw text, e.g. 2'30
  restSec: number;
  restMaxSec?: number; // when rest is a range like 1'30/2'
  tempo: string; // C-P-E-P
  buffer: string;
  report: { setsCol: number; repsCols: number[]; loadsCols: number[] };
};

export type Workout = {
  key: string; // A, B, C, D
  title: string;
  focus: string;
  exercises: Exercise[];
  cardio: string[];
  volume: string[];
};

export type DietDay = {
  day: string; // LUNEDI...
  dow: number; // 1 = Monday ... 7 = Sunday
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  water: string;
  note: string;
};

export type Week = {
  index: number; // 1..n
  label: string;
  workouts: Workout[];
  diet: DietDay[];
};

export type Program = {
  id: string; // sheet name
  title: string;
  startDate: string | null; // yyyy-mm-dd
  endDate: string | null;
  notes: string[];
  weeks: Week[];
  guidelines: string[];
  supplements: { meal: string; text: string }[];
};

export type ProgramFile = {
  athlete: string;
  source: string; // "bundled" | uploaded file name
  uploadedAt: string | null;
  programs: Program[];
};

// ---- Logs stored in Vercel Blob ----

export type SetLog = { reps: string; load: string; done: boolean; at?: string };

export type ExerciseLog = {
  exerciseId: string;
  name: string;
  sets: SetLog[];
  note?: string;
};

export type Session = {
  id: string;
  programId: string;
  week: number;
  workout: string;
  date: string; // yyyy-mm-dd
  startedAt: string;
  finishedAt?: string;
  exercises: ExerciseLog[];
  cardioDone?: boolean;
  note?: string;
};

export type FoodEntry = {
  id: string;
  meal: string; // colazione, spuntino, pranzo, merenda, cena, extra
  name: string;
  brand?: string;
  barcode?: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  per100?: { kcal: number; protein: number; carbs: number; fat: number };
  source: "off" | "ai" | "manual" | "recent";
  at: string;
};

export type SavedFood = {
  key: string;
  name: string;
  brand?: string;
  barcode?: string;
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  defaultGrams: number;
  uses: number;
  lastUsed: string;
};

export type HealthDay = {
  active?: number; // active energy kcal (Apple Watch / iPhone)
  resting?: number; // resting energy kcal
  steps?: number;
  exerciseMin?: number;
  updatedAt: string;
};

export type PantryLocation = "Frigo" | "Freezer" | "Dispensa";

export type PantryItem = {
  id: string;
  name: string;
  brand?: string;
  qty: string; // as written, e.g. "1 confezione", "6 uova", "500 g"
  grams?: number; // best estimate of what is left
  location: PantryLocation;
  per100?: { kcal: number; protein: number; carbs: number; fat: number };
  barcode?: string;
  expires?: string; // yyyy-mm-dd
  updatedAt: string;
};

export type AppState = {
  version: 1;
  pantry?: PantryItem[];
  health?: Record<string, HealthDay>; // date -> Apple Health totals
  sessions: Session[];
  food: Record<string, FoodEntry[]>; // date -> entries
  weight: Record<string, number>; // date -> kg as read on the scale
  /** display-only tweaks; weightOffset is added to every weight when shown (scale correction, reversible) */
  settings?: { weightOffset?: number };
  savedFoods: SavedFood[];
  updatedAt: string;
};

export const emptyState = (): AppState => ({
  version: 1,
  sessions: [],
  food: {},
  weight: {},
  savedFoods: [],
  updatedAt: new Date(0).toISOString(),
});
