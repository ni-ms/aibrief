import { test } from "node:test";
import assert from "node:assert/strict";
import type { Story } from "../shared/types.ts";
import { hybridSearchStories } from "../shared/semantic.ts";
import {
  checkDevice,
  LocalAI,
  MODELS,
  summarizeViaEndpoint,
} from "../src/local-ai.ts";

const story = (extra: Partial<Story> = {}): Story => ({
  id: 99101,
  groupId: 99101,
  externalId: "test",
  sourceId: "test",
  sourceName: "Research",
  title: "Draft and verify token generation",
  abstract: "We accelerate autoregressive inference with a draft model.",
  releaseText: "",
  canonicalUrl: "https://example.org/paper",
  contentHash: "a".repeat(64),
  topics: ["Inference"],
  kind: "research",
  links: [],
  sources: [],
  firstSeenAt: "2026-10-28T00:00:00Z",
  lastFetchedAt: "2026-10-28T00:00:00Z",
  publishedAt: null,
  read: false,
  saved: false,
  dismissed: false,
  feedback: 0,
  score: 1,
  reasons: [],
  ...extra,
});

test("search retains results across refreshed objects and invalidates changed content with the same story ID", () => {
  const initial = story();
  const original = hybridSearchStories([initial], "speculative decoding");
  assert.equal(original[0]?.story.id, initial.id);
  const refreshed = hybridSearchStories(
    [{ ...initial, saved: true }],
    "speculative decoding",
  );
  assert.equal(refreshed[0]?.semanticScore, original[0]?.semanticScore);
  assert.equal(refreshed[0]?.story.saved, true);
  const changed = story({
    title: "Sourdough baking",
    abstract: "Fermentation and flour hydration for bread.",
    topics: ["Cooking"],
  });
  assert.equal(
    hybridSearchStories([changed], "speculative decoding", "keyword").length,
    0,
  );
  assert.ok(hybridSearchStories([changed], "sourdough", "keyword").length > 0);
  const changedResult = hybridSearchStories([changed], "speculative decoding");
  assert.notEqual(changedResult[0]?.semanticScore, original[0].semanticScore);
});

test("keyword matching skips semantic scores and updates source and author metadata", () => {
  const initial = story();
  assert.equal(hybridSearchStories([initial], "lovelace", "keyword").length, 0);
  const updated = story({
    metadata: { authors: ["Ada Lovelace"] },
    sourceName: "Computation Society",
  });
  const matches = hybridSearchStories([updated], "lovelace", "keyword");
  assert.equal(matches[0]?.story.id, updated.id);
  assert.equal(matches[0]?.semanticScore, 0);
  assert.equal(
    hybridSearchStories([updated], "computation", "keyword").length,
    1,
  );
});

test("loading chooses a compatible model automatically when float16 is unavailable", async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "gpu");
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: {
      requestAdapter: async () => ({
        features: new Set(),
        limits: { maxStorageBufferBindingSize: 256 * 1024 * 1024 },
      }),
    },
  });
  try {
    assert.equal(
      await checkDevice(MODELS[0].id),
      MODELS.find((m) => !m.f16)!.id,
    );
  } finally {
    if (previous) Object.defineProperty(navigator, "gpu", previous);
    else Reflect.deleteProperty(navigator, "gpu");
  }
});

test("GPU memory limits fail before importing a model runtime or creating a worker", async () => {
  const previous = Object.getOwnPropertyDescriptor(navigator, "gpu");
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: {
      requestAdapter: async () => ({
        features: new Set(["shader-f16"]),
        limits: { maxStorageBufferBindingSize: 64 * 1024 * 1024 },
      }),
    },
  });
  const local = new LocalAI();
  try {
    await assert.rejects(
      () => local.enable(MODELS[0].id, () => {}),
      /buffer limit/,
    );
    assert.equal(local.worker, undefined);
    assert.equal(local.engine, undefined);
  } finally {
    if (previous) Object.defineProperty(navigator, "gpu", previous);
    else Reflect.deleteProperty(navigator, "gpu");
  }
});

test("canceling endpoint generation aborts its actual request", async () => {
  const previous = globalThis.fetch;
  const controller = new AbortController();
  let requestSignal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, init) => {
    requestSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("Aborted", "AbortError")),
        { once: true },
      );
    });
  };
  try {
    const request = summarizeViaEndpoint(
      story(),
      "inference",
      "brief",
      "http://127.0.0.1:11434/v1/chat/completions",
      "test",
      controller.signal,
    );
    controller.abort();
    await assert.rejects(request, { name: "AbortError" });
    assert.equal(requestSignal?.aborted, true);
  } finally {
    globalThis.fetch = previous;
  }
});
