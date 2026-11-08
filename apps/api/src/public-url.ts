/** `https://host[:port]` exactly as an origin: no credentials, path, query or fragment. Anything else is null. */
export function publicOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin === value.toLowerCase() ? url.origin : null;
  } catch {
    return null;
  }
}
