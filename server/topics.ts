import { runtimeEnv } from "#platform";
import type {
  Discovery,
  DiscoveryProvider,
  DiscoveryResult,
  FollowedTopic,
  TopicCheck,
} from "../shared/types.ts";
import { matches } from "../shared/interests.ts";
import { MANUAL_COOLDOWN_MS, SYNC_INTERVAL_MS } from "./config.ts";
import type { Store } from "./db.ts";
import type { HttpClient } from "./http.ts";
import { parseArxiv } from "./sources/arxiv.ts";

export const queryWords = (query: string) =>
  query.match(/[\p{L}\p{N}]+/gu) || [];
/** Every word is quoted data. No category restriction or caller-supplied API syntax. */
export function discoveryArxivQuery(query: string) {
  return queryWords(query)
    .map((word) => `(ti:"${word}" OR abs:"${word}")`)
    .join(" AND ");
}
export function topicMatches(text: string, query: string) {
  return queryWords(query).every((word) => matches(text, word));
}
export class TopicService {
  private pending = new Map<string, Promise<void>>();
  private store: Store;
  private http: HttpClient;
  get syncing() {
    return this.pending.size > 0;
  }
  constructor(store: Store, http: HttpClient) {
    this.store = store;
    this.http = http;
    // Retain old items, but convert the old combined focus source into separate topics.
    if (!store.meta("topics:migrated-focus")) {
      const legacy = store.sources().find((s) => s.id === "arxiv-focus");
      if (legacy) {
        for (const query of legacy.config.searchTerms || []) {
          const topic = this.follow(query, ["arxiv"]);
          store.linkTopic(
            topic.id,
            "arxiv",
            store
              .items()
              .filter(
                (item) =>
                  item.sourceId === legacy.id &&
                  topicMatches(`${item.title} ${item.abstract}`, query),
              )
              .map((item) => item.canonicalUrl),
          );
          store.saveTopic({ ...topic, paused: !legacy.enabled });
        }
        store.saveSource({ ...legacy, enabled: false });
      }
      store.meta("topics:migrated-focus", "true");
    }
  }
  providers(): DiscoveryProvider[] {
    return [
      {
        id: "arxiv",
        name: "arXiv · all subjects",
        capability: "upstream",
        enabled: true,
      },
      ...this.store
        .sources()
        .filter((s) => s.kind !== "arxiv")
        .map((s) => ({
          id: s.id,
          name: s.name,
          capability: "collected" as const,
          enabled: s.enabled,
        })),
    ];
  }
  validateProviders(ids: string[]) {
    const known = new Set(this.providers().map((p) => p.id));
    if (ids.some((id) => !known.has(id)))
      throw new Error("Unknown discovery provider");
  }
  follow(query: string, providers: string[]): FollowedTopic {
    this.validateProviders(providers);
    const unique = [...new Set(providers)].sort();
    const existing = this.store
      .followedTopics()
      .find(
        (t) =>
          t.query.toLowerCase() === query.toLowerCase() &&
          JSON.stringify([...t.providers].sort()) === JSON.stringify(unique),
      );
    if (existing) {
      if (!existing.paused) return existing;
      const resumed = {
        ...existing,
        paused: false,
        checks: Object.fromEntries(
          Object.entries(existing.checks).map(([id, check]) => [
            id,
            { ...check, lastAttempt: null },
          ]),
        ),
      };
      this.store.saveTopic(resumed);
      return resumed;
    }
    if (this.store.followedTopics().length >= 20)
      throw new Error("Maximum 20 followed topics");
    const topic: FollowedTopic = {
      id: crypto.randomUUID(),
      name: query,
      query,
      providers: unique,
      paused: false,
      createdAt: new Date().toISOString(),
      checks: {},
    };
    this.store.saveTopic(topic);
    return topic;
  }
  private async searchProvider(
    query: string,
    id: string,
  ): Promise<{ results: DiscoveryResult[]; check: TopicCheck }> {
    const lastAttempt = new Date().toISOString();
    try {
      if (id === "arxiv") {
        const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(discoveryArxivQuery(query))}&sortBy=submittedDate&sortOrder=descending&max_results=50`;
        const body = await this.http.text(url, MANUAL_COOLDOWN_MS);
        return {
          results: parseArxiv(body).map((item) => ({
            ...item,
            fetchedAt: this.http.checkedAt(url),
            providerId: id,
            providerName: "arXiv",
            origin: "upstream",
          })),
          check: {
            lastAttempt,
            lastSuccess: this.http.checkedAt(url) || lastAttempt,
            error: null,
          },
        };
      }
      const source = this.store.sources().find((s) => s.id === id);
      if (!source?.enabled) throw new Error("Provider is paused in Resources");
      return {
        results: this.store
          .items()
          .filter(
            (item) =>
              item.sourceId === id &&
              topicMatches(
                `${item.title} ${item.abstract} ${item.releaseText}`,
                query,
              ),
          )
          .slice(0, 50)
          .map((item) => ({
            ...item,
            providerId: id,
            providerName: source.name,
            origin: "collected",
          })),
        check: {
          lastAttempt,
          lastSuccess: source.lastSuccess,
          error: source.error,
        },
      };
    } catch (error) {
      return {
        results: [],
        check: {
          lastAttempt,
          lastSuccess: null,
          error: error instanceof Error ? error.message : "Search failed",
        },
      };
    }
  }
  async discover(query: string, providers: string[]): Promise<Discovery> {
    const result: Discovery = { query, providers, results: [], checks: {} };
    for (const id of providers) {
      const found = await this.searchProvider(query, id);
      result.results.push(...found.results);
      result.checks[id] = found.check;
    }
    return result;
  }
  async refreshAll(manual = false) {
    for (const topic of this.store.followedTopics())
      await this.refresh(topic.id, manual);
  }
  refresh(id: string, manual = false): Promise<void> {
    const existing = this.pending.get(id);
    if (existing) return existing;
    const task = this.refreshTopic(id, manual).finally(() =>
      this.pending.delete(id),
    );
    this.pending.set(id, task);
    return task;
  }
  private async refreshTopic(id: string, manual: boolean) {
    if (runtimeEnv.COLLECTION_DISABLED === "true") return;
    const initial = this.store.followedTopics().find((t) => t.id === id);
    if (!initial || initial.paused) return;
    for (const providerId of initial.providers) {
      const topic = this.store.followedTopics().find((t) => t.id === id);
      if (!topic || topic.paused) return;
      const prior = topic.checks[providerId];
      if (
        prior?.lastAttempt &&
        Date.now() - Date.parse(prior.lastAttempt) < MANUAL_COOLDOWN_MS
      )
        continue;
      if (
        !manual &&
        prior?.lastSuccess &&
        Date.now() - Date.parse(prior.lastSuccess) < SYNC_INTERVAL_MS
      )
        continue;
      this.store.saveTopic({
        ...topic,
        checks: {
          ...topic.checks,
          [providerId]: {
            lastAttempt: new Date().toISOString(),
            lastSuccess: prior?.lastSuccess || null,
            error: prior?.error || null,
          },
        },
      });
      const found = await this.searchProvider(topic.query, providerId);
      // A pause or unfollow during an in-flight request must win.
      const latest = this.store.followedTopics().find((t) => t.id === id);
      if (!latest || latest.paused) return;
      const check = {
        ...found.check,
        lastSuccess: found.check.lastSuccess || prior?.lastSuccess || null,
      };
      try {
        if (providerId === "arxiv" && found.results.length) {
          const source = this.store
            .sources()
            .find((s) => s.kind === "arxiv" && s.id !== "arxiv-focus")!;
          this.store.ingest(source, found.results);
        }
        this.store.linkTopic(
          id,
          providerId,
          found.results.map((item) => item.canonicalUrl),
        );
      } catch (error) {
        check.lastSuccess = prior?.lastSuccess || null;
        check.error =
          error instanceof Error ? error.message : "Collection failed";
      }
      this.store.saveTopic({
        ...latest,
        checks: {
          ...latest.checks,
          [providerId]: check,
        },
      });
    }
  }
}
