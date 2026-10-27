// Optional public-network check. All data stays in an isolated in-memory database.
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { HttpClient } from "../server/http.ts";
import { TopicService } from "../server/topics.ts";
const store = new Store(":memory:");
try {
  const service = new TopicService(store, new HttpClient(store));
  const query = "topological quantum computing";
  const preview = await service.discover(query, ["arxiv"]);
  if (preview.checks.arxiv.error) throw new Error(preview.checks.arxiv.error);
  assert.ok(
    preview.results.length > 0,
    "Expected public results for this established topic",
  );
  assert.equal(store.items().length, 0);
  const topic = service.follow(query, ["arxiv"]);
  await service.refresh(topic.id, true);
  assert.ok(store.followedTopics()[0].checks.arxiv.lastSuccess);
  assert.equal(store.stories().length, preview.results.length);
  assert.ok(
    store.stories().every((s) => s.followedTopicIds?.includes(topic.id)),
  );
  console.log(
    `PASS: live all-subject arXiv search returned ${preview.results.length} results; preview, initial follow, ingestion, membership and provenance verified.`,
  );
} finally {
  store.close();
}
