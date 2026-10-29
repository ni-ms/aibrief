import type { Source, SourceKind } from "./types.ts";
import { mediumDisplayName, mediumFeedUrl, normalizeMedium } from "./medium.ts";
import {
  normalizeSubstack,
  substackDisplayName,
  substackFeedUrl,
} from "./substack.ts";
import { normalizeSubreddit } from "./reddit.ts";
import { discoveryDirectory } from "./discovery-sources.ts";

const KNOWN_BLOG_FEEDS: Record<string, { url: string; name: string }> = {
  "huggingface.co": {
    url: "https://huggingface.co/blog/feed.xml",
    name: "Hugging Face blog",
  },
  "huggingface.co/blog": {
    url: "https://huggingface.co/blog/feed.xml",
    name: "Hugging Face blog",
  },
  "lilianweng.github.io": {
    url: "https://lilianweng.github.io/index.xml",
    name: "Lilian Weng",
  },
  "simonwillison.net": {
    url: "https://simonwillison.net/atom/everything/",
    name: "Simon Willison’s Weblog",
  },
  "karpathy.github.io": {
    url: "https://karpathy.github.io/feed.xml",
    name: "Andrej Karpathy blog",
  },
  "openai.com": {
    url: "https://openai.com/news/rss.xml",
    name: "OpenAI News",
  },
  "openai.com/news": {
    url: "https://openai.com/news/rss.xml",
    name: "OpenAI News",
  },
  "openai.com/blog": {
    url: "https://openai.com/news/rss.xml",
    name: "OpenAI News",
  },
  "pytorch.org/blog": {
    url: "https://pytorch.org/blog/feed.xml",
    name: "PyTorch blog",
  },
  "research.google": {
    url: "https://research.google/blog/rss/",
    name: "Google Research blog",
  },
  "research.google/blog": {
    url: "https://research.google/blog/rss/",
    name: "Google Research blog",
  },
  "blog.research.google": {
    url: "https://research.google/blog/rss/",
    name: "Google Research blog",
  },
};

/**
 * Normalize a user-supplied blog or feed address into a clean HTTPS URL,
 * automatically resolving known publishing platforms (Substack, Medium, DEV,
 * Hashnode, WordPress, Blogspot, GitHub releases, and popular research blogs)
 * to their feed endpoints when a homepage or profile URL is provided.
 */
export function normalizeFeedUrl(input: string): string {
  let raw = input.trim();
  if (!raw) throw new Error("Use a public HTTPS blog or feed URL");

  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
    if (
      /^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+(\/.*)?$/.test(raw) &&
      !raw.includes("..")
    ) {
      raw = `https://${raw}`;
    } else {
      throw new Error("Use a public HTTPS blog or feed URL");
    }
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Use a public HTTPS blog or feed URL");
  }

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new Error("Use a public HTTPS feed URL");
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !host.includes(".") ||
    /(^|\.)(localhost|local|internal)$/.test(host) ||
    host.includes(":")
  ) {
    throw new Error("Use a public HTTPS blog or feed URL");
  }

  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|ref$)/i.test(key)) url.searchParams.delete(key);
  }

  const cleanPath = url.pathname.replace(/\/+$/, "");
  const lookupKey = `${host}${cleanPath}`.toLowerCase();
  if (KNOWN_BLOG_FEEDS[lookupKey] && !url.search) {
    return KNOWN_BLOG_FEEDS[lookupKey].url;
  }
  const directory = discoveryDirectory(url.toString());
  if (directory?.feedUrl) return directory.feedUrl;

  // Medium URLs -> canonical Medium feed URL
  if (host === "medium.com" || host.endsWith(".medium.com")) {
    try {
      return mediumFeedUrl(url.toString());
    } catch {
      // If it's already a custom path on medium, fall through
    }
  }

  // Substack publication root (`https://example.substack.com`) -> `/feed`
  if (
    host.endsWith(".substack.com") &&
    host !== "substack.com" &&
    (!cleanPath || cleanPath === "/archive")
  ) {
    return `https://${host}/feed`;
  }
  // Substack profile (`https://substack.com/@username`) -> `https://username.substack.com/feed`
  if (host === "substack.com" && /^\/@[a-zA-Z0-9_-]+$/.test(cleanPath)) {
    const sub = cleanPath.slice(2).toLowerCase();
    return `https://${sub}.substack.com/feed`;
  }

  // DEV.to (`https://dev.to/username` or `https://dev.to/t/tag`)
  if (host === "dev.to" && cleanPath && !cleanPath.startsWith("/feed")) {
    const parts = cleanPath.split("/").filter(Boolean);
    if (
      parts.length === 1 &&
      /^[a-zA-Z0-9_]+$/.test(parts[0].replace(/^@/, ""))
    ) {
      return `https://dev.to/feed/${parts[0].replace(/^@/, "")}`;
    }
    if (
      parts.length === 2 &&
      parts[0] === "t" &&
      /^[a-zA-Z0-9_-]+$/.test(parts[1])
    ) {
      return `https://dev.to/feed/tag/${parts[1]}`;
    }
  }

  // Hashnode (`https://example.hashnode.dev`) -> `/rss.xml`
  if (host.endsWith(".hashnode.dev") && !cleanPath) {
    return `https://${host}/rss.xml`;
  }

  // WordPress.com (`https://example.wordpress.com`) -> `/feed/`
  if (host.endsWith(".wordpress.com") && !cleanPath) {
    return `https://${host}/feed/`;
  }

  // Blogger / Blogspot (`https://example.blogspot.com`) -> `/feeds/posts/default?alt=rss`
  if (host.endsWith(".blogspot.com") && !cleanPath) {
    return `https://${host}/feeds/posts/default?alt=rss`;
  }

  // GitHub repository root or releases page -> `/releases.atom`
  if (host === "github.com") {
    const parts = cleanPath.split("/").filter(Boolean);
    if (
      (parts.length === 2 || (parts.length === 3 && parts[2] === "releases")) &&
      /^[a-zA-Z0-9_.-]+$/.test(parts[0]) &&
      /^[a-zA-Z0-9_.-]+$/.test(parts[1]) &&
      !parts[1].endsWith(".atom")
    ) {
      return `https://github.com/${parts[0]}/${parts[1]}/releases.atom`;
    }
  }

  return url.toString();
}

