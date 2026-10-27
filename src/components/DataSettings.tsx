import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function DataSettings() {
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<File | null>(null);
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersistent);
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="page model-page">
      <div className="page-title">
        <h1>Your data</h1>
        <span className="status-label">On this device</span>
      </div>
      <div className="model-settings">
        <p>
          Your feed, saved reading, topics, summaries, and preferences are
          stored in this browser. Fieldnotes does not upload your database. Your
          browser contacts sources directly to check for updates.
        </p>
        <p>
          Data stays with this browser profile and site address. Clearing site
          data removes it. Backups let you move it to another browser or restore
          it later.
        </p>
        <div className="model-controls">
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const bytes = await api<Uint8Array>("/storage/export");
                const url = URL.createObjectURL(
                  new Blob([new Uint8Array(bytes)], {
                    type: "application/vnd.sqlite3",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download = `fieldnotes-${new Date().toISOString().slice(0, 10)}.sqlite`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setMessage(
                  "Backup downloaded. Keep it somewhere private; it is not encrypted.",
                );
              })
            }
          >
            Download backup
          </button>
          <button
            className="button"
            disabled={busy || persistent === true}
            onClick={() =>
              void run(async () => {
                const granted = (await navigator.storage?.persist?.()) || false;
                setPersistent(granted);
                setMessage(
                  granted
                    ? "Persistent storage is enabled. Keep backups too."
                    : "Your browser has not granted persistent storage. Keep regular backups.",
                );
              })
            }
          >
            {persistent
              ? "Persistent storage enabled"
              : "Keep data on this device"}
          </button>
        </div>
        <h2>Restore a backup</h2>
        <p>
          Choose a Fieldnotes SQLite backup, including one from the earlier
          local server. Restoring replaces this browser’s reading desk. Download
          a backup of the current data first if you want to keep it.
        </p>
        <label htmlFor="database-backup">SQLite backup</label>
        <input
          id="database-backup"
          type="file"
          accept=".sqlite,.sqlite3,.db"
          disabled={busy}
          onChange={(event) => setBackup(event.target.files?.[0] || null)}
        />
        {backup && (
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (backup.size > 100_000_000)
                  throw new Error("Choose a backup smaller than 100 MB.");
                await api(
                  "/storage/import",
                  "PUT",
                  new Uint8Array(await backup.arrayBuffer()),
                );
                window.location.reload();
              })
            }
          >
            Replace current data with {backup.name}
          </button>
        )}
        {message && (
          <p role="status" className="device-status">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        <details className="method-details">
          <summary>Storage and privacy</summary>
          <p>
            SQLite runs as WebAssembly in a separate worker, and committed
            database snapshots are saved in IndexedDB. No reading data or
            settings use localStorage or sessionStorage. Model downloads use the
            AI library’s browser cache.
          </p>
          <p>
            Browser storage is isolated by origin, but is not password
            encrypted. Other apps on the same origin share that security
            boundary. Use a separate browser profile on shared computers.
            Browsers may remove nonpersistent data under storage pressure, and
            private browsing may discard it when closed.
          </p>
          <p>
            Keep one Fieldnotes tab open at a time to prevent conflicting
            database writes. Collection runs while that tab is open and awake.
            Some sources do not permit direct browser access; failures keep the
            last collected items.
          </p>
        </details>
      </div>
    </section>
  );
}
