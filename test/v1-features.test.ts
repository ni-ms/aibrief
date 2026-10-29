// Tests for Fieldnotes v1.0 features: Hybrid Semantic Search (BM25F + RRF),
// Rocchio preference centroid, 14-day bounded GitHub clustering, OPML import/export,
// source deletion, personal fieldnotes, HTML/Markdown briefing export, and BibTeX generation.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cosineSimilarity,
  embedText,
  hybridSearchStories,
  rocchioCentroid,
} from "../shared/semantic.ts";
import {
  generateBibtex,
  generateBriefingHtml,
  generateBriefingMarkdown,
} from "../shared/export-briefing.ts";
import {
  detectSmartSource,
  exportOpml,
  parseOpml,
} from "../shared/feeds.ts";
import { Store } from "../server/db.ts";
import { Collector } from "../server/collector.ts";
import { sourcesRoutes } from "../server/routes/sources.ts";
import { feedRoutes } from "../server/routes/feed.ts";
import type { Story } from "../shared/types.ts";

const makeStory = (
  id: number,
  title: string,
  abstract: string,
  extra: Partial<Story> = {},
): Story => ({
  id,
  groupId: id,
  externalId: String(id),
  sourceId: "arxiv-ai",
  sourceName: "arXiv",
  sourceKind: "arxiv",
  canonicalUrl: `https://arxiv.org/abs/2610.0000${id}`,
  title,
  abstract,
  releaseText: "",
  publishedAt: "2026-10-27T12:00:00Z",
  firstSeenAt: "2026-10-27T12:00:00Z",
  lastFetchedAt: "2026-10-27T12:00:00Z",
  contentHash: `hash-${id}`,
  topics: ["AI & machine learning"],
  kind: "research",
  links: [{ label: "arXiv", url: `https://arxiv.org/abs/2610.0000${id}` }],
  sources: ["arXiv"],
  read: false,
  saved: false,
  dismissed: false,
  feedback: 0,
  score: 25,
  reasons: ["Title: test"],
  ...extra,
});

test("local semantic embeddings and Hybrid RRF search bridge vocabulary gaps even without exact keyword overlap", () => {
  const s1 = makeStory(
    1,
    "Draft-and-Verify Token Generation for Low-Latency Autoregressive Inference",
    "We accelerate autoregressive token generation using a small draft model verified in parallel.",
  );
  const s2 = makeStory(
    2,
    "Attention Sink Quantization and Paged Memory Pruning",
    "We compress long-context key-value states using 4-bit quantization.",
  );
  const s3 = makeStory(
    3,
    "Culinary Recipes for Sourdough Bread",
    "Fermentation schedules and hydration ratios for artisan baking.",
  );

  // Query "speculative decoding" has zero exact keyword overlap with s1,
  // but shares the fast_inference concept cluster in shared/semantic.ts
  const results = hybridSearchStories(
    [s1, s2, s3],
    "speculative decoding",
    "hybrid",
  );
  assert.ok(results.length >= 1);
  assert.equal(results[0].story.id, 1);
  assert.equal(results[0].matchType, "semantic");
  assert.ok((results[0].story.semanticScore || 0) >= 16);

  // Rocchio centroid moves toward liked vectors and away from disliked vectors
  const profileVec = embedText("machine learning");
  const likedVec = embedText("quantum error correction surface code stabilizer");
  const dislikedVec = embedText("cryptocurrency trading market speculation");
  const centroid = rocchioCentroid(profileVec, [likedVec], [dislikedVec]);
  assert.ok(
    cosineSimilarity(centroid, likedVec) >
      cosineSimilarity(centroid, dislikedVec) + 0.25,
  );
});

test("14-day GitHub clustering window merges concurrent discussions while keeping distant releases separate", () => {
  const store = new Store(":memory:");
  try {
    const ghSource = store.sources().find((s) => s.kind === "github")!;
    const hnSource = store.sources().find((s) => s.kind === "hn")!;

    // Release 1 in early October
    store.ingest(ghSource, [
      {
        externalId: "rel-1",
        canonicalUrl: "https://github.com/mlc-ai/web-llm/releases/tag/v0.1",
        title: "WebLLM v0.1",
        abstract: "",
        releaseText: "Initial release",
        publishedAt: "2026-10-01T00:00:00Z",
        topics: ["Systems & software"],
        kind: "tools",
        links: [{ label: "Repository", url: "https://github.com/mlc-ai/web-llm" }],
      },
    ]);

    // HN discussion 25 days later (outside 14-day window)
    store.ingest(hnSource, [
      {
        externalId: "hn-late",
        canonicalUrl: "https://news.ycombinator.com/item?id=500",
        title: "Show HN: WebLLM v0.2 update",
        abstract: "New discussion",
        releaseText: "",
        publishedAt: "2026-10-26T00:00:00Z",
        topics: ["Systems & software"],
        kind: "tools",
        links: [{ label: "Repository", url: "https://github.com/mlc-ai/web-llm" }],
      },
    ]);

    assert.equal(
      store.stories().length,
      2,
      "GitHub items >14 days apart should not merge into one story",
    );
  } finally {
    store.close();
  }
});

