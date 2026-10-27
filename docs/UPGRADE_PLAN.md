# Fieldnotes (`aibrief`) — End-to-End Architecture, Source & UI/UX Upgrade Plan

This document outlines the technical implementation plan to transform Fieldnotes into a fast, high-signal, keyboard-first research and engineering workspace.

---

## Phase 1: Real-Time Collection Engine & Browser CORS Proxy

### 1.1 Parallel Non-Blocking Collection (`server/collector.ts`, `server/config.ts`)
- **Problem**: `Collector.refresh()` currently iterates over all enabled sources in a single `for...of` loop. A single slow feed or arXiv's 3.1-second rate-limit spacing blocks every other source behind it. Additionally, `SYNC_INTERVAL_MS` is 6 hours and `MANUAL_COOLDOWN_MS` is 5 minutes, silently skipping sources even on manual refresh.
- **Solution**:
  - Split enabled sources into two lanes:
    1. **Fast lane (concurrent)**: GitHub, Hacker News, Reddit, Medium, Substack, Hugging Face Papers, Lobste.rs, Bluesky, and RSS feeds run concurrently via `Promise.allSettled` (with a concurrency cap of 6).
    2. **Serial lane**: arXiv feeds continue through `http.arxivQueue` (3.1s spacing) in parallel with the fast lane so they never block non-arXiv sources.
  - Lower `SYNC_INTERVAL_MS` from `6 hours` to `45 minutes` (`45 * 60 * 1000`), and lower `MANUAL_COOLDOWN_MS` to `30 seconds` (with a `force = true` flag on explicit user-triggered **Refresh** or single-source refresh).
  - Add `refreshSource(sourceId: string)` to `Collector` and expose `POST /api/sources/:id/refresh` so users can refresh an individual source on demand.
  - Track per-source live collection state (`syncingSourceIds: string[]`) in `/api/feed` so the UI can show real-time progress per feed.

### 1.2 Same-Origin Feed Proxy for Browser Mode (`vite.config.ts`, `server/routes/proxy.ts`, `server/http.ts`)
- **Problem**: In browser-only mode (`npm run dev`), direct `fetch()` calls from the Web Worker to Medium, arXiv RSS, Reddit, Substack, and many personal blogs fail due to missing `Access-Control-Allow-Origin` headers.
- **Solution**:
  - Add a lightweight `/api/proxy?url=...` endpoint validated by `assertPublicFeedUrl` (strictly public HTTPS, no credentials, max 3 safe redirects, 12 MB cap, no auth headers forwarded).
  - Configure a Vite dev/preview middleware plugin in `vite.config.ts` that serves `/api/proxy` automatically during `npm run dev` and `npm run preview`, even when running in pure browser-SQLite mode.
  - In `HttpClient.requestText` (`server/http.ts`), when `browserMode` is active and a direct CORS `fetch` throws a `TypeError` (or for known non-CORS hosts like `medium.com`, `rss.arxiv.org`, `substack.com`), automatically retry through the local same-origin `/api/proxy` endpoint if available before surfacing an error.

---

## Phase 2: High-Signal Sources & Live Upstream Discovery

### 2.1 New First-Class Source Connectors (`server/sources/`, `server/resources.ts`, `shared/types.ts`)
1. **Hugging Face Daily Papers (`kind: "hf-papers"`, `server/sources/hf-papers.ts`)**:
   - Fetches `https://huggingface.co/api/daily_papers` (JSON API with title, abstract, authors, `arxivId`, upvote count, and GitHub repo links).
   - Normalizes `canonicalUrl` to `https://arxiv.org/abs/<id>` so HF Daily Papers automatically group with arXiv preprints while adding a `"Hugging Face paper page"` link and preserving community curation signals.
2. **Substack (`kind: "substack"`, `server/sources/substack.ts`, `shared/substack.ts`)**:
   - First-class card under **Writing** supporting `@handle`, publication subdomain (`importai`, `importai.substack.com`), or custom Substack URLs.
   - Extracts clean article excerpts, authors, and linked arXiv/GitHub references.
3. **Lobste.rs (`kind: "lobsters"`, `server/sources/lobsters.ts`)**:
   - Collects top/newest technical stories from `https://lobste.rs/hottest.json` or tag-filtered feeds (e.g., `ai`, `ml`, `plt`, `distributed`, `security`), preserving both the external article/paper link and the `Lobste.rs discussion` link.

### 2.2 Smarter Hacker News Ingestion (`server/sources/hackernews.ts`)
- **Problem**: `parseHN` drops any story that does not immediately match `profile.terms` at fetch time, causing breaking releases with new project names to be lost.
- **Solution**:
  - Collect top/new/Show HN stories that either match interest terms **or** cross a high-signal score/comment threshold (e.g., `score >= 100`) **or** link to technical domains (`github.com`, `arxiv.org`, `huggingface.co`, `openreview.net`), letting the local ranker score them rather than discarding them at ingest.

