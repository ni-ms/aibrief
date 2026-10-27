import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
export function isPublicAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.includes(":"))
    return (
      !/^(::|fc|fd|fe[89ab]|ff)/.test(normalized) &&
      !normalized.includes("ffff:")
    );
  const [a, b] = normalized.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function assertPublicFeedUrl(raw: string) {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  )
    throw new Error("Use a public HTTPS feed URL");
  if (/(^|\.)(localhost|local|internal)$/.test(url.hostname))
    throw new Error("Local feed addresses are not supported");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Feed URL must resolve to a public address");
}