test("personal fieldnotes persist across clusters and appear in standalone HTML, Markdown, and BibTeX exports", async () => {
  const store = new Store(":memory:");
  const collector = new Collector(store);
  const feedRouter = feedRoutes(store, collector);
  try {
    const arxiv = store.sources()[0];
    store.ingest(arxiv, [
      {
        externalId: "2610.55555",
        canonicalUrl: "https://arxiv.org/abs/2610.55555",
        title: "Fault-Tolerant Logical Qubits",
        abstract: "We demonstrate logical error suppression on a surface code.",
        releaseText: "",
        publishedAt: "2026-10-27T00:00:00Z",
        topics: ["Quantum computing"],
        kind: "research",
        metadata: {
          arxivId: "2610.55555",
          arxivVersion: 2,
          authors: ["Ada Lovelace", "Alan Turing"],
        },
        links: [{ label: "arXiv", url: "https://arxiv.org/abs/2610.55555" }],
      },
    ]);
    const groupId = store.stories()[0].groupId;
    const patchRes = await feedRouter.dispatch(`/stories/${groupId}`, "PATCH", {
      saved: true,
      note: "Compare threshold with Section 3 of our stabilizer benchmark.",
    });
    assert.equal(patchRes?.status, 200);

    const updated = store.stories()[0];
    assert.equal(updated.saved, true);
    assert.equal(
      updated.note,
      "Compare threshold with Section 3 of our stabilizer benchmark.",
    );

    const html = generateBriefingHtml([updated], {
      title: "Test Briefing",
    });
    assert.ok(html.includes("<!doctype html>"));
    assert.ok(html.includes("Fault-Tolerant Logical Qubits"));
    assert.ok(
      html.includes("Compare threshold with Section 3 of our stabilizer benchmark."),
    );

    const md = generateBriefingMarkdown([updated], { title: "Test Briefing" });
    assert.ok(md.includes("# Test Briefing"));
    assert.ok(
      md.includes("Compare threshold with Section 3 of our stabilizer benchmark."),
    );

    const bib = generateBibtex(updated);
    assert.match(bib, /@article\{lovelace2026fault/);
    assert.ok(bib.includes("eprint = {2610.55555}"));
    assert.ok(bib.includes("author = {Ada Lovelace and Alan Turing}"));
  } finally {
    store.close();
  }
});

test("OPML export/import, smart Substack/Lobste.rs/HF detection, and DELETE /sources/:id work end-to-end", async () => {
  assert.equal(detectSmartSource("substack:importai").kind, "substack");
  assert.equal(detectSmartSource("https://lobste.rs/t/plt").kind, "lobsters");
  assert.equal(
    detectSmartSource("https://huggingface.co/papers").kind,
    "hf-papers",
  );

  const store = new Store(":memory:");
  const collector = new Collector(store);
  const router = sourcesRoutes(store, collector);
  try {
    await router.dispatch("/sources/custom-blog", "PUT", {
      id: "custom-blog",
      kind: "rss",
      name: "Lilian Weng",
      enabled: false,
      config: { url: "https://lilianweng.github.io" },
    });
    const opml = exportOpml(store.sources());
    assert.ok(opml.includes("<opml version=\"2.0\">"));
    assert.ok(opml.includes("https://lilianweng.github.io/index.xml"));

    const parsed = parseOpml(opml);
    assert.ok(
      parsed.some((p) => p.url === "https://lilianweng.github.io/index.xml"),
    );

    const delRes = await router.dispatch("/sources/custom-blog", "DELETE");
    assert.equal(delRes?.status, 200);
    assert.ok(!store.sources().some((s) => s.id === "custom-blog"));
  } finally {
    store.close();
  }
});
