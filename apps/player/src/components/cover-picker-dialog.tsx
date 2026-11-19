import { Button } from "@lodesong/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@lodesong/ui/components/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { coverOverridesQuery, useCoverOverrides } from "@/lib/cover-overrides";
import { notify } from "@/lib/notify";
import { rpc } from "@/lib/rpc";
import { Cover } from "./cover";
import { Loader } from "./loader";

/** Pictures found by name on Cover Art Archive and Deezer; the pick is kept for this account only, Navidrome and the files stay as they are. */
export function CoverPickerDialog({
  coverId,
  what,
  name,
  artist,
  onClose,
}: {
  coverId: string;
  what: "album" | "artist";
  name: string;
  artist: string;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const replaced = useCoverOverrides().some((item) => item.id === coverId);
  const found = useQuery(
    rpc.covers.candidates.queryOptions({
      input: { kind: what, name, artist },
      staleTime: 10 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    }),
  );
  const refresh = () => client.invalidateQueries({ queryKey: coverOverridesQuery().queryKey });
  const pick = useMutation(
    rpc.covers.setOverride.mutationOptions({
      onSuccess: async () => {
        await refresh();
        notify({ message: `${name} has a new cover` });
        onClose();
      },
      onError: () => notify({ kind: "error", message: "couldn't use that picture, try another" }),
    }),
  );
  const reset = useMutation(
    rpc.covers.removeOverride.mutationOptions({
      onSuccess: async () => {
        await refresh();
        notify({ message: `${name} is back to its original cover` });
        onClose();
      },
      onError: () => notify({ kind: "error", message: "that didn't work, try again" }),
    }),
  );
  const candidates = found.data?.candidates ?? [];
  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-mono">find another cover</DialogTitle>
          <DialogDescription>
            only changes what lodesong shows for {name}, for your account. the files and navidrome stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-3">
          <div className="flex w-24 shrink-0 flex-col gap-1.5">
            <Cover id={coverId} size={96} className="w-24" alt={`current cover of ${name}`} />
            <span className="font-mono text-faint text-label">{replaced ? "current (yours)" : "current"}</span>
          </div>
          <div className="min-h-32 min-w-0 flex-1" aria-live="polite">
            {found.isPending && (
              <p className="flex items-center gap-2 text-muted-foreground text-small">
                <Loader label="searching" /> searching…
              </p>
            )}
            {found.isError && <p className="text-muted-foreground text-small">couldn't search just now, try again in a minute.</p>}
            {found.isSuccess && candidates.length === 0 && (
              <p className="text-muted-foreground text-small">nothing found for {name}. it may be called differently elsewhere.</p>
            )}
            {candidates.length > 0 && (
              <ul aria-label="covers found" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      disabled={pick.isPending}
                      aria-label={`use ${candidate.title}, ${candidate.size} px`}
                      onClick={() => pick.mutate({ id: coverId, candidate: candidate.id })}
                      className="flex w-full flex-col gap-1 text-left outline-offset-2 hover:opacity-80 focus-visible:outline-2 disabled:opacity-50"
                    >
                      <img src={candidate.thumb} alt="" className="aspect-square w-full object-cover outline outline-muted" />
                      <span className="truncate text-xs">{candidate.title}</span>
                      <span className="font-mono text-faint text-label">
                        {candidate.size} px · {candidate.source === "archive" ? "cover art archive" : "deezer"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          {replaced && (
            <Button variant="outline" disabled={reset.isPending} onClick={() => reset.mutate({ id: coverId })}>
              use the original cover
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
