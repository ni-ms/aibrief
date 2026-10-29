import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  INTEREST_STARTERS,
  onboardingPrompt,
  personalizedProfile,
  readOnboarding,
  suggestedFocus,
  type OnboardingRecord,
} from "../shared/onboarding.ts";
import { initialTheme } from "../src/lib/appearance.ts";
import { Store } from "../server/db.ts";
import { profileRoutes } from "../server/routes/profile.ts";
import { preferenceRoutes } from "../server/routes/preferences.ts";
import type { Collector } from "../server/collector.ts";

const draft = {
  topicIds: ["systems"],
  custom: "GPU programming research",
  focus: "WebGPU, distributed systems",
  exclude: "funding rounds",
  strict: false,
};

test("new workspaces default to dark while a saved appearance choice is respected", () => {
  assert.equal(initialTheme(null), "dark");
  assert.equal(initialTheme("dark"), "dark");
  assert.equal(initialTheme("light"), "light");
  assert.equal(initialTheme("invalid"), "dark");
});

test("multi-topic onboarding balances suggestions and creates a bounded personalized profile", () => {
  const ids = INTEREST_STARTERS.map((pack) => pack.id);
  const focus = suggestedFocus(ids);
  assert.equal(focus.length, 6);
  for (const pack of INTEREST_STARTERS)
    assert.ok(focus.includes(pack.focus[0]));
  const store = new Store(":memory:");
  try {
    const prior = {
      ...store.profile(),
      weights: { webgpu: 1.5 },
      lastVisit: "2026-10-28T00:00:00Z",
    };
    const next = personalizedProfile(prior, {
      ...draft,
      topicIds: ids,
      custom: "x".repeat(1000),
      focus: focus.join(", "),
    });
    assert.ok(next.prompt.length <= 2000);
    assert.ok(next.terms.includes("webgpu"));
    assert.equal(next.weights.webgpu, 1.5);
    assert.equal(next.lastVisit, prior.lastVisit);
    assert.equal(next.focusTerms?.length, 6);
  } finally {
    store.close();
  }
});

test("custom-only onboarding works, rejects invalid inputs, and deduplicates phrases", () => {
  const store = new Store(":memory:");
  try {
    const profile = store.profile();
    const manualTerms = { ...profile, terms: ["a carefully chosen phrase"] };
    assert.deepEqual(
      personalizedProfile(manualTerms, {
        ...draft,
        topicIds: [],
        custom: profile.prompt,
      }).terms,
      manualTerms.terms,
    );
    const next = personalizedProfile(profile, {
      ...draft,
      topicIds: [],
      custom: "Battery storage",
      focus: "Batteries, batteries",
      strict: true,
    });
    assert.equal(next.prompt, "Battery storage");
    assert.deepEqual(next.focusTerms, ["batteries"]);
    assert.equal(next.strictFocus, true);
    assert.equal(
      personalizedProfile(profile, { ...draft, focus: "", strict: true })
        .strictFocus,
      false,
    );
    assert.throws(
      () =>
        personalizedProfile(profile, { ...draft, topicIds: [], custom: " " }),
      /Choose a topic/,
    );
    assert.throws(
      () =>
        personalizedProfile(profile, {
          ...draft,
          focus: "one,two,three,four,five,six,seven",
        }),
      /up to 6/,
    );
    assert.throws(
      () =>
        personalizedProfile(profile, { ...draft, exclude: "x".repeat(101) }),
      /under 100/,
    );
  } finally {
    store.close();
  }
});

test("incomplete or invalid onboarding records do not suppress the first-visit flow", () => {
  for (const value of [
    null,
    "",
    "{",
    "null",
    "{}",
    '{"version":2}',
    JSON.stringify({
      version: 1,
      topicIds: ["unknown"],
      custom: "",
      prompt: "",
    }),
  ]) {
    assert.equal(readOnboarding(value), null);
  }
  const skipped: OnboardingRecord = {
    version: 1,
    topicIds: [],
    custom: "",
    prompt: "Original interests",
    skipped: true,
  };
  assert.deepEqual(readOnboarding(JSON.stringify(skipped)), skipped);
});

test("onboarding saves ranking preferences and completion across restart, adds matching feeds, and preserves reading state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldnotes-onboarding-"));
  const path = join(directory, "fixture.sqlite");
  let store = new Store(path);
  try {
    store.ingest(store.sources()[0], [
      {
        externalId: "systems-fixture",
        canonicalUrl: "https://example.org/systems",
        title: "WebGPU distributed systems",
        abstract: "WebGPU programming for efficient distributed systems.",
        releaseText: "",
        publishedAt: new Date().toISOString(),
        kind: "research",
        topics: ["Systems & software"],
        links: [],
      },
      {
        externalId: "other-fixture",
        canonicalUrl: "https://example.org/other",
        title: "Quantum hardware",
        abstract: "A device measurement.",
        releaseText: "",
        publishedAt: new Date().toISOString(),
        kind: "research",
        topics: ["Quantum computing"],
        links: [],
      },
    ]);
    const groupId = store
      .stories()
      .find((s) => s.externalId === "systems-fixture")!.groupId;
    store.setState(groupId, {
      saved: true,
      read: true,
      note: "Preserve this note",
    });
    const collector = { refresh: async () => {} } as unknown as Collector;
    const profile = personalizedProfile(store.profile(), draft);
    const record: OnboardingRecord = {
      version: 1,
      topicIds: draft.topicIds,
      custom: draft.custom,
      prompt: onboardingPrompt(draft.topicIds, draft.custom),
    };
    await profileRoutes(store, collector).dispatch("/profile", "PUT", profile);
    await preferenceRoutes(store).dispatch("/preferences/onboarding", "PUT", {
      value: JSON.stringify(record),
    });
    store.close();
    store = new Store(path);
    assert.equal(store.profile().prompt, profile.prompt);
    assert.deepEqual(store.profile().focusTerms, [
      "webgpu",
      "distributed systems",
    ]);
    const stored = await preferenceRoutes(store).dispatch(
      "/preferences",
      "GET",
    );
    assert.deepEqual(
      readOnboarding((stored?.body as Record<string, string>).onboarding),
      record,
    );
    assert.ok(
      store
        .sources()
        .some((source) => source.config.categories?.includes("cs.DC")),
    );
    const ranked = store.stories().sort((a, b) => b.score - a.score);
    assert.equal(ranked[0].externalId, "systems-fixture");
    const preserved = ranked.find((s) => s.groupId === groupId)!;
    assert.equal(preserved.saved, true);
    assert.equal(preserved.read, true);
    assert.equal(preserved.note, "Preserve this note");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
