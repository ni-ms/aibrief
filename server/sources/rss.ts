import he from "he";
import type { CollectedItem, Source } from "../../shared/types.ts";
import { discoverFeedUrls, normalizeFeedUrl } from "../../shared/feeds.ts";
import { labelTopics } from "../../shared/interests.ts";
import { normalizeUrl, plainText, isoDate } from "../normalize.ts";
import type { HttpClient } from "../http.ts";
import { parser, list, XMLValidator } from "./xml.ts";
import { assertPublicFeedUrl } from "#platform";

function extractArticleLinks(
  rawHtml: string,
  canonicalUrl: string,
): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [
    { label: "Original article", url: canonicalUrl },
  ];
  const seen = new Set<string>([canonicalUrl]);
  const articleHost = new URL(canonicalUrl).hostname;
  for (const match of rawHtml.matchAll(
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi,
  )) {
    try {
      const normalized = normalizeUrl(he.decode(match[1]));
      const host = new URL(normalized).hostname;
      if (seen.has(normalized)) continue;
      if (
        /(^|\.)(arxiv\.org|github\.com|openreview\.net|huggingface\.co)$/.test(
          host,
        ) &&
        host !== articleHost
      ) {
        seen.add(normalized);
        links.push({ label: "Linked source", url: normalized });
        if (links.length >= 4) break;
      }
    } catch {}
  }
  return links;
}

export function parseRSS(xml: string): CollectedItem[] {
  if (XMLValidator.validate(xml) !== true)
    throw new Error("Invalid RSS/Atom XML");
  const doc = parser.parse(xml);
  if (!doc.rss?.channel && !doc.feed)
    throw new Error("Expected an RSS or Atom feed");
  return list(doc.rss?.channel?.item || doc.feed?.entry)
    .slice(0, 60)
    .flatMap((row) => {
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
          row.description ||
            row.summary ||
            row["content:encoded"] ||
            row.content?.["#text"] ||
            row.content ||
            "",
        );
        const abstract = plainText(rawBody).slice(0, 20000);
        const author = plainText(
          row["dc:creator"] || row.creator || row.author?.name || row.author,
        );
        const categories = list(row.category)
          .map((c) =>
            plainText(
              typeof c === "object" && c !== null
                ? (c as Record<string, unknown>)["#text"] ||
                    (c as Record<string, unknown>)["@_term"] ||
                    ""
                : c,
            ),
          )
          .filter(Boolean);
        return [
          {
            externalId: String(
              row.guid?.["#text"] || row.guid || row.id || canonicalUrl,
            ),
            canonicalUrl,
            title,
            abstract,
            releaseText: "",
            publishedAt: isoDate(row.pubDate || row.published || row.updated),
            topics: labelTopics(`${title} ${abstract} ${categories.join(" ")}`),
            kind: "news" as const,
            metadata: {
              publicationType: "article" as const,
              ...(author ? { authors: [author] } : {}),
            },
            links: extractArticleLinks(he.decode(rawBody), canonicalUrl),
          },
        ];
      } catch {
        return [];
      }
    });
}

export async function collectRSS(source: Source, http: HttpClient) {
  const feedUrl = normalizeFeedUrl(source.config.url!);
  await assertPublicFeedUrl(feedUrl);
  const body = await http.text(feedUrl, 0, true);
  try {
    return parseRSS(body);
  } catch (initialError) {
    // If the user supplied a blog homepage or article listing HTML page,
    // attempt bounded feed auto-discovery on the same public HTTPS host.
    if (!/<(html|head|body|link)\b/i.test(body)) {
      throw initialError;
    }
    const candidates = discoverFeedUrls(body, feedUrl);
    for (const candidate of candidates) {
      try {
        await assertPublicFeedUrl(candidate);
        const candidateXml = await http.text(candidate, 0, true);
        return parseRSS(candidateXml);
      } catch {
        // Try next discovered candidate
      }
    }
    throw initialError;
  }
}
