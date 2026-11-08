import { Button } from "@lodesong/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@lodesong/ui/components/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@lodesong/ui/components/item";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const [failed, setFailed] = useState(false);
  const [problem, setProblem] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    setFailed(false);
    const response = await fetch("/api/share", { headers: HEADERS }).catch(() => null);
    const body = response?.ok ? ((await response.json().catch(() => null)) as { shares: SharedRow[] } | null) : null;
    setRows(body?.shares ?? null);
    setFailed(!body);
  }, []);

  useEffect(() => {
    if (open) {
      setRows(null);
      setProblem("");
      void load();
    }
  }, [open, load]);

  async function stop(id: string, index: number): Promise<void> {
    setProblem("");
    const response = await fetch(`/api/share/${id}`, { method: "DELETE", headers: HEADERS }).catch(() => null);
    if (!response?.ok && response?.status !== 404) {
      setProblem("that didn't work, try again");
      return;
    }
    await load();
    requestAnimationFrame(() => {
      const buttons = list.current?.querySelectorAll("button");
      (buttons?.[Math.min(index, (buttons?.length ?? 1) - 1)] ?? title.current)?.focus();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle ref={title} tabIndex={-1} className="font-mono">
            shared links
          </DialogTitle>
          <DialogDescription>
            links you copied with "copy share link". stopping one ends every copy of it, and each ends by itself on its date.
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <EmptyState>
            <span role="alert">couldn't load your shared links.</span>{" "}
            <Button variant="outline" size="sm" onClick={() => void load()}>
              try again
            </Button>
          </EmptyState>
        ) : !rows ? (
          <EmptyState>loading…</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState>nothing shared</EmptyState>
        ) : (
          <ItemGroup ref={list}>
            {rows.map((row, index) => (
              <Item key={row.id} role="listitem" variant="outline" size="sm">
                <ItemContent>
                  <ItemTitle>{row.title}</ItemTitle>
                  <ItemDescription className="font-mono">
                    {row.kind} · ends {day(row.expires)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button variant="outline" size="sm" aria-label={`stop sharing ${row.title}`} onClick={() => void stop(row.id, index)}>
                    stop sharing
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
        {problem && (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