/**
 * Derive a readable default display name from a blog or feed URL.
 */
export function inferFeedName(input: string): string {
  const directory = discoveryDirectory(input);
  if (directory?.feedUrl) return directory.feedName || directory.name;
  try {
    const raw = input.trim();
    const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)
      ? raw
      : `https://${raw}`;
    const url = new URL(withProtocol);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const cleanPath = url.pathname.replace(/\/+$/, "");
    const lookupKey = `${host}${cleanPath}`.toLowerCase();
    if (KNOWN_BLOG_FEEDS[lookupKey]) return KNOWN_BLOG_FEEDS[lookupKey].name;
    if (KNOWN_BLOG_FEEDS[host]) return KNOWN_BLOG_FEEDS[host].name;

    if (host === "medium.com" || host.endsWith(".medium.com")) {
      try {
        return mediumDisplayName(url.toString());
      } catch {}
    }
    if (host.endsWith(".substack.com") && host !== "substack.com") {
      return `${host.slice(0, -".substack.com".length)} · Substack`;
    }
    if (host.endsWith(".github.io")) {
      return `${host.slice(0, -".github.io".length)} blog`;
    }
    if (host.endsWith(".hashnode.dev")) {
      return `${host.slice(0, -".hashnode.dev".length)} · Hashnode`;
    }
    if (host === "dev.to") {
      const cleaned = cleanPath
        .replace(/^\/feed(\/tag)?\//, "")
        .replace(/^\//, "");
      if (cleaned) return `DEV · ${cleaned}`;
    }
    return host;
  } catch {
    return "Blog feed";
  }
}

/**
 * Discover RSS/Atom feed URLs advertised in an HTML document via `<link rel="alternate">`
 * or falls back to standard feed paths on the same host.
 */
export function discoverFeedUrls(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (href: string) => {
    try {
      const resolved = new URL(href, base);
      if (
        resolved.protocol !== "https:" ||
        resolved.username ||
        resolved.password ||
        (resolved.port && resolved.port !== "443") ||
        resolved.hostname.toLowerCase() !== base.hostname.toLowerCase()
      ) {
        return;
      }
      resolved.hash = "";
      const str = resolved.toString();
      if (str !== base.toString() && !seen.has(str)) {
        seen.add(str);
        candidates.push(str);
      }
    } catch {}
  };

  // 1. Check `<link>` tags with RSS/Atom types or rel="alternate"
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const type = tag.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "";
    if (!href) continue;
    const isFeedType =
      /application\/(rss|atom|rdf)\+xml|application\/xml|text\/xml/i.test(type);
    const isAlternate = /\b(alternate|feed)\b/i.test(rel);
    if (
      (isAlternate && isFeedType) ||
      (isAlternate && /\.(rss|atom|xml)(?:$|\?)|\/feed\/?$/i.test(href))
    ) {
      add(href);
    }
  }

  // 2. Check standard feed paths relative to the current path and root
  const basePath = base.pathname.replace(/\/+$/, "");
  const fallbackPaths = [
    ...(basePath
      ? [
          `${basePath}/feed.xml`,
          `${basePath}/rss.xml`,
          `${basePath}/atom.xml`,
          `${basePath}/index.xml`,
          `${basePath}/feed`,
        ]
      : []),
    "/feed.xml",
    "/rss.xml",
    "/atom.xml",
    "/index.xml",
    "/feed",
  ];
  for (const path of fallbackPaths) {
    add(path);
  }

  return candidates.slice(0, 4);
}

