import { type ReactNode, useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";

const FACES = [
  { family: "IBM Plex Sans Variable", file: "ibm-plex-sans-latin-wght-normal.woff2", weight: "100 700" },
  { family: "JetBrains Mono Variable", file: "jetbrains-mono-latin-wght-normal.woff2", weight: "100 800" },
];

let loading: Promise<unknown> | undefined;

export const loadBrandFonts = (): Promise<unknown> => {
  loading ??= Promise.all(
    FACES.map(async ({ family, file, weight }) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}`)}) format("woff2")`, { weight, display: "block" });
      document.fonts.add(await face.load());
    }),
  ).catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
};

/** Holds every frame until the brand fonts are decoded, so no render ever captures fallback type. */
export function FontGate({ children }: { children: ReactNode }) {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    loadBrandFonts()
      .then(() => continueRender(handle))
      .catch((error) => cancelRender(error));
  }, [handle]);
  return children;
}
