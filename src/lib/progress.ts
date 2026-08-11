// Ported from getProjections()/computeMonthColors() in the original app
// (vitality-dashboard-template_2.html:2509-2536). Pace is now per-client
// config (client_profiles.pace_config) instead of a hardcoded constant.

export type GoalType = 'lose' | 'gain';
export type MonthColor = 'green' | 'orange' | 'red' | null;

const TOL = 0.4; // kg tolerance band used by the original

// pace_config stores a per-month rate (kg to lose/gain that month), e.g.
// lose: [2,2,2,1.5,1.5,1.5] — this sums them cumulatively to get each
// month's target weight, rather than baking in fixed cumulative offsets,
// so a coach can set a different pace per client.
export function getProjections(startWeight: number, goalType: GoalType, monthlyRates: number[]): number[] {
  let cumulative = 0;
  return monthlyRates.map((rate) => {
    cumulative += goalType === 'gain' ? rate : -rate;
    return startWeight + cumulative;
  });
}

/**
 * actuals[i] may be null/undefined if that month's checkpoint hasn't been entered.
 * Returns one color per month, same length as actuals — color reflects whether
 * the gap to target is shrinking (green), flat (orange), or growing (red)
 * versus the previous month's gap; the first entered month judges absolute
 * distance from target instead (nothing to compare against yet).
 */
export function computeMonthColors(projections: number[], actuals: (number | null | undefined)[]): MonthColor[] {
  const colors: MonthColor[] = [];
  let prevDist: number | null = null;
  actuals.forEach((actual, i) => {
    if (!actual) { colors.push(null); return; }
    const dist = Math.abs(actual - projections[i]);
    let color: MonthColor;
    if (prevDist === null) color = dist <= TOL ? 'green' : dist <= TOL * 3 ? 'orange' : 'red';
    else if (dist < prevDist - TOL) color = 'green';
    else if (dist > prevDist + TOL) color = 'red';
    else color = 'orange';
    colors.push(color);
    prevDist = dist;
  });
  return colors;
}

// Colors the trend-graph line segment BETWEEN two consecutive weigh-ins —
// a simpler, more literal signal than computeMonthColors above (which
// judges distance from a pace-based projection curve): this only asks
// "did this specific move go the right way for this client's goal?"
// Direction inverts correctly for gain vs loss because it's driven by
// goalType, not a hardcoded sign — losing weight is green for a 'lose'
// goal and red for a 'gain' goal, and vice versa.
const FLAT_TOLERANCE_KG = 0.2;

export function segmentColor(fromWeight: number, toWeight: number, goalType: GoalType): 'green' | 'orange' | 'red' {
  const delta = toWeight - fromWeight;
  if (Math.abs(delta) <= FLAT_TOLERANCE_KG) return 'orange';
  const towardGoal = goalType === 'gain' ? delta : -delta;
  return towardGoal > 0 ? 'green' : 'red';
}
