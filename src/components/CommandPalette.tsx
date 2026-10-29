import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Bookmark,
  Cpu,
  Database,
  Download,
  Layers,
  MessageSquarePlus,
  Moon,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import type { Source, Story } from "../../shared/types.ts";
import { detectSmartSource } from "../../shared/feeds.ts";

export interface CommandItem {
  id: string;
  label: string;
  section: "Quick Add" | "Views" | "Actions" | "Sources" | "Settings";
  description?: string;
  icon: typeof Search;
  action: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onSelectView,
  onSelectPage,
  onRefreshAll,
  onRefreshSource,
  onToggleTheme,
  onSummarizeStory,
  onOpenDiscover,
  onQuickAddSource,
  onExportBriefingHtml,
  onOpenFeedback,
  onRedoOnboarding,
  currentStory,
  sources = [],
  isDark = false,
}: {
  open: boolean;
  onClose: () => void;
  onSelectView: (view: string, filter?: string) => void;
  onSelectPage: (page: string) => void;
  onRefreshAll: () => void;
  onRefreshSource: (sourceId: string) => void;
  onToggleTheme: () => void;
  onSummarizeStory?: (story: Story) => void;
  onOpenDiscover: (initialQuery?: string) => void;
  onQuickAddSource?: (source: Source) => Promise<void>;
  onExportBriefingHtml?: () => void;
  onOpenFeedback?: () => void;
  onRedoOnboarding?: () => void;
  currentStory?: Story | null;
  sources?: Source[];
  isDark?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const detectedSource = useMemo(() => {
    const q = query.trim();
    if (!q || q.length < 3) return null;
    if (
      q.startsWith("@") ||
      q.startsWith("#") ||
      /^(?:r\/|tag\/|topic\/|substack:|lobsters:|hf-papers$)/i.test(q) ||
      /^https?:\/\//i.test(q) ||
      /^[a-z0-9-]+\.(?:com|org|io|net|dev|ai|rs|co)(\/|$)/i.test(q) ||
      /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(q)
    ) {
      try {
        return detectSmartSource(q);
      } catch {
        return null;
      }
    }
    return null;
  }, [query]);

  const commands = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [];

    if (detectedSource && onQuickAddSource) {
      list.push({
        id: `instant-add-${detectedSource.name}`,
        label: `Add Source: ${detectedSource.name}`,
        section: "Quick Add",
        description: `Connect ${detectedSource.kind} feed directly to your sources`,
        icon: Plus,
        action: () => {
          void onQuickAddSource({
            id: `${detectedSource.resourceId}-${crypto.randomUUID().slice(0, 8)}`,
            kind: detectedSource.kind,
            resourceId: detectedSource.resourceId,
            name: detectedSource.name,
            config: detectedSource.config,
            enabled: true,
            lastAttempt: null,
            lastSuccess: null,
            error: null,
          });
        },
      });
    }

    if (query.trim().length >= 2) {
      list.push({
        id: `instant-discover-${query.trim()}`,
        label: `Search & Follow Topic: “${query.trim()}”`,
        section: "Quick Add",
        description: "Search across arXiv, Hacker News, HF Papers & GitHub",
        icon: Search,
        action: () => onOpenDiscover(query.trim()),
      });
    }

    // Views
    list.push(
      {
        id: "view-focus",
        label: "Go to For You (Briefing)",
        section: "Views",
        description: "Curated updates matched to your interests",
        icon: Sparkles,
        action: () => {
          onSelectPage("read");
          onSelectView("focus");
        },
      },
      {
        id: "view-all",
        label: "Go to Latest",
        section: "Views",
        description: "All collected updates, newest first",
        icon: BookOpen,
        action: () => {
          onSelectPage("read");
          onSelectView("all");
        },
      },
      {
        id: "view-papers",
        label: "Go to Papers",
        section: "Views",
        description: "Ranked preprints and research papers",
        icon: Layers,
        action: () => {
          onSelectPage("read");
          onSelectView("papers", "research");
        },
      },
      {
        id: "view-tools",
        label: "Go to Tools & Releases",
        section: "Views",
        description: "Open-source tools and releases",
        icon: Radio,
        action: () => {
          onSelectPage("read");
          onSelectView("all", "tools");
        },
      },
      {
        id: "view-news",
        label: "Go to Articles & Discussions",
        section: "Views",
        description: "Technical articles, newsletters, and discussions",
        icon: BookOpen,
        action: () => {
          onSelectPage("read");
          onSelectView("all", "news");
        },
      },
      {
        id: "view-saved",
        label: "Go to Saved Shelf",
        section: "Views",
        description: "Your bookmarked items",
        icon: Bookmark,
        action: () => {
          onSelectPage("read");
          onSelectView("saved");
        },
      },
      {
        id: "view-dismissed",
        label: "Go to Dismissed Items",
        section: "Views",
        description: "Items set aside from your feed",
        icon: X,
        action: () => {
          onSelectPage("read");
          onSelectView("dismissed");
        },
      },

      // Actions
      {
        id: "action-refresh",
        label: "Refresh all sources",
        section: "Actions",
        description: "Check fast lane feeds and arXiv queue",
        icon: RefreshCw,
        action: onRefreshAll,
      },
      {
        id: "action-discover",
        label: "Search & follow a new topic",
        section: "Actions",
        description: "Live upstream search across arXiv, HN, HF, and GitHub",
        icon: Search,
        action: () => onOpenDiscover(),
      },
      {
        id: "action-theme",
        label: isDark
          ? "Switch to Editorial Light mode"
          : "Switch to Carbon Dark mode",
        section: "Actions",
        icon: isDark ? Sun : Moon,
        action: onToggleTheme,
      },
    );

    if (onExportBriefingHtml) {
      list.push({
        id: "action-export-html",
        label: "Export Briefing as Standalone Webpage (.html)",
        section: "Actions",
        description: "Save a self-contained HTML digest of Today's Briefing",
        icon: Download,
        action: onExportBriefingHtml,
      });
    }

    if (onOpenFeedback) {
      list.push({
        id: "action-feedback",
        label: "Suggest an Improvement or New Source",
        section: "Actions",
        description: "Submit feedback via Google Form, GitHub, or local log",
        icon: MessageSquarePlus,
        action: onOpenFeedback,
      });
    }

    if (currentStory && onSummarizeStory) {
      list.push({
        id: "action-summarize",
        label: `Summarize "${currentStory.title.slice(0, 48)}…"`,
        section: "Actions",
        description: "Generate local AI summary for current story",
        icon: Cpu,
        action: () => onSummarizeStory(currentStory),
      });
    }

    // Quick Add navigation
    list.push(
      {
        id: "add-source",
        label: "Quick-add source / manage connections",
        section: "Quick Add",
        description: "Open the source catalog to connect feeds",
        icon: Plus,
        action: () => onSelectPage("resources"),
      },
      {
        id: "add-opensource",
        label: "Explore GitHub Star Collections",
        section: "Quick Add",
        description: "Browse public GitHub star collections inside Sources",
        icon: Plus,
        action: () => onSelectPage("open-source"),
      },
    );

    // Settings
    if (onRedoOnboarding)
      list.push({
        id: "redo-onboarding",
        label: "Redo onboarding",
        section: "Settings",
        description: "Personalize your feed with the guided setup",
        icon: Sparkles,
        action: onRedoOnboarding,
      });
    list.push(
      {
        id: "page-settings",
        label: "Settings & appearance",
        section: "Settings",
        description: "Appearance, feed personalization, AI, and backups",
        icon: Moon,
        action: () => onSelectPage("settings"),
      },
      {
        id: "page-interests",
        label: "Interests & followed topics",
        section: "Settings",
        description: "Adjust focus terms and manage followed queries",
        icon: Layers,
        action: () => onSelectPage("interests"),
      },
      {
        id: "page-model",
        label: "Local & Hybrid AI model settings",
        section: "Settings",
        description: "Configure WebGPU or local Ollama summarization engine",
        icon: Cpu,
        action: () => onSelectPage("model"),
      },
      {
        id: "page-data",
        label: "Your data & backups",
        section: "Settings",
        description: "Export, import, or back up local database",
        icon: Database,
        action: () => onSelectPage("data"),
      },
    );

    // Per-source refresh
    for (const source of sources.filter((s) => s.enabled)) {
      list.push({
        id: `refresh-${source.id}`,
        label: `Refresh ${source.name}`,
        section: "Sources",
        description:
          source.error ||
          (source.lastSuccess
            ? `Last synced ${source.lastSuccess}`
            : "Enabled"),
        icon: RefreshCw,
        action: () => onRefreshSource(source.id),
      });
    }

    return list;
  }, [
    detectedSource,
    query,
    onSelectView,
    onSelectPage,
    onRefreshAll,
    onRefreshSource,
    onToggleTheme,
    onSummarizeStory,
    onOpenDiscover,
    onQuickAddSource,
    onExportBriefingHtml,
    onOpenFeedback,
    onRedoOnboarding,
    currentStory,
    sources,
    isDark,
  ]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter(
      (c) =>
        c.id.startsWith("instant-") ||
        c.label.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.section.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    const active = listRef.current?.querySelector<HTMLElement>(
      `[data-command-index="${selectedIndex}"]`,
    );
    active?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="command-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div className="command-dialog">
        <div className="command-input-row">
          <Search size={18} className="command-search-icon" />
          <input
            ref={inputRef}
            className="command-input"
            type="text"
            placeholder="Paste any URL/@handle/#tag to add, or type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="command-kbd">ESC</kbd>
        </div>

        <div className="command-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="command-empty">No commands match "{query}"</div>
          ) : (
            filtered.map((item, index) => {
              const Icon = item.icon;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  data-command-index={index}
                  className={`command-item ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    item.action();
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <Icon size={16} className="command-item-icon" />
                  <div className="command-item-content">
                    <span className="command-item-label">{item.label}</span>
                    {item.description && (
                      <span className="command-item-desc">
                        {item.description}
                      </span>
                    )}
                  </div>
                  <span className="command-item-section">{item.section}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="command-footer">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> Navigate
          </span>
          <span>
            <kbd>↵</kbd> Select
          </span>
          <span>
            <kbd>ESC</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
}
