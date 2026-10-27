// Synthetic Reddit fixtures; never insert these into the user's reading library.
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { normalizeSubreddit } from "../shared/reddit.ts";
import { summaryScope } from "../shared/summary.ts";
import { Store } from "../server/db.ts";
import { HttpClient } from "../server/http.ts";
import { Collector } from "../server/collector.ts";
import { createApp } from "../server/app.ts";
import {
  collectReddit,
  parseRedditRSS,
  parseRedditListing,
  redditConnection,
  REDDIT_RSS_END,
} from "../server/sources/reddit.ts";
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>t3_abc123</id><title>TEST FIXTURE: Quantum tooling</title><author><name>/u/researcher</name></author><link href="https://www.reddit.com/r/QuantumComputing/comments/abc123/quantum_tooling/"/><published>2026-10-24T13:00:00Z</published><content type="html">&lt;div class="md"&gt;&lt;p&gt;A bounded quantum result.&lt;/p&gt;&lt;/div&gt; submitted by &lt;a href="https://www.reddit.com/user/researcher"&gt;/u/researcher&lt;/a&gt; &lt;a href="https://arxiv.org/abs/2610.12345v1"&gt;[link]&lt;/a&gt; &lt;a href="https://www.reddit.com/r/QuantumComputing/comments/abc123/quantum_tooling/"&gt;[comments]&lt;/a&gt;</content></entry></feed>`;
const listing = {
  kind: "Listing",
  data: {
    children: [
      {
        kind: "t3",
        data: {
          id: "abc123",
          title: "TEST FIXTURE: Quantum tooling",
          selftext: "A bounded quantum result.",
          author: "researcher",
          created_utc: 1792846800,
          is_self: false,
          url: "https://arxiv.org/abs/2610.12345v1",
        },
      },
    ],
  },
};
const source = {
  id: "reddit-quantum",
  kind: "reddit" as const,
  name: "Reddit · r/QuantumComputing",
  resourceId: "reddit",
  config: { subreddit: "quantumcomputing" },
  enabled: true,
  lastSuccess: null,
  lastAttempt: null,
  error: null,
};

test("subreddit inputs normalize names and public community URLs and reject unsafe or ambiguous paths", () => {
  for (const value of [
    "MachineLearning",
    "r/MachineLearning",
    "/r/MachineLearning/",
    "https://www.reddit.com/r/MachineLearning/",
  ])
    assert.equal(normalizeSubreddit(value), "machinelearning");
  for (const value of [
    "",
    "r/foo+bar",
    "../foo",
    "https://evil.com/r/foo",
    "https://reddit.com.evil.com/r/foo",
    "http://reddit.com/r/foo",
    "https://user:pass@reddit.com/r/foo",
    "https://reddit.com/r/foo?x=y",
    "https://reddit.com/r/foo/comments/abc",
    "https://reddit.com:8443/r/foo",
  ])
    assert.throws(() => normalizeSubreddit(value), value);
});

test("Reddit Atom preserves discussion provenance and dates and excludes footer boilerplate", () => {
  const item = parseRedditRSS(atom)[0];
  assert.equal(item.externalId, "t3_abc123");
  assert.equal(item.canonicalUrl, "https://reddit.com/comments/abc123");
  assert.equal(item.abstract, "A bounded quantum result.");
  assert.equal(item.metadata?.publicationType, "post");
  assert.equal(item.publishedAt, "2026-10-24T13:00:00.000Z");
  assert.deepEqual(item.metadata?.authors, ["/u/researcher"]);
  assert.deepEqual(
    item.links.map((l) => l.label),
    ["Reddit discussion", "Linked source"],
  );
  assert.equal(item.links[1].url, "https://arxiv.org/abs/2610.12345");
  assert.equal(summaryScope({ ...item, sourceKind: "reddit" }), "Post excerpt");
  assert.throws(
    () => parseRedditRSS("<html>Access denied</html>"),
    /Expected a Reddit/,
  );
  assert.throws(
    () => parseRedditRSS("<feed><entry><id>bad</id></entry></feed>"),
    /no recognizable/,
  );
  const badLink = atom.replace(
    "https://arxiv.org/abs/2610.12345v1",
    "javascript:alert(1)",
  );
  assert.equal(parseRedditRSS(badLink)[0].links.length, 1);
  assert.throws(
    () =>
      parseRedditRSS(
        atom.replace(
          "www.reddit.com/r/QuantumComputing/comments/abc123",
          "evil.com/comments/abc123",
        ),
      ),
    /no recognizable/,
  );
});

test("live-format Reddit wrappers with double-escaped spaces omit the author footer while retaining source text and author metadata", () => {
  for (const sourceText of ["Results submitted by our collaborators.", ""]) {
    // Matches the SC_OFF/SC_ON comments, encoded &#32; spaces, spans and line break observed in a real Atom response.
    const html = `<!-- SC_OFF --><div class="md"><p>${sourceText}</p></div><!-- SC_ON --> &#32; submitted by &#32; <a href="https://www.reddit.com/user/researcher"> /u/researcher </a> <br/> <span><a href="https://arxiv.org/abs/2610.12345v1">[link]</a></span> &#32; <span><a href="https://www.reddit.com/r/QuantumComputing/comments/abc123/quantum_tooling/">[comments]</a></span>`;
    const encoded = html
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
    const fixture = atom.replace(
      /<content type="html">[\s\S]*?<\/content>/,
      `<content type="html">${encoded}</content>`,
    );
    const item = parseRedditRSS(fixture)[0];
    assert.equal(item.abstract, sourceText);
    assert.deepEqual(item.metadata?.authors, ["/u/researcher"]);
    assert.equal(item.links[1].url, "https://arxiv.org/abs/2610.12345");
  }
});

