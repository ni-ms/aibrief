import { preferences } from "./lib/preferences";
import { browserStorage } from "./lib/api";
import { initialTheme } from "./lib/appearance";
import { readOnboarding, type OnboardingRecord } from "../shared/onboarding.ts";
import type { Profile } from "../shared/types.ts";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Command,
  Cpu,
  Download,
  ExternalLink,
  FileText,
  Layers,
  MessageSquarePlus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Settings2,
  LoaderCircle,
  Sun,
  X,
} from "lucide-react";
import type { Story } from "../shared/types.ts";
import { paginate, rankedPapers, pageSize } from "../shared/pagination.ts";
import { SearchAndFollow } from "./components/SearchAndFollow";
import { FollowedTopics } from "./components/FollowedTopics";
import { Pagination } from "./components/Pagination";
import { selectBriefing, categorizeBriefing } from "../shared/briefing.ts";
import { hybridSearchStories } from "../shared/semantic.ts";
import {
  generateBriefingHtml,
  generateBriefingMarkdown,
} from "../shared/export-briefing.ts";
import { useFeed } from "./hooks/useFeed";
import { useLocalAI } from "./hooks/useLocalAI";
import { StoryList } from "./components/StoryList";
import { StoryReader } from "./components/StoryReader";
import { useShortcuts } from "./hooks/useShortcuts";
import "./styles.css";
import "./intuitive.css";
import "./workspace.css";