### 2.3 Multi-Provider Upstream Topic Search (`server/topics.ts`)
- Upgrade `TopicService.providers()` and `searchProvider()` so **Find & follow topics** queries live upstream APIs in addition to arXiv:
  - **arXiv** (`upstream`): All-subject title/abstract API search.
  - **Hacker News · Algolia** (`upstream`): Queries `https://hn.algolia.com/api/v1/search_by_date?query=...&tags=story` for real-time community discussions across all of HN.
  - **Hugging Face Papers** (`upstream`): Queries `https://huggingface.co/api/papers/search?q=...` for trending ML papers.
  - **GitHub Repositories** (`upstream`): Queries `https://api.github.com/search/repositories?q=...&sort=updated` for relevant open-source tools.

---

## Phase 3: Cross-Source Story Clustering & Structured Daily Briefing

### 3.1 Cross-Source Story Grouping (`server/store.ts`, `shared/trail.ts`)
- **Problem**: Currently `store.ingest()` only groups items when their `canonicalUrl` is identical. If a Reddit post, Medium article, or HN thread links to `https://arxiv.org/abs/2610.12345` or `https://github.com/owner/repo` inside `item.links`, it remains a separate ungrouped row instead of enriching the primary paper/release story.
- **Solution**:
  - When ingesting or grouping stories in `store.stories()`, check both `item.canonicalUrl` and explicit research/code `item.links` (`arxivId` or normalized `github.com/owner/repo` release) so discussions on HN/Reddit/Lobste.rs and articles on Medium/Substack attach as multi-source perspectives on the same development, displaying source pills (`arXiv`, `HN`, `Medium`) on a single unified story card.

### 3.2 Structured "For You" Briefing (`shared/briefing.ts`, `src/App.tsx`)
- Organize the **For you** view into three scannable sections:
  1. **Key Research & Preprints** (`kind === "research"`)
  2. **Releases & Open-Source Tools** (`kind === "tools"`)
  3. **Articles & Community Discussions** (`kind === "news"`)
- Add a **"Summarize Briefing"** action that queues the top unread items through the local WebLLM worker with a progress bar.

---

## Phase 4: Modern 3-Pane Workspace UI, Keyboard Navigation & Command Palette

### 4.1 3-Pane Desktop & Responsive Layout (`src/App.tsx`, `src/styles.css`, `src/workspace.css`)
- Replace the stacked horizontal navigation bars with a cohesive **3-Pane Workspace**:
  - **Left Sidebar (Collapsible, 240px)**:
    - **Primary Views** with live unread/item badges: *For You (Briefing)*, *Latest*, *Papers*, *Tools & Releases*, *Articles & Discussions*, *Saved*, *Dismissed*.
    - **Followed Topics** section with one-click filter chips, status dots, and an inline `+ New Topic` button.
    - **Connected Sources** section showing each active feed, its sync dot, a per-source refresh button, and `+ Add Source`.
    - **Footer controls**: Theme toggle (*Editorial Light* / *Carbon Dark*), Local AI status pill, and *Your Data*.
  - **Center Feed Pane (Scannable Cards/Rows)**:
    - Unified top toolbar with instant filter/search bar, content-type pills, sort toggle (*Newest* vs. *Relevance*), and a live sync progress bar.
    - **Rich Story Cards**:
      - Source badge + icon (`arXiv`, `HF`, `GH`, `HN`, `r/`, `M`, `Substack`, `Lobste.rs`) + relative timestamp (`12m ago`).
      - Bold title + 2-line clean excerpt preview (`abstract` or `releaseText`).
      - Topic & metadata pills (`v2`, author count, multi-source discussion badges, relevance score pill).
      - **Hover Quick-Action Bar**: *Save (`s`)*, *Mark Read (`m`)*, *More like this (`+`)*, *Dismiss (`e`)*, and *Open original (`o`)* without needing to open the reader first.
  - **Right Reader Pane (Sticky Split-View or Drawer)**:
    - Formatted readable paragraphs (splitting dense abstracts/articles into clean blocks), author list, clickable source badges, one-click **Source / Local AI Summary / Research Trail** tabs, and inline summary depth controls.

### 4.2 Command Palette (`⌘K`) & Keyboard-First Triage (`src/components/CommandPalette.tsx`, `src/hooks/useShortcuts.ts`)
- **`⌘K` / `Ctrl+K` Command Palette**:
  - Instant fuzzy search across all commands: *Quick-add any blog/Medium/subreddit/repo*, *Search & follow a new topic*, *Switch view*, *Refresh all or specific source*, *Toggle dark mode*, *Summarize current story*.
- **Single-Key Triage Shortcuts** (when not typing in an input):
  - `j` / `↓` and `k` / `↑`: Next / previous story in the list.
  - `s`: Toggle Save/Bookmark on selected story.
  - `m`: Toggle Read/Unread on selected story.
  - `e` or `d`: Dismiss selected story and advance to next.
  - `o`: Open original article/paper in a new tab.
  - `/`: Focus the search bar.
  - `?`: Show keyboard shortcuts cheat sheet.

---

## Phase 5: Verification & Regression Suite
- Add unit and integration tests for:
  - Parallel collector execution, force-refresh, and single-source refresh (`test/collector.test.ts`).
  - New connectors: Hugging Face Daily Papers, Substack, Lobste.rs, and upstream HN Algolia discovery (`test/new-connectors.test.ts`).
  - Cross-source story clustering and briefing sectioning (`test/core.test.ts`).
- Run `npm test`, `npm run test:browser`, `npm run build`, and `node test/api-smoke.ts` to verify zero regressions.
