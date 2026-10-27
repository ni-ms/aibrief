import { Bookmark, Check, ExternalLink, ThumbsUp, X } from "lucide-react";
import type { Story } from "../../shared/types.ts";
import { ago, date } from "../lib/format";

export function sourceBadgeInfo(
  sourceName: string,
  sourceKind?: string,
  canonicalUrl?: string,
): { label: string; className: string } {
  const name = (sourceName || "").toLowerCase();
  const url = (canonicalUrl || "").toLowerCase();

  if (sourceKind === "arxiv" || name.includes("arxiv") || url.includes("arxiv.org")) {
    return { label: "arXiv", className: "badge-arxiv" };
  }
  if (sourceKind === "hf-papers" || name.includes("hugging face") || url.includes("huggingface.co")) {
    return { label: "HF Papers", className: "badge-hf" };
  }
  if (sourceKind === "github" || name.includes("github") || url.includes("github.com")) {
    return { label: "GitHub", className: "badge-gh" };
  }
  if (sourceKind === "hn" || name.includes("hacker news") || url.includes("ycombinator.com")) {
    return { label: "HN", className: "badge-hn" };
  }
  if (sourceKind === "reddit" || name.includes("reddit") || url.includes("reddit.com")) {
    const subMatch = name.match(/r\/([a-zA-Z0-9_]+)/i);
    return { label: subMatch ? `r/${subMatch[1]}` : "Reddit", className: "badge-reddit" };
  }
  if (sourceKind === "medium" || name.includes("medium") || url.includes("medium.com")) {
    return { label: "Medium", className: "badge-medium" };
  }
  if (sourceKind === "substack" || name.includes("substack") || url.includes("substack.com")) {
    return { label: "Substack", className: "badge-substack" };
  }
  if (sourceKind === "lobsters" || name.includes("lobste.rs") || url.includes("lobste.rs")) {
    return { label: "Lobste.rs", className: "badge-lobsters" };
  }
  if (sourceKind === "bluesky" || name.includes("bluesky") || url.includes("bsky.app")) {
    return { label: "Bluesky", className: "badge-bluesky" };
  }
  if (sourceKind === "openreview" || name.includes("openreview") || url.includes("openreview.net")) {
    return { label: "OpenReview", className: "badge-openreview" };
  }
  return { label: sourceName.split(" · ")[0] || "Blog", className: "badge-rss" };
}

export function StoryList({
  stories,
  selected,
  onSelect,
  onAction,
  empty,
  offset = 0,
}: {
  stories: Story[];
  selected: number | null;
  onSelect: (s: Story) => void;
  onAction?: (story: Story, patch: Record<string, unknown>) => void;
  empty: string;
  offset?: number;
}) {
  return (
    <div className="story-list" aria-label="Developments">
      {stories.length ? (
        stories.map((s, index) => {
          const mainBadge = sourceBadgeInfo(s.sourceName, s.sourceKind, s.canonicalUrl);
          const excerpt = (s.abstract || s.releaseText || "").slice(0, 220).trim();
          const authorCount = s.metadata?.authors?.length || 0;
          const isSelected = selected === s.groupId;
          const hasMultipleSources = s.sources && s.sources.length > 1;

          return (
            <div
              key={s.groupId}
              data-story-id={s.groupId}
              tabIndex={0}
              role="button"
              className={`story-card ${isSelected ? "selected" : ""} ${s.read ? "read" : ""}`}
              onClick={() => onSelect(s)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(s);
                }
              }}
              aria-current={isSelected ? "true" : undefined}
            >
              <div className="card-top-row">
                <div className="source-badge-group">
                  <span className={`source-badge ${mainBadge.className}`}>
                    {mainBadge.label}
                  </span>
                  {hasMultipleSources && (
                    <div className="multi-source-badges">
                      {s.sources
                        .filter((name) => name !== s.sourceName)
                        .slice(0, 2)
                        .map((name) => {
                          const badge = sourceBadgeInfo(name);
                          return (
                            <span
                              key={name}
                              className={`source-badge sub-badge ${badge.className}`}
                              title={name}
                            >
                              +{badge.label}
                            </span>
                          );
                        })}
                    </div>
                  )}
                  {s.metadata?.arxivVersion && (
                    <span className="metadata-pill version-pill">
                      v{s.metadata.arxivVersion}
                    </span>
                  )}
                  {authorCount > 0 && (
                    <span className="metadata-pill authors-pill">
                      {s.metadata!.authors![0].split(" ").pop()}
                      {authorCount > 1 ? ` +${authorCount - 1}` : ""}
                    </span>
                  )}
                </div>

                <div className="card-time-actions">
                  <time className="relative-time" title={date(s.publishedAt)}>
                    {s.publishedAt ? ago(s.publishedAt) : ""}
                  </time>

                  {/* Hover Quick Actions */}
                  {onAction && (
                    <div
                      className="card-quick-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className={`action-btn ${s.saved ? "active" : ""}`}
                        title={s.saved ? "Saved (s)" : "Save for later (s)"}
                        aria-label="Save"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(s, { saved: !s.saved });
                        }}
                      >
                        <Bookmark
                          size={13}
                          fill={s.saved ? "currentColor" : "none"}
                        />
                      </button>
                      <button
                        className={`action-btn ${s.read ? "active" : ""}`}
                        title={s.read ? "Mark unread (m)" : "Mark read (m)"}
                        aria-label="Mark read"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(s, { read: !s.read });
                        }}
                      >
                        <Check size={13} />
                      </button>
                      <button
                        className={`action-btn ${s.feedback === 1 ? "active" : ""}`}
                        title="More like this (+)"
                        aria-label="More like this"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(s, { feedback: s.feedback === 1 ? 0 : 1 });
                        }}
                      >
                        <ThumbsUp size={12} />
                      </button>
                      <button
                        className="action-btn"
                        title="Dismiss (e)"
                        aria-label="Dismiss"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(s, { dismissed: !s.dismissed });
                        }}
                      >
                        <X size={13} />
                      </button>
                      <button
                        className="action-btn"
                        title="Open original (o)"
                        aria-label="Open original link"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(s.canonicalUrl, "_blank", "noreferrer");
                        }}
                      >
                        <ExternalLink size={12} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <h3 className="card-title">{s.title}</h3>

              {excerpt && (
                <p className="card-excerpt">
                  {excerpt}
                </p>
              )}

              <div className="card-footer-row">
                <span className="card-topic-tag">
                  {s.topics[0] || (s.metadata?.venue ? s.metadata.venue : s.kind)}
                </span>
                {s.reasons?.[0] && (
                  <span className="card-reason" title={s.reasons.join(" · ")}>
                    {s.reasons[0]}
                  </span>
                )}
                <div className="card-status-icons">
                  {s.saved && (
                    <Bookmark size={11} fill="currentColor" className="saved-icon" />
                  )}
                  {s.read && <Check size={11} className="read-icon" />}
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <div className="empty-list">
          <span>∅</span>
          <p>{empty}</p>
        </div>
      )}
    </div>
  );
}
