import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Store as SharedStore } from "./store.ts";
import { migrate } from "./storage/migrate.ts";

export class Store extends SharedStore {
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const db = new DatabaseSync(path);
    migrate(db);
    super(db);
  }
}
