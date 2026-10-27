// Isolated API/restart checks. Synthetic fixture is not written into the user's database.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { parseArxiv } from "../server/adapters.ts";
const directory = mkdtempSync(join(tmpdir(), "fieldnotes-api-"));
const dbPath = join(directory, "api.sqlite");
const store = new Store(dbPath);
store.ingest(
  store.sources()[0],
  parseArxiv(
    "<rss><channel><item><title>TEST FIXTURE: Quantum evidence</title><link>https://arxiv.org/abs/2610.12345</link><description>Test abstract only.</description></item></channel></rss>",
  ),
);
store.close();
let child: ReturnType<typeof spawn> | undefined;
const root = "http://127.0.0.1:3197";
async function start() {
  child = spawn(process.execPath, ["server/index.ts"], {
    env: {
      ...process.env,
      PORT: "3197",
      DB_PATH: dbPath,
      COLLECT_ON_START: "false",
      COLLECTION_DISABLED: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Server startup timeout")),
      10000,
    );
    child!.stdout!.on("data", (buffer) => {
      if (String(buffer).includes("Fieldnotes backend:")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child!.once("exit", (code) => reject(new Error(`Backend exited ${code}`)));
  });
}
async function stop() {
  if (child) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
    child = undefined;
  }
}
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  origin?: string,
) {
  return fetch(`${root}/api${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(origin ? { Origin: origin } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
try {
  await start();
  assert.equal((await fetch(root)).status, 200);
  const feed = await (await request("/feed")).json();
  const id = feed.stories[0].groupId;
  assert.equal((await request(`/trails/${id}`)).status, 200);
  assert.equal((await request("/trails/999999")).status, 404);
  assert.equal((await request("/trails/invalid")).status, 400);
  assert.equal((await request(`/trails/${id}/refresh`, "POST")).status, 202);
  assert.equal(
    (
      await request(`/trails/${id}/links`, "POST", {
        kind: "code",
        title: "Unsafe fixture",
        url: "https://127.0.0.1/code",
      })
    ).status,
    400,
  );
  const linkBody = {
    kind: "followup",
    title: "TEST FIXTURE: manual follow-up",
    url: "https://8.8.8.8/research",
  };
  const manual = await request(`/trails/${id}/links`, "POST", linkBody);
  assert.equal(manual.status, 201);
  const linkId = (await manual.json()).followUps[0].id;
  assert.equal(
    (await request(`/trails/${id}/links`, "POST", linkBody)).status,
    409,
  );
  assert.equal(
    (await request(`/trails/${id}/links/${linkId}`, "PATCH", { hidden: true }))
      .status,
    200,
  );
  assert.equal(
    (await (await request(`/trails/${id}`)).json()).followUps.length,
    0,
  );
  assert.equal(
    (await request(`/trails/${id}/links/${linkId}`, "PATCH", { hidden: false }))
      .status,
    200,
  );
  assert.equal(
    (await request(`/trails/${id}/links/missing`, "PATCH", { hidden: true }))
      .status,
    404,
  );
  assert.equal(
    (await request(`/stories/${id}`, "PATCH", { saved: true, read: true }))
      .status,
    200,
  );
  assert.equal(
    (
      await request("/profile", "PUT", {
        prompt: "Follow robotics and embodied intelligence",
        focusTerms: ["embodied intelligence"],
        excludeTerms: ["funding rounds"],
        strictFocus: true,
      })
    ).status,
    200,
  );
  const changed = await (await request("/feed")).json();
  assert.equal(
    changed.sources.some((s: any) => s.id === "arxiv-focus"),
    false,
  );
  const topicResponse = await request("/topics", "POST", {
    query: "topological quantum computing",
    providers: ["arxiv"],
  });
  assert.equal(topicResponse.status, 201);
  const topic = await topicResponse.json();
  assert.equal(
    (
      await request(`/topics/${topic.id}`, "PATCH", {
        name: "Quantum desk",
        paused: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request("/topics", "POST", {
        query: "quantum",
        providers: ["missing"],
      })
    ).status,
    400,
  );
  assert.equal(
    (await request("/discover", "POST", { query: "", providers: ["arxiv"] }))
      .status,
    400,
  );
  assert.ok(
    (await (await request("/discovery/providers")).json()).some(
      (p: any) => p.id === "arxiv" && p.capability === "upstream",
    ),
  );
  assert.equal(changed.profile.strictFocus, true);
  assert.deepEqual(changed.profile.excludeTerms, ["funding rounds"]);
  const catalog = await (await request("/resources")).json();
  assert.ok(catalog.some((r: any) => r.id === "neurips"));
  assert.equal(catalog.find((r: any) => r.id === "x").kind, null);
  assert.equal(catalog.find((r: any) => r.id === "reddit").field, "subreddit");
  const redditSource = {
    kind: "reddit",
    name: "Reddit · r/MachineLearning",
    resourceId: "reddit",
    enabled: false,
    config: { subreddit: "https://www.reddit.com/r/MachineLearning/" },
  };
  assert.equal(
    (await request("/sources/reddit-smoke", "PUT", redditSource)).status,
    200,
  );
  assert.equal(
    (
      await request("/sources/reddit-invalid", "PUT", {
        ...redditSource,
        config: { subreddit: "https://evil.example/r/MachineLearning" },
      })
    ).status,
    400,
  );
  assert.ok(
    changed.sources.some((s: any) => s.config.categories?.includes("cs.RO")),
  );
  assert.equal((await request("/profile", "PUT", { prompt: "" })).status, 400);
  assert.equal(
    (await request("/refresh", "POST", {}, "https://untrusted.example")).status,
    403,
  );
  assert.equal(
    (
      await request("/sources/test", "PUT", {
        kind: "github",
        name: "Unsafe URL",
        enabled: true,
        config: { repo: "https://evil.example" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/summaries/1", "PUT", {
        contentHash: "a".repeat(64),
        inputText: "stale source",
        depth: "standard",
        model: "test",
        interestKey: "test",
        result: {
          whatChanged: "x",
          whyItMatters: "y",
          evidence: "z",
          topics: ["test"],
        },
      })
    ).status,
    409,
  );
  await stop();
  await start();
  const after = await (await request("/feed")).json();
  assert.equal(after.stories.length, 1);
  const afterReddit = after.sources.find((s: any) => s.id === "reddit-smoke");
  assert.equal(afterReddit.config.subreddit, "machinelearning");
  assert.equal(afterReddit.enabled, false);
  assert.equal(after.followedTopics[0].id, topic.id);
  assert.equal(after.followedTopics[0].name, "Quantum desk");
  assert.equal(after.followedTopics[0].paused, true);
  assert.equal((await request(`/topics/${topic.id}`, "DELETE")).status, 200);
  assert.equal((await (await request("/feed")).json()).stories.length, 1);
  assert.equal(after.stories[0].saved, true);
  assert.equal(after.stories[0].read, true);
  const afterTrail = await (await request(`/trails/${id}`)).json();
  assert.equal(afterTrail.followUps[0].id, linkId);
  assert.equal(afterTrail.followUps[0].relation, "user");
  assert.equal(
    after.profile.prompt,
    "Follow robotics and embodied intelligence",
  );
  console.log(
    "PASS: built frontend; API actions; trail reads/refresh; link validation/duplicate/hide/undo; prompt-to-feed routing; invalid input/foreign origin/stale summaries rejected; actual restart preserves content, personal state and manual trails.",
  );
} finally {
  await stop();
  rmSync(directory, { recursive: true, force: true });
}
