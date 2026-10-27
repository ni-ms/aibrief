import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Check,
  FileText,
  LoaderCircle,
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
  onAction: (patch: Record<string, unknown>) => void;
  onSummary: () => void;
  onModel: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState(preferSummary ? "summary" : "source");
  const [draftDepth, setDraftDepth] = useState(depth);
  useEffect(() => setDraftDepth(depth), [depth]);
  useEffect(
    () => setTab(preferSummary ? "summary" : "source"),
    [s?.id, preferSummary],
  );
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
  const text = s.abstract || s.releaseText;
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
  return (
    <article className="reader">
      <button className="reader-back" onClick={onBack}>
        ← Back to list
      </button>
      <div className="reader-meta">
        <span className="publication-type">{type}</span>
        <span>{date(s.publishedAt)}</span>
        <span>{s.topics[0]}</span>
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
      </div>
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
          <p>{text || "This source provides a title and link only."}</p>
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
            {!text
              ? "No source text to summarize."
              : busy
                ? "Local AI is working."
                : modelStatus === "ready"
                  ? "Summarize this source excerpt."
                  : "Enable a browser model to summarize this excerpt."}
          </p>
          {text && (
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
                  : "Set up local AI"}
            </button>
          )}
          {text && (
            <div className="reader-body source-fallback">
              <div className="generated-label">SOURCE {scope(s)}</div>
              <p>{text}</p>
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
      <details className="match-details">
        <summary>Why this matched</summary>
        <div>
          {s.reasons.map((reason) => (
            <p key={reason}>{reason}</p>
          ))}
          {s.ranking && (
            <dl>
              {[
                ["Text", s.ranking.lexical],
                ["Focus", s.ranking.focus],
                ["Feedback", s.ranking.feedback],
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
          disabled={!text || busy}
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
