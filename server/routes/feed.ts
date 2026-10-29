import { Router } from "../router.ts";
import { z } from "zod";
import type { Store } from "../db.ts";
import type { Collector } from "../collector.ts";
export function feedRoutes(store: Store, collector: Collector) {
  const router = Router();
  router.get("/feed", (_req, res) => {
    const sources = store.sources();
    const successes = sources
      .filter((s) => s.enabled && s.lastSuccess)
      .map((s) => s.lastSuccess!)
      .sort();
    successes.push(
      ...store
        .followedTopics()
        .filter((t) => !t.paused)
        .flatMap((t) =>
          Object.values(t.checks).flatMap((c) =>
            c.lastSuccess ? [c.lastSuccess] : [],
          ),
        ),
    );
    successes.sort();
    res.json({
      stories: store.stories(),
      profile: store.profile(),
      sources,
      followedTopics: store.followedTopics(),
      syncing: collector.syncing || collector.topics.syncing,
      syncingSourceIds: collector.syncingSourceIds,
      collectedAt: successes.at(-1) || null,
    });
  });
  router.post("/refresh", (req, res) => {
    const force = req.body?.force ?? true;
    void collector.refresh(true, force);
    res.status(202).json({
      syncing: collector.syncing,
      note: "Sources checked with fast lane and rate-limited queue.",
    });
  });
  router.post("/visit", (_req, res) => {
    const profile = store.profile();
    const previous = profile.lastVisit;
    profile.lastVisit = new Date().toISOString();
    store.saveProfile(profile);
    res.json({ previous, current: profile.lastVisit });
  });
  router.patch("/stories/:id", (req, res) => {
    const body = z
      .object({
        read: z.boolean().optional(),
        saved: z.boolean().optional(),
        dismissed: z.boolean().optional(),
        feedback: z.number().int().min(-1).max(1).optional(),
        note: z.string().max(10000).optional(),
      })
      .strict()
      .parse(req.body);
    store.setState(
      z.coerce.number().int().positive().parse(req.params.id),
      body,
    );
    res.json({ ok: true });
  });

  return router;
}
