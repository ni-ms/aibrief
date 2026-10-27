import type {
  PaperVersion,
  Story,
  TrailLink,
  CollectedItem,
} from "../../shared/types.ts";
import {
  arxivIdentity,
  codeUrls,
  textUrls,
  githubRepository,
} from "../../shared/trail.ts";
import { normalizeUrl, plainText } from "../normalize.ts";
export function versionFromItem(
  item: CollectedItem,
  observedAt = new Date().toISOString(),
): PaperVersion | null {
  const id = arxivIdentity(item.canonicalUrl)?.id;
  const version = item.metadata?.arxivVersion;
  return id && version
    ? {
        paperKey: id,
        version,
        title: item.title,
        abstract: item.abstract,
        comment: item.metadata?.comment || "",
        updatedAt: item.metadata?.updatedAt || null,
        observedAt,
        sourceUrl: `https://arxiv.org/abs/${id}v${version}`,
      }
    : null;
}
export function linkedCode(
  paper: Story,
  versions: PaperVersion[],
): TrailLink[] {
  const latest = versions[0];
  const text = latest
    ? `${latest.abstract} ${latest.comment}`
    : `${paper.abstract} ${paper.metadata?.comment || ""}`;
  const evidenceUrl = latest?.sourceUrl || paper.canonicalUrl;
  return codeUrls(text).map((url) => ({
    id: `paper:${url}`,
    kind: "code",
    url,
    title: githubRepository(url)!,
    relation: "paper-linked",
    evidenceUrl,
    evidenceText:
      "Repository URL supplied in the paper abstract or author comments.",
    linkedVersion: latest?.version,
    available: null,
  }));
}
export function corpusLinks(paper: Story, stories: Story[]): TrailLink[] {
  const target = arxivIdentity(paper.canonicalUrl)?.id;
  const result: TrailLink[] = [];
  for (const other of stories) {
    if (other.groupId === paper.groupId) continue;
    const text = `${other.abstract} ${other.releaseText} ${other.metadata?.comment || ""}`;
    const matches = textUrls(text).some((url) =>
      target
        ? arxivIdentity(url)?.id === target
        : (() => {
            try {
              return normalizeUrl(url) === paper.canonicalUrl;
            } catch {
              return false;
            }
          })(),
    );
    if (!matches) continue;
    const repo = githubRepository(other.canonicalUrl);
    if (repo)
      result.push({
        id: `release:${repo}`,
        kind: "code",
        url: `https://github.com/${repo}`,
        title: repo,
        relation: "release-linked",
        evidenceUrl: other.canonicalUrl,
        evidenceText:
          "A collected repository release/post explicitly links this paper.",
        available: null,
      });
    else if (other.kind === "research")
      result.push({
        id: `mentions:${other.canonicalUrl}`,
        kind: "followup",
        url: other.canonicalUrl,
        title: other.title,
        relation: "mentions",
        evidenceUrl: other.canonicalUrl,
        evidenceText:
          "This collected paper explicitly links the selected paper.",
        publishedAt: other.publishedAt,
      });
  }
  return result;
}
export function parseCitations(
  data: any,
  evidenceUrl: string,
): { links: TrailLink[]; partial: boolean } {
  if (!Array.isArray(data?.data))
    throw new Error("Unexpected citation response");
  const links: TrailLink[] = data.data.flatMap((entry: any) => {
    const paper = entry.citingPaper;
    if (!paper?.title || !paper.paperId) return [];
    let url = paper.url;
    const arxiv = String(paper.externalIds?.ArXiv || "");
    if (arxiv && arxivIdentity(`https://arxiv.org/abs/${arxiv}`))
      url = `https://arxiv.org/abs/${arxiv}`;
    if (!url && /^[a-f0-9]{40}$/i.test(paper.paperId))
      url = `https://www.semanticscholar.org/paper/${paper.paperId}`;
    try {
      url = normalizeUrl(url);
    } catch {
      return [];
    }
    return [
      {
        id: `cites:${paper.paperId}`,
        kind: "followup" as const,
        url,
        title: plainText(paper.title),
        relation: "cites" as const,
        evidenceUrl,
        evidenceText:
          "Semantic Scholar records a citation to this paper. A citation does not establish an extension or endorsement.",
        publishedAt: paper.publicationDate || null,
        year: paper.year,
      },
    ];
  });
  links.sort((a, b) =>
    (b.publishedAt || String(b.year || "")).localeCompare(
      a.publishedAt || String(a.year || ""),
    ),
  );
  return {
    links: links.slice(0, 20),
    partial: !!data.next || links.length > 20,
  };
}
