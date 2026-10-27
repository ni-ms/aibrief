import { test } from "node:test";
import assert from "node:assert/strict";
import { rankStories } from "../shared/ranking.ts";
import { selectBriefing } from "../shared/briefing.ts";
import { matches } from "../shared/interests.ts";
import type { Profile, Story } from "../shared/types.ts";
const now = Date.parse("2026-10-25T12:00:00Z");
const profile: Profile = {
  prompt: "Quantum error correction",
  terms: ["quantum", "error correction", "ai"],
  weights: {},
  lastVisit: null,
  focusTerms: ["quantum error correction"],
};
const paper = (
  id: number,
  title: string,
  abstract: string,
  extra: Partial<Story> = {},
): Story => ({
  id,
  groupId: id,
  externalId: String(id),
  sourceId: "arxiv-ai",
  sourceName: "arXiv",
  sourceKind: "arxiv",
  canonicalUrl: `https://example.com/${id}`,
  title,
  abstract,
  releaseText: "",
  publishedAt: "2026-10-24T12:00:00Z",
  firstSeenAt: "2026-10-25T00:00:00Z",
  lastFetchedAt: "2026-10-25T00:00:00Z",
  contentHash: "hash",
  topics: ["Quantum computing"],
  kind: "research",
  links: [],
  sources: ["arXiv"],
  read: false,
  saved: false,
  dismissed: false,
  feedback: 0,
  score: 0,
  reasons: [],
  ...extra,
});
test("specific title and focus matches outrank broad AI mentions", () => {
  const result = rankStories(
    [
      paper(
        1,
        "Quantum error-correction with sparse decoders",
        "We describe decoding for quantum codes.",
      ),
      paper(
        2,
        "AI funding market update",
        "A report about AI companies and the market.",
      ),
    ],
    profile,
    now,
  );
  assert.ok(result[0].score > result[1].score + 15);
  assert.ok(result[0].ranking!.focus > 0);
  assert.ok(result[0].reasons.some((r) => r.includes("Focus:")));
});
test("long keyword-stuffed bodies do not outrank a direct technical title", () => {
  const result = rankStories(
    [
      paper(
        1,
        "Quantum error correction",
        "A concise study of quantum codes and decoder limitations.",
      ),
      paper(2, "General release notes", "quantum ".repeat(7000)),
    ],
    profile,
    now,
  );
  assert.ok(result[0].score > result[1].score);
  assert.ok(result[1].ranking!.lexical <= 45);
});
test("negative interests and strict focus gate the briefing while retaining All", () => {
  const result = rankStories(
    [
      paper(1, "Quantum error correction", "Decoder study."),
      paper(
        2,
        "Quantum trading",
        "Quantum error correction for crypto trading.",
      ),
      paper(3, "Quantum chemistry", "Materials study."),
    ],
    { ...profile, excludeTerms: ["crypto trading"], strictFocus: true },
    now,
  );
  assert.equal(result.length, 3);
  assert.equal(result[0].ranking!.eligible, true);
  assert.equal(result[1].ranking!.eligible, false);
  assert.deepEqual(result[1].ranking!.excludedBy, ["crypto trading"]);
  assert.equal(result[2].ranking!.eligible, false);
  assert.deepEqual(
    selectBriefing(result, null, now).map((s) => s.id),
    [1],
  );
});
test("explicit positive feedback transfers distinctive paper terms rather than only a broad topic", () => {
  const inputs = [
    paper(
      1,
      "Sparse decoder circuits",
      "Sparse decoder syndrome lattice surface-code architectures.",
      { feedback: 1 },
    ),
    paper(
      2,
      "Syndrome lattice decoding",
      "Sparse decoder syndrome lattice surface-code experiments.",
    ),
    paper(
      3,
      "Quantum market overview",
      "Investments and corporate market shares.",
    ),
  ];
  const result = rankStories(
    inputs,
    { ...profile, terms: ["quantum"], focusTerms: [] },
    now,
  );
  assert.ok(result[1].ranking!.feedback > result[2].ranking!.feedback);
  assert.ok(result[1].reasons.includes("Similar to your positive feedback"));
});
test("briefing spreads near-identical titles without merging their identities", () => {
  const stories = [
    paper(1, "Sparse quantum decoder method version one", "a", { score: 50 }),
    paper(2, "Sparse quantum decoder method version two", "b", { score: 49 }),
    paper(3, "Quantum hardware experiment", "c", {
      score: 47,
      sourceId: "other",
    }),
  ];
  const selected = selectBriefing(stories, null, now);
  assert.equal(selected[0].id, 1);
  assert.equal(selected[1].id, 3);
  assert.equal(selected.length, 3);
  assert.equal(new Set(selected.map((s) => s.groupId)).size, 3);
});
test("phrase matching recognizes spacing/hyphen variants and keeps word boundaries", () => {
  assert.equal(
    matches("quantum error-correction", "quantum error correction"),
    true,
  );
  assert.equal(matches("open source", "open-source"), true);
  assert.equal(matches("chair", "ai"), false);
  assert.equal(matches("C++ compilers", "C++"), true);
});
