import { useEffect, useMemo, useState } from "react";
import type { AuraSong } from "@/lib/aura";
import { HEADERS, onAccountChange } from "@/lib/subsonic";

interface Analysed {
  energy: number;
  valence: number;
  bpm: number;
}

type Id = { id: string };

const BATCH = 2000;
// A song with no analysis yet (or a failed request) is asked again after this, so a later AudioMuse sync reaches the page.
const RETRY_MS = 5 * 60_000;

const known = new Map<string, Analysed>();
const asked = new Map<string, number>();
const listeners = new Set<() => void>();

onAccountChange(() => {
  known.clear();
  asked.clear();
  for (const listener of listeners) listener();
});

async function batch(ids: string[]): Promise<boolean> {
  try {
    const response = await fetch("/api/audiomuse/features", {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!response.ok) return false;
    const { features } = (await response.json()) as { features?: Record<string, Analysed> };
    for (const [id, value] of Object.entries(features ?? {})) known.set(id, value);
    return Object.keys(features ?? {}).length > 0;
  } catch {
    return false;
  }
}

/** Fetches features for songs not asked about lately; resolves once they are cached. */
export async function analyse(ids: string[]): Promise<void> {
  const now = Date.now();
  const fresh = [...new Set(ids)].filter((id) => !known.has(id) && now - (asked.get(id) ?? 0) > RETRY_MS);
  for (const id of fresh) asked.set(id, now);
  const results = await Promise.all(
    Array.from({ length: Math.ceil(fresh.length / BATCH) }, (_, index) => batch(fresh.slice(index * BATCH, (index + 1) * BATCH))),
  );
  if (results.some(Boolean)) for (const listener of listeners) listener();
}

export function withFeatures<T extends AuraSong & Id>(songs: T[]): T[] {
  return songs.map((song) => {
    const found = known.get(song.id);
    return found ? { ...song, energy: found.energy, valence: found.valence, bpm: found.bpm || song.bpm } : song;
  });
}

/** The songs with their AudioMuse features once the server has answered. */
export function useAnalysed<T extends AuraSong & Id>(songs: T[]): T[] {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    listeners.add(listener);
    void analyse(songs.map((song) => song.id));
    return () => {
      listeners.delete(listener);
    };
  }, [songs]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: version marks the cache filling
  return useMemo(() => withFeatures(songs), [songs, version]);
}
