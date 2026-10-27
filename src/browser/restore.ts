import type { SqlJsStatic } from "sql.js";
import { BrowserDatabase } from "./sqlite.ts";
import { Store } from "../../server/store.ts";
import { migrateSchema } from "../../server/storage/migrate-schema.ts";

/** Fully validate and migrate a separate connection before replacing saved data. */
export function validateBackup(
  SQL: SqlJsStatic,
  bytes: unknown,
  schema: string,
) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 100_000_000)
    throw new Error("Choose a Fieldnotes SQLite backup smaller than 100 MB.");
  const candidate = new BrowserDatabase(new SQL.Database(bytes));
  try {
    const check = candidate.prepare("PRAGMA quick_check").get() as {
      quick_check: string;
    };
    if (check.quick_check !== "ok")
      throw new Error("This SQLite backup is damaged.");
    const tables = candidate
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    if (
      !["sources", "items", "profiles", "personal_state"].every((name) =>
        tables.some((table) => table.name === name),
      )
    )
      throw new Error("This is not a Fieldnotes database.");
    migrateSchema(candidate, schema);
    const imported = new Store(candidate);
    imported.profile();
    imported.stories();
    imported.followedTopics();
    return candidate.snapshot();
  } finally {
    candidate.close();
  }
}
