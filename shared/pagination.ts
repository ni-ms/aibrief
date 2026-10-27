import type { Story } from "./types.ts";
export const PAGE_SIZES = [10, 20, 50] as const;
export function pageSize(value: unknown) {
  const parsed = Number(value);
  return PAGE_SIZES.includes(parsed as 10 | 20 | 50) ? parsed : 10;
}
export function rankedPapers(stories: Story[]) {
  return stories
    .filter(
      (s) =>
        s.kind === "research" && !s.dismissed && s.ranking?.eligible !== false,
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.publishedAt || b.firstSeenAt).localeCompare(
          a.publishedAt || a.firstSeenAt,
        ) ||
        a.groupId - b.groupId,
    );
}
export function paginate<T>(items: T[], requestedPage: number, size = 10) {
  const perPage = pageSize(size);
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const page = Math.max(
    1,
    Math.min(
      pages,
      Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1,
    ),
  );
  const offset = (page - 1) * perPage;
  return {
    items: items.slice(offset, offset + perPage),
    page,
    pages,
    size: perPage,
    total: items.length,
    offset,
    start: items.length ? offset + 1 : 0,
    end: Math.min(offset + perPage, items.length),
  };
}
