import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, useCurrentFrame } from "remotion";
import { loadBrandFonts } from "../../design/fonts";
import type { Box } from "../../design/probe";

export const FEATURE_TAG = "FEATURES ";

interface FeatureMeasure {
  id: string;
  text: string;
  px: number;
  opacity: number;
  box: Box;
}

export interface FrameMeasure {
  frame: number;
  features: FeatureMeasure[];
}

function opacityOf(element: HTMLElement): number {
  let value = 1;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) value *= Number(getComputedStyle(node).opacity);
  return value;
}

function measure(frame: number): FrameMeasure {
  const features = [...document.querySelectorAll<HTMLElement>("[data-feature]")].map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      id: element.dataset.feature ?? "",
      text: element.textContent ?? "",
      px: Number.parseFloat(getComputedStyle(element).fontSize),
      opacity: opacityOf(element),
      box: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    };
  });
  return { frame, features };
}

export function FeatureProbe() {
  const frame = useCurrentFrame();
  const [handle] = useState(() => delayRender("feature probe"));
  useEffect(() => {
    loadBrandFonts()
      .then(() => {
        console.log(FEATURE_TAG + JSON.stringify(measure(frame)));
        continueRender(handle);
      })
      .catch((error) => cancelRender(error));
  }, [frame, handle]);
  return null;
}
