import { runtimeEnv } from "#platform";
import { collect } from "./adapters.ts";
import { HttpClient } from "./http.ts";
import { MANUAL_COOLDOWN_MS, SYNC_INTERVAL_MS } from "./config.ts";
import type { Store } from "./db.ts";
import type { Source } from "../shared/types.ts";
import { TopicService } from "./topics.ts";

export class Collector {
  topics: TopicService;
  syncing = false;
  private activeSourceIds = new Set<string>();
  private refreshQueued = false;
  private store: Store;
  private http: HttpClient;

  get syncingSourceIds(): string[] {
    return Array.from(this.activeSourceIds);
  }

  constructor(store: Store, http = new HttpClient(store)) {
    this.store = store;
    this.http = http;
    this.topics = new TopicService(store, http);
  }

  async refresh(manual = false, force = false) {
    if (runtimeEnv.COLLECTION_DISABLED === "true") return;
    if (this.syncing) {
      if (manual) this.refreshQueued = true;
      return;
    }
    this.syncing = true;
    try {
      const sources = this.store.sources().filter((s) => s.enabled);
      const arxivSources = sources.filter((s) => s.kind === "arxiv");
      const fastSources = sources.filter((s) => s.kind !== "arxiv");

      const runFastLane = async () => {
        let index = 0;
        const limit = Math.min(6, fastSources.length);
        if (limit === 0) return;
        const workers = Array.from({ length: limit }, async () => {
          while (index < fastSources.length) {
            const source = fastSources[index++];
            await this.refreshOneSource(source, manual, force);
          }
        });
        await Promise.allSettled(workers);
      };

      const runSerialArxivLane = async () => {
        for (const source of arxivSources) {
          await this.refreshOneSource(source, manual, force);
        }
      };

      await Promise.all([runFastLane(), runSerialArxivLane()]);
      await this.topics.refreshAll(manual);
    } finally {
      this.syncing = false;
      if (this.refreshQueued) {
        this.refreshQueued = false;
        void this.refresh(true, force);
      }
    }
  }

  async refreshSource(sourceId: string, force = true) {
    if (runtimeEnv.COLLECTION_DISABLED === "true") return;
    const source = this.store.sources().find((s) => s.id === sourceId);
    if (!source || !source.enabled) return;
    await this.refreshOneSource(source, true, force);
  }

  private async refreshOneSource(
    initial: Source,
    manual: boolean,
    force: boolean,
  ) {
    const age = Date.now() - Date.parse(initial.lastAttempt || "1970-01-01");
    if (!force) {
      if (age < MANUAL_COOLDOWN_MS) return;
      if (
        !manual &&
        initial.lastSuccess &&
        Date.now() - Date.parse(initial.lastSuccess) < SYNC_INTERVAL_MS
      )
        return;
    }
    const attemptTime = new Date().toISOString();
    const source = { ...initial, lastAttempt: attemptTime };
    this.store.saveSource(source);
    this.activeSourceIds.add(source.id);
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
      const current = this.store.sources().find((s) => s.id === source.id);
      if (
        !current ||
        !current.enabled ||
        JSON.stringify(current.config) !== JSON.stringify(source.config)
      )
        return;
      const now = new Date().toISOString();
      this.store.ingest(source, incoming, now);
      // Read current enabled/config state: don't overwrite edits made during a fetch.
      const latest = this.store.sources().find((s) => s.id === source.id)!;
      this.store.saveSource({
        ...latest,
        lastAttempt: attemptTime,
        lastSuccess: now,
        error: null,
      });
    } catch (error) {
      const latest = this.store.sources().find((s) => s.id === source.id);
      if (latest) {
        this.store.saveSource({
          ...latest,
          lastAttempt: attemptTime,
          error: error instanceof Error ? error.message : "Collection failed",
        });
      }
    } finally {
      this.activeSourceIds.delete(source.id);
    }
  }
}
