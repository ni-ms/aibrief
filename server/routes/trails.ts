import { Router } from "../router.ts";
import { z } from "zod";
import type { Store } from "../db.ts";
import type { TrailService } from "../trails/service.ts";
import { normalizeUrl } from "../normalize.ts";
import { assertPublicFeedUrl } from "#platform";
export function trailRoutes(store: Store, trails: TrailService) {
  const router = Router();
  router.get("/trails/:id", (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    if (!store.stories().some((s) => s.groupId === id))
      return res.status(404).json({ error: "Paper not found" });
    res.json(trails.read(id));
  });
  router.post("/trails/:id/refresh", (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    if (!store.stories().some((s) => s.groupId === id))
      return res.status(404).json({ error: "Paper not found" });
    void trails.refresh(id, true);
    res.status(202).json(trails.read(id));
  });
  router.post("/trails/:id/links", async (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const paper = store.stories().find((s) => s.groupId === id);
    if (!paper) return res.status(404).json({ error: "Paper not found" });
    const body = z
      .object({
        kind: z.enum(["code", "followup"]),
        url: z.url().max(1500),
        title: z.string().min(1).max(300),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);
    try {
      await assertPublicFeedUrl(body.url);
    } catch (e) {
      return res.status(400).json({ error: (e as Error).message });
    }
    const url = normalizeUrl(body.url);
    const prior = trails.read(id);
    if (
      [...prior.code, ...prior.followUps].some(
        (link) => link.kind === body.kind && link.url === url,
      )
    )
      return res
        .status(409)
        .json({ error: "This link is already in the trail." });
    if (url === paper.canonicalUrl)
      return res
        .status(400)
        .json({ error: "A paper cannot be its own follow-up." });
    trails.data.manual(id, {
      id: crypto.randomUUID(),
      kind: body.kind,
      url,
      title: body.title,
      relation: "user",
      evidenceUrl: paper.canonicalUrl,
      evidenceText:
        body.note || "Added by you; relationship not independently verified.",
    });
    res.status(201).json(trails.read(id));
  });
  router.patch("/trails/:id/links/:linkId", (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { hidden } = z.object({ hidden: z.boolean() }).parse(req.body);
    if (!store.stories().some((s) => s.groupId === id))
      return res.status(404).json({ error: "Paper not found" });
    if (
      !store.db
        .prepare("SELECT id FROM trail_links WHERE group_id=? AND id=?")
        .get(id, String(req.params.linkId))
    )
      return res.status(404).json({ error: "Link not found" });
    trails.data.hide(id, String(req.params.linkId), hidden);
    res.json(trails.read(id));
  });
  return router;
}