test("Reddit OAuth listings share RSS identity, bound results and never merge posts into linked papers", () => {
  const item = parseRedditListing(listing)[0];
  assert.equal(item.canonicalUrl, parseRedditRSS(atom)[0].canonicalUrl);
  assert.equal(item.externalId, "t3_abc123");
  assert.equal(item.abstract, "A bounded quantum result.");
  assert.equal(item.links[1].url, "https://arxiv.org/abs/2610.12345");
  assert.throws(() => parseRedditListing({ error: 403 }));
  assert.equal(
    parseRedditListing({
      kind: "Listing",
      data: { children: Array(70).fill(listing.data.children[0]) },
    }).length,
    40,
  );
  assert.equal(
    parseRedditListing({
      kind: "Listing",
      data: {
        children: [
          {
            kind: "t3",
            data: { ...listing.data.children[0].data, over_18: true },
          },
        ],
      },
    }).length,
    0,
  );
});

test("collector uses approved OAuth token only on Reddit, never persists it, and retains prior content on token rejection", async () => {
  const oldToken = process.env.REDDIT_ACCESS_TOKEN;
  const store = new Store(":memory:");
  try {
    process.env.REDDIT_ACCESS_TOKEN = "TEST-FIXTURE-SECRET";
    for (const initial of store.sources())
      store.saveSource({ ...initial, enabled: false });
    store.saveSource(source);
    let reject = false;
    const requests: { url: string; authorization: string; redirect: string }[] =
      [];
    const http = new HttpClient(store, (async (
      url: string | URL | Request,
      options: RequestInit,
    ) => {
      requests.push({
        url: String(url),
        authorization: (options.headers as Record<string, string>)
          .Authorization,
        redirect: options.redirect!,
      });
      return reject
        ? new Response("Unauthorized", { status: 401 })
        : new Response(JSON.stringify(listing));
    }) as typeof fetch);
    const collector = new Collector(store, http);
    await collector.refresh(true);
    assert.equal(store.items().length, 1);
    assert.equal(
      requests[0].url,
      "https://oauth.reddit.com/r/quantumcomputing/new?limit=40&raw_json=1",
    );
    assert.equal(requests[0].authorization, "Bearer TEST-FIXTURE-SECRET");
    assert.equal(requests[0].redirect, "error");
    const success = store
      .sources()
      .find((s) => s.id === source.id)!.lastSuccess;
    assert.ok(success);
    assert.ok(!JSON.stringify(store.sources()).includes("TEST-FIXTURE-SECRET"));
    assert.ok(
      !JSON.stringify(
        store.db.prepare("SELECT * FROM http_cache").all(),
      ).includes("TEST-FIXTURE-SECRET"),
    );
    reject = true;
    store.saveSource({
      ...store.sources().find((s) => s.id === source.id)!,
      lastAttempt: "2020-01-01T00:00:00Z",
    });
    await collector.refresh(true);
    const current = store.sources().find((s) => s.id === source.id)!;
    assert.match(current.error!, /token expired or was rejected/i);
    assert.equal(current.lastSuccess, success);
    assert.equal(store.items().length, 1);
    assert.equal(requests.length, 2);
  } finally {
    if (oldToken === undefined) delete process.env.REDDIT_ACCESS_TOKEN;
    else process.env.REDDIT_ACCESS_TOKEN = oldToken;
    store.close();
  }
});

