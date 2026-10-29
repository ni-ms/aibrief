import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Download,
  Github,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { Resource, Source } from "../../shared/types.ts";
import { normalizeSubreddit } from "../../shared/reddit.ts";
import { mediumDisplayName, normalizeMedium } from "../../shared/medium.ts";
import {
  substackDisplayName,
  normalizeSubstack,
} from "../../shared/substack.ts";
import {
  detectSmartSource,
  exportOpml,
  inferFeedName,
  normalizeFeedUrl,
  parseOpml,
} from "../../shared/feeds.ts";
import { OpenSource } from "./OpenSource";
import { ago } from "../lib/format";
import "./sources.css";
import {
  DISCOVERY_DIRECTORIES,
  directoryForSource,
} from "../../shared/discovery-sources.ts";
const DIRECTORY_INITIALS: Record<string, string> = {
  producthunt: "PH",
  alternativeto: "AT",
  betalist: "BL",
  startupbase: "SB",
  microlaunch: "ML",
  uneed: "U",
  toolify: "T",
  theresanaiforthat: "AI",
  saashub: "SH",
  futurepedia: "F",
  launched: "L",
};
const group = (s: Source) =>
  directoryForSource(s)?.id ||
  s.resourceId ||
  (s.kind === "openreview" && s.config.venue?.startsWith("NeurIPS.cc/")
    ? "neurips"
    : s.kind);
