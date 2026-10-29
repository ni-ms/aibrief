import type { SqlDatabase } from "./storage/database.ts";
import { DEFAULT_PROMPT, DEFAULT_SOURCES } from "./config.ts";
import { rankStories } from "../shared/ranking.ts";
import { deriveTerms } from "../shared/interests.ts";
import { hashContent, normalizeUrl } from "./normalize.ts";
import { itemClusterKey } from "../shared/trail.ts";
import type {
  CollectedItem,
  FollowedTopic,
  Item,
  Profile,
  Source,
  Story,
} from "../shared/types.ts";

const GITHUB_CLUSTER_WINDOW_MS = 14 * 86400000;

export class Store {
  db: SqlDatabase;
  constructor(db: SqlDatabase) {
    this.db = db;
    for (const source of DEFAULT_SOURCES)
      this.db
        .prepare("INSERT OR IGNORE INTO sources VALUES(?,?)")
        .run(source.id, JSON.stringify(source));
    this.db.prepare("INSERT OR IGNORE INTO profiles VALUES(?,?)").run(
      "local",
      JSON.stringify({
        prompt: DEFAULT_PROMPT,
        terms: deriveTerms(DEFAULT_PROMPT),
        weights: {},
        lastVisit: null,
      }),
    );
  }
  sources(): Source[] {
    return (
      this.db.prepare("SELECT payload FROM sources").all() as {
        payload: string;
      }[]
    ).map((r) => JSON.parse(r.payload));
  }
  saveSource(source: Source) {
    this.db
      .prepare(
        "INSERT INTO sources VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(source.id, JSON.stringify(source));
  }
  removeSource(id: string) {
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          "DELETE FROM item_history WHERE item_id IN (SELECT id FROM items WHERE source_id=?)",
        )
        .run(id);
      this.db.prepare("DELETE FROM items WHERE source_id=?").run(id);
      this.db.prepare("DELETE FROM sources WHERE id=?").run(id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  profile(): Profile {
    return JSON.parse(
      (
        this.db
          .prepare("SELECT payload FROM profiles WHERE id=?")
          .get("local") as { payload: string }
      ).payload,
    );
  }
  saveProfile(profile: Profile) {
    this.db
      .prepare("UPDATE profiles SET payload=? WHERE id=?")
      .run(JSON.stringify(profile), "local");
  }
  ingest(
    source: Source,
    incoming: CollectedItem[],
    now = new Date().toISOString(),
  ) {
    let added = 0;
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("INSERT OR IGNORE INTO sources VALUES(?,?)")
        .run(source.id, JSON.stringify(source));
      for (const entry of incoming) {
        const canonical = normalizeUrl(entry.canonicalUrl);
        const old = this.db
          .prepare(
            "SELECT id,group_id,metadata FROM items WHERE source_id=? AND external_id=?",
          )
          .get(source.id, entry.externalId) as
          { id: number; group_id: number; metadata: string } | undefined;
        const priorVersion = Number(
          old ? JSON.parse(old.metadata || "{}").arxivVersion : 0,
        );
        const priorMetadata = old ? JSON.parse(old.metadata || "{}") : {};
        if (entry.metadata?.arxivVersion)
          this.saveVersion({
            paperKey:
              entry.metadata.arxivId ||
              canonical.replace("https://arxiv.org/abs/", ""),
            version: entry.metadata.arxivVersion,
            title: entry.title,
            abstract: entry.abstract,
            comment: entry.metadata.comment || "",
            updatedAt: entry.metadata.updatedAt || null,
            observedAt: now,
            sourceUrl: `https://arxiv.org/abs/${entry.metadata.arxivId || entry.externalId}v${entry.metadata.arxivVersion}`,
          });
        if (priorVersion && (entry.metadata?.arxivVersion || 0) < priorVersion)
          continue;
        // A sparse RSS entry must not erase richer, versioned API metadata.
        if (
          priorVersion === entry.metadata?.arxivVersion &&
          priorMetadata.updatedAt &&
          !entry.metadata?.updatedAt
        )
          continue;
        // Group only exact normalized URLs/IDs. Titles never determine identity.
        this.db
          .prepare("INSERT OR IGNORE INTO story_groups(identity) VALUES(?)")
          .run(canonical);
        const group = this.db
          .prepare("SELECT id FROM story_groups WHERE identity=?")
          .get(canonical) as { id: number };
        const groupId = old?.group_id ?? group.id;
        if (!old) added++;
        this.db
          .prepare(
            `INSERT INTO items(group_id,source_id,external_id,canonical_url,title,abstract,release_text,published_at,first_seen_at,last_fetched_at,content_hash,topics,kind,links,metadata) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_id,external_id) DO UPDATE SET canonical_url=excluded.canonical_url,title=excluded.title,abstract=excluded.abstract,release_text=excluded.release_text,published_at=excluded.published_at,last_fetched_at=excluded.last_fetched_at,content_hash=excluded.content_hash,topics=excluded.topics,kind=excluded.kind,links=excluded.links,metadata=excluded.metadata`,
          )
          .run(
            groupId,
            source.id,
            entry.externalId,
            canonical,
            entry.title,
            entry.abstract,
            entry.releaseText,
            entry.publishedAt,
            now,
            entry.fetchedAt || now,
            hashContent(entry.title, entry.abstract, entry.releaseText),
            JSON.stringify(entry.topics),
            entry.kind,
            JSON.stringify(entry.links),
            JSON.stringify(entry.metadata || {}),
          );
        const record = this.db
          .prepare("SELECT id FROM items WHERE source_id=? AND external_id=?")
          .get(source.id, entry.externalId) as { id: number };
        this.db
          .prepare("INSERT OR IGNORE INTO item_history VALUES(?,?,?,?)")
          .run(
            record.id,
            hashContent(entry.title, entry.abstract, entry.releaseText),
            now,
            JSON.stringify(entry),
          );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return added;
  }
  items(): Item[] {
    const sourceList = this.sources();
    const names = Object.fromEntries(sourceList.map((s) => [s.id, s.name]));
    const fallbackNames: Record<string, string> = {
      arxiv: "arXiv",
      "hf-papers": "Hugging Face Papers",
      "hn-algolia": "Hacker News",
      "github-search": "GitHub",
    };
    const fallbackKinds: Record<string, Item["sourceKind"]> = {
      arxiv: "arxiv",
      "hf-papers": "hf-papers",
      "hn-algolia": "hn",
      "github-search": "github",
    };
    return (
      this.db
        .prepare("SELECT * FROM items ORDER BY first_seen_at DESC LIMIT 5000")
        .all() as Record<string, unknown>[]
    ).map((r) => {
      const sid = String(r.source_id);
      const matchedSource = sourceList.find((s) => s.id === sid);
      return {
        id: Number(r.id),
        groupId: Number(r.group_id),
        sourceId: sid,
        sourceName:
          matchedSource?.kind === "arxiv"
            ? "arXiv"
            : names[sid] || fallbackNames[sid] || sid,
        sourceKind: matchedSource?.kind || fallbackKinds[sid],
        metadata: JSON.parse(String(r.metadata || "{}")),
        externalId: String(r.external_id),
        canonicalUrl: String(r.canonical_url),
        title: String(r.title),
        abstract: String(r.abstract),
        releaseText: String(r.release_text),
        publishedAt: r.published_at as string | null,
        firstSeenAt: String(r.first_seen_at),
        lastFetchedAt: String(r.last_fetched_at),
        contentHash: String(r.content_hash),
        topics: JSON.parse(String(r.topics)),
        kind: r.kind as Item["kind"],
        links: JSON.parse(String(r.links)),
      };
    });
  }
  private clusteredGroups(allItems = this.items()): Map<number, Item[]> {
    const parent = new Map<number, number>();
    const find = (i: number): number => {
      if (!parent.has(i)) parent.set(i, i);
      if (parent.get(i) !== i) {
        parent.set(i, find(parent.get(i)!));
      }
      return parent.get(i)!;
    };
    const union = (i: number, j: number) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) {
        parent.set(rootI, rootJ);
      }
    };

    const keyToItems = new Map<string, Item[]>();
    for (const item of allItems) {
      find(item.groupId);
      const key = itemClusterKey(item);
      if (key) {
        const existing = keyToItems.get(key) || [];
        for (const other of existing) {
          if (item.sourceId === other.sourceId) continue;
          // Bound GitHub repository clustering to a 14-day window so discussions
          // of older releases don't merge into a newer release months later.
          if (key.startsWith("github:")) {
            const tA = Date.parse(item.publishedAt || item.firstSeenAt);
            const tB = Date.parse(other.publishedAt || other.firstSeenAt);
            if (
              !Number.isNaN(tA) &&
              !Number.isNaN(tB) &&
              Math.abs(tA - tB) > GITHUB_CLUSTER_WINDOW_MS
            ) {
              continue;
            }
          }
          union(item.groupId, other.groupId);
        }
        existing.push(item);
        keyToItems.set(key, existing);
      }
    }

    const groups = new Map<number, Item[]>();
    for (const item of allItems) {
      const root = find(item.groupId);
      groups.set(root, [...(groups.get(root) || []), item]);
    }
    return groups;
  }
  stories(): Story[] {
    const profile = this.profile();
    const states = new Map(
      (
        this.db
          .prepare("SELECT * FROM personal_state WHERE profile_id=?")
          .all("local") as Record<string, any>[]
      ).map((r) => [r.group_id, r]),
    );
    const groups = this.clusteredGroups();
    const history = new Map(
      (
        this.db
          .prepare(
            "SELECT item_id,MAX(observed_at) AS changed_at FROM item_history GROUP BY item_id HAVING COUNT(*)>1",
          )
          .all() as { item_id: number; changed_at: string }[]
      ).map((row) => [row.item_id, row.changed_at]),
    );
    const memberships = this.db
      .prepare("SELECT topic_id,group_id FROM topic_items")
      .all() as { topic_id: string; group_id: number }[];
    const topicsByGroup = new Map<number, Set<string>>();
    for (const row of memberships) {
      if (!topicsByGroup.has(row.group_id))
        topicsByGroup.set(row.group_id, new Set());
      topicsByGroup.get(row.group_id)!.add(row.topic_id);
    }

    const grouped = [...groups.values()].map((items) => {
      const best = [...items].sort(
        (a, b) =>
          Number(b.sourceKind === "arxiv" || b.kind === "research") -
            Number(a.sourceKind === "arxiv" || a.kind === "research") ||
          Number(b.sourceKind === "github" || b.kind === "tools") -
            Number(a.sourceKind === "github" || a.kind === "tools") ||
          b.abstract.length +
            b.releaseText.length -
            (a.abstract.length + a.releaseText.length),
      )[0];
      const clusterGroupIds = [...new Set(items.map((i) => i.groupId))];
      const clusterStates = clusterGroupIds
        .map((id) => states.get(id))
        .filter((s): s is Record<string, any> => Boolean(s));
      const state = states.get(best.groupId);
      const isSaved = clusterStates.some((s) => s.saved);
      const isDismissed = clusterStates.some((s) => s.dismissed);
      const feedback = clusterStates.reduce(
        (acc, s) => (s.feedback !== 0 ? s.feedback : acc),
        state?.feedback || 0,
      );
      const note =
        state?.note ||
        clusterStates.find((s) => typeof s.note === "string" && s.note.trim())
          ?.note ||
        "";
      const version = best.metadata?.arxivVersion;
      const revisionObserved =
        version && version > 1 && best.metadata?.arxivId
          ? this.versions(best.metadata.arxivId).find(
              (v) => v.version === version,
            )?.observedAt
          : undefined;
      const links = [
        ...new Map(
          items
            .flatMap((i) => [
              { label: i.sourceName, url: i.canonicalUrl },
              ...i.links,
            ])
            .map((l) => [l.url, l]),
        ).values(),
      ];
      const storyTopicIds = [
        ...new Set(
          clusterGroupIds.flatMap((gId) => [
            ...(topicsByGroup.get(gId) || []),
          ]),
        ),
      ];
      return {
        ...best,
        firstSeenAt: items.map((i) => i.firstSeenAt).sort()[0],
        sources: [...new Set(items.map((i) => i.sourceName))],
        links,
        changedAt: [history.get(best.id), revisionObserved]
          .filter((v): v is string => !!v && v > best.firstSeenAt)
          .sort()
          .at(-1),
        read:
          !!state?.read &&
          (!state.read_token ||
            state.read_token ===
              `${best.contentHash}:${best.metadata?.arxivVersion || 0}`),
        saved: isSaved,
        dismissed: isDismissed,
        feedback,
        note,
        score: 0,
        reasons: [],
        followedTopicIds: storyTopicIds,
      };
    });
    return rankStories(grouped, profile);
  }
  followedTopics(): FollowedTopic[] {
    return (
      this.db
        .prepare(
          "SELECT payload FROM followed_topics WHERE profile_id='local' ORDER BY rowid",
        )
        .all() as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  saveTopic(topic: FollowedTopic) {
    this.db
      .prepare(
        "INSERT INTO followed_topics VALUES(?,'local',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
      )
      .run(topic.id, JSON.stringify(topic));
  }
  removeTopic(id: string) {
    this.db
      .prepare("DELETE FROM followed_topics WHERE id=? AND profile_id='local'")
      .run(id);
  }
  linkTopic(topicId: string, providerId: string, urls: string[]) {
    const insert = this.db.prepare(
      "INSERT OR IGNORE INTO topic_items SELECT ?,?,id FROM story_groups WHERE identity=?",
    );
    for (const url of urls) insert.run(topicId, providerId, normalizeUrl(url));
  }
  setState(
    groupId: number,
    patch: Partial<{
      read: boolean;
      saved: boolean;
      dismissed: boolean;
      feedback: number;
      note: string;
    }>,
  ) {
    if (!this.db.prepare("SELECT id FROM story_groups WHERE id=?").get(groupId))
      throw new Error("Story not found");
    const prior = this.db
      .prepare("SELECT * FROM personal_state WHERE profile_id=? AND group_id=?")
      .get("local", groupId) as Record<string, any> | undefined;
    const currentStory = this.stories().find((s) => s.groupId === groupId)!;
    const next = {
      read: currentStory?.read ?? !!prior?.read,
      saved: currentStory?.saved ?? !!prior?.saved,
      dismissed: currentStory?.dismissed ?? !!prior?.dismissed,
      feedback: currentStory?.feedback ?? (prior?.feedback || 0),
      note: currentStory?.note ?? (prior?.note || ""),
      ...patch,
    };
    const token =
      patch.read === true
        ? `${currentStory.contentHash}:${currentStory.metadata?.arxivVersion || 0}`
        : patch.read === false
          ? null
          : prior?.read_token || null;

    // Apply personal state consistently across all groupIds in the same clustered story
    const clusterItems =
      [...this.clusteredGroups().values()].find((items) =>
        items.some((i) => i.groupId === groupId),
      ) || [];
    const targetGroupIds = [
      ...new Set([groupId, ...clusterItems.map((i) => i.groupId)]),
    ];
    const upsertState = this.db.prepare(
      "INSERT INTO personal_state(profile_id,group_id,read,saved,dismissed,feedback,read_token,note) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(profile_id,group_id) DO UPDATE SET read=excluded.read,saved=excluded.saved,dismissed=excluded.dismissed,feedback=excluded.feedback,read_token=excluded.read_token,note=excluded.note",
    );
    for (const targetId of targetGroupIds) {
      upsertState.run(
        "local",
        targetId,
        +next.read,
        +next.saved,
        +next.dismissed,
        next.feedback,
        targetId === groupId ? token : null,
        next.note,
      );
    }

    if (patch.feedback !== undefined) {
      const profile = this.profile();
      const story = this.stories().find((s) => s.groupId === groupId);
      for (const topic of story?.topics || [])
        profile.weights[topic] = Math.max(
          -10,
          Math.min(
            10,
            (profile.weights[topic] || 0) +
              next.feedback -
              (prior?.feedback || 0),
          ),
        );
      this.saveProfile(profile);
    }
  }
  meta(key: string, value?: string) {
    if (value !== undefined)
      this.db
        .prepare(
          "INSERT INTO metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(key, value);
    return (
      this.db.prepare("SELECT value FROM metadata WHERE key=?").get(key) as
        { value: string } | undefined
    )?.value;
  }
  saveVersion(version: import("../shared/types.ts").PaperVersion) {
    const prior = this.versions(version.paperKey).find(
      (v) => v.version === version.version,
    );
    if (prior?.updatedAt && !version.updatedAt) return;
    this.db
      .prepare(
        "INSERT INTO paper_versions VALUES(?,?,?) ON CONFLICT(paper_key,version) DO UPDATE SET payload=json_set(excluded.payload,'$.observedAt',json_extract(paper_versions.payload,'$.observedAt'))",
      )
      .run(version.paperKey, version.version, JSON.stringify(version));
  }
  versions(paperKey: string): import("../shared/types.ts").PaperVersion[] {
    return (
      this.db
        .prepare(
          "SELECT payload FROM paper_versions WHERE paper_key=? ORDER BY version DESC",
        )
        .all(paperKey) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload));
  }
  close() {
    this.db.close();
  }
}
