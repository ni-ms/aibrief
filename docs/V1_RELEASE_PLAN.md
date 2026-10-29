# Fieldnotes (`aibrief`) — Consolidated v1.0 Release Plan

This document consolidates **every** feature across Core Polish, Next-Gen Ranking (BM25F + RRF + MMR), Local Semantic Search, HTML/Webpage & Markdown/BibTeX Export, Personal Fieldnotes, Hybrid AI, Full-Text Reader View, and the User Feedback/Suggestions Widget into one complete v1.0 specification.

---

## 1. Beyond BM25: Next-Generation Ranking & Retrieval Architecture

### Why Standard BM25 Falls Short in a Research Desk
In `shared/ranking.ts`, the current ranker uses single-stream BM25 over a concatenated string (`title + abstract + releaseText`) with ad-hoc multipliers. This has three classic information-retrieval weaknesses:
1. **Vocabulary Mismatch (Zero Recall on Synonyms)**: A query or interest for *"speculative decoding"* misses a paper titled *"Draft-and-Verify Token Generation for Fast Autoregressive Inference"* unless the exact words overlap.
2. **Field Dilution (BM25 vs. BM25F)**: Concatenating fields normalizes term frequency against total document length, so a long 4,000-word GitHub release note or Substack essay dilutes a strong match in the title or category tags.
3. **Naive Feedback Transfer**: Picking the top 20 rarest words from liked items can overfit to incidental words rather than learning a true preference vector.

### The 4-Stage Hybrid v1.0 Ranker (`shared/ranking.ts`, `shared/briefing.ts`)

| Stage | Algorithm | How It Works & Why It Beats BM25 |
| :--- | :--- | :--- |
| **1. Lexical Fielded Scoring (`BM25F` + Phrase Proximity)** | **BM25F (Field-Weighted BM25) + SDM (Sequential Dependence Model)** | Computes per-field saturation and length normalization separately across `title` ($w=3.5$), `topics/tags` ($w=2.5$), `authors/venue` ($w=1.5$), and `body` ($w=1.0$), plus a proximity bonus when query terms appear adjacent or within a 4-word window. |
| **2. Dense Semantic Retrieval (`Cosine Similarity`)** | **Local Embeddings (`all-MiniLM-L6-v2` q8 via `@huggingface/transformers` + Subword N-Grams)** | Encodes each item's `title + abstract` and the user's interest profile into normalized vectors stored in SQLite (`item_embeddings`). Captures conceptual similarity even with zero keyword overlap. |
| **3. Rank Aggregation (`RRF`)** | **Reciprocal Rank Fusion ($RRF(d) = \sum \frac{1}{k + r_i(d)}$, $k=60$)** | Combines the BM25F lexical rank and the Semantic rank without brittle score-scale calibration. Items that rank well in *both* exact keywords and semantic meaning float to the top. |
| **4. Personalization & Diversity (`Rocchio` + `MMR`)** | **Rocchio Feedback Centroid + Maximal Marginal Relevance (MMR)** | Maintains a user preference vector $\vec{u} = \alpha \vec{q}_{\text{profile}} + \beta \frac{1}{|D^+|} \sum \vec{d}^+ - \gamma \frac{1}{|D^-|} \sum \vec{d}^-$ from explicit 👍/👎 votes, then selects the 10-item **For You** briefing via **MMR** ($\arg\max [\lambda \cdot \text{Rel}(d) - (1-\lambda)\max_{s \in S} \text{Sim}(d, s)]$) for mathematical diversity across topics and sources. |

---

## 2. Local Semantic Search (Zero-Cloud, Browser + Node Compatible)

### Architecture (`shared/semantic.ts`, `src/semantic.worker.ts`, `server/storage/schema.sql`)
- **Storage**: Add an additive SQLite table in `server/storage/schema.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS item_embeddings (
    group_id INTEGER PRIMARY KEY,
    content_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    vector BLOB NOT NULL,
    updated_at TEXT NOT NULL
  );
  ```
- **Two-Tier Local Engine**:
  1. **Instant Subword / Character N-Gram + TF-IDF Cosine Vectorizer (`shared/semantic.ts`)**: Works with zero model download in <2ms across all collected stories, capturing morphological variants, compound technical terms, and stem/concept overlap.
  2. **Optional Neural Embedding Worker (`Xenova/all-MiniLM-L6-v2` quantized `q8`, ~23 MB)**: Runs in a background worker via WebGPU/WASM to generate 384-dim dense embeddings.
