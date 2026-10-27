import { runtimeEnv } from "#platform";
import { collect } from "./adapters.ts";
import { HttpClient } from "./http.ts";
import { MANUAL_COOLDOWN_MS, SYNC_INTERVAL_MS } from "./config.ts";
import type { Store } from "./db.ts";
import { TopicService } from "./topics.ts";
export class Collector {
  topics: TopicService;
  syncing = false;
  private refreshQueued = false;
  private store: Store;
  private http: HttpClient;
  constructor(store: Store, http = new HttpClient(store)) {
    this.store = store;
    this.http = http;
    this.topics = new TopicService(store, http);
  }
  async refresh(manual = false) {
    if (runtimeEnv.COLLECTION_DISABLED === "true") return;
    if (this.syncing) {
      if (manual) this.refreshQueued = true;
      return;
    }
    this.syncing = true;
    try {
      for (const initial of this.store.sources()) {
        if (!initial.enabled) continue;
        const age =
          Date.now() - Date.parse(initial.lastAttempt || "1970-01-01");
        if (
          age < MANUAL_COOLDOWN_MS ||
          (!manual &&
            initial.lastSuccess &&
            Date.now() - Date.parse(initial.lastSuccess) < SYNC_INTERVAL_MS)
        )
          continue;
        const source = { ...initial, lastAttempt: new Date().toISOString() };
        this.store.saveSource(source);
        try {
          const count = this.store.db
            .prepare("SELECT COUNT(*) AS n FROM items WHERE source_id=?")
            .get(source.id) as { n: number };
          const incoming = await collect(
            source,
            this.http,
            this.store.profile().terms,
            count.n === 0,
          );
          const current = this.store.sources().find((s) => s.id === source.id)!;
          if (
            !current.enabled ||
            JSON.stringify(current.config) !== JSON.stringify(source.config)
          )
            continue;
          const now = new Date().toISOString();
          this.store.ingest(source, incoming, now);
          // Read current enabled/config state: don't overwrite edits made during a fetch.
          const latest = this.store.sources().find((s) => s.id === source.id)!;
          this.store.saveSource({
            ...latest,
            lastAttempt: source.lastAttempt,
            lastSuccess: now,
            error: null,
          });
        } catch (error) {
          const latest = this.store.sources().find((s) => s.id === source.id)!;
          this.store.saveSource({
            ...latest,
            lastAttempt: source.lastAttempt,
            error: error instanceof Error ? error.message : "Collection failed",
          });
        }
      }
      await this.topics.refreshAll(manual);
    } finally {
      this.syncing = false;
      if (this.refreshQueued) {
        this.refreshQueued = false;
        void this.refresh(true);
      }
    }
  }
}
