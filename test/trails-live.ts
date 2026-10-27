// Optional network smoke: REAL public arXiv/GitHub/citation data in a temporary DB.
import assert from "node:assert/strict";
import { Store } from "../server/db.ts";
import { HttpClient } from "../server/http.ts";
import { parseArxiv } from "../server/sources/arxiv.ts";
import { TrailService } from "../server/trails/service.ts";
import { compareVersions } from "../shared/trail.ts";
const store = new Store(":memory:");
const http = new HttpClient(store);
try {
  const first = parseArxiv(
    await http.text(
      "https://export.arxiv.org/api/query?id_list=1706.03762&max_results=1",
    ),
  );
  assert.equal(first.length, 1);
  assert.ok(first[0].metadata!.arxivVersion! > 1);
  store.ingest(store.sources()[0], first);
  const service = new TrailService(store, http);
  const attention = store.stories()[0];
  await service.refresh(attention.groupId, true);
  const trail = service.read(attention.groupId);
  assert.ok(trail.versions.length >= 2, "Latest and previous pinned versions");
  assert.equal(trail.checks.versions?.error, null);
  const changes = compareVersions(trail.versions[1], trail.versions[0]);
  console.log(
    JSON.stringify({
      paper: attention.title,
      versions: trail.versions.map((v) => v.version),
      abstractChanged: changes.abstractChanged,
      commentChanged: changes.commentChanged,
      citationError: trail.checks.citations?.error,
      citations: trail.followUps.length,
    }),
  );
  const codePaper = parseArxiv(
    await http.text(
      "https://export.arxiv.org/api/query?id_list=2610.31572&max_results=1",
    ),
  );
  assert.equal(codePaper.length, 1);
  store.ingest(store.sources()[0], codePaper);
  const codeStory = store.stories().find((s) => s.externalId === "2610.31572")!;
  await service.refresh(codeStory.groupId, true);
  const code = service.read(codeStory.groupId);
  assert.ok(
    code.code.some(
      (l) => l.url === "https://github.com/difra100/Token_Collapse_KGQA",
    ),
  );
  assert.ok(
    code.code.some((l) => l.available),
    "GitHub repository verified live",
  );
  assert.equal(store.ingest(store.sources()[0], codePaper), 0);
  console.log(
    JSON.stringify({
      paper: codeStory.title,
      code: code.code.map((l) => ({
        url: l.url,
        verified: l.available,
        linkedVersion: l.linkedVersion,
      })),
      citationError: code.checks.citations?.error,
    }),
  );
  console.log(
    "PASS: live pinned version comparison, explicit code extraction, public GitHub verification, idempotent refresh. Citation availability is reported separately.",
  );
} finally {
  store.close();
}
