import { Bookmark, Check } from "lucide-react";
import type { Story } from "../../shared/types.ts";
import { date } from "../lib/format";
export function StoryList({
  stories,
  selected,
  onSelect,
  empty,
  offset = 0,
}: {
  stories: Story[];
  selected: number | null;
  onSelect: (s: Story) => void;
  empty: string;
  offset?: number;
}) {
  return (
    <div className="story-list" aria-label="Developments">
      {stories.length ? (
        stories.map((s, index) => (
          <button
            key={s.groupId}
            data-story-id={s.groupId}
            className={`story-row ${selected === s.groupId ? "selected" : ""} ${s.read ? "read" : ""}`}
            onClick={() => onSelect(s)}
            aria-current={selected === s.groupId ? "true" : undefined}
          >
            <span className="row-index">
              {String(offset + index + 1).padStart(2, "0")}
            </span>
            <span className="row-content">
              <span className="row-meta">
                <span>
                  {s.metadata?.venue || s.sourceName.replace(/ · /g, " / ")}
                </span>
                <time>
                  {s.metadata?.arxivVersion
                    ? `v${s.metadata.arxivVersion} · `
                    : ""}
                  {date(s.publishedAt)}
                </time>
              </span>
              <strong>{s.title}</strong>
              <span className="row-bottom">
                <span>{s.reasons[0]}</span>
                <span>
                  {s.saved && <Bookmark size={12} fill="currentColor" />}
                  {s.read && <Check size={12} />}
                </span>
              </span>
            </span>
          </button>
        ))
      ) : (
        <div className="empty-list">
          <span>∅</span>
          <p>{empty}</p>
        </div>
      )}
    </div>
  );
}
