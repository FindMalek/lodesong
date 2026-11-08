import "@fontsource-variable/ibm-plex-sans";
import "@fontsource-variable/jetbrains-mono";
import { type ReactNode, useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";

const FACES = ['400 20px "IBM Plex Sans Variable"', '500 20px "IBM Plex Sans Variable"', '400 20px "JetBrains Mono Variable"'];

/** Holds every frame until the brand fonts are decoded, so no render ever captures fallback type. */
export function FontGate({ children }: { children: ReactNode }) {
  const [handle] = useState(() => delayRender("fonts"));
  useEffect(() => {
    Promise.all(FACES.map((face) => document.fonts.load(face)))
      .then(() => continueRender(handle))
      .catch((error) => cancelRender(error));
  }, [handle]);
  return children;
}
