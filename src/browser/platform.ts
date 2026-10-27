export const runtimeEnv: Record<string, string | undefined> = {};
export const browserMode = true;

/** Browsers enforce CORS/private-network permissions; no DNS lookup or proxy. */
export async function assertPublicFeedUrl(raw: string) {
  const url = new URL(raw);
  const host = url.hostname;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    !host.includes(".") ||
    host.includes(":") ||
    /^[\d.]+$/.test(host) ||
    /(^|\.)(localhost|local|internal)$/.test(host)
  )
    throw new Error("Use a public HTTPS address with a domain name.");
}
