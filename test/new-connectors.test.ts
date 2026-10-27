import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHFPapers } from "../server/sources/hf-papers.ts";
import {
  normalizeSubstack,
  substackFeedUrl,
  substackDisplayName,
} from "../shared/substack.ts";
import { parseSubstackFeed } from "../server/sources/substack.ts";
import { parseLobsters } from "../server/sources/lobsters.ts";
import { parseHN } from "../server/sources/hackernews.ts";
import { Store } from "../server/db.ts";
import { HttpClient } from "../server/http.ts";
import { TopicService } from "../server/topics.ts";

test("Hugging Face Daily Papers parser normalizes to arXiv identity and preserves community curation", () => {
  const fixture = [
    {
      paper: {
        id: "2610.99999v2",
        title: "Test Hugging Face Paper",
        summary: "This paper reports transformer scaling experiments.",
        authors: [{ name: "Alice Researcher" }, { name: "Bob Engineer" }],
        publishedAt: "2026-10-25T12:00:00Z",
        upvotes: 42,
        githubRepo: "huggingface/transformers",
      },
    },
  ];

  const items = parseHFPapers(fixture);
  assert.equal(items.length, 1);
  assert.equal(items[0].externalId, "2610.99999");
  assert.equal(items[0].canonicalUrl, "https://arxiv.org/abs/2610.99999");
  assert.equal(items[0].title, "Test Hugging Face Paper");
  assert.equal(items[0].abstract, "This paper reports transformer scaling experiments.");
  assert.deepEqual(items[0].metadata?.authors, ["Alice Researcher", "Bob Engineer"]);
  assert.equal(items[0].metadata?.publicationType, "preprint");
  assert.match(items[0].metadata?.comment || "", /42 Hugging Face/);

  // Links should include both HF paper page and GitHub repository
  assert.equal(items[0].links.length, 2);
  assert.equal(items[0].links[0].label, "Hugging Face paper page");
  assert.equal(items[0].links[0].url, "https://huggingface.co/papers/2610.99999");
  assert.equal(items[0].links[1].label, "GitHub repository");
  assert.equal(items[0].links[1].url, "https://github.com/huggingface/transformers");

  // Rejects invalid input
  assert.throws(() => parseHFPapers("not array" as any), /Expected array/);
});

test("Substack normalization supports handles, subdomains and custom URLs, rejecting single-post paths", () => {
  assert.equal(normalizeSubstack("@importai"), "importai");
  assert.equal(normalizeSubstack("importai"), "importai");
  assert.equal(normalizeSubstack("https://importai.substack.com"), "importai");
  assert.equal(normalizeSubstack("https://importai.substack.com/feed"), "importai");
  assert.equal(
    normalizeSubstack("https://newsletter.pragmaticengineer.com"),
    "https://newsletter.pragmaticengineer.com",
  );

  assert.equal(
    substackFeedUrl("importai"),
    "https://importai.substack.com/feed",
  );
  assert.equal(
    substackFeedUrl("https://newsletter.pragmaticengineer.com"),
    "https://newsletter.pragmaticengineer.com/feed",
  );

  assert.equal(substackDisplayName("importai"), "Substack · importai");
  assert.equal(
    substackDisplayName("https://newsletter.pragmaticengineer.com"),
    "Substack · newsletter.pragmaticengineer.com",
  );

  // Single-post paths must be rejected
  assert.throws(
    () => normalizeSubstack("https://importai.substack.com/p/frontier-models"),
    /individual post link/,
  );
  // Insecure or empty paths rejected
  assert.throws(() => normalizeSubstack(""), /Use a Substack/);
  assert.throws(() => normalizeSubstack("http://insecure.substack.com"), /HTTPS/);
});

test("Substack feed parser extracts clean excerpts, authors, and linked research", () => {
  const xml = `
    <rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
      <channel>
        <title>Import AI</title>
        <item>
          <title>Import AI 400: Scaling frontiers</title>
          <link>https://importai.substack.com/p/import-ai-400</link>
          <guid>https://importai.substack.com/p/import-ai-400</guid>
          <dc:creator>Jack Clark</dc:creator>
          <pubDate>Mon, 26 Oct 2026 09:00:00 GMT</pubDate>
          <content:encoded><![CDATA[
            <p>Welcome to issue 400. Today we review research from <a href="https://arxiv.org/abs/2610.12345">arXiv:2610.12345</a> and code at <a href="https://github.com/mlc-ai/web-llm">WebLLM</a>.</p>
            <div class="subscription-widget-wrap"><button>Subscribe</button></div>
          ]]></content:encoded>
        </item>
      </channel>
    </rss>
  `;

  const items = parseSubstackFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Import AI 400: Scaling frontiers");
  assert.equal(items[0].metadata?.publicationType, "article");
  assert.deepEqual(items[0].metadata?.authors, ["Jack Clark"]);
  assert.ok(!items[0].abstract.includes("Subscribe"), "Should strip subscription widgets");

  // Should have extracted linked research
  assert.ok(items[0].links.some((l) => l.url === "https://arxiv.org/abs/2610.12345"));
  assert.ok(items[0].links.some((l) => l.url === "https://github.com/mlc-ai/web-llm"));
});