- **User Experience**:
  - In the feed search bar (`/`), toggle or automatically blend **Keyword + Semantic Search (Hybrid RRF)** so searching *"kv cache compression"* surfaces papers on *"attention sink quantization"* and *"paged attention memory pruning"* with a `Semantic match · 89%` pill.

---

## 3. Local Briefing Webpage, Standalone `.html` Export, Personal Notes & BibTeX

### 3.1 Standalone `.html` Webpage Export & Magazine Digest View (`shared/export-briefing.ts`, `src/App.tsx`)
- **Self-Contained `.html` File ("Export Briefing as Webpage")**:
  - Generates a single, zero-dependency HTML file (`fieldnotes-briefing-YYYY-MM-DD.html`) with embedded editorial CSS, built-in Light/Dark theme switch, collapsible source excerpts, AI summaries, personal fieldnotes, and clickable badges for all original papers, repositories, and discussions.
  - Opens offline in any browser, ready to archive or share.
- **In-App Magazine / Digest Webpage View**:
  - Opens a clean, full-width newspaper layout of **Today's Briefing** (or **Saved Shelf**) with one-click **Save as `.html`**, **Export Markdown (`.md` for Obsidian)**, and **Print / Save as PDF**.

### 3.2 Personal Fieldnotes & BibTeX Citations (`server/storage/schema.sql`, `src/components/StoryReader.tsx`)
- **Per-Story Personal Notes**: Add a `note TEXT DEFAULT ''` column to `personal_state` in `server/storage/schema.sql` (and `PATCH /api/stories/:id`) with an auto-saving **My Fieldnotes** editor in `StoryReader.tsx`.
- **One-Click BibTeX Copy**: For research papers (`arxiv`, `openreview`, `hf-papers`), generate and copy a formatted `@article{...}` BibTeX citation directly from `StoryReader.tsx`.

---

## 4. Core Polish & Reader Power Features

### 4.1 Source Management & OPML Import/Export (`server/routes/sources.ts`, `src/components/ResourceLibrary.tsx`)
- **Delete Custom Sources**: Add `DELETE /api/sources/:id` in `server/routes/sources.ts` and a **Remove source** button inside the `ResourceCard` edit form in `ResourceLibrary.tsx`.
- **OPML Import & Export**: Allow importing an `.opml` / `.xml` subscription file from Feedly/NetNewsWire/Readwise and exporting all active RSS/Medium/Substack feeds as `fieldnotes-sources.opml`.

### 4.2 Actionable `⌘K` Quick-Add & Live Search (`src/components/CommandPalette.tsx`, `shared/feeds.ts`)
- Upgrade `detectSmartSource()` in `shared/feeds.ts` to also recognize `*.substack.com` as `kind: "substack"`, `lobste.rs` as `kind: "lobsters"`, and `huggingface.co/papers` as `kind: "hf-papers"`.
- In `CommandPalette.tsx`, when a user types a URL, `@handle`, `#tag`, `r/subreddit`, or `owner/repo`, show an instant **"Add Source: ..."** command and a **"Search Topic Across Upstream Providers: ..."** command right inside `⌘K`.

### 4.3 Sidebar Collapse Toggle (`[`) & First-Run Onboarding Wizard (`src/App.tsx`, `src/hooks/useShortcuts.ts`)
- **Sidebar Collapse**: Add a collapse/expand button in the sidebar header and bind the `[` key in `useShortcuts.ts` for distraction-free 2-pane reading.
- **First-Run Domain Picker**: A quick "Customize Your Desk" starter modal (also accessible anytime from **Interests**) with 1-click domain starter packs (*AI & LLMs*, *Quantum Computing*, *Systems & Compilers*, *Security & Crypto*, *Robotics*, *Bio & Health*).

### 4.4 Time-Bounded Cross-Source Clustering (`shared/trail.ts`, `server/store.ts`)
- Keep `arxiv:<id>` clustering permanent (all discussions of a specific paper belong together), while bounding `github:<owner>/<repo>` clustering in `store.ts` to items within a **14-day window** so discussions of old releases never merge into a new release months later.

