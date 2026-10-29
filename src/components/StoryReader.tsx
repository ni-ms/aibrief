import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  BookOpen,
  Check,
  Copy,
  FileCode2,
  FileText,
  LoaderCircle,
  StickyNote,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import type { Story, Summary, SummaryDepth } from "../../shared/types.ts";
import {
  DEPTH_SETTINGS,
  SUMMARY_DEPTHS,
  SOURCE_LIMIT,
  summaryScope,
} from "../../shared/summary.ts";
import { generateBibtex } from "../../shared/export-briefing.ts";
import { ResearchTrail } from "./ResearchTrail";
import { date, scope } from "../lib/format";

const sentences = new Intl.Segmenter("en", { granularity: "sentence" });
function SummaryPoints({ text }: { text: string }) {
  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•–]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
  const points =
    lines.length > 1
      ? lines
      : [...sentences.segment(lines[0] || "")].map((part) =>
          part.segment.trim(),
        );
  return (
    <ul className="summary-points">
      {points.map((point, index) => (
        <li key={index}>{point}</li>
      ))}
    </ul>
  );
}

/** Split dense single-block abstracts into readable 3-sentence paragraphs. */
function formatReadableParagraphs(raw: string): string[] {
  const explicit = raw
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (explicit.length > 1) return explicit;
  const parts = [...sentences.segment(raw)]
    .map((s) => s.segment.trim())
    .filter(Boolean);
  if (parts.length <= 3) return [raw];
  const chunks: string[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    chunks.push(parts.slice(i, i + 3).join(" "));
  }
  return chunks;
}

