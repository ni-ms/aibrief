import { categorizeBriefing } from "./briefing.ts";
import type { Story, Summary } from "./types.ts";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Generate a BibTeX citation string for a paper or research item.
 */
export function generateBibtex(story: Story): string {
  const year = story.publishedAt
    ? new Date(story.publishedAt).getUTCFullYear()
    : new Date().getUTCFullYear();
  const authors = story.metadata?.authors?.length
    ? story.metadata.authors.join(" and ")
    : story.sourceName || "Unknown Author";
  const firstAuthorLast = (story.metadata?.authors?.[0] || "fieldnotes")
    .split(/\s+/)
    .pop()!
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const firstWord =
    (story.title.toLowerCase().match(/[a-z0-9]{4,}/)?.[0] || "paper");
  const key = `${firstAuthorLast}${year}${firstWord}`;
  const arxivId =
    story.metadata?.arxivId ||
    story.canonicalUrl.match(/arxiv\.org\/abs\/([^/?#]+)/i)?.[1];

  const fields: [string, string][] = [
    ["title", `{${story.title}}`],
    ["author", `{${authors}}`],
    ["year", `{${year}}`],
  ];
  if (story.metadata?.venue) {
    fields.push(["journal", `{${story.metadata.venue}}`]);
  } else if (arxivId) {
    fields.push(["journal", `{arXiv preprint arXiv:${arxivId}}`]);
    fields.push(["eprint", `{${arxivId}}`]);
    fields.push(["archivePrefix", "{arXiv}"]);
  } else {
    fields.push(["journal", `{${story.sourceName}}`]);
  }
  if (story.metadata?.doi) {
    fields.push(["doi", `{${story.metadata.doi}}`]);
  }
  fields.push(["url", `{${story.canonicalUrl}}`]);

  return `@article{${key},\n${fields.map(([k, v]) => `  ${k} = ${v}`).join(",\n")}\n}`;
}

/**
 * Generate a clean Obsidian / Markdown export of a briefing or story list.
 */
export function generateBriefingMarkdown(
  stories: Story[],
  options: {
    title?: string;
    generatedAt?: string;
    summaries?: Record<number, Summary>;
  } = {},
): string {
  const title = options.title || "Fieldnotes Research Briefing";
  const dateStr = (options.generatedAt
    ? new Date(options.generatedAt)
    : new Date()
  ).toISOString().slice(0, 10);
  const categorized = categorizeBriefing(stories);

  const renderSection = (heading: string, items: Story[]) => {
    if (!items.length) return "";
    const blocks = items.map((s, idx) => {
      const authors = s.metadata?.authors?.length
        ? ` · *${s.metadata.authors.slice(0, 5).join(", ")}${s.metadata.authors.length > 5 ? " et al." : ""}*`
        : "";
      const pubDate = s.publishedAt ? ` (${s.publishedAt.slice(0, 10)})` : "";
      const summary = options.summaries?.[s.id];
      const links = s.links
        .map((l) => `[${l.label}](${l.url})`)
        .join(" · ");
      const excerpt = (s.abstract || s.releaseText || "").slice(0, 600).trim();
      const lines = [
        `### ${idx + 1}. [${s.title}](${s.canonicalUrl})`,
        `- **Sources**: ${s.sources.join(", ")}${authors}${pubDate}`,
        ...(s.topics.length ? [`- **Topics**: ${s.topics.join(", ")}`] : []),
        ...(links ? [`- **Links**: ${links}`] : []),
        ...(summary
          ? [
              `- **What Changed**: ${summary.whatChanged}`,
              `- **Why It Matters**: ${summary.whyItMatters}`,
              `- **Evidence & Limits**: ${summary.evidence}`,
            ]
          : excerpt
            ? [`\n> ${excerpt.replace(/\r?\n/g, " ")}`]
            : []),
        ...(s.note?.trim()
          ? [`\n**Personal Fieldnotes:**\n${s.note.trim()}`]
          : []),
      ];
      return lines.join("\n");
    });
    return `## ${heading} (${items.length})\n\n${blocks.join("\n\n")}\n`;
  };

  return [
    `# ${title} — ${dateStr}`,
    `*Exported from Fieldnotes · ${stories.length} ${stories.length === 1 ? "item" : "items"}*`,
    "",
    renderSection("Key Research & Preprints", categorized.research),
    renderSection("Releases & Open-Source Tools", categorized.tools),
    renderSection("Articles & Community Discussions", categorized.news),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Generate a standalone, self-contained HTML webpage for Today's Briefing or Saved Shelf,
 * complete with embedded editorial CSS, interactive category filters, theme toggle,
 * collapsible source excerpts, AI summaries, and personal fieldnotes.
 */
export function generateBriefingHtml(
  stories: Story[],
  options: {
    title?: string;
    subtitle?: string;
    generatedAt?: string;
    summaries?: Record<number, Summary>;
  } = {},
): string {
  const title = options.title || "Fieldnotes Briefing";
  const generatedDate = options.generatedAt
    ? new Date(options.generatedAt)
    : new Date();
  const formattedDate = generatedDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const subtitle =
    options.subtitle ||
    `${stories.length} curated ${stories.length === 1 ? "development" : "developments"} across your research, code, and writing sources`;
  const categorized = categorizeBriefing(stories);

  const renderCard = (s: Story, index: number) => {
    const excerpt = (s.abstract || s.releaseText || "").trim();
    const authors = s.metadata?.authors?.length
      ? `${s.metadata.authors.slice(0, 5).join(", ")}${s.metadata.authors.length > 5 ? " et al." : ""}`
      : "";
    const pubDate = s.publishedAt
      ? new Date(s.publishedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "";
    const summary = options.summaries?.[s.id];

    return `
      <article class="briefing-card" data-kind="${escapeHtml(s.kind)}">
        <div class="card-meta">
          <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
          <div class="badge-row">
            ${s.sources
              .map(
                (src) =>
                  `<span class="source-pill">${escapeHtml(src)}</span>`,
              )
              .join("")}
            ${
              s.metadata?.arxivVersion
                ? `<span class="version-pill">v${s.metadata.arxivVersion}</span>`
                : ""
            }
            ${
              s.topics[0]
                ? `<span class="topic-pill">${escapeHtml(s.topics[0])}</span>`
                : ""
            }
          </div>
          <time class="card-date">${escapeHtml(pubDate)}</time>
        </div>
        <h3 class="card-title">
          <a href="${escapeHtml(s.canonicalUrl)}" target="_blank" rel="noreferrer">
            ${escapeHtml(s.title)} ↗
          </a>
        </h3>
        ${authors ? `<p class="card-authors">${escapeHtml(authors)}</p>` : ""}
        ${
          summary
            ? `<div class="ai-summary-box">
                <div class="ai-kicker">LOCAL AI SUMMARY</div>
                <p><strong>Contribution:</strong> ${escapeHtml(summary.whatChanged)}</p>
                <p><strong>Why it matters:</strong> ${escapeHtml(summary.whyItMatters)}</p>
                <p><strong>Evidence & limits:</strong> ${escapeHtml(summary.evidence)}</p>
              </div>`
            : ""
        }
        ${
          excerpt
            ? `<p class="card-excerpt">${escapeHtml(excerpt.slice(0, 460))}${excerpt.length > 460 ? "…" : ""}</p>`
            : ""
        }
        ${
          s.note?.trim()
            ? `<div class="personal-note-box">
                <div class="note-kicker">MY FIELDNOTES</div>
                <p>${escapeHtml(s.note.trim())}</p>
              </div>`
            : ""
        }
        <div class="card-links">
          ${s.links
            .map(
              (l) =>
                `<a href="${escapeHtml(l.url)}" target="_blank" rel="noreferrer">${escapeHtml(l.label)} ↗</a>`,
            )
            .join("")}
        </div>
      </article>`;
  };

  const renderSection = (heading: string, kind: string, items: Story[]) => {
    if (!items.length) return "";
    return `
      <section class="digest-section" data-section-kind="${escapeHtml(kind)}">
        <div class="section-header">
          <h2>${escapeHtml(heading)}</h2>
          <span class="section-count">${items.length}</span>
        </div>
        <div class="section-grid">
          ${items.map((item, idx) => renderCard(item, idx)).join("\n")}
        </div>
      </section>`;
  };

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · ${escapeHtml(formattedDate)}</title>
  <style>
    :root {
      --bg: #f6f5f0;
      --paper: #fdfdf9;
      --ink: #222520;
      --quiet: #697060;
      --line: #dcded2;
      --accent: #d84c2b;
      --pill-bg: #ebede2;
      --note-bg: #f3f6ec;
      --note-border: #8ba172;
      --mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }
    :root[data-theme="dark"] {
      --bg: #111215;
      --paper: #181a20;
      --ink: #f0f2f6;
      --quiet: #939aa9;
      --line: #262934;
      --accent: #ff6442;
      --pill-bg: #222631;
      --note-bg: #1c221c;
      --note-border: #5c7b4a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      padding: 0 20px 60px;
    }
    .digest-container {
      max-width: 960px;
      margin: 0 auto;
    }
    .digest-masthead {
      padding: 36px 0 24px;
      border-bottom: 2px solid var(--ink);
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-end;
      gap: 20px;
    }
    .wordmark {
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.4px;
      font-family: var(--mono);
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 6px;
    }
    h1 {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 38px;
      font-weight: 400;
      letter-spacing: -1px;
      margin: 0 0 6px;
    }
    .subtitle {
      margin: 0;
      color: var(--quiet);
      font-size: 14px;
    }
    .masthead-controls {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    button {
      font: inherit;
      font-size: 12px;
      padding: 6px 12px;
      border-radius: 5px;
      border: 1px solid var(--line);
      background: var(--paper);
      color: var(--ink);
      cursor: pointer;
    }
    button.active {
      background: var(--ink);
      color: var(--paper);
      border-color: var(--ink);
    }
    .digest-section {
      margin-top: 34px;
    }
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--line);
      padding-bottom: 8px;
      margin-bottom: 18px;
    }
    .section-header h2 {
      font-family: var(--mono);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--quiet);
      margin: 0;
    }
    .section-count {
      font-family: var(--mono);
      font-size: 11px;
      background: var(--pill-bg);
      padding: 2px 8px;
      border-radius: 10px;
      color: var(--quiet);
    }
    .section-grid {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .briefing-card {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 22px 26px;
    }
    .card-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 10px;
      font-family: var(--mono);
      font-size: 11px;
      color: var(--quiet);
    }
    .card-index {
      color: var(--accent);
      font-weight: 700;
    }
    .badge-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .source-pill, .version-pill, .topic-pill {
      background: var(--pill-bg);
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 10.5px;
    }
    .card-date {
      margin-left: auto;
    }
    .card-title {
      font-family: Georgia, "Times New Roman", serif;
      font-size: 21px;
      font-weight: 400;
      margin: 0 0 6px;
      line-height: 1.35;
    }
    .card-title a {
      color: var(--ink);
      text-decoration: none;
    }
    .card-title a:hover {
      color: var(--accent);
    }
    .card-authors {
      margin: 0 0 10px;
      font-size: 12px;
      color: var(--quiet);
    }
    .card-excerpt {
      margin: 10px 0 14px;
      font-size: 13.5px;
      color: var(--ink);
      opacity: 0.9;
    }
    .ai-summary-box, .personal-note-box {
      margin: 12px 0;
      padding: 12px 16px;
      background: var(--note-bg);
      border-left: 3px solid var(--note-border);
      border-radius: 4px;
      font-size: 13px;
    }
    .ai-summary-box p, .personal-note-box p {
      margin: 4px 0;
    }
    .ai-kicker, .note-kicker {
      font-family: var(--mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      color: var(--quiet);
      margin-bottom: 4px;
    }
    .card-links {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--line);
      font-size: 12px;
    }
    .card-links a {
      color: var(--quiet);
      text-decoration: none;
      font-weight: 500;
    }
    .card-links a:hover {
      color: var(--accent);
      text-decoration: underline;
    }
    footer {
      margin-top: 48px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
      font-family: var(--mono);
      font-size: 11px;
      color: var(--quiet);
      display: flex;
      justify-content: space-between;
    }
    @media print {
      .masthead-controls { display: none; }
      body { background: #fff; padding: 0; }
      .briefing-card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="digest-container">
    <header class="digest-masthead">
      <div>
        <div class="wordmark">fieldnotes · briefing</div>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(formattedDate)} — ${escapeHtml(subtitle)}</p>
      </div>
      <div class="masthead-controls">
        <button class="filter-btn active" onclick="filterSection('all', this)">All (${stories.length})</button>
        <button class="filter-btn" onclick="filterSection('research', this)">Research (${categorized.research.length})</button>
        <button class="filter-btn" onclick="filterSection('tools', this)">Tools (${categorized.tools.length})</button>
        <button class="filter-btn" onclick="filterSection('news', this)">Discussions (${categorized.news.length})</button>
        <button onclick="toggleTheme()">Theme</button>
        <button onclick="window.print()">Print / PDF</button>
      </div>
    </header>
    <main>
      ${renderSection("Key Research & Preprints", "research", categorized.research)}
      ${renderSection("Releases & Open-Source Tools", "tools", categorized.tools)}
      ${renderSection("Articles & Community Discussions", "news", categorized.news)}
    </main>
    <footer>
      <span>Generated locally by Fieldnotes</span>
      <span>${escapeHtml(generatedDate.toISOString())}</span>
    </footer>
  </div>
  <script>
    function toggleTheme() {
      const root = document.documentElement;
      root.setAttribute("data-theme", root.getAttribute("data-theme") === "dark" ? "light" : "dark");
    }
    function filterSection(kind, btn) {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".digest-section").forEach((sec) => {
        sec.style.display = kind === "all" || sec.getAttribute("data-section-kind") === kind ? "" : "none";
      });
    }
  </script>
</body>
</html>`;
}
