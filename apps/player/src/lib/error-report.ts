import { getSetting } from "./settings";
import { HEADERS } from "./subsonic";
import { createTracedFetch } from "./trace";

const MAX_PER_SESSION = 20;
let sent = 0;

const tracing = createTracedFetch(window.fetch.bind(window), location.origin);
window.fetch = tracing.fetch;

function send(message: string, stack?: string): void {
  if (!getSetting("diagnostics") || sent >= MAX_PER_SESSION || !message) return;
  sent++;
  const traceparent = tracing.traceparent();
  void fetch("/api/diagnostics", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json", ...(traceparent ? { traceparent } : {}) },
    body: JSON.stringify({ message, stack, page: location.pathname }),
    keepalive: true,
  }).catch(() => undefined);
}

window.addEventListener("error", (event) => send(event.message, event.error?.stack));
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  send(reason instanceof Error ? reason.message : String(reason), reason instanceof Error ? reason.stack : undefined);
});
