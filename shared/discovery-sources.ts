import type { Source } from "./types.ts";

export interface DiscoveryDirectory {
  id: string;
  name: string;
  website: string;
  description: string;
  status: "feed" | "api-key" | "custom" | "unverified";
  note: string;
  feedUrl?: string;
  feedName?: string;
  kind?: "tools" | "news";
  docs?: string;
}

/** Public feeds verified October 28, 2026. A website listing is not a feed connection. */
export const DISCOVERY_DIRECTORIES: DiscoveryDirectory[] = [
  {
    id: "producthunt",
    name: "Product Hunt",
    website: "https://www.producthunt.com/",
    description:
      "New product launches and short descriptions from Product Hunt.",
    status: "feed",
    feedUrl: "https://www.producthunt.com/feed",
    feedName: "Product Hunt · Launches",
    kind: "tools",
    docs: "https://help.producthunt.com/en/articles/484970-does-product-hunt-have-an-rss-feed",
    note: "Public launches feed. No account or key needed. Includes launch descriptions and links to their Product Hunt pages.",
  },
  {
    id: "alternativeto",
    name: "AlternativeTo",
    website: "https://alternativeto.net/",
    description:
      "Software releases, app updates, and discovery news from AlternativeTo.",
    status: "feed",
    feedUrl: "https://feed.alternativeto.net/news/all/",
    feedName: "AlternativeTo · News",
    kind: "news",
    note: "Official public news feed. This covers AlternativeTo News, not the full software catalog or per-app alternatives.",
  },
  {
    id: "betalist",
    name: "BetaList",
    website: "https://betalist.com/",
    description: "Early-stage startups and recently featured products.",
    status: "feed",
    feedUrl: "https://feeds.feedburner.com/BetaList",
    feedName: "BetaList · Startups",
    kind: "tools",
    note: "Public startup feed provided by BetaList. No account or key needed.",
  },
  {
    id: "startupbase",
    name: "StartupBase",
    website: "https://startupbase.io/",
    description:
      "Product reviews, startup guides, and discovery resources from the StartupBase blog.",
    status: "feed",
    feedUrl: "https://startupbase.io/rss.xml",
    feedName: "StartupBase · Blog",
    kind: "news",
    note: "Official blog RSS feed. This covers blog posts and reviews, not the daily launch leaderboard.",
  },
  {
    id: "microlaunch",
    name: "Microlaunch",
    website: "https://microlaunch.net/",
    description:
      "A community for discovering and supporting new startup launches.",
    status: "custom",
    note: "Launch listings are not connected yet. No public product feed was verified.",
  },
  {
    id: "uneed",
    name: "Uneed",
    website: "https://www.uneed.best/",
    description:
      "A curated directory and launch platform for new software and tools.",
    status: "custom",
    note: "Daily launches are not connected yet. No public product feed was verified.",
  },
  {
    id: "toolify",
    name: "Toolify",
    website: "https://www.toolify.ai/",
    description: "An AI tool directory with categories and product discovery.",
    status: "custom",
    note: "Tool listings are not connected yet. The site blocked automated requests during verification, and no public product feed was verified.",
  },
  {
    id: "theresanaiforthat",
    name: "There Is An AI For That",
    website: "https://theresanaiforthat.com/",
    description: "AI tools organized around tasks and use cases.",
    status: "custom",
    note: "Tool listings are not connected yet. The site blocked automated requests during verification, and no public product feed was verified.",
  },
  {
    id: "saashub",
    name: "SaaSHub",
    website: "https://www.saashub.com/",
    docs: "https://www.saashub.com/site/api",
    description: "Software alternatives and B2B product discovery.",
    status: "api-key",
    note: "Requires a SaaSHub API key and attribution. Its documented access covers product lookups and alternatives, rather than a launches feed.",
  },
  {
    id: "futurepedia",
    name: "Futurepedia",
    website: "https://www.futurepedia.io/",
    description: "A directory of AI tools, guides, and software categories.",
    status: "custom",
    note: "Tool listings are not connected yet. No public product feed was verified.",
  },
  {
    id: "launched",
    name: "Launched",
    website: "https://launched.io/",
    description: "A startup launch directory.",
    status: "unverified",
    note: "The directory website could not be reached. Its current address and a feed need verification before connecting.",
  },
];

export function discoveryDirectory(
  input: string,
): DiscoveryDirectory | undefined {
  const raw = input.trim();
  const nameKey = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  const named = DISCOVERY_DIRECTORIES.find(
    (site) =>
      site.id === nameKey ||
      site.name.toLowerCase().replace(/[^a-z0-9]/g, "") === nameKey,
  );
  if (named) return named;
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`,
    );
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      (url.port && url.port !== "443")
    )
      return;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (
      host === "feeds.feedburner.com" &&
      url.pathname.toLowerCase() === "/betalist"
    )
      return DISCOVERY_DIRECTORIES.find((site) => site.id === "betalist");
    if (
      host === "feed.alternativeto.net" &&
      url.pathname.replace(/\/+$/, "") === "/news/all"
    )
      return DISCOVERY_DIRECTORIES.find((site) => site.id === "alternativeto");
    const match = DISCOVERY_DIRECTORIES.find(
      (site) => new URL(site.website).hostname.replace(/^www\./, "") === host,
    );
    if (!match) return;
    // Known directory landing pages and official feeds are supported. Individual
    // product pages are not silently converted into an unrelated global feed.
    if (
      [
        "",
        "/",
        "/feed",
        "/feed/",
        "/rss.xml",
        "/news",
        "/news/",
        "/blog",
        "/blog/",
      ].includes(url.pathname)
    )
      return match;
  } catch {
    return;
  }
}

export function directoryForSource(
  source: Source,
): DiscoveryDirectory | undefined {
  if (source.kind !== "rss") return;
  const byUrl = discoveryDirectory(source.config.url || "");
  return byUrl?.feedUrl ? byUrl : undefined;
}
