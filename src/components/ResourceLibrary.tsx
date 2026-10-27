import { useState } from "react";
import { ArrowUpRight, Check, Plus, RefreshCw, Search, Sparkles, X } from "lucide-react";
import type { Resource, Source } from "../../shared/types.ts";
import { normalizeSubreddit } from "../../shared/reddit.ts";
import { mediumDisplayName, normalizeMedium } from "../../shared/medium.ts";
import {
  detectSmartSource,
  inferFeedName,
  normalizeFeedUrl,
} from "../../shared/feeds.ts";
import { ago } from "../lib/format";
import "./sources.css";
const group = (s: Source) =>
  s.resourceId ||
  (s.kind === "openreview" && s.config.venue?.startsWith("NeurIPS.cc/")
    ? "neurips"
    : s.kind);
export function ResourceLibrary({
  resources,
  sources,
  onSave,
  onRefresh,
  syncing,
}: {
  resources: Resource[];
  sources: Source[];
  onSave: (s: Source) => Promise<void>;
  onRefresh: () => void;
  syncing: boolean;
}) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [smartInput, setSmartInput] = useState("");
  const [smartError, setSmartError] = useState("");
  const [error, setError] = useState<{
    resourceId: string;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState("");
  async function save(source: Source) {
    setError(null);
    setBusy(source.id);
    try {
      await onSave(source);
      return true;
    } catch (e) {
      setError({ resourceId: group(source), message: (e as Error).message });
      return false;
    } finally {
      setBusy("");
    }
  }
  const detectedPreview = (() => {
    if (!smartInput.trim()) return null;
    try {
      return detectSmartSource(smartInput);
    } catch {
      return null;
    }
  })();
  async function handleSmartAdd() {
    setSmartError("");
    try {
      const detected = detectSmartSource(smartInput);
      const saved = await save({
        id: `${detected.resourceId}-${crypto.randomUUID().slice(0, 8)}`,
        kind: detected.kind,
        resourceId: detected.resourceId,
        name: detected.name,
        config: detected.config,
        enabled: true,
        lastAttempt: null,
        lastSuccess: null,
        error: null,
      });
      if (saved) setSmartInput("");
    } catch (e) {
      setSmartError((e as Error).message);
    }
  }
  const matchingResources = resources.filter((r) => {
    if (category !== "All" && r.category !== category) return false;
    const feeds = sources.filter((s) => group(s) === r.id);
    const searchable = [
      r.name,
      r.description,
      r.category,
      ...feeds.map(
        (s) => `${s.name} ${Object.values(s.config).flat().join(" ")}`,
      ),
    ].join(" ");
    return searchable.toLowerCase().includes(query.trim().toLowerCase());
  });
  return (
    <section className="page resource-page">
      <div className="page-title">
        <div>
          <h1>Sources</h1>
          <p className="sources-intro">
            Choose where your reading comes from. Add a feed below or paste any
            blog URL, Medium @author/#tag, subreddit, or repository to bring its
            latest updates into Latest.
          </p>
        </div>
        <button className="button" onClick={onRefresh} disabled={syncing}>
          <RefreshCw size={14} className={syncing ? "spin" : ""} />
          {syncing ? "Checking sources…" : "Check for updates"}
        </button>
      </div>
      <form
        className="smart-source-bar"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSmartAdd();
        }}
      >
        <div className="smart-source-row">
          <Sparkles size={15} className="smart-source-icon" />
          <input
            type="text"
            aria-label="Quick add any blog, Medium author, tag, or source URL"
            placeholder="Quick add any blog URL, Medium @author or #tag, Substack, r/subreddit, or owner/repo…"
            value={smartInput}
            onChange={(e) => {
              setSmartInput(e.target.value);
              setSmartError("");
            }}
            disabled={!!busy}
          />
          {detectedPreview && (
            <span className="smart-source-badge">
              {detectedPreview.name}
            </span>
          )}
          <button
            type="submit"
            className="button primary"
            disabled={!smartInput.trim() || !!busy}
          >
            <Plus size={13} />
            Add source
          </button>
        </div>
        {smartError && (
          <p className="error-message smart-source-error" role="alert">
            {smartError}
          </p>
        )}
      </form>
      <div className="sources-overview">
        <span>
          <strong>{sources.filter((s) => s.enabled).length}</strong> active
          feeds
        </span>
        <span>Updates every six hours while the app is running</span>
        <label className="source-search">
          <Search size={16} />
          <input
            type="search"
            aria-label="Find a source"
            placeholder="Find a source…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="category-tabs" aria-label="Source categories">
        {["All", "Research", "Code", "Discussion", "Writing", "Social"].map(
          (c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ),
        )}
      </div>
      <div className="resource-grid">
        {matchingResources.map((r) => (
          <ResourceCard
            key={r.id}
            resource={r}
            sources={sources.filter((s) => group(s) === r.id)}
            save={save}
            busy={busy}
            error={error?.resourceId === r.id ? error.message : ""}
          />
        ))}
      </div>
      {!matchingResources.length && (
        <p className="sources-empty">
          No sources match.{" "}
          <button
            className="text-link"
            onClick={() => {
              setQuery("");
              setCategory("All");
            }}
          >
            Show all sources
          </button>
        </p>
      )}
      <p className="footnote">
        Pause a feed with its switch. Previously collected items stay in your
        library. Your source choices are saved on this computer.
      </p>
    </section>
  );
}
function ResourceCard({
  resource: r,
  sources,
  save,
  busy,
  error,
}: {
  resource: Resource;
  sources: Source[];
  save: (s: Source) => Promise<boolean>;
  busy: string;
  error: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [customName, setCustomName] = useState(false);
  const [formError, setFormError] = useState("");
  const active = sources.filter((s) => s.enabled);
  const errors = active.filter((s) => s.error);
  const currentValue = (s: Source) =>
    r.field === "categories"
      ? s.config.categories?.join(", ")
      : r.field
        ? s.config[r.field] || ""
        : "";
  function start(source?: Source) {
    setFormError("");
    setEditing(source?.id || null);
    setInput(
      source
        ? String(currentValue(source))
        : String(r.preset ? currentValue(r.preset) : ""),
    );
    setName(source?.name || r.preset?.name || r.name);
    setCustomName(!!source);
    setOpen(true);
  }
  async function add() {
    if (!r.preset) return;
    const previous = sources.find((s) => s.id === editing);
    const raw = input.trim();
    setFormError("");
    let normalizedValue = raw;
    if (r.field === "subreddit") {
      try {
        normalizedValue = normalizeSubreddit(raw);
      } catch (error) {
        setFormError((error as Error).message);
        return;
      }
    } else if (r.field === "medium") {
      try {
        normalizedValue = normalizeMedium(raw);
      } catch (error) {
        setFormError((error as Error).message);
        return;
      }
    } else if (r.field === "url") {
      try {
        normalizedValue = normalizeFeedUrl(raw);
      } catch (error) {
        setFormError((error as Error).message);
        return;
      }
    }
    const config = {
      ...(previous?.config || r.preset.config),
      ...(r.field
        ? {
            [r.field]:
              r.field === "categories"
                ? raw
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean)
                : normalizedValue,
          }
        : {}),
    };
    const saved = await save({
      ...r.preset,
      ...previous,
      id: previous?.id || `${r.id}-${crypto.randomUUID().slice(0, 8)}`,
      name: name.trim() || r.name,
      resourceId: r.id,
      config,
      enabled: previous?.enabled ?? true,
    });
    if (saved) setOpen(false);
  }
  function configure(value: string) {
    setInput(value);
    setFormError("");
    if (!customName) {
      if (r.field === "subreddit") {
        try {
          setName(`Reddit · r/${normalizeSubreddit(value)}`);
        } catch {
          setName(r.name);
        }
      } else if (r.field === "medium") {
        try {
          setName(mediumDisplayName(value));
        } catch {
          setName(r.name);
        }
      } else if (r.field === "url") {
        setName(inferFeedName(value));
      }
    }
  }
  return (
    <article className={`resource-card ${r.unavailable ? "unavailable" : ""}`}>
      <div className="resource-heading">
        <span className={`resource-letter ${r.id}`}>
          {r.id === "arxiv"
            ? "aχ"
            : r.id === "github"
              ? "GH"
              : r.id === "neurips"
                ? "N"
                : r.id === "openreview"
                  ? "OR"
                  : r.id === "hn"
                    ? "Y"
                    : r.id === "reddit"
                      ? "r/"
                      : r.id === "medium"
                        ? "M"
                        : r.id === "bluesky"
                          ? "B"
                          : r.id === "x"
                            ? "𝕏"
                            : "↗"}
        </span>
        <span className="resource-category">{r.category}</span>
        <a
          href={r.docs}
          target="_blank"
          rel="noreferrer"
          title={`${r.name} documentation`}
          aria-label={`${r.name} documentation`}
        >
          <ArrowUpRight size={16} />
        </a>
      </div>
      <h2>{r.name}</h2>
      <p>{r.description}</p>
      {r.connectionLabel && (
        <p className="source-transport">{r.connectionLabel}</p>
      )}
      {r.caveat && <p className="source-caveat">{r.caveat}</p>}
      {r.unavailable ? (
        <div className="resource-unavailable">
          <span>Unavailable</span>
          <p>{r.unavailable}</p>
        </div>
      ) : (
        <>
          <div className="resource-connection">
            <span
              className={`connection-dot ${errors.length ? "warning" : active.length ? "on" : ""}`}
            />
            <span>
              {errors.length
                ? "Needs attention"
                : active.length
                  ? `${active.length} ${active.length === 1 ? "feed" : "feeds"} on`
                  : sources.length
                    ? "Paused"
                    : "Ready to add"}
            </span>
            <button
              className="quiet-button"
              onClick={() => start()}
              disabled={!!busy}
              aria-expanded={open}
              aria-label={`${sources.length ? "Add another" : "Add"} ${r.name} feed`}
            >
              <Plus size={13} />
              {sources.length ? "Add another" : "Add source"}
            </button>
          </div>
          {sources.length > 0 && (
            <div className="connected-feeds">
              {sources.map((s) => (
                <div className="connected-feed" key={s.id}>
                  <div>
                    <button
                      className="feed-name"
                      onClick={() => start(s)}
                      title="Edit feed"
                      disabled={!!busy}
                    >
                      {s.name.replace(/^(GitHub|arXiv) · /, "")}
                    </button>
                    <span
                      className="feed-sync"
                      title={
                        s.lastSuccess
                          ? new Date(s.lastSuccess).toLocaleString()
                          : "Never synced"
                      }
                    >
                      {s.error
                        ? `Last success: ${s.lastSuccess ? ago(s.lastSuccess) : "never"}`
                        : ago(s.lastSuccess)}
                    </span>
                  </div>
                  <button
                    role="switch"
                    aria-label={`Collect ${s.name}`}
                    aria-checked={s.enabled}
                    className={`switch ${s.enabled ? "on" : ""}`}
                    disabled={!!busy}
                    onClick={() => void save({ ...s, enabled: !s.enabled })}
                  >
                    <span />
                  </button>
                  {s.error && (
                    <p className="source-error">
                      {s.enabled ? "Could not update: " : "Last check: "}
                      {s.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {(r.id === "neurips" || r.id === "openreview") && !errors.length ? (
            <p className="resource-caveat">
              May require OpenReview verification.
            </p>
          ) : null}
          {error && (
            <p className="error-message source-save-error" role="alert">
              {error}
            </p>
          )}
          {open && (
            <form
              className="resource-form"
              onSubmit={(e) => {
                e.preventDefault();
                void add();
              }}
            >
              <div className="form-title">
                <strong>
                  {editing
                    ? "Edit source"
                    : r.id === "reddit"
                      ? "Follow a subreddit"
                      : r.id === "medium"
                        ? "Follow on Medium"
                        : `Add ${r.name}`}
                </strong>
                <button
                  type="button"
                  aria-label="Cancel feed edit"
                  onClick={() => setOpen(false)}
                  disabled={!!busy}
                >
                  <X size={14} />
                </button>
              </div>
              {r.field && (
                <label>
                  {r.field === "repo"
                    ? "Repository"
                    : r.field === "venue"
                      ? "Venue ID"
                      : r.field === "actor"
                        ? "Account handle"
                        : r.field === "subreddit"
                          ? "Subreddit name or URL"
                          : r.field === "medium"
                            ? "Author (@handle), publication, #tag, or URL"
                            : r.field === "url"
                              ? "Blog, Substack, or RSS/Atom URL"
                              : "Categories"}
                  <input
                    aria-label={`${r.name} configuration`}
                    placeholder={r.placeholder}
                    value={input}
                    onChange={(e) => configure(e.target.value)}
                    required
                    autoFocus
                    disabled={!!busy}
                  />
                </label>
              )}
              {r.id === "reddit" && !editing && (
                <div
                  className="subreddit-suggestions"
                  aria-label="Suggested subreddits"
                >
                  <span>Try</span>
                  {["MachineLearning", "LocalLLaMA", "QuantumComputing"].map(
                    (community) => (
                      <button
                        type="button"
                        key={community}
                        disabled={!!busy}
                        onClick={() => configure(community)}
                      >
                        r/{community}
                      </button>
                    ),
                  )}
                </div>
              )}
              {r.id === "medium" && !editing && (
                <div
                  className="subreddit-suggestions"
                  aria-label="Suggested Medium feeds"
                >
                  <span>Try</span>
                  {[
                    "towards-data-science",
                    "@karpathy",
                    "#machine-learning",
                    "#quantum-computing",
                  ].map((target) => (
                    <button
                      type="button"
                      key={target}
                      disabled={!!busy}
                      onClick={() => configure(target)}
                    >
                      {target}
                    </button>
                  ))}
                </div>
              )}
              {r.id === "rss" && !editing && (
                <div
                  className="subreddit-suggestions"
                  aria-label="Suggested blogs"
                >
                  <span>Try</span>
                  {[
                    "huggingface.co/blog",
                    "lilianweng.github.io",
                    "simonwillison.net",
                    "openai.com/news",
                  ].map((blog) => (
                    <button
                      type="button"
                      key={blog}
                      disabled={!!busy}
                      onClick={() => configure(blog)}
                    >
                      {blog}
                    </button>
                  ))}
                </div>
              )}
              <label>
                Display name
                <input
                  aria-label={`${r.name} feed name`}
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setCustomName(true);
                  }}
                  required
                  maxLength={100}
                  disabled={!!busy}
                />
              </label>
              {r.id === "reddit" && (
                <p className="source-form-note">
                  Collects recent public posts from one community. Open a post
                  to join its discussion on Reddit.
                </p>
              )}
              {r.id === "medium" && (
                <p className="source-form-note">
                  Collects recent articles from a Medium author (@handle),
                  publication, or #tag feed.
                </p>
              )}
              {r.id === "rss" && (
                <p className="source-form-note">
                  Paste any blog homepage, Substack, or direct RSS/Atom URL;
                  Fieldnotes automatically resolves or discovers the feed.
                </p>
              )}
              {formError && (
                <p className="error-message" role="alert">
                  {formError}
                </p>
              )}
              <button
                className="button primary"
                disabled={!!busy}
                type="submit"
              >
                <Check size={13} />
                {busy
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : r.id === "reddit"
                      ? "Follow subreddit"
                      : r.id === "medium"
                        ? "Follow on Medium"
                        : "Add source"}
              </button>
              <button
                type="button"
                className="text-link source-cancel"
                disabled={!!busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </form>
          )}
        </>
      )}
    </article>
  );
}
