// Synthetic fixtures only; no user database or public API is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/db.ts";
import { HttpClient } from "../server/http.ts";
import { TopicService, discoveryArxivQuery } from "../server/topics.ts";
import { Collector } from "../server/collector.ts";
const atom = `<feed><entry><id>https://arxiv.org/abs/2610.12345v1</id><title>TEST FIXTURE: Topological quantum computing</title><published>2026-10-23T00:00:00Z</published><summary>Topological quantum computing methods with a bounded test.</summary><category term="quant-ph"/></entry></feed>`;
class FixtureHTTP extends HttpClient {
  calls: string[] = [];
  failure = false;
  gate?: Promise<void>;
  override async text(url: string) {
    this.calls.push(url);
    if (this.gate) await this.gate;
    if (this.failure) throw new Error("TEST FIXTURE: provider unavailable");
    return atom;
  }
  override checkedAt(_url: string) {
    return new Date().toISOString();
  }
}
function stale(store: Store, id: string) {
  const topic = store.followedTopics().find((t) => t.id === id)!;
  for (const check of Object.values(topic.checks)) {
    check.lastAttempt = "2020-01-01T00:00:00Z";
    check.lastSuccess = "2020-01-01T00:00:00Z";
  }
  store.saveTopic(topic);
}
test("discovery searches outside enabled categories, previews without ingestion, and quotes query words", async () => {
  const store = new Store(":memory:");
  try {
    const http = new FixtureHTTP(store);
    const service = new TopicService(store, http);
    const result = await service.discover("topological quantum computing", [
      "arxiv",
    ]);
    const query = new URL(http.calls[0]).searchParams.get("search_query")!;
    assert.ok(query.includes('ti:"topological"'));
    assert.ok(!query.includes("cat:"));
    assert.equal(result.results[0].origin, "upstream");
    assert.equal(result.results[0].providerName, "arXiv");
    assert.equal(store.items().length, 0);
    assert.equal(store.followedTopics().length, 0);
    assert.ok(!discoveryArxivQuery('quantum" OR cat:cs.AI').includes("cat:"));
  } finally {
    store.close();
  }
});
test("overlapping topics reuse paper records and persist membership and state across reopening", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fieldnotes-topics-"));
  const file = join(dir, "topics.sqlite");
  let store = new Store(file);
  try {
    const originalSources = store.sources().length;
    const service = new TopicService(store, new FixtureHTTP(store));
    const a = service.follow("topological quantum computing", ["arxiv"]);
    const b = service.follow("quantum", ["arxiv"]);
    assert.equal(service.follow("QUANTUM", ["arxiv"]).id, b.id);
    await service.refresh(a.id, true);
    await service.refresh(b.id, true);
    assert.equal(store.items().length, 1);
    assert.equal(store.sources().length, originalSources);
    const story = store.stories()[0];
    assert.deepEqual(story.followedTopicIds?.sort(), [a.id, b.id].sort());
    store.setState(story.groupId, { saved: true, read: true });
    store.saveTopic({
      ...store.followedTopics()[0],
      name: "Quantum desk",
      paused: true,
    });
    store.close();
    store = new Store(file);
    assert.equal(store.followedTopics()[0].name, "Quantum desk");
    assert.equal(store.followedTopics()[0].paused, true);
    assert.ok(store.followedTopics()[1].checks.arxiv.lastSuccess);
    assert.equal(store.stories()[0].followedTopicIds?.length, 2);
    store.removeTopic(a.id);
    assert.deepEqual(store.stories()[0].followedTopicIds, [b.id]);
    store.removeTopic(b.id);
    assert.equal(store.stories()[0].saved, true);
    assert.equal(store.stories()[0].read, true);
    assert.equal(store.items().length, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("topic refresh honors six-hour staleness, cooldown and pause; failures retain last success and members", async () => {
  const store = new Store(":memory:");
  try {
    const http = new FixtureHTTP(store);
    const service = new TopicService(store, http);
    const topic = service.follow("quantum", ["arxiv"]);
    await service.refresh(topic.id);
    const success = store.followedTopics()[0].checks.arxiv.lastSuccess;
    await service.refresh(topic.id);
    await service.refresh(topic.id, true);
    assert.equal(http.calls.length, 1);
    const prior = store.followedTopics()[0];
    store.saveTopic({
      ...prior,
      checks: {
        arxiv: { ...prior.checks.arxiv, lastAttempt: "2020-01-01T00:00:00Z" },
      },
    });
    await service.refresh(topic.id);
    assert.equal(http.calls.length, 1);
    http.failure = true;
    store.saveTopic({
      ...store.followedTopics()[0],
      checks: {
        arxiv: {
          lastAttempt: "2020-01-01T00:00:00Z",
          lastSuccess: success,
          error: null,
        },
      },
    });
    await service.refresh(topic.id, true);
    assert.equal(store.followedTopics()[0].checks.arxiv.lastSuccess, success);
    assert.match(store.followedTopics()[0].checks.arxiv.error!, /unavailable/);
    assert.equal(store.stories()[0].followedTopicIds?.length, 1);
    stale(store, topic.id);
    store.saveTopic({ ...store.followedTopics()[0], paused: true });
    await service.refresh(topic.id, true);
    assert.equal(http.calls.length, 2);
  } finally {
    store.close();
  }
});
test("pause and unfollow win over an in-flight fetch without recreating membership", async () => {
  for (const action of ["pause", "remove"] as const) {
    const store = new Store(":memory:");
    try {
      const http = new FixtureHTTP(store);
      let release!: () => void;
      http.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const service = new TopicService(store, http);
      const topic = service.follow("quantum", ["arxiv"]);
      const work = service.refresh(topic.id, true);
      if (action === "remove") store.removeTopic(topic.id);
      else store.saveTopic({ ...store.followedTopics()[0], paused: true });
      release();
      await work;
      assert.equal(store.items().length, 0);
      assert.equal(store.followedTopics().length, action === "remove" ? 0 : 1);
    } finally {
      store.close();
    }
  }
});
test("configured repository providers match collected items and report upstream errors independently", async () => {
  const store = new Store(":memory:");
  try {
    const source = store.sources().find((s) => s.kind === "github")!;
    store.saveSource({ ...source, lastSuccess: "2026-10-24T00:00:00Z" });
    store.ingest(source, [
      {
        externalId: "test",
        canonicalUrl: "https://github.com/test/repo/releases/tag/v1",
        title: "TEST FIXTURE: Topological quantum tools",
        abstract: "",
        releaseText: "Quantum computing release notes",
        publishedAt: null,
        topics: [],
        kind: "tools",
        links: [],
      },
    ]);
    const http = new FixtureHTTP(store);
    http.failure = true;
    const service = new TopicService(store, http);
    const result = await service.discover("quantum computing", [
      "arxiv",
      source.id,
    ]);
    assert.match(result.checks.arxiv.error!, /unavailable/);
    assert.equal(result.results[0].origin, "collected");
    const topic = service.follow("quantum computing", [source.id]);
    await service.refresh(topic.id, true);
    assert.deepEqual(store.stories()[0].followedTopicIds, [topic.id]);
  } finally {
    store.close();
  }
});
test("legacy combined focus becomes independent topics while preserving the old source and items", () => {
  const store = new Store(":memory:");
  try {
    store.saveSource({
      ...store.sources()[0],
      id: "arxiv-focus",
      config: { categories: ["cs.AI"], searchTerms: ["quantum", "robotics"] },
    });
    new Collector(store);
    assert.deepEqual(
      store.followedTopics().map((t) => t.query),
      ["quantum", "robotics"],
    );
    assert.equal(
      store.sources().find((s) => s.id === "arxiv-focus")?.enabled,
      false,
    );
    new Collector(store);
    assert.equal(store.followedTopics().length, 2);
  } finally {
    store.close();
  }
});
test("collector refresh includes saved topics and repeat follow resumes while retaining successful history", async () => {
  const store = new Store(":memory:");
  try {
    for (const source of store.sources())
      store.saveSource({ ...source, enabled: false });
    const http = new FixtureHTTP(store);
    const collector = new Collector(store, http);
    const topic = collector.topics.follow("quantum", ["arxiv"]);
    await collector.refresh();
    const collected = store.followedTopics()[0];
    assert.ok(collected.checks.arxiv.lastSuccess);
    assert.equal(store.stories()[0].sourceName, "arXiv");
    store.saveTopic({ ...collected, paused: true });
    const resumed = collector.topics.follow("quantum", ["arxiv"]);
    assert.equal(resumed.id, topic.id);
    assert.equal(resumed.paused, false);
    assert.equal(
      resumed.checks.arxiv.lastSuccess,
      collected.checks.arxiv.lastSuccess,
    );
    assert.equal(resumed.checks.arxiv.lastAttempt, null);
    http.failure = true;
    await collector.topics.refresh(topic.id, true);
    assert.equal(
      store.followedTopics()[0].checks.arxiv.lastSuccess,
      collected.checks.arxiv.lastSuccess,
    );
    assert.equal(store.items().length, 1);
  } finally {
    store.close();
  }
});
test("failed topic ingestion reports an error without marking collection successful", async () => {
  const store = new Store(":memory:");
  try {
    const service = new TopicService(store, new FixtureHTTP(store));
    const topic = service.follow("quantum", ["arxiv"]);
    store.ingest = () => {
      throw new Error("TEST FIXTURE: failed transaction");
    };
    await service.refresh(topic.id, true);
    const check = store.followedTopics()[0].checks.arxiv;
    assert.equal(check.lastSuccess, null);
    assert.match(check.error!, /failed transaction/);
    assert.equal(store.items().length, 0);
  } finally {
    store.close();
  }
});
