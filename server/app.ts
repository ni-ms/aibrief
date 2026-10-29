import express from "express";
import { resolve } from "node:path";
import { z } from "zod";
import type { Store } from "./db.ts";
import type { Collector } from "./collector.ts";
import { feedRoutes } from "./routes/feed.ts";
import { profileRoutes } from "./routes/profile.ts";
import { sourcesRoutes } from "./routes/sources.ts";
import { HttpClient } from "./http.ts";
import { TrailService } from "./trails/service.ts";
import { trailRoutes } from "./routes/trails.ts";
import { summariesRoutes } from "./routes/summaries.ts";
import { topicRoutes } from "./routes/topics.ts";
import { OpenSourceService } from "./open-source.ts";
import { openSourceRoutes } from "./routes/open-source.ts";
import { preferenceRoutes } from "./routes/preferences.ts";
import { handleProxyRequest } from "./routes/proxy.ts";
export function createApp(
  store: Store,
  collector: Collector,
  trails = new TrailService(store, new HttpClient(store)),
  openSource = new OpenSourceService(store),
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || ""))
      return res.status(403).json({ error: "Local access only" });
    if (
      req.headers.origin &&
      !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)
    )
      return res.status(403).json({ error: "Local origin required" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(express.json({ limit: "96kb" }));
  app.get("/api/proxy", (req, res) => handleProxyRequest(req, res));
  const routes = [
    trailRoutes(store, trails),
    feedRoutes(store, collector),
    profileRoutes(store, collector),
    sourcesRoutes(store, collector),
    summariesRoutes(store, collector),
    topicRoutes(store, collector),
    openSourceRoutes(openSource),
    preferenceRoutes(store),
  ];
  app.use("/api", async (req, res, next) => {
    for (const router of routes) {
      const result = await router.dispatch(req.url, req.method, req.body);
      if (result) return res.status(result.status).json(result.body);
    }
    next();
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Unknown API route" }),
  );
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) =>
      res.status(error instanceof z.ZodError ? 400 : 500).json({
        error:
          error instanceof z.ZodError
            ? "Invalid request: " +
              error.issues.map((i) => i.message).join(", ")
            : error.message,
      }),
  );
  return app;
}
