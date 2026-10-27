import { Router } from "../router.ts";
import { z } from "zod";
import type { Store } from "../db.ts";
import type { Collector } from "../collector.ts";
import { queryWords } from "../topics.ts";
const searchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(160)
    .refine((q) => queryWords(q).length > 0, "Enter a topic"),
  providers: z
    .array(z.string().min(1).max(70))
    .min(1)
    .max(20)
    .transform((ids) => [...new Set(ids)]),
});
export function topicRoutes(store: Store, collector: Collector) {
  const router = Router();
  router.get("/discovery/providers", (_req, res) =>
    res.json(collector.topics.providers()),
  );
  router.post("/discover", async (req, res) => {
    const body = searchSchema.parse(req.body);
    try {
      collector.topics.validateProviders(body.providers);
    } catch {
      return res.status(400).json({ error: "Unknown discovery provider" });
    }
    res.json(await collector.topics.discover(body.query, body.providers));
  });
  router.post("/topics", (req, res) => {
    const body = searchSchema.parse(req.body);
    try {
      const topic = collector.topics.follow(body.query, body.providers);
      res.status(201).json(topic);
      void collector.topics.refresh(topic.id, true);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
  router.patch("/topics/:id", (req, res) => {
    const patch = z
      .object({
        name: z.string().trim().min(1).max(160).optional(),
        paused: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    const topic = store.followedTopics().find((t) => t.id === req.params.id);
    if (!topic) return res.status(404).json({ error: "Topic not found" });
    const next = { ...topic, ...patch };
    if (topic.paused && patch.paused === false)
      next.checks = Object.fromEntries(
        Object.entries(topic.checks).map(([id, check]) => [
          id,
          { ...check, lastAttempt: null },
        ]),
      );
    store.saveTopic(next);
    res.json(next);
    if (topic.paused && !next.paused)
      void collector.topics.refresh(topic.id, true);
  });
  router.delete("/topics/:id", (req, res) => {
    store.removeTopic(String(req.params.id));
    res.json({ ok: true });
  });
  return router;
}
