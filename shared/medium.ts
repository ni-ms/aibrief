const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "help",
  "status",
  "policy",
  "cdn-images-1",
  "miro",
  "link",
  "r",
]);

const RESERVED_PATHS = new Set([
  "about",
  "ab",
  "browse",
  "creators",
  "earner",
  "explore",
  "feed",
  "jobs-at-medium",
  "m",
  "me",
  "membership",
  "new-story",
  "notifications",
  "p",
  "plans",
  "policy",
  "privacy",
  "search",
  "settings",
  "signin",
  "signup",
  "sitemap",
  "stats",
  "subscribing",
  "tag",
  "tags",
  "topic",
  "topics",
  "u",
  "verified-authors",
  "_",
]);

const ALLOWED_SUBPATHS = new Set([
  "about",
  "latest",
  "recommended",
  "archive",
  "feed",
]);

const HANDLE_RE = /^[a-z0-9][a-z0-9._-]{0,60}[a-z0-9]$|^[a-z0-9]{2,60}$/i;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}[a-z0-9]$|^[a-z0-9]{2,80}$/i;

/**
 * Normalize a Medium author (@handle), tag (tag/slug or #slug), publication slug,
 * or public Medium URL into a canonical identifier:
 * - `@username`
 * - `tag/topic-slug`
 * - `publication-slug`
 */
export function normalizeMedium(input: string): string {
  let value = input.trim();
  if (!value) {
    throw new Error(
      "Use a Medium @author, #tag, publication name, or public Medium URL",
    );
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(
        "Use a Medium @author, #tag, publication name, or public Medium URL",
      );
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "Use a Medium @author, #tag, publication name, or public HTTPS Medium URL",
      );
    }
    const host = url.hostname.toLowerCase();
    if (host === "medium.com" || host === "www.medium.com") {
      value = url.pathname;
    } else if (host.endsWith(".medium.com")) {
      const sub = host.slice(0, -".medium.com".length);
      if (
        !sub ||
        sub.includes(".") ||
        RESERVED_SUBDOMAINS.has(sub) ||
        !HANDLE_RE.test(sub)
      ) {
        throw new Error(
          "Use a Medium @author, #tag, publication name, or public Medium URL",
        );
      }
      const cleanPath = url.pathname.replace(/^\/+|\/+$/g, "");
      if (cleanPath && !ALLOWED_SUBPATHS.has(cleanPath.toLowerCase())) {
        throw new Error(
          "Use a Medium author/publication feed URL, not an individual article URL",
        );
      }
      return `@${sub.toLowerCase()}`;
    } else {
      throw new Error(
        "Use a Medium @author, #tag, publication name, or public Medium URL",
      );
    }
  }

  value = value.replace(/^\/+|\/+$/g, "");
  // Convert leading `#tag` into `tag/slug` before checking for embedded `#` fragments
  if (value.startsWith("#")) {
    value = `tag/${value.slice(1)}`;
  }

  if (!value || value.includes("..") || /[\s?#\\]/.test(value)) {
    throw new Error(
      "Use a Medium @author, #tag, publication name, or public Medium URL",
    );
  }

  // Strip leading `feed/` if present
  if (/^feed\//i.test(value)) {
    value = value.slice(5).replace(/^\/+|\/+$/g, "");
  }

  if (/^(?:tag|topic):/i.test(value)) {
    value = `tag/${value.replace(/^(?:tag|topic):/i, "")}`;
  } else if (/^topic\//i.test(value)) {
    value = `tag/${value.slice(6)}`;
  } else if (/^publication\//i.test(value)) {
    value = value.slice("publication/".length);
  } else if (/^publication:/i.test(value)) {
    value = value.slice("publication:".length);
  }

  const parts = value.split("/").filter(Boolean);
  if (!parts.length) {
    throw new Error(
      "Use a Medium @author, #tag, publication name, or public Medium URL",
    );
  }

  // Case 1: Tag (`tag/<slug>[/latest|recommended|archive|feed]`)
  if (parts[0].toLowerCase() === "tag") {
    if (
      parts.length < 2 ||
      parts.length > 3 ||
      (parts.length === 3 && !ALLOWED_SUBPATHS.has(parts[2].toLowerCase()))
    ) {
      throw new Error("Use a single Medium tag, such as tag/machine-learning");
    }
    const slug = parts[1].toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new Error("Use a valid Medium tag, such as tag/machine-learning");
    }
    return `tag/${slug}`;
  }

  // Case 2: Author (`@username[/about|latest|feed]`)
  if (parts[0].startsWith("@")) {
    if (
      parts.length > 2 ||
      (parts.length === 2 && !ALLOWED_SUBPATHS.has(parts[1].toLowerCase()))
    ) {
      throw new Error(
        "Use a Medium author profile (@username), not an individual article link",
      );
    }
    const handle = parts[0].slice(1).toLowerCase();
    if (!HANDLE_RE.test(handle)) {
      throw new Error("Use a valid Medium handle, such as @karpathy");
    }
    return `@${handle}`;
  }

  // Case 3: Publication (`publication-slug[/about|latest|archive|feed]`)
  if (
    parts.length > 2 ||
    (parts.length === 2 && !ALLOWED_SUBPATHS.has(parts[1].toLowerCase()))
  ) {
    throw new Error(
      "Use a Medium publication name, @author, or #tag, not an individual article URL",
    );
  }
  const publication = parts[0].toLowerCase();
  if (RESERVED_PATHS.has(publication) || !SLUG_RE.test(publication)) {
    throw new Error(
      "Use a valid Medium publication name, @author, or #tag (e.g. towards-data-science)",
    );
  }
  return publication;
}

export function mediumFeedUrl(input: string): string {
  const normalized = normalizeMedium(input);
  return `https://medium.com/feed/${normalized}`;
}

export function mediumDisplayName(input: string): string {
  const normalized = normalizeMedium(input);
  if (normalized.startsWith("@")) return `Medium · ${normalized}`;
  if (normalized.startsWith("tag/")) return `Medium · #${normalized.slice(4)}`;
  return `Medium · ${normalized}`;
}
