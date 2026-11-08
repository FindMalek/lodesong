import { useVideoConfig } from "remotion";

export type Layout = "wide" | "tall";

export function useLayout(): { layout: Layout; width: number; height: number } {
  const { width, height } = useVideoConfig();
  return { layout: width >= height ? "wide" : "tall", width, height };
}

export const MARK = 56;
