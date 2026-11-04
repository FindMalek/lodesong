import { Button } from "@lodesong/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { apiQueries } from "@/lib/api-queries";
import { notify } from "@/lib/notify";
import { rpc } from "@/lib/rpc";

export default function SyncFollows() {
  const client = useQueryClient();
  const canSync = useQuery(apiQueries.session()).data?.lyterionAdd === true;
  const sync = useMutation(
    rpc.follows.sync.mutationOptions({
      onSuccess: ({ added, total, artists }) => {
        client.setQueryData(rpc.follows.list.queryOptions().queryKey, { artists });
        void client.invalidateQueries({ queryKey: rpc.releases.list.queryOptions().queryKey });
        notify({ message: added ? `followed ${added} new from spotify (${total} there)` : `already following all ${total} from spotify` });
      },
      onError: () => notify({ kind: "error", message: "couldn't reach lyterion, try again" }),
    }),
  );
  if (!canSync) return null;
  return (
    <Button variant="outline" size="xs" disabled={sync.isPending} onClick={() => sync.mutate({})}>
      <RefreshCwIcon className={sync.isPending ? "animate-spin" : undefined} /> sync from spotify
    </Button>
  );
}
