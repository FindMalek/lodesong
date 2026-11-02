import { expect, test } from "bun:test";
import type { NewRelease } from "@lodesong/shared/releases";
import { filterKind, groupByWeek } from "./releases";

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

test("releases are grouped by week, newest first, and filtered by type", () => {
  const now = Date.UTC(2026, 9, 29);
  const all = [
    release("old", "2026-10-02"),
    release("mon", "2026-10-26", "single"),
    release("sat", "2026-10-24", "ep"),
    release("soon", "2026-11-12"),
    release("month", "2026-10"),
  ];
  expect(groupByWeek(all, now).map((group) => [group.label, group.releases.map((item) => item.id)])).toEqual([
    ["coming up", ["soon"]],
    ["this week", ["mon"]],
    ["last week", ["sat"]],
    ["week of sep 28", ["old", "month"]],
  ]);
  expect(filterKind(all, "ep").map((item) => item.id)).toEqual(["sat"]);
  expect(filterKind(all, "all")).toHaveLength(5);
});
