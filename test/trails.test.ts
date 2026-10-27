// Synthetic fixtures only; these never enter the running library.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/db.ts";
import { parseArxiv } from "../server/sources/arxiv.ts";
import { HttpClient } from "../server/http.ts";
import { TrailService } from "../server/trails/service.ts";
import { TrailStore } from "../server/trails/store.ts";
import {
  linkedCode,
  corpusLinks,
  parseCitations,
} from "../server/trails/evidence.ts";
import { arxivIdentity, codeUrls, compareVersions } from "../shared/trail.ts";
import { paginate, pageSize, rankedPapers } from "../shared/pagination.ts";
import { selectBriefing } from "../shared/briefing.ts";
import type { PaperVersion, TrailLink } from "../shared/types.ts";
const atom = (version = 1, summary = "Original finding.", comment = "") =>
  `<feed><entry><id>http://arxiv.org/abs/2610.12345v${version}</id><title>TEST FIXTURE: Quantum evidence</title><published>2026-10-01T00:00:00Z</published><updated>2026-10-24T00:00:00Z</updated><summary>${summary}</summary><arxiv:comment>${comment}</arxiv:comment><arxiv:doi>10.1234/test</arxiv:doi></entry></feed>`;
const seed = (store: Store, version = 1, summary = "Original finding.") => {
  store.ingest(
    store.sources()[0],
    parseArxiv(atom(version, summary)),
    "2026-10-02T00:00:00Z",
  );
  return store.stories()[0];
};
const version = (v: number, abstract: string, comment = ""): PaperVersion => ({
  paperKey: "2610.12345",
  version: v,
  title: "Fixture",
  abstract,
  comment,
  updatedAt: "2026-10-24T00:00:00Z",
  observedAt: "2026-10-25T00:00:00Z",
  sourceUrl: `https://arxiv.org/abs/2610.12345v${v}`,
});
test("trail identifiers require exact hosts and code links come only from explicit URLs", () => {
  assert.deepEqual(
    arxivIdentity("https://arxiv.org/pdf/quant-ph/0701234v2.pdf"),
    { id: "quant-ph/0701234", version: 2 },
  );
  assert.equal(
    arxivIdentity("https://arxiv.org.evil.test/abs/2610.12345"),
    null,
  );
  assert.deepEqual(
    codeUrls(
      "Code: (https://github.com/team/repo.git). https://github.com/team/repo/tree/main https://github.com.evil.test/team/other",
    ),
    ["https://github.com/team/repo"],
  );
  assert.deepEqual(
    codeUrls("Our quantum paper uses a repository named team/repo."),
    [],
  );
});
test("arXiv version parsing keeps publication, update, author comment and DOI separate", () => {
  const item = parseArxiv(
    atom(3, "Text.", "Accepted, code: https://github.com/team/repo"),
  )[0];
  assert.equal(item.publishedAt, "2026-10-01T00:00:00.000Z");
  assert.equal(item.metadata?.updatedAt, "2026-10-24T00:00:00.000Z");
  assert.equal(item.metadata?.arxivVersion, 3);
  assert.equal(item.metadata?.doi, "10.1234/test");
  assert.match(item.metadata?.comment || "", /Accepted/);
});
test("version comparison reports exact excerpt edits and bounds output without guessing PDF changes", () => {
  const before = version(
    1,
    "Same finding. Old claim.",
    "Code: https://github.com/team/old",
  );
  const after = version(
    2,
    "Same finding. New evidence.",
    "Code: https://github.com/team/new",
  );
  const changes = compareVersions(before, after);
  assert.deepEqual(changes.addedSentences, ["New evidence."]);
  assert.deepEqual(changes.removedSentences, ["Old claim."]);
  assert.deepEqual(changes.codeAdded, ["https://github.com/team/new"]);
  assert.deepEqual(changes.codeRemoved, ["https://github.com/team/old"]);
  assert.equal(changes.commentChanged, true);
  assert.equal(
    compareVersions(before, { ...before, version: 2 }).abstractChanged,
    false,
  );
  const bounded = compareVersions(
    before,
    version(
      2,
      Array.from({ length: 15 }, (_, i) => `Sentence ${i}.`).join(" "),
    ),
  );
  assert.equal(bounded.addedSentences.length, 8);
  assert.equal(bounded.truncated, true);
});
test("paper pagination has stable ranking, complete nonoverlapping pages, validated K and empty boundaries", () => {
  const store = new Store(":memory:");
  try {
    const base = seed(store);
    const stories = Array.from({ length: 53 }, (_, i) => ({
      ...base,
      groupId: i + 1,
      score: 100 - i,
    }));
    const ranked = rankedPapers([...stories].reverse());
    for (const size of [10, 20, 50]) {
      const all = Array.from(
        { length: Math.ceil(53 / size) },
        (_, i) => paginate(ranked, i + 1, size).items,
      ).flat();
      assert.deepEqual(
        all.map((s) => s.groupId),
        stories.map((s) => s.groupId),
      );
      assert.equal(new Set(all.map((s) => s.groupId)).size, 53);
    }
    assert.equal(paginate(ranked, 999).page, 6);
    assert.equal(paginate(ranked, -3).page, 1);
    assert.equal(paginate(ranked, NaN).page, 1);
    assert.equal(pageSize("20"), 20);
    assert.equal(pageSize(7), 10);
    assert.equal(paginate([], 1).start, 0);
    assert.equal(paginate([], 1).pages, 1);
    assert.equal(
      rankedPapers([
        { ...base, kind: "tools" },
        { ...base, dismissed: true },
        { ...base, ranking: { ...base.ranking!, eligible: false } },
      ]).length,
      0,
    );
  } finally {
    store.close();
  }
});
test("new versions become unread and eligible since last visit, preserve saved state, resist older feed overwrites", () => {
  const store = new Store(":memory:");
  try {
    const story = seed(store);
    store.setState(story.groupId, { read: true, saved: true });
    const later = "2026-10-25T00:00:00Z";
    store.ingest(store.sources()[0], parseArxiv(atom(2)), later); // identical abstract, different version
    const updated = store.stories()[0];
    assert.equal(updated.read, false);
    assert.equal(updated.saved, true);
    assert.equal(updated.firstSeenAt, story.firstSeenAt);
    assert.equal(updated.changedAt, later);
    assert.equal(
      selectBriefing([updated], "2026-10-24T00:00:00Z", Date.parse(later))
        .length,
      1,
    );
    store.ingest(
      store.sources()[0],
      parseArxiv(atom(1, "Stale payload.")),
      "2026-10-26T00:00:00Z",
    );
    assert.equal(store.stories()[0].metadata?.arxivVersion, 2);
    assert.equal(store.stories()[0].abstract, "Original finding.");
    store.setState(story.groupId, { read: true });
    assert.equal(store.stories()[0].read, true);
    store.ingest(
      store.sources()[0],
      parseArxiv(atom(2)),
      "2026-10-27T00:00:00Z",
    );
    assert.equal(store.stories()[0].read, true);
    assert.equal(store.versions("2610.12345")[0].observedAt, later);
    assert.equal(store.stories().length, 1);
  } finally {
    store.close();
  }
});
test("snapshots, manual links, hide/undo and read tokens survive restart and additive migration", () => {
  const directory = mkdtempSync(join(tmpdir(), "fieldnotes-trail-"));
  const path = join(directory, "test.sqlite");
  let store = new Store(path);
  try {
    const story = seed(store);
    store.setState(story.groupId, { read: true, saved: true });
    const link: TrailLink = {
      id: "fixture-link",
      kind: "followup",
      url: "https://example.org/followup",
      title: "Fixture follow-up",
      relation: "user",
      evidenceUrl: story.canonicalUrl,
      evidenceText: "Added by fixture",
    };
    const data = new TrailStore(store);
    data.manual(story.groupId, link);
    data.hide(story.groupId, link.id, true);
    store.close();
    store = new Store(path);
    const after = new TrailStore(store);
    assert.equal(after.read(story.groupId).followUps.length, 0);
    after.hide(story.groupId, link.id, false);
    assert.equal(after.read(story.groupId).followUps[0].url, link.url);
    assert.equal(store.versions("2610.12345").length, 1);
    assert.equal(store.stories()[0].read, true);
    // Simulate an older personal-state table by removing only the additive token column.
    store.db.exec("ALTER TABLE personal_state DROP COLUMN read_token");
    store.close();
    store = new Store(path);
    assert.equal(store.stories()[0].read, true);
    assert.equal(store.stories()[0].saved, true);
    assert.equal(
      (store.db.prepare("PRAGMA user_version").get() as any).user_version,
      4,
    );
    assert.equal(
      (store.db.prepare("SELECT COUNT(*) AS n FROM item_history").get() as any)
        .n,
      1,
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("relationships require explicit evidence and retain pinned source versions", () => {
  const store = new Store(":memory:");
  try {
    const story = seed(store);
    const direct = linkedCode(story, [
      version(2, "Code https://github.com/team/repo."),
    ]);
    assert.equal(direct[0].linkedVersion, 2);
    assert.match(direct[0].evidenceUrl, /v2$/);
    const unrelated = {
      ...story,
      groupId: 2,
      canonicalUrl: "https://arxiv.org/abs/2610.99999",
      title: story.title,
    };
    assert.equal(corpusLinks(story, [unrelated]).length, 0);
    const explicit = {
      ...unrelated,
      abstract: `Builds on https://arxiv.org/abs/2610.12345v1.`,
    };
    assert.equal(corpusLinks(story, [explicit])[0].relation, "mentions");
    const release = {
      ...explicit,
      kind: "tools" as const,
      canonicalUrl: "https://github.com/team/repo/releases/tag/v1",
    };
    assert.equal(corpusLinks(story, [release])[0].relation, "release-linked");
  } finally {
    store.close();
  }
});
test("citation results are bounded, keep citation attribution, and discard unsafe URLs", () => {
  const data = {
    next: 100,
    data: Array.from({ length: 30 }, (_, i) => ({
      citingPaper: {
        paperId: String(i),
        title: `Fixture ${i}`,
        externalIds: { ArXiv: `2610.${String(10000 + i)}` },
        year: 2026,
        publicationDate: "2026-10-24",
      },
    })),
  };
  data.data.push({
    citingPaper: { paperId: "bad", title: "Bad", url: "javascript:alert(1)" },
  } as any);
  const result = parseCitations(
    data,
    "https://api.semanticscholar.org/example",
  );
  assert.equal(result.links.length, 20);
  assert.equal(result.partial, true);
  assert.equal(result.links[0].relation, "cites");
  assert.match(result.links[0].evidenceText, /does not establish/);
  assert.throws(() => parseCitations({}, ""));
});
test("trail refresh coalesces requests, enriches code, stores both versions and retains evidence on failures", async () => {
  const store = new Store(":memory:");
  try {
    const story = seed(store);
    let fail = false,
      calls = 0;
    const http = {
      text: async (url: string) => {
        calls++;
        if (fail) throw new Error("Fixture arXiv unavailable");
        return url.includes("v1")
          ? atom(1)
          : atom(
              2,
              "Original finding. New evidence. Code: https://github.com/team/repo.",
            );
      },
      json: async (url: string) => {
        calls++;
        if (fail) throw new Error("Fixture 429");
        if (url.includes("semanticscholar"))
          return {
            data: [
              {
                citingPaper: {
                  paperId: "abc",
                  title: "Fixture citation",
                  externalIds: { ArXiv: "2610.99999" },
                  year: 2026,
                },
              },
            ],
          };
        if (url.includes("/releases"))
          return [
            {
              name: "v1",
              html_url: "https://github.com/team/repo/releases/tag/v1",
              published_at: "2026-10-24",
            },
          ];
        return {
          full_name: "team/repo",
          html_url: "https://github.com/team/repo",
          description: "Fixture implementation",
        };
      },
    } as unknown as HttpClient;
    const service = new TrailService(store, http);
    const a = service.refresh(story.groupId, true),
      b = service.refresh(story.groupId, true);
    assert.equal(a, b);
    await a;
    const first = service.read(story.groupId);
    assert.deepEqual(
      first.versions.map((v) => v.version),
      [2, 1],
    );
    assert.equal(first.code[0].available, true);
    assert.equal(first.code[0].linkedVersion, 2);
    assert.equal(first.code[0].release?.title, "v1");
    assert.equal(first.followUps[0].relation, "cites");
    const count = calls;
    await service.refresh(story.groupId, true);
    assert.equal(calls, count);
    service.data.save({ ...first, lastAttempt: "2000-01-01T00:00:00Z" });
    fail = true;
    await service.refresh(story.groupId, true);
    const failed = service.read(story.groupId);
    assert.equal(failed.versions.length, 2);
    assert.equal(failed.code[0].available, true);
    assert.equal(failed.followUps.length, 1);
    assert.equal(
      failed.checks.versions?.lastSuccess,
      first.checks.versions?.lastSuccess,
    );
    assert.match(failed.checks.citations?.error || "", /429/);
    assert.equal(failed.refreshing, false);
  } finally {
    store.close();
  }
});
test("concurrent arXiv callers share spacing and wait for response body completion", async () => {
  const store = new Store(":memory:");
  try {
    const starts: number[] = [];
    let completed = 0;
    const http = new HttpClient(store, (async () => {
      starts.push(Date.now());
      if (starts.length === 2) assert.equal(completed, 1);
      return new Response(
        new ReadableStream({
          start(controller) {
            setTimeout(() => {
              completed++;
              controller.enqueue(new TextEncoder().encode("payload"));
              controller.close();
            }, 60);
          },
        }),
      );
    }) as typeof fetch);
    await Promise.all([
      http.text("https://rss.arxiv.org/rss/cs.AI"),
      http.text("https://export.arxiv.org/api/query?id_list=2610.12345"),
    ]);
    assert.ok(starts[1] - starts[0] >= 3000);
    assert.equal(completed, 2);
  } finally {
    store.close();
  }
});

test("invalid local-model output and cancellation preserve original source content", async () => {
  const { LocalAI } = await import("../src/local-ai.ts");
  const store = new Store(":memory:");
  try {
    const story = seed(store),
      original = story.abstract;
    const ai = new LocalAI();
    ai.engine = {
      chat: {
        completions: {
          create: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    whatChanged: "Unverified",
                    whyItMatters: "Unverified",
                    evidence: "Unknown",
                    topics: ["Test"],
                    url: "https://invented.example",
                  }),
                },
              },
            ],
          }),
        },
      },
      interruptGenerate: () => {},
    } as any;
    await assert.rejects(() => ai.summarize(story, "quantum"));
    ai.engine = {
      chat: { completions: { create: () => new Promise(() => {}) } },
      interruptGenerate: () => {},
    } as any;
    const pending = ai.summarize(story, "quantum");
    ai.cancel();
    await assert.rejects(pending, /canceled/);
    assert.equal(story.abstract, original);
    assert.equal(store.stories()[0].abstract, original);
    assert.equal(
      (store.db.prepare("SELECT COUNT(*) AS n FROM summaries").get() as any).n,
      0,
    );
  } finally {
    store.close();
  }
});
test("sparse RSS cannot erase author comments or pinned API version metadata", () => {
  const store = new Store(":memory:");
  try {
    const source = store.sources()[0];
    store.ingest(
      source,
      parseArxiv(
        atom(1, "Source finding.", "Code: https://github.com/team/repo"),
      ),
    );
    store.ingest(
      source,
      parseArxiv(
        "<rss><channel><item><title>TEST FIXTURE: Quantum evidence</title><link>https://arxiv.org/abs/2610.12345v1</link><description>Sparse RSS.</description></item></channel></rss>",
      ),
    );
    assert.match(store.stories()[0].metadata?.comment || "", /github/);
    assert.equal(store.stories()[0].abstract, "Source finding.");
    assert.match(store.versions("2610.12345")[0].comment, /github/);
  } finally {
    store.close();
  }
});
