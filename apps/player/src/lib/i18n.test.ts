import { expect, test } from "bun:test";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import { t } from "./i18n";

test("every language has exactly the english keys, and messages pick the plural and fill in the count", () => {
  expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  expect(t("history.songs", { count: 1 })).toBe("1 song");
  expect(t("history.songs", { count: 1200 })).toBe("1,200 songs");
  expect(t("history.skipped", { count: 3 })).toBe("3 skipped");
});
