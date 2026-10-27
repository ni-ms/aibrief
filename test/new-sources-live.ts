// Optional network smoke test. Real public data, isolated temp SQLite, no keys.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { HttpClient } from "../server/http.ts";
import { collect } from "../server/sources/index.ts";
import type { Source } from "../shared/types.ts";
const directory = mkdtempSync(join(tmpdir(), "fieldnotes-sources-"));
const store = new Store(join(directory, "live.sqlite"));
const http = new HttpClient(store);
const base = {
  enabled: true,
  lastAttempt: null,
  lastSuccess: null,
  error: null,
};
const sources: Source[] = [
  {
    ...base,
    id: "focus-check",
    kind: "arxiv",
    name: "Focused search",
    config: {
      categories: ["quant-ph"],
      searchTerms: ["quantum error correction"],
    },
  },
  {
    ...base,
    id: "rss-check",
    kind: "rss",
    name: "Hugging Face blog",
    config: { url: "https://huggingface.co/blog/feed.xml" },
  },
  {
    ...base,
    id: "bluesky-check",
    kind: "bluesky",
    name: "Simon Willison",
    config: { actor: "simonwillison.net" },
  },
];
try {
  for (const source of sources) {
    store.saveSource(source);
    const items = await collect(source, http, []);
    assert.ok(items.length > 0, `${source.name} returned records`);
    const added = store.ingest(source, items);
    assert.equal(store.ingest(source, items), 0);
    console.log(
      JSON.stringify({
        source: source.name,
        records: items.length,
        added,
        replayAdded: 0,
        sample: items[0].title,
      }),
    );
  }
  const metadata = store.items().filter((i) => i.metadata?.publicationType);
  assert.ok(metadata.length > 0);
  console.log(
    "PASS: focused arXiv retrieval, RSS and Bluesky real ingestion; idempotent replay; provenance metadata retained.",
  );
} finally {
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