export function ResourceLibrary({
  resources,
  sources,
  onSave,
  onRemove,
  onRefresh,
  syncing,
  initialCategory = "All",
}: {
  resources: Resource[];
  sources: Source[];
  onSave: (s: Source) => Promise<void>;
  onRemove?: (id: string) => Promise<void>;
  onRefresh: () => void;
  syncing: boolean;
  initialCategory?: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);
  const [query, setQuery] = useState("");
  const [smartInput, setSmartInput] = useState("");
  const [smartError, setSmartError] = useState("");
  const [opmlNotice, setOpmlNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  async function remove(source: Source) {
    if (!onRemove) return false;
    setError(null);
    setBusy(source.id);
    try {
      await onRemove(source.id);
      return true;
    } catch (e) {
      setError({ resourceId: group(source), message: (e as Error).message });
      return false;
    } finally {
      setBusy("");
    }
  }
  function handleExportOpml() {
    const xml = exportOpml(sources);
    const blob = new Blob([xml], { type: "text/x-opml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fieldnotes-sources-${new Date().toISOString().slice(0, 10)}.opml`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function handleImportOpmlFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSmartError("");
    setOpmlNotice("");
    try {
      const xml = await file.text();
      const parsed = parseOpml(xml);
      if (!parsed.length) {
        setSmartError("No valid HTTPS RSS/Atom feeds found in that OPML file.");
        return;
      }
      let added = 0;
      for (const item of parsed) {
        const exists = sources.some(
          (s) => s.config.url?.toLowerCase() === item.url.toLowerCase(),
        );
        if (exists) continue;
        const ok = await save({
          id: `rss-${crypto.randomUUID().slice(0, 8)}`,
          kind: "rss",
          resourceId: "rss",
          name: item.name.slice(0, 100),
          config: { url: item.url },
          enabled: true,
          lastAttempt: null,
          lastSuccess: null,
          error: null,
        });
        if (ok) added++;
      }
      setOpmlNotice(
        `Imported ${added} new feed${added === 1 ? "" : "s"} from OPML.`,
      );
    } catch (err) {
      setSmartError((err as Error).message);
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
      const directory = DISCOVERY_DIRECTORIES.find(
        (site) => site.id === detected.resourceId,
      );
      const existing = directory?.feedUrl
        ? sources.find(
            (source) => directoryForSource(source)?.id === directory.id,
          )
        : undefined;
      const saved = await save({
        ...existing,
        id:
          existing?.id ||
          `${detected.resourceId}-${crypto.randomUUID().slice(0, 8)}`,
        kind: detected.kind,
        resourceId: detected.resourceId,
        name: existing?.name || detected.name,
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
    if (category === "GitHub Stars") return false;
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
  function openGithubStars() {
    setCategory("GitHub Stars");
    requestAnimationFrame(() => {
      document
        .getElementById("github-stars-explorer")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
  return (
    <section className="page resource-page">
      <div className="page-title">
        <div>
          <h1>Sources</h1>
          <p className="sources-intro">
            Follow research, tools, launches, and discussions. Choose a source
            below, explore GitHub star collections, or paste a source name,
            website, feed, or repository.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: "8px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".opml,.xml,text/xml"
            style={{ display: "none" }}
            onChange={(e) => void handleImportOpmlFile(e)}
          />
          <button
            type="button"
            className="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!!busy}
            title="Import subscriptions from an OPML file"
          >
            <Upload size={13} /> Import OPML
          </button>
          <button
            type="button"
            className="button"
            onClick={handleExportOpml}
            title="Export your feeds as an OPML file"
          >
            <Download size={13} /> Export OPML
          </button>
          <button className="button" onClick={onRefresh} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? "spin" : ""} />
            {syncing ? "Checking sources…" : "Check for updates"}
          </button>
        </div>
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
            aria-label="Quick add a source name or URL"
            placeholder="Product Hunt, AlternativeTo, any blog URL, r/subreddit, or owner/repo…"
            value={smartInput}
            onChange={(e) => {
              setSmartInput(e.target.value);
              setSmartError("");
            }}
            disabled={!!busy}
          />
          {detectedPreview && (
            <span className="smart-source-badge">{detectedPreview.name}</span>
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
        {opmlNotice && (
          <p className="field-note" role="status" style={{ marginTop: "6px" }}>
            {opmlNotice}
          </p>
        )}
      </form>
      <div className="sources-overview">
        <span>
          <strong>{sources.filter((s) => s.enabled).length}</strong> active
          feeds
        </span>
        <span>Updates every 45 minutes while the app is running</span>
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
        {[
          "All",
          "Research",
          "Code",
          "GitHub Stars",
          "Discovery",
          "Discussion",
          "Writing",
          "Social",
        ].map((c) => (
          <button
            key={c}
            className={category === c ? "active" : ""}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      {category === "Discovery" && (
        <div className="discovery-sources-intro">
          <h2>Discover tools & launches</h2>
          <p>
            Product Hunt, AlternativeTo News, BetaList, and the StartupBase blog
            have verified public feeds. Other directories show their current
            availability.
          </p>
        </div>
      )}
      {category !== "GitHub Stars" && (
        <div className="resource-grid">
          {matchingResources.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              sources={sources.filter((s) => group(s) === r.id)}
              save={save}
              remove={onRemove ? remove : undefined}
              busy={busy}
              error={error?.resourceId === r.id ? error.message : ""}
              onExploreGithubStars={
                r.id === "github" ? openGithubStars : undefined
              }
            />
          ))}
        </div>
      )}
      {category !== "GitHub Stars" && !matchingResources.length && (
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
      {(category === "GitHub Stars" || category === "Code") && (
        <OpenSource sources={sources} onSave={onSave} embedded />
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
  remove,
  busy,
  error,
  onExploreGithubStars,
}: {
  resource: Resource;
  sources: Source[];
  save: (s: Source) => Promise<boolean>;
  remove?: (s: Source) => Promise<boolean>;
  busy: string;
  error: string;
  onExploreGithubStars?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [customName, setCustomName] = useState(false);
  const [formError, setFormError] = useState("");
  const active = sources.filter((s) => s.enabled);
  const directory = DISCOVERY_DIRECTORIES.find((site) => site.id === r.id);
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
    } else if (r.field === "substack") {
      try {
        normalizedValue = normalizeSubstack(raw);
      } catch (error) {
        setFormError((error as Error).message);
        return;
      }
    } else if (r.field === "lobsters") {
      const cleaned =
        raw.replace(/^tag:/i, "").trim().toLowerCase() || "hottest";
      if (!/^[a-z0-9_-]{1,40}$/.test(cleaned)) {
        setFormError(
          "Use 'hottest' or a Lobste.rs tag such as ai, ml, plt, or security",
        );
        return;
      }
      normalizedValue = cleaned;
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
      } else if (r.field === "substack") {
        try {
          setName(substackDisplayName(value));
        } catch {
          setName(r.name);
        }
      } else if (r.field === "lobsters") {
        const cleaned =
          value.replace(/^tag:/i, "").trim().toLowerCase() || "hottest";
        setName(
          cleaned === "hottest"
            ? "Lobste.rs · Hottest"
            : `Lobste.rs · #${cleaned}`,
        );
      } else if (r.field === "url") {
        setName(inferFeedName(value));
      }
    }
  }
  return (
    <article
      className={`resource-card ${directory ? "directory-card" : ""} ${r.unavailable ? "unavailable" : ""}`}
    >
      <div className="resource-heading">
        <span className={`resource-letter ${r.id}`}>
          {directory
            ? DIRECTORY_INITIALS[directory.id] || "↗"
            : r.id === "arxiv"
              ? "aχ"
              : r.id === "hf-papers"
                ? "HF"
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
                          : r.id === "lobsters"
                            ? "L"
                            : r.id === "medium"
                              ? "M"
                              : r.id === "substack"
                                ? "S"
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
      {onExploreGithubStars && (
        <button
          type="button"
          className="github-stars-callout"
          onClick={onExploreGithubStars}
        >
          <Github size={13} />
          <span>Browse GitHub star collections</span>
          <ArrowUpRight size={13} />
        </button>
      )}
      {r.connectionLabel && (
        <p className="source-transport">{r.connectionLabel}</p>
      )}
      {r.caveat && <p className="source-caveat">{r.caveat}</p>}
      {r.unavailable ? (
        <div className="resource-unavailable">
          <span>{directory ? "Not connected" : "Unavailable"}</span>
          <p>{r.unavailable}</p>
          {directory && (
            <a
              className="directory-visit-link"
              href={directory.website}
              target="_blank"
              rel="noreferrer"
            >
              Browse {directory.name} <ArrowUpRight size={12} />
            </a>
          )}
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
            {(!directory || !sources.length) && (
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
            )}
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
                        : r.id === "substack"
                          ? "Follow on Substack"
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
                            : r.field === "substack"
                              ? "Publication subdomain, @handle, or URL"
                              : r.field === "lobsters"
                                ? "Feed ('hottest' or tag like ai, ml, plt, security)"
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
              {r.id === "substack" && !editing && (
                <div
                  className="subreddit-suggestions"
                  aria-label="Suggested Substacks"
                >
                  <span>Try</span>
                  {[
                    "importai",
                    "sebastianraschka",
                    "interconnects",
                    "simonw",
                  ].map((pub) => (
                    <button
                      type="button"
                      key={pub}
                      disabled={!!busy}
                      onClick={() => configure(pub)}
                    >
                      {pub}
                    </button>
                  ))}
                </div>
              )}
              {r.id === "lobsters" && !editing && (
                <div
                  className="subreddit-suggestions"
                  aria-label="Suggested Lobste.rs feeds"
                >
                  <span>Try</span>
                  {[
                    "hottest",
                    "ai",
                    "ml",
                    "plt",
                    "distributed",
                    "security",
                  ].map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      disabled={!!busy}
                      onClick={() => configure(tag)}
                    >
                      {tag}
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
              {r.id === "substack" && (
                <p className="source-form-note">
                  Collects recent newsletter issues from any Substack author or
                  publication subdomain.
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
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
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
                          : r.id === "substack"
                            ? "Follow Substack"
                            : "Add source"}
                </button>
                {editing && remove && (
                  <button
                    type="button"
                    className="button"
                    style={{ color: "#b91c1c" }}
                    disabled={!!busy}
                    onClick={async () => {
                      const target = sources.find((s) => s.id === editing);
                      if (target && (await remove(target))) {
                        setOpen(false);
                      }
                    }}
                  >
                    <Trash2 size={13} /> Remove source
                  </button>
                )}
                <button
                  type="button"
                  className="text-link source-cancel"
                  style={{ marginLeft: 0 }}
                  disabled={!!busy}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </article>
  );
}
