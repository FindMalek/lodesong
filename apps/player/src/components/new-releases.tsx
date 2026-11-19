import { Button } from "@lodesong/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import { Section } from "@/components/library";
import { Link } from "@/components/link";
import { ReleaseCard } from "@/components/release-card";
import { RELEASE_CARD_HEIGHT, thisWeek } from "@/lib/releases";
import { rpc } from "@/lib/rpc";

const SHELF = 12;

// New albums, EPs and singles by artists you follow that aren't in the library yet. The full feed is on /following.
export default function NewReleases() {
  const { data } = useQuery(rpc.releases.list.queryOptions({ staleTime: 0, refetchOnWindowFocus: false }));
  const fresh = data?.watching ? thisWeek(data.releases, Date.now()) : [];
  if (!fresh.length) return null;
  return (
    <Section
      title="new from artists you follow"
      action={
        <Button variant="link" size="xs" className="h-4 p-0 font-mono text-muted-foreground" render={<Link href="/following" />}>
          <UsersIcon /> {fresh.length > SHELF ? "see all" : "following"}
        </Button>
      }
    >
      <ul
        aria-label="new releases"
        className="flex gap-3 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        style={{ height: RELEASE_CARD_HEIGHT }}
      >
        {fresh.slice(0, SHELF).map((release) => (
          <ReleaseCard key={release.id} release={release} />
        ))}
      </ul>
    </Section>
  );
}
