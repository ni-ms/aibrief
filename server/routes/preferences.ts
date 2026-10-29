import { z } from "zod";
import { Router } from "../router.ts";
import type { Store } from "../store.ts";

const keys = [
  "page-size",
  "summary-depth",
  "model",
  "ai-enabled",
  "ai-endpoint",
  "ai-endpoint-model",
  "theme",
  "onboarding",
  "sidebar-collapsed",
  "search-mode-type",
  "feedback-log",
] as const;
export function preferenceRoutes(store: Store) {
  const router = Router();
  router.get("/preferences", (_req, res) => {
    res.json(
      Object.fromEntries(
        keys.flatMap((key) => {
          const value = store.meta(`preference:${key}`);
          return value === undefined ? [] : [[key, value]];
        }),
      ),
    );
  });
  router.put("/preferences/:key", (req, res) => {
    const key = z.enum(keys).parse(req.params.key);
    const { value } = z.object({ value: z.string().max(8000) }).parse(req.body);
    store.meta(`preference:${key}`, value);
    res.json({ ok: true });
  });
  return router;
}
