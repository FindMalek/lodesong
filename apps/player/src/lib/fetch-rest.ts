import { notify } from "./notify";
import { wishlist } from "./wishlist";

export interface RestItem {
  key: string;
  query: string;
}

export interface RestRun {
  running: boolean;
  added: ReadonlySet<string>;
  placed: number;
  error: string | null;
  finished: boolean;
}

const IDLE: RestRun = { running: false, added: new Set(), placed: 0, error: null, finished: false };
/** Lyterion takes this many songs an hour from one account. */
export const ADD_CAP = 30;
const POLL_MS = 2000;
const GIVE_UP_MS = 10 * 60_000;
const runs = new Map<string, RestRun>();
const listeners = new Set<() => void>();

export const restRun = (mbid: string): RestRun => runs.get(mbid) ?? IDLE;

export function subscribeRest(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function set(mbid: string, patch: Partial<RestRun>): void {
  runs.set(mbid, { ...restRun(mbid), ...patch });
  for (const listener of listeners) listener();
}

async function settle(recordingId: string): Promise<string> {
  const started = Date.now();
  for (;;) {
    const { status } = await wishlist.status(recordingId);
    if (status !== "working") return status;
    if (Date.now() - started > GIVE_UP_MS) throw new Error("lyterion is taking too long");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/** Adds the items one at a time, waiting for each to settle. Lives outside the page so leaving it doesn't lose the place; a second call resumes. */
export async function fetchRest(mbid: string, items: RestItem[]): Promise<void> {
  if (restRun(mbid).running) return;
  set(mbid, { running: true, error: null, finished: false });
  const total = items.length;
  const batch = items.filter((item) => !restRun(mbid).added.has(item.key)).slice(0, ADD_CAP);
  try {
    for (const item of batch) {
      const added = await wishlist.add(item.query);
      set(mbid, { added: new Set(restRun(mbid).added).add(item.key) });
      const status = await settle(added.recordingId);
      set(mbid, { placed: restRun(mbid).placed + (status === "placed" ? 1 : 0) });
    }
    const run = restRun(mbid);
    const rest = items.filter((item) => !run.added.has(item.key)).length;
    set(mbid, { running: false, finished: rest === 0 });
    notify(
      rest > 0
        ? { message: `${run.added.size} of ${total} requested; lyterion takes ${ADD_CAP} an hour, carry on later` }
        : { message: `${run.placed} of ${total} missing tracks are in your library`, kind: run.placed < total ? "error" : "info" },
    );
  } catch (error) {
    const run = restRun(mbid);
    const reason = error instanceof Error ? error.message : "something went wrong";
    set(mbid, { running: false, error: `stopped after ${run.added.size} of ${total}: ${reason}. try again to carry on` });
  }
}
