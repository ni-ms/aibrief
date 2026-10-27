import { Router } from "../router.ts";
import { z } from "zod";
import { githubUsername } from "../../shared/open-source.ts";
import type { OpenSourceService } from "../open-source.ts";

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(250)
  .transform((value, ctx) => {
    try {
      return githubUsername(value);
    } catch (error) {
      ctx.addIssue({ code: "custom", message: (error as Error).message });
      return z.NEVER;
    }
  });

export function openSourceRoutes(service: OpenSourceService) {
  const router = Router();
  router.get("/open-source/collections", (_req, res) =>
    res.json(service.collections()),
  );
  router.post("/open-source/collections", async (req, res) => {
    const { username } = z.object({ username: usernameSchema }).parse(req.body);
    try {
      res.status(201).json(await service.add(username));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });
  router.delete("/open-source/collections/:username", (req, res) => {
    service.remove(usernameSchema.parse(req.params.username));
    res.json({ ok: true });
  });
  router.get("/open-source/stars/:username", async (req, res) => {
    const username = usernameSchema.parse(req.params.username);
    const { page, refresh } = z
      .object({
        page: z.coerce.number().int().min(1).max(1000).default(1),
        refresh: z.enum(["true", "false"]).default("false"),
      })
      .parse(req.query);
    try {
      res.json(await service.stars(username, page, refresh === "true"));
    } catch (error) {
      res.status(502).json({ error: (error as Error).message });
    }
  });
  return router;
}
