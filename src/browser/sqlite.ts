import initSqlJs, {
  type Database,
  type SqlJsStatic,
  type SqlValue as WasmValue,
} from "sql.js";
import type { SqlDatabase, SqlValue } from "../../server/storage/database.ts";

/** Synchronous SQL stays in a worker; durable snapshots live in IndexedDB. */
export class BrowserDatabase implements SqlDatabase {
  raw: Database;
  revision = 0;
  onChange = () => {};
  constructor(raw: Database) {
    this.raw = raw;
    raw.run("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE;");
  }
  private changed() {
    this.revision++;
    this.onChange();
  }
  exec(sql: string) {
    this.raw.run(sql);
    this.changed();
  }
  prepare(sql: string) {
    const query = (values: SqlValue[], first: boolean) => {
      const statement = this.raw.prepare(sql);
      try {
        statement.bind(
          values.map((v) =>
            typeof v === "bigint" ? Number(v) : v,
          ) as WasmValue[],
        );
        const rows: Record<string, WasmValue>[] = [];
        while (statement.step()) {
          rows.push(statement.getAsObject());
          if (first) break;
        }
        return rows;
      } finally {
        statement.free();
      }
    };
    return {
      all: (...values: SqlValue[]) => query(values, false),
      get: (...values: SqlValue[]) => query(values, true)[0],
      run: (...values: SqlValue[]) => {
        query(values, false);
        this.changed();
      },
    };
  }
  snapshot() {
    // sql.js reopens its in-memory connection on export, resetting PRAGMAs.
    const bytes = this.raw.export();
    this.raw.run("PRAGMA foreign_keys=ON; PRAGMA journal_mode=DELETE;");
    return bytes;
  }
  close() {
    this.raw.close();
  }
}

export async function loadSqlite(wasmUrl?: string): Promise<SqlJsStatic> {
  return initSqlJs(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
}
