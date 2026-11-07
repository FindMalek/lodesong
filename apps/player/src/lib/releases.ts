import type { NewRelease } from "@lodesong/shared/releases";

/** Fixed: the home shelf reserves exactly this much before releases arrive, so nothing below moves. */
export const RELEASE_CARD_HEIGHT = 252;

const DAY = 86_400_000;
const WEEK = 7 * DAY;

const KINDS = ["all", "album", "ep", "single"] as const;
export type KindFilter = (typeof KINDS)[number];

export interface WeekGroup {
  label: string;
  releases: NewRelease[];
}

function parts(date: string): [number, number, number | undefined] {
  const [year, month, day] = date.split("-").map(Number);
  return [year ?? 1970, month ?? 1, day];
}

function time(date: string): number {
  const [year, month, day] = parts(date);
  return Date.UTC(year, month - 1, day ?? 1);
}

/** "mar 14" for a day, "mar 2026" when the source only knows the month. */
export function when(date: string): string {
  const [, , day] = parts(date);
  return new Date(time(date))
    .toLocaleDateString("en", { timeZone: "UTC", month: "short", ...(day ? { day: "numeric" } : { year: "numeric" }) })
    .toLowerCase();
}

function weekStart(at: number): number {
  const day = (new Date(at).getUTCDay() + 6) % 7;
  return at - day * DAY - (at % DAY);
}

/** Newest week first: "coming up", "this week", "last week", then "week of mar 9". */
export function groupByWeek(releases: NewRelease[], now: number): WeekGroup[] {
  const current = weekStart(now);
  const groups = new Map<number, WeekGroup>();
  for (const release of [...releases].sort((a, b) => time(b.date) - time(a.date))) {
    const start = Math.min(weekStart(time(release.date)), current + WEEK);
    const label =
      start > current
        ? "coming up"
        : start === current
          ? "this week"
          : start === current - WEEK
            ? "last week"
            : `week of ${when(new Date(start).toISOString().slice(0, 10))}`;
    const group = groups.get(start) ?? { label, releases: [] };
    group.releases.push(release);
    groups.set(start, group);
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]).map(([, group]) => group);
}

export function filterKind(releases: NewRelease[], kind: KindFilter): NewRelease[] {
  return kind === "all" ? releases : releases.filter((release) => release.kind === kind);
}
