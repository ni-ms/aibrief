import { labelTopics, matches } from "../../shared/interests.ts";
import { isoDate, normalizeUrl, plainText } from "../normalize.ts";
import type { CollectedItem, Source } from "../../shared/types.ts";
import type { HttpClient } from "../http.ts";
export function parseReleases(data: unknown, repo: string): CollectedItem[] {
  if (!Array.isArray(data))
    throw new Error("Unexpected GitHub releases response");
  return data
    .filter((r) => !r.draft)
    .map((r) => {
      if (!r.id || !r.html_url || !r.tag_name)
        throw new Error("Invalid GitHub release record");
      const title = `${repo.split("/")[1]} · ${plainText(r.name || r.tag_name)}`;
      const releaseText = plainText(r.body).slice(0, 60000);
      return {
        externalId: String(r.id),
        canonicalUrl: normalizeUrl(r.html_url),
        title,
        abstract: "",
        releaseText,
        publishedAt: isoDate(r.published_at),
        topics: labelTopics(`${repo} ${title} ${releaseText}`),
        kind: "tools" as const,
        links: [
          { label: "Release notes", url: normalizeUrl(r.html_url) },
          { label: "Repository", url: `https://github.com/${repo}` },
        ],
      };
    });
}

export async function collectGithub(source: Source, http: HttpClient) {
  return parseReleases(
    await http.json(
      `https://api.github.com/repos/${source.config.repo}/releases?per_page=6`,
    ),
    source.config.repo!,
  );
}
