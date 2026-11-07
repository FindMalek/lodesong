const HOST = /^(?:[a-z0-9.-]+|\[[0-9a-f:]+\])(?::\d{1,5})?$/i;

export interface OriginSettings {
  publicUrl?: string | null;
  trustProxy: boolean;
}

const first = (request: Request, name: string): string | undefined => request.headers.get(name)?.split(",")[0]?.trim() || undefined;

/**
 * The address links and images should point at: the configured public URL when there is one, the proxy's forwarded
 * address only when the proxy is trusted, and otherwise the address this request arrived on.
 */
export function originOf(request: Request, { publicUrl, trustProxy }: OriginSettings): string {
  if (publicUrl) return new URL(publicUrl).origin;
  const url = new URL(request.url);
  if (!trustProxy) return url.origin;
  const forwardedHost = first(request, "x-forwarded-host");
  const host = forwardedHost && HOST.test(forwardedHost) ? forwardedHost : url.host;
  const proto = first(request, "x-forwarded-proto") === "https" ? "https" : url.protocol.slice(0, -1);
  return `${proto}://${host}`;
}
