import { labelTopics, matches } from "../../shared/interests.ts";
import { isoDate, normalizeUrl, plainText } from "../normalize.ts";
import type { CollectedItem, Source } from "../../shared/types.ts";
import type { HttpClient } from "../http.ts";
export function parseHN(row: any, terms: string[]): CollectedItem | null {
  if (
    !row ||
    row.type !== "story" ||
    row.dead ||
    row.deleted ||
    !row.title ||
    !row.time
  )
    return null;
  const title = plainText(row.title);
  const abstract = plainText(row.text);
  const rawUrl = String(row.url || "");
  const isHighSignal =
    (typeof row.score === "number" && row.score >= 100) ||
    /(^|\/|\.)(arxiv\.org|github\.com|huggingface\.co|openreview\.net)($|\/)/i.test(
      rawUrl,
    );
  if (
    terms.length &&
    !isHighSignal &&
    !terms.some((t) => matches(`${title} ${abstract}`, t))
  )
    return null;
  const canonicalUrl = normalizeUrl(
    row.url || `https://news.ycombinator.com/item?id=${row.id}`,
  );
  const paper = /arxiv\.org\/(abs|pdf)\//.test(canonicalUrl);
  return {
    externalId: String(row.id),
    canonicalUrl,
    title,
    abstract,
    releaseText: "",
    publishedAt: new Date(row.time * 1000).toISOString(),
    topics: labelTopics(`${title} ${abstract}`),
    kind: paper
      ? "research"
      : /^Show HN:|github\.com/.test(`${title} ${canonicalUrl}`)
        ? "tools"
        : "news",
    links: [
      {
        label: "HN discussion",
        url: `https://news.ycombinator.com/item?id=${row.id}`,
      },
    ],
  };
}
export async function collectHN(
  source: Source,
  http: HttpClient,
  terms: string[],
): Promise<CollectedItem[]> {
  const endpoints = ["newstories", "topstories", "showstories"];
  const ids: number[] = [];
  for (const endpoint of endpoints) {
    const data = await http.json(
      `https://hacker-news.firebaseio.com/v0/${endpoint}.json`,
      300000,
    );
    if (!Array.isArray(data)) throw new Error("Unexpected Hacker News index");
    ids.push(...data.slice(0, Math.ceil((source.config.limit || 120) / 3)));
  }
  const unique = [...new Set(ids)];
  const items: CollectedItem[] = [];
  for (let i = 0; i < unique.length; i += 6) {
    const rows = await Promise.all(
      unique
        .slice(i, i + 6)
        .map((id) =>
          http.json(
            `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
            21600000,
          ),
        ),
    );
    for (let j = 0; j < rows.length; j++) {
      const item = parseHN(rows[j], terms);
      if (item) {
        item.fetchedAt = http.checkedAt(
          `https://hacker-news.firebaseio.com/v0/item/${unique[i + j]}.json`,
        );
        items.push(item);
      }
    }
  }
  return items;
}
