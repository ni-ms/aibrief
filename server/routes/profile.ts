import { Router } from "../router.ts";
import { z } from "zod";
import type { Store } from "../db.ts";
import type { Collector } from "../collector.ts";
import { INTEREST_ARXIV_CATEGORIES } from "../config.ts";
import { deriveTerms, labelTopics } from "../../shared/interests.ts";
export function profileRoutes(store: Store, collector: Collector) {
  const router = Router();
  router.put("/profile", (req, res) => {
    const body = z
      .object({
        prompt: z.string().min(1).max(2000),
        focusTerms: z.array(z.string().min(1).max(100)).max(6).optional(),
        excludeTerms: z.array(z.string().min(1).max(100)).max(30).optional(),
        strictFocus: z.boolean().optional(),
        terms: z.array(z.string().min(1).max(80)).max(70).optional(),
      })
      .parse(req.body);
    const profile = {
      ...store.profile(),
      prompt: body.prompt,
      terms: body.terms || deriveTerms(body.prompt),
      focusTerms: body.focusTerms || [],
      excludeTerms: body.excludeTerms || [],
      strictFocus: body.strictFocus || false,
    };
    store.saveProfile(profile);
    const sources = store.sources();
    const configured = new Set(
      sources
        .filter((s) => s.kind === "arxiv")
        .flatMap((s) => s.config.categories || []),
    );
    for (const topic of labelTopics(
      `${body.prompt} ${profile.focusTerms.join(" ")}`,
    )) {
      const categories = (INTEREST_ARXIV_CATEGORIES[topic] || []).filter(
        (c) => !configured.has(c),
      );
      if (categories.length && sources.length < 20) {
        const source = {
          id: `interest-${crypto.randomUUID().slice(0, 8)}`,
          kind: "arxiv" as const,
          name: `arXiv · ${topic}`,
          enabled: true,
          config: { categories },
          lastSuccess: null,
          lastAttempt: null,
          error: null,
        };
        store.saveSource(source);
        sources.push(source);
        for (const c of categories) configured.add(c);
      }
    }
    res.json(profile);
    void collector.refresh(true);
  });

  return router;
}
