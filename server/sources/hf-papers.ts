import { labelTopics } from "../../shared/interests.ts";
import { plainText } from "../normalize.ts";
import type { CollectedItem, Source } from "../../shared/types.ts";
import type { HttpClient } from "../http.ts";

export function parseHFPapers(data: unknown): CollectedItem[] {
  if (!Array.isArray(data)) {
    throw new Error("Expected array from Hugging Face daily papers API");
  }

  const items: CollectedItem[] = [];

  for (const entry of data) {
    if (!entry || typeof entry !== "object") continue;
    const p = (entry as Record<string, any>).paper || entry;
    const rawId = String(p.id || (entry as Record<string, any>).id || "");
    if (!rawId) continue;
    const arxivId = rawId.replace(/v\d+$/i, "");
    const title = plainText(p.title || (entry as Record<string, any>).title || "");
    if (!title) continue;
    const abstract = plainText(
      p.summary ||
        p.abstract ||
        (entry as Record<string, any>).summary ||
        (entry as Record<string, any>).abstract ||
        "",
    );
    const rawAuthors = p.authors || (entry as Record<string, any>).authors || [];
    const authors: string[] = Array.isArray(rawAuthors)
      ? rawAuthors
          .map((a: any) => (typeof a === "string" ? a : a?.name ? String(a.name) : ""))
          .filter(Boolean)
      : [];
    const publishedAt =
      p.publishedAt ||
      (entry as Record<string, any>).publishedAt ||
      new Date().toISOString();
    const upvotes = Number(p.upvotes ?? (entry as Record<string, any>).upvotes ?? 0);
    const githubRepo = p.githubRepo || (entry as Record<string, any>).githubRepo;

    const links: { label: string; url: string }[] = [
      {
        label: "Hugging Face paper page",
        url: `https://huggingface.co/papers/${arxivId}`,
      },
    ];

    if (githubRepo && typeof githubRepo === "string") {
      const repoUrl = githubRepo.startsWith("http")
        ? githubRepo
        : `https://github.com/${githubRepo.replace(/^github\.com\//, "")}`;
      links.push({
        label: "GitHub repository",
        url: repoUrl,
      });
    }

    items.push({
      externalId: arxivId,
      canonicalUrl: `https://arxiv.org/abs/${arxivId}`,
      title,
      abstract,
      releaseText: "",
      publishedAt: new Date(publishedAt).toISOString(),
      topics: labelTopics(`${title} ${abstract}`),
      kind: "research",
      metadata: {
        arxivId,
        authors: authors.slice(0, 10),
        publicationType: "preprint",
        comment: upvotes > 0 ? `${upvotes} Hugging Face community upvotes` : undefined,
      },
      links,
    });
  }

  return items;
}

export async function collectHFPapers(
  _source: Source,
  http: HttpClient,
): Promise<CollectedItem[]> {
  const url = "https://huggingface.co/api/daily_papers";
  try {
    const data = await http.json(url, 300000);
    const items = parseHFPapers(data);
    const checked = http.checkedAt(url);
    if (checked) {
      for (const item of items) item.fetchedAt = checked;
    }
    return items;
  } catch (error) {
    if (/HTTP (403|404|429)/.test(String(error))) {
      throw new Error(
        "Hugging Face Papers API is unavailable or rate limited; existing items retained.",
      );
    }
    throw error;
  }
}
