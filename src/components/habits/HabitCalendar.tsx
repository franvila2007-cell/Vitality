'use client';

import { useState } from 'react';
import { addDays } from '@/lib/date';
import { habitsDueOn, scheduleLabel, type Habit } from '@/lib/habits';

// Month calendar of a client's scheduled habits. Each day shows a dot per
// habit due — filled when ticked, red-ish when a past day was missed, hollow
// when it's still ahead — and tapping a day lists that day's habits below.
// Shared by the client's Habits tab (ticking enabled) and the coach's
// read-only preview (no onToggle).

type Props = {
  habits: Habit[];
  /** date → ids of habits ticked that day */
  done: Record<string, string[]>;
  today: string;
  /** earliest month (YYYY-MM-01) that has data loaded — can't page back past it */
  minMonth: string;
  canToggle?: (date: string) => boolean;
  onToggle?: (habitId: string, date: string) => void;
  onAddForDate?: (date: string) => void;
};

const DOW_HEADER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function monthStart(date: string) { return date.slice(0, 8) + '01'; }
function shiftMonth(start: string, delta: number) {
  const [y, m] = start.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}
function daysInMonth(start: string) {
  const [y, m] = start.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function niceDate(date: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-GB', opts);
}

export default function HabitCalendar({ habits, done, today, minMonth, canToggle, onToggle, onAddForDate }: Props) {
  const [month, setMonth] = useState(() => monthStart(today));
  const [selected, setSelected] = useState(today);

  const first = new Date(month + 'T00:00:00Z').getUTCDay(); // 0 = Sun
  const lead = (first + 6) % 7; // Monday-first grid
  const count = daysInMonth(month);
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: count }, (_, i) => addDays(month, i)),
  ];
  while (cells.length % 7) cells.push(null);

  const selectedDue = habitsDueOn(habits, selected);
  const selectedDone = new Set(done[selected] || []);
  const toggleable = !!onToggle && (canToggle?.(selected) ?? true);

  return (
    <div className="bg-surface border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          disabled={month <= minMonth}
          aria-label="Previous month"
          className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
        >‹</button>
        <p className="text-sm font-semibold">{niceDate(month, { month: 'long', year: 'numeric' })}</p>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          aria-label="Next month"
          className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100"
        >›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DOW_HEADER.map((d, i) => <div key={i} className="text-center text-3xs font-medium uppercase text-neutral-400">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const due = habitsDueOn(habits, date);
          const ticked = new Set(done[date] || []);
          const doneCount = due.filter((h) => ticked.has(h.id)).length;
          const isPast = date < today;
          const isToday = date === today;
          const allDone = due.length > 0 && doneCount === due.length;
          const isSelected = date === selected;
          return (
            <button
              key={date}
              onClick={() => setSelected(date)}
              className={`relative aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
                isSelected ? 'ring-2 ring-brand' : ''
              } ${allDone ? 'bg-brand-light text-brand-dark font-semibold' : 'hover:bg-neutral-50'} ${
                isToday && !allDone ? 'bg-neutral-100 font-semibold' : ''
              }`}
            >
              <span className={isPast && !allDone ? 'text-neutral-400' : ''}>{Number(date.slice(8))}</span>
              {due.length > 0 && (
                <span className="flex gap-0.5">
                  {due.slice(0, 4).map((h) => {
                    const hit = ticked.has(h.id);
                    return (
                      <span
                        key={h.id}
                        className={`w-1.5 h-1.5 rounded-full ${
                          hit ? 'bg-brand' : isPast ? 'bg-red-300' : 'border border-neutral-300'
                        }`}
                      />
                    );
                  })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 mt-3 text-3xs text-neutral-400">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-brand" />Done</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-300" />Missed</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full border border-neutral-300" />Planned</span>
      </div>

      <div className="border-t border-border mt-4 pt-4">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-sm font-medium">
            {selected === today ? 'Today' : niceDate(selected, { weekday: 'long' })}
            <span className="text-neutral-400 font-normal"> · {niceDate(selected, { day: 'numeric', month: 'short' })}</span>
          </p>
          {onAddForDate && selected >= today && (
            <button onClick={() => onAddForDate(selected)} className="text-xs font-medium text-brand-dark hover:opacity-70">+ Add for this day</button>
          )}
        </div>
        {selectedDue.length === 0 && <p className="text-sm text-neutral-400">Nothing planned{selected < today ? '' : ' yet'}.</p>}
        <div className="flex flex-col gap-2">
          {selectedDue.map((h) => {
            const hit = selectedDone.has(h.id);
            const missed = !hit && selected < today;
            const body = (
              <>
                <span className={`w-5 h-5 rounded-md flex items-center justify-center text-xs flex-shrink-0 ${hit ? 'bg-brand text-white' : missed ? 'border border-red-300 text-red-400' : 'border border-neutral-300'}`}>
                  {hit ? '✓' : missed ? '–' : ''}
                </span>
                {h.emoji && <span className="text-base leading-none">{h.emoji}</span>}
                <span className={`flex-1 ${hit ? 'line-through opacity-75' : ''}`}>{h.label}</span>
                <span className="text-2xs text-neutral-400">{scheduleLabel(h)}</span>
              </>
            );
            const cls = `flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm ${hit ? 'bg-brand-light border-brand text-brand-dark' : 'border-border text-neutral-700'}`;
            return toggleable ? (
              <button key={h.id} onClick={() => onToggle!(h.id, selected)} className={`${cls} transition-transform active:scale-[0.99]`}>{body}</button>
            ) : (
              <div key={h.id} className={cls}>{body}</div>
            );
          })}
        </div>
        {onToggle && !toggleable && selected > today && selectedDue.length > 0 && (
          <p className="text-2xs text-neutral-400 mt-2">You can tick these off on the day.</p>
        )}
      </div>
    </div>
  );
}
