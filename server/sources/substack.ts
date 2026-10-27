import he from "he";
import type { CollectedItem, Source } from "../../shared/types.ts";
import { substackFeedUrl } from "../../shared/substack.ts";
import { labelTopics } from "../../shared/interests.ts";
import { normalizeUrl, plainText, isoDate } from "../normalize.ts";
import type { HttpClient } from "../http.ts";
import { parser, list, XMLValidator } from "./xml.ts";

function cleanSubstackHtml(rawHtml: string): string {
  return he
    .decode(rawHtml)
    .replace(/<div\b[^>]*class=["'][^"']*subscription-widget[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
    .replace(/<div\b[^>]*class=["'][^"']*caption[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, " ")
    .replace(/<p\b[^>]*class=["'][^"']*button-wrapper[^"']*["'][^>]*>[\s\S]*?<\/p>/gi, " ")
    .replace(/<a\b[^>]*class=["'][^"']*button[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, " ");
}

function extractSubstackLinks(
  html: string,
  canonicalUrl: string,
): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [
    { label: "Substack article", url: canonicalUrl },
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
        /(^|\.)(substack\.com|substackcdn\.com)$/.test(host)
      ) {
        continue;
      }
      seen.add(normalized);
      const isResearch = /arxiv\.org\/(abs|pdf)\//.test(normalized);
      const isGithub = /github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(
        normalized,
      );
      links.push({
        label: isResearch
          ? "Linked paper"
          : isGithub
            ? "Linked repository"
            : "Linked source",
        url: normalized,
      });
      if (links.length >= 5) break;
    } catch {}
  }
  return links;
}

export function parseSubstackFeed(xml: string): CollectedItem[] {
  if (XMLValidator.validate(xml) !== true) {
    throw new Error("Invalid Substack RSS/Atom XML");
  }
  const doc = parser.parse(xml);
  if (!doc.rss?.channel && !doc.feed) {
    throw new Error("Expected a Substack RSS or Atom feed");
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
      const cleanedHtml = cleanSubstackHtml(rawBody);
      const abstract = plainText(cleanedHtml).slice(0, 20000);
      const author = plainText(
        row["dc:creator"] || row.creator || row.author?.name || row.author,
      );

      const guid = String(
        (row.guid as { "#text"?: string } | undefined)?.["#text"] ??
          row.guid ??
          row.id ??
          canonicalUrl,
      ).trim();

      return [
        {
          externalId: guid || canonicalUrl,
          canonicalUrl,
          title,
          abstract,
          releaseText: "",
          publishedAt: isoDate(
            row.pubDate || row.published || row["atom:updated"] || row.updated,
          ),
          topics: labelTopics(`${title} ${abstract}`),
          kind: "news" as const,
          metadata: {
            publicationType: "article" as const,
            ...(author ? { authors: [author] } : {}),
          },
          links: extractSubstackLinks(rawBody, canonicalUrl),
        },
      ];
    } catch {
      return [];
    }
  });

  if (entries.length && !results.length) {
    throw new Error("Substack feed contained no recognizable articles");
  }
  return results;
}

export async function collectSubstack(
  source: Source,
  http: HttpClient,
): Promise<CollectedItem[]> {
  const url = substackFeedUrl(source.config.substack || "");
  try {
    return parseSubstackFeed(await http.text(url, 0, true));
  } catch (error) {
    if (/HTTP (403|404|429)/.test(String(error))) {
      throw new Error(
        "Substack feed is unavailable, not found, or rate limited. Check the publication name; existing items retained.",
      );
    }
    throw error;
  }
}
