// Client-local calendar date as YYYY-MM-DD — used consistently as the `date`
// column value across food_log_entries/daily_metrics/habit_completions so a
// day is scoped to the user's own timezone, not the server's.
export function localDateStr(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDateStr(dt);
}

// "Today" as the coach experiences it (Malta) — used when the coach picks a
// day to message a client; the client's own app uses their device's local day.
export function coachToday(now = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/Malta' });
}
