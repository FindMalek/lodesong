/** Bun sends every streamed body chunked and drops its Content-Length, so a transcode (which Navidrome sends with no ranges) reaches the browser with no length. */
export const SPOOL_LIMIT = 64 * 1024 * 1024;

/** WebKit gives a stream with no length silence in Web Audio; Chrome and Firefox play it. */
export function needsLength(agent: string | null): boolean {
  return !!agent && /AppleWebKit/.test(agent) && !/Chrome\/|Chromium\/|Edg\/|OPR\//.test(agent);
}

export type Spooled = { blob: Blob } | { stream: ReadableStream<Uint8Array> };

/** The whole body as a blob, which has a length; past `limit` the rest is streamed on after what was read. */
export async function spool(body: ReadableStream<Uint8Array>, limit = SPOOL_LIMIT): Promise<Spooled> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { blob: new Blob(chunks as BlobPart[]) };
    chunks.push(value);
    size += value.length;
    if (size > limit) break;
  }
  return {
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
      },
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      },
      cancel: (reason) => reader.cancel(reason),
    }),
  };
}
