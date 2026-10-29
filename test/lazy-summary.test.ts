// Synthetic article fixtures and a fake model; no network or model downloads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { Collector } from "../server/collector.ts";
import { summariesRoutes } from "../server/routes/summaries.ts";
import { loadSummarySource, type ArticleRequest } from "../src/lib/article.ts";
import {
  summaryInput,
  summaryInterests,
  summaryScope,
  SOURCE_LIMIT,
} from "../shared/summary.ts";
import { LocalAI } from "../src/local-ai.ts";

const article =
  "A linked article describes an inference method and its measured limitations. ".repeat(
    100,
  );
const result = {
  whatChanged: "The article describes an inference method.",
  whyItMatters: "It addresses inference costs.",
  evidence: "The article reports limitations.",
  topics: ["Inference"],
};
function fixture() {
  const store = new Store(":memory:");
  const source = store.sources().find((s) => s.kind === "hn")!;
  store.ingest(source, [
    {
      externalId: "lazy-fixture",
      canonicalUrl: "https://example.org/article",
      title: "TEST FIXTURE: linked article without a feed excerpt",
      abstract: "",
      releaseText: "",
      publishedAt: null,
      kind: "news",
      topics: [],
      links: [],
    },
  ]);
  const router = summariesRoutes(store, new Collector(store));
  const request: ArticleRequest = async <T>(
    path: string,
    method = "GET",
    body?: unknown,
  ) => {
    const response = await router.dispatch(path, method, body);
    if (!response || response.status >= 400)
      throw new Error(
        (response?.body as { error: string })?.error || "Unknown route",
      );
    return response.body as T;
  };
  return { store, story: store.stories()[0], router, request };
}

test("selection only reads the cache; explicit summary fetches once and the model receives the article", async () => {
  const { store, story, request } = fixture();
  let fetches = 0;
  const fetcher: typeof fetch = async (url) => {
    fetches++;
    assert.equal(
      url,
      `/api/proxy?url=${encodeURIComponent(story.canonicalUrl)}`,
    );
    return new Response(article, { headers: { "Content-Type": "text/plain" } });
  };
  try {
    assert.equal(
      (await loadSummarySource(story, request, false, undefined, fetcher))
        .articleText,
      undefined,
    );
    assert.equal(fetches, 0);
    const source = await loadSummarySource(
      story,
      request,
      true,
      undefined,
      fetcher,
    );
    assert.equal(fetches, 1);
    assert.equal(summaryScope(source), "Readable article");
    const ai = new LocalAI();
    let input = "";
    ai.engine = {
      chat: {
        completions: {
          create: async (options: any) => {
            input = options.messages.at(-1).content;
            return {
              choices: [{ message: { content: JSON.stringify(result) } }],
            };
          },
        },
      },
    } as NonNullable<LocalAI["engine"]>;
    assert.deepEqual(await ai.summarize(source, "inference", "brief"), result);
    assert.equal(JSON.parse(input).SOURCE, article.slice(0, SOURCE_LIMIT));
    assert.equal(JSON.parse(input).sourceScope, "Readable article");
    assert.equal(
      (await loadSummarySource(story, request, true, undefined, fetcher))
        .articleText,
      article.trim(),
    );
    assert.equal(
      fetches,
      1,
      "reopening or changing depth must reuse the stored article",
    );
    const query = `/summaries/${story.id}?model=test&interestKey=test&depth=brief`;
    await request(`/summaries/${story.id}`, "PUT", {
      contentHash: story.contentHash,
      inputText: summaryInput(source, summaryInterests(store.profile())),
      model: "test",
      interestKey: "test",
      depth: "brief",
      result,
    });
    assert.deepEqual(
      (await request<{ result: unknown }>(query)).result,
      result,
    );
    assert.equal(
      await request(query.replace("depth=brief", "depth=detailed")),
      null,
    );
    await assert.rejects(
      request(`/summaries/${story.id}`, "PUT", {
        contentHash: story.contentHash,
        inputText: summaryInput(story, summaryInterests(store.profile())),
        model: "test",
        interestKey: "test",
        depth: "brief",
        result,
      }),
      /Source or interests changed/,
    );
    store.removeSource(story.sourceId);
    assert.equal(
      store.db.prepare("SELECT * FROM readable_articles").all().length,
      0,
    );
  } finally {
    store.close();
  }
});

test("changed source content or URL invalidates fetched text and rejects stale article writes", async () => {
  const { store, story, router, request } = fixture();
  try {
    await request(`/articles/${story.id}`, "PUT", {
      contentHash: story.contentHash,
      url: story.canonicalUrl,
      text: article,
    });
    store.db
      .prepare("UPDATE items SET title=?,content_hash=? WHERE id=?")
      .run("Changed article", "b".repeat(64), story.id);
    assert.equal(await request(`/articles/${story.id}`), null);
    assert.equal(
      (
        await router.dispatch(`/articles/${story.id}`, "PUT", {
          contentHash: story.contentHash,
          url: story.canonicalUrl,
          text: article,
        })
      )?.status,
      409,
    );
    store.db
      .prepare("UPDATE items SET content_hash=?,canonical_url=? WHERE id=?")
      .run(story.contentHash, "https://example.org/replaced", story.id);
    assert.equal(await request(`/articles/${story.id}`), null);
    assert.equal(
      (
        await router.dispatch(`/articles/${story.id}`, "PUT", {
          contentHash: story.contentHash,
          url: story.canonicalUrl,
          text: article,
        })
      )?.status,
      409,
    );
  } finally {
    store.close();
  }
});

test("unreadable, blocked and canceled fetches do not cache text and can be retried", async () => {
  const { store, story, request } = fixture();
  try {
    for (const response of [
      new Response("Blocked", { status: 403 }),
      new Response("binary", {
        headers: { "Content-Type": "application/pdf" },
      }),
      new Response("Login", { headers: { "Content-Type": "text/plain" } }),
    ]) {
      await assert.rejects(
        loadSummarySource(
          story,
          request,
          true,
          undefined,
          async () => response,
        ),
      );
      assert.equal(await request(`/articles/${story.id}`), null);
    }
    const controller = new AbortController();
    let begin!: () => void;
    const begun = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const pending = loadSummarySource(
      story,
      request,
      true,
      controller.signal,
      async (_url, init) => {
        begin();
        return new Promise((_resolve, reject) =>
          init!.signal!.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          ),
        );
      },
    );
    await begun;
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(await request(`/articles/${story.id}`), null);
    const retried = await loadSummarySource(
      story,
      request,
      true,
      undefined,
      async () =>
        new Response(article, { headers: { "Content-Type": "text/plain" } }),
    );
    assert.equal(retried.articleText, article.trim());
  } finally {
    store.close();
  }
});
