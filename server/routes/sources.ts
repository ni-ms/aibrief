import { Router } from "../router.ts";
import { z } from "zod";
import type { Store } from "../db.ts";
import type { Collector } from "../collector.ts";
import { RESOURCES } from "../resources.ts";
import { normalizeSubreddit } from "../../shared/reddit.ts";
import { normalizeMedium } from "../../shared/medium.ts";
import { normalizeSubstack } from "../../shared/substack.ts";
import { normalizeFeedUrl } from "../../shared/feeds.ts";
import { redditConnection } from "../sources/reddit.ts";
import { mediumConnection } from "../sources/medium.ts";
export function sourcesRoutes(store: Store, collector: Collector) {
  const router = Router();
  router.get("/resources", (_req, res) =>
    res.json(
      RESOURCES.map((r) =>
        r.id === "reddit"
          ? { ...r, ...redditConnection() }
          : r.id === "medium"
            ? { ...r, ...mediumConnection() }
            : r,
      ),
    ),
  );
  const sourceSchema = z.object({
    id: z.string().regex(/^[a-z0-9-]{1,70}$/),
    kind: z.enum([
      "arxiv",
      "hn",
      "github",
      "openreview",
      "rss",
      "bluesky",
      "reddit",
      "medium",
      "hf-papers",
      "substack",
      "lobsters",
    ]),
    resourceId: z.string().max(40).optional(),
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    config: z.object({
      subreddit: z
        .string()
        .max(300)
        .transform((value, ctx) => {
          try {
            return normalizeSubreddit(value);
          } catch (error) {
            ctx.addIssue({
              code: "custom",
              message:
                error instanceof Error ? error.message : "Invalid subreddit",
            });
            return z.NEVER;
          }
        })
        .optional(),
      medium: z
        .string()
        .max(300)
        .transform((value, ctx) => {
          try {
            return normalizeMedium(value);
          } catch (error) {
            ctx.addIssue({
              code: "custom",
              message:
                error instanceof Error
                  ? error.message
                  : "Invalid Medium source",
            });
            return z.NEVER;
          }
        })
        .optional(),
      substack: z
        .string()
        .max(300)
        .transform((value, ctx) => {
          try {
            return normalizeSubstack(value);
          } catch (error) {
            ctx.addIssue({
              code: "custom",
              message:
                error instanceof Error
                  ? error.message
                  : "Invalid Substack source",
            });
            return z.NEVER;
          }
        })
        .optional(),
      lobsters: z.string().max(100).optional(),
      sort: z.enum(["new", "hot", "top"]).optional(),
      venue: z
        .string()
        .regex(/^[A-Za-z0-9_.-]+\/\d{4}\/[A-Za-z0-9_/-]+$/)
        .optional(),
      actor: z
        .string()
        .regex(/^[a-zA-Z0-9][a-zA-Z0-9.:-]{2,250}$/)
        .optional(),
      url: z
        .string()
        .max(500)
        .transform((value, ctx) => {
          try {
            return normalizeFeedUrl(value);
          } catch (error) {
            ctx.addIssue({
              code: "custom",
              message:
                error instanceof Error
                  ? error.message
                  : "Use a public HTTPS feed URL",
            });
            return z.NEVER;
          }
        })
        .optional(),
      searchTerms: z.array(z.string().min(1).max(100)).max(6).optional(),
      categories: z
        .array(z.string().regex(/^[a-z][a-z0-9-]*(\.[A-Z]{2})?$/))
        .min(1)
        .max(10)
        .optional(),
      repo: z
        .string()
        .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/)
        .optional(),
      limit: z.number().int().min(12).max(180).optional(),
    }),
  });
  router.put("/sources/:id", (req, res) => {
    const body = sourceSchema.parse({ ...req.body, id: req.params.id });
    if (
      (body.kind === "arxiv" && !body.config.categories) ||
      (body.kind === "github" && !body.config.repo) ||
      (body.kind === "openreview" && !body.config.venue) ||
      (body.kind === "bluesky" && !body.config.actor) ||
      (body.kind === "reddit" && !body.config.subreddit) ||
      (body.kind === "medium" && !body.config.medium) ||
      (body.kind === "substack" && !body.config.substack) ||
      (body.kind === "rss" && !body.config.url)
    )
      return res.status(400).json({ error: "Missing source configuration" });
    const old = store.sources().find((s) => s.id === body.id);
    if (!old && store.sources().length >= 50)
      return res.status(400).json({ error: "Maximum 50 configured sources" });
    const changed =
      old && JSON.stringify(old.config) !== JSON.stringify(body.config);
    store.saveSource({
      ...body,
      lastAttempt: changed ? null : old?.lastAttempt || null,
      lastSuccess: changed ? null : old?.lastSuccess || null,
      error: changed ? null : old?.error || null,
    });
    res.json({ ok: true });
    if (body.enabled && (!old || changed || !old.enabled))
      void collector.refresh(true);
  });
  router.post("/sources/:id/refresh", (req, res) => {
    const source = store.sources().find((s) => s.id === req.params.id);
    if (!source) return res.status(404).json({ error: "Source not found" });
    void collector.refreshSource(req.params.id, true);
    res.status(202).json({ ok: true, syncing: true });
  });

  return router;
}
