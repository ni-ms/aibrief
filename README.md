# Fieldnotes

A local reading desk for the research, releases, articles and discussions you follow. Write your interests, select resources, and get a finite “since last visit” list with original source material.

## Run in your browser

The default app runs entirely in the browser. **SQLite compiled to WebAssembly** runs in a dedicated worker; committed snapshots are saved atomically to **IndexedDB**. Reading data and settings do not use localStorage or sessionStorage. There is no hosted backend or database account to configure.

Requires Node.js 24+ and npm for development/building:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5174**. Keep one Fieldnotes tab open at a time: a browser lock prevents another tab from overwriting your database. Source collection runs while the app is open and awake. Failed source requests keep cached items and report the error. Direct collection depends on the source allowing browser requests; arXiv, Reddit, OpenReview, and arbitrary RSS feeds may reject them. WebAssembly cannot bypass cross-origin restrictions, and no third-party proxy is used.

Open **Your data** to request persistent browser storage, download a SQLite backup, or restore one. Restoring explicitly replaces the current browser database. Browser storage is isolated by **origin**, not by repository path, and is **not password encrypted**. Avoid sharing the hosting origin with untrusted apps. Clearing site data, private browsing, or storage pressure (if persistence is not granted) can remove local data; keep backups. Data is specific to the browser profile and site URL. AI model files use WebLLM's browser cache separately.

To bring your existing local-server data into the browser:

```sh
npm run backup:server
```

Import the generated `data/fieldnotes-browser-backup.sqlite` in **Your data → Restore a backup**. The command takes a consistent SQLite snapshot, including committed WAL data, and refuses to overwrite an existing backup. Pass another output path after `--` to make an additional backup. The original database stays in place. Never commit databases or private backups to the repository.

## Deploy to GitHub Pages

[The workflow](.github/workflows/deploy-pages.yml) tests and builds pushes to `main`, then deploys only `dist/`. It also supports **Run workflow** on `main`. It uses Node.js 24 and GitHub's Pages actions, requires no deployment secret, and uses the Pages base path for the app, workers, and SQLite WASM asset. Repository URLs, user/organization sites, and custom domains use the same workflow. It never packages the local `data/` folder.

In your existing GitHub repository, choose **Settings → Pages → Build and deployment → Source → GitHub Actions**, then push these files to `main`. No repository is created by this setup. Each visitor gets their own browser database; deploying a new build at the same origin and path retains existing browser data through additive schema migrations.

To verify a project URL locally:

```sh
npm run build -- --base=/fieldnotes/
npm run preview -- --base=/fieldnotes/ --port 4174
```

Open **http://127.0.0.1:4174/fieldnotes/**. The database and WASM runtime need no special cross-origin isolation headers. Changing the repository path, custom domain, port, or browser profile requires exporting/importing your data.

