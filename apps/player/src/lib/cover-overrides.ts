import { queryOptions, useQuery } from "@tanstack/react-query";
import { HEADERS, setCoverVersions } from "./subsonic";

type Override = { id: string; version: string };

/** Plain fetch, not the rpc client: every cover on the first screen reads this. */
export const coverOverridesQuery = () =>
  queryOptions({
    queryKey: ["coverOverrides"],
    queryFn: async (): Promise<Override[]> => {
      const response = await fetch("/api/covers/overrides", { headers: HEADERS });
      if (!response.ok) throw new Error(`cover overrides: ${response.status}`);
      return ((await response.json()) as { overrides: Override[] }).overrides;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

let applied: unknown;

/** Keeps `coverUrl` adding the version of each replaced cover; a component using it redraws when the list changes. */
export function useCoverOverrides(): Override[] {
  const overrides = useQuery(coverOverridesQuery()).data;
  if (overrides && overrides !== applied) {
    applied = overrides;
    setCoverVersions(overrides);
  }
  return overrides ?? [];
}
