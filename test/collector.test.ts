import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { Collector } from "../server/collector.ts";
import { HttpClient } from "../server/http.ts";
import { MANUAL_COOLDOWN_MS, SYNC_INTERVAL_MS } from "../server/config.ts";

class MockCollectorHttp extends HttpClient {
  callOrder: string[] = [];
  activeCalls = 0;
  maxConcurrent = 0;

  override async text(url: string) {
    this.activeCalls++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.activeCalls);
    this.callOrder.push(url);
    await new Promise((r) => setTimeout(r, 20));
    this.activeCalls--;

    if (url.includes("arxiv.org")) {
      return `<feed><entry><id>https://arxiv.org/abs/2610.99999v1</id><title>arXiv Paper</title><published>2026-10-25T00:00:00Z</published><summary>Abstract</summary><category term="cs.AI"/></entry></feed>`;
    }
    if (url.includes("substack.com")) {
      return `<rss><channel><item><title>Substack Post</title><link>https://test.substack.com/p/post</link><description>Excerpt</description><pubDate>Sun, 25 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>`;
    }
    return `[]`;
  }

  override async json(url: string) {
    this.activeCalls++;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.activeCalls);
    this.callOrder.push(url);
    await new Promise((r) => setTimeout(r, 20));
    this.activeCalls--;

    if (url.includes("hacker-news")) {
      if (url.includes("stories.json")) return [101];
      return { id: 101, type: "story", time: 1792800000, title: "HN Tech Project", score: 150 };
    }
    if (url.includes("huggingface.co")) {
      return [{ id: "2610.11111", title: "HF Paper", summary: "HF Abstract", authors: [{ name: "Researcher" }] }];
    }
    if (url.includes("lobste.rs")) {
      return [{ short_id: "xyz", title: "Lobsters Story", score: 40, comments_url: "https://lobste.rs/s/xyz", created_at: "2026-10-25T00:00:00Z" }];
    }
    return [];
  }
}

test("parallel collector fast lane runs concurrently while serial lane isolates arXiv", async () => {
  const store = new Store(":memory:");
  try {
    // Enable an arXiv source and multiple fast lane sources
    const sources = store.sources();
    store.saveSource({ ...sources[0], enabled: true }); // arxiv-ai
    store.saveSource({
      id: "test-substack",
      kind: "substack",
      name: "Substack · Test",
      enabled: true,
      config: { substack: "test" },
      lastSuccess: null,
      lastAttempt: null,
      error: null,
    });
    store.saveSource({
      id: "test-hf",
      kind: "hf-papers",
      name: "HF Papers",
      enabled: true,
      config: {},
      lastSuccess: null,
      lastAttempt: null,
      error: null,
    });
    store.saveSource({
      id: "test-lobsters",
      kind: "lobsters",
      name: "Lobste.rs",
      enabled: true,
      config: { lobsters: "hottest" },
      lastSuccess: null,
      lastAttempt: null,
      error: null,
    });

    const http = new MockCollectorHttp(store);
    const collector = new Collector(store, http);

    await collector.refresh(true, true);

    // Fast lane sources should have run concurrently
    assert.ok(http.maxConcurrent >= 2, `Expected concurrent calls, got maxConcurrent=${http.maxConcurrent}`);

    // Verify all sources were updated
    const updated = store.sources();
    const substack = updated.find((s) => s.id === "test-substack");
    assert.ok(substack?.lastSuccess, "Substack should have lastSuccess");
    assert.equal(substack?.error, null);

    const hf = updated.find((s) => s.id === "test-hf");
    assert.ok(hf?.lastSuccess, "HF Papers should have lastSuccess");

    const lobsters = updated.find((s) => s.id === "test-lobsters");
    assert.ok(lobsters?.lastSuccess, "Lobsters should have lastSuccess");
  } finally {
    store.close();
  }
});

test("manual refresh with force skips cooldown and single-source refresh isolates targets", async () => {
  const store = new Store(":memory:");
  try {
    const http = new MockCollectorHttp(store);
    const collector = new Collector(store, http);

    store.saveSource({
      id: "src-1",
      kind: "substack",
      name: "Substack 1",
      enabled: true,
      config: { substack: "sub1" },
      lastSuccess: null,
      lastAttempt: null,
      error: null,
    });
    store.saveSource({
      id: "src-2",
      kind: "lobsters",
      name: "Lobsters 2",
      enabled: true,
      config: { lobsters: "hottest" },
      lastSuccess: null,
      lastAttempt: null,
      error: null,
    });

    // Refresh only src-1
    await collector.refreshSource("src-1", true);
    const s1 = store.sources().find((s) => s.id === "src-1");
    const s2 = store.sources().find((s) => s.id === "src-2");

    assert.ok(s1?.lastSuccess, "src-1 should have refreshed");
    assert.equal(s2?.lastSuccess, null, "src-2 should not have refreshed");

    // Immediate second refresh without force respects cooldown
    const prevAttempt = s1?.lastAttempt;
    await collector.refreshSource("src-1", false);
    const s1AfterCooldown = store.sources().find((s) => s.id === "src-1");
    assert.equal(s1AfterCooldown?.lastAttempt, prevAttempt);

    // With force = true, it refreshes despite cooldown
    await collector.refreshSource("src-1", true);
    const s1Forced = store.sources().find((s) => s.id === "src-1");
    assert.notEqual(s1Forced?.lastAttempt, prevAttempt);
  } finally {
    store.close();
  }
});