test("Reddit rate-limit reset is a duration and prevents requests until the full window ends", async () => {
  const store = new Store(":memory:");
  let calls = 0;
  try {
    const http = new HttpClient(store, (async () => {
      calls++;
      return new Response("Rate limited", {
        status: 429,
        headers: { "x-ratelimit-reset": "3600" },
      });
    }) as typeof fetch);
    const before = Date.now();
    await assert.rejects(
      () => http.json("https://oauth.reddit.com/r/quantumcomputing/new"),
      /HTTP 429/,
    );
    const until = Number(store.meta("backoff:oauth.reddit.com"));
    assert.ok(until >= before + 3_600_000);
    assert.ok(until <= Date.now() + 3_600_000);
    await assert.rejects(
      () => http.json("https://oauth.reddit.com/r/quantumcomputing/new"),
      /rate limited/,
    );
    assert.equal(calls, 1);
  } finally {
    store.close();
  }
});

test("RSS without credentials is temporary and fails explicitly after Reddit retirement", async () => {
  const oldToken = process.env.REDDIT_ACCESS_TOKEN;
  const oldNow = Date.now;
  const store = new Store(":memory:");
  try {
    delete process.env.REDDIT_ACCESS_TOKEN;
    let called = false;
    class FeedHTTP extends HttpClient {
      override async text(url: string, _ttl = 0, publicFeed = false) {
        assert.equal(publicFeed, true);
        assert.equal(new URL(url).hostname, "www.reddit.com");
        called = true;
        return atom;
      }
    }
    const http = new FeedHTTP(store);
    Date.now = () => REDDIT_RSS_END - 1;
    assert.equal((await collectReddit(source, http)).length, 1);
    assert.equal(called, true);
    called = false;
    Date.now = () => REDDIT_RSS_END;
    await assert.rejects(
      () => collectReddit(source, http),
      /ended public RSS support/,
    );
    assert.equal(called, false);
    assert.equal(redditConnection().connectionLabel, "API setup required");
    assert.match(redditConnection().caveat, /November 13, 2026/);
  } finally {
    Date.now = oldNow;
    if (oldToken === undefined) delete process.env.REDDIT_ACCESS_TOKEN;
    else process.env.REDDIT_ACCESS_TOKEN = oldToken;
    store.close();
  }
});

test("Reddit source API validates and persists community input and appears in collected discovery providers", async () => {
  const store = new Store(":memory:");
  const collector = new Collector(store);
  const server = createApp(store, collector).listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const root = `http://127.0.0.1:${port}/api`;
  try {
    const resources = (await (
      await fetch(`${root}/resources`)
    ).json()) as any[];
    const reddit = resources.find((r) => r.id === "reddit");
    assert.equal(reddit.field, "subreddit");
    assert.ok(reddit.caveat.includes("2026") || reddit.caveat.includes("2027"));
    for (const [input, expected] of [
      ["https://www.reddit.com/r/MachineLearning/", 200],
      ["../private", 400],
      [undefined, 400],
    ] as const) {
      const response = await fetch(`${root}/sources/reddit-api-fixture`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...source,
          id: "reddit-api-fixture",
          enabled: false,
          config: { subreddit: input },
        }),
      });
      assert.equal(response.status, expected);
    }
    const saved = store.sources().find((s) => s.id === "reddit-api-fixture")!;
    assert.equal(saved.config.subreddit, "machinelearning");
    assert.ok(
      collector.topics
        .providers()
        .some((p) => p.id === saved.id && p.capability === "collected"),
    );
    store.saveSource({
      ...saved,
      enabled: true,
      lastSuccess: "2026-10-24T13:00:00Z",
    });
    store.ingest(saved, parseRedditRSS(atom));
    const discovery = await collector.topics.discover("quantum", [saved.id]);
    assert.equal(discovery.results[0].origin, "collected");
    assert.equal(
      discovery.results[0].canonicalUrl,
      "https://reddit.com/comments/abc123",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
