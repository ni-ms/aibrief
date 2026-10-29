import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { SqlJsStatic } from "sql.js";
import { BrowserDatabase } from "../src/browser/sqlite.ts";
import { openSnapshots, SnapshotWriter } from "../src/browser/persistence.ts";
import { createBrowserRuntime } from "../src/browser/runtime.ts";
import { Store } from "../server/store.ts";
import { migrateSchema } from "../server/storage/migrate-schema.ts";
import { hashContent } from "../server/normalize.ts";
import { HttpClient } from "../server/http.ts";
import { browserMode, assertPublicFeedUrl } from "#platform";
import { validateBackup } from "../src/browser/restore.ts";
import { DatabaseSync, backup } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const init = createRequire(import.meta.url)("sql.js/dist/sql-wasm.js");
const SQL: SqlJsStatic = await init();
const schema = readFileSync(
  new URL("../server/storage/schema.sql", import.meta.url),
  "utf8",
).replace("journal_mode = WAL", "journal_mode = DELETE");
function database(bytes?: Uint8Array) {
  const db = new BrowserDatabase(new SQL.Database(bytes));
  migrateSchema(db, schema);
  return db;
}

test("browser snapshots retain default source removals and a full feedback history", async () => {
  const db = database();
  const store = new Store(db);
  const removed = store.sources()[0];
  store.removeSource(removed.id);
  const runtime = createBrowserRuntime(store);
  const entries = Array.from({ length: 30 }, (_, id) => ({
    id: String(id),
    category: "bug",
    message: "界".repeat(2000),
    createdAt: "2026-10-28T00:00:00Z",
  }));
  await runtime.dispatch("/preferences/feedback-log", "PUT", {
    value: JSON.stringify(entries),
  });
  const restored = new Store(database(db.snapshot()));
  try {
    assert.equal(
      restored.sources().some((source) => source.id === removed.id),
      false,
    );
    assert.deepEqual(
      JSON.parse(restored.meta("preference:feedback-log")!),
      entries,
    );
  } finally {
    restored.close();
    store.close();
  }
});

test("a native SQLite backup restores in WASM without changing saved preferences", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldnotes-restore-"));
  const native = new DatabaseSync(":memory:");
  try {
    migrateSchema(native, schema);
    const store = new Store(native);
    store.meta("preference:summary-depth", "detailed");
    const output = join(directory, "backup.sqlite");
    await backup(native, output);
    const restored = new Store(
      database(
        validateBackup(SQL, new Uint8Array(readFileSync(output)), schema),
      ),
    );
    assert.equal(restored.meta("preference:summary-depth"), "detailed");
    assert.equal(restored.sources().length, store.sources().length);
    restored.close();
  } finally {
    native.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid or unrelated backups fail validation before replacing the saved database", () => {
  assert.throws(() =>
    validateBackup(SQL, new TextEncoder().encode("not SQLite"), schema),
  );
  const unrelated = new SQL.Database();
  unrelated.run("CREATE TABLE unrelated(value TEXT)");
  assert.throws(
    () => validateBackup(SQL, unrelated.export(), schema),
    /not a Fieldnotes database/,
  );
  unrelated.close();
});

test("restore waits for an in-flight save and prevents later old-state writes", async () => {
  const old = database();
  const oldStore = new Store(old);
  const restored = database();
  new Store(restored).meta("restored", "yes");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let lastSaved: Uint8Array | undefined;
  let writes = 0;
  const writer = new SnapshotWriter(
    old,
    {
      async write(bytes) {
        if (++writes === 1) await held;
        lastSaved = bytes;
      },
    },
    () => {},
  );
  const pending = writer.flush();
  const replacing = writer.replace(restored.snapshot());
  oldStore.meta("late-old-state", "must not overwrite restored data");
  release();
  await Promise.all([pending, replacing]);
  await writer.flush();
  assert.equal(writes, 2);
  const result = new Store(database(lastSaved));
  assert.equal(result.meta("restored"), "yes");
  assert.equal(result.meta("late-old-state"), undefined);
  old.close();
  restored.close();
  result.close();
});

