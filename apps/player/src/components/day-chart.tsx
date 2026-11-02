import { type KeyboardEvent, type PointerEvent, useState } from "react";
import { plural } from "@/lib/format";

export type DayMinutes = { day: string; minutes: number };

const label = (day: string): string =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toLowerCase();

/** Minutes per day as plain bars. One tab stop, arrow keys step through the days, and the value shows above the chart. */
export function DayChart({ days }: { days: DayMinutes[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const last = Math.max(0, days.length - 1);
  const max = Math.max(1, ...days.map((day) => day.minutes));
  const peak = days.reduce((best, day, index) => (day.minutes > (days[best]?.minutes ?? 0) ? index : best), 0);
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  const shown = active ?? peak;
  const current = days[shown];
  const clamp = (index: number): number => Math.min(last, Math.max(0, index));

  function at(event: PointerEvent<HTMLElement>): void {
    const box = event.currentTarget.getBoundingClientRect();
    setActive(clamp(Math.floor(((event.clientX - box.left) / box.width) * days.length)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
    const next = event.key === "Home" ? 0 : event.key === "End" ? last : step === undefined ? null : shown + step;
    if (next === null) return;
    event.preventDefault();
    setActive(clamp(next));
  }

  if (!current) return null;
  return (
    <div className="flex flex-col gap-1.5" data-slot="chart">
      <p id="day-chart-summary" className="sr-only">
        {plural(total, "minute")} over {plural(days.length, "day")}, most on {label(days[peak]?.day ?? current.day)}
      </p>
      <p className="h-4 font-mono text-muted-foreground text-xs" aria-hidden>
        {active === null && "busiest · "}
        {label(current.day)} · <span className="text-foreground tabular-nums">{current.minutes.toLocaleString()}</span> min
      </p>
      {/* biome-ignore lint/a11y/useSemanticElements: a custom chart, not an input */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="minutes per day"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={shown}
        aria-valuetext={`${label(current.day)}: ${plural(current.minutes, "minute")}`}
        aria-describedby="day-chart-summary"
        className="flex h-32 touch-pan-y items-end border-b outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onPointerDown={at}
        onPointerMove={at}
        onPointerLeave={() => !focused && setActive(null)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setActive(null);
        }}
        onKeyDown={onKeyDown}
      >
        {days.map((day, index) => (
          <span
            key={day.day}
            className="flex h-full min-w-0 flex-1 items-end"
            style={{ opacity: active === null || active === index ? 1 : 0.5 }}
          >
            <span className="w-full bg-chart-1" style={{ height: `${(day.minutes / max) * 100}%`, minHeight: day.minutes ? 2 : 0 }} />
          </span>
        ))}
      </div>
      <div className="flex justify-between font-mono text-muted-foreground text-xs" aria-hidden>
        <span>{label(days[0]?.day ?? current.day)}</span>
        <span>{label(days[last]?.day ?? current.day)}</span>
      </div>
    </div>
  );
}
