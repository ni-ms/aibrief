// Optional public-network smoke. Uses only an in-memory database; never the user's library.
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { HttpClient } from "../server/http.ts";
import { collectReddit, redditConnection } from "../server/sources/reddit.ts";
import type { Source } from "../shared/types.ts";
const store = new Store(":memory:");
const source: Source = {
  id: "reddit-live-smoke",
  kind: "reddit",
  name: "Reddit · r/MachineLearning",
  enabled: true,
  resourceId: "reddit",
  config: { subreddit: "machinelearning" },
  lastSuccess: null,
  lastAttempt: null,
  error: null,
};
try {
  store.saveSource(source);
  const http = new HttpClient(store);
  const items = await collectReddit(source, http);
  assert.ok(items.length > 0 && items.length <= 40);
  for (const item of items) {
    assert.match(item.externalId, /^t3_[a-z0-9]+$/);
    assert.match(
      item.canonicalUrl,
      /^https:\/\/reddit\.com\/comments\/[a-z0-9]+$/,
    );
    assert.equal(item.metadata?.publicationType, "post");
    assert.ok(item.title.length > 0);
    assert.ok(
      item.links.some(
        (l) => l.label === "Reddit discussion" && l.url === item.canonicalUrl,
      ),
    );
  }
  assert.equal(store.ingest(source, items), items.length);
  assert.equal(store.ingest(source, items), 0);
  assert.equal(store.items().length, items.length);
  console.log(
    JSON.stringify(
      {
        status: "passed",
        transport: redditConnection().connectionLabel,
        subreddit: source.config.subreddit,
        posts: items.length,
        excerpts: items.filter((item) => item.abstract).length,
        linkedSources: items.filter((item) => item.links.length > 1).length,
        example: { title: items[0].title, discussion: items[0].canonicalUrl },
        database: "in-memory; discarded",
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: "unavailable",
      error: error instanceof Error ? error.message : String(error),
      database: "in-memory; discarded",
    }),
  );
  process.exitCode = 1;
} finally {
  store.close();
}
