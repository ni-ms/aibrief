import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/db.ts";
import { Collector } from "../server/collector.ts";
import { createApp } from "../server/app.ts";
import { exportOpml, parseOpml } from "../shared/feeds.ts";
import {
  FEEDBACK_HISTORY_LIMIT,
  FEEDBACK_LOG_LIMIT,
} from "../shared/feedback.ts";

test("deleted defaults stay removed after reopening, and explicit re-addition still works", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldnotes-removal-"));
  const path = join(directory, "review.sqlite");
  let store = new Store(path);
  try {
    const removed = store.sources()[0];
    const kept = store.sources()[1];
    store.saveSource({ ...kept, enabled: false });
    store.removeSource(removed.id);
    store.close();
    store = new Store(path);
    assert.equal(
      store.sources().some((s) => s.id === removed.id),
      false,
    );
    assert.equal(store.sources().find((s) => s.id === kept.id)?.enabled, false);
    store.saveSource({ ...removed, enabled: false });
    store.close();
    store = new Store(path);
    assert.equal(
      store.sources().find((s) => s.id === removed.id)?.enabled,
      false,
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("OPML round trips preserve XML entities in names and query parameters", () => {
  const store = new Store(":memory:");
  try {
    const source = {
      ...store.sources()[0],
      kind: "rss" as const,
      name: `AI & research > "methods" &amp; literal`,
      config: { url: "https://example.org/feed.xml?category=ai&lang=en" },
    };
    assert.deepEqual(parseOpml(exportOpml([source])), [
      { name: source.name, url: source.config.url },
    ]);
    assert.deepEqual(
      parseOpml(`<opml version="2.0"><body><outline text="Group">
        <outline title="Research &#x26; tools" xmlUrl='https://example.org/feed.xml?a=1&amp;b=2'/>
        <outline text="Duplicate" xmlUrl='https://example.org/feed.xml?a=1&amp;b=2'/>
        <outline text="Unsafe" xmlUrl="javascript:alert(1)"/>
      </outline></body></opml>`),
      [
        {
          name: "Research & tools",
          url: "https://example.org/feed.xml?a=1&b=2",
        },
      ],
    );
    assert.throws(() => parseOpml("<opml><body>"), /valid OPML/);
  } finally {
    store.close();
  }
});

test("the HTTP API persists a full Unicode feedback history and keeps other preference limits", async () => {
  const store = new Store(":memory:");
  const server = createApp(store, new Collector(store)).listen(0, "127.0.0.1");
  await once(server, "listening");
  const root = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const entries = Array.from({ length: FEEDBACK_HISTORY_LIMIT }, (_, i) => ({
    id: String(i),
    category: "bug",
    message: (i % 2 ? "\u0001" : "界").repeat(2000),
    url: "https://example.org/" + "a".repeat(480),
    createdAt: "2026-10-28T00:00:00Z",
  }));
  const value = JSON.stringify(entries);
  assert.ok(value.length > 8000 && value.length <= FEEDBACK_LOG_LIMIT);
  try {
    const response = await fetch(`${root}/preferences/feedback-log`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    assert.equal(response.status, 200);
    const preferences = await (await fetch(`${root}/preferences`)).json();
    assert.deepEqual(JSON.parse(preferences["feedback-log"]), entries);
    const invalid = await fetch(`${root}/preferences/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(8001) }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
