import { useSyncExternalStore } from "react";
import en from "@/locales/en.json";
import { getSetting, subscribeSettings } from "./settings";

export const LANGUAGES = ["en", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

type Plural<K extends string> = K extends `${infer Base}.${"one" | "other"}` ? Base : K;
export type MessageKey = Plural<keyof typeof en>;
type Params = Record<string, string | number>;
type Catalog = Record<string, string>;

// English ships with the page; every other language is its own chunk, fetched only when picked.
const LOADERS: Record<Exclude<Language, "en">, () => Promise<{ default: Catalog }>> = {
  fr: () => import("@/locales/fr.json"),
};

let catalog: Catalog = en;
let loaded: Language = "en";
const listeners = new Set<() => void>();

export function language(): Language {
  const chosen = getSetting("language");
  if (chosen !== "auto") return chosen;
  const preferred = (globalThis.navigator?.language ?? "en").slice(0, 2).toLowerCase();
  return LANGUAGES.find((item) => item === preferred) ?? "en";
}

async function load(): Promise<void> {
  const wanted = language();
  if (wanted === loaded) return;
  const next = wanted === "en" ? en : (await LOADERS[wanted]()).default;
  if (language() !== wanted) return;
  catalog = next;
  loaded = wanted;
  document.documentElement.lang = wanted;
  for (const listener of listeners) listener();
}

export function t(key: MessageKey, params: Params = {}): string {
  const rule = typeof params.count === "number" ? new Intl.PluralRules(loaded).select(params.count) : "";
  const find = (messages: Catalog) => messages[`${key}.${rule}`] ?? messages[key];
  const template = find(catalog) ?? find(en) ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return typeof value === "number" ? value.toLocaleString(loaded) : String(value ?? "");
  });
}

subscribeSettings(() => void load());
void load();

export function useT(): typeof t {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => catalog,
  );
  return t;
}
