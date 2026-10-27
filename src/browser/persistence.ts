import type { BrowserDatabase } from "./sqlite.ts";

export async function openSnapshots(name: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("database");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other Fieldnotes tabs to open your data."));
  });
  db.onversionchange = () => db.close();
  return {
    async read(): Promise<Uint8Array | undefined> {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("database", "readonly");
        const request = transaction.objectStore("database").get("sqlite");
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
    },
    async write(bytes: Uint8Array): Promise<void> {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction("database", "readwrite", {
          durability: "strict",
        });
        transaction.objectStore("database").put(bytes, "sqlite");
        transaction.oncomplete = () => resolve();
        transaction.onabort = () =>
          reject(
            transaction.error ||
              new Error("Could not save your local database."),
          );
        transaction.onerror = () => reject(transaction.error);
      });
    },
    close() {
      db.close();
    },
  };
}

/** Acknowledge mutations only after the IndexedDB transaction commits. */
export class SnapshotWriter {
  private db: BrowserDatabase;
  private snapshots: Pick<Awaited<ReturnType<typeof openSnapshots>>, "write">;
  private reportError: (error: unknown) => void;
  private savedRevision = -1;
  private writing: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  constructor(
    db: BrowserDatabase,
    snapshots: Pick<Awaited<ReturnType<typeof openSnapshots>>, "write">,
    reportError: (error: unknown) => void,
  ) {
    this.db = db;
    this.snapshots = snapshots;
    this.reportError = reportError;
    db.onChange = () => {
      if (this.stopped || this.timer) return;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.flush().catch(this.reportError);
      }, 100);
    };
  }
  async flush(): Promise<void> {
    if (!this.writing)
      this.writing = (async () => {
        while (!this.stopped && this.savedRevision !== this.db.revision) {
          const revision = this.db.revision;
          await this.snapshots.write(this.db.snapshot());
          this.savedRevision = revision;
        }
      })().finally(() => {
        this.writing = undefined;
      });
    await this.writing;
    // A caller can mutate after the final revision check but before the write
    // promise settles. That caller must wait for its own durable commit.
    if (!this.stopped && this.savedRevision !== this.db.revision)
      await this.flush();
  }
  async replace(bytes: Uint8Array) {
    this.stopped = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    try {
      await this.writing;
      await this.snapshots.write(bytes);
    } catch (error) {
      this.stopped = false;
      throw error;
    }
  }
}