/**
 * Smartly classify any user input (handle, tag, repo, subreddit, venue, or URL)
 * into a ready-to-save Source configuration across all supported resource kinds.
 */
export function detectSmartSource(input: string): {
  kind: SourceKind;
  resourceId: string;
  name: string;
  config: Source["config"];
} {
  const raw = input.trim();
  if (!raw) {
    throw new Error(
      "Enter a blog URL, Medium @author or #tag, r/subreddit, owner/repo, or arXiv category",
    );
  }
  const directory = discoveryDirectory(raw);
  if (directory) {
    if (!directory.feedUrl)
      throw new Error(
        `${directory.name} is not connected yet. ${directory.note}`,
      );
    return {
      kind: "rss",
      resourceId: directory.id,
      name: directory.feedName || directory.name,
      config: { url: directory.feedUrl },
    };
  }

  // 1. Reddit: `r/foo` or `reddit.com/r/foo`
  if (
    /^\/?r\/[A-Za-z0-9_]+/i.test(raw) ||
    /^https?:\/\/(www\.|old\.)?reddit\.com\//i.test(raw)
  ) {
    const subreddit = normalizeSubreddit(raw);
    return {
      kind: "reddit",
      resourceId: "reddit",
      name: `Reddit · r/${subreddit}`,
      config: { subreddit },
    };
  }

  // 2. Substack explicit prefix: `substack:importai`
  if (/^substack:/i.test(raw)) {
    const substack = normalizeSubstack(raw.replace(/^substack:/i, ""));
    return {
      kind: "substack",
      resourceId: "substack",
      name: substackDisplayName(substack),
      config: { substack },
    };
  }

  // 3. Lobste.rs: `lobsters:tag` or `https://lobste.rs/t/tag` or `https://lobste.rs`
  if (
    /^lobsters:/i.test(raw) ||
    /^https?:\/\/(www\.)?lobste\.rs(\/|$)/i.test(raw)
  ) {
    let tag = "hottest";
    if (/^lobsters:/i.test(raw)) {
      tag = raw.slice("lobsters:".length).trim().toLowerCase() || "hottest";
    } else {
      const u = new URL(raw);
      const m = u.pathname.match(/^\/t\/([a-z0-9_-]+)/i);
      if (m) tag = m[1].toLowerCase();
    }
    return {
      kind: "lobsters",
      resourceId: "lobsters",
      name: tag === "hottest" ? "Lobste.rs · Hottest" : `Lobste.rs · #${tag}`,
      config: { lobsters: tag },
    };
  }

  // 4. Hugging Face Daily Papers: `hf-papers` or `https://huggingface.co/papers`
  if (
    /^hf-papers$/i.test(raw) ||
    /^https?:\/\/(www\.)?huggingface\.co\/papers\/?$/i.test(raw)
  ) {
    return {
      kind: "hf-papers",
      resourceId: "hf-papers",
      name: "Hugging Face Daily Papers",
      config: {},
    };
  }

  // 5. Medium: `@author`, `#tag`, `tag/slug`, or `medium.com` / `*.medium.com` URL
  if (
    raw.startsWith("@") ||
    raw.startsWith("#") ||
    /^(?:tag|topic)[/:]/i.test(raw) ||
    /^https?:\/\/([a-z0-9-]+\.)?medium\.com(\/|$)/i.test(raw) ||
    /^[a-z0-9-]+\.medium\.com(\/|$)/i.test(raw)
  ) {
    const medium = normalizeMedium(
      /^[a-z0-9-]+\.medium\.com(\/|$)/i.test(raw) ? `https://${raw}` : raw,
    );
    return {
      kind: "medium",
      resourceId: "medium",
      name: mediumDisplayName(medium),
      config: { medium },
    };
  }

  // 6. GitHub repository: `owner/repo` or `https://github.com/owner/repo`
  if (
    /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i.test(
      raw,
    )
  ) {
    const u = new URL(raw);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && !parts[1].endsWith(".atom")) {
      const repo = `${parts[0]}/${parts[1].replace(/\.git$/, "")}`;
      return {
        kind: "github",
        resourceId: "github",
        name: `GitHub · ${repo}`,
        config: { repo },
      };
    }
  }
  if (
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw) &&
    !raw.includes(".") &&
    !/^(tag|topic|r)\//i.test(raw)
  ) {
    return {
      kind: "github",
      resourceId: "github",
      name: `GitHub · ${raw}`,
      config: { repo: raw },
    };
  }

  // 7. OpenReview venue: `Venue.cc/2026/Conference`
  if (/^[A-Za-z0-9_.-]+\/\d{4}\/[A-Za-z0-9_/-]+$/.test(raw)) {
    const isNeurips = raw.startsWith("NeurIPS.cc/");
    return {
      kind: "openreview",
      resourceId: isNeurips ? "neurips" : "openreview",
      name: raw.replace(/\.cc\/(\d{4})\/Conference.*/, " $1"),
      config: { venue: raw },
    };
  }

  // 8. arXiv category list: `cs.AI`, `quant-ph`, `cs.AI, cs.LG`
  const categories = raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (
    categories.length >= 1 &&
    categories.every((c) =>
      /^(cs\.[A-Z]{2}|stat\.[A-Z]{2}|math\.[A-Z]{2}|q-bio\.[A-Z]{2}|q-fin\.[A-Z]{2}|eess\.[A-Z]{2}|econ\.[A-Z]{2}|quant-ph|physics\.[a-z-]+|astro-ph(\.[A-Z]{2})?|cond-mat(\.[a-z-]+)?|hep-[a-z]+|gr-qc|nucl-[a-z]+|nlin\.[A-Z]{2})$/.test(
        c,
      ),
    )
  ) {
    return {
      kind: "arxiv",
      resourceId: "arxiv",
      name: `arXiv · ${categories.join(", ")}`,
      config: { categories },
    };
  }

  // 9. Bluesky profile URL or `.bsky.social` handle
  if (/^https?:\/\/bsky\.app\/profile\/([a-zA-Z0-9.:-]+)\/?$/i.test(raw)) {
    const actor = raw.match(/\/profile\/([a-zA-Z0-9.:-]+)/i)![1].toLowerCase();
    return {
      kind: "bluesky",
      resourceId: "bluesky",
      name: `Bluesky · ${actor}`,
      config: { actor },
    };
  }
  if (/^[a-zA-Z0-9-]+\.bsky\.social$/i.test(raw)) {
    const actor = raw.toLowerCase();
    return {
      kind: "bluesky",
      resourceId: "bluesky",
      name: `Bluesky · ${actor}`,
      config: { actor },
    };
  }

  // 10. Default to smart Blog / RSS URL
  const url = normalizeFeedUrl(raw);
  return {
    kind: "rss",
    resourceId: "rss",
    name: inferFeedName(raw),
    config: { url },
  };
}

