import { preferences } from "./lib/preferences";
import { browserStorage } from "./lib/api";
import { DataSettings } from "./components/DataSettings";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  Cpu,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { Story } from "../shared/types.ts";
import { paginate, rankedPapers, pageSize } from "../shared/pagination.ts";
import { SearchAndFollow } from "./components/SearchAndFollow";
import { FollowedTopics } from "./components/FollowedTopics";
import { Pagination } from "./components/Pagination";
import { selectBriefing } from "../shared/briefing.ts";
import { useFeed } from "./hooks/useFeed";
import { useLocalAI } from "./hooks/useLocalAI";
import { StoryList } from "./components/StoryList";
import { StoryReader } from "./components/StoryReader";
import { ResourceLibrary } from "./components/ResourceLibrary";
import { OpenSource } from "./components/OpenSource";
import { Interests } from "./components/Interests";
import { ModelSettings } from "./components/ModelSettings";
import { ago } from "./lib/format";
import "./styles.css";
import "./intuitive.css";
/** Page composition only. Collection/personal state and model lifecycle live in hooks. */
export default function App() {
  const feed = useFeed();
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    const onError = (event: Event) =>
      setStorageError((event as CustomEvent<string>).detail);
    window.addEventListener("fieldnotes:storage-error", onError);
    return () =>
      window.removeEventListener("fieldnotes:storage-error", onError);
  }, []);
  const [page, setPage] = useState("read");
  const [mode, setMode] = useState("all");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"library" | "discover">(
    "library",
  );
  const [topicId, setTopicId] = useState<string | null>(null);
  const activeTopic = feed.data?.followedTopics.find((t) => t.id === topicId);
  const [pageNumber, setPageNumber] = useState(1);
  const [perPage, setPerPage] = useState(() =>
    pageSize(preferences.get("page-size")),
  );
  const [paperOrder, setPaperOrder] = useState<number[] | null>(null);
  const [selection, setSelection] = useState<number | null>(null);
  const [showStatus, setShowStatus] = useState(false);
  const all = feed.data?.stories || [];
  const briefing = useMemo(
    () => selectBriefing(all, feed.since),
    [feed.data, feed.since],
  );
  const candidates = activeTopic
    ? all
        .filter(
          (s) => !s.dismissed && s.followedTopicIds?.includes(activeTopic.id),
        )
        .sort((a, b) =>
          (b.publishedAt || b.firstSeenAt).localeCompare(
            a.publishedAt || a.firstSeenAt,
          ),
        )
    : mode === "papers"
      ? paperOrder
        ? paperOrder
            .map((id) => all.find((s) => s.groupId === id))
            .filter((s): s is Story => !!s && !s.dismissed)
        : rankedPapers(all)
      : mode === "focus"
        ? briefing
        : mode === "saved"
          ? all.filter((s) => s.saved && !s.dismissed)
          : mode === "dismissed"
            ? all.filter((s) => s.dismissed)
            : all
                .filter((s) => !s.dismissed)
                .sort((a, b) =>
                  (b.publishedAt || b.firstSeenAt).localeCompare(
                    a.publishedAt || a.firstSeenAt,
                  ),
                );
  const filtered = candidates.filter(
    (s) =>
      (filter === "all" || s.kind === filter) &&
      (searchMode === "discover" ||
        !query ||
        `${s.title} ${s.abstract} ${s.releaseText} ${s.sourceName} ${s.topics.join(" ")}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
  );
  const pagination = paginate(filtered, pageNumber, perPage);
  const shown = pagination.items;
  const selected =
    shown.find((s) => s.groupId === selection) || shown[0] || null;
  useEffect(() => {
    if (selection === null || !window.matchMedia("(max-width: 900px)").matches)
      return;
    const reader = document.querySelector<HTMLElement>(".reader");
    reader
      ?.querySelector<HTMLButtonElement>(".reader-back")
      ?.focus({ preventScroll: true });
    reader?.scrollIntoView({ block: "start" });
  }, [selection]);
  const ai = useLocalAI(
    feed.data?.profile,
    page === "read" && searchMode === "library" ? selected : null,
  );
  const sourceErrors =
    feed.data?.sources.filter((s) => s.enabled && s.error) || [];
  const enabledSources = feed.data?.sources.filter((s) => s.enabled) || [];
  const viewName = activeTopic
    ? activeTopic.name
    : mode === "papers"
      ? "Papers"
      : mode === "focus"
        ? "For you"
        : mode === "saved"
          ? "Saved"
          : mode === "dismissed"
            ? "Dismissed"
            : "Latest";
  const description = activeTopic
    ? `Updates matching “${activeTopic.query}”, newest first.`
    : mode === "papers"
      ? "Research papers ranked by your interests. Select one to read its source or explore its research trail."
      : mode === "focus"
        ? "Up to 10 new, unread updates matched to your interests since your last visit."
        : mode === "saved"
          ? "Your reading shelf. Use the bookmark on any item to keep it here."
          : mode === "dismissed"
            ? "Items you set aside. Open one to restore it to your feed."
            : "Papers, releases, articles and discussions from your sources, newest first.";
  function openTopic(id: string) {
    chooseMode("all");
    setTopicId(id);
  }
  function chooseMode(value: string) {
    setMode(value);
    setTopicId(null);
    setSearchMode("library");
    setFilter("all");
    setQuery("");
    setPageNumber(1);
    setPaperOrder(null);
    setSelection(null);
  }
  return (
    <div className="app">
      <header className="app-header">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("read");
          }}
        >
          fieldnotes
          <span className="wordmark-square" />
        </a>
        <nav aria-label="Main navigation">
          {[
            ["read", "Feed"],
            ["open-source", "Open Source"],
            ["resources", "Sources"],
            ["interests", "Interests"],
            ...(browserStorage ? [["data", "Your data"]] : []),
          ].map(([id, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          className={`model-indicator ${ai.status === "ready" ? "ready" : ""}`}
          onClick={() => setPage("model")}
        >
          <Cpu size={14} />
          <span>AI summaries</span>
          <span>
            {ai.status === "off"
              ? ai.preferred
                ? "Set up"
                : "Off"
              : ai.status === "working"
                ? "Summarizing"
                : ai.status === "error"
                  ? "Needs attention"
                  : ai.status === "loading"
                    ? "Loading"
                    : "Ready"}
          </span>
        </button>
      </header>
      {feed.notice && (
        <div className="toast" role="status">
          {feed.notice}
          <button aria-label="Close notice" onClick={() => feed.setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {storageError && (
        <div className="global-error" role="alert">
          Could not save your data: {storageError}
          <button onClick={() => location.reload()}>Reload</button>
        </div>
      )}
      {feed.error && (
        <div className="global-error" role="alert">
          {feed.error}
          <button onClick={() => void feed.load()}>Retry</button>
        </div>
      )}
      {page === "data" ? (
        <DataSettings />
      ) : page === "open-source" ? (
        <OpenSource
          sources={feed.data?.sources || []}
          onSave={feed.saveSource}
        />
      ) : page === "resources" ? (
        <ResourceLibrary
          resources={feed.resources}
          sources={feed.data?.sources || []}
          onSave={feed.saveSource}
          onRefresh={feed.refresh}
          syncing={!!feed.data?.syncing}
        />
      ) : page === "interests" ? (
        feed.data && (
          <Interests
            profile={feed.data.profile}
            onSave={async (profile) => {
              await feed.saveProfile(profile);
              setPageNumber(1);
              setPaperOrder(null);
            }}
          >
            <FollowedTopics
              topics={feed.data.followedTopics}
              providers={feed.providers}
              onUpdate={feed.updateTopic}
              onRemove={feed.removeTopic}
            />
          </Interests>
        )
      ) : page === "model" ? (
        <ModelSettings ai={ai} />
      ) : (
        <main className="desk">
          <div className="desk-heading">
            <div>
              <span className="kicker">YOUR READING DESK</span>
              <h1>
                {searchMode === "discover"
                  ? "Find a topic to follow"
                  : viewName}
                {feed.data && searchMode === "library" && (
                  <span
                    className="heading-count"
                    aria-label={`${filtered.length} ${filtered.length === 1 ? "item" : "items"}`}
                  >
                    {filtered.length}
                  </span>
                )}
              </h1>
              <p className="desk-description">
                {searchMode === "discover"
                  ? "Preview a topic, then follow it to collect future updates in one place."
                  : description}
              </p>
            </div>
            <div className="desk-actions">
              <button className="button" onClick={() => setPage("resources")}>
                <Plus size={15} /> Add source
              </button>
              <div className="sync-control">
                <button
                  className={`sync-status ${sourceErrors.length ? "warning" : ""}`}
                  onClick={() => setShowStatus(!showStatus)}
                  aria-expanded={showStatus}
                  aria-controls="source-status"
                >
                  <span
                    className={`connection-dot ${feed.data?.syncing ? "collecting" : sourceErrors.length ? "warning" : "on"}`}
                  />
                  {feed.data?.syncing
                    ? "Checking sources…"
                    : sourceErrors.length
                      ? `${sourceErrors.length} source${sourceErrors.length > 1 ? "s" : ""} need${sourceErrors.length === 1 ? "s" : ""} attention`
                      : feed.data?.collectedAt
                        ? `Updated ${ago(feed.data.collectedAt).replace("Just synced", "just now")}`
                        : "Source status"}
                  <ChevronDown size={12} />
                </button>
                <button
                  className="button refresh-button"
                  title="Check sources for new items"
                  aria-label="Refresh sources"
                  onClick={() => {
                    setPaperOrder(null);
                    setPageNumber(1);
                    void feed.refresh();
                  }}
                  disabled={!!feed.data?.syncing}
                >
                  <RefreshCw
                    size={15}
                    className={feed.data?.syncing ? "spin" : ""}
                  />
                  <span>Refresh</span>
                </button>
              </div>
            </div>
          </div>
          {showStatus && (
            <section
              className="collection-panel"
              id="source-status"
              aria-label="Collection status"
            >
              {!enabledSources.length && (
                <p>No sources are on yet. Add a source to start your feed.</p>
              )}
              {enabledSources.map((s) => (
                <div key={s.id}>
                  <span>{s.name}</span>
                  <span className={s.error ? "error-text" : ""}>
                    {s.error || ago(s.lastSuccess)}
                  </span>
                </div>
              ))}
              <button onClick={() => setPage("resources")}>
                Manage sources <ArrowRight size={12} />
              </button>
            </section>
          )}
          <div className="desk-controls">
            <div className="reading-tabs">
              {[
                ["all", "Latest"],
                ["focus", "For you"],
                ["papers", "Papers"],
                ["saved", "Saved"],
                ["dismissed", "Dismissed"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={
                    mode === id && !activeTopic && searchMode === "library"
                      ? "active"
                      : ""
                  }
                  aria-pressed={
                    mode === id && !activeTopic && searchMode === "library"
                  }
                  onClick={() => chooseMode(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <SearchAndFollow
            query={query}
            onQuery={(value) => {
              setQuery(value);
              setSelection(null);
              setPageNumber(1);
              setPaperOrder(null);
            }}
            mode={searchMode}
            onMode={(value) => {
              setSearchMode(value);
              setSelection(null);
              setPageNumber(1);
            }}
            providers={feed.providers}
            onFollow={feed.followTopic}
            onOpenTopic={openTopic}
            scopeLabel={viewName}
          />
          {searchMode === "library" && !!feed.data?.followedTopics.length && (
            <div className="following-heading">
              <span>Following</span>
              <button onClick={() => setPage("interests")}>
                Manage topics <ArrowRight size={12} />
              </button>
            </div>
          )}
          {searchMode === "library" && (
            <div className="topic-chips" aria-label="Followed topic feeds">
              {feed.data?.followedTopics.map((topic) => (
                <button
                  key={topic.id}
                  className={topicId === topic.id ? "active" : ""}
                  aria-pressed={topicId === topic.id}
                  onClick={() => {
                    setTopicId(topicId === topic.id ? null : topic.id);
                    setMode("all");
                    setSearchMode("library");
                    setFilter("all");
                    setQuery("");
                    setSelection(null);
                    setPageNumber(1);
                    setPaperOrder(null);
                  }}
                >
                  {topic.name}
                  {topic.paused ? " · paused" : ""}
                </button>
              ))}
            </div>
          )}
          {activeTopic && searchMode === "library" && (
            <div className="topic-feed-status">
              <button className="text-link" onClick={() => chooseMode("all")}>
                <X size={12} /> Clear topic
              </button>
              <span>
                Query: {activeTopic.query}
                {activeTopic.paused ? " · Paused" : ""}
              </span>
              {activeTopic.providers.map((id) => (
                <span
                  key={id}
                  className={activeTopic.checks[id]?.error ? "error-text" : ""}
                >
                  {feed.providers.find((p) => p.id === id)?.name || id}:{" "}
                  {activeTopic.checks[id]?.error ||
                    ago(activeTopic.checks[id]?.lastSuccess || null)}
                </span>
              ))}
            </div>
          )}
          {searchMode === "library" && (
            <>
              <div className="list-caption">
                {mode !== "papers" || activeTopic ? (
                  <label className="content-filter">
                    Show
                    <select
                      aria-label="Filter by content type"
                      value={filter}
                      onChange={(event) => {
                        setFilter(event.target.value);
                        setPageNumber(1);
                        setPaperOrder(null);
                        setSelection(null);
                      }}
                    >
                      <option value="all">Everything</option>
                      <option value="research">Papers</option>
                      <option value="tools">Tools & releases</option>
                      <option value="news">Posts & discussions</option>
                    </select>
                  </label>
                ) : (
                  <span>Ranked by your interests</span>
                )}
                <span>
                  {query.trim()
                    ? `Results in ${viewName}`
                    : activeTopic
                      ? "Newest first"
                      : mode === "papers"
                        ? "Select a paper to read"
                        : mode === "focus"
                          ? "Since your last visit · up to 10"
                          : mode === "all"
                            ? `${enabledSources.length} source${enabledSources.length === 1 ? "" : "s"} on · newest first`
                            : "Your collection"}
                </span>
              </div>
              {!shown.length ? (
                <div className="feed-empty" role="status">
                  {feed.data?.syncing || !feed.data ? (
                    <RefreshCw className="spin" size={25} />
                  ) : (
                    <BookOpen size={28} />
                  )}
                  <h2>
                    {!feed.data
                      ? "Loading your feed…"
                      : query.trim()
                        ? "No matches in this view"
                        : filter !== "all"
                          ? "No items of this type yet"
                          : mode === "saved"
                            ? "Your reading shelf starts here"
                            : mode === "dismissed"
                              ? "Nothing dismissed"
                              : feed.data.syncing
                                ? "Collecting your sources…"
                                : activeTopic
                                  ? "No updates for this topic yet"
                                  : mode === "focus"
                                    ? "You’re all caught up"
                                    : mode === "papers"
                                      ? "No matching papers yet"
                                      : "Your feed is ready for sources"}
                  </h2>
                  <p>
                    {!feed.data
                      ? "Your saved items and sources will appear shortly."
                      : query.trim()
                        ? `Try another search, or clear it to see all items in ${viewName}.`
                        : filter !== "all"
                          ? "Choose Everything to see the rest of this view."
                          : mode === "saved"
                            ? "Open an item and select its bookmark to save it for later."
                            : mode === "dismissed"
                              ? "Items you dismiss will appear here, where you can restore them."
                              : feed.data.syncing
                                ? "New items will appear here as they arrive."
                                : activeTopic
                                  ? "Future matches will appear here when your topic is checked."
                                  : mode === "focus"
                                    ? "Browse Latest for all updates, or adjust your interests for a different mix."
                                    : mode === "papers"
                                      ? "Connect a research source or adjust your interests to find papers for this view."
                                      : "Connect a subreddit, research feed, blog or repository to begin collecting updates."}
                  </p>
                  {feed.data && (
                    <div className="empty-actions">
                      {query.trim() ? (
                        <button className="button" onClick={() => setQuery("")}>
                          Clear search
                        </button>
                      ) : filter !== "all" ? (
                        <button
                          className="button"
                          onClick={() => setFilter("all")}
                        >
                          Show everything
                        </button>
                      ) : mode !== "all" || activeTopic ? (
                        <button
                          className="button"
                          onClick={() => chooseMode("all")}
                        >
                          Browse Latest <ArrowRight size={14} />
                        </button>
                      ) : (
                        <button
                          className="button primary"
                          onClick={() => setPage("resources")}
                        >
                          <Plus size={14} /> Add a source
                        </button>
                      )}
                      {mode === "focus" ? (
                        <button
                          className="text-link"
                          onClick={() => setPage("interests")}
                        >
                          Adjust interests
                        </button>
                      ) : !query.trim() && !activeTopic && mode === "all" ? (
                        <button
                          className="text-link"
                          onClick={() => setSearchMode("discover")}
                        >
                          <Search size={14} /> Find a topic
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`reader-layout ${selection !== null ? "has-selection" : ""}`}
                >
                  <section className="list-panel">
                    <StoryList
                      stories={shown}
                      offset={pagination.offset}
                      selected={selected?.groupId || null}
                      onSelect={(s) => setSelection(s.groupId)}
                      empty={
                        feed.data
                          ? "No matching developments."
                          : "Loading sources…"
                      }
                    />
                    <Pagination
                      {...pagination}
                      onPage={(next) => {
                        if (mode === "papers" && !paperOrder)
                          setPaperOrder(candidates.map((s) => s.groupId));
                        setPageNumber(next);
                        setSelection(null);
                      }}
                      onSize={(value) => {
                        setPerPage(pageSize(value));
                        preferences.set("page-size", String(value));
                        setPageNumber(1);
                        setPaperOrder(null);
                        setSelection(null);
                      }}
                    />
                  </section>
                  <StoryReader
                    story={selected}
                    depth={ai.depth}
                    onDepth={ai.setDepth}
                    summary={ai.summary}
                    error={
                      ai.error ||
                      (ai.status === "error" ? ai.message : undefined)
                    }
                    modelStatus={ai.status}
                    preferSummary={ai.preferred}
                    onAction={(patch) =>
                      selected && void feed.act(selected, patch)
                    }
                    onSummary={() => selected && void ai.summarize([selected])}
                    onModel={() => setPage("model")}
                    onCancel={ai.cancel}
                    onBack={() => {
                      const id = selected?.groupId;
                      setSelection(null);
                      requestAnimationFrame(() => {
                        document
                          .querySelector<HTMLButtonElement>(
                            `[data-story-id="${id}"]`,
                          )
                          ?.focus();
                      });
                    }}
                  />
                </div>
              )}
              {mode === "focus" && shown.length > 0 && (
                <div className="briefing-end">
                  <span>End of briefing</span>
                  {ai.status === "ready" && (
                    <button
                      className="text-link"
                      onClick={() => void ai.summarize(briefing)}
                    >
                      Summarize these sources
                    </button>
                  )}
                  {ai.status === "working" && (
                    <button className="text-link" onClick={ai.cancel}>
                      Cancel summaries
                    </button>
                  )}
                  <button
                    className="text-link"
                    onClick={() => chooseMode("all")}
                  >
                    View all <ArrowRight size={12} />
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      )}
      <footer className="app-footer">
        <span>Stored on this computer</span>
      </footer>
    </div>
  );
}
