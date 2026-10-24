"use client";
import { useState } from "react";

type Pt = { x: string; y: number; label?: string };

/** Single-series line chart with a tap/hover readout. */
export function LineChart({ data, unit, height = 150 }: { data: Pt[]; unit: string; height?: number }) {
  const [sel, setSel] = useState<number | null>(null);
  if (data.length < 2) return <p className="muted small">Servono almeno due misure per vedere l'andamento.</p>;
  const W = 340, H = height, padL = 34, padR = 10, padT = 14, padB = 22;
  const ys = data.map((d) => d.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (max - min < 1) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;
  const X = (i: number) => padL + (i * (W - padL - padR)) / (data.length - 1);
  const Y = (v: number) => padT + ((max - v) * (H - padT - padB)) / (max - min);
  const ticks = [min + pad, (min + max) / 2, max - pad];
  const path = data.map((d, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(d.y).toFixed(1)}`).join(" ");
  const cur = sel ?? data.length - 1;
  const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("it-IT");

  return (
    <div>
      <p className="small" style={{ minHeight: 22 }}>
        <span className="num" style={{ fontSize: 20 }}>{fmt(data[cur].y)} {unit}</span>{" "}
        <span className="muted">{data[cur].label ?? data[cur].x}</span>
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Andamento: da ${fmt(data[0].y)} a ${fmt(data[data.length - 1].y)} ${unit}`}
        onPointerLeave={() => setSel(null)}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((x - padL) / (W - padL - padR)) * (data.length - 1));
          setSel(Math.max(0, Math.min(data.length - 1, i)));
        }}
        style={{ touchAction: "pan-y", display: "block" }}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={Y(t)} y2={Y(t)} stroke="var(--line)" strokeWidth="1" opacity=".6" />
            <text x={padL - 6} y={Y(t) + 4} textAnchor="end" fontSize="10.5" fill="var(--faint)">{fmt(t)}</text>
          </g>
        ))}
        <text x={padL} y={H - 6} fontSize="10.5" fill="var(--faint)">{data[0].x}</text>
        <text x={W - padR} y={H - 6} fontSize="10.5" fill="var(--faint)" textAnchor="end">{data[data.length - 1].x}</text>
        <line x1={X(cur)} x2={X(cur)} y1={padT} y2={H - padB} stroke="var(--muted)" strokeWidth="1" strokeDasharray="2 3" />
        <path d={path} fill="none" stroke="var(--yellow)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (
          <circle key={i} cx={X(i)} cy={Y(d.y)} r={i === cur ? 5 : 3.5} fill="var(--yellow)" stroke="var(--surface)" strokeWidth="2" />
        ))}
      </svg>
    </div>
  );
}
