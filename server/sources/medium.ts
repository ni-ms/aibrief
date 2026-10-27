import { browserMode } from "#platform";
import he from "he";
import type { CollectedItem, Source } from "../../shared/types.ts";
import { mediumFeedUrl } from "../../shared/medium.ts";
import { labelTopics } from "../../shared/interests.ts";
import { normalizeUrl, plainText, isoDate } from "../normalize.ts";
import type { HttpClient } from "../http.ts";
import { parser, list, XMLValidator } from "./xml.ts";

export function mediumConnection() {
  if (browserMode) {
    return {
      connectionLabel: "Direct browser access",
      caveat:
        "Medium public RSS feeds may block cross-site browser requests. Running with the local server fetches Medium feeds directly; previously collected articles remain available.",
    };
  }
  return {
    connectionLabel: "Public RSS · authors, publications & tags",
  };
}

function cleanMediumHtml(rawHtml: string): string {
  return he
    .decode(rawHtml)
    // Remove Medium 1x1 tracking pixel images
    .replace(/<img\b[^>]*medium\.com\/_\/stat[^>]*>/gi, " ")
    // Remove Medium's trailing publication attribution footer
    .replace(
      /<hr\b[^>]*>\s*<p>[\s\S]*?was originally published in[\s\S]*?on Medium[\s\S]*?<\/p>\s*$/i,
      " ",
    )
    // Remove "Continue reading on ... »" member-preview footer link
    .replace(
      /<p>\s*<a\b[^>]*>\s*Continue reading on [\s\S]*?<\/a>\s*<\/p>\s*$/i,
      " ",
    );
}

function extractPostId(guid: unknown, canonicalUrl: string): string {
  const guidStr = String(
    (guid as { "#text"?: string } | undefined)?.["#text"] ?? guid ?? "",
  ).trim();
  const guidMatch = guidStr.match(
    /medium\.com\/p\/([a-z0-9]{8,16})(?:$|[/?#])/i,
  );
  if (guidMatch) return `medium:${guidMatch[1].toLowerCase()}`;
  const slugMatch = canonicalUrl.match(/-([a-f0-9]{8,16})(?:$|[/?#])/i);
  if (slugMatch) return `medium:${slugMatch[1].toLowerCase()}`;
  return guidStr || canonicalUrl;
}

function extractCategories(rawCategory: unknown): string[] {
  return list(rawCategory)
    .map((entry) =>
      plainText(
        typeof entry === "object" && entry !== null
          ? (entry as Record<string, unknown>)["#text"] ||
              (entry as Record<string, unknown>)["@_term"] ||
              ""
          : entry,
      ),
    )
    .filter(Boolean);
}

function extractExternalLinks(
  html: string,
  canonicalUrl: string,
): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [
    { label: "Medium article", url: canonicalUrl },
  ];
  const seen = new Set<string>([canonicalUrl]);
  for (const match of html.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
  )) {
    try {
      const normalized = normalizeUrl(he.decode(match[1]));
      const host = new URL(normalized).hostname;
      if (
        seen.has(normalized) ||
        /(^|\.)(medium\.com|towardsdatascience\.com|betterprogramming\.pub|itnext\.io|levelup\.gitconnected\.com)$/.test(
          host,
        )
      ) {
        continue;
      }
      seen.add(normalized);
      links.push({ label: "Linked source", url: normalized });
      if (links.length >= 4) break;
    } catch {}
  }
  return links;
}

export function parseMediumFeed(xml: string): CollectedItem[] {
  if (XMLValidator.validate(xml) !== true) {
    throw new Error("Invalid Medium RSS/Atom XML");
  }
  const doc = parser.parse(xml);
  if (!doc.rss?.channel && !doc.feed) {
    throw new Error(
      "Expected a Medium RSS or Atom feed; Medium may have blocked or challenged access",
    );
  }
  const entries = list(doc.rss?.channel?.item || doc.feed?.entry).slice(0, 40);
  const results = entries.flatMap((row) => {
    try {
      const href =
        typeof row.link === "string"
          ? row.link
          : list(row.link).find(
              (l) => l["@_rel"] === "alternate" || !l["@_rel"],
            )?.["@_href"];
      const canonicalUrl = normalizeUrl(href);
      const title = plainText(row.title?.["#text"] ?? row.title);
      if (!title) return [];

      const rawBody = String(
        row["content:encoded"] ||
          row.content?.["#text"] ||
          row.content ||
          row.description ||
          row.summary ||
          "",
      );
      const cleanedHtml = cleanMediumHtml(rawBody);
      const abstract = plainText(cleanedHtml).slice(0, 20000);
      const author = plainText(
        row["dc:creator"] || row.creator || row.author?.name || row.author,
      );
      const categories = extractCategories(row.category);
      const externalId = extractPostId(row.guid || row.id, canonicalUrl);

      return [
        {
          externalId,
          canonicalUrl,
          title,
          abstract,
          releaseText: "",
          publishedAt: isoDate(
            row.pubDate || row.published || row["atom:updated"] || row.updated,
          ),
          topics: labelTopics(`${title} ${abstract} ${categories.join(" ")}`),
          kind: "news" as const,
          metadata: {
            publicationType: "article" as const,
            ...(author ? { authors: [author] } : {}),
          },
          links: extractExternalLinks(cleanedHtml, canonicalUrl),
        },
      ];
    } catch {
      return [];
    }
  });
  if (entries.length && !results.length) {
    throw new Error(
      "Medium feed contained no recognizable articles; existing items retained",
    );
  }
  return results;
}

export async function collectMedium(source: Source, http: HttpClient) {
  const url = mediumFeedUrl(source.config.medium || "");
  try {
    return parseMediumFeed(await http.text(url, 0, true));
  } catch (error) {
    if (/HTTP (403|404|429)/.test(String(error))) {
      throw new Error(
        "Medium feed is unavailable, not found, or rate limited. Check the @author, #tag, or publication name; existing items retained.",
      );
    }
    throw error;
  }
}
