import type { Resource, Source } from "../shared/types.ts";
import { DISCOVERY_DIRECTORIES } from "../shared/discovery-sources.ts";
const preset = (
  id: string,
  kind: Source["kind"],
  name: string,
  config: Source["config"],
  resourceId = id,
): Source => ({
  id,
  kind,
  name,
  config,
  resourceId,
  enabled: true,
  lastSuccess: null,
  lastAttempt: null,
  error: null,
});
/** Resource catalog and presets. These never enable a new collector without a user action. */
export const RESOURCES: Resource[] = [
  ...DISCOVERY_DIRECTORIES.map((site): Resource => ({
    id: site.id,
    kind: site.feedUrl ? "rss" : null,
    name: site.name,
    category: "Discovery",
    description: site.description,
    docs: site.docs || site.website,
    connectionLabel: site.feedUrl
      ? "Public feed · No account needed"
      : site.status === "api-key"
        ? "API key required"
        : site.status === "unverified"
          ? "Address unverified"
          : "Feed not available",
    ...(site.feedUrl
      ? {
          preset: preset(
            site.id,
            "rss",
            site.feedName || site.name,
            { url: site.feedUrl },
            site.id,
          ),
          caveat: site.note,
        }
      : { unavailable: site.note }),
  })),
  {
    id: "arxiv",
    kind: "arxiv",
    name: "arXiv",
    category: "Research",
    description: "New papers by subject.",
    docs: "https://info.arxiv.org/help/rss.html",
    field: "categories",
    placeholder: "cs.AI, cs.LG, quant-ph",
    preset: preset(
      "arxiv-general",
      "arxiv",
      "arXiv",
      { categories: ["cs.AI", "cs.LG"] },
      "arxiv",
    ),
  },
  {
    id: "neurips",
    kind: "openreview",
    name: "NeurIPS",
    category: "Research",
    description: "Conference papers via OpenReview.",
    docs: "https://docs.openreview.net/reference/api-v2",
    field: "venue",
    placeholder: "NeurIPS.cc/2026/Conference",
    preset: preset(
      "neurips-2026",
      "openreview",
      "NeurIPS 2026",
      { venue: "NeurIPS.cc/2026/Conference" },
      "neurips",
    ),
  },
  {
    id: "openreview",
    kind: "openreview",
    name: "OpenReview",
    category: "Research",
    description: "Public papers from other venues.",
    docs: "https://docs.openreview.net/reference/api-v2",
    field: "venue",
    placeholder: "ICLR.cc/2026/Conference",
    preset: preset(
      "openreview-iclr",
      "openreview",
      "ICLR 2026",
      { venue: "ICLR.cc/2026/Conference" },
      "openreview",
    ),
  },
  {
    id: "hf-papers",
    kind: "hf-papers",
    name: "Hugging Face Daily Papers",
    category: "Research",
    description:
      "Daily curated machine learning papers with community upvotes and linked code.",
    docs: "https://huggingface.co/papers",
    preset: preset(
      "hf-daily-papers",
      "hf-papers",
      "Hugging Face Daily Papers",
      {},
      "hf-papers",
    ),
  },
  {
    id: "github",
    kind: "github",
    name: "GitHub",
    category: "Code",
    description: "Release notes from repositories you follow.",
    docs: "https://docs.github.com/en/rest/releases/releases",
    field: "repo",
    placeholder: "owner/repository",
    preset: preset(
      "github-new",
      "github",
      "GitHub",
      { repo: "mlc-ai/web-llm" },
      "github",
    ),
  },
  {
    id: "hn",
    kind: "hn",
    name: "Hacker News",
    category: "Discussion",
    description: "New, top and Show HN stories.",
    docs: "https://github.com/HackerNews/API",
    preset: preset("hackernews", "hn", "Hacker News", { limit: 120 }, "hn"),
  },
  {
    id: "reddit",
    kind: "reddit",
    name: "Reddit",
    category: "Discussion",
    description:
      "New posts from communities you follow, with links to the discussion.",
    docs: "https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026",
    field: "subreddit",
    placeholder: "MachineLearning or r/LocalLLaMA",
    preset: preset(
      "reddit-machinelearning",
      "reddit",
      "Reddit · r/MachineLearning",
      { subreddit: "machinelearning" },
      "reddit",
    ),
    caveat:
      "Reddit ends public RSS support on November 13, 2026. An approved API token can be configured on the server.",
  },
  {
    id: "lobsters",
    kind: "lobsters",
    name: "Lobste.rs",
    category: "Discussion",
    description:
      "Curated technical stories and tag feeds (ai, ml, plt, systems, security).",
    docs: "https://lobste.rs",
    field: "lobsters",
    placeholder: "hottest or tag: ai, ml, plt, distributed, security",
    preset: preset(
      "lobsters-hottest",
      "lobsters",
      "Lobste.rs · Hottest",
      { lobsters: "hottest" },
      "lobsters",
    ),
  },
  {
    id: "medium",
    kind: "medium",
    name: "Medium",
    category: "Writing",
    description:
      "Articles from Medium authors (@handle), publications, or #tags.",
    docs: "https://help.medium.com/hc/en-us/articles/214874118-Using-RSS-feeds-of-profiles-publications-and-topics",
    field: "medium",
    placeholder: "@karpathy, towards-data-science, or #machine-learning",
    preset: preset(
      "medium-tds",
      "medium",
      "Medium · towards-data-science",
      { medium: "towards-data-science" },
      "medium",
    ),
  },
  {
    id: "substack",
    kind: "substack",
    name: "Substack",
    category: "Writing",
    description: "Newsletters from Substack authors or publication subdomains.",
    docs: "https://support.substack.com/hc/en-us/articles/360037833072-Can-I-set-up-an-RSS-feed-for-my-publication-",
    field: "substack",
    placeholder: "@handle, importai, or custom newsletter domain",
    preset: preset(
      "substack-importai",
      "substack",
      "Substack · Import AI",
      { substack: "importai" },
      "substack",
    ),
  },
  {
    id: "rss",
    kind: "rss",
    name: "Blogs & RSS",
    category: "Writing",
    description:
      "Articles from any blog URL, Substack, research lab, or RSS/Atom feed.",
    docs: "https://www.rssboard.org/rss-specification",
    field: "url",
    placeholder: "https://lilianweng.github.io or https://example.com/feed.xml",
    preset: preset(
      "rss-huggingface",
      "rss",
      "Hugging Face blog",
      { url: "https://huggingface.co/blog/feed.xml" },
      "rss",
    ),
  },
  {
    id: "bluesky",
    kind: "bluesky",
    name: "Bluesky",
    category: "Social",
    description: "Public posts from selected accounts.",
    docs: "https://docs.bsky.app/docs/api/app-bsky-feed-get-author-feed",
    field: "actor",
    placeholder: "account.bsky.social",
    preset: preset(
      "bluesky-new",
      "bluesky",
      "Simon Willison",
      { actor: "simonwillison.net" },
      "bluesky",
    ),
  },
  {
    id: "x",
    kind: null,
    name: "X / Twitter",
    category: "Social",
    description: "Posts and threads.",
    docs: "https://docs.x.com/x-api/getting-started/pricing",
    unavailable: "Paid API. Unavailable in free mode.",
  },
];
export function resourceId(source: Source) {
  return (
    source.resourceId ||
    (source.kind === "openreview" &&
    source.config.venue?.startsWith("NeurIPS.cc/")
      ? "neurips"
      : source.kind)
  );
}
