import { useEffect, useMemo, useState } from "react";
import type { AuraSong } from "@/lib/aura";
import { HEADERS } from "@/lib/subsonic";

interface Analysed {
  energy: number;
  valence: number;
  bpm: number;
}

// Asked once per song; a server without AudioMuse answers nothing and the aura falls back to tags.
const known = new Map<string, Analysed>();
const asked = new Set<string>();
const MAX_IDS = 2000;

async function load(ids: string[]): Promise<boolean> {
  const fresh = ids.filter((id) => !asked.has(id)).slice(0, MAX_IDS);
  if (!fresh.length) return false;
  for (const id of fresh) asked.add(id);
  const response = await fetch("/api/audiomuse/features", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ ids: fresh }),
  }).catch(() => null);
  if (!response?.ok) return false;
  const { features } = (await response.json()) as { features?: Record<string, Analysed> };
  for (const [id, value] of Object.entries(features ?? {})) known.set(id, value);
  return Object.keys(features ?? {}).length > 0;
}

export function withFeatures<T extends AuraSong & { id: string }>(songs: T[]): T[] {
  return songs.map((song) => {
    const found = known.get(song.id);
    return found ? { ...song, energy: found.energy, valence: found.valence, bpm: found.bpm || song.bpm } : song;
  });
}

/** The songs with their AudioMuse features once the server has answered. */
export function useAnalysed<T extends AuraSong & { id: string }>(songs: T[]): T[] {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    void load(songs.map((song) => song.id)).then((changed) => live && changed && setVersion((value) => value + 1));
    return () => {
      live = false;
    };
  }, [songs]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version marks the cache filling
  return useMemo(() => withFeatures(songs), [songs, version]);
}
