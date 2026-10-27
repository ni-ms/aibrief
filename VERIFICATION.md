# Verification

## Current delivery: browser SQLite and GitHub Pages

Verified October 26, 2026 (America/Los_Angeles):

- **74 automated tests pass:** the existing 66 tests plus eight browser-storage tests. The new tests exercise actual SQLite WASM with simulated IndexedDB, native SQLite backup compatibility, rejection of damaged/unrelated backups, restore ordering with an in-flight save, saved/read/feedback/topic/preference persistence, foreign keys after export, failed commit retry, portable SHA-256 compatibility, and browser-safe fetch behavior.
- **Production build passes** with `--base=/fieldnotes/`. The app, database worker, and SQLite WASM file load from the nested URL in a plain static preview without cross-origin isolation headers. Existing WebLLM size and dependency annotation warnings remain.
- **Browser verification:** 100 live GitHub starred projects loaded directly, survived reload from the local cache, and a followed repository collected six real releases. Saving a release, reloading, and opening Saved retained the one saved item. Database export displayed success. A second tab failed with an explicit database-lock message; reloading the first tab reopened the database successfully. No model weights were downloaded for this check.
- **Optional server API/restart smoke test passes**, preserving read/save/topic/trail/profile operations and origin checks after sharing the route implementation.
- **Migration backup created** at `data/fieldnotes-browser-backup.sqlite` using SQLite's online backup API. The original `data/fieldnotes.sqlite` is preserved. Its backup was successfully validated/imported into an isolated in-memory WASM database with all 11 sources, 1,062 items, and four personal-state rows. Browser testing used a separate database on the preview origin; it did not import or change the personal library.
- **GitHub Action added, not run remotely:** this directory has no Git repository/remote, and no repository was created. Pages must be enabled in an existing repository before its first deployment. The workflow deploys only `dist/`, never local database files.

Limits: native browser access is subject to each source's CORS policy; no proxy is used. GitHub reads were verified live. Other live source paths have not all been verified in browser mode, and earlier server-mode results below do not establish browser support. Browser data is not password encrypted, is specific to its origin/profile, and can be removed when site data is cleared or storage is evicted. Persistent storage can be requested in Your data. SQLite snapshots currently load into worker memory; very large libraries may need a different persistence strategy. Backups are available through Your data; restores were tested with real WASM/native SQLite and simulated IndexedDB, but the browser file-picker restore flow was not exercised.

Screenshot: `docs/fieldnotes-browser-storage.png`.


Verified locally on October 25, 2026 (America/Los_Angeles). The personal library contains real source records. Synthetic fixtures run only in isolated test databases; the temporary browser check was separate from the personal library.

## Previous delivery: Reddit and reading flow

Verified October 25, 2026 (America/Los_Angeles):

- **66 automated tests pass** and **the production build passes**. Eight Reddit tests cover community input/URL validation, Atom and OAuth parsing, realistic escaped footer cleanup, stable discussion identity and safe links, bounded results, server-only tokens, preservation on API rejection, Reddit-specific backoff durations, RSS retirement, source API persistence and collected-text discovery. Build warnings remain limited to existing optional WebLLM chunk size and dependency comment annotations.
- **Live Reddit succeeds**: `test/reddit-live.ts` collected 40 public r/MachineLearning posts with real discussion URLs, supplied excerpts, separate linked-source URLs and idempotent ingestion into a discarded in-memory database. A browser review used a separate SQLite online backup of the existing library, added one Reddit source through the form and loaded the same live posts. No review data was inserted into the personal library.
- **Browser flow verified**: Latest displays all content types; source search, suggested subreddit filling, URL validation beside the form, save success and source switch render correctly. A Reddit post opens with POST/Post excerpt labels, author metadata and a discussion link. Bookmarking it and searching Saved returned that one saved post. Search respects the current view.
- **Phone layout checked at 390 × 844**: navigation, search and filters fit without horizontal overflow. Opening a row scrolls directly to the reader and focuses Back to list; returning restores keyboard focus to the clicked row. The browser viewport was reset after review.
- **Actual API/backend restart passes** in `test/api-smoke.ts`, including normalized Reddit community configuration and paused status surviving a restart, unsafe community URLs rejected, and existing read/save/topic/trail/profile behavior preserved.

Screenshots: `docs/fieldnotes-reddit.jpg` shows real Reddit posts in the isolated review library. Reddit sources remain opt-in in the personal library.

The updated backend is serving the personal library on port 3001. Before/after checks retained all 11 sources, 314 source records, 248 story groups and four personal-state rows. A consistent SQLite backup was saved at `data/backups/before-reddit-2026-10-25.sqlite` before restarting. No new schema migration was required for Reddit.

Live testing used public RSS; approved OAuth access was tested with deterministic responses because no approved Reddit token was available. Public RSS is scheduled to end November 13, 2026, and Reddit says remaining public API access ends March 2027. The card and README disclose these limits. The application does not obtain or refresh approval/tokens, read comments, or write to Reddit. Summary scope is covered by tests; no fresh GPU summary-quality evaluation was performed for Reddit posts. Existing OpenReview/citation access limits below remain unchanged.

