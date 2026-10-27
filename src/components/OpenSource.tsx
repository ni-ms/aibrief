import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Code2,
  GitFork,
  Github,
  Plus,
  RefreshCw,
  Search,
  Star,
  X,
} from "lucide-react";
import type { Source } from "../../shared/types.ts";
import {
  githubProjectUrl,
  type GithubCollection,
  type GithubProject,
  type StarredProjects,
} from "../../shared/open-source.ts";
import { paginate } from "../../shared/pagination.ts";
import { api } from "../lib/api";
import { ago, date } from "../lib/format";
import "./open-source.css";

const number = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const timeAgo = (value: string) =>
  ago(value).replace("Just synced", "just now");

export function OpenSource({
  sources,
  onSave,
}: {
  sources: Source[];
  onSave: (source: Source) => Promise<void>;
}) {
  const [collections, setCollections] = useState<GithubCollection[] | null>(
    null,
  );
  const [username, setUsername] = useState("");
  const [input, setInput] = useState("");
  const [projects, setProjects] = useState<GithubProject[]>([]);
  const [result, setResult] = useState<StarredProjects | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [following, setFollowing] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [topic, setTopic] = useState("");
  const [sort, setSort] = useState("starred");
  const [onlyFollowed, setOnlyFollowed] = useState(false);
  const [page, setPage] = useState(1);
  const request = useRef(0);
  const alive = useRef(true);

  async function loadCollections() {
    const next = await api<GithubCollection[]>("/open-source/collections");
    if (alive.current) setCollections(next);
    return next;
  }
  useEffect(() => {
    alive.current = true;
    void loadCollections()
      .then((next) => {
        if (alive.current) setUsername(next[0]?.username || "");
      })
      .catch((e) => {
        if (alive.current) setError(e.message);
      });
    return () => {
      alive.current = false;
      request.current++;
    };
  }, []);

  async function loadProjects(nextPage = 1, refresh = false) {
    const current = ++request.current;
    setLoading(true);
    setError("");
    try {
      const next = await api<StarredProjects>(
        `/open-source/stars/${encodeURIComponent(username)}?page=${nextPage}&refresh=${refresh}`,
      );
      if (!alive.current || current !== request.current) return;
      setProjects((previous) =>
        nextPage === 1
          ? next.projects
          : [
              ...new Map(
                [...previous, ...next.projects].map((p) => [
                  p.fullName.toLowerCase(),
                  p,
                ]),
              ).values(),
            ],
      );
      setResult(next);
    } catch (e) {
      if (alive.current && current === request.current)
        setError((e as Error).message);
    } finally {
      if (alive.current && current === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    setProjects([]);
    setResult(null);
    setQuery("");
    setLanguage("");
    setTopic("");
    setPage(1);
    setError("");
    if (username) void loadProjects();
    else setLoading(false);
    return () => {
      request.current++;
    };
  }, [username]);

  async function addCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setEditing(true);
    setError("");
    try {
      const added = await api<{ username: string }>(
        "/open-source/collections",
        "POST",
        { username: input },
      );
      await loadCollections();
      if (alive.current) {
        setUsername(added.username);
        setInput("");
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setEditing(false);
    }
  }
  async function removeCollection(name: string) {
    setEditing(true);
    setError("");
    try {
      await api(`/open-source/collections/${name}`, "DELETE");
      const next = await loadCollections();
      if (alive.current && username === name)
        setUsername(next[0]?.username || "");
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setEditing(false);
    }
  }
  async function follow(project: GithubProject) {
    const previous = sources.find(
      (s) =>
        s.kind === "github" &&
        s.config.repo?.toLowerCase() === project.fullName.toLowerCase(),
    );
    setFollowing(project.fullName);
    setError("");
    try {
      await onSave({
        id: previous?.id || `github-${crypto.randomUUID()}`,
        kind: "github",
        resourceId: "github",
        name: `GitHub · ${project.fullName}`.slice(0, 100),
        lastAttempt: null,
        lastSuccess: null,
        error: null,
        ...previous,
        config: { repo: project.fullName },
        enabled: !previous?.enabled,
      });
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setFollowing("");
    }
  }

  const followed = new Set(
    sources
      .filter((s) => s.kind === "github" && s.enabled)
      .map((s) => s.config.repo?.toLowerCase()),
  );
  const languages = [
    ...new Set(projects.map((p) => p.language).filter((l): l is string => !!l)),
  ].sort();
  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects)
      for (const tag of project.topics)
        counts.set(tag, (counts.get(tag) || 0) + 1);
    return [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 7)
      .map(([tag]) => tag);
  }, [projects]);
  const filtered = projects.filter(
    (p) =>
      (!query ||
        `${p.fullName} ${p.description} ${p.topics.join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase().trim())) &&
      (!language || p.language === language) &&
      (!topic || p.topics.includes(topic)) &&
      (!onlyFollowed || followed.has(p.fullName.toLowerCase())),
  );
  if (sort === "stars")
    filtered.sort(
      (a, b) => b.stars - a.stars || a.fullName.localeCompare(b.fullName),
    );
  if (sort === "updated")
    filtered.sort(
      (a, b) =>
        (b.pushedAt || "").localeCompare(a.pushedAt || "") ||
        a.fullName.localeCompare(b.fullName),
    );
  const pagination = paginate(filtered, page, 20);
  const collectionUrl = `https://github.com/${username}?tab=stars`;

  return (
    <main className="page oss-page">
      <div className="page-title">
        <div>
          <span className="kicker">GOOD CODE, GOOD COMPANY</span>
          <h1>
            Open source<span className="oss-title-dot">.</span>
          </h1>
          <p className="oss-intro">
            Find your next favorite project through people whose taste you
            trust.
          </p>
        </div>
        <span className="oss-public-label">
          <Github size={15} /> Public GitHub collections
        </span>
      </div>

      <div className="oss-layout">
        <aside className="oss-sidebar" aria-label="GitHub collections">
          <div className="oss-sidebar-title">
            <span className="kicker">THE PEOPLE YOU FOLLOW</span>
            <span>{collections?.length || 0}</span>
          </div>
          <div className="oss-collections">
            {collections?.map((collection) => (
              <div
                key={collection.username}
                className={`oss-collection ${username === collection.username ? "selected" : ""}`}
              >
                <button
                  className="oss-collection-select"
                  aria-pressed={username === collection.username}
                  onClick={() => setUsername(collection.username)}
                >
                  <span className="oss-avatar">
                    {collection.username.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <strong>{collection.username}</strong>
                    <small>Starred repositories</small>
                  </span>
                </button>
                <button
                  className="oss-remove"
                  aria-label={`Remove ${collection.username}'s collection`}
                  onClick={() => void removeCollection(collection.username)}
                  disabled={editing}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
            {collections?.length === 0 && (
              <p className="oss-side-note">
                Add someone’s stars to start exploring.
              </p>
            )}
          </div>
          <form className="oss-add" onSubmit={addCollection}>
            <label htmlFor="github-collection">
              Discover through someone new
            </label>
            <p>Paste a GitHub profile or enter a username.</p>
            <input
              id="github-collection"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="github.com/username"
              autoComplete="off"
              maxLength={250}
              disabled={editing}
            />
            <button
              className="button"
              type="submit"
              disabled={editing || !input.trim()}
            >
              <Plus size={13} />
              {editing ? "Updating…" : "Add collection"}
            </button>
          </form>
          <div className="oss-how">
            <Code2 size={19} />
            <h2>A collection worth wandering.</h2>
            <p>
              Browse someone’s finds. Follow a project’s releases to bring its
              updates into your reading desk.
            </p>
          </div>
        </aside>

        <section
          className="oss-browser"
          aria-label="Open source projects"
          aria-busy={loading}
        >
          <div className="oss-collection-heading">
            <div>
              <span className="kicker">
                {username
                  ? "FROM THEIR STARS TO YOUR RADAR"
                  : "YOUR NEXT DISCOVERY"}
              </span>
              <h2>
                {username ? (
                  <>
                    Stars by{" "}
                    <a href={collectionUrl} target="_blank" rel="noreferrer">
                      {username}
                      <ArrowUpRight size={15} />
                    </a>
                  </>
                ) : (
                  "Start with a collection"
                )}
              </h2>
            </div>
            {username && (
              <button
                className="button icon-only"
                title="Refresh collection"
                aria-label="Refresh collection"
                disabled={loading}
                onClick={() => {
                  setPage(1);
                  void loadProjects(1, true);
                }}
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
              </button>
            )}
          </div>
          {error && (
            <div className="oss-error" role="alert">
              <span>{error}</span>
              {username && (
                <button
                  className="button"
                  disabled={loading}
                  onClick={() =>
                    void loadProjects(
                      result?.nextPage && projects.length ? result.nextPage : 1,
                    )
                  }
                >
                  Retry
                </button>
              )}
              {!collections && (
                <button
                  className="button"
                  onClick={() =>
                    void loadCollections()
                      .then((next) => setUsername(next[0]?.username || ""))
                      .catch((e) => setError(e.message))
                  }
                >
                  Retry
                </button>
              )}
            </div>
          )}
          {result?.stale && (
            <p className="oss-error" role="status">
              Showing cached projects from {date(result.checkedAt)}.{" "}
              {result.error}
            </p>
          )}
          {username && (
            <>
              <div className="oss-toolbar">
                <label className="oss-search">
                  <Search size={15} />
                  <input
                    aria-label="Search loaded projects"
                    placeholder="Search projects, ideas, topics…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <select
                  aria-label="Filter by language"
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All languages</option>
                  {languages.map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
                <select
                  aria-label="Sort projects"
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="starred">Recently starred</option>
                  <option value="stars">Most stars</option>
                  <option value="updated">Recently updated</option>
                </select>
              </div>
              <div className="oss-topics" aria-label="Project topics">
                <button
                  className={!topic && !onlyFollowed ? "active" : ""}
                  aria-pressed={!topic && !onlyFollowed}
                  onClick={() => {
                    setTopic("");
                    setOnlyFollowed(false);
                    setPage(1);
                  }}
                >
                  All projects
                </button>
                {topics.map((t) => (
                  <button
                    key={t}
                    className={topic === t ? "active" : ""}
                    aria-pressed={topic === t}
                    onClick={() => {
                      setTopic(topic === t ? "" : t);
                      setPage(1);
                    }}
                  >
                    {t}
                  </button>
                ))}
                <button
                  className={onlyFollowed ? "active" : ""}
                  aria-pressed={onlyFollowed}
                  onClick={() => {
                    setOnlyFollowed(!onlyFollowed);
                    setPage(1);
                  }}
                >
                  <Check size={11} /> Following
                </button>
                {topic && !topics.includes(topic) && (
                  <button
                    className="active"
                    onClick={() => {
                      setTopic("");
                      setPage(1);
                    }}
                  >
                    {topic}
                    <X size={11} />
                  </button>
                )}
              </div>
              <div className="oss-results-meta" aria-live="polite">
                <span>
                  {filtered.length}{" "}
                  {filtered.length === 1 ? "project" : "projects"}
                  {query || language || topic || onlyFollowed
                    ? ` match · ${projects.length} loaded`
                    : " loaded"}
                  {result?.nextPage ? " · more to explore" : ""}
                </span>
                <span>
                  {loading
                    ? "Fetching projects…"
                    : result?.checkedAt
                      ? `Checked ${timeAgo(result.checkedAt)}`
                      : ""}
                </span>
              </div>
              <div className="oss-project-list">
                {pagination.items.map((project, index) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    index={pagination.offset + index}
                    followed={followed.has(project.fullName.toLowerCase())}
                    busy={!!following}
                    onFollow={() => void follow(project)}
                    onTopic={(t) => {
                      setTopic(t);
                      setPage(1);
                    }}
                  />
                ))}
                {!projects.length && loading && (
                  <div className="oss-empty">
                    <Github size={26} />
                    <h3>Opening the collection…</h3>
                    <p>Gathering projects and their details from GitHub.</p>
                  </div>
                )}
                {!loading && !filtered.length && !error && (
                  <div className="oss-empty">
                    <Search size={25} />
                    <h3>
                      {projects.length
                        ? "No projects match yet."
                        : "No public stars here yet."}
                    </h3>
                    <p>
                      {projects.length
                        ? "Try another search or clear your filters."
                        : "Try another GitHub collection to find more projects."}
                    </p>
                    {projects.length > 0 && (
                      <button
                        className="button"
                        onClick={() => {
                          setQuery("");
                          setLanguage("");
                          setTopic("");
                          setOnlyFollowed(false);
                          setPage(1);
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="oss-pagination">
                <span>
                  {pagination.total
                    ? `${pagination.start}–${pagination.end} of ${pagination.total}`
                    : ""}
                </span>
                <div>
                  <button
                    className="button"
                    aria-label="Previous projects page"
                    disabled={pagination.page <= 1}
                    onClick={() => setPage(pagination.page - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    {pagination.page} / {pagination.pages}
                  </span>
                  <button
                    className="button"
                    aria-label="Next projects page"
                    disabled={pagination.page >= pagination.pages}
                    onClick={() => setPage(pagination.page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
              {result?.nextPage && (
                <div className="oss-load-more">
                  <button
                    className="button"
                    disabled={loading}
                    onClick={() => void loadProjects(result.nextPage!)}
                  >
                    <Plus size={14} />
                    {loading
                      ? "Loading projects…"
                      : "Explore more of this collection"}
                  </button>
                  <p>
                    Search and filters cover the {projects.length} projects
                    loaded so far.
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <p className="footnote">
        Collections are public GitHub stars. Following releases adds a resource
        to your reading desk. Collections and cached projects stay available
        between visits.
      </p>
    </main>
  );
}

function ProjectCard({
  project: p,
  index,
  followed,
  busy,
  onFollow,
  onTopic,
}: {
  project: GithubProject;
  index: number;
  followed: boolean;
  busy: boolean;
  onFollow: () => void;
  onTopic: (topic: string) => void;
}) {
  const [owner, name] = p.fullName.split("/");
  return (
    <article className="oss-project">
      <span className="oss-project-index">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="oss-project-content">
        <div className="oss-project-heading">
          <h3>
            <a href={githubProjectUrl(p)} target="_blank" rel="noreferrer">
              <span>{owner} / </span>
              {name}
              <ArrowUpRight size={14} />
            </a>
          </h3>
          {p.archived && <span className="oss-archived">Archived</span>}
        </div>
        <p>{p.description || "No description provided by the project."}</p>
        {!!p.topics.length && (
          <div className="oss-project-topics">
            {p.topics.slice(0, 4).map((t) => (
              <button key={t} onClick={() => onTopic(t)}>
                {t}
              </button>
            ))}
            {p.topics.length > 4 && <span>+{p.topics.length - 4}</span>}
          </div>
        )}
        <div className="oss-project-meta">
          {p.language && (
            <span>
              <i
                className={`oss-language ${p.language.toLowerCase().replace(/[^a-z]/g, "")}`}
              />
              {p.language}
            </span>
          )}
          <span title={`${p.stars.toLocaleString()} stars`}>
            <Star size={12} />
            {number.format(p.stars)}
          </span>
          <span title={`${p.forks.toLocaleString()} forks`}>
            <GitFork size={12} />
            {number.format(p.forks)}
          </span>
          <span>{p.license || "License not identified"}</span>
          {p.pushedAt && (
            <span title={date(p.pushedAt)}>Updated {timeAgo(p.pushedAt)}</span>
          )}
        </div>
      </div>
      <button
        className={`button oss-follow ${followed ? "followed" : ""}`}
        disabled={busy}
        onClick={onFollow}
        aria-pressed={followed}
        aria-label={`${followed ? "Stop following" : "Follow"} releases for ${p.fullName}`}
      >
        {followed ? <Check size={13} /> : <Plus size={13} />}
        {followed ? "Following" : "Follow releases"}
      </button>
    </article>
  );
}