function escapeXml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Export configured feeds as a standard OPML 2.0 XML document.
 */
export function exportOpml(sources: Source[]): string {
  const outlines: string[] = [];
  for (const s of sources) {
    let xmlUrl = "";
    if (s.kind === "rss" && s.config.url) xmlUrl = s.config.url;
    else if (s.kind === "medium" && s.config.medium) {
      try {
        xmlUrl = mediumFeedUrl(s.config.medium);
      } catch {}
    } else if (s.kind === "substack" && s.config.substack) {
      try {
        xmlUrl = substackFeedUrl(s.config.substack);
      } catch {}
    } else if (s.kind === "arxiv" && s.config.categories?.length) {
      xmlUrl = `https://rss.arxiv.org/rss/${s.config.categories.join("+")}`;
    } else if (s.kind === "github" && s.config.repo) {
      xmlUrl = `https://github.com/${s.config.repo}/releases.atom`;
    }
    if (!xmlUrl) continue;
    outlines.push(
      `      <outline type="rss" text="${escapeXml(s.name)}" title="${escapeXml(s.name)}" xmlUrl="${escapeXml(xmlUrl)}" />`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>Fieldnotes Subscriptions</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
    <outline text="Fieldnotes Feeds" title="Fieldnotes Feeds">
${outlines.join("\n")}
    </outline>
  </body>
</opml>`;
}

/**
 * Parse an OPML XML file into a list of feed candidates `{ name, url }`.
 */
export function parseOpml(xml: string): { name: string; url: string }[] {
  const results: { name: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(/<outline\b[^>]*>/gi)) {
    const tag = match[0];
    const xmlUrl = tag.match(/\bxmlUrl\s*=\s*["']([^"']+)["']/i)?.[1]?.trim();
    if (!xmlUrl) continue;
    const title =
      tag.match(/\b(?:title|text)\s*=\s*["']([^"']+)["']/i)?.[1]?.trim() || "";
    try {
      const normalized = normalizeFeedUrl(xmlUrl);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      results.push({
        name: title || inferFeedName(normalized),
        url: normalized,
      });
    } catch {}
  }
  return results.slice(0, 40);
}
