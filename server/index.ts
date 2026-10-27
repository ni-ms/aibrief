import { resolve } from "node:path";
import { Store } from "./db.ts";
import { Collector } from "./collector.ts";
import { HttpClient } from "./http.ts";
import { TrailService } from "./trails/service.ts";
import { createApp } from "./app.ts";
const store = new Store(
  process.env.DB_PATH || resolve("data/fieldnotes.sqlite"),
);
const http = new HttpClient(store);
const collector = new Collector(store, http);
const trails = new TrailService(store, http);
const app = createApp(store, collector, trails);
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Fieldnotes backend: http://127.0.0.1:${port}`);
  if (process.env.COLLECT_ON_START !== "false")
    void collector.refresh().then(() => trails.refreshWatched());
});
const interval = setInterval(
  () => void collector.refresh().then(() => trails.refreshWatched()),
  15 * 60 * 1000,
); // Check source-specific six-hour staleness, including after wake.
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    clearInterval(interval);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500).unref();
  });
