import { Button } from "@lodesong/ui/components/button";
import { Input } from "@lodesong/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { HEADERS } from "@/lib/subsonic";

interface Suggestion {
  field: string;
  current: string;
  proposed: string;
  kind: "fill" | "replace";
}

async function call<T>(method: "POST" | "PUT", body: unknown): Promise<T> {
  const response = await fetch("/api/upload/metadata", {
    method,
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `failed (${response.status})`);
  return data;
}

/** The model only proposes: nothing is kept unless it is ticked, and a tag the file already has starts unticked. */
export function UploadTags({ path }: { path: string }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [use, setUse] = useState<Record<string, boolean>>({});
  const ask = useMutation({
    mutationFn: () => call<{ suggestions: Suggestion[] }>("POST", { path }),
    onSuccess: ({ suggestions }) => {
      setEdits(Object.fromEntries(suggestions.map((item) => [item.field, item.proposed])));
      setUse(Object.fromEntries(suggestions.map((item) => [item.field, item.kind === "fill"])));
    },
  });
  const save = useMutation({
    mutationFn: (accepted: Record<string, string>) => call<{ saved: string }>("PUT", { path, accepted }),
  });
  const suggestions = ask.data?.suggestions;
  const accepted = Object.fromEntries(Object.entries(edits).filter(([field, value]) => use[field] && value.trim()));

  if (save.data) return <p className="text-muted-foreground text-xs">saved to {save.data.saved}, the song file itself is untouched</p>;
  if (suggestions && !suggestions.length) return <p className="text-muted-foreground text-xs">the tags look fine, nothing to add</p>;
  if (!suggestions)
    return (
      <div className="flex items-baseline gap-3">
        <Button variant="outline" size="sm" disabled={ask.isPending} onClick={() => ask.mutate()}>
          {ask.isPending ? "asking…" : "fill missing tags with ai"}
        </Button>
        {ask.error && <span className="text-destructive text-xs">{ask.error.message}</span>}
      </div>
    );
  return (
    <div className="flex flex-col gap-2 border p-3">
      <p className="text-muted-foreground text-xs">
        suggestions from the model, check what you want to keep. nothing is written until you save.
      </p>
      {suggestions.map((item) => (
        <div key={item.field} className="grid grid-cols-[auto_5rem_1fr] items-center gap-2 text-sm">
          <input
            type="checkbox"
            aria-label={`use ${item.field}`}
            checked={use[item.field] ?? false}
            onChange={(event) => setUse({ ...use, [item.field]: event.target.checked })}
          />
          <span className="font-mono text-xs">{item.field}</span>
          <div className="flex flex-col gap-1">
            <Input
              aria-label={item.field}
              value={edits[item.field] ?? ""}
              onChange={(event) => setEdits({ ...edits, [item.field]: event.target.value })}
            />
            {item.kind === "replace" && <span className="truncate text-muted-foreground text-xs">now: {item.current}</span>}
          </div>
        </div>
      ))}
      <div className="flex items-baseline gap-3">
        <Button size="sm" disabled={!Object.keys(accepted).length || save.isPending} onClick={() => save.mutate(accepted)}>
          save accepted
        </Button>
        {save.error && <span className="text-destructive text-xs">{save.error.message}</span>}
      </div>
    </div>
  );
}
