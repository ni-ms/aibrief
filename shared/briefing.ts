import { cosineSimilarity, embedText } from "./semantic.ts";
import type { Story } from "./types.ts";

const titleWords = (s: Story) =>
  new Set(s.title.toLowerCase().match(/[a-z0-9-]{4,}/g) || []);

function overlap(a: Set<string>, b: Set<string>) {
  const common = [...a].filter((t) => b.has(t)).length;
  return common / Math.max(1, a.size + b.size - common);
}

/**
 * Maximal Marginal Relevance (MMR) briefing selector:
 * Greedily selects up to 10 unread/undismissed items by trading off relevance
 * score against both lexical title overlap, semantic embedding similarity, and
 * source repetition. Similar titles only affect variety; they NEVER merge stories.
 */
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
  const vectors = new Map<number, Float32Array>();
  for (const s of pool) {
    vectors.set(s.groupId, embedText(s.abstract.slice(0, 600), s.title));
  }
  const selected: Story[] = [];
  while (pool.length && selected.length < 10) {
    const adjusted = (s: Story) => {
      const sourcePenalty =
        selected.filter((p) => p.sourceId === s.sourceId).length * 3;
      const maxRedundancy = Math.max(
        0,
        ...selected.map((p) => {
          const titleSim = overlap(titleWords(s), titleWords(p));
          const vecS = vectors.get(s.groupId);
          const vecP = vectors.get(p.groupId);
          const semSim =
            vecS && vecP ? Math.max(0, cosineSimilarity(vecS, vecP)) : 0;
          return Math.max(titleSim, semSim * 0.65);
        }),
      );
      return s.score - sourcePenalty - maxRedundancy * 14;
    };
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
