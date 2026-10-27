const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "support",
  "status",
  "cdn",
  "cdn-images-1",
  "substack",
]);

const RESERVED_PATHS = new Set([
  "about",
  "archive",
  "feed",
  "publish",
  "sign-in",
  "subscribe",
  "settings",
  "search",
  "p",
]);

const HANDLE_RE = /^[a-z0-9][a-z0-9._-]{0,60}[a-z0-9]$|^[a-z0-9]{2,60}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}[a-z0-9]$|^[a-z0-9]{2,80}$/i;

/**
 * Normalizes a Substack publication handle, subdomain, or full URL:
 * - `@handle` -> `handle`
 * - `importai` -> `importai`
 * - `https://importai.substack.com` -> `importai`
 * - `https://custom.newsletter.com` -> `https://custom.newsletter.com`
 */
export function normalizeSubstack(input: string): string {
  let value = input.trim();
  if (!value) {
    throw new Error(
      "Use a Substack @handle, publication subdomain (e.g. importai), or public publication URL",
    );
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Use a valid public Substack publication URL");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    ) {
      throw new Error("Use a public HTTPS Substack URL without query parameters");
    }
    const host = url.hostname.toLowerCase();
    if (host === "substack.com" || host === "www.substack.com") {
      throw new Error(
        "Use a specific Substack publication subdomain or custom domain",
      );
    }

    const cleanPath = url.pathname.replace(/^\/+|\/+$/g, "");
    if (
      cleanPath &&
      !["feed", "about", "archive"].includes(cleanPath.toLowerCase())
    ) {
      if (cleanPath.toLowerCase().startsWith("p/")) {
        throw new Error(
          "Use a Substack publication URL, not an individual post link",
        );
      }
    }

    if (host.endsWith(".substack.com")) {
      const sub = host.slice(0, -".substack.com".length);
      if (
        !sub ||
        sub.includes(".") ||
        RESERVED_SUBDOMAINS.has(sub) ||
        !SLUG_RE.test(sub)
      ) {
        throw new Error("Use a valid Substack publication subdomain");
      }
      return sub.toLowerCase();
    }

    // Custom domain publication
    return `https://${host}`;
  }

  value = value.replace(/^\/+|\/+$/g, "");
  if (value.startsWith("@")) {
    value = value.slice(1);
  }

  if (!value || value.includes("..") || /[\s?#\\]/.test(value)) {
    throw new Error("Use a valid Substack publication subdomain or handle");
  }

  const parts = value.split("/").filter(Boolean);
  const first = parts[0].toLowerCase();

  if (first.endsWith(".substack.com")) {
    const sub = first.slice(0, -".substack.com".length);
    if (!SLUG_RE.test(sub) || RESERVED_SUBDOMAINS.has(sub)) {
      throw new Error("Use a valid Substack publication subdomain");
    }
    return sub;
  }

  if (RESERVED_PATHS.has(first) || !SLUG_RE.test(first)) {
    throw new Error(
      "Use a valid Substack publication name (e.g. importai)",
    );
  }

  return first;
}

export function substackFeedUrl(input: string): string {
  const normalized = normalizeSubstack(input);
  if (normalized.startsWith("https://")) {
    return `${normalized.replace(/\/feed\/?$/i, "")}/feed`;
  }
  return `https://${normalized}.substack.com/feed`;
}

export function substackDisplayName(input: string): string {
  const normalized = normalizeSubstack(input);
  if (normalized.startsWith("https://")) {
    try {
      return `Substack · ${new URL(normalized).hostname}`;
    } catch {
      return `Substack · ${normalized}`;
    }
  }
  return `Substack · ${normalized}`;
}
