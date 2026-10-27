// Synthetic fixtures live ONLY in tests. The running app is seeded exclusively from real sources.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/db.ts";
import { parseArxiv, parseHN, parseReleases } from "../server/adapters.ts";
import { normalizeUrl } from "../server/normalize.ts";
import { HttpClient } from "../server/http.ts";
import { Collector } from "../server/collector.ts";
import { SummarySchema } from "../shared/summary.ts";
import { deriveTerms, matches } from "../shared/interests.ts";
const rss = `<rss><channel><pubDate>Fri, 23 Oct 2026 00:00:00 -0400</pubDate><item><title>Quantum error correction</title><link>https://arxiv.org/abs/2610.12345v2</link><description>&lt;p&gt;Abstract: We report a bounded experiment.&lt;/p&gt;</description><category>quant-ph</category></item></channel></rss>`;
test("RSS and Atom parsing preserve source text, dates and arXiv identity", () => {
  const [item] = parseArxiv(rss);
  assert.equal(item.externalId, "2610.12345");
  assert.equal(item.publishedAt, "2026-10-23T04:00:00.000Z");
  assert.ok(item.topics.includes("Quantum computing"));
  assert.equal(item.abstract, "Abstract: We report a bounded experiment.");
  const [atom] = parseArxiv(
    `<feed><entry><id>http://arxiv.org/abs/2610.99999v1</id><title>A paper</title><published>2026-10-20T12:00:00Z</published><summary>Source abstract</summary><link href="http://arxiv.org/abs/2610.99999v1" rel="alternate"/></entry></feed>`,
  );
  assert.equal(atom.abstract, "Source abstract");
  assert.equal(atom.externalId, "2610.99999");
  assert.throws(() => parseArxiv("<html>failure</html>"), /Unexpected/);
  assert.deepEqual(
    parseArxiv("<rss><channel><title>Weekend</title></channel></rss>"),
    [],
  );
});
test("HN filtering uses word boundaries, preserves discussion, and rejects dead stories", () => {
  assert.equal(
    parseHN({ type: "story", id: 1, time: 1, title: "Chair restoration" }, [
      "ai",
    ]),
    null,
  );
  assert.equal(
    parseHN({ type: "story", dead: true, id: 1, time: 1, title: "AI" }, ["ai"]),
    null,
  );
  const item = parseHN(
    {
      type: "story",
      id: 2,
      time: 1,
      title: "Quantum computing",
      url: "https://arxiv.org/pdf/2610.12345v1.pdf",
      text: "<script>bad()</script><p>Source &amp; evidence</p>",
    },
    ["quantum"],
  )!;
  assert.equal(item.kind, "research");
  assert.equal(item.abstract, "Source & evidence");
  assert.ok(item.links[0].url.includes("id=2"));
});
test("GitHub releases use immutable release IDs and keep note text separate", () => {
  const [item] = parseReleases(
    [
      {
        id: 42,
        tag_name: "v1",
        html_url: "https://github.com/a/b/releases/tag/v1",
        body: "<b>Release</b> text",
        published_at: "2026-10-23T00:00:00Z",
      },
    ],
    "a/b",
  );
  assert.equal(item.externalId, "42");
  assert.equal(item.abstract, "");
  assert.equal(item.releaseText, "Release text");
  assert.throws(() => parseReleases({ message: "rate limit" }, "a/b"));
});
test("URL normalization is conservative and strips tracking and arXiv versions", () => {
  assert.equal(
    normalizeUrl("http://www.arxiv.org/pdf/quant-ph/0701234v2.pdf"),
    "https://arxiv.org/abs/quant-ph/0701234",
  );
  assert.equal(
    normalizeUrl("https://example.com/paper?utm_source=hn&b=2&a=1#ref"),
    "https://example.com/paper?a=1&b=2",
  );
  assert.notEqual(
    normalizeUrl("https://example.com/a"),
    normalizeUrl("https://example.com/b"),
  );
  assert.throws(() => normalizeUrl("javascript:alert(1)"));
});
test("idempotent ingestion groups exact paper IDs, preserves all links and first-seen timestamps", () => {
  const store = new Store(":memory:");
  try {
    const source = store.sources()[0];
    const items = parseArxiv(rss);
    assert.equal(store.ingest(source, items, "2026-10-24T00:00:00Z"), 1);
    assert.equal(store.ingest(source, items, "2026-10-25T00:00:00Z"), 0);
    const hn = store.sources().find((s) => s.kind === "hn")!;
    const linked = parseHN(
      {
        id: 22,
        type: "story",
        time: 1,
        title: "Same development",
        url: "http://arxiv.org/pdf/2610.12345v3",
      },
      [],
    )!;
    store.ingest(hn, [linked]);
    const stories = store.stories();
    assert.equal(stories.length, 1);
    assert.equal(stories[0].sources.length, 2);
    assert.ok(stories[0].links.some((l) => l.label === "HN discussion"));
    assert.equal(stories[0].firstSeenAt, "2026-10-24T00:00:00Z");
    assert.equal(
      store.items().find((i) => i.sourceId === source.id)!.lastFetchedAt,
      "2026-10-25T00:00:00Z",
    );
    store.ingest(source, [
      {
        ...items[0],
        externalId: "different",
        canonicalUrl: "https://arxiv.org/abs/2610.12346",
      },
    ]);
    assert.equal(store.stories().length, 2);
  } finally {
    store.close();
  }
});
test("SQLite survives reopening with shared content, personal state and feedback intact", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldnotes-test-"));
  const path = join(directory, "test.sqlite");
  let store = new Store(path);
  try {
    store.ingest(store.sources()[0], parseArxiv(rss));
    const story = store.stories()[0];
    store.setState(story.groupId, { read: true, saved: true, feedback: 1 });
    store.setState(story.groupId, { feedback: 1 });
    assert.equal(store.profile().weights["Quantum computing"], 1);
    store.close();
    store = new Store(path);
    assert.equal(store.stories()[0].read, true);
    assert.equal(store.stories()[0].saved, true);
    assert.equal(store.stories()[0].feedback, 1);
    store.setState(story.groupId, { feedback: -1 });
    assert.equal(store.profile().weights["Quantum computing"], -1);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("failed collection preserves content and last success; errors are visible", async () => {
  const store = new Store(":memory:");
  try {
    for (const s of store.sources())
      store.saveSource({
        ...s,
        enabled: s.kind === "github" && s.id === "github-webllm",
      });
    const source = store.sources().find((s) => s.id === "github-webllm")!;
    source.lastSuccess = "2026-01-01T00:00:00Z";
    store.saveSource(source);
    store.ingest(
      source,
      parseReleases(
        [
          {
            id: 42,
            tag_name: "v1",
            html_url: "https://github.com/mlc-ai/web-llm/releases/tag/v1",
            body: "Existing data",
          },
        ],
        "mlc-ai/web-llm",
      ),
    );
    let calls = 0;
    const http = new HttpClient(store, (async () => {
      calls++;
      return new Response("limit", {
        status: 429,
        headers: { "Retry-After": "900" },
      });
    }) as typeof fetch);
    await new Collector(store, http).refresh(true);
    const after = store.sources().find((s) => s.id === source.id)!;
    assert.ok(after.error?.includes("429"));
    assert.equal(after.lastSuccess, source.lastSuccess);
    assert.equal(store.stories().length, 1);
    assert.equal(calls, 1);
    await assert.rejects(
      () => http.text("https://api.github.com/another"),
      /rate limited/,
    );
    assert.equal(calls, 1);
  } finally {
    store.close();
  }
});
test("conditional HTTP cache reuses 304 response without overwriting source content", async () => {
  const store = new Store(":memory:");
  try {
    let calls = 0;
    const http = new HttpClient(store, (async (_url, options) => {
      calls++;
      if (calls === 1)
        return new Response("payload", { headers: { etag: "test-etag" } });
      assert.equal(
        (options?.headers as Record<string, string>)["If-None-Match"],
        "test-etag",
      );
      return new Response(null, { status: 304 });
    }) as typeof fetch);
    assert.equal(await http.text("https://example.com/feed"), "payload");
    assert.equal(await http.text("https://example.com/feed"), "payload");
    assert.equal(calls, 2);
  } finally {
    store.close();
  }
});
test("source-content changes invalidate summary cache keys while first-seen stays fixed", () => {
  const store = new Store(":memory:");
  try {
    const source = store.sources()[0];
    const item = parseArxiv(rss)[0];
    store.ingest(source, [item], "2026-10-23T00:00:00Z");
    const before = store.items()[0];
    store.ingest(source, [{ ...item, abstract: "Updated author evidence" }]);
    assert.notEqual(store.items()[0].contentHash, before.contentHash);
    assert.equal(store.items()[0].firstSeenAt, before.firstSeenAt);
  } finally {
    store.close();
  }
});
test("summary validation rejects malformed/URL-bearing extra fields; interests generalize beyond AI", () => {
  assert.equal(
    SummarySchema.safeParse({
      whatChanged: "x",
      whyItMatters: "y",
      evidence: "z",
      topics: ["Quantum"],
      url: "https://invented.test",
    }).success,
    false,
  );
  assert.equal(
    SummarySchema.safeParse({
      whatChanged: "x",
      whyItMatters: "y",
      evidence: "z",
      topics: ["Quantum"],
    }).success,
    true,
  );
  assert.ok(
    deriveTerms("Follow quantum computing and superconductors").includes(
      "superconductors",
    ),
  );
  assert.ok(deriveTerms("AI").includes("llm"));
  assert.equal(matches("chair", "ai"), false);
});
test("fresh cached payloads keep their actual fetch timestamp; no hidden network call", async () => {
  const store = new Store(":memory:");
  try {
    let calls = 0;
    const http = new HttpClient(store, (async () => {
      calls++;
      return new Response("payload");
    }) as typeof fetch);
    const url = "https://example.com/items";
    await http.text(url);
    const timestamp = http.checkedAt(url);
    await http.text(url, 60000);
    assert.equal(calls, 1);
    assert.equal(http.checkedAt(url), timestamp);
    const item = { ...parseArxiv(rss)[0], fetchedAt: "2026-10-22T00:00:00Z" };
    store.ingest(store.sources()[0], [item], "2026-10-25T00:00:00Z");
    assert.equal(store.items()[0].lastFetchedAt, "2026-10-22T00:00:00Z");
    assert.equal(store.items()[0].firstSeenAt, "2026-10-25T00:00:00Z");
  } finally {
    store.close();
  }
});
test("arXiv requests are serial and spaced by at least three seconds", async () => {
  const store = new Store(":memory:");
  try {
    const starts: number[] = [];
    const http = new HttpClient(store, (async () => {
      starts.push(Date.now());
      return new Response("<rss/>");
    }) as typeof fetch);
    await http.text("https://rss.arxiv.org/rss/cs.AI");
    await http.text(
      "https://export.arxiv.org/api/query?search_query=cat:quant-ph",
    );
    assert.equal(starts.length, 2);
    assert.ok(starts[1] - starts[0] >= 3000);
  } finally {
    store.close();
  }
});
test("unsupported GPU fails before any worker or model download is created", async () => {
  const { checkDevice, LocalAI } = await import("../src/local-ai.ts");
  await assert.rejects(
    () => checkDevice("Qwen2.5-0.5B-Instruct-q4f16_1-MLC"),
    /WebGPU is unavailable/,
  );
  const ai = new LocalAI();
  await assert.rejects(
    () => ai.enable("Qwen2.5-0.5B-Instruct-q4f16_1-MLC", () => {}),
    /WebGPU is unavailable/,
  );
  assert.equal(ai.worker, undefined);
  assert.equal(ai.engine, undefined);
});
test("a finite briefing shrinks after read or dismiss instead of adding an eleventh item", async () => {
  const { selectBriefing } = await import("../shared/briefing.ts");
  const store = new Store(":memory:");
  try {
    const source = store.sources()[0];
    const template = parseArxiv(rss)[0];
    store.ingest(
      source,
      Array.from({ length: 12 }, (_, i) => ({
        ...template,
        externalId: String(i),
        canonicalUrl: `https://example.org/paper/${i}`,
      })),
      "2026-10-25T00:00:00Z",
    );
    const stories = store.stories();
    const now = Date.parse("2026-10-25T01:00:00Z");
    const initial = selectBriefing(stories, null, now);
    assert.equal(initial.length, 10);
    const first = initial[0].groupId;
    const second = initial[1].groupId;
    const handled = stories.map((s) => ({
      ...s,
      read: s.groupId === first,
      dismissed: s.groupId === second,
    }));
    const remaining = selectBriefing(handled, null, now);
    assert.equal(remaining.length, 8);
    assert.ok(
      remaining.every((s) => initial.some((i) => i.groupId === s.groupId)),
    );
    assert.equal(
      selectBriefing(stories, "2026-10-26T00:00:00Z", now).length,
      0,
    );
  } finally {
    store.close();
  }
});
