import { Button } from "@lodesong/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { UsersIcon } from "lucide-react";
import { Link } from "@/components/link";
import { rpc } from "@/lib/rpc";

// Lives in the page header, where showing up pushes nothing down.
export function FollowHint() {
  const follows = useQuery(rpc.follows.list.queryOptions());
  if (follows.data?.artists.length !== 0) return null;
  return (
    <Button variant="link" size="xs" className="h-4 p-0 font-mono text-muted-foreground" render={<Link href="/following" />}>
      <UsersIcon /> follow artists to see new releases here
    </Button>
  );
}
