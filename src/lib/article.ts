import type { Story } from "../../shared/types.ts";

export interface ReadableArticle {
  text: string;
  fetchedAt: string;
}
export type ArticleRequest = <T>(
  path: string,
  method?: string,
  body?: unknown,
) => Promise<T>;

/** Parse detached HTML; scripts and embedded page content are never executed. */
export function extractReadableHtmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const bad of doc.querySelectorAll(
    "script, style, nav, header, footer, aside, noscript, svg, form, iframe, [hidden], [aria-hidden='true']",
  ))
    bad.remove();
  const container =
    doc.querySelector("article, [role='article']") ||
    doc.querySelector("main, [role='main']") ||
    doc.body;
  if (!container) return "";
  const paragraphs = [...container.querySelectorAll("p, h2, h3, li")]
    .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 45);
  return (
    paragraphs.length >= 2
      ? paragraphs.slice(0, 60).join("\n\n")
      : (container.textContent || "").replace(/\s+/g, " ").trim()
  ).slice(0, 12000);
}

/** Cache reads do no network work. Only an explicit request fetches a missing article. */
export async function loadSummarySource(
  story: Story,
  request: ArticleRequest,
  fetchMissing: boolean,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
  extract = extractReadableHtmlText,
): Promise<Story> {
  const cached = await request<ReadableArticle | null>(`/articles/${story.id}`);
  signal?.throwIfAborted();
  if (cached) return { ...story, articleText: cached.text };
  if (!fetchMissing) return story;

  const requestSignal = AbortSignal.any([
    ...(signal ? [signal] : []),
    AbortSignal.timeout(18000),
  ]);
  let response = await fetcher(
    `/api/proxy?url=${encodeURIComponent(story.canonicalUrl)}`,
    {
      signal: requestSignal,
    },
  );
  // Static hosting has no local proxy. Try the public page directly if it permits CORS.
  if (response.status === 404)
    response = await fetcher(story.canonicalUrl, {
      signal: requestSignal,
      credentials: "omit",
    });
  if (!response.ok)
    throw new Error(
      `Could not fetch the article (HTTP ${response.status}). Open the source to read it.`,
    );
  const contentType = response.headers.get("content-type") || "text/html";
  if (!/text\/(html|plain)|application\/xhtml\+xml/i.test(contentType))
    throw new Error(
      "This link does not provide readable article text. Open the source to read it.",
    );
  const body = await response.text();
  const text = (
    /text\/plain/i.test(contentType) ? body.trim() : extract(body)
  ).slice(0, 12000);
  if (text.length < 60)
    throw new Error(
      "No readable article text found. The page may require a login or JavaScript. Open the source to read it.",
    );
  signal?.throwIfAborted();
  const article = await request<ReadableArticle>(
    `/articles/${story.id}`,
    "PUT",
    {
      contentHash: story.contentHash,
      url: story.canonicalUrl,
      text,
    },
  );
  signal?.throwIfAborted();
  return { ...story, articleText: article.text };
}
