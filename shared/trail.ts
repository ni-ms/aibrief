import type { PaperVersion, VersionChanges } from "./types.ts";
/** Exact supported identifiers only. Versions keep their own pinned evidence URL. */
export function arxivIdentity(
  raw: string,
): { id: string; version: number | null } | null {
  try {
    const url = new URL(raw);
    if (
      !["arxiv.org", "www.arxiv.org", "export.arxiv.org"].includes(url.hostname)
    )
      return null;
    const value = url.pathname
      .replace(/^\/(abs|pdf)\//, "")
      .replace(/\.pdf$/, "");
    const match = value.match(
      /^(\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v(\d+))?$/i,
    );
    return match
      ? { id: match[1], version: match[2] ? Number(match[2]) : null }
      : null;
  } catch {
    return null;
  }
}
const GITHUB_RESERVED = new Set([
  "features",
  "pricing",
  "security",
  "enterprise",
  "explore",
  "topics",
  "trending",
  "collections",
  "events",
  "readme",
  "about",
  "contact",
  "settings",
  "login",
  "signup",
  "search",
  "notifications",
]);

export function githubRepository(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (
      !["github.com", "www.github.com"].includes(url.hostname) ||
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || GITHUB_RESERVED.has(parts[0].toLowerCase()))
      return null;
    const repo = parts[1].replace(/\.git$/, "").replace(/[.,;:!}]+$/, "");
    return /^[a-z0-9_.-]+$/i.test(parts[0]) && /^[a-z0-9_.-]+$/i.test(repo)
      ? `${parts[0]}/${repo}`
      : null;
  } catch {
    return null;
  }
}

export function itemClusterKey(item: {
  canonicalUrl: string;
  metadata?: { arxivId?: string };
  links?: { label: string; url: string }[];
}): string | null {
  const fromCanonicalArxiv = arxivIdentity(item.canonicalUrl);
  if (fromCanonicalArxiv) {
    return `arxiv:${fromCanonicalArxiv.id}`;
  }
  for (const link of item.links || []) {
    const fromLink = arxivIdentity(link.url);
    if (fromLink) return `arxiv:${fromLink.id}`;
  }

  const fromCanonicalGithub = githubRepository(item.canonicalUrl);
  if (fromCanonicalGithub) {
    return `github:${fromCanonicalGithub}`;
  }
  for (const link of item.links || []) {
    const fromLink = githubRepository(link.url);
    if (fromLink) return `github:${fromLink}`;
  }

  return null;
}
export function textUrls(text: string): string[] {
  return [
    ...new Set(
      (text.match(/https?:\/\/[^\s<>"'\\]+/gi) || []).map((s) =>
        s.replace(/[),.;:!}\]]+$/, ""),
      ),
    ),
  ];
}
export function codeUrls(text: string): string[] {
  return [
    ...new Set(
      textUrls(text)
        .map(githubRepository)
        .filter((v): v is string => !!v)
        .map((repo) => `https://github.com/${repo}`),
    ),
  ];
}
const sentences = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
export function compareVersions(
  before: PaperVersion,
  after: PaperVersion,
): VersionChanges {
  const oldSentences = sentences(before.abstract),
    newSentences = sentences(after.abstract);
  const removed = oldSentences.filter((s) => !newSentences.includes(s)),
    added = newSentences.filter((s) => !oldSentences.includes(s));
  const oldCode = codeUrls(`${before.abstract} ${before.comment}`),
    newCode = codeUrls(`${after.abstract} ${after.comment}`);
  return {
    from: before.version,
    to: after.version,
    titleChanged: before.title !== after.title,
    commentChanged: before.comment !== after.comment,
    abstractChanged: before.abstract !== after.abstract,
    addedSentences: added.slice(0, 8),
    removedSentences: removed.slice(0, 8),
    truncated: added.length > 8 || removed.length > 8,
    codeAdded: newCode.filter((v) => !oldCode.includes(v)),
    codeRemoved: oldCode.filter((v) => !newCode.includes(v)),
  };
}
