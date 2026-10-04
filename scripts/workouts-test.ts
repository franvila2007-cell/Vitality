import { buildSessions, compareToHistory, summariseMonth, estimate1RM, strengthChangePct, type SetRow } from '../src/lib/workouts';

let fail = 0;
function check(name: string, ok: boolean, extra = '') { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); }
let n = 0;
const S = (ex: string, date: string, set: number, w: number, r: number): SetRow => ({ id: String(n++), exercise_id: ex, date, set_number: set, weight_kg: w, reps: r });

// Epley
check('e1rm 70x8', Math.abs(estimate1RM(70, 8) - 88.667) < 0.01);
check('e1rm bodyweight', estimate1RM(0, 10) === 0);

// Bench: 70x8 → 72.5x8 (spec example) = +3.6% strength
const bench = [S('b', '2026-09-01', 1, 70, 8), S('b', '2026-09-01', 2, 70, 7), S('b', '2026-09-01', 3, 65, 9),
               S('b', '2026-09-08', 1, 72.5, 8)];
const sb = buildSessions(bench);
check('2 sessions', sb.length === 2);
check('best set of day 1 is 70x8', sb[0].best.weight_kg === 70 && sb[0].best.reps === 8);
check('day 2 is PR', sb[1].isPR && !sb[0].isPR);
const pct = strengthChangePct(sb[0], sb[1])!;
check('+3.6% strength', Math.abs(pct - 3.57) < 0.05, pct.toFixed(2));

// live comparison
const cmp = compareToHistory({ weight_kg: 72.5, reps: 8 }, [sb[0]])!;
check('live: +2.5kg PR', cmp.delta === '+2.5kg' && cmp.isPR && cmp.improved);
const same = compareToHistory({ weight_kg: 70, reps: 8 }, [sb[0]])!;
check('live: level', same.delta === null && !same.improved && !same.isPR);
const reps = compareToHistory({ weight_kg: 70, reps: 9 }, [sb[0]])!;
check('live: +1 rep', reps.delta === '+1 rep' && reps.isPR);
const lower = compareToHistory({ weight_kg: 67.5, reps: 8 }, [sb[0]])!;
check('live: lower no PR', lower.delta === '−2.5kg' && !lower.isPR && !lower.improved);
check('live: no history', compareToHistory({ weight_kg: 50, reps: 5 }, []) === null);

// heavier-but-fewer reps counts when e1RM higher
const trade = buildSessions([S('x', '2026-09-01', 1, 70, 8), S('x', '2026-09-08', 1, 80, 4)]);
check('80x4 (e1RM 90.7) beats 70x8 (88.7)', trade[1].isPR);

// bodyweight PR on reps
const bw = buildSessions([S('p', '2026-09-01', 1, 0, 8), S('p', '2026-09-08', 1, 0, 10)]);
check('bodyweight PR by reps', bw[1].isPR && Math.abs(strengthChangePct(bw[0], bw[1])! - 25) < 1e-9);

// month summary
const ex = [{ id: 'b', workout_id: 'push' }, { id: 'sq', workout_id: 'leg' }, { id: 'new', workout_id: 'push' }];
const m = new Map<string, SetRow[]>([
  ['b', [...bench, S('b', '2026-10-02', 1, 75, 8)]],                     // before-month session + Oct session
  ['sq', [S('sq', '2026-10-01', 1, 100, 5), S('sq', '2026-10-05', 1, 100, 5)]], // flat, no PR
  ['new', [S('new', '2026-10-03', 1, 20, 10)]],                         // single point → no trend
]);
const sum = summariseMonth(ex, m, '2026-10-01', '2026-11-01');
check('workouts completed = push@10-02, leg@10-01, leg@10-05, push@10-03', sum.workoutsCompleted === 4, String(sum.workoutsCompleted));
check('improved = 1 (bench)', sum.exercisesImproved === 1, String(sum.exercisesImproved));
check('PRs = 1', sum.newPRs === 1, String(sum.newPRs));
check('trend samples = 2', sum.trendSamples === 2);
const benchPct = ((75 * (1 + 8 / 30)) / (72.5 * (1 + 8 / 30)) - 1) * 100;
check('trend = mean(bench%, 0)', Math.abs(sum.strengthTrendPct! - benchPct / 2) < 1e-6, String(sum.strengthTrendPct));

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
