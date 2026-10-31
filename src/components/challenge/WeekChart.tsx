'use client';

import { useState } from 'react';

// One small line chart across challenge weeks 1–8 (weight, waist or feeling
// each get their own — never two scales on one chart). Single series, so the
// title names it; the latest value is labelled and hovering a week shows its
// value. Missing weeks leave a gap in the line rather than joining across.

const W = 300;
const H = 120;
const PAD = { l: 34, r: 12, t: 12, b: 22 };

export default function WeekChart({ title, unit, points, fixed }: {
  title: string;
  unit: string;
  points: { week: number; value: number }[];
  /** fixed y range (e.g. 1–10); otherwise fitted to the data with padding */
  fixed?: [number, number];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.value);
  let [lo, hi] = fixed ?? [Math.min(...values), Math.max(...values)];
  if (!fixed) {
    const pad = Math.max((hi - lo) * 0.2, 1);
    lo = Math.floor(lo - pad);
    hi = Math.ceil(hi + pad);
  }
  const x = (week: number) => PAD.l + ((week - 1) / 7) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.t - PAD.b);
  const byWeek = new Map(points.map((p) => [p.week, p.value]));

  // Line segments only between consecutive weeks that both have a value.
  const segments: string[] = [];
  for (let w = 1; w < 8; w++) {
    const a = byWeek.get(w);
    const b = byWeek.get(w + 1);
    if (a !== undefined && b !== undefined) segments.push(`M${x(w)},${y(a)}L${x(w + 1)},${y(b)}`);
  }
  const last = points.at(-1);
  const fmt = (v: number) => `${v}${unit.startsWith('/') ? '' : ' '}${unit}`;
  const shown = hover !== null && byWeek.has(hover) ? { week: hover, value: byWeek.get(hover)! } : null;

  return (
    <figure className="bg-surface border border-border rounded-xl p-3">
      <figcaption className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-neutral-700">{title}</span>
        <span className="tabular-nums text-neutral-500">
          {shown ? `Week ${shown.week}: ${fmt(shown.value)}` : last ? `Latest ${fmt(last.value)}` : 'No data yet'}
        </span>
      </figcaption>
      {points.length === 0 ? (
        <div className="h-[120px] flex items-center justify-center text-2xs text-neutral-400">Nothing logged yet</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-1" role="img" aria-label={`${title} by week: ${points.map((p) => `week ${p.week} ${fmt(p.value)}`).join(', ')}`} onMouseLeave={() => setHover(null)}>
          {[lo, hi].map((v) => (
            <g key={v}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--color-border, #e5e7eb)" strokeWidth={1} />
              <text x={PAD.l - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#9ca3af">{v}</text>
            </g>
          ))}
          {Array.from({ length: 8 }, (_, i) => i + 1).map((w) => (
            <text key={w} x={x(w)} y={H - 6} textAnchor="middle" fontSize={9} fill={hover === w ? '#374151' : '#9ca3af'}>W{w}</text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#d1d5db" strokeWidth={1} />}
          {segments.map((d) => <path key={d} d={d} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinecap="round" />)}
          {points.map((p) => (
            <circle key={p.week} cx={x(p.week)} cy={y(p.value)} r={hover === p.week ? 5 : 4} fill="var(--brand)" stroke="white" strokeWidth={2} />
          ))}
          {Array.from({ length: 8 }, (_, i) => i + 1).map((w) => (
            <rect key={w} x={x(w) - (W - PAD.l - PAD.r) / 14} y={0} width={(W - PAD.l - PAD.r) / 7} height={H} fill="transparent" onMouseEnter={() => setHover(w)} onClick={() => setHover(w)} />
          ))}
        </svg>
      )}
    </figure>
  );
}