See [GitHub's custom Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [sql.js](https://sql.js.org/documentation/), and [browser storage persistence](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Optional local server mode

Requires **Node.js 24+** and npm. Core sources need no account, API key or paid service. Reddit also supports an optional approved API token; its public RSS access is temporary (see below).

```sh
npm install
npm run dev:server
```

Open **http://127.0.0.1:5174**. Vite proxies `/api` to the Node backend on `127.0.0.1:3001`. Both bind to loopback. Port 5174 avoids another local app using 5173.

For a single production process:

```sh
npm run build:server
npm start
```

Open **http://127.0.0.1:3001**. Stop with Ctrl+C. Data persists in `data/fieldnotes.sqlite`; existing databases upgrade without a reset. `DB_PATH` changes the database path. `PORT` changes the backend port; update Vite's proxy too when developing.

## Use

- **Sources:** add or pause feeds, repository releases, subreddits, social accounts and conference venues. Search by service or configured feed name. Adding a source starts collection; the switch pauses updates while retaining cached items. Configuration errors appear beside the source that needs fixing.
- **Open Source:** explore public GitHub stars, starting with `f20201351h-maker`'s collection. Add a username or GitHub profile URL to keep another collection. Search descriptions and topics, filter by language or topic, sort by stars/activity, and follow a project's releases into Read. GitHub returns 100 projects per batch; search and filters cover loaded projects, with paging and **Explore more** for the rest. Up to 12 collections persist across visits. No GitHub login is needed for public collections; this does not star repositories on your GitHub account.
- **Search and follow:** use **Search this view** to search the current Latest, Papers, Saved or topic list. Use **Find & follow topics** to preview recent public arXiv results across all subjects and search already-collected sources, including Reddit. Choose providers, search a topic such as “topological quantum computing,” inspect the excerpts and provenance, then choose **Follow topic**. Followed queries become chips above the feed; **Open topic feed** takes you there immediately after following.
- **Interests:** rename, pause, resume, or remove followed topics, and inspect each provider’s last success and error. Removing a topic keeps collected papers and read/saved state. Reading preferences set ranking phrases, exclusions, and optional strict focus. Recognized fields still add matching arXiv subject feeds. Existing combined focus searches migrate into separate followed topics; focus phrases now only influence ranking.
- **Feed:** opens on **Latest**, with papers, releases, articles and discussions in publication order. **For you** offers up to ten new, relevant discoveries from the past 14 days. **Papers** keeps the ranked research list; **Saved** is your reading shelf. Use the **Show** menu to filter content types. Each view explains its purpose and offers a useful next step when empty. Choose 10, 20 or 50 items per page. Select a row to open the reader; narrow screens have Back to list.
- Read, save, more/less and dismissal are explicit actions. Simply viewing an item does not mark it read or train the ranker. Dismissed items can be restored.

The reader’s **Summary depth** slider has Brief (contribution and main limitation), Standard (contribution, approach, results, relevance), and Detailed (methods, assumptions, evidence, limitations, remaining questions). Generation starts after releasing the slider or a keyboard adjustment, once a local model is ready. Cancel stops the worker. Depth changes are disabled during loading or generation; cancel first to choose another depth.

Local AI is preferred by default. Once enabled and cached, it starts automatically and summarizes the selected source. Source text stays one tab away and is also shown during setup or generation. Why this matched exposes terms and score components. Publication and discovery dates are not conflated.

## Resources

| Resource             | Collection                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ |
| arXiv                | Subject RSS; all-subject title/abstract topic search; API backfill for an empty RSS backlog      |
| NeurIPS / OpenReview | Public notes with an exact venue ID; supplied venue/author metadata and paper/review links |
| GitHub               | Six public releases per configured repository                                              |
| Hacker News          | Up to 120 new/top/Show HN candidates, filtered locally by interests                        |
| Reddit               | Up to 40 recent public posts per subreddit; discussion links and supplied post text; approved API token or temporary public Atom feed |
| Blogs & RSS          | Up to 60 entries from public HTTPS RSS or Atom feeds                                       |
| Bluesky              | Up to 40 public posts per configured account, excluding reposts                            |
| X / Twitter          | Not connected: official reads require paid API credits                                     |

Live OpenReview access currently returns a verification challenge in this environment. The app displays that source error; no conference papers are invented or marked freshly collected. Availability can differ by network. No challenge bypass or social scraping is implemented. RSS feeds may supply only titles; such records stay link-only.

Source defaults: `server/config.ts` (shared by both runtimes). Resource catalog/presets: `server/resources.ts`. UI edits persist in SQLite. Six initial feeds cover AI, quantum physics, HN, Transformers, WebLLM and Qiskit. New resource presets are opt-in.

### Reddit

Open **Sources**, find **Reddit**, choose **Add source**, enter a subreddit name (`MachineLearning`), `r/LocalLLaMA`, or its public HTTPS community URL, then choose **Follow subreddit**. Suggested communities fill the form without adding them until you submit. Posts appear in **Latest** and **For you** when relevant; search by the source name or post text. Reading, saving, dismissal and local summaries work as for other posts. Reddit discussions retain their own identity even when they link to an already-collected paper. Comments and linked full articles are not fetched.

**Reddit is retiring public RSS on November 13, 2026.** Before that date, public feeds may work without an account; access can still be denied or rate limited. After the cutoff the collector reports that API setup is required. The source card shows which transport is configured and the retirement notice. Failed checks retain previous posts and the last successful collection time. This integration is read-only and does not post, vote or sign into a Reddit account.

For an app with Reddit's explicit API approval, configure `REDDIT_ACCESS_TOKEN` in the backend's environment and optionally `REDDIT_USER_AGENT` with your approved app's identification, then restart the backend. The token needs permission to read the community. It is sent only in an authorization header to `oauth.reddit.com`; it is never stored in SQLite or returned to the browser. Tokens expire and must be replaced through your approved authorization process; there is no automatic token acquisition/refresh. A rejected token produces a visible setup error without silently switching transports. Do not paste credentials into a source name or URL.

Reddit also states that remaining public Data API access will end in March 2027. This connector therefore follows Reddit's currently available access paths and does not promise indefinite external access. See [Reddit's October changelog](https://support.reddithelp.com/hc/en-us/articles/54353370049684-Changelog-October-8-2026), [October moderator newsletter](https://www.reddit.com/r/modnews/comments/1x6rjnd/mod_monthly_your_october_2026_newsletter_is_here/) and [Data API guidance](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Reddit-Data-API-Wiki).

Collection runs on stale startup and approximately every six hours, with a 15-minute staleness check. **The browser tab and computer must be awake (or the backend in optional server mode).** Manual checks have a five-minute source cooldown. HTTP caching, conditional requests, bounded retries and backoff preserve prior data on failure. All arXiv requests are serial and spaced at least 3.1 seconds apart; run one backend instance. Custom RSS URLs and redirects must use public HTTPS addresses.

Followed topics live separately from Resources in SQLite, with query/provider membership and status per provider. Following starts an initial batch immediately, then topics join the stale-startup/six-hour collection cycle. Up to 20 topics can be followed. Overlapping topics reuse the same arXiv records and exact paper groups. Discover previews do not insert papers or follow a query. arXiv offers upstream title/abstract search (all query words, no enabled-category restriction, up to 50 recent results); other configured providers match collected text only, with their source freshness shown. Public search previews reuse the HTTP cache for five minutes. arXiv topic search works independently of the category-feed toggles in Resources.

## Research trail

Open a paper’s **Trail** tab. The local data worker (or optional backend) checks the official arXiv API for the latest version and its predecessor, retains observed versions, and shows exact title/abstract/comment edits with pinned version links. This compares metadata, **not full PDFs**. A newer version becomes unread without losing saved state. An older feed cannot overwrite it.

Code comes from explicit repository URLs in abstracts/comments or collected releases that link the paper. Public GitHub API checks add repository availability and latest releases. Follow-ups are exact links in collected papers plus a bounded Semantic Scholar citation sample (up to 100 inspected, 20 shown). Citations are labeled as citations, not verified extensions. No title similarity creates a relationship. You can add known links and hide/undo them.

Opening a stale trail starts a check. The ten most recently checked trails are also refreshed roughly every six hours while the app is open and awake. Manual updates have a five-minute cooldown. Checks share the collector’s HTTP cache, arXiv queue and rate-limit backoff. Failed checks preserve evidence and last-success timestamps. Semantic Scholar currently returns 429 here; live citation retrieval remains unavailable. The trail still works with versions, explicit links and manually added follow-ups. It is not a complete citation index.

## Relevance, not popularity

The ranker combines title-weighted BM25-style matching, length normalization, specific focus phrases, freshness, and distinctive terms from explicit more/less feedback. It reduces generic “AI/model” matches and resists repeated keywords in long notes. Exclusions/strict focus affect Papers and New; All stays searchable.

Briefing selection softly penalizes repetitive titles and sources without merging evidence. Exact normalized URLs, arXiv base IDs and GitHub release IDs determine deduplication. Score means relevance, not scientific quality or confidence. There is no citation-count or conference-prestige bonus and no model decides ranking.

## Local AI

Preferred by default, with an explicit first-download enable action. Cached weights load automatically on later visits after a WebGPU check. Turning AI off persists that choice; Cancel stops the current worker. The UI reports size and progress, and a browser lock prevents two tabs from loading the same GPU model at once. Default: `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (about 828 MB weights + runtime; about 1,630 MB GPU memory). Compact 0.5B options are configurable. **The 0.5B model invented a release-note claim in testing**, so it is not recommended for faithful technical summaries.

WebLLM runs in a dedicated browser worker, caches files in IndexedDB, processes at most ten items sequentially and supports cancellation. It receives up to 4,800 characters of the current source plus your interest prompt/focus. JSON output is validated; citations come from stored URLs. Validation does not establish truth. Compare summaries with their source. Browser model caches are scoped to the app origin/port, so keep using the same local URL. Cached results include the exact bounded input message (source text, title, source scope, and interests), depth, model, prompt version and interest hash. Brief/Standard/Detailed have separate prompts and output budgets of 220/420/800 tokens. Abstract-based summaries explicitly say **Abstract only**; Detailed asks the model to identify missing methods, assumptions and evidence. No full paper text is fetched for summaries. No server inference or cloud fallback exists.

## Code and verification

Start with [the code walkthrough](docs/ARCHITECTURE.md). `src/App.tsx` composes pages; components and state hooks are separate. `server/index.ts` only starts the process; routes, collectors, parsers, schema and ranking have distinct files.

```sh
npm test                       # deterministic tests; clearly labeled synthetic fixtures
npm run build                  # type check and production bundle
node test/api-smoke.ts          # isolated API and actual backend restart; localhost port 3197
node test/reddit-live.ts        # optional real subreddit feed/API check; discarded memory store
node test/topics-live.ts        # optional real all-subject arXiv topic search; temporary memory store
node test/trails-live.ts        # optional real version/code/citation checks; temporary database
node test/new-sources-live.ts   # optional public-network test; temporary database
node test/live-replay.ts        # replay the original real cached payloads, when available
```

See [VERIFICATION.md](VERIFICATION.md) for results and limits. `COLLECTION_DISABLED=true` disables all collection for isolated API diagnostics; `COLLECT_ON_START=false` only skips startup collection.

Future sharing can map authenticated IDs to the existing profile/personal-state keys and collect the union of members' interests. Shared content and cached summaries remain separate. No auth, invitations, billing or social feed are implemented. Recent API queries are bounded to 5,000 source records; older SQLite data remains stored.

IEEE metadata/full text and institutional authentication are deferred. No IEEE connector or credential storage is added by this delivery; the keyless app remains independently usable.

## Primary documentation

[arXiv RSS](https://info.arxiv.org/help/rss.html) · [arXiv search](https://info.arxiv.org/help/api/user-manual.html) · [arXiv rate limits](https://info.arxiv.org/help/api/tou.html) · [HN](https://github.com/HackerNews/API) · [GitHub releases](https://docs.github.com/en/rest/releases/releases) · [Semantic Scholar](https://api.semanticscholar.org/api-docs/) · [OpenReview](https://docs.openreview.net/reference/api-v2) · [Bluesky](https://docs.bsky.app/docs/api/app-bsky-feed-get-author-feed) · [X pricing](https://docs.x.com/x-api/getting-started/pricing) · [WebLLM workers](https://webllm.mlc.ai/docs/user/advanced_usage.html#using-web-workers)
