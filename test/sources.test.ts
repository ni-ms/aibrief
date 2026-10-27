// Synthetic public-format fixtures. Never loaded into the reading workspace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { parseOpenReview } from "../server/sources/openreview.ts";
import { parseBluesky } from "../server/sources/bluesky.ts";
import { parseRSS } from "../server/sources/rss.ts";
import {
  isPublicAddress,
  assertPublicFeedUrl,
} from "../server/sources/safe-url.ts";
import { migrate } from "../server/storage/migrate.ts";
import { Store } from "../server/db.ts";
import { HttpClient } from "../server/http.ts";
import { Collector } from "../server/collector.ts";
test("OpenReview retains exact venue provenance and rejects unverified acceptance", () => {
  const row = {
    id: "paper1",
    pdate: 1792800000000,
    cdate: 1792000000000,
    content: {
      title: { value: "Sparse quantum codes" },
      abstract: { value: "The authors report decoder experiments." },
      venueid: { value: "NeurIPS.cc/2026/Conference" },
      venue: { value: "NeurIPS 2026" },
      authors: { value: ["A. Researcher"] },
    },
  };
  const result = parseOpenReview(
    {
      notes: [
        row,
        {
          ...row,
          id: "submitted",
          content: {
            ...row.content,
            venueid: { value: "NeurIPS.cc/2026/Conference/Submission" },
          },
        },
      ],
    },
    "NeurIPS.cc/2026/Conference",
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].metadata?.venue, "NeurIPS 2026");
  assert.equal(result[0].metadata?.publicationType, "conference");
  assert.deepEqual(result[0].metadata?.authors, ["A. Researcher"]);
  assert.ok(result[0].links[0].url.includes("forum?id=paper1"));
  assert.throws(() => parseOpenReview({ error: "challenge" }, "venue"));
});
test("RSS/Atom extracts safe text, tolerates bad entries, and retains original dates", () => {
  const xml =
    "<rss><channel><item><title>Research update</title><link>https://example.org/post</link><description>&lt;p&gt;Source evidence.&lt;/p&gt;</description><pubDate>Fri, 23 Oct 2026 00:00:00 GMT</pubDate></item><item><title>Bad</title><link>javascript:alert(1)</link></item></channel></rss>";
  const result = parseRSS(xml);
  assert.equal(result.length, 1);
  assert.equal(result[0].abstract, "Source evidence.");
  assert.equal(result[0].publishedAt, "2026-10-23T00:00:00.000Z");
  assert.equal(result[0].metadata?.publicationType, "article");
  assert.equal(
    parseRSS(
      '<feed><entry><id>id1</id><title>Atom note</title><link rel="alternate" href="https://example.org/atom"/><summary>Source abstract</summary></entry></feed>',
    )[0].abstract,
    "Source abstract",
  );
});
test("Bluesky preserves post provenance and keeps external links separate", () => {
  const post = {
    uri: "at://did:plc:test/app.bsky.feed.post/key",
    author: { did: "did:plc:test", handle: "research.example" },
    record: {
      text: "A quantum paper from our group.",
      createdAt: "2026-10-24T00:00:00Z",
    },
    embed: {
      external: {
        title: "A quantum paper",
        uri: "https://arxiv.org/abs/2610.12345",
      },
    },
  };
  const result = parseBluesky({
    feed: [{ post }, { post, reason: { $type: "repost" } }],
  });
  assert.equal(result.length, 1);
  assert.ok(result[0].canonicalUrl.includes("bsky.app"));
  assert.ok(result[0].links.some((l) => l.url.includes("arxiv.org")));
  assert.equal(result[0].metadata?.publicationType, "post");
});
test("public feed validation rejects loopback, private addresses, credentials and alternate schemes", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fd00::1",
    "fe80::1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  for (const url of [
    "http://example.com/rss",
    "https://localhost/rss",
    "https://127.0.0.1/rss",
    "https://user:password@example.org/rss",
  ])
    await assert.rejects(() => assertPublicFeedUrl(url));
});
test("additive migration retains old source content and adds metadata", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE items(id INTEGER PRIMARY KEY,group_id INTEGER,source_id TEXT,external_id TEXT,canonical_url TEXT,title TEXT,abstract TEXT,release_text TEXT,published_at TEXT,first_seen_at TEXT,last_fetched_at TEXT,content_hash TEXT,topics TEXT,kind TEXT,links TEXT); INSERT INTO items(id,title) VALUES(1,'Original paper');",
  );
  migrate(db);
  const row = db.prepare("SELECT title,metadata FROM items").get() as {
    title: string;
    metadata: string;
  };
  assert.equal(row.title, "Original paper");
  assert.equal(row.metadata, "{}");
  migrate(db);
  assert.equal(
    (db.prepare("SELECT COUNT(*) AS n FROM items").get() as { n: number }).n,
    1,
  );
  db.close();
});
test("OpenReview verification failure does not erase content or last successful sync", async () => {
  const store = new Store(":memory:");
  try {
    for (const source of store.sources())
      store.saveSource({ ...source, enabled: false });
    const source = {
      id: "neurips-test",
      kind: "openreview" as const,
      name: "NeurIPS",
      enabled: true,
      config: { venue: "NeurIPS.cc/2026/Conference" },
      lastSuccess: "2026-01-01T00:00:00Z",
      lastAttempt: null,
      error: null,
    };
    store.saveSource(source);
    store.ingest(source, [
      {
        externalId: "old",
        canonicalUrl: "https://openreview.net/forum?id=old",
        title: "Previously collected paper",
        links: [],
        abstract: "Existing evidence.",
        releaseText: "",
        publishedAt: "2026-01-01T00:00:00Z",
        topics: ["AI & machine learning"],
        kind: "research",
      },
    ]);
    const http = new HttpClient(
      store,
      (async () =>
        new Response(JSON.stringify({ name: "ChallengeRequiredError" }), {
          status: 403,
        })) as typeof fetch,
    );
    await new Collector(store, http).refresh(true);
    const current = store.sources().find((s) => s.id === source.id)!;
    assert.match(current.error || "", /requires verification/);
    assert.equal(current.lastSuccess, source.lastSuccess);
    assert.equal(store.items().length, 1);
  } finally {
    store.close();
  }
});
test("focused arXiv queries stay scoped to selected subjects and quote phrases as data", async () => {
  const { buildArxivQuery } = await import("../server/sources/arxiv.ts");
  const query = buildArxivQuery(["quant-ph"], ["quantum error correction"]);
  assert.equal(
    query,
    '(cat:quant-ph) AND (ti:"quantum error correction" OR abs:"quantum error correction")',
  );
  assert.ok(!buildArxivQuery(["cs.AI"], ['"quoted" \\ text']).includes("\\"));
});
