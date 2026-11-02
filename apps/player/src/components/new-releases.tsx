import { Button } from "@lodesong/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import { Section } from "@/components/library";
import { Link } from "@/components/link";
import { ReleaseCard } from "@/components/release-card";
import { NewReleasesSkeleton } from "@/components/skeletons";
import { RELEASE_CARD_HEIGHT } from "@/lib/releases";
import { rpc } from "@/lib/rpc";

const SHELF = 12;

// New albums, EPs and singles by artists you follow that aren't in the library yet. The full feed is on /following.
export default function NewReleases() {
  const { data } = useQuery(rpc.releases.list.queryOptions({ staleTime: 0, refetchOnWindowFocus: false }));
  if (!data) return <NewReleasesSkeleton />;
  if (!data.watching) return null;
  return (
    <Section
      title="new from artists you follow"
      action={
        <Button variant="link" size="xs" className="h-4 p-0 font-mono text-muted-foreground" render={<Link href="/following" />}>
          <UsersIcon /> {data.releases.length > SHELF ? "see all" : "following"}
        </Button>
      }
    >
      {data.releases.length ? (
        <ul
          aria-label="new releases"
          className="flex gap-3 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
          style={{ height: RELEASE_CARD_HEIGHT }}
        >
          {data.releases.slice(0, SHELF).map((release) => (
            <ReleaseCard key={release.id} release={release} />
          ))}
        </ul>
      ) : (
        <div className="flex flex-col items-start justify-center gap-2 border p-5" style={{ height: RELEASE_CARD_HEIGHT }}>
          <p className="font-medium text-sm">nothing new in the last three months</p>
          <p className="max-w-md text-muted-foreground text-xs">
            new albums, EPs and singles from artists you follow show up here, the week they come out. the artists you play most are followed
            for you; follow more by name and pin the ones you never want to lose.
          </p>
          <Button size="xs" variant="outline" render={<Link href="/following" />}>
            find artists to follow
          </Button>
        </div>
      )}
    </Section>
  );
}
