import { useEffect, useRef, useState } from "react";
import { Search, Plus, ArrowRight, ArrowUpRight, X } from "lucide-react";
import type {
  Discovery,
  DiscoveryProvider,
  FollowedTopic,
} from "../../shared/types.ts";
import { api } from "../lib/api";
import { ago, date } from "../lib/format";
export function SearchAndFollow({
  query,
  onQuery,
  mode,
  onMode,
  providers,
  onFollow,
  onOpenTopic,
  scopeLabel,
}: {
  query: string;
  onQuery: (value: string) => void;
  mode: "library" | "discover";
  onMode: (value: "library" | "discover") => void;
  providers: DiscoveryProvider[];
  onFollow: (query: string, providers: string[]) => Promise<FollowedTopic>;
  onOpenTopic: (id: string) => void;
  scopeLabel: string;
}) {
  const [selected, setSelected] = useState(["arxiv"]);
  const [result, setResult] = useState<Discovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followedId, setFollowedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const request = useRef(0);
  useEffect(() => {
    ++request.current;
    setBusy(false);
    setResult(null);
    setFollowedId(null);
    setError("");
  }, [query, selected.join(","), mode]);
  useEffect(
    () => () => {
      ++request.current;
    },
    [],
  );
  async function discover() {
    const enabledSelection = selected.filter((id) =>
      providers.some((p) => p.id === id && p.enabled),
    );
    if (query.trim().length < 2 || !enabledSelection.length || busy) return;
    const current = ++request.current;
    setBusy(true);
    setResult(null);
    setError("");
    setFollowedId(null);
    try {
      const found = await api<Discovery>("/discover", "POST", {
        query: query.trim(),
        providers: enabledSelection,
      });
      if (current === request.current) setResult(found);
    } catch (e) {
      if (current === request.current) setError((e as Error).message);
    } finally {
      if (current === request.current) setBusy(false);
    }
  }
  return (
    <section className="search-follow" aria-label="Search and follow">
      <form
        className="search-follow-bar"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "discover") void discover();
        }}
      >
        <div className="search-modes" aria-label="Search mode">
          {(["library", "discover"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={mode === value}
              className={mode === value ? "active" : ""}
              onClick={() => onMode(value)}
            >
              {value === "library"
                ? "Search this view"
                : "Find & follow topics"}
            </button>
          ))}
        </div>
        <div className="search">
          <Search size={15} />
          <input
            aria-label={
              mode === "library"
                ? `Search ${scopeLabel}`
                : "Find a topic to follow"
            }
            placeholder={
              mode === "library"
                ? `Search ${scopeLabel.toLowerCase()}…`
                : "Try quantum computing or machine learning"
            }
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            maxLength={160}
          />
          {query && (
            <button
              className="clear-search"
              type="button"
              aria-label="Clear search"
              onClick={() => onQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        {mode === "discover" && (
          <button
            className="button"
            disabled={
              busy ||
              query.trim().length < 2 ||
              !selected.some((id) =>
                providers.some((p) => p.id === id && p.enabled),
              )
            }
          >
            {busy ? "Searching…" : "Search"}
          </button>
        )}
      </form>
      {mode === "discover" && (
        <div className="discovery-panel">
          <p className="field-note">
            Search arXiv for new papers across all subjects. Other sources
            search the items already collected in your feed. Follow a topic to
            keep checking for matches.
          </p>
          <fieldset className="provider-picker">
            <legend>Where to search</legend>
            {providers.map((p) => (
              <label key={p.id} className="checkbox-label">
                <input
                  type="checkbox"
                  disabled={!p.enabled}
                  checked={p.enabled && selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((prior) =>
                      e.target.checked
                        ? [...prior, p.id]
                        : prior.filter((id) => id !== p.id),
                    )
                  }
                />
                <span>
                  {p.name}{" "}
                  <small>
                    {p.capability === "upstream"
                      ? "Public search"
                      : "Collected items"}
                    {!p.enabled ? " · source off" : ""}
                  </small>
                </span>
              </label>
            ))}
          </fieldset>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {!providers.length && (
            <p className="field-note">Loading search sources…</p>
          )}
          {busy && <p role="status">Searching your selected sources…</p>}
          {result && (
            <>
              <div className="discovery-heading">
                <div>
                  <h2>{result.query}</h2>
                  <span>
                    {result.results.length} results · up to 50 per provider
                  </span>
                </div>
                {followedId ? (
                  <button
                    className="button primary"
                    onClick={() => onOpenTopic(followedId)}
                  >
                    Open topic feed <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={following}
                    onClick={async () => {
                      const current = request.current;
                      setFollowing(true);
                      setError("");
                      try {
                        const topic = await onFollow(
                          result.query,
                          result.providers,
                        );
                        if (request.current === current)
                          setFollowedId(topic.id);
                      } catch (e) {
                        if (request.current === current)
                          setError((e as Error).message);
                      } finally {
                        setFollowing(false);
                      }
                    }}
                  >
                    <Plus size={14} />
                    {following ? "Following…" : "Follow topic"}
                  </button>
                )}
              </div>
              <div className="discovery-checks">
                {Object.entries(result.checks).map(([id, check]) => (
                  <p
                    key={id}
                    className={check.error ? "error-text" : "field-note"}
                  >
                    {providers.find((p) => p.id === id)?.name}:{" "}
                    {check.error ||
                      (id === "arxiv"
                        ? ago(check.lastSuccess)
                        : `Collected items · source ${ago(check.lastSuccess).toLowerCase()}`)}
                  </p>
                ))}
              </div>
              {!result.results.length && (
                <p>
                  No matches returned. You can follow this query to check for
                  future results.
                </p>
              )}
              <div className="discovery-results">
                {result.results.map((item) => (
                  <article key={`${item.providerId}:${item.externalId}`}>
                    <div className="generated-label">
                      {item.providerName} ·{" "}
                      {item.origin === "upstream"
                        ? "Public search"
                        : "From library"}{" "}
                      · {date(item.publishedAt)}
                    </div>
                    <h3>
                      <a
                        href={item.canonicalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.title}
                        <ArrowUpRight size={13} />
                      </a>
                    </h3>
                    <p>
                      {(item.abstract || item.releaseText).slice(0, 280) ||
                        "Title and original link only."}
                    </p>
                    {(item.abstract || item.releaseText).length > 280 && (
                      <details>
                        <summary>Preview source excerpt</summary>
                        <p>{item.abstract || item.releaseText}</p>
                      </details>
                    )}
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
