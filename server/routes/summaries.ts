import { Router } from "../router.ts";
import { z } from "zod";
import type { Store } from "../db.ts";
import type { Collector } from "../collector.ts";
import {
  PROMPT_VERSION,
  SummarySchema,
  DepthSchema,
  summaryInput,
  summaryInterests,
} from "../../shared/summary.ts";
export function summariesRoutes(store: Store, _collector: Collector) {
  const router = Router();
  router.get("/summaries/:id", (req, res) => {
    const item = store.items().find((i) => i.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: "Item not found" });
    const depth = DepthSchema.parse(req.query.depth || "standard");
    const input = summaryInput(item, summaryInterests(store.profile()));
    const row = store.db
      .prepare(
        "SELECT result,created_at FROM summary_results WHERE input_text=? AND depth=? AND model_id=? AND prompt_version=? AND interest_key=?",
      )
      .get(
        input,
        depth,
        String(req.query.model || ""),
        PROMPT_VERSION,
        String(req.query.interestKey || ""),
      ) as { result: string; created_at: string } | undefined;
    res.json(
      row
        ? { result: JSON.parse(row.result), createdAt: row.created_at, depth }
        : null,
    );
  });
  router.put("/summaries/:id", (req, res) => {
    const body = z
      .object({
        contentHash: z.string().length(64),
        inputText: z.string().max(16000),
        depth: DepthSchema,
        model: z.string().min(1).max(150),
        interestKey: z.string().max(64),
        result: SummarySchema,
      })
      .parse(req.body);
    const item = store.items().find((i) => i.id === Number(req.params.id));
    if (
      !item ||
      item.contentHash !== body.contentHash ||
      body.inputText !== summaryInput(item, summaryInterests(store.profile()))
    )
      return res
        .status(409)
        .json({ error: "Source or interests changed; regenerate summary" });
    store.db
      .prepare("INSERT OR REPLACE INTO summary_results VALUES(?,?,?,?,?,?,?)")
      .run(
        body.inputText,
        body.depth,
        body.model,
        PROMPT_VERSION,
        body.interestKey,
        JSON.stringify(body.result),
        new Date().toISOString(),
      );
    res.json({ ok: true });
  });
  return router;
}
