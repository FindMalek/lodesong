import { Badge } from "@lodesong/ui/components/badge";
import { Button } from "@lodesong/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@lodesong/ui/components/dialog";
import { Input } from "@lodesong/ui/components/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon, PinIcon, UsersIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Section } from "@/components/library";
import { rpc } from "@/lib/rpc";

function when(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const at = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return at
    .toLocaleDateString("en", { timeZone: "UTC", month: "short", ...(day ? { day: "numeric" } : { year: "numeric" }) })
    .toLowerCase();
}

function Following({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const follows = useQuery(rpc.follows.list.queryOptions({ staleTime: 0 }));
  const set = useMutation(
    rpc.follows.set.mutationOptions({
      onSuccess: (data) => {
        client.setQueryData(rpc.follows.list.queryOptions().queryKey, data);
        setTimeout(() => void client.invalidateQueries({ queryKey: rpc.releases.list.queryOptions().queryKey }), 5000);
      },
    }),
  );
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>artists you follow</DialogTitle>
          <DialogDescription>
            the ones you play most are followed for you. pin one to keep it, or unfollow one you don't want to hear about.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) set.mutate({ name, status: "followed" });
            setName("");
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="follow an artist"
            aria-label="artist to follow"
          />
          <Button type="submit" variant="outline" disabled={!name.trim()}>
            follow
          </Button>
        </form>
        <ul aria-label="followed artists" className="flex max-h-72 flex-col overflow-y-auto">
          {follows.data?.artists.map((artist) => (
            <li key={artist.name} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate text-sm">{artist.name}</span>
              <Button
                size="icon-sm"
                variant={artist.status === "pinned" ? "secondary" : "ghost"}
                aria-label={`${artist.status === "pinned" ? "unpin" : "pin"} ${artist.name}`}
                aria-pressed={artist.status === "pinned"}
                onClick={() => set.mutate({ name: artist.name, status: artist.status === "pinned" ? "followed" : "pinned" })}
              >
                <PinIcon />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`unfollow ${artist.name}`}
                onClick={() => set.mutate({ name: artist.name, status: "unfollowed" })}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// New albums, EPs and singles by artists you follow that aren't in the library yet. With Lyterion, "get it" hands one over.
export default function NewReleases() {
  const client = useQueryClient();
  const [managing, setManaging] = useState(false);
  const { data } = useQuery(rpc.releases.list.queryOptions({ staleTime: 0, refetchOnWindowFocus: false }));
  const get = useMutation(
    rpc.releases.get.mutationOptions({
      onSuccess: () => void client.invalidateQueries({ queryKey: rpc.releases.list.queryOptions().queryKey }),
    }),
  );
  if (!data?.watching) return null;
  return (
    <Section
      title="new from artists you follow"
      action={
        <Button variant="link" size="xs" className="h-auto p-0 font-mono text-muted-foreground" onClick={() => setManaging(true)}>
          <UsersIcon /> following
        </Button>
      }
    >
      {data.releases.length ? (
        <ul aria-label="new releases" className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {data.releases.map((release) => (
            <li key={release.id} className="flex flex-col gap-1.5 border p-3">
              <span className="truncate font-medium text-sm">{release.title}</span>
              <span className="truncate text-muted-foreground text-xs">{release.artist}</span>
              <span className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="font-mono font-normal">
                  {release.kind}
                </Badge>
                <span className="text-muted-foreground">{when(release.date)}</span>
              </span>
              <span className="mt-1 flex items-center gap-2">
                <Button
                  size="xs"
                  variant="link"
                  className="h-auto p-0"
                  render={<a href={release.url} target="_blank" rel="noreferrer" aria-label={`${release.title} on musicbrainz`} />}
                >
                  musicbrainz <ExternalLinkIcon />
                </Button>
                {release.canGet &&
                  (release.requested ? (
                    <span className="font-mono text-muted-foreground text-xs">asked lyterion</span>
                  ) : (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={get.isPending}
                      aria-label={`get ${release.title}`}
                      onClick={() => get.mutate({ id: release.id })}
                    >
                      get it
                    </Button>
                  ))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">nothing new from them in the last three months</p>
      )}
      {managing && <Following onOpenChange={setManaging} />}
    </Section>
  );
}
