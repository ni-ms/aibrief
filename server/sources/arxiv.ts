import { labelTopics, matches } from "../../shared/interests.ts";
import { isoDate, normalizeUrl, plainText } from "../normalize.ts";
import type { CollectedItem, Source } from "../../shared/types.ts";
import type { HttpClient } from "../http.ts";
import { parser, list, XMLValidator } from "./xml.ts";
export function parseArxiv(xml: string): CollectedItem[] {
  if (XMLValidator.validate(xml) !== true) throw new Error("Invalid arXiv XML");
  const data = parser.parse(xml);
  if (!data.rss?.channel && !data.feed)
    throw new Error("Unexpected arXiv feed structure");
  const channel = data.rss?.channel;
  return list(channel?.item || data.feed?.entry).map((row) => {
    const raw =
      typeof row.link === "string"
        ? row.link
        : list(row.link).find((l) => l["@_rel"] === "alternate")?.["@_href"] ||
          row.id;
    const canonicalUrl = normalizeUrl(raw);
    const abstract = plainText(
      row["arxiv:abstract"] || row.summary || row.description,
    ).replace(/^arXiv:[\s\S]*?Abstract:\s*/i, "");
    const title = plainText(row.title).replace(/\s*\(arXiv:.*$/, "");
    const categories = list(row.category)
      .map((c) => (typeof c === "string" ? c : c["@_term"]))
      .join(" ");
    return {
      metadata: {
        arxivId: canonicalUrl.replace("https://arxiv.org/abs/", ""),
        arxivVersion:
          Number(String(row.id || raw).match(/v(\d+)(?:\.pdf)?$/)?.[1]) ||
          undefined,
        updatedAt: isoDate(row.updated),
        comment: plainText(row["arxiv:comment"]),
        doi: plainText(row["arxiv:doi"]) || undefined,
        publicationType: "preprint",
        authors: list(row.author)
          .map((a) => plainText(a.name || a))
          .filter(Boolean),
      },
      externalId: canonicalUrl.replace("https://arxiv.org/abs/", ""),
      canonicalUrl,
      title,
      abstract,
      releaseText: "",
      publishedAt: isoDate(row.pubDate || row.published || channel?.pubDate),
      topics: labelTopics(`${title} ${abstract} ${categories}`),
      kind: "research" as const,
      links: [
        { label: "Read paper", url: canonicalUrl },
        { label: "PDF", url: canonicalUrl.replace("/abs/", "/pdf/") },
      ],
    };
  });
}
/** Quote user phrases as data; category and query syntax come only from code. */
export function buildArxivQuery(categories: string[], focus: string[] = []) {
  const subjects = `(${categories.map((c) => `cat:${c}`).join(" OR ")})`;
  const phrases = focus
    .slice(0, 6)
    .map((t) => t.replace(/["\\]/g, " ").trim())
    .filter(Boolean);
  return phrases.length
    ? `${subjects} AND (${phrases.map((t) => `ti:"${t}" OR abs:"${t}"`).join(" OR ")})`
    : subjects;
}
export async function collectArxiv(
  source: Source,
  http: HttpClient,
  _terms: string[],
  needsBackfill = false,
): Promise<CollectedItem[]> {
  const categories = source.config.categories!;
  if (source.config.searchTerms?.length) {
    const query = buildArxivQuery(categories, source.config.searchTerms);
    return parseArxiv(
      await http.text(
        `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=50`,
      ),
    );
  }
  const rss = parseArxiv(
    await http.text(`https://rss.arxiv.org/rss/${categories.join("+")}`),
  );
  if (rss.length || !needsBackfill) return rss;
  const query = buildArxivQuery(categories);
  return parseArxiv(
    await http.text(
      `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=35`,
    ),
  );
}
