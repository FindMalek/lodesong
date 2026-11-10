import { Button } from "@lodesong/ui/components/button";
import { XIcon } from "lucide-react";
import { useState } from "react";

const KEY = "keep-player:demo-notice";

function dismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === "off";
  } catch {
    return false;
  }
}

/** A thin strip on the public demo: everyone shares one account and the nightly reset wipes what they did. */
export function DemoNotice() {
  const [hidden, setHidden] = useState(dismissed);
  if (hidden) return null;
  return (
    <div role="note" className="flex h-7 items-center justify-center gap-2 border-b bg-muted px-2 font-mono text-muted-foreground text-xs">
      <span className="truncate">public demo, resets every night</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="dismiss"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem(KEY, "off");
          } catch {}
        }}
      >
        <XIcon />
      </Button>
    </div>
  );
}
