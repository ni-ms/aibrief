import type { Store } from "../db.ts";
import type { ResearchTrail, TrailLink } from "../../shared/types.ts";
import { arxivIdentity } from "../../shared/trail.ts";
export class TrailStore {
  constructor(privateStore: Store) {
    this.store = privateStore;
  }
  private store: Store;
  read(groupId: number): ResearchTrail {
    const story = this.store.stories().find((s) => s.groupId === groupId);
    if (!story) throw new Error("Paper not found");
    const row = this.store.db
      .prepare("SELECT payload FROM research_trails WHERE group_id=?")
      .get(groupId) as { payload: string } | undefined;
    const identity = arxivIdentity(story.canonicalUrl);
    const base: ResearchTrail = row
      ? JSON.parse(row.payload)
      : {
          groupId,
          paperUrl: story.canonicalUrl,
          paperKey: identity?.id || null,
          versions: [],
          code: [],
          followUps: [],
          checks: {},
          lastAttempt: null,
          refreshing: false,
          citationsPartial: false,
        };
    base.versions = identity ? this.store.versions(identity.id) : [];
    const manual = (
      this.store.db
        .prepare(
          "SELECT payload FROM trail_links WHERE group_id=? AND hidden=0",
        )
        .all(groupId) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload) as TrailLink);
    return {
      ...base,
      code: [
        ...base.code.filter((l) => l.relation !== "user"),
        ...manual.filter((l) => l.kind === "code"),
      ],
      followUps: [
        ...base.followUps.filter((l) => l.relation !== "user"),
        ...manual.filter((l) => l.kind === "followup"),
      ],
    };
  }
  save(trail: ResearchTrail) {
    this.store.db
      .prepare(
        "INSERT INTO research_trails VALUES(?,?) ON CONFLICT(group_id) DO UPDATE SET payload=excluded.payload",
      )
      .run(
        trail.groupId,
        JSON.stringify({
          ...trail,
          refreshing: false,
          code: trail.code.filter((l) => l.relation !== "user"),
          followUps: trail.followUps.filter((l) => l.relation !== "user"),
        }),
      );
  }
  manual(groupId: number, link: TrailLink) {
    this.read(groupId);
    this.store.db
      .prepare("INSERT INTO trail_links VALUES(?,?,?,0)")
      .run(groupId, link.id, JSON.stringify(link));
  }
  hide(groupId: number, id: string, hidden: boolean) {
    this.store.db
      .prepare("UPDATE trail_links SET hidden=? WHERE group_id=? AND id=?")
      .run(+hidden, groupId, id);
  }
  watched() {
    return (
      this.store.db
        .prepare(
          "SELECT group_id FROM research_trails ORDER BY json_extract(payload,'$.lastAttempt') DESC,group_id DESC LIMIT 10",
        )
        .all() as { group_id: number }[]
    ).map((r) => r.group_id);
  }
}