## Previous delivery: Open Source

Verified October 25, 2026 (America/Los_Angeles):

- **58 automated tests pass** and **the production build passes**. Eight new tests cover GitHub handle/profile URL validation, safe project identities and metadata, pagination and request coalescing, HTTP cache reuse across SQLite reopening, rate-limit fallback, concurrent collection additions/removal, malformed-response preservation, and API validation/release follow integration.
- **Live public GitHub data works**: the browser loaded the first 100 and then 200 projects from `f20201351h-maker`'s stars in an isolated preview. Adding `karpathy` by profile URL loaded another real public collection. No synthetic projects were inserted into the personal library.
- **Browser controls verified**: project search, Python language filtering, descending star sorting, local Next paging, loading the next GitHub batch, switching collections, adding a profile URL, and following/unfollowing a project's releases.
- **Production backend restarted on port 3001**, with its 295 source records, 229 story groups, 4 personal-state rows and existing research trail unchanged. A SQLite online backup was saved as `data/backups/before-open-source-2026-10-25-1792949719342.sqlite` before the restart. The restarted API and browser show 100 live projects from the provided account. Screenshot: `docs/fieldnotes-open-source.png`.

Public stars require no GitHub login. Requests use the existing API cache and backoff; cached pages are shown with their original check time on failure. Search, filtering and sorting apply to loaded batches. GitHub metadata supplies descriptions, language, license, activity and star/fork counts; no project-quality or license-compliance verdict is inferred. Full collection sizes, GitHub private profiles, authenticated GitHub operations and mobile-browser layout were not tested.

## Previous delivery: search/follow and summary depth

Verified October 25, 2026 (America/Los_Angeles):

- **50 automated tests pass**. New tests cover all-subject arXiv query construction, preview without ingestion, overlap without duplicate records or resources, SQLite reopening with topic membership and read/saved state, per-provider staleness and cooldown, pause/unfollow during in-flight requests, partial provider failures, source provenance, combined-focus migration, resume preserving successful history, scheduled collector integration, and failed ingestion retaining status. Summary tests cover defined prompts and token budgets, exact bounded input, scope labels, cancellation/engine interruption, separate depth/model/interest caches, and stale input writes.
- **Production build passes**, with the existing optional WebLLM bundle-size warning.
- **Actual backend process restart passes** in `test/api-smoke.ts`: followed-topic identity, renamed name and paused state persist; invalid providers/queries are rejected; removing a topic preserves collected content. Existing source, reader, trail and personal-state checks still pass.
- **Live arXiv search/follow passes** in `test/topics-live.ts`: “topological quantum computing” returns 50 recent title/abstract matches across all subjects. Preview leaves items untouched; following ingests those records with topic membership using the cached response. This uses an isolated in-memory library.
- **Browser checks pass** against an isolated synthetic library: Library/Discover switching, query submission, result provenance and excerpt preview, Follow topic, feed chip/membership, rename and pause in Interests, and keyboard commit of Detailed with an Abstract only scope label. No synthetic data was inserted into the personal library.
- **Existing-library upgrade verified on a temporary copy**: all 295 source records, 229 story groups, 4 personal-state rows, 10 prior summary rows and the existing research trail survive. An online SQLite backup including WAL data was saved in `data/backups/before-topics-depth-2026-10-25-1792946308821.sqlite` before restarting the production backend on port 3001.

The new depth prompts were verified with a fake engine, not a fresh GPU inference/quality review. A production browser check confirmed the new controls and preserved library; its attempted local-model load correctly reported that another tab already held the GPU lock. The other tab was left untouched. The topic-management screenshot is `docs/fieldnotes-topics-v4.jpg` and uses the isolated test library. The previous real-model checks below describe the earlier delivery. The new summary cache intentionally does not reuse old prompt/depth results; old rows remain stored. Full-text/PDF ingestion and IEEE integration remain deferred. No six-hour wall-clock test was performed; staleness behavior is tested directly.

## Previous delivery: research trail and paper paging

## Passed

