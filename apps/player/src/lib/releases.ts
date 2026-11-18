/** Fixed: the home shelf reserves exactly this much before releases arrive, so nothing below moves. */
export const RELEASE_CARD_HEIGHT = 252;

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
