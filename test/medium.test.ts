// Synthetic Medium and smart-blog fixtures; never inserted into the user's reading library.
import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  mediumDisplayName,
  mediumFeedUrl,
  normalizeMedium,
} from "../shared/medium.ts";
import {
  detectSmartSource,
  discoverFeedUrls,
  inferFeedName,
  normalizeFeedUrl,
} from "../shared/feeds.ts";
import { summaryScope } from "../shared/summary.ts";
import { Store } from "../server/db.ts";
import { HttpClient } from "../server/http.ts";
import { Collector } from "../server/collector.ts";
import { sourcesRoutes } from "../server/routes/sources.ts";
import {
  collectMedium,
  mediumConnection,
  parseMediumFeed,
} from "../server/sources/medium.ts";
import { collectRSS } from "../server/sources/rss.ts";

const mediumRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">
  <channel>
    <title>Stories by Jane Researcher on Medium</title>
    <item>
      <title><![CDATA[TEST FIXTURE: Scaling Sparse Transformers]]></title>
      <link>https://medium.com/towards-data-science/scaling-sparse-transformers-a1b2c3d4e5f6?source=rss----7f60cf5620c9---4</link>
      <guid isPermaLink="false">https://medium.com/p/a1b2c3d4e5f6</guid>
      <category><![CDATA[machine-learning]]></category>
      <category><![CDATA[quantum-computing]]></category>
      <dc:creator><![CDATA[Jane Researcher]]></dc:creator>
      <pubDate>Sat, 24 Oct 2026 14:30:00 GMT</pubDate>
      <content:encoded><![CDATA[<p>We evaluate sparse attention kernels against <a href="https://arxiv.org/abs/2610.12345v2">our paper</a> and <a href="https://github.com/example/sparse-kernels">reference code.</a></p><img src="https://medium.com/_/stat?event=post.clientViewed&amp;referrerSource=full_rss&amp;postId=a1b2c3d4e5f6" width="1" height="1" alt=""><hr><p><a href="https://medium.com/towards-data-science/scaling-sparse-transformers-a1b2c3d4e5f6">Scaling Sparse Transformers</a> was originally published in <a href="https://medium.com/towards-data-science">Towards Data Science</a> on Medium, where people are continuing the conversation by highlighting and responding to this story.</p>]]></content:encoded>
    </item>
  </channel>
