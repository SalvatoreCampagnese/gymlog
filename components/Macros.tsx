import type { DietDay } from "@/lib/types";

type Tot = { kcal: number; protein: number; carbs: number; fat: number };

export function MacroBars({ target, eaten }: { target?: DietDay; eaten: Tot }) {
  const rows: [string, number, number | null | undefined, string][] = [
    ["Proteine", eaten.protein, target?.protein, "var(--protein)"],
    ["Carboidrati", eaten.carbs, target?.carbs, "var(--carbs)"],
    ["Grassi", eaten.fat, target?.fat, "var(--fat)"],
  ];
  return (
    <div className="stack" style={{ gap: 10 }}>
      {rows.map(([label, v, t, c]) => {
        const pct = t ? Math.min(100, (v / t) * 100) : 0;
        const over = !!t && v > t * 1.05;
        return (
          <div className="macro" key={label}>
            <span className="muted">{label}</span>
            <div className={`bar ${over ? "over" : ""}`} style={{ ["--c" as any]: c }}>
              <i style={{ width: `${pct}%` }} />
            </div>
            <span className="num" style={{ fontSize: 17 }}>
              {Math.round(v)}
              <span className="faint" style={{ fontWeight: 500 }}>{t ? ` / ${t} g` : " g"}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function KcalHero({ target, eaten }: { target?: DietDay; eaten: Tot }) {
  const t = target?.kcal ?? 0;
  const left = t - eaten.kcal;
  return (
    <div className="kcal-hero">
      <span className="big">{t ? Math.abs(Math.round(left)) : Math.round(eaten.kcal)}</span>
      <span className="muted">
        {t ? (left >= 0 ? `kcal rimaste su ${t}` : `kcal oltre il target di ${t}`) : "kcal mangiate"}
      </span>
    </div>
  );
}