const DataSettings = lazy(() =>
  import("./components/DataSettings").then((m) => ({
    default: m.DataSettings,
  })),
);
const Onboarding = lazy(() =>
  import("./components/Onboarding").then((m) => ({ default: m.Onboarding })),
);
const Settings = lazy(() =>
  import("./components/Settings").then((m) => ({ default: m.Settings })),
);
const ResourceLibrary = lazy(() =>
  import("./components/ResourceLibrary").then((m) => ({
    default: m.ResourceLibrary,
  })),
);
const Interests = lazy(() =>
  import("./components/Interests").then((m) => ({ default: m.Interests })),
);
const ModelSettings = lazy(() =>
  import("./components/ModelSettings").then((m) => ({
    default: m.ModelSettings,
  })),
);
const CommandPalette = lazy(() =>
  import("./components/CommandPalette").then((m) => ({
    default: m.CommandPalette,
  })),
);
const ShortcutsHelp = lazy(() =>
  import("./components/ShortcutsHelp").then((m) => ({
    default: m.ShortcutsHelp,
  })),
);
const FeedbackModal = lazy(() =>
  import("./components/FeedbackModal").then((m) => ({
    default: m.FeedbackModal,
  })),
);
const EMPTY_STORIES: Story[] = [];

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
    initialTheme(preferences.get("theme")),
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#16181d" : "#f6f5f0");
    if (preferences.get("theme") !== theme) {
      preferences.set("theme", theme);
    }
  }, [theme]);

  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(
    () => !readOnboarding(preferences.get("onboarding")),
  );
  const [replayingOnboarding, setReplayingOnboarding] = useState(false);

  const [page, setPage] = useState("read");
  const [resourcesCategory, setResourcesCategory] = useState("All");
  const [mode, setMode] = useState("all");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    if (!query.trim()) {
      setSearchQuery("");
      return;
    }
    const timer = setTimeout(() => setSearchQuery(query), 180);
    return () => clearTimeout(timer);
  }, [query]);
  const [searchMode, setSearchMode] = useState<"library" | "discover">(
    "library",
  );
  const [searchType, setSearchType] = useState<
    "hybrid" | "keyword" | "semantic"
  >(() => {
    const saved = preferences.get("search-mode-type");
    return saved === "keyword" || saved === "semantic" ? saved : "hybrid";
  });
  function changeSearchType(next: "hybrid" | "keyword" | "semantic") {
    setSearchType(next);
    preferences.set("search-mode-type", next);
  }

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

  const all = feed.data?.stories || EMPTY_STORIES;
  const storiesByGroup = useMemo(
    () => new Map(all.map((s) => [s.groupId, s])),
    [all],
  );
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

  const candidates = useMemo(() => {
    if (!activeTopic && mode === "focus") return briefing;
    if (!activeTopic && mode === "papers" && paperOrder)
      return paperOrder
        .map((id) => storiesByGroup.get(id))
        .filter((s): s is Story => !!s && !s.dismissed);
    const items = activeTopic
      ? all.filter(
          (s) => !s.dismissed && s.followedTopicIds?.includes(activeTopic.id),
        )
      : mode === "papers"
        ? rankedPapers(all)
        : mode === "saved"
          ? all.filter((s) => s.saved && !s.dismissed)
          : mode === "dismissed"
            ? all.filter((s) => s.dismissed)
            : all.filter((s) => !s.dismissed);
    return items.sort(
      (a, b) =>
        (sortBy === "relevance" ? b.score - a.score : 0) ||
        (b.publishedAt || b.firstSeenAt).localeCompare(
          a.publishedAt || a.firstSeenAt,
        ) ||
        a.groupId - b.groupId,
    );
  }, [
    all,
    storiesByGroup,
    activeTopic?.id,
    mode,
    paperOrder,
    briefing,
    sortBy,
  ]);

  const filtered = useMemo(() => {
    const byContentKind = candidates.filter(
      (s) => filter === "all" || s.kind === filter,
    );
    if (searchMode === "discover" || !searchQuery.trim()) {
      return byContentKind;
    }
    return hybridSearchStories(byContentKind, searchQuery, searchType).map(
      (m) => m.story,
    );
  }, [candidates, filter, searchMode, searchQuery, searchType]);

  const pagination = paginate(filtered, pageNumber, perPage);
  const shown = pagination.items;
  const selected =
    shown.find((s) => s.groupId === selection) || shown[0] || null;

  useEffect(() => {
    const pane = document.querySelector<HTMLElement>(".workspace-reader-pane");
    if (pane) pane.scrollTop = 0;
  }, [selected?.groupId]);

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
    !onboardingOpen && page === "read" && searchMode === "library"
      ? selected
      : null,
  );
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

  function openTopic(id: string) {
    chooseMode("all");
    setTopicId(id);
  }

  function chooseMode(value: string, contentFilter = "all") {
    setMode(value);
    setSortBy(value === "papers" ? "relevance" : "newest");
    setTopicId(null);
    setSearchMode("library");
    setFilter(contentFilter);
    setQuery("");
    setPageNumber(1);
    setPaperOrder(null);
    setSelection(null);
  }

  function exportStoriesAsHtml(targetStories: Story[], title: string) {
    const html = generateBriefingHtml(targetStories, { title });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fieldnotes-briefing-${new Date().toISOString().slice(0, 10)}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openStoriesAsWebpage(targetStories: Story[], title: string) {
    const html = generateBriefingHtml(targetStories, { title });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
  }

  function exportStoriesAsMarkdown(targetStories: Story[], title: string) {
    const md = generateBriefingMarkdown(targetStories, { title });
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fieldnotes-briefing-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Keyboard navigation & triage shortcuts
  useShortcuts({
    currentStory: !onboardingOpen && page === "read" ? selected : null,
    isModalOpen:
      commandPaletteOpen ||
      shortcutsHelpOpen ||
      feedbackModalOpen ||
      onboardingOpen ||
      page !== "read",
    onNext: () => {
      if (!shown.length) return;
      const currentIndex = shown.findIndex(
        (s) => s.groupId === selected?.groupId,
      );
      const nextIndex = (currentIndex + 1) % shown.length;
      setSelection(shown[nextIndex].groupId);
    },
    onPrev: () => {
      if (!shown.length) return;
      const currentIndex = shown.findIndex(
        (s) => s.groupId === selected?.groupId,
      );
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
    onOpenOriginal: (story) =>
      window.open(story.canonicalUrl, "_blank", "noreferrer"),
    onFocusSearch: () => {
      const el = document.getElementById(
        "feed-search-input",
      ) as HTMLInputElement | null;
      el?.focus();
    },
    onToggleCommandPalette: () => {
      if (!onboardingOpen) setCommandPaletteOpen((prev) => !prev);
    },
    onToggleSidebar: () => setSidebarCollapsed((prev) => !prev),
    onToggleHelp: () => setShortcutsHelpOpen((prev) => !prev),
  });

  function redoOnboarding() {
    if (ai.status === "working" || ai.status === "loading") ai.cancel();
    setReplayingOnboarding(true);
    setOnboardingOpen(true);
    setCommandPaletteOpen(false);
  }

  async function finishOnboarding(profile: Profile, record: OnboardingRecord) {
    await feed.saveProfile(profile);
    await preferences.save("onboarding", JSON.stringify(record));
    feed.resetSince();
    chooseMode("focus");
    setPage("read");
    setOnboardingOpen(false);
    feed.setNotice("Your feed is personalized.");
  }

  async function skipOnboarding() {
    if (!replayingOnboarding) {
      await preferences.save(
        "onboarding",
        JSON.stringify({
          version: 1,
          topicIds: [],
          custom: "",
          prompt: feed.data!.profile.prompt,
          skipped: true,
        } satisfies OnboardingRecord),
      );
    }
    setOnboardingOpen(false);
  }

  if (onboardingOpen)
    return (
      <Suspense
        fallback={
          <main className="page" role="status">
            Opening personalization…
          </main>
        }
      >
        {feed.data ? (
          <Onboarding
            profile={feed.data.profile}
            replaying={replayingOnboarding}
            onComplete={finishOnboarding}
            onSkip={skipOnboarding}
          />
        ) : (
          <main className="page" role="status">
            <h1>Fieldnotes</h1>
            <p>{feed.error || "Opening your reading desk…"}</p>
            {feed.error && (
              <button className="button" onClick={() => void feed.load()}>
                Try again
              </button>
            )}
          </main>
        )}
      </Suspense>
    );

  return (
    <div className={`app ${page === "read" ? "app-desk" : ""}`}>
      <header className="app-header">
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {page === "read" && (
            <button
              type="button"
              className="sidebar-collapse-btn"
              title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar ([)`}
              aria-label={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar`}
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen size={16} />
              ) : (
                <PanelLeftClose size={16} />
              )}
            </button>
          )}
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
        </div>

        <nav aria-label="Main navigation">
          {[
            ["read", "Feed"],
            ["resources", "Sources"],
            ["interests", "Interests"],
            ["settings", "Settings"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={
                page === id ||
                (id === "settings" && (page === "data" || page === "model"))
                  ? "active"
                  : ""
              }
              aria-current={
                page === id ||
                (id === "settings" && (page === "data" || page === "model"))
                  ? "page"
                  : undefined
              }
              onClick={() => {
                if (id === "resources") setResourcesCategory("All");
                setPage(id);
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <button
          className="command-palette-trigger"
          title="Open Command Palette (⌘K)"
          aria-label="Open command palette"
          aria-keyshortcuts="Meta+k Control+k"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <kbd>⌘K</kbd>
        </button>

        <div className="model-header-controls">
          <button
            className={`model-indicator ${ai.status === "ready" ? "ready" : ""}`}
            title={
              ai.status === "loading"
                ? ai.message
                : "Load a model for AI summaries"
            }
            onClick={() =>
              ai.status === "loading" || ai.status === "working"
                ? ai.cancel()
                : ai.status === "ready"
                  ? setPage("model")
                  : void ai.enable()
            }
          >
            {ai.status === "loading" || ai.status === "working" ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Cpu size={15} />
            )}
            <span>
              {ai.status === "loading"
                ? `Loading ${Math.round(ai.progress * 100)}% · Cancel`
                : ai.status === "working"
                  ? "Summarizing · Cancel"
                  : ai.status === "ready"
                    ? "Model ready"
                    : ai.status === "error"
                      ? "Retry model"
                      : "Load model"}
            </span>
          </button>
          <button
            className="model-settings-trigger"
            aria-label="Model settings"
            title="Model settings"
            onClick={() => setPage("model")}
          >
            <Settings2 size={16} />
          </button>
        </div>
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

      {ai.status === "error" && page !== "model" && (
        <div className="global-error" role="alert">
          {ai.message}
          <button onClick={() => setPage("model")}>Model options</button>
        </div>
      )}

      {/* Modals: Command Palette, Shortcuts Help & Feedback */}
      <Suspense fallback={null}>
        {commandPaletteOpen && (
          <CommandPalette
            open={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            onSelectView={(v, f) => chooseMode(v, f || "all")}
            onSelectPage={(p) => {
              if (p === "open-source") {
                setResourcesCategory("GitHub Stars");
                setPage("resources");
              } else {
                if (p === "resources") setResourcesCategory("All");
                setPage(p);
              }
            }}
            onRefreshAll={() => void feed.refresh(true)}
            onRefreshSource={(sId) => void feed.refreshSource(sId)}
            onToggleTheme={toggleTheme}
            onSummarizeStory={(s) => void ai.summarize([s])}
            onOpenDiscover={(initialQ) => {
              setPage("read");
              setSearchMode("discover");
              if (initialQ) setQuery(initialQ);
            }}
            onQuickAddSource={(src) => feed.saveSource(src)}
            onExportBriefingHtml={() =>
              exportStoriesAsHtml(
                briefing.length ? briefing : filtered.slice(0, 20),
                "Today's Fieldnotes Briefing",
              )
            }
            onOpenFeedback={() => setFeedbackModalOpen(true)}
            onRedoOnboarding={redoOnboarding}
            currentStory={selected}
            sources={feed.data?.sources || []}
            isDark={theme === "dark"}
          />
        )}

        {shortcutsHelpOpen && (
          <ShortcutsHelp
            open={shortcutsHelpOpen}
            onClose={() => setShortcutsHelpOpen(false)}
          />
        )}

        {feedbackModalOpen && (
          <FeedbackModal
            open={feedbackModalOpen}
            onClose={() => setFeedbackModalOpen(false)}
          />
        )}
      </Suspense>

      <Suspense
        fallback={
          <div className="page" role="status">
            Opening your workspace…
          </div>
        }
      >
        {page === "settings" ? (
          <Settings
            theme={theme}
            onTheme={setTheme}
            onOnboarding={redoOnboarding}
            onModel={() => setPage("model")}
            onData={browserStorage ? () => setPage("data") : undefined}
          />
        ) : page === "data" ? (
          <DataSettings />
        ) : page === "resources" ? (
          <ResourceLibrary
            resources={feed.resources}
            sources={feed.data?.sources || []}
            onSave={feed.saveSource}
            onRemove={feed.removeSource}
            onRefresh={() => void feed.refresh(true)}
            syncing={!!feed.data?.syncing}
            initialCategory={resourcesCategory}
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
          <div
            className={`workspace-layout ${selection !== null ? "has-selection" : ""}`}
          >
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
                        <span className="sidebar-badge">
                          {unreadBriefingCount}
                        </span>
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
                        <span className="sidebar-badge">
                          {unreadPapersCount}
                        </span>
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
                        <span className="sidebar-badge">
                          {unreadToolsCount}
                        </span>
                      )}
                    </button>

                    <button
                      className={`sidebar-nav-item ${mode === "all" && filter === "news" && !activeTopic ? "active" : ""}`}
                      onClick={() => chooseMode("all", "news")}
                    >
                      <span className="sidebar-item-left">
                        <BookOpen size={15} />
                        <span>Articles & Discussions</span>
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
                      <span
                        className="desk-description"
                        style={{ fontSize: "11.5px", padding: "0 8px" }}
                      >
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
                      <span
                        className="desk-description"
                        style={{ fontSize: "11.5px", padding: "0 8px" }}
                      >
                        No sources enabled.
                      </span>
                    )}
                    {enabledSources.map((source) => {
                      const isSyncing = syncingSourceIds.has(source.id);
                      return (
                        <div key={source.id} className="sidebar-source-row">
                          <span
                            className="sidebar-source-meta"
                            title={source.name}
                          >
                            <span
                              title={
                                isSyncing
                                  ? "Checking for updates"
                                  : source.error ||
                                    (source.lastSuccess
                                      ? "Up to date"
                                      : "Waiting for first update")
                              }
                              className={`connection-dot ${isSyncing ? "collecting" : source.error ? "warning" : source.lastSuccess ? "on" : ""}`}
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
                    <span>{theme === "dark" ? "Light" : "Dark"}</span>
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
                <button
                  className="theme-toggle-btn"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={() => setFeedbackModalOpen(true)}
                  title="Suggest a new source, feature, or improvement"
                >
                  <MessageSquarePlus size={14} />
                  <span>Suggest an improvement</span>
                </button>
              </div>
            </aside>

            {/* Center Feed Pane */}
            <main
              className="workspace-center-feed"
              aria-busy={query !== searchQuery && searchMode === "library"}
            >
              {/* Sync Progress Bar */}
              {feed.data?.syncing && (
                <div className="sync-progress-bar">
                  <div className="sync-progress-fill" />
                </div>
              )}

              {/* Top Toolbar */}
              <div className="feed-toolbar">
                <div className="feed-view-heading">
                  <h1>
                    {searchMode === "discover" ? "Find a topic" : viewName}
                  </h1>
                  <span role="status">
                    {query !== searchQuery
                      ? "Searching…"
                      : feed.data?.syncing
                        ? "Updating sources…"
                        : `${filtered.length.toLocaleString()} ${filtered.length === 1 ? "item" : "items"}`}
                  </span>
                </div>
                <div className="feed-toolbar-top">
                  <div className="feed-search-wrapper">
                    <Search size={14} className="feed-search-icon" />
                    <input
                      id="feed-search-input"
                      className="feed-search-input"
                      type="text"
                      aria-label={`Search ${viewName}`}
                      placeholder={`Search ${viewName}…`}
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setSelection(null);
                        setPageNumber(1);
                      }}
                    />
                    {query ? (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                        style={{
                          position: "absolute",
                          right: "8px",
                          color: "var(--quiet)",
                          padding: "2px",
                        }}
                      >
                        <X size={13} />
                      </button>
                    ) : (
                      <kbd className="feed-search-kbd">/</kbd>
                    )}
                  </div>

                  <select
                    className="feed-sort-select"
                    value={searchType}
                    onChange={(e) =>
                      changeSearchType(
                        e.target.value as "hybrid" | "keyword" | "semantic",
                      )
                    }
                    aria-label="Search matching"
                    title="Choose how to match your search"
                  >
                    <option value="hybrid">Smart match</option>
                    <option value="semantic">By meaning</option>
                    <option value="keyword">Keywords</option>
                  </select>

                  <button
                    className="button refresh-button"
                    title="Refresh all feeds"
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
                      ["news", "Articles & Discussions"],
                    ].map(([id, label]) => (
                      <button
                        key={id}
                        className={`content-pill ${filter === id ? "active" : ""}`}
                        aria-pressed={filter === id}
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

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {shown.length > 0 && (
                      <button
                        type="button"
                        className="content-pill"
                        title="Export current view as a standalone HTML webpage"
                        onClick={() =>
                          exportStoriesAsHtml(
                            mode === "focus" ? briefing : filtered.slice(0, 30),
                            `Fieldnotes · ${viewName}`,
                          )
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <Download size={12} /> HTML
                      </button>
                    )}
                    <select
                      className="feed-sort-select"
                      value={sortBy}
                      onChange={(e) => {
                        setSortBy(e.target.value as "newest" | "relevance");
                        setPageNumber(1);
                        setSelection(null);
                        setPaperOrder(null);
                      }}
                      aria-label="Sort order"
                    >
                      <option value="newest">Newest first</option>
                      <option value="relevance">Most relevant</option>
                    </select>
                  </div>
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
                                          : enabledSources.length
                                            ? "Your sources are connected"
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
                                        : enabledSources.length
                                          ? "Refresh to collect updates. You can check source status in Sources if items don’t appear."
                                          : "Connect a research source, blog, Substack, Lobste.rs, or repository to collect updates."}
                      </p>
                      {feed.data && (
                        <div className="empty-actions">
                          {query.trim() ? (
                            <button
                              className="button"
                              onClick={() => setQuery("")}
                            >
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
                          ) : enabledSources.length ? (
                            <button
                              className="button primary"
                              disabled={!!feed.data.syncing}
                              onClick={() => void feed.refresh(true)}
                            >
                              <RefreshCw
                                size={14}
                                className={feed.data.syncing ? "spin" : ""}
                              />{" "}
                              {feed.data.syncing
                                ? "Collecting updates…"
                                : "Refresh sources"}
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
                      {/* Header with Batch Summarize + HTML/Webpage/Markdown Exports */}
                      <div className="briefing-toolbar">
                        <div className="briefing-title-area">
                          <h2>Today's Briefing</h2>
                          <span className="briefing-subtitle">
                            {briefing.length} development
                            {briefing.length === 1 ? "" : "s"} matched to your
                            interests
                          </span>
                        </div>
                        <div
                          className="briefing-actions"
                          style={{
                            display: "flex",
                            gap: "6px",
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            className="button"
                            title="Open Briefing as a full-screen magazine webpage"
                            onClick={() =>
                              openStoriesAsWebpage(
                                briefing,
                                "Today's Fieldnotes Briefing",
                              )
                            }
                          >
                            <ExternalLink size={13} /> Webpage
                          </button>
                          <button
                            type="button"
                            className="button"
                            title="Download self-contained .html briefing file"
                            onClick={() =>
                              exportStoriesAsHtml(
                                briefing,
                                "Today's Fieldnotes Briefing",
                              )
                            }
                          >
                            <Download size={13} /> .HTML
                          </button>
                          <button
                            type="button"
                            className="button"
                            title="Download Markdown (.md) briefing file"
                            onClick={() =>
                              exportStoriesAsMarkdown(
                                briefing,
                                "Today's Fieldnotes Briefing",
                              )
                            }
                          >
                            <FileText size={13} /> .MD
                          </button>
                          {ai.status === "ready" && (
                            <button
                              className="button primary"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "12px",
                              }}
                              onClick={() => void ai.summarize(briefing)}
                            >
                              <Sparkles size={14} /> Summarize (
                              {briefing.length})
                            </button>
                          )}
                          {ai.status === "working" && (
                            <button
                              className="button"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "12px",
                              }}
                              onClick={ai.cancel}
                            >
                              <RefreshCw size={14} className="spin" />{" "}
                              Summarizing… (Cancel)
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
                        showSemanticBadge={
                          !!query.trim() && searchType !== "keyword"
                        }
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
                key={selected?.groupId ?? "empty"}
                story={selected}
                depth={ai.depth}
                onDepth={ai.setDepth}
                summary={ai.summary}
                error={
                  ai.error || (ai.status === "error" ? ai.message : undefined)
                }
                modelStatus={ai.status}
                preferSummary={
                  ai.preferred &&
                  (ai.status === "ready" ||
                    ai.status === "working" ||
                    !!ai.summary)
                }
                onAction={(patch) =>
                  selected ? feed.act(selected, patch) : Promise.resolve(false)
                }
                onSummary={() => selected && void ai.summarize([selected])}
                onModel={() => void ai.enable()}
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
      </Suspense>

      <footer className="app-footer">
        <span>Stored privately on this computer</span>
        <span>Fieldnotes · Personal Research Workspace</span>
      </footer>
    </div>
  );
}
