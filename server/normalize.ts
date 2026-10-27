import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import he from "he";
export const plainText = (v: unknown) =>
  he
    .decode(String(v ?? ""))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Invalid source URL");
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (/(^|\.)arxiv\.org$/.test(url.hostname)) {
    const id = url.pathname
      .replace(/^\/(abs|pdf)\//, "")
      .replace(/\.pdf$/, "")
      .replace(/v\d+$/, "");
    if (/^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?\/\d{7})$/i.test(id))
      return `https://arxiv.org/abs/${id}`;
  }
  for (const key of [...url.searchParams.keys()])
    if (
      /^(utm_|fbclid$|gclid$|ref$)/i.test(key) ||
      (key.toLowerCase() === "source" &&
        /^rss/i.test(url.searchParams.get(key) || ""))
    )
      url.searchParams.delete(key);
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/$/, "") || "/";
  return url.toString();
}
export const hashContent = (title: string, abstract: string, release: string) =>
  bytesToHex(
    sha256(
      new TextEncoder().encode(JSON.stringify([title, abstract, release])),
    ),
  );
export const isoDate = (v: unknown) => {
  const date = new Date(String(v ?? ""));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
