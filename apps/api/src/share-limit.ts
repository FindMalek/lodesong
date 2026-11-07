/** At most `max` events per `windowMs` for each key, in memory (one instance, a restart forgets). */
export class RateLimit {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Seconds to wait before the next event is allowed, or 0 when it is allowed (and counted). */
  take(key: string): number {
    const time = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => time - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil(((recent[0] ?? time) + this.windowMs - time) / 1000));
    }
    recent.push(time);
    this.hits.set(key, recent);
    if (this.hits.size > 1000) {
      for (const [other, times] of this.hits) if (times.every((at) => time - at >= this.windowMs)) this.hits.delete(other);
    }
    return 0;
  }
}
