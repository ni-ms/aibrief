let worker: Worker | undefined;
let nextId = 0;
let failed: Error | undefined;
const pending = new Map<
  number,
  { resolve(value: unknown): void; reject(error: Error): void }
>();

// Development updates can replace this module without a pagehide event. Release
// its database lock before the replacement creates another worker.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    worker?.terminate();
    worker = undefined;
    for (const request of pending.values())
      request.reject(new Error("Your reading desk is reloading. Please try again."));
    pending.clear();
  });
}
export function browserRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (failed) return Promise.reject(failed);
  if (!worker) {
    worker = new Worker(
      new URL("../browser/database.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = ({ data }) => {
      if (data.storageError) {
        window.dispatchEvent(
          new CustomEvent("fieldnotes:storage-error", {
            detail: data.storageError,
          }),
        );
        return;
      }
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.result);
    };
    worker.onerror = () => {
      failed = new Error(
        "The local database worker stopped. Reload Fieldnotes to reopen your saved data.",
      );
      for (const request of pending.values()) request.reject(failed);
      pending.clear();
      worker?.terminate();
    };
    window.addEventListener("pagehide", () => worker?.terminate());
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) window.location.reload();
    });
  }
  return new Promise<T>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve: (value) => resolve(value as T), reject });
    worker!.postMessage({ id, path, method, body });
  });
}
