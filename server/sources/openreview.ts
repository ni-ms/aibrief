import type { CollectedItem, Source } from "../../shared/types.ts";
import { labelTopics } from "../../shared/interests.ts";
import { normalizeUrl, plainText, isoDate } from "../normalize.ts";
import type { HttpClient } from "../http.ts";
const value = (field: any) => field?.value ?? field;
/** Only exact venueid matches are considered conference records. No guessed acceptance. */
export function parseOpenReview(data: any, venue: string): CollectedItem[] {
  if (!Array.isArray(data?.notes))
    throw new Error("Unexpected OpenReview response");
  return data.notes
    .filter(
      (note: any) => value(note.content?.venueid) === venue && !note.ddate,
    )
    .map((note: any) => {
      const title = plainText(value(note.content.title));
      const abstract = plainText(value(note.content.abstract));
      if (!note.id || !title) throw new Error("Invalid OpenReview paper");
      const url = `https://openreview.net/forum?id=${encodeURIComponent(note.id)}`;
      const authors = value(note.content.authors);
      return {
        externalId: note.id,
        canonicalUrl: url,
        title,
        abstract,
        releaseText: "",
        publishedAt: isoDate(new Date(note.pdate || note.odate || note.cdate)),
        topics: labelTopics(`${title} ${abstract}`),
        kind: "research",
        metadata: {
          venue: plainText(value(note.content.venue) || venue),
          authors: Array.isArray(authors) ? authors.map(plainText) : [],
          publicationType: "conference",
        },
        links: [
          { label: "Paper & reviews", url },
          {
            label: "PDF",
            url: normalizeUrl(
              `https://openreview.net/pdf?id=${encodeURIComponent(note.id)}`,
            ),
          },
        ],
      };
    });
}
export async function collectOpenReview(source: Source, http: HttpClient) {
  const url = new URL("https://api2.openreview.net/notes");
  url.searchParams.set("content.venueid", source.config.venue!);
  url.searchParams.set("sort", "pdate:desc");
  url.searchParams.set("limit", "60");
  return parseOpenReview(await http.json(url.toString()), source.config.venue!);
}