- **39 automated tests (`npm test`)**: parsers, exact deduplication, first-seen/fetch dates, conditional cache, rate-limit backoff, SQLite reopening and additive migrations; relevance, exclusions and feedback; URL safety and source errors. New coverage includes strict trail identifiers, evidence-only relationships, pinned versions, bounded excerpt diffs, pagination without duplicates/omissions, malformed K/page bounds, per-revision read state, old-feed downgrade protection, sparse RSS preserving richer API metadata, trail request coalescing/cooldown, partial failures retaining evidence, manual-link hide/undo persistence, concurrent arXiv spacing/body completion, malformed model output and cancellation preserving original text.
- **Production build (`npm run build`)**: TypeScript and Vite pass. The optional WebLLM runtime/worker produces the expected large-chunk warning.
- **Actual API/process restart (`node test/api-smoke.ts`)**: built UI served; read/save/profile actions persist; resource catalog and focus configuration; invalid input, foreign origin, stale summary and unsafe/duplicate links rejected; trail read/refresh, manual add/hide/undo, missing links return 404; manual relationships survive a real backend restart. Temporary localhost port 3197, external collection disabled.
- **Real versions and code (`node test/trails-live.ts`)**: Attention Is All You Need returned pinned arXiv **v7 and v6**. Their supplied title/abstract/comments are unchanged; the app correctly avoids claiming that the full papers are identical. The Token Collapse paper explicitly linked `difra100/Token_Collapse_KGQA`; the public GitHub API verified the repository. Re-ingestion added zero duplicates. Semantic Scholar returned 429 and is recorded separately as a failed check.
- **Real collection (`node test/new-sources-live.ts`)**: 50 focused arXiv papers, 60 RSS entries and 32 public Bluesky posts in a temporary database, all idempotent on replay. The original sources' cached real responses replayed **124 records** with zero duplicates and persisted across reopening (`node test/live-replay.ts`). This replay is not a claim of a new upstream HN sync.
- **Production migration/restart**: all **282 existing source records**, prior personal state and six existing summaries survived the trail schema migration. A backup was made before migration. New summaries/trails were subsequently added through real reading flows; no demo papers were inserted in the personal library.

## Browser checks

- Ranked Papers opened with configurable pagination. All **63 eligible papers** appeared across seven ten-item pages (10/10/10/10/10/10/3), with 63 distinct titles. Previous/Next boundaries, 20- and 50-item sizes, search resetting to page one, and persisted K were checked. Tests separately verify identity coverage and ordering.
- Cached **Qwen 2.5 1.5B** initialized automatically. Selecting an uncached Token Collapse paper generated a structured local summary without pressing Generate; source and Trail tabs remained usable. Existing generated summaries persisted across reload.
- A second tab reported that local AI was active elsewhere instead of loading a duplicate GPU model. Turning AI off persisted through reload, original abstracts remained readable, and explicit re-enabling returned the cached model to Ready.
- An unused localhost origin with no cached model stayed at **setup** without downloading weights. Its default summary view displayed the original abstract while waiting for explicit enablement.
- Real code evidence, pinned version links, metadata comparison selector and accurate citation failure details rendered in the Trail tab. The historical Attention paper was tested in a separate temporary backend/library, not added to the user's collection.
- In that isolated library, a clearly labeled synthetic manual relationship was added, hidden and restored. Save, Mark read, More like this, Saved, Dismissed and Restore worked without AI. Merely displaying a source had left Mark read available.

Screenshots: `docs/fieldnotes-trail-v3.jpg` and `docs/fieldnotes-papers-v3.jpg` show the production reading desk. Earlier responsive-reader/resource checks remain documented in the previous revision's screenshots.

## Limits and unverified behavior

- **Live citation ingestion is unavailable here:** Semantic Scholar's public endpoint returns HTTP 429. Parsing, bounds and preservation during failures pass synthetic tests; successful live citation discovery remains unverified. No key or paid workaround is used. Explicit source links and manually added follow-ups still work. A citation is not proof of an extension, endorsement or scientific quality.
- **NeurIPS/OpenReview** remains blocked by its public API verification challenge in this environment. The app reports the source error; successful live conference ingestion remains unverified. X/Twitter is not collected under the no-paid-API constraint.
- Version comparison covers supplied title, abstract and author comments, not full PDFs, equations or experiments. Initially only the latest/predecessor are fetched; older observed versions accumulate over time. Citation discovery is a bounded, incomplete sample.
- Model structure validation cannot establish factual accuracy. An earlier 0.5B spot check invented a release-note claim, so 1.5B remains recommended. Current browser tests establish initialization/generation/recovery on this machine, not quality across every paper or support on every GPU/browser.
- No six-hour wall-clock or overnight sleep/wake test, mobile GPU test, browser cache eviction test, large archive/load test, authenticated sharing test or human-labeled relevance precision/recall benchmark. Scheduled work requires an awake computer and running backend. Reading queries are bounded to 5,000 records.

## Reproduce

```sh
npm test
npm run build
node test/api-smoke.ts
node test/topics-live.ts        # optional real public topic search
node test/trails-live.ts        # optional real public requests
node test/new-sources-live.ts   # optional real public requests
node test/live-replay.ts        # needs existing original cached responses
```

Manual browser check: open Papers, choose 10 per page, use Next/Previous, change K and search. Open a paper's Trail, inspect version/evidence links and Source checks, then add/hide/undo a known link. Save/read/dismiss/restore an item. In Local AI, check device/size and explicitly enable the first download. Select an uncached abstract, compare its automatic summary with Source, cancel another generation, and reload. A cached model should resume automatically; Turn off should persist. Open a second tab to confirm its GPU lock warning. Restart the backend and inspect saved items/trails.

Run locally at http://127.0.0.1:3001. Setup: `README.md`. Code walkthrough: `docs/ARCHITECTURE.md`.
