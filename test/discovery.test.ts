// Synthetic public-format fixtures; no network or production database writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DISCOVERY_DIRECTORIES,
  discoveryDirectory,
} from "../shared/discovery-sources.ts";
import { detectSmartSource, normalizeFeedUrl } from "../shared/feeds.ts";
import { parseRSS } from "../server/sources/rss.ts";
import { RESOURCES } from "../server/resources.ts";
import { summaryScope } from "../shared/summary.ts";
import { feedbackFormUrl } from "../src/lib/project-config.ts";
import { googleFormUrl } from "../shared/feedback.ts";
import { Store } from "../server/db.ts";
import { preferenceRoutes } from "../server/routes/preferences.ts";

test("directory names, homepages and official feeds resolve to the same supported subscription", () => {
  for (const site of DISCOVERY_DIRECTORIES.filter((entry) => entry.feedUrl)) {
    for (const input of [site.name, site.website, site.feedUrl!]) {
      const detected = detectSmartSource(input);
      assert.equal(detected.resourceId, site.id);
      assert.equal(detected.kind, "rss");
      assert.equal(detected.config.url, site.feedUrl);
    }
    assert.equal(normalizeFeedUrl(site.website), site.feedUrl);
    assert.equal(normalizeFeedUrl(site.feedUrl!), site.feedUrl);
  }
});

test("unsupported directories have explanations and cannot create pretend subscriptions", () => {
  assert.equal(DISCOVERY_DIRECTORIES.length, 11);
  const connected = RESOURCES.filter(
    (r) => r.category === "Discovery" && r.preset,
  );
  assert.equal(connected.length, 4);
  for (const site of DISCOVERY_DIRECTORIES.filter((entry) => !entry.feedUrl)) {
    const resource = RESOURCES.find((entry) => entry.id === site.id)!;
    assert.equal(resource.kind, null);
    assert.equal(resource.preset, undefined);
    assert.ok(resource.unavailable);
    assert.throws(() => detectSmartSource(site.name), /not connected/i);
    assert.throws(() => detectSmartSource(site.website), /not connected/i);
  }
});

test("individual product URLs, lookalike hosts and unsafe schemes are not promoted to global directory feeds", () => {
  for (const input of [
    "https://www.producthunt.com/products/example",
    "https://alternativeto.net/software/example/",
    "https://producthunt.com.example.org/",
    "https://user:password@www.producthunt.com/feed",
    "https://www.producthunt.com:8443/feed",
    "http://www.producthunt.com/feed",
  ])
    assert.equal(discoveryDirectory(input), undefined, input);
});

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
  <id>tag:example.org,2026:fixture</id><title type="html">New &amp; useful tool</title>
  <link rel="alternate" href="https://example.org/products/tool?utm_campaign=launch&amp;utm_medium=atom&amp;utm_source=feed"/>
  <published>2026-10-28T12:00:00Z</published><updated>2026-10-29T12:00:00Z</updated>
  <author><name>Example maker</name></author><summary type="html">&lt;p&gt;A concise product description.&lt;/p&gt;</summary>
</entry></feed>`;
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><item>
  <guid>news-fixture</guid><title>A software update</title><link>https://example.org/news/update</link>
  <pubDate>Wed, 28 Oct 2026 12:00:00 GMT</pubDate><description>&lt;p&gt;Reported software news.&lt;/p&gt;</description>
</item></channel></rss>`;

test("launch feeds preserve provenance and dates, and stay separate from news and software releases", () => {
  for (const id of [
    "producthunt",
    "betalist",
    "alternativeto",
    "startupbase",
  ]) {
    const source = RESOURCES.find((entry) => entry.id === id)!.preset!;
    // A generic RSS subscription to the same URL must have identical content semantics.
    const [item] = parseRSS(
      id === "producthunt" || id === "betalist" ? atom : rss,
      { ...source, resourceId: "rss" },
    );
    const launch = id === "producthunt" || id === "betalist";
    if (launch)
      assert.equal(item.canonicalUrl, "https://example.org/products/tool");
    assert.equal(item.kind, launch ? "tools" : "news");
    assert.equal(item.metadata?.publicationType, launch ? "launch" : "article");
    assert.equal(item.publishedAt, "2026-10-28T12:00:00.000Z");
    assert.equal(
      item.links[0].label,
      DISCOVERY_DIRECTORIES.find((entry) => entry.id === id)!.name,
    );
    assert.equal(
      summaryScope({ ...item, sourceKind: "rss" }),
      launch ? "Launch excerpt" : "Article excerpt",
    );
    assert.ok(!item.abstract.includes("<p>"));
  }
  assert.equal(parseRSS(atom)[0].kind, "news");
  assert.equal(parseRSS(atom)[0].metadata?.publicationType, "article");
});

test("the project owns the canonical Google Form URL; legacy preferences cannot override it", async () => {
  const expected =
    "https://docs.google.com/forms/d/e/1FAIpQLSfKoaxyyRzrEoQEu8173plnJOs8-wu78xYWVIc6Ds9v8H_xGA/viewform";
  assert.equal(feedbackFormUrl, expected);
  assert.equal(googleFormUrl(`${expected}?usp=publish-editor#test`), expected);
  for (const invalid of [
    null,
    "",
    "http://docs.google.com/forms/d/e/id/viewform",
    "https://docs.google.com.example.org/forms/d/e/id/viewform",
    "https://user@docs.google.com/forms/d/e/id/viewform",
    "https://docs.google.com/forms/d/e/id/edit",
  ])
    assert.equal(googleFormUrl(invalid), null);
  const store = new Store(":memory:");
  try {
    store.meta("preference:feedback-form-url", "https://example.org/old-form");
    const router = preferenceRoutes(store);
    const preferences = await router.dispatch("/preferences", "GET");
    assert.equal(
      (preferences?.body as Record<string, string>)["feedback-form-url"],
      undefined,
    );
    await assert.rejects(
      router.dispatch("/preferences/feedback-form-url", "PUT", {
        value: expected,
      }),
    );
  } finally {
    store.close();
  }
});
