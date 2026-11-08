import { del, get, set } from "idb-keyval";

interface Disk {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

const SOON_MS = 80;
const SOON_MAX_MS = 500;
const IDLE_FALLBACK_MS = 500;
const IDLE_TIMEOUT_MS = 2000;
const RESTORE_TIMEOUT_MS = 3000;
const ACTIVE_REWRITE_MS = 100;

interface Options<S> {
  key: string;
  read(): S;
  empty(): boolean;
  /** Playing in this tab: its snapshot is the live one, so a hide writes it even when nothing was flagged. */
  active(): boolean;
  account(): string;
  disk?: Disk;
}

type Stored<S> = S & { account?: string };

export interface SnapshotStore<S> {
  persist(soon?: boolean): void;
  restore(): Promise<S | null>;
  /** The user emptied the queue before the saved one was read back: it must not come back. */
  skipRestore(): void;
  forget(): Promise<void>;
}

/** Writes one snapshot to IndexedDB. Only the tab that changed it writes, and an empty one never lands before the saved one was read. */
export function createSnapshotStore<S extends object>(options: Options<S>): SnapshotStore<S> {
  const disk = options.disk ?? { get, set, del };
  let owner = options.account();
  let dirty = false;
  let ready = false;
  let skipped = false;
  let pending: "idle" | "soon" | null = null;
  let cancel: (() => void) | null = null;
  let soonSince = 0;
  let wroteAt = 0;

  function stop(): void {
    cancel?.();
    cancel = null;
    pending = null;
  }

  function write(): void {
    stop();
    const live = options.active() && Date.now() - wroteAt > ACTIVE_REWRITE_MS;
    if (!dirty && !live) return;
    if (options.account() !== owner) return;
    if (!ready && options.empty()) return;
    dirty = false;
    wroteAt = Date.now();
    void disk.set(options.key, { ...options.read(), account: owner }).catch(() => undefined);
  }

  function later(run: () => void, ms: number): void {
    const timer = setTimeout(run, ms);
    cancel = () => clearTimeout(timer);
  }

  function persist(soon = false): void {
    dirty = true;
    if (pending && !soon) return;
    if (soon) {
      if (pending !== "soon") soonSince = Date.now();
      stop();
      pending = "soon";
      const quiet = Date.now() - wroteAt > SOON_MAX_MS;
      later(write, quiet ? 0 : Math.min(SOON_MS, Math.max(0, soonSince + SOON_MAX_MS - Date.now())));
      return;
    }
    pending = "idle";
    if ("requestIdleCallback" in window) {
      const handle = requestIdleCallback(write, { timeout: IDLE_TIMEOUT_MS });
      cancel = () => cancelIdleCallback(handle);
    } else later(write, IDLE_FALLBACK_MS);
  }

  function skipRestore(): void {
    skipped = true;
    ready = true;
  }

  window.addEventListener("pagehide", write);
  document.addEventListener("visibilitychange", () => document.hidden && write());

  return {
    persist,
    restore() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(resolve, RESTORE_TIMEOUT_MS, null);
      });
      return Promise.race([disk.get<Stored<S>>(options.key), timeout])
        .catch(() => null)
        .then((saved) => {
          clearTimeout(timer);
          const usable = !skipped && saved && (saved.account === undefined || saved.account === owner);
          ready = true;
          return usable ? saved : null;
        });
    },
    skipRestore,
    async forget() {
      dirty = false;
      owner = options.account();
      skipRestore();
      await disk.del(options.key).catch(() => undefined);
    },
  };
}
