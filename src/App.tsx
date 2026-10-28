import { preferences } from "./lib/preferences";
import { browserStorage } from "./lib/api";
import { DataSettings } from "./components/DataSettings";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  ChevronDown,
  Command,
  Cpu,
  Layers,
  Moon,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import type { Story } from "../shared/types.ts";
import { paginate, rankedPapers, pageSize } from "../shared/pagination.ts";
import { SearchAndFollow } from "./components/SearchAndFollow";
import { FollowedTopics } from "./components/FollowedTopics";
import { Pagination } from "./components/Pagination";
import { selectBriefing, categorizeBriefing } from "../shared/briefing.ts";
import { useFeed } from "./hooks/useFeed";
import { useLocalAI } from "./hooks/useLocalAI";
import { StoryList } from "./components/StoryList";
import { StoryReader } from "./components/StoryReader";
import { ResourceLibrary } from "./components/ResourceLibrary";
import { OpenSource } from "./components/OpenSource";
import { Interests } from "./components/Interests";
import { ModelSettings } from "./components/ModelSettings";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { useShortcuts } from "./hooks/useShortcuts";
import { ago } from "./lib/format";
import "./styles.css";
import "./intuitive.css";
import "./workspace.css";

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

  const [theme, setTheme] = useState<"light" | "dark">(() =>
    preferences.get("theme") === "dark" ? "dark" : "light",
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (preferences.get("theme") !== theme) {
      preferences.set("theme", theme);
    }
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

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
  const [sortBy, setSortBy] = useState<"newest" | "relevance">("newest");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => preferences.get("sidebar-collapsed") === "true",
  );
  useEffect(() => {
    if (preferences.get("sidebar-collapsed") !== String(sidebarCollapsed)) {
      preferences.set("sidebar-collapsed", String(sidebarCollapsed));
    }
  }, [sidebarCollapsed]);

  const all = feed.data?.stories || [];
  const briefing = useMemo(
    () => selectBriefing(all, feed.since),
    [all, feed.since],
  );
  const categorizedBriefing = useMemo(
    () => categorizeBriefing(briefing),
    [briefing],
  );

  const unreadBriefingCount = briefing.filter((s) => !s.read).length;
  const unreadPapersCount = all.filter(
    (s) => s.kind === "research" && !s.read && !s.dismissed,
  ).length;
  const unreadToolsCount = all.filter(
    (s) => s.kind === "tools" && !s.read && !s.dismissed,
  ).length;
  const unreadNewsCount = all.filter(
    (s) => s.kind === "news" && !s.read && !s.dismissed,
  ).length;
  const savedCount = all.filter((s) => s.saved && !s.dismissed).length;
  const dismissedCount = all.filter((s) => s.dismissed).length;

  const candidates = activeTopic
    ? all
        .filter(
          (s) => !s.dismissed && s.followedTopicIds?.includes(activeTopic.id),
        )
        .sort((a, b) =>
          sortBy === "relevance"
            ? b.score - a.score
            : (b.publishedAt || b.firstSeenAt).localeCompare(
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
                  sortBy === "relevance"
                    ? b.score - a.score
                    : (b.publishedAt || b.firstSeenAt).localeCompare(
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
  const syncingSourceIds = new Set(feed.data?.syncingSourceIds || []);

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
            : filter === "research"
              ? "Papers"
              : filter === "tools"
                ? "Tools & Releases"
                : filter === "news"
                  ? "Articles & Discussions"
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

  function chooseMode(value: string, contentFilter = "all") {
    setMode(value);
    setTopicId(null);
    setSearchMode("library");
    setFilter(contentFilter);
    setQuery("");
    setPageNumber(1);
    setPaperOrder(null);
    setSelection(null);
  }

  // Keyboard navigation & triage shortcuts
  useShortcuts({
    currentStory: selected,
    isModalOpen: commandPaletteOpen || shortcutsHelpOpen,
    onNext: () => {
      if (!shown.length) return;
      const currentIndex = shown.findIndex((s) => s.groupId === selected?.groupId);
      const nextIndex = (currentIndex + 1) % shown.length;
      setSelection(shown[nextIndex].groupId);
    },
    onPrev: () => {
      if (!shown.length) return;
      const currentIndex = shown.findIndex((s) => s.groupId === selected?.groupId);
      const prevIndex = currentIndex <= 0 ? shown.length - 1 : currentIndex - 1;
      setSelection(shown[prevIndex].groupId);
    },
    onToggleSave: (story) => void feed.act(story, { saved: !story.saved }),
    onToggleRead: (story) => void feed.act(story, { read: !story.read }),
    onDismiss: (story) => {
      const currentIndex = shown.findIndex((s) => s.groupId === story.groupId);
      void feed.act(story, { dismissed: !story.dismissed });
      if (currentIndex + 1 < shown.length) {
        setSelection(shown[currentIndex + 1].groupId);
      }
    },
    onOpenOriginal: (story) => window.open(story.canonicalUrl, "_blank", "noreferrer"),
    onFocusSearch: () => {
      const el = document.getElementById("feed-search-input") as HTMLInputElement | null;
      el?.focus();
    },
    onToggleCommandPalette: () => setCommandPaletteOpen((prev) => !prev),
    onToggleHelp: () => setShortcutsHelpOpen((prev) => !prev),
  });

  return (
    <div className="app">
      <header className="app-header">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("read");
            chooseMode("all");
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
          className="command-palette-trigger"
          title="Open Command Palette (⌘K)"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <Command size={13} />
          <span>⌘K</span>
        </button>

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

      {/* Modals: Command Palette & Shortcuts Help */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSelectView={(v, f) => chooseMode(v, f || "all")}
        onSelectPage={(p) => setPage(p)}
        onRefreshAll={() => void feed.refresh(true)}
        onRefreshSource={(sId) => void feed.refreshSource(sId)}
        onToggleTheme={toggleTheme}
        onSummarizeStory={(s) => void ai.summarize([s])}
        onOpenDiscover={() => {
          setPage("read");
          setSearchMode("discover");
        }}
        currentStory={selected}
        sources={feed.data?.sources || []}
        isDark={theme === "dark"}
      />

      <ShortcutsHelp
        open={shortcutsHelpOpen}
        onClose={() => setShortcutsHelpOpen(false)}
      />

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
          onRefresh={() => void feed.refresh(true)}
          syncing={!!feed.data?.syncing}
        />
      ) : page === "interests" ? (
        feed.data && (
          <Interests
            profile={feed.data.profile}
            onSave={async (p) => {
              await feed.saveProfile(p);
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
        /* 3-Pane Workspace UI */
        <div className="workspace-layout">
          {/* Left Sidebar (250px) */}
          <aside
            className={`workspace-sidebar ${sidebarCollapsed ? "collapsed" : ""}`}
            aria-label="Workspace Sidebar"
          >
            <div className="sidebar-main">
              {/* Primary Views */}
              <div className="sidebar-section">
                <div className="sidebar-section-title">Views</div>
                <div className="sidebar-nav-list">
                  <button
                    className={`sidebar-nav-item ${mode === "focus" && !activeTopic && searchMode === "library" ? "active" : ""}`}
                    onClick={() => chooseMode("focus")}
                  >
                    <span className="sidebar-item-left">
                      <Sparkles size={15} />
                      <span>For you</span>
                    </span>
                    {unreadBriefingCount > 0 && (
                      <span className="sidebar-badge">{unreadBriefingCount}</span>
                    )}
                  </button>

                  <button
                    className={`sidebar-nav-item ${mode === "all" && filter === "all" && !activeTopic && searchMode === "library" ? "active" : ""}`}
                    onClick={() => chooseMode("all", "all")}
                  >
                    <span className="sidebar-item-left">
                      <BookOpen size={15} />
                      <span>Latest</span>
                    </span>
                    <span className="sidebar-badge">{all.length}</span>
                  </button>

                  <button
                    className={`sidebar-nav-item ${(mode === "papers" || (mode === "all" && filter === "research")) && !activeTopic ? "active" : ""}`}
                    onClick={() => chooseMode("papers", "research")}
                  >
                    <span className="sidebar-item-left">
                      <Layers size={15} />
                      <span>Papers</span>
                    </span>
                    {unreadPapersCount > 0 && (
                      <span className="sidebar-badge">{unreadPapersCount}</span>
                    )}
                  </button>

                  <button
                    className={`sidebar-nav-item ${mode === "all" && filter === "tools" && !activeTopic ? "active" : ""}`}
                    onClick={() => chooseMode("all", "tools")}
                  >
                    <span className="sidebar-item-left">
                      <Radio size={15} />
                      <span>Tools & Releases</span>
                    </span>
                    {unreadToolsCount > 0 && (
                      <span className="sidebar-badge">{unreadToolsCount}</span>
                    )}
                  </button>

                  <button
                    className={`sidebar-nav-item ${mode === "all" && filter === "news" && !activeTopic ? "active" : ""}`}
                    onClick={() => chooseMode("all", "news")}
                  >
                    <span className="sidebar-item-left">
                      <BookOpen size={15} />
                      <span>Discussions</span>
                    </span>
                    {unreadNewsCount > 0 && (
                      <span className="sidebar-badge">{unreadNewsCount}</span>
                    )}
                  </button>

                  <button
                    className={`sidebar-nav-item ${mode === "saved" && !activeTopic ? "active" : ""}`}
                    onClick={() => chooseMode("saved")}
                  >
                    <span className="sidebar-item-left">
                      <Bookmark size={15} />
                      <span>Saved</span>
                    </span>
                    {savedCount > 0 && (
                      <span className="sidebar-badge">{savedCount}</span>
                    )}
                  </button>

                  <button
                    className={`sidebar-nav-item ${mode === "dismissed" && !activeTopic ? "active" : ""}`}
                    onClick={() => chooseMode("dismissed")}
                  >
                    <span className="sidebar-item-left">
                      <X size={15} />
                      <span>Dismissed</span>
                    </span>
                    {dismissedCount > 0 && (
                      <span className="sidebar-badge">{dismissedCount}</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Followed Topics Section */}
              <div className="sidebar-section">
                <div className="sidebar-section-title">
                  <span>Followed Topics</span>
                  <button
                    title="Find and follow a new topic"
                    onClick={() => setSearchMode("discover")}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="sidebar-nav-list">
                  {!feed.data?.followedTopics.length && (
                    <span className="desk-description" style={{ fontSize: "11.5px", padding: "0 8px" }}>
                      No topics followed yet.
                    </span>
                  )}
                  {feed.data?.followedTopics.map((topic) => (
                    <button
                      key={topic.id}
                      className={`sidebar-topic-row ${topicId === topic.id ? "active" : ""}`}
                      onClick={() => openTopic(topic.id)}
                    >
                      <span className="sidebar-item-left">
                        <span
                          className={`sidebar-topic-dot ${topic.paused ? "paused" : ""}`}
                        />
                        <span>{topic.name}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Connected Sources Section */}
              <div className="sidebar-section">
                <div className="sidebar-section-title">
                  <span>Connected Sources</span>
                  <button
                    title="Add a new source"
                    onClick={() => setPage("resources")}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <div className="sidebar-nav-list">
                  {!enabledSources.length && (
                    <span className="desk-description" style={{ fontSize: "11.5px", padding: "0 8px" }}>
                      No sources enabled.
                    </span>
                  )}
                  {enabledSources.map((source) => {
                    const isSyncing = syncingSourceIds.has(source.id);
                    return (
                      <div key={source.id} className="sidebar-source-row">
                        <span className="sidebar-source-meta" title={source.name}>
                          <span
                            className={`connection-dot ${isSyncing ? "collecting" : source.error ? "warning" : "on"}`}
                          />
                          <span className="sidebar-source-name">
                            {source.name}
                          </span>
                        </span>
                        <div className="sidebar-source-actions">
                          <button
                            className="source-refresh-btn"
                            title={`Refresh ${source.name}`}
                            onClick={() => void feed.refreshSource(source.id)}
                            disabled={isSyncing}
                          >
                            <RefreshCw
                              size={12}
                              className={isSyncing ? "spin" : ""}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sidebar Footer Controls */}
            <div className="sidebar-footer">
              <div className="sidebar-footer-row">
                <button
                  className="theme-toggle-btn"
                  onClick={toggleTheme}
                  title="Toggle Editorial Light / Carbon Dark"
                >
                  {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
                  <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                </button>

                <button
                  className="theme-toggle-btn"
                  onClick={() => setShortcutsHelpOpen(true)}
                  title="Keyboard shortcuts (?)"
                >
                  <Command size={13} />
                  <span>Shortcuts</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Center Feed Pane */}
          <main className="workspace-center-feed">
            {/* Sync Progress Bar */}
            {feed.data?.syncing && (
              <div className="sync-progress-bar">
                <div className="sync-progress-fill" />
              </div>
            )}

            {/* Top Toolbar */}
            <div className="feed-toolbar">
              <div className="feed-toolbar-top">
                <div className="feed-search-wrapper">
                  <Search size={14} className="feed-search-icon" />
                  <input
                    id="feed-search-input"
                    className="feed-search-input"
                    type="text"
                    placeholder={`Filter developments in ${viewName}…`}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setSelection(null);
                      setPageNumber(1);
                    }}
                  />
                  <kbd className="feed-search-kbd">/</kbd>
                </div>

                <button
                  className="button refresh-button"
                  title="Refresh all feeds (Space)"
                  onClick={() => void feed.refresh(true)}
                  disabled={!!feed.data?.syncing}
                >
                  <RefreshCw
                    size={14}
                    className={feed.data?.syncing ? "spin" : ""}
                  />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="feed-toolbar-filters">
                <div className="content-pills">
                  {[
                    ["all", "All"],
                    ["research", "Papers"],
                    ["tools", "Tools"],
                    ["news", "Discussions"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={`content-pill ${filter === id ? "active" : ""}`}
                      onClick={() => {
                        setFilter(id);
                        setPageNumber(1);
                        setSelection(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <select
                  className="feed-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  aria-label="Sort order"
                >
                  <option value="newest">Newest first</option>
                  <option value="relevance">By relevance</option>
                </select>
              </div>
            </div>

            {/* Upstream Topic Search / Discover Mode */}
            {searchMode === "discover" ? (
              <div style={{ padding: "16px" }}>
                <SearchAndFollow
                  query={query}
                  onQuery={(value) => {
                    setQuery(value);
                    setSelection(null);
                    setPageNumber(1);
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
              </div>
            ) : null}

            {/* Feed List / Structured Briefing */}
            {searchMode === "library" && (
              <>
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
                            ? "Choose All to see the rest of this view."
                            : mode === "saved"
                              ? "Save items with (s) to keep them on your reading shelf."
                              : mode === "dismissed"
                                ? "Items you dismiss appear here, where you can restore them."
                                : feed.data.syncing
                                  ? "New items will appear here as they arrive."
                                  : activeTopic
                                    ? "Future matches will appear here when your topic is checked."
                                    : mode === "focus"
                                      ? "Browse Latest for all updates, or adjust your interests for a different mix."
                                      : "Connect a research source, blog, Substack, Lobste.rs, or repository to collect updates."}
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
                            Show all
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
                      </div>
                    )}
                  </div>
                ) : mode === "focus" && filter === "all" && !query ? (
                  <div className="briefing-sections">
                    {/* Header with Batch Summarize */}
                    <div className="briefing-toolbar">
                      <div className="briefing-title-area">
                        <h2>Today's Briefing</h2>
                        <span className="briefing-subtitle">
                          {briefing.length} high-signal development{briefing.length === 1 ? "" : "s"} matched to your profile
                        </span>
                      </div>
                      <div className="briefing-actions">
                        {ai.status === "ready" && (
                          <button
                            className="button primary"
                            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
                            onClick={() => void ai.summarize(briefing)}
                          >
                            <Sparkles size={14} /> Summarize Briefing ({briefing.length})
                          </button>
                        )}
                        {ai.status === "working" && (
                          <button
                            className="button"
                            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
                            onClick={ai.cancel}
                          >
                            <RefreshCw size={14} className="spin" /> Summarizing… (Cancel)
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Section 1: Key Research & Preprints */}
                    {categorizedBriefing.research.length > 0 && (
                      <div className="briefing-section">
                        <div className="briefing-category-header">
                          <span className="briefing-category-title">
                            Key Research & Preprints
                          </span>
                          <span className="briefing-category-count">
                            {categorizedBriefing.research.length}
                          </span>
                        </div>
                        <StoryList
                          stories={categorizedBriefing.research}
                          selected={selected?.groupId || null}
                          onSelect={(s) => setSelection(s.groupId)}
                          onAction={(s, patch) => void feed.act(s, patch)}
                          empty="No preprints in this briefing."
                        />
                      </div>
                    )}

                    {/* Section 2: Releases & Open-Source Tools */}
                    {categorizedBriefing.tools.length > 0 && (
                      <div className="briefing-section">
                        <div className="briefing-category-header">
                          <span className="briefing-category-title">
                            Releases & Open-Source Tools
                          </span>
                          <span className="briefing-category-count">
                            {categorizedBriefing.tools.length}
                          </span>
                        </div>
                        <StoryList
                          stories={categorizedBriefing.tools}
                          selected={selected?.groupId || null}
                          onSelect={(s) => setSelection(s.groupId)}
                          onAction={(s, patch) => void feed.act(s, patch)}
                          empty="No tool releases in this briefing."
                        />
                      </div>
                    )}

                    {/* Section 3: Articles & Community Discussions */}
                    {categorizedBriefing.news.length > 0 && (
                      <div className="briefing-section">
                        <div className="briefing-category-header">
                          <span className="briefing-category-title">
                            Articles & Discussions
                          </span>
                          <span className="briefing-category-count">
                            {categorizedBriefing.news.length}
                          </span>
                        </div>
                        <StoryList
                          stories={categorizedBriefing.news}
                          selected={selected?.groupId || null}
                          onSelect={(s) => setSelection(s.groupId)}
                          onAction={(s, patch) => void feed.act(s, patch)}
                          empty="No articles or discussions in this briefing."
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <StoryList
                      stories={shown}
                      offset={pagination.offset}
                      selected={selected?.groupId || null}
                      onSelect={(s) => setSelection(s.groupId)}
                      onAction={(s, patch) => void feed.act(s, patch)}
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
                  </>
                )}
              </>
            )}
          </main>

          {/* Right Reader Pane (Sticky Split-View) */}
          <aside className="workspace-reader-pane" aria-label="Story Reader">
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
          </aside>
        </div>
      )}

      <footer className="app-footer">
        <span>Stored privately on this computer</span>
        <span>Fieldnotes · Personal Research Workspace</span>
      </footer>
    </div>
  );
}
