import { segmentColor, type GoalType } from '@/lib/progress';

const SEGMENT_STROKE: Record<'green' | 'orange' | 'red', string> = {
  green: '#10b981',
  orange: '#f59e0b',
  red: '#ef4444',
};

const W = 700, H = 240;
const PAD = { left: 42, right: 16, top: 20, bottom: 28 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

export default function WeightTrendGraph({
  points, goalWeight, goalType,
}: { points: { month: number; weight: number }[]; goalWeight: number; goalType: GoalType }) {
  if (points.length === 0) {
    return <p className="text-sm text-neutral-400">No weigh-ins logged yet — log month checkpoints below to see the trend.</p>;
  }

  const weights = points.map((p) => p.weight).concat(goalWeight);
  const minW = Math.min(...weights), maxW = Math.max(...weights);
  const range = Math.max(maxW - minW, 1);
  const padW = range * 0.15;
  const lo = minW - padW, hi = maxW + padW;

  const x = (month: number) => PAD.left + ((month - 1) / 5) * INNER_W;
  const y = (weight: number) => PAD.top + (1 - (weight - lo) / (hi - lo)) * INNER_H;

  const goalY = y(goalWeight);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
        {/* Goal reference line */}
        <line x1={PAD.left} y1={goalY} x2={W - PAD.right} y2={goalY} stroke="#d1d5db" strokeWidth={1} strokeDasharray="4 4" />
        <text x={W - PAD.right} y={goalY - 6} textAnchor="end" className="fill-neutral-400" fontSize={10}>
          Goal {goalWeight}kg
        </text>

        {/* Month axis labels */}
        {[1, 2, 3, 4, 5, 6].map((m) => (
          <text key={m} x={x(m)} y={H - 8} textAnchor="middle" className="fill-neutral-400" fontSize={10}>
            M{m}
          </text>
        ))}

        {/* Trend segments, colored by direction toward this client's goal */}
        {points.slice(1).map((p, i) => {
          const prev = points[i];
          const color = SEGMENT_STROKE[segmentColor(prev.weight, p.weight, goalType)];
          return (
            <line
              key={p.month}
              x1={x(prev.month)} y1={y(prev.weight)} x2={x(p.month)} y2={y(p.weight)}
              stroke={color} strokeWidth={3} strokeLinecap="round"
              className="transition-all duration-300"
            />
          );
        })}

        {/* Points + weight labels */}
        {points.map((p) => (
          <g key={p.month}>
            <circle cx={x(p.month)} cy={y(p.weight)} r={4.5} fill="var(--brand)" stroke="white" strokeWidth={2} />
            <text x={x(p.month)} y={y(p.weight) - 10} textAnchor="middle" className="fill-neutral-600" fontSize={11} fontWeight={500}>
              {p.weight}
            </text>
          </g>
        ))}
      </svg>
      <div className="flex items-center gap-4 mt-2 justify-center">
        <Legend color={SEGMENT_STROKE.green} label="Toward goal" />
        <Legend color={SEGMENT_STROKE.orange} label="Flat" />
        <Legend color={SEGMENT_STROKE.red} label="Away from goal" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 h-0.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-neutral-400">{label}</span>
    </div>
  );
}
