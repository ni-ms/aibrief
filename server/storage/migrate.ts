import { readFileSync } from "node:fs";
import type { SqlDatabase } from "./database.ts";
import { migrateSchema } from "./migrate-schema.ts";
export function migrate(db: SqlDatabase) {
  migrateSchema(
    db,
    readFileSync(new URL("./schema.sql", import.meta.url), "utf8"),
  );
}