test("Lobste.rs parser extracts technical stories, discussion links and tags", () => {
  const fixture = [
    {
      short_id: "abc",
      title: "Show Lobsters: A new language",
      url: "https://github.com/developer/lang",
      score: 55,
      comments_url: "https://lobste.rs/s/abc/show_lobsters",
      description: "A fast language implemented in Rust.",
      tags: ["plt", "release"],
      created_at: "2026-10-25T10:00:00Z",
    },
    {
      short_id: "def",
      title: "Text Discussion Post",
      url: "",
      score: 20,
      comments_url: "https://lobste.rs/s/def/discussion",
      description: "What are your favorite papers?",
      tags: ["ai"],
      created_at: "2026-10-25T11:00:00Z",
    },
  ];

  const items = parseLobsters(fixture);
  assert.equal(items.length, 2);

  // GitHub tool
  assert.equal(items[0].externalId, "lobsters:abc");
  assert.equal(items[0].kind, "tools");
  assert.equal(items[0].canonicalUrl, "https://github.com/developer/lang");
  assert.ok(items[0].links.some((l) => l.label === "Lobste.rs discussion"));
  assert.ok(items[0].links.some((l) => l.label === "GitHub repository"));

  // Discussion
  assert.equal(items[1].externalId, "lobsters:def");
  assert.equal(items[1].kind, "news");
  assert.equal(items[1].canonicalUrl, "https://lobste.rs/s/def/discussion");
});

test("smarter Hacker News ingestion keeps high-signal stories regardless of initial keyword terms", () => {
  // Story with score >= 100 is kept even without matching terms
  const highScoring = parseHN(
    {
      id: 991,
      type: "story",
      time: 1792800000,
      title: "Some Brand New Project Name",
      url: "https://example.com/project",
      score: 142,
    },
    ["quantum", "neuro"],
  );
  assert.ok(highScoring, "Story with score >= 100 should be kept");
  assert.equal(highScoring?.externalId, "991");

  // Story linking to GitHub is kept even without matching terms
  const githubStory = parseHN(
    {
      id: 992,
      type: "story",
      time: 1792800000,
      title: "Unrecognized Release",
      url: "https://github.com/cool-lab/new-tool",
      score: 15,
    },
    ["quantum", "neuro"],
  );
  assert.ok(githubStory, "Story linking to github.com should be kept");
  assert.equal(githubStory?.kind, "tools");

  // Low scoring non-technical story without terms is still dropped
  const lowNoise = parseHN(
    {
      id: 993,
      type: "story",
      time: 1792800000,
      title: "Woodworking techniques",
      url: "https://example.com/wood",
      score: 12,
    },
    ["quantum", "neuro"],
  );
  assert.equal(lowNoise, null, "Unrelated low-score story should be dropped");
});

test("multi-provider upstream discovery queries live endpoints across providers", async () => {
  const store = new Store(":memory:");
  try {
    const urlsCalled: string[] = [];
    class MockDiscoveryHttp extends HttpClient {
      override async text(url: string) {
        urlsCalled.push(url);
        return `<feed><entry><id>https://arxiv.org/abs/2610.12345v1</id><title>Paper</title><published>2026-10-25T00:00:00Z</published><summary>Abstract</summary><category term="cs.AI"/></entry></feed>`;
      }
      override async json(url: string) {
        urlsCalled.push(url);
        if (url.includes("algolia.com")) {
          return {
            hits: [
              {
                objectID: "888",
                title: "HN Discussion on Local LLMs",
                url: "https://example.com/article",
                created_at: "2026-10-25T00:00:00Z",
              },
            ],
          };
        }
        if (url.includes("huggingface.co")) {
          return [
            {
              id: "2610.77777",
              title: "HF Paper",
              summary: "Abstract",
              authors: [{ name: "HF Author" }],
            },
          ];
        }
        if (url.includes("api.github.com")) {
          return {
            items: [
              {
                id: 12345,
                full_name: "mlc-ai/web-llm",
                html_url: "https://github.com/mlc-ai/web-llm",
                description: "WebLLM tool",
                updated_at: "2026-10-25T00:00:00Z",
              },
            ],
          };
        }
        return [];
      }
    }

    const service = new TopicService(store, new MockDiscoveryHttp(store));
    const providers = service.providers();
    assert.ok(providers.some((p) => p.id === "arxiv" && p.capability === "upstream"));
    assert.ok(providers.some((p) => p.id === "hn-algolia" && p.capability === "upstream"));
    assert.ok(providers.some((p) => p.id === "hf-papers" && p.capability === "upstream"));
    assert.ok(providers.some((p) => p.id === "github-search" && p.capability === "upstream"));

    const discovery = await service.discover("web llm", [
      "arxiv",
      "hn-algolia",
      "hf-papers",
      "github-search",
    ]);

    assert.equal(discovery.results.length, 4);
    assert.ok(discovery.results.some((r) => r.providerId === "arxiv"));
    assert.ok(discovery.results.some((r) => r.providerId === "hn-algolia"));
    assert.ok(discovery.results.some((r) => r.providerId === "hf-papers"));
    assert.ok(discovery.results.some((r) => r.providerId === "github-search"));
  } finally {
    store.close();
  }
});
