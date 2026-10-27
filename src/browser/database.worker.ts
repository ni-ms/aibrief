/// <reference lib="webworker" />
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import schema from "../../server/storage/schema.sql?raw";
import { Store } from "../../server/store.ts";
import { migrateSchema } from "../../server/storage/migrate-schema.ts";
import { BrowserDatabase, loadSqlite } from "./sqlite.ts";
import { openSnapshots, SnapshotWriter } from "./persistence.ts";
import { createBrowserRuntime } from "./runtime.ts";
import { z } from "zod";
import { validateBackup } from "./restore.ts";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const databaseName = `fieldnotes:${import.meta.env.BASE_URL}`;
const errorMessage = (error: unknown) =>
  error instanceof z.ZodError
    ? "Invalid input: " + error.issues.map((issue) => issue.message).join(", ")
    : error instanceof Error
      ? error.message
      : "Your local database could not be opened or saved.";
const reportError = (error: unknown) =>
  scope.postMessage({ storageError: errorMessage(error) });
const browserSchema = schema.replace(
  "PRAGMA journal_mode = WAL;",
  "PRAGMA journal_mode = DELETE;",
);
let restoring = false;

async function initialize() {
  const snapshots = await openSnapshots(databaseName);
  const SQL = await loadSqlite(wasmUrl);
  const saved = await snapshots.read();
  const db = new BrowserDatabase(new SQL.Database(saved));
  migrateSchema(db, browserSchema);
  const store = new Store(db);
  const runtime = createBrowserRuntime(store);
  const writer = new SnapshotWriter(db, snapshots, reportError);
  await writer.flush();
  const refresh = () =>
    void runtime
      .refresh()
      .then(() => writer.flush())
      .catch(reportError);
  setTimeout(refresh, 1000);
  setInterval(refresh, 15 * 60 * 1000);
  return { SQL, db, store, writer, runtime };
}

// One writer per database prevents a second tab from overwriting newer snapshots.
const ready = new Promise<Awaited<ReturnType<typeof initialize>>>(
  (resolve, reject) => {
    if (!navigator.locks) {
      reject(
        new Error(
          "This browser cannot safely lock your database. Use an up-to-date browser over HTTPS or localhost.",
        ),
      );
      return;
    }
    void navigator.locks
      .request(databaseName, { ifAvailable: true }, async (lock) => {
        if (!lock)
          throw new Error(
            "Fieldnotes is already open in another tab. Close that tab, then reload this one to protect your saved data.",
          );
        resolve(await initialize());
        await new Promise(() => {}); // Held until this worker closes.
      })
      .catch(reject);
  },
);
// Attach a rejection handler before the first message arrives.
void ready.catch(() => {});

scope.onmessage = async ({ data: { id, path, method, body } }) => {
  try {
    const { SQL, db, writer, runtime } = await ready;
    if (restoring)
      throw new Error("Restoring your database. Please reload in a moment.");
    let result: unknown;
    if (path === "/storage/export") {
      await writer.flush();
      result = db.snapshot();
    } else if (path === "/storage/import") {
      const bytes = validateBackup(SQL, body, browserSchema);
      restoring = true;
      try {
        await writer.replace(bytes);
        scope.postMessage({ id, result: { ok: true } });
        scope.close();
        return;
      } catch (error) {
        restoring = false;
        throw error;
      }
    } else {
      result = await runtime.dispatch(path, method, body);
    }
    await writer.flush();
    scope.postMessage({ id, result });
  } catch (error) {
    scope.postMessage({ id, error: errorMessage(error) });
  }
};
