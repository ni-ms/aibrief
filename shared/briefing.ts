import type { Story } from "./types.ts";
const titleWords = (s: Story) =>
  new Set(s.title.toLowerCase().match(/[a-z0-9-]{4,}/g) || []);
function overlap(a: Set<string>, b: Set<string>) {
  const common = [...a].filter((t) => b.has(t)).length;
  return common / Math.max(1, a.size + b.size - common);
}
/** Choose the finite set before hiding handled items. Similar titles only affect
 * variety; they NEVER merge stories or evidence links. */
export function selectBriefing(
  stories: Story[],
  since: string | null,
  now = Date.now(),
): Story[] {
  const pool = stories.filter(
    (s) =>
      (!since || (s.changedAt || s.firstSeenAt) > since) &&
      (!s.publishedAt ||
        now -
          Date.parse(
            s.metadata?.arxivVersion && s.metadata.arxivVersion > 1
              ? s.metadata.updatedAt || s.publishedAt
              : s.publishedAt,
          ) <
          14 * 86400000) &&
      s.ranking?.eligible !== false,
  );
  const selected: Story[] = [];
  while (pool.length && selected.length < 10) {
    const adjusted = (s: Story) =>
      s.score -
      selected.filter((p) => p.sourceId === s.sourceId).length * 3 -
      Math.max(
        0,
        ...selected.map((p) => overlap(titleWords(s), titleWords(p))),
      ) *
        14;
    pool.sort(
      (a, b) =>
        adjusted(b) - adjusted(a) ||
        (b.publishedAt || b.firstSeenAt).localeCompare(
          a.publishedAt || a.firstSeenAt,
        ) ||
        a.groupId - b.groupId,
    );
    selected.push(pool.shift()!);
  }
  return selected.filter((s) => !s.read && !s.dismissed);
}

export interface CategorizedBriefing {
  research: Story[];
  tools: Story[];
  news: Story[];
  all: Story[];
}

export function categorizeBriefing(stories: Story[]): CategorizedBriefing {
  return {
    research: stories.filter((s) => s.kind === "research"),
    tools: stories.filter((s) => s.kind === "tools"),
    news: stories.filter((s) => s.kind === "news"),
    all: stories,
  };
}

