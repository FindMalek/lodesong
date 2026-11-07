import { Button } from "@lodesong/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@lodesong/ui/components/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@lodesong/ui/components/item";
import { useCallback, useEffect, useState } from "react";
import { HEADERS } from "@/lib/subsonic";
import { EmptyState } from "./library";

interface SharedRow {
  id: string;
  kind: string;
  title: string;
  expires: number;
}

const day = (time: number) => new Date(time).toLocaleDateString(undefined, { dateStyle: "medium" });

/** The links this account has copied from the item menu, each with a way to end it. */
export function SharedLinksDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [rows, setRows] = useState<SharedRow[] | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/share").catch(() => null);
    setRows(response?.ok ? ((await response.json()) as { shares: SharedRow[] }).shares : null);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function stop(id: string): Promise<void> {
    await fetch(`/api/share/${id}`, { method: "DELETE", headers: HEADERS }).catch(() => undefined);
    await load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">shared links</DialogTitle>
          <DialogDescription>
            links you copied with "copy share link". stopping one ends every copy of it, and each ends by itself on its date.
          </DialogDescription>
        </DialogHeader>
        {!rows ? (
          <EmptyState>loading…</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState>nothing shared</EmptyState>
        ) : (
          <ItemGroup>
            {rows.map((row) => (
              <Item key={row.id} role="listitem" variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle>{row.title}</ItemTitle>
                  <ItemDescription className="font-mono">
                    {row.kind} · ends {day(row.expires)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button variant="outline" size="sm" onClick={() => void stop(row.id)}>
                    stop sharing
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </DialogContent>
    </Dialog>
  );
}
