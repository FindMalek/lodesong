import { expect, test } from "bun:test";
import type { NewRelease } from "@lodesong/shared/releases";
import { thisWeek } from "./releases";

const release = (id: string, date: string, kind = "album"): NewRelease => ({
  id,
  artist: "Hurt",
  title: id,
  kind,
  date,
  url: "",
  requested: false,
  canGet: false,
  seen: false,
});

test("the home shelf keeps only releases from the last 7 days, today included", () => {
  const now = Date.UTC(2026, 9, 29, 15);
  const all = [
    release("today", "2026-10-29"),
    release("edge", "2026-10-22"),
    release("old", "2026-10-21"),
    release("tomorrow", "2026-10-30"),
    release("soon", "2026-11-05"),
    release("month", "2026-10"),
  ];
  expect(thisWeek(all, now).map((item) => item.id)).toEqual(["today", "edge"]);
});
