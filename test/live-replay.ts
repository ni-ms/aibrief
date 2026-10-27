// Read already-collected REAL public payloads. Replay into an isolated temporary DB.
// No fixtures, extra network requests, or changes to the workspace's reading state.
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { parseArxiv, parseHN, parseReleases } from "../server/adapters.ts";
const original = new DatabaseSync("data/fieldnotes.sqlite", { readOnly: true });
const directory = mkdtempSync(join(tmpdir(), "fieldnotes-live-"));
const path = join(directory, "replay.sqlite");
let store = new Store(path);
try {
  let inserted = 0,
    repeated = 0;
  for (const source of store.sources()) {
    const rows = original.prepare("SELECT url,body FROM http_cache").all() as {
      url: string;
      body: string;
    }[];
    const payloads =
      source.kind === "arxiv"
        ? rows.filter(
            (r) =>
              r.url.includes("export.arxiv.org/api/query") &&
              source.config.categories!.every((c) =>
                decodeURIComponent(r.url).includes(`cat:${c}`),
              ),
          )
        : source.kind === "github"
          ? rows.filter((r) =>
              r.url.includes(`/repos/${source.config.repo}/releases`),
            )
          : rows.filter((r) => r.url.includes("/v0/item/"));
    const items = payloads.flatMap((r) =>
      source.kind === "arxiv"
        ? parseArxiv(r.body)
        : source.kind === "github"
          ? parseReleases(JSON.parse(r.body), source.config.repo!)
          : [parseHN(JSON.parse(r.body), store.profile().terms)].filter(
              (x) => x !== null,
            ),
    );
    assert.ok(items.length > 0, `Real payloads for ${source.id}`);
    inserted += store.ingest(source, items);
    repeated += store.ingest(source, items);
    console.log(
      `${source.id}: ${items.length} real records, replay added 0 duplicates`,
    );
  }
  assert.equal(repeated, 0);
  assert.ok(inserted >= 80);
  const count = store.items().length;
  const story = store.stories()[0];
  store.setState(story.groupId, { saved: true, read: true });
  store.close();
  store = new Store(path);
  assert.equal(store.items().length, count);
  assert.equal(
    store.stories().find((s) => s.groupId === story.groupId)?.saved,
    true,
  );
  assert.equal(
    store.stories().find((s) => s.groupId === story.groupId)?.read,
    true,
  );
  console.log(
    `PASS: ${count} real source records survive repeated ingestion and database restart; personal state persists.`,
  );
} finally {
  store.close();
  original.close();
  rmSync(directory, { recursive: true, force: true });
}