</rss>`;

const mediumSource = {
  id: "medium-tds",
  kind: "medium" as const,
  name: "Medium · towards-data-science",
  resourceId: "medium",
  config: { medium: "towards-data-science" },
  enabled: true,
  lastSuccess: null,
  lastAttempt: null,
  error: null,
};

test("Medium inputs normalize authors, publications, tags, and URLs while rejecting unsafe or single-post paths", () => {
  for (const [input, expected, feed, label] of [
    [
      "@Karpathy",
      "@karpathy",
      "https://medium.com/feed/@karpathy",
      "Medium · @karpathy",
    ],
    [
      "https://medium.com/@Karpathy/about",
      "@karpathy",
      "https://medium.com/feed/@karpathy",
      "Medium · @karpathy",
    ],
    [
      "https://medium.com/feed/@karpathy",
      "@karpathy",
      "https://medium.com/feed/@karpathy",
      "Medium · @karpathy",
    ],
    [
      "https://karpathy.medium.com/feed",
      "@karpathy",
      "https://medium.com/feed/@karpathy",
      "Medium · @karpathy",
    ],
    [
      "#Machine-Learning",
      "tag/machine-learning",
      "https://medium.com/feed/tag/machine-learning",
      "Medium · #machine-learning",
    ],
    [
      "tag/Quantum-Computing",
      "tag/quantum-computing",
      "https://medium.com/feed/tag/quantum-computing",
      "Medium · #quantum-computing",
    ],
    [
      "https://medium.com/tag/artificial-intelligence/latest",
      "tag/artificial-intelligence",
      "https://medium.com/feed/tag/artificial-intelligence",
      "Medium · #artificial-intelligence",
    ],
    [
      "Towards-Data-Science",
      "towards-data-science",
      "https://medium.com/feed/towards-data-science",
      "Medium · towards-data-science",
    ],
    [
      "https://medium.com/towards-data-science",
      "towards-data-science",
      "https://medium.com/feed/towards-data-science",
      "Medium · towards-data-science",
    ],
  ] as const) {
    assert.equal(normalizeMedium(input), expected, input);
    assert.equal(mediumFeedUrl(input), feed, input);
    assert.equal(mediumDisplayName(input), label, input);
  }

  for (const invalid of [
    "",
    "   ",
    "../secret",
    "http://medium.com/@karpathy",
    "https://evil.com/@karpathy",
    "https://medium.com.evil.com/@karpathy",
    "https://user:pass@medium.com/@karpathy",
    "https://medium.com:8443/@karpathy",
    "https://medium.com/@karpathy?foo=bar",
    "https://medium.com/@karpathy/some-individual-article-a1b2c3d4e5f6",
    "https://medium.com/towards-data-science/some-individual-article-a1b2c3d4e5f6",
    "https://medium.com/p/a1b2c3d4e5f6",
    "https://medium.com/search",
    "https://api.medium.com/",
    "tag/",
    "@",
  ]) {
    assert.throws(() => normalizeMedium(invalid), invalid);
  }
});

test("parseMediumFeed strips tracking pixels and Medium footers, normalizes RSS query parameters, and extracts authors, tags, and linked research", () => {
  const [item] = parseMediumFeed(mediumRss);
  assert.equal(item.externalId, "medium:a1b2c3d4e5f6");
  assert.equal(
    item.canonicalUrl,
    "https://medium.com/towards-data-science/scaling-sparse-transformers-a1b2c3d4e5f6",
  );
  assert.equal(item.title, "TEST FIXTURE: Scaling Sparse Transformers");
  assert.equal(
    item.abstract,
    "We evaluate sparse attention kernels against our paper and reference code.",
  );
  assert.ok(!item.abstract.includes("originally published in"));
  assert.equal(item.publishedAt, "2026-10-24T14:30:00.000Z");
  assert.equal(item.metadata?.publicationType, "article");
  assert.deepEqual(item.metadata?.authors, ["Jane Researcher"]);
  assert.ok(item.topics.includes("AI & machine learning"));
  assert.ok(item.topics.includes("Quantum computing"));
  assert.deepEqual(
    item.links.map((l) => l.label),
    ["Medium article", "Linked source", "Linked source"],
  );
  assert.equal(item.links[1].url, "https://arxiv.org/abs/2610.12345");
  assert.equal(item.links[2].url, "https://github.com/example/sparse-kernels");
  assert.equal(
    summaryScope({ ...item, sourceKind: "medium" }),
    "Article excerpt",
  );

  assert.throws(
    () => parseMediumFeed("<html>Challenge</html>"),
    /Expected a Medium/,
  );
});

test("Medium source API validates and persists targets and participates in collected discovery", async () => {
  const store = new Store(":memory:");
  const collector = new Collector(store);
  const router = sourcesRoutes(store, collector);
  try {
    const resourcesRes = await router.dispatch("/resources", "GET");
    const resources = resourcesRes?.body as any[];
    const medium = resources.find((r) => r.id === "medium");
    assert.ok(medium);
    assert.equal(medium.field, "medium");
    assert.equal(medium.category, "Writing");
    assert.ok(mediumConnection().connectionLabel);

    for (const validInput of [
      "https://medium.com/@karpathy",
      "#machine-learning",
    ]) {
      const res = await router.dispatch("/sources/medium-api-fixture", "PUT", {
        ...mediumSource,
        id: "medium-api-fixture",
        enabled: false,
        config: { medium: validInput },
      });
      assert.equal(res?.status, 200);
    }

    await assert.rejects(
      () =>
        router.dispatch("/sources/medium-api-fixture", "PUT", {
          ...mediumSource,
          id: "medium-api-fixture",
          enabled: false,
          config: { medium: "https://evil.example/@karpathy" },
        }),
      (err) => err instanceof z.ZodError,
    );

    const missingRes = await router.dispatch(
      "/sources/medium-api-fixture",
      "PUT",
      {
        ...mediumSource,
        id: "medium-api-fixture",
        enabled: false,
        config: {},
      },
    );
    assert.equal(missingRes?.status, 400);

    const saved = store.sources().find((s) => s.id === "medium-api-fixture")!;
    assert.equal(saved.config.medium, "tag/machine-learning");
    store.saveSource({
      ...saved,
      enabled: true,
      lastSuccess: "2026-10-24T14:30:00Z",
    });
    store.ingest(saved, parseMediumFeed(mediumRss));
    const discovery = await collector.topics.discover("sparse transformers", [
      saved.id,
    ]);
    assert.equal(discovery.results.length, 1);
    assert.equal(discovery.results[0].origin, "collected");
    assert.equal(
      discovery.results[0].canonicalUrl,
      "https://medium.com/towards-data-science/scaling-sparse-transformers-a1b2c3d4e5f6",
    );
  } finally {
    store.close();
  }
});

test("smart blog URL normalization, HTML feed auto-discovery, and multi-resource detection work across platforms", async () => {
  // 1. Platform URL resolution
  assert.equal(
    normalizeFeedUrl("lilianweng.github.io"),
    "https://lilianweng.github.io/index.xml",
  );
  assert.equal(
    normalizeFeedUrl("https://importai.substack.com/"),
    "https://importai.substack.com/feed",
  );
  assert.equal(
    normalizeFeedUrl("https://substack.com/@importai"),
    "https://importai.substack.com/feed",
  );
  assert.equal(
    normalizeFeedUrl("https://dev.to/simonw"),
    "https://dev.to/feed/simonw",
  );
  assert.equal(
    normalizeFeedUrl("https://myblog.hashnode.dev"),
    "https://myblog.hashnode.dev/rss.xml",
  );
  assert.equal(
    normalizeFeedUrl("https://myblog.wordpress.com"),
    "https://myblog.wordpress.com/feed/",
  );
  assert.equal(
    inferFeedName("https://importai.substack.com"),
    "importai · Substack",
  );

  // 2. HTML <link rel="alternate"> feed discovery
  const html = `<!doctype html><html><head><link rel="alternate" type="application/atom+xml" title="Atom" href="/blog/atom.xml"></head><body>Blog</body></html>`;
  const discovered = discoverFeedUrls(html, "https://example.org/blog");
  assert.equal(discovered[0], "https://example.org/blog/atom.xml");

  // 3. Smart source auto-detection across kinds
  assert.deepEqual(detectSmartSource("@karpathy"), {
    kind: "medium",
    resourceId: "medium",
    name: "Medium · @karpathy",
    config: { medium: "@karpathy" },
  });
  assert.deepEqual(detectSmartSource("#quantum-computing"), {
    kind: "medium",
    resourceId: "medium",
    name: "Medium · #quantum-computing",
    config: { medium: "tag/quantum-computing" },
  });
  assert.deepEqual(detectSmartSource("r/LocalLLaMA"), {
    kind: "reddit",
    resourceId: "reddit",
    name: "Reddit · r/localllama",
    config: { subreddit: "localllama" },
  });
  assert.deepEqual(detectSmartSource("huggingface/transformers"), {
    kind: "github",
    resourceId: "github",
    name: "GitHub · huggingface/transformers",
    config: { repo: "huggingface/transformers" },
  });
  assert.deepEqual(detectSmartSource("cs.AI, quant-ph"), {
    kind: "arxiv",
    resourceId: "arxiv",
    name: "arXiv · cs.AI, quant-ph",
    config: { categories: ["cs.AI", "quant-ph"] },
  });
  assert.deepEqual(detectSmartSource("importai.substack.com"), {
    kind: "rss",
    resourceId: "rss",
    name: "importai · Substack",
    config: { url: "https://importai.substack.com/feed" },
  });

  // 4. End-to-end collectRSS with HTML feed auto-discovery and collectMedium
  const store = new Store(":memory:");
  try {
    class MockFeedHTTP extends HttpClient {
      override async text(url: string, _ttl = 0, publicFeed = false) {
        assert.equal(publicFeed, true);
        if (url === "https://medium.com/feed/towards-data-science") {
          return mediumRss;
        }
        if (url === "https://8.8.8.8/blog") {
          return `<html><head><link rel="alternate" type="application/rss+xml" href="/blog/feed.xml"/></head></html>`;
        }
        if (url === "https://8.8.8.8/blog/feed.xml") {
          return `<rss><channel><item><title>Discovered blog article</title><link>https://8.8.8.8/blog/post-1</link><description>Found automatically from HTML.</description></item></channel></rss>`;
        }
        throw new Error(`Unexpected URL: ${url}`);
      }
    }
    const http = new MockFeedHTTP(store);
    const mediumItems = await collectMedium(mediumSource, http);
    assert.equal(mediumItems.length, 1);

    const discoveredRss = await collectRSS(
      {
        ...mediumSource,
        id: "rss-discovered",
        kind: "rss",
        config: { url: "https://8.8.8.8/blog" },
      },
      http,
    );
    assert.equal(discoveredRss.length, 1);
    assert.equal(discoveredRss[0].title, "Discovered blog article");
  } finally {
    store.close();
  }
});
