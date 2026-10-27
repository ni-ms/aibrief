import { labelTopics } from "../../shared/interests.ts";
import { normalizeUrl, plainText } from "../normalize.ts";
import type { CollectedItem, Source } from "../../shared/types.ts";
import type { HttpClient } from "../http.ts";

export function parseLobsters(data: unknown): CollectedItem[] {
  if (!Array.isArray(data)) {
    throw new Error("Expected array from Lobste.rs API");
  }

  const items: CollectedItem[] = [];

  for (const story of data) {
    if (!story || typeof story !== "object") continue;
    const shortId = String(story.short_id || "");
    if (!shortId) continue;
    const title = plainText(story.title || "");
    if (!title) continue;
    const commentsUrl = story.comments_url || `https://lobste.rs/s/${shortId}`;
    const rawUrl = story.url || commentsUrl;
    const canonicalUrl = normalizeUrl(rawUrl);
    const abstract = plainText(story.description || "");
    const tags = Array.isArray(story.tags) ? story.tags : [];
    const publishedAt = story.created_at || new Date().toISOString();
    const isPaper = /arxiv\.org\/(abs|pdf)\//.test(canonicalUrl);
    const isRepo = /github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+/.test(canonicalUrl);

    const links: { label: string; url: string }[] = [
      {
        label: "Lobste.rs discussion",
        url: commentsUrl,
      },
    ];

    if (canonicalUrl !== commentsUrl) {
      links.push({
        label: isPaper ? "Paper link" : isRepo ? "GitHub repository" : "Article link",
        url: canonicalUrl,
      });
    }

    items.push({
      externalId: `lobsters:${shortId}`,
      canonicalUrl,
      title,
      abstract,
      releaseText: "",
      publishedAt: new Date(publishedAt).toISOString(),
      topics: labelTopics(`${title} ${tags.join(" ")} ${abstract}`),
      kind: isPaper ? "research" : isRepo ? "tools" : "news",
      metadata: {
        publicationType: "post",
        comment: typeof story.score === "number" ? `${story.score} points on Lobste.rs` : undefined,
      },
      links,
    });
  }

  return items;
}

export async function collectLobsters(
  source: Source,
  http: HttpClient,
): Promise<CollectedItem[]> {
  const tag = source.config.lobsters?.trim();
  const url =
    tag && tag !== "hottest"
      ? `https://lobste.rs/t/${encodeURIComponent(tag)}.json`
      : "https://lobste.rs/hottest.json";

  try {
    const data = await http.json(url, 300000);
    const items = parseLobsters(data);
    const checked = http.checkedAt(url);
    if (checked) {
      for (const item of items) item.fetchedAt = checked;
    }
    return items;
  } catch (error) {
    if (/HTTP (403|404|429)/.test(String(error))) {
      throw new Error(
        "Lobste.rs feed is unavailable or rate limited; existing items retained.",
      );
    }
    throw error;
  }
}