### 4.5 Full-Text Article Extractor & Paper Deep Links (`src/components/StoryReader.tsx`, `server/routes/proxy.ts`)
- **Direct Paper Reader Links**: For any arXiv paper, add one-click **PDF** (`arxiv.org/pdf/<id>`) and **ar5iv HTML** (`ar5iv.labs.arxiv.org/html/<id>`) buttons in `StoryReader.tsx`.
- **On-Demand Readable Article Fetch**: For link-only or truncated RSS/HN/Lobste.rs articles, add a **"Fetch full article text"** button in `StoryReader.tsx` that fetches and extracts clean paragraph text via `/api/proxy`.

### 4.6 Hybrid AI Mode: WebGPU + Optional Local Ollama / OpenAI-Compatible Endpoint (`src/local-ai.ts`, `src/components/ModelSettings.tsx`)
- Alongside the built-in browser WebGPU model (`WebLLM`), allow configuring an optional local **Ollama / LM Studio** endpoint (`http://127.0.0.1:11434/v1/chat/completions`) or custom OpenAI-compatible endpoint in `ModelSettings.tsx`, validated by the exact same `SummarySchema` and source-bounded prompt in `shared/summary.ts`.

---

## 5. User Suggestions & Feedback Widget (Google Forms + GitHub Issue + Local Log)

### Architecture (`src/components/FeedbackModal.tsx`, `server/config.ts`)
- **Accessible Everywhere**:
  - A **"Suggest an Improvement"** button in the left sidebar footer and in the `⌘K` Command Palette.
- **3-in-1 Submission Flow**:
  1. **Google Form Integration**: Configurable `FEEDBACK_GOOGLE_FORM_URL` in `server/config.ts` (plus optional entry IDs for pre-filling *Category*, *Suggestion/Feedback*, and *Example URL*). Clicking **Submit via Google Form** opens your Google Form with the user's input pre-populated.
  2. **GitHub Issue Template Link**: One-click button to open a pre-filled GitHub issue.
  3. **Local SQLite Feedback Log**: Saves submitted suggestions locally in SQLite metadata (`feedback:items`) with a one-click JSON/Markdown export so no idea is ever lost offline.

---

## 6. Master v1.0 Implementation Checklist

### Pillar A: Next-Gen Ranking, Clustering & Local Semantic Search
- [ ] **A1. BM25F + Phrase Proximity + Rocchio Centroid + MMR (`shared/ranking.ts`, `shared/briefing.ts`)**
- [ ] **A2. Local Semantic Search & Hybrid RRF (`shared/semantic.ts`, `server/storage/schema.sql`, `src/App.tsx`)**
- [ ] **A3. 14-Day Time-Bounded GitHub Repo Clustering (`shared/trail.ts`, `server/store.ts`)**

### Pillar B: Core Polish, Source Management & Onboarding
- [x] **B1. 11 Core Connectors, Parallel Collection & Embedded GitHub Stars Explorer inside Sources**
- [ ] **B2. Source Deletion (`DELETE /api/sources/:id`) & OPML Import/Export (`server/routes/sources.ts`, `src/components/ResourceLibrary.tsx`)**
- [ ] **B3. Actionable `⌘K` Quick-Add & Smart Substack/Lobste.rs/HF Detection (`src/components/CommandPalette.tsx`, `shared/feeds.ts`)**
- [ ] **B4. Sidebar Collapse Button + `[` Shortcut & Starter Pack Onboarding (`src/App.tsx`, `src/hooks/useShortcuts.ts`)**

### Pillar C: Reader Power Tools, Hybrid AI, Exports & Feedback
- [ ] **C1. Standalone `.html` Webpage Export, Magazine Digest View & Markdown Export (`shared/export-briefing.ts`, `src/App.tsx`)**
- [ ] **C2. Personal Fieldnotes Editor & One-Click BibTeX Citation Copy (`server/storage/schema.sql`, `src/components/StoryReader.tsx`)**
- [ ] **C3. Full-Text Readable Article Fetch & arXiv PDF / ar5iv HTML Deep Links (`src/components/StoryReader.tsx`)**
- [ ] **C4. Hybrid AI Support: WebGPU + Optional Local Ollama / OpenAI-Compatible Endpoint (`src/local-ai.ts`, `src/components/ModelSettings.tsx`)**
- [ ] **C5. In-App Suggestions & Feedback Modal with Google Form Integration (`src/components/FeedbackModal.tsx`, `server/config.ts`)**
