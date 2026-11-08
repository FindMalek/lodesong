import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, useCurrentFrame } from "remotion";
import { loadBrandFonts } from "./fonts";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Measure {
  frame: number;
  legible: { text: string; px: number; opacity: number }[];
  panels: Box[];
  furniture: Box[];
}

export const PROBE_TAG = "PROBE ";

const box = (element: Element): Box => {
  const r = element.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height };
};

function opacityOf(element: HTMLElement): number {
  let value = 1;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
  return value;
}

function measure(frame: number): Measure {
  const legible = [...document.querySelectorAll<HTMLElement>("[data-legible]")].map((element) => ({
    text: element.textContent ?? "",
    px: Number.parseFloat(getComputedStyle(element).fontSize) * (element.getBoundingClientRect().height / element.offsetHeight),
    opacity: opacityOf(element),
  }));
  return {
    frame,
    legible,
    panels: [...document.querySelectorAll("[data-panel]")].map(box),
    furniture: [...document.querySelectorAll("[data-furniture]")].map(box),
  };
}

/** Logs what the frame really draws (rendered text height, opacity, panel boxes) so scripts/check.ts can fail on it. */
export function Probe() {
  const frame = useCurrentFrame();
  const [handle] = useState(() => delayRender("probe"));
  useEffect(() => {
    loadBrandFonts()
      .then(() => {
        console.log(PROBE_TAG + JSON.stringify(measure(frame)));
        continueRender(handle);
      })
      .catch((error) => cancelRender(error));
  }, [frame, handle]);
  return null;
}