test("browser mode uses the same SQLite schema and preserves reading state after IndexedDB reopen", async () => {
  assert.equal(browserMode, true);
  const snapshots = await openSnapshots(`test:${crypto.randomUUID()}`);
  const db = database();
  const store = new Store(db);
  const source = store.sources().find((source) => source.kind === "github")!;
  store.ingest(source, [
    {
      externalId: "fixture-release",
      canonicalUrl: "https://github.com/example/project/releases/tag/v1",
      title: "Synthetic local persistence fixture",
      abstract: "An offline test record.",
      releaseText: "",
      publishedAt: "2026-10-26T00:00:00Z",
      topics: [],
      kind: "tools",
      links: [],
    },
  ]);
  const story = store.stories()[0];
  const runtime = createBrowserRuntime(store);
  await runtime.dispatch(`/stories/${story.groupId}`, "PATCH", {
    saved: true,
    read: true,
    feedback: 1,
  });
  await runtime.dispatch("/preferences/page-size", "PUT", { value: "50" });
  store.saveTopic({
    id: "fixture-topic",
    name: "Persistence",
    query: "local data",
    providers: [source.id],
    paused: true,
    checks: {},
    createdAt: new Date().toISOString(),
  });
  const writer = new SnapshotWriter(db, snapshots, (error) => {
    throw error;
  });
  await writer.flush();
  const saved = await snapshots.read();
  assert.ok(saved instanceof Uint8Array);
  db.close();
  const reopened = database(saved);
  const restored = new Store(reopened);
  assert.equal(restored.stories()[0].saved, true);
  assert.equal(restored.stories()[0].read, true);
  assert.equal(restored.stories()[0].feedback, 1);
  assert.equal(restored.followedTopics()[0].name, "Persistence");
  assert.equal(restored.meta("preference:page-size"), "50");
  assert.equal(restored.stories()[0].contentHash, story.contentHash);
  reopened.snapshot();
  assert.throws(
    () =>
      reopened
        .prepare("INSERT INTO topic_items VALUES(?,?,?)")
        .run("missing-topic", source.id, story.groupId),
    /FOREIGN KEY/,
  );
  reopened.close();
  snapshots.close();
});

test("snapshot commits include edits made while an earlier write is pending", async () => {
  const db = database();
  const store = new Store(db);
  let release!: () => void;
  const first = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saved: Uint8Array[] = [];
  const writer = new SnapshotWriter(
    db,
    {
      async write(bytes) {
        saved.push(bytes);
        if (saved.length === 1) await first;
      },
    },
    () => {},
  );
  const pending = writer.flush();
  store.meta("latest", "second edit");
  release();
  await pending;
  assert.equal(saved.length, 2);
  const restored = new Store(database(saved.at(-1)));
  assert.equal(restored.meta("latest"), "second edit");
  restored.close();
  // Allow the scheduled background flush to finish before closing.
  await new Promise((resolve) => setTimeout(resolve, 120));
  db.close();
});

test("failed IndexedDB commits reject instead of acknowledging saved data, and can retry", async () => {
  const db = database();
  let fail = true;
  const writer = new SnapshotWriter(
    db,
    {
      async write() {
        if (fail) throw new Error("Quota exceeded");
      },
    },
    () => {},
  );
  await assert.rejects(writer.flush(), /Quota exceeded/);
  fail = false;
  await writer.flush();
  db.close();
});

test("portable SHA-256 retains exact hashes from the existing Node database", () => {
  const parts = ["Quantum research 🧪", "Results\nwith Unicode", "v1"] as const;
  assert.equal(
    hashContent(...parts),
    createHash("sha256").update(JSON.stringify(parts)).digest("hex"),
  );
});

test("browser networking omits credentials and forbidden headers and explains CORS failures", async () => {
  const db = database();
  const store = new Store(db);
  let options: RequestInit | undefined;
  const http = new HttpClient(store, async function (
    this: unknown,
    _url,
    init,
  ) {
    assert.equal(this, globalThis);
    options = init;
    return new Response("[]", {
      headers: { "Content-Type": "application/json" },
    });
  } as typeof fetch);
  await http.text("https://api.github.com/users/example/starred");
  assert.equal(options?.credentials, "omit");
  assert.equal(options?.mode, "cors");
  assert.equal(new Headers(options?.headers).has("User-Agent"), false);
  const blocked = new HttpClient(store, (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch);
  await assert.rejects(
    blocked.text("https://example.org/feed"),
    /cross-site access/,
  );
  for (const url of [
    "http://example.org",
    "https://127.0.0.1/feed",
    "https://localhost/feed",
    "https://example.org:3001/feed",
    "https://user:pass@example.org/feed",
  ])
    await assert.rejects(assertPublicFeedUrl(url));
  db.close();
});
