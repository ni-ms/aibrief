import type { CollectedItem, Source } from "../../shared/types.ts";
import { labelTopics } from "../../shared/interests.ts";
import { normalizeUrl, plainText, isoDate } from "../normalize.ts";
import type { HttpClient } from "../http.ts";
import { parser, list, XMLValidator } from "./xml.ts";
import { assertPublicFeedUrl } from "#platform";
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
        const title = plainText(row.title);
        if (!title) return [];
        const abstract = plainText(
          row.description ||
            row.summary ||
            row["content:encoded"] ||
            row.content?.["#text"] ||
            row.content,
        ).slice(0, 20000);
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
            topics: labelTopics(`${title} ${abstract}`),
            kind: "news" as const,
            metadata: { publicationType: "article" as const },
            links: [{ label: "Original article", url: canonicalUrl }],
          },
        ];
      } catch {
        return [];
      }
    });
}
export async function collectRSS(source: Source, http: HttpClient) {
  await assertPublicFeedUrl(source.config.url!);
  return parseRSS(await http.text(source.config.url!, 0, true));
}
