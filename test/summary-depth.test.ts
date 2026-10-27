// Synthetic excerpts and a fake local engine; no model download or remote inference.
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Store } from "../server/db.ts";
import { Collector } from "../server/collector.ts";
import { createApp } from "../server/app.ts";
import { LocalAI } from "../src/local-ai.ts";
import {
  DEPTH_SETTINGS,
  SUMMARY_DEPTHS,
  SOURCE_LIMIT,
  summaryInput,
  summaryInterests,
  summaryScope,
} from "../shared/summary.ts";
import type { Story } from "../shared/types.ts";
const result = {
  whatChanged: "A bounded method.",
  whyItMatters: "Relevant to the query.",
  evidence: "Methods missing from this abstract.",
  topics: ["Test"],
};
function fixture(store: Store): Story {
  store.ingest(store.sources()[0], [
    {
      externalId: "2610.12345",
      canonicalUrl: "https://arxiv.org/abs/2610.12345",
      title: "TEST FIXTURE: bounded abstract",
      abstract: "Only a short abstract is supplied.",
      releaseText: "",
      publishedAt: null,
      kind: "research",
      topics: [],
      links: [],
    },
  ]);
  return store.stories()[0];
}
test("every depth sends its prompt and output budget with the same bounded exact source input", async () => {
  const store = new Store(":memory:");
  try {
    const story = { ...fixture(store), abstract: "x".repeat(6000) };
    for (const depth of SUMMARY_DEPTHS) {
      const ai = new LocalAI();
      let request: any;
      ai.engine = {
        chat: {
          completions: {
            create: async (options: unknown) => {
              request = options;
              return {
                choices: [{ message: { content: JSON.stringify(result) } }],
              };
            },
          },
        },
      } as unknown as NonNullable<LocalAI["engine"]>;
      assert.deepEqual(await ai.summarize(story, "quantum", depth), result);
      assert.equal(request.max_tokens, DEPTH_SETTINGS[depth].tokens);
      assert.ok(
        request.messages[0].content.includes(DEPTH_SETTINGS[depth].instruction),
      );
      const input = request.messages.at(-1).content;
      assert.equal(input, summaryInput(story, "quantum"));
      assert.equal(JSON.parse(input).SOURCE.length, SOURCE_LIMIT);
      assert.equal(JSON.parse(input).sourceScope, "Abstract only");
    }
    assert.equal(
      summaryScope({ ...story, abstract: "", releaseText: "Notes" }),
      "Release excerpt",
    );
    assert.equal(
      summaryScope({ ...story, kind: "news", sourceKind: "rss" }),
      "Article excerpt",
    );
    assert.equal(summaryScope({ ...story, sourceKind: "hn" }), "Post excerpt");
  } finally {
    store.close();
  }
});
test("canceling an active generation rejects its result and interrupts the local engine", async () => {
  const store = new Store(":memory:");
  try {
    const ai = new LocalAI();
    let interrupted = false;
    ai.engine = {
      chat: { completions: { create: () => new Promise(() => {}) } },
      interruptGenerate: () => {
        interrupted = true;
      },
    } as unknown as NonNullable<LocalAI["engine"]>;
    const work = ai.summarize(fixture(store), "quantum", "detailed");
    ai.cancel();
    await assert.rejects(work, /canceled/);
    assert.equal(interrupted, true);
    assert.equal(ai.engine, undefined);
  } finally {
    store.close();
  }
});
test("summary API isolates depths, exact input, interests and model; stale writes are rejected", async () => {
  const store = new Store(":memory:");
  const story = fixture(store);
  const server = createApp(store, new Collector(store)).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const root = `http://127.0.0.1:${address.port}/api/summaries/${story.id}`;
  async function write(depth = "brief", patch: Record<string, unknown> = {}) {
    return fetch(root, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contentHash: story.contentHash,
        inputText: summaryInput(story, summaryInterests(store.profile())),
        depth,
        model: "fixture-model",
        interestKey: "fixture-interests",
        result,
        ...patch,
      }),
    });
  }
  async function read(depth = "brief", extra = "") {
    return (
      await fetch(
        `${root}?model=fixture-model&interestKey=fixture-interests&depth=${depth}${extra}`,
      )
    ).json();
  }
  try {
    assert.equal((await write()).status, 200);
    assert.deepEqual((await read()).result, result);
    assert.equal(await read("detailed"), null);
    assert.equal(await read("standard"), null);
    assert.equal((await write("detailed")).status, 200);
    assert.equal((await read("detailed")).depth, "detailed");
    assert.equal((await write("invalid")).status, 400);
    assert.equal(
      (await write("brief", { inputText: "Different source" })).status,
      409,
    );
    assert.equal(
      (await write("brief", { contentHash: "a".repeat(64) })).status,
      409,
    );
    assert.equal(
      await (
        await fetch(
          `${root}?model=other&interestKey=fixture-interests&depth=brief`,
        )
      ).json(),
      null,
    );
    const before = summaryInput(story, summaryInterests(store.profile()));
    store.saveProfile({ ...store.profile(), prompt: "Changed priorities" });
    assert.equal(await read(), null);
    assert.equal((await write("brief", { inputText: before })).status, 409);
    store.ingest(store.sources()[0], [
      { ...story, abstract: "Changed evidence." },
    ]);
    assert.equal(await read("detailed"), null);
    assert.equal((await write()).status, 409);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    store.close();
  }
});