/** Extract clean readable paragraphs from fetched HTML without executing scripts. */
function extractReadableHtmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const bad of doc.querySelectorAll(
    "script, style, nav, header, footer, aside, noscript, svg, form",
  )) {
    bad.remove();
  }
  const container =
    doc.querySelector("article") ||
    doc.querySelector("main") ||
    doc.querySelector('[role="main"]') ||
    doc.body;
  if (!container) return "";
  const paragraphs = [...container.querySelectorAll("p, h2, h3, li")]
    .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 45);
  if (paragraphs.length >= 2) {
    return paragraphs.slice(0, 40).join("\n\n");
  }
  return (container.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

export function StoryReader({
  story: s,
  summary,
  error,
  modelStatus,
  preferSummary = false,
  depth,
  onDepth,
  onAction,
  onSummary,
  onModel,
  onCancel,
  onBack,
}: {
  story: Story | null;
  summary?: Summary;
  error?: string;
  modelStatus: string;
  preferSummary?: boolean;
  depth: SummaryDepth;
  onDepth: (depth: SummaryDepth) => void;
  onAction: (patch: Record<string, unknown>) => Promise<boolean>;
  onSummary: () => void;
  onModel: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState(preferSummary ? "summary" : "source");
  const [draftDepth, setDraftDepth] = useState(depth);
  const [draftNote, setDraftNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const [bibtexCopied, setBibtexCopied] = useState(false);
  const [fetchedText, setFetchedText] = useState("");
  const [fetchingArticle, setFetchingArticle] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const articleRequest = useRef<AbortController | null>(null);
  const savedNote = useRef(s?.note || "");
  useEffect(() => () => articleRequest.current?.abort(), []);

  useEffect(() => setDraftDepth(depth), [depth]);
  useEffect(() => {
    setTab(preferSummary ? "summary" : "source");
    setDraftNote(s?.note || "");
    setNoteSaved(false);
    setBibtexCopied(false);
    setFetchedText("");
    setFetchError("");
  }, [s?.groupId]);
  useEffect(() => {
    if (preferSummary) setTab("summary");
  }, [preferSummary]);
  useEffect(() => {
    const previous = savedNote.current;
    setDraftNote((prior) =>
      prior === previous ? s?.note || "" : prior,
    );
    savedNote.current = s?.note || "";
  }, [s?.note]);
  useEffect(() => {
    if (modelStatus === "error" && !summary) setTab("source");
  }, [modelStatus, summary]);
  if (!s)
    return (
      <div className="reader reader-empty">
        <FileText size={26} />
        <span>Select a development</span>
      </div>
    );
  const text = fetchedText || s.abstract || s.releaseText;
  const hasSourceText = !!(s.abstract || s.releaseText);
  const busy = modelStatus === "working" || modelStatus === "loading";
  const type =
    s.metadata?.publicationType ||
    (s.sourceKind === "arxiv"
      ? "preprint"
      : s.sourceKind === "github"
        ? "release"
        : s.kind === "research"
          ? "paper"
          : "article");

  const arxivId =
    s.metadata?.arxivId ||
    s.canonicalUrl.match(/arxiv\.org\/abs\/([^/?#]+)/i)?.[1];

  async function handleFetchFullArticle() {
    if (!s || fetchingArticle) return;
    setFetchingArticle(true);
    setFetchError("");
    const controller = new AbortController();
    articleRequest.current = controller;
    try {
      const res = await fetch(
        `/api/proxy?url=${encodeURIComponent(s.canonicalUrl)}`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      );
      if (!res.ok) {
        throw new Error(`Could not fetch article (HTTP ${res.status})`);
      }
      const html = await res.text();
      const extracted = extractReadableHtmlText(html);
      if (!extracted || extracted.length < 60) {
        throw new Error("No additional readable article text found on page.");
      }
      setFetchedText(extracted);
      setTab("source");
    } catch (e) {
      if (!controller.signal.aborted) setFetchError((e as Error).message);
    } finally {
      setFetchingArticle(false);
    }
  }

  async function handleCopyBibtex() {
    if (!s) return;
    const bib = generateBibtex(s);
    try {
      await navigator.clipboard.writeText(bib);
      setBibtexCopied(true);
      setTimeout(() => setBibtexCopied(false), 2500);
    } catch {}
  }

  async function saveNoteNow() {
    if (!s) return;
    if (draftNote !== (s.note || "")) {
      const saved = await onAction({ note: draftNote });
      if (saved) {
        setNoteSaved(true);
        setTimeout(() => setNoteSaved(false), 2000);
      }
    }
  }

  const paragraphs = text ? formatReadableParagraphs(text) : [];

  return (
    <article className="reader">
      <button className="reader-back" onClick={onBack}>
        ← Back to list
      </button>
      <div className="reader-meta">
        <span className="publication-type">{type}</span>
        <span>{date(s.publishedAt)}</span>
        <span>{s.topics[0]}</span>
        {s.kind === "research" && (
          <button
            type="button"
            className="bibtex-btn"
            title="Copy BibTeX citation"
            onClick={() => void handleCopyBibtex()}
            style={{
              marginLeft: "4px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "10px",
              color: "var(--quiet)",
            }}
          >
            {bibtexCopied ? <Check size={12} /> : <Copy size={12} />}
            <span>{bibtexCopied ? "BibTeX copied" : "BibTeX"}</span>
          </button>
        )}
        <button
          title={s.saved ? "Unsave" : "Save"}
          aria-label={s.saved ? "Unsave story" : "Save story"}
          className={s.saved ? "selected-action" : ""}
          onClick={() => onAction({ saved: !s.saved })}
        >
          <Bookmark size={18} fill={s.saved ? "currentColor" : "none"} />
        </button>
      </div>
      <h2>{s.title}</h2>
      {s.metadata?.authors?.length ? (
        <p className="authors">
          {s.metadata.authors.slice(0, 5).join(", ")}
          {s.metadata.authors.length > 5 ? " et al." : ""}
        </p>
      ) : null}
      <div className="source-links">
        {s.links.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
            {l.label}
            <ArrowUpRight size={12} />
          </a>
        ))}
        {arxivId && (
          <>
            {!s.links.some((link) => /arxiv\.org\/pdf\//i.test(link.url)) && (
              <a
                href={`https://arxiv.org/pdf/${arxivId}.pdf`}
                target="_blank"
                rel="noreferrer"
                title="Open arXiv PDF"
              >
                PDF <ArrowUpRight size={12} />
              </a>
            )}
            <a
              href={`https://ar5iv.labs.arxiv.org/html/${arxivId}`}
              target="_blank"
              rel="noreferrer"
              title="Open HTML version on ar5iv"
            >
              ar5iv HTML <FileCode2 size={12} />
            </a>
          </>
        )}
        {s.kind !== "research" && (!text || text.length < 600) && (
          <button
            type="button"
            className="text-link"
            onClick={() => void handleFetchFullArticle()}
            disabled={fetchingArticle}
            style={{ fontSize: "10px" }}
          >
            <BookOpen size={12} />
            {fetchingArticle ? "Fetching article…" : "Fetch readable article"}
          </button>
        )}
      </div>
      {fetchError && (
        <p className="field-note error-text" role="status">
          {fetchError}
        </p>
      )}
      <div className="reader-tabs">
        <button
          className={tab === "source" ? "active" : ""}
          onClick={() => setTab("source")}
        >
          Source {scope(s)}
        </button>
        <button
          className={tab === "summary" ? "active" : ""}
          onClick={() => setTab("summary")}
        >
          Local summary{summary ? <span className="tiny-dot" /> : null}
        </button>
        {s.kind === "research" && (
          <button
            className={tab === "trail" ? "active" : ""}
            onClick={() => setTab("trail")}
          >
            Trail
          </button>
        )}
      </div>
      {tab === "trail" ? (
        <ResearchTrail key={s.groupId} groupId={s.groupId} />
      ) : tab === "source" ? (
        <div className="reader-body">
          {paragraphs.length ? (
            paragraphs.map((para, idx) => <p key={idx}>{para}</p>)
          ) : (
            <p>This source provides a title and link only.</p>
          )}
        </div>
      ) : summary ? (
        <div className="reader-body generated">
          <div className="generated-label">
            LOCAL AI · {DEPTH_SETTINGS[depth].label} · {summaryScope(s)}
            {text.length > SOURCE_LIMIT ? " · first 4,800 characters" : ""}
          </div>
          <h3>
            {depth === "detailed" ? "Contribution & methods" : "What changed"}
          </h3>
          <SummaryPoints text={summary.whatChanged} />
          <h3>Why it may matter</h3>
          <SummaryPoints text={summary.whyItMatters} />
          <h3>
            {depth === "detailed"
              ? "Evidence, limitations & open questions"
              : "Source evidence & limits"}
          </h3>
          <SummaryPoints text={summary.evidence} />
          <p className="field-note">
            Source claims, not independently verified.
          </p>
        </div>
      ) : (
        <div className="summary-empty">
          <p>
            {!hasSourceText
              ? fetchedText
                ? "Read the fetched article in Source. Summaries use saved source excerpts, which this item doesn’t include."
                : "No source text to summarize."
              : busy
                ? "Local AI is working."
                : modelStatus === "ready"
                  ? "Summarize this source excerpt."
                  : "Load a model to summarize this excerpt. Your download is saved for next time."}
          </p>
          {hasSourceText && (
            <button
              className="button"
              onClick={
                busy ? onCancel : modelStatus === "ready" ? onSummary : onModel
              }
            >
              {busy ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <FileText size={14} />
              )}{" "}
              {busy
                ? "Cancel"
                : modelStatus === "ready"
                  ? "Generate summary"
                  : "Load model"}
            </button>
          )}
          {text && (
            <div className="reader-body source-fallback">
              <div className="generated-label">SOURCE {scope(s)}</div>
              {paragraphs.map((para, idx) => (
                <p key={idx}>{para}</p>
              ))}
            </div>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <div className="reader-actions">
        <button
          className={`button ${s.read ? "selected-action" : ""}`}
          onClick={() => onAction({ read: !s.read })}
        >
          <Check size={14} />
          {s.read ? "Mark unread" : "Mark read"}
        </button>
        <div className="reader-feedback">
          <button
            aria-label="More like this"
            title="More like this"
            className={s.feedback === 1 ? "selected-action" : ""}
            onClick={() => onAction({ feedback: s.feedback === 1 ? 0 : 1 })}
          >
            <ThumbsUp size={16} />
          </button>
          <button
            aria-label="Less like this"
            title="Less like this"
            className={s.feedback === -1 ? "selected-action" : ""}
            onClick={() => onAction({ feedback: s.feedback === -1 ? 0 : -1 })}
          >
            <ThumbsDown size={16} />
          </button>
          <button
            aria-label={s.dismissed ? "Restore story" : "Dismiss story"}
            title={s.dismissed ? "Restore" : "Dismiss"}
            onClick={() => onAction({ dismissed: !s.dismissed })}
          >
            {s.dismissed ? <span>Restore</span> : <X size={17} />}
          </button>
        </div>
      </div>

      {/* Personal Fieldnotes Editor */}
      <section className="personal-fieldnotes" aria-label="Personal fieldnotes">
        <div className="fieldnotes-header">
          <label htmlFor="story-fieldnote">
            <StickyNote size={13} /> My Fieldnotes
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {noteSaved && (
              <span className="field-note" style={{ margin: 0 }}>
                Saved
              </span>
            )}
            {draftNote !== (s.note || "") && (
              <button
                type="button"
                className="button"
                style={{ padding: "3px 8px", fontSize: "10px" }}
                onClick={saveNoteNow}
              >
                Save note
              </button>
            )}
          </div>
        </div>
        <textarea
          id="story-fieldnote"
          rows={3}
          maxLength={10000}
          placeholder="Jot down key takeaways, open questions, or follow-up ideas (included when exporting briefings)…"
          value={draftNote}
          onChange={(e) => setDraftNote(e.target.value)}
          onBlur={saveNoteNow}
        />
      </section>

      <details className="match-details">
        <summary>Why this matched</summary>
        <div>
          {s.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          {s.ranking && (
            <dl>
              {[
                ["Text (BM25F)", s.ranking.lexical],
                ["Focus", s.ranking.focus],
                ["Feedback (Rocchio)", s.ranking.feedback],
                ["Freshness", s.ranking.freshness],
                ["Context", s.ranking.context],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{Number(value).toFixed(1)}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="field-note">
            Collected {new Date(s.lastFetchedAt).toLocaleString()}. First seen{" "}
            {date(s.firstSeenAt)}.
          </p>
        </div>
      </details>
      <section className="summary-depth" aria-label="Summary depth">
        <label htmlFor="summary-depth">
          Summary depth <strong>{DEPTH_SETTINGS[draftDepth].label}</strong>
        </label>
        <input
          id="summary-depth"
          type="range"
          min="0"
          max="2"
          step="1"
          value={SUMMARY_DEPTHS.indexOf(draftDepth)}
          aria-valuetext={DEPTH_SETTINGS[draftDepth].label}
          disabled={!hasSourceText || busy}
          onChange={(e) =>
            setDraftDepth(SUMMARY_DEPTHS[Number(e.target.value)])
          }
          onPointerUp={(e) => {
            const value = SUMMARY_DEPTHS[Number(e.currentTarget.value)];
            if (value !== depth) {
              onDepth(value);
              setTab("summary");
            }
          }}
          onKeyUp={(e) => {
            if (
              [
                "ArrowLeft",
                "ArrowRight",
                "ArrowUp",
                "ArrowDown",
                "Home",
                "End",
                "PageUp",
                "PageDown",
              ].includes(e.key)
            ) {
              const value = SUMMARY_DEPTHS[Number(e.currentTarget.value)];
              if (value !== depth) {
                onDepth(value);
                setTab("summary");
              }
            }
          }}
          onBlur={() => {
            if (!busy && draftDepth !== depth) onDepth(draftDepth);
          }}
        />
        <div className="depth-stops">
          <span>Brief</span>
          <span>Standard</span>
          <span>Detailed</span>
        </div>
        <p className="field-note">{DEPTH_SETTINGS[draftDepth].coverage}.</p>
        <p className="field-note">
          {summaryScope(s)}
          {text.length > SOURCE_LIMIT ? " · first 4,800 characters" : ""}.{" "}
          {draftDepth === "detailed"
            ? "Only supplied details can be covered; missing methods and evidence will be identified."
            : "Generation starts when you release the slider."}
        </p>
        {busy && (
          <button className="text-link" onClick={onCancel}>
            Cancel summary
          </button>
        )}
      </section>
    </article>
  );
}
