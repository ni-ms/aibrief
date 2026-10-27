import type { SqlDatabase } from "./database.ts";
/** Additive migrations retain existing content and personal state. */
export function migrateSchema(db: SqlDatabase, schema: string) {
  db.exec(schema);
  const columns = db.prepare("PRAGMA table_info(items)").all() as {
    name: string;
  }[];
  if (!columns.some((c) => c.name === "metadata"))
    db.exec("ALTER TABLE items ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
  const personalColumns = db
    .prepare("PRAGMA table_info(personal_state)")
    .all() as { name: string }[];
  if (!personalColumns.some((c) => c.name === "read_token"))
    db.exec("ALTER TABLE personal_state ADD COLUMN read_token TEXT");
  db.exec(`UPDATE personal_state SET read_token=(
    SELECT i.content_hash||':'||COALESCE(json_extract(i.metadata,'$.arxivVersion'),0) FROM items i
    WHERE i.group_id=personal_state.group_id ORDER BY length(i.abstract)+length(i.release_text) DESC LIMIT 1
  ) WHERE read=1 AND read_token IS NULL;`);
  db.exec(`INSERT OR IGNORE INTO item_history(item_id,content_hash,observed_at,payload)
    SELECT id,content_hash,last_fetched_at,json_object('title',title,'abstract',abstract,'releaseText',release_text,'metadata',json(metadata)) FROM items; PRAGMA user_version=4;`);
}
