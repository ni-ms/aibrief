import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { categorizeBriefing } from "../shared/briefing.ts";
import type { Story } from "../shared/types.ts";

test("cross-source clustering groups discussions and articles linking to the same arXiv paper into one story", () => {
  const store = new Store(":memory:");
  try {
    const arxivSource = store.sources().find((s) => s.kind === "arxiv")!;
    const hnSource = store.sources().find((s) => s.kind === "hn")!;

    const substackSource = {
      id: "substack-newsletter",
      kind: "substack" as const,
      name: "Substack · AI Weekly",
      enabled: true,
      config: { substack: "aiweekly" },
      lastSuccess: null,
      lastAttempt: null,
      error: null,
    };
    store.saveSource(substackSource);

    // 1. Primary arXiv paper
    store.ingest(arxivSource, [
      {
        externalId: "2610.12345",
        canonicalUrl: "https://arxiv.org/abs/2610.12345",
        title: "Sparse Neural Decoders",
        abstract: "We introduce sparse neural decoders.",
        releaseText: "",
        publishedAt: "2026-10-25T00:00:00Z",
        topics: ["AI & machine learning"],
        kind: "research",
        links: [{ label: "Read paper", url: "https://arxiv.org/abs/2610.12345" }],
      },
    ]);

    // 2. HN thread linking to the paper
    store.ingest(hnSource, [
      {
        externalId: "hn-123",
        canonicalUrl: "https://news.ycombinator.com/item?id=123",
        title: "Discussion: Sparse Neural Decoders",
        abstract: "HN community discussion on sparse neural decoders.",
        releaseText: "",
        publishedAt: "2026-10-25T02:00:00Z",
        topics: ["AI & machine learning"],
        kind: "news",
        links: [
          { label: "HN discussion", url: "https://news.ycombinator.com/item?id=123" },
          { label: "Paper", url: "https://arxiv.org/abs/2610.12345" },
        ],
      },
    ]);

    // 3. Substack article linking to the paper
    store.ingest(substackSource, [
      {
        externalId: "substack-456",
        canonicalUrl: "https://aiweekly.substack.com/p/issue-10",
        title: "Deep Dive on Sparse Decoders",
        abstract: "A detailed breakdown of recent sparse neural decoders research.",
        releaseText: "",
        publishedAt: "2026-10-25T04:00:00Z",
        topics: ["AI & machine learning"],
        kind: "news",
        links: [
          { label: "Substack article", url: "https://aiweekly.substack.com/p/issue-10" },
          { label: "Linked paper", url: "https://arxiv.org/abs/2610.12345" },
        ],
      },
    ]);

    const stories = store.stories();
    assert.equal(stories.length, 1, "All 3 items should cluster into 1 unified story");

    const story = stories[0];
    assert.equal(story.canonicalUrl, "https://arxiv.org/abs/2610.12345", "arXiv paper should be the primary story");
    assert.equal(story.kind, "research");

    // All source names should be present on the story
    assert.ok(story.sources.includes("arXiv"));
    assert.ok(story.sources.includes("Hacker News"));
    assert.ok(story.sources.includes("Substack · AI Weekly"));

    // All discussion and article links should be preserved
    assert.ok(story.links.some((l) => l.url.includes("news.ycombinator.com")));
    assert.ok(story.links.some((l) => l.url.includes("aiweekly.substack.com")));
    assert.ok(story.links.some((l) => l.url === "https://arxiv.org/abs/2610.12345"));
  } finally {
    store.close();
  }
});

test("cross-source clustering groups discussions linking to the same GitHub repository into one story", () => {
  const store = new Store(":memory:");
  try {
    const ghSource = store.sources().find((s) => s.kind === "github")!;
    const hnSource = store.sources().find((s) => s.kind === "hn")!;

    // 1. GitHub release
    store.ingest(ghSource, [
      {
        externalId: "release-v1",
        canonicalUrl: "https://github.com/mlc-ai/web-llm",
        title: "WebLLM v1.0",
        abstract: "",
        releaseText: "Major release for WebLLM with browser GPU support.",
        publishedAt: "2026-10-25T00:00:00Z",
        topics: ["Systems & software"],
        kind: "tools",
        links: [{ label: "GitHub repository", url: "https://github.com/mlc-ai/web-llm" }],
      },
    ]);

    // 2. HN discussion linking to WebLLM repo
    store.ingest(hnSource, [
      {
        externalId: "hn-789",
        canonicalUrl: "https://news.ycombinator.com/item?id=789",
        title: "Show HN: WebLLM v1.0",
        abstract: "Run LLMs in browser with WebGPU.",
        releaseText: "",
        publishedAt: "2026-10-25T01:00:00Z",
        topics: ["Systems & software"],
        kind: "tools",
        links: [
          { label: "HN discussion", url: "https://news.ycombinator.com/item?id=789" },
          { label: "Code", url: "https://github.com/mlc-ai/web-llm" },
        ],
      },
    ]);

    const stories = store.stories();
    assert.equal(stories.length, 1, "GitHub release and HN thread should cluster into 1 story");
    assert.ok(stories[0].sources.includes("Hacker News"));
  } finally {
    store.close();
  }
});

test("categorizeBriefing separates stories into research, tools and news sections", () => {
  const mockStories = [
    { id: 1, title: "Paper 1", kind: "research" },
    { id: 2, title: "Tool 1", kind: "tools" },
    { id: 3, title: "Article 1", kind: "news" },
    { id: 4, title: "Paper 2", kind: "research" },
  ] as Story[];

  const categorized = categorizeBriefing(mockStories);
  assert.equal(categorized.research.length, 2);
  assert.equal(categorized.tools.length, 1);
  assert.equal(categorized.news.length, 1);
  assert.equal(categorized.all.length, 4);
});
